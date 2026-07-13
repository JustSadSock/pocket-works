// ШПИЛЬКА 2.3 — daily routes, shareable codes and route medals.

var shp23RouteOverride = null;
var shp23RouteMode = 'random';
var shp23MedalTargets = null;
var shp23MedalRanks = { none: 0, bronze: 1, silver: 2, gold: 3 };
var shp23MedalLabels = { bronze: 'БРОНЗА', silver: 'СЕРЕБРО', gold: 'ЗОЛОТО' };
var shp23TypeByCode = { V: 'speed', T: 'technical', M: 'mountain', K: 'cascade' };

function shp23RouteCode(seed = trackSeed, archetype = shpActiveArchetype) {
  const prefix = archetype?.code || 'V';
  return `${prefix}-${(seed >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

function shp23ParseRouteCode(raw) {
  const normalized = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/^([VTMK])[-:]?([0-9A-Z]{1,7})$/);
  if (!match) return null;
  const seed = Number.parseInt(match[2], 36);
  if (!Number.isFinite(seed)) return null;
  return {
    seed: seed >>> 0,
    type: shp23TypeByCode[match[1]],
    code: `${match[1]}-${match[2].padStart(7, '0')}`
  };
}

function shp23DailySeed(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return hashSeed((day ^ 0x53a17d2b) >>> 0);
}

function shp23DailyLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
  }).format(date);
}

function shp23ComputeMedalTargets() {
  if (!track?.length) return null;
  let ideal = 0;
  for (let i = 0; i < track.length; i += 1) {
    const point = track[i];
    const next = track[(i + 1) % track.length];
    const distance = Math.hypot(next.x - point.x, next.y - point.y);
    const cornerSpeed = clamp((point.speedLimit || 520) * 0.90 + 28, 220, 690);
    ideal += distance / cornerSpeed;
  }
  const archetypePenalty = shpActiveArchetype?.id === 'technical'
    ? 1.2
    : shpActiveArchetype?.id === 'mountain'
      ? 0.8
      : 0.35;
  const jumpPenalty = shpRampIndices.length * 0.32;
  const gold = Math.max(7.5, ideal + 1.7 + archetypePenalty + jumpPenalty);
  return { gold, silver: gold * 1.14, bronze: gold * 1.31 };
}

function shp23MedalForTime(duration) {
  if (!shp23MedalTargets || !Number.isFinite(duration)) return 'none';
  if (duration <= shp23MedalTargets.gold) return 'gold';
  if (duration <= shp23MedalTargets.silver) return 'silver';
  if (duration <= shp23MedalTargets.bronze) return 'bronze';
  return 'none';
}

function shp23CurrentMedal() {
  return currentRouteRecord()?.medal || 'none';
}

function shp23EnsureRouteBadge() {
  const routeName = document.querySelector('#routeName');
  if (!routeName || document.querySelector('#routeModeBadge')) return;
  const badge = document.createElement('span');
  badge.className = 'route-mode-badge';
  badge.id = 'routeModeBadge';
  badge.hidden = true;
  routeName.append(' ', badge);
}

function shp23UpdateRouteExtras() {
  shp23EnsureRouteBadge();
  const code = shp23RouteCode();
  const codeValue = document.querySelector('#routeCodeValue');
  const codeInput = document.querySelector('#routeCodeInput');
  const dailyButton = document.querySelector('#dailyRouteButton');
  const badge = document.querySelector('#routeModeBadge');
  if (codeValue) codeValue.textContent = code;
  if (codeInput && document.activeElement !== codeInput) codeInput.value = code;
  if (dailyButton) dailyButton.classList.toggle('is-active', shp23RouteMode === 'daily');
  if (badge) {
    badge.hidden = shp23RouteMode === 'random';
    badge.textContent = shp23RouteMode === 'daily' ? `ДЕНЬ ${shp23DailyLabel()}` : 'ПО КОДУ';
  }

  const earned = shp23CurrentMedal();
  for (const medal of ['bronze', 'silver', 'gold']) {
    const node = document.querySelector(`[data-medal="${medal}"]`);
    if (!node || !shp23MedalTargets) continue;
    const value = node.querySelector('b');
    if (value) value.textContent = formatTime(shp23MedalTargets[medal]);
    node.classList.toggle('is-earned', shp23MedalRanks[earned] >= shp23MedalRanks[medal]);
  }
}

var shp23BasePrepareRoute = prepareRoute;
prepareRoute = function shp23PrepareRoute(forceSeed = null) {
  const override = shp23RouteOverride;
  const previousType = shpPrefs.trackType;
  if (override?.type) shpPrefs.trackType = override.type;
  shp23BasePrepareRoute(override?.seed ?? forceSeed);
  shpPrefs.trackType = previousType;
  shp23RouteMode = override?.mode || 'random';
  shp23RouteOverride = null;
  shp23MedalTargets = shp23ComputeMedalTargets();
  shp23UpdateRouteExtras();
};

var shp23BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp23UpdateRouteUi() {
  shp23BaseUpdateRouteUi();
  routeMeta.textContent = routeMeta.textContent.replace(/КОД\s+[^·]+$/u, `КОД ${shp23RouteCode()}`);
  shp23UpdateRouteExtras();
};

function shp23StoreMedal(duration) {
  const medal = shp23MedalForTime(duration);
  if (medal === 'none') return;
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const previous = old.medal || 'none';
  if (shp23MedalRanks[medal] <= shp23MedalRanks[previous]) return;
  saved.routeRecords[key] = { ...old, medal, updatedAt: Date.now() };
  saveState();
  showRaceMessage(shp23MedalLabels[medal], 0.9);
  audio.blip('lap', medal === 'gold' ? 1 : 0.78);
  navigator.vibrate?.(medal === 'gold' ? [10, 26, 10] : 8);
  shp23UpdateRouteExtras();
}

var shp23BaseStoreBestLap = shpStoreBestLap;
shpStoreBestLap = function shp23StoreBestLap(duration) {
  shp23BaseStoreBestLap(duration);
  shp23StoreMedal(duration);
};

var shp23BaseFinishRace = finishRace;
finishRace = function shp23FinishRace() {
  shp23BaseFinishRace();
  const medal = shp23MedalForTime(player?.bestLap);
  if (medal !== 'none') finishSummary.textContent += ` Медаль: ${shp23MedalLabels[medal]}.`;
  else if (shp23MedalTargets && Number.isFinite(player?.bestLap)) {
    finishSummary.textContent += ` До бронзы ${(player.bestLap - shp23MedalTargets.bronze).toFixed(2)} с.`;
  }
};

function shp23SetCodeStatus(text, error = false) {
  const node = document.querySelector('#routeCodeStatus');
  if (!node) return;
  node.textContent = text;
  node.dataset.error = String(error);
}

async function shp23CopyCode() {
  const code = shp23RouteCode();
  try {
    await navigator.clipboard.writeText(code);
    shp23SetCodeStatus(`СКОПИРОВАНО: ${code}`);
  } catch {
    const input = document.querySelector('#routeCodeInput');
    if (input) {
      input.value = code;
      input.select();
      document.execCommand?.('copy');
    }
    shp23SetCodeStatus(`КОД: ${code}`);
  }
}

function shp23LoadCode() {
  const input = document.querySelector('#routeCodeInput');
  const parsed = shp23ParseRouteCode(input?.value);
  if (!parsed) {
    shp23SetCodeStatus('НЕВЕРНЫЙ КОД. ПРИМЕР: T-01K9CZ4', true);
    return;
  }
  shp23RouteOverride = { seed: parsed.seed, type: parsed.type, mode: 'code' };
  prepareRoute();
  setupRace();
  shp23SetCodeStatus(`ЗАГРУЖЕНО: ${shp23RouteCode()}`);
  audio.blip('menu', 0.7);
}

function shp23BindRouteTools() {
  const dailyButton = document.querySelector('#dailyRouteButton');
  const codeButton = document.querySelector('#routeCodeButton');
  const panel = document.querySelector('#routeCodePanel');
  const input = document.querySelector('#routeCodeInput');

  dailyButton?.addEventListener('click', () => {
    shp23RouteOverride = { seed: shp23DailySeed(), type: 'mix', mode: 'daily' };
    prepareRoute();
    setupRace();
    shp23SetCodeStatus(`МАРШРУТ ДНЯ · ${shp23DailyLabel()}`);
    audio.blip('menu', 0.72);
  });

  codeButton?.addEventListener('click', () => {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (input) input.value = shp23RouteCode();
      input?.focus();
      input?.select();
    }
  });

  document.querySelector('#loadRouteCodeButton')?.addEventListener('click', shp23LoadCode);
  document.querySelector('#copyRouteCodeButton')?.addEventListener('click', shp23CopyCode);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') shp23LoadCode();
  });
}

shp23BindRouteTools();
