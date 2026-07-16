import { LEVELS } from './levels.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { formatRunCode, generateEndlessLevel, inspectEndlessLevel, parseRunCode } from './procedural.js';
import { BALL_RADIUS, createBall, stepBall, strikeBall } from './physics.js';
import {
  campaignSegmentTotal,
  checkpointCampaignRun,
  checkpointEndlessRun,
  createCampaignRun,
  fullCampaignTotal,
  normalizeCampaignRun,
  normalizeEndlessRun,
  normalizeSave,
  recordCampaignHole,
  sectionWord,
  strokeWord
} from './state.js';

const failures = [];
const visualMotifs = new Set();
const assert = (condition, message) => { if (!condition) failures.push(message); };
const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
};
const orientation = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const pointOnSegment = (point, a, b) => point.x >= Math.min(a.x, b.x) - 1e-7 && point.x <= Math.max(a.x, b.x) + 1e-7 &&
  point.y >= Math.min(a.y, b.y) - 1e-7 && point.y <= Math.max(a.y, b.y) + 1e-7;
const segmentsCross = (a, b, c, d) => {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first * second < -1e-7 && third * fourth < -1e-7) return true;
  return Math.abs(first) <= 1e-7 && pointOnSegment(c, a, b) ||
    Math.abs(second) <= 1e-7 && pointOnSegment(d, a, b) ||
    Math.abs(third) <= 1e-7 && pointOnSegment(a, c, d) ||
    Math.abs(fourth) <= 1e-7 && pointOnSegment(b, c, d);
};
const outlineCrossings = (outline) => {
  const crossings = [];
  for (let first = 0; first < outline.length; first += 1) {
    for (let second = first + 1; second < outline.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === outline.length - 1)) continue;
      if (segmentsCross(outline[first], outline[(first + 1) % outline.length], outline[second], outline[(second + 1) % outline.length])) crossings.push([first, second]);
    }
  }
  return crossings;
};
const catmullRom = (a, b, c, d, t) => ({
  x: .5 * ((2 * b.x) + (-a.x + c.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t * t + (-a.x + 3 * b.x - 3 * c.x + d.x) * t * t * t),
  y: .5 * ((2 * b.y) + (-a.y + c.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t * t + (-a.y + 3 * b.y - 3 * c.y + d.y) * t * t * t)
});
const routeSample = (points, progress) => {
  const scaled = progress * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return catmullRom(points[Math.max(0, index - 1)], points[index], points[index + 1], points[Math.min(points.length - 1, index + 2)], t);
};
const wallDistanceToPoint = (wall, point) => {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - wall.ax) * dx + (point.y - wall.ay) * dy) / lengthSq)) : 0;
  const x = wall.ax + dx * t;
  const y = wall.ay + dy * t;
  return Math.hypot(point.x - x, point.y - y) - Number(wall.thickness || 0) * .5;
};
const outlineDistanceToPoint = (outline, point) => Math.min(...outline.map((a, index) => {
  const b = outline[(index + 1) % outline.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}));

for (const source of LEVELS) {
  const crossings = outlineCrossings(source.outline);
  assert(!crossings.length, `campaign ${source.id}: outline self-intersections ${JSON.stringify(crossings)}`);
  assert(pointInPolygon(source.start, source.outline), `campaign ${source.id}: start outside route`);
  assert(pointInPolygon(source.hole, source.outline), `campaign ${source.id}: hole outside route`);
  const splineInside = Array.from({ length: 119 }, (_, index) => routeSample(source.centerline, (index + 1) / 120))
    .every((point) => pointInPolygon(point, source.outline));
  assert(splineInside, `campaign ${source.id}: spline leaves route outline`);
  const visual = source.visual;
  assert(visual && /^#[0-9a-f]{6}$/i.test(visual.skyTop) && /^#[0-9a-f]{6}$/i.test(visual.skyBottom), `campaign ${source.id}: invalid atmosphere palette`);
  assert(Number.isFinite(visual?.rain) && visual.rain >= 0 && visual.rain <= 1.6, `campaign ${source.id}: invalid rain density`);
  assert(typeof visual?.motif === 'string' && visual.motif.length > 0, `campaign ${source.id}: missing visual motif`);
  assert(/^\d{1,3},\d{1,3},\d{1,3}$/.test(visual?.accent || ''), `campaign ${source.id}: invalid motif accent`);
  visualMotifs.add(visual?.motif);
  for (const [name, value] of Object.entries(visual?.terrain || {})) {
    assert(Array.isArray(value) && value.length === 4 && value.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1), `campaign ${source.id}: invalid terrain color ${name}`);
  }
  for (const [name, value] of Object.entries(visual?.materials || {})) {
    assert(Array.isArray(value) && value.length === 4 && value.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1), `campaign ${source.id}: invalid material color ${name}`);
  }
  const level = compileCourse19(source);
  const report = inspectCourse19(level);
  assert(report.ok, `campaign ${source.id}: ${report.issues.join(', ')}`);
  assert(level.__course19 === true, `campaign ${source.id}: compiler marker`);
  assert(level.course18?.triangleCount >= 0 && level.course18.triangleCount <= 12000, `campaign ${source.id}: triangle budget`);
  assert(level.course18?.field?.surfaceAt, `campaign ${source.id}: field contract`);
  for (const [index, obstacle] of (level.obstacles || []).entries()) {
    assert(pointInPolygon(obstacle, level.outline), `campaign ${source.id}: prop ${index} outside route`);
    assert(outlineDistanceToPoint(level.outline, obstacle) >= obstacle.r * .6, `campaign ${source.id}: prop ${index} clipped by route edge`);
  }
}
assert(visualMotifs.size === LEVELS.length, `campaign: expected ${LEVELS.length} unique visual motifs, received ${visualMotifs.size}`);

