import assert from 'node:assert/strict';
import { applyMove, createGame, getLegalMoves } from '../game.js';
import { AI_STYLES, analyzeTacticalState, chooseMove } from '../ai.js';

function rngFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function position(board, current = 1, phase = 0, captures = { 1: 0, 2: 0 }) {
  const state = createGame();
  state.board = { ...board };
  state.current = current;
  state.phase = phase;
  state.captures = { ...captures };
  state.swapAvailable = false;
  state.history = [];
  return state;
}

const capturePosition = position({
  '0,0': 2,
  '1,-1': 1,
  '0,-1': 1,
  '-1,1': 1
});

let captureChecks = 0;
for (const level of ['novice', 'tactician', 'oracle']) {
  for (const style of Object.keys(AI_STYLES)) {
    const move = chooseMove(capturePosition, { level, style, rng: rngFrom(17) });
    const result = applyMove(capturePosition, move);
    assert.equal(result.ok, true);
    assert.ok(
      result.state.captures[1] > capturePosition.captures[1],
      `${level}/${style} должен забирать немедленный камень, выбран ${JSON.stringify(move)}`
    );
    captureChecks += 1;
  }
}

for (const level of ['tactician', 'oracle']) {
  const endangered = position({
    '0,0': 1,
    '1,-1': 2,
    '0,-1': 2,
    '-1,1': 2
  });
  const move = chooseMove(endangered, { level, style: 'adaptive', rng: rngFrom(31) });
  const next = applyMove(endangered, move).state;
  let largestReplyCapture = 0;
  for (const reply of getLegalMoves(next)) {
    const result = applyMove(next, reply);
    const replyPlayer = next.current;
    largestReplyCapture = Math.max(
      largestReplyCapture,
      result.state.captures[replyPlayer] - next.captures[replyPlayer]
    );
  }
  assert.equal(largestReplyCapture, 0, `${level} не должен оставлять бесплатный ответный захват`);
}

const finishing = position({
  '0,0': 2,
  '1,-1': 1,
  '0,-1': 1,
  '-1,1': 1
}, 1, 0, { 1: 4, 2: 0 });
const finishMove = chooseMove(finishing, { level: 'oracle', style: 'adaptive', rng: rngFrom(5) });
assert.equal(applyMove(finishing, finishMove).state.winner, 1, 'Оракул должен завершать победу захватом');

const pressure = analyzeTacticalState(capturePosition, 1);
assert.ok(pressure.enemyFragility.zero > 0 || pressure.enemyFragility.atari > 0);

console.log(JSON.stringify({
  status: 'ok',
  captureChecks,
  defensiveChecks: 2,
  finishChecks: 1,
  pressureChecks: 1
}, null, 2));
