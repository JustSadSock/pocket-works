import {
  COBALT,
  VERMILION,
  applyMove,
  connectionCost,
  countPieces,
  encodeBoard,
  findConnection,
  listMoves,
  resolveWinner
} from './game-core.js';

const WIN_SCORE = 100000;

function opponentOf(player) {
  return player === VERMILION ? COBALT : VERMILION;
}

function positionalScore(board, player) {
  const opponent = opponentOf(player);
  const ownCost = connectionCost(board, player);
  const opponentCost = connectionCost(board, opponent);
  const material = countPieces(board, player) - countPieces(board, opponent);
  const center = board[2][2] === player ? 8 : board[2][2] === opponent ? -8 : 0;
  let edgePressure = 0;

  for (let index = 0; index < 5; index += 1) {
    if (player === VERMILION) {
      if (board[index][0] === player) edgePressure += 2;
      if (board[index][4] === player) edgePressure += 4;
      if (board[index][0] === opponent) edgePressure -= 4;
      if (board[index][4] === opponent) edgePressure -= 2;
    } else {
      if (board[0][index] === player) edgePressure += 2;
      if (board[4][index] === player) edgePressure += 4;
      if (board[0][index] === opponent) edgePressure -= 4;
      if (board[4][index] === opponent) edgePressure -= 2;
    }
  }

  return (opponentCost - ownCost) * 92 + material * 5 + center + edgePressure;
}

function terminalScore(board, mover, aiColor, depthRemaining) {
  const winner = resolveWinner(board, mover);
  if (!winner) return null;
  const tempo = depthRemaining * 80;
  return winner.player === aiColor ? WIN_SCORE + tempo : -WIN_SCORE - tempo;
}

function rankMoves(board, moves, player, aiColor) {
  return moves
    .map((move) => {
      const next = applyMove(board, move, player).board;
      const terminal = terminalScore(next, player, aiColor, 0);
      const score = terminal ?? positionalScore(next, aiColor);
      return { move, score };
    })
    .sort((a, b) => player === aiColor ? b.score - a.score : a.score - b.score);
}

function search(board, activeColor, previousMove, depth, alpha, beta, aiColor, cache) {
  const key = `${encodeBoard(board)}|${activeColor}|${previousMove?.side ?? '-'}${previousMove?.index ?? '-'}|${depth}`;
  if (cache.has(key)) return cache.get(key);

  if (depth <= 0) {
    const score = positionalScore(board, aiColor);
    cache.set(key, score);
    return score;
  }

  const moves = listMoves(previousMove);
  const ranked = rankMoves(board, moves, activeColor, aiColor);
  const limit = depth >= 2 ? 14 : ranked.length;
  const candidates = ranked.slice(0, limit);
  const maximizing = activeColor === aiColor;
  let best = maximizing ? -Infinity : Infinity;

  for (const candidate of candidates) {
    const next = applyMove(board, candidate.move, activeColor).board;
    const terminal = terminalScore(next, activeColor, aiColor, depth);
    const score = terminal ?? search(
      next,
      opponentOf(activeColor),
      candidate.move,
      depth - 1,
      alpha,
      beta,
      aiColor,
      cache
    );

    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }

  cache.set(key, best);
  return best;
}

export function chooseMove({ board, aiColor, previousMove = null, difficulty = 'tactician' }) {
  const depth = difficulty === 'predator' ? 3 : difficulty === 'tactician' ? 2 : 1;
  const cache = new Map();
  const moves = listMoves(previousMove);
  const ranked = rankMoves(board, moves, aiColor, aiColor);
  let bestMove = ranked[0]?.move ?? moves[0];
  let bestScore = -Infinity;

  for (const candidate of ranked) {
    const next = applyMove(board, candidate.move, aiColor).board;
    const terminal = terminalScore(next, aiColor, aiColor, depth);
    const score = terminal ?? search(
      next,
      opponentOf(aiColor),
      candidate.move,
      depth - 1,
      -Infinity,
      Infinity,
      aiColor,
      cache
    );

    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate.move;
    }
  }

  if (difficulty === 'cadet' && ranked.length > 2) {
    const safeAlternatives = ranked.filter(({ score }) => score > -WIN_SCORE / 2).slice(0, 4);
    const index = Math.min(safeAlternatives.length - 1, 1);
    return safeAlternatives[index]?.move ?? bestMove;
  }

  return bestMove;
}

export function shouldSwapAfterOpening(board, openingMove, difficulty = 'tactician') {
  if (difficulty === 'cadet') return false;
  const redCost = connectionCost(board, VERMILION);
  const blueCost = connectionCost(board, COBALT);
  const centerBias = openingMove.index === 2 ? 1 : 0;
  return redCost + centerBias < blueCost;
}

export function describeThreat(board, player) {
  if (findConnection(board, player)) return 'цепь замкнута';
  const cost = connectionCost(board, player);
  if (cost <= 1) return 'один сдвиг до соединения';
  if (cost === 2) return 'двойная угроза';
  return cost === Infinity ? 'маршрут разорван' : `нужно ${cost} пустых клетки`;
}
