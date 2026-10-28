// Lettura del preambolo: macro (per KaTeX e per il testo), colori, bibliografia, metadati.
// Si legge il testo con un piccolo scanner a graffe: il preambolo è pieno di TikZ e
// tcolorbox che non serve capire, basta riconoscere le definizioni.

// legge un gruppo bilanciato che inizia in src[i] (open = '{' o '['); restituisce [contenuto, indice dopo]
export function readBalanced(src, i, open = '{', close = '}', { comments = true } = {}) {
  if (src[i] !== open) return null;
  let depth = 0, brace = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\\') { j++; continue; }
    if (comments && ch === '%') { const nl = src.indexOf('\n', j); j = nl < 0 ? src.length : nl; continue; }
    if (open === '{') {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return [src.slice(i + 1, j), j + 1];
    } else if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (brace === 0 && ch === open) depth++;
    else if (brace === 0 && ch === close && --depth === 0) return [src.slice(i + 1, j), j + 1];
  }
  return null;
}

const skipWs = (src, i) => { while (i < src.length && /\s/.test(src[i])) i++; return i; };

// toglie i commenti (ma non \%)
export const stripComments = (s) => s.replace(/(^|[^\\])%.*$/gm, '$1');

export function readPreamble(mainSrc) {
  const begin = mainSrc.indexOf('\\begin{document}');
  const raw = begin >= 0 ? mainSrc.slice(0, begin) : '';
  const src = stripComments(raw);
  const classLine = (src.match(/\\documentclass(\[[^\]]*\])?\{[^}]*\}/) ?? ['\\documentclass{article}'])[0];

  const macros = {};       // nome -> { nargs, default, body }
  const colors = {};       // nome -> '#rrggbb'
  const bibFiles = [];
  const meta = {};

  const re = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|DeclareRobustCommand|definecolor|addbibresource|bibliography|title|author|date)(\*?)/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipWs(src, re.lastIndex);
    const kind = m[1];
    if (kind === 'definecolor') {
      const name = readBalanced(src, i); if (!name) continue;
      const model = readBalanced(src, skipWs(src, name[1])); if (!model) continue;
      const value = readBalanced(src, skipWs(src, model[1])); if (!value) continue;
      const hex = colorToHex(model[0].trim(), value[0].trim());
      if (hex) colors[name[0].trim()] = hex;
      continue;
    }
    if (kind === 'addbibresource' || kind === 'bibliography') {
      if (src[i] === '[') { const o = readBalanced(src, i, '[', ']'); if (o) i = skipWs(src, o[1]); }
      const f = readBalanced(src, i);
      if (f) for (const part of f[0].split(',')) bibFiles.push(part.trim());
      continue;
    }
    if (kind === 'title' || kind === 'author' || kind === 'date') {
      const g = readBalanced(src, i);
      if (g) meta[kind] = g[0].trim();
      continue;
    }
    // nome della macro: {\nome} oppure \nome
    let name;
    if (src[i] === '{') {
      const g = readBalanced(src, i); if (!g) continue;
      name = g[0].trim().replace(/^\\/, ''); i = skipWs(src, g[1]);
    } else {
      const nm = src.slice(i).match(/^\\([a-zA-Z@]+)/); if (!nm) continue;
      name = nm[1]; i = skipWs(src, i + nm[0].length);
    }
    if (kind === 'DeclareMathOperator') {
      const g = readBalanced(src, i); if (!g) continue;
      macros[name] = { nargs: 0, body: `\\operatorname${m[2]}{${g[0]}}`, mathOnly: true };
      continue;
    }
    let nargs = 0, def;
    if (src[i] === '[') { const g = readBalanced(src, i, '[', ']'); if (g) { nargs = Number(g[0]) || 0; i = skipWs(src, g[1]); } }
    if (src[i] === '[') { const g = readBalanced(src, i, '[', ']'); if (g) { def = g[0]; i = skipWs(src, g[1]); } }
    const body = readBalanced(src, i); if (!body) continue;
    if (kind === 'providecommand' && macros[name]) continue;
    macros[name] = { nargs, default: def, body: body[0] };
  }

  return { raw, classLine, macros, colors, bibFiles, meta };
}

function colorToHex(model, value) {
  if (model === 'HTML') return `#${value.toLowerCase()}`;
  if (model === 'RGB') { const [r, g, b] = value.split(',').map(Number); return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`; }
  if (model === 'rgb') { const [r, g, b] = value.split(',').map((x) => Math.round(Number(x) * 255)); return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`; }
  if (model === 'gray') { const v = Math.round(Number(value) * 255).toString(16).padStart(2, '0'); return `#${v}${v}${v}`; }
  return null;
}

// macro per KaTeX: solo quelle che hanno senso in matematica (niente TikZ, colori di pagina, ecc.)
export function katexMacros(macros) {
  const out = {};
  for (const [name, { nargs, body }] of Object.entries(macros)) {
    if (/\\(foreach|node|draw|tikz|pgf|begin\{tikzpicture|newtcolorbox|def\\|edef|makeatletter|fill)/.test(body)) continue;
    out[`\\${name}`] = nargs ? body : body;
  }
  return out;
}
