import { cloneState, stateAfterMove, analyzePosition, now } from './ai-core.js';
import { generateMoves } from './ai-policy.js';
import {
  getAdaptiveContext,
  observePlayer,
  biasMovesForContext,
  addRootNoise,
  chooseAdaptiveOpeningMove,
  chooseAdaptiveFinal,
  recordAiChoice
} from './ai-adaptation.js';

const LEVELS = {
  calm: {
    budget: 360,
    rootCandidates: 24,
    nodeCandidates: 12,
    rolloutCandidates: 9,
    rolloutDepth: 10,
    treeDepth: 4,
    exploration: 1.34,
    priorWeight: 0.38,
    initialChildren: 5,
    widen: 1.25,
    yieldEvery: 48
  },
  steady: {
    budget: 1550,
    rootCandidates: 36,
    nodeCandidates: 18,
    rolloutCandidates: 12,
    rolloutDepth: 20,
    treeDepth: 7,
    exploration: 1.2,
    priorWeight: 0.46,
    initialChildren: 8,
    widen: 1.65,
    yieldEvery: 64
  },
  sharp: {
    budget: 3900,
    rootCandidates: 48,
    nodeCandidates: 24,
    rolloutCandidates: 15,
    rolloutDepth: 30,
    treeDepth: 10,
    exploration: 1.06,
    priorWeight: 0.53,
    initialChildren: 11,
    widen: 1.95,
    yieldEvery: 72
  }
};

function makeNode(state, parent = null, move = null, prior = 0) {
  return {
    state,
    parent,
    move,
    prior,
    visits: 0,
    valueSum: 0,
    children: [],
    moves: null,
    expandedCount: 0
  };
}

function prepareMoves(state, color, limit, context, root = false, sourceGame = state) {
  const moves = generateMoves(state, color, limit, true, true);
  return biasMovesForContext(moves, sourceGame, color, context, root);
}

function ensureMoves(node, profile, context) {
  if (node.moves) return;
  if (node.state.passes >= 2) {
    node.moves = [];
    return;
  }
  node.moves = prepareMoves(node.state, node.state.turn, profile.nodeCandidates, context, false, node.state);
}

function expandNode(node, profile, context) {
  ensureMoves(node, profile, context);
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
    const prior = profile.priorWeight * Math.tanh(child.prior / 90) / (1 + child.visits * 0.16);
    const score = exploitation + exploration + prior;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function weightedMove(moves, context, temperature = 0.8) {
  if (!moves.length) return null;
  const tactical = moves.find((move) => move.urgent && !move.pass);
  if (tactical && context.random() < 0.88) return tactical;
  const pool = moves.slice(0, Math.min(7, moves.length));
  const top = pool[0].prior;
  const weights = pool.map((move) => Math.exp(Math.max(-18, (move.prior - top) / Math.max(0.25, temperature))));
  let roll = context.random() * weights.reduce((sum, value) => sum + value, 0);
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
    let moves = generateMoves(state, state.turn, profile.rolloutCandidates, false, true);
    moves = biasMovesForContext(moves, state, state.turn, context, false);
    const move = weightedMove(moves, context, 1.15 + depth * 0.028);
    if (!move) break;
    state = stateAfterMove(state, move, state.turn);
    if (!state) break;
    consecutivePasses = move.pass ? consecutivePasses + 1 : 0;
  }
  return Math.tanh(analyzePosition(state, rootColor).value / Math.max(24, state.size * 2.35));
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

function directResult(move, context, game) {
  if (!move || move.pass) return null;
  recordAiChoice(game, move, context);
  return {
    x: move.x,
    y: move.y,
    score: move.prior || 0,
    visits: 0,
    simulations: 0,
    persona: context.persona
  };
}

function dynamicBudget(profile, context, game, level) {
  const player = context.profile || {};
  let multiplier = 1;
  if (level !== 'calm') {
    multiplier += Math.max(0, (player.aggression || 0) - 0.55) * 0.18;
    multiplier += Math.max(0, (player.spread || 0) - 0.6) * 0.12;
  }
  if (game.size === 19) multiplier *= 1.06;
  if (game.moveNumber < game.size * 0.6) multiplier *= 0.88;
  return profile.budget * Math.min(1.28, multiplier);
}

export async function chooseAiMove(game, level = 'steady') {
  const profile = LEVELS[level] || LEVELS.steady;
  const rootColor = game.turn;
  const context = getAdaptiveContext(game, rootColor, level);
  observePlayer(game, context);

  const root = makeNode(cloneState(game));
  root.moves = prepareMoves(root.state, rootColor, profile.rootCandidates, context, true, game);

  const captures = root.moves
    .filter((move) => !move.pass && move.captureCount > 0)
    .sort((a, b) => b.captureCount - a.captureCount || b.prior - a.prior);
  if (captures.length && (captures[0].captureCount >= 2 || captures[0].prior > 115)) {
    return directResult(captures[0], context, game);
  }

  const saves = root.moves
    .filter((move) => !move.pass && move.savedAtari > 0)
    .sort((a, b) => b.savedAtari - a.savedAtari || b.prior - a.prior);
  if (saves.length) return directResult(saves[0], context, game);

  const openingMove = chooseAdaptiveOpeningMove(game, root.moves, context, level);
  if (openingMove) return directResult(openingMove, context, game);

  addRootNoise(root.moves, context, level, game);
  const deadline = now() + dynamicBudget(profile, context, game, level);
  let simulations = 0;

  while (now() < deadline) {
    let node = root;
    let depth = 0;
    while (depth < profile.treeDepth) {
      ensureMoves(node, profile, context);
      const allowed = Math.min(
        node.moves.length,
        profile.initialChildren + Math.floor(Math.sqrt(node.visits + 1) * profile.widen)
      );
      if (node.children.length < allowed && node.expandedCount < node.moves.length) {
        const expanded = expandNode(node, profile, context);
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

  const chosen = chooseAdaptiveFinal(root.children, level, game, context);
  if (!chosen || chosen.move?.pass) return null;
  recordAiChoice(game, chosen.move, context);
  return {
    x: chosen.move.x,
    y: chosen.move.y,
    score: Math.max(-0.45, chosen.visits ? chosen.valueSum / chosen.visits : 0),
    visits: chosen.visits,
    simulations,
    persona: context.persona
  };
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
