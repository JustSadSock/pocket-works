// ШПИЛЬКА 2.8.2 — visual restoration, scoped records, route hub and recoverable runtime failures.
var shp282ErrorEvents = [];
var shp282ErrorScreen = null;
var shp282LastErrorSignature = '';
var shp282LastErrorAt = 0;
var shp282MedalRanks = { none: 0, bronze: 1, silver: 2, gold: 3 };

function shp282RouteType(archetype = typeof shpActiveArchetype !== 'undefined' ? shpActiveArchetype : null) {
  return archetype?.id || (typeof shpPrefs !== 'undefined' ? shpPrefs.trackType : null) || 'mix';
}

function shp282RouteRecordKey(seed = trackSeed, archetype = typeof shpActiveArchetype !== 'undefined' ? shpActiveArchetype : null) {
  return `${shp282RouteType(archetype)}:${seed >>> 0}`;
}

function shp282MinFinite(a, b) {
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : null;
  if (!Number.isFinite(b)) return a;
  return Math.min(a, b);
}

function shp282MergeRouteRecords(existing = {}, incoming = {}) {
  const previousLap = Number.isFinite(existing.bestLap) ? existing.bestLap : null;
  const incomingLap = Number.isFinite(incoming.bestLap) ? incoming.bestLap : null;
  const incomingGhostWins = Array.isArray(incoming.ghost)
    && (previousLap == null || (incomingLap != null && incomingLap <= previousLap + 0.025));
  const existingSectors = Array.isArray(existing.bestSectors) ? existing.bestSectors : [];
  const incomingSectors = Array.isArray(incoming.bestSectors) ? incoming.bestSectors : [];
  const bestSectors = Array.from({ length: Math.max(3, existingSectors.length, incomingSectors.length) }, (_, index) => (
    shp282MinFinite(existingSectors[index], incomingSectors[index])
  ));
  const existingMedal = existing.medal || 'none';
  const incomingMedal = incoming.medal || 'none';
  const medal = (shp282MedalRanks[incomingMedal] || 0) > (shp282MedalRanks[existingMedal] || 0)
    ? incomingMedal
    : existingMedal;

  return {
    ...existing,
    ...incoming,
    bestLap: shp282MinFinite(existing.bestLap, incoming.bestLap),
    bestRace: shp282MinFinite(existing.bestRace, incoming.bestRace),
    bestSectors,
    medal,
    ghost: incomingGhostWins ? incoming.ghost : existing.ghost || incoming.ghost,
    updatedAt: Math.max(existing.updatedAt || 0, incoming.updatedAt || 0, Date.now())
  };
}

function shp282NormalizeCurrentRouteRecord() {
  if (!saved.routeRecords || typeof saved.routeRecords !== 'object') saved.routeRecords = {};
  const scopedKey = shp282RouteRecordKey();
  const legacyKey = String(trackSeed >>> 0);
  const legacy = saved.routeRecords[legacyKey];
  if (legacy) {
    saved.routeRecords[scopedKey] = shp282MergeRouteRecords(saved.routeRecords[scopedKey], legacy);
    delete saved.routeRecords[legacyKey];
  }
  return scopedKey;
}

var shp282BaseSaveState = saveState;
saveState = function shp282SaveState() {
  shp282NormalizeCurrentRouteRecord();
  return shp282BaseSaveState();
};

currentRouteRecord = function shp282CurrentRouteRecord() {
  const key = shp282NormalizeCurrentRouteRecord();
  return saved.routeRecords?.[key] || null;
};

if (typeof shp23ParseRouteCode === 'function') {
  shp23ParseRouteCode = function shp282ParseRouteCode(raw) {
    const normalized = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const match = normalized.match(/^([VTMK])[-:]?([0-9A-Z]{1,7})$/);
    if (!match) return null;
    const numeric = Number.parseInt(match[2], 36);
    if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0xFFFFFFFF) return null;
    const typeByCode = { V: 'speed', T: 'technical', M: 'mountain', K: 'cascade' };
    return {
      seed: numeric >>> 0,
      type: typeByCode[match[1]],
      code: `${match[1]}-${numeric.toString(36).toUpperCase().padStart(7, '0')}`
    };
  };
}

