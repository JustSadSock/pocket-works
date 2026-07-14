import { rampAt, surfaceAt, terrainGradientAt, terrainHeightAt, waterAt } from './terrain.js';

export const BALL_RADIUS = 22;
const STOP_SPEED = 12;
const MAX_SPEED = 1780;
const GRAVITY = 1180;
const SLOPE_ACCEL = 960;
const CUP_DEFAULT_DEPTH = 64;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby;
  const t = denominator ? clamp(((px - ax) * abx + (py - ay) * aby) / denominator, 0, 1) : 0;
  return { x: ax + abx * t, y: ay + aby * t, t };
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

function obstacleHeight(obstacle) {
  if (obstacle.material === 'glass') return 72;
  if (obstacle.material === 'cup') return obstacle.r * .86;
  if (obstacle.material === 'pot') return obstacle.r * 1.12;
  if (obstacle.material === 'wood') return obstacle.r * .72;
  if (obstacle.material === 'spoon') return Math.max(10, obstacle.r * .22);
  return obstacle.r * .95;
}

function canClear(ball, topZ) {
  return ball.z - BALL_RADIUS > topZ + 4;
}

function resolveBoundary(ball, level, events) {
  const localGround = terrainHeightAt(level, ball.x, ball.y);
  if (canClear(ball, localGround + 24)) return;
  const polygon = level.outline;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const nearest = closestPointOnSegment(ball.x, ball.y, a.x, a.y, b.x, b.y);
    let dx = ball.x - nearest.x;
    let dy = ball.y - nearest.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= BALL_RADIUS + 4) continue;

    if (distance < .001) {
      const sideX = -(b.y - a.y);
      const sideY = b.x - a.x;
      const sideLength = Math.hypot(sideX, sideY) || 1;
      const normal = { x: sideX / sideLength, y: sideY / sideLength };
      const sample = { x: nearest.x + normal.x * 3, y: nearest.y + normal.y * 3 };
      const sign = pointInPolygon(sample, polygon) ? 1 : -1;
      dx = normal.x * sign;
      dy = normal.y * sign;
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const test = { x: nearest.x + nx * (BALL_RADIUS + 2), y: nearest.y + ny * (BALL_RADIUS + 2) };
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

function resolveCircle(ball, obstacle, level, events) {
  const ground = terrainHeightAt(level, obstacle.x, obstacle.y);
  if (canClear(ball, ground + obstacleHeight(obstacle))) return;
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const minimumDistance = BALL_RADIUS + obstacle.r;
  const distance = Math.hypot(dx, dy);
  if (distance >= minimumDistance || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = obstacle.x + nx * minimumDistance;
  ball.y = obstacle.y + ny * minimumDistance;
  const speed = Math.hypot(ball.vx, ball.vy);
  bounce(ball, nx, ny, materialRestitution(obstacle.material));
  if (speed > 85) events.push({ type: 'collision', material: obstacle.material, speed });
}

function resolveCapsule(ball, wall, level, events, time) {
  let ax = wall.ax;
  let ay = wall.ay;
  let bx = wall.bx;
  let by = wall.by;
  let extraVx = 0;
  let extraVy = 0;

  if (wall.rotor) {
    const angle = wall.angle + time * wall.speed;
    const halfX = Math.cos(angle) * wall.length * .5;
    const halfY = Math.sin(angle) * wall.length * .5;
    ax = wall.x - halfX;
    ay = wall.y - halfY;
    bx = wall.x + halfX;
    by = wall.y + halfY;
  }

  const wallTop = wall.material === 'glass' ? 74 : 38;
  const ground = terrainHeightAt(level, (ax + bx) * .5, (ay + by) * .5);
  if (canClear(ball, ground + wallTop)) return;

  const nearest = closestPointOnSegment(ball.x, ball.y, ax, ay, bx, by);
  const dx = ball.x - nearest.x;
  const dy = ball.y - nearest.y;
  const minimumDistance = BALL_RADIUS + wall.thickness * .5;
  const distance = Math.hypot(dx, dy);
  if (distance >= minimumDistance || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = nearest.x + nx * minimumDistance;
  ball.y = nearest.y + ny * minimumDistance;

  if (wall.rotor) {
    const radiusX = nearest.x - wall.x;
    const radiusY = nearest.y - wall.y;
    extraVx = -radiusY * wall.speed * .24;
    extraVy = radiusX * wall.speed * .24;
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  bounce(ball, nx, ny, materialRestitution(wall.material), extraVx, extraVy);
  if (speed > 85) events.push({ type: 'collision', material: wall.material, speed });
}

function applyTerrainAcceleration(ball, level, dt) {
  if (ball.airborne || ball.inCup) return;
  const gradient = terrainGradientAt(level, ball.x, ball.y);
  ball.vx -= gradient.x * SLOPE_ACCEL * dt;
  ball.vy -= gradient.y * SLOPE_ACCEL * dt;
}

function handleTunnel(ball, level, events) {
  if (ball.tunnelCooldown > 0 || ball.airborne || ball.inCup) return;
  for (const tunnel of level.tunnels || []) {
    if (Math.hypot(ball.x - tunnel.entry.x, ball.y - tunnel.entry.y) > tunnel.entry.r) continue;
    const speed = Math.max(220, Math.hypot(ball.vx, ball.vy));
    const angle = Number.isFinite(tunnel.exit.angle) ? tunnel.exit.angle : Math.atan2(ball.vy, ball.vx);
    ball.x = tunnel.exit.x;
    ball.y = tunnel.exit.y;
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.vx = Math.cos(angle) * speed * .84;
    ball.vy = Math.sin(angle) * speed * .84;
    ball.groundZ = terrainHeightAt(level, ball.x, ball.y);
    ball.z = ball.groundZ + BALL_RADIUS;
    ball.vz = 0;
    ball.airborne = false;
    ball.tunnelCooldown = .8;
    events.push({ type: 'tunnel' });
    break;
  }
}

function maybeLaunchFromRamp(ball, level, previousX, previousY, events) {
  if (ball.airborne || ball.inCup) return;
  const previousRamp = rampAt(level, previousX, previousY);
  const currentRamp = rampAt(level, ball.x, ball.y);
  if (!previousRamp || currentRamp === previousRamp) return;
  const gradient = terrainGradientAt({ zones: [previousRamp] }, previousX, previousY);
  const length = Math.hypot(gradient.x, gradient.y) || 1;
  const uphillX = gradient.x / length;
  const uphillY = gradient.y / length;
  const uphillSpeed = ball.vx * uphillX + ball.vy * uphillY;
  const totalSpeed = Math.hypot(ball.vx, ball.vy);
  if (uphillSpeed < Math.max(120, totalSpeed * .2) || totalSpeed < Number(previousRamp.minLaunchSpeed ?? 360)) return;
  ball.airborne = true;
  ball.grounded = false;
  ball.vz = Number(previousRamp.launch ?? 300) + totalSpeed * .08;
  ball.z = Math.max(ball.z, terrainHeightAt(level, previousX, previousY) + BALL_RADIUS + 1);
  events.push({ type: 'jump', speed: totalSpeed });
}

function stepVertical(ball, level, dt, events) {
  const ground = terrainHeightAt(level, ball.x, ball.y);
  ball.groundZ = ground;
  const target = ground + BALL_RADIUS;

  if (ball.airborne) {
    ball.vz -= GRAVITY * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= target) {
      const impact = -ball.vz;
      ball.z = target;
      ball.vz = 0;
      ball.airborne = false;
      ball.grounded = true;
      if (impact > 140) events.push({ type: 'land', speed: impact });
    }
    return;
  }

  if (ball.z > target + 1.5) {
    ball.airborne = true;
    ball.grounded = false;
    ball.vz = Math.min(0, ball.vz);
    return;
  }

  if (target > ball.z + 1.5) {
    const climb = target - ball.z;
    const speedLoss = clamp(1 - climb / 75, .72, 1);
    ball.vx *= speedLoss;
    ball.vy *= speedLoss;
  }
  ball.z = target;
  ball.vz = 0;
  ball.grounded = true;
}

function cupMetrics(level) {
  const hole = level.hole;
  const surfaceZ = terrainHeightAt(level, hole.x, hole.y);
  const depth = Math.max(52, Number(hole.depth ?? CUP_DEFAULT_DEPTH));
  const throat = Math.max(12, hole.r - BALL_RADIUS * .42);
  const influence = hole.r + BALL_RADIUS * .82;
  const bottomCenterZ = surfaceZ - depth + BALL_RADIUS;
  return { hole, surfaceZ, depth, throat, influence, bottomCenterZ };
}

function stepCup(ball, level, dt, events) {
  const { hole, surfaceZ, throat, influence, bottomCenterZ } = cupMetrics(level);
  let dx = ball.x - hole.x;
  let dy = ball.y - hole.y;
  let distance = Math.hypot(dx, dy);
  const speed = Math.hypot(ball.vx, ball.vy);

  if (!ball.inCup) {
    if (!ball.airborne && distance < influence && ball.z <= surfaceZ + BALL_RADIUS + 4) {
      const pullStrength = (1 - distance / influence) * 300 * (1 - clamp(speed / 820, 0, .82));
      if (distance > .001) {
        ball.vx -= dx / distance * pullStrength * dt;
        ball.vy -= dy / distance * pullStrength * dt;
      }
    }
    if (distance >= throat || ball.z > surfaceZ + BALL_RADIUS + 3 || ball.vz > 100) return false;
    ball.inCup = true;
    ball.airborne = true;
    ball.grounded = false;
    ball.cupEntrySpeed = speed;
  }

  ball.vz -= GRAVITY * dt;
  ball.z += ball.vz * dt;
  dx = ball.x - hole.x;
  dy = ball.y - hole.y;
  distance = Math.hypot(dx, dy);

  if (distance > throat) {
    const escapeAllowance = ball.cupEntrySpeed > 650 ? 10 : ball.cupEntrySpeed > 500 ? 5 : 1;
    if (ball.z >= surfaceZ + BALL_RADIUS - escapeAllowance) {
      ball.inCup = false;
      const outsideGround = terrainHeightAt(level, ball.x, ball.y);
      const outsideTarget = outsideGround + BALL_RADIUS;
      if (ball.z <= outsideTarget) {
        ball.z = outsideTarget;
        ball.vz = 0;
        ball.airborne = false;
        ball.grounded = true;
      }
      events.push({ type: 'lip-out', speed: Math.hypot(ball.vx, ball.vy) });
      return false;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = hole.x + nx * throat;
    ball.y = hole.y + ny * throat;
    const radialVelocity = ball.vx * nx + ball.vy * ny;
    if (radialVelocity > 0) {
      ball.vx -= (1 + .42) * radialVelocity * nx;
      ball.vy -= (1 + .42) * radialVelocity * ny;
    }
    ball.vx *= .9;
    ball.vy *= .9;
    ball.vz *= .82;
    if (Math.abs(radialVelocity) > 90) events.push({ type: 'collision', material: 'cup', speed: Math.abs(radialVelocity) });
  }

  if (ball.z <= bottomCenterZ) {
    const impact = -ball.vz;
    ball.z = bottomCenterZ;
    if (impact > 48) {
      ball.vz = impact * .23;
      events.push({ type: 'cup-bottom', speed: impact });
    } else {
      ball.vz = 0;
    }
    ball.vx *= Math.pow(.78, dt * 60);
    ball.vy *= Math.pow(.78, dt * 60);
    const settledSpeed = Math.hypot(ball.vx, ball.vy);
    if (settledSpeed < 14 && Math.abs(ball.vz) < 10 && distance < throat * .9) {
      ball.sunk = true;
      ball.moving = false;
      ball.airborne = false;
      ball.grounded = false;
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      events.push({ type: 'cup' });
    }
  }
  return true;
}

export function createBall(start, level = null) {
  const groundZ = level ? terrainHeightAt(level, start.x, start.y) : Number(start.z ?? 0);
  return {
    x: start.x,
    y: start.y,
    z: groundZ + BALL_RADIUS,
    prevX: start.x,
    prevY: start.y,
    prevZ: groundZ + BALL_RADIUS,
    groundZ,
    vx: 0,
    vy: 0,
    vz: 0,
    moving: false,
    grounded: true,
    airborne: false,
    inCup: false,
    sunk: false,
    sink: 0,
    cupEntrySpeed: 0,
    waterTime: 0,
    tunnelCooldown: 0,
    surface: 'grass'
  };
}

export function isBallStopped(ball) {
  return !ball.sunk && !ball.airborne && !ball.inCup && Math.hypot(ball.vx, ball.vy) < STOP_SPEED;
}

export function strikeBall(ball, vx, vy) {
  const speed = Math.hypot(vx, vy);
  const scale = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
  ball.vx = vx * scale;
  ball.vy = vy * scale;
  ball.moving = true;
  ball.waterTime = 0;
  ball.inCup = false;
}

export function stepBall(ball, level, dt, time) {
  const events = [];
  if (ball.sunk) {
    ball.sink = Math.min(1, ball.sink + dt * 2.4);
    return events;
  }

  dt = Math.min(dt, 1 / 24);
  const totalSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const substeps = Math.max(1, Math.ceil(totalSpeed * dt / 12));
  const step = dt / substeps;

  for (let index = 0; index < substeps; index += 1) {
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.prevZ = ball.z;

    applyTerrainAcceleration(ball, level, step);
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    resolveBoundary(ball, level, events);
    for (const obstacle of level.obstacles || []) resolveCircle(ball, obstacle, level, events);
    for (const wall of level.walls || []) resolveCapsule(ball, wall, level, events, time);
    for (const rotor of level.rotors || []) resolveCapsule(ball, { ...rotor, rotor: true }, level, events, time);
    handleTunnel(ball, level, events);
    maybeLaunchFromRamp(ball, level, ball.prevX, ball.prevY, events);

    const cupHandled = stepCup(ball, level, step, events);
    if (!cupHandled && !ball.sunk) stepVertical(ball, level, step, events);
    if (ball.sunk) break;
  }

  ball.tunnelCooldown = Math.max(0, ball.tunnelCooldown - dt);
  ball.surface = surfaceAt(level, ball.x, ball.y);
  const friction = ball.surface === 'sand' ? .915 : ball.surface === 'moss' ? .952 : ball.surface === 'bridge' ? .982 : ball.surface === 'ramp' ? .976 : .972;
  const damping = Math.pow(friction, dt * 60);
  if (!ball.airborne || ball.inCup) {
    ball.vx *= damping;
    ball.vy *= damping;
  } else {
    ball.vx *= Math.pow(.995, dt * 60);
    ball.vy *= Math.pow(.995, dt * 60);
  }

  const afterSpeed = Math.hypot(ball.vx, ball.vy);
  const waterNow = waterAt(level, ball.x, ball.y) && !ball.airborne && !ball.inCup;
  if (waterNow) {
    ball.waterTime += dt;
    ball.vx *= Math.pow(.86, dt * 60);
    ball.vy *= Math.pow(.86, dt * 60);
    if (ball.waterTime > .18) events.push({ type: 'water' });
  } else {
    ball.waterTime = 0;
  }

  if (!ball.airborne && !ball.inCup && !ball.sunk && afterSpeed < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    if (ball.moving && !waterNow) events.push({ type: 'stopped' });
    ball.moving = false;
  } else if (!ball.sunk) {
    ball.moving = true;
  }

  return events;
}
