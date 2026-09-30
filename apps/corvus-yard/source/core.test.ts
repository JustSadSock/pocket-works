import { describe, expect, it } from 'vitest';
import { createCrowState, hitCrow, landCrow, launchCrow, stepCrow, type Controls, type CrowState } from './core';
const neutral: Controls = { turn: 0, pitch: 0, flap: 0, brake: 0 };
function advance(s: CrowState, seconds: number, c = neutral, dt = 1 / 60) {
  for (let time = 0; time < seconds - dt / 2; time += dt) stepCrow(s, c, dt);
  return s;
}
function airborne() {
  const s = createCrowState({ x: 0, y: 50, z: 0 });
  s.grounded = false; s.velocity.z = 11;
  return s;
}
describe('crow flight dynamics', () => {
  it('launches from a support with a leg impulse then transitions into airborne locomotion', () => {
    const s = createCrowState(); launchCrow(s);
    expect(s.grounded).toBe(false); expect(s.velocity.y).toBeGreaterThan(3);
    advance(s, 1.5, { ...neutral, flap: 1 });
    expect(s.position.y).toBeGreaterThan(8.46);
    expect(s.position.z).toBeGreaterThan(6);
    expect(s.mode).toBe('flap');
  });
  it('unpowered glide spends altitude and gains forward distance without magical hovering', () => {
    const s = airborne(); advance(s, 8);
    expect(s.position.y).toBeLessThan(49);
    expect(s.position.z).toBeGreaterThan(55);
    expect(s.speed).toBeGreaterThan(4); expect(s.speed).toBeLessThan(18);
  });
  it('climbing consumes forward speed while diving converts height into speed', () => {
    const climb = airborne(), dive = airborne();
    advance(climb, 2, { ...neutral, pitch: .7 });
    advance(dive, 2, { ...neutral, pitch: -.8 });
    expect(climb.position.y).toBeGreaterThan(dive.position.y + 5);
    expect(dive.speed).toBeGreaterThan(climb.speed + 2);
    expect(dive.mode).toBe('dive');
  });
  it('recovers a dive with active strokes and climbing input', () => {
    const s = airborne(); advance(s, 1.4, { ...neutral, pitch: -.8 });
    expect(s.velocity.y).toBeLessThan(-4);
    advance(s, 2.5, { ...neutral, pitch: .9, flap: 1 });
    expect(s.velocity.y).toBeGreaterThan(0);
  });
  it('retains momentum through turns and banks gradually rather than teleporting velocity', () => {
    const s = airborne(); stepCrow(s, { ...neutral, turn: 1 }, 1 / 60);
    expect(s.velocity.z).toBeGreaterThan(10);
    expect(Math.abs(s.velocity.x)).toBeLessThan(.1);
    expect(s.roll).toBeLessThan(0); expect(s.roll).toBeGreaterThan(-.1);
    advance(s, 2, { ...neutral, turn: 1, flap: .6 });
    expect(s.position.x).toBeGreaterThan(5);
  });
  it('wing braking loses speed significantly without reversing forward momentum', () => {
    const free = airborne(), braked = airborne();
    advance(free, 1); advance(braked, 1, { ...neutral, brake: 1 });
    expect(braked.speed).toBeLessThan(free.speed * .75);
    expect(braked.position.z).toBeGreaterThan(0);
    expect(braked.mode).toBe('brake');
  });
  it('slides at a glancing contact and recovers control after a hard impact', () => {
    const mild = airborne(); mild.velocity.x = -2;
    hitCrow(mild, { x: 1, y: 0, z: 0 }, 2);
    expect(mild.velocity.x).toBeGreaterThanOrEqual(0);
    expect(mild.velocity.z).toBe(11); expect(mild.mode).not.toBe('stunned');
    const hard = airborne(); hitCrow(hard, { x: 0, y: 0, z: -1 }, 11);
    expect(hard.mode).toBe('stunned'); expect(hard.velocity.z).toBeLessThan(0);
    advance(hard, 1.5, { ...neutral, flap: 1 });
    expect(hard.mode).not.toBe('stunned');
    expect(Number.isFinite(hard.position.y)).toBe(true);
  });
  it('keeps foot contact exact while walking and preserves a smooth grounded stop', () => {
    const s = createCrowState(); advance(s, 1, { ...neutral, pitch: .5 });
    expect(s.position.y - .46).toBeCloseTo(s.supportY, 8);
    expect(s.mode).toBe('walk'); expect(s.position.z).toBeGreaterThan(.3);
    advance(s, 1); expect(s.mode).toBe('idle');
  });
  it('holds a landing blend at the actual foot support and allows an immediate new takeoff', () => {
    const s = airborne(); landCrow(s, 13.14);
    expect(s.position.y).toBeCloseTo(13.6, 8); expect(s.grounded).toBe(true);
    advance(s, .2); expect(s.mode).toBe('land');
    advance(s, .5); expect(s.mode).toBe('idle');
    launchCrow(s); expect(s.grounded).toBe(false); expect(s.mode).toBe('takeoff');
  });
  it('is stable across 30 and 120 Hz frame rates', () => {
    const a = airborne(), b = airborne(); const c = { ...neutral, pitch: .2, flap: .6, turn: .3 };
    advance(a, 5, c, 1 / 30); advance(b, 5, c, 1 / 120);
    expect(a.position.x).toBeCloseTo(b.position.x, 5);
    expect(a.position.y).toBeCloseTo(b.position.y, 5);
    expect(a.position.z).toBeCloseTo(b.position.z, 5);
  });
});
