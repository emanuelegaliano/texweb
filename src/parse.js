import fs from 'node:fs';
import { getParser } from '@unified-latex/unified-latex-util-parse';
import { MACRO_SIGNATURES, ENV_SIGNATURES } from './dialect.js';

// un file sorgente analizzato: l'albero, il testo originale e il nome, per gli errori
// extra: firme aggiuntive { macros, envs } (macro del preambolo, box configurati)
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

// testo originale di un nodo (per gli ambienti la posizione copre tutto, \begin ... \end compresi)
export const sourceOf = (ctx, node) =>
  node.position ? ctx.src.slice(node.position.start.offset, node.position.end.offset) : '';

export const lineOf = (node) => node?.position?.start?.line ?? 0;

// testo semplice di un argomento (nomi, chiavi, percorsi)
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

// argomento i-esimo, saltando quelli di altri tipi ("s o m": 0 asterisco, 1 facoltativo, 2 obbligatorio)
export const arg = (node, i) => node.args?.[i];

export const envName = (n) => (typeof n.env === 'string' ? n.env : n.env?.content ?? '');

export const isStar = (n) => argText(n.args?.[0]) === '*';
