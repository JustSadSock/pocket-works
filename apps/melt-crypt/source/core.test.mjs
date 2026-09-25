import assert from 'node:assert/strict';
import { createMonsterGenome, generateDungeon, makeRng, mapLookDelta, rollLoot } from './core.js';

const rngA = makeRng(12345);
const rngB = makeRng(12345);
for (let i = 0; i < 20; i += 1) assert.equal(rngA(), rngB(), 'seeded RNG must be deterministic');
assert.ok(mapLookDelta(0, -12, 0.0032, 1).y < 0, 'upward drag must produce upward camera pitch');
assert.ok(mapLookDelta(0, 12, 0.0032, 1).y > 0, 'downward drag must produce downward camera pitch');

for (let floor = 1; floor <= 12; floor += 1) {
  const dungeon = generateDungeon(0xdeadbeef, floor);
  assert.ok(dungeon.rooms.length >= 6, 'dungeon should have enough rooms');
  assert.ok(dungeon.requiredKills >= 3 && dungeon.requiredKills <= dungeon.totalMonsters, 'kill requirement must be attainable');
  const positions = new Set(dungeon.rooms.map((room) => `${room.gx},${room.gz}`));
  assert.equal(positions.size, dungeon.rooms.length, 'rooms must occupy unique cells');
  const seen = new Set([dungeon.startId]);
  const queue = [dungeon.startId];
  while (queue.length) {
    const id = queue.shift();
    for (const next of Object.values(dungeon.rooms[id].links)) {
      if (next !== null && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.equal(seen.size, dungeon.rooms.length, 'every room must be connected');
  assert.ok(seen.has(dungeon.gateId), 'exit room must be reachable');
  for (const room of dungeon.rooms) {
    for (const [side, nextId] of Object.entries(room.links)) {
      if (nextId === null) continue;
      const next = dungeon.rooms[nextId];
      if (side === 'e' || side === 'w') {
        assert.ok(room.sizeX / 2 + next.sizeX / 2 < dungeon.spacing, 'linked east/west room walls must not overlap');
      } else {
        assert.ok(room.sizeZ / 2 + next.sizeZ / 2 < dungeon.spacing, 'linked north/south room walls must not overlap');
      }
    }
  }
}

const genomeA = createMonsterGenome(424242, 7, 1.4);
const genomeB = createMonsterGenome(424242, 7, 1.4);
assert.deepEqual(genomeA, genomeB, 'monster genome must be deterministic');
assert.ok(['spit','blink','rush','split','leech','burst'].includes(genomeA.ability));
assert.ok(genomeA.maxHp > 0 && genomeA.speed > 0 && genomeA.damage > 0);
assert.ok(['breathe','skitter','tilt','pulse'].includes(genomeA.motion));
const silhouettes = new Set();
for (let i = 0; i < 160; i += 1) silhouettes.add(createMonsterGenome(i * 7919 + 17, 8, 1.2).body);
assert.ok(silhouettes.size >= 7, 'procedural population should expose broad silhouette variety');

for (let i = 0; i < 50; i += 1) {
  const loot = rollLoot(i * 991, 5);
  assert.ok(['relic','potion'].includes(loot.type));
  assert.ok(loot.item?.id && loot.item?.name);
}

console.log('MELT//CRYPT core tests passed');
