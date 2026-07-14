import { BALL_RADIUS } from './physics.js';
import { hillHeightAt, hillPeakPoint, rampHeightAt, terrainHeightAt, zoneCenter, zoneKind } from './terrain.js';

const TAU = Math.PI * 2;
const STRIDE = 11;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const C = {
  soil: [.22, .17, .10, 1],
  wet: [.12, .17, .12, 1],
  sand: [.72, .58, .33, 1],
  sandLight: [.88, .76, .49, 1],
  moss: [.18, .38, .20, 1],
  mossLight: [.34, .53, .27, 1],
  hillLow: [.29, .42, .22, 1],
  hillMid: [.43, .55, .29, 1],
  hillHigh: [.58, .66, .36, 1],
  contour: [.68, .72, .42, .72],
  wood: [.38, .25, .13, 1],
  woodLight: [.63, .45, .24, 1],
  stone: [.39, .41, .36, 1],
  stoneLight: [.62, .62, .53, 1],
  stoneDark: [.16, .19, .17, 1],
  iron: [.06, .13, .10, 1],
  ironLight: [.22, .31, .23, 1],
  brass: [.58, .43, .19, 1],
  brassLight: [.81, .67, .32, 1],
  water: [.17, .42, .42, .78],
  waterLight: [.36, .65, .60, .42],
  deep: [.06, .20, .20, 1]
};

function noise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function normal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

class Mesh {
  constructor() { this.data = []; }
  vertex(position, surfaceNormal, tint, material) { this.data.push(...position, ...surfaceNormal, ...tint, material); }
  triangle(a, b, c, tint, material, surfaceNormal = normal(a, b, c)) {
    this.vertex(a, surfaceNormal, tint, material);
    this.vertex(b, surfaceNormal, tint, material);
    this.vertex(c, surfaceNormal, tint, material);
  }
  quad(a, b, c, d, tint, material, surfaceNormal = normal(a, b, c)) {
    this.triangle(a, b, c, tint, material, surfaceNormal);
    this.triangle(a, c, d, tint, material, surfaceNormal);
  }
  fan(points, height, tint, material) {
    if (points.length < 3) return;
    const center = polygonCenter(points);
    const centerHeight = height(center);
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      this.triangle(
        [center.x, center.y, centerHeight],
        [points[index].x, points[index].y, height(points[index])],
        [points[next].x, points[next].y, height(points[next])],
        tint,
        material
      );
    }
  }
  array() { return new Float32Array(this.data); }
}

function polygonCenter(points) {
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  );
}

function bounds(zone) {
  if (zone.shape === 'circle') return { x: zone.x - zone.r, y: zone.y - zone.r, w: zone.r * 2, h: zone.r * 2 };
  if (zone.shape === 'poly' && zone.points?.length) {
    const xs = zone.points.map((point) => point.x);
    const ys = zone.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
  }
  return { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
}

function pointInPolygon(point, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index];
    const b = points[previous];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function organic(zone, seed = 0, margin = 0, count = 30) {
  if (zone.shape === 'poly' && zone.points?.length >= 6) {
    const center = polygonCenter(zone.points);
    const area = bounds(zone);
    const factor = 1 + margin / Math.max(24, Math.min(area.w, area.h) * .5);
    return zone.points.map((point) => ({ x: lerp(center.x, point.x, factor), y: lerp(center.y, point.y, factor) }));
  }
  const area = bounds(zone);
  const cx = area.x + area.w * .5;
  const cy = area.y + area.h * .5;
  const rx = area.w * .5 + margin;
  const ry = area.h * .5 + margin;
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * TAU;
    const wobble = .94 + noise(index, seed, 13) * .12;
    return { x: cx + Math.cos(angle) * rx * wobble, y: cy + Math.sin(angle) * ry * wobble };
  });
}

function scaleToward(points, center, factor) {
  return points.map((point) => ({ x: lerp(center.x, point.x, factor), y: lerp(center.y, point.y, factor) }));
}

