import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitKeyval, validateParams } from '../src/widget-params.js';
import { readPreamble } from '../src/preamble.js';
import { parseBib } from '../src/bib.js';
import { Diagnostics } from '../src/diagnostics.js';
import { Renderer } from '../src/render.js';
import { detectLang } from '../src/locale.js';

// renders a minimal document and returns the pages and the diagnostics
function render(body, { preamble = '', bib = '', widgets = new Map(), lang = 'en' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texweb-'));
  const main = path.join(dir, 'main.tex');
  const src = `\\documentclass{book}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;
  fs.writeFileSync(main, src);
  const diag = new Diagnostics(dir);
  const r = new Renderer({ root: dir, preamble: readPreamble(src), diag, bib: parseBib(bib), widgets, config: { lang, katexMacros: {} } });
  r.renderDocument(main);
  const html = r.pages.map((p) => p.chunks.join('\n')).join('\n');
  return { r, diag, html };
}

test('LaTeX-style widget options', () => {
  assert.deepEqual(splitKeyval('a=1, b, m={{1,2},{3,4}}'), [
    { key: 'a', value: '1' }, { key: 'b', value: null }, { key: 'm', value: '{{1,2},{3,4}}' },
  ]);
  const errors = [];
  const def = { name: 'w', params: { n: { type: 'integer', min: 1 }, on: { type: 'boolean', default: false }, m: { type: 'matrix', required: true } } };
  const p = validateParams(def, 'n=3, on, m={{1,2},{3,4}}', (e) => errors.push(e));
  assert.deepEqual(p, { n: 3, on: true, m: [[1, 2], [3, 4]] });
  assert.deepEqual(errors, []);
  validateParams(def, 'n=0, nn=2', (e) => errors.push(e));
  assert.equal(errors.length, 3); // n below the minimum, nn unknown, m missing
  assert.match(errors[1], /did you mean "n"/);
});

test('preamble macros and colors', () => {
  const p = readPreamble('\\documentclass{book}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norm}[1]{\\|#1\\|}\n\\definecolor{Accent}{HTML}{0B3A3E}\n\\addbibresource{refs.bib}\n\\begin{document}');
  assert.equal(p.macros.R.body, '\\mathbb{R}');
  assert.equal(p.macros.norm.nargs, 1);
  assert.equal(p.colors.Accent, '#0b3a3e');
  assert.deepEqual(p.bibFiles, ['refs.bib']);
});

test('language detection from babel and polyglossia', () => {
  assert.equal(detectLang('\\usepackage[italian]{babel}'), 'it');
  assert.equal(detectLang('\\usepackage[italian,english]{babel}'), 'en');
  assert.equal(detectLang('\\setdefaultlanguage{italian}'), 'it');
  assert.equal(detectLang('\\usepackage{amsmath}'), 'en');
});

test('chapters, sections, equations and references numbered as in the PDF', () => {
  const { html, diag } = render(String.raw`
\chapter{First}\label{ch:a}
\section{Section}\label{sec:a}
\begin{equation}\label{eq:a} x = 1 \end{equation}
\begin{figure}\centering x \caption{A figure}\label{fig:a}\end{figure}
See \ref{ch:a}, \ref{sec:a}, \eqref{eq:a} and \ref{fig:a}.`);
  assert.deepEqual(diag.items, []);
  assert.match(html, /Figure 1\.1\./);
  assert.match(html, /Chapter 1/);
  assert.match(html, />1<\/a>, <a class="tw-ref" href="first\.html#s-1-1">1\.1<\/a>, <a class="tw-ref" href="first\.html#eq-\d+">\(1\.1\)<\/a>/);
});

test('Italian notes keep Italian labels, and Italian box names work', () => {
  const { html } = render('\\chapter{Primo}\n\\begin{definizione}[Loss] x \\end{definizione}\n\\begin{figure}x\\caption{Una figura}\\end{figure}', { lang: 'it' });
  assert.match(html, /Capitolo 1/);
  assert.match(html, /Definizione 1\.1 \(Loss\)\./);
  assert.match(html, /Figura 1\.1\./);
});

test('unknown commands reported with file and line', () => {
  const { diag } = render('\\chapter{A}\nText\n\\madeUpCommand{x}');
  assert.equal(diag.errors.length, 1);
  assert.equal(diag.errors[0].line, 6); // line 1 \documentclass, 3 \begin{document}
  assert.match(diag.errors[0].message, /unknown command \\madeUpCommand/);
});

test('numeric citations and bibliography', () => {
  const bib = '@book{B, title={Beta}, author={Zeta, Anna}, year={2020}}\n@book{A, title={Alpha}, author={Alpha, Bruno}, year={2019}}';
  const { html } = render('\\chapter{A}\n\\cite{B} and \\cite{A}\n\\printbibliography', { bib });
  // name-title-year order: Alpha (1) before Zeta (2)
  assert.match(html, /#bib-B">2<\/a>\]/);
  assert.match(html, /#bib-A">1<\/a>\]/);
});

test('widget: validated parameters and static version kept', () => {
  const widgets = new Map([['demo', { name: 'demo', params: { k: { type: 'number', default: 2 } }, mount() {} }]]);
  const { html, diag } = render('\\chapter{A}\n\\begin{widget}{demo}[k=5]\nstatic text\n\\end{widget}', { widgets });
  assert.deepEqual(diag.items, []);
  assert.match(html, /data-widget="demo" data-params="\{&quot;k&quot;:5\}"/);
  assert.match(html, /<div class="tw-fallback"><p>static text<\/p><\/div>/);
});

test('widget without a PDF figure: error with file and line', () => {
  const widgets = new Map([['demo', { name: 'demo', params: {}, mount() {} }]]);
  const { diag } = render('\\chapter{A}\n\\begin{widget}{demo}\n  % just a comment\n\\end{widget}', { widgets });
  assert.equal(diag.errors.length, 1);
  assert.equal(diag.errors[0].line, 5);
  assert.match(diag.errors[0].message, /missing PDF figure/);
});

test('texweb/client can be imported in Node (widget definitions are read at build time)', async () => {
  const client = await import('../client/index.js');
  assert.equal(typeof client.defineWidget, 'function');
  assert.deepEqual(client.SPEEDS, [0.5, 1, 2]);
});

test('GitHub repository from the config or the git remote', async () => {
  const { githubRepo } = await import('../src/site.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texweb-'));
  assert.equal(githubRepo(dir, {}), null);
  assert.equal(githubRepo(dir, { repository: 'me/notes' }), 'me/notes');
  assert.equal(githubRepo(dir, { repository: 'https://github.com/me/notes.git' }), 'me/notes');
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:me/other.git\n\tfetch = +refs/heads/*\n');
  assert.equal(githubRepo(dir, {}), 'me/other');
  assert.equal(githubRepo(dir, { repository: false }), null);
});
