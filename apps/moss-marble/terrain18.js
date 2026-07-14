import { installTerrain17 } from './terrain17.js';
import { terrainHeightAt } from './terrain.js';
import { isCourse18 } from './course18.js';

const TAU = Math.PI * 2;
const STRIDE = 11;
const lerp = (a, b, t) => a + (b - a) * t;

const C = {
  shadow: [.02, .07, .035, .30],
  shadowStrong: [.015, .045, .025, .48],
  soil: [.17, .13, .08, 1],
  cup: [.035, .045, .033, 1],
  stone: [.42, .43, .37, 1],
  stoneLight: [.61, .60, .49, 1],
  stoneDark: [.16, .18, .15, 1],
  wood: [.39, .25, .12, 1],
  woodLight: [.63, .43, .21, 1],
  woodTop: [.55, .35, .17, 1],
  leaf: [.23, .44, .20, 1],
  flower: [.84, .82, .60, 1]
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
  constructor(initial = null) { this.data = initial ? Array.from(initial) : []; }
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
  array() { return new Float32Array(this.data); }
}

function disc(mesh, x, y, z, rx, ry, tint, material, segments = 24) {
  const center = [x, y, z];
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    mesh.triangle(center, [x + Math.cos(a) * rx, y + Math.sin(a) * ry, z], [x + Math.cos(b) * rx, y + Math.sin(b) * ry, z], tint, material, [0, 0, 1]);
  }
}

function ring(mesh, x, y, z, inner, outer, tint, material, segments = 28) {
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const i0 = [x + Math.cos(a) * inner, y + Math.sin(a) * inner, z];
    const i1 = [x + Math.cos(b) * inner, y + Math.sin(b) * inner, z];
    const o0 = [x + Math.cos(a) * outer, y + Math.sin(a) * outer, z];
    const o1 = [x + Math.cos(b) * outer, y + Math.sin(b) * outer, z];
    mesh.quad(i0, o0, o1, i1, tint, material, [0, 0, 1]);
  }
}

function cylinder(mesh, options) {
  const { x, y, z0, z1, r0, r1 = r0, tint, material = 0, segments = 16, irregular = 0, seed = 0, topTint = tint } = options;
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const wa = 1 + (noise(index, seed, 7) - .5) * irregular;
    const wb = 1 + (noise(index + 1, seed, 7) - .5) * irregular;
    const p00 = [x + Math.cos(a) * r0 * wa, y + Math.sin(a) * r0 * wa, z0];
    const p01 = [x + Math.cos(b) * r0 * wb, y + Math.sin(b) * r0 * wb, z0];
    const p10 = [x + Math.cos(a) * r1 * wa, y + Math.sin(a) * r1 * wa, z1];
    const p11 = [x + Math.cos(b) * r1 * wb, y + Math.sin(b) * r1 * wb, z1];
    mesh.quad(p00, p01, p11, p10, tint, material);
  }
  disc(mesh, x, y, z1, r1, r1, topTint, material, segments);
}

function lowPolyRock(mesh, shadows, level, prop, part, seed) {
  const x = prop.x + Number(part?.x || 0);
  const y = prop.y + Number(part?.y || 0);
  const radius = Number(part?.r || prop.r || 48);
  const ground = terrainHeightAt(level, x, y);
  const rings = 3;
  const segments = 9;
  const points = [];
  for (let ringIndex = 0; ringIndex <= rings; ringIndex += 1) {
    const v = ringIndex / rings;
    const z = ground + Math.sin(v * Math.PI * .5) * radius * .92;
    const ringRadius = ringIndex === rings ? radius * .18 : radius * (1 - v * .66);
    points.push(Array.from({ length: segments }, (_, index) => {
      const angle = index / segments * TAU;
      const wobble = .84 + noise(index, ringIndex, seed) * .28;
      return [x + Math.cos(angle) * ringRadius * wobble, y + Math.sin(angle) * ringRadius * wobble, z];
    }));
  }
  for (let ringIndex = 0; ringIndex < rings; ringIndex += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      mesh.quad(points[ringIndex][index], points[ringIndex][next], points[ringIndex + 1][next], points[ringIndex + 1][index], (index + ringIndex) % 3 === 0 ? C.stoneLight : C.stone, 0);
    }
  }
  disc(shadows, x + radius * .08, y + radius * .14, ground + .12, radius * 1.08, radius * .72, C.shadowStrong, 3, 20);
}

function stump(mesh, shadows, level, prop, seed) {
  const ground = terrainHeightAt(level, prop.x, prop.y);
  const radius = prop.r || 56;
  const height = prop.height || radius * 1.15;
  cylinder(mesh, {
    x: prop.x, y: prop.y, z0: ground, z1: ground + height,
    r0: radius, r1: radius * .88, tint: C.wood, topTint: C.woodTop,
    material: 0, segments: 18, irregular: .10, seed
  });
  ring(mesh, prop.x, prop.y, ground + height + .18, radius * .25, radius * .62, C.woodLight, 0, 20);
  ring(mesh, prop.x, prop.y, ground + height + .24, radius * .63, radius * .67, C.wood, 0, 20);
  disc(shadows, prop.x + 5, prop.y + 9, ground + .12, radius * 1.12, radius * .72, C.shadowStrong, 3, 22);
}