function ring(mesh, outer, inner, outerHeight, innerHeight, tint, material) {
  const count = Math.min(outer.length, inner.length);
  const height = (value, point) => typeof value === 'function' ? value(point) : value;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    mesh.quad(
      [outer[index].x, outer[index].y, height(outerHeight, outer[index])],
      [outer[next].x, outer[next].y, height(outerHeight, outer[next])],
      [inner[next].x, inner[next].y, height(innerHeight, inner[next])],
      [inner[index].x, inner[index].y, height(innerHeight, inner[index])],
      tint,
      material
    );
  }
}

function disc(mesh, x, y, z, radiusX, radiusY, tint, material, segments = 18, seed = 0) {
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * TAU;
    const wobble = 1 + (noise(index, seed, 41) - .5) * .14;
    return { x: x + Math.cos(angle) * radiusX * wobble, y: y + Math.sin(angle) * radiusY * wobble };
  });
  mesh.fan(points, () => z, tint, material);
}

function box(mesh, ax, ay, bx, by, width, z0, z1, tint, material = 0) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * .5;
  const ny = dx / length * width * .5;
  const a = [ax + nx, ay + ny];
  const b = [ax - nx, ay - ny];
  const c = [bx - nx, by - ny];
  const d = [bx + nx, by + ny];
  const point = (value, z) => [value[0], value[1], z];
  mesh.quad(point(a, z1), point(b, z1), point(c, z1), point(d, z1), tint, material, [0, 0, 1]);
  mesh.quad(point(a, z0), point(d, z0), point(d, z1), point(a, z1), tint, material);
  mesh.quad(point(b, z0), point(b, z1), point(c, z1), point(c, z0), tint, material);
  mesh.quad(point(a, z0), point(a, z1), point(b, z1), point(b, z0), tint, material);
  mesh.quad(point(d, z0), point(c, z0), point(c, z1), point(d, z1), tint, material);
}

function strip(mesh, a, b, width, zA, zB, tint, material = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * .5;
  const ny = dx / length * width * .5;
  mesh.quad(
    [a.x + nx, a.y + ny, zA],
    [a.x - nx, a.y - ny, zA],
    [b.x - nx, b.y - ny, zB],
    [b.x + nx, b.y + ny, zB],
    tint,
    material
  );
}

function sampleInside(zone, seed, index) {
  const area = bounds(zone);
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const x = area.x + area.w * (.06 + noise(index, attempt, seed) * .88);
    const y = area.y + area.h * (.06 + noise(index, attempt, seed + 7) * .88);
    const point = { x, y };
    if (zone.shape !== 'poly' || pointInPolygon(point, zone.points)) return point;
  }
  return zoneCenter(zone);
}

function addHill(mesh, zone, seed) {
  const outline = organic(zone, seed, 0);
  const peak = hillPeakPoint(zone);
  const base = Number(zone.baseZ ?? 0);
  const fringe = scaleToward(outline, polygonCenter(outline), 1.035);
  ring(mesh, fringe, outline, base + .08, base + .16, C.wet, 0);

  let outer = outline;
  const rings = 9;
  for (let index = 1; index <= rings; index += 1) {
    const factor = 1 - index / (rings + 1);
    const inner = scaleToward(outline, peak, factor);
    const ratio = index / rings;
    const tint = ratio > .72 ? C.hillHigh : ratio > .34 ? C.hillMid : C.hillLow;
    ring(
      mesh,
      outer,
      inner,
      (point) => index === 1 ? base + .14 : hillHeightAt(zone, point.x, point.y) + .18,
      (point) => hillHeightAt(zone, point.x, point.y) + .20,
      tint,
      5
    );
    outer = inner;
  }
  mesh.fan(outer, (point) => hillHeightAt(zone, point.x, point.y) + .22, C.hillHigh, 5);

  for (const factor of [.34, .57, .77]) {
    const outside = scaleToward(outline, peak, factor + .010);
    const inside = scaleToward(outline, peak, factor - .010);
    ring(
      mesh,
      outside,
      inside,
      (point) => hillHeightAt(zone, point.x, point.y) + .48,
      (point) => hillHeightAt(zone, point.x, point.y) + .48,
      C.contour,
      5
    );
  }
}

