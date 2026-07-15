import {
  CHUNK_LENGTH,
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
  ribbonGeometry,
  rockGeometry,
  wingGeometry,
} from './engine.js';

const STONE = [0.51, 0.52, 0.49];
const STONE_DARK = [0.34, 0.36, 0.35];
const SNOW = [0.77, 0.78, 0.73];
const SIGNAL = [0.94, 0.31, 0.13];
const PILOT = [0.95, 0.27, 0.1];
const SUIT = [0.075, 0.095, 0.09];

function point(x, y, z) { return [x, y, z]; }

function addQuad(target, a, b, c, d, flip = false) {
  if (flip) target.push(...a, ...c, ...b, ...a, ...d, ...c);
  else target.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function canyonSection(z, seed) {
  const course = courseAt(z, seed);
  const roughLeft = (noise1d(z * 0.072 + 5, seed ^ 0x137a) - 0.5) * 4.5;
  const roughRight = (noise1d(z * 0.068 + 39, seed ^ 0x871f) - 0.5) * 4.2;
  const left = [
    point(course.center - course.width - 34, course.floor + course.leftRidge + roughLeft + 3, z),
    point(course.center - course.width - 22, course.floor + course.leftRidge * 0.91 + roughLeft, z),
    point(course.center - course.width - 12, course.floor + course.leftRidge * 0.57 - roughLeft * 0.25, z),
    point(course.center - course.width - 5, course.floor + course.leftRidge * 0.2, z),
    point(course.center - course.width, course.floor + 1.05, z),
  ];
  const right = [
    point(course.center + course.width, course.floor + 1.05, z),
    point(course.center + course.width + 5, course.floor + course.rightRidge * 0.2, z),
    point(course.center + course.width + 12, course.floor + course.rightRidge * 0.57 + roughRight * 0.2, z),
    point(course.center + course.width + 22, course.floor + course.rightRidge * 0.91 + roughRight, z),
    point(course.center + course.width + 34, course.floor + course.rightRidge + roughRight + 3, z),
  ];
  const ground = [
    left[4],
    point(course.center - course.width * 0.36, course.floor + 0.12, z),
    point(course.center + course.width * 0.36, course.floor - 0.08, z),
    right[0],
  ];
  return { course, left, right, ground };
}

function terrainForChunk(index, seed) {
  const rock = [];
  const snow = [];
  const subdivisions = 8;
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
    addQuad(snow, previous.left[0], next.left[0], next.left[1], previous.left[1]);
    addQuad(snow, previous.right[3], previous.right[4], next.right[4], next.right[3]);
    previous = next;
  }
  return { rock: flatGeometry(rock), snow: flatGeometry(snow) };
}

function colorShift(color, amount) {
  return color.map((channel) => clamp(channel + amount, 0, 1));
}

export class RidgeWorld {
  constructor(engine, seed) {
    this.engine = engine;
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.passed = new Set();
    this.grazed = new Set();
    this.foldVisual = 0;
    this.box = boxGeometry();
    this.octa = octaGeometry();
    this.wing = wingGeometry();
    this.ribbon = ribbonGeometry();
    this.rocks = Array.from({ length: 6 }, (_, index) => rockGeometry(6 + (index % 3), this.seed + index * 149 + 1));
    this.particleSeeds = [];
    const random = mulberry32(this.seed ^ 0xf3a719);
    for (let index = 0; index < 220; index += 1) {
      this.particleSeeds.push({
        x: (random() * 2 - 1) * 34,
        y: (random() * 2 - 1) * 22,
        phase: random() * 180,
        sway: random() * Math.PI * 2,
      });
    }
    this.createPilot();
  }

  createPilot() {
    this.pilotWing = this.engine.createMesh(this.wing, {
      color: PILOT,
      material: 3,
      emissive: 0.1,
      doubleSided: true,
    });
    this.pilotBody = this.engine.createMesh(this.box, {
      color: SUIT,
      material: 0,
      scale: [0.16, 0.13, 0.66],
    });
    this.pilotHead = this.engine.createMesh(this.octa, {
      color: [0.13, 0.15, 0.14],
      material: 0,
      scale: [0.17, 0.17, 0.21],
    });
  }

