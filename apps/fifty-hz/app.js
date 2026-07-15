import {
  buildEventDeck,
  clamp,
  computeFrequency,
  districtDemand,
  DISTRICT_KEYS,
  frequencyQuality,
  rankShift,
  serviceFactor,
  SHIFT_DURATION,
  summarizeDemand,
} from './game-core.js';
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const VERSION = '1.0.0';
const PROFILE_KEY = 'pocket-works:fifty-hz:profile';
const SETTINGS_KEY = 'pocket-works:fifty-hz:settings';
const RUN_KEY = 'pocket-works:fifty-hz:run';
const FEEDER_LABELS = ['ОТКЛ', 'ЭКО', 'ПОЛН'];

const dom = {
  shell: document.querySelector('.app-shell'), game: document.querySelector('#gameScreen'), start: document.querySelector('#startOverlay'), tutorial: document.querySelector('#tutorialOverlay'), pause: document.querySelector('#pauseOverlay'), result: document.querySelector('#resultOverlay'), settings: document.querySelector('#settingsLayer'),
  pauseButton: document.querySelector('#pauseButton'), startButton: document.querySelector('#startButton'), resumeButton: document.querySelector('#resumeButton'), resumeMeta: document.querySelector('#resumeMeta'), tutorialDone: document.querySelector('#tutorialDoneButton'), continueButton: document.querySelector('#continueButton'), restartButton: document.querySelector('#restartButton'), againButton: document.querySelector('#againButton'), resultMenuButton: document.querySelector('#resultMenuButton'), settingsButton: document.querySelector('#settingsButton'), pauseSettingsButton: document.querySelector('#pauseSettingsButton'), settingsBackdrop: document.querySelector('#settingsBackdrop'), closeSettings: document.querySelector('#closeSettingsButton'),
  soundToggle: document.querySelector('#soundToggle'), hapticToggle: document.querySelector('#hapticToggle'), motionToggle: document.querySelector('#motionToggle'), bestValue: document.querySelector('#bestValue'), clearBest: document.querySelector('#clearBestButton'),
  eventStrip: document.querySelector('#eventStrip'), eventTitle: document.querySelector('#eventTitle'), eventDetail: document.querySelector('#eventDetail'), eventTime: document.querySelector('#eventTime'), needle: document.querySelector('#frequencyNeedle'), frequency: document.querySelector('#frequencyValue'), heatFill: document.querySelector('#heatFill'), heatValue: document.querySelector('#heatValue'), batteryFill: document.querySelector('#batteryFill'), batteryValue: document.querySelector('#batteryValue'), supplyValue: document.querySelector('#supplyValue'), throttleTrack: document.querySelector('#throttleTrack'), throttleKnob: document.querySelector('#throttleKnob'), batteryButton: document.querySelector('#batteryButton'), batteryHint: document.querySelector('#batteryButtonHint'), clock: document.querySelector('#clockValue'), shiftProgress: document.querySelector('#shiftProgress'), score: document.querySelector('#scoreValue'), integrity: document.querySelector('#integrityValue'), integrityFill: document.querySelector('#integrityFill'), trust: document.querySelector('#trustValue'), trustFill: document.querySelector('#trustFill'),
  pauseTime: document.querySelector('#pauseTime'), pauseScore: document.querySelector('#pauseScore'), resultGrade: document.querySelector('#resultGrade'), resultKicker: document.querySelector('#resultKicker'), resultTitle: document.querySelector('#resultTitle'), resultScore: document.querySelector('#resultScore'), resultIntegrity: document.querySelector('#resultIntegrity'), resultTrust: document.querySelector('#resultTrust'), resultNote: document.querySelector('#resultNote'),
};

dom.feeders = Object.fromEntries(DISTRICT_KEYS.map((key) => [key, document.querySelector(`.feeder[data-key="${key}"]`)]));

const settings = loadJSON(SETTINGS_KEY, { sound: true, haptics: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, tutorialSeen: false });
const profile = loadJSON(PROFILE_KEY, { best: 0, shifts: 0, wins: 0 });
let state = createShift();
let mode = 'menu';
let frameId = 0;
let lastFrame = performance.now();
let drag = null;
let saveAccumulator = 0;
let audio = null;
let humGain = null;
let lastAlarmAt = 0;

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? { ...fallback, ...value } : { ...fallback };
  } catch { return { ...fallback }; }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('50 ГЦ: сохранение недоступно', error); }
}

