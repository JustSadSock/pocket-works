export const KOMI = 0.5;
export const PASS = 'PASS';

export const HEX_DIRECTIONS = Object.freeze({
  E: Object.freeze({ dq: 1, dr: 0, angle: 0 }),
  NE: Object.freeze({ dq: 1, dr: -1, angle: -Math.PI / 3 }),
  NW: Object.freeze({ dq: 0, dr: -1, angle: -2 * Math.PI / 3 }),
  W: Object.freeze({ dq: -1, dr: 0, angle: Math.PI }),
  SW: Object.freeze({ dq: -1, dr: 1, angle: 2 * Math.PI / 3 }),
  SE: Object.freeze({ dq: 0, dr: 1, angle: Math.PI / 3 })
});

export const DIFFICULTIES = Object.freeze({
  cutter: Object.freeze({ label: 'Резчик', maxDepth: 2, budgetMs: 75 }),
  tactician: Object.freeze({ label: 'Тактик', maxDepth: 4, budgetMs: 260 }),
  architect: Object.freeze({ label: 'Архитектор', maxDepth: 6, budgetMs: 760 })
});

const DIRECTION_NAMES = Object.freeze(Object.keys(HEX_DIRECTIONS));
const BOARD_CACHE = new Map();
const TIMEOUT = Symbol('search-timeout');

export function normalizeRadius(value) {
  const parsed = Number(value);
  return [3, 4, 5].includes(parsed) ? parsed : 4;
}

export function boardCellCount(radius) {
  const normalized = normalizeRadius(radius);
  return 1 + 3 * normalized * (normalized + 1);
}

export function coordinateKey(q, r) {
  return `${q},${r}`;
}

export function createBoard(radiusValue = 4) {
  const radius = normalizeRadius(radiusValue);
  const cached = BOARD_CACHE.get(radius);
  if (cached) return cached;

  const cells = [];
  for (let r = -radius; r <= radius; r += 1) {
    const qMin = Math.max(-radius, -r - radius);
    const qMax = Math.min(radius, -r + radius);
    for (let q = qMin; q <= qMax; q += 1) cells.push(Object.freeze({ q, r }));
  }

  const indexByKey = new Map(cells.map((cell, index) => [coordinateKey(cell.q, cell.r), index]));
  const neighbors = cells.map((cell) => DIRECTION_NAMES.map((direction) => {
    const { dq, dr } = HEX_DIRECTIONS[direction];
    return indexByKey.get(coordinateKey(cell.q + dq, cell.r + dr)) ?? -1;
  }));
  const directionByPair = new Map();
  neighbors.forEach((list, from) => list.forEach((to, directionIndex) => {
    if (to >= 0) directionByPair.set(`${from}:${to}`, DIRECTION_NAMES[directionIndex]);
  }));

  const starts = [
    indexByKey.get(coordinateKey(0, radius - 1)),
    indexByKey.get(coordinateKey(0, -radius + 1))
  ];

  const board = Object.freeze({
    radius,
    cells: Object.freeze(cells),
    neighbors: Object.freeze(neighbors.map((list) => Object.freeze(list))),
    indexByKey,
    directionByPair,
    starts: Object.freeze(starts),
    count: cells.length
  });
  BOARD_CACHE.set(radius, board);
  return board;
}

export function createGame(options = {}) {
  const board = createBoard(options.radius);
  return {
    schema: 3,
    radius: board.radius,
    positions: [...board.starts],
    claimed: [0n, 0n],
    current: 0,
    consecutivePasses: 0,
    plies: 0,
    ended: false,
    winner: null,
    reason: null,
    lastMove: null,
    komi: Number.isFinite(Number(options.komi)) ? Number(options.komi) : KOMI
  };
}

export function cloneState(state) {
  return {
    ...state,
    positions: [...state.positions],
    claimed: [...state.claimed],
    lastMove: state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null
  };
}

export function isClaimed(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= createBoard(state.radius).count) return true;
  const bit = 1n << BigInt(index);
  return ((state.claimed[0] | state.claimed[1]) & bit) !== 0n;
}

export function ownerOf(state, index) {
  if (!Number.isInteger(index)) return null;
  const bit = 1n << BigInt(index);
  if ((state.claimed[0] & bit) !== 0n) return 0;
  if ((state.claimed[1] & bit) !== 0n) return 1;
  return null;
}

export function legalDestinations(state, participant = state.current) {
  if (!state || state.ended || (participant !== 0 && participant !== 1)) return [];
  const board = createBoard(state.radius);
  const from = state.positions[participant];
  const occupied = state.positions[1 - participant];
  return board.neighbors[from].filter((index) => index >= 0 && index !== occupied && !isClaimed(state, index));
}

export function legalMoves(state) {
  if (!state || state.ended) return [];
  const destinations = legalDestinations(state, state.current);
  return destinations.length ? destinations : [PASS];
}

export function directionForMove(state, participant, destination) {
  const board = createBoard(state.radius);
  return board.directionByPair.get(`${state.positions[participant]}:${destination}`) || null;
}

