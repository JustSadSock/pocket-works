import { BLACK, WHITE, EMPTY, analyzePosition, keyOf, neighborhood, other } from './ai-core.js';

const PROFILE_KEY = 'pocket-works:sente:ai-profile:v2';
const OPENING_KEY = 'pocket-works:sente:ai-openings:v1';
const clamp01 = (value) => Math.max(0, Math.min(1, value));

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function safeRead(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {}
}

function stateFromHistory(game, ply, turn) {
  const snapshot = game.history?.[ply];
  return {
    size: game.size,
    komi: game.komi,
    board: snapshot ? Uint8Array.from(snapshot) : game.board.slice(),
    turn,
    captures: { [BLACK]: 0, [WHITE]: 0 },
    passes: 0,
    moveNumber: ply,
    lastMove: null,
    phase: 'playing',
    moves: [],
    history: [],
    hashes: [],
    dead: []
  };
}

function profileFromMoves(game, aiColor) {
  const humanColor = other(aiColor);
  const humanMoves = [];
  for (let index = 0; index < (game.moves?.length || 0); index += 1) {
    const move = game.moves[index];
    if (move.color === humanColor && !move.pass) humanMoves.push({ move, ply: index });
  }
  if (!humanMoves.length) {
    return { aggression: 0.42, invasion: 0.32, expansion: 0.48, density: 0.38, locality: 0.5, contact: 0.28, sample: 0 };
  }

  const totals = { aggression: 0, invasion: 0, expansion: 0, density: 0, locality: 0, contact: 0 };
  let previous = null;
  const sampleMoves = humanMoves.slice(-18);
  for (const { move, ply } of sampleMoves) {
    const state = stateFromHistory(game, ply, humanColor);
    const analysis = analyzePosition(state, humanColor);
    const pointKey = keyOf(game.size, move.x, move.y);
    const nearestOwn = analysis.ownDistance[pointKey];
    const nearestEnemy = analysis.enemyDistance[pointKey];
    const ownNear = neighborhood(state, move.x, move.y, humanColor, 2);
    const enemyNear = neighborhood(state, move.x, move.y, aiColor, 2);
    const edge = Math.min(move.x, move.y, game.size - 1 - move.x, game.size - 1 - move.y);
    const capture = Math.min(1, (move.captured?.length || 0) / 2);
    const contact = nearestEnemy <= 1 ? 1 : nearestEnemy === 2 ? 0.55 : enemyNear ? 0.3 : 0;
    totals.contact += contact;
    totals.aggression += clamp01(capture * 0.9 + contact * 0.65 + (enemyNear >= 2 ? 0.15 : 0));
    totals.invasion += analysis.control[pointKey] < -0.45 ? 1 : analysis.control[pointKey] < -0.18 ? 0.55 : 0;
    totals.expansion += nearestOwn >= 3 && nearestOwn <= Math.max(7, Math.floor(game.size * 0.6)) && edge >= 2 ? 1 : nearestOwn === 2 && edge >= 2 ? 0.45 : 0;
    totals.density += clamp01((ownNear - 1) / 5);
    if (previous) {
      const distance = Math.abs(move.x - previous.x) + Math.abs(move.y - previous.y);
      totals.locality += distance <= 3 ? 1 : distance <= 6 ? 0.45 : 0;
    } else {
      totals.locality += 0.5;
    }
    previous = move;
  }
  const count = sampleMoves.length;
  return {
    aggression: totals.aggression / count,
    invasion: totals.invasion / count,
    expansion: totals.expansion / count,
    density: totals.density / count,
    locality: totals.locality / count,
    contact: totals.contact / count,
    sample: count
  };
}

