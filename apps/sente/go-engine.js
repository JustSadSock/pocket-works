export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const other = (color) => color === BLACK ? WHITE : BLACK;
const indexOf = (size, x, y) => y * size + x;

export function createGame(options = {}) {
  const size = [9, 13, 19].includes(options.size) ? options.size : 9;
  const komi = Number.isFinite(options.komi) ? options.komi : 6.5;
  const board = new Uint8Array(size * size);
  const initial = snapshotBoard(board);
  return {
    size,
    komi,
    board,
    turn: BLACK,
    captures: { [BLACK]: 0, [WHITE]: 0 },
    passes: 0,
    moveNumber: 0,
    lastMove: null,
    result: null,
    phase: 'playing',
    moves: [],
    history: [initial],
    hashes: [hashBoard(board)],
    dead: []
  };
}

export function hydrateGame(raw) {
  if (!raw || ![9, 13, 19].includes(raw.size)) return null;
  const expected = raw.size * raw.size;
  if (!Array.isArray(raw.board) || raw.board.length !== expected) return null;
  const game = createGame({ size: raw.size, komi: Number(raw.komi) || 6.5 });
  game.board = Uint8Array.from(raw.board.map((value) => value === BLACK || value === WHITE ? value : EMPTY));
  game.turn = raw.turn === WHITE ? WHITE : BLACK;
  game.captures = {
    [BLACK]: Math.max(0, Number(raw.captures?.[BLACK]) || 0),
    [WHITE]: Math.max(0, Number(raw.captures?.[WHITE]) || 0)
  };
  game.passes = Math.max(0, Math.min(2, Number(raw.passes) || 0));
  game.moveNumber = Math.max(0, Number(raw.moveNumber) || 0);
  game.lastMove = raw.lastMove && Number.isInteger(raw.lastMove.x) && Number.isInteger(raw.lastMove.y)
    ? { ...raw.lastMove }
    : null;
  game.result = raw.result || null;
  game.phase = ['playing', 'scoring', 'finished', 'replay'].includes(raw.phase) ? raw.phase : 'playing';
  game.moves = Array.isArray(raw.moves) ? raw.moves.map((move) => ({ ...move })) : [];
  game.history = Array.isArray(raw.history) && raw.history.length
    ? raw.history.filter((item) => Array.isArray(item) && item.length === expected).map((item) => [...item])
    : [snapshotBoard(game.board)];
  game.hashes = game.history.map((item) => hashBoard(Uint8Array.from(item)));
  game.dead = Array.isArray(raw.dead) ? raw.dead.filter(Number.isInteger) : [];
  return game;
}

export function serializeGame(game) {
  return {
    size: game.size,
    komi: game.komi,
    board: snapshotBoard(game.board),
    turn: game.turn,
    captures: { ...game.captures },
    passes: game.passes,
    moveNumber: game.moveNumber,
    lastMove: game.lastMove ? { ...game.lastMove } : null,
    result: game.result ? { ...game.result } : null,
    phase: game.phase,
    moves: game.moves.map((move) => ({ ...move })),
    history: game.history.map((board) => [...board]),
    dead: [...game.dead]
  };
}

export function cloneGame(game) {
  return hydrateGame(serializeGame(game));
}

export function getNeighbors(size, x, y) {
  const points = [];
  if (x > 0) points.push({ x: x - 1, y });
  if (x < size - 1) points.push({ x: x + 1, y });
  if (y > 0) points.push({ x, y: y - 1 });
  if (y < size - 1) points.push({ x, y: y + 1 });
  return points;
}

export function getGroup(board, size, x, y) {
  const color = board[indexOf(size, x, y)];
  if (color === EMPTY) return { color: EMPTY, stones: [], liberties: [] };
  const stack = [{ x, y }];
  const seen = new Set();
  const liberties = new Set();
  const stones = [];

  while (stack.length) {
    const point = stack.pop();
    const key = indexOf(size, point.x, point.y);
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push(point);
    for (const neighbor of getNeighbors(size, point.x, point.y)) {
      const value = board[indexOf(size, neighbor.x, neighbor.y)];
      if (value === EMPTY) liberties.add(indexOf(size, neighbor.x, neighbor.y));
      else if (value === color && !seen.has(indexOf(size, neighbor.x, neighbor.y))) stack.push(neighbor);
    }
  }

  return {
    color,
    stones,
    liberties: [...liberties].map((key) => ({ x: key % size, y: Math.floor(key / size) }))
  };
}

