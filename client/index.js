// texweb/client: quello che serve per scrivere un widget.
//
//   import { defineWidget, svgRoot, grid, createPlayer } from 'texweb/client';
//   export default defineWidget({ name, params: { ... }, mount(el, params) { ... } });

export { h, s, svgRoot, shade, fmt, prefersReducedMotion } from './lib/dom.js';
export { grid, windowRect, label } from './lib/grid.js';
export { createPlayer, setSpeed, getSpeed, SPEEDS } from './lib/player.js';

// la definizione è un oggetto semplice: texweb la legge in fase di build per controllare
// i parametri scritti nel .tex, e il browser chiama mount() per disegnare il widget
export function defineWidget(def) {
  if (typeof def.mount !== 'function') throw new Error('defineWidget: manca mount(el, params)');
  return { params: {}, ...def };
}
