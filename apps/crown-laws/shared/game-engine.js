import {
  BASE_LAWS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_BY_ID,
  GUARD_PATROL,
  LAW_CARDS,
  PLAYER_ORDER,
  SLOT_TYPES,
  STARTING_PIECES,
  THRONE
} from "./game-data.js";

function clone(value) {
  return structuredClone(value);
}

function hashSeed(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return function random() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed) {
  return mulberry32(hashSeed(seed)());
}

function shuffle(array, random) {
  const list = [...array];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function keyOf(pos) {
  return `${pos.x},${pos.y}`;
}

export function inBounds(pos) {
  return pos.x >= 0 && pos.y >= 0 && pos.x < BOARD_WIDTH && pos.y < BOARD_HEIGHT;
}

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAdjacent(a, b) {
  return distance(a, b) === 1;
}

export function coordLabel({ x, y }) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function byId(state, id) {
  return state.pieces[id];
}

export function getChampionId(playerId) {
  return playerId === "p1" ? "champion_p1" : "champion_p2";
}

function getChampion(state, playerId) {
  return byId(state, getChampionId(playerId));
}

function occupyingPiece(state, x, y, ignoreId = null) {
  return Object.values(state.pieces).find((piece) => piece.id !== ignoreId && piece.x === x && piece.y === y) || null;
}

function occupiedKeys(state, ignoreId = null) {
  const set = new Set();
  Object.values(state.pieces).forEach((piece) => {
    if (piece.id !== ignoreId) {
      set.add(keyOf(piece));
    }
  });
  return set;
}

function orthogonalNeighbors(pos) {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 }
  ].filter(inBounds);
}

function nearestEdgeDistance(pos) {
  return Math.min(pos.x, BOARD_WIDTH - 1 - pos.x, pos.y, BOARD_HEIGHT - 1 - pos.y);
}

function isEdge(pos) {
  return pos.x === 0 || pos.x === BOARD_WIDTH - 1 || pos.y === 0 || pos.y === BOARD_HEIGHT - 1;
}

function slotLaw(state, slot) {
  const activeId = state.slots[slot].activeCardId;
  return activeId ? CARD_BY_ID[activeId] : BASE_LAWS[slot];
}

function dangerScore(state, champion) {
  const guard = byId(state, "guard");
  const beast = byId(state, "beast");
  return Math.min(distance(champion, guard), 4) + Math.min(distance(champion, beast), 4);
}

function getCrowns(state, playerId) {
  return state.players[playerId].activeCrowns;
}

function getLeaderId(state) {
  const p1 = getCrowns(state, "p1");
  const p2 = getCrowns(state, "p2");
  if (state.priorityFlip > 0) {
    if (p1 !== p2) {
      return p1 < p2 ? "p1" : "p2";
    }
  } else if (p1 !== p2) {
    return p1 > p2 ? "p1" : "p2";
  }
  const c1 = getChampion(state, "p1");
  const c2 = getChampion(state, "p2");
  return distance(c1, THRONE) <= distance(c2, THRONE) ? "p1" : "p2";
}

function getTrailingId(state) {
  return getLeaderId(state) === "p1" ? "p2" : "p1";
}

function record(logs, phase, text, meta = {}) {
  logs.push({ phase, text, ...meta });
}

function distanceToTargets(pos, targets) {
  return Math.min(...targets.map((target) => distance(pos, target)));
}

function isNeutralOnThrone(state) {
  return Object.values(state.pieces).some(
    (piece) => piece.kind !== "champion" && piece.x === THRONE.x && piece.y === THRONE.y
  );
}

function throneApproachTargets(state) {
  return isNeutralOnThrone(state) ? targetCellsAround(THRONE) : [THRONE];
}

function pathTravelScore(node) {
  return node.path.length - 1 + node.safePenalty * 0.8;
}

function findPath(state, start, targetCells, options = {}) {
  const {
    ignoreId = null,
    avoidAdjacentTo = [],
    forbidAdjacentTo = [],
    stopAtAdjacent = false
  } = options;
  const targets = new Set(targetCells.map(keyOf));
  const occupied = occupiedKeys(state, ignoreId);
  occupied.delete(keyOf(start));
  const queue = [{ pos: start, path: [start], safePenalty: 0 }];
  const seen = new Map([[keyOf(start), 0]]);
  let best = null;
  let fallback = {
    pos: start,
    path: [start],
    safePenalty: 0,
    targetDistance: distanceToTargets(start, targetCells)
  };

  while (queue.length) {
    const node = queue.shift();
    const nodeTargetDistance = distanceToTargets(node.pos, targetCells);
    if (
      nodeTargetDistance < fallback.targetDistance ||
      (nodeTargetDistance === fallback.targetDistance &&
        pathTravelScore(node) < pathTravelScore(fallback)) ||
      (nodeTargetDistance === fallback.targetDistance &&
        pathTravelScore(node) === pathTravelScore(fallback) &&
        node.safePenalty < fallback.safePenalty)
    ) {
      fallback = {
        ...node,
        targetDistance: nodeTargetDistance
      };
    }

    const atTarget = stopAtAdjacent
      ? targetCells.some((target) => isAdjacent(node.pos, target))
      : targets.has(keyOf(node.pos));
    if (atTarget) {
      if (
        !best ||
        pathTravelScore(node) < pathTravelScore(best) ||
        (pathTravelScore(node) === pathTravelScore(best) && node.safePenalty < best.safePenalty)
      ) {
        best = node;
      }
      continue;
    }

    orthogonalNeighbors(node.pos)
      .sort((a, b) => distanceToTargets(a, targetCells) - distanceToTargets(b, targetCells))
      .forEach((neighbor) => {
        const occupiedHere = occupied.has(keyOf(neighbor));
        const forbidden = forbidAdjacentTo.some((danger) => isAdjacent(neighbor, danger));
        if (occupiedHere || forbidden) {
          return;
        }
        const penalty = avoidAdjacentTo.reduce((acc, danger) => acc + (isAdjacent(neighbor, danger) ? 1 : 0), 0);
        const nextScore = node.path.length + (node.safePenalty + penalty) * 0.8;
        const knownPenalty = seen.get(keyOf(neighbor));
        if (knownPenalty !== undefined && knownPenalty <= nextScore) {
          return;
        }
        seen.set(keyOf(neighbor), nextScore);
        queue.push({
          pos: neighbor,
          path: [...node.path, neighbor],
          safePenalty: node.safePenalty + penalty
        });
      });
  }

  return best ? best.path : fallback.path;
}

