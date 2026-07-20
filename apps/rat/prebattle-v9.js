(() => {
  'use strict';

  const VERSION = '2.1.1';
  const PLAN_KEY = 'pocket-works:rat:plan-v8';

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `./prebattle-v9.css?v=${VERSION}`;
  css.dataset.ratPrebattle = VERSION;
  document.head.appendChild(css);
  const COLORS = { attack: '#d96943', hold: '#e5c56f', flank: '#7fb17c', retreat: '#83a8c4' };
  const LABELS = { attack: 'АТАКОВАТЬ', hold: 'ДЕРЖАТЬ', flank: 'ОБОЙТИ', retreat: 'ОТСТУПИТЬ' };
  const GLYPHS = { attack: '×', hold: '■', flank: '↷', retreat: '↓' };
  const DEFAULT_DEPLOYMENT = [
    { x: 110, y: 900 }, { x: 280, y: 835 }, { x: 450, y: 910 },
    { x: 620, y: 835 }, { x: 790, y: 900 }
  ];

  let prebattleActive = false;
  let planningGesture = null;
  let assigned = new Set();
  let planningDeck = null;
  let savedPauseLabel = '';

  const previousStartBattle = startBattle;
  const previousRenderRegimentBar = renderRegimentBar;
  const previousBeginGesture = globalThis.beginCommandGesture;
  const previousMoveGesture = globalThis.moveCommandGesture;
  const previousEndGesture = globalThis.endCommandGesture;
  const previousDrawOverlay = globalThis.drawCommandOverlay;

  function readSavedDeployment() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
      return Array.isArray(saved?.regiments) ? saved.regiments : [];
    } catch {
      return [];
    }
  }

  function playerSetupForPrebattle() {
    const saved = readSavedDeployment();
    return persistent.setup.map((config, index) => {
      const point = saved.find((item) => item.id === config.id) || saved[index] || DEFAULT_DEPLOYMENT[index];
      return {
        ...structuredClone(config),
        deployment: {
          x: clamp(Number(point?.x) || DEFAULT_DEPLOYMENT[index].x, 64, 836),
          y: clamp(Number(point?.y) || DEFAULT_DEPLOYMENT[index].y, 770, 1040)
        }
      };
    });
  }

  function nearestPlayerRegiment(point, maxDistance = 112) {
    if (!simulation) return null;
    let best = null;
    let distance = maxDistance;
    for (const regiment of simulation.teamRegiments(0)) {
      if (regiment.activeCount() <= 0) continue;
      const center = regiment.center();
      const current = Math.hypot(point.x - center.x, point.y - center.y);
      if (current < distance) {
        distance = current;
        best = regiment;
      }
    }
    return best;
  }

  function applyOpeningCommand(regiment, command) {
    const api = globalThis.__RAT_COMMAND_TEST__;
    if (!api?.ensureCommandState || !regiment || !command) return false;
    const state = api.ensureCommandState(regiment);
    state.kind = command.kind;
    state.point = { ...command.point };
    state.targetRegiment = command.targetRegiment || null;
    state.age = 0;
    state.momentum = command.kind === 'hold' ? .46 : .34;
    state.transition = 0;
    state.autonomous = false;
    regiment.manualObjective = { ...state.point };
    regiment.objective = { ...state.point };
    regiment.targetRegiment = command.targetRegiment || null;
    regiment.routed = false;
    regiment.openingOrder = command.kind;
    regiment.prebattleAssigned = true;
    for (const unit of regiment.units) {
      if (unit.dead) continue;
      unit.target = null;
      unit.retarget = 0;
    }
    assigned.add(regiment.id);
    selectedRegiment = regiment;
    simulation.spawnPulse?.(state.point.x, state.point.y, 0);
    audio.click();
    vibrate(8);
    renderRegimentBar();
    renderPlanningDeck();
    showToast(`${TYPE_DATA[regiment.type].short}: ${LABELS[command.kind].toLowerCase()}`);
    return true;
  }

  function installPlanningDeck() {
    planningDeck = document.querySelector('#prebattleDeckV9');
    if (planningDeck) return;
    const battle = document.querySelector('#battleScreen');
    const commandDeck = battle?.querySelector('.command-deck');
    if (!battle || !commandDeck) return;
    commandDeck.insertAdjacentHTML('afterend', `
      <section id="prebattleDeckV9" class="prebattle-deck-v9" hidden>
        <header>
          <div><small>ПЕРЕД СИГНАЛОМ · ВРЕМЯ ОСТАНОВЛЕНО</small><strong>ДАЙ ПРИКАЗ КАЖДОМУ ПОЛКУ</strong></div>
          <b id="prebattleCountV9">0/5</b>
        </header>
        <div class="prebattle-legend-v9">
          <span><b>ТАП</b>держать</span><span><b>НА ВРАГА</b>атаковать</span>
          <span><b>ВБОК</b>обойти</span><span><b>НАЗАД</b>отступить</span>
        </div>
        <div class="prebattle-actions-v9">
          <button id="prebattleHoldRestV9" type="button">ОСТАЛЬНЫМ — ДЕРЖАТЬ</button>
          <button id="prebattleLaunchV9" class="action action-primary" type="button" disabled>
            <span>НАЧАТЬ БОЙ</span><small>сначала назначь 5 приказов</small>
          </button>
        </div>
      </section>`);
    planningDeck = document.querySelector('#prebattleDeckV9');
    document.querySelector('#prebattleHoldRestV9')?.addEventListener('click', assignHoldToRest);
    document.querySelector('#prebattleLaunchV9')?.addEventListener('click', launchBattle);
  }

  function renderPlanningDeck() {
    if (!planningDeck || !simulation) return;
    const total = simulation.teamRegiments(0).length;
    const count = assigned.size;
    const counter = document.querySelector('#prebattleCountV9');
    const launch = document.querySelector('#prebattleLaunchV9');
    const rest = document.querySelector('#prebattleHoldRestV9');
    if (counter) counter.textContent = `${count}/${total}`;
    if (launch) {
      launch.disabled = count < total;
      launch.querySelector('small').textContent = count < total
        ? `ещё ${total - count} ${total - count === 1 ? 'приказ' : 'приказа'}`
        : 'все полки готовы';
    }
    if (rest) rest.disabled = count >= total;
  }

  function renderRegimentBarV9() {
    previousRenderRegimentBar();
    if (!prebattleActive || !simulation) return;
    const bar = document.querySelector('#regimentBar');
    bar?.querySelectorAll('.regiment-button').forEach((button) => {
      const regiment = simulation.regiments.find((item) => item.id === button.dataset.regimentId);
      if (!regiment) return;
      const ready = assigned.has(regiment.id);
      button.classList.toggle('prebattle-ready-v9', ready);
      button.classList.toggle('prebattle-needed-v9', !ready);
      const word = button.querySelector('.command-word');
      if (word) word.textContent = ready ? LABELS[regiment.openingOrder] : 'НУЖЕН ПРИКАЗ';
    });
  }

  renderRegimentBar = renderRegimentBarV9;

  function enterPrebattle() {
    const playerSetup = playerSetupForPrebattle();
    const enemySetup = createEnemySetup();
    simulation = new Simulation(playerSetup, enemySetup, false);
    const commandApi = globalThis.__RAT_COMMAND_TEST__;
    commandApi?.advanceCommandEconomy?.(999);
    for (const regiment of simulation.teamRegiments(0)) {
      regiment.commandState = null;
      commandApi?.ensureCommandState?.(regiment);
    }
    assigned = new Set();
    planningGesture = null;
    selectedRegiment = simulation.teamRegiments(0)[2] || simulation.teamRegiments(0)[0] || null;
    commandMode = 'orders';
    persistent.lastMode = 'orders';
    commandCooldown = 0;
    simulation.time = 0;
    simulation.orderCount = 0;

    showScreen('battle');
    prebattleActive = true;
    battlePaused = true;
    document.body.classList.add('is-prebattle-v9');
    installPlanningDeck();

    const commandDeck = document.querySelector('.command-deck');
    if (commandDeck) commandDeck.hidden = true;
    if (planningDeck) planningDeck.hidden = false;

    const pause = document.querySelector('#pauseButton');
    if (pause) {
      savedPauseLabel ||= pause.textContent;
      pause.textContent = 'НАЗАД';
    }
    const clock = document.querySelector('#battleClock');
    if (clock) clock.textContent = '00:00';
    const hint = document.querySelector('#orderHint');
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'ПРОВЕДИ ОТ КАЖДОГО ПОЛКА К ЕГО ПЕРВОЙ ЦЕЛИ';
    }

    drawBattle(simulation, battleCtx, battleCanvas, false);
    renderRegimentBar();
    renderPlanningDeck();
    lastFrame = performance.now();
    audio.order();
    vibrate([12, 20, 12]);
    setTimeout(() => { if (prebattleActive) showToast('Время остановлено — назначь пять приказов'); }, 260);
  }

  function leavePrebattleUI() {
    prebattleActive = false;
    planningGesture = null;
    document.body.classList.remove('is-prebattle-v9');
    const commandDeck = document.querySelector('.command-deck');
    if (commandDeck) commandDeck.hidden = false;
    if (planningDeck) planningDeck.hidden = true;
    const pause = document.querySelector('#pauseButton');
    if (pause) pause.textContent = savedPauseLabel || 'ПАУЗА';
    const hint = document.querySelector('#orderHint');
    if (hint) {
      hint.hidden = true;
      hint.textContent = 'ПРОВЕДИ ПАЛЬЦЕМ ОТ СВОЕГО ПОЛКА';
    }
  }

  function backToSetup() {
    if (!prebattleActive) return;
    leavePrebattleUI();
    battlePaused = false;
    simulation = null;
    showScreen('setup');
    requestAnimationFrame(renderSetup);
  }

  function launchBattle() {
    if (!prebattleActive || !simulation) return;
    const total = simulation.teamRegiments(0).length;
    if (assigned.size < total) {
      showToast(`Не назначено приказов: ${total - assigned.size}`);
      vibrate(8);
      return;
    }
    leavePrebattleUI();
    battlePaused = false;
    simulation.time = 0;
    simulation.orderCount = 0;
    lastFrame = performance.now();
    renderRegimentBar();
    audio.order();
    vibrate([18, 35, 28]);
    showToast('Знамёна подняты');
  }

  function assignHoldToRest() {
    if (!prebattleActive || !simulation) return;
    for (const regiment of simulation.teamRegiments(0)) {
      if (assigned.has(regiment.id)) continue;
      const center = regiment.center();
      applyOpeningCommand(regiment, { kind: 'hold', point: { ...center }, targetRegiment: null });
    }
    renderRegimentBar();
    renderPlanningDeck();
  }

  startBattle = function startBattlePausedV9(options = {}) {
    if (options.quick) {
      previousStartBattle(options);
      return;
    }
    enterPrebattle();
  };

  function beginPlanningGesture(event) {
    if (!prebattleActive || !simulation || simulation.finished) return false;
    audio.unlock();
    const point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
    const regiment = nearestPlayerRegiment(point);
    if (!regiment) {
      showToast('Начни жест на своём полку');
      vibrate(6);
      return false;
    }
    selectedRegiment = regiment;
    planningGesture = {
      pointerId: event.pointerId,
      regiment,
      command: globalThis.__RAT_COMMAND_TEST__.classifyCommand(regiment, point)
    };
    battleCanvas.setPointerCapture?.(event.pointerId);
    renderRegimentBar();
    document.querySelector('#orderHint')?.setAttribute('hidden', '');
    vibrate(5);
    return true;
  }

  function movePlanningGesture(event) {
    if (!planningGesture || planningGesture.pointerId !== event.pointerId || !simulation) return false;
    const point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
    planningGesture.command = globalThis.__RAT_COMMAND_TEST__.classifyCommand(planningGesture.regiment, point);
    return true;
  }

  function endPlanningGesture(event, cancelled = false) {
    if (!planningGesture || planningGesture.pointerId !== event.pointerId) return false;
    const gesture = planningGesture;
    if (!cancelled) {
      const point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
      const command = globalThis.__RAT_COMMAND_TEST__.classifyCommand(gesture.regiment, point);
      applyOpeningCommand(gesture.regiment, command);
    }
    planningGesture = null;
    battleCanvas.releasePointerCapture?.(event.pointerId);
    return true;
  }

  globalThis.beginCommandGesture = function beginCommandGestureV9(event) {
    return prebattleActive ? beginPlanningGesture(event) : previousBeginGesture?.(event);
  };
  globalThis.moveCommandGesture = function moveCommandGestureV9(event) {
    return prebattleActive ? movePlanningGesture(event) : previousMoveGesture?.(event);
  };
  globalThis.endCommandGesture = function endCommandGestureV9(event, cancelled = false) {
    return prebattleActive ? endPlanningGesture(event, cancelled) : previousEndGesture?.(event, cancelled);
  };

  function drawPreview(ctx, gesture) {
    const command = gesture.command;
    if (!command) return;
    const center = gesture.regiment.center();
    const point = command.point;
    const color = COLORS[command.kind] || '#e5c56f';
    ctx.save();
    ctx.globalAlpha = .95;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(28,38,32,.94)';
    ctx.fillRect(point.x - 18, point.y - 18, 36, 36);
    ctx.strokeRect(point.x - 18, point.y - 18, 36, 36);
    ctx.fillStyle = color;
    ctx.font = '900 24px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GLYPHS[command.kind], point.x, point.y + 1);
    ctx.restore();
  }

  globalThis.drawCommandOverlay = function drawCommandOverlayV9(sim, ctx, canvas) {
    previousDrawOverlay?.(sim, ctx, canvas);
    if (prebattleActive && planningGesture) drawPreview(ctx, planningGesture);
  };

  document.querySelector('#pauseButton')?.addEventListener('click', (event) => {
    if (!prebattleActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    backToSetup();
  }, true);

  function decorateSetupStart() {
    const startButton = document.querySelector('#startBattleButton');
    if (startButton) startButton.innerHTML = '<span>К ПОЛЮ БОЯ</span><small>время остановится для пяти первых приказов</small>';
  }

  const previousRenderSetupV9 = renderSetup;
  renderSetup = function renderSetupFrozenPlanV9() {
    previousRenderSetupV9();
    requestAnimationFrame(decorateSetupStart);
  };

  const previousShowScreenV9 = showScreen;
  showScreen = function showScreenFrozenPlanV9(name) {
    previousShowScreenV9(name);
    if (name === 'setup') requestAnimationFrame(() => requestAnimationFrame(decorateSetupStart));
  };

  decorateSetupStart();

  const updateScript = document.querySelector('script[data-update-manager]');
  if (updateScript) updateScript.dataset.appVersion = VERSION;
  const footerVersion = document.querySelector('.home-footer span:first-child');
  if (footerVersion) footerVersion.textContent = 'РАТЬ · 2.1.1';
  const settingsBuild = document.querySelector('.settings-build-v4 b');
  if (settingsBuild) settingsBuild.textContent = 'BUILD 2.1.1';
  document.body.dataset.ratPrebattle = 'v9';
  globalThis.__RAT_PREBATTLE_V9_READY = true;
})();
