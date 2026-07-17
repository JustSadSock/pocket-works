import { applyMove, createInitialState, evaluatePosition, legalMoves, resolveSwap, stateKey } from "../engine.js";
class RNG { constructor(seed) { this.value = seed >>> 0; } next() { this.value = (1664525 * this.value + 1013904223) >>> 0; return this.value / 2 ** 32; } pick(items) { return items[Math.floor(this.next() * items.length)]; } }
const settled = (child) => child.swapStatus === "pending" ? resolveSwap(child, false) : child;
const randomMove = (state, rng) => rng.pick(legalMoves(state));
function minimaxValue(state, depth, memo = new Map()) {
  const moves = legalMoves(state);
  if (!moves.length) return state.turn === 0 ? -100000 - depth : 100000 + depth;
  if (depth === 0) return evaluatePosition(state);
  const key = `${stateKey(state)}:${depth}`;
  if (memo.has(key)) return memo.get(key);
  const values = moves.map((move) => minimaxValue(applyMove(state, move), depth - 1, memo));
  const value = state.turn === 0 ? Math.max(...values) : Math.min(...values);
  memo.set(key, value); return value;
}
function searchMove(state, rng, depth = 2) {
  const maximizing = state.turn === 0;
  const memo = new Map();
  const scored = legalMoves(state).map((move) => ({ move, score: minimaxValue(settled(applyMove(state, move)), Math.max(0, depth - 1), memo) })).sort((a,b) => maximizing ? b.score-a.score : a.score-b.score);
  const best = scored[0].score;
  return rng.pick(scored.filter(({ score }) => Math.abs(score - best) < .5)).move;
}
function fairOpening(state, rng) {
  const scored = legalMoves(state).map((move) => { const value = evaluatePosition(resolveSwap(applyMove(state, move), false)); return { move, fairness: Math.abs(value) }; }).sort((a,b) => a.fairness-b.fairness);
  const best = scored[0].fairness;
  return rng.pick(scored.filter(({ fairness }) => fairness <= best + .5)).move;
}
function play({ blue, orange, opening = blue, seed, pie = false }) {
  const rng = new RNG(seed);
  let state = createInitialState();
  let ownerByColor = [0, 1];
  state = applyMove(state, opening(state, rng));
  if (pie) {
    const position = resolveSwap(state, false);
    const shouldSwap = minimaxValue(position, 2) > 0;
    state = resolveSwap(state, shouldSwap);
    if (shouldSwap) ownerByColor = [1, 0];
  } else state = resolveSwap(state, false);
  while (state.winnerColor === null) {
    const moves = legalMoves(state);
    if (!moves.length) { state = { ...state, winnerColor: 1 - state.turn }; break; }
    state = applyMove(state, (state.turn === 0 ? blue : orange)(state, rng));
  }
  return { winnerColor: state.winnerColor, winnerPhysical: ownerByColor[state.winnerColor], plies: state.ply };
}
function run(label, options, games) {
  const results = Array.from({ length: games }, (_, index) => play({ ...options, seed: 1000 + index }));
  const blueWins = results.filter((result) => result.winnerColor === 0).length;
  const firstPhysicalWins = results.filter((result) => result.winnerPhysical === 0).length;
  const average = results.reduce((sum, result) => sum + result.plies, 0) / results.length;
  const lengths = new Set(results.map((result) => result.plies)).size;
  console.log(`${label}: blue=${(blueWins/games*100).toFixed(1)}% firstPhysical=${(firstPhysicalWins/games*100).toFixed(1)}% avg=${average.toFixed(1)} uniqueLengths=${lengths}`);
}
const search = (state, rng) => searchMove(state, rng, 2);
run("equal-search-no-pie", { blue: search, orange: search }, 100);
run("equal-search-pie", { blue: search, orange: search, opening: fairOpening, pie: true }, 100);
run("search-blue-vs-random", { blue: search, orange: randomMove }, 100);
run("random-blue-vs-search", { blue: randomMove, orange: search }, 100);
