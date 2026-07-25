function boxAxes(body) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  return [{ x: c, y: s }, { x: -s, y: c }];
}

function boxCorners(body) {
  const hw = body.w / 2, hh = body.h / 2;
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y]) => {
    const p = rotate(x, y, body.angle);
    return { x: body.x + p.x, y: body.y + p.y };
  });
}

function projectPoints(points, axis) {
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    const projection = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, projection); max = Math.max(max, projection);
  }
  return { min, max };
}

function supportPoint(body, nx, ny) {
  if (body.shape === 'circle') return { x: body.x + nx * body.r, y: body.y + ny * body.r };
  const corners = boxCorners(body);
  let best = corners[0], bestDot = -Infinity;
  for (const corner of corners) {
    const value = corner.x * nx + corner.y * ny;
    if (value > bestDot) { bestDot = value; best = corner; }
  }
  return best;
}

function collideCircleCircle(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const normal = normalize(dx, dy);
  const penetration = a.r + b.r - normal.length;
  if (penetration <= 0) return null;
  return { nx: normal.x, ny: normal.y, penetration, cx: a.x + normal.x * (a.r - penetration * .5), cy: a.y + normal.y * (a.r - penetration * .5) };
}

function collideCircleBox(circle, box, flip = false) {
  const local = rotate(circle.x - box.x, circle.y - box.y, -box.angle);
  const closestX = clamp(local.x, -box.w / 2, box.w / 2);
  const closestY = clamp(local.y, -box.h / 2, box.h / 2);
  let dx = local.x - closestX;
  let dy = local.y - closestY;
  let distance = Math.hypot(dx, dy);
  let penetration;
  if (distance === 0) {
    const px = box.w / 2 - Math.abs(local.x);
    const py = box.h / 2 - Math.abs(local.y);
    if (px < py) { dx = local.x >= 0 ? 1 : -1; dy = 0; distance = 1; penetration = circle.r + px; }
    else { dx = 0; dy = local.y >= 0 ? 1 : -1; distance = 1; penetration = circle.r + py; }
  } else penetration = circle.r - distance;
  if (penetration <= 0) return null;
  const worldNormal = rotate(dx / distance, dy / distance, box.angle);
  const contactLocal = { x: closestX, y: closestY };
  const contactWorld = rotate(contactLocal.x, contactLocal.y, box.angle);
  const collision = { nx: -worldNormal.x, ny: -worldNormal.y, penetration, cx: box.x + contactWorld.x, cy: box.y + contactWorld.y };
  if (flip) { collision.nx *= -1; collision.ny *= -1; }
  return collision;
}

function collideBoxBox(a, b) {
  const pointsA = boxCorners(a), pointsB = boxCorners(b);
  const axes = [...boxAxes(a), ...boxAxes(b)];
  let minOverlap = Infinity;
  let bestAxis = null;
  for (const axis of axes) {
    const pa = projectPoints(pointsA, axis), pb = projectPoints(pointsB, axis);
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) { minOverlap = overlap; bestAxis = axis; }
  }
  const centerDirection = { x: b.x - a.x, y: b.y - a.y };
  if (dot(centerDirection.x, centerDirection.y, bestAxis.x, bestAxis.y) < 0) bestAxis = { x: -bestAxis.x, y: -bestAxis.y };
  const pa = supportPoint(a, bestAxis.x, bestAxis.y);
  const pb = supportPoint(b, -bestAxis.x, -bestAxis.y);
  return { nx: bestAxis.x, ny: bestAxis.y, penetration: minOverlap, cx: (pa.x + pb.x) / 2, cy: (pa.y + pb.y) / 2 };
}

function detectCollision(a, b) {
  if (!a.invMass && !b.invMass) return null;
  if (a.shape === 'circle' && b.shape === 'circle') return collideCircleCircle(a, b);
  if (a.shape === 'circle' && b.shape === 'box') return collideCircleBox(a, b, false);
  if (a.shape === 'box' && b.shape === 'circle') return collideCircleBox(b, a, true);
  return collideBoxBox(a, b);
}

