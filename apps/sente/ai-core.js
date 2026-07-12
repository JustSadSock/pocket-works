import { BLACK, WHITE, EMPTY, getGroup, getNeighbors, inspectMove } from './go-engine.js';

export { BLACK, WHITE, EMPTY };
export const other = (color) => color === BLACK ? WHITE : BLACK;
export const keyOf = (size, x, y) => y * size + x;
export const now = () => globalThis.performance?.now?.() ?? Date.now();
export const INF = 99;

export function cloneState(game, turn = game.turn) {
  return {
    size: game.size,
    komi: game.komi,
    board: game.board.slice(),
    turn,
    captures: { [BLACK]: game.captures?.[BLACK] || 0, [WHITE]: game.captures?.[WHITE] || 0 },
    passes: game.passes || 0,
    moveNumber: game.moveNumber || 0,
    lastMove: game.lastMove ? { ...game.lastMove } : null,
    result: null,
    phase: 'playing',
    moves: [],
    history: [Array.from(game.board)],
    hashes: Array.isArray(game.hashes) && game.hashes.length ? game.hashes.slice(-2) : [],
    dead: []
  };
}

export function stateAfterMove(game, move, color = game.turn) {
  if (move.pass) {
    const next = cloneState(game, other(color));
    next.passes = Math.min(2, (game.passes || 0) + 1);
    next.moveNumber = game.moveNumber + 1;
    next.lastMove = { x: null, y: null, color, pass: true, number: next.moveNumber };
    return next;
  }
  const inspection = move.inspection || inspectMove(game, move.x, move.y, color);
  if (!inspection.legal) return null;
  const next = cloneState(game, other(color));
  next.board = inspection.board;
  next.captures[color] += inspection.captured.length;
  next.passes = 0;
  next.moveNumber = game.moveNumber + 1;
  next.lastMove = { x: move.x, y: move.y, color, pass: false, number: next.moveNumber };
  next.hashes = [...next.hashes.slice(-1), inspection.hash];
  return next;
}

export function openingPoints(size) {
  if (size === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4], [2, 4], [6, 4], [4, 2], [4, 6]];
  if (size === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6], [3, 6], [9, 6], [6, 3], [6, 9]];
  return [[3, 3], [15, 3], [3, 15], [15, 15], [9, 9], [3, 9], [15, 9], [9, 3], [9, 15], [2, 3], [16, 3], [2, 15], [16, 15], [3, 2], [15, 2], [3, 16], [15, 16]];
}

export function collectGroups(board, size) {
  const seen = new Set();
  const groups = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const key = keyOf(size, x, y);
      if (board[key] === EMPTY || seen.has(key)) continue;
      const group = getGroup(board, size, x, y);
      for (const stone of group.stones) seen.add(keyOf(size, stone.x, stone.y));
      groups.push(group);
    }
  }
  return groups;
}

function analyzeRegions(board, size) {
  const regionAt = new Int16Array(board.length);
  regionAt.fill(-1);
  const regions = [];
  for (let start = 0; start < board.length; start += 1) {
    if (board[start] !== EMPTY || regionAt[start] !== -1) continue;
    const id = regions.length;
    const points = [];
    const borderColors = new Set();
    const boundaryStones = new Set();
    const edgeSides = new Set();
    const queue = [start];
    regionAt[start] = id;
    for (let head = 0; head < queue.length; head += 1) {
      const key = queue[head];
      const x = key % size;
      const y = Math.floor(key / size);
      points.push(key);
      if (x === 0) edgeSides.add(0);
      if (x === size - 1) edgeSides.add(1);
      if (y === 0) edgeSides.add(2);
      if (y === size - 1) edgeSides.add(3);
      for (const neighbor of getNeighbors(size, x, y)) {
        const neighborKey = keyOf(size, neighbor.x, neighbor.y);
        const value = board[neighborKey];
        if (value === EMPTY) {
          if (regionAt[neighborKey] === -1) {
            regionAt[neighborKey] = id;
            queue.push(neighborKey);
          }
        } else {
          borderColors.add(value);
          boundaryStones.add(neighborKey);
        }
      }
    }
    const owner = borderColors.size === 1 ? [...borderColors][0] : EMPTY;
    const closure = boundaryStones.size + edgeSides.size * 1.15;
    const required = 2.8 + Math.sqrt(points.length) * 1.18;
    const confidence = Math.min(1.5, closure / Math.max(1, required));
    const secure = owner !== EMPTY && boundaryStones.size >= 2 && confidence >= 1;
    regions.push({ id, points, owner, secure, confidence, boundaryStones, edgeSides });
  }
  return { regions, regionAt };
}

function distanceField(board, size, color) {
  const distance = new Uint8Array(board.length);
  distance.fill(INF);
  const queue = [];
  for (let key = 0; key < board.length; key += 1) {
    if (board[key] === color) {
      distance[key] = 0;
      queue.push(key);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head];
    const x = key % size;
    const y = Math.floor(key / size);
    const nextDistance = distance[key] + 1;
    for (const neighbor of getNeighbors(size, x, y)) {
      const neighborKey = keyOf(size, neighbor.x, neighbor.y);
      if (nextDistance >= distance[neighborKey]) continue;
      distance[neighborKey] = nextDistance;
      queue.push(neighborKey);
    }
  }
  return distance;
}

function groupEyeCount(group, regions, regionAt, size) {
  const eyes = new Set();
  for (const stone of group.stones) {
    for (const neighbor of getNeighbors(size, stone.x, stone.y)) {
      const regionId = regionAt[keyOf(size, neighbor.x, neighbor.y)];
      if (regionId < 0) continue;
      const region = regions[regionId];
      if (region.secure && region.owner === group.color && region.points.length <= Math.max(12, size)) eyes.add(regionId);
    }
  }
  return eyes.size;
}

