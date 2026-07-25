function addBody(shape, x, y, options = {}) {
  const body = createBody(shape, x, y, options);
  state.bodies.push(body);
  return body;
}

function addConstraint(type, bodyA, bodyB = null, options = {}) {
  const ax = bodyA.x, ay = bodyA.y;
  const bx = bodyB ? bodyB.x : options.bx;
  const by = bodyB ? bodyB.y : options.by;
  state.constraints.push({
    id: id('c'), type, bodyA: bodyA.id, bodyB: bodyB?.id || null,
    bx: bodyB ? null : bx, by: bodyB ? null : by,
    rest: options.rest || Math.hypot(bx - ax, by - ay),
    stiffness: options.stiffness ?? (type === 'rope' ? .72 : .22),
    damping: options.damping ?? (type === 'rope' ? .04 : .12),
    tension: 0,
    fatigue: 0,
    breakLimit: options.breakLimit ?? (type === 'rope' ? .5 : .92),
    broken: false
  });
}

function loadScene(scene, record = true) {
  if (record && state.bodies.length) pushHistory();
  state.bodies = []; state.constraints = []; state.fields = []; state.bursts = []; state.selectedId = null;
  state.currentScene = scene;
  const w = state.worldWidth, h = state.worldHeight;
  state.nextId = Math.max(state.nextId, 1);

  if (scene === 'bridge') {
    const y = Math.min(h * .48, h - 150);
    const left = addBody('box', 34, y + 44, { w: 34, h: 120, pinned: true, material: 'steel' });
    const right = addBody('box', w - 34, y + 44, { w: 34, h: 120, pinned: true, material: 'steel' });
    const count = clamp(Math.floor((w - 90) / 42), 6, 12);
    const planks = [];
    for (let i = 0; i < count; i++) {
      const x = 58 + i * (w - 116) / (count - 1);
      planks.push(addBody('box', x, y, { w: 40, h: 14, material: i === Math.floor(count / 2) ? 'ice' : 'wood' }));
    }
    addConstraint('rope', planks[0], null, { bx: left.x, by: y - 55, rest: Math.hypot(planks[0].x-left.x,55), breakLimit: .46 });
    for (let i = 0; i < planks.length - 1; i++) addConstraint('rope', planks[i], planks[i + 1], { rest: 42, breakLimit: .42 });
    addConstraint('rope', planks.at(-1), null, { bx: right.x, by: y - 55, rest: Math.hypot(planks.at(-1).x-right.x,55), breakLimit: .46 });
    for (let i = 0; i < Math.min(5, count - 2); i++) addBody('circle', w * .34 + i * 24, y - 85 - (i % 2) * 24, { r: 18, material: i % 2 ? 'steel' : 'rubber' });
  } else if (scene === 'orbit') {
    const cx = w / 2, cy = h * .46;
    state.fields.push({ id: id('f'), x: cx, y: cy, radius: Math.min(w,h) * .42, strength: 1550, polarity: 1 });
    const count = clamp(Math.floor(w / 28), 10, 22);
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU;
      const radius = 82 + (i % 3) * 32;
      const speed = Math.sqrt(1550 * radius * .48);
      addBody('circle', cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, {
        r: 10 + (i % 3) * 3,
        vx: -Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        material: ['foam','rubber','ice'][i % 3],
        customGravity: 0,
        damageGrace: 1
      });
    }
  } else if (scene === 'cradle') {
    const count = clamp(Math.floor((w - 60) / 35), 5, 9);
    const spacing = 35;
    const startX = w / 2 - (count - 1) * spacing / 2;
    const anchorY = 34;
    const ballY = Math.min(h * .5, 250);
    for (let i = 0; i < count; i++) {
      const x = startX + i * spacing;
      const displaced = i === 0;
      const ball = addBody('circle', displaced ? x - 70 : x, displaced ? ballY - 35 : ballY, { r: 17, material: 'steel', damageGrace: 1 });
      addConstraint('rope', ball, null, { bx: x, by: anchorY, rest: ballY - anchorY, breakLimit: .72 });
    }
    addBody('box', w / 2, anchorY, { w: Math.min(w - 28, count * spacing + 60), h: 12, pinned: true, material: 'wood' });
  } else if (scene === 'wrecking') {
    const foundationY = h - 14;
    const towerX = w * .73;
    addBody('box', towerX, foundationY, { w: Math.min(150, w * .36), h: 20, pinned: true, material: 'steel' });
    const levels = clamp(Math.floor((h - 130) / 47), 3, 6);
    for (let level = 0; level < levels; level++) {
      const y = foundationY - 35 - level * 46;
      const fragile = level === Math.floor(levels / 2);
      addBody('box', towerX - 43, y, { w: 20, h: 54, material: fragile ? 'ice' : 'wood' });
      addBody('box', towerX + 43, y, { w: 20, h: 54, material: fragile ? 'ice' : 'wood' });
      addBody('box', towerX, y - 29, { w: 108, h: 13, material: level % 2 ? 'wood' : 'steel' });
    }
    const anchorX = w * .3;
    const anchorY = 26;
    const ropeLength = Math.min(h * .52, w * .58);
    const startAngle = -1.02;
    const ballX = clamp(anchorX + Math.sin(startAngle) * ropeLength, 24, w - 24);
    const ballY = anchorY + Math.cos(startAngle) * ropeLength;
    const ball = addBody('circle', ballX, ballY, { r: clamp(w * .07, 23, 34), material: 'steel', damageGrace: 1 });
    addConstraint('rope', ball, null, { bx: anchorX, by: anchorY, rest: ropeLength, breakLimit: .78 });
    addBody('box', anchorX, anchorY, { w: 74, h: 13, pinned: true, material: 'steel' });
  } else if (scene === 'domino') {
    const count = clamp(Math.floor((w - 70) / 22), 10, 18);
    const startX = 58;
    const endX = w - 34;
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const x = startX + (endX - startX) * t;
      const rise = Math.sin(t * Math.PI) * Math.min(34, h * .07);
      addBody('box', x, h - 30 - rise, { w: 11, h: 54, angle: (t - .5) * .055, material: i % 5 === 3 ? 'ice' : 'wood', damageGrace: .5 });
    }
    addBody('circle', 24, h - 72, { r: 20, vx: 330, material: 'rubber', damageGrace: .8 });
    addBody('box', w - 22, h - 58, { w: 22, h: 92, material: 'foam' });
  }

  state.history = record ? state.history : [];
  updateInspector(); updateStats(); scheduleSave();
}

