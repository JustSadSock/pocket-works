export const PLAYER = Object.freeze({ INDIGO: 1, VERMILION: 2 });

const DIRECTIONS = [
  [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]
];

function randomValue(rng) {
  return typeof rng === 'function' ? rng() : Math.random();
}

export class SeamGame {
  constructor({ size = 7, pieRule = true } = {}) {
    this.size = size;
    this.pieRule = pieRule;
    this.board = new Array(size * size).fill(0);
    this.turn = PLAYER.INDIGO;
    this.moveNumber = 0;
    this.captures = { 1: 0, 2: 0 };
    this.swapAvailable = false;
    this.swapUsed = false;
    this.winner = 0;
    this.winReason = '';
    this.winningPath = [];
    this.lastMove = -1;
    this.history = [this.positionKey()];
  }

  clone() {
    return SeamGame.fromJSON(this.toJSON());
  }

  toJSON() {
    return {
      size: this.size,
      pieRule: this.pieRule,
      board: [...this.board],
      turn: this.turn,
      moveNumber: this.moveNumber,
      captures: { ...this.captures },
      swapAvailable: this.swapAvailable,
      swapUsed: this.swapUsed,
      winner: this.winner,
      winReason: this.winReason,
      winningPath: [...this.winningPath],
      lastMove: this.lastMove,
      history: [...this.history]
    };
  }

  static fromJSON(data) {
    const game = new SeamGame({ size: data.size || 7, pieRule: data.pieRule !== false });
    game.board = Array.isArray(data.board) ? [...data.board] : game.board;
    game.turn = data.turn || PLAYER.INDIGO;
    game.moveNumber = Number(data.moveNumber) || 0;
    game.captures = { 1: Number(data.captures?.[1]) || 0, 2: Number(data.captures?.[2]) || 0 };
    game.swapAvailable = Boolean(data.swapAvailable);
    game.swapUsed = Boolean(data.swapUsed);
    game.winner = Number(data.winner) || 0;
    game.winReason = data.winReason || '';
    game.winningPath = Array.isArray(data.winningPath) ? [...data.winningPath] : [];
    game.lastMove = Number.isInteger(data.lastMove) ? data.lastMove : -1;
    game.history = Array.isArray(data.history) && data.history.length ? [...data.history] : [game.positionKey()];
    return game;
  }

  index(row, column) {
    return row * this.size + column;
  }

  coordinates(index) {
    return [Math.floor(index / this.size), index % this.size];
  }

  neighbors(index) {
    const [row, column] = this.coordinates(index);
    const result = [];
    for (const [dr, dc] of DIRECTIONS) {
      const nextRow = row + dr;
      const nextColumn = column + dc;
      if (nextRow >= 0 && nextRow < this.size && nextColumn >= 0 && nextColumn < this.size) {
        result.push(this.index(nextRow, nextColumn));
      }
    }
    return result;
  }

  positionKey() {
    return this.board.join('');
  }

  groupAt(index) {
    const player = this.board[index];
    if (!player) return { stones: [], liberties: [] };
    const stack = [index];
    const stones = new Set([index]);
    const liberties = new Set();
    while (stack.length) {
      const current = stack.pop();
      for (const next of this.neighbors(current)) {
        const value = this.board[next];
        if (value === 0) liberties.add(next);
        if (value === player && !stones.has(next)) {
          stones.add(next);
          stack.push(next);
        }
      }
    }
    return { stones: [...stones], liberties: [...liberties] };
  }

  connectionPath(player) {
    const queue = [];
    const parent = new Map();
    if (player === PLAYER.INDIGO) {
      for (let column = 0; column < this.size; column += 1) {
        const start = this.index(0, column);
        if (this.board[start] === player) {
          queue.push(start);
          parent.set(start, -1);
        }
      }
    } else {
      for (let row = 0; row < this.size; row += 1) {
        const start = this.index(row, 0);
        if (this.board[start] === player) {
          queue.push(start);
          parent.set(start, -1);
        }
      }
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const [row, column] = this.coordinates(current);
      const reached = player === PLAYER.INDIGO ? row === this.size - 1 : column === this.size - 1;
      if (reached) {
        const path = [];
        let node = current;
        while (node !== -1) {
          path.push(node);
          node = parent.get(node);
        }
        return path.reverse();
      }
      for (const next of this.neighbors(current)) {
        if (this.board[next] === player && !parent.has(next)) {
          parent.set(next, current);
          queue.push(next);
        }
      }
    }
    return [];
  }

