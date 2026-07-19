(() => {
  'use strict';

  const UI_VERSION = '1.6.0';
  const SLOT_LABELS = { left: 'ЛЕВО', center: 'ЦЕНТР', right: 'ПРАВО' };
  const TYPE_NOTES = {
    swords: 'быстро входят в контакт',
    spears: 'держат фронт и встречают натиск',
    archers: 'работают из-за спин союзников'
  };
  const FORMATION_NOTES = {
    line: 'широкий устойчивый фронт',
    wedge: 'узкий удар в одну точку',
    loose: 'больше дистанции между бойцами'
  };
  const PRESETS = {
    balanced: {
      label: 'РОВНЫЙ',
      setup: [
        { id: 'swords', type: 'swords', slot: 'center', formation: 'wedge' },
        { id: 'spears', type: 'spears', slot: 'left', formation: 'line' },
        { id: 'archers', type: 'archers', slot: 'right', formation: 'loose' }
      ]
    },
    center: {
      label: 'ЦЕНТР',
      setup: [
        { id: 'swords', type: 'swords', slot: 'center', formation: 'wedge' },
        { id: 'spears', type: 'spears', slot: 'right', formation: 'line' },
        { id: 'archers', type: 'archers', slot: 'left', formation: 'loose' }
      ]
    },
    left: {
      label: 'ЛЕВЫЙ УДАР',
      setup: [
        { id: 'swords', type: 'swords', slot: 'left', formation: 'wedge' },
        { id: 'spears', type: 'spears', slot: 'right', formation: 'line' },
        { id: 'archers', type: 'archers', slot: 'center', formation: 'loose' }
      ]
    },
    defense: {
      label: 'ОБОРОНА',
      setup: [
        { id: 'swords', type: 'swords', slot: 'left', formation: 'line' },
        { id: 'spears', type: 'spears', slot: 'center', formation: 'line' },
        { id: 'archers', type: 'archers', slot: 'right', formation: 'loose' }
      ]
    }
  };

  let activeType = persistent.setup.find((item) => item.type === 'swords')?.type || persistent.setup[0]?.type || 'swords';

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = './setup-redesign-v6.css';
  css.dataset.ratSetupRedesign = UI_VERSION;
  document.head.appendChild(css);

  function create(tag, className, html = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }

  function activeConfig() {
    return persistent.setup.find((item) => item.type === activeType) || persistent.setup[0];
  }

  function soldierMarkup(type, point, index) {
    return `<i class="setup-soldier-v6 soldier-${type}" style="left:${50 + point.x * .235}%;top:${55 + point.y * .225}%;--march-delay:${(index % 5) * -.08}s" aria-hidden="true">
      <b class="soldier-head-v6"></b><b class="soldier-body-v6"></b><b class="soldier-legs-v6"></b><b class="soldier-weapon-v6"></b>
    </i>`;
  }

  setupMiniFormation = function setupSoldierFormation(config) {
    const data = TYPE_DATA[config.type];
    const offsets = formationOffsets(13, config.formation, -1);
    return `<span class="setup-mini-v6${config.type === activeType ? ' is-selected' : ''}" data-type="${config.type}" data-regiment-id="${config.id}" style="--unit-color:${data.color}">
      <span class="setup-soldiers-v6">${offsets.map((point, index) => soldierMarkup(config.type, point, index)).join('')}</span>
      <span class="setup-unit-caption-v6"><strong>${data.short}</strong><small>${FORMATION_LABELS[config.formation]}</small></span>
    </span>`;
  };

  function currentPreset() {
    const normalized = persistent.setup
      .map(({ type, slot, formation }) => `${type}:${slot}:${formation}`)
      .sort()
      .join('|');
    return Object.entries(PRESETS).find(([, preset]) => preset.setup
      .map(({ type, slot, formation }) => `${type}:${slot}:${formation}`)
      .sort()
      .join('|') === normalized)?.[0] || '';
  }

  function setFormation(formation) {
    const config = activeConfig();
    if (!config || !FORMATIONS.includes(formation)) return;
    config.formation = formation;
    saveState();
    audio.click();
    vibrate(8);
    renderSetup();
  }

  function setSlot(slot) {
    const config = activeConfig();
    if (!config || !SLOT_LABELS[slot]) return;
    swapToSlot(config.id, slot);
  }

  function applyPreset(id) {
    const preset = PRESETS[id];
    if (!preset) return;
    persistent.setup = structuredClone(preset.setup);
    if (!persistent.setup.some((item) => item.type === activeType)) activeType = persistent.setup[0].type;
    saveState();
    audio.order();
    vibrate([10, 24, 12]);
    renderSetup();
  }

  function install() {
    const setup = screens.setup;
    if (!setup || setup.dataset.setupV6) return;
    setup.dataset.setupV6 = 'true';

    const oldStage = setup.querySelector('.setup-stage-v4');
    const oldRoster = setup.querySelector('.setup-roster-v4');
    const intro = setup.querySelector('.setup-intro');
    const board = document.querySelector('#formationBoard');
    const footer = setup.querySelector('.setup-footer');
    if (!board || !footer) return;

    intro?.setAttribute('hidden', '');
    oldStage?.setAttribute('hidden', '');
    oldRoster?.setAttribute('hidden', '');
    board.querySelector('.board-status-v5')?.remove();

    const workbench = create('section', 'setup-workbench-v6');
    workbench.id = 'setupWorkbenchV6';
    const field = create('section', 'setup-field-v6', `
      <header class="setup-field-header-v6">
        <div><strong>РАССТАНОВКА</strong><small>нажми на полк, чтобы выбрать его</small></div>
        <span>ВРАГ СВЕРХУ</span>
      </header>`);
    const controls = create('section', 'setup-controls-v6', `
      <div id="setupUnitStripV6" class="setup-unit-strip-v6" role="tablist" aria-label="Полки"></div>
      <div id="setupEditorV6" class="setup-editor-v6"></div>`);

    footer.before(workbench);
    field.append(board);
    workbench.append(field, controls);

    const summary = footer.querySelector('.setup-summary');
    if (summary) summary.hidden = true;
    footer.classList.add('setup-footer-v6');
    const start = document.querySelector('#startBattleButton');
    if (start) start.innerHTML = '<span>НАЧАТЬ СРАЖЕНИЕ</span><small>построение сохранится автоматически</small>';

    board.addEventListener('click', (event) => {
      const slot = event.target.closest('.deployment-slot');
      if (!slot) return;
      const config = persistent.setup.find((item) => item.slot === slot.dataset.slot);
      if (!config) return;
      activeType = config.type;
      audio.click();
      renderSetup();
    });

    renderV6();
    document.body.dataset.ratSetup = 'v6';
  }

  function renderUnitStrip() {
    const host = document.querySelector('#setupUnitStripV6');
    if (!host) return;
    host.innerHTML = persistent.setup.map((config) => {
      const data = TYPE_DATA[config.type];
      return `<button type="button" data-unit-type="${config.type}" role="tab" aria-selected="${config.type === activeType}">
        <span class="unit-strip-soldier-v6 soldier-${config.type}" aria-hidden="true"><i></i><b></b><em></em></span>
        <span><strong>${data.short}</strong><small>${SLOT_LABELS[config.slot]} · ${FORMATION_LABELS[config.formation]}</small></span>
        <b>${data.count}</b>
      </button>`;
    }).join('');
    host.querySelectorAll('[data-unit-type]').forEach((button) => button.addEventListener('click', () => {
      activeType = button.dataset.unitType;
      audio.click();
      renderSetup();
    }));
  }

  function renderEditor() {
    const host = document.querySelector('#setupEditorV6');
    const config = activeConfig();
    if (!host || !config) return;
    const data = TYPE_DATA[config.type];
    const preset = currentPreset();
    host.innerHTML = `
      <header class="setup-editor-head-v6">
        <div><strong>${data.label}</strong><small>${TYPE_NOTES[config.type]}</small></div>
        <span>${data.count} БОЙЦОВ</span>
      </header>
      <div class="setup-editor-row-v6">
        <span class="setup-editor-label-v6">СТРОЙ<small>${FORMATION_NOTES[config.formation]}</small></span>
        <div class="setup-formation-buttons-v6">
          ${FORMATIONS.map((formation) => `<button type="button" data-v6-formation="${formation}" aria-pressed="${formation === config.formation}"><i class="formation-preview-v6 formation-${formation}">${Array.from({ length: 7 }, () => '<b></b>').join('')}</i><span>${FORMATION_LABELS[formation]}</span></button>`).join('')}
        </div>
      </div>
      <div class="setup-editor-row-v6 setup-position-row-v6">
        <span class="setup-editor-label-v6">ПОЗИЦИЯ</span>
        <div class="setup-position-buttons-v6">
          ${['left', 'center', 'right'].map((slot) => `<button type="button" data-v6-slot="${slot}" aria-pressed="${slot === config.slot}">${SLOT_LABELS[slot]}</button>`).join('')}
        </div>
      </div>
      <div class="setup-preset-row-v6">
        <span>ГОТОВЫЕ СХЕМЫ</span>
        <div>${Object.entries(PRESETS).map(([id, item]) => `<button type="button" data-v6-preset="${id}" aria-pressed="${id === preset}">${item.label}</button>`).join('')}</div>
      </div>`;

    host.querySelectorAll('[data-v6-formation]').forEach((button) => button.addEventListener('click', () => setFormation(button.dataset.v6Formation)));
    host.querySelectorAll('[data-v6-slot]').forEach((button) => button.addEventListener('click', () => setSlot(button.dataset.v6Slot)));
    host.querySelectorAll('[data-v6-preset]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.v6Preset)));
  }

  function renderV6() {
    if (!screens.setup?.dataset.setupV6) return;
    renderUnitStrip();
    renderEditor();
    document.querySelectorAll('.deployment-slot').forEach((slot) => {
      const config = persistent.setup.find((item) => item.slot === slot.dataset.slot);
      slot.classList.toggle('is-selected-v6', config?.type === activeType);
      slot.setAttribute('aria-pressed', String(config?.type === activeType));
    });
    const random = document.querySelector('#randomizeButton');
    if (random) random.textContent = '↻ СЛУЧАЙНО';
    const title = document.querySelector('#setupTitle');
    if (title) title.textContent = 'ПОСТРОЕНИЕ';
  }

  const previousRenderSetup = renderSetup;
  renderSetup = function renderSetupV6() {
    previousRenderSetup();
    renderV6();
  };

  const previousShowScreen = showScreen;
  showScreen = function showScreenV6(name) {
    previousShowScreen(name);
    if (name === 'setup') requestAnimationFrame(renderV6);
  };

  install();
  renderSetup();
  const updateScript = document.querySelector('script[data-update-manager]');
  if (updateScript) updateScript.dataset.appVersion = UI_VERSION;
  globalThis.__RAT_SETUP_V6_READY = true;
})();