function openSheet(kicker, title, html, bind) {
  sheetKicker.textContent = kicker;
  sheetTitle.textContent = title;
  sheetBody.innerHTML = html;
  backdrop.hidden = false;
  sheet.hidden = false;
  bind?.();
}

function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
}

function openMaterials() {
  const html = `<div class="material-list">${MATERIAL_KEYS.map(key => {
    const material = MATERIALS[key];
    return `<button class="material-option" type="button" data-material="${key}" aria-pressed="${state.material === key}"><i style="background:${material.color}"></i><span><b>${material.name}</b><small>${materialDescription(key)}</small></span></button>`;
  }).join('')}</div>`;
  openSheet('СВОЙСТВА ТЕЛА', 'МАТЕРИАЛ', html, () => {
    sheetBody.querySelectorAll('[data-material]').forEach(button => button.addEventListener('click', () => {
      state.material = button.dataset.material;
      const selected = bodyById(state.selectedId);
      if (selected) {
        pushHistory();
        selected.material = state.material;
        selected.damage = Math.min(selected.damage || 0, .45);
        refreshBodyPhysics(selected);
      }
      updateMaterialUI(); scheduleSave(); closeSheet(); sound('tap');
    }));
  });
}

function materialDescription(key) {
  return {
    wood: 'средний вес и прочность; трескается постепенно',
    steel: 'очень тяжёлая и почти неубиваемая',
    rubber: 'упругая, цепкая и хорошо переживает удары',
    ice: 'скользкий и хрупкий — красиво разлетается',
    foam: 'очень лёгкая и ломается от серьёзного чиха'
  }[key];
}

