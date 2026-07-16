import {
  CHUNK_LENGTH,
  biomeAt,
  clamp,
  courseAt,
  createChunkPlan,
  damp,
  lerp,
  mulberry32,
  noise1d,
} from './game-core.js';
import {
  boxGeometry,
  flatGeometry,
  octaGeometry,
  paperKeelGeometry,
  paperWingGeometry,
  ribbonGeometry,
  rockGeometry,
  roughPrismGeometry,
} from './engine.js';

const SIGNAL = [0.94, 0.31, 0.13];
const PAPER = [0.91, 0.9, 0.82];
const PAPER_SHADE = [0.73, 0.72, 0.66];
const PAPER_INK = [0.82, 0.23, 0.105];

const BIOMES = Object.freeze({
  alpine: {
    label: 'АЛЬПИЙСКИЙ ХРЕБЕТ',
    rock: [0.51, 0.53, 0.5],
    dark: [0.31, 0.34, 0.33],
    cap: [0.82, 0.83, 0.78],
    river: [0.22, 0.42, 0.45],
    decor: [0.19, 0.29, 0.25],
    decorDark: [0.22, 0.18, 0.12],
    fog: [0.71, 0.75, 0.72],
    skyTop: [0.64, 0.72, 0.72],
    skyHorizon: [0.85, 0.84, 0.78],
    sun: [0.96, 0.88, 0.68],
    capCoverage: 0.26,
  },
  ochre: {
    label: 'ЯНТАРНЫЙ КАНЬОН',
    rock: [0.57, 0.34, 0.22],
    dark: [0.34, 0.2, 0.15],
    cap: [0.72, 0.5, 0.31],
    river: [0.19, 0.37, 0.4],
    decor: [0.47, 0.25, 0.15],
    decorDark: [0.23, 0.15, 0.12],
    fog: [0.71, 0.55, 0.43],
    skyTop: [0.48, 0.57, 0.59],
    skyHorizon: [0.91, 0.64, 0.43],
    sun: [1, 0.75, 0.42],
    capCoverage: 0,
  },
  glacier: {
    label: 'ЛЕДНИКОВЫЙ РАЗЛОМ',
    rock: [0.47, 0.56, 0.58],
    dark: [0.26, 0.36, 0.4],
    cap: [0.86, 0.91, 0.9],
    river: [0.28, 0.7, 0.78],
    decor: [0.43, 0.78, 0.84],
    decorDark: [0.22, 0.44, 0.5],
    fog: [0.69, 0.79, 0.81],
    skyTop: [0.48, 0.63, 0.7],
    skyHorizon: [0.82, 0.9, 0.9],
    sun: [0.88, 0.96, 1],
    capCoverage: 0.88,
  },
  basalt: {
    label: 'БАЗАЛЬТОВАЯ ТЕСНИНА',
    rock: [0.25, 0.28, 0.29],
    dark: [0.12, 0.15, 0.16],
    cap: [0.48, 0.48, 0.43],
    river: [0.42, 0.18, 0.11],
    decor: [0.16, 0.18, 0.19],
    decorDark: [0.08, 0.1, 0.11],
    fog: [0.38, 0.42, 0.43],
    skyTop: [0.26, 0.32, 0.35],
    skyHorizon: [0.57, 0.47, 0.4],
    sun: [0.92, 0.45, 0.24],
    capCoverage: 0.08,
  },
});

function point(x, y, z) { return [x, y, z]; }

