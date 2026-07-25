function commitRound() {
  if (state.phase !== 'planning' || state.shieldCity === null) return;
  hideLesson(); disarmTool(); state.phase = 'resolving'; updateTools(); updateCommit(); updateSourceButtons(); playSound('stamp'); haptic([24, 34, 18]);
  attackAnimation = { startedAt: performance.now(), duration: reducedMotion ? 500 : 2200, revealAt: .42, revealed: false, outcomeApplied: false };
  requestDraw();
  setTimeout(revealReports, reducedMotion ? 160 : 900);
  setTimeout(applyOutcome, reducedMotion ? 360 : 2050);
  setTimeout(advanceAfterOutcome, reducedMotion ? 700 : 3300);
}
function revealReports() {
  if (state.phase !== 'resolving') return;
  const scenario = currentScenario();
  updateSourceButtons(Object.fromEntries(SOURCE_KEYS.map((key) => [key, scenario.claims[key] === scenario.target])));
  flashAtCity(scenario.target); playSound('reveal'); haptic([12, 24, 18]);
}
function applyOutcome() {
  if (state.phase !== 'resolving' || attackAnimation?.outcomeApplied) return;
  attackAnimation.outcomeApplied = true;
  const scenario = currentScenario(); const correctDefense = state.shieldCity === scenario.target;
  SOURCE_KEYS.forEach((key) => state.history[key].push(scenario.claims[key] === scenario.target));
  if (correctDefense) { state.score += 1; playSound('success'); haptic([18, 40, 28]); }
  else { state.lives = Math.max(0, state.lives - 1); if (!state.scorchedCities.includes(scenario.target)) state.scorchedCities.push(scenario.target); playSound('loss'); haptic([35, 45, 35, 45, 55]); }
  state.best = Math.max(state.best, state.score); saveState(); buildHud(); requestDraw();
}
function advanceAfterOutcome() {
  if (state.phase !== 'resolving') return;
  if (state.lives <= 0 || state.round >= TOTAL_ROUNDS - 1) { finishCampaign(); return; }
  state.round += 1; state.phase = 'planning'; state.shieldCity = null; state.verifiedCities = []; state.visibleSources = [...SOURCE_KEYS]; attackAnimation = null; saveState();
  animateMapTurn(); updateAllUi(); requestDraw();
}
function finishCampaign() {
  state.active = false; state.phase = 'ended'; state.best = Math.max(state.best, state.score); saveState(); attackAnimation = null; updateAllUi(); showResult();
}
function showResult() {
  const success = state.lives > 0 && state.round >= TOTAL_ROUNDS - 1;
  dom.resultTitle.innerHTML = success ? 'ГРАНИЦА<br>УСТОЯЛА' : 'КАРТА<br>ПАЛА'; dom.resultEmblem.classList.toggle('failure', !success); dom.resultScore.textContent = '';
  for (let index = 0; index < MAX_LIVES; index += 1) {
    const mark = document.createElement('span'); mark.className = `score-mark${index >= state.lives ? ' lost' : ''}`; mark.setAttribute('aria-hidden', 'true'); dom.resultScore.append(mark);
  }
  dom.resultScreen.hidden = false;
  dom.resultScreen.animate?.([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }], { duration: reducedMotion ? 1 : 500, easing: 'ease-out' });
}
function animateMapTurn() {
  if (!dom.mapPaper.animate || reducedMotion) return;
  dom.mapPaper.animate([{ transform: 'rotate(0deg) scale(1)', filter: 'brightness(1)' }, { transform: 'rotate(-1.8deg) scale(.97)', filter: 'brightness(.78)' }, { transform: 'rotate(.6deg) scale(1.01)', filter: 'brightness(1.08)' }, { transform: 'rotate(0deg) scale(1)', filter: 'brightness(1)' }], { duration: 680, easing: 'cubic-bezier(.6,0,.2,1)' });
}
function showToast(message) { clearTimeout(toastTimer); dom.toast.textContent = message; dom.toast.hidden = false; toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1500); }
function haptic(pattern) { if ('vibrate' in navigator) navigator.vibrate(pattern); }
function ensureAudio() {
  if (!state.soundEnabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext; if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor(); if (audioContext.state === 'suspended') audioContext.resume().catch(() => {}); return audioContext;
}
function tone(frequency, duration, options = {}) {
  const audio = ensureAudio(); if (!audio) return; const now = audio.currentTime; const oscillator = audio.createOscillator(); const gain = audio.createGain();
  oscillator.type = options.type || 'sine'; oscillator.frequency.setValueAtTime(frequency, now);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(options.volume || .035, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration + .02);
}
function noise(duration, volume = .025) {
  const audio = ensureAudio(); if (!audio) return; const length = Math.max(1, Math.floor(audio.sampleRate * duration)); const buffer = audio.createBuffer(1, length, audio.sampleRate); const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource(); const gain = audio.createGain(); const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 850; gain.gain.value = volume;
  source.buffer = buffer; source.connect(filter).connect(gain).connect(audio.destination); source.start();
}
function playSound(type) {
  if (!state.soundEnabled) return;
  switch (type) {
    case 'tick': tone(520, .05, { type: 'triangle', volume: .022 }); break;
    case 'paper': noise(.08, .012); break;
    case 'wax': tone(112, .12, { type: 'sine', to: 82, volume: .045 }); noise(.05, .018); break;
    case 'stamp': tone(86, .18, { type: 'sine', to: 54, volume: .065 }); noise(.11, .025); break;
    case 'truth': tone(310, .18, { type: 'sine', to: 560, volume: .032 }); setTimeout(() => tone(690, .16, { volume: .025 }), 90); break;
    case 'clear': tone(270, .09, { type: 'triangle', to: 190, volume: .02 }); break;
    case 'reveal': tone(180, .28, { type: 'triangle', to: 370, volume: .03 }); break;
    case 'success': tone(220, .22, { type: 'triangle', to: 440, volume: .04 }); setTimeout(() => tone(660, .3, { type: 'sine', volume: .032 }), 130); break;
    case 'loss': tone(150, .45, { type: 'sawtooth', to: 55, volume: .04 }); noise(.32, .02); break;
    case 'error': tone(130, .11, { type: 'square', to: 95, volume: .018 }); break;
    case 'open': tone(140, .42, { type: 'sine', to: 270, volume: .026 }); break;
    default: break;
  }
}
function toggleSound() { state.soundEnabled = !state.soundEnabled; updateSoundButton(); saveState(); if (state.soundEnabled) playSound('tick'); haptic(8); }
function resizeCanvas() {
  const rect = dom.mapPaper.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5); canvasSize = { width: rect.width, height: rect.height, dpr };
  dom.canvas.width = Math.round(rect.width * dpr); dom.canvas.height = Math.round(rect.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); requestDraw();
}
function requestDraw() { if (!animationFrame && !document.hidden) animationFrame = requestAnimationFrame(drawFrame); }
function drawFrame(timestamp) { animationFrame = 0; drawMap(timestamp); if (state.phase === 'planning' || state.phase === 'resolving') requestDraw(); }
function drawMap(timestamp = 0) {
  const { width, height, dpr } = canvasSize; if (width <= 1 || height <= 1) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  drawRegions(width, height); drawRiver(width, height); drawTerrain(width, height); drawRoads(width, height); drawCompass(width, height);
  const scenario = currentScenario(); if (scenario && state.phase !== 'ended') drawReports(scenario, width, height, timestamp);
  drawScorchedCities(width, height, timestamp); drawCities(width, height, timestamp); drawVerifiedCities(width, height, timestamp); drawShield(width, height, timestamp);
  if (state.phase === 'resolving' && attackAnimation && scenario) drawAttack(scenario, width, height, timestamp);
}
function point(value, width, height) { return { x: value.x * width, y: value.y * height }; }
function cityPoint(index, width, height) { const city = CITY_DATA[index]; return { x: city.x * width, y: city.y * height }; }
function drawRegions(width, height) {
  ctx.save(); ctx.lineJoin = 'round';
  REGION_POLYGONS.forEach((polygon, index) => {
    ctx.beginPath(); polygon.forEach(([x, y], pointIndex) => pointIndex === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)); ctx.closePath();
    ctx.fillStyle = index % 2 === 0 ? 'rgba(83, 92, 72, .065)' : 'rgba(121, 84, 47, .045)'; ctx.fill();
    ctx.strokeStyle = 'rgba(57, 52, 42, .28)'; ctx.lineWidth = 1.15; ctx.setLineDash([2, 5]); ctx.stroke();
  }); ctx.restore();
}
function drawRiver(width, height) {
  ctx.save(); ctx.beginPath(); ctx.moveTo(width * .34, -height * .03); ctx.bezierCurveTo(width * .26, height * .19, width * .55, height * .28, width * .43, height * .48); ctx.bezierCurveTo(width * .34, height * .64, width * .53, height * .82, width * .47, height * 1.04);
  ctx.strokeStyle = 'rgba(62, 91, 96, .62)'; ctx.lineWidth = Math.max(2.5, width * .009); ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = 'rgba(235, 226, 183, .32)'; ctx.lineWidth = Math.max(1, width * .0025); ctx.stroke(); ctx.restore();
}
function drawTerrain(width, height) {
  ctx.save(); ctx.strokeStyle = 'rgba(48, 53, 42, .36)'; ctx.fillStyle = 'rgba(48, 53, 42, .28)'; ctx.lineWidth = 1.1;
  for (const mark of TERRAIN_MARKS) {
    const x = mark.x * width; const y = mark.y * height; const size = Math.max(5, width * .025 * mark.s);
    if (mark.type === 'mountain') { ctx.beginPath(); ctx.moveTo(x - size, y + size * .55); ctx.lineTo(x, y - size); ctx.lineTo(x + size, y + size * .55); ctx.moveTo(x - size * .25, y - size * .12); ctx.lineTo(x, y - size); ctx.lineTo(x + size * .28, y - size * .1); ctx.stroke(); }
    else if (mark.type === 'tree') { ctx.beginPath(); ctx.moveTo(x, y + size * .65); ctx.lineTo(x, y - size * .2); ctx.moveTo(x - size * .65, y + size * .15); ctx.lineTo(x, y - size); ctx.lineTo(x + size * .65, y + size * .15); ctx.closePath(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y + size * .2, size, Math.PI, Math.PI * 2); ctx.arc(x + size * 1.2, y + size * .2, size * .7, Math.PI, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}
function drawRoads(width, height) {
  ctx.save(); ctx.strokeStyle = 'rgba(79, 60, 39, .37)'; ctx.lineWidth = Math.max(1.2, width * .004); ctx.setLineDash([5, 7]); ctx.lineCap = 'round';
  for (const [from, to] of ROAD_LINKS) {
    const a = cityPoint(from, width, height); const b = cityPoint(to, width, height); const midX = (a.x + b.x) / 2 + (b.y - a.y) * .04; const midY = (a.y + b.y) / 2 - (b.x - a.x) * .04;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(midX, midY, b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}
function drawCompass(width, height) {
  const x = width * .87; const y = height * .86; const size = Math.min(width, height) * .055;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-.18); ctx.strokeStyle = 'rgba(53, 47, 37, .42)'; ctx.fillStyle = 'rgba(53, 47, 37, .3)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -size * 1.25); ctx.lineTo(size * .24, 0); ctx.lineTo(0, size * 1.25); ctx.lineTo(-size * .24, 0); ctx.closePath(); ctx.fill();
  ctx.font = `700 ${Math.max(7, size * .45)}px Georgia`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -size * 1.48); ctx.restore();
}