for (const source of LEVELS.filter((level) => [1, 6, 8].includes(level.id))) {
  const level = compileCourse19(source);
  for (const mound of level.course18.field.landforms.filter((feature) => feature.kind === 'mound' && feature.asymmetry)) {
    const epsilon = .5;
    const left = level.course18.field.heightAt(mound.x - mound.cos * epsilon, mound.y - mound.sin * epsilon);
    const right = level.course18.field.heightAt(mound.x + mound.cos * epsilon, mound.y + mound.sin * epsilon);
    assert(Math.abs(right - left) < 1, `campaign ${source.id}: asymmetric mound seam`);
  }
}

const heightLevel = compileCourse19(LEVELS[0]);
const raisedLandform = heightLevel.course18.field.landforms.find((feature) => feature.kind === 'mound' && feature.height > 0);
if (raisedLandform) {
  const raisedBall = createBall({ x: raisedLandform.x, y: raisedLandform.y }, heightLevel);
  const expectedGround = heightLevel.course18.field.heightAt(raisedLandform.x, raisedLandform.y);
  assert(Math.abs(raisedBall.z - (expectedGround + BALL_RADIUS)) < .001 && raisedBall.z > BALL_RADIUS, 'height: ball ignored raised terrain');
}

for (const seed of [1, 2, 3, 5, 8, 13, 17, 21, 34, 55, 89, 144, 233, 50291, 0xDEADBEEF]) {
  for (let depth = 0; depth < 28; depth += 1) {
    const rawA = generateEndlessLevel(seed, depth);
    const rawB = generateEndlessLevel(seed, depth);
    const rawReport = inspectEndlessLevel(rawA);
    assert(rawReport.ok, `endless ${seed}/${depth}: ${rawReport.issues.join(', ')}`);
    assert(JSON.stringify(rawA.course19Blueprint) === JSON.stringify(rawB.course19Blueprint), `endless ${seed}/${depth}: nondeterministic scenario`);
    const level = compileCourse19(rawA);
    const report = inspectCourse19(level);
    assert(report.ok, `compiled ${seed}/${depth}: ${report.issues.join(', ')}`);
    assert(level.course18?.triangleCount === 1932, `compiled ${seed}/${depth}: unexpected mesh budget`);
    const holeClearance = Math.max(72, Number(level.hole?.r || 31) * 2.25);
    for (const wall of level.walls || []) {
      assert(wallDistanceToPoint(wall, level.hole) >= holeClearance, `compiled ${seed}/${depth}: wall blocks hole approach`);
    }
    if (level.tunnels?.length) {
      const tunnel = level.tunnels[0];
      assert(Number.isFinite(tunnel.entry.axisX) && Number.isFinite(tunnel.exit.axisY), `tunnel ${seed}/${depth}: invalid axis`);
      assert(tunnel.entry.r > 0 && tunnel.exit.r > 0, `tunnel ${seed}/${depth}: invalid trigger`);
    }
  }
}


