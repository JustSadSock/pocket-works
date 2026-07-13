import { analyzePosition, now, stateAfterMove } from './ai-core.js';
import { generateMoves } from './ai-policy.js';

const INF = 1e9;

const LEVELS = {
  calm: {
    budget: 420,
    maxDepth: 3,
    rootLimit: 9,
    branch: [7, 6, 5, 4],
    quiescenceDepth: 2,
    quiescenceBranch: 4,
    nodeLimit: 6500,
    choiceWindow: 2.2,
    temperature: 1.15
  },
  steady: {
    budget: 1850,
    maxDepth: 4,
    rootLimit: 12,
    branch: [9, 8, 7, 6, 5],
    quiescenceDepth: 3,
    quiescenceBranch: 5,
    nodeLimit: 26000,
    choiceWindow: 0.9,
    temperature: 0.58
  },
  sharp: {
    budget: 3900,
    maxDepth: 5,
    rootLimit: 15,
    branch: [11, 9, 8, 7, 6, 5],
    quiescenceDepth: 4,
    quiescenceBranch: 6,
    nodeLimit: 70000,
    choiceWindow: 0.28,
    temperature: 0.2
  }
};

class SearchStopped extends Error {}

function searchProfile(level, size) {
  const profile = { ...(LEVELS[level] || LEVELS.steady) };
  profile.branch = [...profile.branch];
  if (size === 9) {
    profile.maxDepth += 1;
    profile.nodeLimit = Math.round(profile.nodeLimit * 1.25);
  } else if (size === 19 && level !== 'sharp') {
    profile.rootLimit = Math.max(8, profile.rootLimit - 2);
  }
  return profile;
}

function boardHash(state) {
  let hash = 2166136261;
  for (let index = 0; index < state.board.length; index += 1) {
    hash ^= state.board[index] + index * 3;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= state.turn * 0x9e3779b1;
  hash = Math.imul(hash, 16777619);
  hash ^= (state.passes || 0) * 0x85ebca6b;
  return hash >>> 0;
}

function stopIfNeeded(search) {
  search.nodes += 1;
  if (search.nodes >= search.profile.nodeLimit || now() >= search.deadline) throw new SearchStopped();
}

function staticValue(state, rootColor) {
  return analyzePosition(state, rootColor).value;
}

function moveOrder(move) {
  if (move.pass) return -100000 + (move.prior || 0);
  return (move.prior || 0)
    + (move.captureCount || 0) * 1800
    + (move.savedAtari || 0) * 1450
    + (move.attackAtari || 0) * 520
    + Math.max(0, move.frontierGain || 0) * 24
    + (move.claimed || 0) * 18
    + (move.reduced || 0) * 15
    + Math.max(0, move.shapeDelta || 0) * 12;
}

function orderedMoves(state, search, ply, includePass = true) {
  const branchLimit = search.profile.branch[Math.min(ply, search.profile.branch.length - 1)];
  const generated = generateMoves(
    state,
    state.turn,
    Math.max(branchLimit * 2, branchLimit + 3),
    true,
    includePass,
    search.context
  );
  generated.sort((a, b) => moveOrder(b) - moveOrder(a));
  return generated.slice(0, branchLimit);
}

function tacticalMoves(state, search) {
  const generated = generateMoves(
    state,
    state.turn,
    search.profile.quiescenceBranch * 3,
    false,
    false,
    search.context
  );
  return generated
    .filter((move) => !move.pass && (
      move.captureCount > 0
      || move.savedAtari > 0
      || move.attackAtari > 0
      || (move.urgent && (move.frontierGain || 0) >= 0)
    ))
    .sort((a, b) => moveOrder(b) - moveOrder(a))
    .slice(0, search.profile.quiescenceBranch);
}

function tableKey(state, depth, quiescenceDepth) {
  return `${boardHash(state)}:${depth}:${quiescenceDepth}`;
}

function alphaBeta(state, depth, alpha, beta, rootColor, search, ply, quiescenceDepth) {
  stopIfNeeded(search);
  if ((state.passes || 0) >= 2) return staticValue(state, rootColor);

  const key = tableKey(state, depth, quiescenceDepth);
  const cached = search.table.get(key);
  if (cached) {
    if (cached.flag === 'exact') return cached.value;
    if (cached.flag === 'lower') alpha = Math.max(alpha, cached.value);
    else if (cached.flag === 'upper') beta = Math.min(beta, cached.value);
    if (alpha >= beta) return cached.value;
  }

  const alphaStart = alpha;
  const betaStart = beta;
  const maximizing = state.turn === rootColor;
  let moves;

  if (depth <= 0) {
    if (quiescenceDepth <= 0) return staticValue(state, rootColor);
    moves = tacticalMoves(state, search);
    if (!moves.length) return staticValue(state, rootColor);
  } else {
    moves = orderedMoves(state, search, ply, true);
    if (!moves.length) return staticValue(state, rootColor);
  }

  let best = maximizing ? -INF : INF;
  let legalChildren = 0;
  for (const move of moves) {
    const child = stateAfterMove(state, move, state.turn);
    if (!child) continue;
    legalChildren += 1;
    const value = alphaBeta(
      child,
      depth > 0 ? depth - 1 : 0,
      alpha,
      beta,
      rootColor,
      search,
      ply + 1,
      depth > 0 ? quiescenceDepth : quiescenceDepth - 1
    );
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) {
      search.cutoffs += 1;
      break;
    }
  }

  if (!legalChildren) best = staticValue(state, rootColor);
  const flag = best <= alphaStart ? 'upper' : best >= betaStart ? 'lower' : 'exact';
  search.table.set(key, { value: best, flag });
  return best;
}

