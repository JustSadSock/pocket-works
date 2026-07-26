function createRun(mapKey) {
  const map = MAPS[mapKey];
  return {
    mapKey,
    map,
    grid: map.data.grid,
    player: {
      x: map.start.x,
      y: map.start.y,
      a: map.start.a,
      pitch: 0,
      vx: 0,
      vy: 0,
      health: 100,
      ammo: MAGAZINE_SIZE,
      reserve: 120,
      reloading: false,
      reloadEnd: 0,
      nextShot: 0,
      bob: 0,
      movement: 0
    },
    enemies: map.enemies.map(([x, y], index) => ({
      x, y, hp: 100, dead: false, alert: false, cooldown: .4 + index * .11,
      hurt: 0, wander: index * .9, speed: .72 + (index % 3) * .06
    })),
    pickups: map.data.pickups.map((pickup) => ({ ...pickup })),
    exit: { ...map.data.exit },
    elapsed: 0,
    kills: 0,
    shots: 0,
    hits: 0,
    damageTaken: 0,
    startedAt: performance.now(),
    objectiveComplete: false,
    won: false
  };
}

function previewRun() {
  const run = createRun(selectedMap);
  run.player.x = run.map.start.x;
  run.player.y = run.map.start.y;
  return run;
}
current = previewRun();

function mapAt(x, y) {
  if (!current) return 1;
  const ix = Math.floor(x), iy = Math.floor(y);
  if (iy < 0 || iy >= current.grid.length || ix < 0 || ix >= current.grid[0].length) return 1;
  return current.grid[iy][ix];
}

function canOccupy(x, y, radius = PLAYER_RADIUS) {
  return mapAt(x - radius, y - radius) === 0 && mapAt(x + radius, y - radius) === 0 && mapAt(x - radius, y + radius) === 0 && mapAt(x + radius, y + radius) === 0;
}

function castRay(originX, originY, angle, maxDistance = 40) {
  const rayDirX = Math.cos(angle);
  const rayDirY = Math.sin(angle);
  let mapX = Math.floor(originX);
  let mapY = Math.floor(originY);
  const deltaX = Math.abs(1 / (rayDirX || 0.00001));
  const deltaY = Math.abs(1 / (rayDirY || 0.00001));
  const stepX = rayDirX < 0 ? -1 : 1;
  const stepY = rayDirY < 0 ? -1 : 1;
  let sideX = rayDirX < 0 ? (originX - mapX) * deltaX : (mapX + 1 - originX) * deltaX;
  let sideY = rayDirY < 0 ? (originY - mapY) * deltaY : (mapY + 1 - originY) * deltaY;
  let side = 0;
  let type = 0;
  let distance = 0;
  for (let step = 0; step < 96; step += 1) {
    if (sideX < sideY) {
      distance = sideX;
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      distance = sideY;
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    type = mapAt(mapX + .5, mapY + .5);
    if (type > 0 || distance > maxDistance) break;
  }
  const hitX = originX + rayDirX * distance;
  const hitY = originY + rayDirY * distance;
  let wallX = side === 0 ? hitY : hitX;
  wallX -= Math.floor(wallX);
  if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) wallX = 1 - wallX;
  return { distance: Math.min(distance, maxDistance), type: type || 1, side, wallX, hitX, hitY };
}

function lineOfSight(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.ceil(distance / .12);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (mapAt(ax + dx * t, ay + dy * t) > 0) return false;
  }
  return true;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function showToast(message, duration = 1150) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-active');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-active'), duration);
}

function pulse(element, className = 'is-active', duration = 160) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), duration);
}

function syncProfileUi() {
  document.body.classList.toggle('is-left-handed', profile.settings.leftHanded);
  elements.sensitivity.value = String(profile.settings.sensitivity);
  elements.sensitivityOutput.textContent = Number(profile.settings.sensitivity).toFixed(2);
  elements.assist.value = String(profile.settings.assist);
  elements.assistOutput.textContent = Number(profile.settings.assist).toFixed(1);
  elements.leftHand.querySelector('i').textContent = profile.settings.leftHanded ? 'ВКЛ' : 'ВЫКЛ';
  elements.audio.querySelector('i').textContent = profile.settings.audio ? 'ВКЛ' : 'ВЫКЛ';
  elements.haptic.querySelector('i').textContent = profile.settings.haptics ? 'ВКЛ' : 'ВЫКЛ';
  elements.quality.querySelector('i').textContent = profile.settings.quality === 'high' ? 'ВЫСОКАЯ' : 'ЭКОНОМНАЯ';
  document.querySelectorAll('[data-best]').forEach((node) => {
    const best = profile.best[node.dataset.best];
    node.textContent = best ? `${best.grade} · ${best.score.toLocaleString('ru-RU')}` : 'НЕТ ДАННЫХ';
  });
  document.querySelectorAll('.map-card').forEach((card) => card.classList.toggle('is-selected', card.dataset.map === selectedMap));
}