function removeGroup(board, size, group) {
  for (const stone of group.stones) board[indexOf(size, stone.x, stone.y)] = EMPTY;
  return group.stones.length;
}

export function inspectMove(game, x, y, color = game.turn) {
  if (game.phase !== 'playing') return { legal: false, reason: 'Партия уже не идёт' };
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.size || y >= game.size) {
    return { legal: false, reason: 'За пределами доски' };
  }
  const pointIndex = indexOf(game.size, x, y);
  if (game.board[pointIndex] !== EMPTY) return { legal: false, reason: 'Точка занята' };

  const board = game.board.slice();
  board[pointIndex] = color;
  const captured = [];
  const checked = new Set();

  for (const neighbor of getNeighbors(game.size, x, y)) {
    const neighborIndex = indexOf(game.size, neighbor.x, neighbor.y);
    if (board[neighborIndex] !== other(color) || checked.has(neighborIndex)) continue;
    const group = getGroup(board, game.size, neighbor.x, neighbor.y);
    for (const stone of group.stones) checked.add(indexOf(game.size, stone.x, stone.y));
    if (group.liberties.length === 0) {
      captured.push(...group.stones);
      removeGroup(board, game.size, group);
    }
  }

  const ownGroup = getGroup(board, game.size, x, y);
  if (ownGroup.liberties.length === 0) return { legal: false, reason: 'Самоубийство' };

  const hash = hashBoard(board);
  if (game.hashes.length >= 2 && hash === game.hashes[game.hashes.length - 2]) {
    return { legal: false, reason: 'Ко: позицию нельзя повторить сразу' };
  }

  return { legal: true, board, captured, ownLiberties: ownGroup.liberties.length, hash };
}

export function playMove(game, x, y) {
  const inspection = inspectMove(game, x, y, game.turn);
  if (!inspection.legal) return inspection;
  const color = game.turn;
  game.board = inspection.board;
  game.captures[color] += inspection.captured.length;
  game.passes = 0;
  game.moveNumber += 1;
  game.lastMove = { x, y, color, pass: false, number: game.moveNumber };
  game.moves.push({ x, y, color, pass: false, captured: inspection.captured.map((point) => ({ ...point })) });
  game.history.push(snapshotBoard(game.board));
  game.hashes.push(inspection.hash);
  game.turn = other(color);
  return { ...inspection, color, moveNumber: game.moveNumber };
}

export function passTurn(game) {
  if (game.phase !== 'playing') return { legal: false, reason: 'Партия уже не идёт' };
  const color = game.turn;
  game.passes += 1;
  game.moveNumber += 1;
  game.lastMove = { x: null, y: null, color, pass: true, number: game.moveNumber };
  game.moves.push({ color, pass: true, captured: [] });
  game.history.push(snapshotBoard(game.board));
  game.hashes.push(game.hashes[game.hashes.length - 1]);
  game.turn = other(color);
  if (game.passes >= 2) {
    game.phase = 'scoring';
    game.dead = [];
  }
  return { legal: true, color, scoring: game.phase === 'scoring' };
}

export function resumeFromScoring(game) {
  if (game.phase !== 'scoring') return false;
  game.phase = 'playing';
  game.passes = 0;
  game.dead = [];
  return true;
}

export function toggleDeadGroup(game, x, y) {
  if (game.phase !== 'scoring') return false;
  const group = getGroup(game.board, game.size, x, y);
  if (group.color === EMPTY) return false;
  const indices = group.stones.map((stone) => indexOf(game.size, stone.x, stone.y));
  const dead = new Set(game.dead);
  const shouldMark = indices.some((index) => !dead.has(index));
  for (const index of indices) {
    if (shouldMark) dead.add(index);
    else dead.delete(index);
  }
  game.dead = [...dead];
  return true;
}

