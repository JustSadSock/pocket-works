function renderBackground(player) {
  const horizon = renderHeight * (.5 + player.pitch) + Math.sin(player.bob) * player.movement * .32;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#31464d'); sky.addColorStop(.58, '#7f9593'); sky.addColorStop(1, '#c4b27f');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, renderWidth, Math.max(0, horizon));
  ctx.fillStyle = 'rgba(240,210,130,.42)';
  const sunX = renderWidth * (.73 + Math.sin(player.a * .3) * .04);
  ctx.beginPath(); ctx.arc(sunX, horizon * .36, renderHeight * .08, 0, TAU); ctx.fill();
  const floor = ctx.createLinearGradient(0, horizon, 0, renderHeight);
  floor.addColorStop(0, '#485052'); floor.addColorStop(.25, '#2c3436'); floor.addColorStop(1, '#111719');
  ctx.fillStyle = floor; ctx.fillRect(0, horizon, renderWidth, renderHeight - horizon);

  ctx.save();
  ctx.globalAlpha = .16;
  ctx.strokeStyle = '#d7dfdb';
  ctx.lineWidth = 1;
  for (let i = 1; i < 13; i += 1) {
    const t = i / 13;
    const y = horizon + (renderHeight - horizon) * t * t;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(renderWidth, y); ctx.stroke();
  }
  const drift = ((player.x + player.y) * 23 + player.a * 90) % 70;
  for (let x = -renderWidth; x < renderWidth * 2; x += 56) {
    ctx.beginPath(); ctx.moveTo(renderWidth / 2, horizon); ctx.lineTo(x + drift, renderHeight); ctx.stroke();
  }
  ctx.restore();
  return horizon;
}

function renderWalls(player, horizon) {
  for (let x = 0, rayIndex = 0; x < renderWidth; x += COLUMN_WIDTH, rayIndex += 1) {
    const cameraX = (x / renderWidth - .5) * 2;
    const rayAngle = player.a + Math.atan(cameraX * Math.tan(FOV / 2));
    const hit = castRay(player.x, player.y, rayAngle);
    const distance = Math.max(.04, hit.distance * Math.cos(rayAngle - player.a));
    zBuffer[rayIndex] = distance;
    const wallHeight = Math.min(renderHeight * 3, renderHeight * .86 / distance);
    const top = horizon - wallHeight / 2;
    const texture = textures[hit.type] || textures[1];
    const textureX = clamp(Math.floor(hit.wallX * texture.width), 0, texture.width - 1);
    ctx.drawImage(texture, textureX, 0, 1, texture.height, x, top, COLUMN_WIDTH + .5, wallHeight);
    const darkness = clamp(distance / 18 + hit.side * .12, 0, .72);
    if (darkness > .02) {
      ctx.fillStyle = `rgba(5,9,10,${darkness})`;
      ctx.fillRect(x, top, COLUMN_WIDTH + .5, wallHeight);
    }
    if (distance < .9) {
      ctx.fillStyle = `rgba(235,220,180,${(.9 - distance) * .1})`;
      ctx.fillRect(x, top, COLUMN_WIDTH + .5, wallHeight);
    }
  }
}

