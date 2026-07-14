const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value ?? 'moss')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function mulberry32(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
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

function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function distanceToOutline(point, outline) {
  let distance = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    const nearest = closestPointOnSegment(point, outline[index], outline[(index + 1) % outline.length]);
    distance = Math.min(distance, Math.hypot(point.x - nearest.x, point.y - nearest.y));
  }
  return distance;
}

function inferCenterline(level) {
  if (Array.isArray(level.centerline) && level.centerline.length >= 2) return level.centerline.map((point) => ({ ...point }));
  const outline = level.outline || [];
  if (outline.length >= 8 && outline.length % 2 === 0) {
    const half = outline.length / 2;
    const line = [];
    for (let index = 0; index < half; index += 1) {
      const a = outline[index];
      const b = outline[outline.length - 1 - index];
      line.push({ x: (a.x + b.x) * .5, y: (a.y + b.y) * .5 });
    }
    return line;
  }
  return [level.start, level.hole].filter(Boolean).map((point) => ({ x: point.x, y: point.y }));
}

function routeMetrics(centerline) {
  const lengths = [0];
  let total = 0;
  for (let index = 1; index < centerline.length; index += 1) {
    total += Math.hypot(centerline[index].x - centerline[index - 1].x, centerline[index].y - centerline[index - 1].y);
    lengths.push(total);
  }
  return { lengths, total: Math.max(1, total) };
}

function sampleRoute(centerline, metrics, progress) {
  const target = clamp(progress, 0, 1) * metrics.total;
  let index = 1;
  while (index < metrics.lengths.length && metrics.lengths[index] < target) index += 1;
  index = clamp(index, 1, centerline.length - 1);
  const a = centerline[index - 1];
  const b = centerline[index];
  const segmentStart = metrics.lengths[index - 1];
  const segmentLength = Math.max(1, metrics.lengths[index] - segmentStart);
  const t = clamp((target - segmentStart) / segmentLength, 0, 1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    tx: dx / length,
    ty: dy / length,
    nx: -dy / length,
    ny: dx / length
  };
}

function nearestProgress(centerline, metrics, point) {
  let bestT = .5;
  let bestDistance = Infinity;
  const steps = Math.max(48, centerline.length * 18);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const sample = sampleRoute(centerline, metrics, t);
    const distance = Math.hypot(point.x - sample.x, point.y - sample.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
    }
  }
  return bestT;
}

