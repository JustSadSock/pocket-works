import {
  applyMove,
  createGame,
  legalMoves,
  mobility,
  previewMove,
  rawScores,
  reachableCount,
  scoreState
} from './engine.mjs';

function hash(seed, step, move) {
  let value = (seed * 1664525 + step * 1013904223 + move * 2246822519) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

function choose(game, seed, step, style) {
  const moves = legalMoves(game);
  let best = moves[0];
  let bestValue = -Infinity;
  for (const move of moves) {
    const preview = previewMove(game, move);
    const next = applyMove(game, move);
    const mover = game.current;
    const opponent = 1 - mover;
    let value = preview.gain * (style === 0 ? 40 : 20);
    if (preview.ended) value += preview.winner === mover ? 1e6 : -1e6;
    if (style === 1) value += mobility(next, mover) * 10 - mobility(next, opponent) * 13;
    if (style === 2) value += reachableCount(next, mover) * 3 - reachableCount(next, opponent) * 4;
    value += (hash(seed, step, move) % 1000) / 10000;
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  return best;
}

for (const radius of [3, 4, 5]) {
  const results = [0, 0];
  let totalPlies = 0;
  let totalCaptures = 0;
  let bigCaptures = 0;
  let splitEnds = 0;
  let trapEnds = 0;
  const games = 600;
  for (let seed = 0; seed < games; seed += 1) {
    let game = createGame({ radius });
    const styles = [seed % 3, Math.floor(seed / 3) % 3];
    while (!game.ended) {
      const before = rawScores(game)[game.current];
      const mover = game.current;
      const move = choose(game, seed, game.plies, styles[mover]);
      game = applyMove(game, move);
      const gain = rawScores(game)[mover] - before;
      if (gain > 1) {
        totalCaptures += 1;
        if (gain >= 4) bigCaptures += 1;
      }
    }
    results[game.winner] += 1;
    totalPlies += game.plies;
    if (game.reason === 'split') splitEnds += 1;
    if (game.reason === 'trap') trapEnds += 1;
    const scores = scoreState(game);
    if (!(scores[game.winner] > scores[1 - game.winner]) && game.reason !== 'trap') {
      throw new Error('winner/score mismatch');
    }
  }
  console.log(JSON.stringify({
    radius,
    games,
    first: results[0],
    second: results[1],
    firstRate: +(results[0] / games * 100).toFixed(2),
    averagePlies: +(totalPlies / games).toFixed(2),
    capturesPerGame: +(totalCaptures / games).toFixed(2),
    bigCapturesPerGame: +(bigCaptures / games).toFixed(2),
    splitEnds,
    trapEnds
  }));
}
