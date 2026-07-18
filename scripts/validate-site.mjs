import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';

const root = process.cwd();
const output = path.join(root, 'dist-site');
const errors = [];
async function exists(target) { try { await access(target); return true; } catch { return false; } }

for (const file of [
  'index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js',
  'launcher-update-all.js','launcher-update-all-v2.js','launcher-sync.js','manifest.webmanifest','sw.js','apps.json'
]) {
  if (!(await exists(path.join(output, file)))) errors.push(`dist-site is missing ${file}`);
}
for (const forbidden of ['node_modules','scripts','docs','package.json','wrangler.jsonc']) {
  if (await exists(path.join(output, forbidden))) errors.push(`dist-site must not publish ${forbidden}`);
}
const configs = await collectAppConfigs(root);
for (const config of configs) {
  const directory = path.join(output, 'apps', config.slug);
  for (const file of ['index.html','styles.css','app.js','app.config.json','manifest.webmanifest','sw.js','icons']) {
    if (!(await exists(path.join(directory, file)))) errors.push(`dist-site/apps/${config.slug} is missing ${file}`);
  }
  for (const forbidden of ['source','public','.dist','package.json','vite.config.ts','tsconfig.json']) {
    if (await exists(path.join(directory, forbidden))) errors.push(`dist-site/apps/${config.slug} must not publish ${forbidden}`);
  }
}
if (await exists(path.join(output, 'apps'))) {
  const deployed = (await readdir(path.join(output, 'apps'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const expected = new Set(configs.map((config) => config.slug));
  for (const directory of deployed) if (!expected.has(directory)) errors.push(`dist-site includes unregistered app directory ${directory}`);
}
if (errors.length > 0) {
  console.error(`Production output validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Production output contains only deployable Pocket Works assets.');