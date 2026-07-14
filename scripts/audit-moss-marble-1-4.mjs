import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVELS } from '../apps/moss-marble/levels.js';
import { createBall, pointInPolygon, stepBall, strikeBall } from '../apps/moss-marble/physics.js';
import { terrainHeightAt } from '../apps/moss-marble/terrain.js';
import { polygonArea, triangulatePolygon } from '../apps/moss-marble/render.js';

assert.equal(LEVELS.length, 9, 'The authored course must keep all nine holes.');
const features = { sand: 0, slope: 0, water: 0, bridge: 0, ramp: 0, tunnel: 0, rotor: 0 };

for (const level of LEVELS) {
  assert.ok(Array.isArray(level.centerline) && level.centerline.length >= 7, `Hole ${level.id} needs a long route spine.`);
  const routeLength = level.centerline.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - level.centerline[index].x, point.y - level.centerline[index].y), 0);
  assert.ok(routeLength > 1800, `Hole ${level.id} route is too short: ${routeLength}.`);
  assert.ok(pointInPolygon(level.start, level.outline), `Hole ${level.id} start must be inside.`);
  assert.ok(pointInPolygon(level.hole, level.outline), `Hole ${level.id} cup must be inside.`);
  assert.equal(triangulatePolygon(level.outline).length, level.outline.length - 2, `Hole ${level.id} outline must triangulate.`);
  assert.ok(Math.abs(polygonArea(level.outline)) > 500000, `Hole ${level.id} needs a meaningful play area.`);
  assert.ok(level.par >= 6 && level.par <= 8, `Hole ${level.id} par must reflect its new length.`);
  assert.ok(Number(level.hole.depth) >= 52, `Hole ${level.id} needs a physical cup depth.`);

  const ball = createBall(level.start, level);
  assert.equal(ball.z, terrainHeightAt(level, ball.x, ball.y) + 22);
  strikeBall(ball, 380, -130);
  for (let tick = 0; tick < 180; tick += 1) stepBall(ball, level, 1 / 60, tick / 60);
  assert.ok([ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite), `Hole ${level.id} physics must stay finite.`);

  for (const zone of level.zones || []) {
    if (zone.type in features) features[zone.type] += 1;
    if (zone.ramp) features.ramp += 1;
  }
  features.tunnel += level.tunnels?.length || 0;
  features.rotor += level.rotors?.length || 0;
}

for (const [feature, count] of Object.entries(features)) assert.ok(count > 0, `${feature} must exist in the authored course.`);

const plainOutline = [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }];
const cupLevel = { outline: plainOutline, start: { x: 390, y: 300 }, hole: { x: 500, y: 300, r: 32, depth: 64 }, zones: [], obstacles: [], walls: [], rotors: [], tunnels: [] };
for (const speed of [300, 500, 700]) {
  const ball = createBall(cupLevel.start, cupLevel);
  strikeBall(ball, speed, 0);
  let sunk = false;
  for (let tick = 0; tick < 720 && !sunk; tick += 1) sunk = stepBall(ball, cupLevel, 1 / 120, tick / 120).some((event) => event.type === 'cup');
  assert.ok(sunk && ball.sunk && ball.z < 0, `A ${speed} speed cup entry should settle physically.`);
}
{
  const ball = createBall(cupLevel.start, cupLevel);
  strikeBall(ball, 1000, 0);
  let lipOut = false;
  for (let tick = 0; tick < 420; tick += 1) lipOut ||= stepBall(ball, cupLevel, 1 / 120, tick / 120).some((event) => event.type === 'lip-out');
  assert.ok(lipOut && !ball.sunk && ball.x > cupLevel.hole.x, 'A fast pass must be able to lip out and continue.');
}

const rampLevel = {
  outline: [{ x: 0, y: 0 }, { x: 1100, y: 0 }, { x: 1100, y: 600 }, { x: 0, y: 600 }],
  start: { x: 120, y: 300 },
  hole: { x: 1000, y: 300, r: 32, depth: 64 },
  zones: [{ shape: 'rect', x: 300, y: 200, w: 220, h: 200, type: 'slope', baseZ: 0, riseX: 36, riseY: 0, ramp: true, launch: 340, minLaunchSpeed: 250 }],
  obstacles: [], walls: [], rotors: [], tunnels: []
};
{
  const ball = createBall(rampLevel.start, rampLevel);
  strikeBall(ball, 1600, 0);
  let jumped = false;
  let landed = false;
  let maximumZ = ball.z;
  for (let tick = 0; tick < 420; tick += 1) {
    const events = stepBall(ball, rampLevel, 1 / 120, tick / 120);
    jumped ||= events.some((event) => event.type === 'jump');
    landed ||= events.some((event) => event.type === 'land');
    maximumZ = Math.max(maximumZ, ball.z);
  }
  assert.ok(jumped && landed && maximumZ > 90, 'The ramp must create a visible ballistic arc and landing.');
}

const [app, index, experience, worker] = await Promise.all([
  readFile(new URL('../apps/moss-marble/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/experience14.js', import.meta.url), 'utf8'),
  readFile(new URL('../apps/moss-marble/sw.js', import.meta.url), 'utf8')
]);
assert.match(app, /installLivingTerrain/);
assert.match(app, /toggleOverview/);
assert.match(index, /id="overviewBtn"/);
assert.match(index, /styles14\.css\?v=1\.4\.0/);
assert.match(experience, /overviewProgress/);
assert.match(experience, /drawTerrainMesh/);
assert.match(experience, /ВСЯ ТЕРРИТОРИЯ/);
assert.match(worker, /moss-marble-v1\.4\.0/);
assert.match(worker, /\.\/terrain\.js/);
assert.match(worker, /\.\/experience14\.js/);

console.log('Moss & Marble 1.4 long routes, camera, terrain, jump and cup physics audit passed.');
console.log(features);
