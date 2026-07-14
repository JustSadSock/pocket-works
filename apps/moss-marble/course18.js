const TAU = Math.PI * 2;
const STRIDE = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const COURSE18_IDS = new Set([1, 6, 8]);
const cache = new WeakMap();

const COLORS = {
  grass: [0.38, 0.52, 0.27, 1],
  grassLight: [0.53, 0.64, 0.35, 1],
  moss: [0.17, 0.35, 0.18, 1],
  mossLight: [0.29, 0.47, 0.23, 1],
  sand: [0.73, 0.60, 0.35, 1],
  sandLight: [0.87, 0.75, 0.48, 1],
  water: [0.19, 0.43, 0.42, 0.82]
};

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value ?? 'course18')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function noise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

function distanceToOutline(point, outline) {
  let distance = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    const nearest = closestPointOnSegment(point, outline[index], outline[(index + 1) % outline.length]);
    distance = Math.min(distance, Math.hypot(point.x - nearest.x, point.y - nearest.y));
  }
  return distance;
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

function catmullRom(a, b, c, d, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: .5 * ((2 * b.x) + (-a.x + c.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * t3),
    y: .5 * ((2 * b.y) + (-a.y + c.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (-a.y + 3 * b.y - 3 * c.y + d.y) * t3)
  };
}

function sampleSpline(points, progress) {
  if (points.length < 2) return { x: points[0]?.x || 0, y: points[0]?.y || 0, tx: 0, ty: -1, nx: 1, ny: 0 };
  const scaled = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const a = points[Math.max(0, index - 1)];
  const b = points[index];
  const c = points[index + 1];
  const d = points[Math.min(points.length - 1, index + 2)];
  const position = catmullRom(a, b, c, d, t);
  const epsilon = .0025;
  const before = catmullRom(a, b, c, d, clamp(t - epsilon, 0, 1));
  const after = catmullRom(a, b, c, d, clamp(t + epsilon, 0, 1));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  return { ...position, tx: dx / length, ty: dy / length, nx: -dy / length, ny: dx / length };
}

function routePoint(level, t, side = 0) {
  const sample = sampleSpline(level.centerline, t);
  const halfWidth = clamp(distanceToOutline(sample, level.outline) - 24, 92, 350);
  return {
    x: sample.x + sample.nx * side * halfWidth,
    y: sample.y + sample.ny * side * halfWidth,
    tx: sample.tx,
    ty: sample.ty,
    nx: sample.nx,
    ny: sample.ny,
    halfWidth,
    angle: Math.atan2(sample.ty, sample.tx)
  };
}

function localPoint(feature, level) {
  const base = routePoint(level, feature.t, feature.side || 0);
  const angle = base.angle + Number(feature.angle || 0);
  return { ...base, angle, cos: Math.cos(angle), sin: Math.sin(angle) };
}

function ellipseMetric(x, y, feature) {
  const dx = x - feature.x;
  const dy = y - feature.y;
  const localX = dx * feature.cos + dy * feature.sin;
  const localY = -dx * feature.sin + dy * feature.cos;
  const ax = Math.max(1, feature.length * .5);
  const ay = Math.max(1, feature.width * .5);
  return { localX, localY, radius: Math.sqrt((localX * localX) / (ax * ax) + (localY * localY) / (ay * ay)) };
}

function segmentMetric(x, y, feature) {
  const nearest = closestPointOnSegment({ x, y }, feature.a, feature.b);
  return { distance: Math.hypot(x - nearest.x, y - nearest.y), t: nearest.t };
}

function resolveFeature(level, feature) {
  if (feature.a && feature.b) {
    const a = routePoint(level, feature.a.t, feature.a.side || 0);
    const b = routePoint(level, feature.b.t, feature.b.side || 0);
    return { ...feature, a, b };
  }
  const point = localPoint(feature, level);
  const resolved = { ...feature, x: point.x, y: point.y, angle: point.angle, cos: point.cos, sin: point.sin };
  if (resolved.ramp) {
    resolved.type = 'slope';
    resolved.shape = 'circle';
    resolved.r = Math.max(resolved.length, resolved.width) * .52;
    resolved.w = resolved.length;
    resolved.h = resolved.width;
    resolved.riseX = Math.cos(resolved.angle) * Number(resolved.height || 0) * 2;
    resolved.riseY = Math.sin(resolved.angle) * Number(resolved.height || 0) * 2;
    resolved.baseZ = 0;
  }
  return resolved;
}

function landformHeight(feature, x, y) {
  if (feature.kind === 'slope') {
    const metric = ellipseMetric(x, y, feature);
    if (metric.radius >= 1) return 0;
    const mask = Math.pow(1 - smoothstep(.72, 1, metric.radius), 1.15);
    const axis = clamp(metric.localX / Math.max(1, feature.length * .5), -1, 1);
    return Number(feature.height || 0) * axis * mask;
  }
  if (feature.kind === 'ridge') {
    const metric = segmentMetric(x, y, feature);
    const radius = metric.distance / Math.max(1, feature.width * .5);
    if (radius >= 1) return 0;
    const longitudinal = Math.sin(Math.PI * clamp(metric.t, 0, 1));
    return Number(feature.height || 0) * Math.pow(1 - radius, Number(feature.falloff || 1.6)) * Math.pow(longitudinal, .7);
  }
  const metric = ellipseMetric(x, y, feature);
  if (metric.radius >= 1) return 0;
  const crown = Math.pow(1 - metric.radius, Number(feature.falloff || 1.6));
  const asymmetry = clamp(Number(feature.asymmetry || 0), -.65, .65);
  const sideFactor = metric.localX >= 0 ? 1 + asymmetry : 1 - asymmetry;
  const amount = Number(feature.height || 0) * crown * sideFactor;
  return feature.kind === 'depression' ? -Math.abs(amount) : amount;
}

function maskWeight(mask, x, y) {
  if (mask.a && mask.b) {
    const metric = segmentMetric(x, y, mask);
    const radius = metric.distance / Math.max(1, mask.width * .5);
    const endFade = Math.min(smoothstep(0, .18, metric.t), smoothstep(1, .82, metric.t));
    return clamp((1 - smoothstep(.72, 1, radius)) * endFade, 0, 1);
  }
  return 1 - smoothstep(.70, 1, ellipseMetric(x, y, mask).radius);
}

function buildField(level, blueprint) {
  const landforms = (blueprint.landforms || []).map((feature) => resolveFeature(level, feature));
  const masks = (blueprint.surfaces || []).map((feature) => resolveFeature(level, feature));
  const ramps = landforms.filter((feature) => feature.ramp);
  const seed = hashSeed(`${level.id}:course18`);
  const heightAt = (x, y) => {
    if (!pointInPolygon({ x, y }, level.outline)) return 0;
    const edgeDistance = distanceToOutline({ x, y }, level.outline);
    let height = lerp(3.5, 12, smoothstep(0, 42, edgeDistance));
    for (const feature of landforms) height += landformHeight(feature, x, y);
    return clamp(height, 2.2, 82);
  };
  const surfaceInfoAt = (x, y) => {
    let best = { type: 'grass', weight: 0, mask: null };
    for (const mask of masks) {
      const weight = maskWeight(mask, x, y);
      if (weight > best.weight) best = { type: mask.type, weight, mask };
    }
    return best;
  };
  const surfaceAt = (x, y) => {
    const info = surfaceInfoAt(x, y);
    return info.weight > .34 ? info.type : 'grass';
  };
  const gradientAt = (x, y) => {
    const epsilon = 2.25;
    return {
      x: (heightAt(x + epsilon, y) - heightAt(x - epsilon, y)) / (epsilon * 2),
      y: (heightAt(x, y + epsilon) - heightAt(x, y - epsilon)) / (epsilon * 2)
    };
  };
  const normalAt = (x, y) => {
    const gradient = gradientAt(x, y);
    const length = Math.hypot(-gradient.x, -gradient.y, 1) || 1;
    return [-gradient.x / length, -gradient.y / length, 1 / length];
  };
  const rampAt = (x, y) => ramps.find((ramp) => ellipseMetric(x, y, ramp).radius < 1) || null;
  const colorAt = (x, y, height, normal) => {
    const info = surfaceInfoAt(x, y);
    const type = info.weight > .08 ? info.type : 'grass';
    const base = type === 'sand' ? COLORS.sand : type === 'moss' ? COLORS.moss : type === 'water' ? COLORS.water : COLORS.grass;
    const light = type === 'sand' ? COLORS.sandLight : type === 'moss' ? COLORS.mossLight : COLORS.grassLight;
    const texture = noise(x * .04, y * .04, seed);
    const variation = clamp(.16 + texture * .24 + Math.max(0, normal[2] - .84) * .12, 0, .46);
    let color = mixColor(base, light, variation);
    const cavity = clamp((12 - height) / 12, 0, 1);
    const slopeShade = clamp(.78 + normal[2] * .22 - cavity * .12, .62, 1.05);
    color = [color[0] * slopeShade, color[1] * slopeShade, color[2] * slopeShade, color[3]];
    if (info.weight > 0 && info.weight < 1) color = mixColor(COLORS.grass, color, info.weight);
    return color;
  };
  return { landforms, masks, heightAt, gradientAt, normalAt, surfaceAt, surfaceInfoAt, rampAt, colorAt };
}

function buildSurfaceMesh(level, field, along = 66, across = 13) {
  const vertices = [];
  const boundaryLeft = [];
  const boundaryRight = [];
  for (let row = 0; row < along; row += 1) {
    const t = row / (along - 1);
    const sample = sampleSpline(level.centerline, t);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) - 4, 92, 360);
    for (let column = 0; column < across; column += 1) {
      const lane = column / (across - 1) * 2 - 1;
      const bowed = Math.sign(lane) * Math.pow(Math.abs(lane), 1.04);
      const x = sample.x + sample.nx * bowed * halfWidth;
      const y = sample.y + sample.ny * bowed * halfWidth;
      const z = field.heightAt(x, y);
      vertices.push({ x, y, z });
      if (column === 0) boundaryLeft.push({ x, y });
      if (column === across - 1) boundaryRight.push({ x, y });
    }
  }
  const indexOf = (row, column) => row * across + column;
  const data = [];
  const triangles = [];
  for (let row = 0; row < along - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      const a = indexOf(row, column);
      const b = indexOf(row + 1, column);
      const c = indexOf(row + 1, column + 1);
      const d = indexOf(row, column + 1);
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  for (const triangle of triangles) {
    const center = triangle.reduce((sum, index) => ({ x: sum.x + vertices[index].x / 3, y: sum.y + vertices[index].y / 3 }), { x: 0, y: 0 });
    const surface = field.surfaceAt(center.x, center.y);
    const material = surface === 'sand' ? 8 : surface === 'moss' ? 7 : surface === 'water' ? 6 : 1;
    for (const index of triangle) {
      const vertex = vertices[index];
      const surfaceNormal = field.normalAt(vertex.x, vertex.y);
      const color = field.colorAt(vertex.x, vertex.y, vertex.z, surfaceNormal);
      data.push(vertex.x, vertex.y, vertex.z, ...surfaceNormal, ...color, material);
    }
  }
  return { data: new Float32Array(data), vertexCount: data.length / STRIDE, outline: [...boundaryLeft, ...boundaryRight.reverse()] };
}

