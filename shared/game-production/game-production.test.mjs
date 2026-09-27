import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMotionController } from './motion.js';
import { composeEnvironment, composeVillage } from './environment.js';

const clip = () => ({ played: 0, stopped: 0, weight: 0, speedRatio: 1, play() { this.played++; }, stop() { this.stopped++; }, setWeightForAllAnimatables(value) { this.weight = value; } });
test('attack contact fires once after anticipation and hit stop pauses the next phase', () => {
  const clips = { idle: clip(), windup: clip(), strike: clip(), recover: clip() };
  const events = [];
  const controller = createMotionController({ clips, onEvent: (event) => events.push(event), actions: {
    sword: { returnTo: 'idle', phases: [
      { clip: 'windup', duration: 80 },
      { clip: 'strike', duration: 60, events: [{ at: 20, type: 'contact', hitStopMs: 40 }] },
      { clip: 'recover', duration: 100 }
    ] }
  } });
  controller.setState('idle');
  assert.equal(controller.trigger('sword'), true);
  assert.equal(controller.trigger('sword'), false);
  controller.update(100);
  assert.equal(events.filter((event) => event.type === 'contact').length, 1);
  assert.equal(clips.strike.speedRatio, 0);
  controller.update(20);
  assert.equal(controller.action, 'sword');
  controller.update(220);
  assert.equal(controller.action, null);
  assert.equal(controller.state, 'idle');
  assert.equal(events.filter((event) => event.type === 'contact').length, 1);
  controller.dispose();
  assert.ok(Object.values(clips).every((value) => value.speedRatio === 1));
});

test('composition is deterministic and preserves a visible route to focal point', () => {
  const options = { bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, camera: { x: 0, z: -24 }, focalPoint: { x: 0, z: 0 }, seed: 45, density: 0.8,
    assets: { building: ['houseA', 'houseB'], prop: ['barrel', 'tree'], detail: ['grass', 'stones'] } };
  const first = composeVillage(options);
  assert.deepEqual(first, composeVillage(options));
  assert.notDeepEqual(first, composeVillage({ ...options, seed: 46 }));
  assert.ok(first.placements.length > 15);
  for (const item of first.placements) {
    assert.ok(Math.hypot(item.x, item.z) >= 2);
    if (item.z >= -24 && item.z <= 0) assert.ok(Math.abs(item.x) >= 3);
  }
});

test('dense constraints report missing placements rather than overlapping', () => {
  const result = composeEnvironment({ bounds: { minX: 0, maxX: 5, minZ: 0, maxZ: 5 }, focalPoint: { x: 2.5, z: 2.5 }, camera: { x: 2.5, z: 0 }, density: 1,
    layers: [{ id: 'houses', assets: ['house'], count: 9, minSpacing: 5, focalClearance: 0, keepSightline: false }] });
  assert.equal(result.skipped[0].layer, 'houses');
});
