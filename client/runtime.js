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
  mountWidgets(widgets);
}

// when the sidenote is visible, clicking a footnote mark highlights it instead of jumping to the list
function sidenotes() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('.tw-fnref a[data-note]');
    if (!a) return;
    const note = document.getElementById(`sn-${a.dataset.note}`);
    if (!note || getComputedStyle(note).display === 'none') return;
    e.preventDefault();
    note.classList.remove('flash');
    void note.offsetWidth;
    note.classList.add('flash');
    setTimeout(() => note.classList.remove('flash'), 1500);
  });
}

function theme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem('texweb-theme'); if (t) root.dataset.theme = t; } catch { /* storage unavailable */ }
  document.querySelector('.tw-theme')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('texweb-theme', root.dataset.theme); } catch { /* same */ }
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
