import { EMPTY, INF, other, keyOf } from './ai-core.js';

const STORAGE_KEY = 'pocket-works:sente:adaptive-ai:v1';
const contexts = new WeakMap();
const PERSONAS = ['balanced', 'territorial', 'influence', 'fighter', 'counterpunch'];

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function safeRead() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function safeWrite(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is optional; the in-game model still works without it.
  }
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const data = new Uint32Array(1);
    globalThis.crypto.getRandomValues(data);
    return data[0] || 0x9e3779b9;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedChoice(items, weights, random) {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return items[Math.floor(random() * items.length)] || items[0];
  let roll = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= Math.max(0, weights[index]);
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

function defaultProfile() {
  return {
    aggression: 0.45,
    compactness: 0.45,
    spread: 0.45,
    locality: 0.5,
    centerPreference: 0.45,
    samples: 0,
    openingHistory: []
  };
}

function nearestDistance(board, size, x, y, color) {
  let best = INF;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      if (board[keyOf(size, px, py)] !== color) continue;
      best = Math.min(best, Math.abs(px - x) + Math.abs(py - y));
    }
  }
  return best;
}

function derivePlayerProfile(game, aiColor) {
  const playerColor = other(aiColor);
  let aggression = 0;
  let compactness = 0;
  let spread = 0;
  let locality = 0;
  let centerPreference = 0;
  let samples = 0;
  let previousMove = null;

  for (let index = 0; index < (game.moves?.length || 0); index += 1) {
    const move = game.moves[index];
    if (!move || move.pass || move.color !== playerColor) continue;
    const board = game.history?.[index] || game.board;
    const ownDistance = nearestDistance(board, game.size, move.x, move.y, playerColor);
    const enemyDistance = nearestDistance(board, game.size, move.x, move.y, aiColor);
    const edge = Math.min(move.x, move.y, game.size - 1 - move.x, game.size - 1 - move.y);
    const localDistance = previousMove ? distance(move, previousMove) : Math.floor(game.size / 2);

    aggression += enemyDistance <= 2 ? 1 : enemyDistance === 3 ? 0.55 : 0.1;
    if ((move.captured?.length || 0) > 0) aggression += 0.55;
    compactness += ownDistance <= 2 ? 1 : ownDistance === 3 ? 0.45 : 0.05;
    spread += ownDistance >= Math.max(4, Math.floor(game.size * 0.25)) ? 1 : ownDistance >= 3 ? 0.45 : 0.05;
    locality += localDistance <= 3 ? 1 : localDistance <= 5 ? 0.55 : 0.1;
    centerPreference += edge >= Math.max(3, Math.floor(game.size * 0.2)) ? 1 : edge === 2 ? 0.35 : 0.05;
    samples += 1;
    previousMove = move;
  }

  if (!samples) return null;
  return {
    aggression: clamp(aggression / samples),
    compactness: clamp(compactness / samples),
    spread: clamp(spread / samples),
    locality: clamp(locality / samples),
    centerPreference: clamp(centerPreference / samples),
    samples
  };
}

function mergeProfile(stored, current) {
  const base = { ...defaultProfile(), ...(stored || {}) };
  if (!current) return base;
  const evidence = clamp(current.samples / 12, 0.12, 0.55);
  for (const key of ['aggression', 'compactness', 'spread', 'locality', 'centerPreference']) {
    base[key] = clamp(base[key] * (1 - evidence) + current[key] * evidence);
  }
  base.samples = Math.min(9999, (Number(base.samples) || 0) + current.samples);
  return base;
}

function choosePersona(profile, random) {
  const weights = [
    1.15,
    0.9 + profile.centerPreference * 0.45,
    0.9 + profile.compactness * 0.8,
    0.8 + profile.spread * 0.7,
    0.75 + profile.aggression * 1.15
  ];
  return weightedChoice(PERSONAS, weights, random);
}

