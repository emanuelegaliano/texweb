// small helpers to build DOM and SVG without a framework

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
  // no more than ~1.4 times the nominal size, otherwise figures become huge on wide screens
  return s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'fig-svg', role: 'img', style: { maxWidth: `${Math.round(width * 1.4)}px` }, ...attrs });
}

// cell color as a function of its value, as in the PDF figures:
// the higher the value the darker the cell (it inverts by itself in dark mode)
export function shade(v, max = 10) {
  const t = Math.max(0, Math.min(1, v / max));
  return {
    fill: `color-mix(in oklab, var(--ink) ${Math.round(t * 80)}%, var(--surface))`,
    text: t > 0.55 ? 'var(--surface)' : 'var(--ink)',
  };
}

// formats a number with a typographic minus sign
export const fmt = (v, digits = 0) => {
  const r = Number.isInteger(v) ? String(v) : v.toFixed(digits || 2).replace(/\.?0+$/, '');
  return r.replace('-', '−');
};

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
