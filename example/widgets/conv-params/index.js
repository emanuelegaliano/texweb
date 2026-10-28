import katex from 'katex';
import { defineWidget, h, s, svgRoot, label, createPlayer } from 'texweb/client';
import './style.css';

// padding, stride and dilation: the kernel slides over the input and the output is built cell by cell.
// controls picks which parameters the reader can change ("small" figures show only one).

const RANGES = {
  W: { min: 3, max: 10, name: 'Input W' },
  F: { min: 1, max: 5, name: 'Kernel F' },
  P: { min: 0, max: 3, name: 'Padding P' },
  S: { min: 1, max: 5, name: 'Stride S' },
  d: { min: 1, max: 3, name: 'Dilation d' },
};

const PRESETS = [
  { name: 'Padding', p: { W: 5, F: 3, P: 1, S: 1, d: 1 } },
  { name: 'Stride 2', p: { W: 7, F: 3, P: 0, S: 2, d: 1 } },
  { name: 'Dilation 2', p: { W: 7, F: 3, P: 0, S: 1, d: 2 } },
  { name: 'Invalid stride', p: { W: 10, F: 3, P: 0, S: 5, d: 1 } },
  { name: '…fixed with P = 1', p: { W: 10, F: 3, P: 1, S: 3, d: 1 } },
];

export default defineWidget({
  name: 'conv-params',
  params: {
    W: { type: 'integer', default: 5, min: 3, max: 10 },
    F: { type: 'integer', default: 3, min: 1, max: 5 },
    P: { type: 'integer', default: 0, min: 0, max: 3 },
    S: { type: 'integer', default: 1, min: 1, max: 5 },
    d: { type: 'integer', default: 1, min: 1, max: 3 },
    controls: { type: 'list', default: ['W', 'F', 'P', 'S', 'd'] },
    presets: { type: 'boolean', default: false },
  },
  mount(root, { W, F, P, S, d, controls, presets }) {
    convParams(root, { init: { W, F, P, S, d }, controls, presets });
  },
});

