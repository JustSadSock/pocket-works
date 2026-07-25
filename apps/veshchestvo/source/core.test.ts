import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, decodeSigned, diffuseTemperature, encodeSigned, migrateSave, phaseTransition, rleDecode, rleEncode, validateReactionRule, validateSave } from './core';

describe('material reactions', () => {
  it('rejects an inert rule', () => {
    expect(validateReactionRule({ with: 2, chance: 0.5 }).ok).toBe(false);
  });

  it('rejects self-sustaining energetic spread', () => {
    const result = validateReactionRule({ with: 2, chance: 0.95, spread: true, heat: 900 });
    expect(result.ok).toBe(false);
  });

  it('accepts a consuming transformation', () => {
    expect(validateReactionRule({ with: 2, chance: 0.4, selfTo: 3, heat: 20 }).ok).toBe(true);
  });
});

describe('phase transitions', () => {
  const material = { meltPoint: 0, boilPoint: 100, meltTo: 2, boilTo: 3, freezeTo: 4, condenseTo: 5 };
  it('boils before melting', () => expect(phaseTransition(material, 120)).toBe(3));
  it('melts at the threshold', () => expect(phaseTransition(material, 1)).toBe(2));
  it('freezes below hysteresis', () => expect(phaseTransition(material, -5)).toBe(4));
});

describe('temperature model', () => {
  it('moves toward neighborhood average', () => {
    const result = diffuseTemperature(20, [120, 120, 120, 120], 1, 1);
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(120);
  });

  it('respects zero conductivity', () => {
    expect(diffuseTemperature(20, [500], 0, 1)).toBe(20);
  });
});

describe('save format', () => {
  it('round-trips unsigned arrays', () => {
    const values = Uint16Array.from([1, 1, 1, 2, 2, 5, 5, 5, 5, 9]);
    expect(Array.from(rleDecode(rleEncode(values), values.length))).toEqual(Array.from(values));
  });

  it('round-trips signed arrays', () => {
    const values = Int16Array.from([-120, -120, 20, 20, 20, 1400]);
    expect(Array.from(decodeSigned(encodeSigned(values), values.length))).toEqual(Array.from(values));
  });

  it('migrates version zero', () => {
    const migrated = migrateSave({ width: 20, height: 20, materials: [], temperatures: [] });
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.camera.zoom).toBe(1);
  });

  it('rejects oversized worlds', () => {
    expect(validateSave({ formatVersion: FORMAT_VERSION, width: 1000, height: 1000, materials: [], temperatures: [] })).toBe(false);
  });
});
