import { describe, expect, it } from 'vitest';
import { bodySections } from './body-profile';
import { VEHICLES } from './config';

describe('authored deformable vehicle profiles', () => {
  it('has contiguous ordered rings on every vehicle', () => {
    for (const car of VEHICLES) {
      const sections = bodySections(car, 3);
      expect(sections.length).toBe(25);
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].z).toBeLessThan(sections[i - 1].z);
        expect(sections[i].roofHalf).toBeGreaterThan(0.5);
        expect(sections[i].roofHalf).toBeLessThan(1);
        expect(sections[i].halfWidth).toBeGreaterThan(0);
        expect(sections[i].crownY).toBeGreaterThan(sections[i].floorY);
      }
      expect(sections[0].z).toBeCloseTo(car.length * 0.5);
      expect(sections.at(-1)?.z).toBeCloseTo(car.length * -0.5);
    }
  });

  it('uses three genuinely different cabin silhouettes', () => {
    const samples = VEHICLES.map(car => {
      const sections = bodySections(car, 3);
      const roof = Math.max(...sections.map(s => s.crownY));
      const roofLength = sections.filter(s => s.crownY > roof * 0.85).length;
      return [roofLength, Number((roof / car.length).toFixed(3))].join('/');
    });
    expect(new Set(samples).size).toBe(3);
  });

  it('bounds tessellation under pathological quality inputs', () => {
    const car = VEHICLES[0];
    expect(bodySections(car, -100).length).toBe(9);
    expect(bodySections(car, 999).length).toBe(41);
  });
});
