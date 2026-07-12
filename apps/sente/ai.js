import {
  BLACK,
  WHITE,
  EMPTY,
  getGroup,
  getNeighbors,
  inspectMove,
  playMove
} from './go-engine.js';

const other = (color) => color === BLACK ? WHITE : BLACK;
const keyOf = (size, x, y) => y * size + x;
const now = () => globalThis.performance?.now?.() ?? Date.now();
const INF = 99;

const LEVELS = {
  calm: {
    budget: 110,
    roots: 8,
    replies: 0,
    continuations: 0,
    candidateLimit: 28,
    temperature: 4.5,
    randomness: 2.8
  },
  steady: {
    budget: 620,
    roots: 12,
    replies: 7,
    continuations: 0,
    candidateLimit: 42,
    temperature: 0.85,
    randomness: 0.55
  },
  sharp: {
    budget: 1450,
    roots: 16,
    replies: 9,
    continuations: 4,
    candidateLimit: 58,
    temperature: 0.12,
    randomness: 0.08
  }
};

function cloneForSearch(game, turn = game.turn) {
  const board = game.board.slice();
  return {
    size: game.size,
    komi: game.komi,
    board,
    turn,
    captures: { [BLACK]: game.captures?.[BLACK] || 0, [WHITE]: game.captures?.[WHITE] || 0 },
    passes: game.passes || 0,
    moveNumber: game.moveNumber || 0,
    lastMove: game.lastMove ? { ...game.lastMove } : null,
    result: null,
    phase: 'playing',
    moves: [],
    history: [Array.from(board)],
    hashes: Array.isArray(game.hashes) && game.hashes.length ? game.hashes.slice(-2) : [],
    dead: []
  };
}

function applyMove(game, move, color) {
  const next = cloneForSearch(game, color);
  const result = playMove(next, move.x, move.y);
  return result.legal ? next : null;
}

function openingPoints(size) {
  if (size === 9) return [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4], [2, 4], [6, 4], [4, 2], [4, 6]];
  if (size === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6], [3, 6], [9, 6], [6, 3], [6, 9]];
  return [[3, 3], [15, 3], [3, 15], [15, 15], [9, 9], [3, 9], [15, 9], [9, 3], [9, 15], [2, 3], [16, 3], [2, 15], [16, 15], [3, 2], [15, 2], [3, 16], [15, 16]];
}

function collectGroups(board, size) {
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
    const closure = boundaryStones.size + edgeSides.size * 1.3;
    const requiredClosure = 2.2 + Math.sqrt(points.length) * 1.05;
    const confidence = Math.min(1.6, closure / Math.max(1, requiredClosure));
    const secure = owner !== EMPTY && boundaryStones.size > 0 && confidence >= 1;
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
      if (region.secure && region.owner === group.color) eyes.add(regionId);
    }
  }
  return eyes.size;
}

function analyzePosition(game, perspective) {
  const { size, board } = game;
  const opponent = other(perspective);
  const { regions, regionAt } = analyzeRegions(board, size);
  const ownDistance = distanceField(board, size, perspective);
  const enemyDistance = distanceField(board, size, opponent);
  const control = new Float32Array(board.length);
  let territory = 0;

  for (let key = 0; key < board.length; key += 1) {
    if (board[key] !== EMPTY) continue;
    const region = regions[regionAt[key]];
    let pointControl = 0;
    if (region?.secure) {
      pointControl = region.owner === perspective ? 1 : -1;
    } else {
      const own = ownDistance[key];
      const enemy = enemyDistance[key];
      if (own < INF || enemy < INF) {
        if (own >= INF) pointControl = -0.92;
        else if (enemy >= INF) pointControl = 0.92;
        else pointControl = Math.tanh((enemy - own) / 2.15) * 0.78;
      }
      if (region?.owner === perspective) pointControl += 0.08 * Math.min(1, region.confidence);
      else if (region?.owner === opponent) pointControl -= 0.08 * Math.min(1, region.confidence);
      pointControl = Math.max(-1, Math.min(1, pointControl));
    }
    control[key] = pointControl;
    territory += Math.abs(pointControl) < 0.12 ? 0 : pointControl;
  }

  let groupHealth = 0;
  for (const group of collectGroups(board, size)) {
    const liberties = group.liberties.length;
    const stones = group.stones.length;
    const eyes = groupEyeCount(group, regions, regionAt, size);
    let value = 0;
    if (liberties === 1) value -= 42 + stones * 7.5;
    else if (liberties === 2) value -= 13 + stones * 1.8;
    else if (liberties === 3) value -= 1.5;
    else if (liberties === 4) value += 1;
    else value += Math.min(4, (liberties - 3) * 0.75);
    if (eyes >= 2) value += 22;
    else if (eyes === 1) value += 5.5;
    groupHealth += group.color === perspective ? value : -value;
  }

  const captureDifference = (game.captures?.[perspective] || 0) - (game.captures?.[opponent] || 0);
  const komi = perspective === WHITE ? game.komi : -game.komi;
  const value = territory * 2.35 + groupHealth + captureDifference * 9 + komi;
  return { value, territory, groupHealth, regions, regionAt, control, ownDistance, enemyDistance };
}

