// texweb/client: everything needed to write a widget.
//
//   import { defineWidget, svgRoot, grid, createPlayer } from 'texweb/client';
//   export default defineWidget({ name, params: { ... }, mount(el, params) { ... } });

export { h, s, svgRoot, shade, fmt, prefersReducedMotion } from './lib/dom.js';
export { grid, windowRect, label } from './lib/grid.js';
export { createPlayer, setSpeed, getSpeed, SPEEDS } from './lib/player.js';
export { t } from './lib/i18n.js';

// a definition is a plain object: texweb reads it at build time to check the parameters
// written in the .tex, and the browser calls mount() to draw the widget
export function defineWidget(def) {
  if (typeof def.mount !== 'function') throw new Error('defineWidget: mount(el, params) is missing');
  return { params: {}, ...def };
}
