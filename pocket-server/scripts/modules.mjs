import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const apps = path.join(root, 'apps');
const url = process.env.POCKET_SERVER_URL?.replace(/\/$/, '');
const token = process.env.POCKET_DEPLOY_TOKEN;
const publishing = process.argv.includes('--publish');
if (publishing && (!url || !/^https:\/\//.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(url) || !token)) throw new Error('POCKET_SERVER_URL (HTTPS, or local HTTP) and POCKET_DEPLOY_TOKEN are required');
// Rapier's vendored glue calls new WebAssembly.Instance(wasmModule, imports),
// which requires a compiled WebAssembly.Module rather than a Uint8Array.
// Store a compressed immutable binary inside the standalone server module.
// Node decompresses it before synchronous compilation; no external files.
const embeddedWasm = {
  name: 'embedded-node-wasm-module',
  setup(builder) {
    builder.onLoad({ filter: /\.wasm$/ }, async ({ path: wasmPath }) => {
      const bytes = gzipSync(await readFile(wasmPath), { level: 9 });
      return {
        contents: `import { gunzipSync } from 'node:zlib';\nexport default new WebAssembly.Module(gunzipSync(Buffer.from(${JSON.stringify(bytes.toString('base64'))}, 'base64')));`,
        loader: 'js'
      };
    });
  }
};

let count = 0;
for (const entry of await readdir(apps, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  const gameId = entry.name;
  const folder = path.join(apps, gameId, 'server');
  let config;
  try { config = JSON.parse(await readFile(path.join(folder, 'module.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (config.protocolVersion !== 1 || config.gameId !== gameId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId)) throw new Error(`Invalid module config: ${gameId}`);
  const output = await build({ entryPoints: [path.join(folder, 'module.ts')], bundle: true, platform: 'node', target: 'node22', format: 'esm', plugins: [embeddedWasm], write: false, minify: true, logLevel: 'silent' });
  const bundle = output.outputFiles[0].text;
  // Pocket Server rejects module bundles above 1 MiB. Fail CI before
  // attempting any partial publication if a new asset exceeds this contract.
  const bundleBytes = Buffer.byteLength(bundle);
  if (bundleBytes > 1024 * 1024) throw new Error(`Module ${gameId} is ${bundleBytes} bytes (Pocket Server limit: 1048576)`);
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
