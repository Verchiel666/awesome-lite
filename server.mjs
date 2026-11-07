#!/usr/bin/env node
// awesome-lite MCP server：把 awesome 清单体系变成可检索的本机工具。
// stdio 三铁律：stdout 只放 MCP 消息（一行一条）、调试走 stderr、握手顺序 initialize → notifications/initialized。
import { createInterface } from 'node:readline';
import { loadIndex, search, sync, loadLists, stats } from './src/store.mjs';

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write('[awesome-lite] ' + a.join(' ') + '\n');

const TOOLS = [
  {
    name: 'awesome_search',
    description: '在已索引的 awesome 清单里检索资源。返回 name / url / desc / 所属清单与分类，按相关度排序。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，可多词（默认任一命中，all=true 需全部命中）' },
        limit: { type: 'number', description: '返回条数，默认 10，最大 50' },
        list: { type: 'string', description: '限定某个清单仓库，如 sindresorhus/awesome-nodejs' },
        all: { type: 'boolean', description: 'true = 所有关键词都要命中' },
      },
      required: ['query'],
    },
  },
  {
    name: 'awesome_lists',
    description: '列出已索引的 awesome 清单（含条目数、分类数、为什么收录），用于先定位该查哪张清单。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'awesome_cat',
    description: '按清单（可选再按分类）列出条目，用于"把某个领域的清单摊开看"。',
    inputSchema: {
      type: 'object',
      properties: {
        list: { type: 'string', description: '清单仓库，如 vinta/awesome-python；省略则跨清单' },
        category: { type: 'string', description: '分类名片段，如 Security / Books' },
        limit: { type: 'number', description: '默认 40，最大 200' },
      },
    },
  },
  {
    name: 'awesome_sync',
    description: '刷新索引：从 GitHub API 重新拉清单 README（可选深抓中文分册），重建本地索引。',
    inputSchema: {
      type: 'object',
      properties: {
        repos: { type: 'array', items: { type: 'string' }, description: '只更新这些仓库；省略=全部' },
        force: { type: 'boolean', description: '忽略缓存重新下载' },
        deep: { type: 'number', description: '每张清单深抓多少分册，默认 30，0=不抓' },
      },
    },
  },
  {
    name: 'awesome_stats',
    description: '索引统计：清单数、条目总数、每张清单条目数与错误。',
    inputSchema: { type: 'object', properties: {} },
  },
];

const tagOf = (repo) => (loadLists().find(l => l.repo === repo) || {}).tag || '';
const fmtText = (rows) => rows.map((r, i) => {
  const parts = [r.tag || r.list, r.category].filter(Boolean);
  const where = parts.length ? '  [' + parts.join(' / ') + ']' : '';
  const desc = (r.desc || '').replace(/\s+/g, ' ').slice(0, 180);
  return `${i + 1}. ${r.name}${where}\n   ${r.url}${desc ? '\n   ' + desc : ''}`;
}).join('\n');
const fmt = (e) => ({ name: e.name, url: e.url, desc: e.desc, list: e.list, tag: tagOf(e.list), category: e.category, score: e.score });

async function callTool(name, args = {}) {
  const idx = loadIndex();
  // 入参校验：MCP 2025-11-25 要求校验错误作为工具执行错误返回（isError:true），不能假装成功
  if (name === 'awesome_search' && (typeof args.query !== 'string' || !args.query.trim())) {
    throw new Error('缺少必填参数 query（字符串，如 "mcp server"）');
  }
  if (name === 'awesome_sync' && args.repos !== undefined && !Array.isArray(args.repos)) {
    throw new Error('repos 必须是仓库名数组');
  }
  if (name === 'awesome_cat' && args.list !== undefined && typeof args.list !== 'string') {
    throw new Error('list 必须是字符串仓库名');
  }
  if (name === 'awesome_search') {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const hits = search(idx, args.query || '', { limit, list: args.list || '', all: !!args.all });
    const head = hits.length
      ? `「${args.query}」命中 ${hits.length} 条（索引 ${idx.entries.length} 条）\n`
      : `「${args.query}」无命中（索引 ${idx.entries.length} 条）；换关键词，或 awesome_sync 刷新后重试`;
    return {
      content: [{ type: 'text', text: head + fmtText(hits) }],
      structuredContent: { query: args.query, count: hits.length, results: hits.map(fmt) },
    };
  }
  if (name === 'awesome_lists') {
    const rows = idx.lists.map(l => ({ repo: l.repo, tag: l.tag, why: l.why, entries: l.entries, categories: l.categories }));
    const text = rows.map(r => `${r.repo}  ${r.entries} 条 / ${r.categories} 类  ${r.tag}  ${r.why}`).join('\n');
    return { content: [{ type: 'text', text: `索引时间 ${idx.builtAt}\n${text}` }], structuredContent: { builtAt: idx.builtAt, lists: rows } };
  }
  if (name === 'awesome_cat') {
    const limit = Math.min(Number(args.limit) || 40, 200);
    const cat = (args.category || '').toLowerCase();
    const rows = idx.entries.filter(e => (!args.list || e.list === args.list) && (!cat || (e.category || '').toLowerCase().includes(cat)));
    const shown = rows.slice(0, limit);
    return {
      content: [{ type: 'text', text: `${args.list || '全部'}${cat ? ' / ' + args.category : ''}: 共 ${rows.length} 条，显示 ${shown.length} 条\n` + fmtText(shown) }],
      structuredContent: { total: rows.length, returned: shown.length, results: shown.map(fmt) },
    };
  }
  if (name === 'awesome_sync') {
    const out = [];
    const next = await sync({ force: !!args.force, only: Array.isArray(args.repos) ? args.repos : [], deep: args.deep === undefined ? 30 : Number(args.deep), log: (l) => out.push(l) });
    return { content: [{ type: 'text', text: out.join('\n') || '无变化' }], structuredContent: { builtAt: next.builtAt, entries: next.entries.length, log: out } };
  }
  if (name === 'awesome_stats') {
    const st = stats(idx);
    return { content: [{ type: 'text', text: `${st.lists} 张清单 / ${st.entries} 条 / 建于 ${st.builtAt}${st.errors.length ? ' / 错误 ' + st.errors.length : ''}` }], structuredContent: st };
  }
  const err = new Error(`unknown tool: ${name}`);
  err.code = -32602;
  throw err;
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return fail(null, -32700, 'Parse error'); }
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      const want = params?.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'awesome-lite', version: '0.1.0' },
        instructions: '检索 awesome 清单：先 awesome_lists 定位清单，再 awesome_search / awesome_cat。索引可离线用，awesome_sync 才联网。',
      });
    }
    if (method === 'notifications/initialized' || isNotification) return; // 通知不回复
    if (method === 'ping') return ok(id, {});
    if (method === 'tools/list') return ok(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const name = params?.name;
      if (!TOOLS.some(t2 => t2.name === name)) return fail(id, -32602, `unknown tool: ${name}`);
      try {
        const result = await callTool(name, params?.arguments || {});
        return ok(id, result);
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: `工具执行失败: ${e.message}` }], isError: true });
      }
    }
    return fail(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    log('handler error', e.stack || e.message);
    if (!isNotification) fail(id, -32603, e.message);
  }
});
rl.on('close', () => process.exit(0));
if (loadIndex().entries.length === 0) {
  log('索引为空，首次抓取中…');
  await sync({ log: (l) => log(l) }).then((i) => log('建成', i.entries.length, '条')).catch((e) => log('建索引失败（可用 awesome_sync 重试）:', e.message));
} else {
  log('ready', loadIndex().entries.length, 'entries');
}
