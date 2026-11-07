import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fetchReadme, readCache, fetchFile } from './fetch.mjs';
import { parseReadme } from './parse.mjs';

export const ROOT = (process.env.AWESOME_LITE_HOME || new URL('../', import.meta.url).pathname).replace(/\/?$/, '/');
export const INDEX = ROOT + 'index.json';

export function loadLists() {
  return JSON.parse(readFileSync(ROOT + 'lists.json', 'utf8')).lists;
}

export function loadIndex() {
  if (!existsSync(INDEX)) return { builtAt: null, lists: [], entries: [] };
  return JSON.parse(readFileSync(INDEX, 'utf8'));
}

export async function sync({ force = false, only = [], deep = 30, log = () => {} } = {}) {
  const lists = loadLists().filter(l => !only.length || only.includes(l.repo));
  const out = [];
  const errors = [];
  for (const l of lists) {
    try {
      const { text, cached, bytes, ms } = await fetchReadme(l.repo, { force });
      const parsed = parseReadme(l.repo, text);
      let entries = parsed.entries;
      let deepCount = 0;
      if (parsed.hubs && parsed.hubs.length && deep > 0) {
        const zh = (h) => /中文|chinese|zh/i.test(h.name + ' ' + h.path) ? 0 : 1;
        const picked = parsed.hubs.slice().sort((a, b) => zh(a) - zh(b)).slice(0, deep);
        for (let i = 0; i < picked.length; i += 5) {
          const batch = picked.slice(i, i + 5);
          const rs = await Promise.all(batch.map(async (hb) => {
            try {
              const { text: sub } = await fetchFile(l.repo, hb.path);
              const sp = parseReadme(l.repo, sub);
              return sp.entries.map(e => ({ ...e, category: hb.category + ' / ' + hb.name }));
            } catch (e) { errors.push({ repo: l.repo + '/' + hb.path, err: e.message }); return []; }
          }));
          for (const r of rs) entries = entries.concat(r);
          deepCount += batch.length;
        }
        log(`  分册: 抓了 ${deepCount} 个子清单，累计 ${entries.length} 条`);
      }
      out.push({ ...l, categories: parsed.categories.length, entries: entries.length, bytes, cached, ms, hubs: (parsed.hubs || []).length, deep: deepCount, readme: l.repo.replace('/', '__') + '.md' });
      out.out = out.out || [];
      out.out.push(...entries);
      log(`${cached ? '缓存' : '下载'} ${l.repo}: ${entries.length} 条 / ${parsed.categories.length} 类 / ${bytes} 字节`);
    } catch (e) {
      errors.push({ repo: l.repo, err: e.message });
      log(`失败 ${l.repo}: ${e.message}`);
    }
  }
  const prev = loadIndex();
  const keptEntries = (prev.entries || []).filter(e => !out.some(o => o.repo === e.list)) ;
  const listsMeta = out.map(({ out: _o, ...rest }) => rest);
  const prevLists = (prev.lists || []).filter(p => !listsMeta.some(m => m.repo === p.repo));
  const idx = {
    builtAt: new Date().toISOString(),
    lists: [...prevLists, ...listsMeta],
    entries: [...keptEntries, ...(out.out || [])],
    errors,
  };
  writeFileSync(INDEX, JSON.stringify(idx));
  return idx;
}

export function search(idx, query, { limit = 12, list = '', all = false } = {}) {
  const toks = String(query).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return [];
  const hits = [];
  for (const e of idx.entries) {
    if (list && e.list !== list) continue;
    const name = e.name.toLowerCase(), desc = (e.desc || '').toLowerCase(), cat = (e.category || '').toLowerCase();
    let score = 0, matched = 0;
    for (const t of toks) {
      let s = 0;
      if (name === t) s += 12;
      else if (name.startsWith(t)) s += 8;
      else if (name.includes(t)) s += 6;
      if (desc.includes(t)) s += 2.5;
      if (cat.includes(t)) s += 1.5;
      if (s) matched++;
      score += s;
    }
    if (!matched) continue;
    if (all && matched < toks.length) continue;
    if (all) score += 5;
    hits.push({ ...e, score: Math.round(score * 10) / 10 });
  }
  hits.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return hits.slice(0, limit);
}

export function stats(idx) {
  const byList = idx.lists.map(l => ({ repo: l.repo, tag: l.tag, entries: l.entries, categories: l.categories, stars: null }));
  return { builtAt: idx.builtAt, lists: byList.length, entries: idx.entries.length, perList: byList, errors: idx.errors || [] };
}
