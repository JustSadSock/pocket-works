import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistryEntries, formatRegistry } from './app-config.mjs';

export async function buildRegistry({ root = process.cwd(), check = false } = {}) {
  const registryPath = path.join(root, 'apps.json');
  const next = formatRegistry(await buildRegistryEntries(root));

  if (check) {
    let current = '';
    try {
      current = await readFile(registryPath, 'utf8');
    } catch {
      throw new Error('apps.json is missing; run npm run registry:build');
    }

    if (current !== next) {
      throw new Error('apps.json is stale; run npm run registry:build and commit the generated result');
    }

    console.log('Generated app registry is current.');
    return next;
  }

  await writeFile(registryPath, next, 'utf8');
  console.log(`Generated apps.json with ${JSON.parse(next).length} application entries.`);
  return next;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  buildRegistry({ check: process.argv.includes('--check') }).catch((error) => {
    console.error(`Registry build failed: ${error.message}`);
    process.exit(1);
  });
}
