import { describe, expect, it } from 'vitest';
import { VEHICLES } from './config';

describe('vehicle definitions', () => {
  it('ships three genuinely different physical archetypes', () => {
    expect(VEHICLES).toHaveLength(3);
    const masses = new Set(VEHICLES.map((vehicle) => vehicle.mass));
    const steering = new Set(VEHICLES.map((vehicle) => vehicle.steerMax));
    const wheelbases = new Set(VEHICLES.map((vehicle) => vehicle.wheelBase));
    const crush = new Set(VEHICLES.map((vehicle) => vehicle.crushResistance));
    expect(masses.size).toBe(3);
    expect(steering.size).toBe(3);
    expect(wheelbases.size).toBe(3);
    expect(crush.size).toBe(3);
  });

  it('gives each car multiple visual presets without duplicate paint', () => {
    for (const vehicle of VEHICLES) {
      expect(vehicle.presets.length).toBeGreaterThanOrEqual(3);
      expect(new Set(vehicle.presets.map((preset) => preset.paint)).size).toBe(vehicle.presets.length);
    }
  });

  it('keeps mass, agility and strength ordered by archetype', () => {
    const [compact, sedan, suv] = VEHICLES;
    expect(compact.mass).toBeLessThan(sedan.mass);
    expect(sedan.mass).toBeLessThan(suv.mass);
    expect(compact.steerMax).toBeGreaterThan(sedan.steerMax);
    expect(sedan.steerMax).toBeGreaterThan(suv.steerMax);
    expect(compact.crushResistance).toBeLessThan(sedan.crushResistance);
    expect(sedan.crushResistance).toBeLessThan(suv.crushResistance);
  });
});
