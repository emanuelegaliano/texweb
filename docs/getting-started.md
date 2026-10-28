# Getting started

## Requirements

- **Node.js 20** or later.
- **TeX Live** (or MacTeX) with `latex` and `dvisvgm`, to compile TikZ figures to SVG.
- **Ghostscript** (`gs`), only if you include PDF images with `\includegraphics`: they are converted to PNG.

## Install texweb

```bash
git clone https://github.com/emanuelegaliano/texweb.git
cd texweb
npm install
```

Try it on the bundled example:

```bash
npm run dev
```

and open http://localhost:5180. The example lives in `example/`: two chapters, a bibliography, TikZ figures and two widgets.

To have a `texweb` command available everywhere, run `npm link` in the repository. Otherwise use `node /path/to/texweb/bin/texweb.js`, as in the rest of this guide.

## Use it with your notes

1. **Copy `texweb.sty` next to your main `.tex` file.** Only the PDF needs it, for the `widget` environment:
   ```bash
   cp /path/to/texweb/latex/texweb.sty /path/to/notes/
   ```
2. **Load it** in the preamble with `\usepackage{texweb}`.
3. **Check the project.** This writes nothing, and lists what texweb does not understand yet:
   ```bash
   node /path/to/texweb/bin/texweb.js check /path/to/notes
   ```
4. **Start the development server** from the notes folder:
   ```bash
   node /path/to/texweb/bin/texweb.js dev .
   ```
5. **Write.** Every time you save a `.tex`, a `.bib` or a widget, the page reloads. Errors appear in the terminal and at the top of the page, with file and line.
6. **Ignore the generated files**: add `.texweb/` (cache and working site) and `dist/` (built site) to the notes' `.gitignore`.

The PDF is compiled exactly as before, with `latexmk -pdf` or LaTeX Workshop.

## A minimal document

```latex
\documentclass{book}
\usepackage[english]{babel}
\usepackage{amsmath}
\usepackage{tikz}
\usepackage{texweb}

\title{My notes}
\author{Me}

\begin{document}
\chapter{First chapter}\label{ch:first}

\section{Formulas}
\begin{equation}\label{eq:relu}
  f(x) = \max\{0, x\}
\end{equation}
Equation~\eqref{eq:relu} is the ReLU.

\begin{figure}[htbp]
\centering
\begin{tikzpicture}
  \draw[thick] (0,0) circle (1);
\end{tikzpicture}
\caption{A circle.}\label{fig:circle}
\end{figure}

Figure~\ref{fig:circle} is a circle.
\end{document}
```

To add an interactive figure, read the [widget guide](widget-guide.md).

## VS Code

- Edit the `.tex` files as usual; LaTeX Workshop keeps building the PDF.
- Run `texweb dev` in the integrated terminal.
- Open the site next to the editor: Cmd+Shift+P (Ctrl+Shift+P) → **Simple Browser: Show** → `http://localhost:5180`.

## Publish the site

```bash
node /path/to/texweb/bin/texweb.js build /path/to/notes
```

The site is written to `dist/` (or `outDir` from the [configuration](configuration.md)). It is a plain static site: publish it on GitHub Pages, Netlify or any web server. `build` stops if there are errors, unless `--force`.

## Commands

```bash
texweb dev   [folder] [--port 5180]   # development server, regenerates on every save
texweb build [folder] [--force]       # static site in dist/
texweb check [folder]                 # checks the sources without writing anything
```

Common options: `--cache <folder>` (instead of `.texweb/`) and `--out <folder>` (instead of `dist/`).
