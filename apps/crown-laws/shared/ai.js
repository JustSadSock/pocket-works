import { SLOT_TYPES } from "./game-data.js";
import { cardById, getChampionId, resolveTurn } from "./game-engine.js";

function distanceToThrone(piece) {
  return Math.abs(piece.x - 2) + Math.abs(piece.y - 3);
}

function scoreForPlayer(state, playerId) {
  const enemyId = playerId === "p1" ? "p2" : "p1";
  const ownChampion = state.pieces[getChampionId(playerId)];
  const enemyChampion = state.pieces[getChampionId(enemyId)];
  const throneControl = ownChampion.x === 2 && ownChampion.y === 3 ? 1.5 : 0;
  const thronePressure = 1 / (1 + distanceToThrone(ownChampion));
  const enemyPressure = 1 / (1 + distanceToThrone(enemyChampion));
  const shieldValue = ownChampion.shield ? 0.7 : 0;
  const stunPenalty = ownChampion.stun > 0 ? 1 : 0;
  return (
    state.players[playerId].activeCrowns * 4 +
    throneControl +
    thronePressure +
    Math.max(0, 4 - distanceToThrone(ownChampion)) * 0.35 +
    shieldValue -
    stunPenalty -
    state.players[enemyId].activeCrowns * 3.5 -
    enemyPressure -
    state.players[playerId].sealedCrowns * 1.2
  );
}

function preferenceBoost(profileId, slot) {
  if (profileId === "contender" && slot === "champion") {
    return 1.1;
  }
  if (profileId === "steward" && (slot === "guard" || slot === "priest")) {
    return 1.05;
  }
  if (profileId === "hunter" && (slot === "beast" || slot === "thief")) {
    return 1.1;
  }
  if (profileId === "controller") {
    return slot === "guard" || slot === "thief" ? 1.02 : 1;
  }
  return 1;
}

function slotBias(playerId, slot) {
  const biases = {
    p1: {
      champion: 0.48,
      priest: 0.18,
      guard: 0.08,
      beast: -0.05,
      thief: -0.08
    },
    p2: {
      champion: 0.38,
      beast: 0.16,
      thief: 0.1,
      guard: 0.04,
      priest: -0.04
    }
  };
  return biases[playerId]?.[slot] || 0;
}

function openingBias(state, playerId, slot) {
  const totalCrowns = state.players.p1.activeCrowns + state.players.p2.activeCrowns;
  if (state.turn > 5 || totalCrowns > 0) {
    return 0;
  }

  if (playerId === "p1") {
    return {
      champion: 1.45,
      priest: 0.55,
      guard: 0.15,
      beast: -0.35,
      thief: -0.25
    }[slot] || 0;
  }

  return {
    champion: 0.25,
    priest: 0.95,
    guard: 0.45,
    beast: -0.1,
    thief: -0.2
  }[slot] || 0;
}

function openingCardChoice(state, playerId) {
  const totalCrowns = state.players.p1.activeCrowns + state.players.p2.activeCrowns;
  if (state.turn > 3 || totalCrowns > 0) {
    return null;
  }

  const preferredSlots =
    playerId === "p1"
      ? ["champion", "priest", "guard", "thief", "beast"]
      : ["priest", "champion", "guard", "thief", "beast"];

  for (const slot of preferredSlots) {
    const cardId = state.players[playerId].hand.find((entry) => cardById(entry).slot === slot);
    if (cardId) {
      return cardId;
    }
  }

  return null;
}

