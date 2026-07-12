const TAU = Math.PI * 2;
const WALL_HEIGHT = 0.34;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function polygon(context, points) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.closePath();
}

function line(context, from, to) {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

export class MazeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.origin = { x: 0, y: 0 };
    this.light = { x: -0.34, y: -0.46 };
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
    const compact = this.height < 620;
    const horizontalPadding = this.width < 430 ? 19 : 34;
    const topPadding = compact ? 72 : 92;
    const bottomPadding = compact ? 54 : 72;
    const availableWidth = Math.max(1, this.width - horizontalPadding * 2);
    const availableHeight = Math.max(1, this.height - topPadding - bottomPadding);
    this.scale = Math.min(availableWidth / maze.cols, availableHeight / maze.rows);
    const playfieldWidth = maze.cols * this.scale;
    const playfieldHeight = maze.rows * this.scale;
    this.origin.x = (this.width - playfieldWidth) / 2;
    this.origin.y = topPadding + (availableHeight - playfieldHeight) / 2 + this.scale * WALL_HEIGHT * 0.38;

    const motionScale = this.reducedMotion ? 0.3 : 1;
    this.light.x = clamp(-0.34 + tilt.x * 0.22 * motionScale, -0.58, 0.08);
    this.light.y = clamp(-0.46 + tilt.y * 0.18 * motionScale, -0.68, -0.12);
  }

  project(_maze, x, y, z = 0) {
    return {
      x: this.origin.x + x * this.scale - z * this.scale * 0.16,
      y: this.origin.y + y * this.scale - z * this.scale * 0.88,
      depth: y + z * 0.16
    };
  }

  draw({ maze, marble, visualTilt, elapsed, mode = 'playing', completion = 0 }) {
    const context = this.context;
    this.configureCamera(maze, visualTilt);
    this.drawBackground(context, visualTilt, elapsed);
    this.drawFloor(context, maze, visualTilt);
    this.drawGoal(context, maze, elapsed, mode, completion);
    this.drawStartMark(context, maze);
    this.drawSceneObjects(context, maze, marble, visualTilt);
    this.drawScreenGlass(context, visualTilt);
    this.drawVignette(context);
  }

  drawBackground(context, tilt, elapsed) {
    const glowX = this.width * (0.48 - tilt.x * 0.025);
    const glowY = this.height * (0.44 - tilt.y * 0.02);
    const radius = Math.max(this.width, this.height) * 0.82;
    const background = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, radius);
    background.addColorStop(0, '#263129');
    background.addColorStop(0.38, '#19211b');
    background.addColorStop(0.78, '#101511');
    background.addColorStop(1, '#090c0a');
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);

    context.save();
    context.globalAlpha = 0.11;
    context.fillStyle = '#b9c6b8';
    const drift = this.reducedMotion ? 0 : elapsed * 0.00008;
    for (let index = 0; index < 42; index += 1) {
      const x = ((index * 83.47 + drift * 29) % (this.width + 24)) - 12;
      const y = (index * 61.21 + Math.sin(index * 1.7) * 18) % this.height;
      const size = index % 7 === 0 ? 1.2 : 0.65;
      context.fillRect(x, y, size, size);
    }
    context.restore();
  }

  playfieldRect(maze) {
    return {
      x: this.origin.x,
      y: this.origin.y,
      width: maze.cols * this.scale,
      height: maze.rows * this.scale
    };
  }

  drawFloor(context, maze, tilt) {
    const rect = this.playfieldRect(maze);
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();

    const floorGlow = context.createRadialGradient(
      rect.x + rect.width * (0.48 - tilt.x * 0.025),
      rect.y + rect.height * (0.44 - tilt.y * 0.02),
      0,
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.5,
      Math.max(rect.width, rect.height) * 0.74
    );
    floorGlow.addColorStop(0, 'rgba(190, 202, 184, 0.105)');
    floorGlow.addColorStop(0.55, 'rgba(90, 108, 94, 0.04)');
    floorGlow.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    context.fillStyle = floorGlow;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);

    context.globalAlpha = 0.055;
    context.strokeStyle = '#c5cebf';
    context.lineWidth = 0.7;
    for (let col = 1; col < maze.cols; col += 1) {
      const x = rect.x + col * this.scale;
      line(context, { x, y: rect.y }, { x, y: rect.y + rect.height });
    }
    for (let row = 1; row < maze.rows; row += 1) {
      const y = rect.y + row * this.scale;
      line(context, { x: rect.x, y }, { x: rect.x + rect.width, y });
    }

    context.globalAlpha = 0.065;
    context.strokeStyle = '#e1e5d8';
    context.lineWidth = 1;
    const streakOffset = tilt.x * 10;
    for (let index = 0; index < 5; index += 1) {
      const y = rect.y + rect.height * (0.15 + index * 0.18);
      context.beginPath();
      context.moveTo(rect.x + rect.width * 0.08 + streakOffset, y);
      context.lineTo(rect.x + rect.width * (0.32 + index * 0.08) + streakOffset, y - 2);
      context.stroke();
    }
    context.restore();
  }

  drawStartMark(context, maze) {
    const center = this.project(maze, maze.start.x, maze.start.y, 0.012);
    const radius = this.scale * 0.31;
    context.save();
    context.globalAlpha = 0.38;
    context.strokeStyle = '#9ba596';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, TAU);
    context.stroke();
    line(context, { x: center.x - radius * 0.58, y: center.y }, { x: center.x + radius * 0.58, y: center.y });
    line(context, { x: center.x, y: center.y - radius * 0.58 }, { x: center.x, y: center.y + radius * 0.58 });
    context.restore();
  }

  drawGoal(context, maze, elapsed, mode, completion) {
    const center = this.project(maze, maze.goal.x, maze.goal.y, -0.012);
    const radius = Math.max(8, this.scale * 0.39);
    const pulse = mode === 'complete' ? completion : (Math.sin(elapsed * 0.004) + 1) * 0.5;

    context.save();
    context.translate(center.x, center.y);
    context.shadowColor = 'rgba(0, 0, 0, 0.7)';
    context.shadowBlur = 14;
    context.shadowOffsetY = 5;
    const well = context.createRadialGradient(-radius * 0.2, -radius * 0.22, radius * 0.08, 0, 0, radius);
    well.addColorStop(0, '#020403');
    well.addColorStop(0.52, '#07100b');
    well.addColorStop(0.68, '#3f3b25');
    well.addColorStop(0.84, '#c5ad63');
    well.addColorStop(1, '#3b331f');
    context.fillStyle = well;
    context.beginPath();
    context.arc(0, 0, radius, 0, TAU);
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = `rgba(244, 221, 148, ${0.2 + pulse * 0.3})`;
    context.lineWidth = Math.max(1, radius * 0.08);
    context.beginPath();
    context.arc(0, 0, radius * (0.75 + pulse * 0.035), 0, TAU);
    context.stroke();
    context.restore();
  }

  wallGeometry(maze, wall) {
    const x0 = wall.x;
    const y0 = wall.y;
    const x1 = wall.x + wall.width;
    const y1 = wall.y + wall.height;
    const base = [
      this.project(maze, x0, y0, 0.014),
      this.project(maze, x1, y0, 0.014),
      this.project(maze, x1, y1, 0.014),
      this.project(maze, x0, y1, 0.014)
    ];
    const top = [
      this.project(maze, x0, y0, WALL_HEIGHT),
      this.project(maze, x1, y0, WALL_HEIGHT),
      this.project(maze, x1, y1, WALL_HEIGHT),
      this.project(maze, x0, y1, WALL_HEIGHT)
    ];
    return { wall, base, top, sort: y1 + wall.height * 0.04 };
  }

  drawWallShadow(context, geometry, tilt) {
    const { base } = geometry;
    const offsetX = 3 - tilt.x * 1.4;
    const offsetY = 5 - tilt.y * 1.2;
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.5)';
    context.shadowBlur = Math.max(3, this.scale * 0.11);
    polygon(context, base.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })));
    context.fillStyle = 'rgba(0, 0, 0, 0.24)';
    context.fill();
    context.restore();
  }

  drawWall(context, geometry) {
    const { base, top } = geometry;
    const frontFace = [base[3], base[2], top[2], top[3]];
    const rightFace = [base[1], base[2], top[2], top[1]];

    context.save();
    polygon(context, frontFace);
    const front = context.createLinearGradient(frontFace[0].x, frontFace[0].y, frontFace[3].x, frontFace[3].y);
    front.addColorStop(0, 'rgba(20, 34, 27, 0.82)');
    front.addColorStop(0.48, 'rgba(47, 67, 54, 0.76)');
    front.addColorStop(1, 'rgba(111, 133, 113, 0.58)');
    context.fillStyle = front;
    context.fill();

    polygon(context, rightFace);
    const right = context.createLinearGradient(rightFace[0].x, rightFace[0].y, rightFace[3].x, rightFace[3].y);
    right.addColorStop(0, 'rgba(13, 25, 19, 0.88)');
    right.addColorStop(1, 'rgba(75, 99, 81, 0.62)');
    context.fillStyle = right;
    context.fill();

    polygon(context, top);
    const lightX = (this.light.x + 0.65) / 0.75;
    const topGradient = context.createLinearGradient(
      top[0].x + (top[1].x - top[0].x) * lightX,
      top[0].y,
      top[3].x,
      top[3].y
    );
    topGradient.addColorStop(0, 'rgba(239, 246, 232, 0.88)');
    topGradient.addColorStop(0.28, 'rgba(180, 202, 184, 0.82)');
    topGradient.addColorStop(1, 'rgba(87, 112, 94, 0.78)');
    context.fillStyle = topGradient;
    context.fill();

    context.strokeStyle = 'rgba(245, 250, 236, 0.66)';
    context.lineWidth = 0.8;
    polygon(context, top);
    context.stroke();

    context.strokeStyle = 'rgba(4, 14, 9, 0.34)';
    context.lineWidth = Math.max(0.7, this.scale * 0.018);
    line(context, base[3], base[2]);
    line(context, base[1], base[2]);

    context.globalAlpha = 0.34;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 0.7;
    const glintT = clamp(0.35 + this.light.x * 0.45, 0.12, 0.74);
    const glintA = {
      x: top[0].x + (top[1].x - top[0].x) * glintT,
      y: top[0].y + (top[1].y - top[0].y) * glintT
    };
    const glintB = {
      x: top[3].x + (top[2].x - top[3].x) * glintT,
      y: top[3].y + (top[2].y - top[3].y) * glintT
    };
    line(context, glintA, glintB);
    context.restore();
  }

  drawSceneObjects(context, maze, marble, tilt) {
    const walls = maze.walls.map((wall) => this.wallGeometry(maze, wall));
    for (const geometry of walls) this.drawWallShadow(context, geometry, tilt);
    this.drawMarbleShadow(context, maze, marble, tilt);

    const objects = walls.map((geometry) => ({ type: 'wall', sort: geometry.sort, geometry }));
    objects.push({ type: 'marble', sort: marble.position.y + marble.radius * 0.62 });
    objects.sort((left, right) => left.sort - right.sort);

    for (const object of objects) {
      if (object.type === 'wall') this.drawWall(context, object.geometry);
      else this.drawMarble(context, maze, marble, tilt);
    }
  }

  drawMarbleShadow(context, maze, marble, tilt) {
    const floorCenter = this.project(maze, marble.position.x, marble.position.y, 0.02);
    const radius = Math.max(8, marble.radius * this.scale);
    const offsetX = 3.5 - tilt.x * 2.3;
    const offsetY = 5.5 - tilt.y * 1.8;
    context.save();
    const shadow = context.createRadialGradient(
      floorCenter.x + offsetX,
      floorCenter.y + offsetY,
      radius * 0.08,
      floorCenter.x + offsetX,
      floorCenter.y + offsetY,
      radius * 1.18
    );
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
    shadow.addColorStop(0.54, 'rgba(0, 0, 0, 0.24)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(floorCenter.x + offsetX, floorCenter.y + offsetY, radius * 1.12, radius * 0.68, 0, 0, TAU);
    context.fill();
    context.restore();
  }

  drawMarble(context, maze, marble, tilt) {
    const center = this.project(maze, marble.position.x, marble.position.y, marble.radius * 1.02);
    const radius = Math.max(8, marble.radius * this.scale);
    const speed = marble.speed();
    const highlightX = clamp(this.light.x * radius * 0.72, -radius * 0.52, radius * 0.18);
    const highlightY = clamp(this.light.y * radius * 0.68, -radius * 0.58, -radius * 0.08);

    context.save();
    if (speed > 2.25 && !this.reducedMotion) {
      const length = clamp(speed * 1.7, 4, 11);
      const angle = Math.atan2(marble.velocity.y, marble.velocity.x);
      context.strokeStyle = 'rgba(205, 231, 216, 0.1)';
      context.lineWidth = radius * 0.42;
      context.lineCap = 'round';
      line(context,
        { x: center.x - Math.cos(angle) * length, y: center.y - Math.sin(angle) * length },
        center
      );
    }

    context.translate(center.x, center.y);
    context.shadowColor = 'rgba(0, 0, 0, 0.2)';
    context.shadowBlur = 7;
    context.shadowOffsetY = 2;
    const glass = context.createRadialGradient(highlightX, highlightY, radius * 0.04, 0, 0, radius);
    glass.addColorStop(0, 'rgba(255, 255, 250, 0.98)');
    glass.addColorStop(0.12, 'rgba(218, 244, 232, 0.93)');
    glass.addColorStop(0.36, 'rgba(130, 190, 166, 0.68)');
    glass.addColorStop(0.66, 'rgba(53, 105, 84, 0.55)');
    glass.addColorStop(0.88, 'rgba(15, 47, 35, 0.8)');
    glass.addColorStop(1, 'rgba(3, 16, 10, 0.96)');
    context.fillStyle = glass;
    context.beginPath();
    context.arc(0, 0, radius, 0, TAU);
    context.fill();
    context.shadowColor = 'transparent';

    context.save();
    context.beginPath();
    context.arc(0, 0, radius * 0.91, 0, TAU);
    context.clip();
    context.rotate(marble.spin * 0.46);
    context.strokeStyle = 'rgba(225, 251, 236, 0.26)';
    context.lineWidth = Math.max(1, radius * 0.085);
    context.beginPath();
    context.arc(radius * 0.1, radius * 0.03, radius * 0.62, -1.85, 0.82);
    context.stroke();
    context.strokeStyle = 'rgba(7, 58, 39, 0.34)';
    context.lineWidth = Math.max(1, radius * 0.13);
    context.beginPath();
    context.arc(-radius * 0.17, radius * 0.2, radius * 0.56, 0.38, 2.58);
    context.stroke();
    context.restore();

    const highlight = context.createRadialGradient(highlightX, highlightY, 0, highlightX, highlightY, radius * 0.5);
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    highlight.addColorStop(0.28, 'rgba(255, 255, 255, 0.31)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = highlight;
    context.beginPath();
    context.arc(highlightX, highlightY, radius * 0.44, 0, TAU);
    context.fill();

    context.strokeStyle = 'rgba(235, 252, 241, 0.68)';
    context.lineWidth = Math.max(1, radius * 0.06);
    context.beginPath();
    context.arc(0, 0, radius * 0.95, -2.95, 0.04);
    context.stroke();
    context.strokeStyle = 'rgba(1, 13, 7, 0.6)';
    context.beginPath();
    context.arc(0, 0, radius * 0.96, 0.04, 2.95);
    context.stroke();

    if (marble.impact > 0) {
      context.strokeStyle = `rgba(244, 224, 157, ${marble.impact * 0.65})`;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(0, 0, radius * (1.08 + marble.impact * 0.16), 0, TAU);
      context.stroke();
    }
    context.restore();
  }

  drawScreenGlass(context, tilt) {
    const travel = this.reducedMotion ? 0 : tilt.x * 18 + tilt.y * 8;
    const bandX = this.width * 0.18 + travel;
    const reflection = context.createLinearGradient(bandX - 90, 0, bandX + 150, this.height);
    reflection.addColorStop(0, 'rgba(255, 255, 255, 0)');
    reflection.addColorStop(0.48, 'rgba(231, 241, 230, 0.018)');
    reflection.addColorStop(0.53, 'rgba(255, 255, 255, 0.045)');
    reflection.addColorStop(0.58, 'rgba(231, 241, 230, 0.012)');
    reflection.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = reflection;
    context.fillRect(0, 0, this.width, this.height);

    const topHaze = context.createLinearGradient(0, 0, 0, Math.min(120, this.height * 0.18));
    topHaze.addColorStop(0, 'rgba(223, 235, 224, 0.035)');
    topHaze.addColorStop(1, 'rgba(223, 235, 224, 0)');
    context.fillStyle = topHaze;
    context.fillRect(0, 0, this.width, Math.min(120, this.height * 0.18));
  }

  drawVignette(context) {
    const radius = Math.max(this.width, this.height) * 0.76;
    const vignette = context.createRadialGradient(
      this.width / 2,
      this.height / 2,
      radius * 0.26,
      this.width / 2,
      this.height / 2,
      radius
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.06)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, this.width, this.height);
  }
}
