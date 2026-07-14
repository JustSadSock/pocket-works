import { BALL_RADIUS } from './physics.js';
import { levelBounds } from './levels.js';
import { terrainGradientAt, terrainHeightAt, zoneCenter, zoneKind } from './terrain.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const STRIDE = 11;

const C = {
  soil: [.24, .19, .12, 1],
  soilWet: [.16, .18, .12, 1],
  sand: [.72, .59, .34, 1],
  sandLight: [.86, .75, .48, 1],
  moss: [.20, .40, .22, 1],
  mossLight: [.35, .54, .28, 1],
  slope: [.42, .53, .29, 1],
  slopeSide: [.24, .31, .18, 1],
  wood: [.40, .28, .16, 1],
  woodLight: [.62, .46, .26, 1],
  iron: [.08, .16, .12, 1],
  ironLight: [.25, .34, .25, 1],
  brass: [.60, .46, .21, 1],
  water: [.18, .40, .40, .82],
  waterDeep: [.08, .23, .23, 1],
  curbInner: [.32, .34, .29, 1],
  curbLip: [.56, .57, .48, 1]
};

function hashNoise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function smooth(current, target, dt, speed = .002) {
  return lerp(current, target, 1 - Math.pow(speed, Math.max(1 / 240, dt)));
}

function createOverlay(canvas) {
  const overlay = document.createElement('canvas');
  overlay.className = 'moss-terrain-cues moss-terrain-cues-v16';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    zIndex: '4', pointerEvents: 'none'
  });
  const rendererOverlay = canvas.parentElement?.querySelector('.moss-render-overlay');
  (rendererOverlay || canvas).insertAdjacentElement('afterend', overlay);
  return overlay;
}

function normalFor(a, b, c) {
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

class MeshData {
  constructor() { this.data = []; }
  vertex(position, normal, tint, material) {
    this.data.push(...position, ...normal, ...tint, material);
  }
  triangle(a, b, c, tint, material, normal = null) {
    const n = normal || normalFor(a, b, c);
    this.vertex(a, n, tint, material);
    this.vertex(b, n, tint, material);
    this.vertex(c, n, tint, material);
  }
  quad(a, b, c, d, tint, material, normal = null) {
    const n = normal || normalFor(a, b, c);
    this.triangle(a, b, c, tint, material, n);
    this.triangle(a, c, d, tint, material, n);
  }
  fan(points, zFor, tint, material) {
    if (points.length < 3) return;
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    const centerZ = zFor(center, true);
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      this.triangle(
        [center.x, center.y, centerZ],
        [points[index].x, points[index].y, zFor(points[index], false)],
        [points[next].x, points[next].y, zFor(points[next], false)],
        tint,
        material
      );
    }
  }
  array() { return new Float32Array(this.data); }
}

function centerOf(points) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function scalePoints(points, factor) {
  const center = centerOf(points);
  return points.map((point) => ({ x: lerp(center.x, point.x, factor), y: lerp(center.y, point.y, factor) }));
}

function organicZonePoints(zone, seed = 0, margin = 18) {
  if (zone.shape === 'poly' && Array.isArray(zone.points) && zone.points.length >= 6) return zone.points;
  if (zone.shape === 'circle') {
    return Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * TAU;
      const wobble = 1 + (hashNoise(index, seed, 5) - .5) * .08;
      return { x: zone.x + Math.cos(angle) * (zone.r + margin) * wobble, y: zone.y + Math.sin(angle) * (zone.r + margin) * wobble };
    });
  }
  const cx = zone.x + zone.w * .5;
  const cy = zone.y + zone.h * .5;
  const rx = zone.w * .5 + margin;
  const ry = zone.h * .5 + margin;
  const power = 7;
  return Array.from({ length: 32 }, (_, index) => {
    const angle = index / 32 * TAU;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / power);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / power);
    const wobble = 1 + (hashNoise(index, seed, 19) - .5) * .055;
    return { x: cx + sx * rx * wobble, y: cy + sy * ry * wobble };
  });
}

