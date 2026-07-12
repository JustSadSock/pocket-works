import { cloneState, stateAfterMove, analyzePosition, now } from './ai-core.js';
import { generateMoves, chooseOpeningBookMove } from './ai-policy.js';

const LEVELS = {
  calm: { budget: 220, rootCandidates: 18, nodeCandidates: 10, rolloutCandidates: 8, rolloutDepth: 8, treeDepth: 3, exploration: 1.3, priorWeight: 0.34, initialChildren: 4, widen: 1.15, yieldEvery: 48 },
  steady: { budget: 1050, rootCandidates: 28, nodeCandidates: 14, rolloutCandidates: 10, rolloutDepth: 14, treeDepth: 5, exploration: 1.18, priorWeight: 0.42, initialChildren: 6, widen: 1.45, yieldEvery: 64 },
  sharp: { budget: 2600, rootCandidates: 38, nodeCandidates: 18, rolloutCandidates: 12, rolloutDepth: 20, treeDepth: 7, exploration: 1.04, priorWeight: 0.48, initialChildren: 8, widen: 1.7, yieldEvery: 72 }
};

function makeNode(state, parent = null, move = null, prior = 0) {
  return { state, parent, move, prior, visits: 0, valueSum: 0, children: [], moves: null, expandedCount: 0 };
}

function ensureMoves(node, profile, root) {
  if (node.moves) return;
  if (node.state.passes >= 2) {
    node.moves = [];
    return;
  }
  node.moves = generateMoves(node.state, node.state.turn, root ? profile.rootCandidates : profile.nodeCandidates, true, true);
}

function expandNode(node, profile, root) {
  ensureMoves(node, profile, root);
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
    const prior = profile.priorWeight * Math.tanh(child.prior / 80) / (1 + child.visits * 0.18);
    const score = exploitation + exploration + prior;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function pickRolloutMove(moves, temperature = 0.8) {
  if (!moves.length) return null;
  const tactical = moves.find((move) => move.urgent && !move.pass);
  if (tactical && Math.random() < 0.82) return tactical;
  const pool = moves.slice(0, Math.min(5, moves.length));
  const top = pool[0].prior;
  const weights = pool.map((move) => Math.exp(Math.max(-18, (move.prior - top) / Math.max(0.2, temperature))));
  let roll = Math.random() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[0];
}

function rollout(startState, rootColor, profile) {
  let state = cloneState(startState);
  let consecutivePasses = state.passes || 0;
  for (let depth = 0; depth < profile.rolloutDepth && consecutivePasses < 2; depth += 1) {
    const move = pickRolloutMove(generateMoves(state, state.turn, profile.rolloutCandidates, false, true), 1.1 + depth * 0.035);
    if (!move) break;
    state = stateAfterMove(state, move, state.turn);
    if (!state) break;
    consecutivePasses = move.pass ? consecutivePasses + 1 : 0;
  }
  return Math.tanh(analyzePosition(state, rootColor).value / Math.max(24, state.size * 2.4));
}

function backpropagate(node, value) {
  for (let current = node; current; current = current.parent) {
    current.visits += 1;
    current.valueSum += value;
  }
}

function chooseFinal(root, level) {
  const children = root.children.filter((child) => child.visits > 0);
  if (!children.length) return null;
  children.sort((a, b) => b.visits - a.visits || (b.valueSum / b.visits) - (a.valueSum / a.visits));
  if (level === 'calm' && children.length > 1) {
    const pool = children.slice(0, Math.min(3, children.length));
    const total = pool.reduce((sum, child) => sum + Math.pow(child.visits, 0.78), 0);
    let roll = Math.random() * total;
    for (const child of pool) {
      roll -= Math.pow(child.visits, 0.78);
      if (roll <= 0) return child;
    }
  }
  return children[0];
}

async function yieldFrame() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function chooseAiMove(game, level = 'steady') {
  const profile = LEVELS[level] || LEVELS.steady;
  const rootColor = game.turn;
  const root = makeNode(cloneState(game));
  root.moves = generateMoves(root.state, rootColor, profile.rootCandidates, true, true);

  const captures = root.moves.filter((move) => !move.pass && move.captureCount > 0).sort((a, b) => b.captureCount - a.captureCount || b.prior - a.prior);
  if (captures.length) return { x: captures[0].x, y: captures[0].y, score: captures[0].prior, visits: 0, simulations: 0 };

  const saves = root.moves.filter((move) => !move.pass && move.savedAtari > 0).sort((a, b) => b.savedAtari - a.savedAtari || b.prior - a.prior);
  if (saves.length) return { x: saves[0].x, y: saves[0].y, score: saves[0].prior, visits: 0, simulations: 0 };

  const bookMove = chooseOpeningBookMove(root.state, root.moves, level);
  if (bookMove) return { x: bookMove.x, y: bookMove.y, score: Math.max(0, bookMove.prior), visits: 0, simulations: 0 };

  const deadline = now() + profile.budget;
  let simulations = 0;
  while (now() < deadline) {
    let node = root;
    let depth = 0;
    while (depth < profile.treeDepth) {
      ensureMoves(node, profile, node === root);
      const allowed = Math.min(node.moves.length, profile.initialChildren + Math.floor(Math.sqrt(node.visits + 1) * profile.widen));
      if (node.children.length < allowed && node.expandedCount < node.moves.length) {
        const expanded = expandNode(node, profile, node === root);
        if (expanded) node = expanded;
        break;
      }
      if (!node.children.length) break;
      const selected = selectChild(node, rootColor, profile);
      if (!selected) break;
      node = selected;
      depth += 1;
    }
    backpropagate(node, rollout(node.state, rootColor, profile));
    simulations += 1;
    if (simulations % profile.yieldEvery === 0) await yieldFrame();
  }

  const chosen = chooseFinal(root, level);
  if (!chosen || chosen.move?.pass) return null;
  return {
    x: chosen.move.x,
    y: chosen.move.y,
    score: Math.max(-0.45, chosen.visits ? chosen.valueSum / chosen.visits : 0),
    visits: chosen.visits,
    simulations
  };
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
