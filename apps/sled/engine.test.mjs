import assert from 'node:assert/strict';
import {
  applyMove,
  boardCellCount,
  createBoard,
  createGame,
  legalMoves,
  ownerOf,
  previewMove,
  rawScores,
  restoreGame,
  rotateIndex180,
  scoreState,
  serializeGame
} from './engine.mjs';

for (const radius of [3, 4, 5]) {
  const board = createBoard(radius);
  assert.equal(board.count, boardCellCount(radius));
  assert.equal(board.neighbors.length, board.count);
  board.neighbors.forEach((neighbors, from) => {
    for (const to of neighbors) {
      if (to < 0) continue;
      assert(board.neighbors[to].includes(from), `asymmetric edge ${from}-${to}`);
    }
  });
  board.cells.forEach((_, index) => assert.equal(rotateIndex180(radius, rotateIndex180(radius, index)), index));
}

let state = createGame({ radius: 3 });
assert.equal(state.schema, 4);
assert.equal(legalMoves(state).length, 6);
const first = legalMoves(state)[0];
const forecast = previewMove(state, first);
assert(forecast && forecast.gain >= 1);
const from = state.positions[0];
state = applyMove(state, first);
assert.equal(ownerOf(state, from), 0);
assert.equal(rawScores(state)[0], forecast.gain);
assert.equal(state.current, 1);
assert.equal(state.plies, 1);

const restored = restoreGame(serializeGame(state));
assert(restored);
assert.deepEqual(rawScores(restored), rawScores(state));
assert.deepEqual(scoreState(restored), scoreState(state));
assert.equal(restoreGame({ ...serializeGame(state), schema: 3 }), null);

for (const radius of [3, 4, 5]) {
  for (let seed = 0; seed < 100; seed += 1) {
    let game = createGame({ radius });
    let step = 0;
    while (!game.ended && step < boardCellCount(radius) * 2) {
      const moves = legalMoves(game);
      assert(moves.length > 0, 'non-terminal state without moves');
      const move = moves[(seed * 17 + step * 11) % moves.length];
      game = applyMove(game, move);
      step += 1;
    }
    assert(game.ended, `radius ${radius}, seed ${seed} did not terminate`);
    assert(['split', 'trap'].includes(game.reason));
    assert([0, 1].includes(game.winner));
  }
}

console.log('СЛЕД 3.0 engine tests: ok');
