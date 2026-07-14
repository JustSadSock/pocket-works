import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVELS } from '../apps/moss-marble/levels.js';
import { BALL_RADIUS, createBall, strikeBall, stepBall } from '../apps/moss-marble/physics.js';
import { polygonArea, triangulatePolygon } from '../apps/moss-marble/render.js';

assert.equal(BALL_RADIUS, 22, 'The renderer and physics must share the same ball radius.');
assert.equal(LEVELS.length, 9, 'The authored course must keep all nine holes.');

for (const level of LEVELS) {
  const triangles = triangulatePolygon(level.outline);
  assert.equal(triangles.length, level.outline.length - 2, `Hole ${level.id} outline must triangulate completely.`);
  assert.ok(Math.abs(polygonArea(level.outline)) > 1000, `Hole ${level.id} outline must have a meaningful area.`);

  const ball = createBall(level.start);
  strikeBall(ball, 0, -260);
  for (let index = 0; index < 8; index += 1) stepBall(ball, level, 1 / 60, index / 60);
  assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y), `Hole ${level.id} physics must remain finite.`);
}

const renderer = await readFile(new URL('../apps/moss-marble/render.js', import.meta.url), 'utf8');
const requiredContracts = [
  "getContext('webgl2'",
  'surface + BALL_RADIUS - sinkDepth',
  'distance(vWorld.xy, uHole.xy) < uHole.z',
  "pocket-works:moss-marble:hitboxes",
  "obstacle.material === 'stone'",
  "obstacle.material === 'pot'",
  "obstacle.material === 'cup'",
  "obstacle.material === 'wood'",
  "obstacle.material === 'sugar'",
  "obstacle.material === 'spoon'",
  'r0: obstacle.r',
  'level.hole.r * 1.03'
];
for (const contract of requiredContracts) {
  assert.ok(renderer.includes(contract), `Renderer contract is missing: ${contract}`);
}

console.log('Moss & Marble 1.2 geometry, grounding and physics contracts passed.');
