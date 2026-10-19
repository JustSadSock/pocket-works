(function rulesFactory(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ThroneRules = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildRules() {
  const FACTIONS = {
    army: { label: "Армия", short: "А", tone: "red" },
    treasury: { label: "Казна", short: "К", tone: "gold" },
    people: { label: "Народ", short: "Н", tone: "blue" }
  };

  const ACTIONS = {
    pressure: {
      label: "Давить",
      short: "Давление",
      hint: "Армия +1. Повторы раздражают Народ."
    },
    bribe: {
      label: "Подкупить",
      short: "Подкуп",
      hint: "Казна +1. Опасно против обвинения."
    },
    calm: {
      label: "Успокоить",
      short: "Мир",
      hint: "Народ +1. Сильная вражеская Армия давит в ответ."
    },
    accuse: {
      label: "Обвинить",
      short: "Обвинение",
      hint: "Наказание за предсказуемость. Проваливается против ожидания."
    },
    wait: {
      label: "Ждать",
      short: "Выжидание",
      hint: "Снимает метку, усиливает следующий ход и контрит обвинение."
    }
  };

  const SPECIALS = {
    coup: {
      label: "Переворот",
      short: "Переворот",
      hint: "Победа через полный контроль Армии. Риск против Народa или обвинения."
    },
    coronation: {
      label: "Коронация",
      short: "Коронация",
      hint: "Победа через полный контроль Народа и не вражескую Казну."
    }
  };

  const STATEMENTS = {
    order: {
      label: "Я за порядок",
      short: "Порядок",
      action: "pressure",
      hint: "Давление сильнее, но Народ острее реагирует на жесткость."
    },
    wealth: {
      label: "Я за богатство",
      short: "Богатство",
      action: "bribe",
      hint: "Подкуп сильнее, но Коррупция возникает быстрее."
    },
    people: {
      label: "Я за народ",
      short: "Народ",
      action: "calm",
      hint: "Успокоение сильнее, но Подкуп выглядит токсичнее."
    },
    anticorruption: {
      label: "Я против коррупции",
      short: "Антикоррупция",
      action: "accuse",
      hint: "Обвинение против Подкупа сильнее. Собственный Подкуп почти самоубийственен."
    },
    neutral: {
      label: "Я сохраняю нейтралитет",
      short: "Нейтралитет",
      action: "wait",
      hint: "Меньше бонусов, зато ожидание лучше очищает метки."
    }
  };

  const MARKS = {
    corruption: { label: "Коррупция", short: "Корр." },
    tension: { label: "Напряжение", short: "Напр." },
    weakness: { label: "Слабость", short: "Слаб." },
    paranoia: { label: "Паранойя", short: "Пар." }
  };

  const PLAYER_IDS = ["p1", "p2"];

  function createInitialState(options = {}) {
    return {
      version: 1,
      mode: options.mode || "solo",
      turn: 1,
      factions: {
        army: 0,
        treasury: 0,
        people: 0
      },
      players: {
        p1: createPlayer("p1", options.p1Name || "РРіСЂРѕРє 1"),
        p2: createPlayer("p2", options.p2Name || "РРіСЂРѕРє 2")
      },
      lastCrownAward: [],
      lastReveal: null,
      courtMood: "Трон пустует. Двор ждёт первого жеста.",
      feed: ["Трон пустует. Двор ждёт первого жеста."],
      story: [],
      ended: false,
      winner: null,
      createdAt: Date.now()
    };
  }

  function createPlayer(id, name) {
    return {
      id,
      name,
      crowns: 0,
      marks: {
        corruption: 0,
        tension: 0,
        weakness: 0,
        paranoia: 0
      },
      history: [],
      statement: null,
      statementTurn: 0,
      nextBoost: 0,
      aiPersona: null
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function resolveTurn(inputState, rawChoices) {
    const state = cloneState(inputState);
    if (state.ended) return state;

    const start = cloneState(state);
    const choices = {
      p1: normalizeAction(rawChoices.p1),
      p2: normalizeAction(rawChoices.p2)
    };
    const events = [];

    ensureStatements(state);
    state.lastReveal = {
      turn: state.turn,
      p1: choices.p1,
      p2: choices.p2,
      p1Label: actionLabel(choices.p1),
      p2Label: actionLabel(choices.p2),
      statements: {
        p1: state.players.p1.statement,
        p2: state.players.p2.statement
      }
    };

    if (bothSpecial(choices)) {
      events.push(eventText("Оба претендента потянулись к трону сразу. Двор раскололся, и оба плана сорвались."));
      punishFailedSpecial(state, "p1", choices.p1, events);
      punishFailedSpecial(state, "p2", choices.p2, events);
    } else {
      resolveNormalActions(state, start, choices, events);
      resolveAccusations(state, start, choices, events);
      resolveSpecials(state, start, choices, events);
    }

    for (const playerId of PLAYER_IDS) {
      rememberAction(state, playerId, choices[playerId], events);
      applyStatementConsequences(state, start, playerId, choices[playerId], events);
      applyMarkConsequences(state, playerId, choices[playerId], events);
    }

    state.lastCrownAward = [];

    if (!state.ended) {
      awardCrowns(state, events);
    }

    state.lastEvents = events.slice(0, 12);
    state.courtMood = chooseMood(state, choices, events);
    state.feed = events.map((item) => item.text).concat(state.feed || []).slice(0, 18);
    state.story = (state.story || []).concat([storyLine(state, choices)]).slice(-12);

    if (!state.ended) {
      state.turn += 1;
    }

    return state;
  }

  function resolveNormalActions(state, start, choices, events) {
    const handled = { p1: false, p2: false };

    if (choices.p1 === "pressure" && choices.p2 === "pressure") {
      handled.p1 = true;
      handled.p2 = true;
      addMark(state, "p1", "tension", 1, events, "Обе стороны давили на Армию. Армия не двинулась, но напряжение выросло.");
      addMark(state, "p2", "tension", 1, events, "Обе стороны давили на Армию. Армия не двинулась, но напряжение выросло.");
    }

    if (choices.p1 === "calm" && choices.p2 === "calm") {
      handled.p1 = true;
      handled.p2 = true;
      driftFactionToNeutral(state, "people", 1, events, "Оба успокаивали Народ. Толпа не выбрала сторону и отошла ближе к нейтралитету.");
      removeOneMark(state, "p1", events, "Совместное умиротворение сняло одну метку.");
      removeOneMark(state, "p2", events, "Совместное умиротворение сняло одну метку.");
    }

    if (choices.p1 === "accuse" && choices.p2 === "accuse") {
      handled.p1 = true;
      handled.p2 = true;
      loseFaction(state, "people", "p1", 1, events, "Два обвинения сразу выглядят как паника. Народ отступил от первого игрока.");
      loseFaction(state, "people", "p2", 1, events, "Два обвинения сразу выглядят как паника. Народ отступил от второго игрока.");
      addMark(state, "p1", "paranoia", 1, events, "Двор запомнил паранойю первого игрока.");
      addMark(state, "p2", "paranoia", 1, events, "Двор запомнил паранойю второго игрока.");
    }

    for (const playerId of PLAYER_IDS) {
      if (handled[playerId] || isSpecial(choices[playerId])) continue;
      applyNormalAction(state, start, playerId, choices[playerId], choices[opponentOf(playerId)], events);
    }
  }

  function applyNormalAction(state, start, playerId, action, opponentAction, events) {
    const player = state.players[playerId];
    const boost = player.nextBoost || 0;
    const power = actionPower(state, playerId, action, opponentAction, boost);

    if (action !== "wait") {
      player.nextBoost = 0;
    }

    switch (action) {
      case "pressure": {
        adjustFaction(state, "army", playerId, power, events, `${playerName(state, playerId)} давит на Армию: +${power} Армия.`);
        if (previousAction(start, playerId) === "pressure") {
          loseFaction(state, "people", playerId, 1, events, "Народ устал от повторного давления.");
        }
        if (power > 1) {
          addMark(state, playerId, "tension", 1, events, "Сильное давление подняло Напряжение.");
        }
        break;
      }
      case "bribe": {
        adjustFaction(state, "treasury", playerId, power, events, `${playerName(state, playerId)} покупает Казну: +${power} Казна.`);
        if (signedValue(start, playerId, "treasury") >= 2 || power > 1) {
          addMark(state, playerId, "corruption", 1, events, "Слишком удобная Казна пахнет Коррупцией.");
        }
        break;
      }
      case "calm": {
        adjustFaction(state, "people", playerId, power, events, `${playerName(state, playerId)} успокаивает Народ: +${power} Народ.`);
        const rival = opponentOf(playerId);
        if (controlsFaction(start, rival, "army")) {
          adjustFaction(state, "army", rival, 1, events, "Сильная вражеская Армия счла мирный жест слабостью: соперник получил +1 Армия.");
          addMark(state, playerId, "weakness", 1, events, "Мирный жест под чужими копьями оставил метку Слабость.");
        }
        break;
      }
      case "wait": {
        removeOneMark(state, playerId, events, `${playerName(state, playerId)} выжидает и снимает одну метку.`);
        player.nextBoost = Math.min(2, (player.nextBoost || 0) + 1);
        events.push(eventText(`${playerName(state, playerId)} усилил следующий приказ на +1.`));
        if (player.statement === "neutral") {
          removeOneMark(state, playerId, events, "Нейтральная позиция помогла снять ещё одну метку.");
        }
        break;
      }
      case "accuse":
        break;
      default:
        events.push(eventText(`${playerName(state, playerId)} растерялся. Двор молчит.`));
    }
  }

  function resolveAccusations(state, start, choices, events) {
    for (const accuser of PLAYER_IDS) {
      if (choices[accuser] !== "accuse") continue;
      const target = opponentOf(accuser);
      if (choices[target] === "accuse") continue;

      const targetAction = choices[target];
      const accuserPlayer = state.players[accuser];
      const boost = accuserPlayer.nextBoost || 0;
      const power = actionPower(state, accuser, "accuse", targetAction, boost);
      accuserPlayer.nextBoost = 0;

      if (targetAction === "wait") {
        addMark(state, accuser, "paranoia", 1, events, "Обвинение ударило в пустоту: выжидание полностью его погасило.");
        if (state.players[accuser].marks.paranoia >= 2) {
          loseFaction(state, "people", accuser, 1, events, "Народ всё чаще видит не правду, а Паранойю.");
        }
        continue;
      }

      if (targetAction === "bribe") {
        loseFaction(state, "treasury", target, Math.max(1, power), events, "Подкуп пойман на горячем: цель теряет Казну.");
        addMark(state, target, "corruption", state.players[accuser].statement === "anticorruption" ? 2 : 1, events, "Обвинение усилило Коррупцию цели.");
        continue;
      }

      if (targetAction === "pressure") {
        loseFaction(state, "people", target, Math.max(1, power), events, "Давление выставили жестокостью: цель теряет Народ.");
        addMark(state, target, "tension", 1, events, "После обвинения давление стало выглядеть опаснее.");
        continue;
      }

      if (targetAction === "calm") {
        adjustFaction(state, "army", accuser, Math.max(1, power), events, "Мирный жест назвали слабостью: обвиняющий получает Армию.");
        addMark(state, target, "weakness", 1, events, "Обвинённый миротворец получил метку Слабость.");
        continue;
      }

      if (isSpecial(targetAction)) {
        addMark(state, target, "paranoia", 1, events, "Обвинение сорвало часть доверия к рискованному плану.");
      }
    }
  }

  function resolveSpecials(state, start, choices, events) {
    for (const playerId of PLAYER_IDS) {
      const action = choices[playerId];
      if (!isSpecial(action) || state.ended) continue;
      if (action === "coup") {
        resolveCoup(state, start, playerId, choices[opponentOf(playerId)], events);
      } else if (action === "coronation") {
        resolveCoronation(state, start, playerId, choices[opponentOf(playerId)], events);
      }
    }
  }

  function resolveCoup(state, start, playerId, opponentAction, events) {
    const rival = opponentOf(playerId);
    const accused = opponentAction === "accuse" && state.players[rival].marks.paranoia < 2;
    const strongPeople = controlsFaction(start, rival, "people");
    const tooTense = state.players[playerId].marks.tension >= 3 && signedValue(start, playerId, "people") <= 0;

    if (!fullControlsFaction(start, playerId, "army") || accused || strongPeople || tooTense) {
      events.push(eventText(`${playerName(state, playerId)} попытался совершить переворот, но двор не пошёл за копьями.`));
      punishFailedSpecial(state, playerId, "coup", events);
      return;
    }

    setWinner(state, playerId, "coup", "Переворот", events);
  }

  function resolveCoronation(state, start, playerId, opponentAction, events) {
    const rival = opponentOf(playerId);
    const rivalArmy = controlsFaction(start, rival, "army");
    const activeDisrupt = opponentAction === "pressure" || opponentAction === "accuse" || fullControlsFaction(start, rival, "army");

    if (!fullControlsFaction(start, playerId, "people") || signedValue(start, playerId, "treasury") < 0 || (rivalArmy && activeDisrupt)) {
      events.push(eventText(`${playerName(state, playerId)} начал коронацию, но церемонию сорвали.`));
      punishFailedSpecial(state, playerId, "coronation", events);
      if (rivalArmy) {
        adjustFaction(state, "army", rival, 1, events, "Соперник использовал Армию, чтобы сорвать церемонию.");
      }
      return;
    }

    setWinner(state, playerId, "coronation", "Коронация", events);
  }

  function punishFailedSpecial(state, playerId, action, events) {
    if (action === "coup") {
      loseFaction(state, "army", playerId, 2, events, "Провал переворота ломает лояльность Армии.");
      loseFaction(state, "people", playerId, 1, events, "Народ пугается сорвавшегося переворота.");
      addMark(state, playerId, "tension", 1, events, "После провала остаётся Напряжение.");
      addMark(state, playerId, "weakness", 1, events, "Неудачный удар выглядит слабостью.");
    }
    if (action === "coronation") {
      loseFaction(state, "people", playerId, 2, events, "Провал коронации ранит доверие Народа.");
      addMark(state, playerId, "weakness", 1, events, "Сорванная церемония выглядит слабостью.");
      addMark(state, playerId, "paranoia", 1, events, "После сорванной коронации двор ищет предателей.");
    }
  }

  function applyStatementConsequences(state, start, playerId, action, events) {
    const statement = state.players[playerId].statement;
    if (!statement || isSpecial(action)) return;

    if (statement === "order" && action === "pressure" && previousAction(start, playerId) === "pressure") {
      loseFaction(state, "people", playerId, 1, events, "Заявление о порядке сделало повторное давление ещё грубее для Народа.");
    }

    if (statement === "order" && (action === "calm" || action === "wait")) {
      addMark(state, playerId, "weakness", 1, events, "После слов о порядке осторожность выглядит слабостью.");
    }

    if (statement === "wealth" && action === "bribe") {
      addMark(state, playerId, "corruption", 1, events, "Курс на богатство усилил подозрения в Коррупции.");
    }

    if (statement === "people" && action === "bribe") {
      addMark(state, playerId, "corruption", 1, events, "Подкуп после слов о Народе выглядит особенно токсично.");
      loseFaction(state, "people", playerId, 1, events, "Народ не любит подкуп от своего защитника.");
    }

    if (statement === "people" && action === "pressure") {
      loseFaction(state, "people", playerId, 1, events, "Давление противоречит обещанию стоять за Народ.");
    }

    if (statement === "anticorruption" && action === "bribe") {
      addMark(state, playerId, "corruption", 2, events, "Антикоррупционная речь и Подкуп вместе взрывают доверие.");
      loseFaction(state, "people", playerId, 1, events, "Народ видит лицемерие.");
    }
  }

  function applyMarkConsequences(state, playerId, action, events) {
    const player = state.players[playerId];
    if (player.marks.corruption >= 3) {
      loseFaction(state, "people", playerId, 1, events, "Коррупция стала слишком заметной: Народ отходит.");
      player.marks.corruption = Math.max(2, player.marks.corruption - 1);
    }

    if (player.marks.weakness >= 2 && action !== "pressure" && signedValue(state, playerId, "army") > 0) {
      loseFaction(state, "army", playerId, 1, events, "Слабость расшатывает лояльность Армии.");
    }

    if (player.marks.tension >= 3 && action !== "coup") {
      loseFaction(state, "people", playerId, 1, events, "Напряжение пугает улицы.");
      player.marks.tension = Math.max(2, player.marks.tension - 1);
    }
  }

  function rememberAction(state, playerId, action, events) {
    const player = state.players[playerId];
    player.history.push(action);
    player.history = player.history.slice(-3);

    if (player.history.length < 3) return;
    const same = player.history.every((item) => item === player.history[0]);
    if (!same) return;

    switch (action) {
      case "pressure":
        loseFaction(state, "people", playerId, 1, events, "Третий раз давить подряд: Народ уходит от игрока.");
        addMark(state, playerId, "tension", 1, events, "Повторное давление закрепило Напряжение.");
        break;
      case "bribe":
        addMark(state, playerId, "corruption", 2, events, "Третий Подкуп подряд резко усилил Коррупцию.");
        break;
      case "calm":
        loseFaction(state, "army", playerId, 1, events, "Третье Успокоение подряд: Армия считает игрока слабым.");
        addMark(state, playerId, "weakness", 1, events, "Армия видит Слабость.");
        break;
      case "accuse":
        addMark(state, playerId, "paranoia", 2, events, "Третье Обвинение подряд стало выглядеть как Паранойя.");
        break;
      case "wait":
        driftPlayerInfluenceToNeutral(state, playerId, 1, events, "Третье Ожидание подряд: фракции уходят к нейтралитету.");
        break;
      default:
        break;
    }
  }

  function awardCrowns(state, events) {
    const awarded = PLAYER_IDS
      .map((playerId) => ({
        playerId,
        controlled: Object.keys(FACTIONS).filter((faction) => controlsFaction(state, playerId, faction))
      }))
      .filter((entry) => entry.controlled.length >= 2);

    if (!awarded.length) return;

    for (const entry of awarded) {
      state.players[entry.playerId].crowns += 1;
      state.lastCrownAward.push(entry.playerId);
      events.push({
        type: "crown",
        player: entry.playerId,
        controlled: entry.controlled.slice(),
        text: `${playerName(state, entry.playerId)} получает корону.`
      });
    }

    resetFactionsAfterCrown(state, events);

    for (const entry of awarded) {
      if (state.players[entry.playerId].crowns >= 3) {
        setWinner(state, entry.playerId, "crowns", "Три короны", events);
        return;
      }
    }
  }

  function resetFactionsAfterCrown(state, events) {
    let moved = false;
    for (const faction of Object.keys(FACTIONS)) {
      const before = state.factions[faction];
      if (before === 0) continue;
      state.factions[faction] = 0;
      moved = true;
      events.push({
        type: "faction",
        faction,
        before,
        after: 0,
        delta: -before,
        text: `${FACTIONS[faction].label} вернулась в центр.`
      });
    }
    if (moved) {
      events.push(eventText("Баланс снова в центре."));
    }
  }

  function actionPower(state, playerId, action, opponentAction, boost = 0) {
    let power = 1 + boost;
    const player = state.players[playerId];

    if (player.statement === "order" && action === "pressure") power += 1;
    if (player.statement === "wealth" && action === "bribe") power += 1;
    if (player.statement === "people" && action === "calm") power += 1;
    if (player.statement === "anticorruption" && action === "accuse" && opponentAction === "bribe") power += 1;

    if (action === "accuse" && player.marks.paranoia >= 2) power -= 1;
    if (action === "accuse" && player.marks.paranoia >= 3) power -= 1;

    return Math.max(action === "accuse" ? 0 : 1, Math.min(3, power));
  }

  function adjustFaction(state, faction, playerId, amount, events, text) {
    const before = state.factions[faction];
    const after = clamp(before + directionOf(playerId) * amount, -3, 3);
    state.factions[faction] = after;
    if (after !== before && events) {
      events.push({
        type: "faction",
        player: playerId,
        faction,
        before,
        after,
        delta: after - before,
        text
      });
    } else if (events && text) {
      events.push(eventText(`${text} Но шкала уже упёрлась в край.`));
    }
  }

  function loseFaction(state, faction, playerId, amount, events, text) {
    adjustFaction(state, faction, playerId, -Math.abs(amount), events, text);
  }

  function driftFactionToNeutral(state, faction, amount, events, text) {
    const before = state.factions[faction];
    let after = before;
    for (let i = 0; i < amount; i += 1) {
      if (after > 0) after -= 1;
      else if (after < 0) after += 1;
    }
    state.factions[faction] = after;
    if (before !== after) {
      events.push({ type: "faction", faction, before, after, delta: after - before, text });
    } else {
      events.push(eventText(text));
    }
  }

  function driftPlayerInfluenceToNeutral(state, playerId, amount, events, text) {
    let moved = false;
    for (const faction of Object.keys(FACTIONS)) {
      if (signedValue(state, playerId, faction) > 0) {
        adjustFaction(state, faction, playerId, -amount, events, text);
        moved = true;
      }
    }
    if (!moved) events.push(eventText(text));
  }

  function addMark(state, playerId, mark, amount, events, text) {
    const marks = state.players[playerId].marks;
    const before = marks[mark] || 0;
    marks[mark] = clamp(before + amount, 0, 3);
    if (events && marks[mark] !== before) {
      events.push({ type: "mark", player: playerId, mark, before, after: marks[mark], text });
    }
  }

  function removeOneMark(state, playerId, events, text) {
    const order = ["corruption", "tension", "weakness", "paranoia"];
    const marks = state.players[playerId].marks;
    let target = order.find((mark) => marks[mark] > 0);
    if (!target) {
      if (events && text) events.push(eventText(`${text} Меток уже нет.`));
      return false;
    }
    const before = marks[target];
    marks[target] = Math.max(0, marks[target] - 1);
    if (events) {
      events.push({
        type: "mark",
        player: playerId,
        mark: target,
        before,
        after: marks[target],
        text: `${text} Снята метка: ${MARKS[target].label}.`
      });
    }
    return true;
  }

  function setWinner(state, playerId, method, label, events) {
    state.ended = true;
    state.winner = {
      player: playerId,
      name: playerName(state, playerId),
      method,
      label,
      turn: state.turn
    };
    events.push(eventText(`${playerName(state, playerId)} забирает трон. Способ: ${label}.`));
  }

  function setStatement(state, playerId, statement) {
    if (!STATEMENTS[statement]) return state;
    state.players[playerId].statement = statement;
    state.players[playerId].statementTurn = state.turn;
    return state;
  }

  function ensureStatements(state) {
    for (const playerId of PLAYER_IDS) {
      if (needsStatement(state, playerId)) {
        setStatement(state, playerId, "neutral");
      }
    }
  }

  function needsStatement(state, playerId) {
    return isStatementTurn(state.turn) && state.players[playerId].statementTurn !== state.turn;
  }

  function isStatementTurn(turn) {
    return (turn - 1) % 3 === 0;
  }

  function getAvailableSpecials(state, playerId) {
    if (state.ended) return [];
    const specials = [];
    if (fullControlsFaction(state, playerId, "army")) specials.push("coup");
    if (fullControlsFaction(state, playerId, "people") && signedValue(state, playerId, "treasury") >= 0) {
      specials.push("coronation");
    }
    return specials;
  }

  function isActionAvailable(state, playerId, action) {
    if (ACTIONS[action]) return true;
    return getAvailableSpecials(state, playerId).includes(action);
  }

  function controlsFaction(state, playerId, faction) {
    return signedValue(state, playerId, faction) >= 2;
  }

  function fullControlsFaction(state, playerId, faction) {
    return signedValue(state, playerId, faction) >= 3;
  }

  function signedValue(state, playerId, faction) {
    return state.factions[faction] * directionOf(playerId);
  }

  function directionOf(playerId) {
    return playerId === "p1" ? 1 : -1;
  }

  function opponentOf(playerId) {
    return playerId === "p1" ? "p2" : "p1";
  }

  function playerName(state, playerId) {
    return state.players[playerId] ? state.players[playerId].name : playerId;
  }

  function previousAction(state, playerId) {
    const history = state.players[playerId].history || [];
    return history[history.length - 1] || null;
  }

  function normalizeAction(choice) {
    if (typeof choice === "string") return choice;
    if (choice && typeof choice.action === "string") return choice.action;
    return "wait";
  }

  function isSpecial(action) {
    return Boolean(SPECIALS[action]);
  }

  function bothSpecial(choices) {
    return isSpecial(choices.p1) && isSpecial(choices.p2);
  }

  function actionLabel(action) {
    return (ACTIONS[action] && ACTIONS[action].label) || (SPECIALS[action] && SPECIALS[action].label) || "Неизвестно";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function eventText(text) {
    return { type: "text", text };
  }

  function chooseMood(state, choices) {
    if (state.winner) {
      return `Трон занят. ${state.winner.name} победил через ${state.winner.label}.`;
    }

    if (choices.p1 === "wait" && choices.p2 === "wait") {
      return "Оба игрока слишком осторожны. Двор прислушивается к тишине.";
    }

    const absArmy = Math.abs(state.factions.army);
    const absTreasury = Math.abs(state.factions.treasury);
    const absPeople = Math.abs(state.factions.people);

    if (absArmy === 3) return "Армия ждёт повода для переворота.";
    if (absPeople === 3 && Math.abs(state.factions.treasury) <= 1) return "Трон близко, но коронация ещё может сорваться.";
    if (absTreasury >= 2) return "Двор шепчет: казна почти куплена.";

    const paranoid = PLAYER_IDS.some((id) => state.players[id].marks.paranoia >= 2);
    const corrupt = PLAYER_IDS.some((id) => state.players[id].marks.corruption >= 2);
    const tense = PLAYER_IDS.some((id) => state.players[id].marks.tension >= 2);

    if (paranoid) return "Обвинения начинают выглядеть как паранойя.";
    if (corrupt) return "Народ слышит звон монет и морщится.";
    if (tense) return "Армия точит копья, но двор боится искры.";
    if (absPeople >= 2) return "Народ уже почти выбрал, кому верить.";

    return "Двор шепчет, но трон пока никому не кланяется.";
  }

  function storyLine(state, choices) {
    const p1 = actionLabel(choices.p1);
    const p2 = actionLabel(choices.p2);
    return `Ход ${state.turn}: ${state.players.p1.name} - ${p1}, ${state.players.p2.name} - ${p2}. ${state.courtMood}`;
  }

  return {
    FACTIONS,
    ACTIONS,
    SPECIALS,
    STATEMENTS,
    MARKS,
    PLAYER_IDS,
    createInitialState,
    cloneState,
    resolveTurn,
    setStatement,
    needsStatement,
    isStatementTurn,
    getAvailableSpecials,
    isActionAvailable,
    controlsFaction,
    fullControlsFaction,
    signedValue,
    directionOf,
    opponentOf,
    playerName,
    actionLabel,
    isSpecial,
    clamp
  };
});


