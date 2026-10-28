import { h, prefersReducedMotion } from './dom.js';
import { t } from './i18n.js';

// Animation speed: one for the whole page (whoever reads at 2× wants it everywhere),
// remembered across visits. It also ends up in the CSS variable --speed, which transitions use
// to get shorter or longer: transition: transform calc(0.5s / var(--speed, 1))
// This module is imported in Node too (texweb loads widget definitions to validate their
// parameters): document and localStorage are only touched in the browser.
export const SPEEDS = [0.5, 1, 2];
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
let speed = 1;
if (inBrowser) {
  try { const s = Number(window.localStorage.getItem('texweb-speed')); if (SPEEDS.includes(s)) speed = s; } catch { /* storage unavailable */ }
}
const players = new Set();
const applySpeed = () => { if (inBrowser) document.documentElement.style.setProperty('--speed', speed); };
applySpeed();

export function setSpeed(s) {
  if (!SPEEDS.includes(s)) return;
  speed = s;
  try { window.localStorage.setItem('texweb-speed', String(s)); } catch { /* same */ }
  applySpeed();
  players.forEach((p) => p.syncSpeed());
}

export const getSpeed = () => speed;

// Shared controls for step animations: play/pause, step forward/back, restart, speed.
// onStep(i) draws state i (from 0 to steps - 1). Playback starts by itself the first time the
// figure becomes visible, unless the reader prefers reduced motion.
// interval is the duration of one step at 1× speed.
export function createPlayer({ steps, onStep, interval = 900, autoplay = true, loopPause = 1600 }) {
  let i = 0;
  let n = steps;
  let timer = null;
  let started = false;
  const wait = (ms) => ms / speed;

  const btn = (label, title, onclick) =>
    h('button', { class: 'btn icon', type: 'button', title, 'aria-label': title, onclick }, label);

  const playBtn = btn('▶', t('play'), () => (timer ? pause() : play()));
  const prevBtn = btn('‹', t('prev'), () => { pause(); go(i - 1); });
  const nextBtn = btn('›', t('next'), () => { pause(); go(i + 1); });
  const resetBtn = btn('↺', t('restart'), () => { pause(); go(0); });
  const counter = h('span', { class: 'counter' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
  const speedBtns = SPEEDS.map((s) => h('button', {
    type: 'button', class: 'speed-btn', 'aria-label': `${t('speed')} ${t('speedValue')(s)}`, title: `${t('speed')} ${t('speedValue')(s)}`,
    onclick: () => setSpeed(s),
  }, t('speedValue')(s)));
  const speedBox = h('div', { class: 'speed', role: 'group', 'aria-label': t('speed') }, speedBtns);

  const el = h('div', { class: 'player' }, [resetBtn, prevBtn, playBtn, nextBtn, bar, counter, speedBox]);

  function syncSpeed() {
    speedBtns.forEach((b, k) => b.classList.toggle('on', SPEEDS[k] === speed));
    // while playing, the next step already comes at the new speed
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
      // pause on the last step, then start over
      timer = setTimeout(() => { go(0); timer = setTimeout(tick, wait(interval)); }, wait(loopPause));
    }
  }

  function play() {
    if (timer) return;
    playBtn.textContent = '❚❚';
    playBtn.title = t('pause');
    if (i === n - 1) go(0);
    timer = setTimeout(tick, wait(interval) / 2);
  }

  function pause() {
    clearTimeout(timer);
    timer = null;
    playBtn.textContent = '▶';
    playBtn.title = t('play');
  }

  // changes the number of steps (e.g. when the reader changes the parameters)
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
