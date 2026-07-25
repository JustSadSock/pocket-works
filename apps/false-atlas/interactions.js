function buildCityButtons() {
  dom.cityLayer.textContent = '';
  CITY_DATA.forEach((city, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-button';
    button.dataset.cityIndex = String(index);
    button.style.left = `${city.x * 100}%`;
    button.style.top = `${city.y * 100}%`;
    button.setAttribute('aria-label', city.name);
    button.addEventListener('click', () => {
      if (Date.now() - (activeDrag?.endedAt || 0) < 350) return;
      handleCityTap(index);
    });
    dom.cityLayer.append(button);
  });
}

function buildHud() {
  dom.bannerLives.textContent = '';
  for (let index = 0; index < MAX_LIVES; index += 1) {
    const banner = document.createElement('span');
    banner.className = `banner${index >= state.lives ? ' lost' : ''}`;
    banner.setAttribute('aria-hidden', 'true');
    dom.bannerLives.append(banner);
  }
  dom.nightTrack.textContent = '';
  for (let index = 0; index < TOTAL_ROUNDS; index += 1) {
    const dot = document.createElement('span');
    dot.className = 'night-dot';
    if (index < state.round) dot.classList.add('done');
    if (index === state.round && state.active) dot.classList.add('current');
    dot.setAttribute('aria-hidden', 'true');
    dom.nightTrack.append(dot);
  }
}
function updateAllUi() { buildHud(); updateTools(); updateSourceButtons(); updateCommit(); updateSoundButton(); }
function updateTools() {
  dom.lensCount.textContent = String(state.lenses);
  dom.lensTool.disabled = state.phase !== 'planning' || state.lenses <= 0;
  dom.shieldTool.disabled = state.phase !== 'planning';
  dom.lensTool.classList.toggle('active', armedTool === 'lens');
  dom.shieldTool.classList.toggle('active', armedTool === 'shield');
}
function updateCommit() { dom.commitSeal.disabled = state.phase !== 'planning' || state.shieldCity === null; }
function updateSoundButton() {
  dom.soundButton.setAttribute('aria-pressed', String(state.soundEnabled));
  dom.soundButton.setAttribute('aria-label', state.soundEnabled ? 'Выключить звук' : 'Включить звук');
}
function updateSourceButtons(transientResults = null) {
  for (const button of dom.sourceButtons) {
    const key = button.dataset.source;
    button.setAttribute('aria-pressed', String(state.visibleSources.includes(key)));
    button.disabled = state.phase === 'resolving';
    button.classList.remove('correct', 'wrong');
    const history = state.history[key] || [];
    history.slice(0, TOTAL_ROUNDS).forEach((value, index) => button.style.setProperty(`--trust-${index + 1}`, value ? '#d8c278' : '#6d2821'));
    for (let index = history.length; index < TOTAL_ROUNDS; index += 1) button.style.setProperty(`--trust-${index + 1}`, 'transparent');
    const correct = history.filter(Boolean).length;
    button.classList.toggle('cracked', history.length >= 3 && history.length - correct > correct);
    if (transientResults && key in transientResults) button.classList.add(transientResults[key] ? 'correct' : 'wrong');
  }
}
function toggleSource(key) {
  if (state.phase !== 'planning') return;
  const visible = state.visibleSources.includes(key);
  if (visible && state.visibleSources.length === 1) {
    haptic([14, 28, 14]); playSound('error');
    dom.sourceButtons.find((item) => item.dataset.source === key)?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 240, easing: 'ease-out' });
    return;
  }
  state.visibleSources = visible ? state.visibleSources.filter((item) => item !== key) : [...state.visibleSources, key];
  saveState(); updateSourceButtons(); playSound('paper'); requestDraw();
}
function handleCityTap(index) { if (state.phase !== 'planning') return; if (armedTool) applyTool(armedTool, index); else placeShield(index); }
function applyTool(tool, cityIndex) {
  if (!isCityIndex(cityIndex) || state.phase !== 'planning') return;
  if (tool === 'lens') verifyCity(cityIndex); else if (tool === 'shield') placeShield(cityIndex);
  disarmTool();
}
function verifyCity(cityIndex) {
  if (state.lenses <= 0) { showToast('Линзы закончились'); playSound('error'); haptic([15, 35, 15]); return; }
  if (state.verifiedCities.includes(cityIndex)) { showToast('Уже проверено'); playSound('tick'); haptic(9); return; }
  state.lenses -= 1; state.hasUsedLens = true; state.verifiedCities.push(cityIndex); saveState(); updateTools(); flashAtCity(cityIndex);
  playSound(cityIndex === currentScenario()?.target ? 'truth' : 'clear');
  haptic(cityIndex === currentScenario()?.target ? [18, 35, 30] : 15); requestDraw();
}
function placeShield(cityIndex) {
  hideLesson(); const changed = state.shieldCity !== cityIndex; state.shieldCity = cityIndex; saveState(); updateCommit();
  if (changed) { playSound('wax'); haptic(22); flashAtCity(cityIndex, false); }
  requestDraw();
}
function flashAtCity(cityIndex, bright = true) {
  const city = CITY_DATA[cityIndex];
  dom.truthFlash.style.setProperty('--flash-x', `${city.x * 100}%`); dom.truthFlash.style.setProperty('--flash-y', `${city.y * 100}%`);
  dom.truthFlash.style.opacity = bright ? '1' : '.55'; dom.truthFlash.hidden = false;
  dom.truthFlash.getAnimations().forEach((animation) => animation.cancel()); void dom.truthFlash.offsetWidth; dom.truthFlash.hidden = false;
  setTimeout(() => { dom.truthFlash.hidden = true; dom.truthFlash.style.opacity = ''; }, 700);
}
function armTool(tool) {
  if (state.phase !== 'planning' || (tool === 'lens' && state.lenses <= 0)) return;
  armedTool = armedTool === tool ? null : tool; updateTools(); playSound('tick'); haptic(8);
}
function disarmTool() { armedTool = null; updateTools(); clearCityHover(); }
function setupToolDrag(element, tool) {
  element.addEventListener('pointerdown', (event) => {
    if (element.disabled || state.phase !== 'planning') return;
    event.preventDefault(); hideLesson(); element.setPointerCapture?.(event.pointerId);
    const ghost = document.createElement('div'); ghost.className = `drag-ghost ${tool}`; ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`; document.body.append(ghost);
    activeDrag = { pointerId: event.pointerId, tool, ghost, startX: event.clientX, startY: event.clientY, moved: false, hoverCity: null, endedAt: 0 };
    haptic(7);
  });
  element.addEventListener('pointermove', (event) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault(); activeDrag.ghost.style.left = `${event.clientX}px`; activeDrag.ghost.style.top = `${event.clientY}px`;
    if (Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY) > 9) activeDrag.moved = true;
    const cityIndex = cityAtPoint(event.clientX, event.clientY);
    if (cityIndex !== activeDrag.hoverCity) { activeDrag.hoverCity = cityIndex; showDropHalo(cityIndex); markCityHover(cityIndex); if (cityIndex !== null) haptic(5); }
  });
  const end = (event) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault(); const drag = activeDrag; drag.endedAt = Date.now(); drag.ghost.remove(); activeDrag = null; hideDropHalo(); clearCityHover();
    if (drag.moved && drag.hoverCity !== null) applyTool(drag.tool, drag.hoverCity);
    else if (!drag.moved) armTool(drag.tool);
    else { playSound('paper'); haptic(6); }
  };
  element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end);
  element.addEventListener('lostpointercapture', (event) => { if (activeDrag?.pointerId === event.pointerId) end(event); });
}
function cityAtPoint(clientX, clientY) {
  const mapRect = dom.mapPaper.getBoundingClientRect();
  if (clientX < mapRect.left || clientX > mapRect.right || clientY < mapRect.top || clientY > mapRect.bottom) return null;
  let nearest = null; let nearestDistance = Infinity;
  CITY_DATA.forEach((city, index) => {
    const distance = Math.hypot(clientX - (mapRect.left + city.x * mapRect.width), clientY - (mapRect.top + city.y * mapRect.height));
    if (distance < 41 && distance < nearestDistance) { nearest = index; nearestDistance = distance; }
  });
  return nearest;
}
function showDropHalo(cityIndex) {
  if (cityIndex === null) { hideDropHalo(); return; }
  const city = CITY_DATA[cityIndex]; dom.dropHalo.style.left = `${city.x * 100}%`; dom.dropHalo.style.top = `${city.y * 100}%`; dom.dropHalo.hidden = false;
}
function hideDropHalo() { dom.dropHalo.hidden = true; }
function markCityHover(cityIndex) { clearCityHover(); if (cityIndex !== null) dom.cityLayer.querySelector(`[data-city-index="${cityIndex}"]`)?.classList.add('tool-hover'); }
function clearCityHover() { dom.cityLayer.querySelectorAll('.tool-hover').forEach((element) => element.classList.remove('tool-hover')); }
