export const BOARD_SIZE = 6;
export const EMPTY = 0;
export const INDIGO = 1;
export const CINNABAR = 2;
export const MAX_TURNS = 120;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function otherPlayer(player) {
  return player === INDIGO ? CINNABAR : INDIGO;
}

export function indexOf(row, col, size = BOARD_SIZE) {
  return row * size + col;
}

export function rowCol(index, size = BOARD_SIZE) {
  return [Math.floor(index / size), index % size];
}

export function neighbors(index, size = BOARD_SIZE) {
  const [row, col] = rowCol(index, size);
  const result = [];
  for (const [dr, dc] of DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) result.push(indexOf(nr, nc, size));
  }
  return result;
}

export function boardKey(board) {
  return board.join('');
}

export function createGame(options = {}) {
  const size = Number.isInteger(options.size) ? options.size : BOARD_SIZE;
  const board = Array(size * size).fill(EMPTY);
  return {
    version: 1,
    size,
    board,
    currentPlayer: INDIGO,
    winner: EMPTY,
    endReason: null,
    turn: 0,
    captures: { 1: 0, 2: 0 },
    lastMove: null,
    winningPath: [],
    moveHistory: [],
    positionKeys: [boardKey(board)]
  };
}

export function cloneGame(game) {
  return {
    ...game,
    board: [...game.board],
    captures: { 1: game.captures[1] || 0, 2: game.captures[2] || 0 },
    winningPath: [...(game.winningPath || [])],
    moveHistory: (game.moveHistory || []).map((move) => ({
      ...move,
      captured: [...(move.captured || [])],
      board: [...(move.board || [])],
      path: [...(move.path || [])]
    })),
    positionKeys: [...(game.positionKeys || [])]
  };
}

export function hydrateGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const size = Number(raw.size);
  if (!Number.isInteger(size) || size < 4 || size > 12) return null;
  if (!Array.isArray(raw.board) || raw.board.length !== size * size) return null;
  if (raw.board.some((value) => ![EMPTY, INDIGO, CINNABAR].includes(value))) return null;
  const game = createGame({ size });
  game.board = [...raw.board];
  game.currentPlayer = raw.currentPlayer === CINNABAR ? CINNABAR : INDIGO;
  game.winner = [EMPTY, INDIGO, CINNABAR].includes(raw.winner) ? raw.winner : EMPTY;
  game.endReason = typeof raw.endReason === 'string' ? raw.endReason : null;
  game.turn = Number.isInteger(raw.turn) ? Math.max(0, raw.turn) : 0;
  game.captures = {
    1: Math.max(0, Number(raw.captures?.[1] || 0)),
    2: Math.max(0, Number(raw.captures?.[2] || 0))
  };
  game.lastMove = Number.isInteger(raw.lastMove) ? raw.lastMove : null;
  game.winningPath = Array.isArray(raw.winningPath) ? raw.winningPath.filter(Number.isInteger) : [];
  game.moveHistory = Array.isArray(raw.moveHistory)
    ? raw.moveHistory.filter((move) => move && Number.isInteger(move.index)).map((move) => ({
        player: move.player === CINNABAR ? CINNABAR : INDIGO,
        index: move.index,
        captured: Array.isArray(move.captured) ? move.captured.filter(Number.isInteger) : [],
        board: Array.isArray(move.board) && move.board.length === size * size ? [...move.board] : [],
        path: Array.isArray(move.path) ? move.path.filter(Number.isInteger) : []
      }))
    : [];
  game.positionKeys = Array.isArray(raw.positionKeys) && raw.positionKeys.length
    ? raw.positionKeys.filter((key) => typeof key === 'string')
    : [boardKey(game.board)];
  return game;
}

