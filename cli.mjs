#!/usr/bin/env node
import { sync, loadIndex, search, stats, loadLists } from './src/store.mjs';
const [, , cmd = 'help', ...rest] = process.argv;
const opt = Object.fromEntries(rest.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const args = rest.filter(a => !a.startsWith('--'));
const out = (s) => process.stdout.write(s + '\n');

const tag = (repo) => (loadLists().find(l => l.repo === repo) || {}).tag || '';
const line = (e) => `  ${e.name}  [${tag(e.list) || e.list}${e.category ? ' / ' + e.category : ''}]  score=${e.score ?? '-'}\n     ${e.url}\n     ${(e.desc || '').slice(0, 160)}`;

if (cmd === 'sync') {
  const idx = await sync({ force: !!opt.force, only: args.length ? args : [], log: out });
  out(`\n索引: ${idx.entries.length} 条 / ${idx.lists.length} 清单，写入 index.json`);
} else if (cmd === 'lists') {
  const idx = loadIndex();
  out(`索引时间 ${idx.builtAt || '(未建)'}，共 ${idx.entries.length} 条\n`);
  for (const l of idx.lists) out(`${String(l.entries).padStart(5)}  ${(l.tag || '').padEnd(7)}  ${l.repo.padEnd(42)} ${l.categories} 类  ${(l.why || '')}`);
} else if (cmd === 'cat') {
  const idx = loadIndex();
  const repo = args[0];
  const cat = args[1];
  const rows = idx.entries.filter(e => (!repo || e.list === repo) && (!cat || (e.category || '').toLowerCase().includes(cat.toLowerCase())));
  out(`${repo || '全部'}${cat ? ' / ' + cat : ''}: ${rows.length} 条`);
  for (const e of rows.slice(0, Number(opt.limit || 40))) out(line(e));
} else if (cmd === 'search') {
  const idx = loadIndex();
  const q = args.join(' ');
  if (!q) { out('用法: node cli.mjs search <关键词> [--limit=10] [--list=repo] [--all]'); process.exit(1); }
  const hits = search(idx, q, { limit: Number(opt.limit || 12), list: opt.list || '', all: !!opt.all });
  out(`「${q}」命中 ${hits.length} 条`);
  for (const e of hits) out(line(e));
} else if (cmd === 'stats') {
  out(JSON.stringify(stats(loadIndex()), null, 1));
} else {
  out(`awesome-lite CLI
  sync [repo...] [--force]   抓取并重建索引
  lists                      已索引清单与条目数
  cat <repo> [分类] [--limit] 列条目
  search <关键词> [--list=] [--all] [--limit=]  检索
  stats                      统计`);
}