function addQuad(target, a, b, c, d, flip = false) {
  if (flip) target.push(...a, ...c, ...b, ...a, ...d, ...c);
  else target.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function mixColor(left, right, amount) {
  return left.map((channel, index) => lerp(channel, right[index], amount));
}

function colorShift(color, amount) {
  return color.map((channel) => clamp(channel + amount, 0, 1));
}

function visualProfile(z, seed) {
  const biome = biomeAt(z, seed);
  const from = BIOMES[biome.id];
  const to = BIOMES[biome.nextId];
  const blend = biome.blend;
  return {
    ...biome,
    label: blend > 0.55 ? to.label : from.label,
    rock: mixColor(from.rock, to.rock, blend),
    dark: mixColor(from.dark, to.dark, blend),
    cap: mixColor(from.cap, to.cap, blend),
    river: mixColor(from.river, to.river, blend),
    decor: mixColor(from.decor, to.decor, blend),
    decorDark: mixColor(from.decorDark, to.decorDark, blend),
    fog: mixColor(from.fog, to.fog, blend),
    skyTop: mixColor(from.skyTop, to.skyTop, blend),
    skyHorizon: mixColor(from.skyHorizon, to.skyHorizon, blend),
    sun: mixColor(from.sun, to.sun, blend),
    capCoverage: lerp(from.capCoverage, to.capCoverage, blend),
  };
}

function canyonSection(z, seed) {
  const course = courseAt(z, seed);
  const roughness = course.biome.id === 'basalt' ? 1.42 : course.biome.id === 'glacier' ? 0.7 : 1;
  const roughLeft = (noise1d(z * 0.072 + 5, seed ^ 0x137a) - 0.5) * 4.5 * roughness;
  const roughRight = (noise1d(z * 0.068 + 39, seed ^ 0x871f) - 0.5) * 4.2 * roughness;
  const left = [
    point(course.center - course.width - 38, course.floor + course.leftRidge + roughLeft + 4, z),
    point(course.center - course.width - 25, course.floor + course.leftRidge * 0.94 + roughLeft, z),
    point(course.center - course.width - 15, course.floor + course.leftRidge * 0.63 - roughLeft * 0.18, z),
    point(course.center - course.width - 8, course.floor + course.leftRidge * 0.34 + roughLeft * 0.12, z),
    point(course.center - course.width - 3.8, course.floor + course.leftRidge * 0.13, z),
    point(course.center - course.width, course.floor + 1.05, z),
  ];
  const right = [
    point(course.center + course.width, course.floor + 1.05, z),
    point(course.center + course.width + 3.8, course.floor + course.rightRidge * 0.13, z),
    point(course.center + course.width + 8, course.floor + course.rightRidge * 0.34 - roughRight * 0.1, z),
    point(course.center + course.width + 15, course.floor + course.rightRidge * 0.63 + roughRight * 0.18, z),
    point(course.center + course.width + 25, course.floor + course.rightRidge * 0.94 + roughRight, z),
    point(course.center + course.width + 38, course.floor + course.rightRidge + roughRight + 4, z),
  ];
  const ground = [
    left[5],
    point(course.center - course.width * 0.44, course.floor + 0.17, z),
    point(course.center - course.width * 0.12, course.floor - 0.08, z),
    point(course.center + course.width * 0.22, course.floor - 0.12, z),
    point(course.center + course.width * 0.48, course.floor + 0.12, z),
    right[0],
  ];
  return { course, left, right, ground };
}

function terrainForChunk(index, seed) {
  const rock = [];
  const cap = [];
  const river = [];
  const profile = visualProfile(index * CHUNK_LENGTH + CHUNK_LENGTH * 0.5, seed);
  const subdivisions = 9;
  let previous = canyonSection(index * CHUNK_LENGTH, seed);
  for (let step = 1; step <= subdivisions; step += 1) {
    const z = index * CHUNK_LENGTH + step / subdivisions * CHUNK_LENGTH;
    const next = canyonSection(z, seed);
    for (let cross = 0; cross < previous.left.length - 1; cross += 1) {
      addQuad(rock, previous.left[cross], next.left[cross], next.left[cross + 1], previous.left[cross + 1]);
      addQuad(rock, previous.right[cross], previous.right[cross + 1], next.right[cross + 1], next.right[cross]);
    }
    for (let cross = 0; cross < previous.ground.length - 1; cross += 1) {
      addQuad(rock, previous.ground[cross], previous.ground[cross + 1], next.ground[cross + 1], next.ground[cross]);
    }

    const capBands = profile.capCoverage > 0.64 ? 3 : profile.capCoverage > 0.14 ? 1 : 0;
    for (let band = 0; band < capBands; band += 1) {
      addQuad(cap, previous.left[band], next.left[band], next.left[band + 1], previous.left[band + 1]);
      const rightIndex = previous.right.length - 2 - band;
      addQuad(cap, previous.right[rightIndex], previous.right[rightIndex + 1], next.right[rightIndex + 1], next.right[rightIndex]);
    }

    const previousRiverHalf = previous.course.biome.id === 'ochre' ? 0.34 : previous.course.biome.id === 'glacier' ? 1.18 : 0.68;
    const nextRiverHalf = next.course.biome.id === 'ochre' ? 0.34 : next.course.biome.id === 'glacier' ? 1.18 : 0.68;
    addQuad(river,
      point(previous.course.center - previousRiverHalf, previous.course.floor + 0.19, previous.ground[0][2]),
      point(previous.course.center + previousRiverHalf, previous.course.floor + 0.19, previous.ground[0][2]),
      point(next.course.center + nextRiverHalf, next.course.floor + 0.19, z),
      point(next.course.center - nextRiverHalf, next.course.floor + 0.19, z)
    );
    previous = next;
  }
  return {
    rock: flatGeometry(rock),
    cap: cap.length ? flatGeometry(cap) : null,
    river: flatGeometry(river),
    profile,
  };
}

function appendPyramid(target, x, y, z, radius, height, sides = 5, rotation = 0) {
  const base = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + index / sides * Math.PI * 2;
    base.push([x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius]);
  }
  const top = [x, y + height, z];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    target.push(...base[index], ...base[next], ...top);
  }
}

