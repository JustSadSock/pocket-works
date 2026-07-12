import { BLACK, WHITE, EMPTY, cloneGame, getGroup, getNeighbors, inspectMove, legalMoves, playMove } from './go-engine.js';

const other = (color) => color === BLACK ? WHITE : BLACK;
const keyOf = (size, x, y) => y * size + x;

function localShapeScore(game, move, color) {
  const size = game.size;
  const center = (size - 1) / 2;
  const distance = Math.hypot(move.x - center, move.y - center) / center;
  let score = move.captured.length * 36;
  score += Math.min(move.ownLiberties, 6) * 1.5;
  score += (1 - Math.min(1, distance)) * (game.moveNumber < size ? 4 : 1.2);

  let friends = 0;
  let enemies = 0;
  let endangeredFriends = 0;
  for (const neighbor of getNeighbors(size, move.x, move.y)) {
    const value = game.board[keyOf(size, neighbor.x, neighbor.y)];
    if (value === color) {
      friends += 1;
      const group = getGroup(game.board, size, neighbor.x, neighbor.y);
      if (group.liberties.length === 1) endangeredFriends += group.stones.length;
    } else if (value === other(color)) enemies += 1;
  }
  score += friends * 2.2 + enemies * 1.4 + endangeredFriends * 7;

  const edgeDistance = Math.min(move.x, move.y, size - 1 - move.x, size - 1 - move.y);
  if (game.moveNumber < Math.floor(size * 1.5)) {
    if (edgeDistance === 0) score -= 5;
    if (edgeDistance === 1) score -= 1.5;
    if (edgeDistance === 2) score += 2.5;
  }

  const ownGroup = getGroup(move.board, size, move.x, move.y);
  if (ownGroup.liberties.length === 1 && move.captured.length === 0) score -= 16;
  if (ownGroup.liberties.length === 2) score -= 2;
  score += Math.random() * 2.4;
  return score;
}

function estimateReplyDanger(game, move, color) {
  const simulated = cloneGame(game);
  simulated.turn = color;
  const placed = playMove(simulated, move.x, move.y);
  if (!placed.legal) return 100;
  const group = getGroup(simulated.board, simulated.size, move.x, move.y);
  if (group.liberties.length === 0) return 100;
  if (group.liberties.length >= 3) return 0;
  const opponent = other(color);
  let danger = group.liberties.length === 1 ? group.stones.length * 15 : group.stones.length * 2.5;
  for (const liberty of group.liberties) {
    const reply = inspectMove(simulated, liberty.x, liberty.y, opponent);
    if (reply.legal && reply.captured.some((stone) => stone.x === move.x && stone.y === move.y)) {
      danger = Math.max(danger, reply.captured.length * 15);
    }
  }
  return danger;
}

function weightedPick(scored, temperature) {
  const top = Math.max(...scored.map((item) => item.score));
  const weights = scored.map((item) => Math.exp((item.score - top) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < scored.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return scored[i];
  }
  return scored[0];
}

export async function chooseAiMove(game, level = 'steady') {
  const color = game.turn;
  const moves = legalMoves(game, color);
  if (!moves.length) return null;

  const scored = moves.map((move) => ({ ...move, score: localShapeScore(game, move, color) }));
  scored.sort((a, b) => b.score - a.score);

  if (level === 'calm') {
    const pool = scored.slice(0, Math.max(8, Math.floor(scored.length * 0.35)));
    return weightedPick(pool, 8);
  }

  if (level === 'sharp') {
    const candidates = scored.slice(0, Math.min(16, scored.length));
    for (const candidate of candidates) {
      candidate.score -= estimateReplyDanger(game, candidate, color);
      const key = keyOf(game.size, candidate.x, candidate.y);
      if (candidate.board[key] === EMPTY) candidate.score -= 100;
    }
    candidates.sort((a, b) => b.score - a.score);
    return weightedPick(candidates.slice(0, 5), 2.6);
  }

  return weightedPick(scored.slice(0, Math.min(10, scored.length)), 4.2);
}

export function aiLabel(level) {
  if (level === 'calm') return 'Спокойный';
  if (level === 'sharp') return 'Острый';
  return 'Собранный';
}
