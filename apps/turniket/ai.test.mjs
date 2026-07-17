import assert from 'node:assert/strict';
import { createMatch } from './game.js';
import { applyAiAction, chooseAiAction, shortestDirectedDistance } from './ai.js';

{
  const state = createMatch();
  assert.equal(shortestDirectedDistance(state, 0), 6);
  assert.equal(shortestDirectedDistance(state, 1), 6);

  state.turn = 1;
  const action = chooseAiAction(state, 'strategist', () => 0);
  assert.ok(action, 'strategist chooses an action');
  const next = applyAiAction(state, action);
  assert.ok(next, 'chosen action is legal');
  assert.equal(next.turn, 0, 'AI gives the turn back to the human');
}

{
  const state = createMatch();
  state.turn = 1;
  state.pawns[1] = { r: 5, c: 3 };
  state.pawns[0] = { r: 4, c: 0 };
  const action = chooseAiAction(state, 'oracle', () => 0);
  const next = applyAiAction(state, action);
  assert.equal(action.type, 'move', 'AI prefers an immediate winning move');
  assert.equal(next.winner, 1);
  assert.notEqual(next.status, 'playing');
}

{
  const state = createMatch();
  state.turn = 1;
  const action = chooseAiAction(state, 'apprentice', () => 0.25);
  assert.ok(['move', 'gate'].includes(action.type));
  assert.ok(applyAiAction(state, action));
}

console.log('TURNIKET AI tests passed');
