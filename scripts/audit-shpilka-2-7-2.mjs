import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('apps/shpilka/engine-v2-27-2.js', 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const hashSeed = (value) => {
  let state = value >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  return (state ^ (state >>> 16)) >>> 0;
};

const track = { totalLength: 15000 };
const shpPrefs = { difficulty: 'maniac', trackType: 'speed' };
const shpActiveArchetype = { id: 'speed' };
const cars = [
  { id: 'player', player: true, progressDistance: 0, completedLaps: 0 },
  { id: 'rook', player: false, progressDistance: 0, completedLaps: 0, signedRoadOffset: 0, forwardSpeed: 430 },
  { id: 'volt', player: false, progressDistance: 0, completedLaps: 0, signedRoadOffset: -45, forwardSpeed: 430 },
  { id: 'mara', player: false, progressDistance: 0, completedLaps: 0, signedRoadOffset: 40, forwardSpeed: 430 },
  { id: 'shunt', player: false, progressDistance: 0, completedLaps: 0, signedRoadOffset: 10, forwardSpeed: 430 }
];
let trackSeed = 272001;
let aheadFixture = null;
let laneClear = true;

const context = vm.createContext({
  console, Math, Number, Object, Array, String, Boolean, Map, Set,
  clamp, lerp, hashSeed, track, shpPrefs, shpActiveArchetype, cars,
  roadHalf: 118, CAR_HALF_WIDTH: 11, MAX_SPEED: 650, trackSeed,
  document: { querySelector: () => null },
  shp27UpdateTactic(car) { return { ahead: aheadFixture, behind: null }; },
  shp27TargetSpeed(car, profile, tune, preview, ahead) {
    return ahead ? Math.abs(ahead.car.forwardSpeed || 0) + 8 : 610;
  },
  shp27LaneClear() { return laneClear; },
  shp27SetTactic(car, kind, side, duration) {
    car.shp27Tactic = kind;
    car.shp27TacticSide = side;
    car.shp27TacticTimer = duration;
  },
  setupRace() {},
  window: null
});
context.window = context;
new vm.Script(source, { filename: 'engine-v2-27-2.js' }).runInContext(context);

function resetRace(seed, type, difficulty = 'maniac') {
  trackSeed = seed;
  context.trackSeed = seed;
  shpActiveArchetype.id = type;
  shpPrefs.trackType = type;
  shpPrefs.difficulty = difficulty;
  for (const car of cars) {
    car.progressDistance = 0;
    car.completedLaps = 0;
    car.shp27Tactic = 'line';
    car.shp27TacticSide = 0;
    car.shp27TacticCooldown = 0;
    car.shp272RouteForm = undefined;
  }
  context.setupRace();
}

function averagePaces(seed, type, difficulty = 'maniac') {
  resetRace(seed, type, difficulty);
  const result = {};
  for (const car of cars.slice(1)) {
    const samples = [];
    for (let lap = 0; lap < 2; lap += 1) {
      car.completedLaps = lap;
      for (let sector = 0; sector < 3; sector += 1) {
        car.progressDistance = lap * track.totalLength + (sector + 0.5) * track.totalLength / 3;
        samples.push(context.shp272PaceMultiplier(car));
      }
    }
    result[car.id] = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  }
  return result;
}

const winners = new Set();
const spreads = {};
for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
  const paces = averagePaces(272000 + type.length * 97, type, 'maniac');
  const entries = Object.entries(paces).sort((a, b) => b[1] - a[1]);
  winners.add(entries[0][0]);
  const fastest = entries[0][1];
  const slowest = entries.at(-1)[1];
  const estimatedFast = 55;
  const estimatedSlow = 55 * fastest / slowest;
  const spread = estimatedSlow - estimatedFast;
  spreads[type] = Number(spread.toFixed(3));
  assert(new Set(Object.values(paces).map((value) => value.toFixed(4))).size === 4, `${type}: driver paces collapsed to the same value`);
  assert(spread >= 1.55, `${type}: expected field spread is too small (${spread.toFixed(2)}s)`);
  assert(spread <= 5.8, `${type}: expected field spread is excessive (${spread.toFixed(2)}s)`);
}
assert(winners.size >= 3, `track affinities do not change the leading driver enough (${[...winners].join(', ')})`);

const first = averagePaces(272777, 'technical', 'pilot');
const second = averagePaces(272777, 'technical', 'pilot');
assert(JSON.stringify(first) === JSON.stringify(second), 'route form is not deterministic for the same route code');
const different = averagePaces(272778, 'technical', 'pilot');
assert(Object.keys(first).some((id) => Math.abs(first[id] - different[id]) > 0.0005), 'route form does not vary between routes');

resetRace(272991, 'speed', 'maniac');
const attacker = cars.find((car) => car.id === 'volt');
const leader = cars.find((car) => car.id === 'mara');
attacker.progressDistance = 1000;
leader.progressDistance = 1170;
attacker.signedRoadOffset = -50;
leader.signedRoadOffset = 48;
attacker.forwardSpeed = 440;
leader.forwardSpeed = 405;
aheadFixture = { car: leader, gap: 170 };
laneClear = true;
const traffic = context.shp27UpdateTactic(attacker, 1 / 60, { maximum: 0.00035, firstCornerDistance: 420 });
assert(traffic.ahead === aheadFixture, 'racecraft wrapper lost the original traffic result');
assert(attacker.shp27Tactic === 'attack' && Math.abs(attacker.shp27TacticSide) === 1, 'faster driver did not start an early committed pass');

const profile = { corner: 1, straight: 1 };
const tune = {};
const packedBase = 413;
const released = context.shp27TargetSpeed(attacker, profile, tune, { maximum: 0.0003 }, aheadFixture);
assert(released > packedBase + 18, `committed passer remains locked to leader speed (${released.toFixed(1)})`);

const beforeGap = context.shp272PaceMultiplier(attacker);
cars[0].progressDistance = 999999;
const afterGap = context.shp272PaceMultiplier(attacker);
assert(beforeGap === afterGap, 'driver pace depends on player position or gap');

if (failures.length) {
  console.error('ШПИЛЬКА 2.7.2 field spread audit failed:');
  failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

console.log('ШПИЛЬКА 2.7.2 field spread audit passed:', JSON.stringify({ spreads, winners: [...winners] }));