function openMenu() {
  const restartable = ['bridge','orbit','cradle','wrecking','domino','empty'].includes(state.currentScene);
  const html = `<div class="menu-list">
    <button class="menu-row" type="button" data-action="scenes"><svg viewBox="0 0 24 24"><path d="M4 19V8l8-4 8 4v11M8 19v-6h8v6"/></svg><span><b>СЦЕНЫ</b><small>шесть готовых стендов для строительства и аварий</small></span></button>
    <button class="menu-row" type="button" data-action="restart" ${restartable ? '' : 'disabled'}><svg viewBox="0 0 24 24"><path d="M5 8V3m0 0h5M5 3l4 4M4 13a8 8 0 1 0 3-6"/></svg><span><b>ПЕРЕЗАПУСТИТЬ СТЕНД</b><small>${restartable ? 'вернуть исходное состояние текущей сцены' : 'для импортированного мира нет исходной сцены'}</small></span></button>
    <div class="range-row"><label for="gravityRange">ГРАВИТАЦИЯ</label><output id="gravityOutput">${(state.gravity / 980).toFixed(2)}g</output><input id="gravityRange" type="range" min="-980" max="1960" value="${state.gravity}" step="49"></div>
    <div class="range-row"><label for="speedRange">СКОРОСТЬ ВРЕМЕНИ</label><output id="speedOutput">×${state.speed}</output><input id="speedRange" type="range" min="0" max="3" value="${[.25,.5,1,2].indexOf(state.speed)}" step="1"></div>
    <div class="range-row"><label for="sizeRange">РАЗМЕР НОВЫХ ТЕЛ</label><output id="sizeOutput">${Math.round(state.spawnSize * 100)}%</output><input id="sizeRange" type="range" min="55" max="180" value="${Math.round(state.spawnSize * 100)}" step="5"></div>
    ${menuToggle('destruction','РАЗРУШЕНИЯ','трещины, дробление тел и разрыв связей',state.destruction,'M4 15 8 5l4 7 3-9 5 12M3 20h18')}
    ${menuToggle('sound','ЗВУК','удары, треск и разрыв связей',state.sound,'M5 10v4h4l5 4V6l-5 4H5ZM17 9c1.4 1.8 1.4 4.2 0 6')}
    ${menuToggle('haptics','ТАКТИЛЬНЫЙ ОТКЛИК','короткие импульсы на действия',state.haptics,'M8 5 5 8l3 3M16 5l3 3-3 3M8 19l-3-3 3-3M16 19l3-3-3-3M11 8h2v8h-2z')}
    <button class="menu-row" type="button" data-action="export"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 15v5h14v-5"/></svg><span><b>ЭКСПОРТ МИРА</b><small>сохранить текущую конструкцию в JSON</small></span></button>
    <button class="menu-row" type="button" data-action="import"><svg viewBox="0 0 24 24"><path d="M12 21V9M7 16l5 5 5-5M5 9V4h14v5"/></svg><span><b>ИМПОРТ МИРА</b><small>загрузить ранее сохранённую конструкцию</small></span></button>
    <button class="menu-row menu" type="button" data-workshop-trigger><svg viewBox="0 0 24 24"><path d="M14 6a4 4 0 0 0-5 5L4 16l4 4 5-5a4 4 0 0 0 5-5l-3 3-4-4 3-3Z"/></svg><span><b>WORKSHOP MODE</b><small>служебные инструменты Pocket Works</small></span></button>
  </div>`;
  openSheet('ФИЗИЧЕСКИЙ СТОЛ', 'ПАРАМЕТРЫ', html, () => {
    sheetBody.querySelector('[data-action="scenes"]').addEventListener('click', openScenes);
    const restartButton = sheetBody.querySelector('[data-action="restart"]');
    if (restartable) restartButton.addEventListener('click', () => { const scene = state.currentScene; loadScene(scene, true); closeSheet(); showToast('СТЕНД ПЕРЕЗАПУЩЕН'); sound('spawn'); });
    sheetBody.querySelector('[data-action="export"]').addEventListener('click', exportWorld);
    sheetBody.querySelector('[data-action="import"]').addEventListener('click', () => { closeSheet(); importInput.click(); });
    const gravityRange = sheetBody.querySelector('#gravityRange');
    const gravityOutput = sheetBody.querySelector('#gravityOutput');
    gravityRange.addEventListener('input', () => { state.gravity = Number(gravityRange.value); gravityOutput.value = `${(state.gravity / 980).toFixed(2)}g`; scheduleSave(); });
    const speedRange = sheetBody.querySelector('#speedRange');
    const speedOutput = sheetBody.querySelector('#speedOutput');
    speedRange.addEventListener('input', () => { state.speed = [.25,.5,1,2][Number(speedRange.value)]; speedOutput.value = `×${state.speed}`; scheduleSave(); });
    const sizeRange = sheetBody.querySelector('#sizeRange');
    const sizeOutput = sheetBody.querySelector('#sizeOutput');
    sizeRange.addEventListener('input', () => { state.spawnSize = Number(sizeRange.value) / 100; sizeOutput.value = `${sizeRange.value}%`; scheduleSave(); });
    sheetBody.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.toggle;
      state[key] = !state[key];
      button.querySelector('.switch').classList.toggle('on', state[key]);
      button.setAttribute('aria-pressed', String(state[key]));
      scheduleSave();
      if (key === 'sound' && state.sound) sound('tap');
      if (key === 'destruction') showToast(state.destruction ? 'РАЗРУШЕНИЯ ВКЛЮЧЕНЫ' : 'КОНСТРУКЦИИ ТЕПЕРЬ БЕССМЕРТНЫ');
    }));
  });
}

