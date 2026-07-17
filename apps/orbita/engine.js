export const RINGS = 4;
export const SECTORS = 8;
export const MATCH_TARGET = 3;

const clone = (value) => JSON.parse(JSON.stringify(value));
const emptyBoard = () => Array.from({ length: RINGS }, () => Array(SECTORS).fill(null));

function seatColorsForStarter(starterSeat) {
  return starterSeat === 0 ? [0, 1] : [1, 0];
}

export function createGame() {
  return {
    schemaVersion: 2,
    board: emptyBoard(),
    phase: 'place',
    round: 1,
    moveNumber: 1,
    starterSeat: 0,
    turnSeat: 0,
    seatColors: [0, 1],
    scores: [0, 0],
    pendingPlacement: null,
    canSwap: false,
    pieResolved: false,
    challengeColor: null,
    challengePath: [],
    winnerSeat: null,
    winnerColor: null,
    winPath: [],
    draw: false,
    history: []
  };
}

export function colorForTurn(state) {
  return state.seatColors[state.turnSeat];
}

export function seatForColor(state, color) {
  const seat = state.seatColors.indexOf(color);
  return seat === -1 ? null : seat;
}

export function isBoardEmpty(board) {
  return board.every((ring) => ring.every((cell) => cell === null));
}

export function boardIsFull(board) {
  return board.every((ring) => ring.every((cell) => cell !== null));
}

function assertCell(ring, sector) {
  if (!Number.isInteger(ring) || ring < 0 || ring >= RINGS) throw new Error('Некорректное кольцо');
  if (!Number.isInteger(sector) || sector < 0 || sector >= SECTORS) throw new Error('Некорректный сектор');
}

function finishRound(next, color, path) {
  const winnerSeat = seatForColor(next, color);
  next.phase = 'round-over';
  next.challengeColor = null;
  next.challengePath = [];
  next.winnerSeat = winnerSeat;
  next.winnerColor = color;
  next.winPath = path;
  next.scores[winnerSeat] += 1;
  next.canSwap = false;
  return next;
}

function finishDraw(next) {
  next.phase = 'round-over';
  next.challengeColor = null;
  next.challengePath = [];
  next.draw = true;
  next.canSwap = false;
  return next;
}

export function placeStone(state, ring, sector) {
  assertCell(ring, sector);
  if (state.phase !== 'place') throw new Error('Сейчас нельзя ставить камень');
  if (state.winnerSeat !== null || state.draw) throw new Error('Раунд завершён');
  if (state.board[ring][sector] !== null) throw new Error('Ячейка занята');

  const next = clone(state);
  if (next.canSwap) {
    next.canSwap = false;
    next.pieResolved = true;
  }

  const color = colorForTurn(next);
  next.board[ring][sector] = color;
  next.pendingPlacement = { ring, sector, color };
  next.phase = 'rotate';
  return next;
}

export function rotateCells(cells, direction) {
  if (direction !== 1 && direction !== -1) throw new Error('Направление должно быть 1 или -1');
  const shifted = Array(SECTORS).fill(null);
  for (let sector = 0; sector < SECTORS; sector += 1) {
    shifted[(sector + direction + SECTORS) % SECTORS] = cells[sector];
  }
  return shifted;
}

export function rotateRing(state, ring, direction) {
  if (!Number.isInteger(ring) || ring < 0 || ring >= RINGS) throw new Error('Некорректное кольцо');
  if (direction !== 1 && direction !== -1) throw new Error('Некорректное направление');
  if (state.phase !== 'rotate' || !state.pendingPlacement) throw new Error('Сначала поставьте камень');

  const next = clone(state);
  const actingSeat = next.turnSeat;
  const actingColor = colorForTurn(next);
  const defendingColor = next.challengeColor;
  const placement = { ...next.pendingPlacement };

  next.board[ring] = rotateCells(next.board[ring], direction);
  if (placement.ring === ring) placement.sector = (placement.sector + direction + SECTORS) % SECTORS;

  next.history.push({
    type: 'turn',
    move: next.moveNumber,
    seat: actingSeat,
    color: actingColor,
    placed: placement,
    rotatedRing: ring,
    direction,
    defendedChallenge: defendingColor
  });
  next.pendingPlacement = null;
  next.winPath = [];

  if (defendingColor !== null) {
    const survivingPath = findWinningPath(next.board, defendingColor);
    if (survivingPath.length) return finishRound(next, defendingColor, survivingPath);

    // Защитный ход только отбивает вызов: встречная цепь должна дождаться
    // следующего обычного хода своего владельца.
    next.challengeColor = null;
    next.challengePath = [];
  } else {
    const path = findWinningPath(next.board, actingColor);
    if (path.length) {
      next.challengeColor = actingColor;
      next.challengePath = path;
    }
  }

  if (boardIsFull(next.board)) {
    if (next.challengeColor !== null) return finishRound(next, next.challengeColor, next.challengePath);
    return finishDraw(next);
  }

  next.turnSeat = 1 - next.turnSeat;
  next.moveNumber += 1;
  next.phase = 'place';
  if (next.history.filter((entry) => entry.type === 'turn').length === 1 && !next.pieResolved) {
    next.canSwap = true;
  }
  return next;
}