function movePiece(state, pieceId, target, logs, phase, reason, tracker) {
  const piece = byId(state, pieceId);
  if (!piece || !inBounds(target)) {
    return false;
  }
  if (piece.x === target.x && piece.y === target.y) {
    return false;
  }
  if (occupyingPiece(state, target.x, target.y, pieceId)) {
    return false;
  }
  const from = { x: piece.x, y: piece.y };
  piece.x = target.x;
  piece.y = target.y;
  tracker.moved.add(pieceId);
  tracker.movementTimeline.push({ pieceId, from, to: { x: target.x, y: target.y }, phase });
  record(logs, phase, `${pieceTitle(piece)} идет ${coordLabel(from)} -> ${coordLabel(piece)}.`, { kind: "move", pieceId, reason });
  return true;
}

function pieceTitle(piece) {
  if (piece.kind === "champion") {
    return piece.owner === "p1" ? "Чемпион Севера" : "Чемпион Юга";
  }
  return {
    guard: "Стражник",
    priest: "Жрец",
    beast: "Зверь",
    thief: "Вор"
  }[piece.kind];
}

function pushPiece(state, pieceId, fromPos, logs, phase, tracker, options = {}) {
  const piece = byId(state, pieceId);
  const dx = Math.sign(piece.x - fromPos.x);
  const dy = Math.sign(piece.y - fromPos.y);
  const target = { x: piece.x + dx, y: piece.y + dy };
  const pushBlocked = !inBounds(target) || occupyingPiece(state, target.x, target.y, pieceId);
  if (!pushBlocked) {
    const from = { x: piece.x, y: piece.y };
    piece.x = target.x;
    piece.y = target.y;
    tracker.pushed.add(pieceId);
    tracker.movementTimeline.push({ pieceId, from, to: target, phase, style: "push" });
    record(logs, phase, `${pieceTitle(piece)} оттолкнут ${coordLabel(from)} -> ${coordLabel(target)}.`, { kind: "push", pieceId });
  } else {
    record(logs, phase, `${pieceTitle(piece)} упирается в край или фигуру и не смещается.`, { kind: "push-block", pieceId });
  }

  if (piece.kind === "thief" && piece.carryingSeal && (options.forceDrop || !pushBlocked)) {
    dropSeal(state, logs, phase, tracker, `${pieceTitle(piece)} роняет печать.`);
  }
}

function holyZoneActiveFor(state, champion) {
  if (slotLaw(state, "priest").id !== "priest-holy-zone") {
    return false;
  }
  return isAdjacent(byId(state, "priest"), champion);
}

function throneBlessingApplies(state, championId, tracker) {
  const champion = byId(state, championId);
  return (
    slotLaw(state, "priest").id === "priest-throne-blessing" &&
    champion.shield &&
    champion.x === THRONE.x &&
    champion.y === THRONE.y &&
    !tracker.throneBlessingSpent.has(championId)
  );
}

function attackChampion(state, attackerId, championId, logs, phase, tracker, options = {}) {
  const attacker = byId(state, attackerId);
  const champion = byId(state, championId);

  if (throneBlessingApplies(state, championId, tracker)) {
    champion.shield = false;
    tracker.throneBlessingSpent.add(championId);
    record(logs, phase, `${pieceTitle(champion)} удерживает трон: Щит трескается, но удар гасится благословением.`, { kind: "blessing-break" });
    return;
  }

  if (attacker.kind === "guard") {
    if (champion.shield) {
      record(logs, phase, `${pieceTitle(champion)} удерживает удар Стражника Щитом.`, { kind: "shield-block" });
      return;
    }
    pushPiece(state, championId, attacker, logs, phase, tracker);
    return;
  }

  if (attacker.kind === "champion") {
    if (champion.shield) {
      record(logs, phase, `${pieceTitle(champion)} удерживает толчок в дуэли за счет Щита.`, { kind: "shield-block" });
      return;
    }
    pushPiece(state, championId, attacker, logs, phase, tracker);
    champion.stun = Math.max(champion.stun, 2);
    record(logs, phase, `${pieceTitle(champion)} оглушен после дуэли наследников.`, { kind: "stun" });
    return;
  }

  if (attacker.kind === "beast") {
    if (champion.shield) {
      champion.shield = false;
      if (options.breakShieldOnly) {
        record(logs, phase, `${pieceTitle(champion)} теряет Щит, но избегает оглушения.`, { kind: "shield-break" });
      } else {
        record(logs, phase, `${pieceTitle(champion)} теряет Щит под ударом Зверя.`, { kind: "shield-break" });
      }
      pushPiece(state, championId, attacker, logs, phase, tracker);
      return;
    }
    pushPiece(state, championId, attacker, logs, phase, tracker);
    if (!holyZoneActiveFor(state, champion) && !options.noStun) {
      champion.stun = Math.max(champion.stun, 2);
      record(logs, phase, `${pieceTitle(champion)} оглушен ударом Зверя.`, { kind: "stun" });
    } else {
      record(logs, phase, `${pieceTitle(champion)} удерживает разум и не оглушается.`, { kind: "stun-negated" });
    }
  }
}

function attackThief(state, attackerId, logs, phase, tracker, reason = "") {
  const thief = byId(state, "thief");
  pushPiece(state, "thief", byId(state, attackerId), logs, phase, tracker, { forceDrop: true });
  record(logs, phase, `${pieceTitle(byId(state, attackerId))} срывает план Вора. ${reason}`.trim(), { kind: "thief-hit" });
}

function attackSupportUnit(state, attackerId, targetId, logs, phase, tracker) {
  pushPiece(state, targetId, byId(state, attackerId), logs, phase, tracker);
}

function returnSeal(state, ownerId, logs, phase, tracker, text) {
  const thief = byId(state, "thief");
  if (thief.carryingSeal !== ownerId) {
    return false;
  }
  thief.carryingSeal = null;
  state.players[ownerId].sealedCrowns = Math.max(0, state.players[ownerId].sealedCrowns - 1);
  state.players[ownerId].activeCrowns += 1;
  tracker.sealEvents.push({ ownerId, kind: "return" });
  record(logs, phase, text || `Печать возвращается ${ownerId === "p1" ? "Чемпиону Севера" : "Чемпиону Юга"}.`, { kind: "seal-return", ownerId });
  return true;
}