function makeOpeningPlan(size, persona, random) {
  const corner = size === 9 ? 2 : 3;
  const far = size - 1 - corner;
  const middle = Math.floor(size / 2);
  const side = size === 9 ? 2 : 3;
  const plans = {
    territorial: [
      [[corner, corner], [far, far], [far, corner], [corner, far], [middle, side]],
      [[far, corner], [corner, far], [corner, corner], [far, far], [size - 1 - side, middle]]
    ],
    influence: [
      [[corner, corner], [far, far], [middle, middle], [far, corner], [middle, side]],
      [[corner, far], [far, corner], [middle, middle], [corner, corner], [side, middle]]
    ],
    fighter: [
      [[corner, corner], [far, corner], [corner, far], [middle, middle], [far, far]],
      [[far, far], [corner, far], [far, corner], [middle, middle], [corner, corner]]
    ],
    counterpunch: [
      [[corner, corner], [far, far], [corner, far], [far, corner], [middle, middle]],
      [[far, corner], [corner, far], [far, far], [corner, corner], [middle, middle]]
    ],
    balanced: [
      [[corner, corner], [far, far], [corner, far], [far, corner], [middle, middle]],
      [[corner, far], [far, corner], [corner, corner], [far, far], [middle, middle]]
    ]
  };
  const choices = plans[persona] || plans.balanced;
  const plan = choices[Math.floor(random() * choices.length)].map(([x, y]) => ({ x, y }));
  if (random() < 0.5) {
    for (const point of plan) point.x = size - 1 - point.x;
  }
  if (random() < 0.5) {
    for (const point of plan) point.y = size - 1 - point.y;
  }
  return plan;
}

export function getAdaptiveContext(game, aiColor, level) {
  let context = contexts.get(game);
  if (context && context.aiColor === aiColor) return context;
  const stored = { ...defaultProfile(), ...(safeRead() || {}) };
  const seed = randomSeed();
  const random = mulberry32(seed);
  const persona = choosePersona(stored, random);
  context = {
    aiColor,
    level,
    seed,
    random,
    persona,
    profile: stored,
    openingPlan: makeOpeningPlan(game.size, persona, random),
    processedPly: -1,
    recentAiMoves: [],
    gameVariation: 0.82 + random() * 0.36
  };
  contexts.set(game, context);
  return context;
}

export function observePlayer(game, context) {
  if (!context || context.processedPly === game.moveNumber) return context?.profile;
  const current = derivePlayerProfile(game, context.aiColor);
  context.profile = mergeProfile(context.profile, current);
  context.processedPly = game.moveNumber;
  const stored = safeRead() || defaultProfile();
  const persisted = mergeProfile(stored, current);
  persisted.openingHistory = Array.isArray(stored.openingHistory) ? stored.openingHistory.slice(-10) : [];
  safeWrite(persisted);
  return context.profile;
}

function zoneIndex(size, x, y) {
  const column = Math.min(2, Math.floor(x * 3 / size));
  const row = Math.min(2, Math.floor(y * 3 / size));
  return row * 3 + column;
}

function zoneCounts(game, color) {
  const own = new Uint8Array(9);
  const enemy = new Uint8Array(9);
  const opponent = other(color);
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const value = game.board[keyOf(game.size, x, y)];
      const zone = zoneIndex(game.size, x, y);
      if (value === color) own[zone] += 1;
      else if (value === opponent) enemy[zone] += 1;
    }
  }
  return { own, enemy };
}

function lastMoveByColor(game, color) {
  for (let index = (game.moves?.length || 0) - 1; index >= 0; index -= 1) {
    const move = game.moves[index];
    if (move?.color === color && !move.pass) return move;
  }
  return null;
}

function openingPlanBonus(move, game, context) {
  if (game.moveNumber > Math.max(10, Math.floor(game.size * 0.75))) return 0;
  let best = 0;
  for (let index = 0; index < context.openingPlan.length; index += 1) {
    const target = context.openingPlan[index];
    if (game.board[keyOf(game.size, target.x, target.y)] !== EMPTY) continue;
    const d = Math.abs(move.x - target.x) + Math.abs(move.y - target.y);
    const urgency = Math.max(0, 24 - index * 4);
    best = Math.max(best, d === 0 ? urgency : d === 1 ? urgency * 0.36 : 0);
    break;
  }
  return best;
}

function personaBias(move, context) {
  const f = move.features || {};
  switch (context.persona) {
    case 'territorial':
      return (f.edge <= 3 ? 9 : -3) + (f.nearestOwn >= 3 && f.nearestOwn <= 6 ? 7 : 0) - (f.enemyNear2 || 0) * 1.5;
    case 'influence':
      return (f.edge >= 3 ? 10 : -2) + (f.nearestOwn >= 3 && f.nearestOwn <= 7 ? 8 : 0) - (f.ownAdj || 0) * 7;
    case 'fighter':
      return (f.enemyNear2 || 0) * 6 + (move.attackAtari || 0) * 8 + (f.enemyAdj || 0) * 5;
    case 'counterpunch':
      return (move.savedAtari || 0) * 9 + (f.enemyNear2 || 0) * 3 + (f.ownAdj > 1 ? 5 : 0);
    default:
      return (f.nearestOwn >= 3 && f.nearestOwn <= 6 ? 5 : 0) + (Math.abs(f.control || 0) < 0.3 ? 4 : 0);
  }
}

