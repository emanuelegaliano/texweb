// The dialect: the explicit list of commands and environments texweb knows.
// Anything not listed here (and not a macro defined in the preamble) is reported as an
// error with file and line, instead of silently disappearing.

// argument signatures, in xparse notation: m mandatory, o optional, s star
export const MACRO_SIGNATURES = {
  part: 's o m', chapter: 's o m', section: 's o m', subsection: 's o m', subsubsection: 's o m',
  paragraph: 's o m', subparagraph: 's o m',
  textbf: 'm', textit: 'm', emph: 'm', texttt: 'm', textsf: 'm', textsc: 'm', underline: 'm', textrm: 'm',
  textcolor: 'm m', text: 'm', mbox: 'm',
  footnote: 'o m', url: 'm', href: 'm m',
  label: 'm', ref: 'm', eqref: 'm', pageref: 'm', autoref: 'm', cref: 'm', Cref: 'm',
  cite: 'o o m', citetitle: 'o o m', citeauthor: 'o o m', textcite: 'o o m', parencite: 'o o m',
  caption: 'o m', includegraphics: 'o m', item: 'o',
  multicolumn: 'm m m', multirow: 'm m m',
  printbibliography: 'o',
  input: 'm', include: 'm',
  // ignored, but their arguments must be consumed
  vspace: 's m', hspace: 's m', setlength: 'm m', addtolength: 'm m', setcounter: 'm m',
  addcontentsline: 'm m m', renewcommand: 's m o o m', newcommand: 's m o o m', thispagestyle: 'm',
  pagestyle: 'm', rule: 'o m m', color: 'm', fontsize: 'm m', lstinputlisting: 'o m',
  toprule: 'o', midrule: 'o', bottomrule: 'o', cmidrule: 'o m', cline: 'm',
  // algorithmicx
  State: '', Statex: '', If: 'm', ElsIf: 'm', Else: '', EndIf: '', For: 'm', ForAll: 'm', EndFor: '',
  While: 'm', EndWhile: '', Repeat: '', Until: 'm', Loop: '', EndLoop: '',
  Function: 'm m', EndFunction: '', Procedure: 'm m', EndProcedure: '',
  Require: '', Ensure: '', Return: '', Comment: 'm', Call: 'm m',
};

export const ENV_SIGNATURES = {
  figure: 'o', 'figure*': 'o', table: 'o', 'table*': 'o', algorithm: 'o',
  tabular: 'm', 'tabular*': 'm m', minipage: 'o m', algorithmic: 'o',
  itemize: 'o', enumerate: 'o', description: 'o',
  widget: 'm o',
};

// commands that produce nothing on the web (PDF layout)
export const IGNORED_MACROS = new Set([
  'centering', 'raggedright', 'raggedleft', 'noindent', 'indent', 'par',
  'small', 'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge',
  'bfseries', 'itshape', 'sffamily', 'rmfamily', 'ttfamily', 'selectfont', 'normalfont',
  'medskip', 'bigskip', 'smallskip', 'vfill', 'hfill', 'vspace', 'hspace', 'clearpage', 'cleardoublepage',
  'newpage', 'pagebreak', 'linebreak', 'FloatBarrier', 'phantomsection', 'addcontentsline',
  'setlength', 'addtolength', 'setcounter', 'renewcommand', 'newcommand', 'thispagestyle', 'pagestyle',
  'frontmatter', 'mainmatter', 'backmatter', 'maketitle', 'tableofcontents', 'listoffigures',
  'color', 'fontsize', 'protect', 'nopagebreak', 'allowbreak', 'relax', 'strut',
]);

// environments that only group content: their content is rendered
export const TRANSPARENT_ENVS = new Set(['center', 'flushleft', 'flushright', 'minipage', 'small', 'footnotesize', 'document']);

// environments skipped entirely
export const SKIPPED_ENVS = new Set(['titlepage', 'comment']);

// text symbols
export const TEXT_SYMBOLS = {
  '%': '%', '&': '&amp;', _: '_', '#': '#', $: '$', '{': '{', '}': '}', ' ': ' ', ',': ' ',
  ';': ' ', ':': ' ', '!': '', '/': '', '-': '­', '@': '',
  LaTeX: '<span class="tw-latex">L<sup>a</sup>T<sub>e</sub>X</span>', TeX: '<span class="tw-latex">T<sub>e</sub>X</span>',
  ldots: '…', dots: '…', textcopyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', euro: '€', textellipsis: '…', S: '§', P: '¶', copyright: '©', textasciitilde: '~',
  textbackslash: '\\', textbar: '|', textendash: '–', textemdash: '—', today: '',
  quad: ' ', qquad: '  ', enspace: ' ', thinspace: ' ',
};

// accents: \`a \'e \"o \^i \~n
export const ACCENTS = { '`': '̀', "'": '́', '"': '̈', '^': '̂', '~': '̃' };

// algpseudocode, with the same keywords as the PDF
export const ALGO_BLOCKS = {
  If: { open: 'if', suffix: 'then', end: 'end if' },
  For: { open: 'for', suffix: 'do', end: 'end for' },
  ForAll: { open: 'for all', suffix: 'do', end: 'end for' },
  While: { open: 'while', suffix: 'do', end: 'end while' },
  Function: { open: 'function', end: 'end function' },
  Procedure: { open: 'procedure', end: 'end procedure' },
  Loop: { open: 'loop', end: 'end loop' },
  Repeat: { open: 'repeat' },
};
export const ALGO_CLOSERS = { EndIf: 'If', EndFor: 'For', EndWhile: 'While', EndFunction: 'Function', EndProcedure: 'Procedure', EndLoop: 'Loop' };