function dropSeal(state, logs, phase, tracker, text) {
  const thief = byId(state, "thief");
  if (!thief.carryingSeal) {
    return false;
  }
  return returnSeal(state, thief.carryingSeal, logs, phase, tracker, text || "Вор роняет печать, и она возвращается владельцу.");
}

function stealSeal(state, ownerId, logs, phase, tracker, text) {
  const thief = byId(state, "thief");
  if (thief.carryingSeal || state.players[ownerId].activeCrowns <= 0) {
    return false;
  }
  thief.carryingSeal = ownerId;
  state.players[ownerId].activeCrowns -= 1;
  state.players[ownerId].sealedCrowns += 1;
  tracker.sealEvents.push({ ownerId, kind: "steal" });
  record(logs, phase, text || `Вор крадет печать короны у ${ownerId === "p1" ? "Чемпиона Севера" : "Чемпиона Юга"}.`, { kind: "seal-steal", ownerId });
  return true;
}

function escapeSeal(state, logs, phase, tracker) {
  const thief = byId(state, "thief");
  if (!thief.carryingSeal || !isEdge(thief)) {
    return false;
  }
  const ownerId = thief.carryingSeal;
  thief.carryingSeal = null;
  state.players[ownerId].sealedCrowns = Math.max(0, state.players[ownerId].sealedCrowns - 1);
  state.players[ownerId].lostCrowns += 1;
  tracker.sealEvents.push({ ownerId, kind: "lost" });
  record(logs, phase, `Вор уносит печать к краю поля. Корона ${ownerId === "p1" ? "Севера" : "Юга"} потеряна окончательно.`, { kind: "seal-lost", ownerId });
  return true;
}

function drawOne(player, seed) {
  if (player.deck.length === 0 && player.discard.length > 0) {
    const random = seededRandom(`${seed}-${player.id}-${player.reshuffles}`);
    player.deck = shuffle(player.discard, random);
    player.discard = [];
    player.reshuffles += 1;
  }
  if (player.deck.length > 0) {
    player.hand.push(player.deck.shift());
  }
}

function targetCellsAround(target) {
  return orthogonalNeighbors(target);
}

function findNearestOpenCell(state, anchor, ignoreId = null) {
  const queue = [anchor];
  const seen = new Set([keyOf(anchor)]);

  while (queue.length) {
    const current = queue.shift();
    if (!occupyingPiece(state, current.x, current.y, ignoreId)) {
      return current;
    }
    orthogonalNeighbors(current)
      .sort((a, b) => distance(a, THRONE) - distance(b, THRONE))
      .forEach((neighbor) => {
        const neighborKey = keyOf(neighbor);
        if (!seen.has(neighborKey)) {
          seen.add(neighborKey);
          queue.push(neighbor);
        }
      });
  }

  return null;
}

function clearThroneNeutrals(state, logs, tracker) {
  const blocker = Object.values(state.pieces).find(
    (piece) => piece.kind !== "champion" && piece.x === THRONE.x && piece.y === THRONE.y
  );
  if (!blocker) {
    return;
  }

  const destination =
    targetCellsAround(THRONE).find((cell) => !occupyingPiece(state, cell.x, cell.y, blocker.id)) ||
    findNearestOpenCell(state, THRONE, blocker.id);

  if (!destination) {
    return;
  }

  const from = { x: blocker.x, y: blocker.y };
  blocker.x = destination.x;
  blocker.y = destination.y;
  tracker.moved.add(blocker.id);
  tracker.movementTimeline.push({
    pieceId: blocker.id,
    from,
    to: destination,
    phase: "throne",
    style: "eject"
  });
  record(logs, "throne", `${pieceTitle(blocker)} уступает трон и вытесняется ${coordLabel(from)} -> ${coordLabel(destination)}.`, {
    kind: "throne-clear",
    pieceId: blocker.id
  });
}

function chooseDangerChampion(state) {
  const p1 = getChampion(state, "p1");
  const p2 = getChampion(state, "p2");
  const p1Score = dangerScore(state, p1);
  const p2Score = dangerScore(state, p2);
  if (p1Score !== p2Score) {
    return p1Score < p2Score ? p1 : p2;
  }
  return getCrowns(state, "p1") <= getCrowns(state, "p2") ? p1 : p2;
}

function choosePriestTarget(state, lawId) {
  if (lawId === "priest-remove-stun") {
    const stunned = PLAYER_ORDER.map((pid) => getChampion(state, pid)).filter((champion) => champion.stun > 0);
    if (stunned.length > 0) {
      stunned.sort((a, b) => distance(byId(state, "priest"), a) - distance(byId(state, "priest"), b));
      return stunned[0];
    }
  }
  if (lawId === "priest-equal-mercy") {
    return chooseDangerChampion(state);
  }
  if (lawId === "priest-anti-theft" && byId(state, "thief").carryingSeal) {
    return getChampion(state, byId(state, "thief").carryingSeal);
  }
  const trailing = getChampion(state, getTrailingId(state));
  const leading = getChampion(state, getLeaderId(state));
  if (getCrowns(state, trailing.owner) !== getCrowns(state, leading.owner)) {
    return trailing;
  }
  return chooseDangerChampion(state);
}

function priestPhase(state, logs, tracker) {
  const law = slotLaw(state, "priest");
  const priest = byId(state, "priest");
  const target = choosePriestTarget(state, law.id);
  const path = findPath(state, priest, targetCellsAround(target), { ignoreId: "priest" });
  movePiece(state, "priest", path[Math.min(1, path.length - 1)], logs, "priest", law.name, tracker);

  if (isAdjacent(priest, target)) {
    if (law.id === "priest-remove-stun" && target.stun > 0) {
      target.stun = 0;
      record(logs, "priest", `${pieceTitle(target)} избавлен от Оглушения.`, { kind: "cleanse" });
      return;
    }
    if (law.id === "priest-anti-theft" && byId(state, "thief").carryingSeal === target.owner) {
      tracker.wardedOwner = target.owner;
      record(logs, "priest", `Жрец готовит возврат печати владельцу в конце хода.`, { kind: "ward" });
      return;
    }
    if (!target.shield) {
      target.shield = true;
      record(logs, "priest", `${pieceTitle(target)} получает Щит.`, { kind: "shield", pieceId: target.id });
    }
  }
}

