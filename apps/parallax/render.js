function requestRender() {
  if (!frameHandle) frameHandle = requestAnimationFrame(renderFrame);
}

function renderFrame(now) {
  frameHandle = 0;
  resizeCanvas();
  draw(now);
  if (animation) {
    const elapsed = now - animation.startedAt;
    if (elapsed >= animation.duration) finishMove(animation.result);
    else requestRender();
  }
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(rect.width, rect.height);
}

function computeLayout(width, height) {
  if (!state) return null;
  const top = 112;
  const bottom = height < 700 ? 132 : 146;
  const availableHeight = Math.max(180, height - top - bottom);
  const availableWidth = Math.max(180, width - 24);
  const cell = Math.floor(Math.min(availableWidth / state.width, availableHeight / state.height));
  const boardWidth = cell * state.width;
  const boardHeight = cell * state.height;
  return {
    width,
    height,
    cell,
    x: Math.round((width - boardWidth) / 2),
    y: Math.round(top + (availableHeight - boardHeight) / 2),
    boardWidth,
    boardHeight
  };
}

function draw(now = performance.now()) {
  if (!state || !layout) return;
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawBackground();
  drawBoardBase();
  drawGhostLayer('B');
  drawLayer('A');

  ctx.save();
  const lensPoint = boardToScreen(state.lens.x, state.lens.y);
  ctx.beginPath();
  ctx.arc(lensPoint.x, lensPoint.y, state.lens.radius * layout.cell, 0, Math.PI * 2);
  ctx.clip();
  drawLayer('B');
  ctx.restore();

  drawObjects(now);
  drawLens();
  drawPlayer(now);
}

function drawBackground() {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.strokeStyle = 'rgba(24,35,39,.05)';
  ctx.lineWidth = 1;
  for (let y = 86; y < layout.height - 130; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y + .5);
    ctx.lineTo(layout.width, y + .5);
    ctx.stroke();
  }
}

function drawBoardBase() {
  ctx.fillStyle = '#e7e1d4';
  ctx.fillRect(layout.x, layout.y, layout.boardWidth, layout.boardHeight);

  ctx.strokeStyle = 'rgba(24,35,39,.16)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= state.width; x += 1) {
    const px = layout.x + x * layout.cell + .5;
    ctx.beginPath();
    ctx.moveTo(px, layout.y);
    ctx.lineTo(px, layout.y + layout.boardHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= state.height; y += 1) {
    const py = layout.y + y * layout.cell + .5;
    ctx.beginPath();
    ctx.moveTo(layout.x, py);
    ctx.lineTo(layout.x + layout.boardWidth, py);
    ctx.stroke();
  }
}

function drawGhostLayer(layer) {
  ctx.save();
  ctx.globalAlpha = .17;
  forEachCell((tile, x, y) => {
    if ((layer === 'B' && tile === 'b') || tile === '#') drawWallCell(x, y, COLORS.coral, 'B', true);
  });
  ctx.restore();
}

function drawLayer(layer) {
  forEachCell((tile, x, y) => {
    if (tile === '#') drawWallCell(x, y, COLORS.ink, layer, false);
    if (layer === 'A' && tile === 'a') drawWallCell(x, y, COLORS.blue, layer, false);
    if (layer === 'B' && tile === 'b') drawWallCell(x, y, COLORS.coral, layer, false);
  });
}

function forEachCell(callback) {
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) callback(tileAt(x, y), x, y);
  }
}

