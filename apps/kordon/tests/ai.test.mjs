import test from 'node:test';
import assert from 'node:assert/strict';
import { actionKey, applyAction, createGame, currentPlayer, legalActions } from '../engine.js';
import { AI_STYLES, chooseAction, evaluateState, rankActions, seededRandom } from '../ai.js';

test('all four AI characters are unique and selectable', () => {
  assert.deepEqual(AI_STYLES.map((style) => style.id), ['adaptive', 'assault', 'formation', 'frontier']);
  assert.equal(new Set(AI_STYLES.map((style) => style.name)).size, 4);
});

test('every difficulty returns a legal opening move', () => {
  const game = createGame();
  const legal = new Set(legalActions(game).map(actionKey));
  for (const difficulty of ['cadet', 'standard', 'marshal']) {
    const action = chooseAction(game, { style: 'adaptive', difficulty, random: seededRandom(4) });
    assert.ok(action);
    assert.ok(legal.has(actionKey(action)), `${difficulty} returned an illegal action`);
  }
});

test('ranking is deterministic and ordered by score', () => {
  const game = createGame();
  const ranked = rankActions(game, 'formation');
  assert.ok(ranked.length > 0);
  for (let index = 1; index < ranked.length; index += 1) {
    assert.ok(ranked[index - 1].score >= ranked[index].score);
  }
  assert.deepEqual(ranked.map((item) => actionKey(item.action)), rankActions(game, 'formation').map((item) => actionKey(item.action)));
});

test('marshal takes an immediate winning action', () => {
  const game = createGame();
  game.positions = [['-1,0', '0,0', '-2,0'], ['3,0', '2,-1']];
  game.score = [6, 0];
  game.phase = 1;
  game.round = 1; // starter is player one, second action belongs to player zero
  game.repetitions = {};
  const player = currentPlayer(game);
  assert.equal(player, 0);
  const winning = legalActions(game).filter((action) => applyAction(game, action).winner === 0);
  assert.ok(winning.length > 0);
  const action = chooseAction(game, { style: 'adaptive', difficulty: 'marshal', random: seededRandom(9) });
  assert.ok(winning.some((candidate) => actionKey(candidate) === actionKey(action)));
});

test('state evaluation changes with style priorities', () => {
  const game = createGame();
  game.positions = [['-1,0', '0,-1', '-2,1', '-2,2'], ['1,0', '1,-1', '2,-1', '2,-2']];
  const scores = AI_STYLES.map((style) => evaluateState(game, 0, style.id));
  assert.ok(new Set(scores.map((score) => score.toFixed(4))).size >= 3);
});

test('seeded random is reproducible', () => {
  const a = seededRandom(124);
  const b = seededRandom(124);
  assert.deepEqual(Array.from({ length: 8 }, () => a()), Array.from({ length: 8 }, () => b()));
});
