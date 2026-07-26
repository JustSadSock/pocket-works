function clearInput() {
  input.movePointer = null;
  input.lookPointer = null;
  input.moveX = 0;
  input.moveY = 0;
  input.firing = false;
  input.mouseDown = false;
  elements.stickBase.classList.remove('is-active');
  elements.fire.classList.remove('is-firing');
}

function beginReload(now = performance.now()) {
  const player = current?.player;
  if (!player || player.reloading || player.ammo >= MAGAZINE_SIZE || player.reserve <= 0 || phase !== 'playing') return;
  player.reloading = true;
  player.reloadEnd = now + 1150;
  elements.reloadIndicator.hidden = false;
  const bar = elements.reloadIndicator.querySelector('i');
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  audio.reload();
}

function finishReload() {
  const player = current.player;
  const needed = MAGAZINE_SIZE - player.ammo;
  const loaded = Math.min(needed, player.reserve);
  player.ammo += loaded;
  player.reserve -= loaded;
  player.reloading = false;
  elements.reloadIndicator.hidden = true;
  syncHud();
}

function aimTarget(maxAngle = .2) {
  if (!current) return null;
  const player = current.player;
  let best = null;
  for (const enemy of current.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - player.x, dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 13 || !lineOfSight(player.x, player.y, enemy.x, enemy.y)) continue;
    const difference = angleWrap(Math.atan2(dy, dx) - player.a);
    const allowance = maxAngle + .13 / Math.max(1, distance);
    if (Math.abs(difference) > allowance) continue;
    const rank = Math.abs(difference) * 2.7 + distance * .012;
    if (!best || rank < best.rank) best = { enemy, difference, distance, rank };
  }
  return best;
}

function fireWeapon(now) {
  const player = current.player;
  if (player.reloading || now < player.nextShot) return;
  if (player.ammo <= 0) {
    player.nextShot = now + 250;
    audio.empty();
    beginReload(now);
    return;
  }
  player.ammo -= 1;
  player.nextShot = now + 132;
  current.shots += 1;
  muzzleFlash = 1;
  recoil = 1;
  shake = Math.max(shake, .8);
  audio.shot();
  haptic(12);
  elements.fire.classList.add('is-firing');
  setTimeout(() => elements.fire.classList.remove('is-firing'), 70);

  const target = aimTarget(.055);
  if (target) {
    const critical = Math.abs(target.difference) < .012;
    const damage = critical ? 62 : 36 + Math.random() * 12;
    target.enemy.hp -= damage;
    target.enemy.hurt = .16;
    target.enemy.alert = true;
    current.hits += 1;
    audio.hit();
    haptic(critical ? [12, 18, 20] : 18);
    pulse(elements.hitMarker, 'is-active', 170);
    if (target.enemy.hp <= 0) {
      target.enemy.dead = true;
      current.kills += 1;
      showToast(critical ? 'КРИТИЧЕСКОЕ ПОПАДАНИЕ' : 'ЦЕЛЬ СНЯТА', 700);
      if (current.kills === current.enemies.length) {
        current.objectiveComplete = true;
        showToast('МАЯК ЭВАКУАЦИИ АКТИВИРОВАН', 1800);
        audio.alarm();
      }
    }
  }

  if (player.ammo === 0 && player.reserve > 0) setTimeout(() => beginReload(performance.now()), 120);
  syncHud();
}

function damagePlayer(amount) {
  if (phase !== 'playing') return;
  current.player.health = Math.max(0, current.player.health - amount);
  current.damageTaken += amount;
  shake = Math.max(shake, 1.5);
  pulse(elements.damage, 'is-active', 190);
  haptic([25, 25, 30]);
  syncHud();
  if (current.player.health <= 0) endRun(false);
}

function movePlayer(dt) {
  const player = current.player;
  let moveX = input.moveX;
  let moveY = input.moveY;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) moveY -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) moveY += 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) moveX -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) moveX += 1;
  const magnitude = Math.min(1, Math.hypot(moveX, moveY));
  if (magnitude > 1) { moveX /= magnitude; moveY /= magnitude; }
  const forward = -moveY;
  const strafe = moveX;
  const speed = magnitude > .88 ? 3.25 : 2.55;
  const targetVX = (Math.cos(player.a) * forward + Math.cos(player.a + Math.PI / 2) * strafe) * speed;
  const targetVY = (Math.sin(player.a) * forward + Math.sin(player.a + Math.PI / 2) * strafe) * speed;
  const smoothing = 1 - Math.exp(-dt * 13);
  player.vx = lerp(player.vx, targetVX, smoothing);
  player.vy = lerp(player.vy, targetVY, smoothing);
  if (magnitude < .04) { player.vx *= Math.exp(-dt * 11); player.vy *= Math.exp(-dt * 11); }
  const nextX = player.x + player.vx * dt;
  const nextY = player.y + player.vy * dt;
  if (canOccupy(nextX, player.y)) player.x = nextX; else player.vx = 0;
  if (canOccupy(player.x, nextY)) player.y = nextY; else player.vy = 0;
  player.movement = Math.hypot(player.vx, player.vy);
  if (player.movement > .2) player.bob += dt * (7.2 + player.movement * .75);
}