function roundedRectPoints(zone, margin = 0, radius = 24, steps = 4) {
  const x0 = zone.x - margin; const y0 = zone.y - margin;
  const x1 = zone.x + zone.w + margin; const y1 = zone.y + zone.h + margin;
  const r = Math.min(radius, (x1 - x0) * .25, (y1 - y0) * .25);
  const corners = [
    { x: x1 - r, y: y0 + r, start: -Math.PI / 2 },
    { x: x1 - r, y: y1 - r, start: 0 },
    { x: x0 + r, y: y1 - r, start: Math.PI / 2 },
    { x: x0 + r, y: y0 + r, start: Math.PI }
  ];
  const points = [];
  for (const corner of corners) {
    for (let step = 0; step <= steps; step += 1) {
      const angle = corner.start + step / steps * Math.PI / 2;
      points.push({ x: corner.x + Math.cos(angle) * r, y: corner.y + Math.sin(angle) * r });
    }
  }
  return points;
}

function addRing(mesh, outer, inner, outerZ, innerZ, tint, material) {
  const count = Math.min(outer.length, inner.length);
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    mesh.quad(
      [outer[index].x, outer[index].y, outerZ],
      [outer[next].x, outer[next].y, outerZ],
      [inner[next].x, inner[next].y, innerZ],
      [inner[index].x, inner[index].y, innerZ],
      tint,
      material
    );
  }
}

function addDisc(mesh, x, y, z, rx, ry, tint, material, segments = 18, seed = 0) {
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * TAU;
    const wobble = 1 + (hashNoise(index, seed, 41) - .5) * .16;
    return { x: x + Math.cos(angle) * rx * wobble, y: y + Math.sin(angle) * ry * wobble };
  });
  mesh.fan(points, () => z, tint, material);
}

function addBoxAlong(mesh, ax, ay, bx, by, width, z0, z1, tint, material = 0) {
  const dx = bx - ax; const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * .5; const ny = dx / length * width * .5;
  const aL = [ax + nx, ay + ny]; const aR = [ax - nx, ay - ny];
  const bL = [bx + nx, by + ny]; const bR = [bx - nx, by - ny];
  const p = (point, z) => [point[0], point[1], z];
  mesh.quad(p(aL, z1), p(aR, z1), p(bR, z1), p(bL, z1), tint, material, [0, 0, 1]);
  mesh.quad(p(aL, z0), p(bL, z0), p(bL, z1), p(aL, z1), tint, material);
  mesh.quad(p(aR, z0), p(aR, z1), p(bR, z1), p(bR, z0), tint, material);
  mesh.quad(p(aL, z0), p(aL, z1), p(aR, z1), p(aR, z0), tint, material);
  mesh.quad(p(bL, z0), p(bR, z0), p(bR, z1), p(bL, z1), tint, material);
}

function rawSlopeHeight(zone, x, y) {
  const tx = clamp((x - zone.x) / Math.max(1, zone.w || 1), 0, 1);
  const ty = clamp((y - zone.y) / Math.max(1, zone.h || 1), 0, 1);
  return Number(zone.baseZ ?? 0) + tx * Number(zone.riseX ?? 0) + ty * Number(zone.riseY ?? 0);
}