function boundsOf(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

function fitInside(points, outline, center) {
  let fitted = points;
  for (let pass = 0; pass < 8 && fitted.some((point) => !pointInPolygon(point, outline)); pass += 1) {
    fitted = fitted.map((point) => ({ x: lerp(center.x, point.x, .88), y: lerp(center.y, point.y, .88) }));
  }
  return fitted;
}

function makeBlob({ center, angle, length, width, bend = 0, taperStart = .72, taperEnd = .72, seed, outline }) {
  const random = mulberry32(seed);
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const nx = -ty;
  const ny = tx;
  const segments = 8;
  const left = [];
  const right = [];
  for (let index = 0; index <= segments; index += 1) {
    const u = index / segments;
    const longitudinal = (u - .5) * length;
    const cap = Math.pow(Math.sin(Math.PI * u), .58);
    const taper = lerp(taperStart, taperEnd, u);
    const half = width * .5 * (.30 + .70 * cap) * taper * (.94 + random() * .12);
    const curve = Math.sin((u - .5) * Math.PI) * bend + (random() - .5) * width * .025;
    const baseX = center.x + tx * longitudinal + nx * curve;
    const baseY = center.y + ty * longitudinal + ny * curve;
    left.push({ x: baseX + nx * half, y: baseY + ny * half });
    right.push({ x: baseX - nx * half, y: baseY - ny * half });
  }
  const points = fitInside([...left, ...right.reverse()], outline, center);
  return { points, ...boundsOf(points) };
}

function rectBlob(zone, seed, outline) {
  const center = { x: zone.x + zone.w * .5, y: zone.y + zone.h * .5 };
  const angle = zone.w >= zone.h ? 0 : Math.PI * .5;
  return makeBlob({
    center,
    angle,
    length: Math.max(zone.w, zone.h),
    width: Math.min(zone.w, zone.h),
    bend: Math.min(zone.w, zone.h) * .10,
    seed,
    outline
  });
}

const AUTHORED_LAYOUTS = {
  1: [
    { type: 'moss', t: .29, side: -.46, length: 350, width: 150, bend: 28, angle: -.12 },
    { type: 'sand', t: .69, side: .44, length: 370, width: 118, bend: -32, angle: .42 }
  ],
  2: [
    { type: 'sand', t: .52, side: .18, length: 390, width: 132, bend: 34, angle: -.34 },
    { type: 'moss', t: .79, side: -.50, length: 300, width: 130, bend: -22, angle: .16 }
  ],
  3: [
    { type: 'sand', t: .29, side: -.50, length: 285, width: 96, bend: 22, angle: .58 },
    { type: 'sand', t: .41, side: .47, length: 250, width: 92, bend: -24, angle: -.54 },
    { type: 'moss', t: .59, side: -.56, length: 345, width: 122, bend: 36, angle: .08 },
    { type: 'moss', t: .79, side: .50, length: 275, width: 105, bend: -22, angle: -.12 }
  ],
  4: [
    { type: 'moss', t: .51, side: -.53, length: 390, width: 145, bend: 44, angle: .06 },
    { type: 'sand', t: .76, side: .42, length: 245, width: 88, bend: -18, angle: .38 }
  ],
  5: [
    { type: 'sand', t: .25, side: -.52, length: 235, width: 88, bend: 12, angle: .42 },
    { type: 'moss', t: .75, side: .51, length: 320, width: 126, bend: -30, angle: -.10 }
  ],
  6: [
    { type: 'slope', t: .29, side: -.10, length: 355, width: 235, bend: 28, angle: .06, peakHeight: 47, asymmetryX: .48, asymmetryY: -.16, peakOffsetX: .20, falloff: 1.38 },
    { type: 'slope', t: .52, side: .30, length: 320, width: 205, bend: -34, angle: -.12, peakHeight: 29, asymmetryX: -.34, asymmetryY: .28, peakOffsetX: -.20, peakOffsetY: .10, falloff: 1.85 },
    { type: 'slope', t: .71, side: -.43, length: 285, width: 175, bend: 25, angle: .20, peakHeight: 36, asymmetryX: .18, asymmetryY: .46, peakOffsetY: -.20, falloff: 1.55 },
    { type: 'sand', t: .85, side: .34, length: 260, width: 96, bend: -20, angle: -.24 }
  ],
  7: [
    { type: 'slope', t: .31, side: -.28, length: 300, width: 185, bend: 22, angle: -.14, peakHeight: 27, asymmetryX: .42, peakOffsetX: .18, falloff: 1.72 },
    { type: 'sand', t: .46, side: 0, length: 400, width: 108, bend: 38, angle: .74 },
    { type: 'moss', t: .63, side: .55, length: 330, width: 126, bend: -34, angle: -.12 }
  ],
  8: [
    { type: 'sand', t: .36, side: -.53, length: 250, width: 90, bend: 20, angle: .34 },
    { type: 'moss', t: .76, side: .52, length: 315, width: 122, bend: -28, angle: -.10 }
  ],
  9: [
    { type: 'slope', t: .48, side: -.18, length: 390, width: 250, bend: 38, angle: .05, peakHeight: 50, asymmetryX: -.44, asymmetryY: .34, peakOffsetX: -.18, peakOffsetY: .12, falloff: 1.42 },
    { type: 'moss', t: .66, side: .51, length: 300, width: 122, bend: -30, angle: -.14 },
    { type: 'sand', t: .85, side: -.34, length: 270, width: 94, bend: 18, angle: .30 }
  ]
};

function makeZone(level, centerline, metrics, descriptor, seed) {
  const sample = sampleRoute(centerline, metrics, descriptor.t);
  const halfWidth = clamp(distanceToOutline(sample, level.outline) * .90, 105, 350);
  const offset = descriptor.side * halfWidth;
  const center = { x: sample.x + sample.nx * offset, y: sample.y + sample.ny * offset };
  const angle = Math.atan2(sample.ty, sample.tx) + Number(descriptor.angle || 0);
  const blob = makeBlob({
    center,
    angle,
    length: descriptor.length,
    width: descriptor.width,
    bend: Number(descriptor.bend || 0),
    taperStart: descriptor.taperStart ?? .78,
    taperEnd: descriptor.taperEnd ?? .78,
    seed,
    outline: level.outline
  });
  const zone = {
    shape: 'poly',
    type: descriptor.type,
    physicsType: descriptor.type,
    ...blob,
    baseZ: 0
  };
  if (descriptor.type === 'sand') zone.surfaceZ = .28;
  if (descriptor.type === 'slope') {
    Object.assign(zone, {
      peakHeight: descriptor.peakHeight ?? 24,
      axisAngle: angle,
      asymmetryX: descriptor.asymmetryX ?? 0,
      asymmetryY: descriptor.asymmetryY ?? 0,
      peakOffsetX: descriptor.peakOffsetX ?? 0,
      peakOffsetY: descriptor.peakOffsetY ?? 0,
      falloff: descriptor.falloff ?? 1.65,
      shapePower: descriptor.shapePower ?? 2.05,
      edgeSoftness: descriptor.edgeSoftness ?? Math.min(58, descriptor.width * .25)
    });
  }
  return zone;
}

function organicizeStructural(level, zone, seed) {
  if (zone.type === 'bridge' || (zone.type === 'slope' && zone.ramp) || zone.type === 'platform') return { ...zone };
  if (zone.type !== 'water') return null;
  const blob = zone.shape === 'poly' && zone.points?.length >= 6
    ? { points: zone.points.map((point) => ({ ...point })), ...boundsOf(zone.points) }
    : rectBlob(zone, seed, level.outline);
  return { ...zone, shape: 'poly', ...blob, physicsType: zone.type };
}

function endlessDescriptors(level, random) {
  const depth = Math.max(0, Number(level.endless?.depth ?? level.section - 1) || 0);
  const sceneCount = clamp(1 + Math.floor(depth / 3), 1, 4);
  const descriptors = [];
  for (let index = 0; index < sceneCount; index += 1) {
    const t = .22 + index * (.58 / Math.max(1, sceneCount - 1)) + (random() - .5) * .055;
    const side = random() > .5 ? 1 : -1;
    const scene = Math.floor(random() * 4);
    if (scene === 0) {
      descriptors.push(
        { type: 'sand', t: t - .025, side: side * .56, length: 220 + random() * 70, width: 82 + random() * 25, bend: side * 24, angle: side * .52 },
        { type: 'moss', t: t + .035, side: -side * .54, length: 260 + random() * 80, width: 105 + random() * 30, bend: -side * 30, angle: -side * .10 }
      );
    } else if (scene === 1) {
      descriptors.push(
        { type: 'slope', t, side: side * .18, length: 285 + random() * 90, width: 180 + random() * 65, bend: side * 30, angle: side * .12, peakHeight: 22 + random() * Math.min(31, 12 + depth * 2), asymmetryX: side * (.28 + random() * .28), asymmetryY: (random() - .5) * .52, peakOffsetX: side * (.10 + random() * .16), falloff: 1.3 + random() * .75 },
        { type: 'sand', t: t + .045, side: -side * .54, length: 210 + random() * 55, width: 78 + random() * 22, bend: -side * 18, angle: -side * .35 }
      );
    } else if (scene === 2) {
      descriptors.push(
        { type: 'sand', t: t - .018, side: side * .64, length: 255 + random() * 60, width: 74 + random() * 20, bend: side * 12, angle: side * .78, taperEnd: .52 },
        { type: 'sand', t: t + .018, side: -side * .64, length: 255 + random() * 60, width: 74 + random() * 20, bend: -side * 12, angle: -side * .78, taperStart: .52 }
      );
    } else {
      descriptors.push(
        { type: 'slope', t, side: 0, length: 300 + random() * 75, width: 205 + random() * 55, bend: (random() - .5) * 45, angle: (random() - .5) * .18, peakHeight: 18 + random() * Math.min(28, 10 + depth * 1.6), asymmetryX: (random() - .5) * .72, asymmetryY: (random() - .5) * .72, peakOffsetX: (random() - .5) * .30, peakOffsetY: (random() - .5) * .22, falloff: 1.45 + random() * .65 },
        { type: 'moss', t: t + .055, side: side * .56, length: 230 + random() * 75, width: 96 + random() * 28, bend: side * 28, angle: side * .08 }
      );
    }
  }
  return descriptors.slice(0, 8);
}

function organizeEndlessObstacles(level, centerline, metrics, seed) {
  const obstacles = level.obstacles || [];
  for (let index = 0; index < obstacles.length; index += 1) {
    const obstacle = obstacles[index];
    const t = .17 + (index + 1) / (obstacles.length + 1) * .66;
    const sample = sampleRoute(centerline, metrics, t);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) * .88, 110, 330);
    const side = ((seed + index) & 1) ? 1 : -1;
    const offset = Math.min(halfWidth * (.48 + (index % 3) * .05), halfWidth - obstacle.r - 34);
    obstacle.x = sample.x + sample.nx * side * offset;
    obstacle.y = sample.y + sample.ny * side * offset;
  }

  if ((level.walls || []).length === 2) {
    const midpoint = {
      x: (level.walls[0].ax + level.walls[0].bx + level.walls[1].ax + level.walls[1].bx) * .25,
      y: (level.walls[0].ay + level.walls[0].by + level.walls[1].ay + level.walls[1].by) * .25
    };
    const t = nearestProgress(centerline, metrics, midpoint);
    const sample = sampleRoute(centerline, metrics, t);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) * .86, 120, 330);
    const gap = 72 + (seed % 35);
    const material = level.walls[0].material || 'wood';
    const thickness = Math.max(16, level.walls[0].thickness || 18);
    level.walls = [
      { ax: sample.x + sample.nx * (-halfWidth + 18), ay: sample.y + sample.ny * (-halfWidth + 18), bx: sample.x - sample.nx * gap, by: sample.y - sample.ny * gap, thickness, material },
      { ax: sample.x + sample.nx * gap, ay: sample.y + sample.ny * gap, bx: sample.x + sample.nx * (halfWidth - 18), by: sample.y + sample.ny * (halfWidth - 18), thickness, material }
    ];
  }
}

