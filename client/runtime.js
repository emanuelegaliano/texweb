import 'katex/dist/katex.min.css';
import '@fontsource/libertinus-serif/400.css';
import '@fontsource/libertinus-serif/400-italic.css';
import '@fontsource/libertinus-serif/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './style.css';

// runtime delle pagine generate: tema, indice, montaggio dei widget
export function start({ widgets }) {
  theme();
  spy();
  mountWidgets(widgets);
}

function theme() {
  const root = document.documentElement;
  try { const t = localStorage.getItem('texweb-theme'); if (t) root.dataset.theme = t; } catch { /* storage non disponibile */ }
  document.querySelector('.tw-theme')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('texweb-theme', root.dataset.theme); } catch { /* idem */ }
  });
}

// evidenzia nell'indice la sezione che si sta leggendo
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

// i widget si caricano quando stanno per entrare nello schermo; finché non sono pronti
// (o se qualcosa va storto) resta visibile la versione statica compilata da LaTeX
function mountWidgets(registry) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      mount(e.target, registry);
    }
  }, { rootMargin: '300px 0px' });
  document.querySelectorAll('.tw-widget[data-widget]').forEach((el) => {
    // quelli già vicini allo schermo si montano subito, senza aspettare l'observer
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
    el.classList.add('mounted');
    el.dataset.state = 'mounted';
  } catch (err) {
    console.error(`[texweb] widget "${name}":`, err);
    el.classList.add('failed');
    el.dataset.state = 'failed';
  }
}