function appendBox(target, x, y, z, sx, sy, sz) {
  const a = [x - sx, y, z - sz]; const b = [x + sx, y, z - sz];
  const c = [x + sx, y + sy, z - sz]; const d = [x - sx, y + sy, z - sz];
  const e = [x - sx, y, z + sz]; const f = [x + sx, y, z + sz];
  const g = [x + sx, y + sy, z + sz]; const h = [x - sx, y + sy, z + sz];
  addQuad(target, e, f, g, h); addQuad(target, b, a, d, c);
  addQuad(target, a, e, h, d); addQuad(target, f, b, c, g);
  addQuad(target, d, h, g, c); addQuad(target, a, b, f, e);
}

function decorationForChunk(index, seed, biomeId) {
  const primary = [];
  const secondary = [];
  const random = mulberry32((seed ^ Math.imul(index + 701, 0x9e3779b1)) >>> 0);
  const count = biomeId === 'alpine' ? 10 : biomeId === 'glacier' ? 7 : 6;
  for (let item = 0; item < count; item += 1) {
    const z = index * CHUNK_LENGTH + 3 + random() * (CHUNK_LENGTH - 6);
    const course = courseAt(z, seed);
    const side = random() < 0.5 ? -1 : 1;
    const outside = 3.4 + random() * 11;
    const ridge = side < 0 ? course.leftRidge : course.rightRidge;
    const x = course.center + side * (course.width + outside);
    const y = course.floor + 1.05 + outside * 0.48 + ridge * Math.min(0.18, outside * 0.009);
    if (biomeId === 'alpine') {
      const height = 1.8 + random() * 3.8;
      appendBox(secondary, x, y, z, 0.09, height * 0.34, 0.09);
      appendPyramid(primary, x, y + height * 0.16, z, height * 0.25, height, 6, random() * Math.PI);
    } else if (biomeId === 'ochre') {
      const height = 2.4 + random() * 6.5;
      appendPyramid(primary, x, y, z, 0.55 + random() * 0.5, height, 7, random() * Math.PI);
      if (random() > 0.48) appendPyramid(secondary, x + side * 0.4, y + height * 0.5, z, 0.42, height * 0.28, 6);
    } else if (biomeId === 'glacier') {
      const height = 1.6 + random() * 4.2;
      appendPyramid(primary, x, y, z, 0.32 + random() * 0.45, height, 4, Math.PI * 0.25);
      if (random() > 0.55) appendPyramid(secondary, x - side * 0.6, y, z + 0.4, 0.25, height * 0.62, 4);
    } else {
      const height = 2.2 + random() * 5.8;
      appendBox(primary, x, y, z, 0.28 + random() * 0.42, height, 0.28 + random() * 0.42);
      if (random() > 0.56) appendBox(secondary, x + side * 0.7, y, z + 0.5, 0.2, height * 0.7, 0.2);
    }
  }
  return {
    primary: primary.length ? flatGeometry(primary) : null,
    secondary: secondary.length ? flatGeometry(secondary) : null,
  };
}

