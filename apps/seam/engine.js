export const PLAYER = Object.freeze({ AZURE: 1, OCHRE: 2 });
export const DIRECTIONS = Object.freeze([
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
]);
const AXES = [DIRECTIONS[0], DIRECTIONS[1], DIRECTIONS[2]];
const CENTER = [0, 0];

const keyOf = ([q, r]) => `${q},${r}`;
const parseKey = (key) => key.split(',').map(Number);
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const negate = ([q, r]) => [-q, -r];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
const projection = ([q, r], [dq, dr]) => q * dq + r * dr + (-(q + r)) * (-(dq + dr));

export function hexDistance(a, b = CENTER) {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  const ds = -(a[0] + a[1]) + b[0] + b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function boardCells(radius = 3) {
  const result = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (hexDistance([q, r]) <= radius) result.push([q, r]);
    }
  }
  return result;
}

function centered(list, count) {
  const start = Math.max(0, Math.floor((list.length - count) / 2));
  return list.slice(start, start + count);
}

function startingCells(radius, player, count) {
  const backR = player === PLAYER.AZURE ? -radius : radius;
  const innerR = player === PLAYER.AZURE ? -radius + 1 : radius - 1;
  const all = boardCells(radius);
  const back = all.filter((cell) => cell[1] === backR).sort((a, b) => a[0] - b[0]);
  const inner = all.filter((cell) => cell[1] === innerR).sort((a, b) => a[0] - b[0]);
  const backCount = Math.min(back.length, Math.ceil(count * 0.58));
  return [...centered(back, backCount), ...centered(inner, count - backCount)];
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((value) => values.has(value));
}

function randomValue(rng) {
  return typeof rng === 'function' ? rng() : Math.random();
}