  shortestConnectionCost(player) {
    const distances = new Array(this.board.length).fill(Number.POSITIVE_INFINITY);
    const open = [];
    const starts = [];
    if (player === PLAYER.INDIGO) {
      for (let column = 0; column < this.size; column += 1) starts.push(this.index(0, column));
    } else {
      for (let row = 0; row < this.size; row += 1) starts.push(this.index(row, 0));
    }

    const costAt = (index) => {
      if (this.board[index] === player) return 0;
      if (this.board[index] === 0) return 1;
      return 4;
    };

    for (const start of starts) {
      distances[start] = costAt(start);
      open.push(start);
    }

    while (open.length) {
      open.sort((a, b) => distances[a] - distances[b]);
      const current = open.shift();
      const [row, column] = this.coordinates(current);
      if ((player === PLAYER.INDIGO && row === this.size - 1)
        || (player === PLAYER.VERMILION && column === this.size - 1)) {
        return distances[current];
      }
      for (const next of this.neighbors(current)) {
        const nextDistance = distances[current] + costAt(next);
        if (nextDistance < distances[next]) {
          distances[next] = nextDistance;
          if (!open.includes(next)) open.push(next);
        }
      }
    }
    return 999;
  }

  canClaimOpening() {
    return this.pieRule && this.swapAvailable && !this.swapUsed && this.moveNumber === 1 && !this.winner;
  }

  claimOpening() {
    if (!this.canClaimOpening()) return { ok: false, reason: 'swap-unavailable' };
    this.swapAvailable = false;
    this.swapUsed = true;
    return { ok: true };
  }

  legalMoves() {
    if (this.winner) return [];
    const moves = [];
    for (let index = 0; index < this.board.length; index += 1) {
      if (this.board[index] === 0 && this.isLegal(index)) moves.push(index);
    }
    return moves;
  }

  isLegal(index) {
    if (this.winner || index < 0 || index >= this.board.length || this.board[index] !== 0) return false;
    const snapshot = this.toJSON();
    const result = this.play(index, { dryRun: true });
    Object.assign(this, SeamGame.fromJSON(snapshot));
    return result.ok;
  }

  play(index, { dryRun = false } = {}) {
    if (this.winner) return { ok: false, reason: 'finished' };
    if (!Number.isInteger(index) || index < 0 || index >= this.board.length || this.board[index] !== 0) {
      return { ok: false, reason: 'occupied' };
    }

    const player = this.turn;
    const opponent = 3 - player;
    const boardBefore = [...this.board];
    this.board[index] = player;
    const captured = new Set();
    const checked = new Set();

    for (const neighbor of this.neighbors(index)) {
      if (this.board[neighbor] !== opponent || checked.has(neighbor)) continue;
      const group = this.groupAt(neighbor);
      group.stones.forEach((stone) => checked.add(stone));
      if (group.liberties.length === 0) {
        group.stones.forEach((stone) => {
          captured.add(stone);
          this.board[stone] = 0;
        });
      }
    }

    const ownGroup = this.groupAt(index);
    if (ownGroup.liberties.length === 0) {
      this.board = boardBefore;
      return { ok: false, reason: 'suicide' };
    }

    const key = this.positionKey();
    if (this.history.includes(key)) {
      this.board = boardBefore;
      return { ok: false, reason: 'superko' };
    }

    this.captures[player] += captured.size;
    this.lastMove = index;
    this.moveNumber += 1;
    this.history.push(key);
    this.swapAvailable = this.pieRule && this.moveNumber === 1;

    const path = this.connectionPath(player);
    if (path.length) {
      this.winner = player;
      this.winReason = 'connection';
      this.winningPath = path;
      this.swapAvailable = false;
    } else {
      this.turn = opponent;
    }

    const result = {
      ok: true,
      player,
      captured: [...captured],
      winner: this.winner,
      winReason: this.winReason,
      winningPath: [...this.winningPath]
    };

    if (dryRun) return result;
    return result;
  }
}