function convParams(root, { init, controls, presets }) {
  const p = { ...init };
  let geo = null; // current geometry, recomputed on every change
  const arrowId = `ah-${Math.random().toString(36).slice(2, 8)}`;

  const stage = h('div', { class: 'cp-stage' });
  const formula = h('div', { class: 'eq-line' });
  const status = h('p', { class: 'widget-note', 'aria-live': 'polite' });

  const sliders = h('div', { class: 'sliders' }, controls.map((key) => {
    const r = RANGES[key];
    const out = h('output', { class: 'sl-val' }, p[key]);
    const input = h('input', {
      type: 'range', min: r.min, max: r.max, step: 1, value: p[key], 'aria-label': r.name,
      oninput: (e) => { p[key] = Number(e.target.value); out.textContent = p[key]; rebuild(); },
    });
    input.dataset.key = key;
    return h('label', { class: 'sl' }, [h('span', { class: 'sl-name' }, r.name), input, out]);
  }));

  const presetBar = presets && h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Examples' },
    PRESETS.map((pr) => h('button', {
      type: 'button', class: 'seg-btn',
      onclick: () => {
        Object.assign(p, pr.p);
        sliders.querySelectorAll('input').forEach((inp) => {
          inp.value = p[inp.dataset.key];
          inp.nextSibling.textContent = p[inp.dataset.key];
        });
        rebuild();
      },
    }, pr.name)));

  function rebuild() {
    const { W, F, P, S, d } = p;
    const N = W + 2 * P;
    const Fe = F + (F - 1) * (d - 1);
    const raw = (W - Fe + 2 * P) / S + 1;
    const n = Math.max(0, Math.floor(raw));
    const C = Math.min(34, Math.floor(300 / N));
    const ox = 10, oy = 34;
    const outX = ox + N * C + 56;
    const width = Math.max(outX + Math.max(n, 1) * C + 12, 320);
    const height = oy + N * C + 14;

    const svg = svgRoot(width, height, { 'aria-label': `${W}×${W} input with padding ${P}, kernel ${F}×${F}, stride ${S}, dilation ${d}` });
    svg.append(label(ox + (N * C) / 2, 20, P ? `input ${W}×${W}, P = ${P}` : `input ${W}×${W}`));

    // input cells: padding cells are dashed and hold 0
    const lastCovered = n > 0 ? (n - 1) * S + Fe - 1 : -1;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const pad = r < P || c < P || r >= P + W || c >= P + W;
      const uncovered = r > lastCovered || c > lastCovered;
      svg.append(s('rect', {
        x: ox + c * C, y: oy + r * C, width: C, height: C,
        class: `cell ${pad ? 'pad' : 'in'} ${uncovered && n > 0 ? 'uncov' : ''}`,
      }));
      if (pad && C >= 18) svg.append(s('text', { x: ox + c * C + C / 2, y: oy + r * C + C / 2, class: 'cell-text faint', 'font-size': C * 0.38 }, '0'));
    }

    // kernel: the weights (filled cells) and the covered area (dashed)
    const kg = s('g', { class: 'win-g' });
    kg.append(s('rect', { width: Fe * C, height: Fe * C, class: 'win hot dashed', rx: 3 }));
    for (let u = 0; u < F; u++) for (let v = 0; v < F; v++) {
      kg.append(s('rect', { x: v * d * C + 2, y: u * d * C + 2, width: C - 4, height: C - 4, class: 'tap', rx: 2 }));
    }
    svg.append(s('g', { transform: `translate(${ox},${oy})` }, kg));

    // output
    svg.append(label(outX + (Math.max(n, 1) * C) / 2, 20, n > 0 ? `output ${n}×${n}` : 'no output'));
    const outCells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const rect = s('rect', { x: outX + c * C, y: oy + r * C, width: C, height: C, class: 'cell out' });
      svg.append(rect);
      outCells.push(rect);
    }
    svg.append(s('path', {
      d: `M ${ox + N * C + 12} ${oy + (N * C) / 2} h 32`, class: 'arrow', 'marker-end': `url(#${arrowId})`,
    }));
    svg.prepend(s('defs', {}, s('marker', { id: arrowId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' },
      s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' }))));

    stage.replaceChildren(svg);
    geo = { n, C, S, kg, outCells };

    // the formula, with numbers instead of symbols
    const ok = Number.isInteger(raw) && raw >= 1;
    const dil = d > 1 ? `F_d = F + (F-1)(d-1) = ${Fe}, \\quad ` : '';
    const Fsym = d > 1 ? 'F_d' : 'F';
    const val = Number.isInteger(raw) ? raw : `${(W - Fe + 2 * P)}/${S} + 1 \\approx ${raw.toFixed(2)}`;
    katex.render(
      `${dil}\\dfrac{W - ${Fsym} + 2P}{S} + 1 = \\dfrac{${W} - ${Fe} + ${2 * P}}{${S}} + 1 = ${val}`,
      formula, { throwOnError: false, displayMode: false },
    );
    formula.classList.toggle('bad', !ok);
    if (raw < 1) status.textContent = 'The kernel is larger than the (padded) input: there is no valid position.';
    else if (!ok) status.textContent = 'The result is not an integer: the stride does not fit. The kernel stops before the border and the orange cells are never covered.';
    else status.textContent = `${F * F} weights covering a ${Fe}×${Fe} area. ${n * n} kernel positions, one per output cell.`;

    player.setSteps(Math.max(1, n * n));
  }

  function draw(k) {
    if (!geo) return;
    const { n, C, S, kg, outCells } = geo;
    if (n === 0) { kg.style.opacity = 0.35; return; }
    kg.style.opacity = 1;
    const i = Math.floor(k / n), j = k % n;
    kg.style.transform = `translate(${j * S * C}px, ${i * S * C}px)`;
    outCells.forEach((rect, idx) => {
      rect.classList.toggle('done', idx < k);
      rect.classList.toggle('active', idx === k);
    });
  }

  const player = createPlayer({ steps: 1, onStep: draw, interval: 700 });
  root.append(...[presetBar, sliders, stage, formula, status, player.el].filter(Boolean));
  rebuild();
}
