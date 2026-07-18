import {
  STORAGE_KEY, MAX_DAYS, TOWNS, FACTIONS,
  createCampaign, validateCampaign, missionsForDay, planeStats,
  createFlight, stepFlight, terrainHeight, windAt,
  applyFlightResult, campaignEnding, clamp, lerp, mulberry32, hashString
} from './game-core.js';

const $ = id => document.getElementById(id);
const screens = ['mapScreen','workshopScreen','launchScreen','reportScreen','endingScreen'].map($);
const ui = {
  dayValue: $('dayValue'), soundButton: $('soundButton'), pauseButton: $('pauseButton'),
  mapCanvas: $('mapCanvas'), missionList: $('missionList'), prepareButton: $('prepareButton'), prepareHint: $('prepareHint'),
  suppliesValue: $('suppliesValue'), deliveredValue: $('deliveredValue'), lostValue: $('lostValue'), influencePanel: $('influencePanel'),
  workshopScreen: $('workshopScreen'), backToMapButton: $('backToMapButton'), missionTicket: $('missionTicket'), paperPlane: $('paperPlane'), tableWind: $('tableWind'),
  wingInput: $('wingInput'), ballastInput: $('ballastInput'), creaseInput: $('creaseInput'), wingOutput: $('wingOutput'), ballastOutput: $('ballastOutput'), creaseOutput: $('creaseOutput'),
  statsGrid: $('statsGrid'), toLaunchButton: $('toLaunchButton'),
  launchScreen: $('launchScreen'), flightCanvas: $('flightCanvas'), launchInstruction: $('launchInstruction'), flightHud: $('flightHud'), trimGuide: $('trimGuide'), abortButton: $('abortButton'),
  distanceValue: $('distanceValue'), distanceTotal: $('distanceTotal'), integrityValue: $('integrityValue'), waterValue: $('waterValue'), windValue: $('windValue'),
  reportKicker: $('reportKicker'), reportTitle: $('reportTitle'), reportScore: $('reportScore'), reportGrid: $('reportGrid'), reportQuote: $('reportQuote'), nextDayButton: $('nextDayButton'),
  endingCanvas: $('endingCanvas'), endingTitle: $('endingTitle'), endingText: $('endingText'), endingStats: $('endingStats'), newCampaignButton: $('newCampaignButton'),
  tutorialOverlay: $('tutorialOverlay'), tutorialButton: $('tutorialButton'), pauseOverlay: $('pauseOverlay'), resumeButton: $('resumeButton'), restartFlightButton: $('restartFlightButton'), leaveFlightButton: $('leaveFlightButton'),
  toast: $('toast')
};

let campaign = loadCampaign();
let missions = campaign.day <= MAX_DAYS ? missionsForDay(campaign) : [];
let selectedMission = null;
let phase = 'map';
let flight = null;
let lastFlightSetup = null;
let raf = 0;
let lastTime = performance.now();
let accumulator = 0;
let pointer = { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0, draggingLaunch: false };
let keys = new Set();
let toastTimer = 0;
let audio = null;
let mapPulse = 0;
let launchPlane = { x: 0, y: 0 };
let paused = false;
let reportPending = false;

function loadCampaign() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createCampaign();
    return validateCampaign(JSON.parse(raw)) || createCampaign();
  } catch {
    return createCampaign();
  }
}

function saveCampaign() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(campaign)); }
  catch { showToast('Сохранение недоступно, но текущий вылет продолжится.'); }
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 2200);
}

function showScreen(id) {
  for (const screen of screens) {
    const active = screen.id === id;
    screen.hidden = !active;
    requestAnimationFrame(() => screen.classList.toggle('is-active', active));
  }
  phase = id.replace('Screen','');
  ui.pauseButton.hidden = phase !== 'launch' || !flight || flight.complete || pointer.draggingLaunch;
  resizeAll();
}

function ensureAudio() {
  if (!campaign.sound) return null;
  if (!audio) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = .13;
    gain.connect(ctx.destination);
    audio = { ctx, gain };
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
  return audio;
}

function tone(freq = 280, duration = .08, type = 'sine', volume = .14, glide = 1) {
  const system = ensureAudio();
  if (!system) return;
  const now = system.ctx.currentTime;
  const osc = system.ctx.createOscillator();
  const gain = system.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(gain); gain.connect(system.gain);
  osc.start(now); osc.stop(now + duration + .02);
}