const tunnelLevel = compileCourse19(LEVELS[7]);
const tunnel = tunnelLevel.tunnels[0];
const tunnelAxis = { x: tunnel.entry.axisX, y: tunnel.entry.axisY };
const tunnelAttempt = ({ speed, side = -1, direction = 1, stationaryInside = false }) => {
  const distance = stationaryInside ? 0 : tunnel.entry.r + 2;
  const start = {
    x: tunnel.entry.x + tunnelAxis.x * distance * side,
    y: tunnel.entry.y + tunnelAxis.y * distance * side
  };
  const ball = createBall(start, tunnelLevel);
  if (speed) strikeBall(ball, tunnelAxis.x * speed * direction, tunnelAxis.y * speed * direction);
  const events = [];
  for (let frame = 0; frame < 30; frame += 1) events.push(...stepBall(ball, tunnelLevel, 1 / 60, frame / 60));
  return events;
};
assert(!tunnelAttempt({ speed: 0, stationaryInside: true }).some((event) => event.type === 'tunnel'), 'tunnel: stationary ball teleported');
assert(tunnelAttempt({ speed: tunnel.entry.minSpeed * .5 }).some((event) => event.type === 'tunnel-blocked'), 'tunnel: slow entry was not blocked');
assert(!tunnelAttempt({ speed: tunnel.entry.minSpeed * .5 }).some((event) => event.type === 'tunnel'), 'tunnel: slow ball teleported');
assert(tunnelAttempt({ speed: tunnel.entry.minSpeed + 90 }).some((event) => event.type === 'tunnel'), 'tunnel: valid entry did not teleport');
assert(!tunnelAttempt({ speed: tunnel.entry.minSpeed + 90, side: 1, direction: -1 }).some((event) => event.type === 'tunnel'), 'tunnel: reverse entry teleported');

let campaign = createCampaignRun(0, LEVELS.length);
campaign = recordCampaignHole(campaign, LEVELS.length, 0, 6);
campaign = checkpointCampaignRun(campaign, LEVELS.length, 1, 2, { x: 10, y: 20 }, { x: 9, y: 19 });
campaign = normalizeCampaignRun(structuredClone(campaign), LEVELS.length);
assert(campaign.current === 1 && campaign.currentStrokes === 2, 'campaign: checkpoint did not survive normalization');
assert(fullCampaignTotal(campaign, LEVELS.length) == null, 'campaign: incomplete round received a total');
for (let hole = 1; hole < LEVELS.length; hole += 1) campaign = recordCampaignHole(campaign, LEVELS.length, hole, LEVELS[hole].par);
assert(fullCampaignTotal(campaign, LEVELS.length) === 6 + LEVELS.slice(1).reduce((sum, level) => sum + level.par, 0), 'campaign: full total mismatch');
let partial = createCampaignRun(8, LEVELS.length);
partial = recordCampaignHole(partial, LEVELS.length, 8, 6);
assert(fullCampaignTotal(partial, LEVELS.length) == null, 'campaign: one-hole resume counted as a full round');
assert(campaignSegmentTotal(partial, LEVELS.length) === 6, 'campaign: segment total mismatch');
const migrated = normalizeSave({ version: 2, current: 1.9, unlocked: 3.8, best: [] }, LEVELS.length);
assert(migrated.current === 1 && migrated.unlocked === 3 && migrated.campaignRun == null, 'save: legacy migration mismatch');
const endlessCheckpoint = checkpointEndlessRun({ seed: 233, depth: 4, totalStrokes: 17, startedAt: 10 }, 3, { x: 14, y: 21 }, { x: 12, y: 19 });
const restoredEndless = normalizeEndlessRun(structuredClone(endlessCheckpoint));
assert(restoredEndless.currentStrokes === 3 && restoredEndless.checkpoint.x === 14 && restoredEndless.checkpoint.safeY === 19, 'endless: checkpoint did not survive normalization');
assert(strokeWord(1) === 'удар' && strokeWord(3) === 'удара' && strokeWord(11) === 'ударов', 'copy: stroke plural mismatch');
assert(sectionWord(21) === 'секция' && sectionWord(24) === 'секции', 'copy: section plural mismatch');
for (const seed of [1, 13, 233, 0xDEADBEEF]) assert(parseRunCode(formatRunCode(seed)) === (seed >>> 0), `seed ${seed}: code did not round-trip`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Moss & Marble 1.13 audit passed');
