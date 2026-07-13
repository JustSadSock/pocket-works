import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'apps', 'sente', 'assets', 'gnugo');

const ASSETS = [
  {
    name: 'gnugo.js',
    url: 'https://raw.githubusercontent.com/TristanCacqueray/wasm-gnugo/382df5a9b14b62ea451012ec7d2e81c61162e037/javascript/gnugo.js',
    blob: 'a8addd04befb3254d06aadb6ec319ab6913511a1'
  },
  {
    name: 'gnugo.wasm',
    url: 'https://raw.githubusercontent.com/TristanCacqueray/wasm-gnugo/382df5a9b14b62ea451012ec7d2e81c61162e037/gnugo.wasm',
    blob: 'ce0f0f6a20deb8366c75d7c7ea14dadf0b856f58'
  },
  {
    name: 'COPYING.txt',
    url: 'https://raw.githubusercontent.com/TristanCacqueray/wasm-gnugo/382df5a9b14b62ea451012ec7d2e81c61162e037/COPYING',
    blob: '94a9ed024d3859793618152ea559a168bbcbb5e2'
  }
];

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

async function validExisting(asset) {
  try {
    const buffer = await readFile(path.join(output, asset.name));
    return gitBlobSha(buffer) === asset.blob;
  } catch {
    return false;
  }
}

async function download(asset) {
  if (await validExisting(asset)) return;
  const response = await fetch(asset.url, {
    headers: { 'user-agent': 'Pocket-Works-SENTE-build/2.0' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Failed to download ${asset.name}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = gitBlobSha(buffer);
  if (actual !== asset.blob) {
    throw new Error(`${asset.name} integrity mismatch: expected ${asset.blob}, got ${actual}`);
  }
  await writeFile(path.join(output, asset.name), buffer);
}

await mkdir(output, { recursive: true });
for (const asset of ASSETS) await download(asset);

const sourceNotice = `GNU Go browser engine\n\nUpstream: https://github.com/TristanCacqueray/wasm-gnugo\nPinned commit: 382df5a9b14b62ea451012ec7d2e81c61162e037\nGNU Go version reported by the build: 3.9.1\nLicense: GNU General Public License v3 or later (see COPYING.txt)\n\nThe JavaScript loader and WebAssembly binary are downloaded during the Pocket Works build and verified against their Git blob SHA-1 identifiers. The corresponding source is available at the pinned upstream commit above.\n`;
await writeFile(path.join(output, 'SOURCE.txt'), sourceNotice, 'utf8');
console.log('Prepared pinned GNU Go browser assets for SENTE.');
