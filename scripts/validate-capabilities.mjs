import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const errors = [];
const capabilityFiles = [
  'shared/capabilities/motion.js',
  'shared/capabilities/storage.js',
  'shared/capabilities/transfer.js',
  'shared/capabilities/audio.js',
  'shared/capabilities/device.js',
  'shared/capabilities/diagnostics.js',
  'shared/workshop-mode.js',
  'shared/workshop-mode.css'
];

function fail(message) { errors.push(message); }
async function read(relativePath) {
  try { return await readFile(path.join(root, relativePath), 'utf8'); }
  catch (error) { fail(`${relativePath} could not be read: ${error.message}`); return ''; }
}
async function readOptional(relativePath) {
  try { return await readFile(path.join(root, relativePath), 'utf8'); }
  catch { return ''; }
}
function requireFragments(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) fail(`${label} must include ${fragment}`);
}
function hasStorageNamespace(source, namespace) {
  return [
    `storageNamespace: '${namespace}'`,
    `storageNamespace: "${namespace}"`,
    `const STORAGE_NAMESPACE = '${namespace}'`,
    `const STORAGE_NAMESPACE = "${namespace}"`
  ].some((fragment) => source.includes(fragment));
}

const sources = new Map();
for (const file of capabilityFiles) sources.set(file, await read(file));

requireFragments(sources.get('shared/capabilities/motion.js'), ['export function animateValue', 'export function animateSpring', 'export function createRafLoop', 'prefers-reduced-motion', 'visibilitychange'], 'shared/capabilities/motion.js');
requireFragments(sources.get('shared/capabilities/storage.js'), ['export function createVersionedStore', 'export function estimateNamespaceBytes', 'export function clearNamespace', 'migrations', 'validate'], 'shared/capabilities/storage.js');
requireFragments(sources.get('shared/capabilities/transfer.js'), ['export function downloadJson', 'export async function copyText', 'export async function readJsonFile', 'maxBytes'], 'shared/capabilities/transfer.js');
requireFragments(sources.get('shared/capabilities/audio.js'), ['export function createAudioFeedback', 'AudioContext', 'visibilitychange', 'setEnabled'], 'shared/capabilities/audio.js');
requireFragments(sources.get('shared/capabilities/device.js'), ['export function getDeviceCapabilities', 'export async function watchOrientation', 'export async function watchMotion', 'export async function toggleFullscreen', 'export async function lockOrientation'], 'shared/capabilities/device.js');
requireFragments(sources.get('shared/capabilities/diagnostics.js'), ['export function createFpsProbe', 'export function createErrorCollector', 'export async function collectDiagnostics', 'export async function clearOwnedCaches', 'clearOwnedStorage'], 'shared/capabilities/diagnostics.js');
requireFragments(sources.get('shared/workshop-mode.js'), ['export function createWorkshopMode', 'setDocumentScrollLocked', 'data-workshop-trigger', 'Tap again to clear', 'Tap again to reset', 'workshopopen', 'workshopclose'], 'shared/workshop-mode.js');
requireFragments(sources.get('shared/workshop-mode.css'), ['.workshop-mode', 'env(safe-area-inset-bottom)', 'prefers-reduced-motion', '--workshop-accent'], 'shared/workshop-mode.css');

for (const [file, source] of sources) if (/https?:\/\//.test(source)) fail(`${file} must not depend on a remote runtime asset`);

const requiredOfflineFiles = capabilityFiles.map((file) => `../../${file}`);
const templateIndex = await read('apps/_template/index.html');
const templateApp = await read('apps/_template/app.js');
const templateWorker = await read('apps/_template/sw.js');
requireFragments(templateIndex, ['../../shared/workshop-mode.css', 'data-workshop-trigger'], 'apps/_template/index.html');
requireFragments(templateApp, ["from '../../shared/capabilities/storage.js'", "from '../../shared/workshop-mode.js'", 'createVersionedStore', 'createWorkshopMode'], 'apps/_template/app.js');
for (const offlineFile of requiredOfflineFiles) if (!templateWorker.includes(offlineFile)) fail(`apps/_template/sw.js must cache ${offlineFile}`);

const enhancedTemplateIndex = await read('apps/_enhanced-template/source/index.html');
const enhancedTemplateMain = await read('apps/_enhanced-template/source/main.ts');
requireFragments(enhancedTemplateIndex, ['data-workshop-trigger', 'data-app-shell'], 'apps/_enhanced-template/source/index.html');
requireFragments(enhancedTemplateMain, ['shared/workshop-mode', 'createWorkshopMode', "storageNamespace: '__APP_STORAGE_NAMESPACE__'", "cachePrefix: '__APP_SLUG__-'"], 'apps/_enhanced-template/source/main.ts');

const configs = await collectAppConfigs(root);
for (const config of configs) {
  const directory = `apps/${config.slug}`;
  if (runtimeForConfig(config) === 'enhanced') {
    const index = await read(`${directory}/source/index.html`);
    const app = await read(`${directory}/source/main.ts`);
    requireFragments(index, ['data-workshop-trigger', 'data-app-shell'], `${directory}/source/index.html`);
    requireFragments(app, ['shared/workshop-mode', 'createWorkshopMode', `cachePrefix: '${config.slug}-'`], `${directory}/source/main.ts`);
    if (!hasStorageNamespace(app, config.storageNamespace)) fail(`${directory}/source/main.ts must include storage namespace ${config.storageNamespace}`);
  } else {
    const index = await read(`${directory}/index.html`);
    const app = await read(`${directory}/app.js`);
    const workshopBootstrap = await readOptional(`${directory}/workshop.js`);
    const integrationSource = `${app}\n${workshopBootstrap}`;
    const worker = await read(`${directory}/sw.js`);
    requireFragments(index, ['../../shared/workshop-mode.css', 'data-workshop-trigger'], `${directory}/index.html`);
    if (workshopBootstrap) requireFragments(index, ['./workshop.js'], `${directory}/index.html`);
    requireFragments(integrationSource, ["from '../../shared/workshop-mode.js'", 'createWorkshopMode', `cachePrefix: '${config.slug}-'`], `${directory} Workshop integration`);
    if (!hasStorageNamespace(integrationSource, config.storageNamespace)) fail(`${directory} Workshop integration must include storage namespace ${config.storageNamespace}`);
    if (app.includes("navigator.serviceWorker.register('./sw.js')")) fail(`${directory}/app.js must leave Service Worker registration to update-manager`);
    for (const offlineFile of requiredOfflineFiles) if (!worker.includes(offlineFile)) fail(`${directory}/sw.js must cache ${offlineFile}`);
  }
}

if (errors.length > 0) {
  console.error(`Capability validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Shared capabilities and Workshop Mode passed for Quick and Enhanced templates plus ${configs.length} published app${configs.length === 1 ? '' : 's'}.`);
