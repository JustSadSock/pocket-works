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
  flower: [.84, .82, .60, 1],
  rockMoss: [.23, .42, .20, 1]
};

function paletteFor(level) {
  return { ...C, ...(level?.visual?.materials || {}) };
}

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

// Material and geometry live in one vocabulary: chiseled limestone, carved
// oak, dark loam and small patches of moss. The visible radius never exceeds
// the collidable part radius; procedural clusters reuse their individual parts.
function tone(tint, multiplier = 1) {
  return [Math.min(1, tint[0] * multiplier), Math.min(1, tint[1] * multiplier), Math.min(1, tint[2] * multiplier), tint[3]];
}

function lowPolyRock(mesh, shadows, level, prop, part, seed, palette) {
  const x = prop.x + Number(part?.x || 0);
  const y = prop.y + Number(part?.y || 0);
  const radius = Math.max(8, Number(part?.r || prop.r || 48));
  const ground = terrainHeightAt(level, x, y);
  const height = radius * (.74 + noise(seed, 18) * .14);
  const segments = 15;
  const profile = [
    { z: ground + .2, width: .86, ox: 0, oy: 0 },
    { z: ground + height * .28, width: .98, ox: 0, oy: 0 },
    { z: ground + height * .66, width: .79, ox: radius * .025, oy: -radius * .016 },
    { z: ground + height * .94, width: .32, ox: radius * .045, oy: -radius * .022 }
  ];
  const vertices = profile.map((layer, row) => Array.from({ length: segments }, (_, segment) => {
    const angle = segment / segments * TAU;
    const variation = .94 + noise(segment, seed, 11) * .055 + noise(segment, row, seed) * .01;
    const extent = radius * layer.width * variation;
    return [x + layer.ox + Math.cos(angle) * extent, y + layer.oy + Math.sin(angle) * extent, layer.z];
  }));
  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const direction = Math.sin(segment / segments * TAU + .5) * .055;
      const tint = tone(row === 2 ? palette.stoneLight : palette.stone, .92 + direction + noise(segment, seed, 37) * .07);
      mesh.quad(vertices[row][segment], vertices[row][next], vertices[row + 1][next], vertices[row + 1][segment], tint, 0);
    }
  }
  const crown = [x + radius * .035, y - radius * .017, ground + height];
  for (let segment = 0; segment < segments; segment += 1) {
    mesh.triangle(vertices.at(-1)[segment], vertices.at(-1)[(segment + 1) % segments], crown,
      tone(palette.stoneLight, .92 + noise(segment, seed, 29) * .06), 0);
  }
  // A little damp moss grows low on only one or two faces, not random green spikes.
  for (const segment of [2, 3, 4]) {
    if (noise(segment, seed, 53) < .30) continue;
    const next = (segment + 1) % segments;
    mesh.triangle(
      [vertices[0][segment][0], vertices[0][segment][1], ground + .55],
      [vertices[0][next][0], vertices[0][next][1], ground + .55],
      [vertices[1][segment][0] * .45 + vertices[1][next][0] * .55, vertices[1][segment][1] * .45 + vertices[1][next][1] * .55, ground + height * .22],
      tone(palette.rockMoss, .80), 7
    );
  }
  disc(shadows, x + radius * .07, y + radius * .11, ground + .1, radius * .98, radius * .70, C.shadow, 3, 20);
}

