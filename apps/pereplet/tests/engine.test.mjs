import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMove, applyMove, boardKey, CINNABAR, cloneGame, createGame, findWinningPath, groupAt, hydrateGame, INDIGO, legalMoves, shortestPathCost
} from '../engine.js';
import { chooseMove } from '../ai.js';

function gameFrom(rows, currentPlayer = INDIGO) {
  const game = createGame({ size: rows.length });
  game.board = rows.flat();
  game.currentPlayer = currentPlayer;
  game.positionKeys = [boardKey(game.board)];
  return game;
}

test('initial board exposes every cell as a legal move', () => {
  assert.equal(legalMoves(createGame()).length, 36);
});

test('indigo wins by connecting left and right edges orthogonally', () => {
  const game = gameFrom([
    [0,0,0,0,0,0],
    [1,1,1,1,1,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0]
  ]);
  const result = applyMove(game, 11);
  assert.equal(result.winner, INDIGO);
  assert.equal(findWinningPath(game.board, INDIGO, 6).length, 6);
});

test('cinnabar wins by connecting top and bottom edges', () => {
  const game = gameFrom([
    [0,2,0,0,0,0],
    [0,2,0,0,0,0],
    [0,2,0,0,0,0],
    [0,2,0,0,0,0],
    [0,2,0,0,0,0],
    [0,0,0,0,0,0]
  ], CINNABAR);
  assert.equal(applyMove(game, 31).winner, CINNABAR);
});

test('a surrounded single stone is captured', () => {
  const game = gameFrom([
    [0,1,0,0],
    [1,2,0,0],
    [0,1,0,0],
    [0,0,0,0]
  ]);
  const result = applyMove(game, 6);
  assert.deepEqual(result.captured, [5]);
  assert.equal(game.board[5], 0);
});

test('an entire connected group is removed together', () => {
  const game = gameFrom([
    [0,1,0,0],
    [1,2,1,0],
    [1,2,0,0],
    [0,1,0,0]
  ]);
  const result = applyMove(game, 10);
  assert.deepEqual(new Set(result.captured), new Set([5,9]));
  assert.equal(game.board[5], 0);
  assert.equal(game.board[9], 0);
});

test('suicide is illegal when it captures nothing', () => {
  const game = gameFrom([
    [0,2,0,0],
    [2,0,2,0],
    [0,2,0,0],
    [0,0,0,0]
  ]);
  const result = analyzeMove(game, 5);
  assert.equal(result.legal, false);
  assert.equal(result.reason, 'suicide');
});

test('capture can make an otherwise surrounded placement legal', () => {
  const game = gameFrom([
    [1,2,1],
    [2,0,2],
    [1,2,1]
  ]);
  const result = analyzeMove(game, 4);
  assert.equal(result.legal, true);
  assert.equal(result.captured.length, 4);
});

test('positional superko rejects a repeated board', () => {
  const game = createGame({ size: 4 });
  const preview = analyzeMove(game, 5);
  game.positionKeys.push(preview.key);
  const repeated = analyzeMove(game, 5);
  assert.equal(repeated.legal, false);
  assert.equal(repeated.reason, 'repeat');
});

test('group analysis reports liberties without duplicates', () => {
  const game = gameFrom([
    [1,1,0,0],
    [1,0,0,0],
    [0,0,0,0],
    [0,0,0,0]
  ]);
  const group = groupAt(game.board, 0, 4);
  assert.equal(group.stones.length, 3);
  assert.equal(new Set(group.liberties).size, group.liberties.length);
});

test('shortest path cost rewards an existing route', () => {
  const empty = createGame({ size: 4 });
  const route = gameFrom([
    [0,0,0,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0]
  ]);
  assert.ok(shortestPathCost(route.board, INDIGO, 4) < shortestPathCost(empty.board, INDIGO, 4));
});

test('hydration validates and restores a saved match', () => {
  const game = createGame();
  applyMove(game, 14);
  const restored = hydrateGame(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(restored.board, game.board);
  assert.equal(restored.turn, 1);
});

test('clone is isolated from the source state', () => {
  const game = createGame();
  const copy = cloneGame(game);
  applyMove(copy, 0);
  assert.equal(game.board[0], 0);
  assert.equal(copy.board[0], 1);
});

test('master bot takes an immediate winning move', () => {
  const game = gameFrom([
    [0,0,0,0,0,0],
    [1,1,1,1,1,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0],
    [0,0,0,0,0,0]
  ]);
  assert.equal(chooseMove(game, { difficulty: 'master', style: 'adaptive' }), 11);
});
