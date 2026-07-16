import { BALL_RADIUS } from './physics.js';
import { levelBounds } from './levels.js';

const TAU = Math.PI * 2;
const STRIDE = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function hashNoise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function color(hex, alpha = 1) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
    alpha
  ];
}

function cssColor(value, fallback, alphaScale = 1) {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const alpha = clamp((Number.isFinite(value[3]) ? value[3] : 1) * alphaScale, 0, 1);
  return `rgba(${Math.round(value[0] * 255)},${Math.round(value[1] * 255)},${Math.round(value[2] * 255)},${alpha})`;
}

const C = {
  grass: color('#6f8658'),
  grassLight: color('#91a66c'),
  moss: color('#3e6b42'),
  sand: color('#c8ad69'),
  soil: color('#47382a'),
  soilDark: color('#17150f'),
  boardSide: color('#283a2d'),
  boardBottom: color('#17231b'),
  stone: color('#858777'),
  stoneLight: color('#aaa78e'),
  stoneDark: color('#515b51'),
  terracotta: color('#9a5f48'),
  terracottaLight: color('#c08262'),
  ceramic: color('#d7d1b5'),
  ceramicDark: color('#817d69'),
  wood: color('#6f5135'),
  woodLight: color('#a47b4f'),
  brass: color('#b18a45'),
  brassLight: color('#e0c37a'),
  glass: color('#c9e3d7', .30),
  glassStrong: color('#dff5e9', .48),
  water: color('#426f70', .78),
  sugar: color('#e7dfc4'),
  sugarShade: color('#aaa58f'),
  shadow: color('#06120b', .27),
  shadowStrong: color('#06120b', .48),
  ballGlass: color('#d9f2e9', .55),
  ballVein: color('#d7c36d', .58),
  ballVeinDark: color('#456d5b', .45),
  flag: color('#d2a954'),
  flagDark: color('#765929'),
  debug: '#f2d16c'
};

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
function faceNormal(a, b, c) { return normalize(cross(sub(b, a), sub(c, a))); }
function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area * .5;
}

function pointInTriangle(point, a, b, c) {
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

export function triangulatePolygon(points) {
  if (points.length < 3) return [];
  const indices = Array.from({ length: points.length }, (_, index) => index);
  const triangles = [];
  const orientation = polygonArea(points) >= 0 ? 1 : -1;
  let guard = points.length * points.length;

  while (indices.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    for (let cursor = 0; cursor < indices.length; cursor += 1) {
      const previous = indices[(cursor - 1 + indices.length) % indices.length];
      const current = indices[cursor];
      const next = indices[(cursor + 1) % indices.length];
      const a = points[previous];
      const b = points[current];
      const c = points[next];
      const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (turn * orientation <= 1e-7) continue;

      let contains = false;
      for (const candidate of indices) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInTriangle(points[candidate], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;
      triangles.push([previous, current, next]);
      indices.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }

  if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
  if (!triangles.length) {
    for (let index = 1; index < points.length - 1; index += 1) triangles.push([0, index, index + 1]);
  }
  return triangles;
}

class MeshBuilder {
  constructor() { this.data = []; }

  vertex(position, normal, tint, material) {
    this.data.push(
      position[0], position[1], position[2],
      normal[0], normal[1], normal[2],
      tint[0], tint[1], tint[2], tint[3],
      material
    );
  }

  triangle(a, b, c, tint, material, normals = null, colors = null) {
    const normal = faceNormal(a, b, c);
    this.vertex(a, normals?.[0] || normal, colors?.[0] || tint, material);
    this.vertex(b, normals?.[1] || normal, colors?.[1] || tint, material);
    this.vertex(c, normals?.[2] || normal, colors?.[2] || tint, material);
  }

  quad(a, b, c, d, tint, material, normal = null) {
    const n = normal || faceNormal(a, b, c);
    this.triangle(a, b, c, tint, material, [n, n, n]);
    this.triangle(a, c, d, tint, material, [n, n, n]);
  }

  polygon(points, z, tint, material) {
    const normal = [0, 0, 1];
    for (const [a, b, c] of triangulatePolygon(points)) {
      this.triangle(
        [points[a].x, points[a].y, z],
        [points[b].x, points[b].y, z],
        [points[c].x, points[c].y, z],
        tint,
        material,
        [normal, normal, normal]
      );
    }
  }

  toArray() { return new Float32Array(this.data); }
}

function addDisc(builder, x, y, z, radius, tint, material, segments = 24, inward = false) {
  const center = [x, y, z];
  const normal = inward ? [0, 0, -1] : [0, 0, 1];
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const p1 = [x + Math.cos(a) * radius, y + Math.sin(a) * radius, z];
    const p2 = [x + Math.cos(b) * radius, y + Math.sin(b) * radius, z];
    if (inward) builder.triangle(center, p2, p1, tint, material, [normal, normal, normal]);
    else builder.triangle(center, p1, p2, tint, material, [normal, normal, normal]);
  }
}

function addRing(builder, x, y, z, innerRadius, outerRadius, tint, material, segments = 24) {
  const normal = [0, 0, 1];
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const i1 = [x + Math.cos(a) * innerRadius, y + Math.sin(a) * innerRadius, z];
    const i2 = [x + Math.cos(b) * innerRadius, y + Math.sin(b) * innerRadius, z];
    const o1 = [x + Math.cos(a) * outerRadius, y + Math.sin(a) * outerRadius, z];
    const o2 = [x + Math.cos(b) * outerRadius, y + Math.sin(b) * outerRadius, z];
    builder.quad(i1, o1, o2, i2, tint, material, normal);
  }
}

function addCylinder(builder, options) {
  const {
    x, y, z0, z1, r0, r1 = r0, tint, material = 0, segments = 20,
    capTop = true, capBottom = false, inward = false, seed = 0, irregular = 0
  } = options;
  const slope = (r0 - r1) / Math.max(1e-5, z1 - z0);
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const noiseA = 1 + (hashNoise(index, seed, 2) - .5) * irregular;
    const noiseB = 1 + (hashNoise(index + 1, seed, 2) - .5) * irregular;
    const p00 = [x + Math.cos(a) * r0 * noiseA, y + Math.sin(a) * r0 * noiseA, z0];
    const p01 = [x + Math.cos(b) * r0 * noiseB, y + Math.sin(b) * r0 * noiseB, z0];
    const p10 = [x + Math.cos(a) * r1 * noiseA, y + Math.sin(a) * r1 * noiseA, z1];
    const p11 = [x + Math.cos(b) * r1 * noiseB, y + Math.sin(b) * r1 * noiseB, z1];
    let nA = normalize([Math.cos(a), Math.sin(a), slope]);
    let nB = normalize([Math.cos(b), Math.sin(b), slope]);
    if (inward) { nA = nA.map((value) => -value); nB = nB.map((value) => -value); }
    if (inward) {
      builder.triangle(p00, p11, p01, tint, material, [nA, nB, nB]);
      builder.triangle(p00, p10, p11, tint, material, [nA, nA, nB]);
    } else {
      builder.triangle(p00, p01, p11, tint, material, [nA, nB, nB]);
      builder.triangle(p00, p11, p10, tint, material, [nA, nB, nA]);
    }
  }
  if (capTop) addDisc(builder, x, y, z1, r1, tint, material, segments, false);
  if (capBottom) addDisc(builder, x, y, z0, r0, tint, material, segments, true);
}

