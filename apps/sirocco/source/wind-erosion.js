import { clamp } from './core.js';

// Cheap directional transport over the existing sparse 12 cm sand field.
// It never touches coarse terrain. Fresh loose rims migrate downwind and old
// cavities slowly soften, so tracks feel temporary without a grain simulator.
export class WindErosion {
  constructor(sand) {
    this.sand = sand;
    this.clock = 0;
    this.lastMoved = 0;
    this.budget = 34;
  }

  setQuality(preset) {
    this.budget = preset?.id === 'high' ? 42 : preset?.id === 'medium' ? 30 : 20;
  }

  update(dt, playerX, playerZ, wind) {
    this.clock += dt;
    if (this.clock < 0.46 || !wind || wind.strength < 0.32 || this.sand.cells.size === 0) return false;
    this.clock = 0;

    const radius2 = 6.2 * 6.2;
    const dirX = wind.x;
    const dirZ = wind.z;
    const stepX = Math.abs(dirX) > Math.abs(dirZ) ? Math.sign(dirX) : 0;
    const stepZ = stepX === 0 ? Math.sign(dirZ) : 0;
    const gust = clamp(wind.gust, 0, 1);
    const strength = clamp(wind.strength, 0, 1);
    let processed = 0;
    let moved = 0;

    // Iterate the sparse map directly. Copying up to ~4600 cell objects every
    // half-second only to process <=42 of them caused avoidable Safari GC work.
    // Map iteration remains bounded by the processing budget even if a transfer
    // adds a new downwind cell during this pass.
    for (const cell of this.sand.cells.values()) {
      if (processed >= this.budget) break;
      const wx = cell.ix * this.sand.cellSize;
      const wz = cell.iz * this.sand.cellSize;
      const dx = wx - playerX;
      const dz = wz - playerZ;
      if (dx * dx + dz * dz > radius2) continue;
      if (cell.loose < 0.035 && cell.compaction < 0.10) continue;
      processed += 1;

      if (cell.h > 0.0005 && cell.loose > 0.04) {
        const amount = Math.min(
          cell.h * (0.010 + gust * 0.020),
          0.00022 + strength * 0.00034
        );
        if (amount > 0.00003) {
          this.sand.addCell(cell.ix, cell.iz, -amount, -0.012 - gust * 0.010, 0.002);
          this.sand.addCell(cell.ix + stepX, cell.iz + stepZ, amount * 0.88, 0.022 + gust * 0.018, -0.003);
          moved += 1;
        }
      } else if (cell.h < -0.0008 && cell.compaction > 0.08) {
        // Wind-carried grains gradually soften the sharp centre of an older
        // footprint. Keep this intentionally slow: a fresh track must remain
        // readable for many seconds rather than disappearing immediately.
        const fill = Math.min(-cell.h * (0.0020 + gust * 0.0028), 0.00016 + strength * 0.00010);
        if (fill > 0.00002) {
          this.sand.addCell(cell.ix, cell.iz, fill, 0.007 + gust * 0.005, -0.010);
          moved += 1;
        }
      }
    }

    this.lastMoved = moved;
    return moved > 0;
  }
}
