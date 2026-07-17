import { applyMove, evaluatePosition, legalMoves, resolveSwap, stateKey, deserializeState } from "./engine.js";

const LIMITS = {
  impulse: { depth: 1, time: 80 },
  vector: { depth: 2, time: 260 },
  theorem: { depth: 4, time: 850 },
};
let deadline = 0;
let nodes = 0;
let aborted = false;
const transposition = new Map();

function checkTime() {
  nodes += 1;
  if ((nodes & 255) === 0 && performance.now() > deadline) {
    aborted = true;
    throw new Error("TIME");
  }
}

function orderedChildren(state, moves) {
  const maximizing = state.turn === 0;
  return moves.map((move) => {
    const child = applyMove({ ...state, swapStatus: state.swapStatus === "pending" ? "declined" : state.swapStatus }, move);
    return { move, child, score: evaluatePosition(child) };
  }).sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);
}

function search(state, depth, alpha, beta) {
  checkTime();
  const moves = legalMoves(state);
  if (!moves.length) return state.turn === 0 ? -100000 - depth : 100000 + depth;
  if (depth === 0) return evaluatePosition(state);
  const key = `${stateKey(state)}:${depth}`;
  const cached = transposition.get(key);
  if (cached !== undefined) return cached;
  const maximizing = state.turn === 0;
  let best = maximizing ? -Infinity : Infinity;
  for (const { child } of orderedChildren(state, moves)) {
    const value = search(child, depth - 1, alpha, beta);
    if (maximizing) { best = Math.max(best, value); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, value); beta = Math.min(beta, best); }
    if (alpha >= beta) break;
  }
  transposition.set(key, best);
  return best;
}

function evaluateMoves(state, depth) {
  const maximizing = state.turn === 0;
  const scored = orderedChildren(state, legalMoves(state)).map((candidate) => ({
    move: candidate.move,
    value: depth <= 1 ? candidate.score : search(candidate.child, depth - 1, -Infinity, Infinity),
  }));
  scored.sort((a, b) => maximizing ? b.value - a.value : a.value - b.value);
  return scored;
}

function chooseMove(state, difficulty) {
  const limits = LIMITS[difficulty] || LIMITS.vector;
  deadline = performance.now() + limits.time;
  nodes = 0;
  aborted = false;
  transposition.clear();
  let bestList = evaluateMoves(state, 1);
  let reachedDepth = 1;
  for (let depth = 2; depth <= limits.depth; depth += 1) {
    try {
      const next = evaluateMoves(state, depth);
      if (next.length) { bestList = next; reachedDepth = depth; }
    } catch (error) {
      if (error.message !== "TIME") throw error;
      break;
    }
  }
  const bestValue = bestList[0]?.value ?? 0;
  const tolerance = difficulty === "impulse" ? 14 : difficulty === "vector" ? 2.5 : 0.4;
  const nearBest = bestList.filter(({ value }) => Math.abs(value - bestValue) <= tolerance);
  const selection = nearBest[Math.floor(Math.random() * nearBest.length)] || bestList[0];
  return { move: selection?.move ?? null, score: selection?.value ?? 0, depth: reachedDepth, nodes, timedOut: aborted };
}

function chooseOpening(state, difficulty) {
  const candidates = legalMoves(state).map((move) => {
    const resolved = resolveSwap(applyMove(state, move), false);
    const value = evaluatePosition(resolved);
    return { move, value, fairness: Math.abs(value) };
  }).sort((a, b) => a.fairness - b.fairness);
  const tolerance = difficulty === "impulse" ? 8 : 0.55;
  const best = candidates[0]?.fairness ?? 0;
  const pool = candidates.filter(({ fairness }) => fairness <= best + tolerance);
  const selection = pool[Math.floor(Math.random() * pool.length)] || candidates[0];
  return { move: selection?.move ?? null, score: selection?.value ?? 0, depth: 1, nodes: candidates.length };
}

function decideSwap(state, difficulty) {
  const limits = LIMITS[difficulty] || LIMITS.vector;
  const resolved = resolveSwap(state, false);
  deadline = performance.now() + Math.max(90, limits.time * 0.55);
  nodes = 0;
  aborted = false;
  transposition.clear();
  let value = evaluatePosition(resolved);
  try { value = search(resolved, Math.min(limits.depth, 2), -Infinity, Infinity); }
  catch (error) { if (error.message !== "TIME") throw error; }
  return { swap: value > 0, score: value, depth: Math.min(limits.depth, 2), nodes };
}

self.addEventListener("message", (event) => {
  const { requestId, task, state: rawState, difficulty } = event.data;
  try {
    const state = deserializeState(rawState);
    const result = task === "opening" ? chooseOpening(state, difficulty) : task === "swap" ? decideSwap(state, difficulty) : chooseMove(state, difficulty);
    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({ requestId, ok: false, error: error?.message || "Ошибка поиска" });
  }
});
