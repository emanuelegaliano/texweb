import { closest } from './diagnostics.js';

// LaTeX-style options: "kernel=sharpen, autoplay, values={{1,2},{3,4}}"
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

// nested list: "{{1,2},{3,4}}" -> [[1,2],[3,4]]; numbers stay numbers
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

// parameter types: number, integer, boolean, string, enum, list, matrix, json
function coerce(spec, value) {
  const v = value == null ? null : unbrace(value);
  switch (spec.type) {
    case 'boolean':
      if (v == null || v === 'true') return [true];
      if (v === 'false') return [false];
      return [null, `expected true or false, got "${v}"`];
    case 'number':
    case 'integer': {
      const n = Number(v);
      if (v == null || Number.isNaN(n)) return [null, `expected a number, got "${v ?? ''}"`];
      if (spec.type === 'integer' && !Number.isInteger(n)) return [null, `expected an integer, got ${n}`];
      if (spec.min != null && n < spec.min) return [null, `must be at least ${spec.min}`];
      if (spec.max != null && n > spec.max) return [null, `must be at most ${spec.max}`];
      return [n];
    }
    case 'enum':
      if (!spec.values.includes(v)) return [null, `allowed values: ${spec.values.join(', ')}`];
      return [v];
    case 'list':
    case 'matrix': {
      if (v == null) return [null, 'a value is required'];
      const list = parseList(`{${v}}`);
      if (spec.type === 'matrix' && !list.every(Array.isArray)) return [null, 'expected a matrix, e.g. {{1,2},{3,4}}'];
      return [list];
    }
    case 'json':
      try { return [JSON.parse(v)]; } catch (e) { return [null, `invalid JSON: ${e.message}`]; }
    default:
      return [v ?? ''];
  }
}

// checks the options written in the .tex against the parameters declared by the widget
export function validateParams(def, raw, report) {
  const params = {};
  const specs = def.params ?? {};
  const seen = new Set();
  for (const { key, value } of splitKeyval(raw)) {
    const spec = specs[key];
    if (!spec) {
      const guess = closest(key, Object.keys(specs));
      report(`widget "${def.name}": unknown parameter "${key}"${guess ? ` (did you mean "${guess}"?)` : ''}`);
      continue;
    }
    const [val, err] = coerce(spec, value);
    if (err) report(`widget "${def.name}", parameter "${key}": ${err}`);
    else params[key] = val;
    seen.add(key);
  }
  for (const [key, spec] of Object.entries(specs)) {
    if (seen.has(key)) continue;
    if (spec.required) report(`widget "${def.name}": missing required parameter "${key}"`);
    else if (spec.default !== undefined) params[key] = spec.default;
  }
  return params;
}