function addSphere(builder, options) {
  const {
    x, y, z, radius, tint, material = 0, segments = 18, rings = 11,
    rotation = [0, 0, 0], colorFn = null
  } = options;
  const [rx, ry, rz] = rotation;
  const sinX = Math.sin(rx); const cosX = Math.cos(rx);
  const sinY = Math.sin(ry); const cosY = Math.cos(ry);
  const sinZ = Math.sin(rz); const cosZ = Math.cos(rz);

  const rotate = ([px, py, pz]) => {
    let ax = px;
    let ay = py * cosX - pz * sinX;
    let az = py * sinX + pz * cosX;
    const bx = ax * cosY + az * sinY;
    const by = ay;
    const bz = -ax * sinY + az * cosY;
    ax = bx * cosZ - by * sinZ;
    ay = bx * sinZ + by * cosZ;
    az = bz;
    return [ax, ay, az];
  };

  const point = (ring, segment) => {
    const phi = ring / rings * Math.PI;
    const theta = segment / segments * TAU;
    const local = [
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ];
    const normal = normalize(rotate(local));
    return {
      position: [x + normal[0] * radius, y + normal[1] * radius, z + normal[2] * radius],
      normal,
      tint: colorFn ? colorFn(local, ring, segment) : tint
    };
  };

  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const p00 = point(ring, segment);
      const p01 = point(ring, segment + 1);
      const p10 = point(ring + 1, segment);
      const p11 = point(ring + 1, segment + 1);
      builder.triangle(
        p00.position, p01.position, p11.position, tint, material,
        [p00.normal, p01.normal, p11.normal], [p00.tint, p01.tint, p11.tint]
      );
      builder.triangle(
        p00.position, p11.position, p10.position, tint, material,
        [p00.normal, p11.normal, p10.normal], [p00.tint, p11.tint, p10.tint]
      );
    }
  }
}

function addGroundEllipse(builder, x, y, z, radiusX, radiusY, tint, material = 3, segments = 24) {
  const points = Array.from({ length: segments }, (_, index) => ({
    x: x + Math.cos(index / segments * TAU) * radiusX,
    y: y + Math.sin(index / segments * TAU) * radiusY
  }));
  builder.polygon(points, z, tint, material);
}

function addSymmetricBox(builder, ax, ay, bx, by, width, z0, z1, tint, material = 0) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * .5;
  const ny = dx / length * width * .5;
  const aL = [ax + nx, ay + ny]; const aR = [ax - nx, ay - ny];
  const bL = [bx + nx, by + ny]; const bR = [bx - nx, by - ny];
  const p = (point, z) => [point[0], point[1], z];
  builder.quad(p(aL, z1), p(aR, z1), p(bR, z1), p(bL, z1), tint, material, [0, 0, 1]);
  builder.quad(p(aL, z0), p(bL, z0), p(bL, z1), p(aL, z1), tint, material);
  builder.quad(p(aR, z0), p(aR, z1), p(bR, z1), p(bR, z0), tint, material);
  builder.quad(p(aL, z0), p(aL, z1), p(aR, z1), p(aR, z0), tint, material);
  builder.quad(p(bL, z0), p(bR, z0), p(bR, z1), p(bL, z1), tint, material);
}

function addOutwardCurb(builder, a, b, centroid, width, height, tint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  const midpoint = { x: (a.x + b.x) * .5, y: (a.y + b.y) * .5 };
  if ((midpoint.x - centroid.x) * nx + (midpoint.y - centroid.y) * ny < 0) { nx *= -1; ny *= -1; }
  const outerA = { x: a.x + nx * width, y: a.y + ny * width };
  const outerB = { x: b.x + nx * width, y: b.y + ny * width };
  const p = (point, z) => [point.x, point.y, z];
  builder.quad(p(a, height), p(b, height), p(outerB, height), p(outerA, height), tint, 0, [0, 0, 1]);
  builder.quad(p(a, 0), p(a, height), p(outerA, height), p(outerA, 0), C.stoneDark, 0);
  builder.quad(p(b, 0), p(outerB, 0), p(outerB, height), p(b, height), C.stoneDark, 0);
  builder.quad(p(outerA, 0), p(outerA, height), p(outerB, height), p(outerB, 0), C.stoneDark, 0);
}

function addRock(builder, obstacle) {
  const segments = 11;
  const height = obstacle.r * (.78 + hashNoise(obstacle.x, obstacle.y, 21) * .34);
  const seed = obstacle.x * .13 + obstacle.y * .07;
  const rings = [
    { z: .7, radius: 1, shiftX: 0, shiftY: 0 },
    { z: height * .34, radius: .92, shiftX: obstacle.r * .02, shiftY: -obstacle.r * .02 },
    { z: height * .78, radius: .52, shiftX: obstacle.r * .1 * (hashNoise(seed, 3) - .5), shiftY: obstacle.r * .1 * (hashNoise(seed, 6) - .5) }
  ];
  const ringPoints = rings.map((ring, ringIndex) => Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * TAU;
    const wobble = 1 + (hashNoise(index, ringIndex, seed) - .5) * (ringIndex ? .23 : .08);
    return [
      obstacle.x + ring.shiftX + Math.cos(angle) * obstacle.r * ring.radius * wobble,
      obstacle.y + ring.shiftY + Math.sin(angle) * obstacle.r * ring.radius * wobble,
      ring.z
    ];
  }));
  for (let ring = 0; ring < ringPoints.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const shade = lerp(.78, 1.08, hashNoise(index, ring, seed));
      const tint = C.stone.map((value, channel) => channel < 3 ? clamp(value * shade, 0, 1) : value);
      builder.quad(ringPoints[ring][index], ringPoints[ring][next], ringPoints[ring + 1][next], ringPoints[ring + 1][index], tint, 0);
    }
  }
  const apex = [
    obstacle.x + obstacle.r * .12 * (hashNoise(seed, 8) - .5),
    obstacle.y + obstacle.r * .12 * (hashNoise(seed, 11) - .5),
    height
  ];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    builder.triangle(ringPoints.at(-1)[index], ringPoints.at(-1)[next], apex, C.stoneLight, 0);
  }
}

function addPot(builder, obstacle) {
  const h = obstacle.r * 1.12;
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: .6, z1: h * .72, r0: obstacle.r, r1: obstacle.r * .82, tint: C.terracotta, segments: 22, capTop: false });
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: h * .68, z1: h, r0: obstacle.r * .9, r1: obstacle.r * .96, tint: C.terracottaLight, segments: 22, capTop: false });
  addRing(builder, obstacle.x, obstacle.y, h + .5, obstacle.r * .68, obstacle.r * .98, C.terracottaLight, 0, 22);
  addDisc(builder, obstacle.x, obstacle.y, h - 1, obstacle.r * .66, C.soil, 0, 22);
}

function addCup(builder, obstacle) {
  const saucerHeight = Math.max(4, obstacle.r * .08);
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: .5, z1: saucerHeight, r0: obstacle.r, r1: obstacle.r * .95, tint: C.ceramicDark, segments: 24 });
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: saucerHeight, z1: obstacle.r * .82, r0: obstacle.r * .72, r1: obstacle.r * .58, tint: C.ceramic, segments: 24, capTop: false });
  addRing(builder, obstacle.x, obstacle.y, obstacle.r * .82, obstacle.r * .42, obstacle.r * .61, C.ceramic, 0, 24);
  addDisc(builder, obstacle.x, obstacle.y, obstacle.r * .80, obstacle.r * .41, C.soilDark, 0, 24);
  const handleX = obstacle.x + obstacle.r * .58;
  addCylinder(builder, { x: handleX, y: obstacle.y, z0: obstacle.r * .25, z1: obstacle.r * .63, r0: obstacle.r * .18, r1: obstacle.r * .18, tint: C.ceramic, segments: 12, capTop: true, capBottom: true });
}