function resolveCollision(a, b, collision) {
  const { nx, ny, penetration, cx, cy } = collision;
  const totalInvMass = a.invMass + b.invMass;
  if (totalInvMass <= 0) return;
  const correction = Math.max(penetration - .5, 0) / totalInvMass * .72;
  a.x -= nx * correction * a.invMass;
  a.y -= ny * correction * a.invMass;
  b.x += nx * correction * b.invMass;
  b.y += ny * correction * b.invMass;

  const raX = cx - a.x, raY = cy - a.y;
  const rbX = cx - b.x, rbY = cy - b.y;
  const vaX = a.vx - a.av * raY, vaY = a.vy + a.av * raX;
  const vbX = b.vx - b.av * rbY, vbY = b.vy + b.av * rbX;
  const rvX = vbX - vaX, rvY = vbY - vaY;
  const velocityAlongNormal = dot(rvX, rvY, nx, ny);
  if (velocityAlongNormal > 0) return;

  const raCrossN = raX * ny - raY * nx;
  const rbCrossN = rbX * ny - rbY * nx;
  const denominator = a.invMass + b.invMass + raCrossN * raCrossN * a.invInertia + rbCrossN * rbCrossN * b.invInertia;
  if (!denominator) return;
  const restitution = Math.min(MATERIALS[a.material].restitution, MATERIALS[b.material].restitution);
  const impulseMagnitude = -(1 + restitution) * velocityAlongNormal / denominator;
  const ix = nx * impulseMagnitude, iy = ny * impulseMagnitude;
  a.vx -= ix * a.invMass; a.vy -= iy * a.invMass; a.av -= raCrossN * impulseMagnitude * a.invInertia;
  b.vx += ix * b.invMass; b.vy += iy * b.invMass; b.av += rbCrossN * impulseMagnitude * b.invInertia;

  const tangentXRaw = rvX - velocityAlongNormal * nx;
  const tangentYRaw = rvY - velocityAlongNormal * ny;
  const tangent = normalize(tangentXRaw, tangentYRaw);
  const raCrossT = raX * tangent.y - raY * tangent.x;
  const rbCrossT = rbX * tangent.y - rbY * tangent.x;
  const tangentDenominator = a.invMass + b.invMass + raCrossT * raCrossT * a.invInertia + rbCrossT * rbCrossT * b.invInertia;
  if (tangentDenominator) {
    let jt = -dot(rvX, rvY, tangent.x, tangent.y) / tangentDenominator;
    const friction = Math.sqrt(MATERIALS[a.material].friction * MATERIALS[b.material].friction);
    jt = clamp(jt, -impulseMagnitude * friction, impulseMagnitude * friction);
    const fix = tangent.x * jt, fiy = tangent.y * jt;
    a.vx -= fix * a.invMass; a.vy -= fiy * a.invMass; a.av -= raCrossT * jt * a.invInertia;
    b.vx += fix * b.invMass; b.vy += fiy * b.invMass; b.av += rbCrossT * jt * b.invInertia;
  }

  if (Math.abs(velocityAlongNormal) > 220 && performance.now() - state.collisionSoundAt > 70) {
    state.collisionSoundAt = performance.now();
    sound('collision', clamp(Math.abs(velocityAlongNormal) / 850, .1, 1));
  }
}

function resolveBounds(body) {
  if (!body.invMass) return;
  const material = MATERIALS[body.material];
  const bounce = material.restitution;
  const friction = 1 - material.friction * .08;
  if (body.shape === 'circle') {
    if (body.x - body.r < 0) { body.x = body.r; if (body.vx < 0) body.vx *= -bounce; body.vy *= friction; }
    if (body.x + body.r > state.worldWidth) { body.x = state.worldWidth - body.r; if (body.vx > 0) body.vx *= -bounce; body.vy *= friction; }
    if (body.y - body.r < 0) { body.y = body.r; if (body.vy < 0) body.vy *= -bounce; body.vx *= friction; }
    if (body.y + body.r > state.worldHeight) { body.y = state.worldHeight - body.r; if (body.vy > 0) body.vy *= -bounce; body.vx *= friction; body.av *= .88; }
  } else {
    const corners = boxCorners(body);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const corner of corners) { minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x); minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y); }
    if (minX < 0) { body.x -= minX; if (body.vx < 0) body.vx *= -bounce; body.vy *= friction; body.av *= .82; }
    if (maxX > state.worldWidth) { body.x -= maxX - state.worldWidth; if (body.vx > 0) body.vx *= -bounce; body.vy *= friction; body.av *= .82; }
    if (minY < 0) { body.y -= minY; if (body.vy < 0) body.vy *= -bounce; body.vx *= friction; body.av *= .82; }
    if (maxY > state.worldHeight) { body.y -= maxY - state.worldHeight; if (body.vy > 0) body.vy *= -bounce; body.vx *= friction; body.av *= .82; }
  }
}