export function neighborInDirection(state, participant, direction) {
  const board = createBoard(state.radius);
  const directionIndex = DIRECTION_NAMES.indexOf(direction);
  if (directionIndex < 0) return null;
  const destination = board.neighbors[state.positions[participant]][directionIndex];
  if (destination < 0 || destination === state.positions[1 - participant] || isClaimed(state, destination)) return null;
  return destination;
}

export function applyMove(state, move) {
  if (!state || state.ended) throw new Error('Партия уже закончена.');
  const legal = legalMoves(state);
  if (!legal.includes(move)) throw new Error('Недопустимый ход.');

  const next = cloneState(state);
  const participant = state.current;

  if (move === PASS) {
    next.plies += 1;
    next.consecutivePasses += 1;
    next.lastMove = {
      type: 'pass',
      participant,
      from: state.positions[participant],
      to: null
    };
    if (next.consecutivePasses >= 2) return settleByScore(next);
    next.current = 1 - participant;
    return next;
  }

  const from = state.positions[participant];
  const bit = 1n << BigInt(from);
  next.claimed[participant] |= bit;
  next.positions[participant] = move;
  next.current = 1 - participant;
  next.consecutivePasses = 0;
  next.plies += 1;
  next.lastMove = {
    type: 'step',
    participant,
    direction: directionForMove(state, participant, move),
    from,
    to: move
  };
  return next;
}

function settleByScore(state) {
  const scores = scoreState(state);
  state.ended = true;
  state.winner = scores[0] > scores[1] ? 0 : 1;
  state.reason = 'territory';
  return state;
}

export function forceTimeLoss(state, loser) {
  if (!state || state.ended) return cloneState(state);
  const next = cloneState(state);
  next.ended = true;
  next.winner = 1 - loser;
  next.reason = 'time';
  return next;
}

export function countBits(mask) {
  let value = mask;
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

export function rawScores(state) {
  return [countBits(state.claimed[0]), countBits(state.claimed[1])];
}

export function scoreState(state) {
  const [first, second] = rawScores(state);
  return [first, second + state.komi];
}

export function mobility(state, participant) {
  return legalDestinations(state, participant).length;
}

export function distanceMap(state, participant) {
  const board = createBoard(state.radius);
  const distances = new Int16Array(board.count);
  distances.fill(-1);
  const queue = new Int16Array(board.count);
  const occupied = state.positions[1 - participant];
  const start = state.positions[participant];
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  distances[start] = 0;

  while (head < tail) {
    const index = queue[head++];
    for (const next of board.neighbors[index]) {
      if (next < 0 || next === occupied || distances[next] !== -1 || isClaimed(state, next)) continue;
      distances[next] = distances[index] + 1;
      queue[tail++] = next;
    }
  }
  return distances;
}

export function reachableCount(state, participant) {
  const distances = distanceMap(state, participant);
  let count = 0;
  for (const distance of distances) if (distance >= 0) count += 1;
  return count;
}

export function territoryForecast(state) {
  const board = createBoard(state.radius);
  const first = distanceMap(state, 0);
  const second = distanceMap(state, 1);
  const control = [0, 0];
  let contested = 0;

  for (let index = 0; index < board.count; index += 1) {
    if (isClaimed(state, index) || index === state.positions[0] || index === state.positions[1]) continue;
    const a = first[index];
    const b = second[index];
    if (a < 0 && b < 0) continue;
    if (b < 0 || (a >= 0 && a < b)) control[0] += 1;
    else if (a < 0 || b < a) control[1] += 1;
    else contested += 1;
  }
  return { control, contested };
}

export function serializeGame(state) {
  return {
    ...state,
    schema: 3,
    positions: [...state.positions],
    claimed: state.claimed.map((mask) => mask.toString(16)),
    lastMove: state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null
  };
}

export function restoreGame(raw) {
  if (!raw || raw.schema !== 3) return null;
  const board = createBoard(raw.radius);
  let claimed;
  try {
    claimed = [parseMask(raw.claimed?.[0]), parseMask(raw.claimed?.[1])];
  } catch {
    return null;
  }
  const maxBits = BigInt(board.count);
  if (claimed.some((mask) => mask < 0n || (mask >> maxBits) !== 0n)) return null;
  if ((claimed[0] & claimed[1]) !== 0n) return null;

  const positions = [Number(raw.positions?.[0]), Number(raw.positions?.[1])];
  if (positions.some((index) => !Number.isInteger(index) || index < 0 || index >= board.count)) return null;
  if (positions[0] === positions[1]) return null;

  const state = {
    schema: 3,
    radius: board.radius,
    positions,
    claimed,
    current: raw.current === 1 ? 1 : 0,
    consecutivePasses: clampInt(raw.consecutivePasses, 0, 2),
    plies: clampInt(raw.plies, 0, board.count * 2 + 2),
    ended: Boolean(raw.ended),
    winner: raw.winner === 0 || raw.winner === 1 ? raw.winner : null,
    reason: ['territory', 'time'].includes(raw.reason) ? raw.reason : null,
    lastMove: raw.lastMove && typeof raw.lastMove === 'object' ? raw.lastMove : null,
    komi: Number.isFinite(Number(raw.komi)) ? Number(raw.komi) : KOMI
  };

  if (isClaimed(state, positions[0]) || isClaimed(state, positions[1])) return null;
  if (state.ended && state.winner === null) return null;
  if (!state.ended) {
    state.winner = null;
    state.reason = null;
  }
  return state;
}

function parseMask(value) {
  return BigInt(`0x${String(value || '0').replace(/^0x/, '') || '0'}`);
}

function clampInt(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
  return Math.max(min, Math.min(max, number));
}

export function chooseAIMove(state, difficulty = 'tactician') {
  const profile = DIFFICULTIES[difficulty] || DIFFICULTIES.tactician;
  const legal = legalMoves(state);
  if (legal.length <= 1) return legal[0] ?? null;

  const radiusPenalty = Math.max(0, state.radius - 3);
  const maximumDepth = Math.max(2, profile.maxDepth - radiusPenalty);
  const deadline = performanceNow() + profile.budgetMs;
  const root = state.current;
  const table = new Map();
  let best = orderMoves(state, legal, root)[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    try {
      const result = searchRoot(state, depth, root, deadline, table);
      best = result.move;
      bestScore = result.score;
      if (Math.abs(bestScore) > 90000) break;
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      break;
    }
  }
  return best;
}

function searchRoot(state, depth, root, deadline, table) {
  let alpha = -Infinity;
  let bestMove = null;
  let bestScore = -Infinity;
  for (const move of orderMoves(state, legalMoves(state), root)) {
    ensureTime(deadline);
    const score = minimax(applyMove(state, move), depth - 1, alpha, Infinity, root, 1, deadline, table);
    if (score > bestScore || (score === bestScore && compareMove(move, bestMove) < 0)) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, bestScore);
  }
  return { move: bestMove, score: bestScore };
}

