import { compileCourse18 as compileLegacy18, isCourse18 } from './course18.js';

const STRIDE = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const LEGACY_IDS = new Set([1, 6, 8]);
const CAMPAIGN_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const cache = new WeakMap();

const COLORS = {
  grass: [0.34, 0.49, 0.25, 1],
  grassLight: [0.52, 0.64, 0.34, 1],
  grassDry: [0.45, 0.51, 0.27, 1],
  moss: [0.15, 0.34, 0.17, 1],
  mossLight: [0.30, 0.49, 0.24, 1],
  sand: [0.69, 0.55, 0.30, 1],
  sandLight: [0.87, 0.73, 0.44, 1],
  water: [0.13, 0.39, 0.40, 0.88],
  waterLight: [0.29, 0.58, 0.56, 0.88]
};

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value ?? 'course19')) {
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
  if (!Array.isArray(points) || points.length < 2) return { x: points?.[0]?.x || 0, y: points?.[0]?.y || 0, tx: 0, ty: -1, nx: 1, ny: 0 };
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
  const halfWidth = clamp(distanceToOutline(sample, level.outline) - 24, 92, 360);
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
    return {
      ...feature,
      a: routePoint(level, feature.a.t, feature.a.side || 0),
      b: routePoint(level, feature.b.t, feature.b.side || 0)
    };
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
    const mask = Math.pow(1 - smoothstep(.68, 1, metric.radius), 1.12);
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
  const directional = clamp(metric.localX / Math.max(1, feature.length * .22), -1, 1);
  const sideFactor = 1 + asymmetry * directional;
  const amount = Number(feature.height || 0) * crown * sideFactor;
  return feature.kind === 'depression' ? -Math.abs(amount) : amount;
}

function maskWeight(mask, x, y) {
  if (mask.a && mask.b) {
    const metric = segmentMetric(x, y, mask);
    const radius = metric.distance / Math.max(1, mask.width * .5);
    const endFade = Math.min(smoothstep(0, .16, metric.t), smoothstep(1, .84, metric.t));
    return clamp((1 - smoothstep(.68, 1, radius)) * endFade, 0, 1);
  }
  return 1 - smoothstep(.66, 1, ellipseMetric(x, y, mask).radius);
}

function buildField(level, blueprint) {
  const palette = { ...COLORS, ...(level.visual?.terrain || {}) };
  const landforms = (blueprint.landforms || []).map((feature) => resolveFeature(level, feature));
  const masks = (blueprint.surfaces || []).map((feature) => resolveFeature(level, feature));
  const ramps = landforms.filter((feature) => feature.ramp);
  const seed = hashSeed(`${level.id}:${level.endless?.seed || ''}:${level.endless?.depth || ''}:course19`);
  const heightAt = (x, y) => {
    if (!pointInPolygon({ x, y }, level.outline)) return 0;
    const edgeDistance = distanceToOutline({ x, y }, level.outline);
    let height = lerp(3.2, 11.5, smoothstep(0, 46, edgeDistance));
    for (const feature of landforms) height += landformHeight(feature, x, y);
    return clamp(height, -15, 88);
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
    const base = type === 'sand' ? palette.sand : type === 'moss' ? palette.moss : type === 'water' ? palette.water : palette.grass;
    const light = type === 'sand' ? palette.sandLight : type === 'moss' ? palette.mossLight : type === 'water' ? palette.waterLight : palette.grassLight;
    const texture = noise(x * .037, y * .037, seed);
    const fine = noise(x * .11, y * .11, seed + 17);
    const variation = clamp(.12 + texture * .22 + fine * .07 + Math.max(0, normal[2] - .84) * .12, 0, .48);
    let color = mixColor(base, light, variation);
    const cavity = clamp((10 - height) / 18, 0, 1);
    const slopeShade = clamp(.76 + normal[2] * .25 - cavity * .12, .60, 1.06);
    color = [color[0] * slopeShade, color[1] * slopeShade, color[2] * slopeShade, color[3]];
    if (type === 'grass' && fine > .78) color = mixColor(color, palette.grassDry, .14);
    if (info.weight > 0 && info.weight < 1) color = mixColor(palette.grass, color, info.weight);
    return color;
  };
  return { landforms, masks, heightAt, gradientAt, normalAt, surfaceAt, surfaceInfoAt, rampAt, colorAt };
}

