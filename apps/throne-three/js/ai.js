(function aiFactory(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rules.js"));
  } else {
    root.ThroneAI = factory(root.ThroneRules);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildAi(Rules) {
  const PERSONAS = {
    general: {
      id: "general",
      name: "Генерал",
      motto: "Трон берут строем.",
      statement: "order",
      weights: { pressure: 2.4, bribe: -0.2, calm: -0.3, accuse: 0.5, wait: -0.1, coup: 3.0, coronation: -0.8 }
    },
    merchant: {
      id: "merchant",
      name: "Купец",
      motto: "У каждого принципа есть цена.",
      statement: "wealth",
      weights: { pressure: -0.3, bribe: 2.4, calm: 0.2, accuse: 0.2, wait: 0.1, coup: -0.4, coronation: 0.6 }
    },
    populist: {
      id: "populist",
      name: "Популист",
      motto: "Пусть площадь решит.",
      statement: "people",
      weights: { pressure: -0.4, bribe: -0.3, calm: 2.5, accuse: 0.3, wait: 0.0, coup: -0.8, coronation: 2.0 }
    },
    schemer: {
      id: "schemer",
      name: "Интриган",
      motto: "Правда не нужна, нужен момент.",
      statement: "anticorruption",
      weights: { pressure: 0.1, bribe: 0.1, calm: -0.2, accuse: 2.4, wait: 0.3, coup: 0.3, coronation: 0.2 }
    },
    patient: {
      id: "patient",
      name: "Выжидатель",
      motto: "Ошибку соперник принесёт сам.",
      statement: "neutral",
      weights: { pressure: 0.1, bribe: 0.1, calm: 0.1, accuse: 0.6, wait: 1.8, coup: 0.4, coronation: 0.4 }
    }
  };

  function chooseStatement(state, playerId, personaId = "general") {
    const persona = PERSONAS[personaId] || PERSONAS.general;
    const rival = Rules.opponentOf(playerId);

    if (state.players[rival].marks.corruption >= 2) return "anticorruption";
    if (Rules.fullControlsFaction(state, playerId, "army")) return "order";
    if (Rules.fullControlsFaction(state, playerId, "people")) return "people";
    if (Rules.signedValue(state, playerId, "treasury") >= 2) return "wealth";
    if (persona.id === "patient" && hasAnyBadMark(state.players[playerId])) return "neutral";
    return persona.statement;
  }

  function chooseAction(state, playerId, personaId = "general") {
    const persona = PERSONAS[personaId] || PERSONAS.general;
    const rival = Rules.opponentOf(playerId);
    const prediction = predictOpponentAction(state, rival);
    const actions = Object.keys(Rules.ACTIONS).concat(Rules.getAvailableSpecials(state, playerId));
    const scores = {};

    for (const action of actions) {
      scores[action] = scoreAction(state, playerId, action, persona, prediction);
    }

    avoidOwnSpam(state, playerId, scores);
    punishBadAccusation(state, playerId, prediction, scores);
    defendAgainstThreats(state, playerId, rival, scores);
    chaseWin(state, playerId, scores, prediction);
    addDeterministicNudge(state, persona, scores);

    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  }

  function scoreAction(state, playerId, action, persona, prediction) {
    const player = state.players[playerId];
    const rival = Rules.opponentOf(playerId);
    const weights = persona.weights;
    let score = weights[action] || 0;

    if (action === "pressure") {
      score += needForFaction(state, playerId, "army");
      if (player.statement === "order") score += 0.8;
      if (player.marks.weakness >= 2) score += 1.0;
    }

    if (action === "bribe") {
      score += needForFaction(state, playerId, "treasury");
      if (player.statement === "wealth") score += 0.8;
      if (player.marks.corruption >= 2) score -= 1.4;
      if (state.players[rival].statement === "anticorruption") score -= 1.0;
    }

    if (action === "calm") {
      score += needForFaction(state, playerId, "people");
      if (player.statement === "people") score += 0.8;
      if (Rules.controlsFaction(state, rival, "army")) score -= 0.8;
    }

    if (action === "accuse") {
      score += accuseValue(prediction);
      if (state.players[rival].marks.corruption >= 1) score += 0.8;
      if (player.statement === "anticorruption" && prediction === "bribe") score += 1.2;
      if (player.marks.paranoia >= 2) score -= 1.6;
    }

    if (action === "wait") {
      score += badMarkPressure(player);
      if (prediction === "accuse") score += 2.5;
      if (player.nextBoost > 0) score -= 1.0;
      if (lastTwoSame(player.history, "wait")) score -= 2.2;
    }

    if (action === "coup") {
      score += 5.0;
      if (prediction === "accuse") score -= 4.0;
      if (Rules.controlsFaction(state, rival, "people")) score -= 5.0;
      if (player.marks.tension >= 3) score -= 2.5;
    }

    if (action === "coronation") {
      score += 5.0;
      if (Rules.controlsFaction(state, rival, "army") && (prediction === "pressure" || prediction === "accuse")) score -= 4.5;
    }

    return score;
  }

  function predictOpponentAction(state, opponentId) {
    const history = state.players[opponentId].history || [];
    const last = history[history.length - 1];
    const prev = history[history.length - 2];

    if (last && prev && last === prev) return last;
    if (state.players[opponentId].nextBoost > 0) {
      const bestFaction = bestFactionToPush(state, opponentId);
      if (bestFaction === "army") return "pressure";
      if (bestFaction === "treasury") return "bribe";
      if (bestFaction === "people") return "calm";
    }
    if (state.players[opponentId].marks.corruption >= 2 || state.players[opponentId].marks.tension >= 2) return "wait";
    if (Rules.signedValue(state, opponentId, "treasury") >= 2) return "bribe";
    if (Rules.signedValue(state, opponentId, "army") >= 2) return "pressure";
    if (Rules.signedValue(state, opponentId, "people") >= 2) return "calm";
    return last || "pressure";
  }

  function avoidOwnSpam(state, playerId, scores) {
    const history = state.players[playerId].history || [];
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    if (last && prev && last === prev && scores[last] !== undefined) {
      scores[last] -= 4.0;
    }
  }

  function punishBadAccusation(state, playerId, prediction, scores) {
    if (prediction === "wait") scores.accuse -= 4.0;
    if (state.players[playerId].marks.paranoia >= 2) scores.accuse -= 1.5;
  }

  function defendAgainstThreats(state, playerId, rival, scores) {
    const rivalControls = Object.keys(Rules.FACTIONS).filter((faction) => Rules.controlsFaction(state, rival, faction));
    if (rivalControls.length >= 2) {
      for (const faction of rivalControls) {
        if (faction === "army") scores.pressure += 1.4;
        if (faction === "treasury") scores.bribe += 1.4;
        if (faction === "people") scores.calm += 1.4;
      }
      scores.accuse += 0.7;
    }

    if (Rules.fullControlsFaction(state, rival, "army")) {
      scores.accuse += 1.2;
      scores.calm += 0.6;
    }

    if (Rules.fullControlsFaction(state, rival, "people") && Rules.signedValue(state, rival, "treasury") >= 0) {
      scores.pressure += 1.0;
      scores.accuse += 0.8;
    }
  }

  function chaseWin(state, playerId, scores, prediction) {
    const controlled = Object.keys(Rules.FACTIONS).filter((faction) => Rules.controlsFaction(state, playerId, faction));
    if (controlled.length === 1) {
      const target = bestFactionToPush(state, playerId);
      if (target === "army") scores.pressure += 1.2;
      if (target === "treasury") scores.bribe += 1.2;
      if (target === "people") scores.calm += 1.2;
    }

    if (state.players[playerId].crowns >= 2) {
      scores.wait -= 0.8;
      scores.accuse += prediction === "wait" ? -1.5 : 0.6;
    }
  }

  function needForFaction(state, playerId, faction) {
    const value = Rules.signedValue(state, playerId, faction);
    if (value >= 3) return -0.8;
    if (value === 2) return 0.4;
    if (value === 1) return 1.1;
    if (value === 0) return 1.0;
    if (value < 0) return 1.6;
    return 0;
  }

  function accuseValue(prediction) {
    if (prediction === "bribe") return 3.0;
    if (prediction === "pressure") return 2.1;
    if (prediction === "calm") return 1.4;
    if (prediction === "wait") return -4.0;
    return 0.3;
  }

  function badMarkPressure(player) {
    return Object.values(player.marks).reduce((sum, value) => sum + value * 0.35, 0);
  }

  function hasAnyBadMark(player) {
    return Object.values(player.marks).some((value) => value > 0);
  }

  function lastTwoSame(history, action) {
    return history.length >= 2 && history[history.length - 1] === action && history[history.length - 2] === action;
  }

  function bestFactionToPush(state, playerId) {
    return Object.keys(Rules.FACTIONS)
      .map((faction) => ({ faction, value: Rules.signedValue(state, playerId, faction) }))
      .sort((a, b) => b.value - a.value)[0].faction;
  }

  function addDeterministicNudge(state, persona, scores) {
    Object.keys(scores).forEach((action, index) => {
      const raw = Math.sin((state.turn + 3) * (index + 5) * (persona.id.length + 1));
      scores[action] += raw * 0.18;
    });
  }

  return {
    PERSONAS,
    chooseAction,
    chooseStatement,
    predictOpponentAction
  };
});