function roundedRect(zone, radius = 16, steps = 4) {
  const x0 = zone.x;
  const y0 = zone.y;
  const x1 = zone.x + zone.w;
  const y1 = zone.y + zone.h;
  const r = Math.min(radius, zone.w * .25, zone.h * .25);
  const corners = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  const points = [];
  for (const [cx, cy, start] of corners) {
    for (let index = 0; index <= steps; index += 1) {
      const angle = start + index / steps * Math.PI / 2;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  }
  return points;
}

function addRamp(mesh, zone) {
  const stone = (zone.rampMaterial || zone.material) === 'stone';
  const top = stone ? C.stoneLight : C.woodLight;
  const side = stone ? C.stone : C.wood;
  const points = roundedRect(zone, stone ? 10 : 17);
  const height = (point) => rampHeightAt(zone, point.x, point.y) + .42;
  mesh.fan(points, height, top, 0);
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    mesh.quad(
      [points[index].x, points[index].y, .35],
      [points[next].x, points[next].y, .35],
      [points[next].x, points[next].y, height(points[next])],
      [points[index].x, points[index].y, height(points[index])],
      side,
      0
    );
  }
  const vertical = zone.h >= zone.w;
  const count = stone ? 5 : 8;
  for (let index = 1; index < count; index += 1) {
    const t = index / count;
    const a = vertical ? { x: zone.x + 7, y: lerp(zone.y + 5, zone.y + zone.h - 5, t) } : { x: lerp(zone.x + 5, zone.x + zone.w - 5, t), y: zone.y + 7 };
    const b = vertical ? { x: zone.x + zone.w - 7, y: a.y } : { x: a.x, y: zone.y + zone.h - 7 };
    strip(mesh, a, b, stone ? 2.2 : 3.6, height(a) + .24, height(b) + .24, stone ? C.stone : C.wood);
  }
}

function addSand(mesh, zone, seed) {
  const outer = organic(zone, seed, 9);
  const inner = scaleToward(outer, polygonCenter(outer), .86);
  const height = Number(zone.surfaceZ ?? .28) + .08;
  ring(mesh, outer, inner, .16, height, C.soil, 0);
  mesh.fan(inner, () => height, C.sand, 8);
  for (let index = 0; index < 16; index += 1) {
    const point = sampleInside(zone, seed, index);
    const long = 8 + noise(index, seed, 83) * 21;
    const short = 2.4 + noise(index, seed, 89) * 5.5;
    disc(mesh, point.x, point.y, height + .11, long, short, index % 4 ? C.sand : C.sandLight, 8, 12, seed + index);
  }
}

function addMoss(mesh, zone, seed) {
  const points = organic(zone, seed, 4);
  mesh.fan(points, () => .27, C.moss, 7);
  for (let index = 0; index < 20; index += 1) {
    const point = sampleInside(zone, seed + 17, index);
    disc(
      mesh,
      point.x,
      point.y,
      .36 + noise(index, seed, 103) * .12,
      7 + noise(index, seed, 107) * 22,
      4 + noise(index, seed, 109) * 13,
      index % 4 ? C.moss : C.mossLight,
      7,
      14,
      seed + index
    );
  }
}

function addWater(opaque, transparent, zone, seed) {
  const outer = organic(zone, seed, 9);
  const inner = scaleToward(outer, polygonCenter(outer), .87);
  ring(opaque, outer, inner, .16, -.65, C.wet, 0);
  opaque.fan(inner, () => -3.2, C.deep, 0);
  transparent.fan(inner, () => .14, C.water, 6);
  const area = bounds(zone);
  for (let index = 1; index <= 7; index += 1) {
    const y = area.y + area.h * index / 8;
    const start = { x: area.x + area.w * .12 + (noise(index, seed, 121) - .5) * 16, y };
    const end = { x: area.x + area.w * .88 + (noise(index, seed, 127) - .5) * 16, y: y + Math.sin(index) * 4 };
    strip(transparent, start, end, 1.6, .24, .24, C.waterLight, 6);
  }
}

