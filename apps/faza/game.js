export const APP_VERSION = '1.0.0';
export const RADIUS = 3;
export const CAPTURE_TARGET = 5;
export const TURN_LIMIT = 120;

export const DIRECTIONS = Object.freeze([
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1]
]);

export const PHASES = Object.freeze([
  { id: 0, name: 'Горизонт', short: 'I', closedAxis: [0, 3], active: [1, 2, 4, 5] },
  { id: 1, name: 'Косая', short: 'II', closedAxis: [1, 4], active: [0, 2, 3, 5] },
  { id: 2, name: 'Диагональ', short: 'III', closedAxis: [2, 5], active: [0, 1, 3, 4] }
]);

function makeCells(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.abs(q + r) <= radius) cells.push({ q, r, key: cellKey(q, r) });
    }
  }
  return cells;
}

export const CELLS = Object.freeze(makeCells(RADIUS));
export const CELL_KEYS = Object.freeze(CELLS.map((cell) => cell.key));
export const CELL_SET = new Set(CELL_KEYS);

export function cellKey(q, r) {
  return `${q},${r}`;
}

export function parseCell(key) {
  const [q, r] = String(key).split(',').map(Number);
  return { q, r, key: cellKey(q, r) };
}

export function otherPlayer(player) {
  return player === 1 ? 2 : 1;
}

export function hexDistance(cell) {
  const { q, r } = typeof cell === 'string' ? parseCell(cell) : cell;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

export function neighborsFor(key, phase) {
  const { q, r } = parseCell(key);
  const active = PHASES[phase]?.active || PHASES[0].active;
  const result = [];
  for (const directionIndex of active) {
    const [dq, dr] = DIRECTIONS[directionIndex];
    const next = cellKey(q + dq, r + dr);
    if (CELL_SET.has(next)) result.push(next);
  }
  return result;
}

export function allNeighbors(key) {
  const { q, r } = parseCell(key);
  return DIRECTIONS
    .map(([dq, dr]) => cellKey(q + dq, r + dr))
    .filter((next) => CELL_SET.has(next));
}

export function createGame(options = {}) {
  const startingSeat = options.startingSeat === 'B' ? 'B' : 'A';
  const otherSeat = startingSeat === 'A' ? 'B' : 'A';
  const state = {
    schema: 1,
    board: {},
    phase: 0,
    current: 1,
    captures: { 1: 0, 2: 0 },
    pending: { 1: false, 2: false },
    seats: { 1: startingSeat, 2: otherSeat },
    turn: 0,
    history: [],
    winner: 0,
    winReason: '',
    draw: false,
    swapAvailable: false,
    swapUsed: false,
    lastAction: null
  };
  state.history.push(positionHash(state));
  return state;
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function positionHash(state) {
  const stones = Object.entries(state.board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, player]) => `${key}:${player}`)
    .join('|');
  return [
    stones,
    `p${state.phase}`,
    `t${state.current}`,
    `c${state.captures[1]}-${state.captures[2]}`,
    `h${Number(state.pending[1])}${Number(state.pending[2])}`
  ].join('/');
}

