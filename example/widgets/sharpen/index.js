import katex from 'katex';
import { defineWidget, h, s, svgRoot, shade, fmt, grid, windowRect, label, createPlayer } from 'texweb/client';

// a kernel sliding over a small image, one position at a time

export default defineWidget({
  name: 'sharpen',
  params: {
    input: { type: 'matrix', required: true },
    kernel: { type: 'matrix', required: true },
    interval: { type: 'number', default: 1200, min: 200 },
    autoplay: { type: 'boolean', default: true },
  },

  mount(root, { input, kernel, interval, autoplay }) {
    const H = input.length, W = input[0].length;
    const kh = kernel.length, kw = kernel[0].length;
    const OH = H - kh + 1, OW = W - kw + 1;
    const max = Math.max(...input.flat());
    const conv = (i, j) => {
      let acc = 0;
      for (let u = 0; u < kh; u++) for (let v = 0; v < kw; v++) acc += kernel[u][v] * input[i + u][j + v];
      return acc;
    };

    const C = 40, gap = 46;
    const kx = 10 + W * C + gap, ox = kx + kw * C + gap;
    const top = 34, ky = top + ((H - kh) * C) / 2;
    const svg = svgRoot(ox + OW * C + 10, top + H * C + 10, { 'aria-label': `A ${kh}×${kw} kernel slides over a ${H}×${W} image` });

    const inp = grid({ x: 10, y: top, size: C, values: input });
    inp.cells.forEach((row, r) => row.forEach((cell, c) => {
      const { fill, text } = shade(input[r][c], max);
      cell.rect.style.fill = fill; cell.text.style.fill = text;
    }));
    const subs = input.map((row, r) => row.map((_, c) =>
      s('text', { x: 10 + c * C + C - 4, y: top + r * C + C - 5, class: 'sub', 'text-anchor': 'end' })));
    const win = windowRect({ size: C, w: kw, h: kh, cls: 'win hot' });
    const ker = grid({ x: kx, y: ky, size: C, values: kernel, cls: 'g-kernel' });
    const out = grid({ x: ox, y: ky, size: C, rows: OH, cols: OW, cls: 'g-output' });
    const owin = windowRect({ size: C, cls: 'win hot' });

    svg.append(
      label(10 + (W * C) / 2, 22, 'Input'), inp.g, ...subs.flat(), s('g', { transform: `translate(10,${top})` }, win.g),
      s('text', { x: kx - gap / 2, y: ky + (kh * C) / 2, class: 'op' }, '⊗'),
      label(kx + (kw * C) / 2, ky - 12, 'Kernel'), ker.g,
      s('text', { x: ox - gap / 2, y: ky + (kh * C) / 2, class: 'op' }, '='),
      label(ox + (OW * C) / 2, ky - 12, 'Output'), out.g, s('g', { transform: `translate(${ox},${ky})` }, owin.g),
    );

    const eq = h('div', { class: 'eq-line', 'aria-live': 'polite' });

    function draw(n) {
      const i = Math.floor(n / OW), j = n % OW;
      win.move(j, i);
      owin.move(j, i);
      subs.flat().forEach((t) => (t.textContent = ''));
      const terms = [];
      for (let u = 0; u < kh; u++) for (let v = 0; v < kw; v++) {
        if (kernel[u][v] === 0) continue;
        subs[i + u][j + v].textContent = `·${fmt(kernel[u][v])}`;
        terms.push(`${kernel[u][v] < 0 ? `(${kernel[u][v]})` : kernel[u][v]} \\cdot ${input[i + u][j + v]}`);
      }
      out.cells.flat().forEach((cell, idx) => {
        if (idx <= n) {
          const v = conv(Math.floor(idx / OW), idx % OW);
          const { fill, text } = shade(v, max);
          cell.rect.style.fill = fill; cell.text.style.fill = text;
          cell.text.textContent = fmt(v);
        } else {
          cell.rect.style.fill = ''; cell.text.textContent = '';
        }
      });
      katex.render(`G[${i},${j}] = ${terms.join(' + ')} = ${conv(i, j)}`, eq, { throwOnError: false });
    }

    const player = createPlayer({ steps: OH * OW, onStep: draw, interval, autoplay });
    root.append(svg, eq, player.el);
  },
});
