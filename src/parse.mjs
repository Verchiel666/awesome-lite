// Markdown -> {categories:[], entries:[]}；支持 bullet 与 table 两种条目写法。
const LINK = /\[([^\]]{1,200})\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;

const clean = (s = '') => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const BADGE = /(badge|shields\.io|awesome\.re\/badge|img\.shields)/i;

export function parseReadme(repo, text) {
  const lines = text.split('\n');
  const categories = [];
  const entries = [];
  const hubs = [];
  let cat = '';
  let inToc = false;
  let seenLink = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    const h = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (h) {
      cat = clean(h[2].replace(LINK, '$1'));
      categories.push(cat);
      inToc = /^(contents|table of contents|目录|toc)$/i.test(cat);
      continue;
    }
    if (/^<!--/.test(line)) continue;

    // bullet: - [name](url) - desc   /   * [name](url) — desc
    const b = line.match(/^[-*+]\s+(.*)$/);
    const isTable = /^\|/.test(line) && !/^\|?\s*:?-{2,}/.test(line) && !/^\|\s*(name|名称|项目)\s*\|/i.test(line);
    const body = b ? b[1] : (isTable ? line : null);
    if (!body) continue;
    if (BADGE.test(body)) continue;

    const m = body.match(/\[([^\]]{1,200})\]\(\s*([^)\s]+)\s*\)/);
    if (!m) continue;
    const name = clean(m[1]);
    const url = m[2].replace(/[).,]+$/, '');
    // 相对分册链接（如 books/free-programming-books-en.md）：登记为 hub，正文与深层模式另行抓取
    if (!/^https?:\/\//.test(url)) {
      if (/\.md$/i.test(url) && !url.startsWith('#')) hubs.push({ name, path: url.replace(/^\.\//, ''), category: cat });
      continue;
    }
    if (!name || !url || /^https?:\/\/awesome\.re\/?$/i.test(url)) continue;

    // 表格：取 url 之后所有单元格拼成描述；列表：取链接之后的行内说明
    let desc = '';
    if (isTable) {
      const cells = line.split('|').map(c => c.trim());
      const idx = cells.findIndex(c => c.includes(m[0].slice(0, 12)));
      const after = cells.slice(idx + 1).filter(Boolean).join(' · ');
      desc = clean(after);
    } else {
      desc = clean(body.replace(m[0], '').replace(/^[\s:·—–\-]+/, ''));
    }
    // TOC 区（Contents）里的相对说明直接丢
    if (inToc) { seenLink++; continue; }

    entries.push({ list: repo, category: cat, name, url, desc: desc.slice(0, 400) });
    seenLink++;
  }
  // 去重（同名同 url）
  const seen = new Set();
  const uniq = [];
  for (const e of entries) {
    const k = e.name.toLowerCase() + '|' + e.url;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  return { repo, categories: [...new Set(categories)], entries: uniq, hubs };
}