function shp282SnapshotCar(car) {
  return { ...car };
}

function shp282RestoreCar(car, snapshot) {
  for (const key of Object.keys(car)) {
    if (!(key in snapshot)) delete car[key];
  }
  Object.assign(car, snapshot);
}

if (typeof shp281CurrentUpdateCar === 'function') {
  updateCar = function shp282TransactionalUpdateCar(car, dt) {
    const snapshot = shp282SnapshotCar(car);
    const previousWidth = roadWidth;
    const previousHalf = roadHalf;
    try {
      return shp281CurrentUpdateCar(car, dt);
    } catch (error) {
      shp282RestoreCar(car, snapshot);
      roadWidth = previousWidth;
      roadHalf = previousHalf;
      shp281ReportError('car', error);
      if (typeof shp28BaseUpdateCar === 'function') {
        try {
          return shp28BaseUpdateCar(car, dt);
        } catch (fallbackError) {
          shp282RestoreCar(car, snapshot);
          shp281ReportError('car-fallback', fallbackError);
        }
      }
      return undefined;
    } finally {
      roadWidth = previousWidth;
      roadHalf = previousHalf;
    }
  };
}

function shp282CreateRuntimeErrorScreen() {
  if (shp282ErrorScreen) return shp282ErrorScreen;
  const screen = document.createElement('section');
  screen.id = 'runtimeErrorScreen';
  screen.className = 'runtime-error-screen';
  screen.hidden = true;
  screen.innerHTML = `
    <div class="runtime-error-panel" role="alertdialog" aria-modal="true" aria-labelledby="runtimeErrorTitle">
      <p class="eyebrow">ЗАЕЗД ОСТАНОВЛЕН</p>
      <h2 id="runtimeErrorTitle">ОШИБКА ДВИЖКА</h2>
      <p id="runtimeErrorMessage">Состояние гонки повреждено. Можно безопасно перезапустить этот маршрут.</p>
      <button class="primary-action" id="runtimeRetryButton" type="button">ПОВТОРИТЬ ЗАЕЗД</button>
      <button class="secondary-action" id="runtimeNewRouteButton" type="button">НОВАЯ ТРАССА</button>
      <button class="text-control" id="runtimeMenuButton" type="button">В ГЛАВНОЕ МЕНЮ</button>
    </div>`;
  document.querySelector('.app-shell')?.append(screen);
  screen.querySelector('#runtimeRetryButton')?.addEventListener('click', () => {
    screen.hidden = true;
    shp282ErrorEvents = [];
    beginRace();
  });
  screen.querySelector('#runtimeNewRouteButton')?.addEventListener('click', () => {
    screen.hidden = true;
    shp282ErrorEvents = [];
    if (typeof shp281PrepareVisibleRoute === 'function') {
      shp281PrepareVisibleRoute(null, true);
    } else {
      prepareRoute();
      setupRace();
      mode = 'menu';
      startScreen.hidden = false;
      showRaceUi(false);
    }
  });
  screen.querySelector('#runtimeMenuButton')?.addEventListener('click', () => {
    screen.hidden = true;
    shp282ErrorEvents = [];
    if (typeof shp28ReturnToMenu === 'function') shp28ReturnToMenu();
    else {
      mode = 'menu';
      startScreen.hidden = false;
      pauseScreen.hidden = true;
      finishScreen.hidden = true;
      showRaceUi(false);
    }
  });
  shp282ErrorScreen = screen;
  return screen;
}

function shp282ShowRuntimeError(scope, error) {
  const screen = shp282CreateRuntimeErrorScreen();
  const message = error?.message || String(error || 'Неизвестная ошибка');
  const node = screen.querySelector('#runtimeErrorMessage');
  if (node) node.textContent = `Сбой: ${scope}. ${message.slice(0, 140)}. Маршрут и рекорды сохранены.`;
  resetInputs();
  mode = 'error';
  showRaceUi(false);
  countdownNode.hidden = true;
  recoverButton.hidden = true;
  screen.hidden = false;
}