function renderBillboard(sprite, worldX, worldY, scale = 1, tint = 0, vertical = 0) {
  const player = current.player;
  const dx = worldX - player.x, dy = worldY - player.y;
  const distance = Math.hypot(dx, dy);
  let relative = angleWrap(Math.atan2(dy, dx) - player.a);
  if (Math.abs(relative) > FOV * .68 || distance < .2) return;
  const screenX = (.5 + relative / FOV) * renderWidth;
  const height = renderHeight * scale / distance;
  const width = height * (sprite.width / sprite.height);
  const top = renderHeight * (.5 + player.pitch) - height * .55 + vertical / distance;
  const left = screenX - width / 2;
  const stripeWidth = Math.max(1, width / sprite.width);
  ctx.save();
  if (tint) ctx.globalAlpha = clamp(1 - tint * .35, .5, 1);
  for (let sx = 0; sx < sprite.width; sx += 2) {
    const screenStripe = left + sx / sprite.width * width;
    const index = Math.floor(screenStripe / COLUMN_WIDTH);
    if (index < 0 || index >= zBuffer.length || distance >= zBuffer[index] + .2) continue;
    ctx.drawImage(sprite, sx, 0, 2, sprite.height, screenStripe, top, stripeWidth * 2 + 1, height);
  }
  if (tint > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,72,45,${clamp(tint * 2.8, 0, .7)})`;
    ctx.fillRect(left, top, width, height);
  }
  ctx.restore();
}

function renderSprites() {
  const drawables = [];
  for (const enemy of current.enemies) if (!enemy.dead) drawables.push({ kind: 'enemy', x: enemy.x, y: enemy.y, distance: Math.hypot(enemy.x - current.player.x, enemy.y - current.player.y), enemy });
  for (const pickup of current.pickups) if (pickup.active) drawables.push({ kind: pickup.type, x: pickup.x, y: pickup.y, distance: Math.hypot(pickup.x - current.player.x, pickup.y - current.player.y), pickup });
  if (current.objectiveComplete) drawables.push({ kind: 'exit', x: current.exit.x, y: current.exit.y, distance: Math.hypot(current.exit.x - current.player.x, current.exit.y - current.player.y) });
  drawables.sort((a, b) => b.distance - a.distance);
  for (const item of drawables) {
    if (item.kind === 'enemy') renderBillboard(item.enemy.alert ? sprites.enemyAlert : sprites.enemy, item.x, item.y, 1.04, item.enemy.hurt, Math.sin(item.enemy.wander * 4) * 1.4);
    else if (item.kind === 'exit') renderBillboard(sprites.exit, item.x, item.y, 1.15, 0, Math.sin(previewTime * 3) * 4);
    else renderBillboard(sprites[item.kind], item.x, item.y, .55, 0, Math.sin(previewTime * 2.4 + item.x) * 3);
  }
}

function renderWeapon() {
  if (phase !== 'playing') return;
  const w = renderWidth, h = renderHeight;
  const bob = Math.sin(current.player.bob) * current.player.movement * .7;
  const kick = recoil * 10;
  const baseY = h + 5 + kick + bob;
  ctx.save();
  ctx.translate(w * .58 + Math.cos(current.player.bob * .5) * current.player.movement * .5, baseY);
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(0, -12, w * .22, 22, -.05, 0, TAU); ctx.fill();
  ctx.fillStyle = '#20292c';
  ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(-30, -56); ctx.lineTo(27, -62); ctx.lineTo(76, -30); ctx.lineTo(72, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#415054'; ctx.fillRect(-24, -66, 78, 12);
  ctx.fillStyle = '#111719'; ctx.fillRect(42, -62, 55, 8); ctx.fillRect(78, -58, 32, 5);
  ctx.fillStyle = '#f2b84b'; ctx.fillRect(-29, -55, 8, 32); ctx.fillRect(12, -68, 22, 3);
  ctx.fillStyle = '#6b7b7e'; ctx.fillRect(-10, -47, 50, 5); ctx.fillRect(6, -37, 37, 18);
  ctx.fillStyle = '#141a1c'; ctx.fillRect(0, -22, 16, 34);
  ctx.fillStyle = '#c7a27a'; ctx.fillRect(-43, -27, 22, 35); ctx.fillRect(39, -14, 25, 26);
  if (muzzleFlash > .05) {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,213,102,${muzzleFlash})`;
    ctx.beginPath(); ctx.moveTo(108, -56); ctx.lineTo(135, -76); ctx.lineTo(126, -54); ctx.lineTo(150, -46); ctx.lineTo(122, -41); ctx.lineTo(136, -23); ctx.lineTo(106, -38); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function renderMiniMap() {
  if (phase !== 'playing' || !current) return;
  const w = elements.miniMap.width, h = elements.miniMap.height;
  const map = current.map.data;
  const scale = Math.min(w / map.width, h / map.height);
  const ox = (w - map.width * scale) / 2;
  const oy = (h - map.height * scale) / 2;
  miniCtx.clearRect(0, 0, w, h);
  miniCtx.fillStyle = 'rgba(10,15,17,.92)'; miniCtx.fillRect(0, 0, w, h);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const cell = current.grid[y][x];
      if (!cell) continue;
      const colors = ['#000', '#687477', '#b98d35', '#668f8c', '#39484d', '#9a9583'];
      miniCtx.fillStyle = colors[cell];
      miniCtx.fillRect(ox + x * scale, oy + y * scale, scale + .3, scale + .3);
    }
  }
  if (current.objectiveComplete) {
    miniCtx.fillStyle = '#f2b84b';
    miniCtx.fillRect(ox + current.exit.x * scale - 2, oy + current.exit.y * scale - 2, 4, 4);
  }
  for (const enemy of current.enemies) {
    if (enemy.dead || !enemy.alert) continue;
    miniCtx.fillStyle = '#df604c';
    miniCtx.fillRect(ox + enemy.x * scale - 1.5, oy + enemy.y * scale - 1.5, 3, 3);
  }
  const p = current.player;
  miniCtx.save(); miniCtx.translate(ox + p.x * scale, oy + p.y * scale); miniCtx.rotate(p.a);
  miniCtx.fillStyle = '#eef2ed'; miniCtx.beginPath(); miniCtx.moveTo(5,0); miniCtx.lineTo(-3,-3); miniCtx.lineTo(-3,3); miniCtx.closePath(); miniCtx.fill(); miniCtx.restore();
}

