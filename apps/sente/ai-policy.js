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
  influenceDelta,
  openingBonus,
  stateAfterMove
} from './ai-core.js';
import { styleForColor, recentOpeningPenalty } from './ai-adaptation.js';

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
    [3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3],
    [4, 0], [-4, 0], [0, 4], [0, -4]
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[keyOf(size, x, y)] === EMPTY) continue;
      for (const [dx, dy] of offsets) add(x + dx, y + dy);
    }
  }
  for (const group of analysis.groups) {
    if (group.liberties.length <= 5) for (const liberty of group.liberties) add(liberty.x, liberty.y);
  }
  if (game.lastMove && !game.lastMove.pass) {
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) <= 6) add(game.lastMove.x + dx, game.lastMove.y + dy);
      }
    }
  }
  for (let key = 0; key < board.length; key += 1) {
    if (board[key] !== EMPTY) continue;
    const own = analysis.ownDistance[key];
    const enemy = analysis.enemyDistance[key];
    const control = analysis.control[key];
    if (Math.abs(control) < 0.48 && ((own >= 2 && own <= 7) || (enemy >= 2 && enemy <= 6))) candidates.add(key);
    if (control < -0.22 && control > -0.78 && own >= 2 && enemy <= 5) candidates.add(key);
  }
  if (game.moveNumber < Math.max(7, Math.floor(size * 0.75))) {
    const lines = size === 19 ? [2, 3, 6, 9, 12, 15, 16] : size === 13 ? [2, 3, 6, 9, 10] : [1, 2, 4, 6, 7];
    for (const x of lines) for (const y of lines) add(x, y);
  }
  return [...candidates].map((key) => ({ x: key % size, y: Math.floor(key / size) }));
}

function distanceToLastMove(game, point) {
  if (!game.lastMove || game.lastMove.pass) return game.size;
  return Math.abs(point.x - game.lastMove.x) + Math.abs(point.y - game.lastMove.y);
}

