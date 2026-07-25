import { describe, expect, it } from 'vitest';
import { cauchyIor, reflect, refract, validateImportEnvelope, V } from './core';

const closeTo = (actual: number, expected: number, precision = 5) => expect(actual).toBeCloseTo(expected, precision);

describe('geometric optics primitives', () => {
  it('reflects a ray symmetrically around the surface normal', () => {
    const result = reflect(V.norm({ x: 1, y: -1 }), { x: 0, y: 1 });
    closeTo(result.x, Math.SQRT1_2);
    closeTo(result.y, Math.SQRT1_2);
  });

  it('obeys Snell law from air into glass', () => {
    const incidence = Math.PI / 6;
    const result = refract({ x: Math.sin(incidence), y: -Math.cos(incidence) }, { x: 0, y: 1 }, 1, 1.5);
    expect(result).not.toBeNull();
    closeTo(Math.asin(Math.abs(result!.x)), Math.asin(Math.sin(incidence) / 1.5), 6);
  });

  it('detects total internal reflection and visible-light dispersion', () => {
    const incidence = 50 * Math.PI / 180;
    expect(refract({ x: Math.sin(incidence), y: Math.cos(incidence) }, { x: 0, y: -1 }, 1.5, 1)).toBeNull();
    expect(cauchyIor(1.5, 0.005, 420)).toBeGreaterThan(cauchyIor(1.5, 0.005, 680));
  });

  it('rejects unsafe import envelopes', () => {
    expect(() => validateImportEnvelope(2_000_001, 1)).toThrow(/2 МБ/);
    expect(() => validateImportEnvelope(100, 501)).toThrow(/слишком много/i);
    expect(() => validateImportEnvelope(100, 24)).not.toThrow();
  });
});
