import test from 'node:test';
import assert from 'node:assert/strict';
import { compressJson, decompressJson } from '../platform/compression.js';

test('world archive round-trips through gzip or JSON fallback', async () => {
  const world = { generation: 77, species: [{ id: 1, name: 'Forma' }], nested: { value: 3 } };
  const archive = await compressJson(world);
  const restored = await decompressJson(archive.bytes);
  assert.deepEqual(restored, world);
  assert.ok(archive.bytes.length > 0);
});
