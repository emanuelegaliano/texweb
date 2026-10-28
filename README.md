# texweb

## Abstract

texweb is a framework that turns **LaTeX notes** into a **website**, without changing how the PDF is made: the same `.tex` sources keep compiling with `pdflatex`.

Consider the following example: a chapter on convolutional networks, with a TikZ figure of a kernel sliding over an image. In the PDF the figure can only show one position of the kernel, while the interesting part is the procedure (the kernel moving cell by cell, and the output filling up).

One could think of converting the notes to HTML with a tool like pandoc, and the intuition would not even be totally wrong. There are, however, two issues. The first, concerns LaTeX itself: pandoc is not a TeX engine, so TikZ figures, custom environments and macros get lost along the way. The second concerns the figures: even a perfect conversion would still give us static images.

texweb solves the first issue with an **explicit dialect**: it knows the commands used in notes, and reports anything else with file and line instead of dropping it. Numbering, `\ref`, `\cite` and math (via KaTeX) work as in the PDF, and TikZ figures are compiled by LaTeX itself, with our own preamble, into SVG.

For the second issue we introduce the **`widget` environment**, which links a figure to a JavaScript component (an animation, a canvas, a 3D scene). Going back to our example, the PDF shows the TikZ figure of the kernel, while the website shows the kernel sliding one position at a time. Captions, numbers and references stay the same in both.

```latex
\begin{figure}[htbp]
\centering
\begin{widget}{neural-net}[x={1, 0.5}, hidden=3, activation=relu]
  \begin{tikzpicture} ... \end{tikzpicture}   % the figure for the PDF
\end{widget}
\caption{The forward pass of a network with two inputs and one hidden layer.}
\label{fig:net}
\end{figure}
```

## Repository structure

```
texweb/
├── bin/texweb.js        command line: dev, build, check
├── src/                 LaTeX dialect, parser, renderer, preamble, bibliography, TikZ, site, server
├── client/              page runtime, site styles, and the widget kit (imported as texweb/client)
├── latex/texweb.sty     the widget environment for the PDF
├── example/             a small notes project with two chapters and two widgets
├── docs/                documentation and the neural-network example widget
└── test/                tests (npm test)
```

## Usage

Requirements: Node.js 20+, TeX Live with `latex` and `dvisvgm`.

**1. Install texweb**

```bash
git clone https://github.com/emanuelegaliano/texweb.git
cd texweb
npm install
npm run dev          # the bundled example, on http://localhost:5180
```

**2. Prepare your notes.** Copy `latex/texweb.sty` next to your main `.tex` file and add `\usepackage{texweb}` to the preamble.

**3. Run it**

```bash
node /path/to/texweb/bin/texweb.js check /path/to/notes   # what texweb does not understand yet
node /path/to/texweb/bin/texweb.js dev   /path/to/notes   # live site, regenerated on every save
node /path/to/texweb/bin/texweb.js build /path/to/notes   # static site in dist/
```

**4. Add an interactive figure.** Create `widgets/<name>/index.js` next to your notes:

```js
import { defineWidget, h } from 'texweb/client';

export default defineWidget({
  name: 'counter',
  params: { start: { type: 'integer', default: 0 } },
  mount(el, { start }) {
    let n = start;
    const btn = h('button', { type: 'button' }, `${n} clicks`);
    btn.addEventListener('click', () => (btn.textContent = `${++n} clicks`));
    el.append(btn);
  },
});
```

and use it in LaTeX, with the figure for the PDF inside:

```latex
\begin{widget}{counter}[start=3]
  A button that counts clicks.
\end{widget}
```

The PDF still compiles with `latexmk -pdf`, as before.

## Documentation

- [Getting started](docs/getting-started.md)
- [The widget environment](docs/widget-guide.md): writing widgets, parameters, step animations, a complete tutorial
- [Configuration](docs/configuration.md)
- [The dialect](docs/dialect.md): supported LaTeX
- [How it works](docs/how-it-works.md)

## License

[MIT](LICENSE) © 2026 Emanuele Galiano