export function swapSides(state) {
  if (state.phase !== 'place' || !state.canSwap || state.pieResolved) throw new Error('Обмен сторонами недоступен');
  const next = clone(state);
  const swappingSeat = next.turnSeat;
  next.seatColors.reverse();
  next.canSwap = false;
  next.pieResolved = true;
  next.history.push({ type: 'swap', move: next.moveNumber, seat: swappingSeat });
  next.turnSeat = 1 - next.turnSeat;
  next.moveNumber += 1;
  return next;
}

export function declineSwap(state) {
  if (state.phase !== 'place' || !state.canSwap || state.pieResolved) throw new Error('Выбор стороны уже сделан');
  const next = clone(state);
  next.canSwap = false;
  next.pieResolved = true;
  return next;
}

export function nextRound(state) {
  if (state.phase !== 'round-over') throw new Error('Раунд ещё не завершён');
  const next = createGame();
  next.round = state.round + 1;
  next.scores = [...state.scores];
  next.starterSeat = (next.round - 1) % 2;
  next.turnSeat = next.starterSeat;
  next.seatColors = seatColorsForStarter(next.starterSeat);
  return next;
}

export function restartRound(state) {
  const next = createGame();
  next.round = state.round;
  next.scores = [...state.scores];
  next.starterSeat = state.starterSeat;
  next.turnSeat = state.starterSeat;
  next.seatColors = seatColorsForStarter(state.starterSeat);
  return next;
}

export function resetMatch() {
  return createGame();
}

export function matchWinner(state) {
  const seat = state.scores.findIndex((score) => score >= MATCH_TARGET);
  return seat === -1 ? null : seat;
}

function key(ring, sector) {
  return `${ring}:${sector}`;
}

function neighbors(ring, sector) {
  const result = [
    [ring, (sector - 1 + SECTORS) % SECTORS],
    [ring, (sector + 1) % SECTORS]
  ];
  if (ring > 0) result.push([ring - 1, sector]);
  if (ring < RINGS - 1) result.push([ring + 1, sector]);
  return result;
}

export function findWinningPath(board, color) {
  const queue = [];
  const visited = new Set();
  const parent = new Map();

  for (let sector = 0; sector < SECTORS; sector += 1) {
    if (board[0][sector] === color) {
      const cellKey = key(0, sector);
      queue.push([0, sector]);
      visited.add(cellKey);
      parent.set(cellKey, null);
    }
  }

  while (queue.length) {
    const [ring, sector] = queue.shift();
    if (ring === RINGS - 1) {
      const path = [];
      let current = key(ring, sector);
      while (current) {
        const [pathRing, pathSector] = current.split(':').map(Number);
        path.push({ ring: pathRing, sector: pathSector });
        current = parent.get(current);
      }
      return path.reverse();
    }

    for (const [nextRing, nextSector] of neighbors(ring, sector)) {
      const nextKey = key(nextRing, nextSector);
      if (visited.has(nextKey) || board[nextRing][nextSector] !== color) continue;
      visited.add(nextKey);
      parent.set(nextKey, key(ring, sector));
      queue.push([nextRing, nextSector]);
    }
  }

  return [];
}

function migrateStoredState(value) {
  if (value?.schemaVersion === 2) return clone(value);
  if (value?.schemaVersion !== 1) return null;
  const migrated = clone(value);
  migrated.schemaVersion = 2;
  migrated.challengeColor = null;
  migrated.challengePath = [];
  if (migrated.phase !== 'round-over') migrated.winPath = [];
  return migrated;
}

export function validateStoredState(value) {
  const migrated = migrateStoredState(value);
  if (!migrated || typeof migrated !== 'object') return null;
  if (!Array.isArray(migrated.board) || migrated.board.length !== RINGS) return null;
  if (!migrated.board.every((ring) => Array.isArray(ring) && ring.length === SECTORS)) return null;
  if (!migrated.board.flat().every((cell) => cell === null || cell === 0 || cell === 1)) return null;
  if (!['place', 'rotate', 'round-over'].includes(migrated.phase)) return null;
  if (![0, 1].includes(migrated.turnSeat) || !Array.isArray(migrated.seatColors)) return null;
  if (!Array.isArray(migrated.scores) || migrated.scores.length !== 2) return null;
  if (![null, 0, 1].includes(migrated.challengeColor)) return null;
  if (!Array.isArray(migrated.challengePath)) return null;
  return migrated;
}