function adaptiveBias(move, context) {
  const f = move.features || {};
  const profile = context.profile || defaultProfile();
  let bias = 0;
  bias += profile.compactness * ((f.nearestOwn >= 3 && f.nearestOwn <= 7 ? 13 : 0) - (f.ownNear2 || 0) * 3.5);
  bias += profile.aggression * ((f.ownAdj > 1 ? 8 : 0) + Math.min(10, (f.liberties || 0) * 1.2) - (f.enemyAdj > 0 && f.liberties <= 2 ? 10 : 0));
  bias += profile.spread * ((f.enemyNear2 || 0) * 3.5 + (move.attackAtari || 0) * 6);
  if (!move.urgent) bias += profile.locality * (f.distanceFromLastHuman >= Math.max(5, Math.floor(f.size * 0.28)) ? 8 : -2);
  bias += profile.centerPreference > 0.58 ? (f.edge <= 3 ? 6 : -2) : (f.edge >= 3 ? 4 : 0);
  return bias;
}

export function biasMovesForContext(moves, game, color, context, root = false) {
  if (!context || !moves.length) return moves;
  const { own, enemy } = zoneCounts(game, color);
  const lastAi = lastMoveByColor(game, color);
  const lastHuman = lastMoveByColor(game, other(color));
  const survivors = [];
  const rejected = [];

  for (const move of moves) {
    if (move.pass) {
      survivors.push(move);
      continue;
    }
    const f = move.features || {};
    const zone = zoneIndex(game.size, move.x, move.y);
    const localAiDistance = lastAi ? distance(move, lastAi) : INF;
    const localHumanDistance = lastHuman ? distance(move, lastHuman) : INF;
    const isolatedPile = !move.urgent
      && (f.enemyNear3 || 0) === 0
      && ((f.ownAdj || 0) >= 1 || (f.ownNear2 || 0) >= 3)
      && (f.nearestEnemy || INF) >= 4;
    const repeatedLocalMove = !move.urgent
      && localAiDistance <= 2
      && (f.enemyNear2 || 0) === 0
      && (f.ownNear2 || 0) >= 2;
    const crowdedZone = !move.urgent && own[zone] >= enemy[zone] + 4 && (f.enemyNear3 || 0) === 0;

    f.distanceFromLastHuman = localHumanDistance;
    f.size = game.size;
    let bonus = personaBias(move, context) + adaptiveBias(move, context);
    bonus += openingPlanBonus(move, game, context);
    bonus += (enemy[zone] - own[zone]) * 2.6;
    if (Math.abs(f.control || 0) < 0.28) bonus += 7;
    if ((f.nearestOwn || INF) >= 3 && (f.nearestOwn || INF) <= 7) bonus += 5;
    if (localAiDistance >= Math.max(4, Math.floor(game.size * 0.24))) bonus += 4;
    if (root) bonus *= context.gameVariation;

    move.prior += bonus;
    move.adaptiveBonus = bonus;
    move.humanLikeRejected = isolatedPile || repeatedLocalMove || crowdedZone;
    if (move.humanLikeRejected) rejected.push(move);
    else survivors.push(move);
  }

  const nonPass = survivors.filter((move) => !move.pass);
  if (nonPass.length < Math.min(7, Math.max(3, Math.floor(moves.length * 0.3)))) {
    rejected.sort((a, b) => b.prior - a.prior);
    survivors.push(...rejected.slice(0, Math.max(0, 7 - nonPass.length)));
  }
  survivors.sort((a, b) => b.prior - a.prior);
  return survivors;
}