function stump(mesh, shadows, level, prop, seed, palette) {
  const ground = terrainHeightAt(level, prop.x, prop.y);
  const radius = Math.max(14, prop.r || 56);
  const height = Math.max(18, Number(prop.height || radius * 1.15));
  const top = ground + height;
  // The silhouette retains the real collider. Wood grain follows the trunk,
  // while the cut face is a flat, warm end-grain disc instead of a fake pot.
  cylinder(mesh, {
    x: prop.x, y: prop.y, z0: ground + .3, z1: top - .9,
    r0: radius * .93, r1: radius * .87, tint: palette.wood,
    topTint: palette.woodTop, material: 0, segments: 22, irregular: .045, seed
  });
  ring(mesh, prop.x, prop.y, top - .50, radius * .09, radius * .83, palette.woodTop, 0, 28);
  ring(mesh, prop.x, prop.y, top - .34, radius * .30, radius * .345, tone(palette.wood, .89), 0, 28);
  ring(mesh, prop.x, prop.y, top - .30, radius * .55, radius * .59, tone(palette.wood, .84), 0, 28);
  ring(mesh, prop.x, prop.y, top - .26, radius * .76, radius * .82, tone(palette.wood, .79), 0, 28);
  const ribs = 11;
  for (let index = 0; index < ribs; index += 1) {
    const angle = (index + noise(index, seed, 4) * .13) / ribs * TAU;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const x = prop.x + ca * radius * .905;
    const y = prop.y + sa * radius * .905;
    const z0 = ground + height * .08, z1 = top - height * .10;
    // Narrow bark flute, embedded in the wood body.
    mesh.quad(
      [x, y, z0],
      [x - sa * radius * .018, y + ca * radius * .018, z0 + 3],
      [prop.x + ca * radius * .84 - sa * radius * .018, prop.y + sa * radius * .84 + ca * radius * .018, z1],
      [prop.x + ca * radius * .84, prop.y + sa * radius * .84, z1 - 3],
      tone(palette.wood, .72), 0
    );
  }
  disc(shadows, prop.x + 4, prop.y + 7, ground + .12, radius, radius * .72, C.shadowStrong, 3, 22);
}

function barrierBox(mesh, shadows, level, wall, palette) {
  const dx = wall.bx - wall.ax, dy = wall.by - wall.ay;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  const half = Math.max(4, Number(wall.thickness || 18) * .5);
  const zA = terrainHeightAt(level, wall.ax, wall.ay) + .6;
  const zB = terrainHeightAt(level, wall.bx, wall.by) + .6;
  const height = Number(wall.visualHeight || 28);
  const isStone = wall.material === 'stone' || Boolean(wall.tunnelWall);
  const topTint = isStone ? palette.stoneLight : palette.woodTop;
  const sideTint = isStone ? palette.stone : palette.wood;
  const aL = [wall.ax + nx * half, wall.ay + ny * half, zA];
  const aR = [wall.ax - nx * half, wall.ay - ny * half, zA];
  const bL = [wall.bx + nx * half, wall.by + ny * half, zB];
  const bR = [wall.bx - nx * half, wall.by - ny * half, zB];
  const atL = [aL[0], aL[1], zA + height], atR = [aR[0], aR[1], zA + height];
  const btL = [bL[0], bL[1], zB + height], btR = [bR[0], bR[1], zB + height];
  mesh.quad(aL, bL, btL, atL, sideTint, 0);
  mesh.quad(aR, atR, btR, bR, tone(sideTint, .85), 0);
  mesh.quad(atL, atR, btR, btL, topTint, 0, [0, 0, 1]);
  mesh.quad(aL, atL, atR, aR, tone(sideTint, .83), 0);
  mesh.quad(bL, bR, btR, btL, tone(sideTint, .83), 0);

  const at = (t, side, lift = .34) => [
    wall.ax + dx * t + nx * side * half,
    wall.ay + dy * t + ny * side * half,
    lerp(zA, zB, t) + height + lift
  ];
  // A single inset carving gives the top its material, never a random decal.
  if (isStone) {
    mesh.quad(at(.07, -.58), at(.93, -.58), at(.93, .58), at(.07, .58),
      tone(palette.stone, .89), 0, [0, 0, 1]);
    for (let t = .23; t <= .78; t += .27) {
      mesh.quad(at(t, -.60, .46), at(t + .012, -.60, .46), at(t + .012, .60, .46), at(t, .60, .46),
        tone(palette.stoneLight, .77), 0, [0, 0, 1]);
    }
  } else {
    mesh.quad(at(.08, -.12), at(.92, -.12), at(.92, .12), at(.08, .12),
      tone(palette.wood, .78), 0, [0, 0, 1]);
    const pegRadius = Math.min(half * .18, 3.5);
    for (const t of [.10, .90]) {
      const center = at(t, 0, .54);
      disc(mesh, center[0], center[1], center[2], pegRadius, pegRadius, palette.stoneLight, 4, 10);
    }
  }
  disc(shadows, (wall.ax + wall.bx) * .5 + 4, (wall.ay + wall.by) * .5 + 7,
    (zA + zB) * .5 + .1, length * .52, half * 1.7, C.shadow, 3, 18);
}

