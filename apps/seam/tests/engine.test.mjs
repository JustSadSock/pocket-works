import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AxisGame, PLAYER, boardCells, coordKey, chooseAIMove, lineBetween
} from '../engine.js';

function custom(board, crown, turn = PLAYER.AZURE, options = {}) {
  const game = new AxisGame({ radius: options.radius || 3, ...options });
  game.board = Object.fromEntries(board.map(([cell, player]) => [coordKey(cell), player]));
  game.crown = { 1: coordKey(crown[1]), 2: coordKey(crown[2]) };
  game.turn = turn;
  game.moveNumber = options.moveNumber || 4;
  game.swapAvailable = false;
  game.centerClaim = null;
  game.winner = 0;
  game.winReason = '';
  return game;
}

test('radius 3 board has 37 cells and seven starting pieces per side', () => {
  const game = new AxisGame();
  assert.equal(boardCells(3).length, 37);
  assert.equal(game.cellsFor(PLAYER.AZURE).length, 7);
  assert.equal(game.cellsFor(PLAYER.OCHRE).length, 7);
});

test('the crown cannot move alone', () => {
  const game = new AxisGame();
  const crown = game.crownCell(PLAYER.AZURE);
  assert.equal(game.legalMovesForSelection([crown]).length, 0);
});

test('a contiguous line can be selected and shifted broadside', () => {
  const game = custom([
    [[0, 0], 1], [[1, 0], 1], [[-2, 1], 1], [[2, -1], 2]
  ], { 1: [-2, 1], 2: [2, -1] });
  const segment = lineBetween([0, 0], [1, 0], game);
  assert.equal(segment.length, 2);
  const broadside = game.legalMovesForSelection(segment).find((move) => move.kind === 'broadside' && move.direction === 2);
  assert.ok(broadside);
  const result = game.applyMove(broadside);
  assert.equal(result.ok, true);
  assert.equal(game.valueAt([0, -1]), 1);
  assert.equal(game.valueAt([1, -1]), 1);
});

test('a line cannot push an equally long enemy line', () => {
  const game = custom([
    [[-1, 0], 1], [[0, 0], 1], [[1, 0], 2], [[2, 0], 2], [[-2, 1], 1], [[2, -1], 2]
  ], { 1: [-2, 1], 2: [2, -1] });
  const moves = game.legalMovesForSelection([[-1, 0], [0, 0]]);
  assert.equal(moves.some((move) => move.direction === 0 && move.kind === 'push'), false);
});

test('a longer line pushes a shorter enemy line', () => {
  const game = custom([
    [[-1, 0], 1], [[0, 0], 1], [[1, 0], 2], [[-2, 1], 1], [[2, -1], 2]
  ], { 1: [-2, 1], 2: [2, -1] });
  const move = game.legalMovesForSelection([[-1, 0], [0, 0]])
    .find((candidate) => candidate.direction === 0 && candidate.kind === 'push');
  assert.ok(move);
  game.applyMove(move);
  assert.equal(game.valueAt([2, 0]), 2);
  assert.equal(game.valueAt([1, 0]), 1);
});

test('pushing the enemy crown off the board wins immediately', () => {
  const game = custom([
    [[0, 0], 1], [[1, 0], 1], [[2, 0], 2], [[-1, 1], 1], [[0, -2], 2]
  ], { 1: [-1, 1], 2: [2, 0] }, 1, { radius: 2, maxGroup: 3, crownMinGroup: 2 });
  const move = game.legalMovesForSelection([[0, 0], [1, 0]])
    .find((candidate) => candidate.direction === 0 && candidate.kind === 'push');
  assert.ok(move);
  const result = game.applyMove(move);
  assert.equal(result.winner, PLAYER.AZURE);
  assert.equal(game.winReason, 'crown-ejected');
});

test('the throne requires formation and survives two enemy replies', () => {
  const game = custom([
    [[-2, 0], 1], [[-1, 0], 1], [[0, 1], 1], [[-2, 1], 1],
    [[2, 0], 2], [[2, -1], 2], [[1, -2], 2]
  ], { 1: [-1, 0], 2: [2, 0] }, 1, { centerReplies: 2, centerSupport: 2, crownMinGroup: 2 });
  const enter = game.legalMovesForSelection([[-2, 0], [-1, 0]])
    .find((candidate) => candidate.direction === 0 && candidate.kind === 'inline');
  assert.ok(enter);
  game.applyMove(enter);
  assert.deepEqual(game.centerClaim, { player: 1, replies: 0 });

  const replyOne = game.legalMoves().find((move) => !move.selected.includes(coordKey([2, 0])));
  game.applyMove(replyOne);
  assert.deepEqual(game.centerClaim, { player: 1, replies: 1 });

  const azureWaiting = game.legalMoves().find((move) => !move.selected.includes(coordKey([0, 0])) && !move.selected.includes(coordKey([-1, 0])) && !move.selected.includes(coordKey([0, 1])));
  assert.ok(azureWaiting);
  game.applyMove(azureWaiting);
  const replyTwo = game.legalMoves().find((move) => !move.selected.includes(game.crown[2]));
  game.applyMove(replyTwo);
  assert.equal(game.winner, PLAYER.AZURE);
  assert.equal(game.winReason, 'center-held');
});

test('opening exchange changes no stones and is available only once', () => {
  const game = new AxisGame();
  const move = game.legalMoves().find((candidate) => !candidate.selected.includes(game.crown[1]));
  game.applyMove(move);
  const beforeClaim = JSON.stringify(game.board);
  assert.equal(game.canClaimOpening(), true);
  assert.equal(game.claimOpening().ok, true);
  assert.equal(JSON.stringify(game.board), beforeClaim);
  assert.equal(game.canClaimOpening(), false);
});

test('serialization preserves the complete tactical state', () => {
  const game = new AxisGame();
  game.applyMove(game.legalMoves().find((move) => !move.selected.includes(game.crown[1])));
  const restored = AxisGame.fromJSON(game.toJSON());
  assert.deepEqual(restored.toJSON(), game.toJSON());
});

test('all AI levels return a legal move', () => {
  const game = new AxisGame();
  const legal = new Set(game.legalMoves().map((move) => JSON.stringify(move)));
  for (const level of ['calm', 'club', 'sharp']) {
    const move = chooseAIMove(game, { level, style: 'balanced', rng: () => 0.42 });
    assert.ok(move);
    assert.ok(legal.has(JSON.stringify(move)));
  }
});
