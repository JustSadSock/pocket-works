function setupRace() {
  particles = [];
  skidMarks = [];
  raceElapsed = 0;
  finishDelay = 0;
  cameraShake = 0;
  resetInputs();

  cars = [
    createCar({ id: 'player', name: 'ТЫ', color: '#f4efe0', accent: '#e65e2f', player: true, lane: -12 }),
    createCar({ id: 'rook', name: 'ГРАЧ', color: '#377a76', accent: '#f4efe0', skill: 1.00, aggression: 0.45, lane: 16, aiPhase: 0.4 }),
    createCar({ id: 'volt', name: 'ВОЛЬТ', color: '#d5a519', accent: '#1e211f', skill: 1.035, aggression: 0.72, lane: -18, aiPhase: 1.2 }),
    createCar({ id: 'mara', name: 'МАРА', color: '#526c9d', accent: '#f4efe0', skill: 0.985, aggression: 0.38, lane: 22, aiPhase: 2.1 }),
    createCar({ id: 'shunt', name: 'ШУНТ', color: '#a84f42', accent: '#f4efe0', skill: 1.055, aggression: 0.86, lane: 2, aiPhase: 3.4 })
  ];
  player = cars[0];

  const start = track[0];
  const startAngle = start.heading;
  cars.forEach((car, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const backward = 58 + row * 68;
    const lateral = index === 0 ? -12 : side * 30;
    car.x = start.x - start.tx * backward + start.nx * lateral;
    car.y = start.y - start.ty * backward + start.ny * lateral;
    car.angle = startAngle;
    const nearest = nearestTrackIndex(car.x, car.y);
    car.trackIndex = nearest.index;
    car.previousTrackIndex = nearest.index;
    car.safeIndex = nearest.index;
    car.progressDistance = track[nearest.index].distance;
    if (nearest.index > track.length * 0.78) car.progressDistance -= track.totalLength;
    car.nextLapDistance = track.totalLength;
    car.lastProgressScore = car.progressDistance;
    car.lapStartTime = 0;
  });

  raceOrder = [...cars];
  cameraAngle = player.angle;
  cameraX = player.x;
  cameraY = player.y;
  updateHud();
}

function resetInputs() {
  Object.keys(input).forEach((key) => { input[key] = false; });
  document.querySelectorAll('.is-active').forEach((node) => node.classList.remove('is-active'));
}

function showRaceUi(visible) {
  hud.hidden = !visible;
  controls.hidden = !visible;
  speedCluster.hidden = !visible;
}

function beginRace(options = {}) {
  if (options.newRoute) prepareRoute();
  setupRace();
  startScreen.hidden = true;
  pauseScreen.hidden = true;
  finishScreen.hidden = true;
  showRaceUi(true);
  mode = 'countdown';
  countdownElapsed = 0;
  lastCountdownBeat = 4;
  countdownNode.hidden = false;
  countdownNode.textContent = '3';
  audio.unlock();
}

function returnToMenuWithNewRoute() {
  prepareRoute();
  setupRace();
  mode = 'menu';
  startScreen.hidden = false;
  pauseScreen.hidden = true;
  finishScreen.hidden = true;
  countdownNode.hidden = true;
  showRaceUi(false);
}

function setPause(paused) {
  if (paused && (mode === 'race' || mode === 'countdown')) {
    previousMode = mode;
    mode = 'paused';
    pauseScreen.hidden = false;
    showRaceUi(false);
    countdownNode.hidden = true;
    resetInputs();
    audio.update(player, false);
  } else if (!paused && mode === 'paused') {
    mode = previousMode === 'countdown' ? 'countdown' : 'race';
    pauseScreen.hidden = true;
    showRaceUi(true);
    countdownNode.hidden = mode !== 'countdown';
    lastFrame = performance.now();
  }
}

function showRaceMessage(text, duration = 0.8) {
  raceMessage.textContent = text;
  raceMessage.hidden = false;
  raceMessage.dataset.remaining = String(duration);
}

function storeRouteRecord() {
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const bestLapValue = player.bestLap == null ? old.bestLap : old.bestLap == null ? player.bestLap : Math.min(old.bestLap, player.bestLap);
  const bestRaceValue = player.finishTime == null ? old.bestRace : old.bestRace == null ? player.finishTime : Math.min(old.bestRace, player.finishTime);
  saved.routeRecords[key] = { bestLap: bestLapValue ?? null, bestRace: bestRaceValue ?? null, updatedAt: Date.now() };
  saveState();
}

function finishRace() {
  if (mode === 'finished') return;
  mode = 'finished';
  resetInputs();
  showRaceUi(false);
  countdownNode.hidden = true;
  recoverButton.hidden = true;
  audio.update(player, false);
  storeRouteRecord();

  const ranking = [...cars].sort(compareRaceOrder);
  const place = ranking.indexOf(player) + 1;
  finishKicker.textContent = place === 1 ? 'ЧИСТАЯ РАБОТА' : place <= 3 ? 'ПОДИУМ' : 'ФИНИШ';
  finishTitle.textContent = `${place} МЕСТО`;
  const record = currentRouteRecord();
  finishSummary.textContent = `${trackName}. Время ${formatTime(player.finishTime || raceElapsed)}. Лучший круг ${formatTime(record?.bestLap)}.`;
  resultsNode.innerHTML = '';
  ranking.forEach((car, index) => {
    const item = document.createElement('li');
    if (car.player) item.classList.add('is-player');
    const status = car.finishTime ? formatTime(car.finishTime) : `${Math.max(1, car.completedLaps + 1)}/${lapsToWin} круг`;
    item.innerHTML = `<span>${index + 1}</span><b>${car.name}</b><time>${status}</time>`;
    resultsNode.append(item);
  });
  restartButtonFinish.textContent = 'НОВАЯ ТРАССА';
  finishScreen.hidden = false;
  audio.blip(place === 1 ? 'go' : 'lap', 1);
}

function compareRaceOrder(a, b) {
  if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
  if (a.finishTime != null) return -1;
  if (b.finishTime != null) return 1;
  return b.raceScore - a.raceScore;
}

function updateRaceOrder() {
  raceOrder = [...cars].sort(compareRaceOrder);
}

function gearForSpeed(speed) {
  if (speed < 18) return 'N';
  return String(Math.min(6, 1 + Math.floor(speed / 118)));
}

function updateHud() {
  if (!player) return;
  const speed = Math.round(Math.abs(player.forwardSpeed) * 0.56);
  speedValue.textContent = String(speed);
  gearValue.textContent = gearForSpeed(Math.abs(player.forwardSpeed));
  positionValue.textContent = `${raceOrder.indexOf(player) + 1}/${cars.length}`;
  lapValue.textContent = `${Math.min(player.completedLaps + 1, lapsToWin)}/${lapsToWin}`;
  lapTime.textContent = formatTime(Math.max(0, raceElapsed - player.lapStartTime));
  const record = currentRouteRecord();
  bestLap.textContent = record?.bestLap ? `РЕКОРД ${formatTime(record.bestLap)}` : 'РЕКОРД —';
}

function updateSoundLabels() {
  const label = `ЗВУК: ${saved.sound ? 'ВКЛ' : 'ВЫКЛ'}`;
  document.querySelector('#soundButtonStart').textContent = label;
  document.querySelector('#soundButtonPause').textContent = label;
}