  reset(seed, consumed = {}) {
    for (const chunk of this.chunks.values()) this.destroyChunk(chunk);
    this.chunks.clear();
    this.seed = seed >>> 0;
    this.passed = new Set(consumed.passed || []);
    this.grazed = new Set(consumed.grazed || []);
    this.foldVisual = 0;
  }

  setConsumed(passed, grazed) {
    this.passed = new Set(passed || []);
    this.grazed = new Set(grazed || []);
    for (const chunk of this.chunks.values()) this.syncChunkState(chunk);
  }

  createGateMeshes(gate) {
    const meshes = [];
    const postScale = [0.11, gate.radius * 1.02, 0.11];
    const left = this.engine.createMesh(this.box, {
      position: [gate.x - gate.radius, gate.y, gate.z],
      rotation: [0, gate.yaw, 0],
      scale: postScale,
      color: SIGNAL,
      material: 2.8,
      emissive: 0.35,
    });
    const right = this.engine.createMesh(this.box, {
      position: [gate.x + gate.radius, gate.y, gate.z],
      rotation: [0, gate.yaw, 0],
      scale: postScale,
      color: SIGNAL,
      material: 2.8,
      emissive: 0.35,
    });
    const top = this.engine.createMesh(this.box, {
      position: [gate.x, gate.y + gate.radius, gate.z],
      rotation: [0, gate.yaw, 0],
      scale: [gate.radius, 0.11, 0.11],
      color: SIGNAL,
      material: 2.8,
      emissive: 0.35,
    });
    meshes.push(left, right, top);
    const flags = [];
    for (const side of [-1, 1]) {
      for (const offset of [-0.42, 0.18]) {
        const flag = this.engine.createMesh(this.ribbon, {
          position: [gate.x + side * gate.radius, gate.y + offset * gate.radius, gate.z],
          rotation: [0, side < 0 ? Math.PI : 0, side * 0.08],
          scale: [0.7, 0.7, 0.7],
          color: SIGNAL,
          material: 3.6,
          alpha: 0.92,
          emissive: 0.22,
          doubleSided: true,
        });
        meshes.push(flag);
        flags.push({ mesh: flag, baseY: flag.position[1], phase: gate.z * 0.17 + side + offset });
      }
    }
    return { meshes, flags };
  }

  createObstacleMeshes(obstacle, ordinal) {
    const rock = this.engine.createMesh(this.rocks[ordinal % this.rocks.length], {
      position: [obstacle.x, obstacle.baseY, obstacle.z],
      rotation: [obstacle.lean, obstacle.spin, obstacle.lean * 0.5],
      scale: [obstacle.radius, obstacle.height, obstacle.radius],
      color: colorShift(STONE_DARK, ((ordinal * 17) % 5) * 0.012),
      material: 2,
      doubleSided: true,
    });
    const meshes = [rock];
    if (obstacle.height > 12) {
      const cap = this.engine.createMesh(this.rocks[(ordinal + 2) % this.rocks.length], {
        position: [obstacle.x, obstacle.baseY + obstacle.height * 0.72, obstacle.z],
        rotation: [obstacle.lean, obstacle.spin + 0.05, obstacle.lean * 0.5],
        scale: [obstacle.radius * 0.61, obstacle.height * 0.28, obstacle.radius * 0.61],
        color: SNOW,
        material: 1,
        doubleSided: true,
      });
      meshes.push(cap);
    }
    return meshes;
  }

