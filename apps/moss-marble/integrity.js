import { insideZone, terrainHeightAt, zoneKind } from './terrain.js';

const INTEGRITY_VERSION = 2;
const MIN_ROTOR_HALF = 72;
const ROTOR_MARGIN = 14;
const ROTOR_NUMERIC_BUFFER = 4;

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

export function obstacleVisualRadius(obstacle) {
  const base = Math.max(8, Number(obstacle?.r) || 0);
  if (obstacle?.material === 'cup') return base * 1.18;
  if (obstacle?.material === 'pot') return base * 1.11;
  if (obstacle?.material === 'spoon') return base * 1.14;
  if (obstacle?.material === 'wood') return base * 1.06;
  return base * 1.04;
}

function decorationRadius(decoration) {
  if (decoration?.type === 'leaf') return 26;
  if (decoration?.type === 'mushroom') return 18;
  if (decoration?.type === 'frog') return 16;
  return 14;
}

function changesPhysicalHeight(zone) {
  const kind = zoneKind(zone);
  return kind === 'slope' || kind === 'bridge' || kind === 'platform' || kind === 'sand' || kind === 'water';
}

function pointOnUnstableTerrain(level, point) {
  if (Math.abs(terrainHeightAt(level, point.x, point.y) - Number(level?.baseZ ?? 0)) > 1.25) return true;
  return (level.zones || []).some((zone) => changesPhysicalHeight(zone) && insideZone(point, zone));
}

function obstacleOverlap(point, radius, obstacles, ignore = null, gap = 34) {
  return obstacles.some((obstacle) => obstacle !== ignore && Math.hypot(point.x - obstacle.x, point.y - obstacle.y) < radius + obstacleVisualRadius(obstacle) + gap);
}

function pointClear(level, point, radius, ignore = null, acceptedObstacles = level.obstacles || []) {
  if (!pointInPolygon(point, level.outline || [])) return false;
  if (distanceToOutline(point, level.outline || []) < radius + 32) return false;
  if (pointOnUnstableTerrain(level, point)) return false;
  if (Math.hypot(point.x - level.start.x, point.y - level.start.y) < radius + 112) return false;
  if (Math.hypot(point.x - level.hole.x, point.y - level.hole.y) < radius + level.hole.r + 62) return false;
  if (obstacleOverlap(point, radius, acceptedObstacles, ignore)) return false;
  for (const wall of level.walls || []) {
    const distance = distanceToSegment(point, { x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by });
    if (distance < radius + Number(wall.thickness || 18) * .5 + 24) return false;
  }
  for (const tunnel of level.tunnels || []) {
    for (const endpoint of [tunnel.entry, tunnel.exit]) {
      if (Math.hypot(point.x - endpoint.x, point.y - endpoint.y) < radius + endpoint.r + 28) return false;
    }
  }
  return true;
}

function findFlatPlacement(level, item, radius, acceptedObstacles) {
  const origin = { x: item.x, y: item.y };
  if (pointClear(level, origin, radius, item, acceptedObstacles)) return origin;
  for (let ring = 1; ring <= 11; ring += 1) {
    const distance = ring * 34;
    const samples = 14 + ring * 3;
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = sample / samples * Math.PI * 2 + ring * .41;
      const candidate = { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
      if (pointClear(level, candidate, radius, item, acceptedObstacles)) return candidate;
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
    maximum = Math.min(maximum, Math.hypot(center.x - obstacle.x, center.y - obstacle.y) - obstacleVisualRadius(obstacle) - halfThickness - ROTOR_MARGIN);
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
    if (Math.hypot(center.x - obstacle.x, center.y - obstacle.y) < half + halfThickness + obstacleVisualRadius(obstacle) + ROTOR_MARGIN) issues.push('obstacle');
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
  const report = {
    movedObstacles: 0,
    separatedObstacles: 0,
    removedObstacles: 0,
    movedRotors: 0,
    shortenedRotors: 0,
    removedRotors: 0,
    removedDecorations: 0
  };

  const sourceObstacles = [...(level.obstacles || [])];
  const stableObstacles = [];
  for (const obstacle of sourceObstacles) {
    const radius = obstacleVisualRadius(obstacle);
    const unstable = pointOnUnstableTerrain(level, obstacle);
    const overlaps = obstacleOverlap(obstacle, radius, stableObstacles, obstacle);
    if (unstable || overlaps || !pointClear(level, obstacle, radius, obstacle, stableObstacles)) {
      const placement = findFlatPlacement(level, obstacle, radius, stableObstacles);
      if (!placement) {
        report.removedObstacles += 1;
        continue;
      }
      obstacle.x = placement.x;
      obstacle.y = placement.y;
      report.movedObstacles += 1;
      if (overlaps) report.separatedObstacles += 1;
    }
    stableObstacles.push(obstacle);
  }
  level.obstacles = stableObstacles;

  const acceptedRotors = [];
  for (const rotor of level.rotors || []) {
    if (pointOnUnstableTerrain(level, rotor)) {
      const placement = findFlatPlacement(level, rotor, Math.max(34, Number(rotor.thickness || 20)), stableObstacles);
      if (!placement) {
        report.removedRotors += 1;
        continue;
      }
      rotor.x = placement.x;
      rotor.y = placement.y;
      report.movedRotors += 1;
    }
    const requestedHalf = Math.max(0, Number(rotor.length || 0) * .5);
    const bufferedSafeHalf = rotorMaximumHalf(level, rotor, acceptedRotors) - ROTOR_NUMERIC_BUFFER;
    if (bufferedSafeHalf < MIN_ROTOR_HALF) {
      report.removedRotors += 1;
      continue;
    }
    const finalHalf = Math.min(requestedHalf, bufferedSafeHalf);
    if (finalHalf < requestedHalf - .5) report.shortenedRotors += 1;
    rotor.length = finalHalf * 2;
    acceptedRotors.push(rotor);
  }
  level.rotors = acceptedRotors;

  level.decorations = (level.decorations || []).filter((decoration) => {
    const radius = decorationRadius(decoration);
    const rotorConflict = acceptedRotors.some((rotor) => {
      const sweep = Number(rotor.length || 0) * .5 + Number(rotor.thickness || 20) * .5;
      return Math.hypot(decoration.x - rotor.x, decoration.y - rotor.y) < sweep + radius + 8;
    });
    const objectConflict = stableObstacles.some((obstacle) => Math.hypot(decoration.x - obstacle.x, decoration.y - obstacle.y) < radius + obstacleVisualRadius(obstacle) * .78);
    if (rotorConflict || objectConflict) report.removedDecorations += 1;
    return !rotorConflict && !objectConflict;
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
  const overlappingObstacles = [];
  const obstacles = level?.obstacles || [];
  for (let a = 0; a < obstacles.length; a += 1) {
    for (let b = a + 1; b < obstacles.length; b += 1) {
      const distance = Math.hypot(obstacles[a].x - obstacles[b].x, obstacles[a].y - obstacles[b].y);
      if (distance < obstacleVisualRadius(obstacles[a]) + obstacleVisualRadius(obstacles[b]) + 24) overlappingObstacles.push([a, b]);
    }
  }
  return {
    ok: rotorIssues.length === 0 && elevatedObstacles.length === 0 && elevatedRotors.length === 0 && overlappingObstacles.length === 0,
    rotorIssues,
    elevatedObstacles,
    elevatedRotors,
    overlappingObstacles,
    report: level?.__integrityReport || null
  };
}
