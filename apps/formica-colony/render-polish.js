import { WORLD, gridInfo } from './sim.js';
import { WorldRenderer } from './render.js';

const { nx, ny, SOIL } = gridInfo();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function rasterSlot(renderer, name) {
  if (!renderer[name]) {
    const canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    renderer[name] = { canvas, ctx: canvas.getContext('2d'), image: null, stamp: -Infinity, excavated: -1 };
  }
  return renderer[name];
}

function ensureImage(slot) {
  if (!slot.image || slot.image.width !== nx || slot.image.height !== ny) {
    slot.image = slot.ctx.createImageData(nx, ny);
  }
  return slot.image;
}

function commit(slot, image) {
  slot.ctx.putImageData(image, 0, 0);
}

function paintScaled(g, canvas, composite = 'source-over', filter = 'none') {
  g.save();
  g.globalCompositeOperation = composite;
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  g.filter = filter;
  g.drawImage(canvas, 0, 0, nx, ny, 0, 0, WORLD.width, WORLD.height);
  g.restore();
}

WorldRenderer.prototype.cavities = function polishedCavities(w, g) {
  const slot = rasterSlot(this, '_pwCavityRaster');
  const now = performance.now();
  const shouldRefresh = slot.excavated !== w.stats.excavated || now - slot.stamp > 220;

  if (shouldRefresh) {
    const image = ensureImage(slot);
    const data = image.data;
    data.fill(0);
    const surfaceRow = Math.floor(WORLD.surfaceY / WORLD.cell);

    for (let y = surfaceRow; y < ny; y += 1) {
      const depth = clamp((y * WORLD.cell - WORLD.surfaceY) / (WORLD.height - WORLD.surfaceY), 0, 1);
      const r = lerp(121, 86, depth);
      const gg = lerp(99, 68, depth);
      const b = lerp(77, 56, depth);
      for (let x = 0; x < nx; x += 1) {
        const i = y * nx + x;
        if (w.soil[i] !== SOIL.AIR) continue;
        const p = i * 4;
        data[p] = r;
        data[p + 1] = gg;
        data[p + 2] = b;
        data[p + 3] = 255;
      }
    }

    commit(slot, image);
    slot.excavated = w.stats.excavated;
    slot.stamp = now;
  }

  // The simulation remains cellular, but the observer sees a continuous excavated volume.
  // Bilinear expansion of the 1px-per-cell mask removes the bead-like circles without
  // hiding real changes to the topology of the nest.
  paintScaled(g, slot.canvas, 'source-over', 'drop-shadow(0 0 2.4px rgba(42,27,20,.82))');
};

WorldRenderer.prototype.moistureOverlay = function polishedMoisture(w, g) {
  const slot = rasterSlot(this, '_pwMoistureRaster');
  const image = ensureImage(slot);
  const data = image.data;
  data.fill(0);
  const surfaceRow = Math.floor(WORLD.surfaceY / WORLD.cell);

  for (let y = surfaceRow; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const i = y * nx + x;
      if (w.soil[i] === SOIL.AIR) continue;
      const m = clamp(w.moisture[i], 0, 1);
      if (m < 0.045) continue;
      const p = i * 4;
      data[p] = 47;
      data[p + 1] = 91;
      data[p + 2] = 108;
      data[p + 3] = Math.round(clamp(18 + m * 150, 0, 172));
    }
  }

  commit(slot, image);
  paintScaled(g, slot.canvas, 'multiply');
};

WorldRenderer.prototype.temperatureOverlay = function polishedTemperature(w, g) {
  const slot = rasterSlot(this, '_pwTemperatureRaster');
  const image = ensureImage(slot);
  const data = image.data;
  data.fill(0);
  const surfaceRow = Math.floor(WORLD.surfaceY / WORLD.cell);

  for (let y = surfaceRow; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const i = y * nx + x;
      if (w.soil[i] === SOIL.AIR) continue;
      const q = clamp(w.temp[i], 0, 1);
      const warm = clamp((q - 0.48) * 1.8, 0, 1);
      const cold = clamp((0.52 - q) * 1.8, 0, 1);
      const strength = Math.max(warm, cold);
      if (strength < 0.025) continue;
      const p = i * 4;
      if (warm >= cold) {
        data[p] = 196; data[p + 1] = 102; data[p + 2] = 60;
      } else {
        data[p] = 55; data[p + 1] = 99; data[p + 2] = 124;
      }
      data[p + 3] = Math.round(28 + strength * 126);
    }
  }

  commit(slot, image);
  paintScaled(g, slot.canvas, 'soft-light');
};

WorldRenderer.prototype.pheromones = function polishedPheromones(w, g) {
  const slot = rasterSlot(this, '_pwPheromoneRaster');
  const image = ensureImage(slot);
  const data = image.data;
  data.fill(0);

  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const i = y * nx + x;
      const food = clamp(w.pherFood[i], 0, 1);
      const build = clamp(w.pherBuild[i], 0, 1);
      const alarm = clamp(w.pherAlarm[i], 0, 1);
      const sum = food + build + alarm;
      if (sum < 0.035) continue;
      const p = i * 4;
      data[p] = Math.round((215 * food + 87 * build + 184 * alarm) / sum);
      data[p + 1] = Math.round((160 * food + 150 * build + 74 * alarm) / sum);
      data[p + 2] = Math.round((71 * food + 139 * build + 56 * alarm) / sum);
      data[p + 3] = Math.round(clamp(sum * 118, 10, 178));
    }
  }

  commit(slot, image);
  paintScaled(g, slot.canvas, 'screen', 'blur(.35px)');
};
