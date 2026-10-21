import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { dentVertices, impactDirection } from './detail-crush';

describe('localized visual damage on authored trim', () => {
  it('dents only vertices close to the contact, not the opposite side', () => {
    const v = new Float32Array([0, 0, 0, 2.5, 0, 0, 0.4, 0, 0]);
    const c = new Float32Array(3);
    dentVertices(v,c,Vector3.Zero(),new Vector3(0,0,-1),1,0.8);
    expect(v[2]).toBeLessThan(-0.15);
    expect(v[5]).toBe(0);
    expect(v[8]).toBeLessThan(0);
  });
  it('progressively crushes with a finite depth rather than exploding on repeat impacts', () => {
    const v = new Float32Array([0, 0, 0]);
    const c = new Float32Array(1);
    for (let i = 0; i < 100; i++) dentVertices(v,c,Vector3.Zero(),new Vector3(0,0,-1),1.4,1);
    expect(c[0]).toBeLessThanOrEqual(0.48);
    expect(v[2]).toBeGreaterThanOrEqual(-0.48);
    expect(v[2]).toBeLessThan(-0.3);
  });
  it('pushes front, rear and sides into the vehicle, not outward', () => {
    expect(impactDirection('front',Vector3.Zero()).z).toBeLessThan(-0.9);
    expect(impactDirection('rear',Vector3.Zero()).z).toBeGreaterThan(0.9);
    expect(impactDirection('left',Vector3.Zero()).x).toBeGreaterThan(0.9);
    expect(impactDirection('right',Vector3.Zero()).x).toBeLessThan(-0.9);
    expect(impactDirection('roof',Vector3.Zero()).y).toBeLessThan(-0.9);
  });
});
