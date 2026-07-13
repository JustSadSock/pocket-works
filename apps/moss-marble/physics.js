export const BALL_RADIUS = 22;
const STOP_SPEED = 12;
const MAX_SPEED = 1780;

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby;
  const t = denom ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / denom)) : 0;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

function insideRect(p, zone) {
  return p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;
}

function insideCircle(p, zone) {
  return Math.hypot(p.x - zone.x, p.y - zone.y) <= zone.r;
}

export function insideZone(point, zone) {
  return zone.shape === 'circle' ? insideCircle(point, zone) : insideRect(point, zone);
}

function materialRestitution(material) {
  if (material === 'glass') return .82;
  if (material === 'brass') return .88;
  if (material === 'stone') return .78;
  if (material === 'cup' || material === 'sugar') return .72;
  return .68;
}

function bounce(ball, nx, ny, restitution, extraVx = 0, extraVy = 0) {
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx -= (1 + restitution) * dot * nx;
    ball.vy -= (1 + restitution) * dot * ny;
  }
  ball.vx += extraVx;
  ball.vy += extraVy;
}

function resolveBoundary(ball, level, events) {
  const polygon = level.outline;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const q = closestPointOnSegment(ball.x, ball.y, a.x, a.y, b.x, b.y);
    let dx = ball.x - q.x;
    let dy = ball.y - q.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= BALL_RADIUS + 4) continue;

    if (distance < .001) {
      const sx = -(b.y - a.y);
      const sy = b.x - a.x;
      const sm = Math.hypot(sx, sy) || 1;
      const n1 = { x: sx / sm, y: sy / sm };
      const sample = { x: q.x + n1.x * 3, y: q.y + n1.y * 3 };
      const sign = pointInPolygon(sample, polygon) ? 1 : -1;
      dx = n1.x * sign;
      dy = n1.y * sign;
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const test = { x: q.x + nx * (BALL_RADIUS + 2), y: q.y + ny * (BALL_RADIUS + 2) };
    if (!pointInPolygon(test, polygon)) continue;

    const push = BALL_RADIUS + 4 - distance;
    ball.x += nx * push;
    ball.y += ny * push;
    const speed = Math.hypot(ball.vx, ball.vy);
    bounce(ball, nx, ny, .66);
    if (speed > 100) events.push({ type: 'collision', material: 'wood', speed });
  }

  if (!pointInPolygon(ball, polygon)) {
    ball.x = ball.prevX;
    ball.y = ball.prevY;
    ball.vx *= -.54;
    ball.vy *= -.54;
  }
}

function resolveCircle(ball, obstacle, events) {
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const minDistance = BALL_RADIUS + obstacle.r;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = obstacle.x + nx * minDistance;
  ball.y = obstacle.y + ny * minDistance;
  const speed = Math.hypot(ball.vx, ball.vy);
  bounce(ball, nx, ny, materialRestitution(obstacle.material));
  if (speed > 85) events.push({ type: 'collision', material: obstacle.material, speed });
}