function updateEnemies(dt) {
  const player = current.player;
  for (const enemy of current.enemies) {
    if (enemy.dead) continue;
    enemy.hurt = Math.max(0, enemy.hurt - dt);
    enemy.cooldown -= dt;
    enemy.wander += dt;
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const visible = distance < 12 && lineOfSight(enemy.x, enemy.y, player.x, player.y);
    if (visible && distance < 8.5) enemy.alert = true;
    if (!enemy.alert) continue;

    if (visible && distance > 2.6) {
      const side = Math.sin(enemy.wander * .73) * .28;
      const nx = dx / distance, ny = dy / distance;
      const moveX = (nx - ny * side) * enemy.speed * dt;
      const moveY = (ny + nx * side) * enemy.speed * dt;
      if (canOccupy(enemy.x + moveX, enemy.y, .19)) enemy.x += moveX;
      if (canOccupy(enemy.x, enemy.y + moveY, .19)) enemy.y += moveY;
    }

    if (visible && distance < 10.5 && enemy.cooldown <= 0) {
      enemy.cooldown = .95 + Math.random() * .85;
      audio.enemyShot();
      const movingPenalty = clamp(player.movement / 5, 0, .35);
      const hitChance = clamp(.72 - distance * .052 - movingPenalty, .16, .62);
      if (Math.random() < hitChance) damagePlayer(6 + Math.random() * 8);
    }
  }
}

function updatePickups() {
  const player = current.player;
  for (const pickup of current.pickups) {
    if (!pickup.active || Math.hypot(player.x - pickup.x, player.y - pickup.y) > .65) continue;
    if (pickup.type === 'health') {
      if (player.health >= 100) continue;
      player.health = Math.min(100, player.health + 38);
      showToast('+ АПТЕЧКА');
    } else {
      if (player.reserve >= 180) continue;
      player.reserve = Math.min(180, player.reserve + 48);
      showToast('+ БОЕПРИПАСЫ');
    }
    pickup.active = false;
    audio.ui(); haptic(24); syncHud();
  }

  if (current.objectiveComplete && Math.hypot(player.x - current.exit.x, player.y - current.exit.y) < .72) endRun(true);
}

function updateGame(dt, now) {
  current.elapsed += dt;
  movePlayer(dt);
  if (current.player.reloading && now >= current.player.reloadEnd) finishReload();
  if ((input.firing || input.mouseDown || input.keys.has('Space')) && !current.player.reloading) fireWeapon(now);
  const target = aimTarget(.18);
  lastLockedTarget = target;
  if (target && profile.settings.assist > 0 && current.player.movement < 3.7) {
    const strength = Number(profile.settings.assist) * (input.firing ? 5.3 : 2.3);
    current.player.a += target.difference * clamp(dt * strength, 0, .24);
  }
  elements.crosshair.classList.toggle('is-locked', Boolean(target && Math.abs(target.difference) < .085));
  updateEnemies(dt);
  updatePickups();
  syncHud();
}

function syncHud() {
  if (!current) return;
  const player = current.player;
  const remaining = current.enemies.filter((enemy) => !enemy.dead).length;
  elements.mapLabel.textContent = current.map.name;
  elements.objectiveLabel.textContent = current.objectiveComplete ? 'ДОБРАТЬСЯ ДО МАЯКА' : 'ЗАЧИСТИТЬ СЕКТОР';
  elements.enemyCounter.textContent = current.objectiveComplete ? `${Math.round(Math.hypot(player.x - current.exit.x, player.y - current.exit.y) * 7)} М` : `${remaining} ${remaining === 1 ? 'ЦЕЛЬ' : 'ЦЕЛЕЙ'}`;
  elements.healthValue.textContent = String(Math.ceil(player.health));
  elements.healthFill.style.width = `${player.health}%`;
  elements.healthFill.style.background = player.health < 32 ? 'var(--danger)' : 'var(--cyan)';
  elements.ammoValue.textContent = String(player.ammo).padStart(2, '0');
  elements.reserveValue.textContent = `/ ${player.reserve}`;
  const spread = 8 + clamp(player.movement * 1.3 + recoil * 7, 0, 13);
  elements.crosshair.style.setProperty('--spread', `${spread}px`);
}
