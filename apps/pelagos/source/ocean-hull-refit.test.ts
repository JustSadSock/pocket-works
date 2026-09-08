import { Effect } from '@babylonjs/core/Materials/effect';
import { describe, expect, it } from 'vitest';
import { DIMENSION_MODULES } from './ship-loadout';
import {
  decodeOceanMetrics,
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

  it('replaces the old fixed 3.7 m bow wake with a hull-aware pressure field and inner-footprint wave relief', () => {
    expect(isOceanHullPatchApplied()).toBe(true);
    const vertex = Effect.ShadersStore.pelagosOceanVertexShader;
    const fragment = Effect.ShadersStore.pelagosOceanFragmentShader;
    expect(vertex).toContain('hullRelief');
    expect(vertex).toContain('hullLength');
    expect(fragment).toContain('bowPressure');
    expect(fragment).toContain('sternPressure');
    expect(fragment).not.toContain('forward - 3.7');
  });
});
