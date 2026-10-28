import { s, fmt } from './dom.js';

// griglia di celle in SVG (l'equivalente di \numgrid nel preambolo LaTeX).
// values: matrice di numeri/stringhe, oppure null per una griglia vuota rows x cols.
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

// rettangolo che evidenzia un blocco di celle (l'equivalente di \cellrect).
// si sposta con una transizione CSS sul transform, così l'animazione è fluida.
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
