export const SIZE = 5;
export const EMPTY = 0;
export const VERMILION = 1;
export const COBALT = 2;
export const PLAYERS = [VERMILION, COBALT];
export const SIDES = ['top', 'right', 'bottom', 'left'];

export function createBoard(fill = EMPTY) {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(fill));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function ownerOf(value) {
  if (!value) return EMPTY;
  return typeof value === 'object' ? Number(value.owner) || EMPTY : Number(value) || EMPTY;
}

export function normalizeMove(move) {
  if (!move || !SIDES.includes(move.side)) throw new TypeError('Unknown insertion side');
  const index = Math.trunc(Number(move.index));
  if (index < 0 || index >= SIZE) throw new RangeError('Move index is outside the board');
  return { side: move.side, index };
}

export function axisOf(move) {
  return move.side === 'left' || move.side === 'right' ? 'row' : 'column';
}

export function oppositeSide(side) {
  return ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' })[side];
}

export function isImmediateReverse(move, previousMove) {
  if (!previousMove) return false;
  const next = normalizeMove(move);
  const previous = normalizeMove(previousMove);
  return axisOf(next) === axisOf(previous)
    && next.index === previous.index
    && next.side === oppositeSide(previous.side);
}

export function listMoves(previousMove = null) {
  const moves = [];
  for (let index = 0; index < SIZE; index += 1) {
    for (const side of SIDES) {
      const move = { side, index };
      if (!isImmediateReverse(move, previousMove)) moves.push(move);
    }
  }
  return moves;
}

export function applyMove(board, rawMove, insertedValue) {
  const move = normalizeMove(rawMove);
  const next = cloneBoard(board);
  let ejected = EMPTY;

  if (move.side === 'left') {
    ejected = next[move.index][SIZE - 1];
    for (let column = SIZE - 1; column > 0; column -= 1) {
      next[move.index][column] = next[move.index][column - 1];
    }
    next[move.index][0] = insertedValue;
  } else if (move.side === 'right') {
    ejected = next[move.index][0];
    for (let column = 0; column < SIZE - 1; column += 1) {
      next[move.index][column] = next[move.index][column + 1];
    }
    next[move.index][SIZE - 1] = insertedValue;
  } else if (move.side === 'top') {
    ejected = next[SIZE - 1][move.index];
    for (let row = SIZE - 1; row > 0; row -= 1) {
      next[row][move.index] = next[row - 1][move.index];
    }
    next[0][move.index] = insertedValue;
  } else {
    ejected = next[0][move.index];
    for (let row = 0; row < SIZE - 1; row += 1) {
      next[row][move.index] = next[row + 1][move.index];
    }
    next[SIZE - 1][move.index] = insertedValue;
  }

  return { board: next, ejected, move };
}

function startCells(player) {
  const cells = [];
  for (let index = 0; index < SIZE; index += 1) {
    cells.push(player === VERMILION ? [index, 0] : [0, index]);
  }
  return cells;
}

function isGoal(player, row, column) {
  return player === VERMILION ? column === SIZE - 1 : row === SIZE - 1;
}

export function findConnection(board, player) {
  const queue = [];
  const parent = new Map();
  const seen = new Set();

  for (const [row, column] of startCells(player)) {
    if (ownerOf(board[row][column]) !== player) continue;
    const key = `${row}:${column}`;
    queue.push([row, column]);
    seen.add(key);
    parent.set(key, null);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [row, column] = queue[cursor];
    if (isGoal(player, row, column)) {
      const path = [];
      let key = `${row}:${column}`;
      while (key) {
        const [pathRow, pathColumn] = key.split(':').map(Number);
        path.push([pathRow, pathColumn]);
        key = parent.get(key);
      }
      return path.reverse();
    }

    const neighbors = [
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1]
    ];
    for (const [nextRow, nextColumn] of neighbors) {
      if (nextRow < 0 || nextRow >= SIZE || nextColumn < 0 || nextColumn >= SIZE) continue;
      if (ownerOf(board[nextRow][nextColumn]) !== player) continue;
      const key = `${nextRow}:${nextColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parent.set(key, `${row}:${column}`);
      queue.push([nextRow, nextColumn]);
    }
  }

  return null;
}

export function resolveWinner(board, mover) {
  const activePath = findConnection(board, mover);
  if (activePath) return { player: mover, path: activePath, reason: 'connection' };
  const opponent = mover === VERMILION ? COBALT : VERMILION;
  const opponentPath = findConnection(board, opponent);
  if (opponentPath) return { player: opponent, path: opponentPath, reason: 'gifted' };
  return null;
}

export function moveDestination(move, row, column) {
  if (move.side === 'left' && row === move.index) return [row, column + 1];
  if (move.side === 'right' && row === move.index) return [row, column - 1];
  if (move.side === 'top' && column === move.index) return [row + 1, column];
  if (move.side === 'bottom' && column === move.index) return [row - 1, column];
  return [row, column];
}

export function insertionCoordinate(move) {
  const normalized = normalizeMove(move);
  if (normalized.side === 'left') return [normalized.index, -1];
  if (normalized.side === 'right') return [normalized.index, SIZE];
  if (normalized.side === 'top') return [-1, normalized.index];
  return [SIZE, normalized.index];
}

export function ejectionCoordinate(move) {
  const normalized = normalizeMove(move);
  if (normalized.side === 'left') return [normalized.index, SIZE];
  if (normalized.side === 'right') return [normalized.index, -1];
  if (normalized.side === 'top') return [SIZE, normalized.index];
  return [-1, normalized.index];
}

export function boardToOwners(board) {
  return board.map((row) => row.map(ownerOf));
}

export function countPieces(board, player) {
  let count = 0;
  for (const row of board) {
    for (const value of row) if (ownerOf(value) === player) count += 1;
  }
  return count;
}

export function connectionCost(board, player) {
  const distances = Array.from({ length: SIZE }, () => Array(SIZE).fill(Infinity));
  const open = [];
  const opponent = player === VERMILION ? COBALT : VERMILION;

  const cellCost = (row, column) => {
    const owner = ownerOf(board[row][column]);
    if (owner === player) return 0;
    if (owner === EMPTY) return 1;
    if (owner === opponent) return 4;
    return 1;
  };

  for (const [row, column] of startCells(player)) {
    const cost = cellCost(row, column);
    distances[row][column] = cost;
    open.push({ row, column, cost });
  }

  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const current = open.shift();
    if (current.cost !== distances[current.row][current.column]) continue;
    if (isGoal(player, current.row, current.column)) return current.cost;

    const neighbors = [
      [current.row - 1, current.column],
      [current.row + 1, current.column],
      [current.row, current.column - 1],
      [current.row, current.column + 1]
    ];
    for (const [row, column] of neighbors) {
      if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) continue;
      const cost = current.cost + cellCost(row, column);
      if (cost >= distances[row][column]) continue;
      distances[row][column] = cost;
      open.push({ row, column, cost });
    }
  }

  return Infinity;
}

export function encodeBoard(board) {
  return board.map((row) => row.map(ownerOf).join('')).join('/');
}

export function validateBoard(board) {
  return Array.isArray(board)
    && board.length === SIZE
    && board.every((row) => Array.isArray(row)
      && row.length === SIZE
      && row.every((value) => PLAYERS.includes(ownerOf(value)) || ownerOf(value) === EMPTY));
}
