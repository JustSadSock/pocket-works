import assert from 'node:assert/strict';
import {
  CELLS,
  PHASES,
  applyMove,
  createGame,
  findConnectionPath,
  getLegalMoves,
  hexDistance,
  neighborsFor,
  positionHash,
  resolveSwap,
  validateState
} from '../game.js';
import { chooseMove } from '../ai.js';

function rngFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function baseState() {
  const state = createGame();
  state.swapAvailable = false;
  return state;
}

function testGeometry() {
  assert.equal(CELLS.length, 37, 'radius-3 board should contain 37 sockets');
  assert.equal(PHASES.length, 3);
  for (const phase of PHASES) {
    assert.equal(phase.active.length, 4);
    assert.equal(phase.closedAxis.length, 2);
    assert.equal(neighborsFor('0,0', phase.id).length, 4);
  }
}

function testCapture() {
  const state = baseState();
  state.board = {
    '0,0': 2,
    '1,-1': 1,
    '0,-1': 1,
    '-1,1': 1
  };
  const result = applyMove(state, { cell: '0,1', phase: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.state.board['0,0'], undefined);
  assert.equal(result.state.captures[1], 1);
}

function testSelfCapture() {
  const state = baseState();
  state.board = {
    '1,-1': 2,
    '0,-1': 2,
    '-1,1': 2,
    '0,1': 2
  };
  const result = applyMove(state, { cell: '0,0', phase: 0 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Самозахват/);
}

function testHeldConnection() {
  const state = baseState();
  state.current = 2;
  state.phase = 1;
  state.pending[1] = true;
  for (let q = -3; q <= 3; q += 1) state.board[`${q},0`] = 1;
  const path = findConnectionPath(state.board, state.phase, 1);
  assert.equal(path.length, 7);
  const result = applyMove(state, { cell: '0,-3', phase: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.state.winner, 1);
  assert.equal(result.state.winReason, 'hold');
}

function testSwapRule() {
  let state = createGame();
  state = applyMove(state, { cell: '0,0', phase: 1 }).state;
  assert.equal(state.swapAvailable, true);
  assert.deepEqual(state.seats, { 1: 'A', 2: 'B' });
  state = resolveSwap(state, true).state;
  assert.deepEqual(state.seats, { 1: 'B', 2: 'A' });
  assert.equal(state.current, 2, 'the second color still moves after the seats swap');
}

function testHashAndValidation() {
  const state = createGame();
  assert.equal(validateState(state), true);
  assert.equal(positionHash(state), positionHash(JSON.parse(JSON.stringify(state))));
  const broken = JSON.parse(JSON.stringify(state));
  broken.board['99,99'] = 1;
  assert.equal(validateState(broken), false);
}

function fastMove(state, style, rng) {
  const legal = getLegalMoves(state);
  if (!legal.length) return null;
  const shuffledMoves = [...legal].sort(() => rng() - 0.5);
  const sample = shuffledMoves.slice(0, Math.min(12, shuffledMoves.length));
  const player = state.current;
  const captureBefore = state.captures[player];

  let best = null;
  for (const move of sample) {
    const result = applyMove(state, move);
    if (!result.ok) continue;
    const next = result.state;
    const captured = next.captures[player] - captureBefore;
    const distance = hexDistance(move.cell);
    const centerValue = 3 - distance;
    let score = rng() * 3;

    if (next.winner === player) score += 100000;
    if (next.pending[player]) score += style === 'architect' ? 30 : 14;
    if (!next.pending[3 - player] && state.pending[3 - player]) score += style === 'warden' ? 34 : 16;
    score += captured * (style === 'surgeon' ? 38 : 22);
    score += centerValue * (style === 'architect' ? 3.4 : style === 'warden' ? 1.4 : 2.2);
    score += move.phase * (style === 'adaptive' ? 0.7 : 0.2);

    if (!best || score > best.score) best = { move, score };
  }
  return best?.move || legal[Math.floor(rng() * legal.length)];
}

function testAiSmoke() {
  const rng = rngFrom(42);
  let state = createGame();
  const opening = chooseMove(state, { level: 'novice', style: 'adaptive', rng });
  assert.ok(opening);
  assert.ok(getLegalMoves(state).some((move) => move.cell === opening.cell && move.phase === opening.phase));
  state = applyMove(state, opening).state;
  state = resolveSwap(state, false).state;
  const reply = chooseMove(state, { level: 'tactician', style: 'surgeon', rng });
  assert.ok(reply);
  assert.ok(getLegalMoves(state).some((move) => move.cell === reply.cell && move.phase === reply.phase));
}

function playBotMatch(seed, firstStyle, secondStyle) {
  const rng = rngFrom(seed);
  let state = createGame({ startingSeat: seed % 2 ? 'A' : 'B' });
  let safety = 0;
  while (!state.winner && !state.draw && safety < 130) {
    if (state.swapAvailable) state = resolveSwap(state, false).state;
    const style = state.current === 1 ? firstStyle : secondStyle;
    const move = fastMove(state, style, rng);
    assert.ok(move, `bot should find a legal move at turn ${state.turn}`);
    const legal = getLegalMoves(state);
    assert.ok(legal.some((candidate) => candidate.cell === move.cell && candidate.phase === move.phase));
    const result = applyMove(state, move);
    assert.equal(result.ok, true, result.error);
    state = result.state;
    assert.equal(Object.keys(state.board).length, new Set(Object.keys(state.board)).size);
    assert.equal(validateState(state), true);
    safety += 1;
  }
  assert.ok(state.winner || state.draw, 'match must terminate');
  return state;
}

function runBotAudit() {
  const styles = ['architect', 'surgeon', 'warden', 'adaptive'];
  const totals = { 1: 0, 2: 0, draw: 0, turns: 0, hashes: new Set() };
  let match = 0;
  for (const first of styles) {
    for (const second of styles) {
      for (let repeat = 0; repeat < 8; repeat += 1) {
        const state = playBotMatch(1000 + match * 17, first, second);
        if (state.winner) totals[state.winner] += 1;
        else totals.draw += 1;
        totals.turns += state.turn;
        totals.hashes.add(positionHash(state));
        match += 1;
      }
    }
  }
  const games = match;
  return {
    games,
    firstColorWins: totals[1],
    secondColorWins: totals[2],
    draws: totals.draw,
    averageTurns: Number((totals.turns / games).toFixed(2)),
    uniqueFinalPositions: totals.hashes.size
  };
}

testGeometry();
testCapture();
testSelfCapture();
testHeldConnection();
testSwapRule();
testHashAndValidation();
testAiSmoke();
const audit = runBotAudit();
assert.equal(audit.games, 128);
assert.ok(audit.averageTurns >= 12 && audit.averageTurns <= 70);
assert.ok(audit.uniqueFinalPositions >= 100);
assert.ok(audit.draws <= 12);

console.log(JSON.stringify({ status: 'ok', audit }, null, 2));
