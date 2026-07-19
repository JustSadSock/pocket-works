(() => {
  'use strict';

  const UI_VERSION = '1.5.0';
  const TYPE_ICONS = { swords: '⚔', spears: '↟', archers: '➶' };
  const SLOT_SHORT = { left: 'ЛЕВО', center: 'ЦЕНТР', right: 'ПРАВО' };
  let resultSnapshot = '';

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = './screen-redesign-v5.css';
  css.dataset.ratScreenRedesign = UI_VERSION;
  document.head.appendChild(css);

  function make(tag, className, html = '') {
    const node = document.createElement(tag);
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
  }

  function armyTotal() {
    return persistent.setup.reduce((sum, config) => sum + (TYPE_DATA[config.type]?.count || 0), 0);
  }

  function redesignHome() {
    const home = screens.home;
    if (!home || home.dataset.screenV5) return;
    home.dataset.screenV5 = 'true';

    const copy = home.querySelector('.home-copy');
    const roster = home.querySelector('#homeRosterV4');
    const actions = home.querySelector('.home-actions');
    const footer = home.querySelector('.home-footer');
    if (!copy || !roster || !actions) return;

    home.querySelector('.home-seal-v4')?.remove();
    const eyebrow = copy.querySelector('.eyebrow');
    const lead = copy.querySelector('.lead');
    if (eyebrow) eyebrow.textContent = 'ТАКТИЧЕСКАЯ ДУЭЛЬ';
    if (lead) lead.textContent = 'Три полка. Три приказа. Один короткий бой.';

    const crest = make('div', 'home-crest-v5', '<i></i><span>РАТЬ</span><i></i>');
    copy.prepend(crest);

    const dock = make('section', 'home-dock-v5');
    const order = make('div', 'home-order-v5');
    order.innerHTML = `
      <header><span>БОЕВОЙ ПОРЯДОК</span><small>${armyTotal()} бойца · сохраняется</small></header>
      <div id="homeOrderUnitsV5" class="home-order-units-v5"></div>`;
    const primary = document.querySelector('#newBattleButton');
    const quick = document.querySelector('#quickBattleButton');
    const rules = document.querySelector('#rulesButton');
    if (primary) primary.innerHTML = '<span>К ШТАБНОМУ СТОЛУ</span><small>расставить полки и выбрать строй</small>';
    if (quick) quick.innerHTML = '<b aria-hidden="true">⚡</b><span>БЫСТРЫЙ БОЙ</span><small>случайное построение</small>';
    if (rules) rules.innerHTML = '<b aria-hidden="true">⌁</b><span>УСТАВ</span><small>правила и жесты</small>';

    roster.hidden = true;
    actions.before(dock);
    dock.append(order, actions);
    footer?.classList.add('home-footer-v5');
    renderHomeOrder();
  }

  function renderHomeOrder() {
    const host = document.querySelector('#homeOrderUnitsV5');
    if (!host) return;
    host.innerHTML = persistent.setup.map((config) => {
      const data = TYPE_DATA[config.type];
      return `<article data-type="${config.type}">
        <span>${TYPE_ICONS[config.type]}</span>
        <div><strong>${data.short}</strong><small>${SLOT_SHORT[config.slot]} · ${FORMATION_LABELS[config.formation]}</small></div>
        <b>${data.count}</b>
      </article>`;
    }).join('');
  }

  function redesignSetup() {
    const setup = screens.setup;
    if (!setup || setup.dataset.screenV5) return;
    setup.dataset.screenV5 = 'true';

    const title = document.querySelector('#setupTitle');
    if (title) title.textContent = 'ПОСТРОЕНИЕ';
    const topCenter = setup.querySelector('.setup-topbar > div');
    const small = topCenter?.querySelector('small');
    if (small) small.textContent = 'ПЕРЕД БОЕМ';
    const back = document.querySelector('#setupBackButton');
    const random = document.querySelector('#randomizeButton');
    if (back) back.textContent = '‹ НАЗАД';
    if (random) random.textContent = '↻ СЛУЧАЙНО';

    setup.querySelector('.setup-intro')?.setAttribute('aria-hidden', 'true');
    const board = document.querySelector('#formationBoard');
    const stage = setup.querySelector('.setup-stage-v4');
    const inspector = document.querySelector('#setupInspectorV4');
    const footer = setup.querySelector('.setup-footer');
    const roster = setup.querySelector('.setup-roster-v4');
    if (!board || !stage || !inspector || !footer) return;

    roster?.setAttribute('hidden', '');
    stage.classList.add('setup-stage-v5');
    inspector.classList.add('setup-console-v5');
    footer.classList.add('setup-footer-v5');

    const boardLabel = make('div', 'board-status-v5', `
      <span><i></i> ВАШ РУБЕЖ</span>
      <small>коснись полка на схеме или в панели ниже</small>`);
    board.append(boardLabel);

    const summary = footer.querySelector('.setup-summary');
    if (summary) {
      summary.innerHTML = `<span><b>${armyTotal()}</b> БОЙЦА</span><span><b>3</b> КОМАНДНЫХ ТАКТА</span>`;
    }
    const start = document.querySelector('#startBattleButton');
    if (start) start.innerHTML = '<span>НАЧАТЬ СРАЖЕНИЕ</span><small>построение сохранится автоматически</small>';
  }

  function decorateSetupInspector() {
    const inspector = document.querySelector('#setupInspectorV4');
    if (!inspector) return;
    inspector.classList.add('setup-console-v5');
    inspector.querySelector('.inspector-heading')?.classList.add('inspector-heading-v5');
    inspector.querySelector('.inspector-tabs')?.classList.add('inspector-tabs-v5');
    const blocks = inspector.querySelectorAll('.inspector-block');
    blocks.forEach((block, index) => block.dataset.consoleBlock = index === 0 ? 'formation' : 'position');
  }

  function captureResultScene() {
    try {
      if (!battleCanvas?.width || !battleCanvas?.height) return;
      const preview = document.createElement('canvas');
      preview.width = 540;
      preview.height = 720;
      const context = preview.getContext('2d');
      if (!context) return;
      context.fillStyle = '#50604f';
      context.fillRect(0, 0, preview.width, preview.height);
      context.drawImage(battleCanvas, 0, 0, preview.width, preview.height);
      resultSnapshot = preview.toDataURL('image/jpeg', .62);
    } catch (error) {
      console.warn('[РАТЬ] result snapshot unavailable', error);
      resultSnapshot = '';
    }
  }

  function redesignResult() {
    const result = screens.result;
    if (!result || result.dataset.screenV5) return;
    result.dataset.screenV5 = 'true';

    const emblem = result.querySelector('.result-emblem-v4');
    const banner = result.querySelector('.result-banner');
    const stats = result.querySelector('.result-stats');
    const report = result.querySelector('#resultReportV4');
    const rematch = document.querySelector('#rematchButton');
    const setup = document.querySelector('#resultSetupButton');
    const menu = document.querySelector('#resultMenuButton');
    const exit = result.querySelector('.exit-link');
    if (!banner || !stats || !report || !rematch || !setup || !menu) return;

    emblem?.remove();
    const stage = make('section', 'result-stage-v5');
    const verdict = make('div', 'result-verdict-v5');
    const crest = make('div', 'result-crest-v5', '<i></i><span>⚔</span><i></i>');
    banner.before(stage);
    verdict.append(crest, banner, stats);
    stage.append(verdict, report);

    const actions = make('section', 'result-actions-v5');
    report.after(actions);
    actions.append(rematch, setup, menu);
    if (exit) actions.append(exit);

    rematch.innerHTML = '<span>РЕВАНШ</span><small>с тем же построением</small>';
    setup.innerHTML = '<span>ИЗМЕНИТЬ ПОСТРОЕНИЕ</span><small>вернуться к штабному столу</small>';
    menu.textContent = 'ГЛАВНОЕ МЕНЮ';
  }

  function refreshResult() {
    const result = screens.result;
    if (!result) return;
    if (resultSnapshot) result.style.setProperty('--result-scene', `url("${resultSnapshot}")`);
    const win = result.classList.contains('is-victory');
    const eyebrow = document.querySelector('#resultEyebrow');
    const title = document.querySelector('#resultTitle');
    if (eyebrow) eyebrow.textContent = win ? 'ПОЛЕ ОСТАЛОСЬ ЗА ВАМИ' : 'СТРОЙ НЕ ВЫДЕРЖАЛ';
    if (title) title.textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    const reportHeader = document.querySelector('#resultReportV4 > header span');
    if (reportHeader) reportHeader.textContent = 'СОСТОЯНИЕ ПОЛКОВ';
  }

  function install() {
    redesignHome();
    redesignSetup();
    decorateSetupInspector();
    redesignResult();
    document.body.dataset.ratShell = 'v5';
    const updateScript = document.querySelector('script[data-update-manager]');
    if (updateScript) updateScript.dataset.appVersion = UI_VERSION;
  }

  const baseRenderSetup = renderSetup;
  renderSetup = function renderRedesignedSetup() {
    baseRenderSetup();
    decorateSetupInspector();
    renderHomeOrder();
  };

  const baseShowScreen = showScreen;
  showScreen = function showRedesignedScreen(name) {
    baseShowScreen(name);
    if (name === 'home') renderHomeOrder();
    if (name === 'setup') requestAnimationFrame(decorateSetupInspector);
    if (name === 'result') requestAnimationFrame(refreshResult);
  };

  const baseEndBattle = endBattle;
  endBattle = function endBattleWithScene() {
    captureResultScene();
    baseEndBattle();
    requestAnimationFrame(refreshResult);
  };

  install();
  globalThis.__RAT_SCREEN_V5_READY = true;
})();