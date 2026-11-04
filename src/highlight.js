// Syntax highlighting of code listings (lstlisting, minted, verbatim), enabled with `highlight: true`
// in texweb.config.js. highlight.js runs at build time: the page only gets spans with hljs-* classes,
// colored by the site stylesheet with the theme variables, so no JavaScript is sent to the reader.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import latex from 'highlight.js/lib/languages/latex';
import python from 'highlight.js/lib/languages/python';
import pythonRepl from 'highlight.js/lib/languages/python-repl';
import r from 'highlight.js/lib/languages/r';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = { bash, c, cpp, css, java, javascript, json, latex, python, 'python-repl': pythonRepl, r, sql, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

// names used by listings (language=...) and minted, and common style names, mapped to highlight.js languages
const ALIASES = {
  python: 'python', py: 'python', python3: 'python', pycon: 'python-repl',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  c: 'c', 'c++': 'cpp', cpp: 'cpp', css: 'css', java: 'java',
  javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript',
  json: 'json', tex: 'latex', latex: 'latex', r: 'r', sql: 'sql',
  html: 'xml', xml: 'xml', yaml: 'yaml', yml: 'yaml',
};

// the language of a listing, from its source: minted's argument, lstlisting's language= or style=
// (a style is resolved through the \lstdefinestyle of the preamble), otherwise the \lstset default
export function listingLanguage(src, { styles = {}, language = null } = {}) {
  const minted = src.match(/^\\begin\{minted\}(?:\[[^\]]*\])?\{([^}]+)\}/);
  let name = minted?.[1];
  if (!name) {
    const opts = (src.match(/^\\begin\{lstlisting\}\s*\[([^\]]*)\]/) ?? [])[1] ?? '';
    const lang = opts.match(/language\s*=\s*\{?(?:\[[^\]]*\])?([A-Za-z+#]+)/);
    const style = opts.match(/style\s*=\s*\{?([\w-]+)/);
    name = lang?.[1] ?? (style ? styles[style[1]] ?? style[1] : null) ?? (src.startsWith('\\begin{lstlisting}') ? language : null);
  }
  return name ? ALIASES[name.trim().toLowerCase()] ?? null : null;
}

// the highlighted HTML of a piece of code, or null if the language is unknown
export function highlightCode(code, language) {
  if (!language || !hljs.getLanguage(language)) return null;
  // a Python session with >>> prompts stays 'python' (as listings does): strings spanning several
  // lines, like a pattern between ''', are colored whole; python-repl is used only when asked (pycon)
  return { language, html: hljs.highlight(code, { language, ignoreIllegals: true }).value };
}
