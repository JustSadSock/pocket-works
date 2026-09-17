import { WORLD, gridInfo } from './sim.js';
import { WorldRenderer } from './render.js';

const { nx, ny, SOIL } = gridInfo();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rasterSlot(renderer, name) {
  if (!renderer[name]) {
    const canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    renderer[name] = { canvas, ctx: canvas.getContext('2d'), image: null };
  }
  return renderer[name];
}

function cavitySlot(renderer) {
  if (!renderer._pwCavityRaster) {
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = nx * scale;
    canvas.height = ny * scale;
    renderer._pwCavityRaster = {
      canvas,
      ctx: canvas.getContext('2d'),
      scale,
      stamp: -Infinity,
      excavated: -1
    };
  }
  return renderer._pwCavityRaster;
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
  g.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, WORLD.width, WORLD.height);
  g.restore();
}

WorldRenderer.prototype.cavities = function polishedCavities(w, g) {
  const slot = cavitySlot(this);
  const now = performance.now();
  const shouldRefresh = slot.excavated !== w.stats.excavated || now - slot.stamp > 220;

  if (shouldRefresh) {
    const { ctx, canvas, scale } = slot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const surfaceRow = Math.floor(WORLD.surfaceY / WORLD.cell);
    const grad = ctx.createLinearGradient(0, surfaceRow * scale, 0, ny * scale);
    grad.addColorStop(0, '#79614a');
    grad.addColorStop(0.52, '#674f3d');
    grad.addColorStop(1, '#564035');
    ctx.fillStyle = grad;
    ctx.beginPath();

    // One continuous metaball-like path at 4x the simulation-grid resolution.
    // Physics stays discrete, but adjacent excavated cells merge into a crisp natural wall.
    const radius = scale * 0.86;
    for (let y = surfaceRow; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const i = y * nx + x;
        if (w.soil[i] !== SOIL.AIR) continue;
        const cx = (x + 0.5) * scale;
        const cy = (y + 0.5) * scale;
        ctx.moveTo(cx + radius, cy);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    slot.excavated = w.stats.excavated;
    slot.stamp = now;
  }

  paintScaled(g, slot.canvas, 'source-over', 'drop-shadow(0 0 1.15px rgba(39,25,19,.76))');
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
