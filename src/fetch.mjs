import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CACHE_DIR = (process.env.AWESOME_LITE_HOME ? process.env.AWESOME_LITE_HOME.replace(/\/?$/, '/') : new URL('../', import.meta.url).pathname) + 'cache/';

function token() {
  const env = (process.env.AWESOME_GH_TOKEN || '').trim();
  if (env) return env;
  try { return readFileSync(process.env.HOME + '/.gh_token', 'utf8').trim(); } catch { return ''; }
}

export function cachePath(repo) {
  return CACHE_DIR + repo.replace('/', '__') + '.md';
}

export function readCache(repo) {
  const p = cachePath(repo);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export async function fetchReadme(repo, { force = false } = {}) {
  const p = cachePath(repo);
  if (!force && existsSync(p)) {
    const st = readFileSync(p, 'utf8');
    if (st.length > 200) return { repo, text: st, cached: true, bytes: st.length };
  }
  const h = { 'user-agent': 'dsh-awesome-lite/0.1', accept: 'application/vnd.github.raw' };
  const t = token();
  if (t) h.authorization = 'Bearer ' + t;
  const t0 = Date.now();
  const r = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers: h });
  const text = await r.text();
  if (r.status !== 200) {
    const err = new Error(`${repo}: HTTP ${r.status} ${text.slice(0, 120)}`);
    err.status = r.status;
    throw err;
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(p, text);
  return { repo, text, cached: false, bytes: text.length, ms: Date.now() - t0, authed: !!t };
}

export function filePath(repo, path) {
  return CACHE_DIR + repo.replace('/', '__') + '__' + path.replace(/[\/]/g, '_');
}

export async function fetchFile(repo, path) {
  const cp = filePath(repo, path);
  if (existsSync(cp)) { const t = readFileSync(cp, 'utf8'); if (t.length > 200) return { text: t, cached: true }; }
  const h = { 'user-agent': 'dsh-awesome-lite/0.1', accept: 'application/vnd.github.raw' };
  const t = token();
  if (t) h.authorization = 'Bearer ' + t;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers: h });
  const text = await r.text();
  if (r.status !== 200) throw new Error(`${repo}/${path}: HTTP ${r.status}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cp, text);
  return { text, cached: false };
}

export async function repoMeta(repo) {
  const h = { 'user-agent': 'dsh-awesome-lite/0.1', accept: 'application/vnd.github+json' };
  const t = token();
  if (t) h.authorization = 'Bearer ' + t;
  const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: h });
  if (r.status !== 200) return { repo, ok: false, status: r.status };
  const j = await r.json();
  return { repo, ok: true, stars: j.stargazers_count, branch: j.default_branch, sizeKB: j.size, pushed: j.pushed_at, license: j.license?.spdx_id };
}
