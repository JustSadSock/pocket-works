import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRegistryEntries, collectAppConfigs, formatRegistry } from './app-config.mjs';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath}: ${error.message}`);
    return null;
  }
}

let configs = [];
try {
  configs = await collectAppConfigs(root);
} catch (error) {
  fail(error.message);
}

try {
  const expected = formatRegistry(await buildRegistryEntries(root));
  const actual = await readFile(path.join(root, 'apps.json'), 'utf8');
  if (actual !== expected) fail('apps.json does not match generated app.config.json metadata');
} catch (error) {
  fail(`registry comparison failed: ${error.message}`);
}

for (const config of configs) {
  const directory = `apps/${config.slug}`;
  const manifest = await readJson(`${directory}/manifest.webmanifest`);
  if (manifest) {
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
      if (manifest[key] !== value) fail(`${directory}/manifest.webmanifest ${key} must equal app.config.json value ${value}`);
    }
  }

  try {
    const worker = await readFile(path.join(root, directory, 'sw.js'), 'utf8');
    const cacheMatch = worker.match(/(?:const|let)\s+CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/);
    if (!cacheMatch || cacheMatch[1] !== config.cacheName) {
      fail(`${directory}/sw.js CACHE_NAME must equal ${config.cacheName}`);
    }
    if (!worker.includes(`'${config.slug}-'`) && !worker.includes(`"${config.slug}-"`)) {
      fail(`${directory}/sw.js must declare the ${config.slug}- cache ownership prefix`);
    }
  } catch (error) {
    fail(`${directory}/sw.js: ${error.message}`);
  }
}

const templateChecks = [
  ['apps/_template/app.config.json', '__APP_STORAGE_NAMESPACE__'],
  ['apps/_template/app.config.json', '__APP_PRESET__'],
  ['apps/_template/manifest.webmanifest', '__APP_ORIENTATION__'],
  ['apps/_template/sw.js', '__APP_CACHE_VERSION__'],
  ['apps/_template/app.js', '__PRESET_SCRIPT__'],
  ['apps/_template/index.html', '__PRESET_MARKUP__'],
  ['apps/_template/styles.css', '__PRESET_STYLES__']
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

console.log(`Application config validation passed for ${configs.length} registered app${configs.length === 1 ? '' : 's'}.`);