function championPath(state, champion, lawId) {
  const dangers = [byId(state, "guard"), byId(state, "beast")];
  const options = {
    avoidAdjacentTo: dangers
  };
  if (lawId === "champion-cautious-step") {
    options.forbidAdjacentTo = dangers;
  }
  return findPath(state, champion, throneApproachTargets(state), { ignoreId: champion.id, ...options });
}

function championDesiredSteps(state, lawId) {
  const plans = {
    p1: { steps: [], reason: lawId },
    p2: { steps: [], reason: lawId }
  };
  const thief = byId(state, "thief");
  PLAYER_ORDER.forEach((playerId) => {
    const champion = getChampion(state, playerId);
    if (champion.stun > 0) {
      plans[playerId].skip = "Оглушение";
      return;
    }
    let steps = 1;
    let path = championPath(state, champion, lawId);

    if (lawId === "champion-claimant-surge") {
      const trailingId = getTrailingId(state);
      if (getCrowns(state, "p1") !== getCrowns(state, "p2") && trailingId === playerId) {
        steps = 2;
      }
    }

    if (lawId === "champion-hold-center") {
      if (distance(champion, THRONE) <= 1) {
        plans[playerId].skip = "Удерживает центр";
        return;
      }
    }

    if (lawId === "champion-intercept-thief" && thief.carryingSeal === playerId) {
      if (isAdjacent(champion, thief)) {
        plans[playerId].skip = "Рядом с Вором";
        return;
      }
      path = findPath(state, champion, targetCellsAround(thief), { ignoreId: champion.id });
    }

    plans[playerId].steps = path.slice(1, steps + 1);
  });
  return plans;
}

function resolveChampionMoves(state, lawId, logs, tracker) {
  const plans = championDesiredSteps(state, lawId);
  const rounds = Math.max(plans.p1.steps.length, plans.p2.steps.length);
  for (let round = 0; round < rounds; round += 1) {
    const proposals = PLAYER_ORDER.map((playerId) => ({
      playerId,
      from: { x: getChampion(state, playerId).x, y: getChampion(state, playerId).y },
      to: plans[playerId].steps[round] || null
    })).filter((entry) => entry.to);

    if (proposals.length === 2 && keyOf(proposals[0].to) === keyOf(proposals[1].to)) {
      const p1Crowns = getCrowns(state, "p1");
      const p2Crowns = getCrowns(state, "p2");
      if (p1Crowns === p2Crowns) {
        record(logs, "champion", `Оба чемпиона одновременно рвутся к ${coordLabel(proposals[0].to)}, но сталкиваются и замирают.`, { kind: "clash" });
        continue;
      }
      const winner = p1Crowns < p2Crowns ? "p1" : "p2";
      const loser = winner === "p1" ? "p2" : "p1";
      const winnerProposal = proposals.find((proposal) => proposal.playerId === winner);
      const loserChampion = getChampion(state, loser);
      movePiece(state, winnerProposal.playerId === "p1" ? "champion_p1" : "champion_p2", winnerProposal.to, logs, "champion", lawId, tracker);
      record(logs, "champion", `${pieceTitle(loserChampion)} уступает темп и не успевает занять клетку.`, { kind: "tempo-loss" });
      continue;
    }

    proposals.forEach((proposal) => {
      const championId = getChampionId(proposal.playerId);
      const otherChampion = getChampion(state, proposal.playerId === "p1" ? "p2" : "p1");
      if (otherChampion.x === proposal.to.x && otherChampion.y === proposal.to.y) {
        return;
      }
      movePiece(state, championId, proposal.to, logs, "champion", lawId, tracker);
    });
  }

  PLAYER_ORDER.forEach((playerId) => {
    if (plans[playerId].skip) {
      record(logs, "champion", `${pieceTitle(getChampion(state, playerId))} не двигается: ${plans[playerId].skip}.`, { kind: "hold" });
    }
  });

  if (lawId === "champion-intercept-thief" && byId(state, "thief").carryingSeal) {
    const ownerId = byId(state, "thief").carryingSeal;
    const champion = getChampion(state, ownerId);
    if (isAdjacent(champion, byId(state, "thief"))) {
      returnSeal(state, ownerId, logs, "champion", tracker, `${pieceTitle(champion)} перехватывает Вора и возвращает печать.`);
    }
  }

  if (lawId === "champion-heirs-duel") {
    const c1 = getChampion(state, "p1");
    const c2 = getChampion(state, "p2");
    if (isAdjacent(c1, c2)) {
      const p1Crowns = getCrowns(state, "p1");
      const p2Crowns = getCrowns(state, "p2");
      if (p1Crowns !== p2Crowns) {
        const attackerId = p1Crowns < p2Crowns ? "champion_p1" : "champion_p2";
        const targetId = attackerId === "champion_p1" ? "champion_p2" : "champion_p1";
        attackChampion(state, attackerId, targetId, logs, "champion", tracker);
      }
    }
  }

  if (byId(state, "thief").carryingSeal) {
    const sealOwner = byId(state, "thief").carryingSeal;
    const ownerChampion = getChampion(state, sealOwner);
    if (isAdjacent(ownerChampion, byId(state, "thief"))) {
      returnSeal(state, sealOwner, logs, "champion", tracker, `${pieceTitle(ownerChampion)} вынуждает Вора уронить печать.`);
    }
  }
}

function guardPatrolTarget(state) {
  const index = state.guardPatrolIndex % GUARD_PATROL.length;
  return GUARD_PATROL[(index + 1) % GUARD_PATROL.length];
}

function championClosestToThrone(state) {
  const c1 = getChampion(state, "p1");
  const c2 = getChampion(state, "p2");
  if (distance(c1, THRONE) !== distance(c2, THRONE)) {
    return distance(c1, THRONE) < distance(c2, THRONE) ? c1 : c2;
  }
  return getCrowns(state, "p1") >= getCrowns(state, "p2") ? c1 : c2;
}

function adjacentChampionsTo(piece, state) {
  return PLAYER_ORDER.map((pid) => getChampion(state, pid)).filter((champion) => isAdjacent(piece, champion));
}