export function getGroups(board, phase, player) {
  const remaining = new Set(
    Object.entries(board)
      .filter(([, owner]) => owner === player)
      .map(([key]) => key)
  );
  const groups = [];

  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const group = new Set([first]);
    const stack = [first];

    while (stack.length) {
      const current = stack.pop();
      for (const neighbor of neighborsFor(current, phase)) {
        if (remaining.has(neighbor) && board[neighbor] === player) {
          remaining.delete(neighbor);
          group.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

export function getLiberties(board, phase, group) {
  const liberties = new Set();
  for (const key of group) {
    for (const neighbor of neighborsFor(key, phase)) {
      if (!board[neighbor]) liberties.add(neighbor);
    }
  }
  return liberties;
}

export function isConnected(board, phase, player) {
  return Boolean(findConnectionPath(board, phase, player));
}

export function findConnectionPath(board, phase, player) {
  const starts = CELLS.filter((cell) => {
    if (player === 1) return cell.q === -RADIUS;
    return cell.r === -RADIUS;
  }).map((cell) => cell.key).filter((key) => board[key] === player);

  const isGoal = (key) => {
    const { q, r } = parseCell(key);
    return player === 1 ? q === RADIUS : r === RADIUS;
  };

  const queue = [...starts];
  const seen = new Set(starts);
  const parent = new Map();

  while (queue.length) {
    const key = queue.shift();
    if (isGoal(key)) {
      const path = [key];
      let cursor = key;
      while (parent.has(cursor)) {
        cursor = parent.get(cursor);
        path.push(cursor);
      }
      return path.reverse();
    }

    for (const neighbor of neighborsFor(key, phase)) {
      if (board[neighbor] === player && !seen.has(neighbor)) {
        seen.add(neighbor);
        parent.set(neighbor, key);
        queue.push(neighbor);
      }
    }
  }

  return null;
}

export function connectionDistance(board, phase, player) {
  const starts = CELLS.filter((cell) => player === 1 ? cell.q === -RADIUS : cell.r === -RADIUS);
  const goal = (key) => {
    const { q, r } = parseCell(key);
    return player === 1 ? q === RADIUS : r === RADIUS;
  };
  const opponent = otherPlayer(player);
  const distance = new Map();
  const deque = [];

  for (const cell of starts) {
    if (board[cell.key] === opponent) continue;
    const cost = board[cell.key] === player ? 0 : 1;
    const previous = distance.get(cell.key);
    if (previous == null || cost < previous) {
      distance.set(cell.key, cost);
      if (cost === 0) deque.unshift(cell.key);
      else deque.push(cell.key);
    }
  }

  while (deque.length) {
    const key = deque.shift();
    const currentDistance = distance.get(key);
    if (goal(key)) return currentDistance;

    for (const neighbor of neighborsFor(key, phase)) {
      if (board[neighbor] === opponent) continue;
      const weight = board[neighbor] === player ? 0 : 1;
      const nextDistance = currentDistance + weight;
      if (nextDistance < (distance.get(neighbor) ?? Infinity)) {
        distance.set(neighbor, nextDistance);
        if (weight === 0) deque.unshift(neighbor);
        else deque.push(neighbor);
      }
    }
  }

  return 99;
}

function projectMove(state, move) {
  if (!move || !CELL_SET.has(move.cell)) return { ok: false, error: 'Некорректная ячейка.' };
  if (![0, 1, 2].includes(move.phase)) return { ok: false, error: 'Некорректная фаза.' };
  if (state.board[move.cell]) return { ok: false, error: 'Эта ячейка уже занята.' };

  const player = state.current;
  const opponent = otherPlayer(player);
  const board = { ...state.board, [move.cell]: player };
  const removed = [];

  for (const group of getGroups(board, move.phase, opponent)) {
    if (getLiberties(board, move.phase, group).size === 0) {
      for (const key of group) removed.push(key);
    }
  }
  for (const key of removed) delete board[key];

  const ownGroup = getGroups(board, move.phase, player).find((group) => group.has(move.cell));
  if (!ownGroup || getLiberties(board, move.phase, ownGroup).size === 0) {
    return { ok: false, error: 'Самозахват запрещён.' };
  }

  return { ok: true, board, removed };
}

export function getLegalMoves(state) {
  if (state.winner || state.draw || state.swapAvailable) return [];
  const moves = [];
  for (const cell of CELL_KEYS) {
    if (state.board[cell]) continue;
    for (let phase = 0; phase < 3; phase += 1) {
      if (projectMove(state, { cell, phase }).ok) moves.push({ cell, phase });
    }
  }
  return moves;
}

export function applyMove(state, move) {
  if (state.winner || state.draw) return { ok: false, state, error: 'Партия уже завершена.' };
  if (state.swapAvailable) return { ok: false, state, error: 'Сначала решите, менять ли стороны.' };

  const projected = projectMove(state, move);
  if (!projected.ok) return { ok: false, state, error: projected.error };

  const next = cloneState(state);
  const mover = state.current;
  const opponent = otherPlayer(mover);
  next.board = projected.board;
  next.phase = move.phase;
  next.captures[mover] += projected.removed.length;
  next.pending[mover] = isConnected(next.board, next.phase, mover);
  if (next.pending[opponent] && !isConnected(next.board, next.phase, opponent)) {
    next.pending[opponent] = false;
  }
  next.current = opponent;
  next.turn += 1;
  next.swapAvailable = next.turn === 1;
  next.lastAction = {
    player: mover,
    cell: move.cell,
    phase: move.phase,
    removed: [...projected.removed]
  };

  if (next.captures[mover] >= CAPTURE_TARGET) {
    next.winner = mover;
    next.winReason = 'capture';
    next.swapAvailable = false;
  } else if (next.pending[next.current] && isConnected(next.board, next.phase, next.current)) {
    next.winner = next.current;
    next.winReason = 'hold';
    next.swapAvailable = false;
  }

  const hash = positionHash(next);
  next.history.push(hash);
  const repetitions = next.history.reduce((count, item) => count + Number(item === hash), 0);
  if (!next.winner && repetitions >= 3) {
    next.draw = true;
    next.winReason = 'repetition';
    next.swapAvailable = false;
  }

  if (!next.winner && !next.draw && next.turn >= TURN_LIMIT) {
    const score1 = tiebreakScore(next, 1);
    const score2 = tiebreakScore(next, 2);
    if (score1 === score2) {
      next.draw = true;
      next.winReason = 'limit';
    } else {
      next.winner = score1 > score2 ? 1 : 2;
      next.winReason = 'tiebreak';
    }
    next.swapAvailable = false;
  }

  return { ok: true, state: next };
}

export function resolveSwap(state, takeSwap) {
  if (!state.swapAvailable || state.turn !== 1 || state.current !== 2) {
    return { ok: false, state, error: 'Обмен сторон сейчас недоступен.' };
  }
  const next = cloneState(state);
  if (takeSwap) {
    const seatOne = next.seats[1];
    next.seats[1] = next.seats[2];
    next.seats[2] = seatOne;
    next.swapUsed = true;
  }
  next.swapAvailable = false;
  next.lastAction = {
    ...(next.lastAction || {}),
    swap: Boolean(takeSwap)
  };
  return { ok: true, state: next };
}

export function tiebreakScore(state, player) {
  const phaseReach = PHASES.reduce((total, phase) => {
    const distance = connectionDistance(state.board, phase.id, player);
    return total + Math.max(0, 8 - distance);
  }, 0);
  const stones = Object.values(state.board).filter((owner) => owner === player).length;
  return state.captures[player] * 20 + phaseReach * 2 + stones;
}

export function summarizePosition(state, player) {
  const opponent = otherPlayer(player);
  const ownGroups = getGroups(state.board, state.phase, player);
  const enemyGroups = getGroups(state.board, state.phase, opponent);
  const ownLiberties = ownGroups.reduce((sum, group) => sum + getLiberties(state.board, state.phase, group).size, 0);
  const enemyLiberties = enemyGroups.reduce((sum, group) => sum + getLiberties(state.board, state.phase, group).size, 0);
  const center = Object.entries(state.board).reduce((sum, [key, owner]) => {
    if (owner !== player) return sum;
    return sum + (RADIUS - hexDistance(key));
  }, 0);
  const resilience = PHASES.filter((phase) => connectionDistance(state.board, phase.id, player) <= 1).length;

  return {
    ownDistance: connectionDistance(state.board, state.phase, player),
    enemyDistance: connectionDistance(state.board, state.phase, opponent),
    ownGroups: ownGroups.length,
    enemyGroups: enemyGroups.length,
    ownLiberties,
    enemyLiberties,
    center,
    resilience
  };
}

export function validateState(candidate) {
  if (!candidate || typeof candidate !== 'object' || candidate.schema !== 1) return false;
  if (![1, 2].includes(candidate.current) || ![0, 1, 2].includes(candidate.phase)) return false;
  if (!candidate.board || typeof candidate.board !== 'object' || Array.isArray(candidate.board)) return false;
  for (const [key, owner] of Object.entries(candidate.board)) {
    if (!CELL_SET.has(key) || ![1, 2].includes(owner)) return false;
  }
  if (!candidate.captures || !candidate.pending || !candidate.seats) return false;
  if (!Array.isArray(candidate.history)) return false;
  return true;
}