const STYLE_WEIGHTS = Object.freeze({
  rush: { connect: 3.2, block: 1.0, capture: 0.9, shape: 0.35 },
  siege: { connect: 1.15, block: 1.25, capture: 4.0, shape: 0.5 },
  guard: { connect: 1.45, block: 3.25, capture: 0.8, shape: 0.55 },
  shape: { connect: 1.7, block: 1.45, capture: 1.0, shape: 2.0 },
  balanced: { connect: 2.35, block: 2.1, capture: 2.15, shape: 0.8 }
});

export function chooseBotMove(game, style = 'balanced', rng = Math.random, options = {}) {
  const legal = game.legalMoves();
  if (!legal.length) return -1;
  const player = game.turn;
  const opponent = 3 - player;
  const weights = STYLE_WEIGHTS[style] || STYLE_WEIGHTS.balanced;
  const ownBefore = game.shortestConnectionCost(player);
  const opponentBefore = game.shortestConnectionCost(opponent);
  const noise = Number.isFinite(options.noise) ? options.noise : 0.12;
  const scored = [];

  for (const move of legal) {
    const trial = game.clone();
    const capturesBefore = trial.captures[player];
    const result = trial.play(move);
    if (!result.ok) continue;
    if (trial.winner === player) return move;

    const ownGain = ownBefore - trial.shortestConnectionCost(player);
    const blockGain = trial.shortestConnectionCost(opponent) - opponentBefore;
    const captureGain = trial.captures[player] - capturesBefore;
    const group = trial.groupAt(move);
    const [row, column] = trial.coordinates(move);
    const middle = (trial.size - 1) / 2;
    const center = 1 - (Math.abs(row - middle) + Math.abs(column - middle)) / trial.size;
    let score = weights.connect * ownGain
      + weights.block * blockGain
      + weights.capture * captureGain
      + weights.shape * (Math.min(group.liberties.length, 5) + group.stones.length * 0.16)
      + center * 0.18
      + (randomValue(rng) - 0.5) * noise;

    if (options.avoidImmediateLoss) {
      let enemyWins = false;
      for (let reply = 0; reply < trial.board.length && !enemyWins; reply += 1) {
        if (trial.board[reply] !== 0) continue;
        const response = trial.clone();
        const answer = response.play(reply);
        enemyWins = answer.ok && response.winner === opponent;
      }
      if (enemyWins) score -= 30;
    }
    scored.push({ move, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const exploration = Number.isFinite(options.exploration) ? options.exploration : 0;
  if (scored.length > 1 && randomValue(rng) < exploration) {
    return scored[Math.min(scored.length - 1, 1 + Math.floor(randomValue(rng) * Math.min(3, scored.length - 1)))].move;
  }
  return scored[0]?.move ?? legal[0];
}

export function chooseAIMove(game, level = 'club', rng = Math.random) {
  if (level === 'calm') {
    return chooseBotMove(game, 'balanced', rng, { noise: 1.2, exploration: 0.28 });
  }
  if (level === 'sharp') {
    const styles = ['balanced', 'guard', 'siege'];
    const style = styles[Math.floor(randomValue(rng) * styles.length)];
    return chooseBotMove(game, style, rng, { noise: 0.03, avoidImmediateLoss: true });
  }
  return chooseBotMove(game, 'balanced', rng, { noise: 0.25, exploration: 0.06, avoidImmediateLoss: true });
}

export function shouldClaimOpening(game, level = 'club', rng = Math.random) {
  if (!game.canClaimOpening()) return false;
  const [row, column] = game.coordinates(game.lastMove);
  const middle = (game.size - 1) / 2;
  const centrality = Math.abs(row - middle) + Math.abs(column - middle);
  if (centrality < 0.5) return level !== 'calm' || randomValue(rng) < 0.55;
  if (centrality > 1.1) return false;
  const price = level === 'sharp' ? 0.5 : level === 'club' ? 0.4 : 0.16;
  return randomValue(rng) < price;
}
