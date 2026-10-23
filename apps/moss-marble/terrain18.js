import { installTerrain17 } from './terrain17.js';
import { terrainHeightAt } from './terrain.js';
import { isCourse18 } from './course18.js';
import { appendSoftShadow, appendLineShadow } from './light-space.js';
import { appendGardenIdentity } from './garden-identity.js';
import { planTurfClumps, appendTurfClumps } from './turf-clumps.js';
import { buildWoodBarrierProfile } from './wood-barrier.js';
import { planGroundedRock } from './rock-profile.js';
import { planGroundedStump } from './stump-profile.js';
import { planGroundFooting, appendGroundFooting } from './ground-footing.js';

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
  const x=prop.x+Number(part?.x||0);
  const y=prop.y+Number(part?.y||0);
  const radius=Math.max(8,Number(part?.r||prop.r||48));
  const shape=planGroundedRock(x,y,radius,seed,(sx,sy)=>terrainHeightAt(level,sx,sy));
  const {rings,sideCount,rise}=shape;
  // Terrain-following foot, varied shoulders and an irregular, low crown:
  // there is no repeated conical tip and no horizontal floating base.
  for(let row=0;row<rings.length-1;row++){
    for(let j=0;j<sideCount;j++){
      const next=(j+1)%sideCount;
      const warmFacing=Math.sin(j/sideCount*TAU+.5)*.046;
      const light=row>=2?palette.stoneLight:palette.stone;
      const variation=.91+warmFacing+noise(j,seed,37)*.09;
      const tint=tone(light,variation);
      mesh.quad(rings[row][j],rings[row][next],rings[row+1][next],rings[row+1][j],tint,0);
    }
  }
  const crownTint=tone(palette.stoneLight,.96);
  for(let j=0;j<sideCount;j++){
    mesh.triangle(rings.at(-1)[j],rings.at(-1)[(j+1)%sideCount],shape.top,
      tone(crownTint,.95+noise(j,seed,29)*.055),0);
  }
  // A restrained patch of moss hugs one or two of the lower faces.
  // It shares rock vertices with a tiny offset rather than a sharp upright
  // triangle planted through stone.
  for(const j of [2,3]){
    if(noise(j,seed,53)<.31)continue;
    const next=(j+1)%sideCount;
    const a=rings[0][j],b=rings[0][next],c=rings[1][next],d=rings[1][j];
    const outward=p=>[p[0]+(p[0]-x)*.0012,p[1]+(p[1]-y)*.0012,p[2]+.12];
    mesh.quad(outward(a),outward(b),outward(c),outward(d),
      tone(palette.rockMoss,.78+noise(j,seed,57)*.14),7);
  }
  appendSoftShadow(shadows,(sx,sy)=>terrainHeightAt(level,sx,sy),{
    x,y,radiusX:radius*1.06,radiusY:radius*.91,
    height:rise*.19,strength:.235,segments:22
  });
}

function stump(mesh, shadows, level, prop, seed, palette) {
  const x=prop.x,y=prop.y;
  const radius=Math.max(14,prop.r||56);
  const height=Math.max(18,Number(prop.height||radius*1.15));
  const shape=planGroundedStump(x,y,radius,height,seed,(sx,sy)=>terrainHeightAt(level,sx,sy));
  // Continuous bark, rooted in the true surface and subtly faceted. Color
  // variation belongs to the bark faces, not upright overlaid stripes.
  const {bark,cut,segments}=shape;
  for(let row=0;row<bark.length-1;row++){
    for(let j=0;j<segments;j++){
      const next=(j+1)%segments;
      const grain=noise(j,seed,31);
      const weather=.86+grain*.13+Math.sin(j/segments*TAU+.4)*.045;
      const root=row===0?.82:row===2?1.035:1;
      const tint=tone(palette.wood,weather*root);
      mesh.quad(bark[row][j],bark[row][next],bark[row+1][next],bark[row+1][j],tint,11);
    }
  }
  // A thin dark cambium lip and six gently uneven annual-growth bands,
  // modeled as a single slightly tilted cut (not rings hovering above it).
  for(let j=0;j<segments;j++){
    const next=(j+1)%segments;
    mesh.quad(bark.at(-1)[j],bark.at(-1)[next],cut[0][next],cut[0][j],
      tone(palette.wood,.63),11);
  }
  const bands=[.83,1.03,.92,1.08,.93];
  for(let row=0;row<cut.length-1;row++){
    const band=tone(palette.woodTop,bands[row]);
    for(let j=0;j<segments;j++){
      const next=(j+1)%segments;
      mesh.quad(cut[row][j],cut[row][next],cut[row+1][next],cut[row+1][j],band,11,[0,0,1]);
    }
  }
  for(let j=0;j<segments;j++){
    const next=(j+1)%segments;
    mesh.triangle(cut.at(-1)[j],cut.at(-1)[next],shape.center,
      tone(palette.woodTop,.97),11,[0,0,1]);
  }
  // Hairline radial checks break the perfect target-like disk without
  // overpowering the end grain at phone scale.
  for(const check of shape.checks){
    mesh.triangle(check.a,check.b,check.c,tone(palette.woodTop,.68),11,[0,0,1]);
  }
  // A shallow physically anchored shadow grounds the stump. It is not a
  // decorative translucent circle around the obstacle.
  appendSoftShadow(shadows,(sx,sy)=>terrainHeightAt(level,sx,sy),{
    x,y,radiusX:radius*1.05,radiusY:radius*.93,
    height:height*.17,strength:.23,segments:22
  });
}

