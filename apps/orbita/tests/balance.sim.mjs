import { createGame, isRotationAllowed, placeStone, rotateRing } from '../engine.js';

let seed = 0x7f4a7c15;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x1_0000_0000;
}

function pick(values) {
  return values[Math.floor(random() * values.length)];
}

function randomTurn(state) {
  const empty = [];
  for (let ring = 0; ring < 4; ring += 1) {
    for (let sector = 0; sector < 8; sector += 1) {
      if (state.board[ring][sector] === null) empty.push([ring, sector]);
    }
  }
  const [ring, sector] = pick(empty);
  const placed = placeStone(state, ring, sector);
  const rotations = [];
  for (let rotatedRing = 0; rotatedRing < 4; rotatedRing += 1) {
    for (const direction of [-1, 1]) {
      if (isRotationAllowed(placed, rotatedRing, direction)) rotations.push([rotatedRing, direction]);
    }
  }
  const [rotatedRing, direction] = pick(rotations);
  return rotateRing(placed, rotatedRing, direction);
}

const games = Number(process.argv[2] || 2_000);
const totals = {
  blue: 0,
  red: 0,
  draw: 0,
  turns: 0,
  firstChallengerWin: 0,
  firstChallengerLoss: 0,
  firstChallengerDraw: 0,
  noChallenge: 0
};

for (let index = 0; index < games; index += 1) {
  let state = createGame();
  let turns = 0;
  let firstChallengeColor = null;
  while (state.phase !== 'round-over' && turns < 32) {
    state = randomTurn(state);
    turns += 1;
    if (firstChallengeColor === null && state.challengeColor !== null) firstChallengeColor = state.challengeColor;
  }
  if (state.draw) totals.draw += 1;
  else if (state.winnerColor === 0) totals.blue += 1;
  else totals.red += 1;
  if (firstChallengeColor === null) totals.noChallenge += 1;
  else if (state.draw) totals.firstChallengerDraw += 1;
  else if (state.winnerColor === firstChallengeColor) totals.firstChallengerWin += 1;
  else totals.firstChallengerLoss += 1;
  totals.turns += turns;
}

const decisive = totals.blue + totals.red;
const challenged = games - totals.noChallenge;
const result = {
  games,
  firstColorWins: totals.blue,
  secondColorWins: totals.red,
  draws: totals.draw,
  firstShareOfDecisive: Number((decisive ? totals.blue / decisive : 0).toFixed(4)),
  drawShare: Number((totals.draw / games).toFixed(4)),
  averageTurns: Number((totals.turns / games).toFixed(2)),
  firstChallenger: {
    games: challenged,
    wins: totals.firstChallengerWin,
    losses: totals.firstChallengerLoss,
    draws: totals.firstChallengerDraw,
    nonLossShare: Number((challenged ? (totals.firstChallengerWin + totals.firstChallengerDraw) / challenged : 0).toFixed(4))
  }
};
console.log(JSON.stringify(result, null, 2));

if (result.firstShareOfDecisive < 0.45 || result.firstShareOfDecisive > 0.60) {
  throw new Error(`First-color decisive share ${result.firstShareOfDecisive.toFixed(3)} left the expected balance band`);
}
if (result.drawShare < 0.08 || result.drawShare > 0.38) {
  throw new Error(`Draw share ${result.drawShare.toFixed(3)} left the expected balance band`);
}
if (result.firstChallenger.losses === 0) {
  throw new Error('First challenger still never loses');
}
