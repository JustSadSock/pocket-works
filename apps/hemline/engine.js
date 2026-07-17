export const BOARD_SIZE = 8;
export const STARTING_SHIFTS = 2;
export const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
export const AXES = [[[1,0],[-1,0]],[[0,1],[0,-1]],[[1,-1],[-1,1]]];

export function indexOf(q, r, size = BOARD_SIZE) { return r * size + q; }
export function coordsOf(index, size = BOARD_SIZE) { return [index % size, Math.floor(index / size)]; }
export function isInside(q, r, size = BOARD_SIZE) { return q >= 0 && r >= 0 && q < size && r < size; }
export function neighborsOf(index, size = BOARD_SIZE) {
  const [q, r] = coordsOf(index, size);
  return DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr]).filter(([nq, nr]) => isInside(nq, nr, size)).map(([nq, nr]) => indexOf(nq, nr, size));
}

export function boardHash(board) { return board.join(''); }

export function createInitialState(options = {}) {
  const size = options.size || BOARD_SIZE;
  const board = Array(size * size).fill(0);
  return {
    size,
    board,
    turn: 1,
    moveNo: 0,
    shiftsLeft: [0, options.shifts ?? STARTING_SHIFTS, options.shifts ?? STARTING_SHIFTS],
    captures: [0, 0, 0],
    history: [boardHash(board)],
    moves: [],
    winner: 0,
    lastCapture: [],
    lastAction: null
  };
}

export function cloneState(state) {
  return {
    ...state,
    board: [...state.board],
    shiftsLeft: [...state.shiftsLeft],
    captures: [...state.captures],
    history: [...state.history],
    moves: state.moves.map((move) => ({ ...move })),
    lastCapture: [...(state.lastCapture || [])],
    lastAction: state.lastAction ? { ...state.lastAction } : null
  };
}

export function canClaimOpening(state) {
  return state.moveNo === 1 && state.turn === 2 && state.board.filter(Boolean).length === 1;
}

export function candidateActions(state) {
  if (state.winner) return [];
  const actions = [];
  for (let i = 0; i < state.board.length; i += 1) {
    if (state.board[i] === 0) actions.push({ type: 'place', to: i });
  }
  if (canClaimOpening(state)) actions.push({ type: 'claim' });
  if (state.shiftsLeft[state.turn] > 0) {
    for (let from = 0; from < state.board.length; from += 1) {
      if (state.board[from] !== state.turn) continue;
      for (const to of neighborsOf(from, state.size)) {
        if (state.board[to] === 0) actions.push({ type: 'shift', from, to });
      }
    }
  }
  return actions;
}

function capturePairs(board, origin, player, size) {
  const enemy = 3 - player;
  const [q, r] = coordsOf(origin, size);
  const captured = new Set();
  for (const axis of AXES) {
    for (const [dq, dr] of axis) {
      const firstQ = q + dq;
      const firstR = r + dr;
      const secondQ = q + dq * 2;
      const secondR = r + dr * 2;
      const anchorQ = q + dq * 3;
      const anchorR = r + dr * 3;
      if (![firstQ, secondQ, anchorQ].every((_, i) => isInside([firstQ, secondQ, anchorQ][i], [firstR, secondR, anchorR][i], size))) continue;
      const first = indexOf(firstQ, firstR, size);
      const second = indexOf(secondQ, secondR, size);
      const anchor = indexOf(anchorQ, anchorR, size);
      if (board[first] === enemy && board[second] === enemy && board[anchor] === player) {
        captured.add(first);
        captured.add(second);
      }
    }
  }
  for (const index of captured) board[index] = 0;
  return [...captured];
}

