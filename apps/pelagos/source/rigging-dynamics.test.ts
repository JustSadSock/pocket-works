import { describe, expect, it } from 'vitest';
import { boomEndLocal, sheetSag } from './rigging-dynamics';

describe('PELAGOS living rigging', () => {
  it('tightens the mainsheet monotonically as sail load rises', () => {
    const slack = sheetSag(0, 0.8);
    const medium = sheetSag(0.5, 0.8);
    const loaded = sheetSag(1, 0.8);
    expect(slack).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(loaded);
    expect(loaded).toBeCloseTo(0.075, 5);
    expect(slack).toBeLessThan(0.46);
  });

  it('rotates the boom end around the mast pivot without changing its radius', () => {
    const straight = boomEndLocal(0);
    const starboard = boomEndLocal(Math.PI / 4);
    const port = boomEndLocal(-Math.PI / 4);
    const straightRadius = Math.hypot(straight.x, straight.z - 0.32);
    const starboardRadius = Math.hypot(starboard.x, starboard.z - 0.32);
    const portRadius = Math.hypot(port.x, port.z - 0.32);
    expect(straightRadius).toBeCloseTo(4.375, 6);
    expect(starboardRadius).toBeCloseTo(straightRadius, 6);
    expect(portRadius).toBeCloseTo(straightRadius, 6);
    expect(starboard.x).toBeLessThan(0);
    expect(port.x).toBeGreaterThan(0);
  });
});
