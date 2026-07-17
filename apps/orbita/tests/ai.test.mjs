import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, findWinningPath, isRotationAllowed, placeStone, rotateRing } from '../engine.js';
import { chooseAiRotation, chooseAiTurn, generateLegalTurns, shouldAiSwap } from '../ai.js';

test('AI always returns a legal full turn', () => {
  const state = createGame();
  state.turnSeat = 1;
  state.seatColors = [0, 1];
  const move = chooseAiTurn(state, 'hard');
  assert.ok(move);
  assert.equal(move.state.history.length, 1);
  assert.equal(move.state.turnSeat, 0);
});

test('hard AI announces an available chain instead of claiming an instant win', () => {
  const state = createGame();
  state.turnSeat = 1;
  state.seatColors = [0, 1];
  state.board[0][0] = 1;
  state.board[0][7] = 1;
  state.board[1][0] = 1;
  state.board[2][0] = 1;
  const move = chooseAiTurn(state, 'hard');
  assert.ok(move);
  assert.equal(move.state.winnerSeat, null);
  assert.equal(move.state.challengeColor, 1);
});

test('hard AI breaks an opponent challenge when a defense exists', () => {
  const state = createGame();
  for (let ring = 0; ring < 4; ring += 1) state.board[ring][0] = 0;
  state.turnSeat = 1;
  state.challengeColor = 0;
  state.challengePath = findWinningPath(state.board, 0);
  const move = chooseAiTurn(state, 'hard');
  assert.ok(move);
  assert.equal(move.state.winnerSeat, null);
  assert.equal(findWinningPath(move.state.board, 0).length, 0);
  assert.equal(move.state.challengeColor, null);
  assert.equal(move.state.challengeCooldownColor, 0);
});

test('AI can finish a saved placement by choosing a legal rotation', () => {
  let state = createGame();
  state.turnSeat = 1;
  state.seatColors = [0, 1];
  state.history.push({ type: 'turn', move: 1, rotatedRing: 2, direction: 1 });
  state = placeStone(state, 2, 4);
  const rotation = chooseAiRotation(state, 'medium');
  assert.ok(rotation);
  assert.equal(isRotationAllowed(state, rotation.rotatedRing, rotation.direction), true);
  assert.notDeepEqual([rotation.rotatedRing, rotation.direction], [2, -1]);
  assert.equal(rotation.state.phase, 'place');
  assert.equal(rotation.state.turnSeat, 0);
});

test('hard AI uses pie swap on endpoint opening', () => {
  let state = createGame();
  state = placeStone(state, 0, 3);
  state = rotateRing(state, 1, 1);
  assert.equal(state.canSwap, true);
  assert.equal(shouldAiSwap(state, 'hard'), true);
});

test('generated turns never contain the forbidden reverse rotation', () => {
  let state = createGame();
  state = rotateRing(placeStone(state, 1, 2), 1, 1);
  const moves = generateLegalTurns(state);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((move) => move.rotatedRing !== 1 || move.direction !== -1));
});

test('generated turn set contains no duplicate strategic states', () => {
  const moves = generateLegalTurns(createGame());
  const keys = moves.map((move) => {
    const last = move.state.history.at(-1);
    return [
      move.state.board.flat().map((cell) => cell ?? '-').join(''),
      move.state.challengeColor ?? '-',
      move.state.challengeCooldownColor ?? '-',
      move.state.winnerSeat ?? '-',
      move.state.turnSeat,
      `${last.rotatedRing}:${last.direction}`
    ].join(':');
  });
  assert.equal(new Set(keys).size, keys.length);
});
