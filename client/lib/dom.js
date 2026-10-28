// piccoli helper per costruire DOM e SVG senza framework

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(node, attrs, children) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.setAttribute('class', v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [children ?? []].flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const h = (tag, attrs, children) => apply(document.createElement(tag), attrs, children);
export const s = (tag, attrs, children) => apply(document.createElementNS(SVG_NS, tag), attrs, children);

export function svgRoot(width, height, attrs = {}) {
  // non oltre ~1.4 volte la dimensione nominale, altrimenti su schermi larghi le figure diventano enormi
  return s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'fig-svg', role: 'img', style: { maxWidth: `${Math.round(width * 1.4)}px` }, ...attrs });
}

// colore di una cella in funzione del valore, come nelle figure del PDF:
// più il valore è alto più la cella è scura (in dark mode si inverte da sola)
export function shade(v, max = 10) {
  const t = Math.max(0, Math.min(1, v / max));
  return {
    fill: `color-mix(in oklab, var(--ink) ${Math.round(t * 80)}%, var(--surface))`,
    text: t > 0.55 ? 'var(--surface)' : 'var(--ink)',
  };
}

// formatta un numero con il segno meno tipografico
export const fmt = (v, digits = 0) => {
  const r = Number.isInteger(v) ? String(v) : v.toFixed(digits || 2).replace(/\.?0+$/, '');
  return r.replace('-', '−');
};

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