function carvedWoodBarrier(mesh, wall, palette, heightAt) {
  const profile=buildWoodBarrierProfile(wall,heightAt);
  if(!profile.segments)return;
  const {stations}=profile;
  // One joined, faceted oak railing: a dark grain side, softly chamfered
  // shoulders, and a single pale satin crown. Real ground heights are used
  // separately at each edge, including the two endpoints.
  for(let i=0;i<stations.length-1;i++){
    const a=stations[i],b=stations[i+1];
    const shadeFactor=.97 + Math.sin(i*.73+profile.length*.031)*.045;
    mesh.quad(a.footL,b.footL,b.shoulderL,a.shoulderL,tone(palette.wood,shadeFactor),11);
    mesh.quad(a.footR,a.shoulderR,b.shoulderR,b.footR,tone(palette.wood,.81*shadeFactor),11);
    mesh.quad(a.shoulderL,b.shoulderL,b.crownL,a.crownL,tone(palette.woodLight,.82),11);
    mesh.quad(a.crownL,b.crownL,b.crownR,a.crownR,palette.woodTop,11);
    mesh.quad(a.crownR,b.crownR,b.shoulderR,a.shoulderR,tone(palette.wood,.88),11);
  }
  // End-grain closes actual rail ends, not every small terrain-following
  // segment (which would leave bright transverse seams).
  const first=stations[0],last=stations.at(-1);
  for(const p of [first,last]){
    mesh.quad(p.footL,p.shoulderL,p.shoulderR,p.footR,tone(palette.wood,.71),11);
    mesh.quad(p.shoulderL,p.crownL,p.crownR,p.shoulderR,tone(palette.wood,.77),11);
  }
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
  if(!isStone && wall.material !== 'glass') {
    carvedWoodBarrier(mesh,wall,palette,(x,y)=>terrainHeightAt(level,x,y));
    appendLineShadow(shadows,(x,y)=>terrainHeightAt(level,x,y),{
      ax:wall.ax,ay:wall.ay,bx:wall.bx,by:wall.by,
      width:half*2,height:Number(wall.visualHeight||28)*.5,strength:.29
    });
    return;
  }
  const topTint = isStone ? palette.stoneLight : palette.woodTop;
  const material = isStone ? 0 : 11;
  const sideTint = isStone ? palette.stone : palette.wood;
  const aL = [wall.ax + nx * half, wall.ay + ny * half, zA];
  const aR = [wall.ax - nx * half, wall.ay - ny * half, zA];
  const bL = [wall.bx + nx * half, wall.by + ny * half, zB];
  const bR = [wall.bx - nx * half, wall.by - ny * half, zB];
  const atL = [aL[0], aL[1], zA + height], atR = [aR[0], aR[1], zA + height];
  const btL = [bL[0], bL[1], zB + height], btR = [bR[0], bR[1], zB + height];
  mesh.quad(aL, bL, btL, atL, sideTint, material);
  mesh.quad(aR, atR, btR, bR, tone(sideTint, .85), material);
  mesh.quad(atL, atR, btR, btL, topTint, material, [0, 0, 1]);
  mesh.quad(aL, atL, atR, aR, tone(sideTint, .83), material);
  mesh.quad(bL, bR, btR, btL, tone(sideTint, .83), material);

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
      tone(palette.wood, .78), 11, [0, 0, 1]);
    const pegRadius = Math.min(half * .18, 3.5);
    for (const t of [.10, .90]) {
      const center = at(t, 0, .54);
      disc(mesh, center[0], center[1], center[2], pegRadius, pegRadius, palette.stoneLight, 4, 10);
    }
  }
  appendLineShadow(shadows, (x,y)=>terrainHeightAt(level,x,y), { ax:wall.ax,ay:wall.ay,bx:wall.bx,by:wall.by,width:half*2,height:height*.50,strength:.26 });
}

