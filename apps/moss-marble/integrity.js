import { insideZone, terrainHeightAt } from './terrain.js';

const INTEGRITY_VERSION = 1;
const MIN_ROTOR_HALF = 72;
const ROTOR_MARGIN = 12;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby;
  const t = denominator ? clamp(((px - ax) * abx + (py - ay) * aby) / denominator, 0, 1) : 0;
  return { x: ax + abx * t, y: ay + aby * t };
}

function distanceToSegment(point, a, b) {
  const nearest = closestPointOnSegment(point.x, point.y, a.x, a.y, b.x, b.y);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToOutline(point, outline) {
  let distance = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, outline[index], outline[(index + 1) % outline.length]));
  }
  return distance;
}

function obstacleRadius(obstacle) {
  return Math.max(8, Number(obstacle?.r) || 0);
}

function decorationRadius(decoration) {
  if (decoration?.type === 'leaf') return 26;
  if (decoration?.type === 'mushroom') return 18;
  if (decoration?.type === 'frog') return 16;
  return 14;
}

function changesPhysicalHeight(zone) {
  return zone?.type === 'slope' || zone?.type === 'bridge' || zone?.type === 'platform' || zone?.type === 'sand' || zone?.type === 'water';
}

function pointOnUnstableTerrain(level, point) {
  if (Math.abs(terrainHeightAt(level, point.x, point.y) - Number(level?.baseZ ?? 0)) > 1.25) return true;
  return (level.zones || []).some((zone) => changesPhysicalHeight(zone) && insideZone(point, zone));
}

function pointClear(level, point, radius, ignore = null) {
  if (!pointInPolygon(point, level.outline || [])) return false;
  if (distanceToOutline(point, level.outline || []) < radius + 28) return false;
  if (pointOnUnstableTerrain(level, point)) return false;
  if (Math.hypot(point.x - level.start.x, point.y - level.start.y) < radius + 105) return false;
  if (Math.hypot(point.x - level.hole.x, point.y - level.hole.y) < radius + level.hole.r + 56) return false;
  for (const obstacle of level.obstacles || []) {
    if (obstacle === ignore) continue;
    if (Math.hypot(point.x - obstacle.x, point.y - obstacle.y) < radius + obstacleRadius(obstacle) + 28) return false;
  }
  for (const wall of level.walls || []) {
    const distance = distanceToSegment(point, { x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by });
    if (distance < radius + Number(wall.thickness || 18) * .5 + 22) return false;
  }
  return true;
}

function findFlatPlacement(level, item, radius) {
  const origin = { x: item.x, y: item.y };
  if (pointClear(level, origin, radius, item)) return origin;
  for (let ring = 1; ring <= 8; ring += 1) {
    const distance = ring * 34;
    const samples = 12 + ring * 2;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = sample / samples * Math.PI * 2 + ring * .41;
      const candidate = { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
      if (pointClear(level, candidate, radius, item)) return candidate;
    }
  }
  return null;
}

function rotorMaximumHalf(level, rotor, acceptedRotors) {
  const center = { x: rotor.x, y: rotor.y };
  const halfThickness = Math.max(6, Number(rotor.thickness || 20) * .5);
  let maximum = Math.max(0, Number(rotor.length || 0) * .5);
  maximum = Math.min(maximum, distanceToOutline(center, level.outline || []) - halfThickness - ROTOR_MARGIN);
  maximum = Math.min(maximum, Math.hypot(center.x - level.hole.x, center.y - level.hole.y) - level.hole.r - halfThickness - 20);
  maximum = Math.min(maximum, Math.hypot(center.x - level.start.x, center.y - level.start.y) - halfThickness - 72);

  for (const obstacle of level.obstacles || []) {
    maximum = Math.min(maximum, Math.hypot(center.x - obstacle.x, center.y - obstacle.y) - obstacleRadius(obstacle) - halfThickness - ROTOR_MARGIN);
  }
  for (const wall of level.walls || []) {
    maximum = Math.min(maximum, distanceToSegment(center, { x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by }) - Number(wall.thickness || 18) * .5 - halfThickness - ROTOR_MARGIN);
  }
  for (const other of acceptedRotors) {
    maximum = Math.min(maximum, Math.hypot(center.x - other.x, center.y - other.y) - Number(other.length || 0) * .5 - Number(other.thickness || 20) * .5 - halfThickness - ROTOR_MARGIN);
  }
  return maximum;
}

