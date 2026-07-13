const EPS = 1e-6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function closestPoint(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > EPS ? clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1) : 0;
  return { x: x1 + dx * t, y: y1 + dy * t, t };
}

function insideZone(zone, x, y, padding = 0) {
  if (zone.shape === 'circle') {
    return Math.hypot(x - zone.x, y - zone.y) <= Math.max(0, zone.r - padding);
  }
  return x >= zone.x + padding && x <= zone.x + zone.w - padding
    && y >= zone.y + padding && y <= zone.y + zone.h - padding;
}

function segmentVelocity(segment, point) {
  if (!segment.motion) return { x: 0, y: 0 };
  if (segment.motion.type === 'translate') return { x: segment.motion.vx, y: segment.motion.vy };
  const rx = point.x - segment.motion.cx;
  const ry = point.y - segment.motion.cy;
  return { x: -ry * segment.motion.omega, y: rx * segment.motion.omega };
}

function collideSegment(body, segment, restitution = 0.78) {
  const point = closestPoint(segment.x1, segment.y1, segment.x2, segment.y2, body.x, body.y);
  let nx = body.x - point.x;
  let ny = body.y - point.y;
  let distance = Math.hypot(nx, ny);
  const target = body.radius + (segment.width || 24) * 0.5;
  if (distance >= target) return 0;

  if (distance < EPS) {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Math.hypot(dx, dy) || 1;
    nx = -dy / length;
    ny = dx / length;
    distance = 0;
  } else {
    nx /= distance;
    ny /= distance;
  }

  const penetration = target - distance;
  body.x += nx * (penetration + 0.25);
  body.y += ny * (penetration + 0.25);

  const wallVelocity = segmentVelocity(segment, point);
  const rvx = body.vx - wallVelocity.x;
  const rvy = body.vy - wallVelocity.y;
  const normalVelocity = rvx * nx + rvy * ny;
  if (normalVelocity >= 0) return 0;

  const impulse = -(1 + restitution) * normalVelocity;
  body.vx += nx * impulse + wallVelocity.x * 0.08;
  body.vy += ny * impulse + wallVelocity.y * 0.08;
  return Math.abs(normalVelocity);
}

function collideCircle(body, circle, restitution = 0.88) {
  let dx = body.x - circle.x;
  let dy = body.y - circle.y;
  let distance = Math.hypot(dx, dy);
  const target = body.radius + circle.r;
  if (distance >= target) return 0;
  if (distance < EPS) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const penetration = target - distance;
  body.x += nx * (penetration + 0.25);
  body.y += ny * (penetration + 0.25);
  const normalVelocity = body.vx * nx + body.vy * ny;
  if (normalVelocity >= 0) return 0;
  const impulse = -(1 + restitution) * normalVelocity;
  body.vx += nx * impulse;
  body.vy += ny * impulse;
  return Math.abs(normalVelocity);
}

export function dynamicSegments(course, time) {
  const segments = [];
  for (const gate of course.gates || []) {
    const wave = Math.sin(time * gate.speed + gate.phase);
    const velocity = gate.amplitude * gate.speed * Math.cos(time * gate.speed + gate.phase);
    const ox = gate.axis === 'x' ? gate.amplitude * wave : 0;
    const oy = gate.axis === 'y' ? gate.amplitude * wave : 0;
    segments.push({
      x1: gate.x1 + ox,
      y1: gate.y1 + oy,
      x2: gate.x2 + ox,
      y2: gate.y2 + oy,
      width: gate.width,
      material: 'gate',
      motion: { type: 'translate', vx: gate.axis === 'x' ? velocity : 0, vy: gate.axis === 'y' ? velocity : 0 }
    });
  }

  for (const rotor of course.rotors || []) {
    const angle = time * rotor.speed + rotor.phase;
    for (let index = 0; index < rotor.arms; index += 1) {
      const armAngle = angle + index * Math.PI * 2 / rotor.arms;
      segments.push({
        x1: rotor.x,
        y1: rotor.y,
        x2: rotor.x + Math.cos(armAngle) * rotor.length,
        y2: rotor.y + Math.sin(armAngle) * rotor.length,
        width: rotor.width,
        material: 'rotor',
        motion: { type: 'rotate', cx: rotor.x, cy: rotor.y, omega: rotor.speed }
      });
    }
  }
  return segments;
}

function terrainAt(course, x, y) {
  let terrain = 'turf';
  let ax = 0;
  let ay = 0;
  for (const zone of course.zones || []) {
    if (!insideZone(zone, x, y)) continue;
    if (zone.type === 'sand') terrain = 'sand';
    if (zone.type === 'slope') {
      ax += zone.ax || 0;
      ay += zone.ay || 0;
    }
  }
  return { terrain, ax, ay };
}

function waterAt(course, x, y, radius) {
  return (course.zones || []).find((zone) => zone.type === 'water' && insideZone(zone, x, y, radius * 0.24));
}

export class GolfPhysics {
  constructor(course) {
    this.radius = 22;
    this.course = course;
    this.x = course.start.x;
    this.y = course.start.y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.sunk = false;
    this.capturing = false;
    this.captureClock = 0;
    this.hazard = false;
    this.portalCooldown = 0;
    this.impactCooldown = 0;
    this.lastSafe = { ...course.start };
  }

  setCourse(course) {
    this.course = course;
    this.reset(course.start);
  }

  reset(position = this.course.start) {
    this.x = position.x;
    this.y = position.y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.sunk = false;
    this.capturing = false;
    this.captureClock = 0;
    this.hazard = false;
    this.portalCooldown = 0;
    this.impactCooldown = 0;
    this.lastSafe = { x: position.x, y: position.y };
  }