function drawWallCell(x, y, color, layer, ghost) {
  const px = layout.x + x * layout.cell;
  const py = layout.y + y * layout.cell;
  const inset = ghost ? 7 : 4;
  ctx.fillStyle = color;
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + inset, py + inset, layout.cell - inset * 2, layout.cell - inset * 2);
    return;
  }

  ctx.fillRect(px + inset, py + inset, layout.cell - inset * 2, layout.cell - inset * 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px + inset, py + inset, layout.cell - inset * 2, layout.cell - inset * 2);
  ctx.clip();
  ctx.strokeStyle = layer === 'A' ? 'rgba(238,233,220,.38)' : 'rgba(24,35,39,.25)';
  ctx.lineWidth = 1.5;
  const stride = Math.max(8, layout.cell / 4);
  for (let offset = -layout.cell; offset < layout.cell * 2; offset += stride) {
    ctx.beginPath();
    if (layer === 'A') {
      ctx.moveTo(px + offset, py + layout.cell);
      ctx.lineTo(px + offset + layout.cell, py);
    } else {
      ctx.moveTo(px + offset, py);
      ctx.lineTo(px + offset + layout.cell, py + layout.cell);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawObjects(now) {
  forEachCell((tile, x, y) => {
    const point = boardToScreen(x, y);
    const size = layout.cell;

    if (tile === 'E') {
      const ready = state.shards.size === 0;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = ready ? COLORS.ink : COLORS.muted;
      ctx.lineWidth = Math.max(2, size * .055);
      ctx.strokeRect(-size * .23, -size * .23, size * .46, size * .46);
      if (ready) {
        const pulse = .7 + Math.sin(now / 180) * .12;
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(-size * .08 * pulse, -size * .08 * pulse, size * .16 * pulse, size * .16 * pulse);
      } else {
        ctx.beginPath();
        ctx.moveTo(-size * .18, 0);
        ctx.lineTo(size * .18, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    const key = cellKey(x, y);
    if (state.shards.has(key)) {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(now / 1400 + (x + y) * .3);
      ctx.fillStyle = COLORS.paper;
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -size * .19);
      ctx.lineTo(size * .14, 0);
      ctx.lineTo(0, size * .19);
      ctx.lineTo(-size * .14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isInsideLens(x, y) ? COLORS.coral : COLORS.blue;
      ctx.fillRect(-size * .045, -size * .09, size * .09, size * .18);
      ctx.restore();
    }

    if (tile === '/' || tile === '\\') {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = Math.max(3, size * .08);
      ctx.lineCap = 'square';
      ctx.beginPath();
      if (tile === '/') {
        ctx.moveTo(-size * .22, size * .22);
        ctx.lineTo(size * .22, -size * .22);
      } else {
        ctx.moveTo(-size * .22, -size * .22);
        ctx.lineTo(size * .22, size * .22);
      }
      ctx.stroke();
      ctx.strokeStyle = isInsideLens(x, y) ? COLORS.coral : COLORS.blue;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawLens() {
  const point = boardToScreen(state.lens.x, state.lens.y);
  const radius = state.lens.radius * layout.cell;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(24,35,39,.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    const outer = radius + (i % 4 === 0 ? 8 : 4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * (radius + 1), Math.sin(angle) * (radius + 1));
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.coral;
  ctx.fillRect(-4, -radius - 6, 8, 12);
  ctx.restore();
}

function currentPlayerPosition(now) {
  if (!animation) return state.player;
  const progressValue = clamp((now - animation.startedAt) / animation.duration, 0, 1);
  const totalSegments = animation.path.length - 1;
  const scaled = progressValue * totalSegments;
  const segment = Math.min(totalSegments - 1, Math.floor(scaled));
  const local = scaled - segment;
  const eased = local < .5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
  const a = animation.path[segment];
  const b = animation.path[segment + 1];
  return { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
}

function drawPlayer(now) {
  const player = currentPlayerPosition(now);
  const point = boardToScreen(player.x, player.y);
  const radius = Math.max(7, layout.cell * .14);

  ctx.save();
  ctx.globalAlpha = .72;
  ctx.fillStyle = COLORS.blue;
  ctx.beginPath();
  ctx.arc(point.x - 5, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.coral;
  ctx.beginPath();
  ctx.arc(point.x + 5, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.paper;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * .33, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function boardToScreen(x, y) {
  return {
    x: layout.x + (x + .5) * layout.cell,
    y: layout.y + (y + .5) * layout.cell
  };
}

function screenToBoard(x, y) {
  return {
    x: (x - layout.x) / layout.cell - .5,
    y: (y - layout.y) / layout.cell - .5
  };
}

function pointerPosition(event) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onPointerDown(event) {
  if (!state || animation || isScreenOpen()) return;
  const point = pointerPosition(event);
  const lensScreen = boardToScreen(state.lens.x, state.lens.y);
  const lensRadius = state.lens.radius * layout.cell;
  const onLens = distance(point, lensScreen) <= lensRadius + 18;

  pointer = {
    id: event.pointerId,
    start: point,
    last: point,
    mode: onLens ? 'lens' : 'swipe',
    moved: false,
    initialLens: { ...state.lens },
    snapshot: onLens ? snapshot() : null
  };
  els.canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!pointer || pointer.id !== event.pointerId || !state || animation) return;
  const point = pointerPosition(event);
  pointer.last = point;
  if (distance(pointer.start, point) > 6) pointer.moved = true;

  if (pointer.mode === 'lens') {
    const board = screenToBoard(point.x, point.y);
    state.lens.x = clamp(board.x, 0, state.width - 1);
    state.lens.y = clamp(board.y, 0, state.height - 1);
    requestRender();
  }
  event.preventDefault();
}

function onPointerUp(event) {
  if (!pointer || pointer.id !== event.pointerId || !state) return;
  const current = pointer;
  pointer = null;
  els.canvas.releasePointerCapture?.(event.pointerId);

  if (current.mode === 'lens') {
    const old = current.initialLens;
    state.lens.x = Math.round(state.lens.x * 2) / 2;
    state.lens.y = Math.round(state.lens.y * 2) / 2;
    state.lens.x = clamp(state.lens.x, 0, state.width - 1);
    state.lens.y = clamp(state.lens.y, 0, state.height - 1);
    if (Math.hypot(state.lens.x - old.x, state.lens.y - old.y) > .05) {
      state.history.push(current.snapshot);
      if (state.history.length > 50) state.history.shift();
      state.moves += 1;
      sound('lens');
      haptic(9);
      updateUI();
    }
    requestRender();
    return;
  }

  const dx = current.last.x - current.start.x;
  const dy = current.last.y - current.start.y;
  if (Math.hypot(dx, dy) < 24) {
    showToast('Тяни линзу или свайпни в сторону движения.', 1700);
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
}

