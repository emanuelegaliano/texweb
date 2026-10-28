import fs from 'node:fs';
import path from 'node:path';
import { createServer, build as viteBuild } from 'vite';
import { FRAMEWORK, loadConfig, generate, findWidgets } from './site.js';

// macOS disks are case-insensitive but Vite is not: allow both the path as typed by the
// user and the real one (e.g. ~/Documents/misc and ~/Documents/MIsc)
const variants = (p) => [...new Set([p, fs.realpathSync.native(p)])];

// Vite configuration shared by dev and build: the root is the generated folder,
// the project's widgets import 'texweb/client' and the framework's dependencies
function viteConfig(root, cfg, { server, ...extra } = {}) {
  return {
    root: cfg.siteDir,
    base: './',
    configFile: false,
    cacheDir: path.join(cfg.cacheDir, 'vite'), // no stray .vite/ in the notes folder
    logLevel: 'warn',
    appType: 'mpa',
    resolve: { alias: { 'texweb/client': path.join(FRAMEWORK, 'client', 'index.js') } },
    server: { fs: { allow: [...variants(root), ...variants(FRAMEWORK)] }, ...server },
    plugins: [frameworkDeps()],
    ...extra,
  };
}

// notes projects have no node_modules: widget dependencies (katex, three, ...)
// are resolved from the framework's
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
  console.log(`  ${pages.length} pages in ${ms} ms${e || w ? ` · ${e} errors, ${w} warnings` : ''}`);
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
      console.error(`  generation failed: ${e.stack ?? e}`);
    }
  };
  // listen first, then generate: loading widgets that import CSS needs a running server
  await server.listen();
  await regen();
  const url = server.resolvedUrls.local[0];
  console.log(`\n  texweb ready at ${url}\n`);

  // regenerate when a .tex, a .bib, the configuration or a widget changes
  let timer = null;
  const watched = (f) => !f.startsWith(cfg.cacheDir) && !f.includes(`${path.sep}node_modules${path.sep}`)
    && (/\.(tex|bib|sty)$/.test(f) || f.endsWith('texweb.config.js') || f.startsWith(cfg.widgetsDir));
  server.watcher.add(root);
  server.watcher.on('all', async (_event, file) => {
    if (!watched(file)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log(`  changed ${path.relative(root, file)}`);
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
  // a server without HTTP, only to load the widget definitions
  const loader = await createServer(viteConfig(root, cfg, { server: { middlewareMode: true, hmr: false }, appType: 'custom' }));
  const result = await generate(root, cfg, loader, { dev: false });
  await loader.close();
  report(result, root);
  if (result.diag.errors.length && !force) {
    console.error('\n  build stopped because of the errors above (use --force to ignore them)');
    process.exitCode = 1;
    return;
  }
  const input = Object.fromEntries(fs.readdirSync(cfg.siteDir).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), path.join(cfg.siteDir, f)]));
  await viteBuild(viteConfig(root, cfg, { build: { outDir: cfg.outDir, emptyOutDir: true, rollupOptions: { input } } }));
  console.log(`  site ready in ${path.relative(process.cwd(), cfg.outDir) || cfg.outDir}`);
}

// checks the sources against the dialect without writing anything: useful on an existing project
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
  console.log(`  ${result.tikz} TikZ figures to compile, ${result.widgets.size} widgets`);
  if (result.diag.errors.length) process.exitCode = 1;
}
