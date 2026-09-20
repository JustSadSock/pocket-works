import { applyMove, boxSideCount, cloneGame, listOpenEdges, parseEdgeId } from './game.js';

function adjacentBoxes(game, edge) {
  const parsed = parseEdgeId(edge);
  const boxes = [];
  if (!parsed) return boxes;
  if (parsed.orientation === 'h') {
    if (parsed.row > 0) boxes.push([parsed.row - 1, parsed.col]);
    if (parsed.row < game.size) boxes.push([parsed.row, parsed.col]);
  } else {
    if (parsed.col > 0) boxes.push([parsed.row, parsed.col - 1]);
    if (parsed.col < game.size) boxes.push([parsed.row, parsed.col]);
  }
  return boxes;
}

function centerBias(game, edge) {
  const parsed = parseEdgeId(edge);
  const center = game.size / 2;
  const x = parsed.orientation === 'h' ? parsed.col + 0.5 : parsed.col;
  const y = parsed.orientation === 'h' ? parsed.row : parsed.row + 0.5;
  return -Math.hypot(x - center, y - center) * 0.02;
}

function immediateDanger(game, edge) {
  const simulation = cloneGame(game);
  const result = applyMove(simulation, edge, simulation.currentPlayer);
  if (!result.ok) return 99;
  let danger = 0;
  for (let row = 0; row < result.game.size; row += 1) {
    for (let col = 0; col < result.game.size; col += 1) {
      const index = row * result.game.size + col;
      if (result.game.boxes[index] !== null) continue;
      if (boxSideCount(result.game, row, col) === 3) danger += 1;
    }
  }
  return danger;
}

function captureCount(game, edge) {
  const before = game.scores[game.currentPlayer];
  const result = applyMove(game, edge, game.currentPlayer);
  if (!result.ok) return -999;
  return result.game.scores[game.currentPlayer] - before;
}

function forcedCaptureRun(game) {
  let cursor = cloneGame(game);
  let captures = 0;
  for (let step = 0; step < 12; step += 1) {
    const scoring = listOpenEdges(cursor)
      .map((edge) => ({ edge, captures: captureCount(cursor, edge) }))
      .filter((entry) => entry.captures > 0)
      .sort((a, b) => b.captures - a.captures || a.edge.localeCompare(b.edge));
    if (!scoring.length) break;
    const result = applyMove(cursor, scoring[0].edge, cursor.currentPlayer);
    captures += scoring[0].captures;
    cursor = result.game;
  }
  return captures;
}

export function chooseAiMove(game) {
  const edges = listOpenEdges(game);
  if (!edges.length) return null;

  const ranked = edges.map((edge) => {
    const result = applyMove(game, edge, game.currentPlayer);
    if (!result.ok) return { edge, score: -Infinity };
    const captured = result.captured.length;
    let score = captured * 100 + centerBias(game, edge);

    if (captured > 0) {
      score += forcedCaptureRun(result.game) * 24;
    } else {
      const danger = immediateDanger(game, edge);
      score -= danger * 14;

      const opponentGame = result.game;
      const opponentImmediate = listOpenEdges(opponentGame)
        .reduce((best, candidate) => Math.max(best, captureCount(opponentGame, candidate)), 0);
      score -= opponentImmediate * 35;
    }

    for (const [row, col] of adjacentBoxes(game, edge)) {
      const sides = boxSideCount(game, row, col);
      if (sides === 0) score += 0.8;
      if (sides === 1) score += 0.2;
      if (sides === 2 && captured === 0) score -= 3.5;
    }

    return { edge, score };
  });

  ranked.sort((a, b) => b.score - a.score || a.edge.localeCompare(b.edge));
  return ranked[0].edge;
}