export class AxisGame {
  constructor({
    radius = 3,
    pieces = 7,
    maxGroup = 3,
    centerReplies = 2,
    centerSupport = 2,
    crownMinGroup = 2,
    pieRule = true,
    maxTurns = 150
  } = {}) {
    this.radius = radius;
    this.pieceCount = pieces;
    this.maxGroup = maxGroup;
    this.centerReplies = centerReplies;
    this.centerSupport = centerSupport;
    this.crownMinGroup = crownMinGroup;
    this.pieRule = pieRule;
    this.maxTurns = maxTurns;
    this.board = {};
    this.crown = { 1: '', 2: '' };
    for (const player of [PLAYER.AZURE, PLAYER.OCHRE]) {
      const cells = startingCells(radius, player, pieces);
      for (const cell of cells) this.board[keyOf(cell)] = player;
      const backR = player === PLAYER.AZURE ? -radius : radius;
      const back = cells.filter((cell) => cell[1] === backR);
      const crown = back.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))[0] || cells[0];
      this.crown[player] = keyOf(crown);
    }
    this.turn = PLAYER.AZURE;
    this.moveNumber = 0;
    this.winner = 0;
    this.winReason = '';
    this.lastMove = null;
    this.centerClaim = null;
    this.swapAvailable = false;
    this.swapUsed = false;
    this.ejections = { 1: 0, 2: 0 };
  }

  static fromJSON(data = {}) {
    const game = new AxisGame({
      radius: data.radius || 3,
      pieces: data.pieceCount || 7,
      maxGroup: data.maxGroup || 3,
      centerReplies: data.centerReplies || 2,
      centerSupport: data.centerSupport || 2,
      crownMinGroup: data.crownMinGroup || 2,
      pieRule: data.pieRule !== false,
      maxTurns: data.maxTurns || 150
    });
    game.board = data.board && typeof data.board === 'object' ? { ...data.board } : game.board;
    game.crown = { 1: data.crown?.[1] || game.crown[1], 2: data.crown?.[2] || game.crown[2] };
    game.turn = Number(data.turn) || PLAYER.AZURE;
    game.moveNumber = Number(data.moveNumber) || 0;
    game.winner = Number(data.winner) || 0;
    game.winReason = data.winReason || '';
    game.lastMove = data.lastMove ? structuredClone(data.lastMove) : null;
    game.centerClaim = data.centerClaim ? { player: Number(data.centerClaim.player), replies: Number(data.centerClaim.replies) || 0 } : null;
    game.swapAvailable = Boolean(data.swapAvailable);
    game.swapUsed = Boolean(data.swapUsed);
    game.ejections = { 1: Number(data.ejections?.[1]) || 0, 2: Number(data.ejections?.[2]) || 0 };
    return game;
  }

  clone() {
    return AxisGame.fromJSON(this.toJSON());
  }

  toJSON() {
    return {
      radius: this.radius,
      pieceCount: this.pieceCount,
      maxGroup: this.maxGroup,
      centerReplies: this.centerReplies,
      centerSupport: this.centerSupport,
      crownMinGroup: this.crownMinGroup,
      pieRule: this.pieRule,
      maxTurns: this.maxTurns,
      board: { ...this.board },
      crown: { ...this.crown },
      turn: this.turn,
      moveNumber: this.moveNumber,
      winner: this.winner,
      winReason: this.winReason,
      lastMove: this.lastMove ? structuredClone(this.lastMove) : null,
      centerClaim: this.centerClaim ? { ...this.centerClaim } : null,
      swapAvailable: this.swapAvailable,
      swapUsed: this.swapUsed,
      ejections: { ...this.ejections }
    };
  }

  onBoard(cell) {
    return hexDistance(cell) <= this.radius;
  }

  valueAt(cell) {
    return this.board[keyOf(cell)] || 0;
  }

  cellsFor(player) {
    return Object.entries(this.board).filter(([, value]) => value === player).map(([key]) => parseKey(key));
  }

  crownCell(player) {
    return parseKey(this.crown[player]);
  }

  supportFor(player) {
    const crown = this.crownCell(player);
    return DIRECTIONS.reduce((count, direction) => count + (this.valueAt(add(crown, direction)) === player ? 1 : 0), 0);
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

  lineGroups(player = this.turn) {
    const own = new Set(this.cellsFor(player).map(keyOf));
    const groups = new Map();
    for (const key of own) groups.set(key, [parseKey(key)]);
    for (const axis of AXES) {
      for (const key of own) {
        const start = parseKey(key);
        if (own.has(keyOf(add(start, negate(axis))))) continue;
        const run = [];
        let current = start;
        while (own.has(keyOf(current))) {
          run.push(current);
          for (let length = 2; length <= Math.min(this.maxGroup, run.length); length += 1) {
            const group = run.slice(-length);
            groups.set(group.map(keyOf).sort().join('|'), group);
          }
          current = add(current, axis);
        }
      }
    }
    return [...groups.values()];
  }

  legalMoves(player = this.turn) {
    if (this.winner) return [];
    const result = [];
    const seen = new Set();
    for (const group of this.lineGroups(player)) {
      if (group.some((cell) => keyOf(cell) === this.crown[player]) && group.length < this.crownMinGroup) continue;
      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
        const direction = DIRECTIONS[directionIndex];
        const identity = `${group.map(keyOf).sort().join('|')}@${directionIndex}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const move = this.inspectMove(group, directionIndex, player);
        if (move) result.push(move);
      }
    }
    return result;
  }

  legalMovesForSelection(selected, player = this.turn) {
    const keys = selected.map((cell) => typeof cell === 'string' ? cell : keyOf(cell));
    return this.legalMoves(player).filter((move) => sameSet(move.selected, keys));
  }

  inspectMove(group, directionIndex, player = this.turn) {
    const direction = DIRECTIONS[directionIndex];
    const selected = new Set(group.map(keyOf));
    const inline = group.length === 1 || group.slice(0, -1).every((cell, index) => {
      const delta = subtract(group[index + 1], cell);
      return equal(delta, direction) || equal(delta, negate(direction));
    });

    if (!inline) {
      const destinations = group.map((cell) => add(cell, direction));
      const blocked = destinations.some((cell) => !this.onBoard(cell)
        || (this.valueAt(cell) !== 0 && !selected.has(keyOf(cell))));
      if (blocked) return null;
      return {
        selected: group.map(keyOf), direction: directionIndex, kind: 'broadside', pushed: [], ejected: [], destinations: destinations.map(keyOf)
      };
    }

    const fronts = group.filter((cell) => !selected.has(keyOf(add(cell, direction))));
    if (fronts.length !== 1) return null;
    const front = fronts[0];
    const next = add(front, direction);
    if (!this.onBoard(next)) return null;
    const nextValue = this.valueAt(next);
    if (nextValue === 0) {
      return {
        selected: group.map(keyOf), direction: directionIndex, kind: group.length === 1 ? 'single' : 'inline', pushed: [], ejected: [], destinations: group.map((cell) => keyOf(add(cell, direction)))
      };
    }
    if (nextValue === player) return null;

    const pushed = [];
    let cursor = next;
    while (this.onBoard(cursor) && this.valueAt(cursor) === 3 - player) {
      pushed.push(cursor);
      cursor = add(cursor, direction);
    }
    if (pushed.length >= group.length) return null;
    if (this.onBoard(cursor) && this.valueAt(cursor) !== 0) return null;
    const ejected = this.onBoard(cursor) ? [] : [pushed[pushed.length - 1]];
    return {
      selected: group.map(keyOf), direction: directionIndex, kind: 'push', pushed: pushed.map(keyOf), ejected: ejected.map(keyOf), destinations: group.map((cell) => keyOf(add(cell, direction)))
    };
  }

  applyMove(move) {
    if (this.winner) return { ok: false, reason: 'finished' };
    const selectedCells = move.selected.map(parseKey);
    const inspected = this.inspectMove(selectedCells, move.direction, this.turn);
    if (!inspected || !sameSet(inspected.selected, move.selected)) return { ok: false, reason: 'illegal' };

    const player = this.turn;
    const opponent = 3 - player;
    const direction = DIRECTIONS[move.direction];
    const sortForward = (a, b) => projection(b, direction) - projection(a, direction);
    const pushed = inspected.pushed.map(parseKey).sort(sortForward);
    const ejectedPlayers = [];

    for (const cell of pushed) {
      const sourceKey = keyOf(cell);
      const owner = this.board[sourceKey];
      delete this.board[sourceKey];
      const destination = add(cell, direction);
      if (this.onBoard(destination)) this.board[keyOf(destination)] = owner;
      else {
        this.ejections[player] += 1;
        ejectedPlayers.push(owner);
      }
      if (this.crown[owner] === sourceKey) {
        this.crown[owner] = keyOf(destination);
        if (!this.onBoard(destination)) {
          this.winner = player;
          this.winReason = 'crown-ejected';
        }
      }
    }

    for (const cell of selectedCells.sort(sortForward)) {
      const sourceKey = keyOf(cell);
      const owner = this.board[sourceKey];
      delete this.board[sourceKey];
      const destination = add(cell, direction);
      this.board[keyOf(destination)] = owner;
      if (this.crown[owner] === sourceKey) this.crown[owner] = keyOf(destination);
    }

    this.moveNumber += 1;
    this.swapAvailable = this.pieRule && this.moveNumber === 1;
    this.lastMove = { ...inspected, player };

    if (this.centerClaim) {
      const claimant = this.centerClaim.player;
      const intact = equal(this.crownCell(claimant), CENTER) && this.supportFor(claimant) >= this.centerSupport;
      if (!intact) this.centerClaim = null;
      else if (player === 3 - claimant) {
        this.centerClaim.replies += 1;
        if (this.centerClaim.replies >= this.centerReplies && !this.winner) {
          this.winner = claimant;
          this.winReason = 'center-held';
        }
      }
    }

    if (!this.winner) {
      const ownReady = equal(this.crownCell(player), CENTER) && this.supportFor(player) >= this.centerSupport;
      if (ownReady && this.centerClaim?.player !== player) this.centerClaim = { player, replies: 0 };
      if (!ownReady && this.centerClaim?.player === player) this.centerClaim = null;
    }

    if (!this.winner) {
      this.turn = opponent;
      this.swapAvailable = this.pieRule && this.moveNumber === 1;
      if (this.moveNumber >= this.maxTurns) {
        this.winner = -1;
        this.winReason = 'turn-limit';
      }
    } else {
      this.swapAvailable = false;
    }

    return {
      ok: true,
      move: inspected,
      player,
      pushed: inspected.pushed,
      ejected: inspected.ejected,
      ejectedPlayers,
      winner: this.winner,
      winReason: this.winReason,
      centerClaim: this.centerClaim ? { ...this.centerClaim } : null
    };
  }
}

export const STYLE_WEIGHTS = Object.freeze({
  rush: { center: 7.0, crownEdge: 0.8, push: 1.0, eject: 1.8, cohesion: 0.4, mobility: 0.2, protect: 0.8, broadside: 0.2 },
  ram: { center: 1.0, crownEdge: 3.2, push: 4.2, eject: 7.5, cohesion: 1.0, mobility: 0.3, protect: 1.0, broadside: 0.3 },
  shell: { center: 3.0, crownEdge: 1.8, push: 2.3, eject: 3.8, cohesion: 2.5, mobility: 1.1, protect: 3.8, broadside: 0.8 },
  flank: { center: 2.1, crownEdge: 2.2, push: 2.0, eject: 3.5, cohesion: 0.7, mobility: 2.2, protect: 1.1, broadside: 2.4 },
  balanced: { center: 3.0, crownEdge: 2.2, push: 2.8, eject: 5.0, cohesion: 1.5, mobility: 0.9, protect: 2.4, broadside: 0.7 }
});

function edgeRisk(game, player) {
  return Math.max(0, hexDistance(game.crownCell(player)) - (game.radius - 2));
}

function cohesion(game, player) {
  const own = new Set(game.cellsFor(player).map(keyOf));
  let links = 0;
  for (const key of own) {
    const cell = parseKey(key);
    for (const direction of DIRECTIONS) if (own.has(keyOf(add(cell, direction)))) links += 1;
  }
  return links / 2;
}

function roughMobility(game, player) {
  let count = 0;
  for (const cell of game.cellsFor(player)) {
    for (const direction of DIRECTIONS) {
      const destination = add(cell, direction);
      if (game.onBoard(destination) && game.valueAt(destination) === 0) count += 1;
    }
  }
  return count;
}

export function evaluatePosition(game, player, style = 'balanced') {
  const opponent = 3 - player;
  const weights = STYLE_WEIGHTS[style] || STYLE_WEIGHTS.balanced;
  if (game.winner === player) return 100000;
  if (game.winner === opponent) return -100000;
  if (game.winner === -1) return 0;
  const centerProgress = hexDistance(game.crownCell(opponent)) - hexDistance(game.crownCell(player));
  const crownPressure = edgeRisk(game, opponent) - edgeRisk(game, player) * 0.6;
  const material = game.cellsFor(player).length - game.cellsFor(opponent).length;
  const shape = cohesion(game, player) - cohesion(game, opponent);
  const mobility = roughMobility(game, player) - roughMobility(game, opponent);
  const support = game.supportFor(player) - game.supportFor(opponent);
  const claim = game.centerClaim?.player === player ? 10 + game.centerClaim.replies * 5
    : game.centerClaim?.player === opponent ? -12 - game.centerClaim.replies * 6 : 0;
  return weights.center * centerProgress
    + weights.crownEdge * crownPressure
    + weights.eject * material
    + weights.cohesion * shape
    + weights.mobility * mobility * 0.08
    + weights.protect * support
    + claim;
}

export function shouldSwapOpening(game, style = 'balanced') {
  return game.canClaimOpening() && evaluatePosition(game, PLAYER.AZURE, style) > 9;
}

export function chooseAIMove(game, {
  level = 'club',
  style = 'balanced',
  rng = Math.random
} = {}) {
  const moves = game.legalMoves();
  if (!moves.length) return null;
  const player = game.turn;
  const weights = STYLE_WEIGHTS[style] || STYLE_WEIGHTS.balanced;
  const scored = moves.map((move) => {
    const trial = game.clone();
    const beforeCount = trial.cellsFor(3 - player).length;
    const result = trial.applyMove(move);
    let score = evaluatePosition(trial, player, style);
    if (trial.winner === player) score += 50000;
    if (move.kind === 'push') score += weights.push;
    if (trial.cellsFor(3 - player).length < beforeCount) score += weights.eject * 2.5;
    if (move.kind === 'broadside') score += weights.broadside;
    score += (randomValue(rng) - 0.5) * (level === 'calm' ? 2.8 : 0.7);
    return { move, score, trial, result };
  }).sort((a, b) => b.score - a.score);

  if (level === 'sharp') {
    const shortlist = scored.slice(0, Math.min(10, scored.length));
    for (const candidate of shortlist) {
      if (candidate.trial.winner) continue;
      const replies = candidate.trial.legalMoves();
      let worst = candidate.score;
      const sampled = replies.length > 16 ? replies.filter((_, index) => index % Math.ceil(replies.length / 16) === 0).slice(0, 16) : replies;
      for (const reply of sampled) {
        const response = candidate.trial.clone();
        response.applyMove(reply);
        worst = Math.min(worst, evaluatePosition(response, player, style));
        if (response.winner === 3 - player) worst -= 30000;
      }
      candidate.score = worst;
    }
    shortlist.sort((a, b) => b.score - a.score);
    return shortlist[Math.floor((randomValue(rng) ** 2.5) * Math.min(2, shortlist.length))]?.move || shortlist[0].move;
  }

  const width = level === 'calm' ? Math.min(8, scored.length) : Math.min(4, scored.length);
  const index = Math.floor((randomValue(rng) ** (level === 'calm' ? 1.1 : 2.4)) * width);
  return scored[index]?.move || scored[0].move;
}

export function lineBetween(first, second, game, player = game.turn) {
  if (equal(first, second)) return [first];
  const delta = subtract(second, first);
  let direction = null;
  let distance = 0;
  for (const axis of [...AXES, ...AXES.map(negate)]) {
    for (let step = 1; step <= game.maxGroup - 1; step += 1) {
      if (equal(add(first, [axis[0] * step, axis[1] * step]), second)) {
        direction = axis;
        distance = step;
        break;
      }
    }
    if (direction) break;
  }
  if (!direction) return [];
  const result = [];
  for (let step = 0; step <= distance; step += 1) {
    const cell = add(first, [direction[0] * step, direction[1] * step]);
    if (game.valueAt(cell) !== player) return [];
    result.push(cell);
  }
  return result.length <= game.maxGroup ? result : [];
}

export const coordKey = keyOf;
export const parseCoordKey = parseKey;
