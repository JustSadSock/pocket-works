import { describe, expect, it } from 'vitest';
import { terrainHeight, terrainNormal } from './terrain.js';

describe('SIROCCO terrain contract', () => {
  it('is deterministic and seamless at chunk boundaries', () => {
    expect(terrainHeight(123.456, -98.25)).toBe(terrainHeight(123.456, -98.25));
    for (let i = -7; i <= 7; i += 1) {
      const x = i * 42;
      expect(Math.abs(terrainHeight(x - 1e-7, 17.25) - terrainHeight(x + 1e-7, 17.25))).toBeLessThan(1e-4);
      const n = terrainNormal(x, i * 11);
      expect(Math.abs(Math.hypot(n.x, n.y, n.z) - 1)).toBeLessThan(1e-6);
    }
  });
});
