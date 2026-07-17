import {
  applyMove,
  cloneGame,
  findWinningPath,
  groupAt,
  legalMoves,
  neighbors,
  otherPlayer,
  rowCol,
  shortestPathCost
} from './engine.js';

function centerBias(index, size) {
  const [row, col] = rowCol(index, size);
  const center = (size - 1) / 2;
  return -(Math.abs(row - center) + Math.abs(col - center)) * 0.18;
}

function localContact(board, index, player, size) {
  let friendly = 0;
  let hostile = 0;
  for (const next of neighbors(index, size)) {
    if (board[next] === player) friendly += 1;
    else if (board[next] === otherPlayer(player)) hostile += 1;
  }
  return { friendly, hostile };
}

export function evaluateGame(game, player, style = 'adaptive') {
  if (game.winner === player) return 100000 - game.turn;
  if (game.winner === otherPlayer(player)) return -100000 + game.turn;
  const ownCost = shortestPathCost(game.board, player, game.size);
  const enemyCost = shortestPathCost(game.board, otherPlayer(player), game.size);
  const ownStones = game.board.filter((value) => value === player).length;
  const enemyStones = game.board.filter((value) => value === otherPlayer(player)).length;
  const captureLead = (game.captures[player] || 0) - (game.captures[otherPlayer(player)] || 0);
  const weights = {
    weave: { path: 15, block: 8, capture: 8, stones: 0.5 },
    cut: { path: 9, block: 9, capture: 18, stones: 0.2 },
    guard: { path: 10, block: 16, capture: 9, stones: 0.4 },
    adaptive: { path: 13, block: 13, capture: 12, stones: 0.35 }
  }[style] || { path: 13, block: 13, capture: 12, stones: 0.35 };
  return -ownCost * weights.path + enemyCost * weights.block + captureLead * weights.capture + (ownStones - enemyStones) * weights.stones;
}

export function rankMoves(game, player = game.currentPlayer, style = 'adaptive') {
  const beforeOwn = shortestPathCost(game.board, player, game.size);
  const beforeEnemy = shortestPathCost(game.board, otherPlayer(player), game.size);
  const ranked = [];

  for (const index of legalMoves(game, player)) {
    const next = cloneGame(game);
    next.currentPlayer = player;
    const result = applyMove(next, index);
    const afterOwn = shortestPathCost(next.board, player, next.size);
    const afterEnemy = shortestPathCost(next.board, otherPlayer(player), next.size);
    const contact = localContact(game.board, index, player, game.size);
    const group = groupAt(next.board, index, next.size);
    const immediateBlock = findWinningPath(next.board, otherPlayer(player), next.size).length ? -5000 : 0;
    const styleWeights = {
      weave: { path: 24, block: 10, capture: 10, contact: 1.5 },
      cut: { path: 12, block: 13, capture: 28, contact: 2.8 },
      guard: { path: 12, block: 25, capture: 13, contact: 2.0 },
      adaptive: { path: 19, block: 19, capture: 19, contact: 2.2 }
    }[style] || { path: 19, block: 19, capture: 19, contact: 2.2 };
    const score =
      (result.winner === player ? 100000 : 0) +
      (beforeOwn - afterOwn) * styleWeights.path +
      (afterEnemy - beforeEnemy) * styleWeights.block +
      result.captured.length * styleWeights.capture +
      group.liberties.length * 0.8 +
      contact.friendly * styleWeights.contact +
      contact.hostile * (style === 'cut' ? 2.8 : 1.2) +
      centerBias(index, game.size) +
      immediateBlock;
    ranked.push({ index, score, next });
  }

  return ranked.sort((a, b) => b.score - a.score);
}

function pickWeighted(ranked, width) {
  const pool = ranked.slice(0, Math.max(1, Math.min(width, ranked.length)));
  const roll = Math.random() ** 2;
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]?.index ?? null;
}

export function chooseMove(game, options = {}) {
  const difficulty = options.difficulty || 'club';
  const style = options.style || 'adaptive';
  const ranked = rankMoves(game, game.currentPlayer, style);
  if (!ranked.length) return null;
  if (difficulty === 'sparring') return pickWeighted(ranked, 8);
  if (difficulty === 'club') return pickWeighted(ranked, 3);

  const player = game.currentPlayer;
  const opponent = otherPlayer(player);
  let best = ranked[0];
  const candidates = ranked.slice(0, difficulty === 'master' ? 12 : 8);
  for (const candidate of candidates) {
    if (candidate.next.winner === player) return candidate.index;
    const replies = rankMoves(candidate.next, opponent, style).slice(0, difficulty === 'master' ? 10 : 6);
    const replyScore = replies.length
      ? Math.max(...replies.map((reply) => reply.score + evaluateGame(reply.next, opponent, style) * 0.25))
      : -500;
    const minimax = candidate.score - replyScore * 0.82 + evaluateGame(candidate.next, player, style) * 0.18;
    if (!best.minimax || minimax > best.minimax) best = { ...candidate, minimax };
  }
  return best.index;
}

export function shouldSwapOpening(game, style = 'adaptive') {
  if (game.moveHistory.length !== 1) return false;
  const opening = game.moveHistory[0].index;
  const [row, col] = rowCol(opening, game.size);
  const center = (game.size - 1) / 2;
  const distance = Math.abs(row - center) + Math.abs(col - center);
  const strength = 4.4 - distance + (style === 'weave' ? 0.35 : style === 'cut' ? 0.1 : 0.25);
  return strength > 2.35;
}