function guardPhase(state, logs, tracker) {
  const law = slotLaw(state, "guard");
  const guard = byId(state, "guard");
  const adjacent = adjacentChampionsTo(guard, state);

  if (law.id === "guard-circle-spears") {
    adjacent.forEach((champion) => attackChampion(state, "guard", champion.id, logs, "guard", tracker));
    if (adjacent.length === 0) {
      record(logs, "guard", `Стражник поднимает круг копий, но рядом нет чемпионов.`, { kind: "guard-stance" });
    }
    return;
  }

  if (law.id === "guard-thief-hunter" && byId(state, "thief").carryingSeal) {
    if (isAdjacent(guard, byId(state, "thief"))) {
      attackThief(state, "guard", logs, "guard", tracker, "Печать возвращается владельцу.");
      return;
    }
    const path = findPath(state, guard, targetCellsAround(byId(state, "thief")), { ignoreId: "guard" });
    movePiece(state, "guard", path[Math.min(1, path.length - 1)], logs, "guard", law.name, tracker);
    return;
  }

  if (law.id === "guard-living-wall") {
    const champion = championClosestToThrone(state);
    const between = {
      x: champion.x + Math.sign(THRONE.x - champion.x),
      y: champion.y + Math.sign(THRONE.y - champion.y)
    };
    if (inBounds(between) && !occupyingPiece(state, between.x, between.y, "guard")) {
      const path = findPath(state, guard, [between], { ignoreId: "guard" });
      movePiece(state, "guard", path[Math.min(1, path.length - 1)], logs, "guard", law.name, tracker);
      return;
    }
  }

  if (law.id === "guard-punish-leader") {
    const leader = getChampion(state, getLeaderId(state));
    if (isAdjacent(guard, leader)) {
      attackChampion(state, "guard", leader.id, logs, "guard", tracker);
      return;
    }
    const path = findPath(state, guard, targetCellsAround(leader), { ignoreId: "guard" });
    movePiece(state, "guard", path[Math.min(1, path.length - 1)], logs, "guard", law.name, tracker);
    return;
  }

  if (law.id === "guard-spear-throne") {
    const throneTargets = PLAYER_ORDER.map((pid) => getChampion(state, pid)).filter((champion) => distance(champion, THRONE) <= 1);
    if (throneTargets.length > 0) {
      throneTargets.sort((a, b) => distance(guard, a) - distance(guard, b));
      const target = throneTargets[0];
      if (isAdjacent(guard, target)) {
        attackChampion(state, "guard", target.id, logs, "guard", tracker);
      } else {
        const path = findPath(state, guard, targetCellsAround(target), { ignoreId: "guard" });
        movePiece(state, "guard", path[Math.min(1, path.length - 1)], logs, "guard", law.name, tracker);
      }
      return;
    }
  }

  if (adjacent.length > 0) {
    adjacent.sort((a, b) => distance(a, THRONE) - distance(b, THRONE));
    attackChampion(state, "guard", adjacent[0].id, logs, "guard", tracker);
    return;
  }

  const target = guardPatrolTarget(state);
  const path = findPath(state, guard, [target], { ignoreId: "guard" });
  movePiece(state, "guard", path[Math.min(1, path.length - 1)], logs, "guard", law.name, tracker);
  state.guardPatrolIndex = (state.guardPatrolIndex + 1) % GUARD_PATROL.length;
}

function movedTargets(state, tracker) {
  return Object.values(state.pieces).filter((piece) => tracker.moved.has(piece.id) && piece.id !== "beast");
}

function pushedTargets(state, tracker) {
  return Object.values(state.pieces).filter((piece) => tracker.pushed.has(piece.id) && piece.id !== "beast");
}

function chooseBeastTarget(state, lawId, tracker) {
  const beast = byId(state, "beast");
  const champions = PLAYER_ORDER.map((pid) => getChampion(state, pid));

  if (lawId === "beast-throne-prowl") {
    const aroundThrone = champions.filter((champion) => distance(champion, THRONE) <= 1);
    if (aroundThrone.length > 0) {
      return aroundThrone.sort((a, b) => distance(beast, a) - distance(beast, b))[0];
    }
    return { x: THRONE.x, y: THRONE.y, id: "throne", kind: "zone" };
  }

  if (lawId === "beast-crown-scent") {
    return getChampion(state, getLeaderId(state));
  }

  if (lawId === "beast-sense-shield") {
    const shielded = champions.find((champion) => champion.shield);
    if (shielded) {
      return shielded;
    }
  }

  if (lawId === "beast-noise-hunt") {
    const pushed = pushedTargets(state, tracker);
    if (pushed.length > 0) {
      pushed.sort((a, b) => distance(beast, a) - distance(beast, b));
      if (state.lastBeastChampionHit && pushed[0].id === state.lastBeastChampionHit && pushed[1]) {
        return pushed[1];
      }
      return pushed[0];
    }
  }

  const moved = movedTargets(state, tracker);
  if (moved.length > 0) {
    moved.sort((a, b) => distance(beast, a) - distance(beast, b));
    if (state.lastBeastChampionHit && moved[0].id === state.lastBeastChampionHit && moved[1]) {
      return moved[1];
    }
    return moved[0];
  }

  if (lawId === "base-beast-motion" || lawId === "beast-noise-hunt" || lawId === "beast-hungry-surge") {
    return null;
  }

  champions.sort((a, b) => distance(beast, a) - distance(beast, b));
  if (state.lastBeastChampionHit && champions[0].id === state.lastBeastChampionHit && champions[1]) {
    return champions[1];
  }
  return champions[0];
}

function beastAttack(state, target, lawId, logs, tracker) {
  const beast = byId(state, "beast");
  if (target.kind === "champion") {
    attackChampion(state, "beast", target.id, logs, "beast", tracker, {
      noStun: lawId === "beast-sense-shield",
      breakShieldOnly: lawId === "beast-sense-shield"
    });
    state.lastBeastChampionHit = target.id;
    return true;
  }
  if (target.kind === "thief") {
    attackThief(state, "beast", logs, "beast", tracker, "Печать выпадает.");
    return true;
  }
  if (target.kind === "priest" || target.kind === "guard") {
    attackSupportUnit(state, "beast", target.id, logs, "beast", tracker);
    return true;
  }
  if (target.id === "throne") {
    return false;
  }
  return false;
}

