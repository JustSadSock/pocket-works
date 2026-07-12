import {
  BLACK,
  WHITE,
  EMPTY,
  getGroup,
  getNeighbors,
  inspectMove,
  playMove,
  scoreGame
} from './go-engine.js';

const other = (color) => color === BLACK ? WHITE : BLACK;
const keyOf = (size, x, y) => y * size + x;
const now = () => globalThis.performance?.now?.() ?? Date.now();

const LEVELS = {
  calm: {
    budget: 90,
    roots: 8,
    replies: 0,
    continuations: 0,
    candidateLimit: 28,
    temperature: 7,
    randomness: 4.5
  },
  steady: {
    budget: 520,
    roots: 11,
    replies: 6,
    continuations: 0,
    candidateLimit: 38,
    temperature: 1.5,
    randomness: 1.2
  },
  sharp: {
    budget: 1150,
    roots: 15,
    replies: 8,
    continuations: 4,
    candidateLimit: 52,
    temperature: 0.25,
    randomness: 0.25
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

function influenceScore(board, size, perspective) {
  const influence = new Float32Array(board.length);
  const weights = [0, 4.4, 2.3, 1.2, 0.55];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = board[keyOf(size, x, y)];
      if (color === EMPTY) continue;
      const value = color === perspective ? 1 : -1;
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance < 1 || distance > 4) continue;
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const pointKey = keyOf(size, px, py);
          if (board[pointKey] === EMPTY) influence[pointKey] += value * weights[distance];
        }
      }
    }
  }

  let score = 0;
  for (let i = 0; i < influence.length; i += 1) {
    if (board[i] !== EMPTY) continue;
    if (influence[i] > 1.1) score += Math.min(1.6, influence[i] * 0.16);
    else if (influence[i] < -1.1) score -= Math.min(1.6, -influence[i] * 0.16);
  }
  return score;
}

function groupHealthScore(board, size, perspective) {
  let score = 0;
  for (const group of collectGroups(board, size)) {
    const multiplier = group.color === perspective ? 1 : -1;
    const liberties = group.liberties.length;
    const stones = group.stones.length;
    let value = Math.min(liberties, 6) * 1.8 + Math.sqrt(stones) * 1.4;
    if (liberties === 1) value -= 18 + stones * 5.5;
    else if (liberties === 2) value -= 5 + stones * 1.25;
    else if (liberties >= 5) value += Math.min(5, stones * 0.45);
    score += value * multiplier;
  }
  return score;
}

function territoryEstimate(game, perspective) {
  const result = scoreGame({ ...game, dead: [] });
  const difference = result.black - result.white;
  return perspective === BLACK ? difference : -difference;
}