export function analyzePosition(game, perspective) {
  const cacheKey = perspective === BLACK ? '_analysisBlack' : '_analysisWhite';
  if (game[cacheKey]) return game[cacheKey];
  const opponent = other(perspective);
  const { size, board } = game;
  const { regions, regionAt } = analyzeRegions(board, size);
  const ownDistance = distanceField(board, size, perspective);
  const enemyDistance = distanceField(board, size, opponent);
  const control = new Float32Array(board.length);
  let territory = 0;
  let secureTerritory = 0;
  let contested = 0;
  for (let key = 0; key < board.length; key += 1) {
    if (board[key] !== EMPTY) continue;
    const region = regions[regionAt[key]];
    let value = 0;
    if (region?.secure) {
      value = region.owner === perspective ? 1 : -1;
      secureTerritory += value;
    } else {
      const own = ownDistance[key];
      const enemy = enemyDistance[key];
      if (own >= INF && enemy < INF) value = -0.72 * Math.exp(-Math.max(0, enemy - 1) / 4.5);
      else if (enemy >= INF && own < INF) value = 0.72 * Math.exp(-Math.max(0, own - 1) / 4.5);
      else if (own < INF && enemy < INF) value = Math.tanh((enemy - own) / 2.35) * 0.82;
      if (region?.owner === perspective) value += 0.05 * Math.min(1, region.confidence);
      else if (region?.owner === opponent) value -= 0.05 * Math.min(1, region.confidence);
      value = Math.max(-1, Math.min(1, value));
    }
    control[key] = value;
    if (Math.abs(value) >= 0.16) territory += value;
    else contested += 1;
  }

  let groupHealth = 0;
  const groups = collectGroups(board, size);
  for (const group of groups) {
    const liberties = group.liberties.length;
    const stones = group.stones.length;
    const eyes = groupEyeCount(group, regions, regionAt, size);
    let value = 0;
    if (liberties === 1) value -= 55 + stones * 9;
    else if (liberties === 2) value -= 17 + stones * 2.6;
    else if (liberties === 3) value -= 3;
    else value += Math.min(6, (liberties - 3) * 0.9);
    if (eyes >= 2) value += 28;
    else if (eyes === 1) value += 7;
    groupHealth += group.color === perspective ? value : -value;
  }

  const captureDifference = (game.captures?.[perspective] || 0) - (game.captures?.[opponent] || 0);
  const komi = perspective === WHITE ? game.komi : -game.komi;
  const value = territory * 2.1 + secureTerritory * 0.45 + groupHealth + captureDifference * 11 + komi;
  const analysis = { value, territory, secureTerritory, contested, regions, regionAt, control, ownDistance, enemyDistance, groups };
  game[cacheKey] = analysis;
  return analysis;
}

export function adjacentGroups(game, x, y, color) {
  const groups = new Map();
  for (const neighbor of getNeighbors(game.size, x, y)) {
    const key = keyOf(game.size, neighbor.x, neighbor.y);
    if (game.board[key] !== color) continue;
    const group = getGroup(game.board, game.size, neighbor.x, neighbor.y);
    const id = Math.min(...group.stones.map((stone) => keyOf(game.size, stone.x, stone.y)));
    groups.set(id, group);
  }
  return [...groups.values()];
}

export function neighborhood(game, x, y, color, radius) {
  let count = 0;
  for (let py = Math.max(0, y - radius); py <= Math.min(game.size - 1, y + radius); py += 1) {
    for (let px = Math.max(0, x - radius); px <= Math.min(game.size - 1, x + radius); px += 1) {
      if (px === x && py === y) continue;
      if (Math.max(Math.abs(px - x), Math.abs(py - y)) > radius) continue;
      if (game.board[keyOf(game.size, px, py)] === color) count += 1;
    }
  }
  return count;
}

export function isEyeFill(game, x, y, color) {
  const neighbors = getNeighbors(game.size, x, y);
  let friendlyOrEdge = 4 - neighbors.length;
  for (const neighbor of neighbors) {
    if (game.board[keyOf(game.size, neighbor.x, neighbor.y)] === color) friendlyOrEdge += 1;
  }
  if (friendlyOrEdge !== 4) return false;
  let hostileDiagonals = 0;
  let offboardDiagonals = 0;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = x + dx;
    const py = y + dy;
    if (px < 0 || py < 0 || px >= game.size || py >= game.size) offboardDiagonals += 1;
    else if (game.board[keyOf(game.size, px, py)] === other(color)) hostileDiagonals += 1;
  }
  return hostileDiagonals + Math.max(0, offboardDiagonals - 1) <= 1;
}

export function openingBonus(game, x, y, nearestOwn, ownAdj, enemyAdj) {
  if (game.moveNumber >= Math.floor(game.size * 1.15)) return 0;
  const edge = Math.min(x, y, game.size - 1 - x, game.size - 1 - y);
  let score = 0;
  if (edge === 0) score -= 26;
  else if (edge === 1) score -= 10;
  else if (edge === 2) score += game.size === 9 ? 10 : 4;
  else if (edge === 3) score += game.size >= 13 ? 12 : 4;
  if (openingPoints(game.size).some(([sx, sy]) => sx === x && sy === y)) score += 18;
  if (enemyAdj === 0) {
    if (ownAdj > 0) score -= 34 + ownAdj * 10;
    else if (nearestOwn >= 4 && nearestOwn <= Math.max(7, Math.floor(game.size * 0.55))) score += 18;
    else if (nearestOwn === 2) score += 4;
  }
  return score;
}