function collectCandidatePoints(game) {
  const { size, board, moveNumber } = game;
  const candidates = new Set();
  const add = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size && board[keyOf(size, x, y)] === EMPTY) {
      candidates.add(keyOf(size, x, y));
    }
  };

  for (const [x, y] of openingPoints(size)) add(x, y);

  let stones = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[keyOf(size, x, y)] === EMPTY) continue;
      stones += 1;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) <= 2) add(x + dx, y + dy);
        }
      }
    }
  }

  for (const group of collectGroups(board, size)) {
    for (const liberty of group.liberties) add(liberty.x, liberty.y);
  }

  if (stones < Math.max(4, Math.floor(size * 0.45)) || candidates.size < 16) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) add(x, y);
    }
  } else if (moveNumber < size) {
    const line = size === 19 ? [2, 3, 9, 15, 16] : size === 13 ? [2, 3, 6, 9, 10] : [1, 2, 4, 6, 7];
    for (const x of line) for (const y of line) add(x, y);
  }

  return [...candidates].map((key) => ({ x: key % size, y: Math.floor(key / size) }));
}

function adjacentGroups(game, x, y, color) {
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

function isEyeFill(game, x, y, color) {
  const neighbors = getNeighbors(game.size, x, y);
  if (!neighbors.length) return false;
  let friendlyOrEdge = 4 - neighbors.length;
  for (const neighbor of neighbors) {
    if (game.board[keyOf(game.size, neighbor.x, neighbor.y)] === color) friendlyOrEdge += 1;
  }
  return friendlyOrEdge === 4;
}

function openingShapeBonus(game, x, y) {
  const size = game.size;
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  let score = 0;
  if (game.moveNumber < Math.floor(size * 1.35)) {
    if (edge === 0) score -= 22;
    else if (edge === 1) score -= 8;
    else if (edge === 2) score += size === 9 ? 5 : 2.5;
    else if (edge === 3) score += size >= 13 ? 7 : 2;
    const star = openingPoints(size).some(([sx, sy]) => sx === x && sy === y);
    if (star) score += 8;
  }
  return score;
}

function moveHeuristic(game, point, inspection, color, analysis) {
  const opponent = other(color);
  const ownBefore = adjacentGroups(game, point.x, point.y, color);
  const enemyBefore = adjacentGroups(game, point.x, point.y, opponent);
  const ownAfter = getGroup(inspection.board, game.size, point.x, point.y);
  const pointKey = keyOf(game.size, point.x, point.y);
  const region = analysis.regions[analysis.regionAt[pointKey]];
  let score = inspection.captured.length * 118;
  let urgent = inspection.captured.length > 0;

  const saved = ownBefore.filter((group) => group.liberties.length === 1);
  if (saved.length) urgent = true;
  score += saved.reduce((sum, group) => sum + 82 + group.stones.length * 18, 0);

  for (const group of enemyBefore) {
    const anchor = group.stones[0];
    const stillAlive = inspection.board[keyOf(game.size, anchor.x, anchor.y)] === opponent;
    const survivor = stillAlive ? getGroup(inspection.board, game.size, anchor.x, anchor.y) : null;
    if (survivor?.liberties.length === 1) {
      score += 48 + survivor.stones.length * 12;
      urgent = true;
    } else if (survivor?.liberties.length === 2) {
      score += 10 + survivor.stones.length * 2.2;
    }
  }

  if (ownBefore.length > 1) score += (ownBefore.length - 1) * 15;
  if (enemyBefore.length > 1) score += (enemyBefore.length - 1) * 13;

  if (ownAfter.liberties.length === 1 && inspection.captured.length === 0) score -= 145 + ownAfter.stones.length * 10;
  else if (ownAfter.liberties.length === 2) score -= 20 + ownAfter.stones.length * 2;
  else score += Math.min(9, ownAfter.liberties.length * 1.35);

  let fillsOwnTerritory = false;
  if (!urgent && region?.owner === color && region.secure) {
    fillsOwnTerritory = true;
    score -= 210 + Math.min(80, region.points.length * 3);
  } else if (!urgent && analysis.control[pointKey] > 0.78 && analysis.enemyDistance[pointKey] >= 4) {
    score -= 30 + analysis.control[pointKey] * 18;
  }

  if (isEyeFill(game, point.x, point.y, color) && inspection.captured.length === 0) {
    fillsOwnTerritory = true;
    score -= 260;
  }

  if (region?.owner === opponent && region.secure) {
    if (ownAfter.liberties.length <= 2) score -= 95;
    else if (region.points.length >= 5) score += 9;
  }

  const control = analysis.control[pointKey];
  if (Math.abs(control) < 0.32) score += 9;
  else if (control < -0.45 && ownAfter.liberties.length >= 3) score += 7;
  else if (control > 0.7 && !urgent) score -= 7;

  score += openingShapeBonus(game, point.x, point.y);
  return { score, urgent, fillsOwnTerritory };
}

function rankedMoves(game, color, limit, profile, deadline) {
  const preliminary = [];
  const analysis = analyzePosition(game, color);
  for (const point of collectCandidatePoints(game)) {
    if (now() > deadline) break;
    const inspection = inspectMove(game, point.x, point.y, color);
    if (!inspection.legal) continue;
    const tactical = moveHeuristic(game, point, inspection, color, analysis);
    preliminary.push({ x: point.x, y: point.y, inspection, tacticalScore: tactical.score, urgent: tactical.urgent, fillsOwnTerritory: tactical.fillsOwnTerritory });
  }

  preliminary.sort((a, b) => b.tacticalScore - a.tacticalScore);
  const refined = preliminary.slice(0, Math.min(profile.candidateLimit, preliminary.length));
  for (const move of refined) {
    if (now() > deadline) {
      move.score = move.tacticalScore;
      continue;
    }
    const child = applyMove(game, move, color);
    if (!child) {
      move.score = -1000;
      continue;
    }
    const childValue = analyzePosition(child, color).value;
    move.strategicDelta = childValue - analysis.value;
    move.score = move.tacticalScore + move.strategicDelta * 3.15;
    move.score += (Math.random() - 0.5) * profile.randomness;
  }
  refined.sort((a, b) => b.score - a.score);
  return refined.slice(0, limit);
}

function finalizeMove(move) {
  return move ? {
    x: move.x,
    y: move.y,
    score: move.score,
    urgent: Boolean(move.urgent),
    fillsOwnTerritory: Boolean(move.fillsOwnTerritory)
  } : null;
}

function weightedPick(scored, temperature) {
  if (scored.length === 1 || temperature <= 0.15) return scored[0];
  const top = scored[0].score;
  const weights = scored.map((item) => Math.exp(Math.max(-24, (item.score - top) / temperature)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < scored.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return scored[i];
  }
  return scored[0];
}

async function yieldFrame() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function shouldPass(game, roots, chosen, level) {
  if (!chosen || chosen.urgent) return false;
  const occupied = game.board.reduce((sum, value) => sum + (value === EMPTY ? 0 : 1), 0);
  const occupiedRatio = occupied / game.board.length;
  const lateEnough = game.moveNumber > game.size * 1.7 || occupiedRatio > 0.42;
  const allWasteful = roots.slice(0, Math.min(5, roots.length)).every((move) => move.fillsOwnTerritory || move.score < -8);
  if (game.passes === 1 && (chosen.fillsOwnTerritory || chosen.score < (level === 'sharp' ? 1.5 : 3.5))) return true;
  if (lateEnough && (allWasteful || chosen.fillsOwnTerritory || chosen.score < -2)) return true;
  return false;
}

export async function chooseAiMove(game, level = 'steady') {
  const profile = LEVELS[level] || LEVELS.steady;
  const color = game.turn;
  const opponent = other(color);
  const deadline = now() + profile.budget;
  const sizeScale = game.size === 19 ? 0.75 : game.size === 13 ? 0.9 : 1;
  const rootLimit = Math.max(6, Math.round(profile.roots * sizeScale));
  const replyLimit = Math.max(4, Math.round(profile.replies * sizeScale));
  const continuationLimit = Math.max(3, Math.round(profile.continuations * sizeScale));
  const baseValue = analyzePosition(game, color).value;

  const roots = rankedMoves(game, color, rootLimit, profile, deadline);
  if (!roots.length) return null;

  if (profile.replies > 0) {
    let completed = 0;
    for (const root of roots) {
      if (now() > deadline) break;
      const child = applyMove(game, root, color);
      if (!child) continue;
      const replies = rankedMoves(child, opponent, replyLimit, profile, deadline);
      if (!replies.length) {
        root.score += (analyzePosition(child, color).value - baseValue) * 1.4;
        completed += 1;
        continue;
      }

      let worstReply = Infinity;
      for (const reply of replies) {
        if (now() > deadline) break;
        const replyState = applyMove(child, reply, opponent);
        if (!replyState) continue;
        let replyValue = analyzePosition(replyState, color).value - baseValue;

        if (profile.continuations > 0 && now() < deadline) {
          const continuations = rankedMoves(replyState, color, continuationLimit, profile, deadline);
          let bestContinuation = replyValue;
          for (const continuation of continuations) {
            if (now() > deadline) break;
            const continuationState = applyMove(replyState, continuation, color);
            if (!continuationState) continue;
            const continuationValue = analyzePosition(continuationState, color).value - baseValue;
            bestContinuation = Math.max(bestContinuation, continuationValue);
          }
          replyValue = bestContinuation;
        }

        worstReply = Math.min(worstReply, replyValue);
      }

      if (Number.isFinite(worstReply)) root.score = root.tacticalScore * 0.34 + worstReply * 3.05;
      completed += 1;
      if (completed % 2 === 0) await yieldFrame();
    }
    roots.sort((a, b) => b.score - a.score);
  }

  const pool = level === 'sharp' ? roots.slice(0, 2) : roots.slice(0, Math.min(3, roots.length));
  const chosen = weightedPick(pool, profile.temperature);
  if (shouldPass(game, roots, chosen, level)) return null;
  return finalizeMove(chosen);
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