function evaluatePosition(game, perspective) {
  let blackStones = 0;
  let whiteStones = 0;
  for (const value of game.board) {
    if (value === BLACK) blackStones += 1;
    else if (value === WHITE) whiteStones += 1;
  }
  const stoneDifference = perspective === BLACK ? blackStones - whiteStones : whiteStones - blackStones;
  const captureDifference = perspective === BLACK
    ? (game.captures[BLACK] || 0) - (game.captures[WHITE] || 0)
    : (game.captures[WHITE] || 0) - (game.captures[BLACK] || 0);

  return stoneDifference * 1.7
    + captureDifference * 4.8
    + groupHealthScore(game.board, game.size, perspective)
    + influenceScore(game.board, game.size, perspective)
    + territoryEstimate(game, perspective) * 1.15;
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

function nearestStoneDistance(game, x, y) {
  let best = Infinity;
  for (let py = 0; py < game.size; py += 1) {
    for (let px = 0; px < game.size; px += 1) {
      if (game.board[keyOf(game.size, px, py)] === EMPTY) continue;
      best = Math.min(best, Math.abs(px - x) + Math.abs(py - y));
    }
  }
  return best;
}

function openingShapeBonus(game, x, y) {
  const size = game.size;
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  let score = 0;
  if (game.moveNumber < Math.floor(size * 1.3)) {
    if (edge === 0) score -= 18;
    else if (edge === 1) score -= 7;
    else if (edge === 2) score += size === 9 ? 5 : 2.5;
    else if (edge === 3) score += size >= 13 ? 6.5 : 2;
    const star = openingPoints(size).some(([sx, sy]) => sx === x && sy === y);
    if (star) score += 8;
  }
  return score;
}

function moveHeuristic(game, point, inspection, color) {
  const opponent = other(color);
  const ownBefore = adjacentGroups(game, point.x, point.y, color);
  const enemyBefore = adjacentGroups(game, point.x, point.y, opponent);
  const ownAfter = getGroup(inspection.board, game.size, point.x, point.y);
  let score = inspection.captured.length * 62;

  const saved = ownBefore.filter((group) => group.liberties.length === 1);
  score += saved.reduce((sum, group) => sum + 26 + group.stones.length * 7, 0);

  let threatened = 0;
  for (const group of enemyBefore) {
    const survivor = inspection.board[keyOf(game.size, group.stones[0].x, group.stones[0].y)] === opponent
      ? getGroup(inspection.board, game.size, group.stones[0].x, group.stones[0].y)
      : null;
    if (survivor?.liberties.length === 1) threatened += 16 + survivor.stones.length * 4.5;
    else if (survivor?.liberties.length === 2) threatened += 4 + survivor.stones.length * 0.8;
  }
  score += threatened;

  if (ownBefore.length > 1) score += (ownBefore.length - 1) * 10;
  if (enemyBefore.length > 1) score += (enemyBefore.length - 1) * 7;

  if (ownAfter.liberties.length === 1 && inspection.captured.length === 0) score -= 52 + ownAfter.stones.length * 7;
  else if (ownAfter.liberties.length === 2) score -= 9 + ownAfter.stones.length * 1.2;
  else score += Math.min(8, ownAfter.liberties.length * 1.4);

  if (isEyeFill(game, point.x, point.y, color) && inspection.captured.length === 0) score -= 38;
  score += openingShapeBonus(game, point.x, point.y);

  if (game.moveNumber > game.size * 0.75) {
    const distance = nearestStoneDistance(game, point.x, point.y);
    if (distance === 1) score += 4;
    else if (distance === 2) score += 2;
    else if (distance >= 5) score -= 8;
  }

  const center = (game.size - 1) / 2;
  score += (1 - Math.min(1, Math.hypot(point.x - center, point.y - center) / Math.max(1, center))) * (game.moveNumber < game.size ? 1.8 : 0.4);
  return score;
}

function rankedMoves(game, color, limit, profile, deadline) {
  const preliminary = [];
  for (const point of collectCandidatePoints(game)) {
    if (now() > deadline) break;
    const inspection = inspectMove(game, point.x, point.y, color);
    if (!inspection.legal) continue;
    preliminary.push({
      x: point.x,
      y: point.y,
      inspection,
      tactical: moveHeuristic(game, point, inspection, color)
    });
  }

  preliminary.sort((a, b) => b.tactical - a.tactical);
  const refined = preliminary.slice(0, Math.min(profile.candidateLimit, preliminary.length));
  for (const move of refined) {
    if (now() > deadline) {
      move.score = move.tactical;
      continue;
    }
    const child = applyMove(game, move, color);
    move.score = move.tactical + (child ? evaluatePosition(child, color) * 0.55 : -1000);
    move.score += (Math.random() - 0.5) * profile.randomness;
  }
  refined.sort((a, b) => b.score - a.score);
  return refined.slice(0, limit);
}

function finalizeMove(move) {
  return move ? { ...move, score: move.tactical } : null;
}

function weightedPick(scored, temperature) {
  if (scored.length === 1 || temperature <= 0.3) return scored[0];
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

export async function chooseAiMove(game, level = 'steady') {
  const profile = LEVELS[level] || LEVELS.steady;
  const color = game.turn;
  const opponent = other(color);
  const deadline = now() + profile.budget;
  const sizeScale = game.size === 19 ? 0.76 : game.size === 13 ? 0.9 : 1;
  const rootLimit = Math.max(6, Math.round(profile.roots * sizeScale));
  const replyLimit = Math.max(4, Math.round(profile.replies * sizeScale));
  const continuationLimit = Math.max(3, Math.round(profile.continuations * sizeScale));

  const roots = rankedMoves(game, color, rootLimit, profile, deadline);
  if (!roots.length) return null;
  if (profile.replies === 0) return finalizeMove(weightedPick(roots.slice(0, Math.min(6, roots.length)), profile.temperature));

  let completed = 0;
  for (const root of roots) {
    if (now() > deadline) break;
    const child = applyMove(game, root, color);
    if (!child) continue;
    const replies = rankedMoves(child, opponent, replyLimit, profile, deadline);
    if (!replies.length) {
      root.score += evaluatePosition(child, color) * 0.9;
      completed += 1;
      continue;
    }

    let worstReply = Infinity;
    for (const reply of replies) {
      if (now() > deadline) break;
      const replyState = applyMove(child, reply, opponent);
      if (!replyState) continue;
      let replyValue = evaluatePosition(replyState, color);

      if (profile.continuations > 0 && now() < deadline) {
        const continuations = rankedMoves(replyState, color, continuationLimit, profile, deadline);
        let bestContinuation = replyValue;
        for (const continuation of continuations) {
          if (now() > deadline) break;
          const continuationState = applyMove(replyState, continuation, color);
          if (!continuationState) continue;
          bestContinuation = Math.max(bestContinuation, evaluatePosition(continuationState, color) + continuation.tactical * 0.18);
        }
        replyValue = bestContinuation;
      }

      worstReply = Math.min(worstReply, replyValue - reply.tactical * 0.12);
    }

    if (Number.isFinite(worstReply)) root.score = root.score * 0.28 + worstReply * 0.72;
    completed += 1;
    if (completed % 2 === 0) await yieldFrame();
  }

  roots.sort((a, b) => b.score - a.score);
  const pool = level === 'sharp' ? roots.slice(0, 2) : roots.slice(0, Math.min(3, roots.length));
  return finalizeMove(weightedPick(pool, profile.temperature));
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