function resolveBarrier(level, barrier, index) {
  const points = barrier.points.map((point) => routePoint(level, point.t, point.side));
  const segments = [];
  for (let cursor = 0; cursor < points.length - 1; cursor += 1) {
    segments.push({
      ax: points[cursor].x,
      ay: points[cursor].y,
      bx: points[cursor + 1].x,
      by: points[cursor + 1].y,
      thickness: barrier.width || 18,
      material: barrier.material || 'wood',
      visualHeight: barrier.height || 28,
      barrierId: `b${index}`
    });
  }
  return segments;
}

function resolveProp(level, prop, index) {
  const point = routePoint(level, prop.t, prop.side || 0);
  const radius = prop.r || 50;
  return {
    x: point.x,
    y: point.y,
    r: radius,
    material: prop.material || (prop.kind === 'stump' ? 'wood' : 'stone'),
    kind: prop.kind || 'rock',
    height: prop.height,
    rotation: prop.rotation || 0,
    parts: prop.parts?.map((part) => ({ x: part.x || 0, y: part.y || 0, r: part.r || radius * .55 })),
    propId: `p${index}`
  };
}

function resolveTunnel(level, tunnel) {
  const entryPoint = routePoint(level, tunnel.entry.t, tunnel.entry.side || 0);
  const exitPoint = routePoint(level, tunnel.exit.t, tunnel.exit.side || 0);
  const entryAngle = entryPoint.angle + Number(tunnel.entry.angle || 0);
  const exitAngle = exitPoint.angle + Number(tunnel.exit.angle || 0);
  const width = tunnel.width || 78;
  const depth = tunnel.depth || 72;
  const visualEntry = {
    x: entryPoint.x, y: entryPoint.y, r: width * .52, width, depth,
    axisX: Math.cos(entryAngle), axisY: Math.sin(entryAngle), angle: entryAngle,
    triggerDepth: depth * .46, minSpeed: tunnel.minSpeed || 90
  };
  const visualExit = {
    x: exitPoint.x, y: exitPoint.y, r: width * .52, width, depth,
    axisX: Math.cos(exitAngle), axisY: Math.sin(exitAngle), angle: exitAngle
  };
  const entry = {
    ...visualEntry,
    x: visualEntry.x + visualEntry.axisX * visualEntry.triggerDepth,
    y: visualEntry.y + visualEntry.axisY * visualEntry.triggerDepth,
    r: width * .34
  };
  const release = depth * .60 + 24;
  const exit = {
    ...visualExit,
    x: visualExit.x + visualExit.axisX * release,
    y: visualExit.y + visualExit.axisY * release,
    r: width * .34
  };
  return { entry, exit, visualEntry, visualExit, width, depth };
}

