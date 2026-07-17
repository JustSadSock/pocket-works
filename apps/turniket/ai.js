import {
  applyGate,
  applyMove,
  edgeAllows,
  getLegalMoves,
  goalReached,
  placementSlots
} from './game.js';

const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];

function inside(state, cell) {
  return cell.r >= 0 && cell.r < state.size && cell.c >= 0 && cell.c < state.size;
}

function cellKey(state, cell) {
  return cell.r * state.size + cell.c;
}

export function shortestDirectedDistance(state, player) {
  const start = state.pawns[player];
  if (goalReached(state, player, start)) return 0;

  const queue = [{ cell: start, distance: 0 }];
  const visited = new Set([cellKey(state, start)]);

  while (queue.length) {
    const current = queue.shift();
    for (const [dr, dc] of STEPS) {
      const next = { r: current.cell.r + dr, c: current.cell.c + dc };
      if (!inside(state, next) || !edgeAllows(state, current.cell, next)) continue;
      const key = cellKey(state, next);
      if (visited.has(key)) continue;
      if (goalReached(state, player, next)) return current.distance + 1;
      visited.add(key);
      queue.push({ cell: next, distance: current.distance + 1 });
    }
  }

  return 99;
}

function progress(state, player) {
  const pawn = state.pawns[player];
  return player === 0 ? state.size - 1 - pawn.r : pawn.r;
}

export function evaluateState(state, aiPlayer) {
  if (state.status !== 'playing') {
    if (state.winner === aiPlayer) return 1_000_000;
    if (state.winner === 1 - aiPlayer) return -1_000_000;
  }

  const opponent = 1 - aiPlayer;
  const aiDistance = shortestDirectedDistance(state, aiPlayer);
  const opponentDistance = shortestDirectedDistance(state, opponent);
  const aiMobility = getLegalMoves(state, aiPlayer).length;
  const opponentMobility = getLegalMoves(state, opponent).length;
  const reserve = state.gatesLeft[aiPlayer] - state.gatesLeft[opponent];
  const progressDelta = progress(state, aiPlayer) - progress(state, opponent);

  return (
    (opponentDistance - aiDistance) * 115 +
    (aiMobility - opponentMobility) * 8 +
    reserve * 5 +
    progressDelta * 10
  );
}

export function applyAiAction(state, action) {
  if (!action) return null;
  if (action.type === 'move') return applyMove(state, action.move);
  return applyGate(state, action.slot, action.dir);
}

function gateProximity(state, slot) {
  const center = { r: slot.r + 0.5, c: slot.c + 0.5 };
  const opponent = state.pawns[1 - state.turn];
  const self = state.pawns[state.turn];
  const opponentDistance = Math.abs(center.r - opponent.r) + Math.abs(center.c - opponent.c);
  const selfDistance = Math.abs(center.r - self.r) + Math.abs(center.c - self.c);
  const centerDistance = Math.abs(center.r - (state.size - 1) / 2) + Math.abs(center.c - (state.size - 1) / 2);
  return opponentDistance * 1.4 + selfDistance * 0.25 + centerDistance * 0.08;
}

export function enumerateAiActions(state, options = {}) {
  if (state.status !== 'playing') return [];
  const includeAllGates = options.includeAllGates ?? true;
  const gateLimit = options.gateLimit ?? 56;
  const actions = getLegalMoves(state, state.turn).map((move) => ({ type: 'move', move }));

  if (state.gatesLeft[state.turn] <= 0) return actions;

  let slots = placementSlots(state);
  if (!includeAllGates && slots.length > gateLimit) {
    slots = [...slots]
      .sort((a, b) => gateProximity(state, a) - gateProximity(state, b))
      .slice(0, gateLimit);
  }

  for (const slot of slots) {
    for (const dir of slot.legalDirs) {
      actions.push({
        type: 'gate',
        slot: { orientation: slot.orientation, r: slot.r, c: slot.c },
        dir
      });
    }
  }

  return actions;
}

function scoreActions(state, aiPlayer, actions) {
  return actions
    .map((action) => {
      const next = applyAiAction(state, action);
      return next ? { action, next, score: evaluateState(next, aiPlayer) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function pickWithNoise(scored, rng, spread) {
  if (!scored.length) return null;
  const count = Math.min(spread, scored.length);
  const weights = Array.from({ length: count }, (_, index) => count - index);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = rng() * total;
  for (let index = 0; index < count; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return scored[index].action;
  }
  return scored[0].action;
}

function opponentReplyScore(next, aiPlayer, replyLimit) {
  if (next.status !== 'playing') return evaluateState(next, aiPlayer);
  const replies = enumerateAiActions(next, { includeAllGates: false, gateLimit: 34 });
  const scoredReplies = scoreActions(next, aiPlayer, replies).slice(-replyLimit);
  if (!scoredReplies.length) return evaluateState(next, aiPlayer);
  return scoredReplies[0].score;
}

export function chooseAiAction(state, difficulty = 'strategist', rng = Math.random) {
  const aiPlayer = state.turn;
  const allActions = enumerateAiActions(state, {
    includeAllGates: difficulty !== 'oracle',
    gateLimit: difficulty === 'oracle' ? 46 : 72
  });
  if (!allActions.length) return null;

  const scored = scoreActions(state, aiPlayer, allActions);
  const immediateWin = scored.find((entry) => entry.next.status !== 'playing' && entry.next.winner === aiPlayer);
  if (immediateWin) return immediateWin.action;

  if (difficulty === 'apprentice') {
    return pickWithNoise(scored, rng, 7);
  }

  if (difficulty === 'strategist') {
    const bestScore = scored[0].score;
    const close = scored.filter((entry) => entry.score >= bestScore - 18).slice(0, 4);
    return close[Math.floor(rng() * close.length)].action;
  }

  const candidates = scored.slice(0, 28);
  let best = null;
  for (const candidate of candidates) {
    const score = opponentReplyScore(candidate.next, aiPlayer, 1);
    const combined = score + candidate.score * 0.08;
    if (!best || combined > best.score) best = { action: candidate.action, score: combined };
  }
  return best?.action || scored[0].action;
}