function createShift(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) {
  return {
    seed, elapsed: 0, score: 0, integrity: 100, trust: 100, heat: 34, throttle: 91,
    battery: 100, batteryActive: 0, batteryCooldown: 0, stableTime: 0, overloadTime: 0,
    eventDeck: buildEventDeck(seed), eventIndex: -1, activeEvent: null,
    districts: {
      hospital: { mode: 2, demand: 34 }, metro: { mode: 2, demand: 26 }, homes: { mode: 1, demand: 31 },
    },
  };
}

function validRun(saved) {
  return saved && Number.isFinite(saved.elapsed) && saved.elapsed >= 0 && saved.elapsed < SHIFT_DURATION && saved.districts && DISTRICT_KEYS.every((key) => Number.isInteger(saved.districts[key]?.mode));
}

function hydrateRun(saved) {
  const fresh = createShift(saved.seed >>> 0);
  return {
    ...fresh, ...saved,
    elapsed: clamp(Number(saved.elapsed) || 0, 0, SHIFT_DURATION - .01),
    score: Math.max(0, Number(saved.score) || 0), integrity: clamp(Number(saved.integrity) || 100, 0, 100), trust: clamp(Number(saved.trust) || 100, 0, 100), heat: clamp(Number(saved.heat) || 34, 0, 120), throttle: clamp(Number(saved.throttle) || 91, 42, 128), battery: clamp(Number(saved.battery) || 0, 0, 100), batteryActive: clamp(Number(saved.batteryActive) || 0, 0, 10), batteryCooldown: Math.max(0, Number(saved.batteryCooldown) || 0), stableTime: Math.max(0, Number(saved.stableTime) || 0), overloadTime: Math.max(0, Number(saved.overloadTime) || 0),
    eventDeck: buildEventDeck(saved.seed >>> 0),
    districts: Object.fromEntries(DISTRICT_KEYS.map((key) => [key, { mode: clamp(Math.round(saved.districts[key].mode), 0, 2), demand: Number(saved.districts[key].demand) || fresh.districts[key].demand }]))
  };
}

function saveRun() {
  if (mode !== 'playing' && mode !== 'paused') return;
  saveJSON(RUN_KEY, { ...state, savedAt: Date.now() });
  refreshResume();
}

function clearRun() { localStorage.removeItem(RUN_KEY); refreshResume(); }

function refreshResume() {
  const saved = loadJSON(RUN_KEY, null);
  const available = validRun(saved);
  dom.resumeButton.hidden = !available;
  if (available) dom.resumeMeta.textContent = `${formatClock(saved.elapsed)} · ${Math.floor(saved.score || 0)} очков`;
}

function startShift(showTutorial = true) {
  clearRun();
  state = createShift();
  mode = 'playing';
  dom.start.hidden = true; dom.pause.hidden = true; dom.result.hidden = true; dom.game.hidden = false; dom.pauseButton.hidden = false;
  lastFrame = performance.now(); saveAccumulator = 0; render(true); ensureAudio(); playSound('start');
  if (showTutorial && !settings.tutorialSeen) { mode = 'paused'; dom.tutorial.hidden = false; }
  ensureLoop();
}

function resumeShift() {
  const saved = loadJSON(RUN_KEY, null);
  if (!validRun(saved)) { startShift(); return; }
  state = hydrateRun(saved); mode = 'playing';
  dom.start.hidden = true; dom.pause.hidden = true; dom.result.hidden = true; dom.game.hidden = false; dom.pauseButton.hidden = false;
  lastFrame = performance.now(); render(true); ensureAudio(); playSound('switch'); ensureLoop();
}

function pauseShift(showPanel = true) {
  if (mode !== 'playing') return;
  mode = 'paused'; saveRun(); updateHum(0);
  dom.pauseTime.textContent = formatClock(state.elapsed); dom.pauseScore.textContent = Math.floor(state.score).toString();
  if (showPanel) dom.pause.hidden = false;
}

function continueShift() {
  if (mode !== 'paused') return;
  mode = 'playing'; dom.pause.hidden = true; dom.tutorial.hidden = true; lastFrame = performance.now(); playSound('switch'); ensureLoop();
}

function showMenu() {
  mode = 'menu'; updateHum(0); dom.game.hidden = true; dom.pauseButton.hidden = true; dom.pause.hidden = true; dom.result.hidden = true; dom.tutorial.hidden = true; dom.start.hidden = false; refreshResume();
}

