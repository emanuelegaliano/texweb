import fs from 'node:fs';
import { getParser } from '@unified-latex/unified-latex-util-parse';
import { MACRO_SIGNATURES, ENV_SIGNATURES } from './dialect.js';

// a parsed source file: the tree, the original text and the file name (for errors)
// extra: additional signatures { macros, envs } (preamble macros, configured boxes)
export function parseFile(file, extra = {}) {
  const src = fs.readFileSync(file, 'utf8');
  return parseString(src, file, extra);
}

export function parseString(src, file, extra = {}) {
  const macros = {};
  for (const [name, signature] of Object.entries({ ...MACRO_SIGNATURES, ...extra.macros })) macros[name] = { signature };
  const environments = {};
  for (const [name, signature] of Object.entries({ ...ENV_SIGNATURES, ...extra.envs })) environments[name] = { signature };
  const ast = getParser({ macros, environments }).parse(src);
  return { ast, src, file };
}

// original text of a node (for environments the position covers everything, \begin ... \end included)
export const sourceOf = (ctx, node) =>
  node.position ? ctx.src.slice(node.position.start.offset, node.position.end.offset) : '';

export const lineOf = (node) => node?.position?.start?.line ?? 0;

// plain text of an argument (names, keys, paths)
export function argText(arg) {
  if (!arg) return '';
  return (arg.content ?? []).map(nodeText).join('');
}

export function nodeText(n) {
  if (!n) return '';
  if (n.type === 'string') return n.content;
  if (n.type === 'whitespace') return ' ';
  if (n.type === 'group') return n.content.map(nodeText).join('');
  if (n.type === 'macro') return `\\${n.content}${(n.args ?? []).map((a) => a.openMark + argText(a) + a.closeMark).join('')}`;
  return '';
}

export const hasArg = (arg) => arg && (arg.openMark !== '' || (arg.content?.length ?? 0) > 0);

// i-th argument, following the signature ("s o m": 0 star, 1 optional, 2 mandatory)
export const arg = (node, i) => node.args?.[i];

export const envName = (n) => (typeof n.env === 'string' ? n.env : n.env?.content ?? '');

export const isStar = (n) => argText(n.args?.[0]) === '*';
