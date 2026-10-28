import { h, prefersReducedMotion } from './dom.js';

// velocità delle animazioni: una sola per tutta la pagina (chi legge a 2× lo vuole ovunque),
// ricordata tra una visita e l'altra. Finisce anche nella variabile CSS --speed, che le
// transizioni usano per accorciarsi o allungarsi: transition: transform calc(0.5s / var(--speed, 1))
// Il modulo viene importato anche in Node (texweb legge le definizioni dei widget per validare
// i parametri): document e localStorage si toccano solo nel browser.
export const SPEEDS = [0.5, 1, 2];
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
let speed = 1;
if (inBrowser) {
  try { const s = Number(window.localStorage.getItem('texweb-speed')); if (SPEEDS.includes(s)) speed = s; } catch { /* storage non disponibile */ }
}
const players = new Set();
const applySpeed = () => { if (inBrowser) document.documentElement.style.setProperty('--speed', speed); };
applySpeed();

export function setSpeed(s) {
  if (!SPEEDS.includes(s)) return;
  speed = s;
  try { window.localStorage.setItem('texweb-speed', String(s)); } catch { /* idem */ }
  applySpeed();
  players.forEach((p) => p.syncSpeed());
}

export const getSpeed = () => speed;

// controlli comuni per le animazioni a passi: play/pausa, passo avanti/indietro, reset, velocità.
// onStep(i) disegna lo stato i (da 0 a steps - 1). Parte da solo la prima volta che
// la figura diventa visibile, a meno che l'utente non preferisca ridurre le animazioni.
// interval è la durata di un passo a velocità 1×.
export function createPlayer({ steps, onStep, interval = 900, autoplay = true, loopPause = 1600 }) {
  let i = 0;
  let n = steps;
  let timer = null;
  let started = false;
  const wait = (ms) => ms / speed;

  const btn = (label, title, onclick) =>
    h('button', { class: 'btn icon', type: 'button', title, 'aria-label': title, onclick }, label);

  const playBtn = btn('▶', 'Riproduci', () => (timer ? pause() : play()));
  const prevBtn = btn('‹', 'Passo indietro', () => { pause(); go(i - 1); });
  const nextBtn = btn('›', 'Passo avanti', () => { pause(); go(i + 1); });
  const resetBtn = btn('↺', 'Ricomincia', () => { pause(); go(0); });
  const counter = h('span', { class: 'counter' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
  const speedBtns = SPEEDS.map((s) => h('button', {
    type: 'button', class: 'speed-btn', 'aria-label': `Velocità ${s}×`, title: `Velocità ${s}×`,
    onclick: () => setSpeed(s),
  }, `${String(s).replace('.', ',')}×`));
  const speedBox = h('div', { class: 'speed', role: 'group', 'aria-label': 'Velocità' }, speedBtns);

  const el = h('div', { class: 'player' }, [resetBtn, prevBtn, playBtn, nextBtn, bar, counter, speedBox]);

  function syncSpeed() {
    speedBtns.forEach((b, k) => b.classList.toggle('on', SPEEDS[k] === speed));
    // se sta andando, il prossimo passo arriva già con la nuova velocità
    if (timer) { clearTimeout(timer); timer = setTimeout(tick, wait(interval)); }
  }

  function render() {
    counter.textContent = `${i + 1} / ${n}`;
    bar.firstChild.style.width = `${n > 1 ? (i / (n - 1)) * 100 : 100}%`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === n - 1;
  }

  function go(k) {
    i = Math.max(0, Math.min(n - 1, k));
    onStep(i);
    render();
  }

  function tick() {
    if (i < n - 1) {
      go(i + 1);
      timer = setTimeout(tick, wait(interval));
    } else {
      // pausa sull'ultimo passo, poi ricomincia
      timer = setTimeout(() => { go(0); timer = setTimeout(tick, wait(interval)); }, wait(loopPause));
    }
  }

  function play() {
    if (timer) return;
    playBtn.textContent = '❚❚';
    playBtn.title = 'Pausa';
    if (i === n - 1) go(0);
    timer = setTimeout(tick, wait(interval) / 2);
  }

  function pause() {
    clearTimeout(timer);
    timer = null;
    playBtn.textContent = '▶';
    playBtn.title = 'Riproduci';
  }

  // cambia il numero di passi (es. quando l'utente modifica i parametri)
  function setSteps(k, { keep = false } = {}) {
    n = Math.max(1, k);
    go(keep ? i : 0);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !started && autoplay && !prefersReducedMotion()) {
        started = true;
        play();
      } else if (!e.isIntersecting && timer) {
        pause();
        started = false;
      }
    }
  }, { threshold: 0.5 });
  queueMicrotask(() => io.observe(el));

  const api = { el, go, play, pause, setSteps, syncSpeed, get index() { return i; } };
  players.add(api);
  syncSpeed();
  go(0);
  return api;
}
