import { BALL_RADIUS, insideZone } from './physics.js';
import { levelBounds } from './levels.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hashNoise(x, y, seed = 0) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function roundedLine(ctx, ax, ay, bx, by, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}

export class DioramaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.cameraX = 500;
    this.cameraY = 700;
    this.cameraZoom = 1;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.particles = [];
    this.rain = Array.from({ length: 44 }, (_, i) => ({ x: hashNoise(i, 3), y: hashNoise(i, 9), l: .025 + hashNoise(i, 7) * .055, s: .04 + hashNoise(i, 5) * .07 }));
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(480, rect.height || window.innerHeight);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setParallax(x, y) {
    this.targetParallaxX = clamp(x, -1, 1);
    this.targetParallaxY = clamp(y, -1, 1);
  }

  fit(level, ball, dt) {
    const bounds = levelBounds(level);
    const boardW = bounds.maxX - bounds.minX;
    const boardH = bounds.maxY - bounds.minY;
    const baseScale = Math.min((this.width - 34) / boardW, (this.height - 116) / (boardH * .82));
    const speed = Math.hypot(ball.vx, ball.vy);
    const zoomTarget = 1 + Math.min(.065, speed / 23000);
    this.cameraZoom = lerp(this.cameraZoom, zoomTarget, 1 - Math.pow(.001, dt));
    const centerX = (bounds.minX + bounds.maxX) * .5;
    const centerY = (bounds.minY + bounds.maxY) * .5;
    const tracking = Math.min(.08, speed / 11000);
    this.cameraX = lerp(this.cameraX, centerX * (1 - tracking) + ball.x * tracking, 1 - Math.pow(.002, dt));
    this.cameraY = lerp(this.cameraY, centerY * (1 - tracking) + ball.y * tracking, 1 - Math.pow(.002, dt));
    this.scale = baseScale * this.cameraZoom;
    this.offsetX = this.width * .5 - this.cameraX * this.scale;
    this.offsetY = 76 + (this.height - 92) * .5 - this.cameraY * this.scale * .82;
    this.parallaxX = lerp(this.parallaxX, this.targetParallaxX, 1 - Math.pow(.03, dt));
    this.parallaxY = lerp(this.parallaxY, this.targetParallaxY, 1 - Math.pow(.03, dt));
  }

  worldToScreen(x, y, z = 0) {
    return {
      x: this.offsetX + x * this.scale + this.parallaxX * z * this.scale * .16,
      y: this.offsetY + y * this.scale * .82 - z * this.scale + this.parallaxY * z * this.scale * .11
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / (this.scale * .82)
    };
  }

  emit(x, y, type, amount = 8) {
    for (let i = 0; i < amount; i += 1) {
      const a = Math.random() * TAU;
      const speed = 20 + Math.random() * 80;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .5 + Math.random() * .55, maxLife: 1, type, size: 2 + Math.random() * 5 });
    }
  }

  drawBackground(time, mode) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#4e675a');
    grad.addColorStop(.46, '#2f493a');
    grad.addColorStop(1, '#17271d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.globalAlpha = mode === 'menu' ? .25 : .14;
    ctx.strokeStyle = '#cfd9bf';
    ctx.lineWidth = 1;
    for (let x = -this.height; x < this.width + this.height; x += 92) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + this.height * .52, this.height); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = .09;
    for (const drop of this.rain) {
      const y = ((drop.y + time * drop.s * .04) % 1) * this.height;
      const x = drop.x * this.width + this.parallaxX * 7;
      ctx.strokeStyle = '#e8f3dc';
      ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + this.height * drop.l); ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(this.width * .68, this.height * .12, 0, this.width * .68, this.height * .12, this.width * .7);
    glow.addColorStop(0, 'rgba(245,232,164,.2)');
    glow.addColorStop(1, 'rgba(245,232,164,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  pathPolygon(points, z = 0) {
    const ctx = this.ctx;
    points.forEach((p, i) => {
      const s = this.worldToScreen(p.x, p.y, z);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  drawBoard(level, time) {
    const ctx = this.ctx;
    for (let z = -22; z <= 0; z += 4) {
      const depth = (z + 22) / 22;
      ctx.beginPath();
      this.pathPolygon(level.outline, z);
      ctx.fillStyle = `rgb(${Math.round(43 + depth * 27)}, ${Math.round(55 + depth * 38)}, ${Math.round(40 + depth * 24)})`;
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    this.pathPolygon(level.outline, 0);
    ctx.clip();
    const top = ctx.createLinearGradient(0, this.offsetY, 0, this.height);
    top.addColorStop(0, '#829466');
    top.addColorStop(.58, '#667c52');
    top.addColorStop(1, '#536a46');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalAlpha = .17;
    ctx.fillStyle = '#e4e2bd';
    const bounds = levelBounds(level);
    for (let y = bounds.minY; y < bounds.maxY; y += 42) {
      for (let x = bounds.minX; x < bounds.maxX; x += 42) {
        if (hashNoise(x, y, level.id) < .72) continue;
        const p = this.worldToScreen(x + hashNoise(x, y, 3) * 21, y + hashNoise(x, y, 6) * 18, .5);
        ctx.beginPath(); ctx.arc(p.x, p.y, .65 + hashNoise(x, y, 8) * 1.3, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath(); this.pathPolygon(level.outline, 1);
    ctx.strokeStyle = 'rgba(224,224,184,.34)';
    ctx.lineWidth = Math.max(1, this.scale * 7);
    ctx.stroke();
    ctx.restore();
  }

  zoneRect(zone, z = .5) {
    const p = this.worldToScreen(zone.x, zone.y, z);
    return { x: p.x, y: p.y, w: zone.w * this.scale, h: zone.h * this.scale * .82 };
  }

  drawZones(level, time) {
    const ctx = this.ctx;
    for (const zone of level.zones || []) {
      const r = this.zoneRect(zone);
      if (zone.type === 'water') {
        const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        grad.addColorStop(0, 'rgba(87,135,129,.86)');
        grad.addColorStop(1, 'rgba(37,82,79,.88)');
        ctx.fillStyle = grad;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save(); ctx.globalAlpha = .28; ctx.strokeStyle = '#d1dfcf'; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i += 1) {
          const y = r.y + ((i / 6 + time * .035) % 1) * r.h;
          ctx.beginPath();
          for (let x = r.x; x <= r.x + r.w; x += 9) {
            const wave = Math.sin(x * .04 + time * 2 + i) * 2;
            if (x === r.x) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
          }
          ctx.stroke();
        }
        ctx.restore();
      } else if (zone.type === 'bridge') {
        ctx.fillStyle = 'rgba(205,219,204,.36)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(233,244,235,.45)';
        ctx.lineWidth = 1;
        for (let y = r.y + 6; y < r.y + r.h; y += 14) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); }
      } else if (zone.type === 'sand') {
        ctx.fillStyle = 'rgba(206,190,129,.72)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(92,84,52,.25)';
        for (let i = 0; i < 38; i += 1) {
          const x = r.x + hashNoise(i, zone.x, 2) * r.w;
          const y = r.y + hashNoise(i, zone.y, 7) * r.h;
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (zone.type === 'moss') {
        ctx.fillStyle = 'rgba(44,75,46,.52)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(193,211,143,.18)';
        for (let x = r.x; x < r.x + r.w; x += 7) {
          const h = 3 + hashNoise(x, zone.y) * 6;
          ctx.beginPath(); ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + 1, r.y + r.h - h); ctx.stroke();
        }
      } else if (zone.type === 'slope') {
        ctx.fillStyle = 'rgba(176,168,116,.22)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const angle = Math.atan2(zone.forceY || 0, zone.forceX || 0);
        ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(angle); ctx.strokeStyle = 'rgba(55,70,50,.3)'; ctx.lineWidth = 1.5;
        for (let y = -r.h / 3; y <= r.h / 3; y += 12) { ctx.beginPath(); ctx.moveTo(-r.w * .33, y); ctx.lineTo(r.w * .33, y); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  drawHole(level, time) {
    const ctx = this.ctx;
    const p = this.worldToScreen(level.hole.x, level.hole.y, 1);
    const rx = level.hole.r * this.scale;
    const ry = rx * .55;
    ctx.save();
    ctx.fillStyle = 'rgba(21,29,22,.4)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 5, rx * 1.25, ry * 1.25, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#15201a';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); ctx.fill();
    const mastTop = this.worldToScreen(level.hole.x, level.hole.y, 120);
    roundedLine(ctx, p.x + 1, p.y, mastTop.x + 1, mastTop.y, Math.max(1.5, this.scale * 5), '#8f6b33');
    const flap = Math.sin(time * 1.4) * 3;
    ctx.fillStyle = '#e4ddbd';
    ctx.beginPath();
    ctx.moveTo(mastTop.x, mastTop.y + 3);
    ctx.lineTo(mastTop.x + 44 * this.scale + flap, mastTop.y + 12 * this.scale);
    ctx.lineTo(mastTop.x, mastTop.y + 28 * this.scale);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawCircleObstacle(obstacle) {
    const ctx = this.ctx;
    const p = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const r = obstacle.r * this.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(15,25,18,.25)';
    ctx.beginPath(); ctx.ellipse(p.x + r * .12, p.y + r * .43, r * 1.02, r * .56, 0, 0, TAU); ctx.fill();

    if (obstacle.material === 'cup') {
      const grad = ctx.createRadialGradient(p.x - r * .35, p.y - r * .35, r * .1, p.x, p.y, r * 1.1);
      grad.addColorStop(0, '#eee9d8'); grad.addColorStop(.7, '#a9b5a6'); grad.addColorStop(1, '#6d8174');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#445a4d'; ctx.beginPath(); ctx.arc(p.x, p.y, r * .72, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#cfd4c6'; ctx.lineWidth = Math.max(2, r * .12); ctx.beginPath(); ctx.arc(p.x + r * .82, p.y, r * .48, -1.1, 1.1); ctx.stroke();
    } else if (obstacle.material === 'pot') {
      const grad = ctx.createLinearGradient(p.x - r, p.y, p.x + r, p.y);
      grad.addColorStop(0, '#704832'); grad.addColorStop(.5, '#bd8056'); grad.addColorStop(1, '#68402f');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,190,.28)'; ctx.lineWidth = Math.max(1, r * .06); ctx.beginPath(); ctx.arc(p.x, p.y, r * .8, 0, TAU); ctx.stroke();
    } else if (obstacle.material === 'sugar') {
      ctx.fillStyle = '#ded3b3'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(102,92,62,.28)';
      for (let i = 0; i < 24; i += 1) { const a = hashNoise(i, obstacle.x) * TAU; const rr = Math.sqrt(hashNoise(i, obstacle.y)) * r * .8; ctx.fillRect(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 1.4, 1.4); }
    } else if (obstacle.material === 'spoon') {
      ctx.fillStyle = '#b9b7a7'; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * .62, -.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d7d3bf'; ctx.lineWidth = Math.max(2, r * .08); ctx.stroke();
    } else {
      const grad = ctx.createRadialGradient(p.x - r * .4, p.y - r * .45, r * .1, p.x, p.y, r);
      grad.addColorStop(0, obstacle.material === 'wood' ? '#a17d4f' : '#a8aa8f');
      grad.addColorStop(1, obstacle.material === 'wood' ? '#604a33' : '#5a6859');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawWall(wall, time, rotor = false) {
    let ax = wall.ax, ay = wall.ay, bx = wall.bx, by = wall.by;
    if (rotor) {
      const angle = wall.angle + time * wall.speed;
      const hx = Math.cos(angle) * wall.length * .5;
      const hy = Math.sin(angle) * wall.length * .5;
      ax = wall.x - hx; ay = wall.y - hy; bx = wall.x + hx; by = wall.y + hy;
    }
    const a0 = this.worldToScreen(ax, ay, 0);
    const b0 = this.worldToScreen(bx, by, 0);
    const a1 = this.worldToScreen(ax, ay, wall.material === 'glass' ? 28 : 18);
    const b1 = this.worldToScreen(bx, by, wall.material === 'glass' ? 28 : 18);
    const width = wall.thickness * this.scale;
    roundedLine(this.ctx, a0.x, a0.y + width * .18, b0.x, b0.y + width * .18, width * 1.05, 'rgba(20,28,22,.25)');
    roundedLine(this.ctx, a0.x, a0.y, b0.x, b0.y, width, wall.material === 'glass' ? 'rgba(199,225,214,.42)' : wall.material === 'brass' ? '#9b7031' : '#725437');
    roundedLine(this.ctx, a1.x, a1.y, b1.x, b1.y, width * .7, wall.material === 'glass' ? 'rgba(225,246,237,.64)' : wall.material === 'brass' ? '#c1984f' : '#a37a4d');
  }

  drawTunnel(tunnel, time) {
    const ctx = this.ctx;
    for (const [node, exit] of [[tunnel.entry, false], [tunnel.exit, true]]) {
      const p = this.worldToScreen(node.x, node.y, 2);
      const r = node.r * this.scale;
      ctx.save();
      ctx.strokeStyle = exit ? '#b9a163' : '#596c59';
      ctx.lineWidth = Math.max(3, r * .2);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * .56, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(233,227,188,${.2 + Math.sin(time * 2) * .08})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * .72, r * .38, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  drawDecoration(item, time) {
    const ctx = this.ctx;
    const p = this.worldToScreen(item.x, item.y, 4);
    const s = this.scale;
    ctx.save();
    if (item.type === 'leaf') {
      ctx.translate(p.x, p.y); ctx.rotate(-.5); ctx.fillStyle = '#3d5c3f';
      ctx.beginPath(); ctx.ellipse(0, 0, 34 * s, 13 * s, 0, 0, TAU); ctx.fill();
      roundedLine(ctx, -28*s, 0, 28*s, 0, Math.max(1, 2*s), '#a5b178');
    } else if (item.type === 'mushroom') {
      roundedLine(ctx, p.x, p.y, p.x, p.y - 27*s, 8*s, '#d6caa7');
      ctx.fillStyle = '#a46a4d'; ctx.beginPath(); ctx.arc(p.x, p.y - 28*s, 18*s, Math.PI, TAU); ctx.fill();
    } else if (item.type === 'snail') {
      const sway = Math.sin(time * .7 + item.x) * 2 * s;
      ctx.fillStyle = '#80905b'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 28*s, 8*s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b18a5b'; ctx.beginPath(); ctx.arc(p.x - 7*s, p.y - 7*s, 14*s, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6d543b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x - 7*s, p.y - 7*s, 8*s, 0, TAU); ctx.stroke();
      roundedLine(ctx, p.x + 18*s, p.y - 3*s, p.x + 25*s + sway, p.y - 17*s, 1, '#80905b');
    } else if (item.type === 'frog') {
      ctx.fillStyle = '#486442'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 22*s, 15*s, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - 9*s, p.y - 11*s, 6*s, 0, TAU); ctx.arc(p.x + 9*s, p.y - 11*s, 6*s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9d9b4'; ctx.beginPath(); ctx.arc(p.x - 9*s, p.y - 12*s, 2*s, 0, TAU); ctx.arc(p.x + 9*s, p.y - 12*s, 2*s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawFireflies(level, time) {
    if (!level.fireflies) return;
    const ctx = this.ctx;
    for (let i = 0; i < level.fireflies; i += 1) {
      const angle = time * (.3 + hashNoise(i, 2) * .4) + i;
      const x = 500 + Math.cos(angle) * (180 + hashNoise(i, 4) * 260);
      const y = 650 + Math.sin(angle * .77) * (330 + hashNoise(i, 8) * 260);
      const p = this.worldToScreen(x, y, 18 + hashNoise(i, 10) * 70);
      const alpha = .25 + (Math.sin(time * 2 + i) + 1) * .25;
      ctx.fillStyle = `rgba(238,222,109,${alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + this.scale * 2, 0, TAU); ctx.fill();
    }
  }

  drawAim(ball, aim) {
    if (!aim.active) return;
    const ctx = this.ctx;
    const b = this.worldToScreen(ball.x, ball.y, 24);
    const power = clamp(Math.hypot(aim.vx, aim.vy) / 1750, 0, 1);
    const angle = Math.atan2(aim.vy, aim.vx);
    const length = (70 + power * 130) * this.scale;
    const ex = b.x + Math.cos(angle) * length;
    const ey = b.y + Math.sin(angle) * length * .82;
    ctx.save();
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = Math.max(1.5, this.scale * 3);
    ctx.strokeStyle = `rgba(239,235,209,${.45 + power * .4})`;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#eee8cf';
    ctx.beginPath(); ctx.arc(ex, ey, 3 + power * 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawBall(ball, time) {
    if (ball.sink >= 1) return;
    const ctx = this.ctx;
    const height = ball.sunk ? 24 * (1 - ball.sink) : 24;
    const p = this.worldToScreen(ball.x, ball.y, height);
    const r = BALL_RADIUS * this.scale * (ball.sunk ? 1 - ball.sink * .82 : 1);
    ctx.save();
    ctx.globalAlpha = ball.sunk ? 1 - ball.sink : 1;
    const shadow = this.worldToScreen(ball.x, ball.y, 0);
    ctx.fillStyle = `rgba(18,29,21,${.22 * (1 - ball.sink)})`;
    ctx.beginPath(); ctx.ellipse(shadow.x + 4, shadow.y + 7, r * .98, r * .45, 0, 0, TAU); ctx.fill();
    const grad = ctx.createRadialGradient(p.x - r * .38, p.y - r * .46, r * .08, p.x, p.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(.24, '#ebe9d6');
    grad.addColorStop(.72, '#bdc9bc');
    grad.addColorStop(1, '#617265');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.58)'; ctx.lineWidth = Math.max(1, r * .07); ctx.beginPath(); ctx.arc(p.x, p.y, r * .82, -2.6, -1.3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(p.x - r * .32, p.y - r * .36, r * .13, 0, TAU); ctx.fill();
    ctx.restore();
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.95, dt * 60);
      p.vy *= Math.pow(.95, dt * 60);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const s = this.worldToScreen(p.x, p.y, 22);
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.type === 'cup' ? `rgba(234,218,108,${alpha})` : p.type === 'water' ? `rgba(203,230,221,${alpha})` : `rgba(229,225,196,${alpha})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, p.size * this.scale, 0, TAU); ctx.fill();
    }
  }

  draw(level, ball, aim, time, dt, mode = 'playing') {
    this.fit(level, ball, dt);
    this.updateParticles(dt);
    this.drawBackground(time, mode);
    this.drawBoard(level, time);
    this.drawZones(level, time);
    this.drawHole(level, time);
    for (const tunnel of level.tunnels || []) this.drawTunnel(tunnel, time);
    for (const obstacle of level.obstacles || []) this.drawCircleObstacle(obstacle);
    for (const wall of level.walls || []) this.drawWall(wall, time, false);
    for (const rotor of level.rotors || []) this.drawWall(rotor, time, true);
    for (const item of level.decorations || []) this.drawDecoration(item, time);
    this.drawFireflies(level, time);
    this.drawAim(ball, aim);
    this.drawBall(ball, time);
    this.drawParticles();
  }

  ballScreenPoint(ball) {
    return this.worldToScreen(ball.x, ball.y, 24);
  }
}
