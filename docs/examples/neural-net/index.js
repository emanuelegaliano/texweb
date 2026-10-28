import katex from 'katex';
import { defineWidget, h, s, svgRoot, createPlayer, fmt } from 'texweb/client';
import './style.css';

// the activation functions that can be chosen from the .tex
const ACT = {
  relu: { f: (z) => Math.max(0, z), tex: '\\mathrm{ReLU}' },
  sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), tex: '\\sigma' },
  tanh: { f: Math.tanh, tex: '\\tanh' },
};

// seeded pseudo-random generator: every load produces the same weights
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[d]).join('');
const r2 = (v) => Math.round(v * 100) / 100;

export default defineWidget({
  name: 'neural-net',
  params: {
    x: { type: 'list', default: [1, 0.5] },
    hidden: { type: 'integer', default: 3, min: 1, max: 6 },
    activation: { type: 'enum', values: ['relu', 'sigmoid', 'tanh'], default: 'relu' },
    seed: { type: 'integer', default: 7 },
    interval: { type: 'number', default: 1600, min: 300 },
  },

  mount(el, { x, hidden, activation, seed, interval }) {
    // ---- 1. the weights: numbers between -1 and 1, with one decimal digit
    const rand = rng(seed);
    const w = () => Math.round((rand() * 2 - 1) * 10) / 10;
    const W1 = Array.from({ length: hidden }, () => [w(), w()]);
    const b1 = Array.from({ length: hidden }, w);
    const W2 = Array.from({ length: hidden }, w);
    const b2 = w();
    const act = ACT[activation];

    // ---- 2. the forward pass (recomputed when the inputs change)
    let z, a, y;
    function forward() {
      z = W1.map((row, k) => row[0] * x[0] + row[1] * x[1] + b1[k]);
      a = z.map(act.f);
      y = W2.reduce((acc, wk, k) => acc + wk * a[k], b2);
    }
    forward();

    // ---- 3. the drawing: neuron positions, edges, circles
    const gap = 74;
    const height = Math.max(3, hidden) * gap + 30;
    const column = (cx, n) => Array.from({ length: n }, (_, i) => [cx, height / 2 + (i - (n - 1) / 2) * gap]);
    const P = { in: column(80, 2), hid: column(270, hidden), out: column(460, 1) };

    const svg = svgRoot(540, height, { 'aria-label': `Network with 2 inputs, ${hidden} hidden neurons and one output` });
    const edgesG = s('g');
    const nodesG = s('g');
    svg.append(edgesG, nodesG);

    function edge([x1, y1], [x2, y2], weight) {
      const line = s('line', {
        x1: x1 + 24, y1, x2: x2 - 24, y2,
        class: `edge ${weight < 0 ? 'neg' : 'pos'}`,
        'stroke-width': 1 + 3 * Math.abs(weight), // the larger the weight, the thicker the edge
      });
      edgesG.append(line);
      return line;
    }
    const e1 = W1.map((row, k) => row.map((wki, i) => edge(P.in[i], P.hid[k], wki))); // e1[k][i]: from x_i to h_k
    const e2 = W2.map((wk, k) => edge(P.hid[k], P.out[0], wk));

    function neuron([cx, cy], name) {
      const value = s('text', { x: cx, y: cy, class: 'value' });
      const g = s('g', { class: 'neuron' }, [
        s('circle', { cx, cy, r: 24 }),
        value,
        s('text', { x: cx, y: cy + 40, class: 'name' }, name),
      ]);
      nodesG.append(g);
      return { g, value };
    }
    const nIn = P.in.map((p, i) => neuron(p, `x${sub(i + 1)}`));
    const nHid = P.hid.map((p, k) => neuron(p, `h${sub(k + 1)}`));
    const nOut = neuron(P.out[0], 'ŷ');

    const eq = h('div', { class: 'eq-line', 'aria-live': 'polite' });

    // ---- 4. one animation step: everything is drawn from scratch, starting from n.
    // There is no need to remember the previous step: back and restart work by themselves,
    // and the motion between one state and the next is done by CSS transitions.
    function show(nd, v, scale) {
      nd.value.textContent = v == null ? '' : fmt(r2(v), 2);
      const level = v == null ? 0 : Math.min(1, Math.abs(v) / scale);
      nd.g.style.setProperty('--level', level);
      nd.g.classList.toggle('strong', level > 0.55);
      nd.g.classList.toggle('off', v == null);
    }

    function draw(n) {
      const maxX = Math.max(...x.map(Math.abs), 1e-9);
      const maxA = Math.max(...a.map(Math.abs), 1e-9);

      // edges: only those of the current step are on
      e1.forEach((row, k) => row.forEach((line) => line.classList.toggle('on', n === k + 1)));
      e2.forEach((line) => line.classList.toggle('on', n === hidden + 1));

      // neurons: a value appears once its step has been reached
      nIn.forEach((nd, i) => show(nd, x[i], maxX));
      nHid.forEach((nd, k) => show(nd, n >= k + 1 ? a[k] : null, maxA));
      nHid.forEach((nd, k) => nd.g.classList.toggle('active', n === k + 1));
      show(nOut, n >= hidden + 1 ? y : null, Math.max(Math.abs(y), 1));
      nOut.g.classList.toggle('active', n === hidden + 1);

      // the formula of the step
      let tex;
      if (n === 0) {
        tex = `x = (${fmt(x[0], 2)},\\ ${fmt(x[1], 2)})`;
      } else if (n <= hidden) {
        const k = n - 1;
        const [wa, wb] = W1[k];
        tex = `h_${k + 1} = ${act.tex}(${fmt(wa)} \\cdot ${fmt(x[0], 2)} + ${fmt(wb)} \\cdot ${fmt(x[1], 2)} + ${fmt(b1[k])})`
          + ` = ${act.tex}(${fmt(r2(z[k]), 2)}) = ${fmt(r2(a[k]), 2)}`;
      } else {
        const terms = W2.map((wk, k) => `${fmt(wk)} \\cdot ${fmt(r2(a[k]), 2)}`).join(' + ');
        tex = `\\hat y = ${terms} + ${fmt(b2)} = ${fmt(r2(y), 2)}`;
      }
      katex.render(tex.replace(/\+ −/g, '- ').replace(/−/g, '-'), eq, { throwOnError: false });
    }

    const player = createPlayer({ steps: hidden + 2, onStep: draw, interval });

    // ---- 5. (bonus) sliders to change the inputs: recompute and redraw the current step
    const sliders = h('div', { class: 'sliders' }, x.map((v, i) => {
      const out = h('output', { class: 'sl-val' }, fmt(v, 2));
      const input = h('input', {
        type: 'range', min: -1, max: 1, step: 0.05, value: v, 'aria-label': `x${i + 1}`,
        oninput: (e) => {
          x[i] = Number(e.target.value);
          out.textContent = fmt(x[i], 2);
          forward();
          draw(player.index);
        },
      });
      return h('label', { class: 'sl' }, [h('span', { class: 'sl-name' }, `x${sub(i + 1)}`), input, out]);
    }));

    el.append(h('div', { class: 'neural-net' }, [sliders, svg, eq, player.el]));
  },
});
