#!/usr/bin/env node
// Node's deprecation warnings about Vite's dependencies are noise for people writing notes
process.noDeprecation = true;
const { dev, build, check } = await import('../src/server.js');

const [cmd, dir = '.', ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };

const usage = `usage: texweb <command> [folder]

  dev    start the development server, regenerating on every save
  build  generate the static site (in dist/, or outDir from the configuration)
  check  check the sources without writing anything (unknown commands, references, widgets)

options:
  --port <n>   development server port (default 5180)
  --force      finish the build even if there are errors
  --cache <d>  working folder (default .texweb/ in the project)
  --out <d>    output folder of the site (default dist/)`;

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