function menuToggle(key, title, description, enabled, path) {
  return `<button class="menu-row" type="button" data-toggle="${key}" aria-pressed="${enabled}"><svg viewBox="0 0 24 24"><path d="${path}"/></svg><span><b>${title}</b><small>${description}</small></span><i class="switch ${enabled ? 'on' : ''}"><i></i></i></button>`;
}

function openScenes() {
  const scenes = [
    ['bridge','01','ХРУПКИЙ МОСТ','нагрузи конструкцию и найди слабое место'],
    ['orbit','02','ОРБИТА','рой тел вокруг переносимого силового поля'],
    ['cradle','03','МАЯТНИКИ','передача импульса по цепочке'],
    ['wrecking','04','ШАР-РАЗРУШИТЕЛЬ','снеси башню одним правильным замахом'],
    ['domino','05','ДОМИНО','запусти длинную цепную аварию'],
    ['empty','06','ЧИСТЫЙ СТОЛ','никаких оправданий, только физика']
  ];
  const html = `<div class="scene-list">${scenes.map(([key,no,name,desc]) => `<button class="scene-option" type="button" data-scene-load="${key}"><b>${no}</b><span><b>${name}</b><small>${desc}</small></span></button>`).join('')}</div>`;
  openSheet('ГОТОВЫЕ СТЕНДЫ', 'СЦЕНЫ', html, () => {
    sheetBody.querySelectorAll('[data-scene-load]').forEach(button => button.addEventListener('click', () => {
      loadScene(button.dataset.sceneLoad, true);
      closeSheet();
      showToast('СЦЕНА ЗАГРУЖЕНА');
      sound('spawn');
    }));
  });
}

