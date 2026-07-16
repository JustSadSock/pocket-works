const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function hashNoise(x, y = 0, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function terrainTint(value, fallback, alpha) {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return `rgba(${Math.round(value[0] * 255)},${Math.round(value[1] * 255)},${Math.round(value[2] * 255)},${alpha})`;
}

function routeSample(centerline, progress) {
  if (!centerline?.length) return { x: 0, y: 0, nx: 1, ny: 0 };
  const scaled = clamp(progress, 0, 1) * (centerline.length - 1);
  const index = Math.min(centerline.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = centerline[index];
  const b = centerline[index + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local), nx: -dy / length, ny: dx / length };
}

function ellipseWorldPoints(mask, scale, count = 34) {
  const points = [];
  const cos = Math.cos(mask.angle || 0);
  const sin = Math.sin(mask.angle || 0);
  for (let index = 0; index <= count; index += 1) {
    const angle = index / count * TAU;
    const lx = Math.cos(angle) * mask.length * .5 * scale;
    const ly = Math.sin(angle) * mask.width * .5 * scale;
    points.push({ x: mask.x + lx * cos - ly * sin, y: mask.y + lx * sin + ly * cos });
  }
  return points;
}

export class CoursePolishLayer {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    const anchor = canvas.parentElement?.querySelector('.moss-render-overlay') || canvas;
    this.layer = document.createElement('canvas');
    this.layer.className = 'moss-course-polish';
    this.layer.setAttribute('aria-hidden', 'true');
    Object.assign(this.layer.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      zIndex: '4', pointerEvents: 'none'
    });
    anchor.insertAdjacentElement('afterend', this.layer);
    this.ctx = this.layer.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.cache = new WeakMap();
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(480, rect.height || window.innerHeight);
    const width = Math.round(this.width * this.dpr);
    const height = Math.round(this.height * this.dpr);
    if (this.layer.width !== width || this.layer.height !== height) {
      this.layer.width = width;
      this.layer.height = height;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.layer.remove();
  }

  buildDetails(level) {
    const field = level.course18?.field;
    const seed = Number(level.id) || 19;
    const details = [];
    for (let index = 0; index < 72; index += 1) {
      const t = .025 + hashNoise(index, seed, 11) * .95;
      const sample = routeSample(level.centerline, t);
      const side = index % 2 ? 1 : -1;
      const offset = 132 + hashNoise(index, seed, 17) * 125;
      const x = sample.x + sample.nx * side * offset;
      const y = sample.y + sample.ny * side * offset;
      const surface = field.surfaceAt(x, y);
      details.push({
        x, y, surface,
        phase: hashNoise(index, seed, 23) * TAU,
        size: .7 + hashNoise(index, seed, 29) * .8,
        lean: (hashNoise(index, seed, 31) - .5) * 7
      });
    }
    const waterMasks = (field.masks || []).filter((mask) => mask.type === 'water' && Number.isFinite(mask.x));
    const sandMasks = (field.masks || []).filter((mask) => mask.type === 'sand' && Number.isFinite(mask.x));
    return { details, waterMasks, sandMasks };
  }

  pathWorld(points, field, zOffset = .5) {
    const ctx = this.ctx;
    let started = false;
    ctx.beginPath();
    for (const point of points) {
      const z = field.heightAt(point.x, point.y) + zOffset;
      const screen = this.renderer.worldToScreen(point.x, point.y, z);
      if (!started) { ctx.moveTo(screen.x, screen.y); started = true; }
      else ctx.lineTo(screen.x, screen.y);
    }
  }

  draw(level, time, dt, ball) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const field = level?.course18?.field;
    if (!field?.heightAt || !level.centerline) return;
    let cache = this.cache.get(level);
    if (!cache) {
      cache = this.buildDetails(level);
      this.cache.set(level, cache);
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const terrain = level.visual?.terrain || {};
    const flora = level.visual?.flora || 'fern';
    const waterAccent = terrainTint(terrain.waterLight, 'rgba(172,224,210,.10)', .11);
    const sandAccent = terrainTint(terrain.sandLight, 'rgba(246,220,159,.13)', .14);
    const grassAccent = terrainTint(terrain.grassLight, 'rgba(102,143,75,.26)', .28);
    const mossAccent = terrainTint(terrain.mossLight, 'rgba(78,126,66,.30)', .31);

    for (let maskIndex = 0; maskIndex < cache.waterMasks.length; maskIndex += 1) {
      const mask = cache.waterMasks[maskIndex];
      for (let ring = 0; ring < 4; ring += 1) {
        const pulse = this.reducedMotion ? 0 : Math.sin(time * 1.35 + maskIndex * 1.7 + ring) * .012;
        const scale = .34 + ring * .14 + pulse;
        this.pathWorld(ellipseWorldPoints(mask, scale, 30), field, .72);
        ctx.globalAlpha = .74 + ring * .09;
        ctx.strokeStyle = waterAccent;
        ctx.lineWidth = .7 + ring * .14;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (let maskIndex = 0; maskIndex < cache.sandMasks.length; maskIndex += 1) {
      const mask = cache.sandMasks[maskIndex];
      const cos = Math.cos((mask.angle || 0) + .45);
      const sin = Math.sin((mask.angle || 0) + .45);
      for (let line = -3; line <= 3; line += 1) {
        const centerX = mask.x + -sin * line * mask.width * .075;
        const centerY = mask.y + cos * line * mask.width * .075;
        const half = mask.length * (.18 + (3 - Math.abs(line)) * .012);
        const a = { x: centerX - cos * half, y: centerY - sin * half };
        const b = { x: centerX + cos * half, y: centerY + sin * half };
        this.pathWorld([a, b], field, .55);
        ctx.strokeStyle = sandAccent;
        ctx.lineWidth = .75;
        ctx.stroke();
      }
    }

    for (const detail of cache.details) {
      if (ball && Math.hypot(detail.x - ball.x, detail.y - ball.y) < 58) continue;
      const z = field.heightAt(detail.x, detail.y) + .42;
      const point = this.renderer.worldToScreen(detail.x, detail.y, z);
      const sway = this.reducedMotion ? 0 : Math.sin(time * 1.25 + detail.phase) * 1.7;
      const size = detail.size * this.renderer.scale * 7;
      if (size < .7 || point.x < -20 || point.x > this.width + 20 || point.y < -20 || point.y > this.height + 20) continue;
      if (detail.surface === 'water') continue;
      if (detail.surface === 'sand') {
        ctx.strokeStyle = sandAccent;
        ctx.lineWidth = .65;
        ctx.beginPath();
        ctx.moveTo(point.x - size * .8, point.y);
        ctx.lineTo(point.x + size * .8, point.y + detail.lean * .06);
        ctx.stroke();
        continue;
      }
      ctx.strokeStyle = detail.surface === 'moss' ? mossAccent : grassAccent;
      ctx.lineWidth = .65 + detail.size * .18;
      if (flora === 'clover') {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.quadraticCurveTo(point.x + sway * .2, point.y - size * .48, point.x + sway, point.y - size * .72);
        ctx.stroke();
        ctx.fillStyle = detail.surface === 'moss' ? mossAccent : grassAccent;
        const leaf = Math.max(1, size * .22);
        for (const [dx, dy] of [[-leaf * .72, 0], [leaf * .72, 0], [0, -leaf * .62]]) {
          ctx.beginPath();
          ctx.ellipse(point.x + sway + dx, point.y - size * .76 + dy, leaf, leaf * .72, 0, 0, TAU);
          ctx.fill();
        }
      } else if (flora === 'reed') {
        ctx.beginPath();
        ctx.moveTo(point.x - size * .18, point.y);
        ctx.quadraticCurveTo(point.x - size * .12, point.y - size * .62, point.x + sway, point.y - size * 1.24);
        ctx.moveTo(point.x + size * .2, point.y);
        ctx.quadraticCurveTo(point.x + size * .28, point.y - size * .5, point.x + size * .42 + sway * .55, point.y - size * .92);
        ctx.stroke();
      } else if (flora === 'thyme') {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.quadraticCurveTo(point.x + sway * .25, point.y - size * .36, point.x + detail.lean * .35 + sway, point.y - size * .67);
        for (let branch = 1; branch <= 3; branch += 1) {
          const y = point.y - size * (.16 + branch * .12);
          const spread = size * (.22 + branch * .045);
          ctx.moveTo(point.x, y);
          ctx.lineTo(point.x - spread, y - size * .13);
          ctx.moveTo(point.x, y);
          ctx.lineTo(point.x + spread, y - size * .10);
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.quadraticCurveTo(point.x - size * .18, point.y - size * .55, point.x + detail.lean + sway, point.y - size);
        ctx.moveTo(point.x, point.y);
        ctx.quadraticCurveTo(point.x + size * .12, point.y - size * .42, point.x + size * .58 + sway * .5, point.y - size * .76);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
