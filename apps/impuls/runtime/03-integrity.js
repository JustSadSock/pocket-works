const fractureBodyBase = fractureBody;
const restoreWorldBase = restoreWorld;

fractureBody = function fractureBodySafe(body) {
  if (body.shape !== 'circle') return fractureBodyBase(body);

  const index = state.bodies.indexOf(body);
  if (index < 0) return false;
  const available = MAX_BODIES - (state.bodies.length - 1);
  if (available < 2 || body.r < 12 || body.fractureDepth >= 2) {
    body.damage = .92;
    body.fractureDepth = 3;
    return false;
  }

  const count = available >= 3 ? 3 : 2;
  const fragmentRadius = body.r * (count === 3 ? .54 : .67);
  const fragments = [];

  for (let i = 0; i < count; i++) {
    const localAngle = i / count * TAU;
    const worldAngle = body.angle + localAngle;
    const localX = Math.cos(localAngle) * body.r * .38;
    const localY = Math.sin(localAngle) * body.r * .38;
    const worldOffset = rotate(localX, localY, body.angle);
    const x = body.x + worldOffset.x;
    const y = body.y + worldOffset.y;
    const vx = body.vx - body.av * worldOffset.y + Math.cos(worldAngle) * 95;
    const vy = body.vy + body.av * worldOffset.x + Math.sin(worldAngle) * 95;

    fragments.push(createBody('circle', x, y, {
      r: fragmentRadius,
      material: body.material,
      pinned: false,
      vx,
      vy,
      av: body.av + (i - (count - 1) / 2) * 1.1,
      damage: .08,
      fractureDepth: body.fractureDepth + 1,
      damageGrace: .24
    }));
  }

  const survivor = fragments[0];
  for (const constraint of state.constraints) {
    if (constraint.bodyA === body.id) constraint.bodyA = survivor.id;
    if (constraint.bodyB === body.id) constraint.bodyB = survivor.id;
  }
  state.bodies.splice(index, 1, ...fragments);
  if (state.selectedId === body.id) state.selectedId = survivor.id;

  const hitX = typeof body.hitX === 'number' && Number.isFinite(body.hitX) ? body.hitX : body.x;
  const hitY = typeof body.hitY === 'number' && Number.isFinite(body.hitY) ? body.hitY : body.y;
  state.bursts.push({
    x: hitX,
    y: hitY,
    radius: 6,
    maxRadius: Math.min(58, body.r * 1.8),
    life: 1,
    color: MATERIALS[body.material].edge,
    kind: 'break'
  });

  if (performance.now() - state.breakSoundAt > 80) {
    state.breakSoundAt = performance.now();
    sound('break', clamp(body.damage, .3, 1));
  }
  pulseHaptic(10);
  return true;
};

restoreWorld = function restoreWorldSafe(snapshot, rescale = true) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const safeSnapshot = clone(snapshot);
  safeSnapshot.constraints = Array.isArray(safeSnapshot.constraints)
    ? safeSnapshot.constraints.filter(constraint => {
        if (!constraint || !['rope', 'spring'].includes(constraint.type)) return false;
        if (constraint.bodyB) return true;
        return constraint.bx != null && constraint.by != null && Number.isFinite(Number(constraint.bx)) && Number.isFinite(Number(constraint.by));
      })
    : [];
  return restoreWorldBase(safeSnapshot, rescale);
};
