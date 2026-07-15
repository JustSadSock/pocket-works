import { upgradeCourse19InPlace } from './course19.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function runtimeField(level) {
  if (level && typeof level === 'object' && !level.course18?.field) upgradeCourse19InPlace(level);
  return level?.course18?.field || null;
}

export function zoneKind(zone) {
  return zone?.physicsType || zone?.type;
}

export function insideZone(point, zone) {
  if (!zone) return false;
  if (zone.shape === 'circle') return Math.hypot(point.x - zone.x, point.y - zone.y) <= zone.r;
  if (zone.shape === 'poly' && Array.isArray(zone.points)) {
    let inside = false;
    for (let index = 0, previous = zone.points.length - 1; index < zone.points.length; previous = index++) {
      const a = zone.points[index];
      const b = zone.points[previous];
      const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }
  return point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h;
}

export function zonesAt(level, x, y) {
  const point = { x, y };
  return (level?.zones || []).filter((zone) => insideZone(point, zone));
}

export function zoneCenter(zone) {
  if (zone.shape === 'circle') return { x: zone.x, y: zone.y };
  if (zone.shape === 'poly' && Array.isArray(zone.points) && zone.points.length) {
    return zone.points.reduce((sum, point) => ({ x: sum.x + point.x / zone.points.length, y: sum.y + point.y / zone.points.length }), { x: 0, y: 0 });
  }
  return { x: zone.x + zone.w * .5, y: zone.y + zone.h * .5 };
}

function zoneBounds(zone) {
  if (zone.shape === 'circle') return { x: zone.x - zone.r, y: zone.y - zone.r, w: zone.r * 2, h: zone.r * 2 };
  if (zone.shape === 'poly' && zone.points?.length) {
    const xs = zone.points.map((point) => point.x);
    const ys = zone.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
  }
  return { x: zone.x, y: zone.y, w: Math.max(1, zone.w || 1), h: Math.max(1, zone.h || 1) };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function distanceToZoneEdge(point, zone) {
  if (zone.shape === 'circle') return Math.max(0, zone.r - Math.hypot(point.x - zone.x, point.y - zone.y));
  if (zone.shape === 'poly' && zone.points?.length) {
    let distance = Infinity;
    for (let index = 0; index < zone.points.length; index += 1) {
      distance = Math.min(distance, distanceToSegment(point, zone.points[index], zone.points[(index + 1) % zone.points.length]));
    }
    return distance;
  }
  return Math.min(point.x - zone.x, zone.x + zone.w - point.x, point.y - zone.y, zone.y + zone.h - point.y);
}

export function hillPeakHeight(zone) {
  const explicit = Number(zone?.peakHeight);
  if (Number.isFinite(explicit)) return clamp(explicit, 8, 78);
  const legacyRise = Math.hypot(Number(zone?.riseX ?? 0), Number(zone?.riseY ?? 0));
  return clamp(18 + legacyRise * .68, 18, 48);
}

export function hillPeakPoint(zone) {
  const center = zoneCenter(zone);
  const bounds = zoneBounds(zone);
  const angle = Number(zone.axisAngle ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = clamp(Number(zone.peakOffsetX ?? 0), -.42, .42) * bounds.w * .5;
  const localY = clamp(Number(zone.peakOffsetY ?? 0), -.42, .42) * bounds.h * .5;
  return { x: center.x + localX * cos - localY * sin, y: center.y + localX * sin + localY * cos };
}

export function rampHeightAt(zone, x, y) {
  const tx = clamp((x - zone.x) / Math.max(1, zone.w || 1), 0, 1);
  const ty = clamp((y - zone.y) / Math.max(1, zone.h || 1), 0, 1);
  return Number(zone.baseZ ?? 0) + tx * Number(zone.riseX ?? 0) + ty * Number(zone.riseY ?? 0);
}

export function hillHeightAt(zone, x, y) {
  const base = Number(zone.baseZ ?? 0);
  const point = { x, y };
  if (!insideZone(point, zone)) return base;
  const bounds = zoneBounds(zone);
  const peak = hillPeakPoint(zone);
  const angle = Number(zone.axisAngle ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - peak.x;
  const dy = y - peak.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const asymmetryX = clamp(Number(zone.asymmetryX ?? 0), -.62, .62);
  const asymmetryY = clamp(Number(zone.asymmetryY ?? 0), -.62, .62);
  const radiusX = Math.max(24, bounds.w * .48 * (localX >= 0 ? 1 + asymmetryX : 1 - asymmetryX));
  const radiusY = Math.max(24, bounds.h * .48 * (localY >= 0 ? 1 + asymmetryY : 1 - asymmetryY));
  const power = clamp(Number(zone.shapePower ?? 2), 1.25, 3.5);
  const normalized = Math.pow(Math.pow(Math.abs(localX) / radiusX, power) + Math.pow(Math.abs(localY) / radiusY, power), 1 / power);
  if (normalized >= 1.18) return base;
  const radialCrown = clamp(1 - normalized, 0, 1);
  const falloff = clamp(Number(zone.falloff ?? 1.65), .8, 3.2);
  const edgeSoftness = clamp(Number(zone.edgeSoftness ?? Math.min(bounds.w, bounds.h) * .24), 18, 90);
  const edge = clamp(distanceToZoneEdge(point, zone) / edgeSoftness, 0, 1);
  const edgeBlend = edge * edge * (3 - 2 * edge);
  return base + hillPeakHeight(zone) * Math.pow(radialCrown, falloff) * edgeBlend;
}

function slopeHeight(zone, x, y) {
  return zone.ramp ? rampHeightAt(zone, x, y) : hillHeightAt(zone, x, y);
}

export function terrainHeightAt(level, x, y) {
  const field = runtimeField(level);
  if (field?.heightAt) return field.heightAt(x, y);
  let height = Number(level?.baseZ ?? 0);
  const point = { x, y };
  for (const zone of level?.zones || []) {
    if (!insideZone(point, zone)) continue;
    const kind = zoneKind(zone);
    if (kind === 'bridge') height = Math.max(height, Number(zone.height ?? 10));
    else if (kind === 'sand') height = Math.max(height, Number(zone.surfaceZ ?? .28));
    else if (kind === 'slope') height = Math.max(height, slopeHeight(zone, x, y));
    else if (kind === 'platform') height = Math.max(height, Number(zone.height ?? 0));
  }
  return height;
}

export function terrainGradientAt(level, x, y) {
  const field = runtimeField(level);
  if (field?.gradientAt) return field.gradientAt(x, y);
  const point = { x, y };
  let gradient = { x: 0, y: 0 };
  for (const zone of level?.zones || []) {
    if (zoneKind(zone) !== 'slope' || !insideZone(point, zone)) continue;
    if (zone.ramp) {
      gradient = { x: Number(zone.riseX ?? 0) / Math.max(1, zone.w || 1), y: Number(zone.riseY ?? 0) / Math.max(1, zone.h || 1) };
      continue;
    }
    const epsilon = 2.5;
    gradient = {
      x: (hillHeightAt(zone, x + epsilon, y) - hillHeightAt(zone, x - epsilon, y)) / (epsilon * 2),
      y: (hillHeightAt(zone, x, y + epsilon) - hillHeightAt(zone, x, y - epsilon)) / (epsilon * 2)
    };
  }
  return gradient;
}

export function surfaceAt(level, x, y) {
  const field = runtimeField(level);
  if (field?.surfaceAt) return field.surfaceAt(x, y);
  const point = { x, y };
  let surface = 'grass';
  for (const zone of level?.zones || []) {
    if (!insideZone(point, zone)) continue;
    const kind = zoneKind(zone);
    if (kind === 'bridge') return 'bridge';
    if (kind === 'water') surface = 'water';
    else if (kind === 'sand') surface = 'sand';
    else if (kind === 'moss') surface = 'moss';
    else if (kind === 'slope') surface = zone.ramp ? 'ramp' : 'slope';
  }
  return surface;
}

export function rampAt(level, x, y) {
  const field = runtimeField(level);
  if (field?.rampAt) return field.rampAt(x, y);
  const point = { x, y };
  return (level?.zones || []).find((zone) => zoneKind(zone) === 'slope' && zone.ramp && insideZone(point, zone)) || null;
}

export function waterAt(level, x, y) {
  const field = runtimeField(level);
  if (field?.surfaceAt) return field.surfaceAt(x, y) === 'water';
  const point = { x, y };
  let water = false;
  for (const zone of level?.zones || []) {
    if (!insideZone(point, zone)) continue;
    const kind = zoneKind(zone);
    if (kind === 'water') water = true;
    if (kind === 'bridge') water = false;
  }
  return water;
}