function rotateOffset(offset, rotation) {
  const [x, y, z] = offset;
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  const m00 = cy * cz;
  const m01 = sx * sy * cz - cx * sz;
  const m02 = cx * sy * cz + sx * sz;
  const m10 = cy * sz;
  const m11 = sx * sy * sz + cx * cz;
  const m12 = cx * sy * sz - sx * cz;
  const m20 = -sy;
  const m21 = sx * cy;
  const m22 = cx * cy;
  return [m00 * x + m10 * y + m20 * z, m01 * x + m11 * y + m21 * z, m02 * x + m12 * y + m22 * z];
}

export class RidgeWorld {
  constructor(engine, seed) {
    this.engine = engine;
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.passed = new Set();
    this.grazed = new Set();
    this.foldVisual = 0;
    this.impactPulse = 0;
    this.impactZone = 'fold';
    this.box = boxGeometry();
    this.octa = octaGeometry();
    this.leftPaperWing = paperWingGeometry(1);
    this.rightPaperWing = paperWingGeometry(-1);
    this.paperKeel = paperKeelGeometry();
    this.ribbon = ribbonGeometry();
    this.rocks = Array.from({ length: 8 }, (_, index) => rockGeometry(6 + (index % 3), this.seed + index * 149 + 1));
    this.slabs = Array.from({ length: 6 }, (_, index) => roughPrismGeometry(this.seed + index * 211 + 17));
    this.particleSeeds = [];
    const random = mulberry32(this.seed ^ 0xf3a719);
    for (let index = 0; index < 240; index += 1) {
      this.particleSeeds.push({
        x: (random() * 2 - 1) * 38,
        y: (random() * 2 - 1) * 24,
        phase: random() * 190,
        sway: random() * Math.PI * 2,
      });
    }
    this.createAircraft();
  }

  createAircraft() {
    this.paperLeft = this.engine.createMesh(this.leftPaperWing, { color: PAPER, material: 3.75, emissive: 0.04, doubleSided: true });
    this.paperRight = this.engine.createMesh(this.rightPaperWing, { color: PAPER, material: 3.75, emissive: 0.04, doubleSided: true });
    this.paperKeelMesh = this.engine.createMesh(this.paperKeel, { color: PAPER_SHADE, material: 3.72, doubleSided: true });
    this.paperFold = this.engine.createMesh(this.box, { color: PAPER_INK, material: 3.2, emissive: 0.06, scale: [0.035, 0.035, 1.18] });
    this.paperNose = this.engine.createMesh(this.octa, { color: PAPER, material: 3.7, scale: [0.095, 0.075, 0.18], doubleSided: true });
    this.leftMark = this.engine.createMesh(this.box, { color: PAPER_INK, material: 3.2, emissive: 0.04, scale: [0.26, 0.018, 0.035] });
    this.rightMark = this.engine.createMesh(this.box, { color: PAPER_INK, material: 3.2, emissive: 0.04, scale: [0.26, 0.018, 0.035] });
  }

  reset(seed, consumed = {}) {
    for (const chunk of this.chunks.values()) this.destroyChunk(chunk);
    this.chunks.clear();
    this.seed = seed >>> 0;
    this.passed = new Set(consumed.passed || []);
    this.grazed = new Set(consumed.grazed || []);
    this.foldVisual = 0;
    this.impactPulse = 0;
  }

  setConsumed(passed, grazed) {
    this.passed = new Set(passed || []);
    this.grazed = new Set(grazed || []);
    for (const chunk of this.chunks.values()) this.syncChunkState(chunk);
  }

