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

  const localOffsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2], [3, 0], [-3, 0], [0, 3], [0, -3],
    [3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[keyOf(size, x, y)] === EMPTY) continue;
      for (const [dx, dy] of localOffsets) add(x + dx, y + dy);
    }
  }

  for (const group of analysis.groups) {
    if (group.liberties.length <= 5) {
      for (const liberty of group.liberties) add(liberty.x, liberty.y);
    }
  }

  if (game.lastMove && !game.lastMove.pass) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) <= 5) add(game.lastMove.x + dx, game.lastMove.y + dy);
      }
    }
  }

  const step = size === 19 ? 4 : size === 13 ? 3 : 2;
  const inset = size === 9 ? 1 : 2;
  for (let y = inset; y < size - inset; y += step) {
    for (let x = inset; x < size - inset; x += step) {
      const key = keyOf(size, x, y);
      if (board[key] !== EMPTY) continue;
      const own = analysis.ownDistance[key];
      const enemy = analysis.enemyDistance[key];
      if (Math.abs(analysis.control[key]) < 0.62 || (own >= 3 && own <= 7) || (enemy >= 3 && enemy <= 7)) add(x, y);
    }
  }

  for (let key = 0; key < board.length; key += 1) {
    if (board[key] !== EMPTY) continue;
    const own = analysis.ownDistance[key];
    const enemy = analysis.enemyDistance[key];
    const control = analysis.control[key];
    if (Math.abs(control) < 0.48 && own >= 2 && own <= 7 && enemy >= 2 && enemy <= 7) candidates.add(key);
    if (own >= 3 && own <= 6 && enemy >= 3 && enemy <= 8) candidates.add(key);
  }

  if (game.moveNumber < Math.max(6, Math.floor(size * 0.65))) {
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
  const ownNear3 = neighborhood(game, point.x, point.y, color, 3);
  const enemyNear3 = neighborhood(game, point.x, point.y, opponent, 3);
  const nearestOwn = analysis.ownDistance[pointKey];
  const nearestEnemy = analysis.enemyDistance[pointKey];
  const region = analysis.regions[analysis.regionAt[pointKey]];
  const edge = Math.min(point.x, point.y, game.size - 1 - point.x, game.size - 1 - point.y);
  let score = inspection.captured.length * 175;
  let urgent = inspection.captured.length > 0;
  let savedAtari = 0;
  let attackAtari = 0;

  for (const group of ownBefore) {
    if (group.liberties.length === 1) {
      score += 135 + group.stones.length * 26;
      savedAtari += group.stones.length;
      urgent = true;
    } else if (group.liberties.length === 2 && ownAfter.liberties.length >= 4) {
      score += 24 + group.stones.length * 3;
    }
  }

  for (const group of enemyBefore) {
    const anchor = group.stones[0];
    if (inspection.board[keyOf(game.size, anchor.x, anchor.y)] !== opponent) continue;
    const survivor = getGroup(inspection.board, game.size, anchor.x, anchor.y);
    if (survivor.liberties.length === 1) {
      score += 105 + survivor.stones.length * 22;
      attackAtari += survivor.stones.length;
      urgent = true;
    } else if (survivor.liberties.length === 2) {
      score += 29 + survivor.stones.length * 4;
    } else if (survivor.liberties.length < group.liberties.length) {
      score += 10 + (group.liberties.length - survivor.liberties.length) * 6;
    }
  }

  if (ownBefore.length > 1) score += 24 + (ownBefore.length - 2) * 12;
  if (enemyBefore.length > 1) score += 27 + (enemyBefore.length - 2) * 15;
  if (ownAfter.liberties.length === 1 && !inspection.captured.length) score -= 230 + ownAfter.stones.length * 15;
  else if (ownAfter.liberties.length === 2) score -= 42 + ownAfter.stones.length * 3;
  else score += Math.min(18, ownAfter.liberties.length * 2.2);

  const trueEye = isEyeFill(game, point.x, point.y, color);
  const deepOwnControl = nearestEnemy < INF && analysis.control[pointKey] > 0.58 && nearestEnemy >= nearestOwn + 3;
  const secureOwn = region?.secure && region.owner === color;
  const selfCluster = !urgent
    && enemyNear3 === 0
    && nearestEnemy >= 4
    && ((ownAdj >= 1 && ownNear2 >= 2) || ownNear2 >= 4 || (ownAdj >= 2 && ownNear3 >= 3));
  const wasteful = !urgent && (trueEye || secureOwn || deepOwnControl || selfCluster);

  if (trueEye && !urgent) score -= 650;
  if (secureOwn && !urgent) score -= 520 + Math.min(150, region.points.length * 5);
  else if (deepOwnControl && !urgent) score -= 185 + analysis.control[pointKey] * 55;
  if (selfCluster) score -= 310 + ownNear2 * 24 + ownAdj * 35;

  if (!urgent && enemyAdj === 0) {
    if (ownAdj > 0) score -= ownAdj * 38;
    if (ownAdj >= 2) score -= 75;
    if (ownNear2 > 2) score -= (ownNear2 - 2) * 16;
    if (nearestOwn === 1) score -= 75;
    else if (nearestOwn === 2) score += 3;
    else if (nearestOwn >= 3 && nearestOwn <= 6) score += 30;
    else if (nearestOwn >= 7 && nearestOwn < INF) score += 8;
  }

  if (enemyNear2 > 0 && nearestOwn >= 2 && ownAfter.liberties.length >= 3) score += 12 + Math.min(20, enemyNear2 * 4);
  if (enemyNear3 > 0 && enemyNear2 === 0 && nearestOwn >= 3 && nearestOwn <= 6) score += 15;

  const control = analysis.control[pointKey];
  if (Math.abs(control) < 0.24) score += 31;
  else if (control < -0.25 && control > -0.76 && ownAfter.liberties.length >= 3) score += 20;
  else if (control > 0.52 && !urgent) score -= 22;

  if (!urgent && ownAdj === 0 && nearestOwn >= 3 && nearestOwn <= 6) score += 22;
  if (!urgent && ownAdj === 1 && enemyNear3 > 0 && ownAfter.liberties.length >= 4) score += 9;
  if (!urgent && ownAdj >= 1 && enemyNear3 === 0) score -= 20 + ownAdj * 14;

  score += openingBonus(game, point.x, point.y, nearestOwn, ownAdj, enemyAdj);

  let strategicDelta = 0;
  if (includeStrategicDelta) {
    const child = stateAfterMove(game, { ...point, inspection }, color);
    if (child) {
      const childAnalysis = analyzePosition(child, color);
      strategicDelta = childAnalysis.value - analysis.value;
      const influenceExpansion = childAnalysis.territory - analysis.territory;
      const secureExpansion = childAnalysis.secureTerritory - analysis.secureTerritory;
      score += strategicDelta * 2.7 + influenceExpansion * 4.1 + secureExpansion * 1.8;
      if (!urgent && influenceExpansion < -0.45) score -= 25;
      if (!urgent && secureExpansion < -0.5) score -= 18;
    }
  }

  return {
    score,
    urgent,
    wasteful,
    strategicDelta,
    captureCount: inspection.captured.length,
    savedAtari,
    attackAtari,
    features: {
      ownAdj,
      enemyAdj,
      ownNear2,
      enemyNear2,
      ownNear3,
      enemyNear3,
      nearestOwn,
      nearestEnemy,
      liberties: ownAfter.liberties.length,
      edge,
      control
    }
  };
}

