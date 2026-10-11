import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./game2.ts', import.meta.url), 'utf8');
const models = [...source.matchAll(/ImportMeshAsync\('', '\.\/models\/', '([^']+)'/g)].map(match => match[1]);
const audio = [...source.matchAll(/'\.\/audio\/generated\/([^']+)'/g)].map(match => match[1]);

test('the fortress and every imported character have embedded, usable GLB geometry', () => {
  assert.equal(models.length, 4);
  for (const name of models) {
    const bytes = readFileSync(new URL(`../public/models/${name}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', name);
    assert.equal(bytes.readUInt32LE(4), 2, name);
    assert.equal(bytes.readUInt32LE(8), bytes.length, name);
    let offset = 12;
    const chunks = [];
    while (offset < bytes.length) {
      const length = bytes.readUInt32LE(offset);
      assert.equal(length % 4, 0, name);
      assert.ok(offset + 8 + length <= bytes.length, name);
      chunks.push({ type: bytes.readUInt32LE(offset + 4), data: bytes.subarray(offset + 8, offset + 8 + length) });
      offset += 8 + length;
    }
    assert.equal(chunks[0].type, 0x4e4f534a, name);
    const gltf = JSON.parse(chunks[0].data.toString('utf8'));
    assert.ok(gltf.meshes?.some(mesh => mesh.primitives?.length), name);
    assert.ok(gltf.scenes?.[gltf.scene ?? 0]?.nodes?.length, name);
    assert.ok(gltf.buffers?.length, name);
    for (const buffer of gltf.buffers) {
      assert.equal(buffer.uri, undefined, `${name} must work offline without external buffers`);
      assert.ok(chunks.some(chunk => chunk.type === 0x004e4942 && chunk.data.length >= buffer.byteLength), name);
    }
  }
});

test('every gameplay audio cue exists as a nonempty Ogg/Vorbis stream', () => {
  assert.equal(audio.length, 10);
  for (const name of audio) {
    const bytes = readFileSync(new URL(`../public/audio/generated/${name}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'OggS', name);
    assert.ok(bytes.includes(Buffer.from('vorbis')), name);
    assert.ok(bytes.length > 1000, name);
  }
});