  getVisualProfile(z) {
    return visualProfile(z, this.seed);
  }

  markImpact(zone = 'fold') {
    this.impactPulse = 1;
    this.impactZone = zone;
  }

  createGateMeshes(gate) {
    const meshes = [];
    const postScale = [0.105, gate.radius * 1.02, 0.105];
    const left = this.engine.createMesh(this.box, { position: [gate.x - gate.radius, gate.y, gate.z], rotation: [0, gate.yaw, 0], scale: postScale, color: SIGNAL, material: 2.8, emissive: 0.4 });
    const right = this.engine.createMesh(this.box, { position: [gate.x + gate.radius, gate.y, gate.z], rotation: [0, gate.yaw, 0], scale: postScale, color: SIGNAL, material: 2.8, emissive: 0.4 });
    const top = this.engine.createMesh(this.box, { position: [gate.x, gate.y + gate.radius, gate.z], rotation: [0, gate.yaw, 0], scale: [gate.radius, 0.105, 0.105], color: SIGNAL, material: 2.8, emissive: 0.4 });
    meshes.push(left, right, top);
    const flags = [];
    for (const side of [-1, 1]) {
      for (const offset of [-0.42, 0.18]) {
        const flag = this.engine.createMesh(this.ribbon, {
          position: [gate.x + side * gate.radius, gate.y + offset * gate.radius, gate.z],
          rotation: [0, side < 0 ? Math.PI : 0, side * 0.08],
          scale: [0.7, 0.7, 0.7], color: SIGNAL, material: 3.6, alpha: 0.92, emissive: 0.22, doubleSided: true,
        });
        meshes.push(flag);
        flags.push({ mesh: flag, baseY: flag.position[1], phase: gate.z * 0.17 + side + offset });
      }
    }
    return { meshes, flags };
  }

  createObstacleMeshes(obstacle, ordinal) {
    const profile = visualProfile(obstacle.z, this.seed);
    if (obstacle.kind === 'boulder') {
      return [this.engine.createMesh(this.rocks[ordinal % this.rocks.length], {
        position: [obstacle.x, obstacle.y - obstacle.radius, obstacle.z],
        rotation: [obstacle.spin * 0.13, obstacle.spin, obstacle.spin * 0.07],
        scale: [obstacle.radius, obstacle.radius * 2, obstacle.radius],
        color: colorShift(profile.dark, 0.035),
        material: 2,
        doubleSided: true,
      })];
    }

    if (['beam', 'pillar', 'shelf', 'cable'].includes(obstacle.kind)) {
      const cable = obstacle.kind === 'cable';
      const mesh = this.engine.createMesh(cable ? this.box : this.slabs[ordinal % this.slabs.length], {
        position: [obstacle.x, obstacle.y, obstacle.z],
        scale: [obstacle.halfX, obstacle.halfY, obstacle.halfZ],
        color: cable ? [0.16, 0.16, 0.14] : colorShift(profile.dark, obstacle.kind === 'shelf' ? 0.015 : -0.018),
        material: cable ? 3.1 : 2,
        emissive: cable ? 0.04 : 0,
      });
      const meshes = [mesh];
      if (cable) {
        for (const side of [-0.68, 0, 0.68]) {
          meshes.push(this.engine.createMesh(this.octa, {
            position: [obstacle.x + obstacle.halfX * side, obstacle.y, obstacle.z - obstacle.halfZ * 1.4],
            scale: [0.12, 0.12, 0.12],
            color: SIGNAL,
            material: 3.1,
            emissive: 0.7,
          }));
        }
      }
      return meshes;
    }

    const rock = this.engine.createMesh(this.rocks[ordinal % this.rocks.length], {
      position: [obstacle.x, obstacle.baseY, obstacle.z],
      rotation: [obstacle.lean, obstacle.spin, obstacle.lean * 0.5],
      scale: [obstacle.radius, obstacle.height, obstacle.radius],
      color: colorShift(profile.dark, ((ordinal * 17) % 5) * 0.012),
      material: 2,
      doubleSided: true,
    });
    const meshes = [rock];
    if (obstacle.height > 12 && profile.capCoverage > 0.12) {
      const cap = this.engine.createMesh(this.rocks[(ordinal + 2) % this.rocks.length], {
        position: [obstacle.x, obstacle.baseY + obstacle.height * 0.72, obstacle.z],
        rotation: [obstacle.lean, obstacle.spin + 0.05, obstacle.lean * 0.5],
        scale: [obstacle.radius * 0.61, obstacle.height * 0.28, obstacle.radius * 0.61],
        color: profile.cap,
        material: 1,
        doubleSided: true,
      });
      meshes.push(cap);
    }
    return meshes;
  }

