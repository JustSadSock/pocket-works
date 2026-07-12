const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class MarblePhysics {
  constructor({ radius = 0.265 } = {}) {
    this.radius = radius;
    this.position = { x: 0.5, y: 0.5 };
    this.velocity = { x: 0, y: 0 };
    this.spin = 0;
    this.impact = 0;
    this.lastCollisionAt = -Infinity;
  }

  reset(position) {
    this.position.x = position.x;
    this.position.y = position.y;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.spin = 0;
    this.impact = 0;
  }

  update(deltaSeconds, tilt, maze, onCollision) {
    const dt = clamp(deltaSeconds, 0, 0.035);
    if (dt <= 0) return;

    const acceleration = 8.8;
    const drag = Math.exp(-1.55 * dt);
    this.velocity.x += clamp(tilt.x, -1.2, 1.2) * acceleration * dt;
    this.velocity.y += clamp(tilt.y, -1.2, 1.2) * acceleration * dt;
    this.velocity.x *= drag;
    this.velocity.y *= drag;

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const maxSpeed = 5.7;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
    }

    const steps = Math.max(2, Math.min(7, Math.ceil((speed * dt) / (this.radius * 0.35))));
    const substep = dt / steps;
    for (let index = 0; index < steps; index += 1) {
      this.position.x += this.velocity.x * substep;
      this.position.y += this.velocity.y * substep;
      this.resolveWalls(maze.walls, onCollision);
    }

    this.spin += speed * dt * 2.7;
    this.impact = Math.max(0, this.impact - dt * 4.5);
  }

  resolveWalls(walls, onCollision) {
    for (const wall of walls) {
      const closestX = clamp(this.position.x, wall.x, wall.x + wall.width);
      const closestY = clamp(this.position.y, wall.y, wall.y + wall.height);
      let dx = this.position.x - closestX;
      let dy = this.position.y - closestY;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= this.radius * this.radius) continue;

      let nx;
      let ny;
      let distance = Math.sqrt(distanceSquared);
      if (distance > 0.0001) {
        nx = dx / distance;
        ny = dy / distance;
      } else {
        const left = Math.abs(this.position.x - wall.x);
        const right = Math.abs(wall.x + wall.width - this.position.x);
        const top = Math.abs(this.position.y - wall.y);
        const bottom = Math.abs(wall.y + wall.height - this.position.y);
        const minimum = Math.min(left, right, top, bottom);
        if (minimum === left) { nx = -1; ny = 0; }
        else if (minimum === right) { nx = 1; ny = 0; }
        else if (minimum === top) { nx = 0; ny = -1; }
        else { nx = 0; ny = 1; }
        distance = 0;
      }

      const penetration = this.radius - distance + 0.0005;
      this.position.x += nx * penetration;
      this.position.y += ny * penetration;

      const normalVelocity = this.velocity.x * nx + this.velocity.y * ny;
      if (normalVelocity < 0) {
        const speedBefore = Math.hypot(this.velocity.x, this.velocity.y);
        const restitution = 0.34;
        this.velocity.x -= (1 + restitution) * normalVelocity * nx;
        this.velocity.y -= (1 + restitution) * normalVelocity * ny;
        this.velocity.x *= 0.94;
        this.velocity.y *= 0.94;
        this.impact = clamp(speedBefore / 4.6, 0.16, 1);
        const now = performance.now();
        if (now - this.lastCollisionAt > 68) {
          this.lastCollisionAt = now;
          onCollision?.(speedBefore);
        }
      }
    }
  }

  speed() {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }
}
