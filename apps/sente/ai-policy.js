import { getGroup, inspectMove } from './go-engine.js';
import {
  EMPTY,
  INF,
  other,
  keyOf,
  openingPoints,
  analyzePosition,
  adjacentGroups,
  neighborhood,
  isEyeFill,
  openingBonus,
  stateAfterMove
} from './ai-core.js';

function collectCandidatePoints(game, analysis) {
  const { size, board } = game;
  const candidates = new Set();
  const add = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size && board[keyOf(size, x, y)] === EMPTY) candidates.add(keyOf(size, x, y));
  };
  for (const [x, y] of openingPoints(size)) add(x, y);
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2], [3, 0], [-3, 0], [0, 3], [0, -3],
    [3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[keyOf(size, x, y)] === EMPTY) continue;
      for (const [dx, dy] of offsets) add(x + dx, y + dy);
    }
  }
  for (const group of analysis.groups) {
    if (group.liberties.length <= 4) for (const liberty of group.liberties) add(liberty.x, liberty.y);
  }
  if (game.lastMove && !game.lastMove.pass) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) <= 5) add(game.lastMove.x + dx, game.lastMove.y + dy);
      }
    }
  }
  for (let key = 0; key < board.length; key += 1) {
    if (board[key] !== EMPTY) continue;
    const own = analysis.ownDistance[key];
    const enemy = analysis.enemyDistance[key];
    if (Math.abs(analysis.control[key]) < 0.5 && ((own >= 2 && own <= 6) || (enemy >= 2 && enemy <= 5))) candidates.add(key);
  }
  if (game.moveNumber < Math.max(5, Math.floor(size * 0.55))) {
    const lines = size === 19 ? [2, 3, 6, 9, 12, 15, 16] : size === 13 ? [2, 3, 6, 9, 10] : [1, 2, 4, 6, 7];
    for (const x of lines) for (const y of lines) add(x, y);
  }
  return [...candidates].map((key) => ({ x: key % size, y: Math.floor(key / size) }));
}

function scoreMove(game, point, inspection, color, analysis, includeStrategicDelta) {
  const opponent = other(color);
  const ownBefore = adjacentGroups(game, point.x, point.y, color);
  const enemyBefore = adjacentGroups(game, point.x, point.y, opponent);
  const ownAfter = getGroup(inspection.board, game.size, point.x, point.y);
  const pointKey = keyOf(game.size, point.x, point.y);
  const ownAdj = ownBefore.length;
  const enemyAdj = enemyBefore.length;
  const ownNear2 = neighborhood(game, point.x, point.y, color, 2);
  const enemyNear2 = neighborhood(game, point.x, point.y, opponent, 2);
  const nearestOwn = analysis.ownDistance[pointKey];
  const nearestEnemy = analysis.enemyDistance[pointKey];
  const region = analysis.regions[analysis.regionAt[pointKey]];
  let score = inspection.captured.length * 170;
  let urgent = inspection.captured.length > 0;
  let savedAtari = 0;
  let attackAtari = 0;

  for (const group of ownBefore) {
    if (group.liberties.length === 1) {
      score += 125 + group.stones.length * 24;
      savedAtari += group.stones.length;
      urgent = true;
    } else if (group.liberties.length === 2 && ownAfter.liberties.length >= 4) {
      score += 20 + group.stones.length * 3;
    }
  }
  for (const group of enemyBefore) {
    const anchor = group.stones[0];
    if (inspection.board[keyOf(game.size, anchor.x, anchor.y)] !== opponent) continue;
    const survivor = getGroup(inspection.board, game.size, anchor.x, anchor.y);
    if (survivor.liberties.length === 1) {
      score += 95 + survivor.stones.length * 20;
      attackAtari += survivor.stones.length;
      urgent = true;
    } else if (survivor.liberties.length === 2) {
      score += 25 + survivor.stones.length * 4;
    } else if (survivor.liberties.length < group.liberties.length) {
      score += 8 + (group.liberties.length - survivor.liberties.length) * 5;
    }
  }

  if (ownBefore.length > 1) score += 22 + (ownBefore.length - 2) * 12;
  if (enemyBefore.length > 1) score += 24 + (enemyBefore.length - 2) * 14;
  if (ownAfter.liberties.length === 1 && !inspection.captured.length) score -= 210 + ownAfter.stones.length * 14;
  else if (ownAfter.liberties.length === 2) score -= 35 + ownAfter.stones.length * 3;
  else score += Math.min(16, ownAfter.liberties.length * 2);

  const trueEye = isEyeFill(game, point.x, point.y, color);
  const deepOwnControl = nearestEnemy < INF && analysis.control[pointKey] > 0.62 && nearestEnemy >= nearestOwn + 3;
  const secureOwn = region?.secure && region.owner === color;
  const wasteful = !urgent && (trueEye || secureOwn || deepOwnControl);
  if (trueEye && !urgent) score -= 520;
  if (secureOwn && !urgent) score -= 420 + Math.min(120, region.points.length * 4);
  else if (deepOwnControl && !urgent) score -= 140 + analysis.control[pointKey] * 45;

  if (!urgent && enemyAdj === 0) {
    if (ownAdj > 0) score -= ownAdj * 30;
    if (ownAdj >= 2) score -= 55;
    if (ownNear2 > 2) score -= (ownNear2 - 2) * 9;
    if (nearestOwn === 1) score -= 42;
    else if (nearestOwn === 2) score += 4;
    else if (nearestOwn >= 3 && nearestOwn <= 6) score += 18;
  }
  if (enemyNear2 > 0 && nearestOwn >= 2 && ownAfter.liberties.length >= 3) score += 8 + Math.min(14, enemyNear2 * 3);

  const control = analysis.control[pointKey];
  if (Math.abs(control) < 0.24) score += 24;
  else if (control < -0.25 && control > -0.76 && ownAfter.liberties.length >= 3) score += 16;
  else if (control > 0.52 && !urgent) score -= 16;
  score += openingBonus(game, point.x, point.y, nearestOwn, ownAdj, enemyAdj);

  let strategicDelta = 0;
  if (includeStrategicDelta) {
    const child = stateAfterMove(game, { ...point, inspection }, color);
    if (child) {
      const childAnalysis = analyzePosition(child, color);
      strategicDelta = childAnalysis.value - analysis.value;
      const influenceExpansion = childAnalysis.territory - analysis.territory;
      score += strategicDelta * 2.5 + influenceExpansion * 3.4;
      if (!urgent && influenceExpansion < -0.6) score -= 18;
    }
  }
  return { score, urgent, wasteful, strategicDelta, captureCount: inspection.captured.length, savedAtari, attackAtari };
}

