import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSnapshot, makeSnapshotRecord, normalizeWorldForStorage, readSnapshotRecord } from '../platform/storage-core.js';

test('snapshot round-trip keeps biology and strips transient UI state', () => {
  const world = { generation: 44, paused: true, view: 'tree', selectedId: 7, species: [{ id: 1 }], metacommunity: { rng: 9 } };
  const record = makeSnapshotRecord(world, 3, 1000);
  const restored = readSnapshotRecord(record);
  assert.equal(restored.generation, 44);
  assert.equal(restored.paused, false);
  assert.equal(restored.view, 'world');
  assert.equal(restored.selectedId, null);
  assert.deepEqual(restored.metacommunity, { rng: 9 });
});

test('corrupt primary falls back to valid backup', () => {
  const backup = { ...makeSnapshotRecord({ generation: 9 }, 8), slot: 'backup' };
  const primary = { ...makeSnapshotRecord({ generation: 10 }, 9), checksum: 'broken', slot: 'primary' };
  const chosen = chooseSnapshot(primary, backup);
  assert.equal(chosen.payload.generation, 9);
  assert.equal(chosen.backup, true);
});

test('normalization does not mutate live state', () => {
  const world = { paused: true, nested: { value: 1 } };
  const stored = normalizeWorldForStorage(world);
  stored.nested.value = 2;
  assert.equal(world.nested.value, 1);
  assert.equal(world.paused, true);
});