function scoreMove(game, point, inspection, color, analysis, includeStrategicDelta, context) {
  const opponent = other(color);
  const style = styleForColor(context, color);
  const ownBefore = adjacentGroups(game, point.x, point.y, color);
  const enemyBefore = adjacentGroups(game, point.x, point.y, opponent);
  const ownAfter = getGroup(inspection.board, game.size, point.x, point.y);
  const pointKey = keyOf(game.size, point.x, point.y);
  const ownAdj = ownBefore.length;
  const enemyAdj = enemyBefore.length;
  const ownNear1 = neighborhood(game, point.x, point.y, color, 1);
  const ownNear2 = neighborhood(game, point.x, point.y, color, 2);
  const enemyNear2 = neighborhood(game, point.x, point.y, opponent, 2);
  const nearestOwn = analysis.ownDistance[pointKey];
  const nearestEnemy = analysis.enemyDistance[pointKey];
  const region = analysis.regions[analysis.regionAt[pointKey]];
  const beforeControl = analysis.control[pointKey];
  let score = inspection.captured.length * 190;
  let urgent = inspection.captured.length > 0;
  let savedAtari = 0;
  let attackAtari = 0;
  let connection = 0;
  let frontierGain = 0;
  let claimed = 0;
  let reduced = 0;
  let shapeDelta = 0;

  for (const group of ownBefore) {
    if (group.liberties.length === 1) {
      score += 150 + group.stones.length * 28;
      savedAtari += group.stones.length;
      urgent = true;
    } else if (group.liberties.length === 2 && ownAfter.liberties.length >= 4) {
      score += 22 + group.stones.length * 3;
    }
  }
  for (const group of enemyBefore) {
    const anchor = group.stones[0];
    if (inspection.board[keyOf(game.size, anchor.x, anchor.y)] !== opponent) continue;
    const survivor = getGroup(inspection.board, game.size, anchor.x, anchor.y);
    if (survivor.liberties.length === 1) {
      score += 110 + survivor.stones.length * 22;
      attackAtari += survivor.stones.length;
      urgent = true;
    } else if (survivor.liberties.length === 2) {
      score += 28 + survivor.stones.length * 4.5;
    } else if (survivor.liberties.length < group.liberties.length) {
      score += 9 + (group.liberties.length - survivor.liberties.length) * 5;
    }
  }

  if (ownBefore.length > 1) {
    connection = ownBefore.length - 1;
    score += 30 + connection * 16;
  }
  if (enemyBefore.length > 1) score += 30 + (enemyBefore.length - 1) * 17;
  if (ownAfter.liberties.length === 1 && !inspection.captured.length) score -= 260 + ownAfter.stones.length * 16;
  else if (ownAfter.liberties.length === 2) score -= 48 + ownAfter.stones.length * 3.5;
  else if (ownAfter.liberties.length === 3) score -= 5;

  const trueEye = isEyeFill(game, point.x, point.y, color);
  const deepOwnControl = nearestEnemy < INF && beforeControl > 0.58 && nearestEnemy >= nearestOwn + 3;
  const secureOwn = region?.secure && region.owner === color;

  let child = null;
  let childAnalysis = null;
  if (includeStrategicDelta || !urgent) {
    child = stateAfterMove(game, { ...point, inspection }, color);
    if (child) {
      childAnalysis = analyzePosition(child, color);
      const influence = influenceDelta(game, child, analysis, childAnalysis, pointKey);
      frontierGain = influence.frontierGain;
      claimed = influence.claimed;
      reduced = influence.reduced;
      shapeDelta = childAnalysis.shapeEfficiency - analysis.shapeEfficiency;
    }
  }

  const peaceful = enemyNear2 === 0 && nearestEnemy >= 3;
  const lowExpansion = frontierGain < 0.8 && claimed === 0 && reduced === 0;
  const overconcentrated = !urgent && peaceful && nearestOwn <= 1 && ownBefore.length <= 1 && ownNear2 >= 2 && lowExpansion;
  const compactClump = !urgent && peaceful && ownNear1 >= 2 && shapeDelta < -1.2 && lowExpansion;
  const deepFill = !urgent && (secureOwn || trueEye || (deepOwnControl && lowExpansion));
  const wasteful = deepFill || overconcentrated || compactClump;

  if (trueEye && !urgent) score -= 900;
  if (secureOwn && !urgent) score -= 720 + Math.min(180, region.points.length * 6);
  else if (deepOwnControl && !urgent) score -= 260 + beforeControl * 80;
  if (overconcentrated) score -= 520 + ownNear2 * 45;
  if (compactClump) score -= 420;

  score += frontierGain * (22 + style.expansion * 12);
  score += claimed * (12 + style.expansion * 7);
  score += reduced * (10 + style.reduction * 8);
  score += shapeDelta * 18;

  if (!urgent && peaceful) {
    if (nearestOwn >= 3 && nearestOwn <= Math.max(7, Math.floor(game.size * 0.62))) score += 24 + style.expansion * 18;
    else if (nearestOwn === 2 && ownNear2 <= 2) score += 6;
    if (nearestOwn <= 1) score -= 42 + ownNear2 * 14;
  }

  if (beforeControl < -0.5 && ownAfter.liberties.length >= 4) score += 12 + style.invasion * 35;
  else if (beforeControl < -0.18 && ownAfter.liberties.length >= 3) score += 9 + style.reduction * 28;
  if (enemyNear2 > 0) score += style.attack * Math.min(34, enemyNear2 * 7 + attackAtari * 8);
  score += style.solid * (savedAtari * 12 + connection * 11 + Math.max(0, ownAfter.liberties.length - 3) * 1.5);

  const lastDistance = distanceToLastMove(game, point);
  if (!urgent && lastDistance >= Math.max(6, Math.floor(game.size * 0.42)) && frontierGain > 0.7) score += style.tenuki * 24;
  if (!urgent && lastDistance <= 2 && enemyNear2 === 0 && lowExpansion) score -= style.tenuki * 18;

  score += openingBonus(game, point.x, point.y, nearestOwn, ownAdj, enemyAdj);
  if (game.moveNumber < Math.max(5, Math.floor(game.size * 0.5))) score -= recentOpeningPenalty(game, point.x, point.y);

  let strategicDelta = 0;
  if (includeStrategicDelta && childAnalysis) {
    strategicDelta = childAnalysis.value - analysis.value;
    score += strategicDelta * 2.15;
  }

  return {
    score,
    urgent,
    wasteful,
    overconcentrated,
    strategicDelta,
    captureCount: inspection.captured.length,
    savedAtari,
    attackAtari,
    frontierGain,
    claimed,
    reduced,
    shapeDelta,
    nearestOwn,
    nearestEnemy,
    beforeControl
  };
}