export function scoreGame(game) {
  const board = game.board.slice();
  const dead = new Set(game.dead);
  let deadBlack = 0;
  let deadWhite = 0;
  for (const key of dead) {
    if (board[key] === BLACK) deadBlack += 1;
    if (board[key] === WHITE) deadWhite += 1;
    board[key] = EMPTY;
  }

  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  const visited = new Set();
  const ownership = new Uint8Array(board.length);

  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === BLACK) blackStones += 1;
    else if (board[i] === WHITE) whiteStones += 1;
    else if (!visited.has(i)) {
      const region = [];
      const borders = new Set();
      const stack = [i];
      while (stack.length) {
        const key = stack.pop();
        if (visited.has(key) || board[key] !== EMPTY) continue;
        visited.add(key);
        region.push(key);
        const x = key % game.size;
        const y = Math.floor(key / game.size);
        for (const neighbor of getNeighbors(game.size, x, y)) {
          const neighborKey = indexOf(game.size, neighbor.x, neighbor.y);
          if (board[neighborKey] === EMPTY && !visited.has(neighborKey)) stack.push(neighborKey);
          else if (board[neighborKey] !== EMPTY) borders.add(board[neighborKey]);
        }
      }
      if (borders.size === 1 && borders.has(BLACK)) {
        blackTerritory += region.length;
        for (const key of region) ownership[key] = BLACK;
      }
      if (borders.size === 1 && borders.has(WHITE)) {
        whiteTerritory += region.length;
        for (const key of region) ownership[key] = WHITE;
      }
    }
  }

  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + game.komi;
  const winner = black > white ? BLACK : WHITE;
  return {
    black,
    white,
    winner,
    margin: Math.abs(black - white),
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    deadBlack,
    deadWhite,
    board: snapshotBoard(board),
    ownership: snapshotBoard(ownership)
  };
}

export function finishScoring(game) {
  if (game.phase !== 'scoring') return null;
  game.result = scoreGame(game);
  game.phase = 'finished';
  return game.result;
}

export function resignGame(game, color = game.turn) {
  if (game.phase !== 'playing') return null;
  game.result = {
    winner: other(color),
    resigned: color,
    margin: null,
    black: null,
    white: null
  };
  game.phase = 'finished';
  return game.result;
}

export function undo(game, count = 1) {
  if (game.moves.length === 0 || count < 1) return false;
  const nextCount = Math.max(0, game.moves.length - count);
  const base = createGame({ size: game.size, komi: game.komi });
  for (const move of game.moves.slice(0, nextCount)) {
    if (move.pass) passTurn(base);
    else playMove(base, move.x, move.y);
  }
  Object.assign(game, base);
  return true;
}

export function legalMoves(game, color = game.turn) {
  const result = [];
  if (game.phase !== 'playing') return result;
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const move = inspectMove(game, x, y, color);
      if (move.legal) result.push({ x, y, ...move });
    }
  }
  return result;
}

export function boardAt(game, ply) {
  const index = Math.max(0, Math.min(game.history.length - 1, ply));
  return Uint8Array.from(game.history[index]);
}

export function toSgf(game) {
  const size = game.size;
  const coord = (x, y) => `${String.fromCharCode(97 + x)}${String.fromCharCode(97 + y)}`;
  const moves = game.moves.map((move) => `;${move.color === BLACK ? 'B' : 'W'}[${move.pass ? '' : coord(move.x, move.y)}]`).join('');
  let result = '';
  if (game.result?.winner) {
    const side = game.result.winner === BLACK ? 'B' : 'W';
    result = game.result.resigned ? `${side}+R` : `${side}+${Number(game.result.margin || 0).toFixed(1)}`;
  }
  return `(;GM[1]FF[4]CA[UTF-8]AP[SENTE:1.0.0]SZ[${size}]KM[${game.komi}]${result ? `RE[${result}]` : ''}${moves})`;
}

export function hashBoard(board) {
  let hash = 2166136261;
  for (let i = 0; i < board.length; i += 1) {
    hash ^= board[i] + i * 3;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function snapshotBoard(board) {
  return Array.from(board);
}

export function colorName(color) {
  return color === BLACK ? 'Чёрные' : 'Белые';
}
