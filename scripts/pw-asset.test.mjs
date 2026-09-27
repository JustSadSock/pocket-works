import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addAsset, selectFiles, validateCatalog, verifyAsset } from './pw-asset.mjs';

const catalog = JSON.parse(await readFile(new URL('../assets/catalog.json', import.meta.url)));
test('catalog has unique semantic entries with source provenance', () => {
  assert.deepEqual(validateCatalog(catalog), []);
  assert.ok(catalog.assets.some((asset) => asset.tags.includes('rock')));
});

test('rejects unsafe dependency paths and download origins', () => {
  const asset = catalog.assets[0];
  const record = { url: 'https://dl.polyhaven.org/f.glb', size: 3, md5: 'a'.repeat(32), include: { '../escape.bin': { url: 'https://dl.polyhaven.org/x', size: 3, md5: 'a'.repeat(32) } } };
  assert.throws(() => selectFiles(asset, { gltf: { '1k': { gltf: record } } }), /Unsafe asset path/);
  assert.throws(() => selectFiles(asset, { gltf: { '1k': { gltf: { ...record, include: {}, url: 'https://evil.example/f.glb' } } } }), /Unexpected download origin/);
});

test('downloads with integrity lock, reuses cache offline, rejects tampering', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'pw-asset-'));
  const payload = Buffer.from('valid texture');
  const md5 = createHash('md5').update(payload).digest('hex');
  const asset = catalog.assets[1];
  const sourceUrl = 'https://dl.polyhaven.org/wooden_planks_1k.jpg';
  const manifest = { Diffuse: { '1k': { jpg: { url: sourceUrl, md5, size: payload.length } } } };
  let downloads = 0;
  const fetcher = async (url) => url.startsWith('https://api.polyhaven.com/')
    ? { ok: true, status: 200, url, json: async () => manifest }
    : (downloads++, { ok: true, status: 200, url, body: new ReadableStream({ start(controller) { controller.enqueue(payload); controller.close(); } }) });
  try {
    const appDir = join(projectRoot, 'apps', 'demo');
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'app.config.json'), JSON.stringify({ slug: 'demo', runtime: 'enhanced' }));
    const first = await addAsset(asset, 'demo', { projectRoot, fetcher });
    assert.equal(downloads, 1);
    assert.equal((await verifyAsset(asset, 'demo', { projectRoot })).count, 1);
    const lock = JSON.parse(await readFile(join(first.destination, 'asset.lock.json')));
    assert.equal(lock.files[0].sha256, createHash('sha256').update(payload).digest('hex'));
    await addAsset(asset, 'demo', { projectRoot, offline: true, fetcher: () => { throw new Error('network used offline'); } });
    assert.equal(downloads, 1);
    await writeFile(join(first.destination, 'wooden_planks_1k.jpg'), 'tampered');
    await assert.rejects(verifyAsset(asset, 'demo', { projectRoot }), /integrity check failed/);
    await writeFile(join(projectRoot, '.cache/pw-assets', md5), 'tampered');
    await assert.rejects(addAsset(asset, 'demo', { projectRoot, offline: true, fetcher }), /Missing cached file/);
  } finally { await rm(projectRoot, { recursive: true, force: true }); }
});
