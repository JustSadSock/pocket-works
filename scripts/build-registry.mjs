import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistryEntries, formatRegistry } from './app-config.mjs';

export const DEFAULT_REGISTRY_OUTPUT = path.join('dist-site', 'apps.json');

export async function buildRegistry({
  root = process.cwd(),
  check = false,
  outputPath = DEFAULT_REGISTRY_OUTPUT
} = {}) {
  const entries = await buildRegistryEntries(root);
  const next = formatRegistry(entries);

  if (check) {
    console.log(`Application manifests are valid and produce ${entries.length} deterministic registry entries.`);
    return next;
  }

  const registryPath = path.resolve(root, outputPath);
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, next, 'utf8');
  console.log(`Generated ${path.relative(root, registryPath)} with ${entries.length} application entries.`);
  return next;
}

function optionValue(argumentsList, name) {
  const inline = argumentsList.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : null;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argumentsList = process.argv.slice(2);
  buildRegistry({
    check: argumentsList.includes('--check'),
    outputPath: optionValue(argumentsList, '--output') || DEFAULT_REGISTRY_OUTPUT
  }).catch((error) => {
    console.error(`Registry build failed: ${error.message}`);
    process.exit(1);
  });
}
