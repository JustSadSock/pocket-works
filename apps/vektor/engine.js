export const BOARD_SIZE = 6;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const START_POSITIONS = [2, 33];
export const DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

const bit = (index) => 1n << BigInt(index);
const isBlocked = (mask, index) => (mask & bit(index)) !== 0n;
const toRowCol = (index) => [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
const toIndex = (row, col) => row * BOARD_SIZE + col;
const inside = (row, col) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

export function createInitialState(overrides = {}) {
  return {
    positions: [...START_POSITIONS],
    blocked: 0n,
    turn: 0,
    ply: 0,
    swapStatus: "unavailable",
    ownerByColor: [0, 1],
    winnerColor: null,
    ...overrides,
  };
}

export function legalMoves(state, color = state.turn) {
  const origin = state.positions[color];
  const opponent = state.positions[1 - color];
  const [row, col] = toRowCol(origin);
  const moves = [];
  for (const [dr, dc] of DIRECTIONS) {
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (inside(nextRow, nextCol)) {
      const destination = toIndex(nextRow, nextCol);
      if (destination === opponent || isBlocked(state.blocked, destination)) break;
      moves.push(destination);
      nextRow += dr;
      nextCol += dc;
    }
  }
  return moves;
}

export function applyMove(state, destination) {
  if (state.winnerColor !== null) throw new Error("Партия уже завершена");
  if (state.swapStatus === "pending") throw new Error("Сначала нужно решить обмен сторон");
  const moves = legalMoves(state);
  if (!moves.includes(destination)) throw new Error("Недопустимый ход");
  const color = state.turn;
  const origin = state.positions[color];
  const next = {
    ...state,
    positions: [...state.positions],
    blocked: state.blocked | bit(origin),
    turn: 1 - color,
    ply: state.ply + 1,
    swapStatus: state.ply === 0 ? "pending" : state.swapStatus,
  };
  next.positions[color] = destination;
  if (next.swapStatus !== "pending" && legalMoves(next).length === 0) next.winnerColor = color;
  return next;
}

export function resolveSwap(state, shouldSwap) {
  if (state.swapStatus !== "pending") throw new Error("Обмен сейчас недоступен");
  const next = {
    ...state,
    ownerByColor: shouldSwap ? [state.ownerByColor[1], state.ownerByColor[0]] : [...state.ownerByColor],
    swapStatus: shouldSwap ? "swapped" : "declined",
  };
  if (legalMoves(next).length === 0) next.winnerColor = 1 - next.turn;
  return next;
}

export function mobility(state, color) { return legalMoves(state, color).length; }

function floodDistances(state, start, opponent) {
  const distances = new Int16Array(CELL_COUNT);
  distances.fill(32767);
  distances[start] = 0;
  const queue = new Int16Array(CELL_COUNT);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  while (head < tail) {
    const current = queue[head++];
    const [row, col] = toRowCol(current);
    for (const [dr, dc] of DIRECTIONS) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!inside(nextRow, nextCol)) continue;
      const next = toIndex(nextRow, nextCol);
      if (next === opponent || isBlocked(state.blocked, next) || distances[next] !== 32767) continue;
      distances[next] = distances[current] + 1;
      queue[tail++] = next;
    }
  }
  return distances;
}

export function territoryBalance(state) {
  const [p0, p1] = state.positions;
  const d0 = floodDistances(state, p0, p1);
  const d1 = floodDistances(state, p1, p0);
  let balance = 0;
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    if (isBlocked(state.blocked, cell)) continue;
    if (d0[cell] < d1[cell]) balance += 1;
    else if (d1[cell] < d0[cell]) balance -= 1;
  }
  return balance;
}

function rayMass(state, color) {
  const origin = state.positions[color];
  const opponent = state.positions[1 - color];
  const [row, col] = toRowCol(origin);
  let score = 0;
  for (const [dr, dc] of DIRECTIONS) {
    let length = 0;
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (inside(nextRow, nextCol)) {
      const destination = toIndex(nextRow, nextCol);
      if (destination === opponent || isBlocked(state.blocked, destination)) break;
      length += 1;
      nextRow += dr;
      nextCol += dc;
    }
    score += length * length;
  }
  return score;
}

export function evaluatePosition(state) {
  if (state.winnerColor === 0) return 100000;
  if (state.winnerColor === 1) return -100000;
  const moves0 = mobility(state, 0);
  const moves1 = mobility(state, 1);
  if (state.turn === 0 && moves0 === 0) return -100000;
  if (state.turn === 1 && moves1 === 0) return 100000;
  const progress = state.ply / (CELL_COUNT - 2);
  const mobilityWeight = 3.8 + progress * 5.2;
  const territoryWeight = 1.15 + progress * 1.65;
  const rayWeight = 0.13 + progress * 0.08;
  return (moves0 - moves1) * mobilityWeight
    + territoryBalance(state) * territoryWeight
    + (rayMass(state, 0) - rayMass(state, 1)) * rayWeight;
}

export function finalizeIfTrapped(state) {
  if (state.winnerColor !== null || state.swapStatus === "pending") return state;
  if (legalMoves(state).length > 0) return state;
  return { ...state, winnerColor: 1 - state.turn };
}

export function serializeState(state) {
  return { ...state, positions: [...state.positions], ownerByColor: [...state.ownerByColor], blocked: state.blocked.toString(16) };
}

export function deserializeState(raw) {
  if (!raw || !Array.isArray(raw.positions) || raw.positions.length !== 2) throw new Error("Повреждённое сохранение");
  const state = {
    ...raw,
    positions: raw.positions.map(Number),
    ownerByColor: Array.isArray(raw.ownerByColor) ? raw.ownerByColor.map(Number) : [0, 1],
    blocked: BigInt(`0x${raw.blocked || "0"}`),
  };
  if (state.positions.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT)) throw new Error("Позиции фигур вне поля");
  return finalizeIfTrapped(state);
}

export function stateKey(state) { return `${state.positions[0]}:${state.positions[1]}:${state.blocked.toString(36)}:${state.turn}`; }
export function cellIsBlocked(state, cell) { return isBlocked(state.blocked, cell); }
export function rowCol(cell) { return toRowCol(cell); }
