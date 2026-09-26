import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const GODOT_VERSION = process.env.GODOT_VERSION || '4.7.2';
const GODOT_BIN = process.env.GODOT_BIN || 'godot';

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function walkFiles(directory, prefix = '') {
  const files = [];
  if (!(await exists(directory))) return files;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.godot' || entry.name === 'web') continue;
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative));
    else files.push(relative);
  }
  return files.sort();
}

async function sourceFingerprint(directory) {
  const hash = createHash('sha256');
  for (const relative of await walkFiles(directory)) {
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(path.join(directory, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function optionValue(argv, name) {
  const inline = argv.find((argument) => argument.startsWith(name + '='));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function changedScope(base) {
  let output = '';
  try {
    output = execFileSync('git', ['diff', '--name-only', base + '..HEAD'], { encoding: 'utf8' });
  } catch {
    try { output = execFileSync('git', ['diff', '--name-only', 'HEAD^..HEAD'], { encoding: 'utf8' }); }
    catch { return { rebuildAll: false, slugs: [] }; }
  }

  const slugs = new Set();
  let rebuildAll = false;
  for (const file of output.split(/\r?\n/)) {
    if (
      file === 'scripts/build-godot.mjs' ||
      file === 'scripts/app-config.mjs' ||
      file === '.github/workflows/godot-web-runtime.yml' ||
      file.startsWith('apps/_godot-template/')
    ) rebuildAll = true;

    const match = file.match(/^apps\/([^/]+)\/(.+)$/);
    if (!match || match[1].startsWith('_') || match[2].startsWith('web/')) continue;
    slugs.add(match[1]);
  }
  return { rebuildAll, slugs: [...slugs].sort() };
}

function htmlShell(html, config) {
  const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">';
  if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)) html = html.replace(/<meta[^>]+name=["']viewport["'][^>]*>/i, viewport);
  else html = html.replace(/<head>/i, '<head>\n  ' + viewport);

  const shellHead = [
    '  <meta name="theme-color" content="' + config.themeColor + '">',
    '  <style id="pocketworks-godot-shell">',
    '    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:' + config.backgroundColor + ';overscroll-behavior:none}',
    '    body{box-sizing:border-box;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}',
    '    canvas{touch-action:none!important;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    '  </style>'
  ].join('\n');

  if (!html.includes('pocketworks-godot-shell')) html = html.replace(/<\/head>/i, shellHead + '\n</head>');
  if (!html.includes('manifest.webmanifest')) html = html.replace(/<\/head>/i, '  <link rel="manifest" href="./manifest.webmanifest">\n</head>');

  const registration = [
    '<script data-pocketworks-godot-bootstrap>',
    "if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));}",
    '</script>'
  ].join('\n');

  if (!html.includes("serviceWorker.register('./sw.js')")) html = html.replace(/<\/body>/i, registration + '\n</body>');
  return html;
}

async function generatedFiles(webDirectory) {
  const result = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map')) result.push('./' + relative);
    }
  }
  await visit(webDirectory);
  result.sort();
  return result;
}

function serviceWorkerSource(config, files) {
  const lines = [
    "const APP_VERSION = " + JSON.stringify(config.version) + ";",
    "const RELEASE_DATE = " + JSON.stringify(config.releaseDate) + ";",
    "const RELEASE_NOTES = " + JSON.stringify(config.changelog) + ";",
    "const CACHE_NAME = " + JSON.stringify(config.cacheName) + ";",
    "const CACHE_PREFIX = " + JSON.stringify(config.slug + '-') + ";",
    "const FILES = " + JSON.stringify([...files, '../../shared/release-guard.js'], null, 2) + ";",
    '',
    "self.addEventListener('install', (event) => {",
    "  event.waitUntil((async () => {",
    "    const cache = await caches.open(CACHE_NAME);",
    "    await Promise.all(FILES.map((file) => cache.add(new Request(file, { cache: 'reload' }))));",
    "  })());",
    "});",
    '',
    "self.addEventListener('activate', (event) => {",
    "  event.waitUntil((async () => {",
    "    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);",
    "    await self.clients.claim();",
    "  })());",
    "});",
    '',
    "self.addEventListener('message', (event) => {",
    "  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheName: CACHE_NAME });",
    "  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();",
    "});",
    '',
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.method !== 'GET') return;",
    "  const url = new URL(event.request.url);",
    "  if (url.origin !== self.location.origin) return;",
    "  event.respondWith((async () => {",
    "    const cached = await caches.match(event.request, { ignoreSearch: true });",
    "    if (cached) return cached;",
    "    try {",
    "      const response = await fetch(event.request);",
    "      if (response.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {",
    "        const cache = await caches.open(CACHE_NAME);",
    "        cache.put(event.request, response.clone()).catch(() => {});",
    "      }",
    "      return response;",
    "    } catch (error) {",
    "      if (event.request.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();",
    "      throw error;",
    "    }",
    "  })());",
    "});",
    ''
  ];
  return lines.join('\n');
}

async function buildApp(config) {
  const directory = path.join(root, 'apps', config.slug);
  const output = path.join(directory, 'web');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const target = path.join('web', 'index.html');
  const result = spawnSync(GODOT_BIN, ['--headless', '--path', directory, '--export-release', 'Web', target], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) throw new Error('Godot export failed for ' + config.slug);

  const indexPath = path.join(output, 'index.html');
  if (!(await exists(indexPath))) throw new Error(config.slug + ' export did not create web/index.html');

  const outputEntries = await readdir(output);
  if (!outputEntries.some((name) => name.endsWith('.wasm'))) throw new Error(config.slug + ' export did not create a WASM runtime');
  if (!outputEntries.some((name) => name.endsWith('.pck'))) throw new Error(config.slug + ' export did not create a PCK payload');

  const iconDirectory = path.join(output, 'icons');
  await mkdir(iconDirectory, { recursive: true });
  await cp(path.join(directory, 'icons', 'icon.svg'), path.join(iconDirectory, 'icon.svg'));

  const manifest = {
    id: '/apps/' + config.slug + '/',
    name: config.name,
    short_name: config.shortName,
    description: config.description,
    start_url: './',
    scope: './',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone', 'minimal-ui'],
    orientation: config.orientation,
    background_color: config.backgroundColor,
    theme_color: config.themeColor,
    icons: [{ src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
  };
  await writeFile(path.join(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const html = htmlShell(await readFile(indexPath, 'utf8'), config);
  await writeFile(indexPath, html, 'utf8');

  const marker = {
    schemaVersion: 1,
    runtime: 'godot',
    engine: 'godot',
    engineVersion: GODOT_VERSION,
    slug: config.slug,
    version: config.version,
    sourceFingerprint: await sourceFingerprint(directory)
  };
  await writeFile(path.join(output, 'pocketworks-build.json'), JSON.stringify(marker, null, 2) + '\n', 'utf8');

  const files = await generatedFiles(output);
  await writeFile(path.join(output, 'sw.js'), serviceWorkerSource(config, files), 'utf8');
  console.log('Built Godot Web app ' + config.slug + ' with Godot ' + GODOT_VERSION + '.');
}

const argv = process.argv.slice(2);
const requestedApp = optionValue(argv, '--app');
const changedFrom = optionValue(argv, '--changed-from');
const configs = (await collectAppConfigs(root)).filter((config) => runtimeForConfig(config) === 'godot');
const bySlug = new Map(configs.map((config) => [config.slug, config]));

let targetSlugs;
if (requestedApp) targetSlugs = [requestedApp];
else if (changedFrom) {
  const scope = changedScope(changedFrom);
  targetSlugs = scope.rebuildAll ? configs.map((config) => config.slug) : scope.slugs;
} else targetSlugs = configs.map((config) => config.slug);

const targets = [];
for (const slug of targetSlugs) {
  const config = bySlug.get(slug);
  if (!config) {
    if (requestedApp) throw new Error('App ' + slug + ' is not a registered Godot runtime app');
    continue;
  }
  targets.push(config);
}

if (targets.length === 0) {
  console.log('No Godot runtime apps require export.');
} else {
  for (const config of targets) await buildApp(config);
}