function buildTerrainMeshes(level) {
  const opaque = new MeshData();
  const transparent = new MeshData();
  const seed = Number(level.id) || 1;
  const outline = level.outline || [];
  const centroid = centerOf(outline);

  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index];
    const b = outline[(index + 1) % outline.length];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    let nx = -dy / length; let ny = dx / length;
    const midX = (a.x + b.x) * .5; const midY = (a.y + b.y) * .5;
    if ((centroid.x - midX) * nx + (centroid.y - midY) * ny < 0) { nx *= -1; ny *= -1; }
    opaque.quad([a.x, a.y, .15], [b.x, b.y, .15], [b.x, b.y, 16.6], [a.x, a.y, 16.6], C.curbInner, 0);
    opaque.quad([a.x, a.y, 16.55], [b.x, b.y, 16.55], [b.x + nx * 6, b.y + ny * 6, 16.9], [a.x + nx * 6, a.y + ny * 6, 16.9], C.curbLip, 0, [0, 0, 1]);
  }

  for (let index = 0; index < (level.zones || []).length; index += 1) {
    const zone = level.zones[index];
    const kind = zoneKind(zone);
    const zoneSeed = seed * 37 + index * 101;

    if (kind === 'sand') {
      const outer = organicZonePoints(zone, zoneSeed, 18);
      const inner = scalePoints(outer, .90);
      opaque.fan(outer, () => .82, C.soil, 0);
      addRing(opaque, outer, inner, 1.2, 1.45, C.soilWet, 0);
      opaque.fan(inner, () => 1.5, C.sand, 8);
      for (let patch = 0; patch < 7; patch += 1) {
        const x = zone.x + zone.w * (.16 + hashNoise(patch, zoneSeed, 7) * .68);
        const y = zone.y + zone.h * (.16 + hashNoise(patch, zoneSeed, 11) * .68);
        addDisc(opaque, x, y, 1.62, 10 + hashNoise(patch, zoneSeed, 13) * 22, 5 + hashNoise(patch, zoneSeed, 17) * 12, patch % 2 ? C.sandLight : C.sand, 8, 14, zoneSeed + patch);
      }
    } else if (kind === 'moss') {
      const outer = organicZonePoints(zone, zoneSeed, 12);
      opaque.fan(outer, () => 1.18, C.moss, 7);
      const center = zoneCenter(zone);
      for (let patch = 0; patch < 13; patch += 1) {
        const angle = hashNoise(patch, zoneSeed, 23) * TAU;
        const radiusX = zone.w * (.08 + hashNoise(patch, zoneSeed, 29) * .28);
        const radiusY = zone.h * (.08 + hashNoise(patch, zoneSeed, 31) * .28);
        const x = center.x + Math.cos(angle) * radiusX;
        const y = center.y + Math.sin(angle) * radiusY;
        addDisc(opaque, x, y, 1.35 + hashNoise(patch, zoneSeed, 37) * .45, 12 + hashNoise(patch, zoneSeed, 41) * 28, 8 + hashNoise(patch, zoneSeed, 43) * 18, patch % 3 ? C.moss : C.mossLight, 7, 14, zoneSeed + patch);
      }
    } else if (kind === 'slope') {
      const points = zone.ramp ? roundedRectPoints(zone, 4, 18, 4) : organicZonePoints(zone, zoneSeed, 8);
      const raw = points.map((point) => rawSlopeHeight(zone, point.x, point.y));
      const lift = Math.max(1.4 - Math.min(...raw), 1.4);
      const zFor = (point) => rawSlopeHeight(zone, point.x, point.y) + lift;
      const topTint = zone.ramp ? C.woodLight : C.slope;
      const sideTint = zone.ramp ? C.wood : C.slopeSide;
      opaque.fan(points, zFor, topTint, zone.ramp ? 0 : 5);
      for (let p = 0; p < points.length; p += 1) {
        const next = (p + 1) % points.length;
        opaque.quad(
          [points[p].x, points[p].y, .65],
          [points[next].x, points[next].y, .65],
          [points[next].x, points[next].y, zFor(points[next])],
          [points[p].x, points[p].y, zFor(points[p])],
          sideTint,
          0
        );
      }
      if (zone.ramp) {
        const vertical = zone.h >= zone.w;
        const seams = 7;
        for (let seam = 1; seam < seams; seam += 1) {
          const t = seam / seams;
          if (vertical) {
            const y = lerp(zone.y + 8, zone.y + zone.h - 8, t);
            const x0 = zone.x + 7; const x1 = zone.x + zone.w - 7;
            const z0 = zFor({ x: x0, y }) + .35; const z1 = zFor({ x: x1, y }) + .35;
            addBoxAlong(opaque, x0, y, x1, y, 3.2, Math.min(z0, z1), Math.max(z0, z1) + .8, C.wood, 0);
          } else {
            const x = lerp(zone.x + 8, zone.x + zone.w - 8, t);
            const y0 = zone.y + 7; const y1 = zone.y + zone.h - 7;
            const z0 = zFor({ x, y: y0 }) + .35; const z1 = zFor({ x, y: y1 }) + .35;
            addBoxAlong(opaque, x, y0, x, y1, 3.2, Math.min(z0, z1), Math.max(z0, z1) + .8, C.wood, 0);
          }
        }
      }
    } else if (kind === 'water') {
      const outer = organicZonePoints(zone, zoneSeed, 16);
      const inner = scalePoints(outer, .87);
      opaque.fan(outer, () => .96, C.soilWet, 0);
      addRing(opaque, outer, inner, 1.25, 1.05, C.waterDeep, 0);
      transparent.fan(inner, () => 1.18, C.water, 6);
    } else if (kind === 'bridge') {
      const deckZ = Number(zone.height ?? 10) + 1.5;
      const points = roundedRectPoints(zone, 1.5, 12, 3);
      opaque.fan(points, () => deckZ, C.woodLight, 0);
      for (let p = 0; p < points.length; p += 1) {
        const next = (p + 1) % points.length;
        opaque.quad([points[p].x, points[p].y, 3], [points[next].x, points[next].y, 3], [points[next].x, points[next].y, deckZ], [points[p].x, points[p].y, deckZ], C.wood, 0);
      }
      const vertical = zone.h >= zone.w;
      const rails = vertical
        ? [[zone.x, zone.y, zone.x, zone.y + zone.h], [zone.x + zone.w, zone.y, zone.x + zone.w, zone.y + zone.h]]
        : [[zone.x, zone.y, zone.x + zone.w, zone.y], [zone.x, zone.y + zone.h, zone.x + zone.w, zone.y + zone.h]];
      for (const [ax, ay, bx, by] of rails) {
        addBoxAlong(opaque, ax, ay, bx, by, 7, deckZ - 2, deckZ + 5, C.iron, 4);
        addBoxAlong(opaque, ax, ay, bx, by, 5, deckZ + 26, deckZ + 32, C.ironLight, 4);
        const railLength = Math.hypot(bx - ax, by - ay);
        const posts = Math.max(2, Math.floor(railLength / 92));
        for (let post = 0; post <= posts; post += 1) {
          const t = post / posts;
          const x = lerp(ax, bx, t); const y = lerp(ay, by, t);
          addBoxAlong(opaque, x, y, x + .01, y + .01, 8, deckZ - 2, deckZ + 32, C.iron, 4);
        }
      }
    }
  }

  for (let index = 0; index < (level.obstacles || []).length; index += 1) {
    const obstacle = level.obstacles[index];
    const baseTint = obstacle.material === 'stone' ? C.moss : obstacle.material === 'pot' ? C.soilWet : C.mossLight;
    addDisc(opaque, obstacle.x, obstacle.y + obstacle.r * .05, 1.05, obstacle.r * 1.14, obstacle.r * .82, baseTint, 7, 22, seed + index * 13);
    for (let patch = 0; patch < 5; patch += 1) {
      const angle = (patch / 5 + hashNoise(index, patch, seed) * .12) * TAU;
      const radius = obstacle.r * (.78 + hashNoise(patch, index, seed) * .30);
      addDisc(opaque, obstacle.x + Math.cos(angle) * radius, obstacle.y + Math.sin(angle) * radius, 1.25, obstacle.r * (.14 + hashNoise(patch, seed, 77) * .12), obstacle.r * (.08 + hashNoise(patch, seed, 79) * .08), patch % 2 ? C.moss : C.mossLight, 7, 12, seed + index + patch);
    }
  }

  for (const wall of level.walls || []) {
    if (wall.material !== 'glass') continue;
    const thickness = Math.max(8, Number(wall.thickness || 18) * .55);
    addBoxAlong(opaque, wall.ax, wall.ay, wall.bx, wall.by, thickness, 2, 12, C.iron, 4);
    addBoxAlong(opaque, wall.ax, wall.ay, wall.bx, wall.by, Math.max(4, thickness * .52), 38, 45, C.ironLight, 4);
    const wallLength = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
    const posts = Math.max(2, Math.floor(wallLength / 90));
    for (let post = 0; post <= posts; post += 1) {
      const t = post / posts;
      const x = lerp(wall.ax, wall.bx, t); const y = lerp(wall.ay, wall.by, t);
      addBoxAlong(opaque, x, y, x + .01, y + .01, thickness, 2, 45, post % 2 ? C.iron : C.brass, 4);
    }
  }

  return { opaque: opaque.array(), transparent: transparent.array() };
}

