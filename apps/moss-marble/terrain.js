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

function slopeHeight(zone, x, y) {
  const tx = clamp((x - zone.x) / Math.max(1, zone.w || 1), 0, 1);
  const ty = clamp((y - zone.y) / Math.max(1, zone.h || 1), 0, 1);
  const riseX = Number(zone.riseX ?? 0);
  const riseY = Number(zone.riseY ?? 0);
  return Number(zone.baseZ ?? 0) + tx * riseX + ty * riseY;
}

export function terrainHeightAt(level, x, y) {
  let height = Number(level?.baseZ ?? 0);
  const point = { x, y };
  for (const zone of level?.zones || []) {
    if (!insideZone(point, zone)) continue;
    const kind = zoneKind(zone);
    if (kind === 'bridge') height = Math.max(height, Number(zone.height ?? 10));
    else if (kind === 'sand') height = Number(zone.baseZ ?? -6);
    else if (kind === 'slope') height = slopeHeight(zone, x, y);
    else if (kind === 'platform') height = Number(zone.height ?? 0);
  }
  return height;
}

export function terrainGradientAt(level, x, y) {
  const point = { x, y };
  let gradient = { x: 0, y: 0 };
  for (const zone of level?.zones || []) {
    if (zoneKind(zone) !== 'slope' || !insideZone(point, zone)) continue;
    const hasHeightGradient = Number.isFinite(Number(zone.riseX)) || Number.isFinite(Number(zone.riseY));
    gradient = hasHeightGradient
      ? {
          x: Number(zone.riseX ?? 0) / Math.max(1, zone.w || 1),
          y: Number(zone.riseY ?? 0) / Math.max(1, zone.h || 1)
        }
      : {
          x: -Number(zone.forceX ?? 0) / 960,
          y: -Number(zone.forceY ?? 0) / 960
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