export function generateMoves(game, color, limit, includeStrategicDelta = true, includePass = true) {
  const analysis = analyzePosition(game, color);
  const moves = [];
  for (const point of collectCandidatePoints(game, analysis)) {
    const inspection = inspectMove(game, point.x, point.y, color);
    if (!inspection.legal) continue;
    const rated = scoreMove(game, point, inspection, color, analysis, includeStrategicDelta);
    if (rated.wasteful && !rated.urgent) continue;
    moves.push({
      x: point.x,
      y: point.y,
      prior: rated.score,
      urgent: rated.urgent,
      wasteful: rated.wasteful,
      captureCount: rated.captureCount,
      savedAtari: rated.savedAtari,
      attackAtari: rated.attackAtari,
      strategicDelta: rated.strategicDelta,
      features: rated.features,
      inspection
    });
  }

  moves.sort((a, b) => b.prior - a.prior);
  const selected = moves.slice(0, limit);
  if (includePass) {
    const best = selected[0];
    const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
    const late = game.moveNumber > game.size * 1.5 || occupied / game.board.length > 0.36;
    const noGoodMove = !best || (!best.urgent && best.prior < (game.passes === 1 ? 22 : 5));
    if (game.passes === 1 && noGoodMove) selected.unshift({ pass: true, prior: best ? best.prior + 16 : 24, urgent: false, wasteful: false });
    else if (late && noGoodMove) selected.push({ pass: true, prior: best ? best.prior + 5 : 10, urgent: false, wasteful: false });
  }
  return selected;
}
