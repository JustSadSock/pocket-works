import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  declineSwap,
  findWinningPath,
  nextRound,
  placeStone,
  rotateCells,
  rotateRing,
  restartRound,
  swapSides
} from '../engine.js';

test('new game starts with an empty four by eight board', () => {
  const game = createGame();
  assert.equal(game.board.length, 4);
  assert.ok(game.board.every((ring) => ring.length === 8));
  assert.ok(game.board.flat().every((cell) => cell === null));
  assert.equal(game.phase, 'place');
});

test('turn requires a placement before a rotation', () => {
  let game = createGame();
  assert.throws(() => rotateRing(game, 0, 1));
  game = placeStone(game, 1, 3);
  assert.equal(game.phase, 'rotate');
  assert.equal(game.board[1][3], 0);
  game = rotateRing(game, 1, 1);
  assert.equal(game.board[1][4], 0);
  assert.equal(game.phase, 'place');
  assert.equal(game.turnSeat, 1);
});

test('ring rotation wraps around in both directions', () => {
  const ring = [0, null, 1, null, null, null, null, 1];
  assert.deepEqual(rotateCells(ring, 1), [1, 0, null, 1, null, null, null, null]);
  assert.deepEqual(rotateCells(ring, -1), [null, 1, null, null, null, null, 1, 0]);
});

test('radial chain wins from inner to outer ring', () => {
  const board = Array.from({ length: 4 }, () => Array(8).fill(null));
  for (let ring = 0; ring < 4; ring += 1) board[ring][2] = 0;
  const path = findWinningPath(board, 0);
  assert.equal(path.length, 4);
  assert.deepEqual(path[0], { ring: 0, sector: 2 });
  assert.deepEqual(path.at(-1), { ring: 3, sector: 2 });
});

test('chain can bend along a ring', () => {
  const board = Array.from({ length: 4 }, () => Array(8).fill(null));
  board[0][0] = 1;
  board[1][0] = 1;
  board[1][1] = 1;
  board[2][1] = 1;
  board[2][2] = 1;
  board[3][2] = 1;
  assert.equal(findWinningPath(board, 1).length, 6);
});

test('second player can use the pie swap after the first full turn', () => {
  let game = createGame();
  game = placeStone(game, 0, 0);
  game = rotateRing(game, 0, 1);
  assert.equal(game.canSwap, true);
  assert.equal(game.turnSeat, 1);
  game = swapSides(game);
  assert.deepEqual(game.seatColors, [1, 0]);
  assert.equal(game.turnSeat, 0);
  assert.equal(game.pieResolved, true);
});

test('declining the pie swap keeps the current player and colors', () => {
  let game = createGame();
  game = placeStone(game, 0, 0);
  game = rotateRing(game, 0, 1);
  game = declineSwap(game);
  assert.deepEqual(game.seatColors, [0, 1]);
  assert.equal(game.turnSeat, 1);
});

test('next round preserves score and alternates the starter', () => {
  let game = createGame();
  game.phase = 'round-over';
  game.scores = [1, 0];
  const roundTwo = nextRound(game);
  assert.equal(roundTwo.round, 2);
  assert.equal(roundTwo.turnSeat, 1);
  assert.deepEqual(roundTwo.seatColors, [1, 0]);
  assert.deepEqual(roundTwo.scores, [1, 0]);
});

test('restarting a round preserves match score and starter', () => {
  let game = createGame();
  game.round = 2;
  game.starterSeat = 1;
  game.turnSeat = 0;
  game.scores = [1, 2];
  game = placeStone(game, 2, 2);
  const restarted = restartRound(game);
  assert.equal(restarted.round, 2);
  assert.equal(restarted.turnSeat, 1);
  assert.deepEqual(restarted.seatColors, [1, 0]);
  assert.deepEqual(restarted.scores, [1, 2]);
  assert.ok(restarted.board.flat().every((cell) => cell === null));
});
