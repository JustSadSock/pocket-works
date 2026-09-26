import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);
const sourceOnly = argv.includes('--source-only');
function optionValue(name) {
  const inline = argv.find((argument) => argument.startsWith(name + '='));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}
const requestedApp = optionValue('--app');
const errors = [];
const fail = (message) => errors.push(message);

async function exists(relativePath) {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
}

async function read(relativePath) {
  try { return await readFile(path.join(root, relativePath), 'utf8'); }
  catch (error) { fail(relativePath + ': ' + error.message); return ''; }
}

function requireFragments(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) fail(label + ' must include ' + fragment);
}

async function validateProject(directory, storageNamespace, isTemplate = false) {
  const project = await read(directory + '/project.godot');
  const exportPresets = await read(directory + '/export_presets.cfg');
  const bridge = await read(directory + '/source/pocket_works.gd');
  const main = await read(directory + '/source/main.gd');
  const scene = await read(directory + '/source/main.tscn');

  requireFragments(project, [
    'run/main_scene',
    'renderer/rendering_method="gl_compatibility"',
    'renderer/rendering_method.mobile="gl_compatibility"',
    'PocketWorks="*res://source/pocket_works.gd"'
  ], directory + '/project.godot');

  requireFragments(exportPresets, [
    'platform="Web"',
    'variant/thread_support=false',
    'variant/extensions_support=false'
  ], directory + '/export_presets.cfg');

  requireFragments(bridge, [
    'extends Node',
    'JavaScriptBridge',
    'func exit_to_launcher',
    'func publish_test_state',
    'func storage_set',
    'func storage_get',
    'func storage_remove'
  ], directory + '/source/pocket_works.gd');

  if (isTemplate) {
    if (!bridge.includes('__APP_STORAGE_NAMESPACE__')) fail(directory + '/source/pocket_works.gd must retain __APP_STORAGE_NAMESPACE__');
  } else if (!bridge.includes(storageNamespace)) {
    fail(directory + '/source/pocket_works.gd must include storage namespace ' + storageNamespace);
  }

  requireFragments(main, [
    'PocketWorks.publish_test_state',
    'PocketWorks.exit_to_launcher'
  ], directory + '/source/main.gd');

  requireFragments(scene, [
    'type="Button"',
    'text = "Pocket Works"',
    'method="_on_exit_pressed"'
  ], directory + '/source/main.tscn');
}

async function validateWeb(config) {
  const directory = 'apps/' + config.slug + '/web';
  if (!(await exists(directory + '/index.html'))) return false;

  for (const file of ['index.html', 'manifest.webmanifest', 'sw.js', 'pocketworks-build.json', 'icons/icon.svg']) {
    if (!(await exists(directory + '/' + file))) fail(directory + ' is missing ' + file);
  }

  const entries = await readdir(path.join(root, directory));
  if (!entries.some((name) => name.endsWith('.wasm'))) fail(directory + ' has no .wasm engine payload');
  if (!entries.some((name) => name.endsWith('.pck'))) fail(directory + ' has no .pck project payload');

  const html = await read(directory + '/index.html');
  requireFragments(html, [
    'viewport-fit=cover',
    './manifest.webmanifest',
    "serviceWorker.register('./sw.js')",
    'pocketworks-godot-shell'
  ], directory + '/index.html');

  let manifest = null;
  try { manifest = JSON.parse(await read(directory + '/manifest.webmanifest')); }
  catch (error) { fail(directory + '/manifest.webmanifest is invalid JSON: ' + error.message); }
  if (manifest) {
    if (manifest.id !== '/apps/' + config.slug + '/') fail(directory + '/manifest.webmanifest id mismatch');
    if (manifest.start_url !== './' || manifest.scope !== './') fail(directory + '/manifest.webmanifest must remain app-scoped');
    if (manifest.orientation !== config.orientation) fail(directory + '/manifest.webmanifest orientation mismatch');
  }

  const worker = await read(directory + '/sw.js');
  requireFragments(worker, [
    'const APP_VERSION = ' + JSON.stringify(config.version),
    'const CACHE_NAME = ' + JSON.stringify(config.cacheName),
    'const CACHE_PREFIX = ' + JSON.stringify(config.slug + '-'),
    'GET_UPDATE_INFO',
    'SKIP_WAITING',
    '../../shared/release-guard.js',
    'ignoreSearch: true'
  ], directory + '/sw.js');

  let marker = null;
  try { marker = JSON.parse(await read(directory + '/pocketworks-build.json')); }
  catch (error) { fail(directory + '/pocketworks-build.json is invalid JSON: ' + error.message); }
  if (marker) {
    if (marker.schemaVersion !== 1 || marker.runtime !== 'godot' || marker.engine !== 'godot') fail(directory + '/pocketworks-build.json has an invalid runtime contract');
    if (marker.slug !== config.slug || marker.version !== config.version) fail(directory + '/pocketworks-build.json release metadata mismatch');
    if (typeof marker.engineVersion !== 'string' || marker.engineVersion.trim() === '') fail(directory + '/pocketworks-build.json must record engineVersion');
    if (!/^[0-9a-f]{64}$/.test(marker.sourceFingerprint || '')) fail(directory + '/pocketworks-build.json sourceFingerprint is invalid');
  }
  return true;
}

await validateProject('apps/_godot-template', '__APP_STORAGE_NAMESPACE__', true);

const allConfigs = (await collectAppConfigs(root)).filter((config) => runtimeForConfig(config) === 'godot');
const configs = requestedApp ? allConfigs.filter((config) => config.slug === requestedApp) : allConfigs;
if (requestedApp && configs.length === 0) fail('Requested Godot app is not registered: ' + requestedApp);
let built = 0;
for (const config of configs) {
  const directory = 'apps/' + config.slug;
  await validateProject(directory, config.storageNamespace);
  for (const required of ['icons/icon.svg', 'README.md']) if (!(await exists(directory + '/' + required))) fail(directory + ' is missing ' + required);
  if (!sourceOnly && await validateWeb(config)) built += 1;
}

if (errors.length > 0) {
  console.error('Godot Web runtime validation failed with ' + errors.length + ' issue(s):');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log(sourceOnly
  ? 'Godot source contract passed for ' + configs.length + ' registered app(s); generated Web freshness was intentionally deferred until export.'
  : 'Godot Web runtime contract passed for ' + configs.length + ' registered app(s); ' + built + ' have committed Web exports.');
