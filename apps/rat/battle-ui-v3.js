(() => {
  'use strict';

  const UI_VERSION = '1.3.0';
  const UI_COLORS = {
    attack: '#df6b45',
    hold: '#e2c56f',
    flank: '#82b47e',
    retreat: '#86abc7'
  };
  const UI_LABELS = {
    attack: 'АТАКА',
    hold: 'ДЕРЖАТЬ',
    flank: 'ОБХОД',
    retreat: 'ОТХОД'
  };
  const UI_HINTS = {
    attack: 'Полк свяжет боем выбранного врага',
    hold: 'Полк соберётся и удержит рубеж',
    flank: 'Полк обойдёт фронт и ударит сбоку',
    retreat: 'Полк разорвёт контакт и перестроится'
  };
  const TYPE_ICONS = { swords: '⚔', spears: '↟', archers: '➶' };
  const COACH_KEY = 'pocket-works:rat:gesture-coach-seen';

  let uiGesture = null;
  let barStamp = '';
  let situationStamp = '';
  let coachDismissed = localStorage.getItem(COACH_KEY) === '1';

  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = './battle-ui-v3.css';
  cssLink.dataset.ratUi = UI_VERSION;
  document.head.appendChild(cssLink);

  function installHeader() {
    const header = document.querySelector('.battle-header');
    if (!header || header.dataset.uiV3) return;
    header.dataset.uiV3 = 'true';
    header.innerHTML = `
      <a class="shelf-mark battle-exit" href="../../" data-shell-exit data-app-control data-native-press aria-label="Вернуться в Pocket Works"><span>‹</span><small>PW</small></a>
      <div class="army-score army-score-player">
        <span class="army-banner" aria-hidden="true"></span>
        <div><small>ВАШИ</small><strong id="playerAlive">72</strong></div>
      </div>
      <div class="battle-center">
        <span id="battleSituation">СБЛИЖЕНИЕ</span>
        <strong id="battleClock">00:00</strong>
      </div>
      <div class="army-score army-score-enemy">
        <div><small>ВРАГ</small><strong id="enemyAlive">72</strong></div>
        <span class="army-banner" aria-hidden="true"></span>
      </div>
      <button id="pauseButton" class="header-button battle-pause" type="button" data-native-press aria-label="Пауза"><i></i><i></i></button>`;
  }

  function installBattlefieldChrome() {
    const wrap = document.querySelector('#battlefieldWrap');
    if (!wrap || wrap.dataset.uiV3) return;
    wrap.dataset.uiV3 = 'true';
    wrap.insertAdjacentHTML('beforeend', `
      <div id="gestureCoach" class="gesture-coach${coachDismissed ? ' is-dismissed' : ''}" aria-hidden="true">
        <div class="coach-emblem"><i></i><i></i><i></i></div>
        <div><strong>КОМАНДУЙ ПРЯМО НА ПОЛЕ</strong><span>зажми свой полк и протяни к цели</span></div>
      </div>
      <div id="intentReadout" class="intent-readout" aria-live="polite">
        <span id="intentGlyph">■</span>
        <div><strong id="intentLabel">ДЕРЖАТЬ</strong><small id="intentHint">Полк соберётся и удержит рубеж</small></div>
      </div>
      <div id="selectedReadout" class="selected-readout" aria-hidden="true">
        <span id="selectedIcon">⚔</span>
        <div><strong id="selectedName">МЕЧНИКИ</strong><small id="selectedOrder">ПО ПЛАНУ</small></div>
      </div>`);
  }

  function installCommandDeck() {
    const deck = document.querySelector('.command-deck');
    if (!deck || deck.dataset.uiV3) return;
    deck.dataset.uiV3 = 'true';
    deck.innerHTML = `
      <div class="command-panel-main">
        <div class="command-prompt">
          <small>ТЕКУЩИЙ ПОЛК</small>
          <strong id="commandPrompt">ВЫБЕРИ ПОЛК НА ПОЛЕ</strong>
          <span id="commandSubprompt">зажми бойцов и протяни к цели</span>
        </div>
        <div class="command-bank-wrap">
          <div id="commandPips" class="command-pips" aria-label="Запас приказов"></div>
          <span id="commandTimer" class="command-timer">ШТАБ ГОТОВ</span>
        </div>
      </div>
      <div class="command-gesture-strip" aria-hidden="true">
        <span data-kind="hold"><b>•</b>тап</span>
        <span data-kind="attack"><b>×</b>на врага</span>
        <span data-kind="flank"><b>↷</b>вбок</span>
        <span data-kind="retreat"><b>↓</b>назад</span>
      </div>`;
  }

  function installBattleChrome() {
    installHeader();
    installBattlefieldChrome();
    installCommandDeck();
    updateSelectedReadout();
  }

  function commandState(regiment) {
    return regiment?.commandState || null;
  }

  function stateLabel(regiment) {
    if (!regiment) return 'НЕТ ПОЛКА';
    const active = regiment.activeCount();
    const standing = regiment.totalStanding();
    const state = commandState(regiment);
    if (active === 0 && standing > 0) return 'БЕЖИТ';
    if (state?.transition > 0) return 'ПЕРЕСТРОЕНИЕ';
    if (state?.autonomous) return 'ПО ПЛАНУ';
    return UI_LABELS[state?.kind] || 'ПО ПЛАНУ';
  }

  function updateSelectedReadout() {
    const regiment = selectedRegiment;
    const readout = document.querySelector('#selectedReadout');
    const prompt = document.querySelector('#commandPrompt');
    const subprompt = document.querySelector('#commandSubprompt');
    if (!readout || !prompt || !subprompt) return;

    if (!regiment || regiment.activeCount() <= 0) {
      readout.classList.remove('is-visible');
      prompt.textContent = 'ВЫБЕРИ ПОЛК НА ПОЛЕ';
      subprompt.textContent = 'зажми бойцов и протяни к цели';
      return;
    }

    const data = TYPE_DATA[regiment.type];
    const state = commandState(regiment);
    document.querySelector('#selectedIcon').textContent = TYPE_ICONS[regiment.type] || '◆';
    document.querySelector('#selectedName').textContent = data.label;
    document.querySelector('#selectedOrder').textContent = stateLabel(regiment);
    prompt.textContent = `${data.short} · ${stateLabel(regiment)}`;
    subprompt.textContent = state?.transition > 0
      ? 'полк разворачивается и собирает строй'
      : 'зажми его на поле и протяни к новой цели';
    readout.classList.add('is-visible');
  }

  function regimentMarkup(regiment) {
    const data = TYPE_DATA[regiment.type];
    const standing = regiment.totalStanding();
    const ratio = standing / regiment.units.length;
    const state = commandState(regiment);
    const morale = clamp(regiment.morale ?? 1, 0, 1);
    const momentum = clamp(state?.momentum ?? .25, 0, 1);
    const selected = selectedRegiment === regiment;
    const disabled = regiment.activeCount() <= 0;
    return `<button class="regiment-button regiment-${regiment.type}${state?.transition > 0 ? ' is-reforming' : ''}" type="button" data-regiment-id="${regiment.id}" data-type="${regiment.type}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>
      <span class="regiment-emblem">${TYPE_ICONS[regiment.type] || '◆'}<small>${standing}</small></span>
      <span class="regiment-info"><b>${data.short}</b><small>${stateLabel(regiment)}</small></span>
      <span class="regiment-tempo" title="Напор"><i style="--tempo:${momentum}"></i></span>
      <span class="regiment-bars"><i class="regiment-strength" style="--value:${ratio}"></i><i class="regiment-morale" style="--value:${morale}"></i></span>
    </button>`;
  }

  function installBarDelegation() {
    const bar = document.querySelector('#regimentBar');
    if (!bar || bar.dataset.delegatedV3) return;
    bar.dataset.delegatedV3 = 'true';
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('.regiment-button');
      if (!button || !simulation) return;
      const regiment = simulation.regiments.find((item) => item.id === button.dataset.regimentId);
      if (!regiment || regiment.activeCount() <= 0) return;
      selectedRegiment = regiment;
      audio.click();
      barStamp = '';
      renderRegimentBar();
      updateSelectedReadout();
      showToast(`${TYPE_DATA[regiment.type].short}: веди жест прямо от бойцов`);
    });
  }

  renderRegimentBar = function renderInterfaceRegimentBar() {
    if (!simulation) return;
    const bar = document.querySelector('#regimentBar');
    if (!bar) return;
    const stamp = simulation.teamRegiments(0).map((regiment) => {
      const state = commandState(regiment);
      return [regiment.id, regiment.totalStanding(), Math.round((regiment.morale ?? 1) * 20), state?.kind, Math.round((state?.momentum ?? 0) * 20), Math.ceil((state?.transition ?? 0) * 10), selectedRegiment === regiment].join(':');
    }).join('|');
    if (stamp !== barStamp) {
      barStamp = stamp;
      bar.innerHTML = simulation.teamRegiments(0).map(regimentMarkup).join('');
    }
    installBarDelegation();
    updateSelectedReadout();
  };

  function updateSituation() {
    if (!simulation) return;
    const player = simulation.teamActive(0);
    const enemy = simulation.teamActive(1);
    const total = Math.max(1, player + enemy);
    const balance = player / total;
    const contact = simulation.units.filter((unit) => !unit.dead && unit.contact > .2).length;
    let text = 'СБЛИЖЕНИЕ';
    if (simulation.time > 4 && contact > 10) text = 'ЛИНИИ СХОДЯТСЯ';
    if (contact > 24) text = balance > .57 ? 'ВРАГ ДРОГНУЛ' : balance < .43 ? 'ФРОНТ ТРЕЩИТ' : 'ЖАРКАЯ СХВАТКА';
    if (simulation.teamRegiments(0).some((regiment) => regiment.routed)) text = 'ПОЛК БЕЖИТ';
    const node = document.querySelector('#battleSituation');
    if (node && situationStamp !== text) {
      situationStamp = text;
      node.textContent = text;
    }
  }

  const commandUpdateBattleHud = updateBattleHud;
  updateBattleHud = function updateInterfaceHud(dt) {
    commandUpdateBattleHud(dt);
    updateSituation();
    updateSelectedReadout();
  };

  function setIntent(command) {
    const readout = document.querySelector('#intentReadout');
    if (!readout || !command) return;
    const glyphs = { attack: '×', hold: '■', flank: '↷', retreat: '↓' };
    readout.style.setProperty('--intent-color', UI_COLORS[command.kind]);
    document.querySelector('#intentGlyph').textContent = glyphs[command.kind];
    document.querySelector('#intentLabel').textContent = UI_LABELS[command.kind];
    document.querySelector('#intentHint').textContent = UI_HINTS[command.kind];
    readout.classList.add('is-visible');
    document.querySelectorAll('.command-gesture-strip [data-kind]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.kind === command.kind);
    });
  }

  function clearIntent() {
    document.querySelector('#intentReadout')?.classList.remove('is-visible');
    document.querySelectorAll('.command-gesture-strip [data-kind]').forEach((item) => item.classList.remove('is-active'));
  }

  function pointFromEvent(event) {
    if (!simulation?.metrics) return null;
    return screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
  }

  const baseBeginGesture = globalThis.beginCommandGesture;
  const baseMoveGesture = globalThis.moveCommandGesture;
  const baseEndGesture = globalThis.endCommandGesture;

  globalThis.beginCommandGesture = function beginInterfaceGesture(event) {
    const handled = baseBeginGesture?.(event) || false;
    if (!handled) return false;
    const point = pointFromEvent(event);
    uiGesture = { regiment: selectedRegiment, point };
    if (uiGesture.regiment && point) {
      const command = globalThis.__RAT_COMMAND_TEST__?.classifyCommand(uiGesture.regiment, point);
      uiGesture.command = command;
      setIntent(command);
    }
    document.querySelector('#battlefieldWrap')?.classList.add('is-commanding');
    updateSelectedReadout();
    return true;
  };

  globalThis.moveCommandGesture = function moveInterfaceGesture(event) {
    const handled = baseMoveGesture?.(event) || false;
    if (!handled || !uiGesture?.regiment) return handled;
    const point = pointFromEvent(event);
    if (!point) return handled;
    uiGesture.point = point;
    uiGesture.command = globalThis.__RAT_COMMAND_TEST__?.classifyCommand(uiGesture.regiment, point);
    setIntent(uiGesture.command);
    return true;
  };

  globalThis.endCommandGesture = function endInterfaceGesture(event, cancelled = false) {
    const handled = baseEndGesture?.(event, cancelled) || false;
    if (handled && !cancelled) {
      coachDismissed = true;
      localStorage.setItem(COACH_KEY, '1');
      document.querySelector('#gestureCoach')?.classList.add('is-dismissed');
    }
    uiGesture = null;
    clearIntent();
    document.querySelector('#battlefieldWrap')?.classList.remove('is-commanding');
    barStamp = '';
    renderRegimentBar();
    return handled;
  };

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawRegimentTag(ctx, regiment, selected) {
    if (regiment.activeCount() <= 0) return;
    const center = regiment.center();
    const state = commandState(regiment);
    const color = UI_COLORS[state?.kind] || '#d9c27d';
    const icon = TYPE_ICONS[regiment.type] || '◆';
    ctx.save();
    ctx.translate(Math.round(center.x), Math.round(center.y));

    if (selected) {
      ctx.strokeStyle = 'rgba(30,40,34,.55)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 1, 47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(245,220,151,.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 6]);
      ctx.beginPath();
      ctx.arc(0, 1, 47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const width = selected ? 94 : 58;
    const height = selected ? 25 : 20;
    const x = -width / 2;
    const y = selected ? -69 : -54;
    ctx.fillStyle = selected ? 'rgba(27,36,31,.94)' : 'rgba(27,36,31,.72)';
    roundedRect(ctx, x, y, width, height, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = selected ? '900 12px system-ui,sans-serif' : '900 10px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(selected ? `${icon}  ${UI_LABELS[state?.kind] || 'ПЛАН'}` : icon, 0, y + height / 2 + .5);

    if (state?.transition > 0) {
      const progress = clamp(1 - state.transition / 1.4, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(-width / 2, y + height + 4, width, 3);
      ctx.fillStyle = color;
      ctx.fillRect(-width / 2, y + height + 4, width * progress, 3);
    }
    ctx.restore();
  }

  const baseDrawCommandOverlay = globalThis.drawCommandOverlay;
  globalThis.drawCommandOverlay = function drawInterfaceOverlay(sim, ctx, canvas) {
    baseDrawCommandOverlay?.(sim, ctx, canvas);
    if (!sim || sim.demo || currentScreen !== 'battle') return;

    for (const regiment of sim.teamRegiments(0)) {
      drawRegimentTag(ctx, regiment, regiment === selectedRegiment);
    }

    if (uiGesture?.command) {
      const command = uiGesture.command;
      const point = command.point;
      const color = UI_COLORS[command.kind];
      const start = uiGesture.regiment.center();
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = dx / length;
      const ny = dy / length;
      const px = -ny;
      const py = nx;
      const half = command.kind === 'flank' ? 26 : 18;

      ctx.save();
      ctx.globalAlpha = .16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(start.x + px * half, start.y + py * half);
      ctx.lineTo(point.x + px * half * .55, point.y + py * half * .55);
      ctx.lineTo(point.x - px * half * .55, point.y - py * half * .55);
      ctx.lineTo(start.x - px * half, start.y - py * half);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, command.kind === 'hold' ? 46 : 34, 0, Math.PI * 2);
      ctx.stroke();
      if (command.targetRegiment) {
        const enemy = command.targetRegiment.center();
        ctx.globalAlpha = .55;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 52, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const baseStartBattle = startBattle;
  startBattle = function startInterfaceBattle(options = {}) {
    baseStartBattle(options);
    installBattleChrome();
    barStamp = '';
    situationStamp = '';
    renderRegimentBar();
    document.querySelector('#gestureCoach')?.classList.toggle('is-dismissed', coachDismissed);
  };

  installBattleChrome();
  renderRegimentBar();
  globalThis.__RAT_UI_V3_READY = true;
})();
