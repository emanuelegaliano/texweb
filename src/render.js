import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import katex from 'katex';
import { parseFile, parseString, sourceOf, lineOf, argText, hasArg, envName, isStar } from './parse.js';
import { IGNORED_MACROS, TRANSPARENT_ENVS, SKIPPED_ENVS, TEXT_SYMBOLS, ACCENTS, ALGO_BLOCKS, ALGO_CLOSERS } from './dialect.js';
import { readBalanced } from './preamble.js';
import { validateParams } from './widget-params.js';
import { closest } from './diagnostics.js';
import { authorShort, sortKey, formatEntry } from './bib.js';

// segnaposto risolti alla fine, quando tutti i \label e i \cite sono noti
const PH = '\u0001';
const CAPTION_MARK = '\u0002CAPTION\u0002';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pagina';
const stripTags = (h) => h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// tipografia del testo semplice: virgolette, trattini, spazi non separabili
function typo(s) {
  return esc(s)
    .replace(/``/g, '“').replace(/''/g, '”').replace(/`/g, '‘')
    .replace(/---/g, '—').replace(/--/g, '–')
    .replace(/~/g, '&nbsp;')
    .replace(/[ \t\n]+/g, ' ');
}

// raccoglie il testo in paragrafi: il testo e gli elementi in linea finiscono in <p>,
// gli elementi a blocco (figure, formule, elenchi) chiudono il paragrafo corrente
class Flow {
  constructor() { this.parts = []; this.para = ''; this.buf = ''; }
  text(s) { this.buf += s; }
  flushText() { if (this.buf) { this.para += typo(this.buf); this.buf = ''; } }
  inline(h) { this.flushText(); this.para += h; }
  parbreak() {
    this.flushText();
    const p = this.para.trim();
    if (p) this.emit(`<p>${p}</p>`);
    this.para = '';
  }
  block(h) { this.parbreak(); this.emit(h); }
  emit(h) { this.parts.push(h); }
  finish() { this.parbreak(); return this.parts.join('\n'); }
}

class InlineFlow extends Flow {
  parbreak() { this.text(' '); }
  block(h) { this.inline(h); }
  finish() { this.flushText(); return this.para.trim(); }
}

// il flusso principale scrive direttamente nella pagina corrente (che cambia a ogni \chapter)
class PageFlow extends Flow {
  constructor(r) { super(); this.r = r; }
  emit(h) { this.r.page.chunks.push(h); }
}

const DEFAULT_BOXES = {
  definizione: { title: 'Definizione', numbered: true, style: 'accent' },
  lemma: { title: 'Lemma', numbered: true, style: 'lemma' },
  teorema: { title: 'Teorema', numbered: true, style: 'lemma' },
  corollario: { title: 'Corollario', numbered: true, style: 'lemma' },
  esercizio: { title: 'Esercizio', numbered: true, style: 'ex' },
  osservazione: { title: 'Osservazione', numbered: false, style: 'obs' },
  esempiofig: { title: 'Esempio', numbered: false, style: 'plain', split: 'tcblower' },
  proof: { title: 'Dimostrazione', numbered: false, style: 'proof' },
};

const FLOAT_NAMES = { figure: 'Figura', table: 'Tabella', algorithm: 'Algoritmo' };
const MATH_ENVS = new Set(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'displaymath', 'math']);

export class Renderer {
  constructor({ root, preamble, diag, bib, widgets, config }) {
    this.root = root;
    this.preamble = preamble;
    this.diag = diag;
    this.bib = bib;
    this.widgets = widgets;
    this.config = config;
    this.boxes = { ...DEFAULT_BOXES, ...config.boxes };
    this.floatNames = { ...FLOAT_NAMES, ...config.floatNames };
    this.katexMacros = config.katexMacros;

    this.pages = [];
    this.page = this.newPage({ slug: 'index', title: preamble.meta.title ?? config.title ?? 'Appunti', kind: 'index' });
    this.counters = { chapter: 0, section: 0, subsection: 0, subsubsection: 0, equation: 0, footnote: 0 };
    this.within = {}; // contatori numerati per capitolo: figure, table, definizione, ...
    this.appendix = false;
    this.part = null;
    this.labels = new Map();
    this.target = null;
    this.refs = [];
    this.cites = [];
    this.tikz = new Map();
    this.media = new Map();
    this.usedWidgets = new Set();
    this.bibPage = null;
    this.ids = 0;

    // le macro del preambolo con argomenti vanno dichiarate al parser
    this.extra = { macros: {}, envs: {} };
    for (const [name, m] of Object.entries(preamble.macros)) {
      if (m.nargs) this.extra.macros[name] = (m.default !== undefined ? 'o ' : '') + 'm '.repeat(m.nargs - (m.default !== undefined ? 1 : 0)).trim();
    }
    for (const name of Object.keys(this.boxes)) this.extra.envs[name] = 'o';
  }

  // ------------------------------------------------------------------ documento
  renderDocument(mainFile) {
    const ctx = this.parse(mainFile);
    const doc = ctx.ast.content.find((n) => n.type === 'environment' && envName(n) === 'document');
    if (!doc) {
      this.diag.error(mainFile, 0, 'manca \\begin{document}');
      return;
    }
    const flow = new PageFlow(this);
    this.renderInto(doc.content, ctx, flow);
    flow.finish();
    if (this.cites.length && !this.bibPage) this.bibliography(null, ctx, flow);
    this.finalize();
  }

  parse(file) {
    try {
      return parseFile(file, this.extra);
    } catch (e) {
      this.diag.error(file, e.location?.start?.line ?? 0, `errore di sintassi: ${e.message}`);
      return { ast: { content: [] }, src: '', file };
    }
  }

  newPage({ slug, title, number = null, kind = 'chapter' }) {
    let s = slug, k = 2;
    while (this.pages.some((p) => p.slug === s)) s = `${slug}-${k++}`;
    const page = { slug: s, title, number, kind, part: this.part, chunks: [], toc: [], footnotes: [] };
    this.pages.push(page);
    return page;
  }

  // ------------------------------------------------------------------ numerazione
  chapterLabel() {
    return this.appendix ? String.fromCharCode(64 + this.counters.chapter) : String(this.counters.chapter);
  }

  stepWithin(name) {
    this.within[name] = (this.within[name] ?? 0) + 1;
    return this.counters.chapter ? `${this.chapterLabel()}.${this.within[name]}` : String(this.within[name]);
  }

  newId(prefix) { return `${prefix}-${++this.ids}`; }

  setTarget(num, id, kind) { this.target = { num, id, kind, page: this.page.slug }; }

  defineLabel(key, ctx, node) {
    if (this.labels.has(key)) this.diag.warn(ctx.file, lineOf(node), `etichetta "${key}" definita due volte`);
    if (!this.target) this.diag.warn(ctx.file, lineOf(node), `\\label{${key}} non segue niente di numerato`);
    this.labels.set(key, this.target ?? { num: '?', id: '', kind: 'none', page: this.page.slug });
  }

  // ------------------------------------------------------------------ rendering di liste di nodi
  renderInto(nodes, ctx, flow) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      switch (n.type) {
        case 'string': flow.text(n.content); break;
        case 'whitespace': flow.text(' '); break;
        case 'parbreak': flow.parbreak(); break;
        case 'comment': break;
        case 'group': flow.inline(this.group(n, ctx)); break;
        case 'inlinemath': flow.inline(this.math(sourceOf(ctx, n).replace(/^\$|^\\\(/, '').replace(/\$$|\\\)$/, ''), false, ctx, n)); break;
        case 'displaymath': flow.block(this.displayMath(sourceOf(ctx, n).replace(/^\$\$|^\\\[/, '').replace(/\$\$$|\\\]$/, ''), ctx, n)); break;
        case 'mathenv': this.mathEnv(n, ctx, flow); break;
        case 'verb': flow.inline(`<code>${esc(n.content)}</code>`); break;
        case 'verbatim': flow.block(`<pre class="tw-code"><code>${esc(n.content.replace(/^\n/, ''))}</code></pre>`); break;
        case 'macro': i += this.macro(n, ctx, flow, nodes, i) ?? 0; break;
        case 'environment': this.environment(n, ctx, flow); break;
        case 'raw': flow.inline(n.html); break;
        default: break;
      }
    }
  }

  block(nodes, ctx) { const f = new Flow(); this.renderInto(nodes, ctx, f); return f.finish(); }
  inline(nodes, ctx) { const f = new InlineFlow(); this.renderInto(nodes ?? [], ctx, f); return f.finish(); }
  inlineArg(a, ctx) { return this.inline(a?.content, ctx); }

  group(n, ctx) {
    // dichiarazioni dentro un gruppo: {\bfseries testo}, {\color{Accent} testo}
    const content = [...n.content];
    const wraps = [];
    while (content.length) {
      const first = content[0];
      if (first.type === 'whitespace') { content.shift(); continue; }
      if (first.type !== 'macro') break;
      const name = first.content;
      if (name === 'bfseries') wraps.push(['<strong>', '</strong>']);
      else if (name === 'itshape' || name === 'em' || name === 'it') wraps.push(['<em>', '</em>']);
      else if (name === 'ttfamily') wraps.push(['<code>', '</code>']);
      else if (name === 'color') wraps.push([`<span style="color:${this.color(argText(first.args?.[0]))}">`, '</span>']);
      else if (!IGNORED_MACROS.has(name)) break;
      content.shift();
    }
    let html = this.inline(content, ctx);
    for (const [a, b] of wraps.reverse()) html = a + html + b;
    return html;
  }

  color(name) {
    return this.preamble.colors[name] ? `var(--tex-${name})` : name.replace(/!.*/, '');
  }

  // ------------------------------------------------------------------ macro
  macro(n, ctx, flow, nodes, i) {
    const name = n.content;
    const a = n.args ?? [];
    const line = lineOf(n);
    const h = this.macroHandlers[name];
    if (h) return h.call(this, n, ctx, flow, a, nodes, i);

    if (name in TEXT_SYMBOLS) { flow.inline(TEXT_SYMBOLS[name]); return; }
    if (name in ACCENTS) {
      // \'e: l'accento si combina con il carattere che segue
      const next = nodes[i + 1];
      const txt = next?.type === 'string' ? next.content : next?.type === 'group' ? argText(next) : '';
      if (txt) {
        flow.inline(esc((txt[0] + ACCENTS[name]).normalize('NFC')));
        if (next.type === 'string') flow.text(txt.slice(1));
        return 1;
      }
      return;
    }
    if (IGNORED_MACROS.has(name)) return;
    if (this.preamble.macros[name]) { this.expandUserMacro(n, ctx, flow); return; }

    const guess = closest(name, [...Object.keys(this.macroHandlers), ...Object.keys(this.preamble.macros)]);
    this.diag.error(ctx.file, line, `comando sconosciuto \\${name}${guess ? ` (forse \\${guess}?)` : ''}`);
    flow.inline(`<code class="tw-unknown" title="comando sconosciuto">\\${esc(name)}</code>`);
  }

  // macro definita nel preambolo con \newcommand: si sostituiscono gli argomenti e si rende il risultato
  expandUserMacro(n, ctx, flow) {
    const m = this.preamble.macros[n.content];
    if (m.mathOnly) { this.diag.error(ctx.file, lineOf(n), `\\${n.content} si usa solo in matematica`); return; }
    let body = m.body;
    const args = (n.args ?? []).map((x) => (hasArg(x) ? sourceOfArg(ctx, x) : null));
    for (let k = 0; k < m.nargs; k++) body = body.replaceAll(`#${k + 1}`, args[k] ?? m.default ?? '');
    const sub = parseString(body, ctx.file, this.extra);
    // i nodi del corpo hanno posizioni relative al corpo: errori e sorgenti puntano lì
    this.renderInto(sub.ast.content, { ...sub, file: ctx.file, lineOffset: lineOf(n) }, flow);
  }

  get macroHandlers() {
    if (this._handlers) return this._handlers;
    const wrap = (open, close) => function (n, ctx, flow, a) { flow.inline(open + this.inlineArg(a[0], ctx) + close); };
    const heading = (level) => function (n, ctx, flow, a) { this.heading(level, n, ctx, flow, a); };
    this._handlers = {
      part: function (n, ctx, flow, a) { this.part = stripTags(this.inlineArg(a[2], ctx)); },
      chapter: function (n, ctx, flow, a) { this.chapter(n, ctx, flow, a); },
      section: heading('section'),
      subsection: heading('subsection'),
      subsubsection: heading('subsubsection'),
      paragraph: function (n, ctx, flow, a) {
        flow.parbreak();
        flow.inline(`<span class="tw-runin">${this.inlineArg(a[2], ctx)}</span> `);
      },
      subparagraph: function (n, ctx, flow, a) { flow.parbreak(); flow.inline(`<span class="tw-runin sub">${this.inlineArg(a[2], ctx)}</span> `); },
      appendix: function () { this.appendix = true; this.counters.chapter = 0; },

      textbf: wrap('<strong>', '</strong>'),
      textit: wrap('<em>', '</em>'),
      emph: wrap('<em>', '</em>'),
      texttt: wrap('<code>', '</code>'),
      textsf: wrap('<span class="tw-sf">', '</span>'),
      textsc: wrap('<span class="tw-sc">', '</span>'),
      textrm: wrap('', ''),
      text: wrap('', ''),
      mbox: wrap('<span class="tw-nobr">', '</span>'),
      underline: wrap('<u>', '</u>'),
      textcolor: function (n, ctx, flow, a) { flow.inline(`<span style="color:${this.color(argText(a[0]))}">${this.inlineArg(a[1], ctx)}</span>`); },
      '\\': function (n, ctx, flow) { flow.inline('<br>'); },

      footnote: function (n, ctx, flow, a) {
        const k = this.page.footnotes.length + 1;
        this.page.footnotes.push(this.inlineArg(a[1], ctx));
        flow.inline(`<sup class="tw-fnref" id="fnref-${k}"><a href="#fn-${k}">${k}</a></sup>`);
      },
      url: function (n, ctx, flow, a) {
        const u = sourceOfArg(ctx, a[0]);
        flow.inline(`<a class="tw-url" href="${escAttr(u)}">${esc(u)}</a>`);
      },
      href: function (n, ctx, flow, a) { flow.inline(`<a href="${escAttr(sourceOfArg(ctx, a[0]))}">${this.inlineArg(a[1], ctx)}</a>`); },

      label: function (n, ctx, flow, a) { this.defineLabel(argText(a[0]).trim(), ctx, n); },
      ref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'ref', ctx, n)); },
      pageref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'ref', ctx, n)); },
      eqref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'eqref', ctx, n)); },
      autoref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'auto', ctx, n)); },
      cref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'auto', ctx, n)); },
      Cref: function (n, ctx, flow, a) { flow.inline(this.refPH(argText(a[0]), 'Auto', ctx, n)); },

      cite: function (n, ctx, flow, a) { flow.inline(this.citePH('cite', n, ctx, a)); },
      parencite: function (n, ctx, flow, a) { flow.inline(this.citePH('cite', n, ctx, a)); },
      textcite: function (n, ctx, flow, a) { flow.inline(this.citePH('textcite', n, ctx, a)); },
      citetitle: function (n, ctx, flow, a) { flow.inline(this.citePH('title', n, ctx, a)); },
      citeauthor: function (n, ctx, flow, a) { flow.inline(this.citePH('author', n, ctx, a)); },
      printbibliography: function (n, ctx, flow, a) { this.bibliography(n, ctx, flow, a); },

      caption: function (n, ctx, flow, a) {
        if (!ctx.float) { this.diag.error(ctx.file, lineOf(n), '\\caption fuori da una figura o tabella'); return; }
        ctx.float.caption = this.inlineArg(a[1], ctx);
        flow.block(CAPTION_MARK);
      },
      includegraphics: function (n, ctx, flow, a) { flow.inline(this.includegraphics(n, ctx, a)); },
      item: function (n, ctx) { this.diag.error(ctx.file, lineOf(n), '\\item fuori da un elenco'); },
      input: function (n, ctx, flow, a) { this.input(argText(a[0]), n, ctx, flow); },
      include: function (n, ctx, flow, a) { this.input(argText(a[0]), n, ctx, flow); },
    };
    return this._handlers;
  }

  // ------------------------------------------------------------------ struttura
  chapter(n, ctx, flow, a) {
    if (!(flow instanceof PageFlow)) {
      this.diag.error(ctx.file, lineOf(n), '\\chapter dentro un ambiente');
      return;
    }
    flow.parbreak();
    const title = this.inlineArg(a[2], ctx);
    const star = isStar(n);
    let number = null;
    if (!star) {
      this.counters.chapter++;
      Object.assign(this.counters, { section: 0, subsection: 0, subsubsection: 0, equation: 0 });
      this.within = {};
      number = this.chapterLabel();
    }
    this.page = this.newPage({ slug: slugify(stripTags(title)), title, number, kind: star ? 'unnumbered' : 'chapter' });
    this.setTarget(number ?? stripTags(title), 'top', 'chapter');
    const kicker = number ? `<p class="tw-chapter-num">${this.appendix ? 'Appendice' : 'Capitolo'} ${number}</p>` : '';
    this.page.chunks.push(`<header class="tw-chapter-head">${kicker}<h1>${title}</h1></header>`);
  }

  heading(level, n, ctx, flow, a) {
    flow.parbreak();
    const title = this.inlineArg(a[2], ctx);
    const star = isStar(n);
    let num = null;
    if (!star) {
      if (level === 'section') { this.counters.section++; this.counters.subsection = 0; this.counters.subsubsection = 0; }
      if (level === 'subsection') { this.counters.subsection++; this.counters.subsubsection = 0; }
      if (level === 'subsubsection') this.counters.subsubsection++;
      const parts = [this.counters.chapter ? this.chapterLabel() : null, this.counters.section];
      if (level !== 'section') parts.push(this.counters.subsection);
      if (level === 'subsubsection') parts.push(this.counters.subsubsection);
      num = parts.filter((x) => x != null).join('.');
    }
    const id = num ? `s-${num.replace(/\./g, '-')}` : this.newId(slugify(stripTags(title)));
    if (num) this.setTarget(num, id, level);
    const tag = { section: 'h2', subsection: 'h3', subsubsection: 'h4' }[level];
    this.page.toc.push({ level, num, title: stripTags(title), id });
    flow.block(`<${tag} id="${id}">${num ? `<span class="tw-secnum">${num}</span>` : ''}${title}</${tag}>`);
  }

  input(name, n, ctx, flow) {
    const base = path.resolve(this.root, name.trim());
    const file = fs.existsSync(base) ? base : `${base}.tex`;
    if (!fs.existsSync(file)) {
      this.diag.error(ctx.file, lineOf(n), `file non trovato: ${name}`);
      return;
    }
    const sub = this.parse(file);
    this.renderInto(sub.ast.content, sub, flow);
  }

  // ------------------------------------------------------------------ ambienti
  environment(n, ctx, flow) {
    const name = envName(n);
    if (SKIPPED_ENVS.has(name)) return;
    if (TRANSPARENT_ENVS.has(name)) {
      const inner = this.block(n.content, ctx);
      const cls = name === 'center' ? ' tw-center' : '';
      flow.block(`<div class="tw-group${cls}">${inner}</div>`);
      return;
    }
    if (name in this.floatNames || name === 'figure*' || name === 'table*') return this.float(n, ctx, flow, name.replace('*', ''));
    if (name === 'itemize' || name === 'enumerate' || name === 'description') return this.list(n, ctx, flow, name);
    if (name === 'tabular' || name === 'tabular*') return this.tabular(n, ctx, flow);
    if (this.boxes[name]) return this.box(n, ctx, flow, name, this.boxes[name]);
    if (name === 'widget') return this.widget(n, ctx, flow);
    if (name === 'tikzpicture') { flow.block(this.tikzPH(sourceOf(ctx, n), ctx, n)); return; }
    if (name === 'lstlisting' || name === 'verbatim' || name === 'minted') return this.listing(n, ctx, flow, name);
    if (name === 'algorithmic') return this.algorithmic(n, ctx, flow);
    if (MATH_ENVS.has(name)) return this.mathEnv(n, ctx, flow);
    if (name === 'quote' || name === 'quotation') { flow.block(`<blockquote>${this.block(n.content, ctx)}</blockquote>`); return; }

    this.diag.error(ctx.file, lineOf(n), `ambiente sconosciuto "${name}"`);
    flow.block(`<div class="tw-unknown-env" data-env="${escAttr(name)}">${this.block(n.content, ctx)}</div>`);
  }

  float(n, ctx, flow, kind) {
    const hasCaption = containsMacro(n.content, 'caption');
    const id = this.newId(kind);
    let num = null;
    if (hasCaption) { num = this.stepWithin(kind); this.setTarget(num, id, kind); }
    const fctx = { ...ctx, float: { kind, num, caption: null } };
    let body = this.block(n.content, fctx);
    const cap = fctx.float.caption != null
      ? `<figcaption><span class="tw-figlabel">${this.floatNames[kind]} ${num}.</span> ${fctx.float.caption}</figcaption>`
      : '';
    body = body.includes(CAPTION_MARK) ? body.replace(CAPTION_MARK, cap) : body + cap;
    flow.block(`<figure class="tw-float tw-${kind}" id="${id}">${body}</figure>`);
  }

  list(n, ctx, flow, kind) {
    const items = [];
    let cur = null;
    for (const node of n.content) {
      if (node.type === 'macro' && node.content === 'item') {
        cur = { label: hasArg(node.args?.[0]) ? this.inlineArg(node.args[0], ctx) : null, nodes: [] };
        items.push(cur);
      } else if (cur) cur.nodes.push(node);
    }
    const unwrap = (h) => (/^<p>[\s\S]*<\/p>$/.test(h) && h.indexOf('<p>', 1) < 0 ? h.slice(3, -4) : h);
    if (kind === 'description') {
      flow.block(`<dl class="tw-dl">${items.map((it) => `<dt>${it.label ?? ''}</dt><dd>${unwrap(this.block(it.nodes, ctx))}</dd>`).join('')}</dl>`);
      return;
    }
    const opt = argText(n.args?.[0]);
    const type = /\\alph/.test(opt) ? 'a' : /\\Alph/.test(opt) ? 'A' : /\\roman/.test(opt) ? 'i' : /\\Roman/.test(opt) ? 'I' : null;
    const tag = kind === 'itemize' ? 'ul' : 'ol';
    const lis = items.map((it) => {
      const body = unwrap(this.block(it.nodes, ctx));
      return it.label != null ? `<li class="tw-custom" data-label="${escAttr(stripTags(it.label))}">${body}</li>` : `<li>${body}</li>`;
    });
    flow.block(`<${tag}${type ? ` type="${type}"` : ''}>${lis.join('')}</${tag}>`);
  }

  tabular(n, ctx, flow) {
    const specArg = envName(n) === 'tabular*' ? n.args?.[1] : n.args?.[0];
    const cols = parseColSpec(argText(specArg));
    const rows = [];
    let row = { cells: [], above: false, below: false }, cell = [];
    let pendingRule = false;
    const endCell = () => { row.cells.push(cell); cell = []; };
    const endRow = () => {
      endCell();
      if (row.cells.some((c) => c.some((x) => x.type !== 'whitespace'))) { row.above = pendingRule; pendingRule = false; rows.push(row); }
      row = { cells: [] };
    };
    for (const node of n.content) {
      if (node.type === 'string' && node.content === '&') { endCell(); continue; }
      if (node.type === 'macro' && node.content === '\\') { endRow(); continue; }
      if (node.type === 'macro' && ['toprule', 'midrule', 'bottomrule', 'hline', 'cmidrule', 'cline'].includes(node.content)) {
        pendingRule = node.content === 'toprule' ? 'top' : node.content === 'bottomrule' ? 'bottom' : 'mid';
        continue;
      }
      cell.push(node);
    }
    endRow();
    if (pendingRule && rows.length) rows[rows.length - 1].below = pendingRule;
    const body = rows.map((r) => {
      let col = 0;
      const tds = r.cells.map((c) => {
        const mc = c.find((x) => x.type === 'macro' && x.content === 'multicolumn');
        if (mc) {
          const span = Number(argText(mc.args[0])) || 1;
          const align = parseColSpec(argText(mc.args[1]))[0] ?? 'l';
          col += span;
          return `<td colspan="${span}" class="tw-${align}">${this.inlineArg(mc.args[2], ctx)}</td>`;
        }
        const align = cols[col++] ?? 'l';
        return `<td class="tw-${align}">${this.inline(c, ctx)}</td>`;
      });
      const cls = [r.above && `rule-above-${r.above}`, r.below && `rule-below-${r.below}`].filter(Boolean).join(' ');
      return `<tr${cls ? ` class="${cls}"` : ''}>${tds.join('')}</tr>`;
    });
    flow.block(`<div class="tw-table-wrap"><table class="tw-table">${body.join('')}</table></div>`);
  }

  box(n, ctx, flow, name, def) {
    const title = hasArg(n.args?.[0]) ? this.inlineArg(n.args[0], ctx) : '';
    const id = this.newId(name);
    let num = null;
    if (def.numbered) { num = this.stepWithin(def.counter ?? name); this.setTarget(num, id, name); }
    const head = `<span class="tw-box-title">${def.title}${num ? ` ${num}` : ''}${title ? ` (${title})` : ''}.</span> `;
    let inner;
    const splitAt = def.split ? n.content.findIndex((x) => x.type === 'macro' && x.content === def.split) : -1;
    if (splitAt >= 0) {
      const left = this.block(n.content.slice(0, splitAt), ctx);
      const right = this.block(n.content.slice(splitAt + 1), ctx);
      inner = `<div class="tw-box-split"><div>${runIn(head, left)}</div><div>${right}</div></div>`;
    } else inner = runIn(head, this.block(n.content, ctx));
    flow.block(`<div class="tw-box tw-box-${def.style}" id="${id}">${inner}</div>`);
  }

  listing(n, ctx, flow, name) {
    let code = typeof n.content === 'string' ? n.content : Array.isArray(n.content) && n.content.length === 1 && n.content[0].type === 'string'
      ? n.content[0].content
      : sourceOf(ctx, n).replace(/^\\begin\{[^}]*\}(\[[^\]]*\])?/, '').replace(/\\end\{[^}]*\}$/, '');
    code = code.replace(/^\n/, '').replace(/\s+$/, '');
    const src = sourceOf(ctx, n);
    const lang = (src.match(/language=([A-Za-z+#]+)/) ?? src.match(/style=([A-Za-z]+)/) ?? [])[1];
    flow.block(`<pre class="tw-code"${lang ? ` data-lang="${escAttr(lang)}"` : ''}><code>${esc(code)}</code></pre>`);
  }

  algorithmic(n, ctx, flow) {
    const numbered = argText(n.args?.[0]).trim() !== '' && argText(n.args?.[0]).trim() !== '0';
    const lines = [];
    let depth = 0;
    let cur = null;
    const stack = [];
    const start = (kw, extraDepth = 0) => { cur = { depth: depth + extraDepth, kw, nodes: [], tail: '', comment: '' }; lines.push(cur); };
    for (const node of n.content) {
      if (node.type === 'macro') {
        const m = node.content;
        const a = node.args ?? [];
        if (m === 'State' || m === 'Statex') { start(''); continue; }
        if (m === 'Require') { start('Require:'); continue; }
        if (m === 'Ensure') { start('Ensure:'); continue; }
        if (m === 'Return') { if (!cur || cur.nodes.some((x) => x.type !== 'whitespace')) start('return'); else cur.kw += cur.kw ? ' return' : 'return'; continue; }
        if (ALGO_BLOCKS[m]) {
          const b = ALGO_BLOCKS[m];
          start(b.open);
          if (m === 'Function' || m === 'Procedure') cur.tail = `<span class="tw-sc">${this.inlineArg(a[0], ctx)}</span>(${this.inlineArg(a[1], ctx)})`;
          else if (a[0]) cur.tail = `${this.inlineArg(a[0], ctx)}${b.suffix ? ` <b>${b.suffix}</b>` : ''}`;
          stack.push(m); depth++;
          continue;
        }
        if (m === 'ElsIf' || m === 'Else') {
          start(m === 'Else' ? 'else' : 'else if', -1);
          if (m === 'ElsIf') cur.tail = `${this.inlineArg(a[0], ctx)} <b>then</b>`;
          continue;
        }
        if (ALGO_CLOSERS[m]) { depth = Math.max(0, depth - 1); stack.pop(); start(ALGO_BLOCKS[ALGO_CLOSERS[m]].end); continue; }
        if (m === 'Until') { depth = Math.max(0, depth - 1); stack.pop(); start('until'); cur.tail = this.inlineArg(a[0], ctx); continue; }
        if (m === 'Comment') { if (cur) cur.comment = this.inlineArg(a[0], ctx); continue; }
        if (m === 'Call') { (cur ?? (start(''), cur)).nodes.push({ type: 'raw', html: `<span class="tw-sc">${this.inlineArg(a[0], ctx)}</span>(${this.inlineArg(a[1], ctx)})` }); continue; }
      }
      if (!cur) { if (node.type === 'whitespace' || node.type === 'parbreak' || node.type === 'comment') continue; start(''); }
      cur.nodes.push(node);
    }
    let k = 0;
    const html = lines.map((l) => {
      const body = this.inline(l.nodes, ctx);
      const ln = numbered ? `<span class="tw-ln">${++k}</span>` : '';
      return `<div class="tw-algo-line" style="--d:${l.depth}">${ln}<span class="tw-algo-body">${l.kw ? `<b>${l.kw}</b> ` : ''}${l.tail}${body ? ` ${body}` : ''}${l.comment ? ` <span class="tw-comment">▷ ${l.comment}</span>` : ''}</span></div>`;
    });
    flow.block(`<div class="tw-algo">${html.join('')}</div>`);
  }

  // ------------------------------------------------------------------ matematica
  math(tex, display, ctx, node) {
    const opts = { displayMode: display, macros: { ...this.katexMacros }, strict: 'ignore', output: 'html' };
    try {
      return katex.renderToString(tex, { ...opts, throwOnError: true });
    } catch (e) {
      this.diag.error(ctx.file, lineOf(node), `formula: ${e.message.replace(/^KaTeX parse error: /, '')}`);
      return katex.renderToString(tex, { ...opts, throwOnError: false });
    }
  }

  displayMath(tex, ctx, node, id = '') {
    return `<div class="tw-math"${id ? ` id="${id}"` : ''}>${this.math(tex, true, ctx, node)}</div>`;
  }

  mathEnv(n, ctx, flow) {
    const name = envName(n);
    let inner = sourceOf(ctx, n).replace(/^\\begin\{[^}]*\}/, '').replace(/\\end\{[^}]*\}\s*$/, '');
    const labels = [...inner.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1]);
    inner = inner.replace(/\\label\{[^}]*\}/g, '');
    const starred = name.endsWith('*') || /\\(nonumber|notag)\b/.test(inner);
    inner = inner.replace(/\\(nonumber|notag)\b/g, '');
    const base = name.replace('*', '');
    if (base === 'align' || base === 'flalign' || base === 'eqnarray') inner = `\\begin{aligned}${inner}\\end{aligned}`;
    if (base === 'gather') inner = `\\begin{gathered}${inner}\\end{gathered}`;
    if (base === 'multline') inner = `\\begin{gathered}${inner}\\end{gathered}`;
    let id = '';
    if (!starred && base !== 'displaymath' && base !== 'math') {
      this.counters.equation++;
      const num = this.counters.chapter ? `${this.chapterLabel()}.${this.counters.equation}` : String(this.counters.equation);
      id = this.newId('eq');
      this.setTarget(num, id, 'equation');
      inner += `\\tag{${num}}`;
    }
    for (const l of labels) this.defineLabel(l, ctx, n);
    flow.block(this.displayMath(inner, ctx, n, id));
  }

  // ------------------------------------------------------------------ riferimenti e citazioni
  refPH(key, kind, ctx, node) {
    this.refs.push({ key: key.trim(), kind, file: ctx.file, line: lineOf(node) });
    return `${PH}R${this.refs.length - 1}${PH}`;
  }

  citePH(kind, n, ctx, a) {
    const keys = argText(a[2]).split(',').map((k) => k.trim()).filter(Boolean);
    const pre = hasArg(a[0]) && hasArg(a[1]) ? this.inlineArg(a[0], ctx) : '';
    const post = hasArg(a[1]) ? this.inlineArg(a[1], ctx) : hasArg(a[0]) ? this.inlineArg(a[0], ctx) : '';
    this.cites.push({ keys, kind, pre, post, file: ctx.file, line: lineOf(n) });
    return `${PH}C${this.cites.length - 1}${PH}`;
  }

  bibliography(n, ctx, flow, a) {
    const opt = argText(a?.[0]);
    const title = (opt.match(/title=\{?([^},]*)\}?/) ?? [])[1] ?? 'Bibliografia';
    if (flow instanceof PageFlow) flow.parbreak();
    this.bibPage = this.newPage({ slug: slugify(title), title: esc(title), kind: 'bibliography' });
    this.bibPage.chunks.push(`<header class="tw-chapter-head"><h1>${esc(title)}</h1></header>`, `${PH}BIB${PH}`);
    this.page = this.bibPage;
  }

  // ------------------------------------------------------------------ figure: immagini, TikZ, widget
  includegraphics(n, ctx, a) {
    let p = argText(a[1]).trim();
    if (p.startsWith('\\') && this.preamble.macros[p.slice(1)]) p = this.preamble.macros[p.slice(1)].body.trim();
    const abs = ['', '.svg', '.png', '.jpg', '.jpeg', '.pdf'].map((e) => path.resolve(this.root, p + e)).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!abs) {
      this.diag.error(ctx.file, lineOf(n), `immagine non trovata: ${p}`);
      return `<span class="tw-missing">[immagine mancante: ${esc(p)}]</span>`;
    }
    const rel = path.relative(this.root, abs).replace(/\\/g, '/');
    const out = rel.endsWith('.pdf') ? rel.replace(/\.pdf$/, '.png') : rel;
    this.media.set(abs, `media/${out}`);
    const style = sizeStyle(argText(a[0]));
    return `<img class="tw-img" src="media/${escAttr(out)}" alt=""${style ? ` style="${style}"` : ''}>`;
  }

  tikzPH(code, ctx, node) {
    const hash = crypto.createHash('sha1').update(this.preamble.raw).update(code).digest('hex').slice(0, 16);
    if (!this.tikz.has(hash)) this.tikz.set(hash, { code, file: ctx.file, line: lineOf(node) });
    return `${PH}T${hash}${PH}`;
  }

  widget(n, ctx, flow) {
    const code = sourceOf(ctx, n);
    const name = argText(n.args?.[0]).trim();
    let raw = '';
    const head = code.match(/^\\begin\{widget\}\s*\{[^}]*\}\s*/);
    if (head && code[head[0].length] === '[') raw = readBalanced(code, head[0].length, '[', ']')?.[0] ?? '';
    const def = this.widgets.get(name);
    let params = {};
    if (!def) {
      const guess = closest(name, [...this.widgets.keys()]);
      this.diag.error(ctx.file, lineOf(n), `widget sconosciuto "${name}"${guess ? ` (forse "${guess}"?)` : ''}`);
    } else {
      params = validateParams(def, raw, (msg) => this.diag.error(ctx.file, lineOf(n), msg));
      this.usedWidgets.add(name);
    }
    // la figura alternativa per il PDF è obbligatoria: è quello che vede chi legge il PDF
    const empty = n.content.every((x) => x.type === 'whitespace' || x.type === 'parbreak' || x.type === 'comment');
    if (empty) {
      this.diag.error(ctx.file, lineOf(n), `widget "${name}": manca la figura per il PDF (va tra \\begin{widget} e \\end{widget}, ad esempio un tikzpicture o un \\includegraphics)`);
    }
    const fallback = this.block(n.content, ctx);
    flow.block(`<div class="tw-widget" data-widget="${escAttr(name)}" data-params="${escAttr(JSON.stringify(params))}"><div class="tw-fallback">${fallback}</div></div>`);
  }

  // ------------------------------------------------------------------ risoluzione finale
  finalize() {
    // numeri della bibliografia: le voci citate, in ordine nome-titolo-anno come biblatex
    const cited = new Set();
    for (const c of this.cites) for (const k of c.keys) {
      if (this.bib.has(k)) cited.add(k);
      else this.diag.error(c.file, c.line, `citazione sconosciuta "${k}"`);
    }
    const order = [...cited].map((k) => this.bib.get(k)).sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
    const num = new Map(order.map((e, i) => [e.key, i + 1]));
    const bibSlug = this.bibPage?.slug ?? 'bibliografia';
    const link = (k, text) => `<a class="tw-cite" href="${bibSlug}.html#bib-${escAttr(k)}">${text}</a>`;

    const resolveRef = ({ key, kind, file, line }) => {
      const t = this.labels.get(key);
      if (!t) { this.diag.error(file, line, `riferimento a un'etichetta inesistente "${key}"`); return '<span class="tw-badref">??</span>'; }
      let text = esc(t.num);
      if (kind === 'eqref') text = `(${text})`;
      if (kind === 'auto' || kind === 'Auto') {
        const names = { figure: 'figura', table: 'tabella', algorithm: 'algoritmo', equation: 'equazione', chapter: 'capitolo', section: 'sezione', subsection: 'sezione', subsubsection: 'sezione' };
        let w = names[t.kind] ?? this.boxes[t.kind]?.title?.toLowerCase() ?? '';
        if (kind === 'Auto') w = w.charAt(0).toUpperCase() + w.slice(1);
        text = `${w} ${text}`.trim();
      }
      const href = t.id === 'top' ? `${t.page}.html` : `${t.page}.html#${t.id}`;
      return `<a class="tw-ref" href="${href}">${text}</a>`;
    };

    const resolveCite = ({ keys, kind, pre, post }) => {
      const known = keys.filter((k) => num.has(k));
      if (!known.length) return '<span class="tw-badref">[?]</span>';
      if (kind === 'title') return known.map((k) => link(k, `<em>${esc(this.bib.get(k).fields.title ?? k)}</em>`)).join(', ');
      if (kind === 'author') return known.map((k) => esc(authorShort(this.bib.get(k)))).join(', ');
      const nums = known.map((k) => link(k, num.get(k))).join(', ');
      const bracket = `[${pre ? `${pre} ` : ''}${nums}${post ? `, ${post}` : ''}]`;
      if (kind === 'textcite') return `${known.map((k) => esc(authorShort(this.bib.get(k)))).join(', ')} ${bracket}`;
      return bracket;
    };

    const bibHtml = `<ol class="tw-bib">${order.map((e) => `<li id="bib-${escAttr(e.key)}" value="${num.get(e.key)}">${formatEntry(e)}</li>`).join('')}</ol>`;

    const re = new RegExp(`${PH}(R|C|BIB)(\\d*)${PH}`, 'g');
    for (const page of this.pages) {
      const fix = (h) => h.replace(re, (_, t, i) => (t === 'R' ? resolveRef(this.refs[i]) : t === 'C' ? resolveCite(this.cites[i]) : bibHtml));
      page.chunks = page.chunks.map(fix);
      page.footnotes = page.footnotes.map(fix);
      page.title = fix(page.title);
    }
  }
}