function portalPoint(endpoint, lateral, z, depth) {
  const nx = -endpoint.axisY;
  const ny = endpoint.axisX;
  return [endpoint.x + nx * lateral + endpoint.axisX * depth, endpoint.y + ny * lateral + endpoint.axisY * depth, z];
}

function portal(mesh, shadows, level, endpoint, seed, palette) {
  const ground = terrainHeightAt(level, endpoint.x, endpoint.y);
  const width = Math.max(46, Number(endpoint.width || 82));
  // Align with tunnel colliders: the visible mouth is never tighter than
  // their +/-width/2 open span.
  const inner = width * .515;
  const outer = width * .69;
  const depth = Number(endpoint.depth || 76);
  const segments = 18;
  for (let index = 0; index < segments; index += 1) {
    const a = Math.PI - index / segments * Math.PI;
    const b = Math.PI - (index + 1) / segments * Math.PI;
    const outerA = portalPoint(endpoint, Math.cos(a) * outer, ground + Math.sin(a) * outer, 0);
    const outerB = portalPoint(endpoint, Math.cos(b) * outer, ground + Math.sin(b) * outer, 0);
    const innerA = portalPoint(endpoint, Math.cos(a) * inner, ground + Math.sin(a) * inner, 0);
    const innerB = portalPoint(endpoint, Math.cos(b) * inner, ground + Math.sin(b) * inner, 0);
    const blockShade = .94 + noise(seed, Math.floor(index / 3), 19) * .075;
    const limestone = tone(palette.stoneLight, blockShade);
    // The arch faces the arriving marble. Orienting its light-catching normal
    // toward the opening prevents the "flat black slab" seen from above.
    const frontNormal = [-endpoint.axisX, -endpoint.axisY, .66];
    mesh.quad(outerA, outerB, innerB, innerA, limestone, 0, frontNormal);
    const lipA = portalPoint(endpoint, Math.cos(a) * (inner + 2.8), ground + Math.sin(a) * (inner + 2.8), -.8);
    const lipB = portalPoint(endpoint, Math.cos(b) * (inner + 2.8), ground + Math.sin(b) * (inner + 2.8), -.8);
    mesh.quad(lipA, lipB, innerB, innerA, tone(palette.stoneLight, 1.08), 0, frontNormal);
    // Dark inward masonry runs back into the opening and gives it depth.
    const backA = portalPoint(endpoint, Math.cos(a) * inner, ground + Math.sin(a) * inner, depth * .82);
    const backB = portalPoint(endpoint, Math.cos(b) * inner, ground + Math.sin(b) * inner, depth * .82);
    mesh.quad(innerA, innerB, backB, backA, tone(palette.stoneDark, .62), 0);
    if (index % 3 === 0) {
      // Thin radial mortar joints, in the arch face only.
      const jointInner = portalPoint(endpoint, Math.cos(a) * (inner + 2), ground + Math.sin(a) * (inner + 2), -.25);
      const jointOuter = portalPoint(endpoint, Math.cos(a) * (outer - 1), ground + Math.sin(a) * (outer - 1), -.25);
      const jointHalf = .75;
      const inward = portalPoint(endpoint, Math.cos(a + jointHalf / outer) * (inner + 2), ground + Math.sin(a + jointHalf / outer) * (inner + 2), -.25);
      const outward = portalPoint(endpoint, Math.cos(a + jointHalf / outer) * (outer - 1), ground + Math.sin(a + jointHalf / outer) * (outer - 1), -.25);
      mesh.quad(jointInner, jointOuter, outward, inward, tone(palette.stoneDark, .82), 0);
    }
  }
  // A recessed dark threshold suggests a true passage rather than a
  // freestanding donut; the stone never caps the ball's physical path.
  mesh.quad(
    portalPoint(endpoint, -inner, ground + .36, 1),
    portalPoint(endpoint, inner, ground + .36, 1),
    portalPoint(endpoint, inner, ground + .36, depth * .80),
    portalPoint(endpoint, -inner, ground + .36, depth * .80),
    tone(palette.stoneDark, .66), 0, [0, 0, 1]
  );
  for (const sign of [-1, 1]) {
    const outerX = inner * sign;
    mesh.quad(
      portalPoint(endpoint, outerX, ground + .5, -2),
      portalPoint(endpoint, outerX + sign * Math.min(4, outer - inner), ground + .5, -2),
      portalPoint(endpoint, outerX + sign * Math.min(4, outer - inner), ground + 8, 0),
      portalPoint(endpoint, outerX, ground + 8, 0),
      palette.stoneLight, 0
    );
  }
  appendSoftShadow(shadows, (x,y)=>terrainHeightAt(level,x,y), { x:endpoint.x,y:endpoint.y,radiusX:outer*1.18,radiusY:outer*.84,height:outer*.28,strength:.25,segments:24 });
}

