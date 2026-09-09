import { Effect } from '@babylonjs/core/Materials/effect';
import { describe, expect, it } from 'vitest';
import { DIMENSION_MODULES } from './ship-loadout';
import {
  decodeOceanMetrics,
  hullGeneratedWave,
  isOceanHullPatchApplied,
  packOceanMetrics
} from './ocean-hull-refit';

describe('PELAGOS hull-aware ocean', () => {
  it('packs every selectable hull size into the existing shader speed channel without losing useful speed precision', () => {
    for (const option of Object.values(DIMENSION_MODULES)) {
      const packed = packOceanMetrics(4.375, option.value.length, option.value.beam);
      const decoded = decodeOceanMetrics(packed);
      expect(decoded.speed).toBeCloseTo(4.375, 5);
      expect(decoded.hullLength).toBeCloseTo(option.value.length, 1);
      expect(decoded.hullBeam).toBeCloseTo(option.value.beam, 1);
    }
  });

  it('replaces the old fixed 3.7 m bow wake with a hull-aware Froude pressure field and surface displacement', () => {
    expect(isOceanHullPatchApplied()).toBe(true);
    const vertex = Effect.ShadersStore.pelagosOceanVertexShader;
    const fragment = Effect.ShadersStore.pelagosOceanFragmentShader;
    expect(vertex).toContain('hullRelief');
    expect(vertex).toContain('generatedWave');
    expect(vertex).toContain('shoulderCrest');
    expect(vertex).toContain('froude');
    expect(fragment).toContain('bowPressure');
    expect(fragment).toContain('sternPressure');
    expect(fragment).toContain('froude');
    expect(fragment).not.toContain('forward - 3.7');
  });

  it('creates essentially no self-generated wave at rest and rises non-linearly with speed', () => {
    const rest = hullGeneratedWave(0, 3.9);
    const slow = hullGeneratedWave(1.7, 3.9);
    const fast = hullGeneratedWave(5.1, 3.9);
    expect(rest.bowRise).toBe(0);
    expect(rest.sternTrough).toBe(0);
    expect(fast.bowRise).toBeGreaterThan(slow.bowRise * 7);
    expect(fast.sternTrough).toBeGreaterThan(slow.sternTrough * 7);
    expect(fast.bowRise).toBeGreaterThan(fast.sternTrough * 2);
  });

  it('makes the short hull generate more wave at the same speed than the long cruiser', () => {
    const shortHull = hullGeneratedWave(4.3, 3.9, 10.8);
    const longHull = hullGeneratedWave(4.3, 3.9, 15.6);
    expect(shortHull.froude).toBeGreaterThan(longHull.froude);
    expect(shortHull.bowRise).toBeGreaterThan(longHull.bowRise);
    expect(shortHull.sternTrough).toBeGreaterThan(longHull.sternTrough);
  });
});
