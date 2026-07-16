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

function capsuleWorldPoints(mask, scale, count = 18) {
  const dx = mask.b.x - mask.a.x;
  const dy = mask.b.y - mask.a.y;
  const axis = Math.atan2(dy, dx);
  const radius = mask.width * .5 * scale;
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = axis + Math.PI * .5 + index / count * Math.PI;
    points.push({ x: mask.a.x + Math.cos(angle) * radius, y: mask.a.y + Math.sin(angle) * radius });
  }
  for (let index = 0; index <= count; index += 1) {
    const angle = axis - Math.PI * .5 + index / count * Math.PI;
    points.push({ x: mask.b.x + Math.cos(angle) * radius, y: mask.b.y + Math.sin(angle) * radius });
  }
  points.push(points[0]);
  return points;
}

function maskWorldPoints(mask, scale, count = 34) {
  return mask.a && mask.b
    ? capsuleWorldPoints(mask, scale, Math.max(8, Math.floor(count * .5)))
    : ellipseWorldPoints(mask, scale, count);
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
    const waterMasks = (field.masks || []).filter((mask) => mask.type === 'water');
    const sandMasks = (field.masks || []).filter((mask) => mask.type === 'sand');
    const mossMasks = (field.masks || []).filter((mask) => mask.type === 'moss');
    const landmarks = [.18, .55, .84].map((t, index) => {
      const sample = routeSample(level.centerline, t);
      const side = index % 2 ? 1 : -1;
      const offset = 150 + hashNoise(index, seed, 43) * 52;
      return {
        x: sample.x + sample.nx * side * offset,
        y: sample.y + sample.ny * side * offset,
        size: 28 + hashNoise(index, seed, 47) * 14,
        phase: hashNoise(index, seed, 53) * TAU
      };
    });
    return { details, waterMasks, sandMasks, mossMasks, landmarks };
  }

  drawLandmark(ctx, landmark, motif, accent, field, time) {
    const z = field.heightAt(landmark.x, landmark.y) + .58;
    const point = this.renderer.worldToScreen(landmark.x, landmark.y, z);
    const size = clamp(landmark.size * this.renderer.scale, 7, 22);
    if (point.x < -size * 2 || point.x > this.width + size * 2 || point.y < -size * 2 || point.y > this.height + size * 2) return;
    const pulse = this.reducedMotion ? .5 : .5 + Math.sin(time * .9 + landmark.phase) * .5;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = clamp(size * .075, .75, 1.4);
    ctx.strokeStyle = `rgba(${accent},${.34 + pulse * .16})`;
    ctx.fillStyle = `rgba(${accent},${.07 + pulse * .035})`;

    if (motif === 'cup') {
      ctx.beginPath(); ctx.ellipse(0, size * .30, size * .66, size * .18, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size * .42, -size * .18); ctx.quadraticCurveTo(-size * .34, size * .23, 0, size * .24); ctx.quadraticCurveTo(size * .34, size * .23, size * .42, -size * .18); ctx.stroke();
      ctx.beginPath(); ctx.arc(size * .44, 0, size * .23, -Math.PI * .56, Math.PI * .56); ctx.stroke();
    } else if (motif === 'fern' || motif === 'leaf') {
      ctx.beginPath(); ctx.moveTo(-size * .38, size * .48); ctx.quadraticCurveTo(-size * .08, 0, size * .34, -size * .50); ctx.stroke();
      for (let index = 1; index <= 5; index += 1) {
        const t = index / 6;
        const x = lerp(-size * .30, size * .27, t);
        const y = lerp(size * .36, -size * .40, t);
        const spread = size * (.25 - t * .11);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - spread, y - size * .13); ctx.moveTo(x, y); ctx.lineTo(x + spread, y + size * .13); ctx.stroke();
      }
    } else if (motif === 'dial') {
      ctx.beginPath(); ctx.arc(0, 0, size * .48, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, size * .33, 0, TAU); ctx.stroke();
      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * size * .38, Math.sin(angle) * size * .38); ctx.lineTo(Math.cos(angle) * size * .47, Math.sin(angle) * size * .47); ctx.stroke();
      }
      const angle = landmark.phase + (this.reducedMotion ? 0 : time * .18);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * size * .28, Math.sin(angle) * size * .28); ctx.stroke();
    } else if (motif === 'spoon') {
      ctx.save(); ctx.rotate(-.42);
      ctx.beginPath(); ctx.ellipse(0, -size * .24, size * .24, size * .34, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, size * .08); ctx.lineTo(0, size * .66); ctx.stroke();
      ctx.restore();
    } else if (motif === 'pane') {
      ctx.save(); ctx.rotate(-.12);
      ctx.strokeRect(-size * .42, -size * .52, size * .84, size * 1.04);
      ctx.fillRect(-size * .34, -size * .43, size * .10, size * .72);
      ctx.beginPath(); ctx.moveTo(-size * .42, size * .14); ctx.lineTo(size * .42, -size * .16); ctx.stroke();
      ctx.restore();
    } else if (motif === 'lantern') {
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * .9);
      glow.addColorStop(0, `rgba(${accent},${.16 + pulse * .12})`); glow.addColorStop(1, `rgba(${accent},0)`);
      ctx.fillStyle = glow; ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.strokeStyle = `rgba(${accent},${.42 + pulse * .18})`;
      ctx.beginPath(); ctx.moveTo(-size * .18, -size * .45); ctx.quadraticCurveTo(0, -size * .68, size * .18, -size * .45); ctx.stroke();
      ctx.strokeRect(-size * .31, -size * .42, size * .62, size * .84);
      ctx.fillStyle = `rgba(${accent},${.58 + pulse * .30})`; ctx.beginPath(); ctx.arc(0, size * .06, size * .075, 0, TAU); ctx.fill();
    } else {
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.beginPath(); ctx.ellipse(0, size * .30, size * (.28 + ring * .16), size * (.07 + ring * .025), 0, 0, TAU); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, -size * .56); ctx.bezierCurveTo(size * .34, -size * .14, size * .26, size * .12, 0, size * .24); ctx.bezierCurveTo(-size * .26, size * .12, -size * .34, -size * .14, 0, -size * .56); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
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
    const motif = level.visual?.motif || 'drop';
    const motifAccent = level.visual?.accent || '205,224,180';

    const routeOutline = level.course18?.surfaceMesh?.outline || level.outline || [];
    if (routeOutline.length > 2) {
      this.pathWorld([...routeOutline, routeOutline[0]], field, .86);
      ctx.strokeStyle = 'rgba(3,13,8,.62)';
      ctx.lineWidth = 4.2;
      ctx.stroke();
      this.pathWorld([...routeOutline, routeOutline[0]], field, 1.02);
      ctx.strokeStyle = terrainTint(terrain.grassLight, 'rgba(202,218,164,.42)', .46);
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }

    for (let maskIndex = 0; maskIndex < cache.waterMasks.length; maskIndex += 1) {
      const mask = cache.waterMasks[maskIndex];
      for (let ring = 0; ring < 4; ring += 1) {
        const pulse = this.reducedMotion ? 0 : Math.sin(time * 1.35 + maskIndex * 1.7 + ring) * .012;
        const scale = .34 + ring * .14 + pulse;
        this.pathWorld(maskWorldPoints(mask, scale, 30), field, .72);
        ctx.globalAlpha = .74 + ring * .09;
        ctx.strokeStyle = waterAccent;
        ctx.lineWidth = .7 + ring * .14;
        ctx.stroke();
      }
      this.pathWorld(maskWorldPoints(mask, .91, 38), field, .78);
      ctx.setLineDash([5, 8]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : -time * 5;
      ctx.strokeStyle = terrainTint(terrain.waterLight, 'rgba(176,226,214,.28)', .30);
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (let maskIndex = 0; maskIndex < cache.sandMasks.length; maskIndex += 1) {
      const mask = cache.sandMasks[maskIndex];
      this.pathWorld(maskWorldPoints(mask, .90, 38), field, .61);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = terrainTint(terrain.sandLight, 'rgba(246,220,159,.30)', .34);
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.setLineDash([]);
      if (!Number.isFinite(mask.x)) continue;
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

    for (let maskIndex = 0; maskIndex < cache.mossMasks.length; maskIndex += 1) {
      const mask = cache.mossMasks[maskIndex];
      for (let contour = 0; contour < 3; contour += 1) {
        this.pathWorld(maskWorldPoints(mask, .44 + contour * .21, 34), field, .66);
        ctx.setLineDash(contour === 2 ? [1.5, 5.5] : [3, 7]);
        ctx.lineDashOffset = this.reducedMotion ? contour * 2 : time * (contour % 2 ? 1.2 : -.8);
        ctx.strokeStyle = terrainTint(terrain.mossLight, 'rgba(117,166,96,.28)', .30 + contour * .035);
        ctx.lineWidth = contour === 2 ? 1.25 : .8;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    for (const landmark of cache.landmarks) this.drawLandmark(ctx, landmark, motif, motifAccent, field, time);

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
