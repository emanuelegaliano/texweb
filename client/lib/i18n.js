// Interface strings of the widget kit. The language is the page's (<html lang>),
// which texweb sets from the notes' preamble; English is the fallback.

const STRINGS = {
  en: {
    play: 'Play', pause: 'Pause', prev: 'Previous step', next: 'Next step', restart: 'Restart',
    speed: 'Speed', speedValue: (s) => `${s}×`, interactive: 'interactive',
  },
  it: {
    play: 'Riproduci', pause: 'Pausa', prev: 'Passo indietro', next: 'Passo avanti', restart: 'Ricomincia',
    speed: 'Velocità', speedValue: (s) => `${String(s).replace('.', ',')}×`, interactive: 'interattiva',
  },
};

export function t(key) {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
  return (STRINGS[lang] ?? STRINGS.en)[key];
}