  createChunk(index) {
    const geometry = terrainForChunk(index, this.seed);
    const profile = geometry.profile;
    const shade = (noise1d(index * 0.71, this.seed) - 0.5) * 0.075;
    const terrain = this.engine.createMesh(geometry.rock, { color: colorShift(profile.rock, shade), material: 1, doubleSided: true });
    const river = this.engine.createMesh(geometry.river, { color: profile.river, material: 3.1, alpha: profile.id === 'ochre' ? 0.48 : 0.78, emissive: profile.id === 'glacier' ? 0.28 : 0.06, doubleSided: true });
    const chunkMeshes = [terrain, river];
    if (geometry.cap) chunkMeshes.push(this.engine.createMesh(geometry.cap, { color: colorShift(profile.cap, shade * 0.28), material: 1, doubleSided: true }));

    const decoration = decorationForChunk(index, this.seed, profile.id);
    if (decoration.primary) chunkMeshes.push(this.engine.createMesh(decoration.primary, { color: profile.decor, material: 2, doubleSided: true }));
    if (decoration.secondary) chunkMeshes.push(this.engine.createMesh(decoration.secondary, { color: profile.decorDark, material: 2, doubleSided: true }));

    const plan = createChunkPlan(index, this.seed);
    const gateEntities = plan.gates.map((gate) => ({ gate, ...this.createGateMeshes(gate) }));
    const obstacleEntities = plan.obstacles.map((obstacle, obstacleIndex) => ({ obstacle, meshes: this.createObstacleMeshes(obstacle, Math.abs(index * 3 + obstacleIndex)) }));
    const wispEntities = plan.wisps.slice(0, 2).map((wisp, wispIndex) => ({
      wisp,
      mesh: this.engine.createMesh(this.octa, {
        position: [wisp.x, wisp.y + 10, wisp.z],
        rotation: [0, wisp.drift, 0],
        scale: [2.6 + wispIndex * 1.3, 0.38 + wispIndex * 0.1, 1.4 + wispIndex * 0.5],
        color: profile.fog,
        material: 0,
        alpha: 0.13,
        doubleSided: true,
      }),
    }));
    const chunk = { index, plan, meshes: chunkMeshes, gateEntities, obstacleEntities, wispEntities };
    this.chunks.set(index, chunk);
    this.syncChunkState(chunk);
    return chunk;
  }

  destroyChunk(chunk) {
    for (const mesh of chunk.meshes) this.engine.remove(mesh);
    for (const entity of chunk.gateEntities) for (const mesh of entity.meshes) this.engine.remove(mesh);
    for (const entity of chunk.obstacleEntities) for (const mesh of entity.meshes) this.engine.remove(mesh);
    for (const entity of chunk.wispEntities) this.engine.remove(entity.mesh);
  }

  syncChunkState(chunk) {
    for (const entity of chunk.gateEntities) {
      const consumed = this.passed.has(entity.gate.id);
      for (const mesh of entity.meshes) {
        mesh.alpha = consumed ? 0.16 : (mesh.material > 3 ? 0.92 : 1);
        mesh.emissive = consumed ? 0 : 0.4;
        mesh.color = consumed ? [0.4, 0.42, 0.4] : [...SIGNAL];
      }
    }
  }

  markGate(id) {
    this.passed.add(id);
    for (const chunk of this.chunks.values()) this.syncChunkState(chunk);
  }

