import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';

const root = process.cwd();
const output = path.join(root, 'dist-site');
const rootFiles = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'apps.json'];
const appDevEntries = new Set([
  'app.config.json',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'README.md',
  'source',
  'public',
  '.dist'
]);

async function copyDirectoryFiltered(source, destination, shouldSkip) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkip(entry.name, entry)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectoryFiltered(from, to, shouldSkip);
    else await cp(from, to);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of rootFiles) await cp(path.join(root, file), path.join(output, file));

await copyDirectoryFiltered(
  path.join(root, 'shared'),
  path.join(output, 'shared'),
  (name, entry) => !entry.isDirectory() && (name.endsWith('.ts') || name.endsWith('.map'))
);

const configs = await collectAppConfigs(root);
for (const config of configs) {
  const source = path.join(root, 'apps', config.slug);
  const destination = path.join(output, 'apps', config.slug);
  await copyDirectoryFiltered(source, destination, (name) => appDevEntries.has(name) || name.endsWith('.map'));
}

console.log(`Prepared production site with ${configs.length} registered application(s) in dist-site/.`);
