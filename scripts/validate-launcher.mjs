import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function requireText(source, token, label) {
  if (!source.includes(token)) errors.push(`${label} must include ${token}`);
}

function matchValue(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    errors.push(`${label} could not be resolved`);
    return null;
  }
  return match[1];
}

const [html, css, performanceCss, app, worker, guard, packageSource, manifestSource, registrySource] = await Promise.all([
  read('index.html'),
  read('styles.css'),
  read('launcher-performance.css'),
  read('app.js'),
  read('sw.js'),
  read('shared/view-transition-guard.js'),
  read('package.json'),
  read('manifest.webmanifest'),
  read('apps.json')
]);

const packageJson = JSON.parse(packageSource);
const manifest = JSON.parse(manifestSource);
const registry = JSON.parse(registrySource);

for (const id of [
  'app-search',
  'filter-strip',
  'sort-button',
  'refresh-button',
  'app-list',
  'detail-panel',
  'detail-open',
  'detail-favorite',
  'detail-copy',
  'reset-shelf'
]) {
  requireText(html, `id="${id}"`, 'index.html');
}

for (const reference of [
  './shared/mobile-runtime.css',
  './shared/update-manager.css',
  './shared/update-manager.js',
  './shared/view-transition-guard.js',
  './launcher-performance.css',
  './app.js'
]) {
  requireText(html, reference, 'index.html');
}

requireText(html, 'maximum-scale=1', 'index.html viewport');
requireText(html, 'data-app-shell', 'index.html');
requireText(html, 'data-filter="favorites"', 'index.html');
requireText(html, 'data-filter="recent"', 'index.html');
requireText(html, 'data-filter="offline"', 'index.html');
requireText(html, 'data-preview-trigger', 'index.html application template');

const cardTemplate = html.match(/<template id="app-card-template">([\s\S]*?)<\/template>/)?.[1] || '';
const previewTrigger = cardTemplate.match(/<button class="app-entry__select"[\s\S]*?<\/button>/)?.[0] || '';
if (!previewTrigger) {
  errors.push('index.html application template must contain a dedicated preview trigger button');
} else if (previewTrigger.includes('app-entry__body')) {
  errors.push('application text must remain outside the preview trigger button');
}

const htmlVersion = matchValue(html, /data-app-version="([^"]+)"/, 'index.html data-app-version');
const workerVersion = matchValue(worker, /const APP_VERSION = '([^']+)'/, 'sw.js APP_VERSION');
const cacheVersion = matchValue(worker, /const CACHE_NAME = 'pocket-works-launcher-v([^']+)'/, 'sw.js CACHE_NAME');

for (const [label, version] of [
  ['index.html', htmlVersion],
  ['sw.js APP_VERSION', workerVersion],
  ['sw.js CACHE_NAME', cacheVersion]
]) {
  if (version && version !== packageJson.version) {
    errors.push(`${label} version ${version} must equal package.json version ${packageJson.version}`);
  }
}

for (const token of [
  'installMobileRuntime()',
  'pocket-works:shelf:v1',
  'pocket-works:registry:v1',
  'favorites',
  'recents',
  'caches.keys()',
  'data-action="details"',
  'navigator.clipboard',
  'startViewTransition',
  "addEventListener('online'",
  "addEventListener('offline'",
  'setDocumentScrollLocked'
]) {
  requireText(app, token, 'app.js');
}

for (const token of [
  'installViewTransitionGuard',
  'activeTransition',
  'skipTransition()',
  'immediateTransition',
  '__pocketWorksGuarded'
]) {
  requireText(guard, token, 'shared/view-transition-guard.js');
}

for (const token of [
  '.preview-scan',
  'will-change: transform',
  '@keyframes preview-scan',
  'translateY(42px)',
  '.app-entry__body',
  'grid-column: 2',
  'The preview thumbnail is the only detail trigger'
]) {
  requireText(performanceCss, token, 'launcher-performance.css');
}

for (const selector of [
  '.command-deck',
  '.filter-strip',
  '.app-entry',
  '.app-preview',
  '.detail-panel',
  '.detail-backdrop',
  '.detail-actions',
  '@media (max-width: 980px)',
  '@media (prefers-reduced-motion: reduce)'
]) {
  requireText(css, selector, 'styles.css');
}

for (const asset of [
  './shared/mobile-runtime.css',
  './shared/mobile-runtime.js',
  './shared/update-manager.css',
  './shared/update-manager.js',
  './shared/view-transition-guard.js',
  './launcher-performance.css',
  './apps.json'
]) {
  requireText(worker, asset, 'sw.js APP_SHELL');
}

requireText(worker, "requestUrl.pathname.endsWith('/apps.json')", 'sw.js registry strategy');
requireText(worker, "event.data?.type === 'GET_UPDATE_INFO'", 'sw.js managed updates');
requireText(worker, "event.data?.type === 'SKIP_WAITING'", 'sw.js managed updates');

if (manifest.background_color !== '#0e100e' || manifest.theme_color !== '#0e100e') {
  errors.push('manifest colors must match the launcher surface #0e100e');
}

if (!Array.isArray(registry) || registry.length === 0) {
  errors.push('apps.json must contain at least one application');
} else {
  for (const appEntry of registry) {
    if (typeof appEntry.updatedAt !== 'string' || appEntry.updatedAt.length === 0) {
      errors.push(`${appEntry.slug || 'unknown app'} must expose updatedAt for the launcher`);
    }
    if (!Array.isArray(appEntry.changelog) || appEntry.changelog.length === 0) {
      errors.push(`${appEntry.slug || 'unknown app'} must expose changelog for the launcher`);
    }
    if (typeof appEntry.preset !== 'string' || appEntry.preset.length === 0) {
      errors.push(`${appEntry.slug || 'unknown app'} must expose preset for procedural preview rendering`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Launcher validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Launcher validation passed for Pocket Works ${packageJson.version} and ${registry.length} registered app${registry.length === 1 ? '' : 's'}.`);