function gammaSample(alpha, random) {
  if (alpha < 1) return gammaSample(alpha + 1, random) * Math.pow(Math.max(1e-9, random()), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x;
    let v;
    do {
      const u1 = Math.max(1e-9, random());
      const u2 = Math.max(1e-9, random());
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v *= v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function addRootNoise(moves, context, level, game) {
  const candidates = moves.filter((move) => !move.pass && !move.urgent).slice(0, level === 'sharp' ? 14 : 18);
  if (candidates.length < 3 || !context) return moves;
  const phase = game.moveNumber / Math.max(1, game.size * game.size);
  const weight = (level === 'calm' ? 0.18 : level === 'steady' ? 0.12 : 0.065) * (phase < 0.2 ? 1 : 0.65);
  const alpha = Math.max(0.28, 7.5 / candidates.length);
  const samples = candidates.map(() => gammaSample(alpha, context.random));
  const total = samples.reduce((sum, value) => sum + value, 0) || 1;
  const top = Math.max(...candidates.map((move) => move.prior));
  const baseWeights = candidates.map((move) => Math.exp(Math.max(-16, (move.prior - top) / 16)));
  const baseTotal = baseWeights.reduce((sum, value) => sum + value, 0) || 1;
  for (let index = 0; index < candidates.length; index += 1) {
    const mixed = (1 - weight) * (baseWeights[index] / baseTotal) + weight * (samples[index] / total);
    candidates[index].prior += Math.log(Math.max(1e-9, mixed * candidates.length)) * 12;
  }
  moves.sort((a, b) => b.prior - a.prior);
  return moves;
}

export function chooseAdaptiveOpeningMove(game, moves, context, level) {
  const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
  if (occupied >= Math.max(7, Math.floor(game.size * 0.62)) || moves.some((move) => move.urgent)) return null;
  const moveByKey = new Map(moves.filter((move) => !move.pass && !move.humanLikeRejected).map((move) => [keyOf(game.size, move.x, move.y), move]));
  const planned = [];
  for (let index = 0; index < context.openingPlan.length; index += 1) {
    const target = context.openingPlan[index];
    if (game.board[keyOf(game.size, target.x, target.y)] !== EMPTY) continue;
    const exact = moveByKey.get(keyOf(game.size, target.x, target.y));
    if (exact) planned.push({ move: exact, order: index });
    if (planned.length >= 3) break;
  }
  if (!planned.length) return null;
  const bestOrder = planned[0].order;
  const pool = planned.filter((item) => item.order <= bestOrder + (level === 'sharp' ? 1 : 2));
  const bestPrior = Math.max(...pool.map((item) => item.move.prior));
  const weights = pool.map((item) => {
    const orderWeight = Math.exp(-(item.order - bestOrder) * 0.55);
    const qualityWeight = Math.exp((item.move.prior - bestPrior) / (level === 'sharp' ? 7 : level === 'steady' ? 10 : 14));
    return orderWeight * qualityWeight;
  });
  return weightedChoice(pool, weights, context.random).move;
}

export function chooseAdaptiveFinal(children, level, game, context) {
  const viable = children.filter((child) => child.visits > 0 && child.move && !child.move.pass);
  if (!viable.length) return null;
  viable.sort((a, b) => b.visits - a.visits || (b.valueSum / b.visits) - (a.valueSum / a.visits));
  const best = viable[0];
  const bestMean = best.valueSum / best.visits;
  const bestVisits = best.visits;
  const phase = game.moveNumber / Math.max(1, game.size * game.size);
  const tolerance = level === 'sharp' ? 0.035 : level === 'steady' ? 0.075 : 0.13;
  const minVisitRatio = level === 'sharp' ? 0.42 : level === 'steady' ? 0.24 : 0.12;
  const pool = viable.filter((child) => {
    const mean = child.valueSum / child.visits;
    return mean >= bestMean - tolerance && child.visits >= bestVisits * minVisitRatio;
  }).slice(0, level === 'sharp' ? 3 : level === 'steady' ? 5 : 6);
  if (pool.length <= 1) return best;
  const temperature = (level === 'sharp' ? 0.22 : level === 'steady' ? 0.48 : 0.78) * (phase < 0.18 ? 1.25 : phase > 0.55 ? 0.55 : 1);
  const weights = pool.map((child) => {
    const mean = child.valueSum / child.visits;
    const quality = Math.exp((mean - bestMean) / Math.max(0.025, temperature * 0.11));
    const confidence = Math.pow(child.visits / bestVisits, 0.55);
    return quality * confidence;
  });
  return weightedChoice(pool, weights, context.random);
}

export function recordAiChoice(game, move, context) {
  if (!move || move.pass || !context) return;
  context.recentAiMoves.push({ x: move.x, y: move.y });
  context.recentAiMoves = context.recentAiMoves.slice(-8);
  if (game.moveNumber > Math.max(10, Math.floor(game.size * 0.7))) return;
  const stored = safeRead() || defaultProfile();
  const history = Array.isArray(stored.openingHistory) ? stored.openingHistory : [];
  const aiMoves = (game.moves || []).filter((item) => item.color === context.aiColor && !item.pass).slice(0, 5).map((item) => `${item.x},${item.y}`);
  aiMoves.push(`${move.x},${move.y}`);
  if (aiMoves.length >= 3) {
    history.push(`${game.size}:${aiMoves.slice(0, 5).join(';')}`);
    stored.openingHistory = [...new Set(history)].slice(-12);
    safeWrite(stored);
  }
}
