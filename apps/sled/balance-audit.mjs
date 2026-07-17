import assert from 'node:assert/strict';
import {
  PASS,
  applyMove,
  createGame,
  legalMoves,
  mobility,
  rawScores,
  scoreState,
  territoryForecast
} from './engine.mjs';

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function probeMove(state, rng) {
  const legal = legalMoves(state);
  if (legal.length === 1) return legal[0];
  if (rng() < 0.22) return legal[Math.floor(rng() * legal.length)];
  const mover = state.current;
  const opponent = 1 - mover;
  let best = legal[0];
  let bestScore = -Infinity;
  for (const move of legal) {
    if (move === PASS) return PASS;
    const next = applyMove(state, move);
    const forecast = territoryForecast(next);
    const claimed = rawScores(next);
    const score =
      (forecast.control[mover] - forecast.control[opponent]) * 2.4 +
      (mobility(next, mover) - mobility(next, opponent)) * 1.1 +
      (claimed[mover] - claimed[opponent]) * 3 +
      rng() * 4.5;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function play(radius, seed) {
  const rng = makeRng(seed);
  let state = createGame({ radius });
  let guard = 0;
  while (!state.ended && guard < 300) {
    state = applyMove(state, probeMove(state, rng));
    guard += 1;
  }
  assert(state.ended, `radius ${radius} game ${seed} did not terminate`);
  const scores = scoreState(state);
  assert.notEqual(scores[0], scores[1], 'komi must prevent ties');
  return state.winner;
}

const report = [];
for (const radius of [3, 4, 5]) {
  const wins = [0, 0];
  const games = 600;
  for (let seed = 1; seed <= games; seed += 1) wins[play(radius, seed * 7919 + radius * 104729)] += 1;
  const firstRate = wins[0] / games;
  const secondRate = wins[1] / games;
  assert(firstRate > 0.35 && firstRate < 0.65, `radius ${radius}: first seat rate ${firstRate}`);
  assert(secondRate > 0.35 && secondRate < 0.65, `radius ${radius}: second seat rate ${secondRate}`);
  report.push({ radius, games, first: wins[0], second: wins[1], firstRate, secondRate });
}

console.log(JSON.stringify({ audit: 'sled-2.0-seat-balance', report }, null, 2));
