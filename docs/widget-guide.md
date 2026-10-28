# The `widget` environment

A widget is an interactive figure: a JavaScript component that replaces a figure on the website, while the PDF keeps a static figure written in LaTeX. This guide covers the LaTeX side, how to write a widget, and a complete tutorial.

- [The environment](#the-environment)
- [The PDF figure](#the-pdf-figure)
- [Writing a widget](#writing-a-widget)
- [Parameters](#parameters)
- [How LaTeX and JavaScript are connected](#how-latex-and-javascript-are-connected)
- [Step animations](#step-animations)
- [Styling](#styling)
- [Tutorial: a neural network](#tutorial-a-neural-network)
- [Kit reference](#kit-reference)
- [Troubleshooting](#troubleshooting)

## The environment

```latex
\begin{figure}[htbp]
\centering
\begin{widget}{name}[options]
  the figure for the PDF
\end{widget}
\caption{...}
\label{fig:...}
\end{figure}
```

- **`{name}`** selects the component: the folder `widgets/name/` next to your notes.
- **`[options]`** are the widget's parameters, written like LaTeX package options: `key=value` pairs separated by commas. They are optional.
- **The body** is the figure shown in the PDF. It is mandatory.

The widget does not own the caption or the label: those belong to the surrounding `figure`, so numbers and `\ref` are the same in the PDF and on the website. A widget can also be used outside a `figure`, for instance a small slider inside a paragraph.

In the PDF, `texweb.sty` ignores the name and the options and prints the body. On the website, the body is compiled too (TikZ becomes SVG) and stays visible until the component has loaded, or if it fails to load.

## The PDF figure

The body must contain something: a `tikzpicture`, an `\includegraphics`, or any other LaTeX. When it is empty:

- `texweb check`, `texweb dev` and `texweb build` report an error with file and line (`build` stops unless `--force`);
- LaTeX issues a warning and prints a red "Missing figure" box in its place.

A good static substitute explains the same thing all at once. For a step animation, draw the **last step** with every value, and write the computations of each step below it. The [neural network example](examples/neural-net/) does exactly this.

If the numbers in the PDF figure come from the widget (random weights, computed values), compute them with the same code and the same parameters, so that the PDF and the website tell the same story.

## Writing a widget

A widget is a folder in `widgets/`, next to your notes, with an `index.js` (or `index.ts`):

```
my-notes/
├── main.tex
├── texweb.sty
└── widgets/
    └── counter/
        ├── index.js
        └── style.css      (optional)
```

The folder name is the name used in `\begin{widget}{...}`. The file default-exports a definition:

```js
import { defineWidget, h } from 'texweb/client';
import './style.css';

export default defineWidget({
  name: 'counter',
  params: {
    label: { type: 'string', default: 'clicks' },
    start: { type: 'integer', default: 0, min: 0 },
  },
  mount(el, { label, start }) {
    let n = start;
    const btn = h('button', { type: 'button' }, `${n} ${label}`);
    btn.addEventListener('click', () => (btn.textContent = `${++n} ${label}`));
    el.append(btn);
  },
});
```

```latex
\begin{widget}{counter}[label=presses, start=3]
  A button that counts clicks.
\end{widget}
```

- **`name`** must match the folder name.
- **`params`** declares the accepted options (next section).
- **`mount(el, params, { fallback })`** draws the widget. `el` is an empty `div`; `params` holds the values from the `.tex`, already converted and with defaults filled in; `fallback` is the element with the static figure, which texweb removes once `mount` returns. `mount` can be `async`.

Two rules:

- The widget file is also imported **in Node**, to read `name` and `params` at build time. Use `document`, `window` and `localStorage` only inside `mount`, never at the top level of the module.
- Dependencies (`katex`, `three`, ...) are installed in the texweb repository, not in your notes folder: run `npm install <package>` inside texweb, then `import` it normally from the widget.

A new widget folder is discovered when the development server starts: restart `texweb dev` after creating one. Later changes to its files are picked up automatically.

## Parameters

| type | in the `.tex` | in JavaScript | extra fields |
|---|---|---|---|
| `number` | `interval=1200` | `1200` | `min`, `max` |
| `integer` | `hidden=3` | `3` | `min`, `max` |
| `boolean` | `autoplay` or `autoplay=false` | `true` / `false` | |
| `string` | `label=ReLU` | `'ReLU'` | |
| `enum` | `activation=tanh` | `'tanh'` | `values: [...]` (required) |
| `list` | `x={1, 0.5}` | `[1, 0.5]` | |
| `matrix` | `k={{1,2},{3,4}}` | `[[1, 2], [3, 4]]` | |
| `json` | `cfg={"a": 1}` | `{ a: 1 }` | |

Every parameter can have a `default`, or `required: true`. Lists use the same notation as TikZ's `\foreach` and the `\numgrid` macro: braces and commas, nested for matrices. Numeric items become numbers, the others stay strings.

Validation happens at build time, with file and line:

```
chapters/cnn.tex:17  widget "sharpen": unknown parameter "kernal" (did you mean "kernel"?)
chapters/cnn.tex:17  widget "sharpen", parameter "interval": must be at least 200
chapters/cnn.tex:40  unknown widget "conv-param" (did you mean "conv-params"?)
```

## How LaTeX and JavaScript are connected

Only by the name. You never touch texweb's runtime:

```
main.tex           \begin{widget}{counter}[start=3]
                               │
texweb (build)     finds widgets/counter/index.js, checks "start" against params,
                   writes into the page:
                   <div data-widget="counter" data-params='{"label":"clicks","start":3}'>
                     <div class="tw-fallback"> ...the compiled PDF figure... </div>
                   </div>
                               │
runtime (browser)  when the div is about to enter the screen, imports
                   widgets/counter/index.js and calls mount(div, { label: 'clicks', start: 3 })
```

## Step animations

Most explanatory figures are a sequence of steps: a kernel sliding over an image, neurons computed one at a time, a gradient flowing backwards. The kit has a player for them:

```js
import { createPlayer } from 'texweb/client';

function draw(n) {
  // draw step n from scratch
}

const player = createPlayer({ steps: 9, onStep: draw, interval: 1200 });
el.append(svg, player.el);
```

The player adds play/pause, previous and next step, restart, a progress bar and the speed buttons (0.5×, 1×, 2×). It starts by itself the first time the figure becomes visible, and pauses when it leaves the screen. Readers who prefer reduced motion get no autoplay.

**The one principle: `draw(n)` depends only on `n`.** It sets the state of step `n` from scratch: where the window is, which cells are filled, which formula is shown. It never remembers the previous step. Then:

- going back, restarting and jumping work without any extra code;
- the motion between two steps is done by **CSS transitions**: JavaScript says *what* step `n` looks like, the browser animates *how* to get there;
- when the data changes (a slider, a different input), recompute and call `draw(player.index)`.

```js
// a window that slides over a grid: changing the transform is enough, CSS interpolates
const win = windowRect({ size: 40, w: 3, h: 3, cls: 'win hot' });

function draw(n) {
  const i = Math.floor(n / 3), j = n % 3;
  win.move(j, i);
}
```

```css
.win-g { transition: transform calc(0.5s / var(--speed, 1)) ease; }
```

`createPlayer` options: `steps`, `onStep`, `interval` (milliseconds per step at 1×, default 900), `autoplay` (default `true`), `loopPause` (pause on the last step before starting over, default 1600). It returns `{ el, go(n), play(), pause(), setSteps(k), index }`: `setSteps` changes the number of steps, for example when a parameter changes the size of the figure.

**Speed.** The speed is shared by the whole page and remembered by the browser. It also lives in the CSS variable `--speed`, so write durations as `calc(<duration> / var(--speed, 1))` and your transitions will follow the chosen speed. The kit's own transitions already do.

## Styling

Import a stylesheet from the widget (`import './style.css'`) and scope every rule under a class of your own, so nothing leaks into the page:

```js
el.append(h('div', { class: 'counter' }, [...]));
```

```css
.counter button { font: inherit; color: var(--ink); }
```

Use the theme variables, and the widget works in both light and dark mode:

| variable | use |
|---|---|
| `--bg`, `--surface` | page background, widget background |
| `--ink`, `--ink-soft`, `--rule` | text, secondary text, borders |
| `--accent`, `--accent-soft` | main color (from `\definecolor{Accent}`) |
| `--obs`, `--fig`, `--lemma`, `--ex` | the other preamble colors |
| `--hot`, `--blue`, `--c1` … `--c5` | highlights and categorical colors |
| `--font-serif`, `--font-sans`, `--font-mono` | the page fonts |
| `--speed` | animation speed (0.5, 1 or 2) |

The kit also ships ready-made classes for controls and grids, listed in the [kit reference](#kit-reference).

## Tutorial: a neural network

The complete widget is in [`examples/neural-net/`](examples/neural-net/). It shows the forward pass of a network with 2 inputs, one hidden layer and one output: at every step one neuron lights up, the incoming edges show the signal flowing, the neuron is filled according to its value, and the computation appears below.

### 1. Usage in LaTeX

```latex
\begin{figure}[htbp]
\centering
\begin{widget}{neural-net}[x={1, 0.5}, hidden=3, activation=relu]
  \begin{tikzpicture} ... \end{tikzpicture}
\end{widget}
\caption{The forward pass of a network with two inputs and one hidden layer.}
\label{fig:net}
\end{figure}
```

### 2. Parameters

```js
params: {
  x: { type: 'list', default: [1, 0.5] },
  hidden: { type: 'integer', default: 3, min: 1, max: 6 },
  activation: { type: 'enum', values: ['relu', 'sigmoid', 'tanh'], default: 'relu' },
  seed: { type: 'integer', default: 7 },
  interval: { type: 'number', default: 1600, min: 300 },
},
```

`seed` feeds a small pseudo-random generator, so the weights are the same at every load, and the PDF figure can show the same numbers.

### 3. The model, separate from the drawing

```js
let z, a, y;
function forward() {
  z = W1.map((row, k) => row[0] * x[0] + row[1] * x[1] + b1[k]);
  a = z.map(act.f);
  y = W2.reduce((acc, wk, k) => acc + wk * a[k], b2);
}
forward();
```

Plain JavaScript, no graphics. Keeping it in a function means it can be called again when the inputs change.

### 4. The drawing

Positions are computed once; the SVG is built with `svgRoot` and `s`. Edges are drawn before the neurons, so the circles sit on top. Each edge gets a class for the sign of its weight and a stroke width proportional to it:

```js
function edge([x1, y1], [x2, y2], weight) {
  const line = s('line', {
    x1: x1 + 24, y1, x2: x2 - 24, y2,
    class: `edge ${weight < 0 ? 'neg' : 'pos'}`,
    'stroke-width': 1 + 3 * Math.abs(weight),
  });
  edgesG.append(line);
  return line;
}
```

### 5. The steps

There are `hidden + 2` steps: the inputs, one step per hidden neuron, the output. `draw(n)` only toggles classes, sets values and renders the formula; the CSS does the motion:

```js
// simplified from examples/neural-net/index.js
function draw(n) {
  e1.forEach((row, k) => row.forEach((line) => line.classList.toggle('on', n === k + 1)));
  e2.forEach((line) => line.classList.toggle('on', n === hidden + 1));
  nHid.forEach((nd, k) => show(nd, n >= k + 1 ? a[k] : null, maxA));
  show(nOut, n >= hidden + 1 ? y : null, Math.max(Math.abs(y), 1));
  katex.render(formulaFor(n), eq, { throwOnError: false });
}

const player = createPlayer({ steps: hidden + 2, onStep: draw, interval });
```

```css
.neural-net .edge.on { stroke-dasharray: 8 6; animation: neural-net-flow calc(0.6s / var(--speed, 1)) linear infinite; }
.neural-net .neuron circle {
  fill: color-mix(in oklab, var(--accent) calc(var(--level, 0) * 75%), var(--surface));
  transition: fill calc(0.5s / var(--speed, 1)) ease;
}
```

The neuron's value is passed to CSS through `--level` (0 to 1), and `color-mix` turns it into a fill.

### 6. Interaction

Two sliders change the inputs. Because `draw` only depends on `n`, interaction is two lines:

```js
oninput: (e) => {
  x[i] = Number(e.target.value);
  forward();
  draw(player.index);
},
```

### 7. The PDF figure

The static substitute is the final state: every value in the neurons, the pre-activations next to the hidden ones, the weights on the edges (color for the sign, thickness for the magnitude), and the four computations below the network. The reader of the PDF gets the same information, all at once instead of one step at a time.

## Kit reference

Everything is imported from `texweb/client`.

| export | description |
|---|---|
| `defineWidget(def)` | declares a widget: `{ name, params, mount }` |
| `h(tag, attrs, children)` | creates an HTML element; `on*` attributes become listeners, `style` can be an object |
| `s(tag, attrs, children)` | same, for SVG elements |
| `svgRoot(width, height, attrs)` | an SVG with a `viewBox`, responsive, at most 1.4× its nominal size |
| `grid({ x, y, size, values, rows, cols, cls })` | a grid of cells (like `\numgrid`); returns `{ g, cells }`, with `cells[r][c] = { rect, text }` |
| `windowRect({ size, w, h, cls })` | a rectangle over a block of cells (like `\cellrect`); `move(col, row)`, `resize(w, h)` |
| `label(x, y, text, cls, anchor)` | an SVG text label |
| `createPlayer(options)` | step player, see [step animations](#step-animations) |
| `setSpeed(s)`, `getSpeed()`, `SPEEDS` | page-wide animation speed |
| `shade(value, max)` | `{ fill, text }` colors for a cell, darker for larger values |
| `fmt(value, digits)` | formats a number, with a typographic minus |
| `prefersReducedMotion()` | whether the reader asked for less motion |
| `t(key)` | the kit's interface strings in the page language |

CSS classes provided by the kit: `.controls`, `.seg` and `.seg-btn` (segmented buttons, `.on` for the selected one), `.sliders`, `.sl`, `.sl-name`, `.sl-val` (labelled sliders), `.eq-line` (a formula line), `.widget-note`, `.fig-svg`, and for SVG grids `.cell`, `.cell-text`, `.g-input`, `.g-kernel`, `.g-output`, `.win` (with `.hot`, `.blue`, `.dashed`), `.label`, `.sub`, `.op`.

More examples: [`example/widgets/sharpen/`](../example/widgets/sharpen/) (a kernel sliding over a matrix) and [`example/widgets/conv-params/`](../example/widgets/conv-params/) (padding, stride and dilation with sliders).

## Troubleshooting

| symptom | cause |
|---|---|
| `unknown widget "x"` | no `widgets/x/` folder, or the server was started before creating it: restart `texweb dev` |
| `a widget must default-export defineWidget(...)` | the file is empty or exports something else |
| `cannot load the widget: document is not defined` | `document` or `window` used at the top level of the module: move it into `mount` |
| the static figure stays, nothing happens | an error inside `mount`: open the browser console, the stack trace points to your file |
| `Environment widget undefined` in LaTeX | `texweb.sty` missing or empty next to the `.tex`: `texweb check` tells you how to copy it |
| transitions ignore the speed buttons | durations not written as `calc(... / var(--speed, 1))` |
