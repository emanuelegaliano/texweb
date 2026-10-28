import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Diagnostics } from './diagnostics.js';
import { readPreamble, katexMacros } from './preamble.js';
import { loadBib } from './bib.js';
import { Renderer, esc, escAttr } from './render.js';
import { compileTikz, pdfToPng } from './tikz.js';

export const FRAMEWORK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------- configurazione
export async function loadConfig(root, overrides = {}) {
  const file = path.join(root, 'texweb.config.js');
  const user = fs.existsSync(file) ? (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default ?? {} : {};
  const cfg = { widgets: 'widgets', outDir: 'dist', cacheDir: '.texweb', engine: 'pdflatex', ...user, ...overrides };
  if (!cfg.main) {
    // il file principale è quello con \documentclass
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

// ---------------------------------------------------------------------- widget
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

// le definizioni dei widget (nome e parametri) si leggono con Vite, che sa importare anche CSS e TypeScript
export async function loadWidgets(cfg, vite, diag) {
  const map = new Map();
  for (const { name, file } of findWidgets(cfg.widgetsDir)) {
    try {
      const mod = await vite.ssrLoadModule(file);
      const def = mod.default;
      if (!def || typeof def.mount !== 'function') {
        diag.error(file, 0, 'il widget deve esportare di default defineWidget({ ... mount })');
        continue;
      }
      const n = def.name ?? name;
      map.set(n, { ...def, name: n, file });
    } catch (e) {
      diag.error(file, 0, `impossibile caricare il widget: ${e.message}`);
    }
  }
  return map;
}

// la copia di texweb.sty accanto agli appunti deve essere quella del framework:
// se è vuota o vecchia, LaTeX non conosce l'ambiente widget o si comporta in modo diverso
function checkSty(root, mainSrc, diag) {
  if (!/\\usepackage(\[[^\]]*\])?\{[^}]*\btexweb\b[^}]*\}/.test(mainSrc)) return;
  const local = path.join(root, 'texweb.sty');
  const official = path.join(FRAMEWORK, 'latex', 'texweb.sty');
  const fix = `ricopialo con: cp "${official}" "${local}"`;
  if (!fs.existsSync(local)) {
    diag.warn(local, 0, `manca texweb.sty accanto agli appunti: LaTeX non troverà l'ambiente widget (${fix})`);
  } else if (fs.statSync(local).size === 0) {
    diag.error(local, 0, `texweb.sty è vuoto: LaTeX non troverà l'ambiente widget (${fix})`);
  } else if (fs.readFileSync(local, 'utf8') !== fs.readFileSync(official, 'utf8')) {
    diag.warn(local, 0, `texweb.sty è diverso da quello di texweb, forse è una versione vecchia (${fix})`);
  }
}

