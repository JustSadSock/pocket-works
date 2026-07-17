export const DIRECTIONS = Object.freeze({
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
});

export const DIFFICULTIES = Object.freeze({
  cutter: { label: 'Резчик', maxDepth: 2, budgetMs: 90 },
  tactician: { label: 'Тактик', maxDepth: 5, budgetMs: 360 },
  architect: { label: 'Архитектор', maxDepth: 8, budgetMs: 900 }
});

const GOAL_FOR_EXIT = Object.freeze({ EXIT_N: 'north', EXIT_S: 'south' });
const STEP_MOVES = Object.freeze(['N', 'E', 'S', 'W']);
const TIMEOUT = Symbol('search-timeout');

export function createGame(options = {}) {
  const size = normalizeSize(options.size);
  const center = Math.floor(size / 2);
  return {
    schema: 2,
    size,
    x: center,
    y: center,
    cracked: 0n,
    burned: 0n,
    current: 0,
    goals: ['north', 'south'],
    pieRule: options.pieRule === true,
    plies: 0,
    swapAvailable: false,
    swapUsed: false,
    ended: false,
    winner: null,
    reason: null,
    lastMove: null,
    exitGoal: null
  };
}

export function normalizeSize(value) {
  const parsed = Number(value);
  return [7, 9, 11].includes(parsed) ? parsed : 9;
}

export function tileIndex(state, x, y) {
  return y * state.size + x;
}

export function isInside(state, x, y) {
  return x >= 0 && y >= 0 && x < state.size && y < state.size;
}

export function isBurned(state, x, y) {
  if (!isInside(state, x, y)) return true;
  const bit = 1n << BigInt(tileIndex(state, x, y));
  return (state.burned & bit) !== 0n;
}

export function isCracked(state, x, y) {
  if (!isInside(state, x, y)) return false;
  const bit = 1n << BigInt(tileIndex(state, x, y));
  return (state.cracked & bit) !== 0n && (state.burned & bit) === 0n;
}

export function legalMoves(state, options = {}) {
  if (!state || state.ended) return [];
  const includeSwap = options.includeSwap !== false;
  const moves = [];

  for (const move of STEP_MOVES) {
    const { dx, dy } = DIRECTIONS[move];
    const nx = state.x + dx;
    const ny = state.y + dy;
    if (isInside(state, nx, ny) && !isBurned(state, nx, ny)) moves.push(move);
  }

  const ownGoal = state.goals[state.current];
  if (ownGoal === 'north' && state.y === 0) moves.unshift('EXIT_N');
  if (ownGoal === 'south' && state.y === state.size - 1) moves.unshift('EXIT_S');
  if (includeSwap && state.swapAvailable && state.current === 1) moves.unshift('SWAP');
  return moves;
}

export function applyMove(state, move) {
  if (!state || state.ended) throw new Error('Партия уже закончена.');
  if (!legalMoves(state).includes(move)) throw new Error('Недопустимый ход.');

  if (move === 'SWAP') {
    const next = cloneState(state);
    next.goals = [state.goals[1], state.goals[0]];
    next.current = 0;
    next.plies += 1;
    next.swapAvailable = false;
    next.swapUsed = true;
    next.lastMove = {
      type: 'swap',
      participant: 1,
      from: { x: state.x, y: state.y },
      to: { x: state.x, y: state.y }
    };
    return settleTrapped(next, 1);
  }

  const participant = state.current;
  const next = cloneState(state);
  damageDeparture(next, state.x, state.y);
  next.plies += 1;
  next.swapAvailable = false;

  if (move in GOAL_FOR_EXIT) {
    const exitGoal = GOAL_FOR_EXIT[move];
    next.ended = true;
    next.winner = participant;
    next.reason = 'exit';
    next.exitGoal = exitGoal;
    next.lastMove = {
      type: 'exit',
      participant,
      direction: move,
      from: { x: state.x, y: state.y },
      to: null
    };
    return next;
  }

  const { dx, dy } = DIRECTIONS[move];
  next.x += dx;
  next.y += dy;
  next.current = 1 - participant;
  if (state.pieRule && state.plies === 0 && participant === 0) next.swapAvailable = true;
  next.lastMove = {
    type: 'step',
    participant,
    direction: move,
    from: { x: state.x, y: state.y },
    to: { x: next.x, y: next.y }
  };
  return settleTrapped(next, participant);
}

function damageDeparture(state, x, y) {
  const bit = 1n << BigInt(tileIndex(state, x, y));
  if ((state.cracked & bit) !== 0n) {
    state.cracked &= ~bit;
    state.burned |= bit;
  } else {
    state.cracked |= bit;
  }
}

function settleTrapped(state, previousParticipant) {
  if (!state.ended && legalMoves(state).length === 0) {
    state.ended = true;
    state.winner = previousParticipant;
    state.reason = 'trapped';
  }
  return state;
}