function exportWorld() {
  const payload = JSON.stringify({ app: 'impuls', version: 2, savedAt: new Date().toISOString(), world: snapshotWorld() }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `impuls-world-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeSheet(); showToast('МИР СОХРАНЁН');
}

async function importWorld(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const world = payload?.world || payload;
    if (!world || !Array.isArray(world.bodies) || world.bodies.length > MAX_BODIES * 2) throw new Error('invalid');
    pushHistory();
    restoreWorld(world, true);
    state.currentScene = 'custom';
    showToast('МИР ЗАГРУЖЕН');
    sound('link');
  } catch (error) {
    showToast('ФАЙЛ НЕ ПОХОЖ НА МИР ИМПУЛЬСА', 2300);
  } finally { importInput.value = ''; }
}

function showIntro() {
  intro.hidden = false;
  [...intro.querySelectorAll('[data-scene]')].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === state.introScene)));
}

function hideIntro() {
  intro.hidden = true;
  localStorage.setItem(INTRO_KEY, 'seen');
}

function confirmClear() {
  openSheet('НЕОБРАТИМОЕ ДЕЙСТВИЕ', 'ОЧИСТИТЬ СТОЛ?', `<p style="margin:0 0 12px;line-height:1.45">Все тела, связи и поля исчезнут. Отменить очистку потом можно кнопкой «Назад».</p><div class="action-row"><button type="button" data-cancel>ОСТАВИТЬ</button><button type="button" data-confirm style="background:#c85a34;color:white">ОЧИСТИТЬ</button></div>`, () => {
    sheetBody.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    sheetBody.querySelector('[data-confirm]').addEventListener('click', () => { loadScene('empty', true); closeSheet(); showToast('СТОЛ ОЧИЩЕН'); pulseHaptic([14,20,14]); });
  });
}

function undo() {
  const snapshot = state.history.pop();
  if (!snapshot) return;
  restoreWorld(snapshot, true);
  updateControls();
  showToast('ДЕЙСТВИЕ ОТМЕНЕНО');
  sound('tap');
}

function cycleSelectedMaterial() {
  const body = bodyById(state.selectedId);
  if (!body) return openMaterials();
  pushHistory();
  const index = MATERIAL_KEYS.indexOf(body.material);
  body.material = MATERIAL_KEYS[(index + 1) % MATERIAL_KEYS.length];
  body.damage = Math.min(body.damage || 0, .45);
  refreshBodyPhysics(body);
  updateMaterialUI(); scheduleSave(); sound('tap');
}

function togglePin() {
  const body = bodyById(state.selectedId);
  if (!body) return;
  pushHistory();
  body.pinned = !body.pinned;
  body.vx = 0; body.vy = 0; body.av = 0;
  refreshBodyPhysics(body);
  updateInspector(); scheduleSave();
  showToast(body.pinned ? 'ТЕЛО ЗАКРЕПЛЕНО' : 'ТЕЛО ОСВОБОЖДЕНО');
}

function duplicateSelected() {
  const body = bodyById(state.selectedId);
  if (!body || state.bodies.length >= MAX_BODIES) return;
  pushHistory();
  const copy = createBody(body.shape, clamp(body.x + 24, 20, state.worldWidth - 20), clamp(body.y - 24, 20, state.worldHeight - 20), {
    r: body.r, w: body.w, h: body.h, angle: body.angle + .08, material: body.material, pinned: false, vx: 80, vy: -80, damageGrace: .2
  });
  state.bodies.push(copy); state.selectedId = copy.id; updateInspector(); updateStats(); scheduleSave(); sound('spawn');
}

function deleteSelected() {
  const body = bodyById(state.selectedId);
  if (!body) return;
  pushHistory();
  state.bodies = state.bodies.filter(item => item.id !== body.id);
  state.constraints = state.constraints.filter(link => link.bodyA !== body.id && link.bodyB !== body.id);
  state.selectedId = null; updateInspector(); updateStats(); scheduleSave(); sound('tap');
}

function bindEvents() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  toolStrip.addEventListener('click', event => {
    const button = event.target.closest('[data-tool]');
    if (!button) return;
    setTool(button.dataset.tool, button.dataset.tool === state.tool);
    sound('tap');
  });
  pauseButton.addEventListener('click', () => { state.paused = !state.paused; updateControls(); sound('tap'); scheduleSave(); });
  menuButton.addEventListener('click', openMenu);
  materialButton.addEventListener('click', openMaterials);
  undoButton.addEventListener('click', undo);
  stressButton.addEventListener('click', () => { state.stress = !state.stress; updateControls(); scheduleSave(); sound('tap'); });
  clearButton.addEventListener('click', confirmClear);
  materialChip.addEventListener('click', cycleSelectedMaterial);
  pinButton.addEventListener('click', togglePin);
  duplicateButton.addEventListener('click', duplicateSelected);
  deleteButton.addEventListener('click', deleteSelected);
  cancelLink.addEventListener('click', cancelPointer);
  closeSheetButton.addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  importInput.addEventListener('change', () => importInput.files[0] && importWorld(importInput.files[0]));
  intro.querySelectorAll('[data-scene]').forEach(button => button.addEventListener('click', () => {
    state.introScene = button.dataset.scene;
    intro.querySelectorAll('[data-scene]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    sound('tap');
  }));
  introStart.addEventListener('click', () => { loadScene(state.introScene, false); hideIntro(); sound('spawn'); pulseHaptic([10,18,10]); });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.paused) { state.pausedByVisibility = true; state.paused = true; }
    else if (!document.hidden && state.pausedByVisibility) { state.pausedByVisibility = false; state.paused = false; state.lastTime = performance.now(); }
    updateControls();
  });
  window.addEventListener('keydown', event => {
    if (event.key === ' ') { event.preventDefault(); state.paused = !state.paused; updateControls(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') undo();
    if (event.key === 'Escape') { closeSheet(); cancelPointer(); }
  });
  window.addEventListener('error', event => { console.error(event.error || event.message); showToast('ФИЗИКА СПОТКНУЛАСЬ — МИР СОХРАНЁН', 2600); });
}

function init() {
  resizeCanvas();
  bindEvents();
  const loaded = loadSavedWorld();
  if (!loaded) {
    loadScene('bridge', false);
    if (!localStorage.getItem(INTRO_KEY)) showIntro();
  }
  state.initialised = true;
  updateStats(); updateControls(); updateInspector(); setTool('hand');
  requestAnimationFrame(frame);
}

init();