// ---------------------------------------------------------------------- generazione del sito
export async function generate(root, cfg, vite, { dev = false, check = false } = {}) {
  const t0 = Date.now();
  const diag = new Diagnostics(root);
  const mainFile = path.resolve(root, cfg.main);
  const mainSrc = fs.readFileSync(mainFile, 'utf8');
  const preamble = readPreamble(mainSrc);
  const bibFiles = preamble.bibFiles.map((f) => path.resolve(root, f.endsWith('.bib') ? f : `${f}.bib`));
  const bib = loadBib(bibFiles);
  const widgets = await loadWidgets(cfg, vite, diag);
  checkSty(root, mainSrc, diag);

  const r = new Renderer({
    root, preamble, diag, bib, widgets,
    config: { ...cfg, katexMacros: { ...katexMacros(preamble.macros), ...cfg.katexMacros } },
  });
  r.renderDocument(mainFile);
  // texweb check: solo analisi, nessun file scritto e nessuna figura compilata
  if (check) return { diag, pages: r.pages, ms: Date.now() - t0, widgets, tikz: r.tikz.size };

  fs.mkdirSync(cfg.siteDir, { recursive: true });

  // TikZ -> SVG (in cache), poi copiati nel sito
  const tikzDir = path.join(cfg.siteDir, 'tikz');
  fs.mkdirSync(tikzDir, { recursive: true });
  const tikz = await compileTikz(r.tikz, {
    preamble, root, engine: cfg.engine, cacheDir: path.join(cfg.cacheDir, 'cache', 'tikz'),
    onStart: (n) => console.log(`  compilo ${n} figure TikZ...`),
  });
  const tikzHtml = new Map();
  for (const [hash, res] of tikz) {
    const job = r.tikz.get(hash);
    if (res.ok) {
      fs.copyFileSync(res.file, path.join(tikzDir, `${hash}.svg`));
      // la colonna di testo del sito è più larga di quella del PDF: le figure si ingrandiscono
      // dello stesso fattore, così testo delle figure e testo della pagina restano proporzionati
      const head = fs.readFileSync(res.file, 'utf8').slice(0, 600);
      const w = Number((head.match(/width='([\d.]+)pt'/) ?? [])[1]);
      const style = w ? ` style="width:${Math.round(w * 1.333 * (cfg.tikzScale ?? 1.35))}px"` : '';
      tikzHtml.set(hash, `<img class="tw-tikz" src="tikz/${hash}.svg" alt=""${style}>`);
    } else {
      diag.error(job.file, job.line, `TikZ: ${res.error}`);
      tikzHtml.set(hash, `<div class="tw-tikz-error">Figura TikZ non compilata: ${esc(res.error)}</div>`);
    }
  }

  // immagini: copiate, i PDF convertiti in PNG
  for (const [src, rel] of r.media) {
    const dest = path.join(cfg.siteDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (src.endsWith('.pdf')) {
      if (!(await pdfToPng(src, dest))) diag.error(src, 0, 'conversione PDF -> PNG fallita (serve Ghostscript)');
    } else fs.copyFileSync(src, dest);
  }

  const fixTikz = (h) => h.replace(/\u0001T([0-9a-f]+)\u0001/g, (_, hash) => tikzHtml.get(hash) ?? '');
  for (const p of r.pages) p.chunks = p.chunks.map(fixTikz);

  // pagine
  const site = { title: preamble.meta.title ?? cfg.title ?? r.pages[0].title, author: preamble.meta.author ?? cfg.author, colors: preamble.colors, theme: cfg.theme ?? {} };
  const visible = r.pages.filter((p) => p.kind !== 'index' || p.chunks.length);
  const order = r.pages.filter((p) => p.kind !== 'index');
  const written = new Set();
  for (const page of r.pages) {
    const file = path.join(cfg.siteDir, `${page.slug}.html`);
    const html = pageHtml(page, { site, pages: order, diag: dev ? diag : null });
    fs.writeFileSync(file, html);
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
    '// generato da texweb: non modificare',
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
  // i colori del preambolo diventano la palette del sito (si possono rimappare in texweb.config.js)
  for (const [key, colorName] of Object.entries({ ...THEME_KEYS, ...site.theme })) {
    if (site.colors[colorName]) vars.push(`--base-${key}:${site.colors[colorName]};`);
  }
  return `:root{${vars.join('')}}`;
}

function nav(page, pages) {
  let html = '';
  let part = null;
  for (const p of pages) {
    if (p.part && p.part !== part) { part = p.part; html += `<li class="tw-nav-part">${esc(part)}</li>`; }
    const cur = p.slug === page.slug;
    html += `<li class="tw-nav-ch${cur ? ' current' : ''}"><a href="${p.slug}.html">${p.number ? `<span class="tw-nav-num">${p.number}</span>` : ''}${p.title.replace(/<[^>]*>/g, '')}</a>`;
    if (cur && p.toc.length) {
      html += `<ol class="tw-nav-sec">${p.toc.filter((t) => t.level !== 'subsubsection').map((t) =>
        `<li class="lv-${t.level}"><a href="#${t.id}">${t.num ? `<span class="tw-nav-num">${t.num}</span>` : ''}${esc(t.title)}</a></li>`).join('')}</ol>`;
    }
    html += '</li>';
  }
  return `<ol class="tw-nav-list">${html}</ol>`;
}

function diagnosticsPanel(diag) {
  if (!diag || !diag.items.length) return '';
  const rows = diag.items.map((d) => `<li class="${d.level}"><code>${esc(d.file)}${d.line ? `:${d.line}` : ''}</code> ${esc(d.message)}</li>`).join('');
  const n = diag.errors.length;
  return `<details class="tw-diag"${n ? ' open' : ''}><summary>${n} errori, ${diag.items.length - n} avvisi</summary><ul>${rows}</ul></details>`;
}

function pageHtml(page, { site, pages, diag }) {
  const idx = pages.indexOf(page);
  const prev = idx > 0 ? pages[idx - 1] : null;
  const next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const plain = (t) => t.replace(/<[^>]*>/g, '');
  let main = page.chunks.join('\n');
  if (page.kind === 'index') {
    const list = pages.map((p) => `<li><a href="${p.slug}.html">${p.number ? `<span class="tw-nav-num">${p.number}</span>` : ''}${plain(p.title)}</a></li>`).join('');
    main = `<header class="tw-chapter-head tw-cover"><h1>${esc(site.title)}</h1>${site.author ? `<p class="tw-author">${esc(site.author)}</p>` : ''}</header>${main}<ol class="tw-index">${list}</ol>`;
  }
  const notes = page.footnotes.length
    ? `<section class="tw-footnotes"><ol>${page.footnotes.map((f, i) => `<li id="fn-${i + 1}">${f} <a href="#fnref-${i + 1}" aria-label="torna al testo">↩</a></li>`).join('')}</ol></section>`
    : '';
  const pager = page.kind === 'index' ? '' : `<nav class="tw-pager">${prev ? `<a class="prev" href="${prev.slug}.html">← ${plain(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.slug}.html">${plain(next.title)} →</a>` : ''}</nav>`;
  const title = page.kind === 'index' ? site.title : `${plain(page.title)} · ${site.title}`;
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${themeCss(site)}</style>
</head>
<body>
<header class="tw-topbar"><a class="tw-brand" href="index.html">${esc(site.title)}</a><button class="tw-theme" type="button" aria-label="Cambia tema" title="Cambia tema">◐</button></header>
<div class="tw-layout">
<nav class="tw-nav" aria-label="Indice">${nav(page, pages)}</nav>
<main class="tw-main">
${diagnosticsPanel(diag)}
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

export { escAttr };
