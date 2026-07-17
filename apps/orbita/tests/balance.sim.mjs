import { createGame, placeStone, rotateRing } from '../engine.js';

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
  return rotateRing(placed, Math.floor(random() * 4), random() < 0.5 ? -1 : 1);
}

const games = Number(process.argv[2] || 2_000);
const totals = { blue: 0, red: 0, draw: 0, turns: 0 };

for (let index = 0; index < games; index += 1) {
  let state = createGame();
  let turns = 0;
  while (state.phase !== 'round-over' && turns < 32) {
    state = randomTurn(state);
    turns += 1;
  }
  if (state.draw) totals.draw += 1;
  else if (state.winnerColor === 0) totals.blue += 1;
  else totals.red += 1;
  totals.turns += turns;
}

const decisive = totals.blue + totals.red;
const firstShare = decisive ? totals.blue / decisive : 0;
const drawShare = totals.draw / games;
console.log(JSON.stringify({
  games,
  firstColorWins: totals.blue,
  secondColorWins: totals.red,
  draws: totals.draw,
  firstShareOfDecisive: Number(firstShare.toFixed(4)),
  drawShare: Number(drawShare.toFixed(4)),
  averageTurns: Number((totals.turns / games).toFixed(2))
}, null, 2));

if (firstShare < 0.50 || firstShare > 0.58) {
  throw new Error(`First-color decisive share ${firstShare.toFixed(3)} left the expected balance band`);
}
if (drawShare < 0.04 || drawShare > 0.16) {
  throw new Error(`Draw share ${drawShare.toFixed(3)} left the expected balance band`);
}