function hole(mesh, shadows, level, palette) {
  const x = level.hole.x, y = level.hole.y;
  const ground = terrainHeightAt(level, x, y);
  const radius = Math.max(14, level.hole.r);
  const depth = Math.max(30, level.hole.depth || 64);
  const segments = 32;
  // An OPEN cup: no cylinder top cap can accidentally paint over the cavity.
  disc(mesh, x, y, ground - depth + .4, radius * .93, radius * .93, C.cup, 9, segments);
  for (let index = 0; index < segments; index += 1) {
    const a = index / segments * TAU;
    const b = (index + 1) / segments * TAU;
    const r = radius * .94;
    const aBottom = [x + Math.cos(a) * r, y + Math.sin(a) * r, ground - depth];
    const bBottom = [x + Math.cos(b) * r, y + Math.sin(b) * r, ground - depth];
    const aTop = [aBottom[0], aBottom[1], ground - .8];
    const bTop = [bBottom[0], bBottom[1], ground - .8];
    mesh.quad(aBottom, bBottom, bTop, aTop, tone(C.cup, .84), 9);
  }
  // Small dressed limestone lip, level with the playing turf.
  ring(mesh, x, y, ground + .25, radius * .965, radius + 3, palette.stoneDark, 0, segments);
  ring(mesh, x, y, ground + .44, radius + 3, radius + 7, palette.stoneLight, 0, segments);
  ring(mesh, x, y, ground + .15, radius + 7, radius + 10, tone(palette.stone, .80), 0, segments);
  appendSoftShadow(shadows, (sx,sy)=>terrainHeightAt(level,sx,sy), { x, y, radiusX:radius*1.11, radiusY:radius*.93, height:0, strength:.24, segments:24 });
}

function details(mesh, level, seed, palette) {
  // The old mesh used 34 single flat dark vertical triangles. Real foliage
  // now consists of small bent multi-blade tufts that inherit local turf
  // pigment, follow the physical ground and keep off sand/water/props.
  appendTurfClumps(mesh, planTurfClumps(level, seed, palette));
}

export function buildCourse18Geometry(level) {
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
  // Small, irregular terrain-colored soil/moss leaves touch the roots of
  // stones and timber. No complete rings, vertical spikes, or colliders.
  for(let index=0;index<(level.course18.props||[]).length;index++){
    const prop=level.course18.props[index];
    const stump=prop.kind==='stump';
    const sourceSeed=stump?seed+index*31:seed+index*37;
    const parts=prop.kind==='rockCluster'&&prop.parts?.length?prop.parts:[null];
    for(let j=0;j<parts.length;j++){
      const part=parts[j];
      const x=prop.x+Number(part?.x||0),y=prop.y+Number(part?.y||0);
      const radius=Math.max(stump?14:8,Number(part?.r||prop.r||(stump?56:48)));
      const patchSeed=sourceSeed+(part?j*11:0);
      appendGroundFooting(opaque,planGroundFooting(
        level,x,y,radius,patchSeed,stump?'stump':'rock',palette
      ));
    }
  }
  for (let index = 0; index < (level.course18.tunnelVisuals || []).length; index += 1) {
    const tunnel = level.course18.tunnelVisuals[index];
    portal(opaque, shadows, level, tunnel.entry, seed + index * 53, palette);
    portal(opaque, shadows, level, tunnel.exit, seed + index * 53 + 19, palette);
  }
  details(opaque, level, seed, palette);
  // Miniature ornaments are beyond the physical field rim, and never appear
  // in the obstacle/collision arrays. Endless themes reuse the same nine forms.
  appendGardenIdentity(opaque, level, (x,y)=>terrainHeightAt(level,x,y));
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
    const built = buildCourse18Geometry(level);
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
