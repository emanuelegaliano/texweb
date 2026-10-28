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

// rende un documento minimo e restituisce le pagine e i messaggi
function render(body, { preamble = '', bib = '', widgets = new Map() } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texweb-'));
  const main = path.join(dir, 'main.tex');
  const src = `\\documentclass{book}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;
  fs.writeFileSync(main, src);
  const diag = new Diagnostics(dir);
  const r = new Renderer({ root: dir, preamble: readPreamble(src), diag, bib: parseBib(bib), widgets, config: { katexMacros: {} } });
  r.renderDocument(main);
  const html = r.pages.map((p) => p.chunks.join('\n')).join('\n');
  return { r, diag, html };
}

test('opzioni dei widget in stile LaTeX', () => {
  assert.deepEqual(splitKeyval('a=1, b, m={{1,2},{3,4}}'), [
    { key: 'a', value: '1' }, { key: 'b', value: null }, { key: 'm', value: '{{1,2},{3,4}}' },
  ]);
  const errors = [];
  const def = { name: 'w', params: { n: { type: 'integer', min: 1 }, on: { type: 'boolean', default: false }, m: { type: 'matrix', required: true } } };
  const p = validateParams(def, 'n=3, on, m={{1,2},{3,4}}', (e) => errors.push(e));
  assert.deepEqual(p, { n: 3, on: true, m: [[1, 2], [3, 4]] });
  assert.deepEqual(errors, []);
  validateParams(def, 'n=0, nn=2', (e) => errors.push(e));
  assert.equal(errors.length, 3); // n sotto il minimo, nn sconosciuto, m mancante
  assert.match(errors[1], /forse "n"/);
});

test('macro e colori del preambolo', () => {
  const p = readPreamble('\\documentclass{book}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norm}[1]{\\|#1\\|}\n\\definecolor{Accent}{HTML}{0B3A3E}\n\\addbibresource{refs.bib}\n\\begin{document}');
  assert.equal(p.macros.R.body, '\\mathbb{R}');
  assert.equal(p.macros.norm.nargs, 1);
  assert.equal(p.colors.Accent, '#0b3a3e');
  assert.deepEqual(p.bibFiles, ['refs.bib']);
});

test('capitoli, sezioni, equazioni e riferimenti numerati come nel PDF', () => {
  const { html, diag } = render(String.raw`
\chapter{Primo}\label{ch:a}
\section{Sezione}\label{sec:a}
\begin{equation}\label{eq:a} x = 1 \end{equation}
\begin{figure}\centering x \caption{Una figura}\label{fig:a}\end{figure}
Vedi \ref{ch:a}, \ref{sec:a}, \eqref{eq:a} e \ref{fig:a}.`);
  assert.deepEqual(diag.items, []);
  assert.match(html, /Figura 1\.1\./);
  assert.match(html, /\\tag\{1\.1\}|1\.1<\/span>/);
  assert.match(html, />1<\/a>, <a class="tw-ref" href="primo\.html#s-1-1">1\.1<\/a>, <a class="tw-ref" href="primo\.html#eq-\d+">\(1\.1\)<\/a>/);
});

test('comandi sconosciuti segnalati con file e riga', () => {
  const { diag } = render('\\chapter{A}\nTesto\n\\comandoInventato{x}');
  assert.equal(diag.errors.length, 1);
  assert.equal(diag.errors[0].line, 6); // riga 1 \documentclass, 3 \begin{document}
  assert.match(diag.errors[0].message, /comando sconosciuto \\comandoInventato/);
});

test('citazioni numeriche e bibliografia', () => {
  const bib = '@book{B, title={Beta}, author={Zeta, Anna}, year={2020}}\n@book{A, title={Alfa}, author={Alfa, Bruno}, year={2019}}';
  const { html } = render('\\chapter{A}\n\\cite{B} e \\cite{A}\n\\printbibliography', { bib });
  // ordine nome-titolo-anno: Alfa (1) prima di Zeta (2)
  assert.match(html, /#bib-B">2<\/a>\]/);
  assert.match(html, /#bib-A">1<\/a>\]/);
});

test('widget: parametri validati e versione statica conservata', () => {
  const widgets = new Map([['demo', { name: 'demo', params: { k: { type: 'number', default: 2 } }, mount() {} }]]);
  const { html, diag } = render('\\chapter{A}\n\\begin{widget}{demo}[k=5]\ntesto statico\n\\end{widget}', { widgets });
  assert.deepEqual(diag.items, []);
  assert.match(html, /data-widget="demo" data-params="\{&quot;k&quot;:5\}"/);
  assert.match(html, /<div class="tw-fallback"><p>testo statico<\/p><\/div>/);
});

test('texweb/client si importa anche in Node (le definizioni dei widget si leggono in build)', async () => {
  const client = await import('../client/index.js');
  assert.equal(typeof client.defineWidget, 'function');
  assert.deepEqual(client.SPEEDS, [0.5, 1, 2]);
});

test('widget senza figura per il PDF: errore con file e riga', () => {
  const widgets = new Map([['demo', { name: 'demo', params: {}, mount() {} }]]);
  const { diag } = render('\\chapter{A}\n\\begin{widget}{demo}\n  % solo un commento\n\\end{widget}', { widgets });
  assert.equal(diag.errors.length, 1);
  assert.equal(diag.errors[0].line, 5);
  assert.match(diag.errors[0].message, /manca la figura per il PDF/);
});