function buildSurfaceMesh(level, field, along = 70, across = 15) {
  const vertices = [];
  const boundaryLeft = [];
  const boundaryRight = [];
  for (let row = 0; row < along; row += 1) {
    const t = row / (along - 1);
    const sample = sampleSpline(level.centerline, t);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) - 4, 92, 360);
    for (let column = 0; column < across; column += 1) {
      const lane = column / (across - 1) * 2 - 1;
      const bowed = Math.sign(lane) * Math.pow(Math.abs(lane), 1.035);
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
  for (let row = 0; row < along - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      for (const triangle of [
        [indexOf(row, column), indexOf(row + 1, column), indexOf(row + 1, column + 1)],
        [indexOf(row, column), indexOf(row + 1, column + 1), indexOf(row, column + 1)]
      ]) {
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

function resolveRotor(level, rotor, index) {
  const point = routePoint(level, rotor.t, rotor.side || 0);
  return {
    x: point.x,
    y: point.y,
    length: rotor.length || 280,
    thickness: rotor.thickness || 26,
    speed: rotor.speed || .45,
    angle: point.angle + Number(rotor.angle || 0),
    material: rotor.material || 'wood',
    rotorId: `r${index}`
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
  2: {
    theme: 'turning-cups',
    landforms: [
      { kind: 'mound', t: .27, side: -.48, length: 360, width: 250, height: 18, asymmetry: .34, falloff: 1.48 },
      { kind: 'ridge', a: { t: .39, side: .42 }, b: { t: .55, side: .20 }, width: 190, height: 15, falloff: 1.62 },
      { kind: 'depression', t: .67, side: .34, length: 320, width: 165, height: 9, angle: -.18, falloff: 1.22 },
      { kind: 'mound', t: .81, side: -.42, length: 280, width: 190, height: 13, asymmetry: -.28, falloff: 1.70 }
    ],
    surfaces: [
      { type: 'sand', t: .67, side: .34, length: 320, width: 165, angle: -.18 },
      { type: 'moss', t: .30, side: -.54, length: 350, width: 185, angle: .12 }
    ],
    barriers: [
      { material: 'wood', width: 19, height: 28, points: [{ t: .34, side: -.18 }, { t: .43, side: -.38 }, { t: .51, side: -.50 }] },
      { material: 'wood', width: 18, height: 27, points: [{ t: .72, side: -.58 }, { t: .80, side: -.34 }, { t: .88, side: -.12 }] }
    ],
    props: [
      { kind: 'stump', t: .38, side: .61, r: 72, height: 80 },
      { kind: 'rockCluster', t: .58, side: -.60, r: 68, parts: [{ x: -26, y: 4, r: 42 }, { x: 22, y: -10, r: 34 }, { x: 12, y: 25, r: 27 }] },
      { kind: 'rock', t: .82, side: .55, r: 34 }
    ]
  },
  3: {
    theme: 'moss-serpentine',
    landforms: [
      { kind: 'ridge', a: { t: .18, side: -.42 }, b: { t: .34, side: -.12 }, width: 175, height: 13, falloff: 1.55 },
      { kind: 'depression', t: .43, side: .10, length: 360, width: 145, height: 8, angle: .42, falloff: 1.20 },
      { kind: 'mound', t: .60, side: -.46, length: 330, width: 235, height: 21, asymmetry: .44, falloff: 1.42 },
      { kind: 'mound', t: .78, side: .42, length: 300, width: 210, height: 16, asymmetry: -.36, falloff: 1.64 }
    ],
    surfaces: [
      { type: 'sand', t: .43, side: .10, length: 360, width: 145, angle: .42 },
      { type: 'moss', a: { t: .52, side: -.58 }, b: { t: .72, side: -.36 }, width: 170 },
      { type: 'moss', t: .81, side: .45, length: 280, width: 160, angle: -.16 }
    ],
    barriers: [
      { material: 'wood', width: 18, height: 27, points: [{ t: .25, side: .58 }, { t: .34, side: .42 }, { t: .43, side: .26 }] },
      { material: 'wood', width: 18, height: 27, points: [{ t: .56, side: .55 }, { t: .65, side: .36 }, { t: .72, side: .17 }] },
      { material: 'wood', width: 17, height: 26, points: [{ t: .72, side: -.54 }, { t: .80, side: -.34 }, { t: .87, side: -.12 }] }
    ],
    props: [
      { kind: 'rockCluster', t: .32, side: -.35, r: 64, parts: [{ x: -18, y: 4, r: 38 }, { x: 25, y: -7, r: 31 }] },
      { kind: 'stump', t: .55, side: .62, r: 61, height: 72 },
      { kind: 'rockCluster', t: .76, side: -.58, r: 58, parts: [{ x: -16, y: 2, r: 34 }, { x: 22, y: -5, r: 28 }] }
    ]
  },
  4: {
    theme: 'brass-loop',
    landforms: [
      { kind: 'mound', t: .25, side: .38, length: 350, width: 245, height: 17, asymmetry: -.36, falloff: 1.55 },
      { kind: 'ridge', a: { t: .38, side: -.48 }, b: { t: .54, side: -.10 }, width: 195, height: 18, falloff: 1.50 },
      { kind: 'depression', t: .66, side: .45, length: 310, width: 155, height: 8, angle: -.22, falloff: 1.26 },
      { kind: 'mound', t: .82, side: -.40, length: 280, width: 205, height: 14, asymmetry: .30, falloff: 1.72 }
    ],
    surfaces: [
      { type: 'sand', t: .66, side: .45, length: 310, width: 155, angle: -.22 },
      { type: 'moss', t: .42, side: -.52, length: 360, width: 185, angle: .18 }
    ],
    barriers: [
      { material: 'wood', width: 18, height: 27, points: [{ t: .18, side: -.56 }, { t: .27, side: -.38 }, { t: .35, side: -.18 }] },
      { material: 'stone', width: 20, height: 30, points: [{ t: .70, side: -.58 }, { t: .79, side: -.34 }, { t: .87, side: -.10 }] }
    ],
    props: [
      { kind: 'rockCluster', t: .29, side: .61, r: 65, parts: [{ x: -20, y: 4, r: 39 }, { x: 24, y: -7, r: 31 }] },
      { kind: 'stump', t: .62, side: -.60, r: 59, height: 68 }
    ],
    rotors: [
      { t: .46, side: .04, length: 330, thickness: 28, speed: .58, angle: .30, material: 'brass' },
      { t: .76, side: .02, length: 285, thickness: 25, speed: -.42, angle: -.18, material: 'wood' }
    ]
  },
  5: {
    theme: 'rain-causeway',
    landforms: [
      { kind: 'depression', t: .43, side: -.52, length: 440, width: 210, height: 20, angle: .08, falloff: 1.18 },
      { kind: 'depression', t: .43, side: .52, length: 440, width: 210, height: 20, angle: -.08, falloff: 1.18 },
      { kind: 'ridge', a: { t: .30, side: 0 }, b: { t: .57, side: 0 }, width: 150, height: 10, falloff: 2.10 },
      { kind: 'mound', t: .70, side: -.42, length: 310, width: 215, height: 18, asymmetry: .38, falloff: 1.55 }
    ],
    surfaces: [
      { type: 'water', t: .43, side: -.52, length: 440, width: 205, angle: .08 },
      { type: 'water', t: .43, side: .52, length: 440, width: 205, angle: -.08 },
      { type: 'moss', t: .72, side: -.46, length: 310, width: 175, angle: .12 }
    ],
    barriers: [
      { material: 'stone', width: 18, height: 31, points: [{ t: .29, side: -.17 }, { t: .42, side: -.17 }, { t: .56, side: -.15 }] },
      { material: 'stone', width: 18, height: 31, points: [{ t: .29, side: .17 }, { t: .42, side: .17 }, { t: .56, side: .15 }] },
      { material: 'wood', width: 18, height: 27, points: [{ t: .73, side: .58 }, { t: .82, side: .34 }, { t: .89, side: .12 }] }
    ],
    props: [
      { kind: 'rockCluster', t: .22, side: -.60, r: 59, parts: [{ x: -17, y: 2, r: 35 }, { x: 23, y: -5, r: 28 }] },
      { kind: 'stump', t: .66, side: .61, r: 63, height: 74 },
      { kind: 'rock', t: .84, side: -.52, r: 36 }
    ]
  },
  7: {
    theme: 'two-roads',
    landforms: [
      { kind: 'mound', t: .35, side: 0, length: 480, width: 300, height: 27, asymmetry: .28, falloff: 1.35 },
      { kind: 'depression', t: .52, side: 0, length: 360, width: 135, height: 9, angle: .04, falloff: 1.18 },
      { kind: 'ridge', a: { t: .57, side: -.52 }, b: { t: .72, side: -.30 }, width: 180, height: 17, falloff: 1.55 },
      { kind: 'mound', t: .79, side: .40, length: 290, width: 205, height: 15, asymmetry: -.38, falloff: 1.68 }
    ],
    surfaces: [
      { type: 'sand', t: .52, side: 0, length: 360, width: 135, angle: .04 },
      { type: 'moss', a: { t: .29, side: .54 }, b: { t: .52, side: .47 }, width: 170 }
    ],
    barriers: [
      { material: 'wood', width: 19, height: 28, points: [{ t: .27, side: -.12 }, { t: .38, side: -.24 }, { t: .49, side: -.18 }] },
      { material: 'wood', width: 19, height: 28, points: [{ t: .27, side: .12 }, { t: .38, side: .24 }, { t: .49, side: .18 }] },
      { material: 'stone', width: 18, height: 29, points: [{ t: .72, side: -.57 }, { t: .81, side: -.33 }, { t: .89, side: -.10 }] }
    ],
    props: [
      { kind: 'stump', t: .37, side: 0, r: 82, height: 88 },
      { kind: 'rockCluster', t: .62, side: .61, r: 67, parts: [{ x: -21, y: 4, r: 40 }, { x: 25, y: -7, r: 32 }] },
      { kind: 'rock', t: .78, side: -.58, r: 38 }
    ]
  },
  9: {
    theme: 'firefly-finale',
    landforms: [
      { kind: 'mound', t: .20, side: -.35, length: 340, width: 235, height: 19, asymmetry: .42, falloff: 1.46 },
      { kind: 'ridge', a: { t: .31, side: .48 }, b: { t: .48, side: .18 }, width: 190, height: 20, falloff: 1.46 },
      { kind: 'depression', t: .56, side: -.48, length: 360, width: 185, height: 17, angle: .10, falloff: 1.18 },
      { kind: 'depression', t: .56, side: .48, length: 360, width: 185, height: 17, angle: -.10, falloff: 1.18 },
      { kind: 'mound', t: .74, side: 0, length: 390, width: 280, height: 26, asymmetry: -.30, falloff: 1.38 },
      { kind: 'depression', t: .88, side: -.20, length: 270, width: 145, height: 8, angle: .22, falloff: 1.22 }
    ],
    surfaces: [
      { type: 'moss', t: .24, side: -.42, length: 330, width: 180, angle: .12 },
      { type: 'water', t: .56, side: -.48, length: 350, width: 180, angle: .10 },
      { type: 'water', t: .56, side: .48, length: 350, width: 180, angle: -.10 },
      { type: 'sand', t: .88, side: -.20, length: 270, width: 145, angle: .22 }
    ],
    barriers: [
      { material: 'wood', width: 18, height: 28, points: [{ t: .18, side: .56 }, { t: .27, side: .38 }, { t: .35, side: .17 }] },
      { material: 'stone', width: 19, height: 30, points: [{ t: .47, side: -.18 }, { t: .57, side: -.16 }, { t: .65, side: -.12 }] },
      { material: 'stone', width: 19, height: 30, points: [{ t: .47, side: .18 }, { t: .57, side: .16 }, { t: .65, side: .12 }] },
      { material: 'wood', width: 18, height: 27, points: [{ t: .80, side: .57 }, { t: .87, side: .32 }, { t: .93, side: .09 }] }
    ],
    props: [
      { kind: 'rockCluster', t: .30, side: -.61, r: 64, parts: [{ x: -20, y: 4, r: 39 }, { x: 24, y: -7, r: 31 }] },
      { kind: 'stump', t: .69, side: .60, r: 64, height: 75 },
      { kind: 'rockCluster', t: .82, side: -.58, r: 57, parts: [{ x: -16, y: 2, r: 34 }, { x: 21, y: -5, r: 27 }] }
    ],
    rotors: [
      { t: .40, side: .02, length: 315, thickness: 27, speed: -.48, angle: .18, material: 'wood' },
      { t: .76, side: -.03, length: 285, thickness: 26, speed: .60, angle: -.20, material: 'brass' }
    ]
  }
};

function sealCompiled(level, source = 'course19-compiler') {
  if (!level || typeof level !== 'object') return level;
  level.__course18 = true;
  level.__course19 = true;
  if (level.course18) level.course18.version = 2;
  try {
    Object.defineProperty(level, '__integrityVersion', { value: 2, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(level, '__integrityReport', {
      value: { source, movedObstacles: 0, removedObstacles: 0, movedRotors: 0, removedRotors: 0 },
      writable: true,
      configurable: true,
      enumerable: false
    });
  } catch {
    level.__integrityVersion = 2;
  }
  return level;
}

function buildCompiledLevel(raw, blueprint) {
  const level = clone(raw);
  const field = buildField(level, blueprint);
  const surfaceMesh = buildSurfaceMesh(level, field);
  const barriers = (blueprint.barriers || []).flatMap((barrier, index) => resolveBarrier(level, barrier, index));
  const props = (blueprint.props || []).map((prop, index) => resolveProp(level, prop, index));
  const rotors = (blueprint.rotors || []).map((rotor, index) => resolveRotor(level, rotor, index));
  const tunnel = blueprint.tunnel ? resolveTunnel(level, blueprint.tunnel) : null;
  const tunnelWalls = tunnel ? tunnelColliders(tunnel) : [];
  level.start = { ...level.start, z: field.heightAt(level.start.x, level.start.y) };
  level.hole = { ...level.hole, depth: Math.max(58, Number(level.hole.depth || 64)) };
  level.zones = [];
  level.obstacles = props.map((prop) => ({ ...prop }));
  level.walls = [...barriers, ...tunnelWalls];
  level.rotors = rotors;
  level.tunnels = tunnel ? [tunnel] : [];
  level.decorations = [];
  level.renderId = `${raw.id}:course19:${raw.endless?.depth ?? 'campaign'}`;
  level.course18 = {
    version: 2,
    field,
    surfaceMesh,
    barriers,
    props,
    tunnelVisuals: tunnel ? [{ entry: tunnel.visualEntry, exit: tunnel.visualExit, width: tunnel.width, depth: tunnel.depth }] : [],
    triangleCount: surfaceMesh.vertexCount / 3,
    scenario: blueprint.theme || raw.endless?.scenario || 'authored'
  };
  return sealCompiled(level);
}

export function isCourse19(level) {
  return Boolean(level?.__course19 && level?.course18?.field);
}

export function compileCourse19(rawLevel) {
  if (!rawLevel || typeof rawLevel !== 'object') return rawLevel;
  if (isCourse19(rawLevel)) return rawLevel;
  const cached = cache.get(rawLevel);
  if (cached) return cached;

  let compiled = rawLevel;
  const id = Number(rawLevel.id);
  if (isCourse18(rawLevel)) {
    compiled = sealCompiled(rawLevel, 'course18-compatible');
  } else if (!rawLevel.endless && LEGACY_IDS.has(id)) {
    compiled = sealCompiled(compileLegacy18(rawLevel), 'course18-legacy');
  } else {
    const blueprint = rawLevel.course19Blueprint || BLUEPRINTS[id];
    if (blueprint && (rawLevel.endless || CAMPAIGN_IDS.has(id))) compiled = buildCompiledLevel(rawLevel, blueprint);
  }
  if (compiled !== rawLevel || isCourse19(compiled)) cache.set(rawLevel, compiled);
  return compiled;
}

export function upgradeCourse19InPlace(level) {
  if (!level || typeof level !== 'object' || isCourse19(level)) return level;
  const compiled = compileCourse19(level);
  if (compiled === level) return level;
  for (const key of Object.keys(level)) delete level[key];
  Object.assign(level, compiled);
  return level;
}

export function inspectCourse19(level) {
  const issues = [];
  if (!isCourse19(level)) return { ok: false, issues: ['not-course19'] };
  const field = level.course18.field;
  for (let row = 0; row <= 32; row += 1) {
    const sample = sampleSpline(level.centerline, row / 32);
    const halfWidth = clamp(distanceToOutline(sample, level.outline) - 18, 70, 350);
    for (let column = -5; column <= 5; column += 1) {
      const lane = column / 5;
      const x = sample.x + sample.nx * lane * halfWidth;
      const y = sample.y + sample.ny * lane * halfWidth;
      const height = field.heightAt(x, y);
      const gradient = field.gradientAt(x, y);
      if (![height, gradient.x, gradient.y].every(Number.isFinite)) issues.push('non-finite-terrain');
      if (Math.hypot(gradient.x, gradient.y) > 1.35) issues.push('excessive-gradient');
    }
  }
  if (!pointInPolygon(level.start, level.outline)) issues.push('start-outside');
  if (!pointInPolygon(level.hole, level.outline)) issues.push('hole-outside');
  if (level.course18.triangleCount > 12000) issues.push('triangle-budget');
  for (const wall of level.walls || []) {
    if (![wall.ax, wall.ay, wall.bx, wall.by, wall.thickness].every(Number.isFinite)) issues.push('invalid-wall');
  }
  for (const obstacle of level.obstacles || []) {
    if (![obstacle.x, obstacle.y, obstacle.r].every(Number.isFinite)) issues.push('invalid-prop');
  }
  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    triangleCount: level.course18.triangleCount,
    scenario: level.course18.scenario
  };
}
