(() => {
  'use strict';

  const COMMAND_MAX = 3;
  const COMMAND_RECHARGE = 5.8;
  const COMMAND_COLORS = {
    attack: '#d96943',
    hold: '#e5c56f',
    flank: '#7fb17c',
    retreat: '#83a8c4'
  };
  const COMMAND_LABELS = {
    attack: 'АТАКОВАТЬ',
    hold: 'ДЕРЖАТЬ',
    flank: 'ОБОЙТИ',
    retreat: 'ОТСТУПИТЬ'
  };
  const COMMAND_GLYPHS = {
    attack: '×',
    hold: '■',
    flank: '↷',
    retreat: '↓'
  };

  let commandPoints = COMMAND_MAX;
  let commandRecharge = 0;
  let commandGesture = null;
  let commandHudStamp = '';

  function ensureCommandState(regiment) {
    if (!regiment.commandState) {
      regiment.commandState = {
        kind: 'attack',
        point: { x: regiment.objective?.x ?? regiment.x, y: regiment.objective?.y ?? regiment.y },
        targetRegiment: null,
        age: 0,
        momentum: .28,
        transition: 0,
        autonomous: true
      };
    }
    return regiment.commandState;
  }

  function resetCommands() {
    commandPoints = COMMAND_MAX;
    commandRecharge = 0;
    commandGesture = null;
    commandHudStamp = '';
    if (!simulation) return;
    for (const regiment of simulation.teamRegiments(0)) {
      regiment.commandState = null;
      ensureCommandState(regiment);
    }
  }

  function nearestRegiment(point, team, maxDistance = Infinity) {
    if (!simulation) return null;
    let best = null;
    let bestDistance = maxDistance;
    for (const regiment of simulation.teamRegiments(team)) {
      if (regiment.activeCount() <= 0) continue;
      const center = regiment.center();
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = regiment;
      }
    }
    return best;
  }

  function classifyCommand(regiment, point) {
    const start = regiment.center();
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const length = Math.hypot(dx, dy);
    const enemy = nearestRegiment(point, 1, 118);

    if (length < 42) {
      return { kind: 'hold', point: { ...start }, targetRegiment: null };
    }

    if (enemy) {
      return { kind: 'attack', point: enemy.center(), targetRegiment: enemy };
    }

    if (dy > 82 && Math.abs(dy) > Math.abs(dx) * .62) {
      return {
        kind: 'retreat',
        point: { x: clamp(point.x, 55, 845), y: clamp(point.y, start.y + 58, 1110) },
        targetRegiment: null
      };
    }

    const forward = -dy;
    const lateral = Math.abs(dx);
    const nearestEnemy = nearestRegiment(point, 1, Infinity);
    const behindEnemy = nearestEnemy && point.y < nearestEnemy.center().y + 22;
    if ((forward > 72 && lateral > 72) || (behindEnemy && lateral > 50)) {
      return {
        kind: 'flank',
        point: { x: clamp(point.x, 55, 845), y: clamp(point.y, 80, 1080) },
        targetRegiment: nearestEnemy
      };
    }

    return {
      kind: 'hold',
      point: { x: clamp(point.x, 55, 845), y: clamp(point.y, 80, 1100) },
      targetRegiment: null
    };
  }

  function issueCommand(regiment, command) {
    if (!simulation || !regiment || regiment.activeCount() <= 0) return false;
    if (commandPoints <= 0) {
      showToast('Штаб ещё готовит приказ');
      vibrate(8);
      return false;
    }

    const state = ensureCommandState(regiment);
    const changingPlan = !state.autonomous && (
      state.kind !== command.kind ||
      Math.hypot((state.point?.x ?? 0) - command.point.x, (state.point?.y ?? 0) - command.point.y) > 48
    );
    const inertia = changingPlan ? .35 + state.momentum * .95 : .22;

    state.kind = command.kind;
    state.point = { ...command.point };
    state.targetRegiment = command.targetRegiment || null;
    state.age = 0;
    state.transition = inertia;
    state.momentum = changingPlan ? Math.max(.05, state.momentum * .18) : Math.max(.12, state.momentum * .45);
    state.autonomous = false;

    regiment.manualObjective = { ...state.point };
    regiment.routed = false;
    regiment.morale = Math.max(regiment.morale, .24);
    regiment.casualtyShock = Math.min(.24, regiment.casualtyShock + inertia * .018);
    for (const unit of regiment.units) {
      if (unit.dead) continue;
      unit.target = null;
      unit.retarget = 0;
    }

    const wasFull = commandPoints === COMMAND_MAX;
    commandPoints -= 1;
    if (wasFull) commandRecharge = 0;
    simulation.orderCount += 1;
    simulation.spawnPulse(state.point.x, state.point.y, 0);
    audio.order();
    vibrate(command.kind === 'attack' ? [14, 18, 24] : command.kind === 'retreat' ? [28, 20, 10] : [12, 18, 12]);
    showToast(`${TYPE_DATA[regiment.type].short}: ${COMMAND_LABELS[command.kind].toLowerCase()}`);
    renderRegimentBar();
    updateCommandHud(0, true);
    return true;
  }

  function advanceCommandEconomy(dt) {
    if (commandPoints >= COMMAND_MAX) {
      commandRecharge = 0;
      return;
    }
    commandRecharge += dt * Number(persistent.settings.speed || 1);
    while (commandRecharge >= COMMAND_RECHARGE && commandPoints < COMMAND_MAX) {
      commandRecharge -= COMMAND_RECHARGE;
      commandPoints += 1;
      if (commandPoints === COMMAND_MAX) commandRecharge = 0;
      audio.click();
      vibrate(7);
    }
  }

  function updateCommandHud(dt, force = false) {
    advanceCommandEconomy(dt);
    const pips = document.querySelector('#commandPips');
    const timer = document.querySelector('#commandTimer');
    if (!pips || !timer) return;
    const progress = commandPoints >= COMMAND_MAX ? 1 : clamp(commandRecharge / COMMAND_RECHARGE, 0, 1);
    const stamp = `${commandPoints}:${Math.floor(progress * 20)}`;
    if (!force && stamp === commandHudStamp) return;
    commandHudStamp = stamp;

    pips.innerHTML = Array.from({ length: COMMAND_MAX }, (_, index) => {
      const filled = index < commandPoints;
      const charging = index === commandPoints && commandPoints < COMMAND_MAX;
      return `<i class="command-pip${filled ? ' filled' : ''}${charging ? ' charging' : ''}" style="--charge:${charging ? progress : 0}"><b>${index + 1}</b></i>`;
    }).join('');
    timer.textContent = commandPoints >= COMMAND_MAX
      ? 'ШТАБ ГОТОВ'
      : `+1 ЧЕРЕЗ ${Math.max(.1, COMMAND_RECHARGE - commandRecharge).toFixed(1)} С`;
    document.querySelector('.command-deck')?.classList.toggle('is-empty', commandPoints <= 0);
  }

  function installCommandUI() {
    const deck = document.querySelector('.command-deck');
    if (deck && !deck.dataset.commandV2) {
      deck.dataset.commandV2 = 'true';
      deck.innerHTML = `
        <div class="command-heading command-heading-v2">
          <div>
            <small>ТАКТЫ КОМАНДОВАНИЯ</small>
            <strong>ПРОВЕДИ ОТ ПОЛКА</strong>
          </div>
          <span id="commandTimer" class="command-timer">ШТАБ ГОТОВ</span>
        </div>
        <div id="commandPips" class="command-pips" aria-label="Запас приказов"></div>
        <div class="gesture-legend" aria-label="Жесты приказов">
          <span><b>ТАП</b> держать</span>
          <span><b>НА ВРАГА</b> атака</span>
          <span><b>ВБОК</b> обход</span>
          <span><b>НАЗАД</b> отход</span>
        </div>`;
    }

    const hint = document.querySelector('#orderHint');
    if (hint) {
      hint.textContent = 'ПРОВЕДИ ПАЛЬЦЕМ ОТ СВОЕГО ПОЛКА';
      hint.hidden = false;
    }

    const ruleItems = document.querySelectorAll('.rules-list li');
    if (ruleItems[2]) {
      ruleItems[2].querySelector('strong').textContent = 'Приказ — это один жест';
      ruleItems[2].querySelector('p').textContent = 'Проведи от полка на врага для атаки, в сторону для обхода, назад для отхода или просто нажми, чтобы удерживать место.';
    }
    if (ruleItems[3]) {
      ruleItems[3].querySelector('strong').textContent = 'Не дёргай строй без причины';
      ruleItems[3].querySelector('p').textContent = 'Полк накапливает напор и связность. Резкая смена задачи заставляет людей разворачиваться и на время ломает темп.';
    }

    if (!document.querySelector('#commandV2Styles')) {
      const style = document.createElement('style');
      style.id = 'commandV2Styles';
      style.textContent = `
        .command-deck{padding:8px 10px calc(var(--safe-bottom) + 8px);transition:filter .18s ease}
        .command-deck.is-empty{filter:saturate(.72)}
        .command-heading-v2{margin-bottom:6px}
        .command-timer{font-size:9px;letter-spacing:.09em;font-weight:900;color:#d9c27d}
        .command-pips{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;height:31px}
        .command-pip{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.055);color:rgba(255,255,255,.28)}
        .command-pip::before{content:"";position:absolute;inset:auto 0 0;height:calc(var(--charge) * 100%);background:rgba(202,168,93,.3)}
        .command-pip.filled{background:#d6bd79;border-color:#ecd99e;color:#253129;box-shadow:inset 0 -3px 0 rgba(84,64,35,.24)}
        .command-pip b{position:relative;font:900 11px Georgia,serif}
        .gesture-legend{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;color:rgba(255,255,255,.48);font-size:7px;line-height:1.15;text-align:center;text-transform:uppercase}
        .gesture-legend span{padding:4px 2px;border-top:1px solid rgba(255,255,255,.08)}
        .gesture-legend b{display:block;margin-bottom:2px;color:rgba(255,255,255,.82);font-size:7px}
        .regiment-button .command-word{color:#dfc77f}
        .regiment-button.is-reforming{animation:commandPulse .5s steps(2,end) infinite}
        @keyframes commandPulse{50%{background:rgba(214,189,121,.15)}}
        @media(max-height:690px){.gesture-legend{display:none}.command-pips{height:27px}.command-deck{padding-top:6px}}
      `;
      document.head.appendChild(style);
    }
    updateCommandHud(0, true);
  }

  const baseStartBattle = startBattle;
  startBattle = function commandStartBattle(options = {}) {
    commandMode = 'orders';
    persistent.lastMode = 'orders';
    baseStartBattle(options);
    resetCommands();
    selectedRegiment = simulation?.teamRegiments(0)[1] || simulation?.teamRegiments(0)[0] || null;
    renderRegimentBar();
    installCommandUI();
    updateCommandHud(0, true);
    setTimeout(() => {
      if (currentScreen === 'battle') showToast('Проведи от полка к цели');
    }, 420);
  };

  setCommandMode = function commandOnlyMode() {
    commandMode = 'orders';
    persistent.lastMode = 'orders';
    saveState();
    installCommandUI();
  };

  renderRegimentBar = function renderCommandRegimentBar() {
    if (!simulation) return;
    const bar = document.querySelector('#regimentBar');
    bar.innerHTML = simulation.teamRegiments(0).map((regiment) => {
      const data = TYPE_DATA[regiment.type];
      const active = regiment.activeCount();
      const standing = regiment.totalStanding();
      const ratio = standing / regiment.units.length * 100;
      const state = ensureCommandState(regiment);
      const status = active === 0 && standing > 0
        ? 'БЕЖИТ'
        : state.transition > 0
          ? 'ПЕРЕСТРОЕНИЕ'
          : state.autonomous
            ? 'ПО ПЛАНУ'
            : COMMAND_LABELS[state.kind];
      return `<button class="regiment-button${state.transition > 0 ? ' is-reforming' : ''}" type="button" data-regiment-id="${regiment.id}" aria-pressed="${selectedRegiment === regiment}">
        <b>${data.short}</b><small>${standing} · <span class="command-word">${status}</span></small><i style="width:${ratio}%"></i>
      </button>`;
    }).join('');
    bar.querySelectorAll('.regiment-button').forEach((button) => button.addEventListener('click', () => {
      const regiment = simulation.regiments.find((item) => item.id === button.dataset.regimentId);
      if (!regiment || regiment.activeCount() <= 0) return;
      selectedRegiment = regiment;
      audio.click();
      renderRegimentBar();
      showToast(`${TYPE_DATA[regiment.type].short}: проведи от полка`);
    }));
  };

  updateBattleHud = function updateCommandBattleHud(dt) {
    if (!simulation) return;
    const player = simulation.teamStanding(0);
    const enemy = simulation.teamStanding(1);
    document.querySelector('#playerAlive').textContent = player;
    document.querySelector('#enemyAlive').textContent = enemy;
    document.querySelector('#battleClock').textContent = formatTime(simulation.time);
    const total = Math.max(1, player + enemy);
    document.querySelector('#moralePlayer').style.width = `${player / total * 100}%`;
    document.querySelector('#moraleEnemy').style.width = `${enemy / total * 100}%`;
    updateCommandHud(dt);
    renderRegimentBar();
  };

  issueBattleOrder = function legacyCommandOrder(point) {
    if (!selectedRegiment) return;
    issueCommand(selectedRegiment, classifyCommand(selectedRegiment, point));
  };

  const baseUpdateRegiment = Simulation.prototype.updateRegiment;
  const baseUpdateUnit = Simulation.prototype.updateUnit;
  const baseFindCombatTarget = Simulation.prototype.findCombatTarget;

  Simulation.prototype.updateRegiment = function updateCommandRegiment(regiment, dt) {
    baseUpdateRegiment.call(this, regiment, dt);
    if (this.demo || regiment.team !== 0 || regiment.activeCount() <= 0) return;

    const state = ensureCommandState(regiment);
    state.age += dt;
    state.transition = Math.max(0, state.transition - dt);
    if (state.transition <= 0) state.momentum = clamp(state.momentum + dt * (state.kind === 'hold' ? .12 : .19), 0, 1);

    if (state.kind === 'attack') {
      if (!state.targetRegiment || state.targetRegiment.activeCount() <= 0) state.targetRegiment = this.pickTargetRegiment(regiment);
      if (state.targetRegiment) {
        regiment.targetRegiment = state.targetRegiment;
        state.point = this.approachPoint(regiment, state.targetRegiment);
      }
    } else if (state.kind === 'flank') {
      const distance = Math.hypot(regiment.center().x - state.point.x, regiment.center().y - state.point.y);
      if (distance < 58 && state.age > .8) {
        state.kind = 'attack';
        state.age = 0;
        state.momentum = Math.max(.55, state.momentum);
        state.targetRegiment = state.targetRegiment?.activeCount() > 0 ? state.targetRegiment : this.pickTargetRegiment(regiment);
        if (state.targetRegiment) regiment.targetRegiment = state.targetRegiment;
      }
    } else if (state.kind === 'retreat') {
      const distance = Math.hypot(regiment.center().x - state.point.x, regiment.center().y - state.point.y);
      if (distance < 48 && state.age > .8) {
        state.kind = 'hold';
        state.point = regiment.center();
        state.age = 0;
        state.momentum = .22;
      }
    }

    regiment.manualObjective = { ...state.point };
    regiment.objective = { ...state.point };
    regiment.commandMomentum = state.momentum;
    regiment.commandTransition = state.transition;
    regiment.commandType = state.kind;
    regiment.morale = clamp(regiment.morale + state.momentum * dt * .012, 0, 1);
  };

  Simulation.prototype.findCombatTarget = function findCommandCombatTarget(unit, maxRange = Infinity) {
    if (!this.demo && unit.regiment.team === 0) {
      const state = ensureCommandState(unit.regiment);
      if (state.transition > 0 || state.kind === 'retreat') return null;
      if (state.kind === 'flank') {
        const center = unit.regiment.center();
        if (Math.hypot(center.x - state.point.x, center.y - state.point.y) > 64) return null;
      }
      if (state.kind === 'hold') maxRange = Math.min(maxRange, unit.type === 'archers' ? 250 : 92);
    }
    return baseFindCombatTarget.call(this, unit, maxRange);
  };

  Simulation.prototype.updateUnit = function updateCommandUnit(unit, dt) {
    if (!unit.nominalSpeed) unit.nominalSpeed = unit.speed;
    if (!this.demo && unit.regiment.team === 0) {
      const state = ensureCommandState(unit.regiment);
      const transitionFactor = state.transition > 0 ? lerp(.48, .72, 1 - state.transition / 1.4) : 1;
      const momentumFactor = .93 + state.momentum * .13;
      unit.speed = unit.nominalSpeed * transitionFactor * momentumFactor;
      if (state.transition > 0 || state.kind === 'retreat') {
        unit.target = null;
        unit.retarget = Math.min(unit.retarget, 0);
      }
    } else {
      unit.speed = unit.nominalSpeed || unit.speed;
    }
    baseUpdateUnit.call(this, unit, dt);
  };

  function beginCommandGesture(event) {
    if (!simulation || battlePaused || simulation.finished) return false;
    audio.unlock();
    const point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
    const regiment = nearestRegiment(point, 0, 105);
    if (!regiment) {
      showToast('Начни жест на своём полку');
      return false;
    }
    selectedRegiment = regiment;
    commandGesture = {
      pointerId: event.pointerId,
      regiment,
      start: regiment.center(),
      point,
      command: classifyCommand(regiment, point)
    };
    renderRegimentBar();
    document.querySelector('#orderHint').hidden = true;
    battleCanvas.setPointerCapture?.(event.pointerId);
    vibrate(6);
    return true;
  }

  function moveCommandGesture(event) {
    if (!commandGesture || commandGesture.pointerId !== event.pointerId || !simulation) return false;
    commandGesture.point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
    commandGesture.command = classifyCommand(commandGesture.regiment, commandGesture.point);
    return true;
  }

  function endCommandGesture(event, cancelled = false) {
    if (!commandGesture || commandGesture.pointerId !== event.pointerId) return false;
    const gesture = commandGesture;
    if (!cancelled) {
      gesture.point = screenToWorld(battleCanvas, simulation.metrics, event.clientX, event.clientY);
      gesture.command = classifyCommand(gesture.regiment, gesture.point);
      issueCommand(gesture.regiment, gesture.command);
    }
    commandGesture = null;
    battleCanvas.releasePointerCapture?.(event.pointerId);
    return true;
  }

  function drawMarker(ctx, command, alpha = 1) {
    const point = command.point;
    const color = COMMAND_COLORS[command.kind];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(point.x), Math.round(point.y));
    ctx.fillStyle = 'rgba(27,36,31,.82)';
    ctx.fillRect(-15, -15, 30, 30);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-15, -15, 30, 30);
    ctx.fillStyle = color;
    ctx.font = '900 21px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(COMMAND_GLYPHS[command.kind], 0, 1);
    ctx.restore();
  }

  function drawArrowPath(ctx, from, to, color, alpha = 1, dashed = false) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash(dashed ? [11, 8] : [5, 9]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const bend = clamp(dx * .1, -28, 28);
    ctx.quadraticCurveTo((from.x + to.x) / 2 + bend, (from.y + to.y) / 2, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(angle - .55) * 18, to.y - Math.sin(angle - .55) * 18);
    ctx.lineTo(to.x - Math.cos(angle + .55) * 18, to.y - Math.sin(angle + .55) * 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCommandOverlay(sim, ctx, canvas) {
    if (!sim || sim.demo || currentScreen !== 'battle') return;

    for (const regiment of sim.teamRegiments(0)) {
      const state = ensureCommandState(regiment);
      if (state.autonomous || regiment.activeCount() <= 0) continue;
      const center = regiment.center();
      const alpha = regiment === selectedRegiment ? .28 : .13;
      drawArrowPath(ctx, center, state.point, COMMAND_COLORS[state.kind], alpha, false);
      drawMarker(ctx, state, regiment === selectedRegiment ? .66 : .38);
    }

    if (!commandGesture) return;
    const command = commandGesture.command;
    const center = commandGesture.regiment.center();
    const color = COMMAND_COLORS[command.kind];
    drawArrowPath(ctx, center, command.point, color, 1, true);
    drawMarker(ctx, command, 1);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 38, 0, Math.PI * 2);
    ctx.stroke();

    const label = COMMAND_LABELS[command.kind];
    ctx.font = '900 17px system-ui,sans-serif';
    const width = ctx.measureText(label).width + 24;
    const lx = clamp(command.point.x - width / 2, 12, WORLD.width - width - 12);
    const ly = clamp(command.point.y - 52, 18, WORLD.height - 42);
    ctx.fillStyle = 'rgba(27,36,31,.9)';
    ctx.fillRect(lx, ly, width, 31);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + width / 2, ly + 16);
    ctx.restore();
  }

  globalThis.beginCommandGesture = beginCommandGesture;
  globalThis.moveCommandGesture = moveCommandGesture;
  globalThis.endCommandGesture = endCommandGesture;
  globalThis.drawCommandOverlay = drawCommandOverlay;
  globalThis.installCommandUI = installCommandUI;
  globalThis.__RAT_COMMAND_TEST__ = { classifyCommand, issueCommand, ensureCommandState, advanceCommandEconomy, COMMAND_MAX, COMMAND_RECHARGE };

  installCommandUI();
})();
