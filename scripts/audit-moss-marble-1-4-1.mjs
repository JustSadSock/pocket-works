import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVELS } from '../apps/moss-marble/levels.js';
import { generateEndlessLevel } from '../apps/moss-marble/procedural.js';
import {
  BALL_RADIUS,
  createBall,
  obstacleVerticalSpan,
  stepBall,
  strikeBall,
  verticalIntervalsOverlap
} from '../apps/moss-marble/physics.js';
import { inspectLevelIntegrity, stabilizeLevelGeometry } from '../apps/moss-marble/integrity.js';

const plainOutline = [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }];
const cupLevel = {
  outline: plainOutline,
  start: { x: 390, y: 300 },
  hole: { x: 500, y: 300, r: 32, depth: 64 },
  zones: [], obstacles: [], walls: [], rotors: [], tunnels: [], decorations: []
};

for (const speed of [300, 500, 700]) {
  const ball = createBall(cupLevel.start, cupLevel);
  strikeBall(ball, speed, 0);
  let cupEvents = 0;
  for (let tick = 0; tick < 900 && !ball.sunk; tick += 1) {
    cupEvents += stepBall(ball, cupLevel, 1 / 120, tick / 120).filter((event) => event.type === 'cup').length;
  }
  assert.equal(ball.sunk, true, `speed ${speed} must settle in the cup`);
  assert.equal(ball.cupPhase, 'sunk');
  assert.equal(cupEvents, 1, 'cup completion must be emitted exactly once');
  assert.ok(ball.cupTime < 3.2, 'cup state must never deadlock');
}

for (const offset of [-14, -8, 8, 14]) {
  const level = structuredClone(cupLevel);
  level.start = { x: 392, y: 300 + offset };
  const ball = createBall(level.start, level);
  strikeBall(ball, 560, -offset * 1.8);
  let lipOut = false;
  for (let tick = 0; tick < 960 && !ball.sunk; tick += 1) {
    lipOut ||= stepBall(ball, level, 1 / 120, tick / 120).some((event) => event.type === 'lip-out');
    assert.ok(!(ball.inCup && ball.cupTime > 3.2), `off-centre entry ${offset} deadlocked in cup`);
  }
  assert.ok(ball.sunk || lipOut, `off-centre entry ${offset} must resolve to cup or lip-out`);
}

{
  const ball = createBall(cupLevel.start, cupLevel);
  strikeBall(ball, 1000, 0);
  let lipOut = false;
  for (let tick = 0; tick < 420; tick += 1) {
    lipOut ||= stepBall(ball, cupLevel, 1 / 120, tick / 120).some((event) => event.type === 'lip-out');
  }
  assert.ok(lipOut && !ball.sunk && !ball.inCup, 'fast cup contact must return control after lip-out');
}

{
  const level = {
    outline: plainOutline,
    start: { x: 90, y: 520 },
    hole: { x: 820, y: 70, r: 32, depth: 64 },
    zones: [],
    obstacles: [{ x: 450, y: 300, r: 70, material: 'stone' }],
    walls: [],
    rotors: [{ x: 450, y: 300, length: 430, thickness: 28, speed: .5, angle: 0, material: 'wood' }],
    tunnels: [],
    decorations: [{ x: 520, y: 300, type: 'mushroom' }]
  };
  stabilizeLevelGeometry(level);
  const report = inspectLevelIntegrity(level);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.ok((report.report?.removedRotors || 0) + (report.report?.shortenedRotors || 0) > 0, 'conflicting rotor sweep must be corrected');
}

{
  const level = {
    outline: plainOutline,
    start: { x: 100, y: 300 },
    hole: { x: 820, y: 300, r: 32, depth: 64 },
    zones: [],
    obstacles: [{ x: 450, y: 300, r: 45, material: 'stone' }],
    walls: [], rotors: [], tunnels: [], decorations: []
  };
  const low = createBall({ x: 350, y: 300 }, level);
  strikeBall(low, 500, 0);
  let collided = false;
  for (let tick = 0; tick < 90; tick += 1) collided ||= stepBall(low, level, 1 / 120, tick / 120).some((event) => event.type === 'collision');
  assert.ok(collided && low.x < 450, 'grounded ball must collide with the stone');

  const high = createBall({ x: 350, y: 300 }, level);
  high.z = 150;
  high.airborne = true;
  high.grounded = false;
  strikeBall(high, 500, 0);
  for (let tick = 0; tick < 20; tick += 1) stepBall(high, level, 1 / 120, tick / 120);
  assert.ok(high.x > 410, 'ball above the object span must be able to clear it');
  const span = obstacleVerticalSpan(level, level.obstacles[0]);
  assert.equal(verticalIntervalsOverlap({ z: span.top + BALL_RADIUS + 3 }, span.bottom, span.top), false);
}

let checkedSections = 0;
for (let seed = 1; seed <= 24; seed += 1) {
  for (let depth = 0; depth < 12; depth += 1) {
    const level = generateEndlessLevel(seed * 7919, depth);
    createBall(level.start, level);
    const report = inspectLevelIntegrity(level);
    assert.equal(report.ok, true, `integrity failed for ${seed}/${depth}: ${JSON.stringify(report)}`);
    checkedSections += 1;
  }
}

for (const source of LEVELS) {
  const level = structuredClone(source);
  createBall(level.start, level);
  assert.equal(inspectLevelIntegrity(level).ok, true, `authored hole ${level.id} must be stable`);
}

const [physics, integrity, worker] = await Promise.all([
  readFile(new URL('../apps/moss-marble/physics.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/integrity.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/sw.js', import.meta.url), 'utf8')
]);
assert.match(physics, /cupPhase/);
assert.match(physics, /CUP_FAILSAFE_TIME/);
assert.match(physics, /verticalIntervalsOverlap/);
assert.match(integrity, /rotorMaximumHalf/);
assert.match(worker, /\.\/integrity\.js/);

console.log(`Moss & Marble 1.4.1 physics integrity audit passed across ${checkedSections} procedural sections.`);
