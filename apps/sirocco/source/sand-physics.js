import { clamp } from './core.js';

const DEFAULT_CELL = 0.12;
const REPOSE_TAN = Math.tan(32 * Math.PI / 180);

export class SandPhysics {
  constructor(world, options = {}) {
    this.world = world;
    this.cellSize = options.cellSize ?? DEFAULT_CELL;
    this.maxCells = options.maxCells ?? 4600;
    this.keepRadius = options.keepRadius ?? 52;
    this.cells = new Map();
    this.dirty = null;
    this.pruneClock = 0;
    this.avalancheClock = 0;
    this.settleClock = 0;
    this.totalImpacts = 0;
    this.lastWorkMs = 0;
    this.lastTransferCount = 0;
  }

  setQuality(preset) {
    if (!preset) return;
    if (preset.id === 'high') {
      this.maxCells = 4600; this.keepRadius = 52; this.avalancheBudget = 92; this.settleBudget = 72;
    } else if (preset.id === 'medium') {
      this.maxCells = 3200; this.keepRadius = 42; this.avalancheBudget = 60; this.settleBudget = 48;
    } else {
      this.maxCells = 1900; this.keepRadius = 32; this.avalancheBudget = 34; this.settleBudget = 28;
    }
  }

  key(ix, iz) { return `${ix},${iz}`; }
  getCellData(ix, iz) { return this.cells.get(this.key(ix, iz)) || null; }
  getCell(ix, iz) { return this.getCellData(ix, iz)?.h ?? 0; }
  getLooseCell(ix, iz) { return this.getCellData(ix, iz)?.loose ?? 0; }
  getCompactionCell(ix, iz) { return this.getCellData(ix, iz)?.compaction ?? 0; }

  writeCell(ix, iz, next) {
    const key = this.key(ix, iz);
    const h = clamp(next.h ?? 0, -0.105, 0.070);
    const loose = clamp(next.loose ?? 0, 0, 1);
    const compaction = clamp(next.compaction ?? 0, 0, 1);
    if (Math.abs(h) < 0.00028 && loose < 0.015 && compaction < 0.015) {
      this.cells.delete(key);
      return;
    }
    const previous = this.cells.get(key);
    this.cells.set(key, {
      ix,
      iz,
      h,
      loose,
      compaction,
      touched: next.touched ?? previous?.touched ?? performance.now()
    });
    const x = ix * this.cellSize, z = iz * this.cellSize;
    this.markDirty(x - this.cellSize, z - this.cellSize, x + this.cellSize, z + this.cellSize);
  }

  setCell(ix, iz, h) {
    const previous = this.getCellData(ix, iz);
    this.writeCell(ix, iz, {
      h,
      loose: previous?.loose ?? Math.max(0, h * 8),
      compaction: previous?.compaction ?? Math.max(0, -h * 7),
      touched: performance.now()
    });
  }

  addCell(ix, iz, delta, looseDelta = 0, compactionDelta = 0) {
    const previous = this.getCellData(ix, iz);
    this.writeCell(ix, iz, {
      h: (previous?.h ?? 0) + delta,
      loose: (previous?.loose ?? 0) + looseDelta,
      compaction: (previous?.compaction ?? 0) + compactionDelta,
      touched: performance.now()
    });
  }

  sampleChannel(x, z, getter) {
    const fx = x / this.cellSize, fz = z / this.cellSize;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = getter.call(this, ix, iz), b = getter.call(this, ix + 1, iz);
    const c = getter.call(this, ix, iz + 1), d = getter.call(this, ix + 1, iz + 1);
    const ab = a + (b - a) * tx;
    const cd = c + (d - c) * tx;
    return ab + (cd - ab) * tz;
  }