export function cloneState(state) {
  return {
    ...state,
    goals: [...state.goals],
    lastMove: state.lastMove ? structuredCloneSafe(state.lastMove) : null
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function serializeGame(state) {
  return {
    ...state,
    schema: 2,
    cracked: state.cracked.toString(16),
    burned: state.burned.toString(16),
    goals: [...state.goals],
    lastMove: state.lastMove ? structuredCloneSafe(state.lastMove) : null
  };
}

export function restoreGame(raw) {
  if (!raw || ![1, 2].includes(raw.schema)) return null;
  const size = normalizeSize(raw.size);
  const maxBits = BigInt(size * size);
  let burned;
  let cracked;
  try {
    burned = parseMask(raw.burned);
    cracked = raw.schema === 2 ? parseMask(raw.cracked) : 0n;
  } catch {
    return null;
  }
  if (burned < 0n || cracked < 0n || (burned >> maxBits) !== 0n || (cracked >> maxBits) !== 0n) return null;
  cracked &= ~burned;

  const state = {
    schema: 2,
    size,
    x: clampInt(raw.x, 0, size - 1),
    y: clampInt(raw.y, 0, size - 1),
    cracked,
    burned,
    current: raw.current === 1 ? 1 : 0,
    goals: validateGoals(raw.goals),
    pieRule: raw.pieRule === true,
    plies: clampInt(raw.plies, 0, size * size * 2 + 2),
    swapAvailable: Boolean(raw.swapAvailable),
    swapUsed: Boolean(raw.swapUsed),
    ended: Boolean(raw.ended),
    winner: raw.winner === 0 || raw.winner === 1 ? raw.winner : null,
    reason: ['exit', 'trapped', 'time'].includes(raw.reason) ? raw.reason : null,
    lastMove: raw.lastMove && typeof raw.lastMove === 'object' ? raw.lastMove : null,
    exitGoal: raw.exitGoal === 'north' || raw.exitGoal === 'south' ? raw.exitGoal : null
  };

  if (isBurned(state, state.x, state.y) && !state.ended) return null;
  if (state.ended && state.winner === null) return null;
  if (!state.ended && state.reason) state.reason = null;
  return state;
}

function parseMask(value) {
  return BigInt(`0x${String(value || '0').replace(/^0x/, '') || '0'}`);
}

function validateGoals(goals) {
  if (Array.isArray(goals) && goals.length === 2 && goals.includes('north') && goals.includes('south')) return [goals[0], goals[1]];
  return ['north', 'south'];
}

function clampInt(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
  return Math.max(min, Math.min(max, number));
}

export function forceTimeLoss(state, loser) {
  if (state.ended) return cloneState(state);
  const next = cloneState(state);
  next.ended = true;
  next.winner = 1 - loser;
  next.reason = 'time';
  next.swapAvailable = false;
  return next;
}

export function goalDistance(state, participant) {
  const goal = state.goals[participant];
  return goal === 'north' ? state.y + 1 : state.size - state.y;
}

export function shortestPathToGoal(state, participant) {
  const goal = state.goals[participant];
  const size = state.size;
  const total = size * size;
  const distance = new Int16Array(total);
  distance.fill(-1);
  const queueX = new Int16Array(total);
  const queueY = new Int16Array(total);
  let head = 0;
  let tail = 0;
  queueX[tail] = state.x;
  queueY[tail] = state.y;
  tail += 1;
  distance[tileIndex(state, state.x, state.y)] = 0;

  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;
    const d = distance[tileIndex(state, x, y)];
    if ((goal === 'north' && y === 0) || (goal === 'south' && y === size - 1)) return d + 1;

    for (const move of STEP_MOVES) {
      const { dx, dy } = DIRECTIONS[move];
      const nx = x + dx;
      const ny = y + dy;
      if (!isInside(state, nx, ny) || isBurned(state, nx, ny)) continue;
      const index = tileIndex(state, nx, ny);
      if (distance[index] !== -1) continue;
      distance[index] = d + 1;
      queueX[tail] = nx;
      queueY[tail] = ny;
      tail += 1;
    }
  }
  return Infinity;
}

export function reachableCount(state) {
  const size = state.size;
  const total = size * size;
  const seen = new Uint8Array(total);
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;
  const start = tileIndex(state, state.x, state.y);
  queue[tail++] = start;
  seen[start] = 1;

  while (head < tail) {
    const index = queue[head++];
    const x = index % size;
    const y = Math.floor(index / size);
    for (const move of STEP_MOVES) {
      const { dx, dy } = DIRECTIONS[move];
      const nx = x + dx;
      const ny = y + dy;
      if (!isInside(state, nx, ny) || isBurned(state, nx, ny)) continue;
      const nextIndex = tileIndex(state, nx, ny);
      if (seen[nextIndex]) continue;
      seen[nextIndex] = 1;
      queue[tail++] = nextIndex;
    }
  }
  return tail;
}

export function chooseAIMove(state, difficulty = 'tactician') {
  const profile = DIFFICULTIES[difficulty] || DIFFICULTIES.tactician;
  const legal = legalMoves(state);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const sizePenalty = state.size === 11 ? 2 : state.size === 9 ? 1 : 0;
  const maximumDepth = Math.max(2, profile.maxDepth - sizePenalty);
  const deadline = performanceNow() + profile.budgetMs;
  const root = state.current;
  const table = new Map();
  let bestMove = orderMoves(state, legal, root)[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    try {
      const result = searchRoot(state, depth, root, deadline, table);
      bestMove = result.move;
      bestScore = result.score;
      if (Math.abs(bestScore) > 90000) break;
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      break;
    }
  }
  return bestMove || orderMoves(state, legal, root)[0];
}

function searchRoot(state, depth, root, deadline, table) {
  let alpha = -Infinity;
  const beta = Infinity;
  let bestMove = null;
  let bestScore = -Infinity;
  const moves = orderMoves(state, legalMoves(state), root);

  for (const move of moves) {
    ensureTime(deadline);
    const next = applyMove(state, move);
    const score = minimax(next, depth - 1, alpha, beta, root, 1, deadline, table);
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
  const moves = orderMoves(state, legalMoves(state), root);
  for (const move of moves) {
    const child = applyMove(state, move);
    const score = minimax(child, depth - 1, alpha, beta, root, ply + 1, deadline, table);
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
  return state.winner === root ? 100000 - ply * 32 : -100000 + ply * 32;
}

function evaluateState(state, root) {
  const opponent = 1 - root;
  const rootPath = shortestPathToGoal(state, root);
  const opponentPath = shortestPathToGoal(state, opponent);
  let score = 0;

  if (!Number.isFinite(rootPath)) score -= 4200;
  if (!Number.isFinite(opponentPath)) score += 4200;
  if (Number.isFinite(rootPath) && Number.isFinite(opponentPath)) score += (opponentPath - rootPath) * 28;
  score += (goalDistance(state, opponent) - goalDistance(state, root)) * 7;

  const moves = legalMoves(state, { includeSwap: false }).length;
  score += (state.current === root ? 1 : -1) * moves * 5;
  const area = reachableCount(state);
  const parityFavorsRoot = ((area - 1) % 2 === 0) === (state.current === root);
  score += parityFavorsRoot ? 3 : -3;

  const currentBit = 1n << BigInt(tileIndex(state, state.x, state.y));
  if ((state.cracked & currentBit) !== 0n) score += state.current === root ? -2 : 2;
  return score;
}

function orderMoves(state, moves, root) {
  return [...moves].sort((a, b) => {
    const scoreA = moveOrderScore(state, a, root);
    const scoreB = moveOrderScore(state, b, root);
    return scoreB - scoreA || compareMove(a, b);
  });
}

function moveOrderScore(state, move, root) {
  if (move === 'EXIT_N' || move === 'EXIT_S') return 100000;
  if (move === 'SWAP') return evaluateState(applyMove(state, move), root) * (state.current === root ? 1 : -1) + 50;
  const next = applyMove(state, move);
  if (next.ended) return next.winner === state.current ? 90000 : -90000;
  const goal = state.goals[state.current];
  const directionBias = goal === 'north' ? { N: 40, E: 10, W: 10, S: -20 } : { S: 40, E: 10, W: 10, N: -20 };
  return directionBias[move] + legalMoves(next, { includeSwap: false }).length * 2;
}

function compareMove(a, b) {
  if (b == null) return -1;
  const order = ['EXIT_N', 'EXIT_S', 'SWAP', 'N', 'E', 'W', 'S'];
  return order.indexOf(a) - order.indexOf(b);
}

function stateKey(state) {
  return [
    state.size,
    state.cracked.toString(36),
    state.burned.toString(36),
    state.x,
    state.y,
    state.current,
    state.goals[0][0],
    state.goals[1][0],
    state.swapAvailable ? 1 : 0
  ].join(':');
}

function ensureTime(deadline) {
  if (performanceNow() > deadline) throw TIMEOUT;
}

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function moveDestination(state, move) {
  if (move === 'EXIT_N') return { x: state.x, y: -1 };
  if (move === 'EXIT_S') return { x: state.x, y: state.size };
  if (!DIRECTIONS[move]) return { x: state.x, y: state.y };
  return { x: state.x + DIRECTIONS[move].dx, y: state.y + DIRECTIONS[move].dy };
}

export function directionFromDelta(dx, dy) {
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

export function participantForGoal(state, goal) {
  return state.goals[0] === goal ? 0 : 1;
}