function orientTunnels(level, centerline, metrics) {
  for (const tunnel of level.tunnels || []) {
    for (const [key, fallbackT] of [['entry', .18], ['exit', .78]]) {
      const endpoint = tunnel[key];
      if (!endpoint) continue;
      const t = nearestProgress(centerline, metrics, endpoint) || fallbackT;
      const sample = sampleRoute(centerline, metrics, t);
      endpoint.angle = Math.atan2(sample.ty, sample.tx);
      endpoint.r = clamp(Number(endpoint.r || 44), 38, 52);
      endpoint.approachX = sample.tx;
      endpoint.approachY = sample.ty;
    }
    if (tunnel.exit) tunnel.exit.angle = Number.isFinite(tunnel.exit.angle) ? tunnel.exit.angle : 0;
  }
}

export function upgradeCourseLevel17(level) {
  if (!level || typeof level !== 'object' || level.__course17) return level;
  const centerline = inferCenterline(level);
  if (centerline.length < 2 || !Array.isArray(level.outline) || level.outline.length < 3) return level;
  const metrics = routeMetrics(centerline);
  const seed = hashSeed(`${level.id}:${level.endless?.seed ?? ''}:${level.endless?.depth ?? ''}`);
  const random = mulberry32(seed);
  const structural = (level.zones || [])
    .map((zone, index) => organicizeStructural(level, zone, seed + index * 97))
    .filter(Boolean);

  const descriptors = level.endless
    ? endlessDescriptors(level, random)
    : (AUTHORED_LAYOUTS[level.id] || (level.zones || []).filter((zone) => !['water', 'bridge'].includes(zone.type) && !(zone.type === 'slope' && zone.ramp)).map((zone, index) => {
      const center = zone.shape === 'circle'
        ? { x: zone.x, y: zone.y }
        : { x: zone.x + zone.w * .5, y: zone.y + zone.h * .5 };
      const t = nearestProgress(centerline, metrics, center);
      const sample = sampleRoute(centerline, metrics, t);
      const side = Math.sign((center.x - sample.x) * sample.nx + (center.y - sample.y) * sample.ny) || (index % 2 ? 1 : -1);
      return { type: zone.type, t, side: side * .46, length: Math.max(zone.w || 240, zone.h || 140) * 1.15, width: Math.min(zone.w || 240, zone.h || 140) * .68, bend: side * 22, peakHeight: zone.peakHeight };
    }));

  level.centerline = centerline;
  level.zones = [
    ...structural,
    ...descriptors.map((descriptor, index) => makeZone(level, centerline, metrics, descriptor, seed + 1009 + index * 131))
  ];

  if (level.endless) organizeEndlessObstacles(level, centerline, metrics, seed);
  orientTunnels(level, centerline, metrics);
  Object.defineProperty(level, '__course17', { value: true, configurable: true });
  return level;
}