function minimax(state, depth, alpha, beta, root, ply, deadline, table) {
  ensureTime(deadline);
  if (state.ended) return terminalScore(state, root, ply);
  if (depth <= 0) return evaluateState(state, root);

  const key = `${stateKey(state)}|${depth}|${root}`;
  const cached = table.get(key);
  if (cached !== undefined) return cached;

  const maximizing = state.current === root;
  let value = maximizing ? -Infinity : Infinity;
  for (const move of orderMoves(state, legalMoves(state), root)) {
    const score = minimax(applyMove(state, move), depth - 1, alpha, beta, root, ply + 1, deadline, table);
    if (maximizing) {
      value = Math.max(value, score);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, score);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  table.set(key, value);
  return value;
}

function terminalScore(state, root, ply) {
  return state.winner === root ? 100000 - ply * 24 : -100000 + ply * 24;
}

function evaluateState(state, root) {
  const opponent = 1 - root;
  const scores = scoreState(state);
  const forecast = territoryForecast(state);
  const reachable = [reachableCount(state, 0), reachableCount(state, 1)];
  const mobilityValues = [mobility(state, 0), mobility(state, 1)];
  let value = (scores[root] - scores[opponent]) * 120;
  value += (forecast.control[root] - forecast.control[opponent]) * 13;
  value += (reachable[root] - reachable[opponent]) * 3;
  value += (mobilityValues[root] - mobilityValues[opponent]) * 7;
  value += (state.current === root ? 1 : -1) * 2;
  return value;
}

function orderMoves(state, moves, root) {
  return [...moves].sort((a, b) => {
    const scoreA = moveOrderScore(state, a, root);
    const scoreB = moveOrderScore(state, b, root);
    return scoreB - scoreA || compareMove(a, b);
  });
}

function moveOrderScore(state, move, root) {
  if (move === PASS) return -100000;
  const next = applyMove(state, move);
  return evaluateState(next, root) * (state.current === root ? 1 : -1);
}

function compareMove(a, b) {
  if (b == null) return -1;
  if (a === PASS) return 1;
  if (b === PASS) return -1;
  return Number(a) - Number(b);
}

function stateKey(state) {
  return [
    state.radius,
    state.positions[0],
    state.positions[1],
    state.claimed[0].toString(36),
    state.claimed[1].toString(36),
    state.current,
    state.consecutivePasses
  ].join(':');
}

function ensureTime(deadline) {
  if (performanceNow() > deadline) throw TIMEOUT;
}

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function directionFromDelta(dx, dy) {
  if (Math.hypot(dx, dy) < 18) return null;
  const angle = Math.atan2(dy, dx);
  let best = null;
  let bestDistance = Infinity;
  for (const direction of DIRECTION_NAMES) {
    const candidate = HEX_DIRECTIONS[direction].angle;
    const distance = Math.abs(Math.atan2(Math.sin(angle - candidate), Math.cos(angle - candidate)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = direction;
    }
  }
  return best;
}

export function rotateIndex180(radius, index) {
  const board = createBoard(radius);
  const cell = board.cells[index];
  return board.indexByKey.get(coordinateKey(-cell.q, -cell.r));
}
