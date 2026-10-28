import fs from 'node:fs';
import path from 'node:path';
import { createServer, build as viteBuild } from 'vite';
import { FRAMEWORK, loadConfig, generate, findWidgets } from './site.js';

// su macOS il disco non distingue maiuscole e minuscole, Vite sì: si autorizzano sia il
// percorso scritto dall'utente sia quello reale (ad esempio ~/Documents/misc e ~/Documents/MIsc)
const variants = (p) => [...new Set([p, fs.realpathSync.native(p)])];

// configurazione di Vite comune a dev e build: la radice è la cartella generata,
// i widget del progetto importano 'texweb/client' e le dipendenze del framework
function viteConfig(root, cfg, { server, ...extra } = {}) {
  return {
    root: cfg.siteDir,
    base: './',
    configFile: false,
    cacheDir: path.join(cfg.cacheDir, 'vite'), // niente .vite/ sparse nella cartella degli appunti
    logLevel: 'warn',
    appType: 'mpa',
    resolve: { alias: { 'texweb/client': path.join(FRAMEWORK, 'client', 'index.js') } },
    server: { fs: { allow: [...variants(root), ...variants(FRAMEWORK)] }, ...server },
    plugins: [frameworkDeps()],
    ...extra,
  };
}

// i progetti di appunti non hanno node_modules: le dipendenze dei widget (katex, three, ...)
// si cercano tra quelle del framework
function frameworkDeps() {
  const anchor = path.join(FRAMEWORK, 'client', 'index.js');
  return {
    name: 'texweb:deps',
    enforce: 'pre',
    async resolveId(id, importer, opts) {
      if (!importer || id.startsWith('.') || id.startsWith('/') || id.startsWith('\0') || id.includes(':')) return null;
      if (importer.startsWith(FRAMEWORK)) return null;
      const own = await this.resolve(id, importer, { ...opts, skipSelf: true });
      if (own) return own;
      return this.resolve(id, anchor, { ...opts, skipSelf: true });
    },
  };
}

function report(result, root) {
  const { diag, pages, ms } = result;
  const out = diag.format();
  if (out) console.log(out);
  const e = diag.errors.length, w = diag.items.length - e;
  console.log(`  ${pages.length} pagine in ${ms} ms${e || w ? ` · ${e} errori, ${w} avvisi` : ''}`);
}

export async function dev(root, { port = 5180, overrides = {} } = {}) {
  root = path.resolve(root);
  let cfg = await loadConfig(root, overrides);
  fs.mkdirSync(cfg.siteDir, { recursive: true });
  const server = await createServer(viteConfig(root, cfg, { server: { port } }));

  const regen = async () => {
    server.moduleGraph.invalidateAll();
    try {
      report(await generate(root, cfg, server, { dev: true }), root);
    } catch (e) {
      console.error(`  generazione fallita: ${e.stack ?? e}`);
    }
  };
  // prima listen, poi la generazione: il caricamento dei widget con CSS richiede il server avviato
  await server.listen();
  await regen();
  const url = server.resolvedUrls.local[0];
  console.log(`\n  texweb pronto su ${url}\n`);

  // si rigenera quando cambia un .tex, un .bib, la configurazione o un widget
  let timer = null;
  const watched = (f) => !f.startsWith(cfg.cacheDir) && !f.includes(`${path.sep}node_modules${path.sep}`)
    && (/\.(tex|bib|sty)$/.test(f) || f.endsWith('texweb.config.js') || f.startsWith(cfg.widgetsDir));
  server.watcher.add(root);
  server.watcher.on('all', async (_event, file) => {
    if (!watched(file)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log(`  modificato ${path.relative(root, file)}`);
      if (file.endsWith('texweb.config.js')) cfg = await loadConfig(root, overrides);
      await regen();
      server.ws.send({ type: 'full-reload' });
    }, 80);
  });
  return server;
}

export async function build(root, { force = false, overrides = {} } = {}) {
  root = path.resolve(root);
  const cfg = await loadConfig(root, overrides);
  fs.mkdirSync(cfg.siteDir, { recursive: true });
  // un server senza HTTP, solo per leggere le definizioni dei widget
  const loader = await createServer(viteConfig(root, cfg, { server: { middlewareMode: true, hmr: false }, appType: 'custom' }));
  const result = await generate(root, cfg, loader, { dev: false });
  await loader.close();
  report(result, root);
  if (result.diag.errors.length && !force) {
    console.error('\n  build interrotta per gli errori qui sopra (usa --force per ignorarli)');
    process.exitCode = 1;
    return;
  }
  const input = Object.fromEntries(fs.readdirSync(cfg.siteDir).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), path.join(cfg.siteDir, f)]));
  await viteBuild(viteConfig(root, cfg, { build: { outDir: cfg.outDir, emptyOutDir: true, rollupOptions: { input } } }));
  console.log(`  sito pronto in ${path.relative(process.cwd(), cfg.outDir) || cfg.outDir}`);
}

// controlla il dialetto senza scrivere niente: utile su un progetto esistente
export async function check(root) {
  root = path.resolve(root);
  const cfg = await loadConfig(root);
  const hasWidgets = findWidgets(cfg.widgetsDir).length > 0;
  const loader = hasWidgets
    ? await createServer(viteConfig(root, cfg, { root, server: { middlewareMode: true, hmr: false }, appType: 'custom' }))
    : null;
  const result = await generate(root, cfg, loader, { check: true });
  await loader?.close();
  report(result, root);
  console.log(`  ${result.tikz} figure TikZ da compilare, ${result.widgets.size} widget`);
  if (result.diag.errors.length) process.exitCode = 1;
}
