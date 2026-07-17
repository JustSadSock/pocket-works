import { AxisGame, PLAYER, chooseAIMove, shouldSwapOpening } from '../engine.js';

const STYLES = ['rush', 'ram', 'shell', 'flank', 'balanced'];
const VARIANTS = [
  { radius: 2, pieces: 5, maxGroup: 2, centerReplies: 1, centerSupport: 1, crownMinGroup: 1, maxTurns: 70 },
  { radius: 2, pieces: 5, maxGroup: 3, centerReplies: 1, centerSupport: 1, crownMinGroup: 1, maxTurns: 70 },
  { radius: 3, pieces: 5, maxGroup: 3, centerReplies: 1, centerSupport: 1, crownMinGroup: 1, maxTurns: 90 },
  { radius: 3, pieces: 7, maxGroup: 2, centerReplies: 1, centerSupport: 2, crownMinGroup: 2, maxTurns: 120 },
  { radius: 3, pieces: 7, maxGroup: 3, centerReplies: 1, centerSupport: 2, crownMinGroup: 1, maxTurns: 130 },
  { radius: 3, pieces: 7, maxGroup: 3, centerReplies: 1, centerSupport: 2, crownMinGroup: 2, maxTurns: 140 },
  { radius: 3, pieces: 7, maxGroup: 3, centerReplies: 2, centerSupport: 2, crownMinGroup: 2, maxTurns: 150 },
  { radius: 3, pieces: 7, maxGroup: 3, centerReplies: 2, centerSupport: 3, crownMinGroup: 2, maxTurns: 160 },
  { radius: 3, pieces: 9, maxGroup: 3, centerReplies: 1, centerSupport: 2, crownMinGroup: 2, maxTurns: 150 },
  { radius: 3, pieces: 9, maxGroup: 3, centerReplies: 2, centerSupport: 2, crownMinGroup: 2, maxTurns: 180 },
  { radius: 4, pieces: 7, maxGroup: 3, centerReplies: 2, centerSupport: 2, crownMinGroup: 2, maxTurns: 180 },
  { radius: 4, pieces: 9, maxGroup: 3, centerReplies: 2, centerSupport: 2, crownMinGroup: 2, maxTurns: 200 }
];
const FINAL = VARIANTS[6];

function rngFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function playMatch(config, seatOneStyle, seatTwoStyle, seed) {
  const game = new AxisGame({ ...config, pieRule: true });
  const rng = rngFor(seed);
  const styles = { 1: seatOneStyle, 2: seatTwoStyle };
  let seatForColor = { 1: 1, 2: 2 };
  let swaps = 0;
  const actionKinds = { single: 0, inline: 0, broadside: 0, push: 0 };
  let midState = null;

  while (!game.winner) {
    const seat = seatForColor[game.turn];
    const style = styles[seat];
    if (game.canClaimOpening() && shouldSwapOpening(game, style)) {
      game.claimOpening();
      seatForColor = { 1: 2, 2: 1 };
      swaps += 1;
    }
    const activeSeat = seatForColor[game.turn];
    const activeStyle = styles[activeSeat];
    const move = chooseAIMove(game, { level: 'club', style: activeStyle, rng });
    if (!move) {
      game.winner = 3 - game.turn;
      game.winReason = 'immobilized';
      break;
    }
    actionKinds[move.kind] += 1;
    game.applyMove(move);
    if (game.moveNumber === 12) {
      midState = {
        centerDistance: {
          1: Math.max(Math.abs(game.crownCell(1)[0]), Math.abs(game.crownCell(1)[1]), Math.abs(-game.crownCell(1)[0] - game.crownCell(1)[1])),
          2: Math.max(Math.abs(game.crownCell(2)[0]), Math.abs(game.crownCell(2)[1]), Math.abs(-game.crownCell(2)[0] - game.crownCell(2)[1]))
        },
        pieces: { 1: game.cellsFor(1).length, 2: game.cellsFor(2).length }
      };
    }
  }

  const winnerSeat = game.winner > 0 ? seatForColor[game.winner] : -1;
  let comeback = false;
  if (winnerSeat > 0 && midState) {
    const winnerColor = game.winner;
    const opponent = 3 - winnerColor;
    comeback = midState.centerDistance[winnerColor] > midState.centerDistance[opponent]
      || midState.pieces[winnerColor] < midState.pieces[opponent];
  }
  return { game, winnerSeat, swaps, actionKinds, comeback };
}

