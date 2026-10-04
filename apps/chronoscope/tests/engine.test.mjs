import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateTrack, smartPlaybackMultiplier, cameraCueAt, formatClock } from '../engine.js';

test('interpolates unit tracks', () => {
  const p = interpolateTrack([{t:0,x:0,y:0,strength:1},{t:10,x:100,y:50,strength:.5}], 5);
  assert.equal(Math.round(p.x), 50);
  assert.equal(Math.round(p.y), 25);
});

test('smart speed slows around important events', () => {
  const events = [{t:100,importance:5},{t:104,importance:3}];
  assert.ok(smartPlaybackMultiplier(events, 102) < smartPlaybackMultiplier(events, 0));
});

test('camera cue is continuous', () => {
  const c = cameraCueAt([{t:0,x:0,y:0,zoom:1},{t:10,x:10,y:20,zoom:2}],5);
  assert.equal(Math.round(c.x), 5);
  assert.equal(Math.round(c.y), 10);
});

test('formats scenario clock', () => assert.equal(formatClock(90, 30), '02:00'));