function beastPhase(state, logs, tracker) {
  const law = slotLaw(state, "beast");
  const beast = byId(state, "beast");
  const target = chooseBeastTarget(state, law.id, tracker);
  const attackOnly = law.id === "beast-hungry-surge" && state.beastRageCooldown > 0;

  if (!target) {
    const adjacentTarget = adjacentChampionsTo(beast, state)[0];
    if (adjacentTarget) {
      beastAttack(state, adjacentTarget, law.id, logs, tracker);
      return;
    }
    record(logs, "beast", `Зверь рыщет вокруг, но в этот ход не чует достойной добычи.`, { kind: "beast-hold" });
    return;
  }

  if (!attackOnly && target.id !== "throne") {
    const path = findPath(state, beast, targetCellsAround(target), { ignoreId: "beast" });
    const steps = law.id === "beast-hungry-surge" ? 2 : 1;
    const destination = path[Math.min(steps, path.length - 1)];
    movePiece(state, "beast", destination, logs, "beast", law.name, tracker);
  } else if (!attackOnly && target.id === "throne") {
    const path = findPath(state, beast, [THRONE], { ignoreId: "beast" });
    movePiece(state, "beast", path[Math.min(1, path.length - 1)], logs, "beast", law.name, tracker);
  } else {
    record(logs, "beast", `Зверь замирает после голодного рывка и ищет цель рядом.`, { kind: "beast-rest" });
  }

  if (target.id !== "throne" && isAdjacent(byId(state, "beast"), target)) {
    const attacked = beastAttack(state, target, law.id, logs, tracker);
    if (law.id === "beast-hungry-surge" && attacked) {
      state.beastRageCooldown = 2;
    }
  } else if (law.id === "beast-throne-prowl") {
    const throneChamp = PLAYER_ORDER.map((pid) => getChampion(state, pid)).find((champion) => distance(champion, THRONE) <= 1 && isAdjacent(byId(state, "beast"), champion));
    if (throneChamp) {
      beastAttack(state, throneChamp, law.id, logs, tracker);
    }
  }
}

function chooseThiefTarget(state, lawId) {
  const thief = byId(state, "thief");
  const champions = PLAYER_ORDER.map((pid) => getChampion(state, pid));
  if (thief.carryingSeal) {
    return { x: thief.x === 0 ? 0 : thief.x === BOARD_WIDTH - 1 ? BOARD_WIDTH - 1 : thief.x, y: thief.y, id: "edge" };
  }
  if (lawId === "thief-pickpocket") {
    return champions.sort((a, b) => distance(thief, a) - distance(thief, b))[0];
  }
  if (lawId === "thief-secret-pocket") {
    const zero = champions.filter((champion) => getCrowns(state, champion.owner) === 0);
    if (zero.length > 0) {
      return zero.sort((a, b) => distance(thief, a) - distance(thief, b))[0];
    }
  }
  return getChampion(state, getLeaderId(state));
}

function closestEdgeCell(pos) {
  const candidates = [];
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    candidates.push({ x, y: 0 });
    candidates.push({ x, y: BOARD_HEIGHT - 1 });
  }
  for (let y = 1; y < BOARD_HEIGHT - 1; y += 1) {
    candidates.push({ x: 0, y });
    candidates.push({ x: BOARD_WIDTH - 1, y });
  }
  candidates.sort((a, b) => distance(pos, a) - distance(pos, b));
  return candidates[0];
}

function thiefPhase(state, logs, tracker) {
  const law = slotLaw(state, "thief");
  const thief = byId(state, "thief");
  const target = chooseThiefTarget(state, law.id);
  const avoidGuard = law.id === "thief-fear-guard" ? [byId(state, "guard")] : [];

  if (thief.carryingSeal) {
    const edge = closestEdgeCell(thief);
    const path = findPath(state, thief, [edge], { ignoreId: "thief", avoidAdjacentTo: avoidGuard, forbidAdjacentTo: law.id === "thief-fear-guard" ? avoidGuard : [] });
    if (law.id === "thief-fear-guard" && path.length <= 1) {
      record(logs, "thief", `Вор медлит: безопасного пути нет.`, { kind: "thief-hold" });
    } else {
      const steps = law.id === "thief-shadow-run" ? 2 : 1;
      movePiece(state, "thief", path[Math.min(steps, path.length - 1)], logs, "thief", law.name, tracker);
    }

    if (law.id === "thief-shadow-run") {
      const nearChampion = PLAYER_ORDER.map((pid) => getChampion(state, pid)).some((champion) => isAdjacent(thief, champion));
      if (nearChampion) {
        dropSeal(state, logs, "thief", tracker, `Вор слишком близко к чемпиону и роняет печать.`);
        return;
      }
    }

    if (tracker.wardedOwner && thief.carryingSeal === tracker.wardedOwner) {
      returnSeal(state, tracker.wardedOwner, logs, "thief", tracker, `Оберег Жреца возвращает печать владельцу.`);
      return;
    }
    escapeSeal(state, logs, "thief", tracker);
    return;
  }

  const path = findPath(state, thief, targetCellsAround(target), {
    ignoreId: "thief",
    avoidAdjacentTo: avoidGuard,
    forbidAdjacentTo: law.id === "thief-fear-guard" ? avoidGuard : []
  });
  if (law.id === "thief-fear-guard" && path.length <= 1 && !isAdjacent(thief, target)) {
    record(logs, "thief", `Вор прячется и не находит безопасного шага.`, { kind: "thief-hold" });
  } else {
    movePiece(state, "thief", path[Math.min(1, path.length - 1)], logs, "thief", law.name, tracker);
  }

  if (!isAdjacent(thief, target)) {
    return;
  }

  if (law.id === "thief-secret-pocket" && getCrowns(state, target.owner) === 0) {
    target.sabotage = true;
    record(logs, "thief", `${pieceTitle(target)} получает Саботаж на следующую корону.`, { kind: "sabotage" });
    return;
  }

  if (law.id === "thief-false-prey") {
    const otherChampion = getChampion(state, target.owner === "p1" ? "p2" : "p1");
    if (isAdjacent(thief, otherChampion)) {
      state.priorityFlip = 2;
      record(logs, "thief", `Ложная Добыча переворачивает приоритет лидера на следующий ход.`, { kind: "priority-flip" });
      return;
    }
  }

  if (getCrowns(state, target.owner) > 0) {
    stealSeal(state, target.owner, logs, "thief", tracker);
  }
}