function addBridge(mesh, zone) {
  const height = Number(zone.height ?? 10) + .24;
  const points = roundedRect(zone, 10, 3);
  mesh.fan(points, () => height, C.woodLight, 0);
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    mesh.quad([points[index].x, points[index].y, 2], [points[next].x, points[next].y, 2], [points[next].x, points[next].y, height], [points[index].x, points[index].y, height], C.wood, 0);
  }
  const vertical = zone.h >= zone.w;
  for (let index = 1; index < 10; index += 1) {
    const t = index / 10;
    const a = vertical ? { x: zone.x + 3, y: zone.y + zone.h * t } : { x: zone.x + zone.w * t, y: zone.y + 3 };
    const b = vertical ? { x: zone.x + zone.w - 3, y: a.y } : { x: a.x, y: zone.y + zone.h - 3 };
    strip(mesh, a, b, 2.2, height + .18, height + .18, C.wood);
  }
}

function addBases(mesh, level, seed) {
  for (let index = 0; index < (level.obstacles || []).length; index += 1) {
    const obstacle = level.obstacles[index];
    const ground = terrainHeightAt(level, obstacle.x, obstacle.y);
    const tint = obstacle.material === 'pot' || obstacle.material === 'cup' ? C.wet : C.moss;
    disc(mesh, obstacle.x, obstacle.y + obstacle.r * .05, ground + .18, obstacle.r * 1.16, obstacle.r * .84, tint, 7, 24, seed + index * 17);
  }
}

function addWalls(mesh, level) {
  for (const wall of level.terrainWalls || level.walls || []) {
    const material = wall.material || 'wood';
    if (material === 'glass' || material === 'iron') {
      const thickness = Math.max(8, Number(wall.thickness || 18) * .58);
      box(mesh, wall.ax, wall.ay, wall.bx, wall.by, thickness, 1, 11, C.iron, 4);
      box(mesh, wall.ax, wall.ay, wall.bx, wall.by, Math.max(4, thickness * .5), 39, 45, C.ironLight, 4);
      const posts = Math.max(2, Math.floor(Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) / 86));
      for (let index = 0; index <= posts; index += 1) {
        const t = index / posts;
        const x = lerp(wall.ax, wall.bx, t);
        const y = lerp(wall.ay, wall.by, t);
        box(mesh, x, y, x + .01, y + .01, thickness, 1, 45, index % 2 ? C.iron : C.brass, 4);
      }
    } else {
      box(mesh, wall.ax, wall.ay, wall.bx, wall.by, Number(wall.thickness || 18), .5, 34, material === 'brass' ? C.brass : C.wood, material === 'brass' ? 4 : 0);
    }
  }
}

function portalPoint(center, direction, normalVector, lateral, z, depth) {
  return [
    center.x + normalVector.x * lateral + direction.x * depth,
    center.y + normalVector.y * lateral + direction.y * depth,
    z
  ];
}

function indexTint(seed, sign) {
  return noise(seed, sign, 211) > .45 ? C.stone : C.stoneLight;
}