function tunnelColliders(tunnel) {
  const result = [];
  const addMouth = (endpoint, prefix) => {
    const nx = -endpoint.axisY;
    const ny = endpoint.axisX;
    const half = endpoint.width * .5;
    const sideLength = endpoint.depth * .64;
    for (const sign of [-1, 1]) {
      const sx = endpoint.x + nx * half * sign;
      const sy = endpoint.y + ny * half * sign;
      result.push({
        ax: sx,
        ay: sy,
        bx: sx + endpoint.axisX * sideLength,
        by: sy + endpoint.axisY * sideLength,
        thickness: 14,
        material: 'stone',
        visualHeight: endpoint.width * .72,
        tunnelWall: `${prefix}-${sign}`
      });
    }
  };
  addMouth(tunnel.visualEntry || tunnel.entry, 'entry');
  addMouth(tunnel.visualExit || tunnel.exit, 'exit');
  return result;
}

const BLUEPRINTS = {
  1: {
    landforms: [
      { kind: 'mound', t: .34, side: .42, length: 330, width: 245, height: 16, asymmetry: .34, falloff: 1.55 },
      { kind: 'depression', t: .69, side: -.10, length: 300, width: 155, height: 8, falloff: 1.28 },
      { kind: 'ridge', a: { t: .44, side: -.58 }, b: { t: .58, side: -.35 }, width: 185, height: 11, falloff: 1.75 }
    ],
    surfaces: [
      { type: 'sand', t: .69, side: -.10, length: 300, width: 155, angle: .10 },
      { type: 'moss', t: .46, side: .55, length: 360, width: 190, angle: -.18 }
    ],
    barriers: [
      { material: 'wood', width: 20, height: 28, points: [{ t: .31, side: .18 }, { t: .40, side: .36 }, { t: .49, side: .48 }] },
      { material: 'wood', width: 18, height: 28, points: [{ t: .76, side: -.58 }, { t: .84, side: -.28 }, { t: .90, side: -.10 }] },
      { material: 'wood', width: 18, height: 28, points: [{ t: .77, side: .58 }, { t: .85, side: .30 }, { t: .91, side: .12 }] }
    ],
    props: [
      { kind: 'rockCluster', material: 'stone', t: .43, side: -.60, r: 70, parts: [{ x: -24, y: 8, r: 44 }, { x: 27, y: -10, r: 34 }, { x: 5, y: 30, r: 29 }] },
      { kind: 'stump', material: 'wood', t: .50, side: .62, r: 66, height: 78 },
      { kind: 'rock', material: 'stone', t: .70, side: -.05, r: 18 }
    ]
  },
  6: {
    landforms: [
      { kind: 'mound', t: .25, side: -.18, length: 360, width: 260, height: 30, asymmetry: .48, falloff: 1.28 },
      { kind: 'mound', t: .48, side: .34, length: 315, width: 225, height: 20, asymmetry: -.42, falloff: 1.78 },
      { kind: 'ridge', a: { t: .58, side: -.48 }, b: { t: .72, side: -.18 }, width: 205, height: 24, falloff: 1.48 },
      { kind: 'depression', t: .82, side: .18, length: 270, width: 145, height: 8, falloff: 1.25 }
    ],
    surfaces: [
      { type: 'moss', t: .30, side: .48, length: 330, width: 190, angle: -.18 },
      { type: 'sand', t: .82, side: .18, length: 270, width: 145, angle: .18 }
    ],
    barriers: [
      { material: 'wood', width: 18, height: 27, points: [{ t: .40, side: -.62 }, { t: .50, side: -.46 }, { t: .58, side: -.22 }] },
      { material: 'wood', width: 18, height: 27, points: [{ t: .62, side: .58 }, { t: .70, side: .40 }, { t: .77, side: .18 }] }
    ],
    props: [
      { kind: 'rockCluster', material: 'stone', t: .38, side: .60, r: 62, parts: [{ x: -18, y: 3, r: 39 }, { x: 26, y: -8, r: 31 }] },
      { kind: 'stump', material: 'wood', t: .66, side: -.62, r: 58, height: 68 }
    ]
  },
  8: {
    landforms: [
      { kind: 'slope', t: .36, side: .02, length: 330, width: 210, height: 22, angle: .02, ramp: true, launch: 330, minLaunchSpeed: 350 },
      { kind: 'mound', t: .60, side: .52, length: 420, width: 285, height: 28, asymmetry: .38, falloff: 1.34 },
      { kind: 'depression', t: .72, side: -.38, length: 260, width: 155, height: 7, falloff: 1.28 }
    ],
    surfaces: [
      { type: 'sand', t: .72, side: -.38, length: 260, width: 155, angle: -.10 },
      { type: 'moss', t: .57, side: .58, length: 360, width: 190, angle: .18 }
    ],
    barriers: [
      { material: 'wood', width: 18, height: 28, points: [{ t: .26, side: -.42 }, { t: .34, side: -.34 }, { t: .43, side: -.28 }] },
      { material: 'wood', width: 18, height: 28, points: [{ t: .25, side: .42 }, { t: .34, side: .34 }, { t: .43, side: .27 }] },
      { material: 'wood', width: 18, height: 26, points: [{ t: .75, side: .55 }, { t: .84, side: .28 }, { t: .90, side: .10 }] }
    ],
    props: [
      { kind: 'rockCluster', material: 'stone', t: .58, side: -.60, r: 62, parts: [{ x: -22, y: 6, r: 37 }, { x: 24, y: -8, r: 30 }] },
      { kind: 'stump', material: 'wood', t: .70, side: .62, r: 56, height: 70 }
    ],
    tunnel: {
      width: 86,
      depth: 80,
      minSpeed: 95,
      entry: { t: .18, side: .61, angle: .08 },
      exit: { t: .62, side: .48, angle: -.02 }
    }
  }
};

