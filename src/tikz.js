import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// texweb.sty is found even when the project has no copy of it
const LATEX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'latex');
const texEnv = () => ({ ...process.env, TEXINPUTS: `${LATEX_DIR}${path.delimiter}${process.env.TEXINPUTS ?? ''}` });

// Every tikzpicture is compiled by real LaTeX with the document's own preamble:
// same class, same colors, same macros (\numgrid, \cellrect, ...). The preview package
// crops the page around the figure, then dvisvgm converts it to SVG.
// It goes through DVI (latex with the dvisvgm class option) rather than PDF, so dvisvgm
// needs neither Ghostscript nor mutool, and PNG images inside TikZ get embedded.
// Results are cached, keyed by the hash of preamble + code.

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ code: -1, out: String(e) }));
    p.on('close', (code) => resolve({ code, out }));
  });
}

// first error line of the LaTeX log, with some context
function texError(log) {
  const i = log.indexOf('\n! ');
  if (i < 0) return 'compilation failed';
  return log.slice(i + 1).split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
}

export function tikzDocument(preamble, code) {
  const body = preamble.raw.replace(/\\documentclass(\[[^\]]*\])?\{[^}]*\}/, '');
  // the global dvisvgm option makes graphicx, xcolor and TikZ use the right driver
  const cls = preamble.classLine.replace(/\\documentclass(\[([^\]]*)\])?/, (_, __, o) => `\\documentclass[dvisvgm${o ? `,${o}` : ''}]`);
  return [
    cls,
    body,
    '\\usepackage[active,tightpage]{preview}',
    '\\PreviewEnvironment{tikzpicture}',
    '\\setlength\\PreviewBorder{2pt}',
    '\\pagestyle{empty}',
    '\\begin{document}',
    code,
    '\\end{document}',
  ].join('\n');
}

const DVI_ENGINE = { pdflatex: 'latex', latex: 'latex', lualatex: 'dvilualatex', xelatex: 'xelatex' };

async function compileOne({ hash, code }, { preamble, root, cacheDir, engine }) {
  const out = path.join(cacheDir, `${hash}.svg`);
  if (fs.existsSync(out)) return { ok: true, file: out };
  const work = fs.mkdtempSync(path.join(cacheDir, 'job-'));
  try {
    fs.writeFileSync(path.join(work, 'fig.tex'), tikzDocument(preamble, code));
    // compile from the project folder, so \includegraphics{images/...} works
    const xe = engine === 'xelatex';
    const args = ['-interaction=nonstopmode', '-halt-on-error', `-output-directory=${work}`, ...(xe ? ['-no-pdf'] : []), path.join(work, 'fig.tex')];
    const tex = await run(DVI_ENGINE[engine] ?? 'latex', args, { cwd: root, env: texEnv() });
    if (tex.code !== 0) return { ok: false, error: texError(tex.out) };
    const dvi = path.join(work, xe ? 'fig.xdv' : 'fig.dvi');
    const svg = await run('dvisvgm', ['--no-fonts', '--exact-bbox', '--embed-bitmaps', '-o', out, dvi], { cwd: root });
    if (svg.code !== 0 || !fs.existsSync(out)) return { ok: false, error: `dvisvgm: ${svg.out.split('\n').filter(Boolean).pop()}` };
    return { ok: true, file: out };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export async function compileTikz(jobs, opts) {
  fs.mkdirSync(opts.cacheDir, { recursive: true });
  const queue = [...jobs.entries()].map(([hash, job]) => ({ hash, ...job }));
  const results = new Map();
  const todo = queue.filter((j) => !fs.existsSync(path.join(opts.cacheDir, `${j.hash}.svg`)));
  if (todo.length) opts.onStart?.(todo.length);
  const workers = Math.max(1, Math.min(todo.length, Math.floor(os.cpus().length / 2)));
  let next = 0, done = 0;
  for (const j of queue) if (!todo.includes(j)) results.set(j.hash, { ok: true, file: path.join(opts.cacheDir, `${j.hash}.svg`) });
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < todo.length) {
      const j = todo[next++];
      results.set(j.hash, await compileOne(j, opts));
      opts.onProgress?.(++done, todo.length);
    }
  }));
  return results;
}

// PDF images included with \includegraphics become high-resolution PNGs via Ghostscript
export async function pdfToPng(src, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return true;
  const r = await run('gs', ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pngalpha', '-r220', '-dFirstPage=1', '-dLastPage=1', `-sOutputFile=${out}`, src], {});
  return r.code === 0;
}