function finishShift(completed) {
  mode = 'result'; clearRun(); updateHum(0);
  const result = rankShift(Math.floor(state.score), completed, state.integrity, state.trust);
  profile.shifts += 1; if (completed) profile.wins += 1;
  const isBest = state.score > profile.best; if (isBest) profile.best = Math.floor(state.score); saveJSON(PROFILE_KEY, profile);
  dom.resultGrade.textContent = result.grade; dom.resultKicker.textContent = completed ? 'СМЕНА ЗАКРЫТА' : 'АВАРИЙНОЕ ОТКЛЮЧЕНИЕ'; dom.resultTitle.textContent = result.title; dom.resultScore.textContent = Math.floor(state.score); dom.resultIntegrity.textContent = Math.floor(state.integrity); dom.resultTrust.textContent = Math.floor(state.trust); dom.resultNote.textContent = isBest ? 'Новый рекорд сохранён.' : completed ? 'Сеть передана следующей смене.' : state.integrity <= 0 ? 'Защита отключила подстанцию.' : 'Город потерял доверие к диспетчеру.';
  dom.result.hidden = false; dom.pauseButton.hidden = true; refreshSettings(); playSound(completed ? 'win' : 'alarm'); vibrate(completed ? [30, 40, 30] : [70, 40, 100]);
}

function updateEvent() {
  const currentIndex = state.eventDeck.findIndex((event) => state.elapsed >= event.startsAt && state.elapsed < event.endsAt);
  if (currentIndex !== state.eventIndex) {
    state.eventIndex = currentIndex; state.activeEvent = currentIndex >= 0 ? state.eventDeck[currentIndex] : null;
    if (state.activeEvent) { playSound(state.activeEvent.tone === 'critical' ? 'alarm' : 'event'); vibrate(state.activeEvent.tone === 'critical' ? [25,35,25] : 18); }
  }
}

function simulate(dt) {
  state.elapsed += dt; updateEvent();
  for (const key of DISTRICT_KEYS) state.districts[key].demand = districtDemand(key, state.elapsed, state.seed, state.activeEvent);
  const requested = summarizeDemand(state.districts);
  const eventMaxDelta = state.activeEvent?.maxSupplyDelta || 0;
  const maxSupply = 128 + eventMaxDelta;
  if (state.throttle > maxSupply) state.throttle = Math.max(maxSupply, state.throttle - 18 * dt);
  const reserveSupply = state.batteryActive > 0 ? 24 : 0;
  if (state.batteryActive > 0) { state.batteryActive = Math.max(0, state.batteryActive - dt); state.battery = Math.max(0, state.battery - 10 * dt); }
  else { state.batteryCooldown = Math.max(0, state.batteryCooldown - dt); if (state.batteryCooldown <= 0) state.battery = Math.min(100, state.battery + 2.3 * dt); }
  const supply = state.throttle + reserveSupply;
  const frequency = computeFrequency(supply, requested);
  const quality = frequencyQuality(frequency);
  const error = Math.abs(frequency - 50);
  const overloaded = state.throttle > 111 || supply < requested - 22;
  const cooling = state.activeEvent?.cooling || 1;
  state.heat = clamp(state.heat + ((state.throttle > 104 ? (state.throttle - 104) * .045 : -1.1 * cooling) + (overloaded ? .7 : 0)) * dt, 24, 112);
  if (quality === 1) state.stableTime += dt; else state.stableTime = Math.max(0, state.stableTime - dt * .4);
  state.overloadTime = overloaded ? state.overloadTime + dt : Math.max(0, state.overloadTime - dt * 2);

  let unmet = 0;
  for (const key of DISTRICT_KEYS) {
    const district = state.districts[key];
    const factor = serviceFactor(district.mode);
    const priority = key === 'hospital' ? 2.3 : key === 'metro' ? 1.35 : .85;
    unmet += district.demand * (1 - factor) * priority;
  }
  state.trust = clamp(state.trust - unmet * .0021 * dt + (unmet < 2 && quality > .7 ? .15 * dt : 0), 0, 100);
  const gridDamage = Math.max(0, error - .45) * 1.15 + Math.max(0, state.heat - 92) * .055 + Math.max(0, state.overloadTime - 5) * .008;
  state.integrity = clamp(state.integrity - gridDamage * dt + (error < .18 && state.heat < 75 ? .035 * dt : 0), 0, 100);
  state.score += (quality * 32 + (unmet < 3 ? 16 : Math.max(0, 10 - unmet * .15)) + (state.stableTime > 8 ? 8 : 0)) * dt;

  if ((error > 1.35 || state.heat > 102) && performance.now() - lastAlarmAt > 2200) { lastAlarmAt = performance.now(); alarmPulse(); playSound('alarm'); vibrate(24); }
  if (state.elapsed >= SHIFT_DURATION) finishShift(true);
  else if (state.integrity <= 0 || state.trust <= 0 || state.heat >= 112) finishShift(false);
}

