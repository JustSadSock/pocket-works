import { WORLD, VIEW, gridInfo } from './sim.js';

const { nx, ny, SOIL } = gridInfo();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (x, y = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
};
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function seasonPalette(season) {
  if (season === 'зима') return { skyTop: '#c8d2cf', skyBottom: '#d9d6c8', grass: '#7d8269', grassDark: '#656b56' };
  if (season === 'осень') return { skyTop: '#cfd2bf', skyBottom: '#ddd5b7', grass: '#8b8253', grassDark: '#6e6946' };
  if (season === 'лето') return { skyTop: '#bfcebd', skyBottom: '#d7d5b9', grass: '#6f8456', grassDark: '#596f47' };
  return { skyTop: '#c6d2c0', skyBottom: '#d9d7bd', grass: '#71865b', grassDark: '#5d724c' };
}

export class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  worldToScreen(c, x, y) {
    return { x: (x - c.x) * c.zoom + this.width / 2, y: (y - c.y) * c.zoom + this.height / 2 };
  }

  screenToWorld(c, x, y) {
    return { x: (x - this.width / 2) / c.zoom + c.x, y: (y - this.height / 2) / c.zoom + c.y };
  }

  draw(w, c, selection, view, now = 0) {
    const g = this.ctx, W = this.width, H = this.height;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#d4ccb5';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2 - c.x * c.zoom, H / 2 - c.y * c.zoom);
    g.scale(c.zoom, c.zoom);
    this.drawWorld(w, g, c, W, H, view, now, selection);
    g.restore();
    this.vignette(g, W, H);
  }

  drawWorld(w, g, c, W, H, view, now, selection) {
    const left = clamp(Math.floor((c.x - W / (2 * c.zoom)) / WORLD.cell) - 3, 0, nx - 1);
    const right = clamp(Math.ceil((c.x + W / (2 * c.zoom)) / WORLD.cell) + 3, 0, nx - 1);
    const top = clamp(Math.floor((c.y - H / (2 * c.zoom)) / WORLD.cell) - 3, 0, ny - 1);
    const bottom = clamp(Math.ceil((c.y + H / (2 * c.zoom)) / WORLD.cell) + 3, 0, ny - 1);

    this.sky(w, g);
    this.soilBase(w, g, left, right, top, bottom);
    this.roots(w, g, left, right);
    this.stones(w, g, left, right, top, bottom);
    this.cavities(w, g, left, right, top, bottom);
    if (view === VIEW.MOISTURE) this.moistureOverlay(w, g, left, right, top, bottom);
    if (view === VIEW.TEMPERATURE) this.temperatureOverlay(w, g, left, right, top, bottom);
    if (view === VIEW.PHEROMONE) this.pheromones(w, g, left, right, top, bottom);
    this.surface(w, g);
    this.soilPiles(w, g);
    this.food(w, g);
    this.bugs(w, g, now);
    this.brood(w, g, now);
    this.queen(w, g, now, selection);
    this.ants(w, g, now, selection);
    if (w.weather.rain > 0) this.rain(g, w.time);
  }

  surfaceY(x) {
    return WORLD.surfaceY + Math.sin(x * 0.013) * 4.5 + Math.sin(x * 0.037 + 0.8) * 2.2;
  }

  sky(w, g) {
    const p = seasonPalette(w.lastSeason);
    const phase = (w.time % 120) / 120;
    const daylight = Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    const grad = g.createLinearGradient(0, 0, 0, WORLD.surfaceY);
    grad.addColorStop(0, p.skyTop);
    grad.addColorStop(1, p.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, WORLD.width, WORLD.surfaceY + 12);
    if (daylight < 0.28) {
      g.fillStyle = `rgba(46,57,62,${0.22 * (0.28 - daylight) / 0.28})`;
      g.fillRect(0, 0, WORLD.width, WORLD.surfaceY + 12);
    }
    g.fillStyle = `rgba(255,242,205,${0.08 + daylight * 0.08})`;
    g.beginPath();
    g.arc(900, 62, 42, 0, Math.PI * 2);
    g.fill();
  }

  soilBase(w, g, left, right, top, bottom) {
    const y0 = WORLD.surfaceY;
    const grad = g.createLinearGradient(0, y0, 0, WORLD.height);
    grad.addColorStop(0, '#997353');
    grad.addColorStop(0.24, '#876447');
    grad.addColorStop(0.58, '#71523f');
    grad.addColorStop(1, '#5f4539');
    g.fillStyle = grad;
    g.fillRect(0, y0 - 2, WORLD.width, WORLD.height - y0 + 2);

    g.globalAlpha = 0.14;
    g.strokeStyle = '#d8b786';
    g.lineWidth = 2;
    for (const depth of [520, 790, 1180, 1640, 2070]) {
      g.beginPath();
      for (let x = left * WORLD.cell - 20; x <= right * WORLD.cell + 20; x += 24) {
        const y = depth + Math.sin(x * 0.012 + depth * 0.003) * 10 + Math.sin(x * 0.033) * 3;
        if (x === left * WORLD.cell - 20) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;

    const minX = Math.floor(left * WORLD.cell / 34) * 34;
    const maxX = right * WORLD.cell;
    const minY = Math.max(WORLD.surfaceY + 18, Math.floor(top * WORLD.cell / 34) * 34);
    const maxY = bottom * WORLD.cell;
    for (let y = minY; y <= maxY; y += 34) {
      for (let x = minX; x <= maxX; x += 34) {
        const h = hash(x, y);
        if (h < 0.32) continue;
        g.fillStyle = h > 0.72 ? 'rgba(49,35,28,.12)' : 'rgba(238,212,165,.075)';
        g.beginPath();
        g.ellipse(x + (hash(y, x) - 0.5) * 18, y + (hash(x + 9, y) - 0.5) * 18, 1.1 + h * 1.7, 0.7 + h, h * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  roots(w, g, left, right) {
    const p = seasonPalette(w.lastSeason);
    g.strokeStyle = rgba(p.grassDark, 0.55);
    g.lineCap = 'round';
    for (let x = Math.floor(left / 9) * 90 + 30; x < right * WORLD.cell + 90; x += 90) {
      const h = hash(x, 4);
      const sy = this.surfaceY(x);
      const depth = 46 + h * 90;
      g.lineWidth = 1.4 + h * 1.7;
      g.beginPath();
      g.moveTo(x, sy + 2);
      g.bezierCurveTo(x - 13 + h * 20, sy + depth * 0.32, x + 17 - h * 30, sy + depth * 0.67, x + (h - 0.5) * 34, sy + depth);
      g.stroke();
      if (h > 0.48) {
        g.lineWidth *= 0.58;
        g.beginPath();
        g.moveTo(x + (h - 0.5) * 8, sy + depth * 0.45);
        g.quadraticCurveTo(x + 20, sy + depth * 0.55, x + 27, sy + depth * 0.68);
        g.stroke();
      }
    }
  }

  stones(w, g, left, right, top, bottom) {
    const yStart = Math.max(top, Math.floor(WORLD.surfaceY / WORLD.cell));
    for (let y = yStart; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const i = y * nx + x;
        if (w.soil[i] !== SOIL.STONE) continue;
        const cx = (x + 0.5) * WORLD.cell, cy = (y + 0.5) * WORLD.cell;
        const h = hash(x * 3, y * 7);
        g.save();
        g.translate(cx, cy);
        g.rotate((h - 0.5) * 1.4);
        g.fillStyle = h > 0.54 ? 'rgba(61,55,49,.72)' : 'rgba(77,67,58,.66)';
        g.beginPath();
        g.ellipse(0, 0, 4.2 + h * 2.6, 2.8 + hash(y, x) * 2.3, 0, 0, Math.PI * 2);
        g.fill();
        if (h > 0.72) {
          g.strokeStyle = 'rgba(214,190,153,.18)';
          g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(-2.5, -1); g.lineTo(2.2, 1); g.stroke();
        }
        g.restore();
      }
    }
  }

  cavityPath(w, left, right, top, bottom, radius) {
    const p = new Path2D();
    const yStart = Math.max(top, Math.floor(WORLD.surfaceY / WORLD.cell));
    for (let y = yStart; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const i = y * nx + x;
        if (w.soil[i] !== SOIL.AIR) continue;
        const cx = (x + 0.5) * WORLD.cell, cy = (y + 0.5) * WORLD.cell;
        p.moveTo(cx + radius, cy);
        p.arc(cx, cy, radius, 0, Math.PI * 2);
      }
    }
    return p;
  }

  cavities(w, g, left, right, top, bottom) {
    const outer = this.cavityPath(w, left, right, top, bottom, 8.3);
    g.save();
    g.fillStyle = '#473227';
    g.shadowColor = 'rgba(24,15,12,.32)';
    g.shadowBlur = 7;
    g.fill(outer);
    g.restore();

    const inner = this.cavityPath(w, left, right, top, bottom, 6.45);
    const cavityGrad = g.createLinearGradient(0, WORLD.surfaceY, 0, WORLD.height);
    cavityGrad.addColorStop(0, '#76604a');
    cavityGrad.addColorStop(0.55, '#66503f');
    cavityGrad.addColorStop(1, '#594438');
    g.fillStyle = cavityGrad;
    g.fill(inner);

    g.globalAlpha = 0.17;
    g.fillStyle = '#dfc79e';
    for (let y = Math.max(top, Math.floor(WORLD.surfaceY / WORLD.cell)); y <= bottom; y += 3) {
      for (let x = left; x <= right; x += 3) {
        const i = y * nx + x;
        if (w.soil[i] !== SOIL.AIR || hash(x, y) < 0.52) continue;
        g.beginPath();
        g.arc((x + 0.5) * WORLD.cell - 1.8, (y + 0.5) * WORLD.cell - 1.8, 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  surface(w, g) {
    const p = seasonPalette(w.lastSeason);
    g.fillStyle = p.grass;
    g.beginPath();
    g.moveTo(0, this.surfaceY(0));
    for (let x = 0; x <= WORLD.width; x += 14) g.lineTo(x, this.surfaceY(x));
    g.lineTo(WORLD.width, WORLD.surfaceY + 10);
    g.lineTo(0, WORLD.surfaceY + 10);
    g.closePath();
    g.fill();

    g.strokeStyle = p.grassDark;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    for (let x = 18; x < WORLD.width; x += 34) {
      const sy = this.surfaceY(x);
      const h = 14 + hash(x, 7) * 25;
      const bend = (hash(x, 19) - 0.5) * 16;
      g.beginPath();
      g.moveTo(x, sy - 1);
      g.quadraticCurveTo(x + bend * 0.35, sy - h * 0.55, x + bend, sy - h);
      g.stroke();
      if (hash(x, 31) > 0.68) {
        g.fillStyle = w.lastSeason === 'осень' ? '#9f8152' : '#827d4c';
        g.beginPath();
        g.ellipse(x + bend, sy - h - 2, 2.4, 4.4, 0.25, 0, Math.PI * 2);
        g.fill();
      }
    }

    g.fillStyle = '#7d6651';
    for (let x = 70; x < WORLD.width; x += 185) {
      const sy = this.surfaceY(x);
      const h = hash(x, 77);
      g.save();
      g.translate(x, sy - 1);
      g.rotate((h - 0.5) * 0.4);
      g.beginPath();
      g.ellipse(0, 0, 12 + h * 9, 4 + h * 3.8, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  soilPiles(w, g) {
    for (const p of w.soilPiles) {
      const fade = clamp(1 - (p.age || 0) / 900, 0.35, 1);
      g.fillStyle = `rgba(130,93,64,${0.7 * fade})`;
      g.beginPath();
      g.ellipse(p.x, this.surfaceY(p.x) - 2, 4 + p.mass * 2.3, 2 + p.mass * 0.9, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  food(w, g) {
    for (const f of w.food) {
      if (f.type === 'seed') {
        g.fillStyle = f.y < WORLD.surfaceY + 5 ? '#a87a3f' : '#c39a57';
        const count = clamp(Math.ceil(f.amount * 5), 1, 6);
        for (let i = 0; i < count; i += 1) {
          const a = i * 2.4;
          g.beginPath();
          g.ellipse(f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 2.2, 2.4, 1.5, a * 0.2, 0, Math.PI * 2);
          g.fill();
        }
      } else if (f.type === 'nectar') {
        g.fillStyle = '#d8b85a';
        g.beginPath(); g.arc(f.x, f.y, 2.6 + Math.min(2.6, f.amount * 2), 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,244,181,.5)';
        g.beginPath(); g.arc(f.x - 1, f.y - 1.2, 1, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#6f5548';
        const size = 4 + Math.min(8, f.amount * 3.1);
        g.beginPath(); g.ellipse(f.x, f.y, size, size * 0.55, 0.15, 0, Math.PI * 2); g.fill();
      }
    }
  }

  bugs(w, g, now) {
    for (const b of w.bugs) {
      if (b.dead) continue;
      g.save();
      g.translate(b.x, this.surfaceY(b.x) - 10);
      g.rotate(Math.sin(now * 0.004 + b.id) * 0.12);
      const beetle = b.species === 'beetle';
      g.fillStyle = beetle ? '#4b4034' : '#765245';
      g.beginPath();
      g.ellipse(0, 0, beetle ? 9.2 : 5.8, beetle ? 5.6 : 3.7, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#302923';
      g.lineWidth = 1;
      for (const s of [-1, 1]) for (const yy of [-3, 0, 3]) {
        g.beginPath(); g.moveTo(s * 3, yy * 0.5); g.lineTo(s * 9, yy + s * 2); g.stroke();
      }
      if (beetle) { g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.strokeStyle = 'rgba(224,197,150,.26)'; g.stroke(); }
      g.restore();
    }
  }

  brood(w, g, now) {
    for (const b of w.brood) {
      g.save();
      g.translate(b.x, b.y);
      const wobble = b.stage === 'larva' ? Math.sin(now * 0.003 + b.id) * 0.4 : 0;
      if (b.stage === 'egg') {
        g.fillStyle = '#eee4c7';
        g.beginPath(); g.ellipse(0, 0, 3.2, 2.25, 0.18, 0, Math.PI * 2); g.fill();
      } else if (b.stage === 'larva') {
        g.fillStyle = '#dfd0aa';
        for (let i = -2; i <= 2; i += 1) {
          g.beginPath(); g.ellipse(i * 1.9, Math.sin(i + wobble) * 0.6, 2.3, 2.7, 0, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.fillStyle = '#bda681';
        g.beginPath(); g.ellipse(0, 0, 5.2, 3.3, 0.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(75,55,43,.3)'; g.lineWidth = 0.7; g.stroke();
      }
      g.restore();
    }
  }

  drawSelection(g, selected, now, r = 10) {
    if (!selected) return;
    g.strokeStyle = '#e6bd62';
    g.lineWidth = 1.35;
    g.beginPath();
    g.arc(0, 0, r + Math.sin(now * 0.007) * 1.2, 0, Math.PI * 2);
    g.stroke();
  }

  queen(w, g, now, selection) {
    if (!w.queen.alive) return;
    g.save();
    g.translate(w.queen.x, w.queen.y);
    g.rotate(Math.sin(now * 0.0008) * 0.025);
    this.drawSelection(g, selection?.kind === 'queen', now, 18);

    g.strokeStyle = '#261813';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (const x of [-3, 3, 8]) {
        g.beginPath();
        g.moveTo(x, s * 1.5);
        g.lineTo(x - 2, s * 6.5);
        g.lineTo(x + (x < 0 ? -5 : 5), s * 9.5);
        g.stroke();
      }
    }
    g.fillStyle = '#3b211a';
    g.beginPath(); g.ellipse(-9, 0, 12.5, 8.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#49271d';
    g.beginPath(); g.ellipse(4, 0, 6.6, 5.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#542d20';
    g.beginPath(); g.arc(11, 0, 4.7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b1914';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(13, -2); g.quadraticCurveTo(19, -7, 22, -5); g.moveTo(13, 2); g.quadraticCurveTo(19, 7, 22, 5); g.stroke();
    g.strokeStyle = 'rgba(230,183,116,.16)';
    g.beginPath(); g.arc(-10, -2, 7, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    g.restore();
  }

  ants(w, g, now, selection) {
    for (const a of w.ants) {
      g.save();
      g.translate(a.x, a.y);
      g.rotate(Math.atan2(a.vy || Math.sin(a.wander), a.vx || Math.cos(a.wander)));
      g.scale(0.82, 0.82);
      this.drawSelection(g, selection?.kind === 'ant' && selection.id === a.id, now, 9.8);
      const gait = Math.sin(now * 0.012 + a.id) * 1.3;
      g.strokeStyle = '#261914';
      g.lineWidth = 0.95;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(-1.5, s * 0.5); g.lineTo(-4, s * (4.4 + gait)); g.lineTo(-7, s * 5.2); g.stroke();
        g.beginPath(); g.moveTo(1.2, s * 0.4); g.lineTo(1.3, s * (5.2 - gait)); g.lineTo(3.8, s * 6.1); g.stroke();
        g.beginPath(); g.moveTo(3.4, s * 0.4); g.lineTo(5.8, s * (4.4 + gait * 0.5)); g.lineTo(8, s * 4.9); g.stroke();
      }
      g.fillStyle = '#2b1b16';
      g.beginPath(); g.ellipse(-4.4, 0, 4.2, 2.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#332019';
      g.beginPath(); g.ellipse(1, 0, 2.7, 2.25, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a241b';
      g.beginPath(); g.arc(5.1, 0, 2.45, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#261914';
      g.beginPath(); g.moveTo(6.4, -1); g.quadraticCurveTo(9.5, -4.5, 11.3, -3.8); g.moveTo(6.4, 1); g.quadraticCurveTo(9.5, 4.5, 11.3, 3.8); g.stroke();
      if (a.carry?.type === 'soil') {
        g.fillStyle = '#a47a54'; g.beginPath(); g.arc(10.5, 0, 2.8, 0, Math.PI * 2); g.fill();
      }
      if (a.carry?.type === 'food') {
        g.fillStyle = a.carry.foodType === 'prey' ? '#725448' : '#b88a47';
        g.beginPath(); g.ellipse(10.4, 0, 3.2, 2.3, 0.2, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  pheromones(w, g, l, r, t, b) {
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let y = t; y <= b; y += 2) {
      for (let x = l; x <= r; x += 2) {
        const i = y * nx + x;
        const food = w.pherFood[i], alarm = w.pherAlarm[i], build = w.pherBuild[i];
        const cx = (x + 0.5) * WORLD.cell, cy = (y + 0.5) * WORLD.cell;
        if (food > 0.035) { g.fillStyle = rgba('#d7a047', food * 0.38); g.beginPath(); g.arc(cx, cy, 11 + food * 8, 0, Math.PI * 2); g.fill(); }
        if (build > 0.045) { g.fillStyle = rgba('#57968b', build * 0.34); g.beginPath(); g.arc(cx, cy, 10 + build * 7, 0, Math.PI * 2); g.fill(); }
        if (alarm > 0.035) { g.fillStyle = rgba('#b84a38', alarm * 0.48); g.beginPath(); g.arc(cx, cy, 12 + alarm * 9, 0, Math.PI * 2); g.fill(); }
      }
    }
    g.restore();
  }

  moistureOverlay(w, g, l, r, t, b) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    for (let y = Math.max(t, Math.floor(WORLD.surfaceY / WORLD.cell)); y <= b; y += 2) {
      for (let x = l; x <= r; x += 2) {
        const i = y * nx + x;
        if (w.soil[i] === SOIL.AIR) continue;
        const m = w.moisture[i];
        if (m < 0.12) continue;
        g.fillStyle = `rgba(55,91,105,${0.05 + m * 0.38})`;
        g.beginPath(); g.arc((x + 0.5) * WORLD.cell, (y + 0.5) * WORLD.cell, 14, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }

  temperatureOverlay(w, g, l, r, t, b) {
    g.save();
    g.globalCompositeOperation = 'soft-light';
    for (let y = Math.max(t, Math.floor(WORLD.surfaceY / WORLD.cell)); y <= b; y += 2) {
      for (let x = l; x <= r; x += 2) {
        const i = y * nx + x;
        if (w.soil[i] === SOIL.AIR) continue;
        const q = w.temp[i];
        g.fillStyle = q > 0.5 ? `rgba(198,103,57,${(q - 0.5) * 0.7})` : `rgba(59,102,127,${(0.5 - q) * 0.7})`;
        g.beginPath(); g.arc((x + 0.5) * WORLD.cell, (y + 0.5) * WORLD.cell, 15, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }

  rain(g, time) {
    g.save();
    g.strokeStyle = 'rgba(194,214,221,.34)';
    g.lineWidth = 1.05;
    for (let i = 0; i < 78; i += 1) {
      const x = (i * 83 + time * 76) % WORLD.width;
      const y = (i * 43 + time * 148) % WORLD.surfaceY;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y + 15); g.stroke();
    }
    g.restore();
  }

  vignette(g, W, H) {
    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.74);
    grad.addColorStop(0, 'rgba(40,28,22,0)');
    grad.addColorStop(1, 'rgba(40,28,22,.08)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
}