export function groupAt(board, start, size = BOARD_SIZE) {
  const player = board[start];
  if (player === EMPTY) return { stones: [], liberties: [] };
  const queue = [start];
  const seen = new Set([start]);
  const liberties = new Set();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    for (const next of neighbors(index, size)) {
      if (board[next] === EMPTY) liberties.add(next);
      else if (board[next] === player && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return { stones: [...seen], liberties: [...liberties] };
}

export function findWinningPath(board, player, size = BOARD_SIZE) {
  const queue = [];
  const seen = new Set();
  const parent = new Map();
  const isTarget = player === INDIGO
    ? (index) => rowCol(index, size)[1] === size - 1
    : (index) => rowCol(index, size)[0] === size - 1;

  if (player === INDIGO) {
    for (let row = 0; row < size; row += 1) {
      const index = indexOf(row, 0, size);
      if (board[index] === player) {
        queue.push(index);
        seen.add(index);
      }
    }
  } else {
    for (let col = 0; col < size; col += 1) {
      const index = indexOf(0, col, size);
      if (board[index] === player) {
        queue.push(index);
        seen.add(index);
      }
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    if (isTarget(index)) {
      const path = [index];
      let current = index;
      while (parent.has(current)) {
        current = parent.get(current);
        path.push(current);
      }
      return path.reverse();
    }
    for (const next of neighbors(index, size)) {
      if (board[next] === player && !seen.has(next)) {
        seen.add(next);
        parent.set(next, index);
        queue.push(next);
      }
    }
  }
  return [];
}

export function shortestPathCost(board, player, size = BOARD_SIZE) {
  const length = size * size;
  const dist = Array(length).fill(Infinity);
  const frontier = [];
  const weight = (value) => (value === player ? 0 : value === EMPTY ? 1 : 5);
  const isTarget = player === INDIGO
    ? (index) => rowCol(index, size)[1] === size - 1
    : (index) => rowCol(index, size)[0] === size - 1;

  if (player === INDIGO) {
    for (let row = 0; row < size; row += 1) {
      const index = indexOf(row, 0, size);
      dist[index] = weight(board[index]);
      frontier.push(index);
    }
  } else {
    for (let col = 0; col < size; col += 1) {
      const index = indexOf(0, col, size);
      dist[index] = weight(board[index]);
      frontier.push(index);
    }
  }

  const visited = new Set();
  while (frontier.length) {
    frontier.sort((a, b) => dist[b] - dist[a]);
    const index = frontier.pop();
    if (visited.has(index)) continue;
    visited.add(index);
    if (isTarget(index)) return dist[index];
    for (const next of neighbors(index, size)) {
      const candidate = dist[index] + weight(board[next]);
      if (candidate < dist[next]) {
        dist[next] = candidate;
        frontier.push(next);
      }
    }
  }
  return Infinity;
}

export function analyzeMove(game, index, player = game.currentPlayer) {
  if (game.winner) return { legal: false, reason: 'finished' };
  if (!Number.isInteger(index) || index < 0 || index >= game.board.length) return { legal: false, reason: 'outside' };
  if (game.board[index] !== EMPTY) return { legal: false, reason: 'occupied' };

  const board = [...game.board];
  board[index] = player;
  const opponent = otherPlayer(player);
  const captured = [];
  const checked = new Set();

  for (const next of neighbors(index, game.size)) {
    if (board[next] !== opponent || checked.has(next)) continue;
    const group = groupAt(board, next, game.size);
    group.stones.forEach((stone) => checked.add(stone));
    if (group.liberties.length === 0) captured.push(...group.stones);
  }
  for (const stone of captured) board[stone] = EMPTY;

  const ownGroup = groupAt(board, index, game.size);
  if (ownGroup.liberties.length === 0 && captured.length === 0) {
    return { legal: false, reason: 'suicide' };
  }

  const key = boardKey(board);
  if ((game.positionKeys || []).includes(key)) return { legal: false, reason: 'repeat' };

  const path = findWinningPath(board, player, game.size);
  return {
    legal: true,
    board,
    key,
    captured,
    ownLiberties: ownGroup.liberties.length,
    path
  };
}

function tiebreak(game) {
  const indigoCost = shortestPathCost(game.board, INDIGO, game.size);
  const cinnabarCost = shortestPathCost(game.board, CINNABAR, game.size);
  if (indigoCost !== cinnabarCost) return indigoCost < cinnabarCost ? INDIGO : CINNABAR;
  if (game.captures[INDIGO] !== game.captures[CINNABAR]) {
    return game.captures[INDIGO] > game.captures[CINNABAR] ? INDIGO : CINNABAR;
  }
  return CINNABAR;
}

export function legalMoves(game, player = game.currentPlayer) {
  if (game.winner) return [];
  const moves = [];
  for (let index = 0; index < game.board.length; index += 1) {
    if (game.board[index] !== EMPTY) continue;
    if (analyzeMove(game, index, player).legal) moves.push(index);
  }
  return moves;
}

export function applyMove(game, index) {
  const player = game.currentPlayer;
  const analysis = analyzeMove(game, index, player);
  if (!analysis.legal) return analysis;

  game.board = analysis.board;
  game.turn += 1;
  game.lastMove = index;
  game.captures[player] += analysis.captured.length;
  game.positionKeys.push(analysis.key);
  game.moveHistory.push({
    player,
    index,
    captured: [...analysis.captured],
    board: [...analysis.board],
    path: [...analysis.path]
  });

  if (analysis.path.length) {
    game.winner = player;
    game.winningPath = [...analysis.path];
    game.endReason = 'connection';
  } else if (game.turn >= MAX_TURNS || legalMoves({ ...game, currentPlayer: otherPlayer(player) }, otherPlayer(player)).length === 0) {
    game.winner = tiebreak(game);
    game.winningPath = findWinningPath(game.board, game.winner, game.size);
    game.endReason = 'tiebreak';
  } else {
    game.currentPlayer = otherPlayer(player);
  }

  return { ...analysis, player, winner: game.winner };
}

export function replayBoard(game, step) {
  const safeStep = Math.max(0, Math.min(Number(step) || 0, game.moveHistory.length));
  if (safeStep === 0) return Array(game.size * game.size).fill(EMPTY);
  return [...game.moveHistory[safeStep - 1].board];
}