export function generateMoves(game, color, limit, includeStrategicDelta = true, includePass = true) {
  const analysis = analyzePosition(game, color);
  const moves = [];
  for (const point of collectCandidatePoints(game, analysis)) {
    const inspection = inspectMove(game, point.x, point.y, color);
    if (!inspection.legal) continue;
    const rated = scoreMove(game, point, inspection, color, analysis, includeStrategicDelta);
    if (rated.wasteful && !rated.urgent) continue;
    moves.push({ x: point.x, y: point.y, prior: rated.score, urgent: rated.urgent, wasteful: rated.wasteful, captureCount: rated.captureCount, savedAtari: rated.savedAtari, attackAtari: rated.attackAtari, inspection });
  }
  moves.sort((a, b) => b.prior - a.prior);
  const selected = moves.slice(0, limit);
  if (includePass) {
    const best = selected[0];
    const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
    const late = game.moveNumber > game.size * 1.55 || occupied / game.board.length > 0.38;
    const noGoodMove = !best || (!best.urgent && best.prior < (game.passes === 1 ? 18 : 3));
    if (game.passes === 1 && noGoodMove) selected.unshift({ pass: true, prior: best ? best.prior + 14 : 20, urgent: false, wasteful: false });
    else if (late && noGoodMove) selected.push({ pass: true, prior: best ? best.prior + 4 : 8, urgent: false, wasteful: false });
  }
  return selected;
}

export function chooseOpeningBookMove(game, rootMoves, level) {
  const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
  const limit = Math.max(5, Math.floor(game.size * 0.45));
  if (occupied >= limit || rootMoves.some((move) => move.urgent)) return null;
  const corner = game.size === 9 ? 2 : 3;
  const far = game.size - 1 - corner;
  const preferred = occupied < 4 ? [[corner, corner], [far, corner], [corner, far], [far, far]] : openingPoints(game.size);
  const anchors = new Set(preferred.map(([x, y]) => keyOf(game.size, x, y)));
  const candidates = rootMoves.filter((move) => !move.pass && anchors.has(keyOf(game.size, move.x, move.y)));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.prior - a.prior);
  const best = candidates[0].prior;
  const pool = candidates.filter((move) => move.prior >= best - (level === 'calm' ? 8 : 3)).slice(0, 4);
  return pool[Math.floor(Math.random() * pool.length)] || candidates[0];
}
