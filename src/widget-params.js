import { closest } from './diagnostics.js';

// opzioni in stile LaTeX: "kernel=sharpen, autoplay, values={{1,2},{3,4}}"
export function splitKeyval(raw) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean).map((s) => {
    const eq = s.indexOf('=');
    return eq < 0 ? { key: s, value: null } : { key: s.slice(0, eq).trim(), value: s.slice(eq + 1).trim() };
  });
}

const unbrace = (s) => (s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s);

// lista annidata: "{{1,2},{3,4}}" -> [[1,2],[3,4]]; i numeri restano numeri
function parseList(s) {
  s = unbrace(s.trim());
  const items = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items.map((it) => (it.startsWith('{') ? parseList(it) : scalar(it)));
}

const scalar = (s) => (s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s);

// tipi dei parametri: number, integer, boolean, string, enum, list, matrix, json
function coerce(spec, value) {
  const v = value == null ? null : unbrace(value);
  switch (spec.type) {
    case 'boolean':
      if (v == null || v === 'true') return [true];
      if (v === 'false') return [false];
      return [null, `atteso true o false, trovato "${v}"`];
    case 'number':
    case 'integer': {
      const n = Number(v);
      if (v == null || Number.isNaN(n)) return [null, `atteso un numero, trovato "${v ?? ''}"`];
      if (spec.type === 'integer' && !Number.isInteger(n)) return [null, `atteso un intero, trovato ${n}`];
      if (spec.min != null && n < spec.min) return [null, `deve essere almeno ${spec.min}`];
      if (spec.max != null && n > spec.max) return [null, `deve essere al massimo ${spec.max}`];
      return [n];
    }
    case 'enum':
      if (!spec.values.includes(v)) return [null, `valori ammessi: ${spec.values.join(', ')}`];
      return [v];
    case 'list':
    case 'matrix': {
      if (v == null) return [null, 'serve un valore'];
      const list = parseList(`{${v}}`);
      if (spec.type === 'matrix' && !list.every(Array.isArray)) return [null, 'attesa una matrice, ad esempio {{1,2},{3,4}}'];
      return [list];
    }
    case 'json':
      try { return [JSON.parse(v)]; } catch (e) { return [null, `JSON non valido: ${e.message}`]; }
    default:
      return [v ?? ''];
  }
}

// confronta le opzioni scritte nel .tex con i parametri dichiarati dal componente
export function validateParams(def, raw, report) {
  const params = {};
  const specs = def.params ?? {};
  const seen = new Set();
  for (const { key, value } of splitKeyval(raw)) {
    const spec = specs[key];
    if (!spec) {
      const guess = closest(key, Object.keys(specs));
      report(`widget "${def.name}": parametro sconosciuto "${key}"${guess ? ` (forse "${guess}"?)` : ''}`);
      continue;
    }
    const [val, err] = coerce(spec, value);
    if (err) report(`widget "${def.name}", parametro "${key}": ${err}`);
    else params[key] = val;
    seen.add(key);
  }
  for (const [key, spec] of Object.entries(specs)) {
    if (seen.has(key)) continue;
    if (spec.required) report(`widget "${def.name}": manca il parametro obbligatorio "${key}"`);
    else if (spec.default !== undefined) params[key] = spec.default;
  }
  return params;
}
