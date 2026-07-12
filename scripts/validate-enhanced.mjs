import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, ENHANCED_APP_PRESETS, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const errors = [];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(`${relativePath} could not be read: ${error.message}`);
    return '';
  }
}

function requireIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) errors.push(`${label} must include ${fragment}`);
  }
}

const packageJson = JSON.parse(await read('package.json') || '{}');
for (const dependency of ['vite', 'vite-plugin-pwa', 'vitest', 'typescript', 'pixi.js', 'phaser', 'tone', 'workbox-core', 'workbox-precaching', 'workbox-routing']) {
  if (!packageJson.dependencies?.[dependency] && !packageJson.devDependencies?.[dependency]) {
    errors.push(`root package.json must declare ${dependency}`);
  }
}

if (!Array.isArray(packageJson.workspaces) || !packageJson.workspaces.includes('apps/*')) {
  errors.push('root package.json must declare apps/* as an npm workspace');
}

const manager = await read('shared/enhanced-update-manager.ts');
requireIncludes(manager, ['virtual:pwa-register', 'onNeedRefresh', 'Update now', 'registerEnhancedUpdate'], 'shared/enhanced-update-manager.ts');

for (const templateFile of [
  'apps/_enhanced-template/package.json',
  'apps/_enhanced-template/vite.config.ts',
  'apps/_enhanced-template/tsconfig.json',
  'apps/_enhanced-template/source/index.html',
  'apps/_enhanced-template/source/main.ts',
  'apps/_enhanced-template/source/sw.ts',
  'apps/_enhanced-template/source/core.test.ts',
  'apps/_enhanced-template/public/icons/icon.svg'
]) {
  if (!(await exists(templateFile))) errors.push(`enhanced template is missing ${templateFile}`);
}

const templateConfig = await read('apps/_enhanced-template/vite.config.ts');
requireIncludes(templateConfig, ['VitePWA', "strategies: 'injectManifest'", "registerType: 'prompt'", "entryFileNames: 'app.js'", "manifestFilename: 'manifest.webmanifest'"], 'apps/_enhanced-template/vite.config.ts');

const templateWorker = await read('apps/_enhanced-template/source/sw.ts');
requireIncludes(templateWorker, ['precacheAndRoute', 'cleanupOutdatedCaches', 'NavigationRoute', 'GET_UPDATE_INFO', 'SKIP_WAITING'], 'apps/_enhanced-template/source/sw.ts');

const configs = await collectAppConfigs(root);
const enhancedConfigs = configs.filter((config) => runtimeForConfig(config) === 'enhanced');
for (const config of enhancedConfigs) {
  if (!ENHANCED_APP_PRESETS.includes(config.preset)) errors.push(`${config.slug} uses unknown enhanced preset ${config.preset}`);
  const directory = `apps/${config.slug}`;
  for (const file of [
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'source/index.html',
    'source/main.ts',
    'source/sw.ts',
    'source/core.ts',
    'source/core.test.ts',
    'index.html',
    'app.js',
    'styles.css',
    'manifest.webmanifest',
    'sw.js',
    'icons/icon.svg'
  ]) {
    if (!(await exists(`${directory}/${file}`))) errors.push(`${directory} is missing ${file}`);
  }

  const appPackage = JSON.parse(await read(`${directory}/package.json`) || '{}');
  if (appPackage.name !== `@pocket-works/${config.slug}`) errors.push(`${directory}/package.json has the wrong workspace name`);
  for (const script of ['build', 'test', 'typecheck']) {
    if (typeof appPackage.scripts?.[script] !== 'string') errors.push(`${directory}/package.json must define ${script}`);
  }

  try {
    const manifest = JSON.parse(await read(`${directory}/manifest.webmanifest`));
    if (manifest.id !== `/apps/${config.slug}/`) errors.push(`${directory}/manifest.webmanifest has the wrong id`);
    if (manifest.scope !== './' || manifest.start_url !== './') errors.push(`${directory}/manifest.webmanifest must remain app-scoped`);
  } catch (error) {
    errors.push(`${directory}/manifest.webmanifest is invalid JSON: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`Enhanced runtime validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Enhanced runtime contract passed for the template and ${enhancedConfigs.length} published enhanced app${enhancedConfigs.length === 1 ? '' : 's'}.`);
