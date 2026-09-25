import { describe, expect, it } from 'vitest';
import { createMonsterGenome, generateDungeon, rollLoot } from './core.js';

describe('MELT//CRYPT procedural core', () => {
  it('builds deterministic connected floors', () => {
    const a = generateDungeon(0xdeadbeef, 5);
    const b = generateDungeon(0xdeadbeef, 5);
    expect(a).toEqual(b);
    expect(a.rooms.length).toBeGreaterThanOrEqual(6);
    expect(a.requiredKills).toBeGreaterThanOrEqual(3);
    expect(a.requiredKills).toBeLessThanOrEqual(a.totalMonsters);
    for (const room of a.rooms) {
      for (const [side, nextId] of Object.entries(room.links)) {
        if (nextId === null) continue;
        const next = a.rooms[nextId as number];
        const span = side === 'e' || side === 'w'
          ? room.sizeX / 2 + next.sizeX / 2
          : room.sizeZ / 2 + next.sizeZ / 2;
        expect(span).toBeLessThan(a.spacing);
      }
    }
  });

  it('mutates monsters deterministically from their genome seed', () => {
    const a = createMonsterGenome(424242, 7, 1.4);
    const b = createMonsterGenome(424242, 7, 1.4);
    expect(a).toEqual(b);
    expect(['spit', 'blink', 'rush', 'split', 'leech', 'burst']).toContain(a.ability);
    expect(a.maxHp).toBeGreaterThan(0);
    expect(['breathe','skitter','tilt','pulse']).toContain(a.motion);
    const silhouettes = new Set(Array.from({ length: 160 }, (_, i) => createMonsterGenome(i * 7919 + 17, 8, 1.2).body));
    expect(silhouettes.size).toBeGreaterThanOrEqual(7);
  });

  it('always emits usable loot', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const loot = rollLoot(seed * 991, 4);
      expect(['relic', 'potion']).toContain(loot.type);
      expect(loot.item.id).toBeTruthy();
      expect(loot.item.name).toBeTruthy();
    }
  });
});