  markGrazed(id) {
    this.grazed.add(id);
  }

  updateChunks(z) {
    const first = Math.floor((z - 72) / CHUNK_LENGTH);
    const last = Math.floor((z + 225) / CHUNK_LENGTH);
    for (let index = first; index <= last; index += 1) {
      if (!this.chunks.has(index)) this.createChunk(index);
    }
    for (const [index, chunk] of this.chunks) {
      if (index < first - 1 || index > last + 1) {
        this.destroyChunk(chunk);
        this.chunks.delete(index);
      }
    }
  }

  nearby(z, range = 62) {
    const gates = [];
    const obstacles = [];
    for (const chunk of this.chunks.values()) {
      for (const gate of chunk.plan.gates) if (Math.abs(gate.z - z) <= range) gates.push(gate);
      for (const obstacle of chunk.plan.obstacles) if (Math.abs(obstacle.z - z) <= range) obstacles.push(obstacle);
    }
    return { gates, obstacles };
  }

  segmentAt(z) {
    const index = Math.floor(z / CHUNK_LENGTH);
    return this.chunks.get(index)?.plan || createChunkPlan(index, this.seed);
  }

  placeAircraftPart(mesh, state, rotation, offset, extraRotation = null) {
    const transformed = rotateOffset(offset, rotation);
    mesh.position = [state.x + transformed[0], state.y + transformed[1], state.z + transformed[2]];
    mesh.rotation = extraRotation || [...rotation];
  }

  updateAircraft(state, folded, flowing, delta, time, damage = null) {
    this.foldVisual = damp(this.foldVisual, folded ? 1 : 0, folded ? 8.5 : 5.8, delta);
    this.impactPulse = damp(this.impactPulse, 0, 5.4, delta);
    const yaw = -state.vx * 0.015;
    const rotation = [-state.pitch, yaw, state.bank];
    const stallFlutter = (state.stall || 0) * Math.sin(time * 18 + state.z * 0.09);
    const bob = Math.sin(state.z * 0.032) * 0.018 + stallFlutter * 0.035;
    const aircraftState = { ...state, y: state.y + bob };
    const leftHealth = clamp((damage?.leftWing ?? 100) / 100, 0, 1);
    const rightHealth = clamp((damage?.rightWing ?? 100) / 100, 0, 1);
    const noseHealth = clamp((damage?.nose ?? 100) / 100, 0, 1);
    const foldHealth = clamp((damage?.fold ?? 100) / 100, 0, 1);
    const leftLoss = 1 - leftHealth;
    const rightLoss = 1 - rightHealth;
    const foldAngle = this.foldVisual * 0.62;
    const flutter = stallFlutter * 0.08 + Math.sin(time * (9 + state.speed * 0.18)) * (leftLoss + rightLoss) * 0.025;
    const leftRotation = [rotation[0] + leftLoss * 0.04, rotation[1], rotation[2] - foldAngle - leftLoss * 0.16 + flutter];
    const rightRotation = [rotation[0] + rightLoss * 0.04, rotation[1], rotation[2] + foldAngle + rightLoss * 0.16 - flutter];

    this.placeAircraftPart(this.paperLeft, aircraftState, rotation, [0, 0, 0], leftRotation);
    this.placeAircraftPart(this.paperRight, aircraftState, rotation, [0, 0, 0], rightRotation);
    this.placeAircraftPart(this.paperKeelMesh, aircraftState, rotation, [0, -0.015, 0]);
    this.placeAircraftPart(this.paperFold, aircraftState, rotation, [0, 0.035, -0.02]);
    this.placeAircraftPart(this.paperNose, aircraftState, rotation, [0, -0.005 - (1 - noseHealth) * 0.05, 1.45]);
    this.placeAircraftPart(this.leftMark, aircraftState, rotation, [0.57, 0.045, -0.08], leftRotation);
    this.placeAircraftPart(this.rightMark, aircraftState, rotation, [-0.57, 0.045, -0.08], rightRotation);

    this.paperLeft.scale = [0.78 + leftHealth * 0.22, 1, 0.94 + leftHealth * 0.06];
    this.paperRight.scale = [0.78 + rightHealth * 0.22, 1, 0.94 + rightHealth * 0.06];
    this.paperNose.scale = [0.095 + noseHealth * 0.005, 0.055 + noseHealth * 0.02, 0.12 + noseHealth * 0.06];
    this.paperKeelMesh.scale = [1, 0.66 + foldHealth * 0.34, 1];
    this.leftMark.alpha = 0.35 + leftHealth * 0.65;
    this.rightMark.alpha = 0.35 + rightHealth * 0.65;
    const impactGlow = this.impactPulse * 0.48;
    this.paperLeft.color = this.impactZone === 'leftWing' ? mixColor(PAPER, PAPER_INK, impactGlow) : colorShift(PAPER, -leftLoss * 0.14);
    this.paperRight.color = this.impactZone === 'rightWing' ? mixColor(PAPER, PAPER_INK, impactGlow) : colorShift(PAPER, -rightLoss * 0.14);
    this.paperNose.color = this.impactZone === 'nose' ? mixColor(PAPER, PAPER_INK, impactGlow) : colorShift(PAPER, -(1 - noseHealth) * 0.16);
    this.paperKeelMesh.color = this.impactZone === 'fold' ? mixColor(PAPER_SHADE, PAPER_INK, impactGlow) : colorShift(PAPER_SHADE, -(1 - foldHealth) * 0.12);
    const emissive = flowing ? 0.3 : 0.035 + this.impactPulse * 0.35;
    this.paperLeft.emissive = emissive;
    this.paperRight.emissive = emissive;
    this.paperFold.emissive = 0.06 + this.impactPulse * 0.52;
  }

