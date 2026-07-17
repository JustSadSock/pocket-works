import assert from 'node:assert/strict';
import {
  COBALT,
  EMPTY,
  VERMILION,
  applyMove,
  connectionCost,
  createBoard,
  findConnection,
  isImmediateReverse,
  listMoves,
  resolveWinner
} from './game-core.js';
import { chooseMove } from './ai.js';

{
  const board = createBoard();
  board[0] = [VERMILION, COBALT, EMPTY, VERMILION, COBALT];
  const result = applyMove(board, { side: 'left', index: 0 }, VERMILION);
  assert.deepEqual(result.board[0], [VERMILION, VERMILION, COBALT, EMPTY, VERMILION]);
  assert.equal(result.ejected, COBALT);
  assert.deepEqual(board[0], [VERMILION, COBALT, EMPTY, VERMILION, COBALT], 'applyMove must not mutate source board');
}

{
  const board = createBoard();
  board[2] = [VERMILION, VERMILION, VERMILION, VERMILION, VERMILION];
  const path = findConnection(board, VERMILION);
  assert.equal(path.length, 5);
  assert.equal(resolveWinner(board, VERMILION).player, VERMILION);
}

{
  const board = createBoard();
  for (let row = 0; row < 5; row += 1) board[row][3] = COBALT;
  const path = findConnection(board, COBALT);
  assert.equal(path.length, 5);
  assert.equal(resolveWinner(board, VERMILION).player, COBALT, 'a move may gift the opponent a connection');
}

{
  assert.equal(isImmediateReverse({ side: 'right', index: 2 }, { side: 'left', index: 2 }), true);
  assert.equal(isImmediateReverse({ side: 'bottom', index: 2 }, { side: 'left', index: 2 }), false);
  assert.equal(listMoves({ side: 'left', index: 2 }).length, 19);
}

{
  const board = createBoard();
  assert.equal(connectionCost(board, VERMILION), 5);
  assert.equal(connectionCost(board, COBALT), 5);
}

{
  const board = createBoard();
  board[2] = [VERMILION, VERMILION, VERMILION, VERMILION, EMPTY];
  const move = chooseMove({ board, aiColor: VERMILION, difficulty: 'predator' });
  const result = applyMove(board, move, VERMILION).board;
  assert.equal(resolveWinner(result, VERMILION)?.player, VERMILION, 'AI should take an immediate win');
}

console.log('СДВИГ: core and AI checks passed');