function haptic(pattern = 12) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function factionColor(key) { return FACTIONS[key]?.color || '#263c37'; }
function weatherName(key) { return ({ crosswind: 'БОКОВОЙ ВЕТЕР', thermals: 'ТЕРМИКИ', rain: 'ДОЖДЕВОЙ ФРОНТ' })[key] || key; }

function renderTopbar() {
  ui.dayValue.textContent = `${Math.min(campaign.day, MAX_DAYS)} / ${MAX_DAYS}`;
  ui.soundButton.textContent = campaign.sound ? 'ЗВУК' : 'ТИХО';
  ui.soundButton.setAttribute('aria-label', campaign.sound ? 'Выключить звук' : 'Включить звук');
}

function renderMap() {
  renderTopbar();
  ui.suppliesValue.textContent = campaign.supplies;
  ui.deliveredValue.textContent = campaign.delivered;
  ui.lostValue.textContent = campaign.lost;
  ui.missionList.innerHTML = '';
  selectedMission = missions.find(m => m.id === selectedMission?.id) || null;
  missions.forEach((mission, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mission-card${selectedMission?.id === mission.id ? ' is-selected' : ''}`;
    button.dataset.index = `0${index + 1}`;
    button.style.setProperty('--faction', factionColor(mission.faction));
    button.innerHTML = `
      <header><b>${mission.town.name.toUpperCase()}</b><span style="color:${factionColor(mission.faction)}">${FACTIONS[mission.faction].short}</span></header>
      <h3>${mission.cargo.title}</h3>
      <p>${mission.cargo.copy}</p>
      <div class="mission-meta"><span>${mission.distance} м</span><span>${weatherName(mission.weather)}</span><span>+${mission.reward}</span></div>`;
    button.addEventListener('click', () => selectMission(mission));
    ui.missionList.append(button);
  });
  ui.prepareButton.disabled = !selectedMission;
  ui.prepareHint.textContent = selectedMission ? `${selectedMission.town.name} · ${selectedMission.distance} м` : 'выбери маршрут';
  renderInfluence();
  drawMap();
}

function renderInfluence() {
  ui.influencePanel.innerHTML = Object.entries(FACTIONS).map(([key, faction]) => {
    const value = campaign.influence[key];
    return `<div class="influence-row" data-negative="${value < 0}" style="--value:${Math.min(50, Math.abs(value) * 4)}%;--color:${faction.color}">
      <span>${faction.short}</span><i></i><b>${value > 0 ? '+' : ''}${value}</b>
    </div>`;
  }).join('');
}

function selectMission(mission) {
  selectedMission = mission;
  tone(250 + missions.indexOf(mission) * 60, .07, 'triangle', .1, 1.18);
  haptic(8);
  renderMap();
}

function prepareMission() {
  if (!selectedMission) return;
  ensureAudio();
  renderWorkshop();
  showScreen('workshopScreen');
  tone(180, .16, 'triangle', .12, 1.7);
}

function renderWorkshop() {
  const p = campaign.plane;
  ui.wingInput.value = Math.round(p.wing * 100);
  ui.ballastInput.value = Math.round(p.ballast * 100);
  ui.creaseInput.value = Math.round(p.crease * 100);
  document.querySelectorAll('[data-finish]').forEach(button => button.classList.toggle('is-active', button.dataset.finish === p.finish));
  ui.missionTicket.innerHTML = `<b>${selectedMission.cargo.title} → ${selectedMission.town.name}</b><span><em>${weatherName(selectedMission.weather)}</em><em>${selectedMission.distance} м · сложность ${Math.round(selectedMission.difficulty * 100)}</em></span>`;
  updatePlaneControls(false);
}

function updatePlaneControls(playSound = true) {
  campaign.plane.wing = Number(ui.wingInput.value) / 100;
  campaign.plane.ballast = Number(ui.ballastInput.value) / 100;
  campaign.plane.crease = Number(ui.creaseInput.value) / 100;
  ui.wingOutput.textContent = ui.wingInput.value;
  ui.ballastOutput.textContent = ui.ballastInput.value;
  ui.creaseOutput.textContent = Number(ui.creaseInput.value) > 0 ? `+${ui.creaseInput.value}` : ui.creaseInput.value;
  const stats = planeStats(campaign.plane);
  ui.statsGrid.innerHTML = [
    ['ПОДЪЁМ', stats.lift], ['СТАБИЛЬНОСТЬ', stats.stability], ['СКОРОСТЬ', stats.speed], ['ДОЖДЬ', stats.rain], ['МАНЁВР', stats.turn]
  ].map(([name, value]) => `<div class="stat-cell"><span>${name}</span><b>${Math.round(value * 100)}</b></div>`).join('');
  const width = 82 + campaign.plane.wing * 105;
  ui.paperPlane.style.setProperty('--wing-width', `${width}px`);
  ui.paperPlane.style.setProperty('--ballast-top', `${35 + campaign.plane.ballast * 70}px`);
  ui.paperPlane.style.setProperty('--crease-rotation', `${campaign.plane.crease * 9}deg`);
  ui.paperPlane.style.setProperty('--crease-left', `${campaign.plane.crease * 7}deg`);
  ui.paperPlane.style.setProperty('--crease-right', `${-campaign.plane.crease * 7}deg`);
  ui.paperPlane.style.setProperty('--plane-fill', campaign.plane.finish === 'wax' ? '#e2d6b8' : '#f8f1df');
  ui.tableWind.style.setProperty('--wind-shift', `${campaign.plane.crease * 60}px`);
  saveCampaign();
  if (playSound) tone(170 + stats.lift * 120, .035, 'triangle', .05, 1.05);
}

function toLaunch() {
  lastFlightSetup = { mission: selectedMission, config: { ...campaign.plane } };
  flight = null;
  pointer.draggingLaunch = false;
  showScreen('launchScreen');
  ui.launchInstruction.hidden = false;
  ui.flightHud.hidden = true;
  ui.trimGuide.hidden = true;
  ui.abortButton.textContent = 'Вернуться в мастерскую';
  resizeFlightCanvas();
  drawLaunchTable();
}

function startFlight(power, angle) {
  ensureAudio();
  flight = createFlight(selectedMission, campaign.plane, { power, angle });
  flight.y = ui.flightCanvas.clientHeight * .48;
  flight.startY = flight.y;
  ui.launchInstruction.hidden = true;
  ui.flightHud.hidden = false;
  ui.trimGuide.hidden = false;
  ui.abortButton.textContent = 'Прервать маршрут';
  ui.pauseButton.hidden = false;
  pointer.draggingLaunch = false;
  paused = false;
  accumulator = 0;
  lastTime = performance.now();
  tone(130, .22, 'sawtooth', .08, 2.4);
  haptic([12, 30, 18]);
}

function finishFlight() {
  if (!flight || reportPending) return;
  reportPending = true;
  ui.pauseButton.hidden = true;
  setTimeout(() => {
    campaign = applyFlightResult(campaign, flight);
    saveCampaign();
    renderReport();
    showScreen('reportScreen');
    reportPending = false;
    tone(flight.success ? 330 : 120, .38, flight.success ? 'triangle' : 'sawtooth', .12, flight.success ? 1.8 : .55);
    haptic(flight.success ? [16, 40, 16] : [40, 40, 60]);
  }, campaign.reduceMotion ? 0 : 500);
}

function renderReport() {
  const mission = flight.mission;
  const faction = FACTIONS[mission.faction];
  ui.reportKicker.textContent = flight.success ? 'МАРШРУТ ЗАВЕРШЁН' : 'ГРУЗ ПОТЕРЯН';
  ui.reportTitle.textContent = flight.success ? `${mission.town.name} получил груз.` : 'Бумага не выдержала.';
  ui.reportScore.textContent = flight.score.toLocaleString('ru-RU');
  const quality = Math.round((flight.integrity * .62 + (1 - flight.water) * .2 + Math.min(1, flight.score / 2800) * .18) * 100);
  ui.reportGrid.innerHTML = `
    <div><span>ФОРМА</span><b>${Math.round(flight.integrity * 100)}%</b></div>
    <div><span>НАМОКАНИЕ</span><b>${Math.round(flight.water * 100)}%</b></div>
    <div><span>УДАРЫ</span><b>${flight.collisions}</b></div>
    <div><span>${faction.short}</span><b>${flight.success ? '+' + Math.max(1, Math.round(mission.reward * (.65 + quality / 100 * .55))) : '-1'}</b></div>`;
  ui.reportQuote.textContent = flight.reason;
  ui.nextDayButton.querySelector('span').textContent = campaign.day > MAX_DAYS ? 'ПОДВЕСТИ ИТОГ' : 'СЛЕДУЮЩИЙ ДЕНЬ';
}

function nextDay() {
  flight = null;
  selectedMission = null;
  if (campaign.day > MAX_DAYS) {
    renderEnding();
    showScreen('endingScreen');
    tone(170, .6, 'triangle', .11, 2.1);
    return;
  }
  missions = missionsForDay(campaign);
  renderMap();
  showScreen('mapScreen');
}

function renderEnding() {
  const ending = campaignEnding(campaign);
  ui.endingTitle.textContent = ending.title;
  ui.endingText.textContent = ending.text;
  ui.endingStats.innerHTML = `
    <div><b>${campaign.delivered}</b><span>ДОСТАВЛЕНО</span></div>
    <div><b>${campaign.lost}</b><span>ПОТЕРЯНО</span></div>
    <div><b>${campaign.bestFlight.toLocaleString('ru-RU')}</b><span>ЛУЧШИЙ ПОЛЁТ</span></div>`;
  drawEnding();
}

function newCampaign() {
  const sound = campaign.sound;
  const tutorialDone = campaign.tutorialDone;
  campaign = createCampaign();
  campaign.sound = sound;
  campaign.tutorialDone = tutorialDone;
  saveCampaign();
  missions = missionsForDay(campaign);
  selectedMission = null;
  renderMap();
  showScreen('mapScreen');
  tone(220, .22, 'triangle', .1, 1.5);
}

function togglePause(force) {
  if (!flight || flight.complete || phase !== 'launch') return;
  paused = typeof force === 'boolean' ? force : !paused;
  ui.pauseOverlay.hidden = !paused;
  ui.pauseButton.textContent = paused ? '▶' : 'II';
  if (!paused) { lastTime = performance.now(); accumulator = 0; }
}

function restartFlight() {
  ui.pauseOverlay.hidden = true;
  paused = false;
  const setup = lastFlightSetup;
  if (!setup) return toLaunch();
  selectedMission = setup.mission;
  campaign.plane = { ...setup.config };
  flight = null;
  toLaunch();
}

function leaveFlight() {
  ui.pauseOverlay.hidden = true;
  paused = false;
  flight = null;
  renderWorkshop();
  showScreen('workshopScreen');
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height, dpr };
}

function resizeAll() {
  if (!ui.mapCanvas.hidden && phase === 'map') drawMap();
  if (phase === 'launch') { resizeFlightCanvas(); if (!flight) drawLaunchTable(); }
  if (phase === 'ending') drawEnding();
}

function resizeFlightCanvas() { resizeCanvas(ui.flightCanvas); }

function drawMap() {
  if (phase !== 'map') return;
  const { ctx, width, height } = resizeCanvas(ui.mapCanvas);
  ctx.clearRect(0, 0, width, height);
  const random = mulberry32(hashString(`${campaign.seed}:map`));
  ctx.save();
  ctx.strokeStyle = 'rgba(38,60,55,.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    ctx.beginPath();
    const y = height * (.08 + i / 20) + Math.sin(i * 1.7) * 8;
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 28) ctx.lineTo(x, y + Math.sin(x * .018 + i) * (7 + random() * 7));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(47,108,106,.5)'; ctx.lineWidth = 1.5;
  missions.forEach((mission, index) => {
    const from = TOWNS[0]; const to = mission.town;
    const x1 = from.x * width, y1 = from.y * height;
    const x2 = to.x * width, y2 = to.y * height;
    const selected = mission.id === selectedMission?.id;
    ctx.save();
    ctx.strokeStyle = selected ? factionColor(mission.faction) : 'rgba(47,108,106,.38)';
    ctx.lineWidth = selected ? 3 : 1.4;
    ctx.setLineDash(selected ? [10, 5] : [4, 7]);
    ctx.lineDashOffset = -mapPulse * (12 + index * 2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const bend = (index - 1) * 60;
    ctx.bezierCurveTo(lerp(x1,x2,.38), y1 + bend, lerp(x1,x2,.66), y2 - bend, x2, y2);
    ctx.stroke(); ctx.restore();
  });
  for (const town of TOWNS) {
    const x = town.x * width, y = town.y * height;
    const active = town.id === selectedMission?.townId || town.id === 'spire';
    ctx.fillStyle = active ? '#263c37' : '#f8f1df';
    ctx.strokeStyle = factionColor(town.faction); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, active ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#263c37'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(town.name.toUpperCase(), x, y - 14);
    if (town.id === 'spire') {
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 7, y - 30); ctx.lineTo(x + 7, y - 30); ctx.closePath();
      ctx.fillStyle = '#b4543f'; ctx.fill();
    }
  }
  if (selectedMission) {
    const x = selectedMission.town.x * width, y = selectedMission.town.y * height;
    ctx.strokeStyle = factionColor(selectedMission.faction); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 15 + Math.sin(mapPulse * 3) * 3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawLaunchTable() {
  const { ctx, width, height } = resizeCanvas(ui.flightCanvas);
  ctx.clearRect(0, 0, width, height);
  const planeX = Math.max(120, width * .25), planeY = height * .68;
  launchPlane = { x: planeX, y: planeY };
  ctx.fillStyle = '#d7d0bd'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(38,60,55,.13)'; ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 34) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke(); }
  for (let x = 0; x < width; x += 34) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke(); }
  const mission = selectedMission;
  ctx.fillStyle = '#263c37'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'right';
  ctx.fillText(`${mission?.town.name.toUpperCase() || ''} · ${mission?.distance || 0} М`, width - 24, height - 22);
  ctx.strokeStyle = '#2f6c6a'; ctx.setLineDash([6,5]);
  ctx.beginPath(); ctx.moveTo(planeX + 30, planeY); ctx.lineTo(width - 30, planeY - 42); ctx.stroke(); ctx.setLineDash([]);
  let drawX = planeX, drawY = planeY, rotation = -.08;
  if (pointer.draggingLaunch) {
    drawX = pointer.x; drawY = pointer.y;
    const dx = planeX - drawX, dy = planeY - drawY;
    const power = clamp(Math.hypot(dx,dy) / 160, .1, 1);
    rotation = clamp(Math.atan2(dy, Math.max(20, dx)) * -.45, -.45, .28);
    ctx.strokeStyle = '#b4543f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(planeX,planeY); ctx.lineTo(drawX,drawY); ctx.stroke();
    ctx.fillStyle = 'rgba(180,84,63,.15)'; ctx.beginPath(); ctx.arc(planeX,planeY,40 + power * 30,0,Math.PI*2); ctx.fill();
  }
  drawPaperPlane(ctx, drawX, drawY, rotation, 1.05, campaign.plane, 1);
  ctx.fillStyle = '#263c37'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('ТЯНИ ОТСЮДА', planeX, planeY + 58);
}

function drawPaperPlane(ctx, x, y, angle, scale, config, integrity = 1, deformation = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle + config.crease * .08 + deformation * .05); ctx.scale(scale, scale);
  const wing = 24 + config.wing * 34;
  const nose = 46;
  ctx.fillStyle = config.finish === 'wax' ? '#ded0ad' : '#faf5e7';
  ctx.strokeStyle = '#263c37'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nose,0); ctx.lineTo(-24,-wing); ctx.lineTo(-7,-3); ctx.lineTo(-24,wing); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nose,0); ctx.lineTo(-7,-3); ctx.lineTo(-24,wing); ctx.closePath(); ctx.fillStyle='rgba(161,92,56,.17)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(nose,0); ctx.lineTo(-24,-wing); ctx.lineTo(-7,-3); ctx.strokeStyle='rgba(38,60,55,.52)'; ctx.stroke();
  ctx.fillStyle='#a15c38'; ctx.beginPath(); ctx.arc(12 - config.ballast*18,0,3.8,0,Math.PI*2); ctx.fill();
  if (integrity < .72) {
    ctx.strokeStyle='#b4543f'; ctx.lineWidth=1.3;
    const tears = Math.ceil((1-integrity)*5);
    for (let i=0;i<tears;i+=1){ ctx.beginPath(); ctx.moveTo(-10-i*3, (i%2?1:-1)*(8+i*5)); ctx.lineTo(-18-i*2,(i%2?1:-1)*(14+i*6)); ctx.stroke(); }
  }
  ctx.restore();
}

function drawFlight() {
  const { ctx, width, height } = resizeCanvas(ui.flightCanvas);
  ctx.clearRect(0,0,width,height);
  if (!flight) return drawLaunchTable();
  const cameraX = Math.max(0, flight.x - width * .28);
  const sky = ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,'#cfd8cf'); sky.addColorStop(.58,'#e7dfc9'); sky.addColorStop(1,'#c9bea4');
  ctx.fillStyle=sky; ctx.fillRect(0,0,width,height);

  ctx.save();
  ctx.globalAlpha=.28; ctx.strokeStyle='#2f6c6a'; ctx.lineWidth=1;
  for(let band=0;band<7;band+=1){
    ctx.beginPath();
    const baseY=height*(.16+band*.09);
    for(let x=-50;x<width+50;x+=28){
      const wx=cameraX+x;
      const y=baseY+Math.sin(wx*.004+flight.elapsed*(.6+band*.05))*12;
      if(x===-50) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (flight.mission.weather === 'rain') {
    const zoneStart=flight.mission.distance*.42-cameraX, zoneEnd=flight.mission.distance*.73-cameraX;
    ctx.fillStyle='rgba(91,116,126,.17)'; ctx.fillRect(zoneStart,0,zoneEnd-zoneStart,height);
    ctx.strokeStyle='rgba(78,103,116,.35)'; ctx.lineWidth=1;
    for(let i=0;i<70;i+=1){ const x=((i*73+flight.elapsed*150)%Math.max(1,zoneEnd-zoneStart))+zoneStart; const y=(i*47+flight.elapsed*210)%height; ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+18);ctx.stroke(); }
  }

  if (flight.mission.weather === 'thermals') {
    for (const center of [flight.mission.distance*.28, flight.mission.distance*.61]) {
      const x=center-cameraX;
      ctx.strokeStyle='rgba(161,92,56,.36)';
      for(let r=20;r<80;r+=16){ ctx.beginPath();ctx.ellipse(x,height*.65,r,r*.42,0,0,Math.PI*2);ctx.stroke(); }
    }
  }

  drawTerrain(ctx,width,height,cameraX,flight.mission);
  drawRouteMarkers(ctx,width,height,cameraX,flight.mission);

  const screenX=flight.x-cameraX, screenY=flight.y;
  ctx.save();
  ctx.globalAlpha=.18;
  for(let i=0;i<5;i+=1){ ctx.strokeStyle='#263c37';ctx.beginPath();ctx.moveTo(screenX-40-i*14,screenY+i*3);ctx.lineTo(screenX-90-i*18,screenY+i*3+Math.sin(flight.elapsed*5+i)*4);ctx.stroke(); }
  ctx.restore();
  drawPaperPlane(ctx,screenX,screenY,flight.pitch,.78,flight.config,flight.integrity,flight.deformation);

  if (flight.gustFlash>0){ ctx.fillStyle=`rgba(180,84,63,${flight.gustFlash*.2})`;ctx.fillRect(0,0,width,height); }
  const progress=clamp(flight.x/flight.mission.distance,0,1);
  ctx.fillStyle='rgba(38,60,55,.14)';ctx.fillRect(0,height-5,width,5);
  ctx.fillStyle='#2f6c6a';ctx.fillRect(0,height-5,width*progress,5);

  const wind=windAt(flight.x,flight.y,flight.elapsed,flight.mission,height);
  ui.distanceValue.textContent=Math.round(flight.distance);
  ui.distanceTotal.textContent=`/ ${flight.mission.distance} м`;
  ui.integrityValue.textContent=Math.round(flight.integrity*100);
  ui.waterValue.textContent=flight.water>.65?'РАЗМОКЛА':flight.water>.28?'ВЛАЖНАЯ':'СУХАЯ';
  ui.windValue.textContent=`${wind.y < -2 ? '↗' : wind.y > 2 ? '↘' : '→'} ${Math.round(Math.hypot(wind.x,wind.y))}`;
}

function drawTerrain(ctx,width,height,cameraX,mission){
  ctx.beginPath();ctx.moveTo(0,height);
  for(let sx=0;sx<=width+20;sx+=18){ const wx=cameraX+sx;ctx.lineTo(sx,terrainHeight(wx,width,height,mission)); }
  ctx.lineTo(width,height);ctx.closePath();
  const ground=ctx.createLinearGradient(0,height*.55,0,height);ground.addColorStop(0,'#8f8a70');ground.addColorStop(1,'#5d6353');ctx.fillStyle=ground;ctx.fill();
  ctx.strokeStyle='#263c37';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='rgba(248,241,223,.2)';ctx.lineWidth=1;
  for(let i=0;i<4;i+=1){ctx.beginPath();for(let sx=0;sx<=width;sx+=24){const wx=cameraX+sx;const y=terrainHeight(wx,width,height,mission)+12+i*16+Math.sin(wx*.009+i)*5;if(sx===0)ctx.moveTo(sx,y);else ctx.lineTo(sx,y);}ctx.stroke();}
}

function drawRouteMarkers(ctx,width,height,cameraX,mission){
  const points=[.18,.36,.55,.72,.9];
  ctx.font='800 8px system-ui';ctx.textAlign='center';
  points.forEach((p,i)=>{const wx=mission.distance*p,sx=wx-cameraX;if(sx<-40||sx>width+40)return;const gy=terrainHeight(wx,width,height,mission);ctx.strokeStyle='rgba(38,60,55,.5)';ctx.beginPath();ctx.moveTo(sx,gy);ctx.lineTo(sx,gy-28);ctx.stroke();ctx.fillStyle='#f8f1df';ctx.fillRect(sx-9,gy-39,18,12);ctx.fillStyle='#263c37';ctx.fillText(`${i+1}`,sx,gy-30);});
  const targetX=mission.distance-cameraX;
  if(targetX>-80&&targetX<width+100){const gy=terrainHeight(mission.distance,width,height,mission);ctx.fillStyle='#f8f1df';ctx.strokeStyle=factionColor(mission.faction);ctx.lineWidth=3;ctx.fillRect(targetX-18,gy-105,36,105);ctx.strokeRect(targetX-18,gy-105,36,105);ctx.fillStyle=factionColor(mission.faction);ctx.beginPath();ctx.moveTo(targetX,gy-128);ctx.lineTo(targetX-24,gy-100);ctx.lineTo(targetX+24,gy-100);ctx.closePath();ctx.fill();ctx.strokeStyle=factionColor(mission.faction);ctx.setLineDash([4,4]);ctx.strokeRect(targetX-75,height*.28,150,height*.42);ctx.setLineDash([]);}
}

function drawEnding(){
  if(phase!=='ending' && !$('endingScreen').classList.contains('is-active')) return;
  const {ctx,width,height}=resizeCanvas(ui.endingCanvas);ctx.clearRect(0,0,width,height);ctx.fillStyle='#263c37';ctx.fillRect(0,0,width,height);
  const random=mulberry32(campaign.seed+999);ctx.strokeStyle='rgba(233,223,200,.28)';ctx.lineWidth=1;
  for(let i=0;i<24;i+=1){ctx.beginPath();const y=random()*height;ctx.moveTo(-30,y);for(let x=0;x<width+40;x+=34)ctx.lineTo(x,y+Math.sin(x*.015+i)*18);ctx.stroke();}
  for(let i=0;i<Math.max(3,campaign.delivered);i+=1){const x=random()*width,y=random()*height,angle=random()*.4-.2;drawPaperPlane(ctx,x,y,angle,.28+random()*.22,campaign.plane,.8,0);}
}

function handleLaunchPointerDown(event){
  if(phase!=='launch'||flight||paused)return;
  const rect=ui.flightCanvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(Math.hypot(x-launchPlane.x,y-launchPlane.y)>95){showToast('Тяни сам самолётик, не воздух рядом.');return;}
  pointer={...pointer,active:true,id:event.pointerId,startX:x,startY:y,x,y,draggingLaunch:true};
  ui.flightCanvas.setPointerCapture?.(event.pointerId);drawLaunchTable();tone(120,.04,'triangle',.05,1.1);
}

function handleFlightPointerDown(event){
  if(phase!=='launch'||!flight||flight.complete||paused)return;
  const rect=ui.flightCanvas.getBoundingClientRect();
  pointer={...pointer,active:true,id:event.pointerId,startX:event.clientX-rect.left,startY:event.clientY-rect.top,x:event.clientX-rect.left,y:event.clientY-rect.top,draggingLaunch:false};
  ui.flightCanvas.setPointerCapture?.(event.pointerId);
}

function handlePointerMove(event){
  if(!pointer.active||event.pointerId!==pointer.id)return;
  const rect=ui.flightCanvas.getBoundingClientRect();pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;
  if(pointer.draggingLaunch){
    const dx=pointer.x-launchPlane.x,dy=pointer.y-launchPlane.y;const length=Math.hypot(dx,dy);const max=170;if(length>max){pointer.x=launchPlane.x+dx/length*max;pointer.y=launchPlane.y+dy/length*max;}drawLaunchTable();
  } else if(flight){
    const dx=pointer.x-pointer.startX,dy=pointer.y-pointer.startY;flight.inputPitch=clamp(-dy/95,-1,1);flight.inputShift=clamp(dx/120,-1,1);
  }
}

function handlePointerUp(event){
  if(!pointer.active||event.pointerId!==pointer.id)return;
  if(pointer.draggingLaunch){
    const dx=launchPlane.x-pointer.x,dy=launchPlane.y-pointer.y;const dist=Math.hypot(dx,dy);
    if(dist<42){pointer.active=false;pointer.draggingLaunch=false;drawLaunchTable();showToast('Потяни сильнее — бумаге нужен старт.');return;}
    const power=clamp(dist/170,.35,1);const angle=clamp(-dy/Math.max(90,dx)*.42,-.48,.28);
    pointer.active=false;pointer.draggingLaunch=false;startFlight(power,angle);
  } else {
    pointer.active=false;if(flight){flight.inputPitch=0;flight.inputShift=0;}
  }
}

function updateKeyboardInput(){
  if(!flight||flight.complete)return;
  const up=keys.has('ArrowUp')||keys.has('KeyW');const down=keys.has('ArrowDown')||keys.has('KeyS');const left=keys.has('ArrowLeft')||keys.has('KeyA');const right=keys.has('ArrowRight')||keys.has('KeyD');
  if(!pointer.active){flight.inputPitch=(up?1:0)-(down?1:0);flight.inputShift=(right?1:0)-(left?1:0);}
}

function loop(now){
  raf=requestAnimationFrame(loop);
  const frame=Math.min(.05,(now-lastTime)/1000);lastTime=now;mapPulse+=frame;
  if(phase==='map')drawMap();
  if(phase==='launch'){
    if(flight&&!paused&&!flight.complete){updateKeyboardInput();accumulator+=frame;while(accumulator>=1/60){stepFlight(flight,1/60,{width:ui.flightCanvas.clientWidth,height:ui.flightCanvas.clientHeight});accumulator-=1/60;}}
    drawFlight();
    if(flight?.complete&&!reportPending)finishFlight();
  }
}

function bindEvents(){
  ui.soundButton.addEventListener('click',()=>{campaign.sound=!campaign.sound;saveCampaign();renderTopbar();if(campaign.sound)tone(260,.1,'triangle',.1,1.4);});
  ui.prepareButton.addEventListener('click',prepareMission);
  ui.backToMapButton.addEventListener('click',()=>{renderMap();showScreen('mapScreen');});
  [ui.wingInput,ui.ballastInput,ui.creaseInput].forEach(input=>input.addEventListener('input',()=>updatePlaneControls(true)));
  document.querySelectorAll('[data-finish]').forEach(button=>button.addEventListener('click',()=>{campaign.plane.finish=button.dataset.finish;document.querySelectorAll('[data-finish]').forEach(b=>b.classList.toggle('is-active',b===button));updatePlaneControls(true);tone(button.dataset.finish==='wax'?150:280,.1,'triangle',.08,1.3);}));
  ui.toLaunchButton.addEventListener('click',toLaunch);
  ui.nextDayButton.addEventListener('click',nextDay);
  ui.newCampaignButton.addEventListener('click',newCampaign);
  ui.tutorialButton.addEventListener('click',()=>{campaign.tutorialDone=true;saveCampaign();ui.tutorialOverlay.hidden=true;tone(250,.15,'triangle',.1,1.7);});
  ui.pauseButton.addEventListener('click',()=>togglePause());
  ui.resumeButton.addEventListener('click',()=>togglePause(false));
  ui.restartFlightButton.addEventListener('click',restartFlight);
  ui.leaveFlightButton.addEventListener('click',leaveFlight);
  ui.abortButton.addEventListener('click',()=>{if(!flight){renderWorkshop();showScreen('workshopScreen');return;}if(flight.complete)return;togglePause(true);});
  ui.flightCanvas.addEventListener('pointerdown',event=>{event.preventDefault();if(!flight)handleLaunchPointerDown(event);else handleFlightPointerDown(event);});
  ui.flightCanvas.addEventListener('pointermove',event=>{event.preventDefault();handlePointerMove(event);});
  ui.flightCanvas.addEventListener('pointerup',handlePointerUp);
  ui.flightCanvas.addEventListener('pointercancel',handlePointerUp);
  ui.flightCanvas.addEventListener('lostpointercapture',event=>{if(pointer.active&&event.pointerId===pointer.id)handlePointerUp(event);});
  window.addEventListener('keydown',event=>{keys.add(event.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();if(event.code==='Escape')togglePause();});
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('resize',resizeAll);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&flight&&!flight.complete)togglePause(true);lastTime=performance.now();});
}

function init(){
  bindEvents();
  renderTopbar();
  if(campaign.day>MAX_DAYS){renderEnding();showScreen('endingScreen');}
  else {missions=missionsForDay(campaign);renderMap();showScreen('mapScreen');}
  ui.tutorialOverlay.hidden=campaign.tutorialDone;
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}),{once:true});
  raf=requestAnimationFrame(loop);
}

init();
