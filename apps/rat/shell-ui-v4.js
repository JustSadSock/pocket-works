(() => {
  'use strict';

  const UI_VERSION = '1.4.0';
  const TYPE_ICONS = { swords: '⚔', spears: '↟', archers: '➶' };
  const TYPE_NOTES = {
    swords: 'быстрый натиск · опасны для лучников',
    spears: 'держат линию · ломают мечников',
    archers: 'дальний бой · требуют прикрытия'
  };
  const FORMATION_NOTES = {
    line: 'широкий фронт и надёжное удержание',
    wedge: 'узкий удар и быстрый прорыв',
    loose: 'меньше потерь от стрел, слабее контакт'
  };
  const SLOT_NOTES = { left: 'ЛЕВЫЙ ФЛАНГ', center: 'ЦЕНТР', right: 'ПРАВЫЙ ФЛАНГ' };
  const COACH_KEY = 'pocket-works:rat:gesture-coach-seen';

  let setupSelection = 'swords';
  let restartArmed = false;
  let quitArmed = false;

  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = './shell-ui-v4.css';
  cssLink.dataset.ratShellUi = UI_VERSION;
  document.head.appendChild(cssLink);

  function el(tag, className, html = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }

  function setupConfig(type = setupSelection) {
    return persistent.setup.find((item) => item.type === type) || persistent.setup[0];
  }

  function installHome() {
    const home = screens.home;
    if (!home || home.dataset.shellV4) return;
    home.dataset.shellV4 = 'true';

    const copy = home.querySelector('.home-copy');
    const actions = home.querySelector('.home-actions');
    const footer = home.querySelector('.home-footer');
    copy?.classList.add('home-copy-v4');
    actions?.classList.add('home-actions-v4');

    const roster = el('section', 'home-roster-v4');
    roster.id = 'homeRosterV4';
    roster.setAttribute('aria-label', 'Текущий состав армии');
    actions?.before(roster);

    const seal = el('div', 'home-seal-v4', '<i></i><span>ПОЛЕВАЯ ДУЭЛЬ</span>');
    copy?.prepend(seal);

    if (copy) {
      const eyebrow = copy.querySelector('.eyebrow');
      const lead = copy.querySelector('.lead');
      if (eyebrow) eyebrow.textContent = 'ТРИ ПОЛКА · ОДИН ЖЕСТ · ЖИВОЕ СРАЖЕНИЕ';
      if (lead) lead.textContent = 'Поставь полки. Дай несколько решающих приказов. Смотри, как план выдерживает столкновение.';
    }

    const newBattle = document.querySelector('#newBattleButton');
    const quick = document.querySelector('#quickBattleButton');
    const rules = document.querySelector('#rulesButton');
    if (newBattle) newBattle.innerHTML = '<span>СОБРАТЬ АРМИЮ</span><small>расстановка, строй и начало сражения</small>';
    if (quick) quick.innerHTML = '<span>БЫСТРЫЙ БОЙ</span><small>сразу выйти на поле со случайным строем</small>';
    if (rules) rules.innerHTML = '<span>ПОЛЕВОЙ УСТАВ</span><small>управление, войска и контрпики</small>';

    const settings = document.querySelector('#homeSettingsButton');
    if (settings) settings.innerHTML = '<span aria-hidden="true">⚙</span> НАСТРОЙКИ';
    if (footer) footer.innerHTML = '<span>РАТЬ · 1.4</span><span>ПОБЕДА РОЖДАЕТСЯ ДО СТОЛКНОВЕНИЯ</span>';
    renderHomeRoster();
  }

  function renderHomeRoster() {
    const roster = document.querySelector('#homeRosterV4');
    if (!roster) return;
    roster.innerHTML = `
      <header><span>ВАШ БОЕВОЙ ПОРЯДОК</span><small>сохраняется между боями</small></header>
      <div class="home-roster-grid">
        ${persistent.setup.map((config) => {
          const data = TYPE_DATA[config.type];
          return `<article data-type="${config.type}">
            <span class="home-unit-icon">${TYPE_ICONS[config.type]}</span>
            <div><strong>${data.short}</strong><small>${SLOT_NOTES[config.slot]} · ${FORMATION_LABELS[config.formation]}</small></div>
            <b>${data.count}</b>
          </article>`;
        }).join('')}
      </div>`;
  }

  function installSetup() {
    const setup = screens.setup;
    if (!setup || setup.dataset.shellV4) return;
    setup.dataset.shellV4 = 'true';
    document.querySelector('#setupTitle').textContent = 'ШТАБНОЙ СТОЛ';
    const intro = setup.querySelector('.setup-intro p');
    if (intro) intro.textContent = 'Перетащи полки между секторами или настрой выбранный полк в панели штаба.';

    const board = document.querySelector('#formationBoard');
    const dock = document.querySelector('#regimentDock');
    const footer = setup.querySelector('.setup-footer');
    if (!board || !dock || !footer) return;

    const stage = el('div', 'setup-stage-v4');
    const inspector = el('aside', 'setup-inspector-v4');
    inspector.id = 'setupInspectorV4';
    board.before(stage);
    stage.append(board, inspector);

    const rosterWrap = el('section', 'setup-roster-v4');
    dock.before(rosterWrap);
    rosterWrap.append(dock);

    const start = document.querySelector('#startBattleButton');
    if (start) start.innerHTML = '<span>ВЫВЕСТИ ПОЛКИ В ПОЛЕ</span><small>72 бойца · 3 командных такта</small>';

    renderSetupInspector();
  }

  function setSetupFormation(formation) {
    const config = setupConfig();
    if (!config || !FORMATIONS.includes(formation)) return;
    config.formation = formation;
    audio.click();
    vibrate(8);
    saveState();
    renderSetup();
  }

  function setSetupSlot(slot) {
    const config = setupConfig();
    if (!config || !SLOT_NOTES[slot]) return;
    const occupying = persistent.setup.find((item) => item.slot === slot);
    const oldSlot = config.slot;
    config.slot = slot;
    if (occupying && occupying !== config) occupying.slot = oldSlot;
    audio.click();
    vibrate(10);
    saveState();
    renderSetup();
  }

  function renderSetupInspector() {
    const inspector = document.querySelector('#setupInspectorV4');
    if (!inspector) return;
    const config = setupConfig();
    const data = TYPE_DATA[config.type];
    inspector.innerHTML = `
      <div class="inspector-tabs" role="tablist" aria-label="Выбранный полк">
        ${persistent.setup.map((item) => `<button type="button" data-setup-type="${item.type}" aria-selected="${item.type === config.type}">${TYPE_ICONS[item.type]}<small>${TYPE_DATA[item.type].short}</small></button>`).join('')}
      </div>
      <header class="inspector-heading">
        <span class="inspector-emblem">${TYPE_ICONS[config.type]}</span>
        <div><small>${SLOT_NOTES[config.slot]}</small><strong>${data.label}</strong><p>${TYPE_NOTES[config.type]}</p></div>
        <b>${data.count}</b>
      </header>
      <section class="inspector-block">
        <div class="inspector-label"><span>СТРОЙ</span><small>${FORMATION_NOTES[config.formation]}</small></div>
        <div class="formation-choice-v4">
          ${FORMATIONS.map((formation) => `<button type="button" data-formation="${formation}" aria-pressed="${formation === config.formation}"><i class="formation-glyph formation-${formation}"><b></b><b></b><b></b><b></b><b></b></i><span>${FORMATION_LABELS[formation]}</span></button>`).join('')}
        </div>
      </section>
      <section class="inspector-block">
        <div class="inspector-label"><span>ПОЗИЦИЯ</span><small>соседний полк автоматически поменяется местами</small></div>
        <div class="slot-choice-v4">
          ${['left', 'center', 'right'].map((slot) => `<button type="button" data-slot-choice="${slot}" aria-pressed="${slot === config.slot}">${SLOT_NOTES[slot]}</button>`).join('')}
        </div>
      </section>`;

    inspector.querySelectorAll('[data-setup-type]').forEach((button) => button.addEventListener('click', () => {
      setupSelection = button.dataset.setupType;
      audio.click();
      renderSetupInspector();
    }));
    inspector.querySelectorAll('[data-formation]').forEach((button) => button.addEventListener('click', () => setSetupFormation(button.dataset.formation)));
    inspector.querySelectorAll('[data-slot-choice]').forEach((button) => button.addEventListener('click', () => setSetupSlot(button.dataset.slotChoice)));
  }

  function installRules() {
    const dialog = dialogs.rules;
    if (!dialog || dialog.dataset.shellV4) return;
    dialog.dataset.shellV4 = 'true';
    const frame = dialog.querySelector('.dialog-frame');
    const list = dialog.querySelector('.rules-list');
    const primary = dialog.querySelector('.dialog-primary');
    if (!frame || !list || !primary) return;

    frame.classList.add('manual-frame-v4');
    const header = dialog.querySelector('.dialog-header');
    header?.classList.add('dialog-header-v4');
    const kicker = header?.querySelector('span');
    const title = header?.querySelector('h2');
    if (kicker) kicker.textContent = 'ПОЛЕВОЙ УСТАВ · 1.4';
    if (title) title.textContent = 'Понять бой за одну минуту';

    const tabs = el('div', 'manual-tabs-v4', `
      <button type="button" data-manual-tab="basics" aria-pressed="true">ОСНОВЫ</button>
      <button type="button" data-manual-tab="commands" aria-pressed="false">ПРИКАЗЫ</button>
      <button type="button" data-manual-tab="troops" aria-pressed="false">ВОЙСКА</button>`);
    list.before(tabs);
    list.dataset.manualPanel = 'basics';
    list.innerHTML = `
      <li><span>01</span><div><strong>Расставь три полка</strong><p>Фланги, тип войск и строй определяют первые секунды столкновения.</p></div></li>
      <li><span>02</span><div><strong>Не управляй каждым бойцом</strong><p>Люди держат строй, выбирают цели и сражаются самостоятельно.</p></div></li>
      <li><span>03</span><div><strong>Используй редкие приказы</strong><p>В запасе только три такта. Новый появляется примерно раз в шесть секунд.</p></div></li>
      <li><span>04</span><div><strong>Не ломай хороший план</strong><p>Полк копит напор. Резкая смена задачи заставляет его перестраиваться и терять темп.</p></div></li>`;

    const commandPanel = el('section', 'manual-panel-v4', `
      <div class="gesture-manual-grid">
        <article data-kind="hold"><b>•</b><strong>ТАП</strong><span>собраться и удерживать место</span></article>
        <article data-kind="attack"><b>×</b><strong>НА ВРАГА</strong><span>связать выбранный полк боем</span></article>
        <article data-kind="flank"><b>↷</b><strong>ВПЕРЁД И ВБОК</strong><span>обойти фронт и ударить сбоку</span></article>
        <article data-kind="retreat"><b>↓</b><strong>НАЗАД</strong><span>разорвать контакт и закрепиться</span></article>
      </div>
      <p class="manual-footnote">Начинай жест прямо на своих бойцах. Игра покажет распознанное намерение до отпускания пальца.</p>`);
    commandPanel.dataset.manualPanel = 'commands';
    commandPanel.hidden = true;
    list.after(commandPanel);

    const troopPanel = el('section', 'manual-panel-v4 troop-manual-v4', `
      ${['swords', 'spears', 'archers'].map((type) => `<article data-type="${type}"><span>${TYPE_ICONS[type]}</span><div><strong>${TYPE_DATA[type].label}</strong><p>${TYPE_NOTES[type]}</p></div><b>${TYPE_DATA[type].count}</b></article>`).join('')}
      <div class="counter-ring-v4"><span>КОПЬЯ</span><i>›</i><span>МЕЧИ</span><i>›</i><span>ЛУКИ</span><i>›</i><span>КОПЬЯ</span></div>`);
    troopPanel.dataset.manualPanel = 'troops';
    troopPanel.hidden = true;
    commandPanel.after(troopPanel);

    tabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.manualTab;
      tabs.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      frame.querySelectorAll('[data-manual-panel]').forEach((panel) => { panel.hidden = panel.dataset.manualPanel !== tab; });
      audio.click();
    }));
    primary.textContent = 'ЗАКРЫТЬ УСТАВ';
  }

  function installSettings() {
    const dialog = dialogs.settings;
    if (!dialog || dialog.dataset.shellV4) return;
    dialog.dataset.shellV4 = 'true';
    const frame = dialog.querySelector('.dialog-frame');
    if (!frame) return;
    frame.classList.add('settings-frame-v4');
    const header = dialog.querySelector('.dialog-header');
    header?.classList.add('dialog-header-v4');
    const kicker = header?.querySelector('span');
    const title = header?.querySelector('h2');
    if (kicker) kicker.textContent = 'ПОЛЕВОЙ НАБОР · 1.4';
    if (title) title.textContent = 'Настройки сражения';

    dialog.querySelectorAll('.select-row').forEach((row) => {
      const select = row.querySelector('select');
      if (!select) return;
      select.classList.add('native-select-v4');
      const options = [...select.options];
      const segmented = el('div', 'segmented-v4');
      segmented.dataset.selectTarget = select.id;
      segmented.innerHTML = options.map((option) => `<button type="button" data-value="${option.value}" aria-pressed="${select.value === option.value}">${option.textContent}</button>`).join('');
      row.append(segmented);
      segmented.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
        select.value = button.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSettingsSegments();
        audio.click();
      }));
    });

    const utility = el('section', 'settings-utility-v4', `
      <button id="resetCoachButton" type="button"><span>↺</span><div><strong>ПОКАЗАТЬ ОБУЧЕНИЕ СНОВА</strong><small>вернуть подсказку жеста в следующем бою</small></div></button>
      <div class="settings-build-v4"><span>РАТЬ</span><b>BUILD ${UI_VERSION}</b><small>состояние и расстановка сохраняются локально</small></div>`);
    dialog.querySelector('.dialog-primary')?.before(utility);
    utility.querySelector('#resetCoachButton')?.addEventListener('click', () => {
      localStorage.removeItem(COACH_KEY);
      const button = utility.querySelector('#resetCoachButton');
      button.classList.add('is-done');
      button.querySelector('strong').textContent = 'ОБУЧЕНИЕ ВОЗВРАЩЕНО';
      button.querySelector('small').textContent = 'оно появится в следующем сражении';
      audio.click();
      vibrate(12);
    });
    dialog.querySelector('.dialog-primary').textContent = 'ПРИМЕНИТЬ И ЗАКРЫТЬ';
    syncSettingsSegments();
  }

  function syncSettingsSegments() {
    document.querySelectorAll('.segmented-v4').forEach((segmented) => {
      const select = document.querySelector(`#${segmented.dataset.selectTarget}`);
      if (!select) return;
      segmented.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === select.value)));
    });
  }

  function installPause() {
    const dialog = dialogs.pause;
    if (!dialog || dialog.dataset.shellV4) return;
    dialog.dataset.shellV4 = 'true';
    const frame = dialog.querySelector('.dialog-frame');
    if (!frame) return;
    frame.classList.add('pause-frame-v4');
    const header = dialog.querySelector('.dialog-header');
    header?.classList.add('dialog-header-v4');
    const kicker = header?.querySelector('span');
    const title = header?.querySelector('h2');
    if (kicker) kicker.textContent = 'СРАЖЕНИЕ ОСТАНОВЛЕНО';
    if (title) title.textContent = 'Совет воеводы';

    const snapshot = el('section', 'pause-snapshot-v4');
    snapshot.id = 'pauseSnapshotV4';
    header?.after(snapshot);

    const resume = document.querySelector('#resumeButton');
    const settings = document.querySelector('#pauseSettingsButton');
    const restart = document.querySelector('#restartButton');
    const quit = document.querySelector('#quitBattleButton');
    if (resume) resume.textContent = 'ВЕРНУТЬСЯ НА ПОЛЕ';
    if (settings) settings.textContent = 'НАСТРОЙКИ СРАЖЕНИЯ';
    if (restart) restart.textContent = 'ПЕРЕИГРАТЬ СРАЖЕНИЕ';
    if (quit) quit.textContent = 'СДАТЬ ПОЛЕ И ВЫЙТИ';

    restart?.addEventListener('click', (event) => {
      if (restartArmed) { restartArmed = false; return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      restartArmed = true;
      restart.textContent = 'НАЖМИ ЕЩЁ РАЗ — ПЕРЕИГРАТЬ';
      restart.classList.add('is-armed');
      setTimeout(() => {
        restartArmed = false;
        restart.textContent = 'ПЕРЕИГРАТЬ СРАЖЕНИЕ';
        restart.classList.remove('is-armed');
      }, 2200);
    }, true);

    quit?.addEventListener('click', (event) => {
      if (quitArmed) { quitArmed = false; return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      quitArmed = true;
      quit.textContent = 'НАЖМИ ЕЩЁ РАЗ — ПОКИНУТЬ БОЙ';
      quit.classList.add('is-armed');
      setTimeout(() => {
        quitArmed = false;
        quit.textContent = 'СДАТЬ ПОЛЕ И ВЫЙТИ';
        quit.classList.remove('is-armed');
      }, 2200);
    }, true);

    new MutationObserver(() => {
      if (dialog.open) updatePauseSnapshot();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }

  function updatePauseSnapshot() {
    const snapshot = document.querySelector('#pauseSnapshotV4');
    if (!snapshot || !simulation) return;
    const player = simulation.teamStanding(0);
    const enemy = simulation.teamStanding(1);
    const regiment = selectedRegiment;
    const regimentText = regiment ? `${TYPE_DATA[regiment.type].short} · ${regiment.totalStanding()} В СТРОЮ` : 'ПОЛК НЕ ВЫБРАН';
    snapshot.innerHTML = `
      <div><small>ВРЕМЯ</small><strong>${formatTime(simulation.time)}</strong></div>
      <div class="pause-balance"><small>СООТНОШЕНИЕ</small><strong><i>${player}</i><span>:</span><b>${enemy}</b></strong></div>
      <div><small>ТЕКУЩИЙ ПОЛК</small><strong>${regimentText}</strong></div>`;
  }

  function installResult() {
    const result = screens.result;
    if (!result || result.dataset.shellV4) return;
    result.dataset.shellV4 = 'true';
    const banner = result.querySelector('.result-banner');
    const stats = result.querySelector('.result-stats');
    const emblem = el('div', 'result-emblem-v4', '<i></i><span>⚔</span><i></i>');
    banner?.before(emblem);
    const report = el('section', 'result-report-v4');
    report.id = 'resultReportV4';
    stats?.after(report);
    const rematch = document.querySelector('#rematchButton');
    const setup = document.querySelector('#resultSetupButton');
    const menu = document.querySelector('#resultMenuButton');
    if (rematch) rematch.textContent = 'НЕМЕДЛЕННЫЙ РЕВАНШ';
    if (setup) setup.textContent = 'ВЕРНУТЬСЯ К ШТАБНОМУ СТОЛУ';
    if (menu) menu.textContent = 'В ГЛАВНОЕ МЕНЮ';
  }

  function populateResult(sim) {
    if (!sim) return;
    const result = screens.result;
    const report = document.querySelector('#resultReportV4');
    if (!result || !report) return;
    const win = sim.winner === 0;
    result.classList.toggle('is-victory', win);
    result.classList.toggle('is-defeat', !win);
    const standing = sim.teamStanding(0);
    const losses = Math.max(0, sim.teamRegiments(0).reduce((sum, regiment) => sum + regiment.units.length, 0) - standing);
    const casualtyRatio = losses / Math.max(1, losses + standing);
    const appraisal = win
      ? casualtyRatio < .25 ? 'ЧИСТАЯ ПОБЕДА' : casualtyRatio < .5 ? 'ТЯЖЁЛАЯ ПОБЕДА' : 'ПИРРОВА ПОБЕДА'
      : casualtyRatio < .55 ? 'ОРГАНИЗОВАННЫЙ ОТХОД' : 'РАЗГРОМ';
    const text = document.querySelector('#resultText');
    if (text) text.textContent = win
      ? `${appraisal}. Полки удержали связность и оставили за собой поле.`
      : `${appraisal}. Линия потеряла связность раньше, чем противник исчерпал силы.`;

    report.innerHTML = `
      <header><span>ПОСЛЕБОЕВАЯ ВЕДОМОСТЬ</span><b>${appraisal}</b></header>
      <div class="result-regiments-v4">
        ${sim.teamRegiments(0).map((regiment) => {
          const standingCount = regiment.totalStanding();
          const ratio = standingCount / regiment.units.length;
          const state = ratio > .65 ? 'СОХРАНИЛ СТРОЙ' : ratio > .3 ? 'ПОНЁС ПОТЕРИ' : standingCount > 0 ? 'РАЗБИТ' : 'УНИЧТОЖЕН';
          return `<article data-type="${regiment.type}"><span>${TYPE_ICONS[regiment.type]}</span><div><strong>${TYPE_DATA[regiment.type].short}</strong><small>${state}</small><i style="--survival:${ratio}"></i></div><b>${standingCount}/${regiment.units.length}</b></article>`;
        }).join('')}
      </div>
      <footer><span>ПОТЕРИ <b>${losses}</b></span><span>ПРИКАЗЫ <b>${sim.orderCount}</b></span><span>ТЕМП <b>${persistent.settings.speed === 1 ? 'НОРМАЛЬНЫЙ' : persistent.settings.speed < 1 ? 'МЕДЛЕННЫЙ' : 'БЫСТРЫЙ'}</b></span></footer>`;
  }

  function installAll() {
    installHome();
    installSetup();
    installRules();
    installSettings();
    installPause();
    installResult();
    document.body.dataset.ratScreen = currentScreen;
  }

  const baseRenderSetup = renderSetup;
  renderSetup = function renderShellSetup() {
    baseRenderSetup();
    renderSetupInspector();
    renderHomeRoster();
  };

  const baseShowScreen = showScreen;
  showScreen = function showShellScreen(name) {
    baseShowScreen(name);
    document.body.dataset.ratScreen = name;
    if (name === 'home') renderHomeRoster();
    if (name === 'setup') renderSetupInspector();
  };

  const baseEndBattle = endBattle;
  endBattle = function endShellBattle() {
    const sim = simulation;
    baseEndBattle();
    populateResult(sim);
  };

  dialogs.settings?.addEventListener('close', syncSettingsSegments);
  document.querySelector('#homeSettingsButton')?.addEventListener('click', () => setTimeout(syncSettingsSegments, 0));
  document.querySelector('#pauseSettingsButton')?.addEventListener('click', () => setTimeout(syncSettingsSegments, 0));

  installAll();
  globalThis.__RAT_SHELL_UI_V4_READY = true;
})();