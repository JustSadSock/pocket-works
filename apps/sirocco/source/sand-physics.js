import { clamp } from './core.js';

const DEFAULT_CELL = 0.12;

export class SandPhysics {
  constructor(world, options = {}) {
    this.world = world;
    this.cellSize = options.cellSize ?? DEFAULT_CELL;
    this.maxCells = options.maxCells ?? 6200;
    this.keepRadius = options.keepRadius ?? 58;
    this.cells = new Map();
    this.dirty = null;
    this.pruneClock = 0;
    this.totalImpacts = 0;
  }

  setQuality(preset) {
    if (!preset) return;
    if (preset.id === 'high') { this.maxCells = 6200; this.keepRadius = 58; }
    else if (preset.id === 'medium') { this.maxCells = 4400; this.keepRadius = 46; }
    else { this.maxCells = 2800; this.keepRadius = 34; }
  }

  key(ix, iz) { return `${ix},${iz}`; }
  getCell(ix, iz) { return this.cells.get(this.key(ix, iz))?.h ?? 0; }

  setCell(ix, iz, h) {
    const key = this.key(ix, iz);
    const value = clamp(h, -0.105, 0.070);
    if (Math.abs(value) < 0.00028) { this.cells.delete(key); return; }
    this.cells.set(key, { ix, iz, h: value, touched: performance.now() });
    const x = ix * this.cellSize, z = iz * this.cellSize;
    this.markDirty(x - this.cellSize, z - this.cellSize, x + this.cellSize, z + this.cellSize);
  }

  addCell(ix, iz, delta) { this.setCell(ix, iz, this.getCell(ix, iz) + delta); }

  sampleOffset(x, z) {
    const fx = x / this.cellSize, fz = z / this.cellSize;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = this.getCell(ix, iz), b = this.getCell(ix + 1, iz);
    const c = this.getCell(ix, iz + 1), d = this.getCell(ix + 1, iz + 1);
    const ab = a + (b - a) * tx;
    const cd = c + (d - c) * tx;
    return ab + (cd - ab) * tz;
  }

  markDirty(minX, minZ, maxX, maxZ) {
    if (!this.dirty) this.dirty = { minX, minZ, maxX, maxZ };
    else {
      this.dirty.minX = Math.min(this.dirty.minX, minX);
      this.dirty.minZ = Math.min(this.dirty.minZ, minZ);
      this.dirty.maxX = Math.max(this.dirty.maxX, maxX);
      this.dirty.maxZ = Math.max(this.dirty.maxZ, maxZ);
    }
  }

  consumeDirtyBounds() { const bounds = this.dirty; this.dirty = null; return bounds; }

  stampFoot(landing, controller) {
    const cx = landing.globalX, cz = landing.globalZ, yaw = landing.yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const speed = clamp(controller.speed / 3.0, 0, 1);
    const slope = clamp(controller.lastSlope / 0.65, 0, 1);
    // Loose dry sand compresses several centimetres under an adult foot. The
    // previous 2–3 cm depression was visually too subtle at phone scale.
    const depth = 0.040 + speed * 0.018 + slope * 0.013;
    const halfW = 0.125, halfL = 0.245, radius = 0.40;
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);

    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const wx = ix * this.cellSize, wz = iz * this.cellSize;
        const dx = wx - cx, dz = wz - cz;
        const localX = dx * c - dz * s, localZ = dx * s + dz * c;
        const r = Math.hypot(localX / halfW, localZ / halfL);
        let delta = 0;
        if (r < 1) {
          const bowl = Math.pow(1 - r, 1.22);
          const heelToe = 0.80 + 0.20 * Math.cos(localZ / halfL * Math.PI);
          delta -= depth * bowl * heelToe;
        } else if (r < 1.62) {
          const ring = 1 - Math.abs(r - 1.24) / 0.38;
          delta += Math.max(0, ring) * depth * 0.38;
        }
        if (Math.abs(delta) > 0.00008) this.addCell(ix, iz, delta);
      }
    }

    const down = this.world?.downhill?.(cx, cz) ?? { x: 0, z: 0 };
    const push = 0.18 + slope * 0.34;
    const px = cx + Math.sin(yaw) * 0.19 + down.x * push;
    const pz = cz + Math.cos(yaw) * 0.19 + down.z * push;
    this.depositBlob(px, pz, 0.25, depth * (0.28 + slope * 0.22));
    if (slope > 0.38 || controller.sliding > 0.05) this.carveSlip(cx, cz, down, 0.48 + slope * 0.72, depth * 0.78);
    this.relaxArea(cx, cz, 0.72, 2);
    this.totalImpacts += 1;
  }

  depositBlob(cx, cz, radius, amount) {
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const dx = ix * this.cellSize - cx, dz = iz * this.cellSize - cz;
        const r = Math.hypot(dx, dz) / radius;
        if (r < 1) this.addCell(ix, iz, amount * Math.pow(1 - r, 1.65));
      }
    }
  }

  carveSlip(cx, cz, downhill, length, depth) {
    const steps = Math.max(2, Math.ceil(length / (this.cellSize * 0.75)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = cx + downhill.x * length * t, z = cz + downhill.z * length * t;
      const amount = depth * (1 - t * 0.65);
      this.depositBlob(x, z, 0.15 + t * 0.08, -amount * 0.48);
      this.depositBlob(x + downhill.x * 0.11, z + downhill.z * 0.11, 0.18, amount * 0.24);
    }
  }

  relaxArea(cx, cz, radius, iterations = 2) {
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);
    for (let pass = 0; pass < iterations; pass += 1) {
      const changes = [];
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        for (let ix = minIx; ix <= maxIx; ix += 1) {
          const h = this.getCell(ix, iz);
          if (Math.abs(h) < 0.0002) continue;
          const average = (this.getCell(ix - 1, iz) + this.getCell(ix + 1, iz) + this.getCell(ix, iz - 1) + this.getCell(ix, iz + 1)) * 0.25;
          const diffuse = (average - h) * 0.045;
          if (Math.abs(diffuse) > 0.00003) changes.push([ix, iz, diffuse]);
        }
      }
      for (const [ix, iz, delta] of changes) this.addCell(ix, iz, delta);
    }
  }

  update(dt, playerX, playerZ) {
    this.pruneClock += dt;
    if (this.pruneClock < 3.5) return;
    this.pruneClock = 0;
    const maxDist2 = this.keepRadius * this.keepRadius;
    for (const cell of [...this.cells.values()]) {
      const dx = cell.ix * this.cellSize - playerX, dz = cell.iz * this.cellSize - playerZ;
      if (dx * dx + dz * dz > maxDist2) this.cells.delete(this.key(cell.ix, cell.iz));
    }
    if (this.cells.size > this.maxCells) {
      const ordered = [...this.cells.values()].sort((a, b) => a.touched - b.touched);
      const removeCount = this.cells.size - this.maxCells;
      for (let i = 0; i < removeCount; i += 1) this.cells.delete(this.key(ordered[i].ix, ordered[i].iz));
    }
  }

  clear() { this.cells.clear(); this.dirty = null; }
  get activeCellCount() { return this.cells.size; }
}
