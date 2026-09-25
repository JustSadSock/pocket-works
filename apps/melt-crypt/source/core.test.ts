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
  });

  it('mutates monsters deterministically from their genome seed', () => {
    const a = createMonsterGenome(424242, 7, 1.4);
    const b = createMonsterGenome(424242, 7, 1.4);
    expect(a).toEqual(b);
    expect(['spit', 'blink', 'rush', 'split', 'leech', 'burst']).toContain(a.ability);
    expect(a.maxHp).toBeGreaterThan(0);
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
