import { BALL_RADIUS } from './physics.js';
import { levelBounds } from './levels.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function hashNoise(x, y, seed = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function roundedLine(ctx, ax, ay, bx, by, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function textureCanvas(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  return canvas;
}

export class DioramaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
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
    this.rain = Array.from({ length: 58 }, (_, index) => ({
      x: hashNoise(index, 3),
      y: hashNoise(index, 9),
      length: .018 + hashNoise(index, 7) * .06,
      speed: .035 + hashNoise(index, 5) * .075,
      alpha: .08 + hashNoise(index, 13) * .14
    }));
    this.plants = Array.from({ length: 18 }, (_, index) => ({
      x: hashNoise(index, 21),
      y: hashNoise(index, 29),
      radius: .04 + hashNoise(index, 31) * .11,
      sway: hashNoise(index, 37) * TAU
    }));
    this.textures = this.createTextures();
    this.resize();
  }

  createTextures() {
    const grass = textureCanvas(96, (ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      for (let index = 0; index < 250; index += 1) {
        const x = hashNoise(index, 2) * size;
        const y = hashNoise(index, 5) * size;
        const length = 1.5 + hashNoise(index, 8) * 4;
        ctx.strokeStyle = hashNoise(index, 11) > .55
          ? 'rgba(221,224,161,.16)'
          : 'rgba(19,48,29,.18)';
        ctx.lineWidth = .45 + hashNoise(index, 14) * .65;
        ctx.beginPath();
        ctx.moveTo(x, y + length * .35);
        ctx.lineTo(x + (hashNoise(index, 17) - .5) * 2.2, y - length);
        ctx.stroke();
      }
    });

    const moss = textureCanvas(72, (ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      for (let index = 0; index < 90; index += 1) {
        const x = hashNoise(index, 41) * size;
        const y = hashNoise(index, 43) * size;
        const radius = 1 + hashNoise(index, 47) * 3.5;
        ctx.fillStyle = hashNoise(index, 49) > .52
          ? 'rgba(176,190,104,.22)'
          : 'rgba(17,58,34,.28)';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
      }
    });

    const sand = textureCanvas(64, (ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      for (let index = 0; index < 160; index += 1) {
        ctx.fillStyle = hashNoise(index, 58) > .54
          ? 'rgba(255,239,177,.25)'
          : 'rgba(86,70,38,.18)';
        const grain = .5 + hashNoise(index, 61) * 1.1;
        ctx.fillRect(hashNoise(index, 64) * size, hashNoise(index, 67) * size, grain, grain);
      }
    });

    const grain = textureCanvas(80, (ctx, size) => {
      const image = ctx.createImageData(size, size);
      for (let index = 0; index < image.data.length; index += 4) {
        const value = Math.floor(hashNoise(index, 71) * 255);
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = Math.floor(hashNoise(index, 73) * 18);
      }
      ctx.putImageData(image, 0, 0);
    });

    return {
      grass: this.ctx.createPattern(grass, 'repeat'),
      moss: this.ctx.createPattern(moss, 'repeat'),
      sand: this.ctx.createPattern(sand, 'repeat'),
      grain: this.ctx.createPattern(grain, 'repeat')
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width || window.innerWidth);
    this.height = Math.max(480, rect.height || window.innerHeight);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.textures = this.createTextures();
  }

  setParallax(x, y) {
    this.targetParallaxX = clamp(x, -1, 1);
    this.targetParallaxY = clamp(y, -1, 1);
  }

  fit(level, ball, dt) {
    const bounds = levelBounds(level);
    const boardWidth = bounds.maxX - bounds.minX;
    const boardHeight = bounds.maxY - bounds.minY;
    const baseScale = Math.min(
      (this.width - 46) / boardWidth,
      (this.height - 136) / (boardHeight * .82)
    );
    const speed = Math.hypot(ball.vx, ball.vy);
    const zoomTarget = 1 + Math.min(.055, speed / 25000);
    this.cameraZoom = lerp(this.cameraZoom, zoomTarget, 1 - Math.pow(.001, dt));

    const centerX = (bounds.minX + bounds.maxX) * .5;
    const centerY = (bounds.minY + bounds.maxY) * .5;
    const tracking = Math.min(.075, speed / 12000);
    this.cameraX = lerp(this.cameraX, centerX * (1 - tracking) + ball.x * tracking, 1 - Math.pow(.002, dt));
    this.cameraY = lerp(this.cameraY, centerY * (1 - tracking) + ball.y * tracking, 1 - Math.pow(.002, dt));
    this.scale = baseScale * this.cameraZoom;
    this.offsetX = this.width * .5 - this.cameraX * this.scale;
    this.offsetY = 82 + (this.height - 116) * .5 - this.cameraY * this.scale * .82;
    this.parallaxX = lerp(this.parallaxX, this.targetParallaxX, 1 - Math.pow(.035, dt));
    this.parallaxY = lerp(this.parallaxY, this.targetParallaxY, 1 - Math.pow(.035, dt));
  }

  worldToScreen(x, y, z = 0) {
    return {
      x: this.offsetX + x * this.scale + this.parallaxX * z * this.scale * .14,
      y: this.offsetY + y * this.scale * .82 - z * this.scale + this.parallaxY * z * this.scale * .09
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / (this.scale * .82)
    };
  }

  emit(x, y, type, amount = 8) {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * TAU;
      const speed = 20 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: .5 + Math.random() * .55,
        maxLife: 1,
        type,
        size: 2 + Math.random() * 5
      });
    }
  }

  drawBackground(time, mode) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#30463b');
    gradient.addColorStop(.48, '#1e3329');
    gradient.addColorStop(1, '#101d17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const horizon = this.height * .54;
    const paneWidth = Math.max(88, this.width / 4.2);
    ctx.save();
    ctx.globalAlpha = mode === 'menu' ? .34 : .22;
    ctx.fillStyle = 'rgba(173,202,184,.045)';
    for (let x = -paneWidth + this.parallaxX * 10; x < this.width + paneWidth; x += paneWidth) {
      ctx.fillRect(x + 5, 0, paneWidth - 10, horizon);
    }
    ctx.strokeStyle = 'rgba(13,26,20,.74)';
    ctx.lineWidth = 9;
    for (let x = -paneWidth + this.parallaxX * 10; x < this.width + paneWidth; x += paneWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + this.parallaxX * 3, horizon + 12);
      ctx.stroke();
    }
    ctx.lineWidth = 7;
    for (let y = 0; y <= horizon; y += Math.max(102, horizon / 3.2)) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y + this.parallaxY * 3);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = .16;
    for (const plant of this.plants) {
      const x = plant.x * this.width + this.parallaxX * plant.radius * 80;
      const y = this.height * (.18 + plant.y * .48);
      const radius = plant.radius * this.width;
      ctx.fillStyle = hashNoise(plant.x, plant.y) > .5 ? '#92ab7c' : '#5e7b63';
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.25, radius * .5, plant.sway + Math.sin(time * .2 + plant.sway) * .05, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(this.width * .7, this.height * .06, 0, this.width * .7, this.height * .06, this.width * .8);
    glow.addColorStop(0, 'rgba(244,228,155,.26)');
    glow.addColorStop(.36, 'rgba(195,214,164,.075)');
    glow.addColorStop(1, 'rgba(195,214,164,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    for (const drop of this.rain) {
      const y = ((drop.y + time * drop.speed * .035) % 1) * this.height * .61;
      const x = drop.x * this.width + this.parallaxX * 8;
      ctx.strokeStyle = `rgba(224,238,226,${drop.alpha})`;
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + this.height * drop.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  pathPolygon(points, z = 0) {
    points.forEach((point, index) => {
      const screen = this.worldToScreen(point.x, point.y, z);
      if (index === 0) this.ctx.moveTo(screen.x, screen.y);
      else this.ctx.lineTo(screen.x, screen.y);
    });
    this.ctx.closePath();
  }

  drawBoard(level) {
    const ctx = this.ctx;

    ctx.save();
    ctx.shadowColor = 'rgba(3,12,7,.52)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 18;
    ctx.beginPath();
    this.pathPolygon(level.outline, -30);
    ctx.fillStyle = '#111d15';
    ctx.fill();
    ctx.restore();

    for (let z = -32; z <= 0; z += 4) {
      const depth = (z + 32) / 32;
      ctx.beginPath();
      this.pathPolygon(level.outline, z);
      ctx.fillStyle = `rgb(${Math.round(24 + depth * 27)},${Math.round(31 + depth * 39)},${Math.round(24 + depth * 23)})`;
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    this.pathPolygon(level.outline, 0);
    ctx.clip();
    const surface = ctx.createLinearGradient(0, this.offsetY, this.width, this.height);
    surface.addColorStop(0, '#809165');
    surface.addColorStop(.42, '#687f55');
    surface.addColorStop(1, '#4f6945');
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = .72;
    ctx.fillStyle = this.textures.grass;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    this.pathPolygon(level.outline, 1.3);
    ctx.strokeStyle = 'rgba(12,28,18,.52)';
    ctx.lineWidth = Math.max(4, this.scale * 13);
    ctx.stroke();
    ctx.restore();
  }

  drawCurb(level) {
    const ctx = this.ctx;
    const points = level.outline;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.ceil(length / 68));
      for (let step = 0; step < count; step += 1) {
        const t0 = step / count;
        const t1 = (step + 1) / count;
        const mid = (t0 + t1) * .5;
        const ax = lerp(a.x, b.x, t0);
        const ay = lerp(a.y, b.y, t0);
        const bx = lerp(a.x, b.x, t1);
        const by = lerp(a.y, b.y, t1);
        const mx = lerp(a.x, b.x, mid);
        const my = lerp(a.y, b.y, mid);
        const baseA = this.worldToScreen(ax, ay, 0);
        const baseB = this.worldToScreen(bx, by, 0);
        const topA = this.worldToScreen(ax, ay, 11);
        const topB = this.worldToScreen(bx, by, 11);
        const width = Math.hypot(baseB.x - baseA.x, baseB.y - baseA.y) * .94;
        const thickness = Math.max(5, this.scale * 14);
        const angle = Math.atan2(baseB.y - baseA.y, baseB.x - baseA.x);
        const baseMid = this.worldToScreen(mx, my, 0);
        const topMid = this.worldToScreen(mx, my, 11);
        const noise = hashNoise(index, step, 101);

        ctx.save();
        ctx.translate(baseMid.x, baseMid.y);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(5,14,9,.48)';
        roundedRectPath(ctx, -width / 2 + 2, -thickness / 2 + thickness * .55, width, thickness * .7, thickness * .25);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(baseA.x, baseA.y - thickness * .28);
        ctx.lineTo(baseB.x, baseB.y - thickness * .28);
        ctx.lineTo(topB.x, topB.y + thickness * .25);
        ctx.lineTo(topA.x, topA.y + thickness * .25);
        ctx.closePath();
        const side = ctx.createLinearGradient(0, topMid.y, 0, baseMid.y);
        side.addColorStop(0, noise > .55 ? '#858672' : '#777966');
        side.addColorStop(1, '#4d594d');
        ctx.fillStyle = side;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(topMid.x, topMid.y);
        ctx.rotate(angle);
        const top = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
        top.addColorStop(0, noise > .55 ? '#b7ae90' : '#a29f83');
        top.addColorStop(1, noise > .55 ? '#8e9077' : '#7d806a');
        ctx.fillStyle = top;
        roundedRectPath(ctx, -width / 2, -thickness / 2, width, thickness, thickness * .28);
        ctx.fill();
        ctx.strokeStyle = 'rgba(238,229,193,.22)';
        ctx.lineWidth = Math.max(.65, this.scale);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  zoneRect(zone, z = .5) {
    const point = this.worldToScreen(zone.x, zone.y, z);
    return {
      x: point.x,
      y: point.y,
      width: zone.w * this.scale,
      height: zone.h * this.scale * .82
    };
  }

  drawZones(level, time) {
    const ctx = this.ctx;
    for (const zone of level.zones || []) {
      const rect = this.zoneRect(zone);
      ctx.save();
      roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, Math.max(2, this.scale * 12));
      ctx.clip();

      if (zone.type === 'water') {
        const water = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
        water.addColorStop(0, '#78968f');
        water.addColorStop(.52, '#416f69');
        water.addColorStop(1, '#244b4a');
        ctx.fillStyle = water;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = .25;
        ctx.strokeStyle = '#d8e4d9';
        ctx.lineWidth = 1;
        for (let wave = 0; wave < 7; wave += 1) {
          const y = rect.y + ((wave / 7 + time * .025) % 1) * rect.height;
          ctx.beginPath();
          for (let x = rect.x - 10; x <= rect.x + rect.width + 10; x += 8) {
            const py = y + Math.sin(x * .035 + time * 1.7 + wave) * 1.8;
            if (x === rect.x - 10) ctx.moveTo(x, py);
            else ctx.lineTo(x, py);
          }
          ctx.stroke();
        }
      } else if (zone.type === 'bridge') {
        const bridge = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
        bridge.addColorStop(0, 'rgba(210,230,222,.64)');
        bridge.addColorStop(1, 'rgba(116,159,151,.38)');
        ctx.fillStyle = bridge;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = 'rgba(244,252,246,.38)';
        ctx.lineWidth = 1;
        for (let y = rect.y + 8; y < rect.y + rect.height; y += 16) {
          ctx.beginPath();
          ctx.moveTo(rect.x, y);
          ctx.lineTo(rect.x + rect.width, y);
          ctx.stroke();
        }
      } else if (zone.type === 'sand') {
        ctx.fillStyle = '#baa86f';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = .9;
        ctx.fillStyle = this.textures.sand;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      } else if (zone.type === 'moss') {
        ctx.fillStyle = '#385b3b';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = .9;
        ctx.fillStyle = this.textures.moss;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      } else if (zone.type === 'slope') {
        const slope = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
        slope.addColorStop(0, 'rgba(200,192,129,.08)');
        slope.addColorStop(1, 'rgba(65,83,54,.34)');
        ctx.fillStyle = slope;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        const angle = Math.atan2(zone.forceY || 0, zone.forceX || 0);
        ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
        ctx.rotate(angle);
        ctx.strokeStyle = 'rgba(31,48,34,.3)';
        ctx.lineWidth = 1.2;
        for (let y = -rect.height / 3; y <= rect.height / 3; y += 12) {
          ctx.beginPath();
          ctx.moveTo(-rect.width * .33, y);
          ctx.lineTo(rect.width * .33, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawHole(level, time) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(level.hole.x, level.hole.y, 0);
    const radiusX = level.hole.r * this.scale;
    const radiusY = radiusX * .82;
    const depth = Math.max(7, this.scale * 25);

    ctx.save();
    ctx.fillStyle = 'rgba(15,26,18,.24)';
    ctx.beginPath();
    ctx.ellipse(ground.x + radiusX * .16, ground.y + radiusY * .2, radiusX * 1.24, radiusY * .9, 0, 0, TAU);
    ctx.fill();

    const lip = ctx.createRadialGradient(ground.x - radiusX * .25, ground.y - radiusY * .3, radiusX * .08, ground.x, ground.y, radiusX * 1.25);
    lip.addColorStop(0, '#94a576');
    lip.addColorStop(.58, '#60784d');
    lip.addColorStop(1, '#294331');
    ctx.fillStyle = lip;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusX * 1.13, radiusY * 1.05, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#101a14';
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusX, radiusY, 0, 0, TAU);
    ctx.fill();

    const lowerY = ground.y + depth;
    const wall = ctx.createLinearGradient(0, ground.y - radiusY, 0, lowerY + radiusY);
    wall.addColorStop(0, '#1a2119');
    wall.addColorStop(.45, '#5a4a31');
    wall.addColorStop(1, '#151a15');
    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX, ground.y);
    ctx.bezierCurveTo(ground.x - radiusX * .92, ground.y + radiusY * .62, ground.x - radiusX * .7, lowerY + radiusY * .42, ground.x, lowerY + radiusY * .5);
    ctx.bezierCurveTo(ground.x + radiusX * .7, lowerY + radiusY * .42, ground.x + radiusX * .92, ground.y + radiusY * .62, ground.x + radiusX, ground.y);
    ctx.bezierCurveTo(ground.x + radiusX * .7, ground.y + radiusY * .7, ground.x - radiusX * .7, ground.y + radiusY * .7, ground.x - radiusX, ground.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0b100d';
    ctx.beginPath();
    ctx.ellipse(ground.x, lowerY + radiusY * .42, radiusX * .67, radiusY * .36, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(223,222,177,.28)';
    ctx.lineWidth = Math.max(1, this.scale * 2.2);
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusX * 1.03, radiusY * 1.01, 0, Math.PI, TAU);
    ctx.stroke();

    const mastBottom = { x: ground.x, y: lowerY + radiusY * .18 };
    const mastTop = this.worldToScreen(level.hole.x, level.hole.y, 122);
    roundedLine(ctx, mastBottom.x + this.scale * 2, mastBottom.y + this.scale * 3, mastTop.x + this.scale * 2, mastTop.y + this.scale * 3, Math.max(2, this.scale * 4.8), 'rgba(33,27,18,.42)');
    roundedLine(ctx, mastBottom.x, mastBottom.y, mastTop.x, mastTop.y, Math.max(1.4, this.scale * 3.6), '#b38b45');
    roundedLine(ctx, mastBottom.x - this.scale, mastBottom.y, mastTop.x - this.scale, mastTop.y, Math.max(.7, this.scale * 1.05), '#ead28a');

    const flap = Math.sin(time * 1.4) * this.scale * 3;
    const flag = ctx.createLinearGradient(mastTop.x, mastTop.y, mastTop.x + this.scale * 48, mastTop.y + this.scale * 20);
    flag.addColorStop(0, '#f0e4ba');
    flag.addColorStop(1, '#bda970');
    ctx.fillStyle = flag;
    ctx.beginPath();
    ctx.moveTo(mastTop.x, mastTop.y + this.scale * 3);
    ctx.lineTo(mastTop.x + this.scale * 45 + flap, mastTop.y + this.scale * 11);
    ctx.lineTo(mastTop.x, mastTop.y + this.scale * 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFootprint(obstacle, strength = .36) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const shadow = ctx.createRadialGradient(ground.x + radiusX * .12, ground.y + radiusY * .12, 0, ground.x, ground.y, radiusX * 1.1);
    shadow.addColorStop(0, `rgba(5,15,9,${strength})`);
    shadow.addColorStop(.72, `rgba(5,15,9,${strength * .52})`);
    shadow.addColorStop(1, 'rgba(5,15,9,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(ground.x + radiusX * .11, ground.y + radiusY * .16, radiusX * 1.08, radiusY * .72, 0, 0, TAU);
    ctx.fill();
  }

  drawStone(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const height = obstacle.r * this.scale * .62;
    const top = { x: ground.x - radiusX * .05, y: ground.y - height };
    const seed = hashNoise(obstacle.x, obstacle.y, 12);

    this.drawFootprint(obstacle, .42);

    const side = ctx.createLinearGradient(0, top.y, 0, ground.y + radiusY * .35);
    side.addColorStop(0, seed > .5 ? '#979a80' : '#8a9078');
    side.addColorStop(.5, seed > .5 ? '#777d69' : '#707663');
    side.addColorStop(1, '#4a594d');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX, ground.y);
    ctx.bezierCurveTo(ground.x - radiusX * .92, ground.y - height * .35, top.x - radiusX * .72, top.y - radiusY * .15, top.x, top.y - radiusY * .28);
    ctx.bezierCurveTo(top.x + radiusX * .68, top.y - radiusY * .14, ground.x + radiusX * .93, ground.y - height * .35, ground.x + radiusX, ground.y);
    ctx.bezierCurveTo(ground.x + radiusX * .72, ground.y + radiusY * .36, ground.x - radiusX * .72, ground.y + radiusY * .36, ground.x - radiusX, ground.y);
    ctx.closePath();
    ctx.fill();

    const topLight = ctx.createRadialGradient(top.x - radiusX * .35, top.y - radiusY * .35, radiusX * .08, top.x, top.y, radiusX);
    topLight.addColorStop(0, seed > .5 ? '#c5c1a0' : '#b7b69a');
    topLight.addColorStop(.58, seed > .5 ? '#9ea086' : '#92977f');
    topLight.addColorStop(1, 'rgba(88,99,82,.1)');
    ctx.fillStyle = topLight;
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, radiusX * .78, radiusY * .66, -.08, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(235,229,190,.28)';
    ctx.lineWidth = Math.max(.7, this.scale * 1.4);
    ctx.beginPath();
    ctx.moveTo(top.x - radiusX * .36, top.y - radiusY * .08);
    ctx.quadraticCurveTo(top.x - radiusX * .08, top.y + radiusY * .12, top.x + radiusX * .28, top.y - radiusY * .1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(30,46,35,.55)';
    ctx.lineWidth = Math.max(1, this.scale * 2.2);
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, radiusX, radiusY * .72, 0, 0, Math.PI);
    ctx.stroke();
  }

  drawPot(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const height = obstacle.r * this.scale * .9;
    const topY = ground.y - height;

    this.drawFootprint(obstacle, .36);

    const body = ctx.createLinearGradient(ground.x - radiusX, 0, ground.x + radiusX, 0);
    body.addColorStop(0, '#6d3e2c');
    body.addColorStop(.32, '#a66342');
    body.addColorStop(.65, '#c27d53');
    body.addColorStop(1, '#633727');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX * .58, ground.y);
    ctx.lineTo(ground.x - radiusX * .88, topY);
    ctx.quadraticCurveTo(ground.x, topY - radiusY * .42, ground.x + radiusX * .88, topY);
    ctx.lineTo(ground.x + radiusX * .58, ground.y);
    ctx.quadraticCurveTo(ground.x, ground.y + radiusY * .28, ground.x - radiusX * .58, ground.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7b4a34';
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX, radiusY * .42, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#29392b';
    ctx.beginPath();
    ctx.ellipse(ground.x, topY - this.scale, radiusX * .78, radiusY * .3, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,223,185,.28)';
    ctx.lineWidth = Math.max(1, this.scale * 2.2);
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX * .93, radiusY * .38, 0, Math.PI, TAU);
    ctx.stroke();
  }

  drawCup(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const height = obstacle.r * this.scale * .5;
    const topY = ground.y - height;

    this.drawFootprint(obstacle, .34);

    const body = ctx.createLinearGradient(ground.x - radiusX, 0, ground.x + radiusX, 0);
    body.addColorStop(0, '#7a887d');
    body.addColorStop(.22, '#d8d8ca');
    body.addColorStop(.52, '#f1eee0');
    body.addColorStop(.82, '#aab4aa');
    body.addColorStop(1, '#68776c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX * .72, ground.y);
    ctx.lineTo(ground.x - radiusX, topY);
    ctx.quadraticCurveTo(ground.x, topY - radiusY * .35, ground.x + radiusX, topY);
    ctx.lineTo(ground.x + radiusX * .72, ground.y);
    ctx.quadraticCurveTo(ground.x, ground.y + radiusY * .26, ground.x - radiusX * .72, ground.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e4e4d8';
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX, radiusY * .43, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#42554a';
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX * .75, radiusY * .28, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#c9cec4';
    ctx.lineWidth = Math.max(3, radiusX * .1);
    ctx.beginPath();
    ctx.ellipse(ground.x + radiusX * .92, topY + height * .28, radiusX * .42, radiusY * .36, 0, -1.2, 1.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1, radiusX * .025);
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX * .92, radiusY * .38, 0, Math.PI, TAU);
    ctx.stroke();
  }

  drawWood(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const height = obstacle.r * this.scale * .72;
    const topY = ground.y - height;

    this.drawFootprint(obstacle, .38);

    const bark = ctx.createLinearGradient(ground.x - radiusX, 0, ground.x + radiusX, 0);
    bark.addColorStop(0, '#4a3528');
    bark.addColorStop(.35, '#765538');
    bark.addColorStop(.65, '#8c6842');
    bark.addColorStop(1, '#402f25');
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX * .86, ground.y);
    ctx.lineTo(ground.x - radiusX * .9, topY);
    ctx.quadraticCurveTo(ground.x, topY - radiusY * .28, ground.x + radiusX * .9, topY);
    ctx.lineTo(ground.x + radiusX * .86, ground.y);
    ctx.quadraticCurveTo(ground.x, ground.y + radiusY * .26, ground.x - radiusX * .86, ground.y);
    ctx.closePath();
    ctx.fill();

    const cut = ctx.createRadialGradient(ground.x - radiusX * .25, topY - radiusY * .16, radiusX * .05, ground.x, topY, radiusX);
    cut.addColorStop(0, '#c19b68');
    cut.addColorStop(.68, '#967048');
    cut.addColorStop(1, '#60452f');
    ctx.fillStyle = cut;
    ctx.beginPath();
    ctx.ellipse(ground.x, topY, radiusX * .9, radiusY * .5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(73,48,31,.65)';
    ctx.lineWidth = Math.max(1, this.scale * 1.4);
    for (const factor of [.26, .5, .72]) {
      ctx.beginPath();
      ctx.ellipse(ground.x, topY, radiusX * factor, radiusY * factor * .54, 0, 0, TAU);
      ctx.stroke();
    }
  }

  drawSugar(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;
    const height = radiusX * .56;

    this.drawFootprint(obstacle, .25);
    const mound = ctx.createRadialGradient(ground.x - radiusX * .3, ground.y - height * .55, radiusX * .06, ground.x, ground.y - height * .1, radiusX);
    mound.addColorStop(0, '#fff8dc');
    mound.addColorStop(.55, '#ded1a9');
    mound.addColorStop(1, '#9e8d68');
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.moveTo(ground.x - radiusX, ground.y);
    ctx.quadraticCurveTo(ground.x - radiusX * .55, ground.y - height * .85, ground.x, ground.y - height);
    ctx.quadraticCurveTo(ground.x + radiusX * .58, ground.y - height * .78, ground.x + radiusX, ground.y);
    ctx.quadraticCurveTo(ground.x, ground.y + radiusY * .22, ground.x - radiusX, ground.y);
    ctx.fill();
    ctx.fillStyle = 'rgba(92,78,52,.24)';
    for (let index = 0; index < 26; index += 1) {
      const angle = hashNoise(index, obstacle.x) * TAU;
      const radius = Math.sqrt(hashNoise(index, obstacle.y)) * radiusX * .75;
      ctx.fillRect(ground.x + Math.cos(angle) * radius, ground.y - height * .35 + Math.sin(angle) * radiusY * .45, 1.2, 1.2);
    }
  }

  drawSpoon(obstacle) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(obstacle.x, obstacle.y, 0);
    const radiusX = obstacle.r * this.scale;
    const radiusY = radiusX * .82;

    this.drawFootprint(obstacle, .24);
    ctx.save();
    ctx.translate(ground.x, ground.y - radiusY * .16);
    ctx.rotate(-.48);
    const metal = ctx.createLinearGradient(-radiusX, -radiusY, radiusX, radiusY);
    metal.addColorStop(0, '#777d78');
    metal.addColorStop(.35, '#ece8d8');
    metal.addColorStop(.62, '#a5aaa3');
    metal.addColorStop(1, '#656d68');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX * .9, radiusY * .62, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.48)';
    ctx.lineWidth = Math.max(1, this.scale * 1.8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(49,56,52,.22)';
    ctx.beginPath();
    ctx.ellipse(radiusX * .08, radiusY * .08, radiusX * .58, radiusY * .34, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCircleObstacle(obstacle) {
    if (obstacle.material === 'stone') this.drawStone(obstacle);
    else if (obstacle.material === 'pot') this.drawPot(obstacle);
    else if (obstacle.material === 'cup') this.drawCup(obstacle);
    else if (obstacle.material === 'wood') this.drawWood(obstacle);
    else if (obstacle.material === 'sugar') this.drawSugar(obstacle);
    else if (obstacle.material === 'spoon') this.drawSpoon(obstacle);
    else this.drawStone(obstacle);
  }

  drawWall(wall, time, rotor = false) {
    let ax = wall.ax;
    let ay = wall.ay;
    let bx = wall.bx;
    let by = wall.by;
    if (rotor) {
      const angle = wall.angle + time * wall.speed;
      const halfX = Math.cos(angle) * wall.length * .5;
      const halfY = Math.sin(angle) * wall.length * .5;
      ax = wall.x - halfX;
      ay = wall.y - halfY;
      bx = wall.x + halfX;
      by = wall.y + halfY;
    }

    const baseA = this.worldToScreen(ax, ay, 0);
    const baseB = this.worldToScreen(bx, by, 0);
    const height = wall.material === 'glass' ? 28 : 19;
    const topA = this.worldToScreen(ax, ay, height);
    const topB = this.worldToScreen(bx, by, height);
    const width = wall.thickness * this.scale;

    roundedLine(this.ctx, baseA.x + width * .12, baseA.y + width * .28, baseB.x + width * .12, baseB.y + width * .28, width * 1.08, 'rgba(8,18,12,.35)');

    this.ctx.beginPath();
    this.ctx.moveTo(baseA.x, baseA.y);
    this.ctx.lineTo(baseB.x, baseB.y);
    this.ctx.lineTo(topB.x, topB.y);
    this.ctx.lineTo(topA.x, topA.y);
    this.ctx.closePath();
    this.ctx.fillStyle = wall.material === 'glass'
      ? 'rgba(84,132,125,.36)'
      : wall.material === 'brass'
        ? '#7e5727'
        : '#5b3d2b';
    this.ctx.fill();

    roundedLine(this.ctx, topA.x, topA.y, topB.x, topB.y, width * .78, wall.material === 'glass' ? 'rgba(224,244,236,.65)' : wall.material === 'brass' ? '#c99a4d' : '#9b7048');
    roundedLine(this.ctx, topA.x - width * .08, topA.y - width * .08, topB.x - width * .08, topB.y - width * .08, Math.max(1, width * .12), wall.material === 'glass' ? 'rgba(255,255,255,.58)' : 'rgba(255,230,170,.36)');
  }

  drawTunnel(tunnel, time) {
    for (const [node, exit] of [[tunnel.entry, false], [tunnel.exit, true]]) {
      const ground = this.worldToScreen(node.x, node.y, 0);
      const radiusX = node.r * this.scale;
      const radiusY = radiusX * .82;
      const lift = radiusX * .36;
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(5,14,9,.38)';
      this.ctx.beginPath();
      this.ctx.ellipse(ground.x + radiusX * .1, ground.y + radiusY * .14, radiusX * 1.08, radiusY * .64, 0, 0, TAU);
      this.ctx.fill();
      const rim = this.ctx.createLinearGradient(0, ground.y - lift, 0, ground.y + radiusY);
      rim.addColorStop(0, exit ? '#d0b66e' : '#768c72');
      rim.addColorStop(1, exit ? '#776235' : '#344b3b');
      this.ctx.strokeStyle = rim;
      this.ctx.lineWidth = Math.max(4, radiusX * .18);
      this.ctx.beginPath();
      this.ctx.ellipse(ground.x, ground.y - lift * .2, radiusX, radiusY * .58, 0, 0, TAU);
      this.ctx.stroke();
      this.ctx.fillStyle = '#101612';
      this.ctx.beginPath();
      this.ctx.ellipse(ground.x, ground.y - lift * .2, radiusX * .72, radiusY * .36, 0, 0, TAU);
      this.ctx.fill();
      this.ctx.strokeStyle = `rgba(239,226,178,${.19 + Math.sin(time * 2) * .06})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.ellipse(ground.x, ground.y - lift * .2, radiusX * .7, radiusY * .34, 0, 0, TAU);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawDecoration(item, time) {
    const ctx = this.ctx;
    const ground = this.worldToScreen(item.x, item.y, 0);
    const scale = this.scale;
    ctx.save();
    if (item.type === 'leaf') {
      ctx.translate(ground.x, ground.y - scale * 3);
      ctx.rotate(-.5);
      ctx.fillStyle = '#3d5c3f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 34 * scale, 13 * scale, 0, 0, TAU);
      ctx.fill();
      roundedLine(ctx, -28 * scale, 0, 28 * scale, 0, Math.max(1, 2 * scale), '#a5b178');
    } else if (item.type === 'mushroom') {
      roundedLine(ctx, ground.x, ground.y, ground.x, ground.y - 27 * scale, 8 * scale, '#d6caa7');
      ctx.fillStyle = '#a46a4d';
      ctx.beginPath();
      ctx.arc(ground.x, ground.y - 28 * scale, 18 * scale, Math.PI, TAU);
      ctx.fill();
    } else if (item.type === 'snail') {
      const sway = Math.sin(time * .7 + item.x) * 2 * scale;
      ctx.fillStyle = 'rgba(8,18,12,.26)';
      ctx.beginPath();
      ctx.ellipse(ground.x + 4 * scale, ground.y + 3 * scale, 31 * scale, 7 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#80905b';
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, 28 * scale, 8 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b18a5b';
      ctx.beginPath();
      ctx.arc(ground.x - 7 * scale, ground.y - 7 * scale, 14 * scale, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#6d543b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ground.x - 7 * scale, ground.y - 7 * scale, 8 * scale, 0, TAU);
      ctx.stroke();
      roundedLine(ctx, ground.x + 18 * scale, ground.y - 3 * scale, ground.x + 25 * scale + sway, ground.y - 17 * scale, 1, '#80905b');
    } else if (item.type === 'frog') {
      ctx.fillStyle = 'rgba(8,18,12,.28)';
      ctx.beginPath();
      ctx.ellipse(ground.x + 3 * scale, ground.y + 5 * scale, 24 * scale, 9 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#486442';
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, 22 * scale, 15 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ground.x - 9 * scale, ground.y - 11 * scale, 6 * scale, 0, TAU);
      ctx.arc(ground.x + 9 * scale, ground.y - 11 * scale, 6 * scale, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d9d9b4';
      ctx.beginPath();
      ctx.arc(ground.x - 9 * scale, ground.y - 12 * scale, 2 * scale, 0, TAU);
      ctx.arc(ground.x + 9 * scale, ground.y - 12 * scale, 2 * scale, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFireflies(level, time) {
    if (!level.fireflies) return;
    for (let index = 0; index < level.fireflies; index += 1) {
      const angle = time * (.3 + hashNoise(index, 2) * .4) + index;
      const x = 500 + Math.cos(angle) * (180 + hashNoise(index, 4) * 260);
      const y = 650 + Math.sin(angle * .77) * (330 + hashNoise(index, 8) * 260);
      const point = this.worldToScreen(x, y, 18 + hashNoise(index, 10) * 70);
      const alpha = .25 + (Math.sin(time * 2 + index) + 1) * .25;
      this.ctx.fillStyle = `rgba(238,222,109,${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 1.2 + this.scale * 2, 0, TAU);
      this.ctx.fill();
    }
  }

  drawAim(ball, aim) {
    if (!aim.active) return;
    const ctx = this.ctx;
    const contact = this.worldToScreen(ball.x, ball.y, BALL_RADIUS);
    const power = clamp(Math.hypot(aim.vx, aim.vy) / 1750, 0, 1);
    const angle = Math.atan2(aim.vy, aim.vx);
    const length = (64 + power * 142) * this.scale;
    const endX = contact.x + Math.cos(angle) * length;
    const endY = contact.y + Math.sin(angle) * length * .82;

    ctx.save();
    const gradient = ctx.createLinearGradient(contact.x, contact.y, endX, endY);
    gradient.addColorStop(0, 'rgba(246,240,206,.3)');
    gradient.addColorStop(1, `rgba(255,245,204,${.68 + power * .28})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(1.4, this.scale * 2.2);
    ctx.beginPath();
    ctx.moveTo(contact.x, contact.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    for (let index = 1; index <= 5; index += 1) {
      const t = index / 6;
      const x = lerp(contact.x, endX, t);
      const y = lerp(contact.y, endY, t);
      ctx.fillStyle = `rgba(255,244,204,${.22 + power * t * .72})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, this.scale * (1.2 + t * 1.7)), 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = '#f6edc8';
    ctx.beginPath();
    ctx.arc(endX, endY, 2.8 + power * 3.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBall(ball, time) {
    if (ball.sink >= 1) return;
    const ctx = this.ctx;
    const sinkScale = ball.sunk ? 1 - ball.sink * .82 : 1;
    const radius = BALL_RADIUS * this.scale * sinkScale;
    const centerHeight = BALL_RADIUS * sinkScale;
    const center = this.worldToScreen(ball.x, ball.y, centerHeight);
    const contact = this.worldToScreen(ball.x, ball.y, 0);
    const alpha = ball.sunk ? 1 - ball.sink : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    const contactShadow = ctx.createRadialGradient(contact.x + radius * .12, contact.y + radius * .04, 0, contact.x, contact.y, radius * 1.05);
    contactShadow.addColorStop(0, 'rgba(5,14,9,.46)');
    contactShadow.addColorStop(.54, 'rgba(5,14,9,.28)');
    contactShadow.addColorStop(1, 'rgba(5,14,9,0)');
    ctx.fillStyle = contactShadow;
    ctx.beginPath();
    ctx.ellipse(contact.x + radius * .09, contact.y + radius * .05, radius * .92, radius * .28, 0, 0, TAU);
    ctx.fill();

    const sphere = ctx.createRadialGradient(center.x - radius * .38, center.y - radius * .46, radius * .05, center.x + radius * .08, center.y + radius * .1, radius * 1.05);
    sphere.addColorStop(0, '#ffffff');
    sphere.addColorStop(.2, '#f3f0dd');
    sphere.addColorStop(.48, '#cdd8cf');
    sphere.addColorStop(.76, '#8fa49a');
    sphere.addColorStop(1, '#4e665b');
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * .93, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = .35;
    ctx.strokeStyle = '#6d897c';
    ctx.lineWidth = Math.max(1, radius * .07);
    ctx.beginPath();
    ctx.arc(center.x + Math.sin(time * .8) * radius * .13, center.y + radius * .12, radius * .52, .15, 2.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.46)';
    ctx.lineWidth = Math.max(1, radius * .045);
    ctx.beginPath();
    ctx.arc(center.x - radius * .18, center.y - radius * .2, radius * .58, 3.4, 5.3);
    ctx.stroke();
    ctx.restore();

    const lower = ctx.createLinearGradient(0, center.y, 0, contact.y + radius * .1);
    lower.addColorStop(0, 'rgba(38,66,54,0)');
    lower.addColorStop(1, 'rgba(20,40,31,.48)');
    ctx.fillStyle = lower;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = Math.max(1, radius * .055);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * .86, -2.75, -1.24);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.beginPath();
    ctx.arc(center.x - radius * .34, center.y - radius * .38, radius * .12, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(7,19,12,.45)';
    ctx.lineWidth = Math.max(.7, radius * .035);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * .98, .05, Math.PI - .05);
    ctx.stroke();

    ctx.fillStyle = 'rgba(8,18,12,.55)';
    ctx.beginPath();
    ctx.ellipse(contact.x, contact.y - radius * .015, radius * .22, radius * .045, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.95, dt * 60);
      particle.vy *= Math.pow(.95, dt * 60);
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  drawParticles() {
    for (const particle of this.particles) {
      const point = this.worldToScreen(particle.x, particle.y, 22);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      this.ctx.fillStyle = particle.type === 'cup'
        ? `rgba(234,218,108,${alpha})`
        : particle.type === 'water'
          ? `rgba(203,230,221,${alpha})`
          : `rgba(229,225,196,${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, particle.size * this.scale, 0, TAU);
      this.ctx.fill();
    }
  }

  draw(level, ball, aim, time, dt, mode = 'playing') {
    this.fit(level, ball, dt);
    this.updateParticles(dt);
    this.drawBackground(time, mode);
    this.drawBoard(level);
    this.drawZones(level, time);
    this.drawHole(level, time);
    this.drawCurb(level);
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
    return this.worldToScreen(ball.x, ball.y, BALL_RADIUS);
  }
}