function addWood(builder, obstacle) {
  const h = obstacle.r * .72;
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: .6, z1: h, r0: obstacle.r, r1: obstacle.r * .91, tint: C.wood, segments: 18, irregular: .08, seed: obstacle.x + obstacle.y });
  addDisc(builder, obstacle.x, obstacle.y, h + .3, obstacle.r * .88, C.woodLight, 0, 18);
  addRing(builder, obstacle.x, obstacle.y, h + .6, obstacle.r * .46, obstacle.r * .50, C.wood, 0, 18);
}

function addSugar(builder, obstacle) {
  const surrogate = { ...obstacle, r: obstacle.r };
  addRock(builder, surrogate);
}

function addSpoon(builder, obstacle) {
  const h = Math.max(5, obstacle.r * .09);
  addCylinder(builder, { x: obstacle.x, y: obstacle.y, z0: .5, z1: h, r0: obstacle.r, r1: obstacle.r * .94, tint: C.ceramicDark, material: 4, segments: 28 });
  addDisc(builder, obstacle.x, obstacle.y, h + .3, obstacle.r * .72, C.ceramic, 4, 28);
  addSymmetricBox(builder, obstacle.x, obstacle.y - obstacle.r * .52, obstacle.x, obstacle.y + obstacle.r * .55, obstacle.r * .22, h, h + obstacle.r * .14, C.ceramic, 4);
}

function addObstacle(builder, shadowBuilder, obstacle) {
  addGroundEllipse(shadowBuilder, obstacle.x + obstacle.r * .08, obstacle.y + obstacle.r * .13, .18, obstacle.r * 1.04, obstacle.r * .78, C.shadowStrong);
  addRing(builder, obstacle.x, obstacle.y, .72, obstacle.r * .93, obstacle.r, C.stoneDark, 0, 24);
  if (obstacle.material === 'stone') addRock(builder, obstacle);
  else if (obstacle.material === 'pot') addPot(builder, obstacle);
  else if (obstacle.material === 'cup') addCup(builder, obstacle);
  else if (obstacle.material === 'wood') addWood(builder, obstacle);
  else if (obstacle.material === 'sugar') addSugar(builder, obstacle);
  else if (obstacle.material === 'spoon') addSpoon(builder, obstacle);
  else addRock(builder, obstacle);
}