function addPortal(mesh, endpoint, isEntry, seed) {
  const travelAngle = Number(endpoint.angle ?? 0);
  const travel = { x: Math.cos(travelAngle), y: Math.sin(travelAngle) };
  const into = isEntry ? travel : { x: -travel.x, y: -travel.y };
  const side = { x: -into.y, y: into.x };
  const radius = Number(endpoint.r || 44);
  const mouth = {
    x: endpoint.x - into.x * 24,
    y: endpoint.y - into.y * 24
  };
  const depth = 54;
  const segments = 14;
  const outerRadius = radius * 1.10;
  const innerRadius = radius * .70;

  for (let index = 0; index < segments; index += 1) {
    const a = Math.PI - index / segments * Math.PI;
    const b = Math.PI - (index + 1) / segments * Math.PI;
    const outerA = portalPoint(mouth, into, side, Math.cos(a) * outerRadius, Math.sin(a) * outerRadius + 1, 0);
    const outerB = portalPoint(mouth, into, side, Math.cos(b) * outerRadius, Math.sin(b) * outerRadius + 1, 0);
    const innerA = portalPoint(mouth, into, side, Math.cos(a) * innerRadius, Math.sin(a) * innerRadius + 1, 0);
    const innerB = portalPoint(mouth, into, side, Math.cos(b) * innerRadius, Math.sin(b) * innerRadius + 1, 0);
    mesh.quad(outerA, outerB, innerB, innerA, index % 3 ? C.stone : C.stoneLight, 0);

    const backA = portalPoint(mouth, into, side, Math.cos(a) * innerRadius, Math.sin(a) * innerRadius + 1, depth);
    const backB = portalPoint(mouth, into, side, Math.cos(b) * innerRadius, Math.sin(b) * innerRadius + 1, depth);
    mesh.quad(innerA, innerB, backB, backA, C.stoneDark, 9);
  }

  const floorStart = portalPoint(mouth, into, side, -innerRadius, .4, -12);
  const floorStartRight = portalPoint(mouth, into, side, innerRadius, .4, -12);
  const floorBackRight = portalPoint(mouth, into, side, innerRadius * .82, .4, depth);
  const floorBack = portalPoint(mouth, into, side, -innerRadius * .82, .4, depth);
  mesh.quad(floorStart, floorStartRight, floorBackRight, floorBack, C.stone, 0, [0, 0, 1]);

  const backCenter = portalPoint(mouth, into, side, 0, innerRadius * .42, depth + .8);
  for (let index = 0; index < segments; index += 1) {
    const a = Math.PI - index / segments * Math.PI;
    const b = Math.PI - (index + 1) / segments * Math.PI;
    mesh.triangle(
      backCenter,
      portalPoint(mouth, into, side, Math.cos(a) * innerRadius * .96, Math.sin(a) * innerRadius * .96 + 1, depth),
      portalPoint(mouth, into, side, Math.cos(b) * innerRadius * .96, Math.sin(b) * innerRadius * .96 + 1, depth),
      C.stoneDark,
      9
    );
  }

  const marker = isEntry ? C.brassLight : C.ironLight;
  const markerStart = { x: mouth.x - into.x * 9, y: mouth.y - into.y * 9 };
  const markerEnd = { x: endpoint.x + into.x * 8, y: endpoint.y + into.y * 8 };
  strip(mesh, markerStart, markerEnd, 4.5, .62, .62, marker, 4);

  const buttressOffset = outerRadius * .78;
  for (const sign of [-1, 1]) {
    const x = mouth.x + side.x * buttressOffset * sign;
    const y = mouth.y + side.y * buttressOffset * sign;
    box(mesh, x, y, x + into.x * 25, y + into.y * 25, radius * .28, .3, radius * .62, indexTint(seed, sign), 0);
  }
}

function addTunnels(mesh, level, seed) {
  for (let index = 0; index < (level.terrainTunnels || []).length; index += 1) {
    const tunnel = level.terrainTunnels[index];
    if (tunnel.entry) addPortal(mesh, tunnel.entry, true, seed + index * 31);
    if (tunnel.exit) addPortal(mesh, tunnel.exit, false, seed + index * 31 + 11);
  }
}