function buildCompiledLevel(raw, blueprint) {
  const level = clone(raw);
  const field = buildField(level, blueprint);
  const surfaceMesh = buildSurfaceMesh(level, field);
  const barriers = (blueprint.barriers || []).flatMap((barrier, index) => resolveBarrier(level, barrier, index));
  const props = (blueprint.props || []).map((prop, index) => resolveProp(level, prop, index));
  const tunnel = blueprint.tunnel ? resolveTunnel(level, blueprint.tunnel) : null;
  const tunnelWalls = tunnel ? tunnelColliders(tunnel) : [];
  level.start = { ...level.start, z: field.heightAt(level.start.x, level.start.y) };
  level.hole = { ...level.hole, depth: Math.max(58, Number(level.hole.depth || 64)) };
  level.zones = [];
  level.obstacles = props.map((prop) => ({ ...prop }));
  level.walls = [...barriers, ...tunnelWalls];
  level.rotors = [];
  level.tunnels = tunnel ? [tunnel] : [];
  level.decorations = [];
  level.renderId = `${raw.id}:course18`;
  level.__course18 = true;
  level.course18 = {
    version: 1,
    field,
    surfaceMesh,
    barriers,
    props,
    tunnelVisuals: tunnel ? [{ entry: tunnel.visualEntry, exit: tunnel.visualExit, width: tunnel.width, depth: tunnel.depth }] : [],
    triangleCount: surfaceMesh.vertexCount / 3
  };
  return level;
}

