import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, sanitize, rayleighTimeUs, simulateBubble, sampleAt } from './physics.js';

test('Rayleigh collapse time scales linearly with radius, inverse square-root with pressure', () => {
  const base = rayleighTimeUs(1, 1);
  assert.ok(base > 85 && base < 100);
  assert.ok(Math.abs(rayleighTimeUs(2, 1) / base - 2) < 1e-10);
  assert.ok(Math.abs(rayleighTimeUs(1, 4) / base - 0.5) < 1e-10);
});
test('inviscid gas-free solver follows classical Rayleigh collapse estimate', () => {
  const s = simulateBubble({radiusMm: 1, pressureBar: 1, standOff: 4}, {gasPressurePa: 0, surfaceTension: 0, viscosity: 0});
  assert.ok(Math.abs(s.collapseTimeUs / s.rayleighTimeUs - 1) < 0.06, 'Rayleigh collapse should agree within six percent');
});
test('all presets integrate without NaN and return valid finite measurements', () => {
  for(const preset of Object.values(PRESETS)) {
    const s=simulateBubble(preset);
    assert.ok(s.samples.length > 100);
    assert.ok(Number.isFinite(s.collapseTimeUs) && s.collapseTimeUs > 0);
    assert.ok(s.minRatio < 0.8 && s.minRatio > 0.03);
    assert.equal(s.truncated,false,'default experiments should show gas-cushioned rebound');
    for(const point of s.samples) assert.ok(Number.isFinite(point.radius) && point.radius > 0 && Number.isFinite(point.velocity));
    assert.ok(sampleAt(s,0).radius===1);
    assert.ok(sampleAt(s,s.durationTau).radius>0);
  }
});
test('wall only affects qualitative jet strength, not the spherical solver', () => {
 const a=simulateBubble({...DEFAULTS,standOff:1.25});
 const b=simulateBubble({...DEFAULTS,standOff:4});
 assert.ok(a.jetFactor>b.jetFactor);
 assert.equal(a.collapseTimeUs,b.collapseTimeUs);
});
test('clamps imported or malformed parameters', () => {
  assert.deepEqual(sanitize({radiusMm:-100,pressureBar:999,standOff:'oops'}),{radiusMm:0.25,pressureBar:4,standOff:DEFAULTS.standOff});
});