// ---------------------------------------------------------------------- helper
function sourceOfArg(ctx, a) {
  const c = a?.content ?? [];
  if (!c.length) return '';
  const first = c[0].position, last = c[c.length - 1].position;
  if (!first || !last) return argText(a);
  return ctx.src.slice(first.start.offset, last.end.offset);
}

function containsMacro(nodes, name) {
  for (const n of nodes ?? []) {
    if (n.type === 'macro' && n.content === name) return true;
    if (Array.isArray(n.content) && containsMacro(n.content, name)) return true;
  }
  return false;
}

// il titolo di un box va all'inizio del primo paragrafo, come in tcolorbox
function runIn(head, html) {
  return html.startsWith('<p>') ? `<p>${head}${html.slice(3)}` : `<p>${head}</p>${html}`;
}

function parseColSpec(spec) {
  const cols = [];
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i];
    if ('lcr'.includes(ch)) cols.push(ch);
    else if ('pmbX'.includes(ch)) { cols.push('l'); if (spec[i + 1] === '{') i = spec.indexOf('}', i); }
    else if (ch === '@' || ch === '>' || ch === '<' || ch === '!') { if (spec[i + 1] === '{') { const g = readBalanced(spec, i + 1); i = g ? g[1] - 1 : i; } }
  }
  return cols;
}

// width=0.5\textwidth -> width:50%; height=16mm -> height:60px
function sizeStyle(opts) {
  const out = [];
  for (const part of opts.split(',')) {
    const [k, v] = part.split('=').map((x) => x?.trim());
    if (!v) continue;
    const rel = v.match(/^([\d.]*)\\(textwidth|linewidth|columnwidth)$/);
    if (rel) { out.push(`${k}:${Math.round((Number(rel[1] || 1)) * 100)}%`); continue; }
    const abs = v.match(/^([\d.]+)(cm|mm|in|pt)$/);
    if (abs) {
      const px = Number(abs[1]) * { cm: 37.8, mm: 3.78, in: 96, pt: 1.33 }[abs[2]];
      out.push(`${k === 'height' ? 'height' : 'width'}:${Math.round(px)}px`);
    }
    if (k === 'scale') out.push(`zoom:${v}`);
  }
  if (out.some((s) => s.startsWith('width'))) out.push('height:auto');
  return out.join(';');
}