export function isCourse18(level) {
  return Boolean(level?.__course18 && level?.course18?.field);
}

export function compileCourse18(rawLevel) {
  if (!rawLevel || typeof rawLevel !== 'object') return rawLevel;
  if (isCourse18(rawLevel)) return rawLevel;
  if (!COURSE18_IDS.has(Number(rawLevel.id)) || rawLevel.endless) return rawLevel;
  const cached = cache.get(rawLevel);
  if (cached) return cached;
  const compiled = buildCompiledLevel(rawLevel, BLUEPRINTS[Number(rawLevel.id)]);
  cache.set(rawLevel, compiled);
  return compiled;
}

export function inspectCourse18(level) {
  const issues = [];
  if (!isCourse18(level)) return { ok: false, issues: ['not-course18'] };
  const field = level.course18.field;
  for (let row = 0; row <= 24; row += 1) {
    const sample = sampleSpline(level.centerline, row / 24);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) - 18, 70, 350);
    for (let column = -4; column <= 4; column += 1) {
      const lane = column / 4;
      const x = sample.x + sample.nx * lane * halfWidth;
      const y = sample.y + sample.ny * lane * halfWidth;
      const height = field.heightAt(x, y);
      const gradient = field.gradientAt(x, y);
      if (![height, gradient.x, gradient.y].every(Number.isFinite)) issues.push('non-finite-terrain');
    }
  }
  if (!pointInPolygon(level.start, level.outline)) issues.push('start-outside');
  if (!pointInPolygon(level.hole, level.outline)) issues.push('hole-outside');
  if (level.course18.triangleCount > 12000) issues.push('triangle-budget');
  return { ok: issues.length === 0, issues, triangleCount: level.course18.triangleCount };
}

export function upgradeCourse18InPlace(level) {
  if (!level || typeof level !== 'object' || isCourse18(level)) return level;
  const compiled = compileCourse18(level);
  if (compiled === level) return level;
  for (const key of Object.keys(level)) delete level[key];
  Object.assign(level, compiled);
  return level;
}
