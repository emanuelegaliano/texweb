import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Diagnostics } from './diagnostics.js';
import { readPreamble, katexMacros } from './preamble.js';
import { loadBib } from './bib.js';
import { Renderer, esc } from './render.js';
import { compileTikz, pdfToPng, embedImages } from './tikz.js';
import { detectLang, getLocale } from './locale.js';

export const FRAMEWORK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------- configuration
export async function loadConfig(root, overrides = {}) {
  const file = path.join(root, 'texweb.config.js');
  const user = fs.existsSync(file) ? (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default ?? {} : {};
  const cfg = { widgets: 'widgets', outDir: 'dist', cacheDir: '.texweb', engine: 'pdflatex', ...user, ...overrides };
  if (!cfg.main) {
    // the main file is the one with \documentclass
    const cand = fs.readdirSync(root).filter((f) => f.endsWith('.tex'))
      .find((f) => /\\documentclass/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    cfg.main = cand ?? 'main.tex';
  }
  cfg.cacheDir = path.resolve(root, cfg.cacheDir);
  cfg.siteDir = path.join(cfg.cacheDir, 'site');
  cfg.outDir = path.resolve(root, cfg.outDir);
  cfg.widgetsDir = path.resolve(root, cfg.widgets);
  return cfg;
}

// ---------------------------------------------------------------------- widgets
export function findWidgets(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const f = ['index.js', 'index.ts', 'index.jsx', 'index.tsx'].map((x) => path.join(dir, entry.name, x)).find((x) => fs.existsSync(x));
      if (f) out.push({ name: entry.name, file: f });
    } else if (/\.(js|ts)$/.test(entry.name)) out.push({ name: entry.name.replace(/\.(js|ts)$/, ''), file: path.join(dir, entry.name) });
  }
  return out;
}

// widget definitions (name and parameters) are loaded through Vite, which can import CSS and TypeScript too
export async function loadWidgets(cfg, vite, diag) {
  const map = new Map();
  for (const { name, file } of findWidgets(cfg.widgetsDir)) {
    try {
      const mod = await vite.ssrLoadModule(file);
      const def = mod.default;
      if (!def || typeof def.mount !== 'function') {
        diag.error(file, 0, 'a widget must default-export defineWidget({ ... mount })');
        continue;
      }
      const n = def.name ?? name;
      map.set(n, { ...def, name: n, file });
    } catch (e) {
      diag.error(file, 0, `cannot load the widget: ${e.message}`);
    }
  }
  return map;
}

// the copy of texweb.sty next to the notes must match the framework's:
// if it is empty or outdated, LaTeX does not know the widget environment or behaves differently
function checkSty(root, mainSrc, diag) {
  if (!/\\usepackage(\[[^\]]*\])?\{[^}]*\btexweb\b[^}]*\}/.test(mainSrc)) return;
  const local = path.join(root, 'texweb.sty');
  const official = path.join(FRAMEWORK, 'latex', 'texweb.sty');
  const fix = `copy it again with: cp "${official}" "${local}"`;
  if (!fs.existsSync(local)) {
    diag.warn(local, 0, `texweb.sty is missing next to the notes: LaTeX will not find the widget environment (${fix})`);
  } else if (fs.statSync(local).size === 0) {
    diag.error(local, 0, `texweb.sty is empty: LaTeX will not find the widget environment (${fix})`);
  } else if (fs.readFileSync(local, 'utf8') !== fs.readFileSync(official, 'utf8')) {
    diag.warn(local, 0, `texweb.sty differs from texweb's own copy, it may be outdated (${fix})`);
  }
}

