import { BLACK, WHITE, EMPTY, getGroup, getNeighbors } from './go-engine.js';

const other = (color) => color === BLACK ? WHITE : BLACK;
const keyOf = (size, x, y) => y * size + x;

function collectGroups(board, size) {
  const seen = new Set();
  const groups = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const key = keyOf(size, x, y);
      if (board[key] === EMPTY || seen.has(key)) continue;
      const group = getGroup(board, size, x, y);
      const indices = group.stones.map((stone) => keyOf(size, stone.x, stone.y));
      for (const index of indices) seen.add(index);
      groups.push({ ...group, indices });
    }
  }
  return groups;
}

function collectRegions(board, size) {
  const visited = new Set();
  const regions = [];
  const regionByPoint = new Map();

  for (let start = 0; start < board.length; start += 1) {
    if (board[start] !== EMPTY || visited.has(start)) continue;
    const stack = [start];
    const points = [];
    const borderColors = new Set();
    let touchesEdge = false;

    while (stack.length) {
      const key = stack.pop();
      if (visited.has(key) || board[key] !== EMPTY) continue;
      visited.add(key);
      points.push(key);
      const x = key % size;
      const y = Math.floor(key / size);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesEdge = true;

      for (const neighbor of getNeighbors(size, x, y)) {
        const neighborKey = keyOf(size, neighbor.x, neighbor.y);
        const value = board[neighborKey];
        if (value === EMPTY) stack.push(neighborKey);
        else borderColors.add(value);
      }
    }

    const region = { points, borderColors, touchesEdge };
    const index = regions.length;
    regions.push(region);
    for (const point of points) regionByPoint.set(point, index);
  }

  return { regions, regionByPoint };
}

function eyeRegionsFor(group, regions, regionByPoint, size) {
  const ids = new Set();
  for (const liberty of group.liberties) {
    const regionId = regionByPoint.get(keyOf(size, liberty.x, liberty.y));
    if (regionId === undefined) continue;
    const region = regions[regionId];
    if (region.borderColors.size === 1 && region.borderColors.has(group.color)) ids.add(regionId);
  }
  return ids;
}

function enclosingRegionsFor(group, regions, regionByPoint, size) {
  const ids = new Set();
  for (const liberty of group.liberties) {
    const regionId = regionByPoint.get(keyOf(size, liberty.x, liberty.y));
    if (regionId !== undefined) ids.add(regionId);
  }
  return [...ids].map((id) => regions[id]);
}

function pressureAroundLiberties(group, board, size) {
  let pressured = 0;
  const opponent = other(group.color);
  for (const liberty of group.liberties) {
    let enemyNeighbors = 0;
    let friendlyNeighbors = 0;
    const neighbors = getNeighbors(size, liberty.x, liberty.y);
    const edgeNeighbors = 4 - neighbors.length;
    for (const neighbor of neighbors) {
      const value = board[keyOf(size, neighbor.x, neighbor.y)];
      if (value === opponent) enemyNeighbors += 1;
      else if (value === group.color) friendlyNeighbors += 1;
    }
    if (enemyNeighbors + edgeNeighbors >= 2 && enemyNeighbors >= friendlyNeighbors) pressured += 1;
  }
  return pressured;
}

function isObviousDead(group, board, size, regions, regionByPoint) {
  const liberties = group.liberties.length;
  if (liberties <= 1) return true;

  const eyes = eyeRegionsFor(group, regions, regionByPoint, size);
  if (eyes.size >= 2) return false;

  const adjacentRegions = enclosingRegionsFor(group, regions, regionByPoint, size);
  const openSpace = adjacentRegions.reduce((sum, region) => sum + region.points.length, 0);
  const hasWideEscape = adjacentRegions.some((region) => region.touchesEdge && region.points.length >= Math.max(7, group.stones.length * 2));
  if (hasWideEscape) return false;

  const pressure = pressureAroundLiberties(group, board, size);
  if (eyes.size === 0 && liberties === 2 && pressure === 2) return true;

  const compactPrison = openSpace <= Math.max(5, group.stones.length * 2 + 2);
  const everyRegionContested = adjacentRegions.length > 0 && adjacentRegions.every((region) => region.borderColors.has(other(group.color)));
  if (eyes.size === 0 && compactPrison && everyRegionContested && pressure >= Math.ceil(liberties * 0.6)) return true;

  return false;
}

export function suggestDeadGroups(game) {
  if (!game?.board || !game.size) return [];
  const groups = collectGroups(game.board, game.size);
  const { regions, regionByPoint } = collectRegions(game.board, game.size);
  const dead = [];

  for (const group of groups) {
    if (isObviousDead(group, game.board, game.size, regions, regionByPoint)) dead.push(...group.indices);
  }

  return [...new Set(dead)];
}
