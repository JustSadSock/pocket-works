import test from 'node:test';
import assert from 'node:assert/strict';
import { actionKey, applyAction, createGame, currentPlayer, legalActions } from '../engine.js';
import { AI_STYLES, chooseAction, chooseMctsAction, evaluateState, rankActions, seededRandom } from '../ai.js';

test('all four AI characters are unique and selectable', () => {
  assert.deepEqual(AI_STYLES.map((style) => style.id), ['adaptive', 'assault', 'formation', 'frontier']);
  assert.equal(new Set(AI_STYLES.map((style) => style.name)).size, 4);
});

test('every difficulty returns a legal opening move', () => {
  const game = createGame();
  const legal = new Set(legalActions(game).map(actionKey));
  for (const difficulty of ['cadet', 'standard', 'marshal']) {
    const action = chooseAction(game, { style: 'adaptive', difficulty, random: seededRandom(4), iterations: 80 });
    assert.ok(action);
    assert.ok(legal.has(actionKey(action)), `${difficulty} returned an illegal action`);
  }
});

test('ranking is deterministic and ordered by score', () => {
  const game = createGame();
  const ranked = rankActions(game, 'formation');
  assert.ok(ranked.length > 0);
  for (let index = 1; index < ranked.length; index += 1) assert.ok(ranked[index - 1].score >= ranked[index].score);
  assert.deepEqual(ranked.map((item) => actionKey(item.action)), rankActions(game, 'formation').map((item) => actionKey(item.action)));
});

test('marshal takes an immediate winning action before running simulations', () => {
  const game = createGame();
  game.positions = [['-1,0', '0,0', '-2,0'], ['3,0', '2,-1']];
  game.score = [6, 0];
  game.phase = 1;
  game.round = 1;
  game.repetitions = {};
  const player = currentPlayer(game);
  const winning = legalActions(game).filter((action) => applyAction(game, action).winner === player);
  assert.ok(winning.length > 0);
  const action = chooseAction(game, { style: 'adaptive', difficulty: 'marshal', random: seededRandom(9), iterations: 40 });
  assert.ok(winning.some((candidate) => actionKey(candidate) === actionKey(action)));
});

test('marshal blocks a forced match point instead of making a locally attractive move', () => {
  const game = createGame();
  game.positions = [
    ['1,0', '1,-2', '2,-2', '3,-3', '0,-2', '1,-3'],
    ['0,0', '-2,1', '-3,3', '-2,3', '-1,3', '0,3']
  ];
  game.score = [5, 6];
  game.round = 1;
  game.phase = 1;
  game.repetitions = {};
  assert.equal(currentPlayer(game), 0);
  const safe = new Set(legalActions(game).filter((action) => applyAction(game, action).winner !== 1).map(actionKey));
  assert.ok(safe.size > 0);
  const action = chooseAction(game, { difficulty: 'marshal', style: 'adaptive', random: seededRandom(17), iterations: 180 });
  assert.ok(safe.has(actionKey(action)), `marshal failed to block with ${actionKey(action)}`);
});

test('seeded MCTS is reproducible', () => {
  const game = createGame();
  const a = chooseMctsAction(game, { style: 'adaptive', iterations: 90, random: seededRandom(1234) });
  const b = chooseMctsAction(game, { style: 'adaptive', iterations: 90, random: seededRandom(1234) });
  assert.equal(actionKey(a), actionKey(b));
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