function barrierBox(mesh, shadows, level, wall) {
  const dx = wall.bx - wall.ax;
  const dy = wall.by - wall.ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * wall.thickness * .5;
  const ny = dx / length * wall.thickness * .5;
  const zA = terrainHeightAt(level, wall.ax, wall.ay) + .5;
  const zB = terrainHeightAt(level, wall.bx, wall.by) + .5;
  const height = Number(wall.visualHeight || 28);
  const a0 = [wall.ax + nx, wall.ay + ny, zA];
  const a1 = [wall.ax - nx, wall.ay - ny, zA];
  const b0 = [wall.bx + nx, wall.by + ny, zB];
  const b1 = [wall.bx - nx, wall.by - ny, zB];
  const at0 = [a0[0], a0[1], zA + height];
  const at1 = [a1[0], a1[1], zA + height];
  const bt0 = [b0[0], b0[1], zB + height];
  const bt1 = [b1[0], b1[1], zB + height];
  const sideTint = wall.material === 'stone' ? C.stone : C.wood;
  const topTint = wall.material === 'stone' ? C.stoneLight : C.woodLight;
  mesh.quad(at0, at1, bt1, bt0, topTint, 0);
  mesh.quad(a0, b0, bt0, at0, sideTint, 0);
  mesh.quad(a1, at1, bt1, b1, sideTint, 0);
  mesh.quad(a0, at0, at1, a1, sideTint, 0);
  mesh.quad(b0, b1, bt1, bt0, sideTint, 0);
  disc(shadows, (wall.ax + wall.bx) * .5 + 4, (wall.ay + wall.by) * .5 + 7, (zA + zB) * .5 + .1, length * .53, wall.thickness * .9, C.shadow, 3, 18);
  if (wall.material === 'wood') {
    const marks = Math.max(1, Math.floor(length / 70));
    for (let index = 1; index < marks; index += 1) {
      const t = index / marks;
      const x = lerp(wall.ax, wall.bx, t);
      const y = lerp(wall.ay, wall.by, t);
      const z = lerp(zA, zB, t) + height + .22;
      const across = wall.thickness * .45;
      const p0 = [x + nx / wall.thickness * across, y + ny / wall.thickness * across, z];
      const p1 = [x - nx / wall.thickness * across, y - ny / wall.thickness * across, z];
      const forwardX = dx / length * 2;
      const forwardY = dy / length * 2;
      mesh.quad(p0, p1, [p1[0] + forwardX, p1[1] + forwardY, z], [p0[0] + forwardX, p0[1] + forwardY, z], C.wood, 0, [0, 0, 1]);
    }
  }
}

function portalPoint(endpoint, lateral, z, depth) {
  const nx = -endpoint.axisY;
  const ny = endpoint.axisX;
  return [endpoint.x + nx * lateral + endpoint.axisX * depth, endpoint.y + ny * lateral + endpoint.axisY * depth, z];
}

function portal(mesh, shadows, level, endpoint, seed) {
  const ground = terrainHeightAt(level, endpoint.x, endpoint.y);
  const width = endpoint.width || 82;
  const radius = width * .52;
  const inner = radius * .68;
  const depth = endpoint.depth || 76;
  const segments = 14;
  for (let index = 0; index < segments; index += 1) {
    const a = Math.PI - index / segments * Math.PI;
    const b = Math.PI - (index + 1) / segments * Math.PI;
    const outerA = portalPoint(endpoint, Math.cos(a) * radius, ground + Math.sin(a) * radius, 0);
    const outerB = portalPoint(endpoint, Math.cos(b) * radius, ground + Math.sin(b) * radius, 0);
    const innerA = portalPoint(endpoint, Math.cos(a) * inner, ground + Math.sin(a) * inner, 0);
    const innerB = portalPoint(endpoint, Math.cos(b) * inner, ground + Math.sin(b) * inner, 0);
    mesh.quad(outerA, outerB, innerB, innerA, index % 3 ? C.stone : C.stoneLight, 0);
    const backA = portalPoint(endpoint, Math.cos(a) * inner, ground + Math.sin(a) * inner, depth);
    const backB = portalPoint(endpoint, Math.cos(b) * inner, ground + Math.sin(b) * inner, depth);
    mesh.quad(innerA, innerB, backB, backA, C.stoneDark, 9);
  }
  mesh.quad(
    portalPoint(endpoint, -inner, ground + .4, -10),
    portalPoint(endpoint, inner, ground + .4, -10),
    portalPoint(endpoint, inner * .82, ground + .4, depth),
    portalPoint(endpoint, -inner * .82, ground + .4, depth),
    C.stone, 0, [0, 0, 1]
  );
  disc(shadows, endpoint.x + 5, endpoint.y + 9, ground + .1, radius * 1.10, radius * .65, C.shadowStrong, 3, 22);
}

