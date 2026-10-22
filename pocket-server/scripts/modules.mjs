import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const apps = path.join(root, 'apps');
const url = process.env.POCKET_SERVER_URL?.replace(/\/$/, '');
const token = process.env.POCKET_DEPLOY_TOKEN;
const publishing = process.argv.includes('--publish');
if (publishing && (!url || !/^https:\/\//.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(url) || !token)) throw new Error('POCKET_SERVER_URL (HTTPS, or local HTTP) and POCKET_DEPLOY_TOKEN are required');
let count = 0;
for (const entry of await readdir(apps, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  const gameId = entry.name;
  const folder = path.join(apps, gameId, 'server');
  let config;
  try { config = JSON.parse(await readFile(path.join(folder, 'module.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (config.protocolVersion !== 1 || config.gameId !== gameId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId)) throw new Error(`Invalid module config: ${gameId}`);
  // Legacy Pocket Server requires a single self-contained Node.js module. A
  // bare .wasm import is neither supported by esbuild's default Node loader nor
  // deployable to ModuleRegistry. Compile the checked-in binary into a Node
  // WebAssembly.Module inside the bundle; gzip keeps the existing 1 MiB cap.
  const output = await build({
    entryPoints: [path.join(folder, 'module.ts')],
    bundle: true, platform: 'node', target: 'node22', format: 'esm',
    write: false, minify: true, logLevel: 'silent',
    plugins: [{
      name: 'pocket-server-embedded-wasm',
      setup(build) {
        build.onLoad({filter: /\\.wasm$/}, async ({path: filename}) => {
          const zipped = gzipSync(await readFile(filename), {level: 9, mtime: 0});
          const encoded = JSON.stringify(zipped.toString('base64'));
          return {
            loader: 'js',
            contents: 'import { gunzipSync } from "node:zlib"; ' +
              'export default new WebAssembly.Module(gunzipSync(Buffer.from(' +
              encoded + ', "base64")));'
          };
        });
      }
    }]
  });
  const bundle = output.outputFiles[0].text;
  if (Buffer.byteLength(bundle) > 1024 * 1024) {
    throw new Error('Pocket Server module '+gameId+' exceeds the existing 1 MiB upload limit (compressed WASM included)');
  }
  const sha256 = createHash('sha256').update(bundle).digest('hex');
  console.log(`${gameId}@${sha256}`);
  if (publishing) {
    const response = await fetch(`${url}/admin/modules`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, protocolVersion: 1, bundle, sha256 })
    });
    if (!response.ok) throw new Error(`Module publish failed for ${gameId}: ${response.status} ${await response.text()}`);
  }
  count++;
}
console.log(`${publishing ? 'Published' : 'Built'} ${count} Pocket Server module(s).`);