function frame(now) {
  frameId = 0;
  if (mode !== 'playing') return;
  const dt = Math.min(.08, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  simulate(dt); render(); saveAccumulator += dt; if (saveAccumulator > 3) { saveAccumulator = 0; saveRun(); }
  if (mode === 'playing') frameId = requestAnimationFrame(frame);
}

function ensureLoop() { if (!frameId && mode === 'playing') frameId = requestAnimationFrame(frame); }

function currentMetrics() {
  const requested = summarizeDemand(state.districts);
  const supply = state.throttle + (state.batteryActive > 0 ? 24 : 0);
  return { requested, supply, frequency: computeFrequency(supply, requested) };
}

function render(force = false) {
  const { supply, frequency } = currentMetrics();
  const angle = clamp((frequency - 50) / 3 * 72, -72, 72);
  dom.needle.style.transform = `translateX(-50%) rotate(${angle.toFixed(2)}deg)`; dom.frequency.textContent = frequency.toFixed(2); dom.supplyValue.textContent = Math.round(supply); dom.throttleTrack.setAttribute('aria-valuenow', Math.round(state.throttle));
  const top = 8 + (1 - (state.throttle - 42) / 86) * Math.max(1, dom.throttleTrack.clientHeight - 16); dom.throttleKnob.style.top = `${top}px`;
  dom.heatFill.style.height = `${clamp(state.heat / 112 * 100, 0, 100)}%`; dom.heatFill.style.background = state.heat > 92 ? 'var(--red)' : state.heat > 72 ? 'var(--amber)' : 'var(--lime)'; dom.heatValue.textContent = `${Math.round(state.heat)}°`;
  dom.batteryFill.style.height = `${state.battery}%`; dom.batteryValue.textContent = `${Math.round(state.battery)}%`;
  const batteryReady = state.battery >= 30 && state.batteryCooldown <= 0 && state.batteryActive <= 0; dom.batteryButton.disabled = !batteryReady; dom.batteryButton.classList.toggle('ready', batteryReady); dom.batteryHint.textContent = state.batteryActive > 0 ? `В СЕТИ · ${Math.ceil(state.batteryActive)} сек` : state.batteryCooldown > 0 ? `Заряд через ${Math.ceil(state.batteryCooldown)} сек` : batteryReady ? '+24 МВт · 10 сек' : 'Недостаточно заряда';
  for (const key of DISTRICT_KEYS) { const feeder = dom.feeders[key]; const district = state.districts[key]; feeder.dataset.mode = district.mode; feeder.querySelector('[data-demand]').textContent = Math.round(district.demand); feeder.querySelector('.knife-switch').setAttribute('aria-label', `${feeder.querySelector('header b').textContent}: ${FEEDER_LABELS[district.mode]}`); }
  dom.clock.textContent = formatClock(state.elapsed); dom.shiftProgress.style.width = `${state.elapsed / SHIFT_DURATION * 100}%`; dom.score.textContent = Math.floor(state.score); dom.integrity.textContent = Math.floor(state.integrity); dom.integrityFill.style.width = `${state.integrity}%`; dom.integrityFill.style.background = state.integrity < 35 ? 'var(--red)' : state.integrity < 65 ? 'var(--amber)' : 'var(--lime)'; dom.trust.textContent = Math.floor(state.trust); dom.trustFill.style.width = `${state.trust}%`; dom.trustFill.style.background = state.trust < 35 ? 'var(--red)' : state.trust < 65 ? 'var(--amber)' : 'var(--lime)';
  if (state.activeEvent) { dom.eventStrip.dataset.tone = state.activeEvent.tone; dom.eventTitle.textContent = state.activeEvent.label; dom.eventDetail.textContent = state.activeEvent.detail; dom.eventTime.textContent = `${Math.ceil(state.activeEvent.endsAt - state.elapsed)}с`; }
  else { const next = state.eventDeck.find((event) => event.startsAt > state.elapsed); dom.eventStrip.dataset.tone = 'idle'; dom.eventTitle.textContent = 'Сеть спокойна'; dom.eventDetail.textContent = next ? `Следующее сообщение через ${Math.ceil(next.startsAt - state.elapsed)} сек` : 'Передай смену без аварии'; dom.eventTime.textContent = ''; }
  updateHum(mode === 'playing' && settings.sound ? .018 + Math.abs(frequency - 50) * .006 : 0, frequency);
  if (force) refreshSettings();
}

function formatClock(elapsed) { const minutes = Math.min(180, Math.floor(elapsed)); const hour = 6 + Math.floor(minutes / 60); return `${String(hour).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`; }

function cycleFeeder(key) {
  if (mode !== 'playing') return;
  const district = state.districts[key]; district.mode = district.mode === 2 ? 1 : district.mode === 1 ? 0 : 2;
  playSound('switch'); vibrate(district.mode === 0 ? 22 : 12); render(); saveRun();
}

function activateBattery() {
  if (mode !== 'playing' || dom.batteryButton.disabled) return;
  state.batteryActive = 10; state.batteryCooldown = 30; playSound('battery'); vibrate([18, 25, 18]); render();
}

function throttleFromPointer(clientY) {
  const rect = dom.throttleTrack.getBoundingClientRect(); const ratio = clamp((clientY - rect.top - 8) / Math.max(1, rect.height - 16), 0, 1); const max = 128 + (state.activeEvent?.maxSupplyDelta || 0); state.throttle = clamp(128 - ratio * 86, 42, max); render();
}

function beginThrottle(event) {
  if (mode !== 'playing') return;
  event.preventDefault(); ensureAudio(); drag = { pointerId: event.pointerId }; dom.throttleKnob.classList.add('dragging'); dom.throttleTrack.setPointerCapture?.(event.pointerId); throttleFromPointer(event.clientY); playSound('grab');
}
function moveThrottle(event) { if (!drag || drag.pointerId !== event.pointerId) return; event.preventDefault(); throttleFromPointer(event.clientY); }
function endThrottle(event) { if (!drag || drag.pointerId !== event.pointerId) return; event.preventDefault(); drag = null; dom.throttleKnob.classList.remove('dragging'); try { dom.throttleTrack.releasePointerCapture?.(event.pointerId); } catch {} playSound('release'); vibrate(8); saveRun(); }
function cancelThrottle(event) { if (drag?.pointerId !== event.pointerId) return; drag = null; dom.throttleKnob.classList.remove('dragging'); }

function refreshSettings() {
  dom.soundToggle.querySelector('em').textContent = settings.sound ? 'Вкл' : 'Выкл'; dom.hapticToggle.querySelector('em').textContent = settings.haptics ? 'Вкл' : 'Выкл'; dom.motionToggle.querySelector('em').textContent = settings.motion ? 'Вкл' : 'Выкл'; dom.bestValue.textContent = profile.best || 0; document.documentElement.dataset.motion = settings.motion ? 'full' : 'reduced';
}
function saveSettings() { saveJSON(SETTINGS_KEY, settings); refreshSettings(); }
function openSettings() { dom.settings.hidden = false; refreshSettings(); }
function closeSettings() { dom.settings.hidden = true; }

function ensureAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = audio.createOscillator(); humGain = audio.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = 50; humGain.gain.value = 0; oscillator.connect(humGain).connect(audio.destination); oscillator.start();
  } catch { audio = null; humGain = null; }
}
function updateHum(level) { if (!audio || !humGain) return; const now = audio.currentTime; humGain.gain.cancelScheduledValues(now); humGain.gain.linearRampToValueAtTime(settings.sound ? level : 0, now + .08); }
function playSound(type) {
  if (!settings.sound) return; ensureAudio(); if (!audio) return;
  const now = audio.currentTime; const osc = audio.createOscillator(); const gain = audio.createGain(); const table = { switch:[110,.055,'square'], grab:[75,.025,'square'], release:[92,.04,'triangle'], event:[420,.08,'sine'], battery:[72,.18,'sawtooth'], start:[190,.14,'triangle'], win:[520,.32,'sine'], alarm:[155,.24,'square'] }; const [freq,duration,wave] = table[type] || table.switch; osc.type = wave; osc.frequency.setValueAtTime(freq, now); if (type === 'win') osc.frequency.exponentialRampToValueAtTime(760, now + duration); if (type === 'alarm') osc.frequency.linearRampToValueAtTime(112, now + duration); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'alarm' ? .075 : .035, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + duration); osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + duration + .02);
}
function vibrate(pattern) { if (!settings.haptics || !navigator.vibrate) return; navigator.vibrate(pattern); }
function alarmPulse() { dom.shell.classList.remove('alarm'); void dom.shell.offsetWidth; dom.shell.classList.add('alarm'); setTimeout(() => dom.shell.classList.remove('alarm'), 350); }