function addHole(opaque, level) {
  const hole = level.hole;
  const depth = Math.max(48, hole.r * 1.8);
  addCylinder(opaque, {
    x: hole.x, y: hole.y, z0: -depth, z1: -.5,
    r0: hole.r * .88, r1: hole.r, tint: C.soil, material: 9,
    segments: 28, capTop: false, capBottom: true, inward: true
  });
  addDisc(opaque, hole.x, hole.y, -depth + 1, hole.r * .86, C.soilDark, 9, 28);
  addRing(opaque, hole.x, hole.y, .65, hole.r, hole.r + 5.2, C.soil, 0, 28);
  addRing(opaque, hole.x, hole.y, 1.2, hole.r + 4.6, hole.r + 8.5, C.grassLight, 1, 28);

  const poleX = hole.x + hole.r * .24;
  const poleY = hole.y - hole.r * .08;
  addCylinder(opaque, { x: poleX, y: poleY, z0: -depth + 4, z1: 132, r0: 3.8, r1: 3.5, tint: C.brassLight, material: 4, segments: 10 });
  const flagA = [poleX, poleY, 126];
  const flagB = [poleX + 58, poleY + 3, 112];
  const flagC = [poleX, poleY, 94];
  opaque.triangle(flagA, flagB, flagC, C.flag, 0, [[0, -1, 0], [0, -1, 0], [0, -1, 0]]);
  opaque.triangle(flagC, flagB, flagA, C.flagDark, 0, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
}

function addTunnel(builder, shadowBuilder, tunnel) {
  for (const endpoint of [tunnel.entry, tunnel.exit]) {
    addGroundEllipse(shadowBuilder, endpoint.x + 4, endpoint.y + 6, .16, endpoint.r * 1.1, endpoint.r * .72, C.shadow);
    addCylinder(builder, { x: endpoint.x, y: endpoint.y, z0: .5, z1: 24, r0: endpoint.r, r1: endpoint.r * .94, tint: C.stoneDark, segments: 24, capTop: false });
    addRing(builder, endpoint.x, endpoint.y, 24.5, endpoint.r * .58, endpoint.r * .96, C.stone, 0, 24);
    addDisc(builder, endpoint.x, endpoint.y, 23.8, endpoint.r * .57, C.soilDark, 9, 24);
  }
}

function addDecoration(builder, decoration, seed) {
  if (decoration.type === 'leaf') {
    const angle = hashNoise(decoration.x, decoration.y, seed) * TAU;
    const dx = Math.cos(angle) * 22;
    const dy = Math.sin(angle) * 22;
    const sideX = -Math.sin(angle) * 9;
    const sideY = Math.cos(angle) * 9;
    builder.quad(
      [decoration.x - dx, decoration.y - dy, 1.5],
      [decoration.x + sideX, decoration.y + sideY, 2],
      [decoration.x + dx, decoration.y + dy, 1.8],
      [decoration.x - sideX, decoration.y - sideY, 1.4],
      C.moss, 0, [0, 0, 1]
    );
  } else if (decoration.type === 'mushroom') {
    addCylinder(builder, { x: decoration.x, y: decoration.y, z0: .7, z1: 24, r0: 5, r1: 4, tint: C.ceramic, segments: 9 });
    addSphere(builder, { x: decoration.x, y: decoration.y, z: 27, radius: 14, tint: C.terracotta, segments: 12, rings: 6 });
  } else if (decoration.type === 'snail') {
    addSphere(builder, { x: decoration.x, y: decoration.y, z: 8, radius: 10, tint: C.terracottaLight, segments: 10, rings: 6 });
    addSphere(builder, { x: decoration.x + 10, y: decoration.y, z: 5, radius: 5, tint: C.sand, segments: 8, rings: 5 });
  } else if (decoration.type === 'frog') {
    addSphere(builder, { x: decoration.x, y: decoration.y, z: 8, radius: 12, tint: C.moss, segments: 10, rings: 6 });
  }
}

function addBoardScene(level) {
  const opaque = new MeshBuilder();
  const shadows = new MeshBuilder();
  const transparent = new MeshBuilder();
  const centroid = level.outline.reduce((sum, point) => ({ x: sum.x + point.x / level.outline.length, y: sum.y + point.y / level.outline.length }), { x: 0, y: 0 });

  const shadowOutline = level.outline.map((point) => ({ x: point.x + 18, y: point.y + 34 }));
  shadows.polygon(shadowOutline, -34, color('#020905', .42), 3);
  opaque.polygon(level.outline, -32, C.boardBottom, 0);
  opaque.polygon(level.outline, 0, C.grass, 1);
  for (let index = 0; index < level.outline.length; index += 1) {
    const a = level.outline[index];
    const b = level.outline[(index + 1) % level.outline.length];
    opaque.quad([a.x, a.y, -32], [b.x, b.y, -32], [b.x, b.y, 0], [a.x, a.y, 0], C.boardSide, 0);

    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const pieces = Math.max(1, Math.ceil(length / 72));
    for (let piece = 0; piece < pieces; piece += 1) {
      const inset = 2.4 / Math.max(1, length);
      const t0 = piece / pieces + inset;
      const t1 = (piece + 1) / pieces - inset;
      const start = { x: lerp(a.x, b.x, t0), y: lerp(a.y, b.y, t0) };
      const end = { x: lerp(a.x, b.x, t1), y: lerp(a.y, b.y, t1) };
      const tint = hashNoise(index, piece, level.id) > .5 ? C.stone : C.stoneLight;
      addOutwardCurb(opaque, start, end, centroid, 18, 16 + hashNoise(index, piece, 9) * 3, tint);
    }
  }

  for (const zone of level.zones || []) {
    const points = [
      { x: zone.x, y: zone.y }, { x: zone.x + zone.w, y: zone.y },
      { x: zone.x + zone.w, y: zone.y + zone.h }, { x: zone.x, y: zone.y + zone.h }
    ];
    if (zone.type === 'water') transparent.polygon(points, .55, C.water, 6);
    else if (zone.type === 'sand') opaque.polygon(points, .55, C.sand, 8);
    else if (zone.type === 'moss') opaque.polygon(points, .58, C.moss, 7);
    else if (zone.type === 'slope') opaque.polygon(points, .54, color('#8a8257'), 5);
    else if (zone.type === 'bridge') {
      const z0 = 6;
      const z1 = 10;
      transparent.quad([zone.x, zone.y, z1], [zone.x + zone.w, zone.y, z1], [zone.x + zone.w, zone.y + zone.h, z1], [zone.x, zone.y + zone.h, z1], C.glassStrong, 2, [0, 0, 1]);
      opaque.quad([zone.x, zone.y, z0], [zone.x, zone.y, z1], [zone.x, zone.y + zone.h, z1], [zone.x, zone.y + zone.h, z0], C.stoneDark, 0);
      opaque.quad([zone.x + zone.w, zone.y, z0], [zone.x + zone.w, zone.y + zone.h, z0], [zone.x + zone.w, zone.y + zone.h, z1], [zone.x + zone.w, zone.y, z1], C.stoneDark, 0);
    }
  }

  addHole(opaque, level);
  for (const obstacle of level.obstacles || []) addObstacle(opaque, shadows, obstacle);
  for (const wall of level.walls || []) {
    const z0 = wall.material === 'glass' ? 9 : .7;
    const z1 = wall.material === 'glass' ? 70 : 34;
    addGroundEllipse(shadows, (wall.ax + wall.bx) * .5 + 4, (wall.ay + wall.by) * .5 + 5, .15, Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) * .55, wall.thickness, C.shadow);
    addSymmetricBox(wall.material === 'glass' ? transparent : opaque, wall.ax, wall.ay, wall.bx, wall.by, wall.thickness, z0, z1, wall.material === 'glass' ? C.glass : C.wood, wall.material === 'glass' ? 2 : 0);
  }
  for (const tunnel of level.tunnels || []) addTunnel(opaque, shadows, tunnel);
  for (const decoration of level.decorations || []) addDecoration(opaque, decoration, level.id);

  return { opaque: opaque.toArray(), shadows: shadows.toArray(), transparent: transparent.toArray() };
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  return program;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec4 aColor;
in float aMaterial;
uniform vec2 uViewport;
uniform float uScale;
uniform vec2 uOffset;
uniform vec2 uParallax;
out vec3 vNormal;
out vec4 vColor;
out vec3 vWorld;
flat out float vMaterial;
void main() {
  float sx = uOffset.x + aPosition.x * uScale + uParallax.x * aPosition.z * uScale * .14;
  float sy = uOffset.y + aPosition.y * uScale * .82 - aPosition.z * uScale + uParallax.y * aPosition.z * uScale * .09;
  vec2 clip = vec2(sx / uViewport.x * 2.0 - 1.0, 1.0 - sy / uViewport.y * 2.0);
  float depth = clamp(.82 - (aPosition.y + aPosition.z * .86) / 1120.0, -.97, .97);
  gl_Position = vec4(clip, depth, 1.0);
  vNormal = aNormal;
  vColor = aColor;
  vWorld = aPosition;
  vMaterial = aMaterial;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec4 vColor;
in vec3 vWorld;
flat in float vMaterial;
uniform vec3 uHole;
uniform float uTime;
out vec4 outColor;
float noise2(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  if (vMaterial > .5 && vMaterial < 1.5 && distance(vWorld.xy, uHole.xy) < uHole.z) discard;
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(-.48, -.52, .70));
  vec3 viewDir = normalize(vec3(0.0, -.76, .65));
  float diffuse = max(dot(n, lightDir), 0.0);
  float back = max(dot(n, -lightDir), 0.0);
  float rim = pow(1.0 - abs(dot(n, viewDir)), 2.3);
  float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), vMaterial > 3.5 && vMaterial < 4.5 ? 24.0 : 48.0);
  vec3 base = vColor.rgb;
  float alpha = vColor.a;

  if (vMaterial > 2.5 && vMaterial < 3.5) {
    outColor = vec4(base, alpha);
    return;
  }
  if (vMaterial > .5 && vMaterial < 1.5) {
    float grain = noise2(floor(vWorld.xy * .38));
    float blades = sin(vWorld.x * .38 + sin(vWorld.y * .27)) * .5 + .5;
    base *= .88 + grain * .15 + blades * .035;
  } else if (vMaterial > 5.5 && vMaterial < 6.5) {
    float wave = sin(vWorld.x * .10 + uTime * 1.7) * sin(vWorld.y * .075 - uTime * 1.15);
    base += vec3(.04, .09, .08) * wave;
    spec *= 1.8;
  } else if (vMaterial > 6.5 && vMaterial < 7.5) {
    float moss = noise2(floor(vWorld.xy * .18));
    base *= .82 + moss * .28;
  } else if (vMaterial > 7.5 && vMaterial < 8.5) {
    float sand = noise2(floor(vWorld.xy * .32));
    base *= .90 + sand * .18;
  } else if (vMaterial > 8.5 && vMaterial < 9.5) {
    base *= .52 + diffuse * .22;
    outColor = vec4(base, alpha);
    return;
  }

  vec3 lit = base * (.44 + diffuse * .64 + back * .08);
  if (vMaterial > 1.5 && vMaterial < 2.5) {
    lit = mix(lit, vec3(.78, .96, .89), rim * .58) + spec * vec3(.95, .98, .82) * 1.35;
    alpha *= .68 + rim * .28;
  } else if (vMaterial > 3.5 && vMaterial < 4.5) {
    lit += spec * vec3(1.0, .88, .55) * 1.5 + rim * base * .18;
  } else {
    lit += spec * vec3(.92, .88, .68) * .42 + rim * base * .10;
  }
  outColor = vec4(lit, alpha);
}`;

class GpuMesh {
  constructor(gl, data, usage = gl.STATIC_DRAW) {
    this.gl = gl;
    this.buffer = gl.createBuffer();
    this.count = 0;
    this.update(data, usage);
  }
  update(data, usage = this.gl.DYNAMIC_DRAW) {
    const gl = this.gl;
    this.count = data.length / STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  }
  destroy() { this.gl.deleteBuffer(this.buffer); }
}

class WebGLDiorama {
  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.cameraX = 500;
    this.cameraY = 700;
    this.cameraZoom = 1;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.levelId = null;
    this.staticMeshes = null;
    this.dynamicOpaque = new GpuMesh(gl, new Float32Array(), gl.DYNAMIC_DRAW);
    this.dynamicShadows = new GpuMesh(gl, new Float32Array(), gl.DYNAMIC_DRAW);
    this.dynamicTransparent = new GpuMesh(gl, new Float32Array(), gl.DYNAMIC_DRAW);
    this.particles = [];
    this.spin = [0, 0, 0];
    this.debugHitboxes = localStorage.getItem('pocket-works:moss-marble:hitboxes') === '1';
    this.contextLost = false;
    this.overlay = this.createOverlay();
    this.overlayCtx = this.overlay.getContext('2d');
    this.rain = Array.from({ length: 38 }, (_, index) => ({
      x: hashNoise(index, 3), y: hashNoise(index, 9), speed: .06 + hashNoise(index, 5) * .08,
      alpha: .035 + hashNoise(index, 13) * .10, length: 12 + hashNoise(index, 17) * 28
    }));
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      material: gl.getAttribLocation(this.program, 'aMaterial'),
      viewport: gl.getUniformLocation(this.program, 'uViewport'),
      scale: gl.getUniformLocation(this.program, 'uScale'),
      offset: gl.getUniformLocation(this.program, 'uOffset'),
      parallax: gl.getUniformLocation(this.program, 'uParallax'),
      hole: gl.getUniformLocation(this.program, 'uHole'),
      time: gl.getUniformLocation(this.program, 'uTime')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      window.dispatchEvent(new CustomEvent('moss-marble:webgl-lost'));
      this.drawContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      window.setTimeout(() => window.location.reload(), 120);
    });
    canvas.style.background = [
      'radial-gradient(circle at 72% 8%, rgba(231,220,151,.24), transparent 34%)',
      'repeating-linear-gradient(90deg, transparent 0 calc(25% - 5px), rgba(6,18,12,.26) calc(25% - 4px) 25%)',
      'repeating-linear-gradient(0deg, transparent 0 116px, rgba(5,17,11,.22) 117px 124px)',
      'linear-gradient(180deg,#31483c 0%,#1b3025 48%,#0d1b14 100%)'
    ].join(',');
    this.installDebugControl();
    this.resize();
  }

  createOverlay() {
    const overlay = document.createElement('canvas');
    overlay.className = 'moss-render-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      zIndex: '3', pointerEvents: 'none', display: 'block'
    });
    this.canvas.style.zIndex = '2';
    this.canvas.insertAdjacentElement('afterend', overlay);
    return overlay;
  }

  installDebugControl() {
    const pauseSheet = document.querySelector('.pause-sheet');
    if (!pauseSheet || document.querySelector('#collisionDebugBtn')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'collisionDebugBtn';
    button.className = 'setting-toggle collision-debug-toggle';
    button.setAttribute('data-native-press', '');
    button.innerHTML = '<span>Коллизии</span><b></b>';
    const workshop = pauseSheet.querySelector('[data-workshop-trigger]');
    workshop?.before(button);
    const sync = () => {
      button.setAttribute('aria-pressed', String(this.debugHitboxes));
      button.querySelector('b').textContent = this.debugHitboxes ? 'Видны' : 'Скрыты';
    };
    button.addEventListener('click', () => { this.setDebugHitboxes(!this.debugHitboxes); sync(); });
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() !== 'h') return;
      this.setDebugHitboxes(!this.debugHitboxes);
      sync();
    });
    sync();
  }

  setDebugHitboxes(value) {
    this.debugHitboxes = Boolean(value);
    try { localStorage.setItem('pocket-works:moss-marble:hitboxes', this.debugHitboxes ? '1' : '0'); } catch {}
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(480, rect.height || window.innerHeight);
    const pixelWidth = Math.round(this.width * this.dpr);
    const pixelHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    if (this.overlay.width !== pixelWidth || this.overlay.height !== pixelHeight) {
      this.overlay.width = pixelWidth;
      this.overlay.height = pixelHeight;
    }
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.contextLost) this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  drawContextLost() {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(9,22,15,.82)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#eee9d4';
    ctx.textAlign = 'center';
    ctx.font = '600 22px "Iowan Old Style", Georgia, serif';
    ctx.fillText('Оранжерея восстанавливает свет', this.width * .5, this.height * .5 - 8);
    ctx.fillStyle = 'rgba(238,233,212,.68)';
    ctx.font = '700 10px "Avenir Next", sans-serif';
    ctx.fillText('ПРОГРЕСС СОХРАНЁН', this.width * .5, this.height * .5 + 20);
  }

  setParallax(x, y) {
    this.targetParallaxX = clamp(x, -1, 1);
    this.targetParallaxY = clamp(y, -1, 1);
  }

  fit(level, ball, dt) {
    const bounds = levelBounds(level);
    const boardWidth = bounds.maxX - bounds.minX;
    const boardHeight = bounds.maxY - bounds.minY;
    const baseScale = Math.min((this.width - 48) / boardWidth, (this.height - 142) / (boardHeight * .82));
    const speed = Math.hypot(ball.vx, ball.vy);
    const zoomTarget = 1 + Math.min(.05, speed / 26000);
    this.cameraZoom = lerp(this.cameraZoom, zoomTarget, 1 - Math.pow(.001, dt));
    const centerX = (bounds.minX + bounds.maxX) * .5;
    const centerY = (bounds.minY + bounds.maxY) * .5;
    const tracking = Math.min(.065, speed / 13000);
    this.cameraX = lerp(this.cameraX, centerX * (1 - tracking) + ball.x * tracking, 1 - Math.pow(.002, dt));
    this.cameraY = lerp(this.cameraY, centerY * (1 - tracking) + ball.y * tracking, 1 - Math.pow(.002, dt));
    this.scale = baseScale * this.cameraZoom;
    this.offsetX = this.width * .5 - this.cameraX * this.scale;
    this.offsetY = 84 + (this.height - 120) * .5 - this.cameraY * this.scale * .82;
    this.parallaxX = lerp(this.parallaxX, this.targetParallaxX, 1 - Math.pow(.035, dt));
    this.parallaxY = lerp(this.parallaxY, this.targetParallaxY, 1 - Math.pow(.035, dt));
  }

  worldToScreen(x, y, z = 0) {
    return {
      x: this.offsetX + x * this.scale + this.parallaxX * z * this.scale * .14,
      y: this.offsetY + y * this.scale * .82 - z * this.scale + this.parallaxY * z * this.scale * .09
    };
  }

  screenToWorld(x, y) {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / (this.scale * .82) };
  }

  surfaceHeight(level, ball) {
    if (Number.isFinite(ball?.groundZ)) return ball.groundZ;
    const terrain = level?.course18?.field?.heightAt?.(ball.x, ball.y);
    if (Number.isFinite(terrain)) return terrain;
    for (const zone of level.zones || []) if (zone.type === 'bridge' && pointInRect(ball, zone)) return 10;
    if (ball.waterTime > 0) return -Math.min(8, ball.waterTime * 22);
    return 0;
  }

  ballHeight(level, ball) {
    if (Number.isFinite(ball?.z)) return ball.z - (ball.sunk ? ball.sink * (BALL_RADIUS + 20) : 0);
    const surface = this.surfaceHeight(level, ball);
    const sinkDepth = ball.sunk ? ball.sink * (BALL_RADIUS + 48) : 0;
    return surface + BALL_RADIUS - sinkDepth;
  }

  ballScreenPoint(ball) {
    const z = this.lastLevel ? this.ballHeight(this.lastLevel, ball) : BALL_RADIUS;
    return this.worldToScreen(ball.x, ball.y, z);
  }

  emit(x, y, type, amount = 8) {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 22 + Math.random() * 82;
      this.particles.push({
        x, y, z: 3 + Math.random() * 8,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        vz: 18 + Math.random() * 72, life: .48 + Math.random() * .62,
        maxLife: 1.1, type, size: 2 + Math.random() * 4
      });
    }
  }

  ensureStatic(level) {
    if (this.levelId === level.id && this.staticMeshes) return;
    if (this.staticMeshes) Object.values(this.staticMeshes).forEach((mesh) => mesh.destroy());
    const scene = addBoardScene(level);
    this.staticMeshes = {
      opaque: new GpuMesh(this.gl, scene.opaque),
      shadows: new GpuMesh(this.gl, scene.shadows),
      transparent: new GpuMesh(this.gl, scene.transparent)
    };
    this.levelId = level.id;
  }

  updateDynamic(level, ball, time, dt) {
    const opaque = new MeshBuilder();
    const shadows = new MeshBuilder();
    const transparent = new MeshBuilder();
    const surface = this.surfaceHeight(level, ball);
    const centerZ = this.ballHeight(level, ball);
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!ball.sunk) {
      this.spin[0] += ball.vy / BALL_RADIUS * dt;
      this.spin[1] -= ball.vx / BALL_RADIUS * dt;
      this.spin[2] += speed * dt / (BALL_RADIUS * 17);
    }

    const shadowScale = ball.sunk ? Math.max(0, 1 - ball.sink * 1.3) : 1;
    if (shadowScale > 0) {
      addGroundEllipse(shadows, ball.x, ball.y + 2, surface + .16, BALL_RADIUS * 1.06 * shadowScale, BALL_RADIUS * .62 * shadowScale, C.shadowStrong);
      addGroundEllipse(shadows, ball.x, ball.y + 1, surface + .22, BALL_RADIUS * .34 * shadowScale, BALL_RADIUS * .20 * shadowScale, color('#020805', .55));
    }

    addSphere(transparent, {
      x: ball.x, y: ball.y, z: centerZ, radius: BALL_RADIUS * .79,
      tint: C.ballVein, material: 2, segments: 16, rings: 9, rotation: this.spin,
      colorFn: (local) => {
        const band = Math.abs(Math.sin(local[0] * 7.2 + local[1] * 3.8 + local[2] * 5.1));
        return band > .66 ? C.ballVein : C.ballVeinDark;
      }
    });
    addSphere(transparent, {
      x: ball.x, y: ball.y, z: centerZ, radius: BALL_RADIUS,
      tint: C.ballGlass, material: 2, segments: 20, rings: 12, rotation: this.spin
    });

    for (const rotor of level.rotors || []) {
      const angle = rotor.angle + time * rotor.speed;
      const hx = Math.cos(angle) * rotor.length * .5;
      const hy = Math.sin(angle) * rotor.length * .5;
      addGroundEllipse(shadows, rotor.x + 4, rotor.y + 8, .15, rotor.length * .48, rotor.thickness * .82, C.shadow);
      addSymmetricBox(
        opaque, rotor.x - hx, rotor.y - hy, rotor.x + hx, rotor.y + hy,
        rotor.thickness, 13, 32,
        rotor.material === 'brass' ? C.brass : C.wood,
        rotor.material === 'brass' ? 4 : 0
      );
      addCylinder(opaque, { x: rotor.x, y: rotor.y, z0: .5, z1: 40, r0: rotor.thickness * .62, r1: rotor.thickness * .55, tint: rotor.material === 'brass' ? C.brassLight : C.woodLight, material: rotor.material === 'brass' ? 4 : 0, segments: 16 });
    }

    this.dynamicOpaque.update(opaque.toArray());
    this.dynamicShadows.update(shadows.toArray());
    this.dynamicTransparent.update(transparent.toArray());
  }

  bindMesh(mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    const stride = STRIDE * 4;
    const bind = (location, size, offset) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
    };
    bind(this.locations.position, 3, 0);
    bind(this.locations.normal, 3, 3);
    bind(this.locations.color, 4, 6);
    bind(this.locations.material, 1, 10);
  }

  drawMesh(mesh, blend = false, depthWrite = true) {
    if (!mesh?.count) return;
    const gl = this.gl;
    if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    gl.depthMask(depthWrite);
    this.bindMesh(mesh);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  render3D(level, time) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.locations.viewport, this.width, this.height);
    gl.uniform1f(this.locations.scale, this.scale);
    gl.uniform2f(this.locations.offset, this.offsetX, this.offsetY);
    gl.uniform2f(this.locations.parallax, this.parallaxX, this.parallaxY);
    gl.uniform3f(this.locations.hole, level.hole.x, level.hole.y, level.hole.r * 1.03);
    gl.uniform1f(this.locations.time, time);

    this.drawMesh(this.staticMeshes.opaque, false, true);
    this.drawMesh(this.staticMeshes.shadows, true, false);
    this.drawMesh(this.dynamicShadows, true, false);
    this.drawMesh(this.dynamicOpaque, false, true);
    this.drawMesh(this.staticMeshes.transparent, true, false);
    this.drawMesh(this.dynamicTransparent, true, false);
    gl.depthMask(true);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vz -= 150 * dt;
      particle.vx *= Math.pow(.91, dt * 60);
      particle.vy *= Math.pow(.91, dt * 60);
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  drawOverlay(level, ball, aim, time, dt, mode) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.updateParticles(dt);

    const horizon = this.height * .48;
    const rainAmount = clamp(Number(level?.visual?.rain ?? 1), 0, 1.6);
    const rainCount = Math.min(this.rain.length, Math.round(this.rain.length * Math.min(1, rainAmount)));
    const rainTint = level?.visual?.mist || '223,239,229';
    ctx.save();
    for (let index = 0; index < rainCount; index += 1) {
      const drop = this.rain[index];
      const y = ((drop.y + time * drop.speed * .025) % 1) * horizon;
      const x = drop.x * this.width + this.parallaxX * 7;
      ctx.strokeStyle = `rgba(${rainTint},${drop.alpha * (.72 + rainAmount * .28)})`;
      ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + drop.length * (.88 + rainAmount * .12)); ctx.stroke();
    }
    ctx.restore();

    for (const particle of this.particles) {
      const point = this.worldToScreen(particle.x, particle.y, particle.z);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.type === 'water' ? '#a9d7d0' : particle.type === 'cup' ? '#e3c976' : '#c6b685';
      ctx.beginPath(); ctx.arc(point.x, point.y, particle.size * (.55 + alpha), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (aim.active && !ball.sunk) {
      const center = this.ballScreenPoint(ball);
      const worldLength = 95 + aim.power * 250;
      const speed = Math.hypot(aim.vx, aim.vy) || 1;
      const end = this.worldToScreen(ball.x + aim.vx / speed * worldLength, ball.y + aim.vy / speed * worldLength, this.surfaceHeight(level, ball) + 2);
      ctx.save();
      ctx.strokeStyle = 'rgba(244,238,205,.78)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 8]);
      ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.setLineDash([]);
      const dots = 5;
      for (let index = 1; index <= dots; index += 1) {
        const t = index / dots;
        ctx.fillStyle = `rgba(244,238,205,${.34 + t * .5})`;
        ctx.beginPath(); ctx.arc(lerp(center.x, end.x, t), lerp(center.y, end.y, t), 1.5 + t * 1.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    if (level.fireflies) {
      for (let index = 0; index < level.fireflies; index += 1) {
        const bounds = levelBounds(level);
        const x = bounds.minX + hashNoise(index, level.id, 91) * (bounds.maxX - bounds.minX);
        const y = bounds.minY + hashNoise(index, level.id, 95) * (bounds.maxY - bounds.minY);
        const z = 18 + hashNoise(index, level.id, 97) * 64 + Math.sin(time * 1.2 + index) * 7;
        const p = this.worldToScreen(x, y, z);
        const glow = .35 + .28 * Math.sin(time * 2.2 + index * 1.7);
        ctx.fillStyle = `rgba(228,209,103,${glow})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill();
      }
    }

    if (this.debugHitboxes) this.drawHitboxes(level, time);

    if (mode === 'menu') {
      const wash = ctx.createRadialGradient(this.width * .68, this.height * .15, 0, this.width * .68, this.height * .15, this.width * .7);
      wash.addColorStop(0, 'rgba(242,225,157,.08)');
      wash.addColorStop(1, 'rgba(242,225,157,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawHitboxes(level, time) {
    const ctx = this.overlayCtx;
    ctx.save();
    ctx.strokeStyle = C.debug;
    ctx.fillStyle = 'rgba(242,209,108,.08)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 5]);

    const drawCircle = (x, y, radius) => {
      const p = this.worldToScreen(x, y, .7);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, radius * this.scale, radius * this.scale * .82, 0, 0, TAU); ctx.fill(); ctx.stroke();
    };
    for (const obstacle of level.obstacles || []) drawCircle(obstacle.x, obstacle.y, obstacle.r);
    drawCircle(level.hole.x, level.hole.y, level.hole.r + 4);
    for (const tunnel of level.tunnels || []) { drawCircle(tunnel.entry.x, tunnel.entry.y, tunnel.entry.r); drawCircle(tunnel.exit.x, tunnel.exit.y, tunnel.exit.r); }

    const drawCapsule = (ax, ay, bx, by, thickness) => {
      const a = this.worldToScreen(ax, ay, 1);
      const b = this.worldToScreen(bx, by, 1);
      ctx.lineWidth = Math.max(2, thickness * this.scale);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.lineWidth = 1.3;
    };
    for (const wall of level.walls || []) drawCapsule(wall.ax, wall.ay, wall.bx, wall.by, wall.thickness);
    for (const rotor of level.rotors || []) {
      const angle = rotor.angle + time * rotor.speed;
      const hx = Math.cos(angle) * rotor.length * .5;
      const hy = Math.sin(angle) * rotor.length * .5;
      drawCapsule(rotor.x - hx, rotor.y - hy, rotor.x + hx, rotor.y + hy, rotor.thickness);
    }

    ctx.lineWidth = 1.25;
    ctx.beginPath();
    level.outline.forEach((point, index) => {
      const p = this.worldToScreen(point.x, point.y, 1);
      if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  draw(level, ball, aim, time, dt, mode) {
    if (this.contextLost) {
      this.drawContextLost();
      return;
    }
    this.lastLevel = level;
    this.resize();
    this.fit(level, ball, dt);
    this.ensureStatic(level);
    this.updateDynamic(level, ball, time, dt);
    this.render3D(level, time);
    this.drawOverlay(level, ball, aim, time, dt, mode);
  }
}

class CanvasFallback {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.width = 0;
    this.height = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.particles = [];
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(480, rect.height || window.innerHeight);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setParallax(x, y) { this.targetParallaxX = clamp(x, -1, 1); this.targetParallaxY = clamp(y, -1, 1); }
  fit(level) {
    const bounds = levelBounds(level);
    this.scale = Math.min((this.width - 48) / (bounds.maxX - bounds.minX), (this.height - 142) / ((bounds.maxY - bounds.minY) * .82));
    this.offsetX = this.width * .5 - (bounds.minX + bounds.maxX) * .5 * this.scale;
    this.offsetY = 84 + (this.height - 120) * .5 - (bounds.minY + bounds.maxY) * .5 * this.scale * .82;
  }
  worldToScreen(x, y, z = 0) { return { x: this.offsetX + x * this.scale, y: this.offsetY + y * this.scale * .82 - z * this.scale }; }
  ballScreenPoint(ball) { return this.worldToScreen(ball.x, ball.y, Number.isFinite(ball.z) ? ball.z : BALL_RADIUS); }
  emit(x, y, type, amount = 8) { for (let i = 0; i < amount; i += 1) this.particles.push({ x, y, type, life: 1 }); }
  pathEllipse(feature, scale = 1, segments = 32) {
    const ctx = this.ctx;
    const cos = Number.isFinite(feature.cos) ? feature.cos : Math.cos(feature.angle || 0);
    const sin = Number.isFinite(feature.sin) ? feature.sin : Math.sin(feature.angle || 0);
    const rx = Math.max(1, Number(feature.length || feature.w || feature.r * 2 || 40) * .5 * scale);
    const ry = Math.max(1, Number(feature.width || feature.h || feature.r * 2 || 40) * .5 * scale);
    ctx.beginPath();
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * TAU;
      const localX = Math.cos(angle) * rx;
      const localY = Math.sin(angle) * ry;
      const point = this.worldToScreen(feature.x + localX * cos - localY * sin, feature.y + localX * sin + localY * cos, .4);
      if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
    }
    ctx.closePath();
  }
  drawSurface(feature) {
    const ctx = this.ctx;
    const terrain = this.terrainPalette || {};
    const palette = {
      water: [cssColor(terrain.water, 'rgba(35,104,104,.92)'), cssColor(terrain.waterLight, 'rgba(173,225,212,.34)', .42)],
      sand: [cssColor(terrain.sand, '#b99754'), cssColor(terrain.sandLight, 'rgba(246,220,159,.48)', .48)],
      moss: [cssColor(terrain.moss, '#315f3a'), cssColor(terrain.mossLight, 'rgba(144,181,102,.36)', .42)]
    };
    const colors = palette[feature.type];
    if (!colors) return;
    ctx.save();
    if (feature.a && feature.b) {
      const a = this.worldToScreen(feature.a.x, feature.a.y, .4);
      const b = this.worldToScreen(feature.b.x, feature.b.y, .4);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(4, feature.width * this.scale * .82);
      ctx.strokeStyle = colors[0];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.lineWidth = Math.max(1, feature.width * this.scale * .05);
      ctx.strokeStyle = colors[1];
      ctx.stroke();
    } else {
      this.pathEllipse(feature, .92);
      ctx.fillStyle = colors[0];
      ctx.fill();
      ctx.strokeStyle = colors[1];
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }
  drawLandform(feature) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = feature.kind === 'depression' ? 'rgba(225,210,151,.24)' : 'rgba(229,232,178,.30)';
    ctx.lineWidth = .8;
    if (feature.a && feature.b) {
      const a = this.worldToScreen(feature.a.x, feature.a.y, 1);
      const b = this.worldToScreen(feature.b.x, feature.b.y, 1);
      ctx.lineWidth = Math.max(2, feature.width * this.scale * .07);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else {
      for (const scale of [.38, .62, .82]) {
        this.pathEllipse(feature, scale);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  drawBarrier(wall) {
    const ctx = this.ctx;
    const a = this.worldToScreen(wall.ax, wall.ay, 1);
    const b = this.worldToScreen(wall.bx, wall.by, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, Number(wall.thickness || 18) * this.scale);
    ctx.strokeStyle = wall.material === 'brass' ? '#a78448' : wall.material === 'stone' ? '#6f7165' : wall.material === 'glass' ? 'rgba(186,216,204,.72)' : '#604329';
    ctx.beginPath(); ctx.moveTo(a.x + 2, a.y + 4); ctx.lineTo(b.x + 2, b.y + 4); ctx.stroke();
    ctx.lineWidth *= .52;
    ctx.strokeStyle = wall.material === 'stone' ? '#aaa993' : wall.material === 'glass' ? 'rgba(222,241,231,.82)' : '#a47b46';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  drawPortal(endpoint, isEntry) {
    const ctx = this.ctx;
    const center = this.worldToScreen(endpoint.x, endpoint.y, 1);
    const radius = endpoint.r * this.scale;
    ctx.save();
    ctx.strokeStyle = '#aaa993';
    ctx.lineWidth = Math.max(3, radius * .24);
    ctx.beginPath(); ctx.ellipse(center.x, center.y, radius, radius * .82, 0, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(10,18,14,.78)';
    ctx.beginPath(); ctx.ellipse(center.x, center.y + radius * .05, radius * .72, radius * .52, 0, 0, TAU); ctx.fill();
    const marker = this.worldToScreen(endpoint.x + endpoint.axisX * endpoint.r * .75, endpoint.y + endpoint.axisY * endpoint.r * .75, 2);
    ctx.strokeStyle = isEntry ? '#d5ba6e' : '#9ab9aa';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(marker.x, marker.y); ctx.stroke();
    ctx.restore();
  }
  drawProp(obstacle) {
    const ctx = this.ctx;
    const parts = obstacle.parts?.length ? obstacle.parts : [{ x: 0, y: 0, r: obstacle.r }];
    for (const part of parts) {
      const x = obstacle.x + Number(part.x || 0);
      const y = obstacle.y + Number(part.y || 0);
      const radius = Number(part.r || obstacle.r);
      const p = this.worldToScreen(x, y, radius * .5);
      const r = radius * this.scale;
      ctx.fillStyle = 'rgba(3,10,6,.34)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 8, r, r * .5, 0, 0, TAU); ctx.fill();
      const rock = ctx.createRadialGradient(p.x - r * .3, p.y - r * .4, 0, p.x, p.y, r);
      rock.addColorStop(0, obstacle.material === 'wood' ? '#ad8350' : '#b8b59d');
      rock.addColorStop(1, obstacle.material === 'wood' ? '#4e3925' : '#596158');
      ctx.fillStyle = rock;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * .35, r, r * .8, 0, 0, TAU); ctx.fill();
    }
  }
  draw(level, ball, aim, time = 0) {
    this.resize(); this.fit(level);
    const ctx = this.ctx;
    const visual = level.visual || {};
    this.terrainPalette = visual.terrain || {};
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, visual.skyTop || '#30463b'); gradient.addColorStop(1, visual.skyBottom || '#101d17');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
    ctx.beginPath(); level.outline.forEach((point, index) => { const p = this.worldToScreen(point.x, point.y); if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
    ctx.fillStyle = cssColor(this.terrainPalette.grass, '#78945e'); ctx.fill();
    ctx.strokeStyle = cssColor(this.terrainPalette.grassLight, 'rgba(230,222,178,.42)', .42); ctx.lineWidth = 2; ctx.stroke();
    const field = level.course18?.field;
    for (const mask of field?.masks || []) this.drawSurface(mask);
    for (const landform of field?.landforms || []) this.drawLandform(landform);
    for (const wall of level.course18?.barriers || level.walls || []) this.drawBarrier(wall);
    for (const tunnel of level.course18?.tunnelVisuals || []) {
      if (tunnel.entry) this.drawPortal(tunnel.entry, true);
      if (tunnel.exit) this.drawPortal(tunnel.exit, false);
    }
    for (const obstacle of level.course18?.props || level.obstacles || []) this.drawProp(obstacle);
    for (const rotor of level.rotors || []) {
      const angle = rotor.angle + time * rotor.speed;
      const halfX = Math.cos(angle) * rotor.length * .5;
      const halfY = Math.sin(angle) * rotor.length * .5;
      this.drawBarrier({ ax: rotor.x - halfX, ay: rotor.y - halfY, bx: rotor.x + halfX, by: rotor.y + halfY, thickness: rotor.thickness, material: rotor.material });
    }
    const holeGround = level.course18?.field?.heightAt?.(level.hole.x, level.hole.y) || 0;
    const hole = this.worldToScreen(level.hole.x, level.hole.y, holeGround + .5);
    const hr = level.hole.r * this.scale;
    ctx.fillStyle = '#17150f'; ctx.beginPath(); ctx.ellipse(hole.x, hole.y, hr, hr * .82, 0, 0, TAU); ctx.fill();
    const ground = Number.isFinite(ball.groundZ) ? ball.groundZ : 0;
    const centerZ = (Number.isFinite(ball.z) ? ball.z : ground + BALL_RADIUS) - (ball.sunk ? ball.sink * (BALL_RADIUS + 20) : 0);
    const bp = this.worldToScreen(ball.x, ball.y, centerZ);
    const br = BALL_RADIUS * this.scale;
    const ballOpacity = ball.sunk ? Math.max(0, 1 - ball.sink * 1.35) : 1;
    if (ballOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = ballOpacity;
      ctx.fillStyle = 'rgba(3,10,6,.45)'; ctx.beginPath(); ctx.ellipse(bp.x, this.worldToScreen(ball.x, ball.y, ground).y, br, br * .35, 0, 0, TAU); ctx.fill();
      const sphere = ctx.createRadialGradient(bp.x - br * .35, bp.y - br * .45, br * .08, bp.x, bp.y, br);
      sphere.addColorStop(0, '#f5fff8'); sphere.addColorStop(.35, '#a7d1c0'); sphere.addColorStop(1, '#315448');
      ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(bp.x, bp.y, br, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (aim.active) {
      const speed = Math.hypot(aim.vx, aim.vy) || 1;
      const length = 95 + aim.power * 250;
      const end = this.worldToScreen(ball.x + aim.vx / speed * length, ball.y + aim.vy / speed * length, 2);
      ctx.save(); ctx.strokeStyle = '#eee9d4'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 7]);
      ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.restore();
    }
  }
}

export class DioramaRenderer {
  constructor(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, premultipliedAlpha: true }); } catch {}
    if (gl) return new WebGLDiorama(canvas, gl);
    return new CanvasFallback(canvas);
  }
}
