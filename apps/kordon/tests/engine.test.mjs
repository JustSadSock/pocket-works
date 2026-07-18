import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES,
  applyAction,
  captureCandidates,
  createGame,
  currentPlayer,
  homeCells,
  legalActions,
  makeBoard,
  roundStarter,
  signalCells,
  signalControl,
  validateStoredState
} from '../engine.js';

function stateWith(overrides = {}) {
  return {
    ...createGame(),
    ...overrides,
    rules: { ...DEFAULT_RULES, ...(overrides.rules || {}) }
  };
}

test('board has 37 unique hexes and three central signals', () => {
  const board = makeBoard(3);
  assert.equal(board.length, 37);
  assert.equal(new Set(board).size, 37);
  assert.deepEqual(signalCells('line'), ['-1,0', '0,0', '1,0']);
});

test('each side starts with six pieces in mirrored home cells', () => {
  const game = createGame();
  assert.equal(game.positions[0].length, 6);
  assert.equal(game.positions[1].length, 6);
  assert.deepEqual(game.positions[0], homeCells(0, 6));
  assert.deepEqual(game.positions[1], homeCells(1, 6));
  assert.equal(new Set(game.positions.flat()).size, 12);
});

test('initiative alternates by round and both players act once', () => {
  let game = createGame();
  assert.equal(roundStarter(game), 0);
  assert.equal(currentPlayer(game), 0);
  game = applyAction(game, legalActions(game)[0]);
  assert.equal(currentPlayer(game), 1);
  game = applyAction(game, legalActions(game)[0]);
  assert.equal(game.round, 1);
  assert.equal(roundStarter(game), 1);
  assert.equal(currentPlayer(game), 1);
});

test('a piece moves exactly one adjacent hex into an empty cell', () => {
  const game = createGame();
  const actions = legalActions(game);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.type === 'move'));
  const action = actions[0];
  const next = applyAction(game, action);
  assert.ok(next.positions[0].includes(action.to));
  assert.ok(!next.positions[0].includes(action.from));
  assert.throws(() => applyAction(game, { type: 'move', from: action.to, to: '0,0' }), /Недопустимый ход/);
});

test('two attackers capture an unsupported enemy after movement', () => {
  const game = stateWith({
    positions: [['-1,0', '1,-1'], ['0,0']],
    reserve: [0, 0],
    phase: 0,
    round: 0,
    repetitions: {},
    history: []
  });
  assert.deepEqual(captureCandidates(game, 0), ['0,0']);
  // Use skipValidation because this is a focused tactical fixture.
  const next = applyAction(game, { type: 'move', from: '1,-1', to: '1,0' }, { skipValidation: true });
  assert.equal(next.positions[1].length, 0);
  assert.equal(next.reserve[1], 1);
  assert.deepEqual(next.lastCaptured, ['0,0']);
});

test('two adjacent allies prevent capture when support limit is one', () => {
  const game = stateWith({
    positions: [['-1,0', '1,0'], ['0,0', '0,1', '-1,1']],
    reserve: [0, 0],
    repetitions: {},
    history: []
  });
  assert.deepEqual(captureCandidates(game, 0), []);
});

test('multiple unsupported enemies are captured simultaneously', () => {
  const game = stateWith({
    positions: [['-1,0', '1,0', '0,-1'], ['0,0', '0,-2']],
    reserve: [0, 0],
    repetitions: {},
    history: []
  });
  const next = applyAction(game, { type: 'move', from: '0,-1', to: '1,-1' }, { skipValidation: true });
  assert.ok(next.lastCaptured.includes('0,0'));
  assert.equal(next.reserve[1], next.lastCaptured.length);
});

test('captured piece can redeploy only into a free home cell and spends an action', () => {
  const game = createGame();
  game.reserve[0] = 1;
  game.positions[0] = game.positions[0].slice(1);
  const actions = legalActions(game).filter((action) => action.type === 'redeploy');
  assert.equal(actions.length, 1);
  const next = applyAction(game, actions[0]);
  assert.equal(next.reserve[0], 0);
  assert.equal(next.positions[0].length, 6);
  assert.equal(next.phase, 1);
});

test('holding two signals after the second action scores one point', () => {
  let game = stateWith({
    positions: [['-2,1', '0,0'], ['3,0']],
    reserve: [0, 0],
    phase: 1,
    round: 0,
    repetitions: {},
    history: []
  });
  assert.deepEqual(signalControl(game), [2, 0]);
  game = applyAction(game, { type: 'move', from: '3,0', to: '3,-1' }, { skipValidation: true });
  assert.deepEqual(game.score, [1, 0]);
  assert.equal(game.round, 1);
});

test('reaching seven control points ends the game for player zero', () => {
  let game = stateWith({
    positions: [['-2,1', '0,0', '-2,0'], ['3,0']],
    reserve: [0, 0],
    score: [6, 2],
    phase: 1,
    round: 1,
    repetitions: {},
    history: []
  });
  game = applyAction(game, { type: 'move', from: '-2,0', to: '-2,1' }, { skipValidation: true });
  assert.equal(game.winner, 0);
  assert.equal(game.resultReason, 'control');
  assert.deepEqual(game.score, [7, 2]);
});

test('stored state validation rejects overlaps and preserves app metadata', () => {
  const game = createGame();
  game.appMode = 'ai';
  const valid = validateStoredState(JSON.parse(JSON.stringify(game)));
  assert.equal(valid.appMode, 'ai');
  const invalid = JSON.parse(JSON.stringify(game));
  invalid.positions[1][0] = invalid.positions[0][0];
  assert.equal(validateStoredState(invalid), null);
});

test('reaching seven halfway through a fair cycle does not end immediately', () => {
  let game = stateWith({
    positions: [['3,0'], ['-2,1', '0,0', '2,-2']],
    reserve: [0, 0],
    score: [0, 6],
    phase: 1,
    round: 0,
    repetitions: {},
    history: []
  });
  game = applyAction(game, { type: 'move', from: '2,-2', to: '3,-2' }, { skipValidation: true });
  assert.deepEqual(game.score, [0, 7]);
  assert.equal(game.round, 1);
  assert.equal(game.winner, null);
});
