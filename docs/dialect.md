# The dialect

texweb is not a TeX engine. It knows an explicit list of commands and environments, the ones used when writing notes. Anything it does not know is an **error with file and line**, never something that silently disappears:

```
chapters/cnn.tex:412  unknown command \hspce (did you mean \hspace?)
```

Run `texweb check` on an existing project to see what is missing before you start.

## Supported

| | |
|---|---|
| structure | `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph`, `\subparagraph` (also starred), `\appendix`, `\input`, `\include` |
| text | `\textbf`, `\emph`, `\textit`, `\texttt`, `\textsf`, `\textsc`, `\textrm`, `\underline`, `\textcolor`, `\mbox`, `\footnote`, `\url`, `\href`, `\\`, accents (`\'e`), quotes (` `` '' `), dashes (`--`, `---`), `~`, `\LaTeX`, `\ldots` and the common symbols |
| groups | `{\bfseries ...}`, `{\itshape ...}`, `{\em ...}`, `{\ttfamily ...}`, `{\color{...} ...}` |
| references | `\label`, `\ref`, `\eqref`, `\pageref`, `\autoref`, `\cref`, `\Cref` |
| citations | `\cite`, `\parencite`, `\textcite`, `\citetitle`, `\citeauthor` (with pre- and post-notes), `\printbibliography` |
| math | `$...$`, `\(...\)`, `\[...\]`, `$$...$$`, `equation`, `align`, `gather`, `multline`, `flalign`, `eqnarray` (starred or not), `\nonumber`, `\notag` |
| lists | `itemize`, `enumerate` (also with `\alph`, `\Alph`, `\roman`, `\Roman` labels), `description`, `\item[...]` |
| floats | `figure`, `table`, `algorithm` (also starred), `\caption` |
| images | `\includegraphics` with `width`, `height` and `scale` (`0.5\textwidth`, `4cm`, `16mm`, ...); PNG, JPG, SVG and PDF |
| figures | `tikzpicture`, compiled by LaTeX; `widget` |
| tables | `tabular`, `tabular*`, `booktabs` rules, `\hline`, `\multicolumn`, column alignment |
| boxes | `tcolorbox`/`amsthm`-style environments, see [configuration](configuration.md#boxes) |
| algorithms | `algorithmic` from `algpseudocode`: `\State`, `\If`, `\ElsIf`, `\Else`, `\For`, `\ForAll`, `\While`, `\Repeat`/`\Until`, `\Loop`, `\Function`, `\Procedure`, `\Require`, `\Ensure`, `\Return`, `\Comment`, `\Call` |
| code | `lstlisting`, `verbatim`, `minted`, `\verb` |
| other | `quote`, `quotation`, `center`, `flushleft`, `flushright`, `minipage` |
| skipped | `titlepage`, `comment` |
| ignored | PDF layout commands: `\centering`, `\noindent`, `\vspace`, `\hspace`, `\small`, `\large`, `\clearpage`, `\newpage`, `\setlength`, `\setcounter`, `\maketitle`, `\tableofcontents`, `\frontmatter`, `\mainmatter`, `\backmatter`, ... |

## Numbering

Numbering follows the `book` class: chapters, sections down to `\subsubsection`; figures, tables, algorithms, equations and numbered boxes within the chapter (`3.4`); appendix chapters with letters. A `\label` refers to the last numbered thing before it, as in LaTeX; inside a figure it always refers to the figure.

## Preamble macros

Macros defined with `\newcommand` (with or without arguments, with a default for the first one) are expanded in the text, and passed to KaTeX for formulas. Macros defined with `\def` or `\NewDocumentCommand` are not expanded: inside TikZ figures they work anyway, because LaTeX compiles them.

## Adding a command

1. Declare its argument signature in `src/dialect.js` (`MACRO_SIGNATURES` or `ENV_SIGNATURES`), in xparse notation: `m` mandatory, `o` optional, `s` star.
2. Render it in `src/render.js`: commands in `macroHandlers`, environments in `environment()`. If it only affects the PDF layout, add it to `IGNORED_MACROS` instead.
3. Add a test in `test/texweb.test.js`.
