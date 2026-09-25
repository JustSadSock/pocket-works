import { describe, expect, it } from 'vitest';
import { RELICS, ROOM_MODULES, generateDungeon, mapLookDelta, rollLoot } from './core.js';

describe('MELT//CRYPT Combat Rebuild core', () => {
  it('maps vertical look in the natural direction', () => {
    expect(mapLookDelta(0, -12, 0.0032, 1).y).toBeLessThan(0);
    expect(mapLookDelta(0, 12, 0.0032, 1).y).toBeGreaterThan(0);
  });

  it('builds deterministic connected floors from authored room modules', () => {
    const a = generateDungeon(0xdeadbeef, 5);
    const b = generateDungeon(0xdeadbeef, 5);
    expect(a).toEqual(b);
    expect(ROOM_MODULES).toHaveLength(26);
    expect(a.rooms.length).toBeGreaterThanOrEqual(6);
    for (const room of a.rooms) {
      expect(ROOM_MODULES.some((module) => module.id === room.module)).toBe(true);
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

  it('keeps relic progression mechanic-first', () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(8);
    for (const relic of RELICS) {
      expect(relic.effect).toBeTruthy();
      expect('stat' in relic).toBe(false);
    }
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