function rotorConflicts(level, rotor, acceptedRotors = []) {
  const center = { x: rotor.x, y: rotor.y };
  const half = Number(rotor.length || 0) * .5;
  const halfThickness = Number(rotor.thickness || 20) * .5;
  const issues = [];
  if (distanceToOutline(center, level.outline || []) < half + halfThickness + ROTOR_MARGIN) issues.push('outline');
  for (const obstacle of level.obstacles || []) {
    if (Math.hypot(center.x - obstacle.x, center.y - obstacle.y) < half + halfThickness + obstacleRadius(obstacle) + ROTOR_MARGIN) issues.push('obstacle');
  }
  for (const wall of level.walls || []) {
    const distance = distanceToSegment(center, { x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by });
    if (distance < half + halfThickness + Number(wall.thickness || 18) * .5 + ROTOR_MARGIN) issues.push('wall');
  }
  for (const other of acceptedRotors) {
    if (Math.hypot(center.x - other.x, center.y - other.y) < half + Number(other.length || 0) * .5 + halfThickness + Number(other.thickness || 20) * .5 + ROTOR_MARGIN) issues.push('rotor');
  }
  if (Math.hypot(center.x - level.hole.x, center.y - level.hole.y) < half + halfThickness + level.hole.r + 20) issues.push('hole');
  return issues;
}

export function stabilizeLevelGeometry(level) {
  if (!level || level.__integrityVersion === INTEGRITY_VERSION) return level;
  const report = { movedObstacles: 0, removedObstacles: 0, movedRotors: 0, shortenedRotors: 0, removedRotors: 0, removedDecorations: 0 };

  const stableObstacles = [];
  for (const obstacle of level.obstacles || []) {
    if (pointOnUnstableTerrain(level, obstacle)) {
      const placement = findFlatPlacement(level, obstacle, obstacleRadius(obstacle));
      if (!placement) {
        report.removedObstacles += 1;
        continue;
      }
      obstacle.x = placement.x;
      obstacle.y = placement.y;
      report.movedObstacles += 1;
    }
    stableObstacles.push(obstacle);
  }
  level.obstacles = stableObstacles;

  const acceptedRotors = [];
  for (const rotor of level.rotors || []) {
    if (pointOnUnstableTerrain(level, rotor)) {
      const placement = findFlatPlacement(level, rotor, Math.max(34, Number(rotor.thickness || 20)));
      if (!placement) {
        report.removedRotors += 1;
        continue;
      }
      rotor.x = placement.x;
      rotor.y = placement.y;
      report.movedRotors += 1;
    }
    const requestedHalf = Math.max(0, Number(rotor.length || 0) * .5);
    const safeHalf = rotorMaximumHalf(level, rotor, acceptedRotors);
    if (safeHalf < MIN_ROTOR_HALF) {
      report.removedRotors += 1;
      continue;
    }
    const finalHalf = Math.min(requestedHalf, safeHalf);
    if (finalHalf < requestedHalf - .5) report.shortenedRotors += 1;
    rotor.length = finalHalf * 2;
    acceptedRotors.push(rotor);
  }
  level.rotors = acceptedRotors;

  level.decorations = (level.decorations || []).filter((decoration) => {
    const radius = decorationRadius(decoration);
    const conflicts = acceptedRotors.some((rotor) => {
      const sweep = Number(rotor.length || 0) * .5 + Number(rotor.thickness || 20) * .5;
      return Math.hypot(decoration.x - rotor.x, decoration.y - rotor.y) < sweep + radius + 8;
    });
    if (conflicts) report.removedDecorations += 1;
    return !conflicts;
  });

  try {
    Object.defineProperty(level, '__integrityVersion', { value: INTEGRITY_VERSION, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(level, '__integrityReport', { value: report, writable: true, configurable: true, enumerable: false });
  } catch {
    level.__integrityVersion = INTEGRITY_VERSION;
    level.__integrityReport = report;
  }
  return level;
}

export function inspectLevelIntegrity(level) {
  const rotorIssues = [];
  const accepted = [];
  for (const rotor of level?.rotors || []) {
    const issues = rotorConflicts(level, rotor, accepted);
    if (issues.length) rotorIssues.push({ rotor, issues: [...new Set(issues)] });
    accepted.push(rotor);
  }
  const elevatedObstacles = (level?.obstacles || []).filter((obstacle) => pointOnUnstableTerrain(level, obstacle));
  const elevatedRotors = (level?.rotors || []).filter((rotor) => pointOnUnstableTerrain(level, rotor));
  return {
    ok: rotorIssues.length === 0 && elevatedObstacles.length === 0 && elevatedRotors.length === 0,
    rotorIssues,
    elevatedObstacles,
    elevatedRotors,
    report: level?.__integrityReport || null
  };
}
