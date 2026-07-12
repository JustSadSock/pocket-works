import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

async function read(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    fail(`${relativePath} could not be read: ${error.message}`);
    return '';
  }
}

function requireIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${label} must include ${fragment}`);
  }
}

function staticString(source, name) {
  return source.match(new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*['"\\\`]([^'"\\\`]+)['"\\\`]`))?.[1] || null;
}

function staticArray(source, name) {
  const match = source.match(new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`));
  if (!match) return null;
  try {
    return Function(`"use strict"; return (${match[1]});`)();
  } catch {
    return null;
  }
}

function validateWorker(source, label, expected) {
  requireIncludes(source, [
    "addEventListener('message'",
    'GET_UPDATE_INFO',
    'SKIP_WAITING',
    'event.ports',
    '../../shared/update-manager.css',
    '../../shared/update-manager.js'
  ], label);

  const installBlock = source.match(/addEventListener\(['"]install['"][\s\S]*?\n\}\);/)?.[0] || '';
  if (installBlock.includes('skipWaiting')) {
    fail(`${label} must not activate a new worker automatically during install`);
  }

  const version = staticString(source, 'APP_VERSION');
  const releaseDate = staticString(source, 'RELEASE_DATE');
  const releaseNotes = staticArray(source, 'RELEASE_NOTES');
  const cacheName = staticString(source, 'CACHE_NAME');

  if (version !== expected.version) fail(`${label} APP_VERSION must equal ${expected.version}`);
  if (releaseDate !== expected.releaseDate) fail(`${label} RELEASE_DATE must equal ${expected.releaseDate}`);
  if (cacheName !== expected.cacheName) fail(`${label} CACHE_NAME must equal ${expected.cacheName}`);

  if (expected.changelog) {
    if (JSON.stringify(releaseNotes) !== JSON.stringify(expected.changelog)) {
      fail(`${label} RELEASE_NOTES must match app.config.json changelog`);
    }
  } else if (!Array.isArray(releaseNotes) || releaseNotes.length === 0 || releaseNotes.some((note) => typeof note !== 'string' || note.trim() === '')) {
    fail(`${label} RELEASE_NOTES must contain at least one user-visible note`);
  }
}

const managerJs = await read('shared/update-manager.js');
requireIncludes(managerJs, [
  'export async function registerManagedServiceWorker',
  'GET_UPDATE_INFO',
  'SKIP_WAITING',
  'controllerchange',
  'appupdateavailable',
  'registration.update()',
  'data-update-manager'
], 'shared/update-manager.js');

const managerCss = await read('shared/update-manager.css');
requireIncludes(managerCss, [
  '.app-update-prompt',
  '.is-visible',
  'env(safe-area-inset-bottom)',
  'prefers-reduced-motion'
], 'shared/update-manager.css');

const packageJson = JSON.parse(await read('package.json') || '{}');
const rootIndex = await read('index.html');
const rootWorker = await read('sw.js');
requireIncludes(rootIndex, [
  './shared/update-manager.css',
  './shared/update-manager.js',
  'data-update-manager',
  `data-app-version="${packageJson.version}"`
], 'root index.html');

validateWorker(
  rootWorker
    .replaceAll('./shared/update-manager.css', '../../shared/update-manager.css')
    .replaceAll('./shared/update-manager.js', '../../shared/update-manager.js'),
  'root sw.js',
  {
    version: packageJson.version,
    releaseDate: '2026-07-12',
    cacheName: `pocket-works-launcher-v${packageJson.version}`
  }
);

const templateIndex = await read('apps/_template/index.html');
const templateWorker = await read('apps/_template/sw.js');
requireIncludes(templateIndex, [
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  'data-update-manager',
  'data-app-version="__APP_VERSION__"'
], 'apps/_template/index.html');
requireIncludes(templateWorker, [
  "const APP_VERSION = '__APP_VERSION__'",
  "const RELEASE_DATE = '__APP_RELEASE_DATE__'",
  'const RELEASE_NOTES = __APP_CHANGELOG_JSON__',
  'GET_UPDATE_INFO',
  'SKIP_WAITING'
], 'apps/_template/sw.js');

const templateInstall = templateWorker.match(/addEventListener\(['"]install['"][\s\S]*?\n\}\);/)?.[0] || '';
if (templateInstall.includes('skipWaiting')) fail('apps/_template/sw.js must not auto-activate during install');

const configs = await collectAppConfigs(root);
for (const config of configs) {
  const directory = `apps/${config.slug}`;
  const index = await read(`${directory}/index.html`);
  const worker = await read(`${directory}/sw.js`);

  requireIncludes(index, [
    '../../shared/update-manager.css',
    '../../shared/update-manager.js',
    'data-update-manager',
    `data-app-name="${config.name}"`,
    `data-app-version="${config.version}"`
  ], `${directory}/index.html`);

  validateWorker(worker, `${directory}/sw.js`, config);
}

if (errors.length > 0) {
  console.error(`Update contract validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Managed update contract passed for the launcher, template and ${configs.length} published app${configs.length === 1 ? '' : 's'}.`);