function createGpuMesh(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: data.length / STRIDE };
}

function destroyGpuMesh(gl, mesh) {
  if (mesh?.buffer) gl.deleteBuffer(mesh.buffer);
}

export function installLivingTerrain(renderer, canvas, getState) {
  const overlay = createOverlay(canvas);
  const ctx = overlay.getContext('2d');
  const camera = { overview: false, overviewProgress: 0, introUntil: 0, levelKey: null, x: 0, y: 0, scale: 1 };
  let dpr = 1;
  let meshKey = null;
  let meshes = null;

  function resizeOverlay() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(480, rect.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) { overlay.width = pixelWidth; overlay.height = pixelHeight; }
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  renderer.surfaceHeight = (level, ball) => terrainHeightAt(level, ball.x, ball.y);
  renderer.ballHeight = (level, ball) => Number.isFinite(ball.z) ? ball.z : terrainHeightAt(level, ball.x, ball.y) + BALL_RADIUS;
  renderer.ballScreenPoint = (ball) => renderer.worldToScreen(ball.x, ball.y, Number.isFinite(ball.z) ? ball.z : BALL_RADIUS);

  renderer.fit = (level, providedBall, providedDt) => {
    const state = getState();
    const ball = providedBall || state.ball;
    const dt = Number.isFinite(providedDt) ? providedDt : 1 / 60;
    const bounds = levelBounds(level);
    const boardWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boardHeight = Math.max(1, bounds.maxY - bounds.minY);
    const width = renderer.width || canvas.clientWidth || window.innerWidth;
    const height = renderer.height || canvas.clientHeight || window.innerHeight;
    const key = level.renderId ?? level.id;
    if (camera.levelKey !== key) {
      camera.levelKey = key;
      camera.introUntil = performance.now() + (level.endless ? 1050 : 1750);
      camera.x = (bounds.minX + bounds.maxX) * .5;
      camera.y = (bounds.minY + bounds.maxY) * .5;
      camera.scale = Math.min((width - 34) / boardWidth, (height - 148) / (boardHeight * .82));
    }
    const autoOverview = performance.now() < camera.introUntil;
    const overviewTarget = camera.overview || autoOverview || state.mode !== 'playing';
    camera.overviewProgress = smooth(camera.overviewProgress, overviewTarget ? 1 : 0, dt, overviewTarget ? .0005 : .002);
    const fullScale = Math.min((width - 34) / boardWidth, (height - 148) / (boardHeight * .82));
    const followScale = Math.max(fullScale, Math.min((width - 30) / 720, (height - 156) / (900 * .82)));
    const targetScale = lerp(followScale, fullScale, camera.overviewProgress);
    camera.scale = smooth(camera.scale || targetScale, targetScale, dt, .0015);
    const centerX = (bounds.minX + bounds.maxX) * .5;
    const centerY = (bounds.minY + bounds.maxY) * .5;
    const speed = Math.hypot(ball?.vx || 0, ball?.vy || 0);
    const lookAhead = clamp(speed * .10, 0, 170);
    const velocityLength = speed || 1;
    let targetX = centerX; let targetY = centerY;
    if (camera.overviewProgress < .98 && ball) {
      targetX = ball.x + ball.vx / velocityLength * lookAhead;
      targetY = ball.y + ball.vy / velocityLength * lookAhead;
      const halfWorldWidth = width / Math.max(.001, camera.scale) * .5;
      const halfWorldHeight = (height - 122) / Math.max(.001, camera.scale * .82) * .5;
      targetX = boardWidth <= halfWorldWidth * 2 ? centerX : clamp(targetX, bounds.minX + halfWorldWidth - 80, bounds.maxX - halfWorldWidth + 80);
      targetY = boardHeight <= halfWorldHeight * 2 ? centerY : clamp(targetY, bounds.minY + halfWorldHeight - 60, bounds.maxY - halfWorldHeight + 60);
    }
    targetX = lerp(targetX, centerX, camera.overviewProgress);
    targetY = lerp(targetY, centerY, camera.overviewProgress);
    camera.x = smooth(camera.x, targetX, dt, camera.overviewProgress > .5 ? .0008 : .003);
    camera.y = smooth(camera.y, targetY, dt, camera.overviewProgress > .5 ? .0008 : .003);
    renderer.cameraX = camera.x; renderer.cameraY = camera.y; renderer.cameraZoom = 1; renderer.scale = camera.scale;
    renderer.offsetX = width * .5 - camera.x * camera.scale;
    renderer.offsetY = 78 + (height - 112) * .5 - camera.y * camera.scale * .82;
    renderer.parallaxX = smooth(renderer.parallaxX || 0, renderer.targetParallaxX || 0, dt, .035);
    renderer.parallaxY = smooth(renderer.parallaxY || 0, renderer.targetParallaxY || 0, dt, .035);
  };

  function ensureMeshes(level) {
    if (!renderer.gl || !renderer.program || !renderer.drawMesh) return null;
    const key = level.renderId ?? level.id;
    if (meshes && meshKey === key) return meshes;
    if (meshes) { destroyGpuMesh(renderer.gl, meshes.opaque); destroyGpuMesh(renderer.gl, meshes.transparent); }
    const built = buildTerrainMeshes(level);
    meshes = { opaque: createGpuMesh(renderer.gl, built.opaque), transparent: createGpuMesh(renderer.gl, built.transparent) };
    meshKey = key;
    return meshes;
  }

  function drawMeshes(level, time) {
    const active = ensureMeshes(level);
    if (!active) return;
    const gl = renderer.gl;
    gl.useProgram(renderer.program);
    gl.uniform2f(renderer.locations.viewport, renderer.width, renderer.height);
    gl.uniform1f(renderer.locations.scale, renderer.scale);
    gl.uniform2f(renderer.locations.offset, renderer.offsetX, renderer.offsetY);
    gl.uniform2f(renderer.locations.parallax, renderer.parallaxX, renderer.parallaxY);
    gl.uniform3f(renderer.locations.hole, level.hole.x, level.hole.y, level.hole.r * 1.03);
    gl.uniform1f(renderer.locations.time, time);
    renderer.drawMesh(active.opaque, false, true);
    renderer.drawMesh(active.transparent, true, false);
    gl.depthMask(true);
  }

  function pathZone(zone, z = 2, margin = 18, seed = 0) {
    const points = zoneKind(zone) === 'bridge' || zone.ramp ? roundedRectPoints(zone, 1, 12, 3) : organicZonePoints(zone, seed, margin);
    ctx.beginPath();
    points.forEach((point, index) => {
      const height = zoneKind(zone) === 'slope'
        ? Math.max(1.4, rawSlopeHeight(zone, point.x, point.y) + Math.max(1.4 - Math.min(Number(zone.baseZ ?? 0), Number(zone.baseZ ?? 0) + Number(zone.riseX ?? 0), Number(zone.baseZ ?? 0) + Number(zone.riseY ?? 0)), 1.4))
        : z;
      const screen = renderer.worldToScreen(point.x, point.y, height);
      if (index) ctx.lineTo(screen.x, screen.y); else ctx.moveTo(screen.x, screen.y);
    });
    ctx.closePath();
  }

  function drawZoneTexture(zone, index, time, fallback) {
    const kind = zoneKind(zone);
    const seed = (Number(getState()?.level?.id) || 1) * 31 + index * 71;
    ctx.save();
    pathZone(zone, kind === 'bridge' ? Number(zone.height ?? 10) + 2 : 2, kind === 'moss' ? 12 : 18, seed);
    if (fallback) {
      ctx.fillStyle = kind === 'sand' ? '#b99b58' : kind === 'moss' ? '#35633b' : kind === 'water' ? '#285c5b' : kind === 'slope' ? (zone.ramp ? '#8a6335' : '#6f824d') : kind === 'bridge' ? '#80603b' : 'transparent';
      ctx.fill();
    }
    ctx.clip();

    if (kind === 'sand') {
      ctx.globalAlpha = .7;
      for (let row = 0; row < 7; row += 1) {
        const y = zone.y + zone.h * (.13 + row * .12);
        const a = renderer.worldToScreen(zone.x - 10, y, 2.2);
        const b = renderer.worldToScreen(zone.x + zone.w + 10, y, 2.2);
        ctx.strokeStyle = row % 2 ? 'rgba(76,53,27,.32)' : 'rgba(239,213,142,.22)';
        ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(lerp(a.x, b.x, .3), a.y + Math.sin(row) * 4, lerp(a.x, b.x, .7), b.y - Math.cos(row) * 3, b.x, b.y); ctx.stroke();
      }
      for (let dot = 0; dot < 34; dot += 1) {
        const x = zone.x + hashNoise(dot, seed, 201) * zone.w;
        const y = zone.y + hashNoise(dot, seed, 203) * zone.h;
        const p = renderer.worldToScreen(x, y, 2.4);
        ctx.fillStyle = `rgba(76,55,29,${.08 + hashNoise(dot, seed, 207) * .18})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, .5 + hashNoise(dot, seed, 211) * 1.2, 0, TAU); ctx.fill();
      }
    } else if (kind === 'moss') {
      for (let patch = 0; patch < 28; patch += 1) {
        const x = zone.x + hashNoise(patch, seed, 223) * zone.w;
        const y = zone.y + hashNoise(patch, seed, 227) * zone.h;
        const p = renderer.worldToScreen(x, y, 2.5);
        const size = 2 + hashNoise(patch, seed, 229) * 7;
        ctx.fillStyle = patch % 3 ? 'rgba(114,151,82,.16)' : 'rgba(24,75,40,.24)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, size, size * .55, hashNoise(patch, seed, 233) * Math.PI, 0, TAU); ctx.fill();
      }
    } else if (kind === 'slope') {
      const gradient = terrainGradientAt({ zones: [zone] }, zone.x + zone.w * .5, zone.y + zone.h * .5);
      const vertical = Math.abs(gradient.y) >= Math.abs(gradient.x);
      const bands = zone.ramp ? 8 : 9;
      for (let band = 1; band < bands; band += 1) {
        const t = band / bands;
        let a; let b;
        if (vertical) {
          const y = zone.y + zone.h * t;
          a = { x: zone.x - 12, y }; b = { x: zone.x + zone.w + 12, y };
        } else {
          const x = zone.x + zone.w * t;
          a = { x, y: zone.y - 12 }; b = { x, y: zone.y + zone.h + 12 };
        }
        const lift = Math.max(1.4 - Math.min(Number(zone.baseZ ?? 0), Number(zone.baseZ ?? 0) + Number(zone.riseX ?? 0), Number(zone.baseZ ?? 0) + Number(zone.riseY ?? 0)), 1.4);
        const pa = renderer.worldToScreen(a.x, a.y, rawSlopeHeight(zone, a.x, a.y) + lift + .6);
        const pb = renderer.worldToScreen(b.x, b.y, rawSlopeHeight(zone, b.x, b.y) + lift + .6);
        ctx.strokeStyle = zone.ramp ? 'rgba(57,38,20,.38)' : `rgba(221,229,179,${.10 + band / bands * .12})`;
        ctx.lineWidth = zone.ramp ? 1 : .8;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo((pa.x + pb.x) * .5, (pa.y + pb.y) * .5 + Math.sin(band * 1.8) * 2, pb.x, pb.y); ctx.stroke();
      }
    } else if (kind === 'water') {
      for (let row = 0; row < 7; row += 1) {
        const y = zone.y + zone.h * (row + .7) / 8;
        const a = renderer.worldToScreen(zone.x - 20, y, 2.2);
        const b = renderer.worldToScreen(zone.x + zone.w + 20, y, 2.2);
        const drift = Math.sin(time * 1.3 + row * 1.7) * 5;
        ctx.strokeStyle = `rgba(190,231,220,${.09 + row * .014})`;
        ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(a.x + drift, a.y); ctx.bezierCurveTo(lerp(a.x, b.x, .35), a.y - 3, lerp(a.x, b.x, .7), b.y + 3, b.x + drift, b.y); ctx.stroke();
      }
    } else if (kind === 'bridge') {
      const vertical = zone.h >= zone.w;
      const seams = 9;
      for (let seam = 1; seam < seams; seam += 1) {
        const t = seam / seams;
        const a = vertical ? { x: zone.x, y: zone.y + zone.h * t } : { x: zone.x + zone.w * t, y: zone.y };
        const b = vertical ? { x: zone.x + zone.w, y: zone.y + zone.h * t } : { x: zone.x + zone.w * t, y: zone.y + zone.h };
        const pa = renderer.worldToScreen(a.x, a.y, Number(zone.height ?? 10) + 2.4);
        const pb = renderer.worldToScreen(b.x, b.y, Number(zone.height ?? 10) + 2.4);
        ctx.strokeStyle = 'rgba(55,35,18,.38)'; ctx.lineWidth = .85;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawOffscreenHole(level) {
    const hole = renderer.worldToScreen(level.hole.x, level.hole.y, terrainHeightAt(level, level.hole.x, level.hole.y) + 78);
    const margin = 66; const width = renderer.width || canvas.clientWidth; const height = renderer.height || canvas.clientHeight;
    if (hole.x >= margin && hole.x <= width - margin && hole.y >= margin && hole.y <= height - margin) return;
    const center = { x: width * .5, y: height * .5 }; const dx = hole.x - center.x; const dy = hole.y - center.y; const angle = Math.atan2(dy, dx);
    const scale = Math.min((width * .5 - 34) / Math.max(1, Math.abs(dx)), (height * .5 - 92) / Math.max(1, Math.abs(dy)));
    const x = center.x + dx * scale; const y = center.y + dy * scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = 'rgba(238,225,174,.72)';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawAirborne(ball, level) {
    if (!ball?.airborne || ball.inCup) return;
    const ground = terrainHeightAt(level, ball.x, ball.y);
    const groundPoint = renderer.worldToScreen(ball.x, ball.y, ground + 1);
    const ballPoint = renderer.worldToScreen(ball.x, ball.y, ball.z);
    const gap = Math.max(0, groundPoint.y - ballPoint.y);
    ctx.save();
    ctx.fillStyle = `rgba(4,14,8,${clamp(.38 - gap / 400, .12, .34)})`;
    ctx.beginPath(); ctx.ellipse(groundPoint.x, groundPoint.y, BALL_RADIUS * renderer.scale * 1.05, BALL_RADIUS * renderer.scale * .34, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function draw(level, ball, time, mode) {
    drawMeshes(level, time);
    const size = resizeOverlay();
    ctx.clearRect(0, 0, size.width, size.height);
    if (!level) return;
    const fallback = !renderer.gl;
    for (let index = 0; index < (level.zones || []).length; index += 1) drawZoneTexture(level.zones[index], index, time, fallback);
    drawAirborne(ball, level);
    if (mode === 'playing' && camera.overviewProgress < .7) drawOffscreenHole(level);
    if (camera.overviewProgress > .5) {
      ctx.fillStyle = `rgba(238,233,211,${(camera.overviewProgress - .5) * .22})`;
      ctx.font = '700 10px "Avenir Next", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('ВСЯ ТЕРРИТОРИЯ', size.width * .5, size.height - 34);
    }
  }

  return {
    draw,
    setOverview(value) { camera.overview = Boolean(value); },
    toggleOverview() { camera.overview = !camera.overview; return camera.overview; },
    isOverview() { return camera.overview; },
    cancelOverview() { camera.overview = false; },
    beginLevel() { camera.introUntil = performance.now() + 1750; },
    get progress() { return camera.overviewProgress; }
  };
}
