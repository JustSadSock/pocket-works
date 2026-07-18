function createEnemySetup() {
  const slots = ['left', 'center', 'right'].sort(() => Math.random() - .5);
  return ['swords', 'spears', 'archers'].map((type, index) => ({
    id: type,
    type,
    slot: slots[index],
    formation: choose(FORMATIONS)
  }));
}

function randomizePlayerSetup() {
  const slots = ['left', 'center', 'right'].sort(() => Math.random() - .5);
  persistent.setup = ['swords', 'spears', 'archers'].map((type, index) => ({
    id: type,
    type,
    slot: slots[index],
    formation: choose(FORMATIONS)
  }));
  saveState();
  renderSetup();
}

function regimentCardMarkup(config) {
  const data = TYPE_DATA[config.type];
  return `<article class="regiment-card" data-regiment-id="${config.id}" data-slot="${config.slot}" role="button" tabindex="0" aria-label="${data.label}, ${FORMATION_LABELS[config.formation]}">
    <div class="type-mark">${data.glyph}</div>
    <strong>${data.label}</strong>
    <small>${data.count} бойцов · ${slotLabel(config.slot)}</small>
    <div class="formation-chip">${FORMATION_LABELS[config.formation]}</div>
  </article>`;
}

function slotLabel(slot) {
  return slot === 'left' ? 'левый фланг' : slot === 'right' ? 'правый фланг' : 'центр';
}

function renderSetup() {
  const dock = $('#regimentDock');
  dock.innerHTML = persistent.setup.map(regimentCardMarkup).join('');
  $$('.deployment-slot').forEach((slot) => {
    const config = persistent.setup.find((item) => item.slot === slot.dataset.slot);
    slot.innerHTML = config ? setupMiniFormation(config) : '';
  });
  const score = persistent.setup.reduce((value, item) => value + (item.slot === 'center' ? 1 : 0), 0);
  $('#setupBalance').textContent = score === 1 ? 'ровный' : score > 1 ? 'плотный центр' : 'широкий';
  bindRegimentCards();
}

function setupMiniFormation(config) {
  const data = TYPE_DATA[config.type];
  const offsets = formationOffsets(15, config.formation, -1);
  const dots = offsets.map((p) => `<i style="left:${50 + p.x * .23}%;top:${52 + p.y * .24}%"></i>`).join('');
  return `<span class="setup-mini" style="--unit-color:${data.color}">${dots}<b>${data.short}</b></span>`;
}

function cycleFormation(id) {
  const item = persistent.setup.find((config) => config.id === id);
  if (!item) return;
  item.formation = FORMATIONS[(FORMATIONS.indexOf(item.formation) + 1) % FORMATIONS.length];
  audio.click();
  saveState();
  renderSetup();
}

function swapToSlot(id, slot) {
  const moving = persistent.setup.find((config) => config.id === id);
  const occupying = persistent.setup.find((config) => config.slot === slot);
  if (!moving || moving.slot === slot) return;
  const oldSlot = moving.slot;
  moving.slot = slot;
  if (occupying) occupying.slot = oldSlot;
  audio.click();
  vibrate(10);
  saveState();
  renderSetup();
}

function bindRegimentCards() {
  $$('.regiment-card').forEach((card) => {
    let start = null;
    card.addEventListener('pointerdown', (event) => {
      audio.unlock();
      start = { x: event.clientX, y: event.clientY, moved: false };
      card.setPointerCapture(event.pointerId);
      dragState = { id: card.dataset.regimentId, card, pointerId: event.pointerId, ghost: null, x: event.clientX, y: event.clientY };
    });
    card.addEventListener('pointermove', (event) => {
      if (!start || !dragState || dragState.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) {
        start.moved = true;
        if (!dragState.ghost) {
          const ghost = card.cloneNode(true);
          ghost.classList.add('regiment-ghost');
          document.body.appendChild(ghost);
          dragState.ghost = ghost;
          card.classList.add('dragging');
        }
        dragState.x = event.clientX;
        dragState.y = event.clientY;
        dragState.ghost.style.left = `${event.clientX}px`;
        dragState.ghost.style.top = `${event.clientY}px`;
        updateDropTargets(event.clientX, event.clientY);
      }
    });
    const finish = (event) => {
      if (!start) return;
      if (dragState?.ghost) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.deployment-slot');
        if (target) swapToSlot(card.dataset.regimentId, target.dataset.slot);
        dragState.ghost.remove();
        card.classList.remove('dragging');
      } else if (!start.moved) cycleFormation(card.dataset.regimentId);
      clearDropTargets();
      start = null;
      dragState = null;
    };
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', finish);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cycleFormation(card.dataset.regimentId); }
    });
  });
}