function cardUrgency(state, playerId, card) {
  const enemyId = playerId === "p1" ? "p2" : "p1";
  const ownChampion = state.pieces[getChampionId(playerId)];
  const enemyChampion = state.pieces[getChampionId(enemyId)];
  const thief = state.pieces.thief;
  const ownDistance = distanceToThrone(ownChampion);

  switch (card.id) {
    case "champion-intercept-thief":
      return thief.carryingSeal === playerId ? 4 : ownDistance > 2 ? 1.6 : 0.6;
    case "champion-cautious-step":
      return ownDistance > 2 ? 2.7 : 1.2;
    case "champion-claimant-surge":
      return state.players[playerId].activeCrowns < state.players[enemyId].activeCrowns ? 3.2 : ownDistance > 2 ? 2.2 : 1.1;
    case "champion-hold-center":
      return ownDistance <= 1 ? 2.3 : 0.4;
    case "guard-spear-throne":
      return enemyChampion.x === 2 && enemyChampion.y === 3 ? 3 : 0.35;
    case "guard-thief-hunter":
      return thief.carryingSeal ? 2.5 : 0.25;
    case "beast-crown-scent":
      return state.players[enemyId].activeCrowns > state.players[playerId].activeCrowns ? 1.8 : 0.45;
    case "beast-sense-shield":
      return enemyChampion.shield ? 2 : 0.35;
    case "beast-throne-prowl":
      return distanceToThrone(enemyChampion) <= 1 ? 2.2 : 0.25;
    case "priest-remove-stun":
      return ownChampion.stun > 0 ? 4 : 0.7;
    case "priest-throne-blessing":
      return ownChampion.x === 2 && ownChampion.y === 3 ? 2.2 : 0.55;
    case "priest-anti-theft":
      return thief.carryingSeal === playerId ? 3 : 0.6;
    case "thief-pickpocket":
      return state.players[enemyId].activeCrowns > 0 ? 1.8 : 0.35;
    case "thief-secret-pocket":
      return state.players[enemyId].activeCrowns === 0 ? 1.2 : 0.2;
    case "thief-shadow-run":
      return thief.carryingSeal === enemyId ? 2 : 0.7;
    case "thief-false-prey":
      return state.players[enemyId].activeCrowns > state.players[playerId].activeCrowns ? 1.5 : 0.4;
    default:
      return card.slot === "champion" ? (ownDistance > 0 ? 1.9 : 0.7) : 1;
  }
}

export function chooseAiCard(state, playerId = "p2", profileId = "contender") {
  const openingCard = openingCardChoice(state, playerId);
  if (openingCard) {
    return openingCard;
  }

  const enemyId = playerId === "p1" ? "p2" : "p1";
  const hand = state.players[playerId].hand;
  const enemyHand = state.players[enemyId].hand;
  let best = null;

  hand.forEach((cardId) => {
    const card = cardById(cardId);
    const enemyConflictCard = enemyHand.find((enemyCardId) => cardById(enemyCardId).slot === card.slot) || null;
    const enemySafeCard = enemyHand.find((enemyCardId) => cardById(enemyCardId).slot !== card.slot) || enemyHand[0];
    let expectedConflict = 0;
    let scenarios = [enemySafeCard].filter(Boolean);

    if (profileId === "controller" && enemyConflictCard && state.slots[card.slot].activeCardId) {
      expectedConflict = 1.2;
      scenarios = [enemyConflictCard, enemySafeCard].filter(Boolean);
    } else if (enemyConflictCard && enemySafeCard && enemyConflictCard !== enemySafeCard) {
      expectedConflict = -1.4;
      scenarios = [enemySafeCard, enemyConflictCard];
    }

    const scenarioScores = scenarios.map((enemyCardId, index) => {
      const resolution = resolveTurn(state, {
        [playerId]: { cardId },
        [enemyId]: { cardId: enemyCardId }
      });
      const weight = index === 0 ? 0.72 : 0.28;
      return (
        (scoreForPlayer(resolution.state, playerId) +
          (resolution.conflicts.length > 0 && profileId !== "controller" ? -0.45 : 0) +
          resolution.tracker.crownEvents.filter((event) => event.playerId === playerId).length * 1.8 -
          resolution.tracker.crownEvents.filter((event) => event.playerId === enemyId).length * 1.5) *
        weight
      );
    });
    const score =
      scenarioScores.reduce((sum, value) => sum + value, 0) * preferenceBoost(profileId, card.slot) +
      cardUrgency(state, playerId, card) +
      slotBias(playerId, card.slot) +
      openingBias(state, playerId, card.slot) +
      expectedConflict;

    if (!best || score > best.score) {
      best = { cardId, score };
    }
  });

  if (!best) {
    return hand[0];
  }
  return best.cardId;
}