function shp282TrackRuntimeError(scope, error) {
  const relevant = /^(simulation|frame-render|car|car-fallback|ai|jump-render|cars-render)$/.test(scope);
  if (!relevant || mode === 'error') return;
  const now = performance.now();
  const signature = `${scope}:${error?.message || String(error)}`;
  if (signature === shp282LastErrorSignature && now - shp282LastErrorAt < 180) return;
  shp282LastErrorSignature = signature;
  shp282LastErrorAt = now;
  shp282ErrorEvents.push(now);
  shp282ErrorEvents = shp282ErrorEvents.filter((time) => now - time < 3200);
  if (shp282ErrorEvents.length >= 4) shp282ShowRuntimeError(scope, error);
}

var shp282BaseReportError = shp281ReportError;
shp281ReportError = function shp282ReportError(scope, error) {
  shp282BaseReportError(scope, error);
  shp282TrackRuntimeError(scope, error);
};

var shp282BaseDrawGround = shp281DrawGround;
shp281DrawGround = function shp282DrawGround() {
  shp282BaseDrawGround();
  if (typeof drawProps === 'function') drawProps();
};

function shp282TraceRacingLine(step = 3) {
  if (!track.length) return false;
  ctx.beginPath();
  const first = track[0];
  ctx.moveTo(first.x + first.nx * (first.raceOffset || 0), first.y + first.ny * (first.raceOffset || 0));
  for (let index = step; index < track.length; index += step) {
    const point = track[index];
    ctx.lineTo(point.x + point.nx * (point.raceOffset || 0), point.y + point.ny * (point.raceOffset || 0));
  }
  ctx.closePath();
  return true;
}

