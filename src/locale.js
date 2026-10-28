// Interface strings of the generated site. The language is taken from the preamble
// (babel or polyglossia) and can be forced with `lang` in texweb.config.js.

export const LOCALES = {
  en: {
    chapter: 'Chapter',
    part: 'Part',
    appendix: 'Appendix',
    floats: { figure: 'Figure', table: 'Table', algorithm: 'Algorithm' },
    refNames: {
      figure: 'figure', table: 'table', algorithm: 'algorithm', equation: 'equation',
      chapter: 'chapter', section: 'section', subsection: 'section', subsubsection: 'section',
    },
    boxes: {
      definition: 'Definition', theorem: 'Theorem', lemma: 'Lemma', corollary: 'Corollary',
      proposition: 'Proposition', exercise: 'Exercise', remark: 'Remark', example: 'Example',
      proof: 'Proof', note: 'Note',
    },
    bibliography: 'Bibliography',
    untitled: 'Notes',
    contents: 'Contents',
    toggleTheme: 'Toggle theme',
    backToText: 'back to text',
    missingImage: 'missing image',
    tikzFailed: 'TikZ figure not compiled',
    diagnostics: (errors, warnings) => `${errors} errors, ${warnings} warnings`,
    reportError: 'Report an error',
    issue: {
      title: 'Error in', page: 'Page', section: 'Section', source: 'Source', selection: 'Selected text',
      describe: 'Describe the error here:',
    },
  },
  it: {
    chapter: 'Capitolo',
    part: 'Parte',
    appendix: 'Appendice',
    floats: { figure: 'Figura', table: 'Tabella', algorithm: 'Algoritmo' },
    refNames: {
      figure: 'figura', table: 'tabella', algorithm: 'algoritmo', equation: 'equazione',
      chapter: 'capitolo', section: 'sezione', subsection: 'sezione', subsubsection: 'sezione',
    },
    boxes: {
      definition: 'Definizione', theorem: 'Teorema', lemma: 'Lemma', corollary: 'Corollario',
      proposition: 'Proposizione', exercise: 'Esercizio', remark: 'Osservazione', example: 'Esempio',
      proof: 'Dimostrazione', note: 'Nota',
    },
    bibliography: 'Bibliografia',
    untitled: 'Appunti',
    contents: 'Indice',
    toggleTheme: 'Cambia tema',
    backToText: 'torna al testo',
    missingImage: 'immagine mancante',
    tikzFailed: 'figura TikZ non compilata',
    diagnostics: (errors, warnings) => `${errors} errori, ${warnings} avvisi`,
    reportError: 'Segnala un errore',
    issue: {
      title: 'Errore in', page: 'Pagina', section: 'Sezione', source: 'Sorgente', selection: 'Testo selezionato',
      describe: "Descrivi qui l'errore:",
    },
  },
};

const BABEL_NAMES = {
  italian: 'it', english: 'en', british: 'en', american: 'en', USenglish: 'en', UKenglish: 'en',
};

// babel's main language is the last one in the option list
export function detectLang(preambleSrc) {
  const babel = preambleSrc.match(/\\usepackage\[([^\]]*)\]\{babel\}/);
  if (babel) {
    const langs = babel[1].split(',').map((s) => s.trim().replace(/^main=/, '')).filter((s) => BABEL_NAMES[s]);
    if (langs.length) return BABEL_NAMES[langs[langs.length - 1]];
  }
  const poly = preambleSrc.match(/\\setdefaultlanguage(\[[^\]]*\])?\{([^}]*)\}|\\setmainlanguage(\[[^\]]*\])?\{([^}]*)\}/);
  if (poly) return BABEL_NAMES[poly[2] ?? poly[4]] ?? 'en';
  return 'en';
}

export const getLocale = (lang) => LOCALES[lang] ?? LOCALES.en;

// Built-in box environments (tcolorbox, amsthm and friends). Each name maps to a kind,
// whose title comes from the locale. English and Italian environment names are both known.
export const DEFAULT_BOXES = {
  definition: { kind: 'definition', numbered: true, style: 'accent' },
  theorem: { kind: 'theorem', numbered: true, style: 'lemma' },
  lemma: { kind: 'lemma', numbered: true, style: 'lemma' },
  corollary: { kind: 'corollary', numbered: true, style: 'lemma' },
  proposition: { kind: 'proposition', numbered: true, style: 'lemma' },
  exercise: { kind: 'exercise', numbered: true, style: 'ex' },
  remark: { kind: 'remark', numbered: false, style: 'obs' },
  note: { kind: 'note', numbered: false, style: 'obs' },
  example: { kind: 'example', numbered: false, style: 'plain' },
  proof: { kind: 'proof', numbered: false, style: 'proof' },

  definizione: { kind: 'definition', numbered: true, style: 'accent' },
  teorema: { kind: 'theorem', numbered: true, style: 'lemma' },
  corollario: { kind: 'corollary', numbered: true, style: 'lemma' },
  proposizione: { kind: 'proposition', numbered: true, style: 'lemma' },
  esercizio: { kind: 'exercise', numbered: true, style: 'ex' },
  osservazione: { kind: 'remark', numbered: false, style: 'obs' },
  nota: { kind: 'note', numbered: false, style: 'obs' },
  esempio: { kind: 'example', numbered: false, style: 'plain' },
  esempiofig: { kind: 'example', numbered: false, style: 'plain', split: 'tcblower' },
  dimostrazione: { kind: 'proof', numbered: false, style: 'proof' },
};