  sampleOffset(x, z) { return this.sampleChannel(x, z, this.getCell); }
  sampleLoose(x, z) { return clamp(this.sampleChannel(x, z, this.getLooseCell), 0, 1); }
  sampleCompaction(x, z) { return clamp(this.sampleChannel(x, z, this.getCompactionCell), 0, 1); }
  sampleSoftness(x, z) {
    const loose = this.sampleLoose(x, z);
    const compact = this.sampleCompaction(x, z);
    // Untouched dune sand is moderately loose. Fresh deposits are softer,
    // repeated footprints become firmer and offer less sink/drag.
    return clamp(0.48 + loose * 0.46 - compact * 0.34, 0.16, 0.96);
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
    const softness = this.sampleSoftness(cx, cz);
    const depth = (0.036 + speed * 0.016 + slope * 0.012) * (0.72 + softness * 0.55);
    const halfW = 0.125, halfL = 0.245, radius = 0.42;
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);
    let removedMass = 0;
    const rimCells = [];

    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const wx = ix * this.cellSize, wz = iz * this.cellSize;
        const dx = wx - cx, dz = wz - cz;
        const localX = dx * c - dz * s, localZ = dx * s + dz * c;
        const r = Math.hypot(localX / halfW, localZ / halfL);
        if (r < 1) {
          const bowl = Math.pow(1 - r, 1.18);
          const heelToe = 0.80 + 0.20 * Math.cos(localZ / halfL * Math.PI);
          const delta = -depth * bowl * heelToe;
          removedMass += -delta;
          this.addCell(ix, iz, delta, -0.16 * bowl, 0.36 * bowl);
        } else if (r < 1.72) {
          const ring = Math.max(0, 1 - Math.abs(r - 1.28) / 0.44);
          if (ring > 0) rimCells.push([ix, iz, ring]);
        }
      }
    }

    // Return most displaced volume to the rim instead of creating/losing it.
    const rimWeight = rimCells.reduce((sum, cell) => sum + cell[2], 0) || 1;
    const rimMass = removedMass * 0.68;
    for (const [ix, iz, weight] of rimCells) {
      const amount = rimMass * weight / rimWeight;
      this.addCell(ix, iz, amount, 0.24 * weight, -0.06 * weight);
    }

    const down = this.world?.downhill?.(cx, cz) ?? { x: 0, z: 0 };
    const push = 0.18 + slope * 0.34;
    const px = cx + Math.sin(yaw) * 0.19 + down.x * push;
    const pz = cz + Math.cos(yaw) * 0.19 + down.z * push;
    this.depositBlob(px, pz, 0.26, removedMass * (0.12 + slope * 0.06), 0.34);
    if (slope > 0.38 || controller.sliding > 0.05) this.carveSlip(cx, cz, down, 0.48 + slope * 0.72, depth * 0.78);
    this.relaxArea(cx, cz, 0.76, 2);
    this.totalImpacts += 1;
  }

  depositBlob(cx, cz, radius, amount, looseBoost = 0.24) {
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);
    let weightSum = 0;
    const cells = [];
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const dx = ix * this.cellSize - cx, dz = iz * this.cellSize - cz;
        const r = Math.hypot(dx, dz) / radius;
        if (r >= 1) continue;
        const weight = Math.pow(1 - r, 1.6);
        weightSum += weight;
        cells.push([ix, iz, weight]);
      }
    }
    if (weightSum <= 0) return;
    for (const [ix, iz, weight] of cells) {
      const normalized = weight / weightSum;
      this.addCell(ix, iz, amount * normalized, looseBoost * weight, -0.03 * weight);
    }
  }

  carveSlip(cx, cz, downhill, length, depth) {
    const steps = Math.max(2, Math.ceil(length / (this.cellSize * 0.75)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = cx + downhill.x * length * t, z = cz + downhill.z * length * t;
      const amount = depth * (1 - t * 0.65);
      this.depositBlob(x, z, 0.15 + t * 0.08, -amount * 0.34, 0.05);
      this.depositBlob(x + downhill.x * 0.13, z + downhill.z * 0.13, 0.19, amount * 0.27, 0.42);
    }
  }

  relaxArea(cx, cz, radius, iterations = 2) {
    const minIx = Math.floor((cx - radius) / this.cellSize), maxIx = Math.ceil((cx + radius) / this.cellSize);
    const minIz = Math.floor((cz - radius) / this.cellSize), maxIz = Math.ceil((cz + radius) / this.cellSize);
    for (let pass = 0; pass < iterations; pass += 1) {
      const changes = [];
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        for (let ix = minIx; ix <= maxIx; ix += 1) {
          const cell = this.getCellData(ix, iz);
          if (!cell || Math.abs(cell.h) < 0.0002) continue;
          const average = (this.getCell(ix - 1, iz) + this.getCell(ix + 1, iz) + this.getCell(ix, iz - 1) + this.getCell(ix, iz + 1)) * 0.25;
          const looseFactor = 0.025 + cell.loose * 0.055;
          const diffuse = (average - cell.h) * looseFactor;
          if (Math.abs(diffuse) > 0.000025) changes.push([ix, iz, diffuse, cell.loose]);
        }
      }
      for (const [ix, iz, delta, loose] of changes) this.addCell(ix, iz, delta, -Math.abs(delta) * 1.4 * loose, 0);
    }
  }

  baseHeight(ix, iz) { return this.world?.sampleBaseHeight?.(ix * this.cellSize, iz * this.cellSize) ?? 0; }

  avalanche(playerX, playerZ) {
    const radius = 5.2;
    const radius2 = radius * radius;
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const reposeDrop = REPOSE_TAN * this.cellSize;
    const transfers = [];
    let processed = 0;

    for (const cell of this.cells.values()) {
      if (processed >= (this.avalancheBudget ?? 64)) break;
      if (cell.h <= 0.00035 || cell.loose <= 0.04) continue;
      const wx = cell.ix * this.cellSize, wz = cell.iz * this.cellSize;
      const dx = wx - playerX, dz = wz - playerZ;
      if (dx * dx + dz * dz > radius2) continue;
      processed += 1;
      const sourceHeight = this.baseHeight(cell.ix, cell.iz) + cell.h;
      let best = null;
      let bestDrop = reposeDrop;
      for (const [ox, oz] of neighbors) {
        const nx = cell.ix + ox, nz = cell.iz + oz;
        const neighborHeight = this.baseHeight(nx, nz) + this.getCell(nx, nz);
        const drop = sourceHeight - neighborHeight;
        if (drop > bestDrop) { bestDrop = drop; best = [nx, nz]; }
      }
      if (!best) continue;
      const excess = bestDrop - reposeDrop;
      const mobility = 0.35 + cell.loose * 0.85;
      const amount = Math.min(cell.h * 0.14 * mobility, excess * 0.05 * mobility, 0.0030);
      if (amount > 0.00004) transfers.push([cell.ix, cell.iz, best[0], best[1], amount, cell.loose]);
    }

    this.lastTransferCount = transfers.length;
    for (const [sx, sz, tx, tz, amount, loose] of transfers) {
      this.addCell(sx, sz, -amount, -0.05 * loose, 0.01 * loose);
      this.addCell(tx, tz, amount, 0.08 + 0.10 * loose, -0.01);
    }
  }

  settleLoose(playerX, playerZ) {
    const radius2 = 5.5 * 5.5;
    let processed = 0;
    for (const cell of this.cells.values()) {
      if (processed >= (this.settleBudget ?? 48)) break;
      const wx = cell.ix * this.cellSize, wz = cell.iz * this.cellSize;
      const dx = wx - playerX, dz = wz - playerZ;
      if (dx * dx + dz * dz > radius2 || (cell.loose < 0.01 && cell.compaction < 0.01)) continue;
      processed += 1;
      const looseDecay = cell.loose * 0.028;
      const compactionDecay = cell.compaction * 0.0035;
      this.writeCell(cell.ix, cell.iz, {
        ...cell,
        loose: cell.loose - looseDecay,
        compaction: cell.compaction - compactionDecay,
        touched: cell.touched
      });
    }
  }

  update(dt, playerX, playerZ) {
    const start = performance.now();
    this.avalancheClock += dt;
    if (this.avalancheClock >= 0.22) {
      this.avalancheClock = 0;
      this.avalanche(playerX, playerZ);
    }
    this.settleClock += dt;
    if (this.settleClock >= 0.32) {
      this.settleClock = 0;
      this.settleLoose(playerX, playerZ);
    }

    this.pruneClock += dt;
    if (this.pruneClock >= 4.0) {
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
    this.lastWorkMs = performance.now() - start;
  }

  clear() { this.cells.clear(); this.dirty = null; }
  get activeCellCount() { return this.cells.size; }
}