export function evaluate(config, gamesPerPair) {
  const aggregate = {
    games: 0, first: 0, second: 0, draws: 0, swaps: 0, moves: 0, comeback: 0,
    reasons: {}, actions: { single: 0, inline: 0, broadside: 0, push: 0 },
    styleWins: Object.fromEntries(STYLES.map((style) => [style, 0])),
    styleGames: Object.fromEntries(STYLES.map((style) => [style, 0]))
  };
  let seed = 4411;
  for (let left = 0; left < STYLES.length; left += 1) {
    for (let right = left; right < STYLES.length; right += 1) {
      for (let gameIndex = 0; gameIndex < gamesPerPair; gameIndex += 1) {
        const seatOne = gameIndex % 2 === 0 ? STYLES[left] : STYLES[right];
        const seatTwo = gameIndex % 2 === 0 ? STYLES[right] : STYLES[left];
        const result = playMatch(config, seatOne, seatTwo, seed++);
        aggregate.games += 1;
        aggregate.moves += result.game.moveNumber;
        aggregate.swaps += result.swaps;
        aggregate.comeback += result.comeback ? 1 : 0;
        aggregate.reasons[result.game.winReason] = (aggregate.reasons[result.game.winReason] || 0) + 1;
        for (const kind of Object.keys(aggregate.actions)) aggregate.actions[kind] += result.actionKinds[kind];
        aggregate.styleGames[seatOne] += 1;
        aggregate.styleGames[seatTwo] += 1;
        if (result.winnerSeat === -1) aggregate.draws += 1;
        else if (result.winnerSeat === 1) {
          aggregate.first += 1;
          aggregate.styleWins[seatOne] += 1;
        } else {
          aggregate.second += 1;
          aggregate.styleWins[seatTwo] += 1;
        }
      }
    }
  }
  const totalActions = Object.values(aggregate.actions).reduce((sum, value) => sum + value, 0) || 1;
  const actionShare = Object.fromEntries(Object.entries(aggregate.actions).map(([key, value]) => [key, value / totalActions]));
  const styleRates = Object.fromEntries(STYLES.map((style) => [style, aggregate.styleWins[style] / aggregate.styleGames[style]]));
  return {
    config,
    ...aggregate,
    averageMoves: aggregate.moves / aggregate.games,
    firstRate: aggregate.first / Math.max(1, aggregate.first + aggregate.second),
    comebackRate: aggregate.comeback / Math.max(1, aggregate.first + aggregate.second),
    actionShare,
    styleRates,
    styleSpread: Math.max(...Object.values(styleRates)) - Math.min(...Object.values(styleRates))
  };
}

const compact = (result) => ({
  config: result.config,
  score: `${result.first}:${result.second}:${result.draws}`,
  averageMoves: Number(result.averageMoves.toFixed(1)),
  swaps: result.swaps,
  reasons: result.reasons,
  actions: Object.fromEntries(Object.entries(result.actionShare).map(([key, value]) => [key, Number((value * 100).toFixed(1))])),
  styleRates: Object.fromEntries(Object.entries(result.styleRates).map(([key, value]) => [key, Number((value * 100).toFixed(1))])),
  styleSpread: Number((result.styleSpread * 100).toFixed(1)),
  comebackRate: Number((result.comebackRate * 100).toFixed(1))
});

const finalOnly = process.argv.includes('--final-only');
if (!finalOnly) {
  console.log('AXIS concept sweep');
  VARIANTS.forEach((config, index) => {
    const result = evaluate(config, 1);
    console.log(String(index + 1).padStart(2, '0'), JSON.stringify(compact(result)));
  });
}

console.log('\nAXIS final stress run');
const final = evaluate(FINAL, 12);
console.log(JSON.stringify(compact(final), null, 2));

if (final.draws !== 0) throw new Error(`Final rules produced ${final.draws} draws`);
if (Math.abs(final.firstRate - 0.5) > 0.12) throw new Error(`Seat balance drifted to ${(final.firstRate * 100).toFixed(1)}%`);
if (final.styleSpread > 0.25) throw new Error(`Style spread is too large: ${(final.styleSpread * 100).toFixed(1)}%`);
if (final.actionShare.push < 0.1 || final.actionShare.broadside < 0.04) throw new Error('The tactical move mix collapsed');
if ((final.reasons['crown-ejected'] || 0) < 15) throw new Error('The aggressive victory path is decorative');
console.log('\nBalance gates passed.');
