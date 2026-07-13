import { cloneState, stateAfterMove, analyzePosition, now } from './ai-core.js';
import { generateMoves, chooseOpeningBookMove } from './ai-policy.js';
import { addRootDiversity, buildSearchContext, chooseHumanLikeChild, rememberOpening } from './ai-adaptation.js';

const LEVELS = {
  calm: { budget: 320, rootCandidates: 22, nodeCandidates: 12, rolloutCandidates: 9, rolloutDepth: 12, treeDepth: 4, exploration: 1.34, priorWeight: 0.34, initialChildren: 5, widen: 1.25, yieldEvery: 40 },
  steady: { budget: 1450, rootCandidates: 34, nodeCandidates: 17, rolloutCandidates: 12, rolloutDepth: 19, treeDepth: 6, exploration: 1.16, priorWeight: 0.44, initialChildren: 7, widen: 1.55, yieldEvery: 56 },
  sharp: { budget: 3300, rootCandidates: 44, nodeCandidates: 21, rolloutCandidates: 15, rolloutDepth: 27, treeDepth: 8, exploration: 1.02, priorWeight: 0.5, initialChildren: 9, widen: 1.8, yieldEvery: 64 }
};

function makeNode(state, parent = null, move = null, prior = 0) {
  return { state, parent, move, prior, visits: 0, valueSum: 0, children: [], moves: null, expandedCount: 0 };
}

function ensureMoves(node, profile, root, context) {
  if (node.moves) return;
  if (node.state.passes >= 2) {
    node.moves = [];
    return;
  }
  node.moves = generateMoves(node.state, node.state.turn, root ? profile.rootCandidates : profile.nodeCandidates, true, true, context);
}

function expandNode(node, profile, root, context) {
  ensureMoves(node, profile, root, context);
  if (node.expandedCount >= node.moves.length) return null;
  const move = node.moves[node.expandedCount++];
  const childState = stateAfterMove(node.state, move, node.state.turn);
  if (!childState) return null;
  const child = makeNode(childState, node, move, move.prior || 0);
  node.children.push(child);
  return child;
}

function selectChild(node, rootColor, profile) {
  const parentVisits = Math.max(1, node.visits);
  const maximizing = node.state.turn === rootColor;
  let best = null;
  let bestScore = -Infinity;
  for (const child of node.children) {
    const q = child.visits ? child.valueSum / child.visits : 0;
    const exploitation = maximizing ? q : -q;
    const exploration = profile.exploration * Math.sqrt(Math.log(parentVisits + 1) / (child.visits + 0.35));
    const prior = profile.priorWeight * Math.tanh(child.prior / 95) / (1 + child.visits * 0.2);
    const score = exploitation + exploration + prior;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function pickWeighted(moves, context, temperature = 0.9) {
  if (!moves.length) return null;
  const tactical = moves.find((move) => move.urgent && !move.pass);
  if (tactical && context.rng() < 0.9) return tactical;
  const pool = moves.slice(0, Math.min(6, moves.length));
  const top = pool[0].prior;
  const weights = pool.map((move) => {
    const quality = Math.exp(Math.max(-18, (move.prior - top) / Math.max(0.25, temperature)));
    const productive = move.pass ? 0.85 : 1 + Math.max(0, move.frontierGain || 0) * 0.05 + (move.claimed || 0) * 0.04;
    return quality * productive;
  });
  let roll = context.rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[0];
}

function rollout(startState, rootColor, profile, context) {
  let state = cloneState(startState);
  let consecutivePasses = state.passes || 0;
  for (let depth = 0; depth < profile.rolloutDepth && consecutivePasses < 2; depth += 1) {
    const moves = generateMoves(state, state.turn, profile.rolloutCandidates, false, true, context);
    const move = pickWeighted(moves, context, 1.05 + depth * 0.028);
    if (!move) break;
    state = stateAfterMove(state, move, state.turn);
    if (!state) break;
    consecutivePasses = move.pass ? consecutivePasses + 1 : 0;
  }
  const evaluation = analyzePosition(state, rootColor);
  return Math.tanh(evaluation.value / Math.max(22, state.size * 2.15));
}

function backpropagate(node, value) {
  for (let current = node; current; current = current.parent) {
    current.visits += 1;
    current.valueSum += value;
  }
}

async function yieldFrame() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function strongestTactical(moves, field) {
  const tactical = moves.filter((move) => !move.pass && move[field] > 0);
  tactical.sort((a, b) => b[field] - a[field] || b.prior - a.prior);
  return tactical[0] || null;
}

export async function chooseAiMove(game, level = 'steady') {
  const profile = LEVELS[level] || LEVELS.steady;
  const context = buildSearchContext(game, level);
  const rootColor = game.turn;
  const root = makeNode(cloneState(game));
  root.moves = generateMoves(root.state, rootColor, profile.rootCandidates, true, true, context);

  const capture = strongestTactical(root.moves, 'captureCount');
  if (capture) return { x: capture.x, y: capture.y, score: capture.prior, visits: 0, simulations: 0, plan: context.personality };

  const save = strongestTactical(root.moves, 'savedAtari');
  if (save) return { x: save.x, y: save.y, score: save.prior, visits: 0, simulations: 0, plan: context.personality };

  const bookMove = chooseOpeningBookMove(root.state, root.moves, level, context);
  if (bookMove) {
    rememberOpening(game, bookMove);
    return { x: bookMove.x, y: bookMove.y, score: Math.max(0, bookMove.prior), visits: 0, simulations: 0, plan: context.personality };
  }

  addRootDiversity(root.moves, context);
  const deadline = now() + profile.budget;
  let simulations = 0;
  while (now() < deadline) {
    let node = root;
    let depth = 0;
    while (depth < profile.treeDepth) {
      ensureMoves(node, profile, node === root, context);
      const allowed = Math.min(node.moves.length, profile.initialChildren + Math.floor(Math.sqrt(node.visits + 1) * profile.widen));
      if (node.children.length < allowed && node.expandedCount < node.moves.length) {
        const expanded = expandNode(node, profile, node === root, context);
        if (expanded) node = expanded;
        break;
      }
      if (!node.children.length) break;
      const selected = selectChild(node, rootColor, profile);
      if (!selected) break;
      node = selected;
      depth += 1;
    }
    backpropagate(node, rollout(node.state, rootColor, profile, context));
    simulations += 1;
    if (simulations % profile.yieldEvery === 0) await yieldFrame();
  }

  const chosen = chooseHumanLikeChild(root.children, context);
  if (!chosen || chosen.move?.pass) return null;
  rememberOpening(game, chosen.move);
  return {
    x: chosen.move.x,
    y: chosen.move.y,
    score: Math.max(-0.45, chosen.visits ? chosen.valueSum / chosen.visits : 0),
    visits: chosen.visits,
    simulations,
    plan: context.personality
  };
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
