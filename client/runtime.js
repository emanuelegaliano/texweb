import 'katex/dist/katex.min.css';
import '@fontsource/libertinus-serif/400.css';
import '@fontsource/libertinus-serif/400-italic.css';
import '@fontsource/libertinus-serif/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './style.css';
import { t } from './lib/i18n.js';

// runtime of the generated pages: theme, table of contents, widget mounting
export function start({ widgets }) {
  theme();
  spy();
  sidenotes();
  reportError();
  mountWidgets(widgets);
}

// "report an error": a new issue prefilled with page, section, source file and the selected text
function reportError() {
  const link = document.querySelector('.tw-report');
  if (!link) return;
  const base = link.getAttribute('href');
  const info = JSON.parse(link.dataset.issue || '{}');
  // the section being read: the last heading above the top of the screen
  const currentSection = () => {
    let cur = null;
    for (const hd of document.querySelectorAll('.tw-main h2[id], .tw-main h3[id], .tw-main h4[id]')) {
      if (hd.getBoundingClientRect().top < 120) cur = hd; else break;
    }
    return cur;
  };
  // "3.2 Title": the number is a separate span, so join the parts with a space
  const headingText = (hd) => [...hd.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(' ');
  let selection = '';
  // the selection is read on pointerdown, before clicking the link clears it
  const grab = () => { selection = String(window.getSelection() ?? '').trim(); };
  link.addEventListener('pointerdown', grab);
  link.addEventListener('keydown', grab);
  link.addEventListener('click', () => {
    const sec = currentSection();
    const url = new URL(location.href);
    if (sec) url.hash = sec.id;
    const L = info.labels;
    const quoted = selection ? selection.slice(0, 600).split('\n').map((l) => `> ${l}`).join('\n') : '';
    const lines = [`**${L.page}**: ${url.href}`];
    if (sec) lines.push(`**${L.section}**: ${headingText(sec)}`);
    if (info.source) lines.push(`**${L.source}**: \`${info.source}\``);
    if (quoted) lines.push('', `**${L.selection}**:`, quoted);
    lines.push('', L.describe, '');
    const body = lines.join('\n');
    const title = `${L.title} ${sec ? headingText(sec) : info.page}`;
    link.href = `${base}?${new URLSearchParams({ title, body })}`;
  });
}

// footnote marks: in the margin the note is highlighted, on narrow screens it opens under its line
function sidenotes() {
  document.documentElement.classList.add('tw-js');
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('.tw-fnref a[data-note]');
    if (!a) return;
    const note = document.getElementById(`sn-${a.dataset.note}`);
    if (!note) return;
    e.preventDefault();
    if (getComputedStyle(note).float === 'none') {
      note.classList.toggle('open');
      a.setAttribute('aria-expanded', note.classList.contains('open'));
      return;
    }
    note.classList.remove('flash');
    void note.offsetWidth;
    note.classList.add('flash');
    setTimeout(() => note.classList.remove('flash'), 1500);
  });
}

// theme: automatic (follows the device, also when it changes), light or dark.
// The button cycles through the three; "automatic" is the default and is not stored.
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICONS = { auto: '◐', light: '☀', dark: '☾' };

function theme() {
  const root = document.documentElement;
  const btn = document.querySelector('.tw-theme');
  let mode = 'auto';
  try { const saved = localStorage.getItem('texweb-theme'); if (THEMES.includes(saved)) mode = saved; } catch { /* storage unavailable */ }
  const apply = () => {
    if (mode === 'auto') delete root.dataset.theme;
    else root.dataset.theme = mode;
    if (btn) {
      btn.textContent = THEME_ICONS[mode];
      btn.title = t('theme')[mode];
      btn.setAttribute('aria-label', t('theme')[mode]);
    }
  };
  apply();
  btn?.addEventListener('click', () => {
    mode = THEMES[(THEMES.indexOf(mode) + 1) % THEMES.length];
    try {
      if (mode === 'auto') localStorage.removeItem('texweb-theme');
      else localStorage.setItem('texweb-theme', mode);
    } catch { /* same */ }
    apply();
  });
}

// highlights in the table of contents the section being read
function spy() {
  const links = new Map([...document.querySelectorAll('.tw-nav-sec a')].map((a) => [a.getAttribute('href').slice(1), a]));
  if (!links.size) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a, id) => a.classList.toggle('current', id === e.target.id));
    }
  }, { rootMargin: '0px 0px -70% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

// widgets load when they are about to enter the screen; until they are ready
// (or if something goes wrong) the static version compiled by LaTeX stays visible
function mountWidgets(registry) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      mount(e.target, registry);
    }
  }, { rootMargin: '300px 0px' });
  document.querySelectorAll('.tw-widget[data-widget]').forEach((el) => {
    // those already near the screen are mounted right away, without waiting for the observer
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight + 300 && r.bottom > -300) mount(el, registry);
    else io.observe(el);
  });
}

async function mount(el, registry) {
  const name = el.dataset.widget;
  const load = registry[name];
  if (!load || el.dataset.state) return;
  el.dataset.state = 'loading';
  try {
    const def = (await load()).default;
    const params = JSON.parse(el.dataset.params || '{}');
    const body = document.createElement('div');
    body.className = 'tw-widget-body';
    const fallback = el.querySelector('.tw-fallback');
    el.insertBefore(body, fallback);
    await def.mount(body, params, { fallback });
    fallback?.remove();
    el.dataset.badge = t('interactive');
    el.classList.add('mounted');
    el.dataset.state = 'mounted';
  } catch (err) {
    console.error(`[texweb] widget "${name}":`, err);
    el.classList.add('failed');
    el.dataset.state = 'failed';
  }
}