function portalPoint(endpoint, lateral, z, depth) {
  const nx = -endpoint.axisY;
  const ny = endpoint.axisX;
  return [endpoint.x + nx * lateral + endpoint.axisX * depth, endpoint.y + ny * lateral + endpoint.axisY * depth, z];
}

function portal(mesh, shadows, level, endpoint, seed, palette) {
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
    mesh.quad(outerA, outerB, innerB, innerA, index % 3 ? palette.stone : palette.stoneLight, 0);
    const backA = portalPoint(endpoint, Math.cos(a) * inner, ground + Math.sin(a) * inner, depth);
    const backB = portalPoint(endpoint, Math.cos(b) * inner, ground + Math.sin(b) * inner, depth);
    mesh.quad(innerA, innerB, backB, backA, palette.stoneDark, 9);
  }
  mesh.quad(
    portalPoint(endpoint, -inner, ground + .4, -10),
    portalPoint(endpoint, inner, ground + .4, -10),
    portalPoint(endpoint, inner * .82, ground + .4, depth),
    portalPoint(endpoint, -inner * .82, ground + .4, depth),
    palette.stone, 0, [0, 0, 1]
  );
  disc(shadows, endpoint.x + 5, endpoint.y + 9, ground + .1, radius * 1.10, radius * .65, C.shadowStrong, 3, 22);
}

function hole(mesh, shadows, level, palette) {
  const ground = terrainHeightAt(level, level.hole.x, level.hole.y);
  const radius = level.hole.r;
  const depth = Math.max(30, level.hole.depth || 64);
  disc(mesh, level.hole.x, level.hole.y, ground - depth, radius * .92, radius * .92, C.cup, 9, 28);
  cylinder(mesh, { x: level.hole.x, y: level.hole.y, z0: ground - depth, z1: ground - .8, r0: radius * .92, r1: radius * .92, tint: C.cup, topTint: C.cup, material: 9, segments: 28 });
  ring(mesh, level.hole.x, level.hole.y, ground + .20, radius * .98, radius + 7, palette.soil, 0, 30);
  disc(shadows, level.hole.x + 2, level.hole.y + 2, ground + .12, radius * 1.1, radius * .7, C.shadowStrong, 3, 24);
}

function details(mesh, level, seed, palette) {
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
    mesh.triangle([x - width, y, ground + .2], [x + width, y, ground + .2], [x + nx * 2, y + ny * 2, ground + height], index % 7 === 0 ? palette.flower : palette.leaf, 0);
  }
}

function build(level) {
  const opaque = new Mesh(level.course18.surfaceMesh.data);
  const shadows = new Mesh();
  const transparent = new Mesh();
  const seed = Number(level.id) || 18;
  const palette = paletteFor(level);
  hole(opaque, shadows, level, palette);
  for (const wall of level.course18.barriers || []) barrierBox(opaque, shadows, level, wall, palette);
  for (let index = 0; index < (level.course18.props || []).length; index += 1) {
    const prop = level.course18.props[index];
    if (prop.kind === 'stump') stump(opaque, shadows, level, prop, seed + index * 31, palette);
    else if (prop.kind === 'rockCluster') {
      for (let partIndex = 0; partIndex < (prop.parts || []).length; partIndex += 1) lowPolyRock(opaque, shadows, level, prop, prop.parts[partIndex], seed + index * 37 + partIndex * 11, palette);
    } else lowPolyRock(opaque, shadows, level, prop, null, seed + index * 37, palette);
  }
  for (let index = 0; index < (level.course18.tunnelVisuals || []).length; index += 1) {
    const tunnel = level.course18.tunnelVisuals[index];
    portal(opaque, shadows, level, tunnel.entry, seed + index * 53, palette);
    portal(opaque, shadows, level, tunnel.exit, seed + index * 53 + 19, palette);
  }
  details(opaque, level, seed, palette);
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
    gl.uniform1f(core.locations.rotation, core.cameraRotation || 0);
    gl.uniform2f(core.locations.cameraCenter, core.cameraX || 0, core.cameraY || 0);
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
