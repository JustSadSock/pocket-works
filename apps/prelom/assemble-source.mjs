import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const archiveDirectory = path.join(appRoot, 'source', 'runtime-archive');
const output = path.join(appRoot, 'source', 'runtime-generated.ts');
const parts = (await readdir(archiveDirectory)).filter((name) => name.endsWith('.gzpart')).sort();
if (parts.length === 0) throw new Error('ПРЕЛОМ runtime source archive is missing.');
const compressed = Buffer.concat(await Promise.all(parts.map((name) => readFile(path.join(archiveDirectory, name)))));
const source = gunzipSync(compressed).toString('utf8');
if (!source.includes('export type Vec') || !source.includes("if(typeof document!=='undefined')boot();")) {
  throw new Error('ПРЕЛОМ runtime source assembly failed its integrity markers.');
}
await writeFile(output, source);
console.log(`Assembled ПРЕЛОМ runtime from ${parts.length} deterministic archive parts.`);
