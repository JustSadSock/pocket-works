const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function polygon(context, points) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.closePath();
}

export class MazeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.center = { x: 0, y: 0 };
    this.cameraDistance = 30;
    this.pitch = 0;
    this.roll = 0;
    this.reducedMotion = false;
    this.resize();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  configureCamera(maze, tilt) {
    const horizontalPadding = this.width < 430 ? 28 : 46;
    const verticalPadding = this.height < 620 ? 86 : 112;
    this.scale = Math.min(
      (this.width - horizontalPadding * 2) / (maze.cols + 1.15),
      (this.height - verticalPadding * 2) / (maze.rows + 1.15)
    );
    this.center.x = this.width / 2;
    this.center.y = this.height / 2 + (this.height > this.width ? 12 : 6);
    const intensity = this.reducedMotion ? 0.35 : 1;
    this.roll = clamp(-tilt.x * 0.115 * intensity, -0.16, 0.16);
    this.pitch = clamp(tilt.y * 0.105 * intensity, -0.15, 0.15);
    this.cameraDistance = Math.max(maze.cols, maze.rows) * 2.85;
  }

  project(maze, x, y, z = 0) {
    const centeredX = x - maze.cols / 2;
    const centeredY = y - maze.rows / 2;
    const cosRoll = Math.cos(this.roll);
    const sinRoll = Math.sin(this.roll);
    const x1 = centeredX * cosRoll + z * sinRoll;
    const z1 = -centeredX * sinRoll + z * cosRoll;
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const y2 = centeredY * cosPitch - z1 * sinPitch;
    const z2 = centeredY * sinPitch + z1 * cosPitch;
    const perspective = this.cameraDistance / Math.max(2, this.cameraDistance - z2);
    return {
      x: this.center.x + x1 * this.scale * perspective,
      y: this.center.y + y2 * this.scale * perspective,
      perspective,
      depth: z2
    };
  }

  draw({ maze, marble, visualTilt, elapsed, mode = 'playing', completion = 0 }) {
    const context = this.context;
    this.configureCamera(maze, visualTilt);
    this.drawBackground(context, visualTilt, elapsed);
    this.drawSlab(context, maze);
    this.drawFloor(context, maze, elapsed);
    this.drawGoal(context, maze, elapsed, mode, completion);
    this.drawStartMark(context, maze);
    this.drawWalls(context, maze);
    this.drawMarble(context, maze, marble, elapsed);
    this.drawVignette(context);
  }

  drawBackground(context, tilt, elapsed) {
    const gradient = context.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, '#111612');
    gradient.addColorStop(0.48, '#1d241d');
    gradient.addColorStop(1, '#0b0e0c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);

    const offsetX = tilt.x * 9;
    const offsetY = tilt.y * 9;
    context.save();
    context.globalAlpha = 0.12;
    context.strokeStyle = '#758273';
    context.lineWidth = 1;
    const spacing = 34;
    for (let x = -spacing + (offsetX % spacing); x < this.width + spacing; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x - 18, this.height);
      context.stroke();
    }
    context.globalAlpha = 0.07;
    for (let y = -spacing + (offsetY % spacing); y < this.height + spacing; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.width, y + 12);
      context.stroke();
    }
    context.restore();

    if (!this.reducedMotion) {
      const pulse = 0.03 + Math.sin(elapsed * 0.00035) * 0.008;
      context.fillStyle = `rgba(231, 223, 191, ${pulse})`;
      for (let index = 0; index < 24; index += 1) {
        const x = (index * 97.13 + elapsed * 0.006) % (this.width + 80) - 40;
        const y = (index * 61.71) % this.height;
        context.fillRect(x, y, 1, 1);
      }
    }
  }

  slabCorners(maze, z) {
    const inset = 0.54;
    return [
      this.project(maze, -inset, -inset, z),
      this.project(maze, maze.cols + inset, -inset, z),
      this.project(maze, maze.cols + inset, maze.rows + inset, z),
      this.project(maze, -inset, maze.rows + inset, z)
    ];
  }

  drawSlab(context, maze) {
    const bottom = this.slabCorners(maze, -0.28);
    const top = this.slabCorners(maze, -0.02);

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.54)';
    context.shadowBlur = 26;
    context.shadowOffsetY = 18;
    polygon(context, bottom.map((point) => ({ x: point.x + 3, y: point.y + 5 })));
    context.fillStyle = '#050706';
    context.fill();
    context.restore();

    const sideFaces = [
      [bottom[0], bottom[1], top[1], top[0]],
      [bottom[1], bottom[2], top[2], top[1]],
      [bottom[2], bottom[3], top[3], top[2]],
      [bottom[3], bottom[0], top[0], top[3]]
    ];
    const sideColors = ['#2e332b', '#20251f', '#151914', '#384037'];
    sideFaces.forEach((face, index) => {
      polygon(context, face);
      context.fillStyle = sideColors[index];
      context.fill();
    });

    polygon(context, top);
    const surface = context.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
    surface.addColorStop(0, '#d9d0b4');
    surface.addColorStop(0.48, '#b9b092');
    surface.addColorStop(1, '#918a70');
    context.fillStyle = surface;
    context.fill();
    context.strokeStyle = 'rgba(247, 241, 216, 0.62)';
    context.lineWidth = 1;
    context.stroke();
  }

  drawFloor(context, maze, elapsed) {
    const top = [
      this.project(maze, 0, 0, 0),
      this.project(maze, maze.cols, 0, 0),
      this.project(maze, maze.cols, maze.rows, 0),
      this.project(maze, 0, maze.rows, 0)
    ];
    polygon(context, top);
    const fill = context.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
    fill.addColorStop(0, '#c8c1a6');
    fill.addColorStop(0.55, '#aaa287');
    fill.addColorStop(1, '#817b65');
    context.fillStyle = fill;
    context.fill();

    context.save();
    context.globalAlpha = 0.18;
    context.strokeStyle = '#4d574c';
    context.lineWidth = 0.7;
    for (let col = 1; col < maze.cols; col += 1) {
      const a = this.project(maze, col, 0, 0.008);
      const b = this.project(maze, col, maze.rows, 0.008);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (let row = 1; row < maze.rows; row += 1) {
      const a = this.project(maze, 0, row, 0.008);
      const b = this.project(maze, maze.cols, row, 0.008);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    context.restore();

    const sheen = (Math.sin(elapsed * 0.00055) + 1) * 0.5;
    context.save();
    polygon(context, top);
    context.clip();
    const sheenX = this.width * (-0.2 + sheen * 1.4);
    const sheenGradient = context.createLinearGradient(sheenX - 80, 0, sheenX + 80, 0);
    sheenGradient.addColorStop(0, 'rgba(255,255,255,0)');
    sheenGradient.addColorStop(0.5, 'rgba(255,249,226,0.065)');
    sheenGradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = sheenGradient;
    context.fillRect(0, 0, this.width, this.height);
    context.restore();
  }

  drawStartMark(context, maze) {
    const center = this.project(maze, maze.start.x, maze.start.y, 0.012);
    const edge = this.project(maze, maze.start.x + 0.34, maze.start.y, 0.012);
    const radius = Math.max(4, Math.abs(edge.x - center.x));
    context.save();
    context.globalAlpha = 0.46;
    context.strokeStyle = '#615c48';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, TAU);
    context.stroke();
    context.beginPath();
    context.moveTo(center.x - radius * 0.58, center.y);
    context.lineTo(center.x + radius * 0.58, center.y);
    context.moveTo(center.x, center.y - radius * 0.58);
    context.lineTo(center.x, center.y + radius * 0.58);
    context.stroke();
    context.restore();
  }

  drawGoal(context, maze, elapsed, mode, completion) {
    const center = this.project(maze, maze.goal.x, maze.goal.y, -0.015);
    const edge = this.project(maze, maze.goal.x + 0.39, maze.goal.y, -0.015);
    const radius = Math.max(8, Math.abs(edge.x - center.x));
    const pulse = mode === 'complete' ? completion : (Math.sin(elapsed * 0.004) + 1) * 0.5;

    context.save();
    context.translate(center.x, center.y);
    context.shadowColor = 'rgba(0,0,0,0.58)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 5;
    const rim = context.createRadialGradient(-radius * 0.2, -radius * 0.24, radius * 0.1, 0, 0, radius);
    rim.addColorStop(0, '#050706');
    rim.addColorStop(0.55, '#151913');
    rim.addColorStop(0.7, '#6f6541');
    rim.addColorStop(0.86, '#c1ad69');
    rim.addColorStop(1, '#51482d');
    context.fillStyle = rim;
    context.beginPath();
    context.arc(0, 0, radius, 0, TAU);
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = `rgba(240, 213, 129, ${0.24 + pulse * 0.34})`;
    context.lineWidth = Math.max(1, radius * 0.08);
    context.beginPath();
    context.arc(0, 0, radius * (0.74 + pulse * 0.04), 0, TAU);
    context.stroke();
    context.restore();
  }

  drawWalls(context, maze) {
    const wallHeight = 0.39;
    const walls = maze.walls.map((wall) => {
      const center = this.project(maze, wall.x + wall.width / 2, wall.y + wall.height / 2, wallHeight / 2);
      return { wall, sort: center.y + center.depth * 0.8 };
    }).sort((a, b) => a.sort - b.sort);

    for (const { wall } of walls) {
      const x0 = wall.x;
      const y0 = wall.y;
      const x1 = wall.x + wall.width;
      const y1 = wall.y + wall.height;
      const bottom = [
        this.project(maze, x0, y0, 0.015),
        this.project(maze, x1, y0, 0.015),
        this.project(maze, x1, y1, 0.015),
        this.project(maze, x0, y1, 0.015)
      ];
      const top = [
        this.project(maze, x0, y0, wallHeight),
        this.project(maze, x1, y0, wallHeight),
        this.project(maze, x1, y1, wallHeight),
        this.project(maze, x0, y1, wallHeight)
      ];

      context.save();
      context.shadowColor = 'rgba(31, 38, 32, 0.30)';
      context.shadowBlur = 4;
      context.shadowOffsetY = 2;
      const faces = [
        [bottom[0], bottom[1], top[1], top[0]],
        [bottom[1], bottom[2], top[2], top[1]],
        [bottom[2], bottom[3], top[3], top[2]],
        [bottom[3], bottom[0], top[0], top[3]]
      ];
      const colors = [
        'rgba(70, 88, 76, 0.62)',
        'rgba(37, 52, 43, 0.74)',
        'rgba(24, 36, 29, 0.72)',
        'rgba(96, 113, 98, 0.58)'
      ];
      faces.forEach((face, index) => {
        polygon(context, face);
        context.fillStyle = colors[index];
        context.fill();
      });
      context.shadowColor = 'transparent';
      polygon(context, top);
      const topGradient = context.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
      topGradient.addColorStop(0, 'rgba(230, 236, 218, 0.80)');
      topGradient.addColorStop(0.5, 'rgba(151, 171, 151, 0.76)');
      topGradient.addColorStop(1, 'rgba(83, 105, 88, 0.82)');
      context.fillStyle = topGradient;
      context.fill();
      context.strokeStyle = 'rgba(245, 246, 226, 0.68)';
      context.lineWidth = 0.8;
      context.stroke();
      context.restore();
    }
  }

  drawMarble(context, maze, marble) {
    const floorCenter = this.project(maze, marble.position.x, marble.position.y, 0.025);
    const center = this.project(maze, marble.position.x, marble.position.y, marble.radius * 1.04);
    const radiusPoint = this.project(maze, marble.position.x + marble.radius, marble.position.y, marble.radius * 1.04);
    const radius = Math.max(8, Math.abs(radiusPoint.x - center.x));
    const speed = marble.speed();

    context.save();
    const shadowGradient = context.createRadialGradient(
      floorCenter.x + 4, floorCenter.y + 5, radius * 0.08,
      floorCenter.x + 4, floorCenter.y + 5, radius * 1.18
    );
    shadowGradient.addColorStop(0, 'rgba(2,5,3,0.46)');
    shadowGradient.addColorStop(0.55, 'rgba(2,5,3,0.23)');
    shadowGradient.addColorStop(1, 'rgba(2,5,3,0)');
    context.fillStyle = shadowGradient;
    context.beginPath();
    context.ellipse(floorCenter.x + 4, floorCenter.y + 5, radius * 1.18, radius * 0.72, 0, 0, TAU);
    context.fill();

    if (speed > 2.25 && !this.reducedMotion) {
      const length = clamp(speed * 1.8, 4, 11);
      const velocityAngle = Math.atan2(marble.velocity.y, marble.velocity.x);
      context.strokeStyle = 'rgba(210, 235, 222, 0.11)';
      context.lineWidth = radius * 0.45;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(center.x - Math.cos(velocityAngle) * length, center.y - Math.sin(velocityAngle) * length);
      context.lineTo(center.x, center.y);
      context.stroke();
    }

    context.translate(center.x, center.y);
    context.shadowColor = 'rgba(0,0,0,0.32)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 4;
    const glass = context.createRadialGradient(-radius * 0.34, -radius * 0.42, radius * 0.06, 0, 0, radius);
    glass.addColorStop(0, 'rgba(255,255,247,0.98)');
    glass.addColorStop(0.13, 'rgba(213,242,230,0.92)');
    glass.addColorStop(0.38, 'rgba(126,184,164,0.63)');
    glass.addColorStop(0.68, 'rgba(58,104,88,0.52)');
    glass.addColorStop(0.88, 'rgba(20,49,39,0.77)');
    glass.addColorStop(1, 'rgba(7,19,14,0.93)');
    context.fillStyle = glass;
    context.beginPath();
    context.arc(0, 0, radius, 0, TAU);
    context.fill();
    context.shadowColor = 'transparent';

    context.save();
    context.beginPath();
    context.arc(0, 0, radius * 0.93, 0, TAU);
    context.clip();
    context.rotate(marble.spin * 0.45);
    context.strokeStyle = 'rgba(231,255,241,0.28)';
    context.lineWidth = Math.max(1, radius * 0.09);
    context.beginPath();
    context.arc(radius * 0.12, radius * 0.05, radius * 0.62, -1.8, 0.85);
    context.stroke();
    context.strokeStyle = 'rgba(18,69,51,0.30)';
    context.lineWidth = Math.max(1, radius * 0.14);
    context.beginPath();
    context.arc(-radius * 0.16, radius * 0.18, radius * 0.58, 0.4, 2.55);
    context.stroke();
    context.restore();

    const highlight = context.createRadialGradient(-radius * 0.42, -radius * 0.5, 0, -radius * 0.38, -radius * 0.45, radius * 0.44);
    highlight.addColorStop(0, 'rgba(255,255,255,0.94)');
    highlight.addColorStop(0.32, 'rgba(255,255,255,0.30)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = highlight;
    context.beginPath();
    context.arc(-radius * 0.3, -radius * 0.38, radius * 0.42, 0, TAU);
    context.fill();

    context.strokeStyle = 'rgba(232, 250, 239, 0.66)';
    context.lineWidth = Math.max(1, radius * 0.065);
    context.beginPath();
    context.arc(0, 0, radius * 0.95, -2.95, 0.08);
    context.stroke();
    context.strokeStyle = 'rgba(6, 22, 15, 0.58)';
    context.beginPath();
    context.arc(0, 0, radius * 0.96, 0.08, 2.95);
    context.stroke();

    if (marble.impact > 0) {
      context.strokeStyle = `rgba(244, 224, 157, ${marble.impact * 0.7})`;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(0, 0, radius * (1.08 + marble.impact * 0.18), 0, TAU);
      context.stroke();
    }
    context.restore();
  }

  drawVignette(context) {
    const radius = Math.max(this.width, this.height) * 0.72;
    const vignette = context.createRadialGradient(this.width / 2, this.height / 2, radius * 0.28, this.width / 2, this.height / 2, radius);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(0,0,0,0.08)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, this.width, this.height);
  }
}