  shoot(vx, vy) {
    if (!this.canShoot()) return false;
    this.vx = vx;
    this.vy = vy;
    this.capturing = false;
    this.captureClock = 0;
    return true;
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  canShoot() {
    return !this.sunk && !this.hazard && !this.capturing && this.speed() < 12;
  }

  update(dt, time) {
    const events = [];
    if (this.sunk || this.hazard) return events;
    dt = Math.min(0.035, Math.max(0, dt));
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);

    const hole = this.course.hole;
    const holeDistance = Math.hypot(this.x - hole.x, this.y - hole.y);
    const currentSpeed = this.speed();
    if (!this.capturing && holeDistance < 44 && currentSpeed < 250) {
      this.capturing = true;
      this.captureClock = 0;
      events.push({ type: 'capture' });
    }

    if (this.capturing) {
      this.captureClock += dt;
      const dx = hole.x - this.x;
      const dy = hole.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      this.vx += (dx / distance) * 860 * dt;
      this.vy += (dy / distance) * 860 * dt;
      const drag = Math.pow(0.82, dt * 60);
      this.vx *= drag;
      this.vy *= drag;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (distance < 5 || this.captureClock > 0.68) {
        this.x = hole.x;
        this.y = hole.y;
        this.vx = 0;
        this.vy = 0;
        this.sunk = true;
        events.push({ type: 'sunk' });
      }
      return events;
    }

    const speed = this.speed();
    const steps = Math.max(1, Math.ceil(speed * dt / (this.radius * 0.55)));
    const subDt = dt / steps;
    let strongestImpact = 0;

    for (let step = 0; step < steps; step += 1) {
      const terrain = terrainAt(this.course, this.x, this.y);
      this.vx += terrain.ax * subDt;
      this.vy += terrain.ay * subDt;
      const friction = terrain.terrain === 'sand' ? 0.948 : 0.9865;
      const damping = Math.pow(friction, subDt * 60);
      this.vx *= damping;
      this.vy *= damping;

      this.x += this.vx * subDt;
      this.y += this.vy * subDt;

      const segments = [...this.course.walls, ...dynamicSegments(this.course, time + step * subDt)];
      for (const segment of segments) {
        const restitution = segment.material === 'glass' ? 0.84 : segment.material === 'rotor' ? 0.92 : 0.79;
        strongestImpact = Math.max(strongestImpact, collideSegment(this, segment, restitution));
      }
      for (const bumper of this.course.bumpers || []) {
        strongestImpact = Math.max(strongestImpact, collideCircle(this, bumper, bumper.kind === 'planter' ? 0.72 : 0.92));
      }

      const water = waterAt(this.course, this.x, this.y, this.radius);
      if (water) {
        this.hazard = true;
        this.vx = 0;
        this.vy = 0;
        events.push({ type: 'water', zone: water });
        break;
      }

      if (this.portalCooldown <= 0 && this.speed() > 35) {
        const portal = (this.course.portals || []).find((item) => Math.hypot(this.x - item.x, this.y - item.y) < item.r - 4);
        if (portal) {
          const pair = this.course.portals.find((item) => item.id === portal.pair);
          if (pair) {
            const magnitude = this.speed() || 1;
            const dx = this.vx / magnitude;
            const dy = this.vy / magnitude;
            this.x = pair.x + dx * (pair.r + this.radius + 8);
            this.y = pair.y + dy * (pair.r + this.radius + 8);
            this.portalCooldown = 0.82;
            events.push({ type: 'portal', from: portal, to: pair });
          }
        }
      }
    }

    const movedSpeed = this.speed();
    this.rotation += movedSpeed * dt / this.radius;
    if (movedSpeed < 7.5) {
      this.vx = 0;
      this.vy = 0;
      if (!waterAt(this.course, this.x, this.y, this.radius)) this.lastSafe = { x: this.x, y: this.y };
    }

    if (strongestImpact > 80 && this.impactCooldown <= 0) {
      this.impactCooldown = 0.09;
      events.push({ type: 'impact', strength: strongestImpact });
    }
    return events;
  }
}

export function predictShot(course, start, velocity, time, options = {}) {
  const radius = options.radius || 22;
  const body = { x: start.x, y: start.y, vx: velocity.x, vy: velocity.y, radius };
  const points = [{ x: body.x, y: body.y }];
  const staticSegments = [...course.walls, ...dynamicSegments(course, time)];
  const dt = 1 / 55;
  for (let step = 0; step < 170; step += 1) {
    const terrain = terrainAt(course, body.x, body.y);
    body.vx += terrain.ax * dt;
    body.vy += terrain.ay * dt;
    const damping = terrain.terrain === 'sand' ? 0.948 : 0.9865;
    body.vx *= damping;
    body.vy *= damping;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    for (const segment of staticSegments) collideSegment(body, segment, segment.material === 'glass' ? 0.84 : 0.79);
    for (const bumper of course.bumpers || []) collideCircle(body, bumper, bumper.kind === 'planter' ? 0.72 : 0.92);
    if (step % 4 === 0) points.push({ x: body.x, y: body.y });
    if (waterAt(course, body.x, body.y, radius)) break;
    if (Math.hypot(body.x - course.hole.x, body.y - course.hole.y) < 35 && Math.hypot(body.vx, body.vy) < 240) {
      points.push({ x: course.hole.x, y: course.hole.y });
      break;
    }
    if (Math.hypot(body.vx, body.vy) < 18) break;
  }
  return points;
}