function thronePhase(state, logs, tracker) {
  PLAYER_ORDER.forEach((playerId) => {
    const champion = getChampion(state, playerId);
    if (champion.x !== THRONE.x || champion.y !== THRONE.y) {
      record(logs, "throne", `${pieceTitle(champion)} не на троне и не получает корону.`, { kind: "crown-check" });
      return;
    }
    if (champion.stun > 0) {
      record(logs, "throne", `${pieceTitle(champion)} на троне, но оглушен и не может получить корону.`, { kind: "crown-denied" });
      return;
    }
    const blocker = Object.values(state.pieces).find((piece) => piece.kind !== "champion" && piece.x === THRONE.x && piece.y === THRONE.y);
    if (blocker) {
      record(logs, "throne", `${pieceTitle(champion)} не получает корону: трон занят ${pieceTitle(blocker)}.`, { kind: "crown-denied" });
      return;
    }

    if (champion.sabotage) {
      champion.sabotage = false;
      if (!byId(state, "thief").carryingSeal) {
        byId(state, "thief").carryingSeal = playerId;
        state.players[playerId].sealedCrowns += 1;
        record(logs, "throne", `Саботаж превращает новую корону ${playerId === "p1" ? "Севера" : "Юга"} в украденную печать.`, { kind: "crown-sabotaged" });
      } else {
        record(logs, "throne", `Саботаж срывает получение короны ${playerId === "p1" ? "Севера" : "Юга"}.`, { kind: "crown-sabotaged" });
      }
      return;
    }

    state.players[playerId].activeCrowns += 1;
    tracker.crownEvents.push({ playerId, kind: "gain" });
    record(logs, "throne", `${pieceTitle(champion)} получает корону на троне.`, { kind: "crown-gain" });
  });
}

function applyDurations(state) {
  PLAYER_ORDER.forEach((playerId) => {
    const champion = getChampion(state, playerId);
    if (champion.stun > 0) {
      champion.stun -= 1;
    }
  });
  if (state.priorityFlip > 0) {
    state.priorityFlip -= 1;
  }
  if (state.beastRageCooldown > 0) {
    state.beastRageCooldown -= 1;
  }
}

function discardActiveSlotCard(state, slot) {
  const active = state.slots[slot];
  if (active.activeCardId && active.activeOwner) {
    state.players[active.activeOwner].discard.push(active.activeCardId);
  }
}

function applyLawChoices(state, choices, logs) {
  const p1Card = CARD_BY_ID[choices.p1.cardId];
  const p2Card = CARD_BY_ID[choices.p2.cardId];
  const conflicts = [];

  PLAYER_ORDER.forEach((playerId) => {
    const hand = state.players[playerId].hand;
    const index = hand.indexOf(choices[playerId].cardId);
    if (index >= 0) {
      hand.splice(index, 1);
    }
  });

  if (p1Card.slot === p2Card.slot) {
    const slot = p1Card.slot;
    conflicts.push(slot);
    discardActiveSlotCard(state, slot);
    state.players.p1.discard.push(p1Card.id);
    state.players.p2.discard.push(p2Card.id);
    state.slots[slot] = { activeCardId: null, activeOwner: null };
    record(logs, "laws", `Конфликт в слоте "${BASE_LAWS[slot].name}": обе карты разбиваются, слот возвращается к базовому закону.`, { kind: "conflict", slot });
  } else {
    [
      { playerId: "p1", card: p1Card },
      { playerId: "p2", card: p2Card }
    ].forEach(({ playerId, card }) => {
      discardActiveSlotCard(state, card.slot);
      state.slots[card.slot] = {
        activeCardId: card.id,
        activeOwner: playerId
      };
      record(logs, "laws", `${playerId === "p1" ? "Север" : "Юг"} вводит закон "${card.name}" в слот ${card.slot}.`, { kind: "law", slot: card.slot, playerId });
    });
  }

  return conflicts;
}

function refillHands(state) {
  PLAYER_ORDER.forEach((playerId) => {
    const player = state.players[playerId];
    while (player.hand.length < 5) {
      drawOne(player, state.seed);
      if (player.deck.length === 0 && player.discard.length === 0) {
        break;
      }
    }
  });
}

function winCheck(state) {
  const winner = PLAYER_ORDER.find((playerId) => state.players[playerId].activeCrowns >= 3);
  return winner || null;
}

export function serializeTextState(state) {
  return JSON.stringify({
    mode: state.mode,
    turn: state.turn,
    winner: state.winner,
    activeLaws: Object.fromEntries(SLOT_TYPES.map((slot) => [slot, slotLaw(state, slot).name])),
    crowns: {
      p1: state.players.p1.activeCrowns,
      p2: state.players.p2.activeCrowns,
      p1Sealed: state.players.p1.sealedCrowns,
      p2Sealed: state.players.p2.sealedCrowns
    },
    pieces: Object.fromEntries(
      Object.values(state.pieces).map((piece) => [
        piece.id,
        {
          x: piece.x,
          y: piece.y,
          shield: !!piece.shield,
          stun: piece.stun || 0,
          carryingSeal: piece.carryingSeal || null
        }
      ])
    ),
    hands: {
      p1: state.players.p1.hand,
      p2: state.players.p2.hand.length
    },
    note: "origin top-left, x rightwards, y downwards"
  });
}

export function createInitialState(options = {}) {
  const seed = options.seed || `seed-${Date.now()}`;
  const random = seededRandom(seed);
  const deck = shuffle(LAW_CARDS.map((card) => card.id), random);
  const p1Deck = [...deck];
  const p2Deck = [...deck].reverse();
  const players = {
    p1: { id: "p1", hand: p1Deck.splice(0, 5), deck: p1Deck, discard: [], activeCrowns: 0, sealedCrowns: 0, lostCrowns: 0, reshuffles: 0 },
    p2: { id: "p2", hand: p2Deck.splice(0, 5), deck: p2Deck, discard: [], activeCrowns: 0, sealedCrowns: 0, lostCrowns: 0, reshuffles: 0 }
  };
  return {
    mode: options.mode || "ai",
    seed,
    turn: 1,
    winner: null,
    players,
    slots: Object.fromEntries(SLOT_TYPES.map((slot) => [slot, { activeCardId: null, activeOwner: null }])),
    pieces: clone(STARTING_PIECES),
    battleLog: [
      { phase: "setup", text: "Партия начинается. Законы мира пока опираются на каменные основы.", kind: "setup" }
    ],
    turnSummaries: [],
    pendingChoices: null,
    guardPatrolIndex: 0,
    priorityFlip: 0,
    beastRageCooldown: 0,
    lastBeastChampionHit: null
  };
}

