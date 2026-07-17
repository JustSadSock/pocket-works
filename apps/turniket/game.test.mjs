import assert from 'node:assert/strict';
import {
  applyGate,
  applyMove,
  createMatch,
  edgeAllows,
  getLegalMoves,
  getPlacementDirections,
  hasDirectedPath,
  hydrateState,
  placementSlots,
  startNextRound,
  validGateSlot
} from './game.js';

{
  const state = createMatch();
  assert.equal(state.size, 7);
  assert.equal(getLegalMoves(state).length, 3, 'starting pawn has three legal moves');
  assert.equal(hasDirectedPath(state, 0), true);
  assert.equal(hasDirectedPath(state, 1), true);
  assert.ok(placementSlots(state).length > 30, 'board exposes many legal gate slots');
}

{
  const state = createMatch();
  const horizontal = { orientation: 'h', r: 4, c: 2 };
  assert.deepEqual(getPlacementDirections(state, horizontal), [-1, 1]);
  const gated = applyGate(state, horizontal, -1);
  assert.ok(gated);
  assert.equal(gated.gates.length, 1);
  assert.equal(gated.gates[0].owner, 0);
  assert.equal(gated.gatesLeft[0], 6);
  assert.equal(gated.turn, 1);
  assert.equal(edgeAllows(gated, { r: 5, c: 2 }, { r: 4, c: 2 }), true, 'upward gate allows upward travel');
  assert.equal(edgeAllows(gated, { r: 4, c: 2 }, { r: 5, c: 2 }), false, 'upward gate blocks downward travel');
  assert.equal(validGateSlot(gated, { orientation: 'v', r: 4, c: 2 }), false, 'gates cannot cross at one junction');
  assert.equal(validGateSlot(gated, { orientation: 'h', r: 4, c: 3 }), false, 'gates cannot overlap one segment');
}

{
  const state = createMatch();
  state.pawns = [{ r: 6, c: 2 }, { r: 0, c: 3 }];
  state.gates = [{ id: 'g1', orientation: 'h', r: 5, c: 2, dir: -1, owner: 0 }];
  state.nextGateId = 2;
  const move = getLegalMoves(state, 0).find((candidate) => candidate.to.r === 5 && candidate.to.c === 2);
  assert.ok(move, 'pawn can cross in the allowed direction');
  const next = applyMove(state, move);
  assert.equal(next.gates[0].dir, 1, 'crossed gate flips direction');
  assert.deepEqual(next.lastAction.flippedGateIds, ['g1']);
}

{
  const state = createMatch();
  state.pawns = [{ r: 3, c: 3 }, { r: 2, c: 3 }];
  const jump = getLegalMoves(state, 0).find((candidate) => candidate.kind === 'jump' && candidate.to.r === 1 && candidate.to.c === 3);
  assert.ok(jump, 'straight jump over the opponent is legal');

  state.gates = [{ id: 'g1', orientation: 'h', r: 1, c: 2, dir: 1, owner: 1 }];
  const moves = getLegalMoves(state, 0);
  assert.equal(moves.some((candidate) => candidate.kind === 'jump'), false, 'blocked straight jump disappears');
  assert.equal(moves.filter((candidate) => candidate.kind === 'diagonal').length, 2, 'two diagonal detours appear');
}

{
  const state = createMatch({ size: 5, gatesPerPlayer: 4 });
  state.gates.push(
    { id: 'g1', orientation: 'h', r: 2, c: 0, dir: 1, owner: 0 },
    { id: 'g2', orientation: 'v', r: 3, c: 3, dir: -1, owner: 1 }
  );
  state.nextGateId = 3;
  const finalBarrier = { orientation: 'h', r: 2, c: 2 };
  const dirs = getPlacementDirections(state, finalBarrier);
  assert.equal(dirs.includes(1), false, 'placement cannot erase player 1 upward route');
  assert.equal(dirs.includes(-1), true, 'reverse orientation remains legal');
}

{
  const state = createMatch();
  state.pawns = [{ r: 1, c: 3 }, { r: 0, c: 0 }];
  const winningMove = getLegalMoves(state, 0).find((candidate) => candidate.to.r === 0 && candidate.to.c === 3);
  const won = applyMove(state, winningMove);
  assert.equal(won.status, 'round-over');
  assert.equal(won.winner, 0);
  assert.equal(won.winReason, 'reached');
  assert.deepEqual(won.scores, [1, 0]);
}

{
  const state = createMatch();
  const p0Move = getLegalMoves(state, 0).find((move) => move.to.r === 5 && move.to.c === 3);
  const afterP0 = applyMove(state, p0Move);
  const p1Move = getLegalMoves(afterP0, 1).find((move) => move.to.r === 1 && move.to.c === 3);
  const afterP1 = applyMove(afterP0, p1Move);
  const restored = hydrateState(JSON.stringify(afterP1));
  assert.ok(restored);
  assert.deepEqual(restored.pawns, afterP1.pawns);

  const roundState = { ...afterP1, status: 'round-over', winner: 0, winReason: 'reached', scores: [1, 0], starter: 0, round: 1 };
  const nextRound = startNextRound(roundState);
  assert.equal(nextRound.starter, 1);
  assert.equal(nextRound.turn, 1);
  assert.deepEqual(nextRound.scores, [1, 0]);
  assert.equal(nextRound.round, 2);
}

assert.equal(hydrateState('{broken'), null, 'corrupt persistence is rejected');
console.log('TURNIKET engine tests passed');