function applyFields(dt) {
  for (const field of state.fields) {
    for (const body of state.bodies) {
      if (!body.invMass) continue;
      const dx = field.x - body.x, dy = field.y - body.y;
      const vector = normalize(dx, dy);
      if (vector.length > field.radius || vector.length < 3) continue;
      const falloff = 1 - vector.length / field.radius;
      const acceleration = field.strength * falloff * field.polarity;
      body.vx += vector.x * acceleration * dt;
      body.vy += vector.y * acceleration * dt;
    }
  }
}

function solveConstraints(dt) {
  for (const constraint of state.constraints) {
    const a = bodyById(constraint.bodyA);
    const b = constraint.bodyB ? bodyById(constraint.bodyB) : null;
    if (!a || (constraint.bodyB && !b)) continue;
    const bx = b ? b.x : constraint.bx;
    const by = b ? b.y : constraint.by;
    const dx = bx - a.x, dy = by - a.y;
    const vector = normalize(dx, dy);
    const stretch = vector.length - constraint.rest;
    constraint.tension = stretch / Math.max(1, constraint.rest);
    if (constraint.type === 'rope') {
      if (stretch <= 0) continue;
      const invTotal = a.invMass + (b?.invMass || 0);
      if (!invTotal) continue;
      const correction = stretch * constraint.stiffness / invTotal;
      a.x += vector.x * correction * a.invMass;
      a.y += vector.y * correction * a.invMass;
      if (b) { b.x -= vector.x * correction * b.invMass; b.y -= vector.y * correction * b.invMass; }
      const relativeVelocity = dot((b?.vx || 0) - a.vx, (b?.vy || 0) - a.vy, vector.x, vector.y);
      const dampingImpulse = relativeVelocity * constraint.damping / invTotal;
      a.vx += vector.x * dampingImpulse * a.invMass;
      a.vy += vector.y * dampingImpulse * a.invMass;
      if (b) { b.vx -= vector.x * dampingImpulse * b.invMass; b.vy -= vector.y * dampingImpulse * b.invMass; }
    } else {
      const force = stretch * 38 * constraint.stiffness;
      const relativeVelocity = dot((b?.vx || 0) - a.vx, (b?.vy || 0) - a.vy, vector.x, vector.y);
      const damped = force + relativeVelocity * 2.6 * constraint.damping;
      if (a.invMass) { a.vx += vector.x * damped * a.invMass * dt; a.vy += vector.y * damped * a.invMass * dt; }
      if (b?.invMass) { b.vx -= vector.x * damped * b.invMass * dt; b.vy -= vector.y * damped * b.invMass * dt; }
    }
  }
}

function simulate(dt) {
  applyFields(dt);
  for (const body of state.bodies) {
    if (!body.invMass) continue;
    if (state.pointer?.bodyId === body.id && state.tool === 'hand') continue;
    const gravityScale = body.customGravity ?? MATERIALS[body.material].gravityScale;
    body.vy += state.gravity * gravityScale * dt;
    body.vx *= Math.pow(.9992, dt * 60);
    body.vy *= Math.pow(.9992, dt * 60);
    body.av *= Math.pow(.996, dt * 60);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.av * dt;
  }

  solveConstraints(dt);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < state.bodies.length; i++) {
      const a = state.bodies[i];
      for (let j = i + 1; j < state.bodies.length; j++) {
        const b = state.bodies[j];
        if (!a.invMass && !b.invMass) continue;
        const maxDistance = (a.shape === 'circle' ? a.r : Math.hypot(a.w, a.h) / 2) + (b.shape === 'circle' ? b.r : Math.hypot(b.w, b.h) / 2) + 2;
        if (Math.abs(a.x - b.x) > maxDistance || Math.abs(a.y - b.y) > maxDistance) continue;
        const collision = detectCollision(a, b);
        if (collision) resolveCollision(a, b, collision);
      }
    }
    for (const body of state.bodies) resolveBounds(body);
    solveConstraints(dt);
  }

  for (const burst of state.bursts) {
    burst.life -= dt * 2.4;
    burst.radius += (burst.maxRadius - burst.radius) * .16;
  }
  state.bursts = state.bursts.filter(burst => burst.life > 0);
}