  updateAmbient(state, time, effects, flowing, folded) {
    if (!effects) {
      this.engine.particles.visible = false;
      return;
    }
    this.engine.particles.visible = true;
    const amount = flowing ? 235 : folded ? 190 : 145;
    const points = [];
    for (let index = 0; index < amount; index += 1) {
      const source = this.particleSeeds[index];
      const travel = time * (state.speed * (flowing ? 1.45 : folded ? 0.92 : 0.58));
      const forward = ((source.phase - travel) % 190 + 190) % 190 - 28;
      points.push([
        state.x + source.x + Math.sin(time * 0.7 + source.sway) * 1.2,
        state.y + source.y + Math.cos(time * 0.45 + source.sway) * 0.6,
        state.z + forward,
      ]);
    }
    const profile = visualProfile(state.z, this.seed);
    this.engine.particles.size = flowing ? 4.5 : folded ? 3.7 : 3;
    this.engine.particles.alpha = flowing ? 0.76 : folded ? 0.5 : 0.34;
    this.engine.particles.color = flowing ? [1, 0.45, 0.16] : mixColor([0.9, 0.88, 0.78], profile.cap, 0.34);
    this.engine.particles.update(points);
  }

  updateDecoration(time) {
    for (const chunk of this.chunks.values()) {
      for (const gate of chunk.gateEntities) {
        for (const flag of gate.flags) {
          flag.mesh.position[1] = flag.baseY + Math.sin(time * 4.4 + flag.phase) * 0.12;
          flag.mesh.rotation[2] = Math.sin(time * 3.7 + flag.phase) * 0.12;
        }
      }
      for (const entity of chunk.wispEntities) {
        entity.mesh.position[0] = entity.wisp.x + Math.sin(time * 0.08 + entity.wisp.drift) * 2.4;
        entity.mesh.position[1] = entity.wisp.y + 10 + Math.sin(time * 0.22 + entity.wisp.drift) * 0.7;
        entity.mesh.rotation[1] = entity.wisp.drift + time * 0.035;
      }
    }
  }

  update(state, options) {
    const { delta, time, folded = options.boosted, flowing, effects, damage = null } = options;
    this.updateChunks(state.z);
    this.updateAircraft(state, Boolean(folded), flowing, delta, time, damage);
    this.updateAmbient(state, time, effects, flowing, Boolean(folded));
    this.updateDecoration(time);
  }
}
