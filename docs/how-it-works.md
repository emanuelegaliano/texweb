# How it works

```
main.tex ─┬─ preamble ──► macros, colors, bibliography, language
          │
          └─ body ──► parser ──► renderer ──► pages (HTML) ──► Vite ──► site
                        │           │
                        │           ├─ TikZ ──► LaTeX + dvisvgm ──► SVG (cached)
                        │           ├─ math ──► KaTeX
                        │           └─ widget ──► checked against widgets/<name>/index.js
                        └─ \input, \include
```

1. **Preamble.** `src/preamble.js` scans the preamble with a small brace reader: `\newcommand`, `\DeclareMathOperator`, `\definecolor`, `\addbibresource`, `\title`, `\author`. The language comes from `babel` or `polyglossia` (`src/locale.js`).
2. **Parser.** The body is parsed by [unified-latex](https://github.com/siefkenj/unified-latex) into a tree, following `\input` and `\include`. The argument signatures of the dialect (`src/dialect.js`) are declared to the parser, so options and arguments are attached to their commands.
3. **Renderer.** `src/render.js` walks the tree and writes HTML, one page per chapter. Text is collected into paragraphs; figures, formulas and lists are blocks. Counters follow the `book` class. `\ref` and `\cite` become placeholders, resolved at the end, when every label and citation is known, even across pages.
4. **Bibliography.** `src/bib.js` reads the `.bib` files and numbers the cited entries in biblatex's name-title-year order.
5. **Math.** KaTeX, with the preamble's macros. A formula KaTeX cannot parse is an error with file and line.
6. **TikZ.** `src/tikz.js` compiles every `tikzpicture` with real LaTeX and the document's own preamble, so colors, styles and macros like `\numgrid` work. The `preview` package crops the page around the figure, and the document goes through DVI (`latex` with the `dvisvgm` class option) so that `dvisvgm` needs neither Ghostscript nor mutool, and PNG images inside TikZ are embedded. Results are cached in `.texweb/cache/`, keyed by the hash of preamble and code: only modified figures are recompiled, in parallel.
7. **Widgets.** `src/site.js` loads every widget definition through Vite (so widgets can import CSS and TypeScript) to read its name and parameters, and the renderer checks each `\begin{widget}` against them. The page gets a placeholder with the validated parameters and the compiled PDF figure.
8. **Site.** Pages are written to `.texweb/site/` with a small generated `entry.js` that lazily imports the widgets. In development Vite serves that folder and the watcher regenerates it on every save; `texweb build` runs a Vite production build into `dist/`.
9. **Runtime.** `client/runtime.js` handles the theme toggle, the table of contents, and mounts each widget when it is about to enter the screen.

## Repository layout

| path | |
|---|---|
| `bin/texweb.js` | the command line: `dev`, `build`, `check` |
| `src/dialect.js` | the known commands and environments |
| `src/parse.js` | parser setup and helpers |
| `src/preamble.js` | preamble reader |
| `src/locale.js` | interface strings, language detection, built-in boxes |
| `src/render.js` | LaTeX tree to HTML |
| `src/bib.js` | `.bib` parser and formatting |
| `src/tikz.js` | TikZ to SVG |
| `src/widget-params.js` | widget option parsing and validation |
| `src/site.js` | site generation |
| `src/server.js` | Vite configuration, development server, build |
| `src/diagnostics.js` | errors and warnings with file and line |
| `client/runtime.js` | page runtime |
| `client/index.js`, `client/lib/` | the widget kit, imported as `texweb/client` |
| `client/style.css`, `client/toolkit.css` | site and kit styles |
| `latex/texweb.sty` | the `widget` environment for the PDF |
