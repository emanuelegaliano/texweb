import fs from 'node:fs';
import { readBalanced } from './preamble.js';

// minimal .bib parser: @type{key, field = {value} | "value" | number, ...}
export function parseBib(src) {
  const entries = new Map();
  const re = /@([a-zA-Z]+)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    const body = readBalanced(src, re.lastIndex - 1, '{', '}', { comments: false });
    if (!body) continue;
    re.lastIndex = body[1];
    const text = body[0];
    const comma = text.indexOf(',');
    const key = text.slice(0, comma).trim();
    const fields = {};
    let i = comma + 1;
    while (i < text.length) {
      const fm = text.slice(i).match(/^\s*([a-zA-Z_-]+)\s*=\s*/);
      if (!fm) break;
      i += fm[0].length;
      let value;
      if (text[i] === '{') { const g = readBalanced(text, i, '{', '}', { comments: false }); value = g[0]; i = g[1]; }
      else if (text[i] === '"') { const end = text.indexOf('"', i + 1); value = text.slice(i + 1, end); i = end + 1; }
      else { const vm = text.slice(i).match(/^[^,]+/); value = vm[0].trim(); i += vm[0].length; }
      fields[fm[1].toLowerCase()] = clean(value);
      const next = text.slice(i).match(/^\s*,?/);
      i += next[0].length;
    }
    entries.set(key, { key, type, fields });
  }
  return entries;
}

// strips protective braces and the most common commands from bib fields
const ACC = { "'": '\u0301', '`': '\u0300', '"': '\u0308', '^': '\u0302', '~': '\u0303' };
const clean = (s) => s.replace(/\\(['`"^~])\{?([a-zA-Z])\}?/g, (_, a, c) => (c + ACC[a]).normalize('NFC'))
  .replace(/\\&/g, '&').replace(/\\textit\{([^}]*)\}|\\emph\{([^}]*)\}/g, '$1$2')
  .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

export function loadBib(files) {
  const all = new Map();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const [k, v] of parseBib(fs.readFileSync(f, 'utf8'))) all.set(k, v);
  }
  return all;
}

// "Last, First and Other, Name" -> ["Last", "Other"]
export function lastNames(author = '') {
  return author.split(/\s+and\s+/).filter(Boolean).map((a) => {
    if (a.includes(',')) return a.split(',')[0].trim();
    const parts = a.trim().split(/\s+/);
    return parts[parts.length - 1];
  });
}

export function authorShort(entry, lang = 'en') {
  const names = lastNames(entry.fields.author ?? entry.fields.editor ?? '');
  if (names.length === 0) return entry.fields.title ?? entry.key;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${lang === 'it' ? 'e' : 'and'} ${names[1]}`;
  return `${names[0]} et al.`;
}

// biblatex's "nty" sorting: name, title, year
export const sortKey = (e) => `${lastNames(e.fields.author ?? '').join(' ')}|${e.fields.title ?? ''}|${e.fields.year ?? ''}`.toLowerCase();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function formatEntry(e) {
  const f = e.fields;
  const authors = (f.author ?? '').split(/\s+and\s+/).filter(Boolean).map((a) => {
    if (!a.includes(',')) return a.trim();
    const [last, first] = a.split(',').map((x) => x.trim());
    return `${first} ${last}`;
  });
  const parts = [];
  if (authors.length) parts.push(esc(authors.join(', ')));
  if (f.title) parts.push(`<em>${esc(f.title)}</em>`);
  const venue = f.journal ?? f.booktitle ?? f.publisher ?? f.howpublished ?? f.institution;
  if (venue) parts.push(esc(venue));
  if (f.year) parts.push(esc(f.year));
  let html = `${parts.join('. ')}.`;
  const url = f.url ?? (f.doi ? `https://doi.org/${f.doi}` : null);
  if (url) html += ` <a href="${esc(url)}">${esc(url)}</a>`;
  return html;
}
