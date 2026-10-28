# Configuration

Configuration is optional: everything texweb needs is read from the main `.tex` file. To change the defaults, add a `texweb.config.js` next to your notes:

```js
export default {
  main: 'DeepLearning.tex',      // otherwise the .tex file containing \documentclass
  title: 'Deep Learning notes',  // otherwise \title from the preamble
  author: 'Emanuele Galiano',    // otherwise \author from the preamble
  lang: 'it',                    // otherwise detected from babel or polyglossia
  widgets: 'widgets',            // folder of the widgets
  outDir: 'dist',                // output of texweb build
  cacheDir: '.texweb',           // cache and working site
  engine: 'pdflatex',            // for TikZ figures: pdflatex, lualatex or xelatex
  tikzScale: 1.35,               // TikZ figures are scaled by this factor relative to the PDF
  boxes: { /* see below */ },
  theme: { /* see below */ },
  katexMacros: { '\\E': '\\mathbb{E}' },
};
```

## Language

The interface of the site (chapter and figure labels, box titles, the player's buttons) follows the language of the notes: texweb reads the main language of `babel` (the last option, as babel does) or `polyglossia`'s `\setdefaultlanguage`. English and Italian are available; any other language falls back to English. Force it with `lang`.

## Boxes

Box environments (`tcolorbox`, `amsthm`, ...) are rendered with a title, an optional numbering within the chapter, and a style. These environment names are known out of the box, in English and in Italian:

| kind | environments | numbered | style |
|---|---|---|---|
| definition | `definition`, `definizione` | yes | `accent` |
| theorem | `theorem`, `teorema` | yes | `lemma` |
| lemma | `lemma` | yes | `lemma` |
| corollary | `corollary`, `corollario` | yes | `lemma` |
| proposition | `proposition`, `proposizione` | yes | `lemma` |
| exercise | `exercise`, `esercizio` | yes | `ex` |
| remark | `remark`, `osservazione` | no | `obs` |
| note | `note`, `nota` | no | `obs` |
| example | `example`, `esempio`, `esempiofig` (two columns split at `\tcblower`) | no | `plain` |
| proof | `proof`, `dimostrazione` | no | `proof` |

The title comes from the language (`Definition 3.1 (Loss).` or `Definizione 3.1 (Loss).`). Add or override environments in `boxes`:

```js
boxes: {
  claim: { title: 'Claim', numbered: true, style: 'lemma' },
  sidebar: { title: 'Aside', numbered: false, style: 'plain', split: 'tcblower' },
},
```

Fields: `title`, `numbered`, `style` (`accent`, `obs`, `lemma`, `ex`, `plain`, `proof`), `counter` (share a counter between environments), `split` (a command splitting the box into two columns).

## Colors

The site palette comes from the preamble's `\definecolor` with these names:

| theme color | preamble color | used for |
|---|---|---|
| `accent` | `Accent` | headings, links, definitions |
| `obs` | `ObsColor` | remarks |
| `fig` | `FigColor` | captions |
| `lemma` | `LemmaColor` | theorems and lemmas |
| `ex` | `ExColor` | exercises |

If your colors have other names, map them in `theme`, e.g. `theme: { accent: 'MainBlue' }`. In dark mode the colors are lightened automatically. Every `\definecolor` is also available to `\textcolor` and to widgets as `--tex-<Name>`.

## Math

Formulas are rendered by KaTeX. Macros defined in the preamble with `\newcommand` and `\DeclareMathOperator` are passed to KaTeX automatically. Macros defined with `\def` or `\NewDocumentCommand` are not: add them to `katexMacros`.
