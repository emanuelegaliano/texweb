#!/usr/bin/env node
// gli avvisi di deprecazione di Node sulle dipendenze di Vite non interessano chi scrive appunti
process.noDeprecation = true;
const { dev, build, check } = await import('../src/server.js');

const [cmd, dir = '.', ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };

const usage = `uso: texweb <comando> [cartella]

  dev    avvia il server di sviluppo e rigenera a ogni salvataggio
  build  genera il sito statico (in dist/, o in outDir della configurazione)
  check  controlla i sorgenti senza scrivere niente (comandi sconosciuti, riferimenti, widget)

opzioni:
  --port <n>   porta del server di sviluppo (predefinita 5180)
  --force      completa la build anche se ci sono errori
  --cache <d>  cartella di lavoro (predefinita .texweb/ nel progetto)
  --out <d>    cartella del sito generato (predefinita dist/)`;

const overrides = {};
if (opt('cache')) overrides.cacheDir = opt('cache');
if (opt('out')) overrides.outDir = opt('out');

if (cmd === 'dev') await dev(dir, { port: Number(opt('port')) || 5180, overrides });
else if (cmd === 'build') await build(dir, { force: flag('force'), overrides });
else if (cmd === 'check') await check(dir);
else {
  console.log(usage);
  process.exitCode = cmd ? 1 : 0;
}
