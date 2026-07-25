function onPointerDown(event) {
  if (event.button != null && event.button !== 0) return;
  ensureAudio();
  canvas.setPointerCapture?.(event.pointerId);
  const point = pointerPosition(event);
  const now = performance.now();
  state.pointer = { id: event.pointerId, sx: point.x, sy: point.y, x: point.x, y: point.y, px: point.x, py: point.y, time: now, lastTime: now, bodyId: null, moved: false };
  gestureHint.style.opacity = '.25';

  if (state.tool === 'hand') {
    const body = findBodyAt(point.x, point.y, 7);
    if (body) {
      state.selectedId = body.id;
      state.pointer.bodyId = body.id;
      state.pointer.offsetX = point.x - body.x;
      state.pointer.offsetY = point.y - body.y;
      state.pointer.wasPinned = body.pinned;
      body.vx = 0; body.vy = 0; body.av = 0;
      updateInspector();
      sound('tap');
    } else {
      const field = findFieldAt(point.x, point.y);
      state.selectedId = null;
      updateInspector();
      if (field) {
        pushHistory();
        field.polarity *= -1;
        showToast(field.polarity > 0 ? 'ПОЛЕ ПРИТЯГИВАЕТ' : 'ПОЛЕ ОТТАЛКИВАЕТ');
        pulseHaptic([8, 20, 8]);
        scheduleSave();
      }
    }
  } else if (state.tool === 'erase') {
    eraseAt(point.x, point.y);
  } else if (state.tool === 'rope' || state.tool === 'spring') {
    const body = findBodyAt(point.x, point.y, 8);
    state.linkStart = body ? { bodyId: body.id, x: body.x, y: body.y } : { bodyId: null, x: point.x, y: point.y };
    state.preview = { type: state.tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    linkText.textContent = body ? 'ТЯНИ КО ВТОРОМУ ТЕЛУ ИЛИ ТОЧКЕ' : 'ТЯНИ К ТЕЛУ';
    linkBanner.hidden = false;
  } else {
    state.preview = { type: state.tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  }
}

function onPointerMove(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const point = pointerPosition(event);
  const now = performance.now();
  const pointer = state.pointer;
  pointer.px = pointer.x; pointer.py = pointer.y;
  pointer.x = point.x; pointer.y = point.y;
  pointer.dt = Math.max(1, now - pointer.lastTime);
  pointer.lastTime = now;
  if (Math.hypot(pointer.x - pointer.sx, pointer.y - pointer.sy) > 4) pointer.moved = true;

  if (state.tool === 'hand' && pointer.bodyId) {
    const body = bodyById(pointer.bodyId);
    if (body) {
      body.x = clamp(point.x - pointer.offsetX, -80, state.worldWidth + 80);
      body.y = clamp(point.y - pointer.offsetY, -80, state.worldHeight + 80);
      body.vx = (point.x - pointer.px) / pointer.dt * 1000;
      body.vy = (point.y - pointer.py) / pointer.dt * 1000;
    }
  } else if (state.preview) {
    state.preview.x2 = point.x;
    state.preview.y2 = point.y;
  }
}

function onPointerUp(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const point = pointerPosition(event);
  const pointer = state.pointer;
  const dx = point.x - pointer.sx;
  const dy = point.y - pointer.sy;
  const distance = Math.hypot(dx, dy);

  if (state.tool === 'hand' && pointer.bodyId) {
    const body = bodyById(pointer.bodyId);
    if (body && !body.pinned) {
      body.vx = clamp(body.vx, -1800, 1800);
      body.vy = clamp(body.vy, -1800, 1800);
      body.av += clamp(dx * .012, -5, 5);
      pulseHaptic();
      scheduleSave();
    }
  } else if (state.tool === 'circle' || state.tool === 'box') {
    if (state.bodies.length >= MAX_BODIES) showToast('ЛИМИТ ТЕЛ: СТОЛ УЖЕ ЗАБИТ');
    else {
      pushHistory();
      const speedScale = distance < 6 ? 0 : 2.35;
      const body = createBody(state.tool, pointer.sx, pointer.sy, {
        vx: dx * speedScale,
        vy: dy * speedScale,
        angle: state.tool === 'box' ? Math.atan2(dy, dx) * .22 : 0,
        av: state.tool === 'box' ? dx * .018 : 0
      });
      state.bodies.push(body);
      state.selectedId = body.id;
      updateInspector();
      sound('spawn', .7);
      pulseHaptic(12);
      scheduleSave();
    }
  } else if (state.tool === 'wall') {
    if (distance > 14) {
      pushHistory();
      const body = createBody('box', (pointer.sx + point.x) / 2, (pointer.sy + point.y) / 2, {
        w: distance,
        h: 14,
        angle: Math.atan2(dy, dx),
        material: state.material,
        pinned: true
      });
      state.bodies.push(body);
      sound('spawn');
      pulseHaptic();
      scheduleSave();
    } else showToast('БАЛКА СЛИШКОМ КОРОТКАЯ');
  } else if (state.tool === 'rope' || state.tool === 'spring') {
    finishConstraint(point.x, point.y);
  } else if (state.tool === 'field') {
    pushHistory();
    const radius = clamp(distance || 78, 48, 190);
    state.fields.push({ id: id('f'), x: pointer.sx, y: pointer.sy, radius, strength: 1250, polarity: state.fieldPolarity });
    sound('link');
    pulseHaptic([8, 24, 8]);
    scheduleSave();
  } else if (state.tool === 'impulse') {
    applyImpulse(pointer.sx, pointer.sy, dx, dy);
  }

  state.pointer = null;
  state.preview = null;
  state.linkStart = null;
  linkBanner.hidden = true;
  updateStats();
  gestureHint.style.opacity = '1';
}

function cancelPointer(event) {
  if (state.pointer && (!event || state.pointer.id === event.pointerId)) {
    state.pointer = null;
    state.preview = null;
    state.linkStart = null;
    linkBanner.hidden = true;
    gestureHint.style.opacity = '1';
  }
}

function finishConstraint(x, y) {
  if (!state.linkStart) return;
  const endBody = findBodyAt(x, y, 9);
  const startBody = state.linkStart.bodyId ? bodyById(state.linkStart.bodyId) : null;
  if (!startBody && !endBody) {
    showToast('ХОТЯ БЫ ОДИН КОНЕЦ ДОЛЖЕН БЫТЬ НА ТЕЛЕ');
    return;
  }
  if (startBody && endBody && startBody.id === endBody.id) {
    showToast('НУЖНЫ ДВЕ РАЗНЫЕ ТОЧКИ');
    return;
  }
  const a = startBody ? { x: startBody.x, y: startBody.y } : { x: state.linkStart.x, y: state.linkStart.y };
  const b = endBody ? { x: endBody.x, y: endBody.y } : { x, y };
  const rest = Math.max(18, Math.hypot(b.x - a.x, b.y - a.y));
  pushHistory();
  state.constraints.push({
    id: id('c'),
    type: state.tool,
    bodyA: startBody?.id || endBody.id,
    bodyB: startBody ? (endBody?.id || null) : null,
    ax: startBody ? null : null,
    ay: startBody ? null : null,
    bx: startBody ? (endBody ? null : x) : state.linkStart.x,
    by: startBody ? (endBody ? null : y) : state.linkStart.y,
    rest,
    stiffness: state.tool === 'rope' ? .72 : .22,
    damping: state.tool === 'rope' ? .04 : .12,
    tension: 0
  });
  sound('link');
  pulseHaptic([8, 18, 8]);
  scheduleSave();
}

function eraseAt(x, y) {
  const body = findBodyAt(x, y, 8);
  if (body) {
    pushHistory();
    state.bodies = state.bodies.filter(item => item.id !== body.id);
    state.constraints = state.constraints.filter(link => link.bodyA !== body.id && link.bodyB !== body.id);
    if (state.selectedId === body.id) state.selectedId = null;
    updateInspector();
    sound('tap');
    pulseHaptic();
    scheduleSave();
    updateStats();
    return;
  }
  const field = findFieldAt(x, y);
  if (field) {
    pushHistory();
    state.fields = state.fields.filter(item => item.id !== field.id);
    sound('tap');
    scheduleSave();
    return;
  }
  let nearest = null;
  let nearestDistance = 16;
  for (const constraint of state.constraints) {
    const endpoints = constraintEndpoints(constraint);
    if (!endpoints) continue;
    const distance = distanceToSegment(x, y, endpoints.ax, endpoints.ay, endpoints.bx, endpoints.by);
    if (distance < nearestDistance) { nearest = constraint; nearestDistance = distance; }
  }
  if (nearest) {
    pushHistory();
    state.constraints = state.constraints.filter(item => item.id !== nearest.id);
    sound('tap');
    scheduleSave();
    updateStats();
  }
}

function applyImpulse(x, y, dx, dy) {
  const distance = Math.hypot(dx, dy);
  const directional = distance > 10;
  const radius = clamp(86 + distance * .35, 86, 190);
  const direction = normalize(dx || 1, dy || 0);
  pushHistory();
  let hit = 0;
  for (const body of state.bodies) {
    if (!body.invMass) continue;
    const ox = body.x - x;
    const oy = body.y - y;
    const d = Math.hypot(ox, oy);
    if (d > radius) continue;
    const falloff = 1 - d / radius;
    const radial = normalize(ox || 1, oy || 0);
    const fx = directional ? direction.x * 1150 * falloff + radial.x * 330 * falloff : radial.x * 1450 * falloff;
    const fy = directional ? direction.y * 1150 * falloff + radial.y * 330 * falloff : radial.y * 1450 * falloff;
    body.vx += fx;
    body.vy += fy;
    body.av += (Math.random() - .5) * 8 * falloff;
    hit++;
  }
  state.bursts.push({ x, y, radius: 12, maxRadius: radius, life: 1, polarity: directional ? 0 : -1 });
  sound('blast', Math.min(1, hit / 8));
  pulseHaptic([18, 24, 28]);
  showToast(hit ? `ИМПУЛЬС ПОЛУЧИЛИ: ${hit}` : 'УДАР УШЁЛ В ПУСТОТУ');
  scheduleSave();
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const denominator = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / denominator, 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function constraintEndpoints(constraint) {
  const bodyA = bodyById(constraint.bodyA);
  if (!bodyA) return null;
  const bodyB = constraint.bodyB ? bodyById(constraint.bodyB) : null;
  if (constraint.bodyB && !bodyB) return null;
  return { ax: bodyA.x, ay: bodyA.y, bx: bodyB ? bodyB.x : constraint.bx, by: bodyB ? bodyB.y : constraint.by };
}