function build(level) {
  const opaque = new Mesh();
  const transparent = new Mesh();
  const seed = Number(level.id) || 1;
  for (let index = 0; index < (level.zones || []).length; index += 1) {
    const zone = level.zones[index];
    const kind = zoneKind(zone);
    const zoneSeed = seed * 43 + index * 109;
    if (kind === 'sand') addSand(opaque, zone, zoneSeed);
    else if (kind === 'moss') addMoss(opaque, zone, zoneSeed);
    else if (kind === 'slope') zone.ramp ? addRamp(opaque, zone) : addHill(opaque, zone, zoneSeed);
    else if (kind === 'water') addWater(opaque, transparent, zone, zoneSeed);
    else if (kind === 'bridge') addBridge(opaque, zone);
  }
  addBases(opaque, level, seed);
  addWalls(opaque, level);
  addTunnels(opaque, level, seed);
  return { opaque: opaque.array(), transparent: transparent.array() };
}

function gpu(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: data.length / STRIDE };
}

export function installTerrain17(core, canvas) {
  if (!core?.gl || !core?.program || !core?.drawMesh) return { captureLegacyDrawMesh: false, destroy() {} };
  canvas.parentElement?.classList.add('moss-terrain-depth-fixed');
  const oldEnsure = core.ensureStatic.bind(core);
  const oldRender = core.render3D.bind(core);
  const oldSurfaceHeight = core.surfaceHeight.bind(core);
  const oldBallHeight = core.ballHeight.bind(core);
  let key = null;
  let meshes = null;

  const ensure = (level) => {
    const next = level.renderId ?? level.id;
    if (meshes && key === next) return meshes;
    if (meshes) {
      core.gl.deleteBuffer(meshes.opaque.buffer);
      core.gl.deleteBuffer(meshes.transparent.buffer);
    }
    const built = build(level);
    meshes = { opaque: gpu(core.gl, built.opaque), transparent: gpu(core.gl, built.transparent) };
    key = next;
    return meshes;
  };

  core.surfaceHeight = function surfaceHeight(level, ball) {
    const ground = terrainHeightAt(level, ball.x, ball.y);
    if (ball.waterTime > 0) return ground - Math.min(8, ball.waterTime * 22);
    return ground;
  };

  core.ballHeight = function ballHeight(level, ball) {
    if (ball.sunk && Number.isFinite(ball.z)) return ball.z;
    if (ball.airborne && Number.isFinite(ball.z)) return ball.z;
    return terrainHeightAt(level, ball.x, ball.y) + BALL_RADIUS;
  };

  core.ensureStatic = function ensureStatic(level) {
    oldEnsure(level);
    ensure(level);
  };

  core.render3D = function render3D(level, time) {
    const gl = core.gl;
    const terrain = ensure(level);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(core.program);
    gl.uniform2f(core.locations.viewport, core.width, core.height);
    gl.uniform1f(core.locations.scale, core.scale);
    gl.uniform2f(core.locations.offset, core.offsetX, core.offsetY);
    gl.uniform2f(core.locations.parallax, core.parallaxX, core.parallaxY);
    gl.uniform3f(core.locations.hole, level.hole.x, level.hole.y, level.hole.r * 1.03);
    gl.uniform1f(core.locations.time, time);
    core.drawMesh(core.staticMeshes.opaque, false, true);
    core.drawMesh(terrain.opaque, false, true);
    core.drawMesh(core.staticMeshes.shadows, true, false);
    core.drawMesh(core.dynamicShadows, true, false);
    core.drawMesh(core.dynamicOpaque, false, true);
    core.drawMesh(core.staticMeshes.transparent, true, false);
    core.drawMesh(terrain.transparent, true, false);
    core.drawMesh(core.dynamicTransparent, true, false);
    gl.depthMask(true);
  };

  return {
    captureLegacyDrawMesh: true,
    destroy() {
      core.ensureStatic = oldEnsure;
      core.render3D = oldRender;
      core.surfaceHeight = oldSurfaceHeight;
      core.ballHeight = oldBallHeight;
      if (meshes) {
        core.gl.deleteBuffer(meshes.opaque.buffer);
        core.gl.deleteBuffer(meshes.transparent.buffer);
      }
      canvas.parentElement?.classList.remove('moss-terrain-depth-fixed');
    }
  };
}