function render() {
  if (!current) return;
  const player = current.player;
  const shakeX = shake > .01 ? (Math.random() - .5) * shake * 2.4 : 0;
  const shakeY = shake > .01 ? (Math.random() - .5) * shake * 1.8 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  const horizon = renderBackground(player);
  renderWalls(player, horizon);
  renderSprites();
  renderWeapon();
  ctx.restore();
  if (phase === 'playing') renderMiniMap();
}

function updatePreview(dt) {
  previewTime += dt;
  const run = current;
  run.player.a += dt * .11;
  run.player.pitch = Math.sin(previewTime * .3) * .018;
  run.player.bob = previewTime * .6;
  for (const enemy of run.enemies) enemy.wander += dt;
}

function loop(now) {
  const dt = Math.min(.034, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (phase === 'playing') updateGame(dt, now);
  else if (phase === 'menu' || phase === 'briefing') updatePreview(dt);
  recoil = Math.max(0, recoil - dt * 7.5);
  muzzleFlash = Math.max(0, muzzleFlash - dt * 13);
  shake = Math.max(0, shake - dt * 7);
  render();
  frameId = requestAnimationFrame(loop);
}

function updateStick(clientX, clientY) {
  const dx = clientX - input.moveOriginX;
  const dy = clientY - input.moveOriginY;
  const distance = Math.hypot(dx, dy);
  const radius = 44;
  const factor = distance > radius ? radius / distance : 1;
  const x = dx * factor, y = dy * factor;
  input.moveX = clamp(x / radius, -1, 1);
  input.moveY = clamp(y / radius, -1, 1);
  elements.stickKnob.style.transform = `translate(${x}px, ${y}px)`;
}

function onMoveDown(event) {
  if (phase !== 'playing' || input.movePointer !== null) return;
  input.movePointer = event.pointerId;
  input.moveOriginX = event.clientX;
  input.moveOriginY = event.clientY;
  elements.moveZone.setPointerCapture(event.pointerId);
  elements.stickBase.style.left = `${event.clientX}px`;
  elements.stickBase.style.top = `${event.clientY}px`;
  elements.stickKnob.style.transform = 'translate(0,0)';
  elements.stickBase.classList.add('is-active');
  updateStick(event.clientX, event.clientY);
}
function onMoveMove(event) {
  if (event.pointerId !== input.movePointer) return;
  updateStick(event.clientX, event.clientY);
}
function onMoveUp(event) {
  if (event.pointerId !== input.movePointer) return;
  input.movePointer = null;
  input.moveX = 0; input.moveY = 0;
  elements.stickBase.classList.remove('is-active');
}

function onLookDown(event) {
  if (phase !== 'playing' || input.lookPointer !== null) return;
  input.lookPointer = event.pointerId;
  input.lookX = event.clientX;
  input.lookY = event.clientY;
  elements.lookZone.setPointerCapture(event.pointerId);
}
function onLookMove(event) {
  if (event.pointerId !== input.lookPointer || phase !== 'playing') return;
  const dx = event.clientX - input.lookX;
  const dy = event.clientY - input.lookY;
  input.lookX = event.clientX; input.lookY = event.clientY;
  current.player.a += dx / Math.max(360, window.innerWidth) * 4.2 * Number(profile.settings.sensitivity);
  current.player.pitch = clamp(current.player.pitch + dy / Math.max(240, window.innerHeight) * .32 * Number(profile.settings.sensitivity), -.13, .13);
}
function onLookUp(event) {
  if (event.pointerId === input.lookPointer) input.lookPointer = null;
}

function startFiring(event) {
  if (phase !== 'playing') return;
  event.preventDefault();
  input.firing = true;
  elements.fire.classList.add('is-firing');
  fireWeapon(performance.now());
  try { elements.fire.setPointerCapture(event.pointerId); } catch {}
}
function stopFiring() {
  input.firing = false;
  elements.fire.classList.remove('is-firing');
}