function shp282DrawRacingLine() {
  if (!shp282TraceRacingLine()) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(245,241,228,0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([26, 34]);
  ctx.stroke();
  ctx.restore();
}

function shp282DrawAdaptiveCurbs() {
  if (!track.length) return;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 11;
  for (let index = 0; index < track.length; index += 8) {
    const nextIndex = (index + 8) % track.length;
    const a = track[index];
    const b = track[nextIndex];
    const color = Math.floor(index / 8) % 2 === 0 ? theme.curbA : theme.curbB;
    ctx.strokeStyle = color;
    for (const side of [-1, 1]) {
      const widthA = shp28BaseRoadHalf * clamp(a.shp28WidthFactor || 1, 0.72, 1.34) + 2;
      const widthB = shp28BaseRoadHalf * clamp(b.shp28WidthFactor || 1, 0.72, 1.34) + 2;
      ctx.beginPath();
      ctx.moveTo(a.x + a.nx * side * widthA, a.y + a.ny * side * widthA);
      ctx.lineTo(b.x + b.nx * side * widthB, b.y + b.ny * side * widthB);
      ctx.stroke();
    }
  }
  ctx.restore();
}

shp281DrawSections = function shp282DrawSectionsWithoutRotatedLabels() {
  for (const section of shp28Sections || []) {
    const width = shp28BaseRoadWidth * section.width;
    shp281TraceSection(section);
    ctx.strokeStyle = section.kind === 'gravel' ? theme.terrainDark : theme.shoulder;
    ctx.lineWidth = width + 48;
    ctx.stroke();
    ctx.strokeStyle = '#20231f';
    ctx.lineWidth = width + 12;
    ctx.stroke();
    ctx.strokeStyle = section.kind === 'gravel'
      ? theme.shoulder
      : (section.kind === 'dam' || section.kind === 'compression' ? '#414844' : theme.asphalt);
    ctx.lineWidth = width;
    ctx.stroke();
    if (section.kind === 'gravel') {
      shp281TraceSection(section);
      ctx.save();
      ctx.strokeStyle = 'rgba(238,226,199,0.18)';
      ctx.lineWidth = width * 0.72;
      ctx.setLineDash([7, 17]);
      ctx.stroke();
      ctx.restore();
    }
  }
};

function shp282TraceDistanceRange(startDistance, length, stepDistance = 28) {
  const steps = Math.max(4, Math.ceil(length / stepDistance));
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const point = shp28PointAtDistance(startDistance + length * step / steps);
    if (!point) continue;
    if (step === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
}

function shp282DrawJumpPad(point, width, landing = false) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  ctx.fillStyle = '#d45731';
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 4;
  ctx.fillRect(landing ? -42 : -48, -width * 0.5 + 12, landing ? 52 : 96, width - 24);
  ctx.strokeRect(landing ? -42 : -48, -width * 0.5 + 12, landing ? 52 : 96, width - 24);
  if (!landing) {
    ctx.fillStyle = '#f2eee0';
    for (let y = -width * 0.5 + 22; y < width * 0.5 - 20; y += 28) {
      ctx.beginPath();
      ctx.moveTo(-28, y);
      ctx.lineTo(12, y + 11);
      ctx.lineTo(-28, y + 22);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

shp28DrawJump = function shp282DrawCurvedJumpGap() {
  if (!shp28Jump) return;
  const takeoff = track[shp28Jump.takeoffIndex];
  const landing = track[shp28Jump.landingIndex];
  if (!takeoff || !landing) return;
  const width = shp28BaseRoadWidth + 36;
  const gapStart = shp28Jump.startDistance + 42;
  const visibleGap = Math.max(60, shp28Jump.gapLength - 76);
  ctx.save();
  shp282TraceDistanceRange(gapStart, visibleGap);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#161817';
  ctx.lineWidth = width * 1.16;
  ctx.stroke();
  shp282TraceDistanceRange(gapStart, visibleGap);
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = width * 0.76;
  ctx.stroke();
  ctx.restore();
  shp282DrawJumpPad(takeoff, shp28BaseRoadWidth, false);
  shp282DrawJumpPad(landing, shp28BaseRoadWidth, true);
};

shp281DrawTrack = function shp282DrawTrack() {
  shp281DrawBaseTrack();
  shp281DrawSections();
  shp282DrawRacingLine();
  shp282DrawAdaptiveCurbs();
  if (typeof shp28DrawJump === 'function') {
    try { shp28DrawJump(); } catch (error) { shp281ReportError('jump-render', error); }
  }
  try { drawFinishLine(); } catch (error) { shp281ReportError('finish-render', error); }
};

function shp282BuildRouteHub() {
  if (document.querySelector('#routeHub')) return;
  const routeTools = document.querySelector('.route-tools');
  const routeCodePanel = document.querySelector('.route-code-panel');
  const medalBoard = document.querySelector('.medal-board');
  if (!routeTools || !routeCodePanel || !medalBoard) return;

  const row = document.createElement('div');
  row.className = 'route-action-row';
  newRouteButton.before(row);
  row.append(newRouteButton);
  const openButton = document.createElement('button');
  openButton.id = 'routeHubButton';
  openButton.className = 'secondary-action';
  openButton.type = 'button';
  openButton.textContent = 'МАРШРУТЫ';
  row.append(openButton);

  const hub = document.createElement('section');
  hub.id = 'routeHub';
  hub.className = 'route-hub';
  hub.hidden = true;
  hub.innerHTML = `
    <div class="route-hub-sheet" role="dialog" aria-modal="true" aria-labelledby="routeHubTitle">
      <header><div><p class="eyebrow">АРХИВ ТРАСС</p><h2 id="routeHubTitle">МАРШРУТЫ</h2></div><button id="routeHubClose" type="button" aria-label="Закрыть">ЗАКРЫТЬ</button></header>
      <div class="route-hub-summary" id="routeHubSummary"></div>
      <div class="route-hub-content" id="routeHubContent"></div>
    </div>`;
  document.querySelector('.app-shell')?.append(hub);
  const content = hub.querySelector('#routeHubContent');
  content?.append(routeTools, routeCodePanel, medalBoard);

  const setOpen = (open) => {
    hub.hidden = !open;
    if (open) {
      shp282UpdateRouteHub();
      hub.querySelector('#routeHubClose')?.focus();
    } else {
      openButton.focus();
    }
  };
  openButton.addEventListener('click', () => setOpen(true));
  hub.querySelector('#routeHubClose')?.addEventListener('click', () => setOpen(false));
  hub.addEventListener('pointerdown', (event) => { if (event.target === hub) setOpen(false); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !hub.hidden) {
      event.preventDefault();
      setOpen(false);
    }
  });
}

function shp282UpdateRouteHub() {
  const summary = document.querySelector('#routeHubSummary');
  if (!summary || !track.length) return;
  const record = currentRouteRecord();
  const code = typeof shp23RouteCode === 'function' ? shp23RouteCode() : String(trackSeed >>> 0);
  const best = Number.isFinite(record?.bestLap) ? formatTime(record.bestLap) : '—';
  summary.innerHTML = `<b>${trackName}</b><span>${code}</span><span>ЛУЧШИЙ КРУГ ${best}</span>`;
}

var shp282BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp282UpdateRouteUi() {
  shp282BaseUpdateRouteUi();
  shp282UpdateRouteHub();
};

function shp282CreateRaceAdvisory() {
  if (document.querySelector('#raceAdvisory')) return;
  const advisory = document.createElement('div');
  advisory.id = 'raceAdvisory';
  advisory.className = 'race-advisory';
  advisory.hidden = true;
  advisory.innerHTML = '<b id="raceAdvisoryTitle"></b><span id="raceAdvisoryMeta"></span>';
  document.querySelector('.app-shell')?.append(advisory);
}

function shp282NearestSectionAhead(car) {
  if (!car || !track.length || !Array.isArray(shp28Sections)) return null;
  const distance = track[car.trackIndex]?.distance || 0;
  let best = null;
  let gap = Infinity;
  for (const section of shp28Sections) {
    const value = shp28ForwardDistance(distance, section.center - section.length * 0.5);
    if (value < gap) {
      gap = value;
      best = section;
    }
  }
  return best ? { section: best, gap } : null;
}

function shp282UpdateRaceAdvisory() {
  const advisory = document.querySelector('#raceAdvisory');
  if (!advisory) return;
  if (mode !== 'race' && mode !== 'countdown') {
    advisory.hidden = true;
    return;
  }
  const current = shp28SectionAtCar(player);
  const next = shp282NearestSectionAhead(player);
  const distance = track[player?.trackIndex || 0]?.distance || 0;
  const jumpGap = shp28Jump ? shp28ForwardDistance(distance, shp28Jump.startDistance) : Infinity;
  const title = advisory.querySelector('#raceAdvisoryTitle');
  const meta = advisory.querySelector('#raceAdvisoryMeta');

  if (shp28Jump && jumpGap > 0 && jumpGap < 560) {
    const speed = Math.round(Math.abs(player?.forwardSpeed || 0) * 0.56);
    const target = 200;
    advisory.dataset.tone = speed < target && jumpGap < 280 ? 'danger' : 'jump';
    if (title) title.textContent = 'РАЗРЫВ ТРАССЫ';
    if (meta) meta.textContent = `${Math.round(jumpGap)} М · НУЖНО ≈ ${target} КМ/Ч · СЕЙЧАС ${speed}`;
    advisory.hidden = false;
    return;
  }

  const section = current || next?.section;
  const gap = current ? 0 : next?.gap;
  if (!section || (!current && gap > 420)) {
    advisory.hidden = true;
    return;
  }
  advisory.dataset.tone = current ? 'active' : 'preview';
  if (title) title.textContent = section.label;
  if (meta) meta.textContent = current ? 'СЕКТОР' : `${Math.round(gap)} М`;
  advisory.hidden = false;
}

var shp282BaseUpdateSimulation = updateSimulation;
updateSimulation = function shp282UpdateSimulation(dt) {
  const result = shp282BaseUpdateSimulation(dt);
  shp282UpdateRaceAdvisory();
  if ((mode === 'race' || mode === 'countdown') && shp282ErrorEvents.length) {
    const now = performance.now();
    shp282ErrorEvents = shp282ErrorEvents.filter((time) => now - time < 3200);
  }
  return result;
};

var shp282BaseResolveCarCollisions = resolveCarCollisions;
resolveCarCollisions = function shp282ResolveCarCollisions() {
  if (mode === 'postfinish') return;
  return shp282BaseResolveCarCollisions();
};

var shp282BaseUpdateParticles = updateParticles;
updateParticles = function shp282UpdateParticles(dt) {
  if (mode === 'postfinish') {
    if (particles.length) particles = [];
    return;
  }
  return shp282BaseUpdateParticles(dt);
};

shp282BuildRouteHub();
shp282CreateRaceAdvisory();
shp282CreateRuntimeErrorScreen();
shp282NormalizeCurrentRouteRecord();