function updateDropTargets(x, y) {
  $$('.deployment-slot').forEach((slot) => {
    const rect = slot.getBoundingClientRect();
    slot.classList.toggle('is-target', x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  });
}
function clearDropTargets() { $$('.deployment-slot').forEach((slot) => slot.classList.remove('is-target')); }

function startBattle({ quick = false } = {}) {
  if (quick) randomizePlayerSetup();
  const enemySetup = createEnemySetup();
  simulation = new Simulation(structuredClone(persistent.setup), enemySetup, false);
  selectedRegiment = simulation.teamRegiments(0)[1] || simulation.teamRegiments(0)[0];
  commandMode = persistent.lastMode;
  commandCooldown = 0;
  battlePaused = false;
  renderRegimentBar();
  setCommandMode(commandMode, false);
  showScreen('battle');
  battlePaused = false;
  lastFrame = performance.now();
  audio.order();
  vibrate([16, 30, 20]);
}

function restartBattle() {
  closeDialog(dialogs.pause);
  startBattle();
}

function endBattle() {
  if (!simulation || !simulation.finished) return;
  battlePaused = true;
  const win = simulation.winner === 0;
  $('#resultTitle').textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
  $('#resultEyebrow').textContent = win ? 'ВАШ СТРОЙ ВЫДЕРЖАЛ' : 'ЛИНИЯ СЛОМАНА';
  $('#resultText').textContent = win
    ? 'Армия сохранила связность и вытеснила противника с поля.'
    : 'Противник быстрее нашёл слабое место и обратил полки в бегство.';
  $('#resultSurvivors').textContent = simulation.teamStanding(0);
  $('#resultTime').textContent = formatTime(simulation.time);
  $('#resultOrders').textContent = simulation.orderCount;
  $('#resultBanner').style.borderColor = win ? '#caa85d' : '#647f96';
  audio.horn(win);
  vibrate(win ? [25, 40, 25, 40, 60] : [80, 60, 80]);
  showScreen('result');
}

function renderRegimentBar() {
  if (!simulation) return;
  const bar = $('#regimentBar');
  bar.innerHTML = simulation.teamRegiments(0).map((regiment) => {
    const data = TYPE_DATA[regiment.type];
    const active = regiment.activeCount();
    const standing = regiment.totalStanding();
    const ratio = standing / regiment.units.length * 100;
    const status = active === 0 && standing > 0 ? 'БЕЖИТ' : FORMATION_LABELS[regiment.formation];
    return `<button class="regiment-button" type="button" data-regiment-id="${regiment.id}" aria-pressed="${selectedRegiment === regiment}">
      <b>${data.short}</b><small>${standing} · ${status}</small><i style="width:${ratio}%"></i>
    </button>`;
  }).join('');
  $$('.regiment-button', bar).forEach((button) => button.addEventListener('click', () => {
    const regiment = simulation.regiments.find((item) => item.id === button.dataset.regimentId);
    if (!regiment || regiment.activeCount() <= 0) return;
    selectedRegiment = regiment;
    audio.click();
    renderRegimentBar();
    $('#orderHint').hidden = commandMode === 'observe';
  }));
}

function setCommandMode(mode, persist = true) {
  commandMode = mode;
  if (persist) {
    persistent.lastMode = mode;
    saveState();
    audio.click();
  }
  $$('[data-command-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.commandMode === mode)));
  $('#modeTitle').textContent = MODE_COPY[mode][0];
  $('#modeDescription').textContent = MODE_COPY[mode][1];
  $('#orderHint').hidden = mode === 'observe';
  if (mode === 'observe' && simulation) simulation.teamRegiments(0).forEach((regiment) => { regiment.manualObjective = null; });
  if (mode === 'flags') commandCooldown = 0;
  showToast(mode === 'observe' ? 'Армия действует сама' : mode === 'orders' ? 'Один приказ за заряд' : 'Флаги освобождены');
}

function showToast(text) {
  const toast = $('#battleToast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
}

function issueBattleOrder(point) {
  if (!simulation || !selectedRegiment || commandMode === 'observe') return;
  if (selectedRegiment.activeCount() <= 0) return;
  if (commandMode === 'orders' && commandCooldown > 0) {
    showToast('Приказ ещё не готов');
    vibrate(8);
    return;
  }
  simulation.issueOrder(selectedRegiment, point);
  if (commandMode === 'orders') commandCooldown = 7.5;
  audio.order();
  vibrate([12, 20, 12]);
  showToast(`${TYPE_DATA[selectedRegiment.type].short}: новая цель`);
  renderRegimentBar();
}

function updateBattleHud(dt) {
  if (!simulation) return;
  const player = simulation.teamStanding(0);
  const enemy = simulation.teamStanding(1);
  $('#playerAlive').textContent = player;
  $('#enemyAlive').textContent = enemy;
  $('#battleClock').textContent = formatTime(simulation.time);
  const total = Math.max(1, player + enemy);
  $('#moralePlayer').style.width = `${player / total * 100}%`;
  $('#moraleEnemy').style.width = `${enemy / total * 100}%`;
  if (commandMode === 'orders') commandCooldown = Math.max(0, commandCooldown - dt * Number(persistent.settings.speed || 1));
  const charge = commandMode === 'observe' ? 0 : commandMode === 'flags' ? 1 : 1 - commandCooldown / 7.5;
  $('#commandCharge i').style.transform = `scaleX(${clamp(charge, 0, 1)})`;
  $('#commandCharge').style.opacity = commandMode === 'observe' ? .35 : 1;
  renderRegimentBar();
}