function hole(mesh, shadows, level) {
  const ground = terrainHeightAt(level, level.hole.x, level.hole.y);
  const radius = level.hole.r;
  const depth = Math.max(30, level.hole.depth || 64);
  disc(mesh, level.hole.x, level.hole.y, ground - depth, radius * .92, radius * .92, C.cup, 9, 28);
  cylinder(mesh, { x: level.hole.x, y: level.hole.y, z0: ground - depth, z1: ground - .8, r0: radius * .92, r1: radius * .92, tint: C.cup, topTint: C.cup, material: 9, segments: 28 });
  ring(mesh, level.hole.x, level.hole.y, ground + .20, radius * .98, radius + 7, C.soil, 0, 30);
  disc(shadows, level.hole.x + 2, level.hole.y + 2, ground + .12, radius * 1.1, radius * .7, C.shadowStrong, 3, 24);
}

function details(mesh, level, seed) {
  const centerline = level.centerline || [];
  if (centerline.length < 2) return;
  for (let index = 0; index < 34; index += 1) {
    const t = (index + .5) / 34;
    const scaled = t * (centerline.length - 1);
    const segment = Math.min(centerline.length - 2, Math.floor(scaled));
    const local = scaled - segment;
    const a = centerline[segment];
    const b = centerline[segment + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const side = index % 2 ? 1 : -1;
    const offset = 115 + noise(index, seed, 71) * 115;
    const x = lerp(a.x, b.x, local) + nx * side * offset;
    const y = lerp(a.y, b.y, local) + ny * side * offset;
    const ground = terrainHeightAt(level, x, y);
    const height = 7 + noise(index, seed, 73) * 10;
    const width = 2.2 + noise(index, seed, 77) * 2.4;
    mesh.triangle([x - width, y, ground + .2], [x + width, y, ground + .2], [x + nx * 2, y + ny * 2, ground + height], index % 7 === 0 ? C.flower : C.leaf, 0);
  }
}

function build(level) {
  const opaque = new Mesh(level.course18.surfaceMesh.data);
  const shadows = new Mesh();
  const transparent = new Mesh();
  const seed = Number(level.id) || 18;
  hole(opaque, shadows, level);
  for (const wall of level.course18.barriers || []) barrierBox(opaque, shadows, level, wall);
  for (let index = 0; index < (level.course18.props || []).length; index += 1) {
    const prop = level.course18.props[index];
    if (prop.kind === 'stump') stump(opaque, shadows, level, prop, seed + index * 31);
    else if (prop.kind === 'rockCluster') {
      for (let partIndex = 0; partIndex < (prop.parts || []).length; partIndex += 1) lowPolyRock(opaque, shadows, level, prop, prop.parts[partIndex], seed + index * 37 + partIndex * 11);
    } else lowPolyRock(opaque, shadows, level, prop, null, seed + index * 37);
  }
  for (let index = 0; index < (level.course18.tunnelVisuals || []).length; index += 1) {
    const tunnel = level.course18.tunnelVisuals[index];
    portal(opaque, shadows, level, tunnel.entry, seed + index * 53);
    portal(opaque, shadows, level, tunnel.exit, seed + index * 53 + 19);
  }
  details(opaque, level, seed);
  return { opaque: opaque.array(), shadows: shadows.array(), transparent: transparent.array() };
}

function gpu(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: data.length / STRIDE };
}

export function installTerrain18(core, canvas) {
  const terrain17 = installTerrain17(core, canvas);
  if (!core?.gl || !core?.program || !core?.drawMesh) return terrain17;
  canvas.parentElement?.classList.add('moss-course18');
  const legacyEnsure = core.ensureStatic.bind(core);
  const legacyRender = core.render3D.bind(core);
  let key = null;
  let meshes = null;
  const ensure = (level) => {
    if (!isCourse18(level)) return null;
    const next = level.renderId ?? level.id;
    if (meshes && key === next) return meshes;
    if (meshes) Object.values(meshes).forEach((mesh) => core.gl.deleteBuffer(mesh.buffer));
    const built = build(level);
    meshes = { opaque: gpu(core.gl, built.opaque), shadows: gpu(core.gl, built.shadows), transparent: gpu(core.gl, built.transparent) };
    key = next;
    return meshes;
  };
  core.ensureStatic = function ensureStatic(level) {
    legacyEnsure(level);
    ensure(level);
  };
  core.render3D = function render3D(level, time) {
    if (!isCourse18(level)) {
      legacyRender(level, time);
      return;
    }
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
    core.drawMesh(terrain.shadows, true, false);
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
      core.ensureStatic = legacyEnsure;
      core.render3D = legacyRender;
      if (meshes) Object.values(meshes).forEach((mesh) => core.gl.deleteBuffer(mesh.buffer));
      terrain17.destroy?.();
      canvas.parentElement?.classList.remove('moss-course18');
    }
  };
}
