import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, placeStone, rotateRing } from '../engine.js';
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

test('hard AI takes an immediate win', () => {
  const state = createGame();
  state.turnSeat = 1;
  state.seatColors = [0, 1];
  state.board[0][0] = 1;
  state.board[0][7] = 1;
  state.board[1][0] = 1;
  state.board[2][0] = 1;
  const move = chooseAiTurn(state, 'hard');
  assert.ok(move);
  assert.equal(move.state.winnerSeat, 1);
});

test('AI can finish a saved placement by choosing a rotation', () => {
  let state = createGame();
  state.turnSeat = 1;
  state.seatColors = [0, 1];
  state = placeStone(state, 2, 4);
  const rotation = chooseAiRotation(state, 'medium');
  assert.ok(rotation);
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

test('generated turn set contains no duplicate resulting boards', () => {
  const moves = generateLegalTurns(createGame());
  const keys = moves.map((move) => move.state.board.flat().map((cell) => cell ?? '-').join(''));
  assert.equal(new Set(keys).size, keys.length);
});