// "owner/name" of the GitHub repository of the notes: from `repository` in the config,
// otherwise from the origin remote in .git/config
export function githubRepo(root, cfg) {
  if (cfg.repository === false) return null;
  if (cfg.repository) return String(cfg.repository).replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  const gitConfig = path.join(root, '.git', 'config');
  if (!fs.existsSync(gitConfig)) return null;
  const src = fs.readFileSync(gitConfig, 'utf8');
  const origin = src.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
  const m = origin?.[1].match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(\.git)?$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------- site generation
export async function generate(root, cfg, vite, { dev = false, check = false } = {}) {
  const t0 = Date.now();
  const diag = new Diagnostics(root);
  const mainFile = path.resolve(root, cfg.main);
  const mainSrc = fs.readFileSync(mainFile, 'utf8');
  const preamble = readPreamble(mainSrc);
  const lang = cfg.lang ?? detectLang(preamble.raw);
  const bibFiles = preamble.bibFiles.map((f) => path.resolve(root, f.endsWith('.bib') ? f : `${f}.bib`));
  const bib = loadBib(bibFiles);
  const widgets = await loadWidgets(cfg, vite, diag);
  checkSty(root, mainSrc, diag);

  const r = new Renderer({
    root, preamble, diag, bib, widgets,
    config: { ...cfg, lang, katexMacros: { ...katexMacros(preamble.macros), ...cfg.katexMacros } },
  });
  r.renderDocument(mainFile);
  // texweb check: analysis only, no files written and no figures compiled
  if (check) return { diag, pages: r.pages, ms: Date.now() - t0, widgets, tikz: r.tikz.size };

  fs.mkdirSync(cfg.siteDir, { recursive: true });
  const t = getLocale(lang);

  // TikZ -> SVG (cached), then copied into the site
  const tikzDir = path.join(cfg.siteDir, 'tikz');
  fs.mkdirSync(tikzDir, { recursive: true });
  const tikz = await compileTikz(r.tikz, {
    preamble, root, engine: cfg.engine, cacheDir: path.join(cfg.cacheDir, 'cache', 'tikz'),
    onStart: (n) => console.log(`  compiling ${n} TikZ figures...`),
  });
  const tikzHtml = new Map();
  for (const [hash, res] of tikz) {
    const job = r.tikz.get(hash);
    if (res.ok) {
      fs.writeFileSync(path.join(tikzDir, `${hash}.svg`), embedImages(fs.readFileSync(res.file, 'utf8'), root));
      // the site's text column is wider than the PDF's: figures are scaled by the same factor,
      // so the text inside figures stays in proportion with the text of the page
      const head = fs.readFileSync(res.file, 'utf8').slice(0, 600);
      const w = Number((head.match(/width='([\d.]+)pt'/) ?? [])[1]);
      const style = w ? ` style="width:${Math.round(w * 1.333 * (cfg.tikzScale ?? 1.35))}px"` : '';
      tikzHtml.set(hash, `<img class="tw-tikz" src="tikz/${hash}.svg" alt=""${style}>`);
    } else {
      diag.error(job.file, job.line, `TikZ: ${res.error}`);
      tikzHtml.set(hash, `<div class="tw-tikz-error">${esc(t.tikzFailed)}: ${esc(res.error)}</div>`);
    }
  }

  // images: copied, PDFs converted to PNG
  for (const [src, rel] of r.media) {
    const dest = path.join(cfg.siteDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (src.endsWith('.pdf')) {
      if (!(await pdfToPng(src, dest))) diag.error(src, 0, 'PDF -> PNG conversion failed (Ghostscript is required)');
    } else fs.copyFileSync(src, dest);
  }

  const fixTikz = (h) => h.replace(/\u0001T([0-9a-f]+)\u0001/g, (_, hash) => tikzHtml.get(hash) ?? '');
  for (const p of r.pages) p.chunks = p.chunks.map(fixTikz);

  // pages
  const site = {
    title: preamble.meta.title ?? cfg.title ?? r.pages[0].title,
    author: preamble.meta.author ?? cfg.author,
    colors: preamble.colors, theme: cfg.theme ?? {}, lang, t,
    repo: githubRepo(root, cfg),
  };
  const visible = r.pages.filter((p) => p.kind !== 'index' || p.chunks.length);
  const order = r.pages.filter((p) => p.kind !== 'index');
  const written = new Set();
  for (const page of r.pages) {
    const file = path.join(cfg.siteDir, `${page.slug}.html`);
    fs.writeFileSync(file, pageHtml(page, { site, pages: order, diag: dev ? diag : null }));
    written.add(path.basename(file));
  }
  for (const f of fs.readdirSync(cfg.siteDir)) if (f.endsWith('.html') && !written.has(f)) fs.rmSync(path.join(cfg.siteDir, f));

  writeEntry(cfg, widgets);
  return { diag, pages: visible, ms: Date.now() - t0, widgets };
}

function writeEntry(cfg, widgets) {
  const rel = (p) => {
    const r = path.relative(cfg.siteDir, p).replace(/\\/g, '/');
    return r.startsWith('.') ? r : `./${r}`;
  };
  const lines = [
    '// generated by texweb: do not edit',
    `import { start } from '${rel(path.join(FRAMEWORK, 'client', 'runtime.js'))}';`,
    'start({',
    '  widgets: {',
    ...[...widgets.values()].map((w) => `    ${JSON.stringify(w.name)}: () => import('${rel(w.file)}'),`),
    '  },',
    '});',
    '',
  ];
  fs.writeFileSync(path.join(cfg.siteDir, 'entry.js'), lines.join('\n'));
}

// ---------------------------------------------------------------------- template
const THEME_KEYS = { accent: 'Accent', obs: 'ObsColor', fig: 'FigColor', lemma: 'LemmaColor', ex: 'ExColor' };

function themeCss(site) {
  const vars = Object.entries(site.colors).map(([k, v]) => `--tex-${k}:${v};`);
  // the preamble's colors become the site palette (they can be remapped in texweb.config.js)
  for (const [key, colorName] of Object.entries({ ...THEME_KEYS, ...site.theme })) {
    if (site.colors[colorName]) vars.push(`--base-${key}:${site.colors[colorName]};`);
  }
  return `:root{${vars.join('')}}`;
}

// the heading of a \part: "Parte I" above the title
const partHeading = (part, t, cls) =>
  `<li class="${cls}">${part.num ? `<span class="tw-part-num">${esc(t.part)} ${part.num}</span>` : ''}<span class="tw-part-title">${esc(part.title)}</span></li>`;

function nav(page, pages, t) {
  let html = '';
  let part = null;
  for (const p of pages) {
    if (p.part && p.part !== part) { part = p.part; html += partHeading(part, t, 'tw-nav-part'); }
    const cur = p.slug === page.slug;
    html += `<li class="tw-nav-ch${cur ? ' current' : ''}${p.part ? ' in-part' : ''}"><a href="${p.slug}.html">${p.number ? `<span class="tw-nav-num">${p.number}</span>` : ''}<span class="tw-nav-title">${p.title.replace(/<[^>]*>/g, '')}</span></a>`;
    if (cur && p.toc.length) {
      html += `<ol class="tw-nav-sec">${p.toc.filter((s) => s.level !== 'subsubsection').map((s) =>
        `<li class="lv-${s.level}"><a href="#${s.id}">${s.num ? `<span class="tw-nav-num">${s.num}</span>` : ''}<span class="tw-nav-title">${esc(s.title)}</span></a></li>`).join('')}</ol>`;
    }
    html += '</li>';
  }
  return `<ol class="tw-nav-list">${html}</ol>`;
}

function diagnosticsPanel(diag, t) {
  if (!diag || !diag.items.length) return '';
  const rows = diag.items.map((d) => `<li class="${d.level}"><code>${esc(d.file)}${d.line ? `:${d.line}` : ''}</code> ${esc(d.message)}</li>`).join('');
  const n = diag.errors.length;
  return `<details class="tw-diag"${n ? ' open' : ''}><summary>${t.diagnostics(n, diag.items.length - n)}</summary><ul>${rows}</ul></details>`;
}

// opens a new GitHub issue; the runtime fills in page, section, source file and selected text
function reportButton(page, site) {
  if (!site.repo) return '';
  const { t } = site;
  const href = `https://github.com/${site.repo}/issues/new`;
  const data = { page: page.title.replace(/<[^>]*>/g, ''), source: page.source ?? '', labels: t.issue };
  return `<a class="tw-report" href="${href}" target="_blank" rel="noopener" data-issue='${esc(JSON.stringify(data)).replace(/'/g, '&#39;')}'>`
    + `<span aria-hidden="true">⚑</span> <span class="tw-report-label">${esc(t.reportError)}</span></a>`;
}

function pageHtml(page, { site, pages, diag }) {
  const { t } = site;
  const idx = pages.indexOf(page);
  const prev = idx > 0 ? pages[idx - 1] : null;
  const next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const plain = (s) => s.replace(/<[^>]*>/g, '');
  let main = page.chunks.join('\n');
  if (page.kind === 'index') {
    let part = null;
    const list = pages.map((p) => {
      let head = '';
      if (p.part && p.part !== part) { part = p.part; head = partHeading(part, t, 'tw-index-part'); }
      return `${head}<li${p.part ? ' class="in-part"' : ''}><a href="${p.slug}.html">${p.number ? `<span class="tw-nav-num">${p.number}</span>` : ''}<span class="tw-nav-title">${plain(p.title)}</span></a></li>`;
    }).join('');
    main = `<header class="tw-chapter-head tw-cover"><h1>${esc(site.title)}</h1>${site.author ? `<p class="tw-author">${esc(site.author)}</p>` : ''}</header>${main}<ol class="tw-index">${list}</ol>`;
  }
  const notes = page.footnotes.length
    ? `<section class="tw-footnotes"><ol>${page.footnotes.map((f, i) => `<li id="fn-${i + 1}">${f} <a href="#fnref-${i + 1}" aria-label="${esc(t.backToText)}">↩</a></li>`).join('')}</ol></section>`
    : '';
  const pager = page.kind === 'index' ? '' : `<nav class="tw-pager">${prev ? `<a class="prev" href="${prev.slug}.html">← ${plain(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.slug}.html">${plain(next.title)} →</a>` : ''}</nav>`;
  const title = page.kind === 'index' ? site.title : `${plain(page.title)} · ${site.title}`;
  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${themeCss(site)}</style>
</head>
<body>
<header class="tw-topbar"><a class="tw-brand" href="index.html">${esc(site.title)}</a><div class="tw-actions">${reportButton(page, site)}<button class="tw-theme" type="button" aria-label="${esc(t.toggleTheme)}" title="${esc(t.toggleTheme)}">◐</button></div></header>
<div class="tw-layout">
<nav class="tw-nav" aria-label="${esc(t.contents)}">${nav(page, pages, t)}</nav>
<main class="tw-main">
${diagnosticsPanel(diag, t)}
${main}
${notes}
${pager}
</main>
</div>
<script type="module" src="./entry.js"></script>
</body>
</html>
`;
}