export function generateMoves(game, color, limit, includeStrategicDelta = true, includePass = true, context) {
  const analysis = analyzePosition(game, color);
  const moves = [];
  for (const point of collectCandidatePoints(game, analysis)) {
    const inspection = inspectMove(game, point.x, point.y, color);
    if (!inspection.legal) continue;
    const rated = scoreMove(game, point, inspection, color, analysis, includeStrategicDelta, context);
    if (rated.wasteful && !rated.urgent) continue;
    moves.push({
      x: point.x,
      y: point.y,
      prior: rated.score,
      urgent: rated.urgent,
      wasteful: rated.wasteful,
      overconcentrated: rated.overconcentrated,
      captureCount: rated.captureCount,
      savedAtari: rated.savedAtari,
      attackAtari: rated.attackAtari,
      frontierGain: rated.frontierGain,
      claimed: rated.claimed,
      reduced: rated.reduced,
      shapeDelta: rated.shapeDelta,
      inspection
    });
  }
  moves.sort((a, b) => b.prior - a.prior);
  const selected = moves.slice(0, limit);
  if (includePass) {
    const best = selected[0];
    const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
    const late = game.moveNumber > game.size * 1.35 || occupied / game.board.length > 0.34;
    const noProductiveMove = !best || (!best.urgent && best.frontierGain < 0.35 && best.claimed === 0 && best.reduced === 0 && best.prior < (game.passes === 1 ? 20 : 5));
    if (game.passes === 1 && noProductiveMove) selected.unshift({ pass: true, prior: best ? best.prior + 18 : 24, urgent: false, wasteful: false });
    else if (late && noProductiveMove) selected.push({ pass: true, prior: best ? best.prior + 6 : 10, urgent: false, wasteful: false });
  }
  return selected;
}

export function chooseOpeningBookMove(game, rootMoves, level, context) {
  const occupied = game.board.length - game.board.reduce((sum, value) => sum + (value === EMPTY ? 1 : 0), 0);
  const limit = Math.max(7, Math.floor(game.size * 0.65));
  if (occupied >= limit || rootMoves.some((move) => move.urgent)) return null;
  const corner = game.size === 9 ? 2 : 3;
  const far = game.size - 1 - corner;
  const cornerAnchors = [[corner, corner], [far, corner], [corner, far], [far, far]];
  const sideAnchors = openingPoints(game.size).filter(([x, y]) => !cornerAnchors.some(([cx, cy]) => cx === x && cy === y));
  const preferred = occupied < 4 ? cornerAnchors : context.personality === 'influence' ? [...sideAnchors, ...cornerAnchors] : openingPoints(game.size);
  const anchors = new Set(preferred.map(([x, y]) => keyOf(game.size, x, y)));
  const candidates = rootMoves.filter((move) => !move.pass && anchors.has(keyOf(game.size, move.x, move.y)) && !move.wasteful);
  if (!candidates.length) return null;

  const ownStones = [];
  const enemyStones = [];
  for (let key = 0; key < game.board.length; key += 1) {
    const value = game.board[key];
    if (value === game.turn) ownStones.push({ x: key % game.size, y: Math.floor(key / game.size) });
    else if (value !== EMPTY) enemyStones.push({ x: key % game.size, y: Math.floor(key / game.size) });
  }
  const nearest = (stones, move) => stones.length ? Math.min(...stones.map((stone) => Math.abs(stone.x - move.x) + Math.abs(stone.y - move.y))) : game.size;
  for (const move of candidates) {
    const ownDistance = nearest(ownStones, move);
    const enemyDistance = nearest(enemyStones, move);
    let bookScore = ownDistance * 4 - recentOpeningPenalty(game, move.x, move.y) * 2;
    if (!ownStones.length) bookScore += enemyDistance * (context.personality === 'fighter' ? 0.6 : 1.7);
    if (context.personality === 'fighter' && enemyDistance >= 3 && enemyDistance <= 6) bookScore += 8;
    if (context.personality === 'invasive' && enemyDistance >= 4 && enemyDistance <= 8) bookScore += 6;
    if (context.personality === 'territorial' && cornerAnchors.some(([x, y]) => x === move.x && y === move.y)) bookScore += 7;
    if (context.personality === 'influence' && sideAnchors.some(([x, y]) => x === move.x && y === move.y)) bookScore += 7;
    move.bookScore = bookScore + context.rng() * (level === 'sharp' ? 1.5 : 5);
  }
  candidates.sort((a, b) => b.bookScore - a.bookScore);
  const best = candidates[0].bookScore;
  const window = level === 'calm' ? 12 : level === 'steady' ? 8 : 3.5;
  const pool = candidates.filter((move) => move.bookScore >= best - window).slice(0, 6);
  const weights = pool.map((move) => Math.exp((move.bookScore - best) / (level === 'sharp' ? 1.6 : 3.8)));
  let roll = context.rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[0];
}
