import test from 'node:test';
import assert from 'node:assert/strict';
import { makeContext } from './observable-life-test-harness.mjs';

test('retired representatives fade over several simulation steps instead of disappearing immediately', () => {
  const { context, state } = makeContext();
  const retired = { id: 9, speciesId: 1, macroDemeId: 99, x: .5, y: .5, vx: 0, vy: 0, energy: 8, genome: { diet: .2 }, observationAlpha: 1, observationRetiring: true };
  state.organisms.push(retired);
  context.simulateStep();
  assert.ok(state.organisms.includes(retired));
  assert.ok(retired.observationAlpha < 1 && retired.observationAlpha > 0);
  for (let i = 0; i < 80; i += 1) context.simulateStep();
  assert.ok(!state.organisms.includes(retired));
});

test('a migration journey advances continuously and emits arrival instead of a positional jump', () => {
  const { context, state } = makeContext();
  context.metaReconcileRepresentatives({ soft: false });
  const colonist = state.organisms.find((organism) => organism.macroDemeId === 2);
  const startX = colonist.x;
  context.simulateStep();
  assert.ok(colonist.x > startX && colonist.x < colonist.observationJourney.tx);
  assert.ok(state.observation.events.some((event) => event.type === 'migration'));
});

test('visual migration duration stays stable across simulation speed multipliers', () => {
  const slow = makeContext();
  slow.context.metaReconcileRepresentatives({ soft: false });
  const slowColonist = slow.state.organisms.find((organism) => organism.macroDemeId === 2);
  slow.state.speedIndex = 0;
  slow.context.simulateStep();
  const slowProgress = slowColonist.observationJourney.progress;

  const fast = makeContext();
  fast.context.metaReconcileRepresentatives({ soft: false });
  const fastColonist = fast.state.organisms.find((organism) => organism.macroDemeId === 2);
  fast.state.speedIndex = 2;
  for (let i = 0; i < 12; i += 1) fast.context.simulateStep();
  assert.ok(Math.abs(fastColonist.observationJourney.progress - slowProgress) < 1e-9);
});
