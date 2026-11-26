import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeMode,
  createSession,
  getActiveTarget,
  getSessionSummary,
  registerShot,
  resizeSession,
  updateSession
} from '../engine.mjs';

test('seeded sessions generate the same first target', () => {
  const first = createSession({ seed: 91, width: 900, height: 520 });
  const second = createSession({ seed: 91, width: 900, height: 520 });
  assert.deepEqual(first.targets[0], second.targets[0]);
});

test('flick hit scores, records reaction time and replaces the target', () => {
  const session = createSession({ mode: 'flick', seed: 12, width: 900, height: 520 });
  const target = getActiveTarget(session);
  session.elapsedMs = 310;
  const result = registerShot(session, target.x, target.y, 900, 520);
  assert.equal(result.kind, 'hit');
  assert.equal(session.hits, 1);
  assert.equal(session.shots, 1);
  assert.equal(session.reactionTimes[0], 310);
  assert.ok(session.score > 0);
  assert.notEqual(getActiveTarget(session).id, target.id);
});

test('misses reduce score without allowing a negative total and reset streak', () => {
  const session = createSession({ mode: 'flick', seed: 4, width: 900, height: 520 });
  session.streak = 5;
  const result = registerShot(session, 0, 0, 900, 520);
  assert.equal(result.kind, 'miss');
  assert.equal(session.misses, 1);
  assert.equal(session.streak, 0);
  assert.equal(session.score, 0);
});

test('switch mode requires the active target in sequence', () => {
  const session = createSession({ mode: 'switch', seed: 22, width: 900, height: 520 });
  const active = getActiveTarget(session);
  const result = registerShot(session, active.x, active.y, 900, 520);
  assert.equal(result.kind, 'hit');
  assert.equal(session.activeTargetIndex, 1);
  assert.equal(session.hits, 1);
});

test('tracking only scores while held and inside the target', () => {
  const session = createSession({ mode: 'track', seed: 7, width: 900, height: 520 });
  const target = getActiveTarget(session);
  target.moving = false;
  target.vx = 0;
  target.vy = 0;
  updateSession(session, 500, 900, 520, true, { x: target.x, y: target.y });
  updateSession(session, 500, 900, 520, true, { x: 0, y: 0 });
  updateSession(session, 500, 900, 520, false, { x: target.x, y: target.y });
  assert.equal(session.heldMs, 1000);
  assert.equal(session.onTargetMs, 500);
  assert.ok(session.score > 0);
  assert.equal(getSessionSummary(session).accuracy, 50);
});

test('circuit changes from flick to tracking and then switching', () => {
  const session = createSession({ mode: 'circuit', seed: 18, width: 900, height: 520 });
  assert.equal(activeMode(session), 'flick');
  updateSession(session, 30000, 900, 520);
  assert.equal(activeMode(session), 'track');
  updateSession(session, 30000, 900, 520);
  assert.equal(activeMode(session), 'switch');
});

test('reflex target expires and counts as a miss', () => {
  const session = createSession({ mode: 'reflex', difficulty: 'standard', seed: 1, width: 900, height: 520 });
  const events = updateSession(session, 1600, 900, 520);
  assert.equal(session.misses, 1);
  assert.ok(events.some((event) => event.kind === 'expired'));
  assert.notEqual(getActiveTarget(session).id, 1);
});

test('session finishes at its configured duration', () => {
  const session = createSession({ mode: 'flick', duration: 30, seed: 3, width: 900, height: 520 });
  const events = updateSession(session, 30000, 900, 520);
  assert.equal(session.status, 'finished');
  assert.equal(session.remainingMs, 0);
  assert.ok(events.some((event) => event.kind === 'finished'));
});

test('resize preserves target position proportionally', () => {
  const session = createSession({ seed: 8, width: 800, height: 450 });
  const target = getActiveTarget(session);
  const before = { x: target.x, y: target.y };
  resizeSession(session, 1600, 900);
  assert.equal(target.x, before.x * 2);
  assert.equal(target.y, before.y * 2);
});