export function hasConnection(state, player) {
  const { size, board } = state;
  const starts = [];
  if (player === 1) {
    for (let q = 0; q < size; q += 1) if (board[indexOf(q, 0, size)] === player) starts.push(indexOf(q, 0, size));
  } else {
    for (let r = 0; r < size; r += 1) if (board[indexOf(0, r, size)] === player) starts.push(indexOf(0, r, size));
  }
  const seen = new Set(starts);
  const stack = [...starts];
  while (stack.length) {
    const current = stack.pop();
    const [q, r] = coordsOf(current, size);
    if ((player === 1 && r === size - 1) || (player === 2 && q === size - 1)) return true;
    for (const next of neighborsOf(current, size)) {
      if (board[next] === player && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

export function shortestPathCost(state, player) {
  const { size, board } = state;
  const total = board.length;
  const dist = Array(total).fill(Infinity);
  const used = Array(total).fill(false);
  const starts = [];
  if (player === 1) for (let q = 0; q < size; q += 1) starts.push(indexOf(q, 0, size));
  else for (let r = 0; r < size; r += 1) starts.push(indexOf(0, r, size));
  const cellCost = (index) => board[index] === player ? 0 : board[index] === 0 ? 1 : 5;
  for (const start of starts) dist[start] = cellCost(start);
  for (let step = 0; step < total; step += 1) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < total; i += 1) if (!used[i] && dist[i] < best) { best = dist[i]; current = i; }
    if (current < 0) break;
    used[current] = true;
    const [q, r] = coordsOf(current, size);
    if ((player === 1 && r === size - 1) || (player === 2 && q === size - 1)) return dist[current];
    for (const next of neighborsOf(current, size)) {
      const nextDist = dist[current] + cellCost(next);
      if (nextDist < dist[next]) dist[next] = nextDist;
    }
  }
  return Infinity;
}

export function applyAction(state, action, options = {}) {
  if (!action || state.winner) return { ok: false, reason: 'Игра уже завершена.', state };
  const next = cloneState(state);
  const player = state.turn;
  let origin = -1;

  if (action.type === 'place') {
    if (!Number.isInteger(action.to) || next.board[action.to] !== 0) return { ok: false, reason: 'Клетка занята.', state };
    next.board[action.to] = player;
    origin = action.to;
  } else if (action.type === 'shift') {
    if (next.shiftsLeft[player] <= 0) return { ok: false, reason: 'Сдвиги закончились.', state };
    if (next.board[action.from] !== player || next.board[action.to] !== 0 || !neighborsOf(action.from, next.size).includes(action.to)) {
      return { ok: false, reason: 'Камень можно сдвинуть только в соседнюю пустую клетку.', state };
    }
    next.board[action.from] = 0;
    next.board[action.to] = player;
    next.shiftsLeft[player] -= 1;
    origin = action.to;
  } else if (action.type === 'claim') {
    if (!canClaimOpening(state)) return { ok: false, reason: 'Перехват доступен только после первого хода.', state };
    const opening = next.board.findIndex(Boolean);
    next.board[opening] = player;
  } else {
    return { ok: false, reason: 'Неизвестное действие.', state };
  }

  const captured = origin >= 0 ? capturePairs(next.board, origin, player, next.size) : [];
  next.captures[player] += captured.length;
  const nextHash = boardHash(next.board);
  if (options.preventRepeat !== false && next.history.includes(nextHash)) {
    return { ok: false, reason: 'Повтор позиции запрещён.', state };
  }

  next.moveNo += 1;
  next.lastCapture = captured;
  next.lastAction = { ...action, player };
  next.moves.push({ ...action, player, captured: [...captured] });
  next.history.push(nextHash);
  next.winner = hasConnection(next, player) ? player : 0;
  if (!next.winner) next.turn = 3 - player;
  return { ok: true, state: next, captured, winner: next.winner };
}

export function legalActions(state) {
  return candidateActions(state).filter((action) => applyAction(state, action).ok);
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function deserializeState(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || !Array.isArray(parsed.board) || ![1,2].includes(parsed.turn) || !Number.isInteger(parsed.size)) throw new TypeError('Invalid game state');
  return cloneState(parsed);
}
