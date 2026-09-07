import { clamp } from './core.js';

const DEFAULT_CELL = 0.16;

export class SandPhysics {
  constructor(world, options = {}) {
    this.world = world;
    this.cellSize = options.cellSize ?? DEFAULT_CELL;
    this.maxCells = options.maxCells ?? 5200;
    this.keepRadius = options.keepRadius ?? 58;
    this.cells = new Map();
    this.dirty = null;
    this.pruneClock = 0;
    this.totalImpacts = 0;
  }

  key(ix, iz) { return `${ix},${iz}`; }

  getCell(ix, iz) {
    return this.cells.get(this.key(ix, iz))?.h ?? 0;
  }

  setCell(ix, iz, h) {
    const key = this.key(ix, iz);
    const value = clamp(h, -0.085, 0.055);
    if (Math.abs(value) < 0.00035) {
      this.cells.delete(key);
      return;
    }
    this.cells.set(key, { ix, iz, h: value, touched: performance.now() });
    const x = ix * this.cellSize;
    const z = iz * this.cellSize;
    this.markDirty(x - this.cellSize, z - this.cellSize, x + this.cellSize, z + this.cellSize);
  }

  addCell(ix, iz, delta) {
    this.setCell(ix, iz, this.getCell(ix, iz) + delta);
  }

  sampleOffset(x, z) {
    const fx = x / this.cellSize;
    const fz = z / this.cellSize;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = this.getCell(ix, iz);
    const b = this.getCell(ix + 1, iz);
    const c = this.getCell(ix, iz + 1);
    const d = this.getCell(ix + 1, iz + 1);
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

  consumeDirtyBounds() {
    const bounds = this.dirty;
    this.dirty = null;
    return bounds;
  }

  stampFoot(landing, controller) {
    const cx = landing.globalX;
    const cz = landing.globalZ;
    const yaw = landing.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const speed = clamp(controller.speed / 3.25, 0, 1);
    const slope = clamp(controller.lastSlope / 0.65, 0, 1);
    const depth = 0.028 + speed * 0.012 + slope * 0.009;
    const halfW = 0.13;
    const halfL = 0.255;
    const radius = 0.42;
    const minIx = Math.floor((cx - radius) / this.cellSize);
    const maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize);
    const maxIz = Math.ceil((cz + radius) / this.cellSize);

    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const wx = ix * this.cellSize;
        const wz = iz * this.cellSize;
        const dx = wx - cx;
        const dz = wz - cz;
        const localX = dx * c - dz * s;
        const localZ = dx * s + dz * c;
        const ex = localX / halfW;
        const ez = localZ / halfL;
        const r = Math.hypot(ex, ez);
        let delta = 0;
        if (r < 1) {
          const bowl = Math.pow(1 - r, 1.35);
          const heelToe = 0.82 + 0.18 * Math.cos(localZ / halfL * Math.PI);
          delta -= depth * bowl * heelToe;
        } else if (r < 1.55) {
          const ring = 1 - Math.abs(r - 1.22) / 0.33;
          delta += Math.max(0, ring) * depth * 0.30;
        }
        if (Math.abs(delta) > 0.0001) this.addCell(ix, iz, delta);
      }
    }

    // Push a small amount of sand in front of the foot and downhill. This is a
    // cheap volume-transfer approximation rather than a decal or particle trick.
    const down = this.world?.downhill?.(cx, cz) ?? { x: 0, z: 0 };
    const push = 0.18 + slope * 0.30;
    const px = cx + Math.sin(yaw) * 0.18 + down.x * push;
    const pz = cz + Math.cos(yaw) * 0.18 + down.z * push;
    this.depositBlob(px, pz, 0.24, depth * (0.22 + slope * 0.2));

    if (slope > 0.45 || controller.sliding > 0.08) {
      this.carveSlip(cx, cz, down, 0.45 + slope * 0.65, depth * 0.65);
    }

    this.relaxArea(cx, cz, 0.72, 3);
    this.totalImpacts += 1;
  }

  depositBlob(cx, cz, radius, amount) {
    const minIx = Math.floor((cx - radius) / this.cellSize);
    const maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize);
    const maxIz = Math.ceil((cz + radius) / this.cellSize);
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const dx = ix * this.cellSize - cx;
        const dz = iz * this.cellSize - cz;
        const r = Math.hypot(dx, dz) / radius;
        if (r >= 1) continue;
        this.addCell(ix, iz, amount * Math.pow(1 - r, 1.8));
      }
    }
  }

  carveSlip(cx, cz, downhill, length, depth) {
    const steps = Math.max(2, Math.ceil(length / (this.cellSize * 0.8)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = cx + downhill.x * length * t;
      const z = cz + downhill.z * length * t;
      const amount = depth * (1 - t * 0.65);
      this.depositBlob(x, z, 0.16 + t * 0.08, -amount * 0.44);
      this.depositBlob(x + downhill.x * 0.11, z + downhill.z * 0.11, 0.18, amount * 0.20);
    }
  }

  relaxArea(cx, cz, radius, iterations = 2) {
    const minIx = Math.floor((cx - radius) / this.cellSize);
    const maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize);
    const maxIz = Math.ceil((cz + radius) / this.cellSize);
    for (let pass = 0; pass < iterations; pass += 1) {
      const changes = [];
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        for (let ix = minIx; ix <= maxIx; ix += 1) {
          const h = this.getCell(ix, iz);
          if (Math.abs(h) < 0.0002) continue;
          const neighbours = [
            [ix - 1, iz], [ix + 1, iz], [ix, iz - 1], [ix, iz + 1]
          ];
          let sum = 0;
          for (const [nx, nz] of neighbours) sum += this.getCell(nx, nz);
          const average = sum * 0.25;
          const diffuse = (average - h) * 0.055;
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
    const entries = [...this.cells.values()];
    for (const cell of entries) {
      const x = cell.ix * this.cellSize;
      const z = cell.iz * this.cellSize;
      const dx = x - playerX;
      const dz = z - playerZ;
      if (dx * dx + dz * dz > maxDist2) this.cells.delete(this.key(cell.ix, cell.iz));
    }
    if (this.cells.size > this.maxCells) {
      const ordered = [...this.cells.values()].sort((a, b) => a.touched - b.touched);
      const removeCount = this.cells.size - this.maxCells;
      for (let i = 0; i < removeCount; i += 1) this.cells.delete(this.key(ordered[i].ix, ordered[i].iz));
    }
  }

  clear() {
    this.cells.clear();
    this.dirty = null;
  }

  get activeCellCount() { return this.cells.size; }
}
