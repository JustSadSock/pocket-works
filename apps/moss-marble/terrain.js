const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    return zone.points.reduce((sum, point) => ({
      x: sum.x + point.x / zone.points.length,
      y: sum.y + point.y / zone.points.length
    }), { x: 0, y: 0 });
  }
  return { x: zone.x + zone.w * .5, y: zone.y + zone.h * .5 };
}

function zoneRadii(zone) {
  if (zone.shape === 'circle') return { rx: Math.max(1, zone.r), ry: Math.max(1, zone.r) };
  return { rx: Math.max(1, Number(zone.w || 1) * .5), ry: Math.max(1, Number(zone.h || 1) * .5) };
}

export function hillPeakHeight(zone) {
  const explicit = Number(zone?.peakHeight);
  if (Number.isFinite(explicit)) return clamp(explicit, 8, 72);
  const legacyRise = Math.hypot(Number(zone?.riseX ?? 0), Number(zone?.riseY ?? 0));
  return clamp(18 + legacyRise * .68, 18, 48);
}

export function rampHeightAt(zone, x, y) {
  const tx = clamp((x - zone.x) / Math.max(1, zone.w || 1), 0, 1);
  const ty = clamp((y - zone.y) / Math.max(1, zone.h || 1), 0, 1);
  return Number(zone.baseZ ?? 0) + tx * Number(zone.riseX ?? 0) + ty * Number(zone.riseY ?? 0);
}

export function hillHeightAt(zone, x, y) {
  const base = Number(zone.baseZ ?? 0);
  const center = zoneCenter(zone);
  const { rx, ry } = zoneRadii(zone);
  const nx = (x - center.x) / rx;
  const ny = (y - center.y) / ry;
  const radiusSq = nx * nx + ny * ny;
  if (radiusSq >= 1) return base;
  const crown = 1 - radiusSq;
  return base + hillPeakHeight(zone) * crown * crown;
}

function slopeHeight(zone, x, y) {
  return zone.ramp ? rampHeightAt(zone, x, y) : hillHeightAt(zone, x, y);
}

export function terrainHeightAt(level, x, y) {
  let height = Number(level?.baseZ ?? 0);
  const point = { x, y };
  for (const zone of level?.zones || []) {
    if (!insideZone(point, zone)) continue;
    const kind = zoneKind(zone);
    if (kind === 'bridge') height = Math.max(height, Number(zone.height ?? 10));
    else if (kind === 'sand') height = Number(zone.baseZ ?? -6);
    else if (kind === 'slope') height = Math.max(height, slopeHeight(zone, x, y));
    else if (kind === 'platform') height = Math.max(height, Number(zone.height ?? 0));
  }
  return height;
}

export function terrainGradientAt(level, x, y) {
  const point = { x, y };
  let gradient = { x: 0, y: 0 };
  for (const zone of level?.zones || []) {
    if (zoneKind(zone) !== 'slope' || !insideZone(point, zone)) continue;
    if (zone.ramp) {
      gradient = {
        x: Number(zone.riseX ?? 0) / Math.max(1, zone.w || 1),
        y: Number(zone.riseY ?? 0) / Math.max(1, zone.h || 1)
      };
      continue;
    }
    const center = zoneCenter(zone);
    const { rx, ry } = zoneRadii(zone);
    const dx = x - center.x;
    const dy = y - center.y;
    const radiusSq = dx * dx / (rx * rx) + dy * dy / (ry * ry);
    if (radiusSq >= 1) {
      gradient = { x: 0, y: 0 };
      continue;
    }
    const crown = 1 - radiusSq;
    const peak = hillPeakHeight(zone);
    gradient = {
      x: -4 * peak * dx / (rx * rx) * crown,
      y: -4 * peak * dy / (ry * ry) * crown
    };
  }
  return gradient;
}

export function surfaceAt(level, x, y) {
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
  const point = { x, y };
  return (level?.zones || []).find((zone) => zoneKind(zone) === 'slope' && zone.ramp && insideZone(point, zone)) || null;
}

export function waterAt(level, x, y) {
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