  createChunk(index) {
    const geometry = terrainForChunk(index, this.seed);
    const shade = (noise1d(index * 0.71, this.seed) - 0.5) * 0.075;
    const terrain = this.engine.createMesh(geometry.rock, {
      color: colorShift(STONE, shade),
      material: 1,
      doubleSided: true,
    });
    const snow = this.engine.createMesh(geometry.snow, {
      color: colorShift(SNOW, shade * 0.28),
      material: 1,
      doubleSided: true,
    });
    const plan = createChunkPlan(index, this.seed);
    const gateEntities = plan.gates.map((gate) => ({ gate, ...this.createGateMeshes(gate) }));
    const obstacleEntities = plan.obstacles.map((obstacle, obstacleIndex) => ({
      obstacle,
      meshes: this.createObstacleMeshes(obstacle, Math.abs(index * 3 + obstacleIndex)),
    }));
    const wispEntities = plan.wisps.map((wisp, wispIndex) => ({
      wisp,
      mesh: this.engine.createMesh(this.ribbon, {
        position: [wisp.x, wisp.y, wisp.z],
        rotation: [0, wisp.drift, 0],
        scale: [0.58 + wispIndex * 0.08, 0.58 + wispIndex * 0.08, 0.58],
        color: [0.85, 0.84, 0.76],
        material: 3.7,
        alpha: 0.24,
        doubleSided: true,
      }),
    }));
    const chunk = {
      index,
      plan,
      meshes: [terrain, snow],
      gateEntities,
      obstacleEntities,
      wispEntities,
    };
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
        mesh.alpha = consumed ? 0.18 : (mesh.material > 3 ? 0.92 : 1);
        mesh.emissive = consumed ? 0 : 0.35;
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
    const last = Math.floor((z + 235) / CHUNK_LENGTH);
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
      for (const gate of chunk.plan.gates) {
        if (Math.abs(gate.z - z) <= range) gates.push(gate);
      }
      for (const obstacle of chunk.plan.obstacles) {
        if (Math.abs(obstacle.z - z) <= range) obstacles.push(obstacle);
      }
    }
    return { gates, obstacles };
  }

  updatePilot(state, folded, flowing, delta) {
    this.foldVisual = damp(this.foldVisual, folded ? 1 : 0, 9, delta);
    const yaw = -state.vx * 0.017;
    const rotation = [-state.pitch, yaw, state.bank];
    const wingY = state.y + Math.sin(state.z * 0.025) * 0.03;
    this.pilotWing.position = [state.x, wingY, state.z];
    this.pilotWing.rotation = [...rotation];
    this.pilotWing.scale = [lerp(1, 0.56, this.foldVisual), 1, 1];
    this.pilotWing.emissive = flowing ? 0.42 : 0.1;

    this.pilotBody.position = [state.x, wingY + 0.02, state.z - 0.04];
    this.pilotBody.rotation = [...rotation];
    this.pilotBody.scale = [0.16, 0.13, 0.66];
    this.pilotHead.position = [state.x, wingY + 0.08, state.z + 0.72];
    this.pilotHead.rotation = [...rotation];
  }

  updateAmbient(state, time, effects, flowing) {
    if (!effects) {
      this.engine.particles.visible = false;
      return;
    }
    this.engine.particles.visible = true;
    const amount = flowing ? 220 : 150;
    const points = [];
    for (let index = 0; index < amount; index += 1) {
      const source = this.particleSeeds[index];
      const travel = time * (state.speed * (flowing ? 1.45 : 0.62));
      const forward = ((source.phase - travel) % 180 + 180) % 180 - 28;
      points.push([
        state.x + source.x + Math.sin(time * 0.7 + source.sway) * 1.2,
        state.y + source.y + Math.cos(time * 0.45 + source.sway) * 0.6,
        state.z + forward,
      ]);
    }
    this.engine.particles.size = flowing ? 4.3 : 3.1;
    this.engine.particles.alpha = flowing ? 0.74 : 0.38;
    this.engine.particles.color = flowing ? [0.98, 0.48, 0.2] : [0.9, 0.88, 0.78];
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
        entity.mesh.position[1] = entity.wisp.y + Math.sin(time * 0.9 + entity.wisp.drift) * 0.55;
        entity.mesh.rotation[1] = entity.wisp.drift + time * 0.15;
      }
    }
  }

  update(state, options) {
    const { delta, time, folded, flowing, effects } = options;
    this.updateChunks(state.z);
    this.updatePilot(state, folded, flowing, delta);
    this.updateAmbient(state, time, effects, flowing);
    this.updateDecoration(time);
  }
}