export function activeLawSummary(state) {
  return Object.fromEntries(SLOT_TYPES.map((slot) => [slot, slotLaw(state, slot)]));
}

export function resolveTurn(state, choices, options = {}) {
  const next = clone(state);
  const turnLog = [];
  const tracker = {
    moved: new Set(),
    pushed: new Set(),
    movementTimeline: [],
    crownEvents: [],
    sealEvents: [],
    throneBlessingSpent: new Set(),
    wardedOwner: null
  };
  // Frame snapshots are captured AFTER each real engine phase, not recreated
  // by UI heuristics. They are presentation-only and not persisted/networked.
  const captureFrames = options.captureFrames !== false;
  const frames = captureFrames ? [{ phase: "start", state: clone(next), logs: [], moves: [], crowns: [], seals: [] }] : [];
  let logAt = 0, moveAt = 0, crownAt = 0, sealAt = 0;
  const capture = (phase) => {
    if (!captureFrames) return;
    frames.push({
      phase,
      state: clone(next),
      logs: turnLog.slice(logAt).map(entry => ({...entry})),
      moves: tracker.movementTimeline.slice(moveAt).map(entry => clone(entry)),
      crowns: tracker.crownEvents.slice(crownAt).map(entry => clone(entry)),
      seals: tracker.sealEvents.slice(sealAt).map(entry => clone(entry))
    });
    logAt = turnLog.length;
    moveAt = tracker.movementTimeline.length;
    crownAt = tracker.crownEvents.length;
    sealAt = tracker.sealEvents.length;
  };

  record(turnLog, "laws", `Ход ${next.turn}: игроки раскрывают законы.`, { kind: "turn-start", turn: next.turn });
  const conflicts = applyLawChoices(next, choices, turnLog);
  capture("laws");
  priestPhase(next, turnLog, tracker);
  capture("priest");
  resolveChampionMoves(next, slotLaw(next, "champion").id, turnLog, tracker);
  capture("champion");
  guardPhase(next, turnLog, tracker);
  capture("guard");
  beastPhase(next, turnLog, tracker);
  capture("beast");
  thiefPhase(next, turnLog, tracker);
  capture("thief");
  thronePhase(next, turnLog, tracker);
  clearThroneNeutrals(next, turnLog, tracker);
  capture("throne");
  next.winner = winCheck(next);
  applyDurations(next);
  refillHands(next);
  next.turnSummaries.unshift({
    turn: next.turn,
    conflicts,
    crownEvents: tracker.crownEvents,
    sealEvents: tracker.sealEvents
  });
  next.turnSummaries = next.turnSummaries.slice(0, 6);
  next.battleLog = [...turnLog, ...next.battleLog].slice(0, 120);
  next.turn += 1;
  capture("settled");
  return { state: next, logs: turnLog, conflicts, tracker, frames };
}


/**
 * Client-only counterfactual. Resolves the regular deterministic phases without
 * either side submitting a new card. This is NOT a prediction of a hidden choice.
 * No mutation of the source state, hand, deck, timer, or server match occurs.
 */
export function forecastTurn(state, playerId = null, cardId = null) {
  if (cardId && (!CARD_BY_ID[cardId] || !PLAYER_ORDER.includes(playerId))) {
    throw new Error("Invalid preview law");
  }
  const next = clone(state);
  const logs = [];
  const tracker = {
    moved: new Set(), pushed: new Set(), movementTimeline: [],
    crownEvents: [], sealEvents: [], throneBlessingSpent: new Set(), wardedOwner: null
  };
  if (cardId) {
    const card = CARD_BY_ID[cardId];
    next.slots[card.slot] = { activeCardId: card.id, activeOwner: playerId };
    record(logs, "laws", "Условный сценарий: вступает в силу " + card.name + ". Другой игрок ничего не меняет.", { kind: "forecast-law", slot: card.slot });
  } else {
    record(logs, "laws", "Условный сценарий: оба игрока сохраняют текущие законы.", { kind: "forecast-law" });
  }
  priestPhase(next, logs, tracker);
  resolveChampionMoves(next, slotLaw(next, "champion").id, logs, tracker);
  guardPhase(next, logs, tracker);
  beastPhase(next, logs, tracker);
  thiefPhase(next, logs, tracker);
  thronePhase(next, logs, tracker);
  clearThroneNeutrals(next, logs, tracker);
  next.winner = winCheck(next);
  applyDurations(next);
  next.battleLog = [...logs, ...next.battleLog].slice(0, 120);
  return { state: next, logs, tracker, assumedNoOpponentLaw: true };
}

export function cardById(cardId) {
  return CARD_BY_ID[cardId];
}

export function applyDebugAction(state, action) {
  const next = clone(state);
  const logs = [{ phase: "debug", text: `DEBUG: ${action.type}`, kind: "debug" }];
  const tracker = {
    moved: new Set(),
    pushed: new Set(),
    movementTimeline: [],
    crownEvents: [],
    sealEvents: [],
    throneBlessingSpent: new Set(),
    wardedOwner: null
  };
  const [targetPlayer] = PLAYER_ORDER.filter((pid) => pid === action.playerId);
  const champion = targetPlayer ? getChampion(next, targetPlayer) : null;

  switch (action.type) {
    case "restart":
      return createInitialState({ mode: next.mode, seed: `${next.seed}-restart-${Date.now()}` });
    case "give-crown":
      next.players[targetPlayer].activeCrowns += 1;
      break;
    case "toggle-stun":
      champion.stun = champion.stun > 0 ? 0 : 2;
      break;
    case "toggle-shield":
      champion.shield = !champion.shield;
      break;
    case "force-steal":
      stealSeal(next, targetPlayer, logs, "debug", tracker, `DEBUG: Вор крадет печать у ${targetPlayer}.`);
      break;
    case "return-seal":
      returnSeal(next, targetPlayer, logs, "debug", tracker, `DEBUG: печать возвращена ${targetPlayer}.`);
      break;
    case "set-law":
      discardActiveSlotCard(next, action.slot);
      next.slots[action.slot] = { activeCardId: action.cardId || null, activeOwner: action.owner || null };
      break;
    default:
      break;
  }

  next.battleLog = [...logs, ...next.battleLog].slice(0, 120);
  return next;
}
