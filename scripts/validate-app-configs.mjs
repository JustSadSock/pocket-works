import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, normalizeAppConfig, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const errors = [];
function fail(message) { errors.push(message); }

async function exists(relativePath) {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
}

async function readJson(relativePath) {
  try { return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')); }
  catch (error) { fail(`${relativePath}: ${error.message}`); return null; }
}

let configs = [];
try { configs = await collectAppConfigs(root); }
catch (error) { fail(error.message); }

for (const config of configs) {
  const directory = `apps/${config.slug}`;
  const runtime = runtimeForConfig(config);
  const manifestPath = runtime === 'godot' ? `${directory}/web/manifest.webmanifest` : `${directory}/manifest.webmanifest`;
  const manifest = runtime === 'godot' && !(await exists(manifestPath)) ? null : await readJson(manifestPath);
  if (manifest) {
    const normalizedManifest = normalizeAppConfig({
      ...config,
      name: manifest.name ?? config.name,
      shortName: manifest.short_name ?? config.shortName,
      description: manifest.description ?? config.description,
      orientation: manifest.orientation ?? config.orientation,
      backgroundColor: manifest.background_color ?? config.backgroundColor,
      themeColor: manifest.theme_color ?? config.themeColor
    }, config.slug);
    const actualManifest = {
      id: typeof manifest.id === 'string' ? manifest.id.trim() : manifest.id,
      name: normalizedManifest.name,
      short_name: normalizedManifest.shortName,
      description: normalizedManifest.description,
      orientation: normalizedManifest.orientation,
      background_color: normalizedManifest.backgroundColor,
      theme_color: normalizedManifest.themeColor
    };
    const expectedManifest = {
      id: `/apps/${config.slug}/`,
      name: config.name,
      short_name: config.shortName,
      description: config.description,
      orientation: config.orientation,
      background_color: config.backgroundColor,
      theme_color: config.themeColor
    };
    for (const [key, value] of Object.entries(expectedManifest)) {
      if (actualManifest[key] !== value) fail(`${manifestPath} ${key} must resolve to app.config.json value ${value}`);
    }
  }

  if (runtime === 'godot') {
    const project = await readFile(path.join(root, directory, 'project.godot'), 'utf8').catch((error) => { fail(`${directory}/project.godot: ${error.message}`); return ''; });
    if (!project.includes('renderer/rendering_method="gl_compatibility"')) fail(`${directory}/project.godot must use the Compatibility renderer`);
    if (!project.includes('PocketWorks="*res://source/pocket_works.gd"')) fail(`${directory}/project.godot must register the PocketWorks autoload`);
    const workerPath = `${directory}/web/sw.js`;
    if (await exists(workerPath)) {
      const worker = await readFile(path.join(root, workerPath), 'utf8');
      const cacheMatch = worker.match(/(?:const|let)\s+CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/);
      if (!cacheMatch || cacheMatch[1] !== config.cacheName) fail(`${workerPath} CACHE_NAME must equal ${config.cacheName}`);
      if (!worker.includes(JSON.stringify(config.slug + '-'))) fail(`${workerPath} must declare the ${config.slug}- cache ownership prefix`);
    }
    continue;
  }

  const workerPath = runtime === 'enhanced' ? `${directory}/source/sw.ts` : `${directory}/sw.js`;
  try {
    const worker = await readFile(path.join(root, workerPath), 'utf8');
    const cacheMatch = worker.match(/(?:const|let)\s+CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/);
    if (!cacheMatch || cacheMatch[1] !== config.cacheName) fail(`${workerPath} CACHE_NAME must equal ${config.cacheName}`);
    if (!worker.includes(`'${config.slug}-'`) && !worker.includes(`"${config.slug}-"`)) fail(`${workerPath} must declare the ${config.slug}- cache ownership prefix`);
  } catch (error) {
    fail(`${workerPath}: ${error.message}`);
  }
}

const templateChecks = [
  ['apps/_template/app.config.json', '__APP_STORAGE_NAMESPACE__'],
  ['apps/_template/app.config.json', '__APP_PRESET__'],
  ['apps/_template/app.config.json', '__APP_RELEASE_DATETIME__'],
  ['apps/_template/manifest.webmanifest', '__APP_ORIENTATION__'],
  ['apps/_template/sw.js', '__APP_CACHE_VERSION__'],
  ['apps/_template/sw.js', './app.config.json'],
  ['apps/_template/app.js', '__PRESET_SCRIPT__'],
  ['apps/_template/index.html', '__PRESET_MARKUP__'],
  ['apps/_template/styles.css', '__PRESET_STYLES__'],
  ['apps/_enhanced-template/source/sw.ts', '__APP_CACHE_VERSION__'],
  ['apps/_enhanced-template/source/main.ts', '__ENHANCED_SCRIPT__'],
  ['apps/_enhanced-template/source/index.html', '__PRESET_MARKUP__'],
  ['apps/_enhanced-template/source/styles.css', '__ENHANCED_STYLES__'],
  ['apps/_enhanced-template/vite.config.ts', '__APP_ORIENTATION__'],
  ['apps/_godot-template/project.godot', '__APP_NAME__'],
  ['apps/_godot-template/source/pocket_works.gd', '__APP_STORAGE_NAMESPACE__'],
  ['apps/_godot-template/source/main.gd', '__APP_SLUG__']
];

for (const [relativePath, token] of templateChecks) {
  try {
    const source = await readFile(path.join(root, relativePath), 'utf8');
    if (!source.includes(token)) fail(`${relativePath} must retain Forge token ${token}`);
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`Application config validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Application config validation passed for ${configs.length} self-registered app${configs.length === 1 ? '' : 's'}.`);