function mergePersistentProfile(current, game, aiColor) {
  const stored = safeRead(PROFILE_KEY, null);
  const humanMoves = (game.moves || []).filter((move) => move.color === other(aiColor) && !move.pass);
  const last = humanMoves.at(-1);
  const signature = `${game.size}:${humanMoves.length}:${last ? `${last.x},${last.y}` : '-'}`;
  const previous = stored?.profile || current;
  const weight = current.sample >= 6 ? 0.28 : current.sample >= 2 ? 0.16 : 0.06;
  const merged = {};
  for (const key of ['aggression', 'invasion', 'expansion', 'density', 'locality', 'contact']) {
    merged[key] = clamp01(previous[key] * (1 - weight) + current[key] * weight);
  }
  merged.sample = Math.min(64, (previous.sample || 0) + (stored?.signature === signature ? 0 : 1));
  if (stored?.signature !== signature) safeWrite(PROFILE_KEY, { signature, profile: merged });
  return merged;
}

function chooseBasePersonality(rng) {
  const roll = rng();
  if (roll < 0.2) return 'territorial';
  if (roll < 0.4) return 'influence';
  if (roll < 0.6) return 'fighter';
  if (roll < 0.8) return 'invasive';
  return 'balanced';
}

function baseWeights(personality) {
  const presets = {
    territorial: { expansion: 0.92, attack: 0.44, invasion: 0.28, reduction: 0.62, solid: 0.78, tenuki: 0.65, volatility: 0.34 },
    influence: { expansion: 1, attack: 0.5, invasion: 0.36, reduction: 0.58, solid: 0.5, tenuki: 0.9, volatility: 0.48 },
    fighter: { expansion: 0.55, attack: 1, invasion: 0.72, reduction: 0.55, solid: 0.52, tenuki: 0.34, volatility: 0.68 },
    invasive: { expansion: 0.5, attack: 0.72, invasion: 1, reduction: 0.88, solid: 0.42, tenuki: 0.55, volatility: 0.72 },
    balanced: { expansion: 0.72, attack: 0.68, invasion: 0.58, reduction: 0.68, solid: 0.68, tenuki: 0.62, volatility: 0.5 }
  };
  return { ...presets[personality] };
}

function counterAdapt(weights, profile, behind) {
  weights.solid += profile.aggression * 0.35 + profile.contact * 0.18;
  weights.tenuki += profile.locality * 0.3 + profile.density * 0.24;
  weights.expansion += profile.density * 0.38 + (1 - profile.expansion) * 0.08;
  weights.invasion += profile.expansion * 0.38;
  weights.reduction += profile.expansion * 0.28;
  weights.attack += profile.invasion * 0.32 + profile.density * 0.22;
  if (behind) {
    weights.attack += 0.24;
    weights.invasion += 0.28;
    weights.volatility += 0.18;
  } else {
    weights.solid += 0.14;
    weights.reduction += 0.1;
    weights.volatility -= 0.08;
  }
  for (const key of Object.keys(weights)) weights[key] = Math.max(0.1, Math.min(1.35, weights[key]));
}

function opponentWeights(profile) {
  return {
    expansion: 0.35 + profile.expansion * 0.85,
    attack: 0.32 + profile.aggression * 0.95,
    invasion: 0.28 + profile.invasion * 1.05,
    reduction: 0.36 + profile.invasion * 0.35,
    solid: 0.34 + (1 - profile.aggression) * 0.45 + profile.density * 0.15,
    tenuki: 0.28 + (1 - profile.locality) * 0.9,
    volatility: 0.25 + profile.contact * 0.5
  };
}

function gameSeed(game) {
  if (Number.isInteger(game._senteAiSeed)) return game._senteAiSeed;
  const prefix = (game.moves || []).slice(0, 8).map((move) => move.pass ? 'p' : `${move.color}:${move.x},${move.y}`).join('|');
  const entropy = `${Date.now()}:${Math.random()}:${game.size}:${prefix}`;
  game._senteAiSeed = hashText(entropy);
  return game._senteAiSeed;
}

