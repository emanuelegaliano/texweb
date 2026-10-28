import { s, fmt } from './dom.js';

// a grid of SVG cells (the equivalent of \numgrid in the LaTeX preamble).
// values: matrix of numbers/strings, or null for an empty rows x cols grid.
export function grid({ x = 0, y = 0, size = 32, values, rows, cols, cls = '', fontSize }) {
  rows = values ? values.length : rows;
  cols = values ? values[0].length : cols;
  const g = s('g', { class: `grid ${cls}`, transform: `translate(${x},${y})` });
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const rect = s('rect', { x: c * size, y: r * size, width: size, height: size, class: 'cell' });
      const text = s('text', {
        x: c * size + size / 2,
        y: r * size + size / 2,
        class: 'cell-text',
        'font-size': fontSize ?? Math.round(size * 0.42),
      });
      const v = values?.[r][c];
      if (v != null) text.textContent = typeof v === 'number' ? fmt(v) : v;
      g.append(rect, text);
      row.push({ rect, text });
    }
    cells.push(row);
  }
  return { g, cells, rows, cols, size, x, y };
}

// a rectangle highlighting a block of cells (the equivalent of \cellrect).
// it moves through a CSS transition on transform, so the animation is smooth.
export function windowRect({ size, w = 1, h = 1, cls = 'win' }) {
  const rect = s('rect', { width: w * size, height: h * size, class: cls, rx: 3 });
  const g = s('g', { class: 'win-g' }, rect);
  return {
    g,
    rect,
    move(col, row) { g.style.transform = `translate(${col * size}px, ${row * size}px)`; },
    resize(nw, nh) { rect.setAttribute('width', nw * size); rect.setAttribute('height', nh * size); },
  };
}

export const label = (x, y, text, cls = 'label', anchor = 'middle') =>
  s('text', { x, y, class: cls, style: { textAnchor: anchor } }, text);
