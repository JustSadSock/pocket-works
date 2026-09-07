import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../public/models/human.glb');
const source = 'https://raw.githubusercontent.com/UMRAM-Bilkent/supine-human-model/main/assets/human.glb';
const expectedSize = 698560;

await mkdir(path.dirname(target), { recursive: true });
try {
  const current = await stat(target);
  if (current.size === expectedSize) process.exit(0);
} catch {}

const response = await fetch(source, { redirect: 'follow' });
if (!response.ok) throw new Error(`Failed to fetch CC0 Quaternius humanoid: ${response.status} ${response.statusText}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.byteLength !== expectedSize) throw new Error(`Unexpected humanoid asset size: ${bytes.byteLength}, expected ${expectedSize}`);
await writeFile(target, bytes);
console.log(`Fetched CC0 Quaternius humanoid (${bytes.byteLength} bytes)`);
