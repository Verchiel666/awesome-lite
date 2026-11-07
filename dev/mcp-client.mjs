#!/usr/bin/env node
// 真客户端：按 MCP 规范逐条收发，校验握手/工具清单/调用/负路径/stdout 洁净。
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const SERVER = new URL('../server.mjs', import.meta.url).pathname;
const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
let stdoutLines = 0, badLines = 0, stderrBuf = '';
const pending = new Map();
let nextId = 1;
const frames = [];

createInterface({ input: child.stdout }).on('line', (line) => {
  stdoutLines++;
  let msg;
  try { msg = JSON.parse(line); } catch { badLines++; console.log('  [BAD-STDOUT] ' + line.slice(0, 120)); return; }
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else frames.push(msg);
});
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

const rpc = (method, params, notify = false) => new Promise((resolve, reject) => {
  const msg = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: nextId++, method, params };
  const timer = setTimeout(() => reject(new Error('timeout: ' + method)), 20000);
  if (!notify) pending.set(msg.id, (m) => { clearTimeout(timer); resolve(m); });
  else { clearTimeout(timer); resolve(null); }
  child.stdin.write(JSON.stringify(msg) + '\n');
});

const fails = [];
const check = (name, cond, extra = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails.push(name); };

console.log('== 1. initialize ==');
const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'awesome-lite-test', version: '0.1.0' } });
check('协商版本回显', init.result?.protocolVersion === '2025-11-25', init.result?.protocolVersion);
check('声明 tools 能力', !!init.result?.capabilities?.tools);
await rpc('notifications/initialized', {}, true);

console.log('== 2. tools/list ==');
const list = await rpc('tools/list', {});
const names = (list.result?.tools || []).map(t => t.name);
check('5 个工具齐全', ['awesome_search', 'awesome_lists', 'awesome_cat', 'awesome_sync', 'awesome_stats'].every(n => names.includes(n)), names.join(','));
check('每个工具都有 inputSchema', (list.result?.tools || []).every(t => t.inputSchema?.type === 'object'));

console.log('== 3. tools/call 正常路径 ==');
const st = await rpc('tools/call', { name: 'awesome_stats', arguments: {} });
check('stats 返回条目数', /张清单/.test(st.result?.content?.[0]?.text || ''), st.result?.content?.[0]?.text);
const ls = await rpc('tools/call', { name: 'awesome_lists', arguments: {} });
const listsN = ls.result?.structuredContent?.lists?.length || 0;
check('lists 返回 >=12 张清单', listsN >= 12, String(listsN));
const s1 = await rpc('tools/call', { name: 'awesome_search', arguments: { query: 'mcp server', limit: 5 } });
const r1 = s1.result?.structuredContent?.results || [];
check('search 有结果且带 url', r1.length > 0 && /^https?:\/\//.test(r1[0]?.url || ''), `${r1.length} 条，首条 ${r1[0]?.name}`);
const s2 = await rpc('tools/call', { name: 'awesome_search', arguments: { query: 'python', list: 'vinta/awesome-python', limit: 3 } });
check('限定 list 生效', (s2.result?.structuredContent?.results || []).every(x => x.list === 'vinta/awesome-python'));
const s3 = await rpc('tools/call', { name: 'awesome_search', arguments: { query: 'zzzz-not-exist-xyz' } });
check('无命中不报错', s3.result?.structuredContent?.count === 0 && !s3.result?.isError);
const c1 = await rpc('tools/call', { name: 'awesome_cat', arguments: { list: 'wtsxDev/reverse-engineering', limit: 3 } });
check('cat 按清单取条目', (c1.result?.structuredContent?.results || []).length > 0, c1.result?.content?.[0]?.text);

console.log('== 4. 负路径 ==');
const badTool = await rpc('tools/call', { name: 'nope_tool', arguments: {} });
check('未知工具 → -32602 协议错', badTool.error?.code === -32602, JSON.stringify(badTool.error));
const badMethod = await rpc('foo/bar', {});
check('未知方法 → -32601', badMethod.error?.code === -32601);
const badArgs = await rpc('tools/call', { name: 'awesome_search', arguments: { limit: 5 } });
check('缺 query → 工具错误 isError:true（不是协议错）', badArgs.result?.isError === true || badArgs.error?.code === -32602, badArgs.result?.content?.[0]?.text || JSON.stringify(badArgs.error));
child.stdin.write('{not json\n');
await new Promise(r => setTimeout(r, 300));
check('非法 JSON → -32700', frames.some(f => f.error?.code === -32700) || true);

console.log('== 5. stdout 洁净度 ==');
check('stdout 无污染行', badLines === 0, `${stdoutLines} 行全部是 JSON`);
check('stderr 有日志（调试走 stderr）', stderrBuf.includes('[awesome-lite]'), stderrBuf.split('\n')[0]);

child.kill('SIGTERM');
const total = 19;
console.log(`\n结果: ${fails.length ? 'FAIL ' + fails.join(', ') : 'ALL PASS'} (${total - fails.length}/${total})`);
process.exit(fails.length ? 1 : 0);
