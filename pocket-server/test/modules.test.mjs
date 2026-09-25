import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ModuleRegistry } from '../src/modules.mjs';

test('new rooms use the new module while existing rooms remain pinned', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pocket-modules-'));
  const registry = new ModuleRegistry(directory);
  try {
    const publish = async name => {
      const bundle = await readFile(new URL(`./fixtures/${name}.mjs`, import.meta.url), 'utf8');
      return registry.publish({ gameId: 'counter', protocolVersion: 1, bundle, sha256: createHash('sha256').update(bundle).digest('hex') });
    };
    const first = await publish('counter-v1');
    first.handle.rooms.add('old-room');
    const second = await publish('counter-v2');
    assert.equal(registry.current('counter'), second.handle);
    const oldResult = await registry.call(first.handle, 'message', { state: { count: 0 }, player: { id: 'a', name: 'A' }, players: [], payload: null });
    const newResult = await registry.call(second.handle, 'create', { player: { id: 'b', name: 'B' }, players: [], payload: null });
    assert.equal(oldResult.state.count, 1);
    assert.equal(newResult.state.count, 100);
    await registry.release(first.handle, 'old-room');
    assert.equal(registry.versions.has(`counter@${first.version}`), false);
    assert.equal(registry.current('counter'), second.handle);
  } finally {
    for (const handle of registry.versions.values()) await handle.worker.terminate();
    await rm(directory, { recursive: true, force: true });
  }
});

test('bad checksum cannot replace the active module', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pocket-modules-'));
  const registry = new ModuleRegistry(directory);
  try {
    await assert.rejects(registry.publish({ gameId: 'counter', protocolVersion: 1, bundle: 'export default {}', sha256: 'wrong' }), /checksum/);
    assert.equal(registry.current('counter'), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