function resize() {
  const ratio = window.innerWidth / Math.max(1, window.innerHeight);
  renderWidth = profile.settings.quality === 'high' ? clamp(Math.round(window.innerWidth * .62), 360, 560) : clamp(Math.round(window.innerWidth * .46), 300, 420);
  renderHeight = Math.max(160, Math.round(renderWidth / ratio));
  elements.canvas.width = renderWidth;
  elements.canvas.height = renderHeight;
  ctx.imageSmoothingEnabled = false;
  zBuffer = new Float32Array(Math.ceil(renderWidth / COLUMN_WIDTH));
}

function setGameChrome(visible) {
  elements.hudTop.hidden = !visible;
  elements.hudBottom.hidden = !visible;
  elements.controls.hidden = !visible;
  elements.crosshair.style.display = visible ? '' : 'none';
  elements.miniMap.style.display = visible ? '' : 'none';
}

async function enterFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}

function selectMap(mapKey) {
  if (!MAPS[mapKey]) return;
  selectedMap = mapKey;
  profile.selectedMap = mapKey;
  persistProfile();
  current = previewRun();
  syncProfileUi();
  audio.ui();
}

function openSettings() {
  syncProfileUi();
  elements.settings.hidden = false;
  elements.settingsClose.focus({ preventScroll: true });
  audio.ui();
}
function closeSettings() {
  elements.settings.hidden = true;
  audio.ui();
}

function startGame() {
  enterFullscreen();
  audio.ensure();
  current = createRun(selectedMap);
  phase = 'playing';
  elements.menu.hidden = true;
  elements.briefing.hidden = true;
  elements.pause.hidden = true;
  elements.result.hidden = true;
  elements.settings.hidden = true;
  setGameChrome(true);
  clearInput();
  syncHud();
  showToast('ЗАЧИСТИТЬ СЕКТОР');
  audio.alarm();
  haptic(20);
}

function requestStart() {
  if (!profile.briefingSeen) {
    elements.briefing.hidden = false;
    elements.menu.hidden = true;
    phase = 'briefing';
    audio.ui();
  } else startGame();
}

function showMenu() {
  phase = 'menu';
  clearInput();
  setGameChrome(false);
  elements.menu.hidden = false;
  elements.briefing.hidden = true;
  elements.pause.hidden = true;
  elements.result.hidden = true;
  elements.settings.hidden = true;
  current = previewRun();
  syncProfileUi();
}

function pauseGame() {
  if (phase !== 'playing') return;
  phase = 'paused';
  clearInput();
  elements.pause.hidden = false;
  elements.pauseMap.textContent = current.map.name;
  elements.pauseTime.textContent = formatTime(current.elapsed);
  elements.pauseKills.textContent = `${current.kills}/${current.enemies.length}`;
  elements.pauseAccuracy.textContent = `${current.shots ? Math.round(current.hits / current.shots * 100) : 0}%`;
  audio.ui();
}

function resumeGame() {
  if (phase !== 'paused') return;
  phase = 'playing';
  elements.pause.hidden = true;
  lastFrame = performance.now();
  audio.ui();
}

function resultGrade(score, won) {
  if (!won) return 'F';
  if (score >= 10500) return 'S';
  if (score >= 8200) return 'A';
  if (score >= 6200) return 'B';
  return 'C';
}

function endRun(won) {
  if (phase === 'result') return;
  phase = 'result';
  current.won = won;
  clearInput();
  setGameChrome(false);
  const accuracy = current.shots ? current.hits / current.shots : 0;
  const speedBonus = Math.max(0, 4200 - current.elapsed * 24);
  const healthBonus = current.player.health * 22;
  const accuracyBonus = accuracy * 3100;
  const clearBonus = won ? 2500 : current.kills * 120;
  const score = Math.max(0, Math.round(speedBonus + healthBonus + accuracyBonus + clearBonus));
  const grade = resultGrade(score, won);
  const previous = profile.best[current.mapKey];
  const isRecord = won && (!previous || score > previous.score);
  if (isRecord) {
    profile.best[current.mapKey] = { score, grade, time: current.elapsed, accuracy };
    persistProfile();
  }
  elements.resultKicker.textContent = won ? 'СЕКТОР ЗАЧИЩЕН' : 'ОПЕРАЦИЯ СОРВАНА';
  elements.resultGrade.textContent = grade;
  elements.resultScore.textContent = score.toLocaleString('ru-RU');
  elements.resultTime.textContent = formatTime(current.elapsed);
  elements.resultAccuracy.textContent = `${Math.round(accuracy * 100)}%`;
  elements.resultHealth.textContent = String(Math.max(0, Math.round(current.player.health)));
  elements.recordNote.textContent = isRecord ? 'НОВЫЙ ЛУЧШИЙ РЕЗУЛЬТАТ СОХРАНЁН' : won ? 'СЕКТОР ГОТОВ К ПОВТОРНОЙ ЗАЧИСТКЕ' : 'СМЕНИ МАРШРУТ И НЕ СТОЙ НА ЛИНИИ ОГНЯ';
  elements.result.hidden = false;
  haptic(won ? [35, 45, 70] : [110, 50, 110]);
  won ? audio.tone?.(680, .2, 'triangle', .1, 240) : audio.alarm();
}
