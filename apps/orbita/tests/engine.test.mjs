import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  declineSwap,
  findWinningPath,
  forbiddenRotation,
  isRotationAllowed,
  nextRound,
  placeStone,
  rotateCells,
  rotateRing,
  restartRound,
  swapSides,
  validateStoredState
} from '../engine.js';

function emptyBoard() {
  return Array.from({ length: 4 }, () => Array(8).fill(null));
}

test('new game starts with an empty four by eight board and no challenge', () => {
  const game = createGame();
  assert.equal(game.schemaVersion, 3);
  assert.equal(game.board.length, 4);
  assert.ok(game.board.every((ring) => ring.length === 8));
  assert.ok(game.board.flat().every((cell) => cell === null));
  assert.equal(game.phase, 'place');
  assert.equal(game.challengeColor, null);
  assert.equal(game.challengeCooldownColor, null);
  assert.deepEqual(game.challengePath, []);
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

test('immediate opposite rotation of the same ring is forbidden', () => {
  let game = createGame();
  game = rotateRing(placeStone(game, 1, 2), 1, 1);
  assert.deepEqual(forbiddenRotation(game), { ring: 1, direction: -1 });
  game = placeStone(game, 3, 4);
  assert.equal(isRotationAllowed(game, 1, -1), false);
  assert.throws(() => rotateRing(game, 1, -1), /отменять вращение/);
});

test('same direction or another ring remains legal', () => {
  let game = createGame();
  game = rotateRing(placeStone(game, 1, 2), 1, 1);
  const placed = placeStone(game, 3, 4);
  assert.equal(isRotationAllowed(placed, 1, 1), true);
  assert.equal(isRotationAllowed(placed, 2, -1), true);
});

test('radial chain is detected from inner to outer ring', () => {
  const board = emptyBoard();
  for (let ring = 0; ring < 4; ring += 1) board[ring][2] = 0;
  const path = findWinningPath(board, 0);
  assert.equal(path.length, 4);
  assert.deepEqual(path[0], { ring: 0, sector: 2 });
  assert.deepEqual(path.at(-1), { ring: 3, sector: 2 });
});

test('chain can bend along a ring', () => {
  const board = emptyBoard();
  board[0][0] = 1;
  board[1][0] = 1;
  board[1][1] = 1;
  board[2][1] = 1;
  board[2][2] = 1;
  board[3][2] = 1;
  assert.equal(findWinningPath(board, 1).length, 6);
});

test('a completed chain announces a challenge instead of winning immediately', () => {
  let game = createGame();
  game.board[0][0] = 0;
  game.board[1][0] = 0;
  game.board[2][0] = 0;
  game = placeStone(game, 3, 7);
  game = rotateRing(game, 3, 1);
  assert.equal(game.winnerSeat, null);
  assert.equal(game.challengeColor, 0);
  assert.equal(game.challengePath.length, 4);
  assert.equal(game.turnSeat, 1);
  assert.equal(game.phase, 'place');
});

test('a challenge wins only after surviving the opponent full turn', () => {
  let game = createGame();
  for (let ring = 0; ring < 4; ring += 1) {
    game.board[ring][0] = 0;
    game.board[ring][1] = 0;
  }
  game.turnSeat = 1;
  game.challengeColor = 0;
  game.challengePath = findWinningPath(game.board, 0);
  game = placeStone(game, 0, 4);
  game = rotateRing(game, 3, 1);
  assert.equal(game.phase, 'round-over');
  assert.equal(game.winnerColor, 0);
  assert.equal(game.winnerSeat, 0);
  assert.equal(game.scores[0], 1);
});

test('breaking a challenge starts one quiet turn for its owner', () => {
  let game = createGame();
  for (let ring = 0; ring < 4; ring += 1) game.board[ring][0] = 0;
  game.turnSeat = 1;
  game.challengeColor = 0;
  game.challengePath = findWinningPath(game.board, 0);
  game = placeStone(game, 3, 4);
  game = rotateRing(game, 2, 1);
  assert.equal(game.winnerSeat, null);
  assert.equal(game.challengeColor, null);
  assert.equal(game.challengeCooldownColor, 0);
  assert.equal(game.turnSeat, 0);
});

test('quiet turn cannot announce a challenge and consumes cooldown', () => {
  let game = createGame();
  game.board[0][0] = 0;
  game.board[1][0] = 0;
  game.board[2][0] = 0;
  game.challengeCooldownColor = 0;
  game.history.push({ type: 'turn', move: 1, rotatedRing: 2, direction: 1 });
  game = placeStone(game, 3, 7);
  game = rotateRing(game, 3, 1);
  assert.ok(findWinningPath(game.board, 0).length > 0);
  assert.equal(game.challengeColor, null);
  assert.equal(game.challengeCooldownColor, null);
  assert.equal(game.history.at(-1).quietTurn, true);
  assert.equal(game.turnSeat, 1);
});

test('a later ordinary turn may announce a challenge again', () => {
  let game = createGame();
  game.board[0][0] = 0;
  game.board[1][0] = 0;
  game.board[2][0] = 0;
  game.challengeCooldownColor = null;
  game = placeStone(game, 3, 7);
  game = rotateRing(game, 3, 1);
  assert.equal(game.challengeColor, 0);
});

test('a defensive reply cannot announce an immediate counter-challenge', () => {
  let game = createGame();
  for (let ring = 0; ring < 4; ring += 1) game.board[ring][0] = 0;
  game.board[0][5] = 1;
  game.board[1][5] = 1;
  game.board[2][4] = 1;
  game.board[2][5] = 1;
  game.board[3][5] = 1;
  game.turnSeat = 1;
  game.challengeColor = 0;
  game.challengePath = findWinningPath(game.board, 0);
  game = placeStone(game, 3, 7);
  game = rotateRing(game, 2, 1);
  assert.equal(findWinningPath(game.board, 0).length, 0);
  assert.ok(findWinningPath(game.board, 1).length > 0);
  assert.equal(game.challengeColor, null);
  assert.equal(game.challengeCooldownColor, 0);
  assert.equal(game.winnerSeat, null);
  assert.equal(game.turnSeat, 0);
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

test('version two saves migrate without inventing cooldown', () => {
  const legacy = createGame();
  legacy.schemaVersion = 2;
  delete legacy.challengeCooldownColor;
  const migrated = validateStoredState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.challengeCooldownColor, null);
});

test('version one saves migrate without inventing an active challenge', () => {
  const legacy = createGame();
  legacy.schemaVersion = 1;
  delete legacy.challengeColor;
  delete legacy.challengePath;
  delete legacy.challengeCooldownColor;
  const migrated = validateStoredState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.challengeColor, null);
  assert.equal(migrated.challengeCooldownColor, null);
  assert.deepEqual(migrated.challengePath, []);
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