function resolveCapsule(ball, wall, events, time) {
  let ax = wall.ax;
  let ay = wall.ay;
  let bx = wall.bx;
  let by = wall.by;
  let extraVx = 0;
  let extraVy = 0;

  if (wall.rotor) {
    const angle = wall.angle + time * wall.speed;
    const hx = Math.cos(angle) * wall.length * .5;
    const hy = Math.sin(angle) * wall.length * .5;
    ax = wall.x - hx; ay = wall.y - hy; bx = wall.x + hx; by = wall.y + hy;
  }

  const q = closestPointOnSegment(ball.x, ball.y, ax, ay, bx, by);
  const dx = ball.x - q.x;
  const dy = ball.y - q.y;
  const minDistance = BALL_RADIUS + wall.thickness * .5;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = q.x + nx * minDistance;
  ball.y = q.y + ny * minDistance;

  if (wall.rotor) {
    const rx = q.x - wall.x;
    const ry = q.y - wall.y;
    extraVx = -ry * wall.speed * .24;
    extraVy = rx * wall.speed * .24;
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  bounce(ball, nx, ny, materialRestitution(wall.material), extraVx, extraVy);
  if (speed > 85) events.push({ type: 'collision', material: wall.material, speed });
}

function currentSurface(ball, level) {
  let surface = 'grass';
  for (const zone of level.zones || []) {
    if (!insideZone(ball, zone)) continue;
    if (zone.type === 'bridge') return 'bridge';
    if (zone.type === 'sand') surface = 'sand';
    if (zone.type === 'moss') surface = 'moss';
  }
  return surface;
}

function isInWater(ball, level) {
  let water = false;
  for (const zone of level.zones || []) {
    if (!insideZone(ball, zone)) continue;
    if (zone.type === 'water') water = true;
    if (zone.type === 'bridge') water = false;
  }
  return water;
}

function applySlopes(ball, level, dt) {
  for (const zone of level.zones || []) {
    if (zone.type !== 'slope' || !insideZone(ball, zone)) continue;
    ball.vx += (zone.forceX || 0) * dt;
    ball.vy += (zone.forceY || 0) * dt;
  }
}

function handleTunnel(ball, level, events) {
  if (ball.tunnelCooldown > 0) return;
  for (const tunnel of level.tunnels || []) {
    if (Math.hypot(ball.x - tunnel.entry.x, ball.y - tunnel.entry.y) > tunnel.entry.r) continue;
    const speed = Math.max(220, Math.hypot(ball.vx, ball.vy));
    const angle = Math.atan2(ball.vy, ball.vx);
    ball.x = tunnel.exit.x;
    ball.y = tunnel.exit.y;
    ball.vx = Math.cos(angle) * speed * .84;
    ball.vy = Math.sin(angle) * speed * .84;
    ball.tunnelCooldown = .8;
    events.push({ type: 'tunnel' });
    break;
  }
}

export function createBall(start) {
  return {
    x: start.x, y: start.y, prevX: start.x, prevY: start.y,
    vx: 0, vy: 0, moving: false, sunk: false, sink: 0,
    waterTime: 0, tunnelCooldown: 0, surface: 'grass'
  };
}

export function isBallStopped(ball) {
  return !ball.sunk && Math.hypot(ball.vx, ball.vy) < STOP_SPEED;
}

export function strikeBall(ball, vx, vy) {
  const speed = Math.hypot(vx, vy);
  const scale = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
  ball.vx = vx * scale;
  ball.vy = vy * scale;
  ball.moving = true;
  ball.waterTime = 0;
}

export function stepBall(ball, level, dt, time) {
  const events = [];
  if (ball.sunk) {
    ball.sink = Math.min(1, ball.sink + dt * 2.8);
    return events;
  }

  dt = Math.min(dt, 1 / 24);
  const speed = Math.hypot(ball.vx, ball.vy);
  const substeps = Math.max(1, Math.ceil(speed * dt / 14));
  const step = dt / substeps;

  for (let i = 0; i < substeps; i += 1) {
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    applySlopes(ball, level, step);
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    resolveBoundary(ball, level, events);
    for (const obstacle of level.obstacles || []) resolveCircle(ball, obstacle, events);
    for (const wall of level.walls || []) resolveCapsule(ball, wall, events, time);
    for (const rotor of level.rotors || []) resolveCapsule(ball, { ...rotor, rotor: true }, events, time);
    handleTunnel(ball, level, events);
  }

  ball.tunnelCooldown = Math.max(0, ball.tunnelCooldown - dt);
  ball.surface = currentSurface(ball, level);
  const friction = ball.surface === 'sand' ? .925 : ball.surface === 'moss' ? .955 : ball.surface === 'bridge' ? .982 : .972;
  const damping = Math.pow(friction, dt * 60);
  ball.vx *= damping;
  ball.vy *= damping;

  const afterSpeed = Math.hypot(ball.vx, ball.vy);
  if (afterSpeed < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    if (ball.moving) events.push({ type: 'stopped' });
    ball.moving = false;
  } else {
    ball.moving = true;
  }

  if (isInWater(ball, level)) {
    ball.waterTime += dt;
    ball.vx *= Math.pow(.88, dt * 60);
    ball.vy *= Math.pow(.88, dt * 60);
    if (ball.waterTime > .18) events.push({ type: 'water' });
  } else {
    ball.waterTime = 0;
  }

  const holeDistance = Math.hypot(ball.x - level.hole.x, ball.y - level.hole.y);
  if (holeDistance < level.hole.r + 4 && afterSpeed < 260) {
    ball.sunk = true;
    ball.vx = 0;
    ball.vy = 0;
    ball.moving = false;
    ball.x = level.hole.x;
    ball.y = level.hole.y;
    events.push({ type: 'cup' });
  }

  return events;
}
