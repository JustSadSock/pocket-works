import assert from 'node:assert/strict';
import { SeamGame, chooseBotMove } from './engine.js';

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Capture on the six-neighbour lattice.
{
  const game = new SeamGame({ size: 3 });
  game.board = [0, 1, 1, 1, 2, 1, 1, 0, 0];
  game.turn = 1;
  game.history = [game.positionKey()];
  const result = game.play(7);
  assert.equal(result.ok, true);
  assert.deepEqual(result.captured, [4]);
}

// Suicide is forbidden.
{
  const game = new SeamGame({ size: 3 });
  game.board = [0, 2, 2, 2, 0, 2, 2, 2, 0];
  game.turn = 1;
  game.history = [game.positionKey()];
  assert.equal(game.play(4).reason, 'suicide');
}

// A connected seam ends the game immediately.
{
  const game = new SeamGame({ size: 3 });
  game.board = [1, 0, 2, 1, 0, 2, 0, 0, 0];
  game.turn = 1;
  game.history = [game.positionKey()];
  const result = game.play(6);
  assert.equal(result.winner, 1);
  assert.deepEqual(game.winningPath, [0, 3, 6]);
}

// Pie-rule changes ownership, not the board or the colour to move.
{
  const game = new SeamGame();
  game.play(24);
  assert.equal(game.canClaimOpening(), true);
  assert.equal(game.claimOpening().ok, true);
  assert.equal(game.turn, 2);
  assert.equal(game.board[24], 1);
}

const styles = ['rush', 'siege', 'guard', 'shape', 'balanced'];

function playGame(style1, style2, seed) {
  const rng = mulberry32(seed);
  const game = new SeamGame();
  let ownerByColour = { 1: 1, 2: 2 };
  let swapped = false;

  while (!game.winner && game.moveNumber < 100) {
    if (game.canClaimOpening()) {
      const [row, column] = game.coordinates(game.lastMove);
      const centrality = Math.abs(row - 3) + Math.abs(column - 3);
      const claim = centrality === 0 || (centrality === 1 && rng() < 0.4);
      if (claim) {
        game.claimOpening();
        ownerByColour = { 1: 2, 2: 1 };
        swapped = true;
      } else {
        game.swapAvailable = false;
      }
    }

    const seat = ownerByColour[game.turn];
    const style = seat === 1 ? style1 : style2;
    const move = chooseBotMove(game, style, rng, {
      noise: 0.15,
      exploration: 0.04,
      avoidImmediateLoss: true
    });
    assert.ok(move >= 0, 'bot must find a legal move');
    assert.equal(game.play(move).ok, true, 'bot move must be legal');
  }

  assert.ok(game.winner, 'game must finish');
  return {
    winningSeat: ownerByColour[game.winner],
    winningColour: game.winner,
    moves: game.moveNumber,
    swapped
  };
}

const seats = { 1: 0, 2: 0 };
const colours = { 1: 0, 2: 0 };
const styleWins = Object.fromEntries(styles.map((style) => [style, 0]));
const styleGames = Object.fromEntries(styles.map((style) => [style, 0]));
const lengths = [];
let swaps = 0;
let seed = 17072026;

for (const first of styles) {
  for (const second of styles) {
    for (let repeat = 0; repeat < 8; repeat += 1) {
      const result = playGame(first, second, seed++);
      seats[result.winningSeat] += 1;
      colours[result.winningColour] += 1;
      styleGames[first] += 1;
      styleGames[second] += 1;
      styleWins[result.winningSeat === 1 ? first : second] += 1;
      swaps += Number(result.swapped);
      lengths.push(result.moves);
    }
  }
}

const firstSeatShare = seats[1] / lengths.length;
const styleRates = Object.fromEntries(styles.map((style) => [style, styleWins[style] / styleGames[style]]));
assert.ok(firstSeatShare >= 0.45 && firstSeatShare <= 0.60, `first-seat share out of bounds: ${firstSeatShare}`);
assert.ok(Math.max(...Object.values(styleRates)) - Math.min(...Object.values(styleRates)) <= 0.20, 'one style dominates the field');
assert.ok(lengths.every((value) => value >= 7 && value < 100));

console.log(JSON.stringify({
  games: lengths.length,
  seats,
  colours,
  swaps,
  firstSeatShare,
  averageMoves: lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
  styleRates
}, null, 2));