dom.startButton.addEventListener('click', () => startShift()); dom.resumeButton.addEventListener('click', resumeShift); dom.pauseButton.addEventListener('click', () => pauseShift(true)); dom.continueButton.addEventListener('click', continueShift); dom.restartButton.addEventListener('click', () => startShift(false)); dom.againButton.addEventListener('click', () => startShift(false)); dom.resultMenuButton.addEventListener('click', showMenu); dom.tutorialDone.addEventListener('click', () => { settings.tutorialSeen = true; saveSettings(); continueShift(); });
dom.settingsButton.addEventListener('click', openSettings); dom.pauseSettingsButton.addEventListener('click', openSettings); dom.settingsBackdrop.addEventListener('click', closeSettings); dom.closeSettings.addEventListener('click', closeSettings); dom.batteryButton.addEventListener('click', activateBattery);
dom.soundToggle.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) playSound('event'); else updateHum(0); }); dom.hapticToggle.addEventListener('click', () => { settings.haptics = !settings.haptics; saveSettings(); vibrate(12); }); dom.motionToggle.addEventListener('click', () => { settings.motion = !settings.motion; saveSettings(); });
dom.clearBest.addEventListener('click', () => { if (dom.clearBest.dataset.confirm === 'true') { profile.best = 0; saveJSON(PROFILE_KEY, profile); dom.clearBest.dataset.confirm = 'false'; dom.clearBest.textContent = 'Сбросить рекорд'; refreshSettings(); } else { dom.clearBest.dataset.confirm = 'true'; dom.clearBest.textContent = 'Нажать ещё раз'; setTimeout(() => { dom.clearBest.dataset.confirm = 'false'; dom.clearBest.textContent = 'Сбросить рекорд'; }, 1800); } });
for (const key of DISTRICT_KEYS) dom.feeders[key].querySelector('.knife-switch').addEventListener('click', () => cycleFeeder(key));
dom.throttleTrack.addEventListener('pointerdown', beginThrottle, { passive: false }); dom.throttleTrack.addEventListener('pointermove', moveThrottle, { passive: false }); dom.throttleTrack.addEventListener('pointerup', endThrottle, { passive: false }); dom.throttleTrack.addEventListener('pointercancel', cancelThrottle, { passive: false }); dom.throttleTrack.addEventListener('lostpointercapture', cancelThrottle);
dom.throttleTrack.addEventListener('keydown', (event) => { if (mode !== 'playing') return; if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { state.throttle = clamp(state.throttle + 3, 42, 128 + (state.activeEvent?.maxSupplyDelta || 0)); event.preventDefault(); render(); } if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { state.throttle = clamp(state.throttle - 3, 42, 128); event.preventDefault(); render(); } });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!dom.settings.hidden) closeSettings(); else if (mode === 'playing') pauseShift(true); else if (mode === 'paused') continueShift(); } if (event.key === ' ' && mode === 'playing') { event.preventDefault(); activateBattery(); } });
window.addEventListener('resize', () => render()); window.addEventListener('orientationchange', () => setTimeout(() => render(), 180)); window.addEventListener('pagehide', saveRun); document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseShift(false); if (document.hidden) saveRun(); });
window.addEventListener('appdatareset', () => { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(RUN_KEY); Object.assign(profile, { best: 0, shifts: 0, wins: 0 }); Object.assign(settings, { sound: true, haptics: true, motion: true, tutorialSeen: false }); showMenu(); refreshSettings(); });

createWorkshopMode({ appName: '50 ГЦ', version: VERSION, cachePrefix: 'fifty-hz-', storageNamespace: 'pocket-works:fifty-hz', onReset() { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(RUN_KEY); window.dispatchEvent(new CustomEvent('appdatareset')); } });
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });
refreshSettings(); refreshResume(); render(true); showMenu();