function rootOrder(rootMoves, previousScores, limit) {
  const moves = rootMoves.filter((move) => !move.pass && !move.wasteful);
  moves.sort((a, b) => {
    const previousA = previousScores.get(`${a.x},${a.y}`);
    const previousB = previousScores.get(`${b.x},${b.y}`);
    if (previousA !== undefined || previousB !== undefined) return (previousB ?? -INF) - (previousA ?? -INF);
    return moveOrder(b) - moveOrder(a);
  });
  return moves.slice(0, limit);
}

function chooseNearBest(results, context, profile) {
  if (!results.length) return null;
  results.sort((a, b) => b.value - a.value || b.depth - a.depth || moveOrder(b.move) - moveOrder(a.move));
  const best = results[0].value;
  const pool = results.filter((item) => item.value >= best - profile.choiceWindow).slice(0, 4);
  if (pool.length === 1 || context.level === 'sharp') return pool[0];

  const bestPrior = Math.max(...pool.map((item) => item.move.prior || 0));
  const weights = pool.map((item) => {
    const calculated = Math.exp((item.value - best) / Math.max(0.12, profile.temperature));
    const styleTieBreak = 1 + Math.max(-0.18, Math.min(0.18, ((item.move.prior || 0) - bestPrior) / 240));
    return calculated * styleTieBreak;
  });
  let roll = context.rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[0];
}

async function yieldFrame() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function calculateBestMove(game, rootMoves, level, context) {
  const profile = searchProfile(level, game.size);
  const rootColor = game.turn;
  const search = {
    profile,
    context,
    deadline: now() + profile.budget,
    nodes: 0,
    cutoffs: 0,
    table: new Map()
  };
  const previousScores = new Map();
  let completed = [];
  let completedDepth = 0;

  for (let depth = 1; depth <= profile.maxDepth; depth += 1) {
    const iteration = [];
    let alpha = -INF;
    let finished = true;
    const candidates = rootOrder(rootMoves, previousScores, profile.rootLimit);
    for (let index = 0; index < candidates.length; index += 1) {
      const move = candidates[index];
      const child = stateAfterMove(game, move, rootColor);
      if (!child) continue;
      try {
        const value = alphaBeta(
          child,
          depth - 1,
          alpha,
          INF,
          rootColor,
          search,
          1,
          profile.quiescenceDepth
        );
        iteration.push({ move, value, depth });
        previousScores.set(`${move.x},${move.y}`, value);
        alpha = Math.max(alpha, value);
      } catch (error) {
        if (!(error instanceof SearchStopped)) throw error;
        finished = false;
        break;
      }
      if ((index & 1) === 1) await yieldFrame();
    }
    if (!finished || iteration.length !== candidates.length) break;
    completed = iteration;
    completedDepth = depth;
    await yieldFrame();
  }

  if (!completed.length) {
    const fallback = rootOrder(rootMoves, previousScores, 1)[0];
    return fallback ? { move: fallback, value: fallback.prior || 0, depth: 0, nodes: search.nodes, cutoffs: search.cutoffs } : null;
  }

  const chosen = chooseNearBest(completed, context, profile);
  return chosen ? {
    ...chosen,
    depth: completedDepth,
    nodes: search.nodes,
    cutoffs: search.cutoffs,
    candidates: completed.length
  } : null;
}
