import assert from 'node:assert/strict';
import { applyMove, createGame, edgeId, getTeamScores, listOpenEdges } from './game.js';
import { chooseAiMove } from './ai.js';

const players = [
  { id: 'a', name: 'A', team: 0 },
  { id: 'b', name: 'B', team: 1 }
];

{
  const game = createGame({ players });
  assert.equal(listOpenEdges(game).length, 60);
  const one = applyMove(game, edgeId('h', 0, 0));
  assert.equal(one.ok, true);
  assert.equal(one.game.currentPlayer, 1);
  assert.equal(one.game.revision, 1);
}

{
  let game = createGame({ players });
  game.currentPlayer = 0;
  game.horizontal[0] = 0;
  game.horizontal[5] = 1;
  game.vertical[0] = 0;
  const result = applyMove(game, edgeId('v', 0, 1), 0);
  assert.equal(result.captured.length, 1);
  assert.equal(result.game.scores[0], 1);
  assert.equal(result.game.currentPlayer, 0);
}

{
  const game = createGame({ players });
  game.horizontal[0] = 0;
  game.horizontal[5] = 1;
  game.vertical[0] = 0;
  const move = chooseAiMove(game);
  assert.equal(move, 'v:0:1');
}

{
  const game = createGame({ players: [
    { id: 'a', name: 'A', team: 0 },
    { id: 'b', name: 'B', team: 1 },
    { id: 'c', name: 'C', team: 0 },
    { id: 'd', name: 'D', team: 1 }
  ] });
  game.scores = [4, 3, 2, 5];
  assert.deepEqual(getTeamScores(game), [{ team: 0, score: 6 }, { team: 1, score: 8 }]);
}

console.log('ZAMKNI game rules and AI tests passed.');