export function buildSearchContext(game, level) {
  const rootColor = game.turn;
  const seed = gameSeed(game) ^ Math.imul(game.moveNumber + 1, 0x9E3779B1);
  const rng = mulberry32(seed);
  const liveProfile = profileFromMoves(game, rootColor);
  const playerProfile = mergePersistentProfile(liveProfile, game, rootColor);
  const personality = game._senteAiPersonality || chooseBasePersonality(rng);
  game._senteAiPersonality = personality;
  const botWeights = baseWeights(personality);
  const position = analyzePosition(game, rootColor);
  const behind = position.value < -(game.size === 9 ? 6 : game.size === 13 ? 10 : 14);
  counterAdapt(botWeights, playerProfile, behind);
  const phase = game.moveNumber < game.size * 0.7 ? 'opening' : game.moveNumber < game.size * 2.3 ? 'middle' : 'endgame';
  return {
    rootColor,
    level,
    seed,
    rng,
    playerProfile,
    personality,
    botWeights,
    opponentWeights: opponentWeights(playerProfile),
    behind,
    phase,
    rootNoise: level === 'calm' ? 17 : level === 'steady' ? 10 : 5,
    qualityWindow: level === 'calm' ? 0.16 : level === 'steady' ? 0.085 : 0.035
  };
}

export function styleForColor(context, color) {
  return color === context.rootColor ? context.botWeights : context.opponentWeights;
}

function gammaSample(alpha, rng) {
  if (alpha < 1) return gammaSample(alpha + 1, rng) * Math.pow(Math.max(1e-9, rng()), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x;
    let v;
    do {
      const u1 = Math.max(1e-9, rng());
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function addRootDiversity(moves, context) {
  const eligible = moves.filter((move) => !move.pass && !move.urgent);
  if (eligible.length < 2) return moves;
  const raw = eligible.map(() => gammaSample(0.32, context.rng));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  for (let index = 0; index < eligible.length; index += 1) {
    const centered = raw[index] / total - 1 / eligible.length;
    eligible[index].prior += centered * context.rootNoise * eligible.length;
  }
  moves.sort((a, b) => b.prior - a.prior);
  return moves;
}

export function chooseHumanLikeChild(children, context) {
  const visited = children.filter((child) => child.visits > 0);
  if (!visited.length) return null;
  visited.sort((a, b) => b.visits - a.visits || (b.valueSum / b.visits) - (a.valueSum / a.visits));
  const topVisits = visited[0].visits;
  const topQ = Math.max(...visited.map((child) => child.valueSum / child.visits));
  const visitFloor = context.level === 'calm' ? 0.3 : context.level === 'steady' ? 0.5 : 0.72;
  const pool = visited.filter((child) => {
    const q = child.valueSum / child.visits;
    return child.visits >= topVisits * visitFloor && q >= topQ - context.qualityWindow;
  }).slice(0, context.level === 'sharp' ? 3 : 5);
  if (pool.length <= 1) return pool[0] || visited[0];
  const volatility = context.botWeights.volatility;
  const exponent = context.level === 'calm' ? 0.72 : context.level === 'steady' ? 1.05 + (1 - volatility) * 0.45 : 1.65;
  const weights = pool.map((child) => {
    const q = child.valueSum / child.visits;
    return Math.pow(child.visits, exponent) * Math.exp((q - topQ) * (context.level === 'sharp' ? 18 : 10));
  });
  let roll = context.rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[0];
}

export function recentOpeningPenalty(game, x, y) {
  const stored = safeRead(OPENING_KEY, {});
  const key = `${game.size}`;
  const recent = Array.isArray(stored[key]) ? stored[key] : [];
  const moveKey = `${x},${y}`;
  const index = recent.indexOf(moveKey);
  return index < 0 ? 0 : Math.max(2, 10 - index * 2);
}

export function rememberOpening(game, move) {
  if (!move || game.moveNumber > Math.max(5, Math.floor(game.size * 0.5))) return;
  const stored = safeRead(OPENING_KEY, {});
  const key = `${game.size}`;
  const moveKey = `${move.x},${move.y}`;
  const recent = [moveKey, ...(Array.isArray(stored[key]) ? stored[key].filter((item) => item !== moveKey) : [])].slice(0, 6);
  stored[key] = recent;
  safeWrite(OPENING_KEY, stored);
}
