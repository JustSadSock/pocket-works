const STATE_COLORS = [
  '#9c4f3f', '#3f6b63', '#c08a3d', '#596b8d', '#7c5b7c', '#74834f',
  '#b16f57', '#4e7181', '#8b7446', '#6b5d4d', '#856767', '#5b7b68'
];

const NAME_A = ['Ар', 'Бел', 'Вар', 'Гел', 'Дор', 'Ил', 'Кер', 'Лор', 'Мер', 'Нор', 'Ор', 'Рен', 'Сар', 'Тал', 'Ур', 'Фер', 'Хар'];
const NAME_B = ['вия', 'гард', 'дара', 'ерн', 'ия', 'кар', 'ланд', 'мар', 'ния', 'ор', 'рад', 'рия', 'стан', 'тор', 'ум'];

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(seed, ...parts) {
  let h = seed >>> 0;
  for (const part of parts) {
    h ^= Math.imul((Number(part) + 0x9e3779b9) >>> 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  }
  return h >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(a, b) {
  const dx = a.q - b.q;
  const dy = a.r - b.r;
  return Math.hypot(dx, dy);
}

function cellKey(q, r) {
  return `${q},${r}`;
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]
];

function getNeighborIndices(world, index) {
  const cell = world.cells[index];
  const out = [];
  for (const [dq, dr] of NEIGHBORS) {
    const neighbor = world.cellIndex[cellKey(cell.q + dq, cell.r + dr)];
    if (neighbor !== undefined) out.push(neighbor);
  }
  return out;
}

function makeName(seed, index) {
  const rng = mulberry32(hash(seed, index, 91));
  const name = `${NAME_A[Math.floor(rng() * NAME_A.length)]}${NAME_B[Math.floor(rng() * NAME_B.length)]}`;
  return name.replace('ии', 'и');
}

function makeState(seed, id, capitalIndex, colorIndex = id) {
  const rng = mulberry32(hash(seed, id, 73));
  return {
    id,
    name: makeName(seed, id),
    color: STATE_COLORS[colorIndex % STATE_COLORS.length],
    capitalIndex,
    treasury: Math.round(34 + rng() * 32),
    military: Math.round(38 + rng() * 30),
    stability: Math.round(52 + rng() * 30),
    legitimacy: Math.round(45 + rng() * 35),
    cultureX: rng(),
    cultureY: rng(),
    tradeBoost: 0,
    claimBoost: 0,
    revoltPressure: 0,
    alive: true,
    founded: 1100,
    extinct: null
  };
}

function buildCellIndex(cells) {
  const index = {};
  cells.forEach((cell, i) => {
    index[cellKey(cell.q, cell.r)] = i;
  });
  return index;
}

function chooseCapitals(cells, count, seed) {
  const land = cells.map((cell, i) => cell.land ? i : -1).filter((i) => i >= 0);
  const rng = mulberry32(hash(seed, 19));
  const chosen = [land[Math.floor(rng() * land.length)]];
  while (chosen.length < count) {
    let best = land[0];
    let bestScore = -1;
    for (const index of land) {
      const nearest = Math.min(...chosen.map((c) => dist(cells[index], cells[c])));
      const edgePenalty = Math.min(cells[index].q, 12 - cells[index].q, cells[index].r, 17 - cells[index].r) * 0.08;
      const score = nearest + edgePenalty + rng() * 0.35;
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

function generateCells(seed) {
  const rng = mulberry32(seed);
  const cols = 13;
  const rows = 18;
  const centers = Array.from({ length: 5 }, () => ({
    q: 1.5 + rng() * (cols - 3),
    r: 1.5 + rng() * (rows - 3),
    radius: 2.8 + rng() * 3.4
  }));
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let q = 0; q < cols; q += 1) {
      let score = 0;
      for (const center of centers) {
        const d = Math.hypot((q - center.q) * 0.92, r - center.r);
        score = Math.max(score, 1 - d / center.radius);
      }
      const noise = mulberry32(hash(seed, q, r, 41))();
      const edge = Math.min(q, cols - 1 - q, r, rows - 1 - r);
      const land = score + noise * 0.36 + Math.min(0.14, edge * 0.018) > 0.46;
      cells.push({ q, r, land, owner: land ? 0 : -1, city: false, capital: false });
    }
  }
  return cells;
}

function ensureMap(seed) {
  let attempt = 0;
  while (attempt < 8) {
    const cells = generateCells(seed + attempt * 997);
    const landCount = cells.filter((cell) => cell.land).length;
    if (landCount >= 105) return { cells, seed: seed + attempt * 997 };
    attempt += 1;
  }
  return { cells: generateCells(seed), seed };
}

function rebuildDerived(world) {
  world.cellIndex = buildCellIndex(world.cells);
  return world;
}

function addChronicle(world, text, type = 'ink', stateIds = []) {
  world.chronicle.push({ year: world.year, text, type, stateIds });
  if (world.chronicle.length > 80) world.chronicle.splice(0, world.chronicle.length - 80);
}

export function createWorld(seed = Math.floor(Math.random() * 2_000_000_000)) {
  const generated = ensureMap(seed >>> 0);
  const cells = generated.cells;
  const actualSeed = generated.seed >>> 0;
  const capitals = chooseCapitals(cells, 6, actualSeed);
  const states = capitals.map((capitalIndex, id) => makeState(actualSeed, id, capitalIndex));

  for (const cell of cells) {
    if (!cell.land) continue;
    let winner = 0;
    let best = Infinity;
    for (const state of states) {
      const jitter = mulberry32(hash(actualSeed, cell.q, cell.r, state.id))() * 0.72;
      const score = dist(cell, cells[state.capitalIndex]) + jitter;
      if (score < best) {
        best = score;
        winner = state.id;
      }
    }
    cell.owner = winner;
  }

  for (const state of states) {
    cells[state.capitalIndex].capital = true;
    cells[state.capitalIndex].city = true;
    const owned = cells
      .map((cell, i) => cell.owner === state.id ? i : -1)
      .filter((i) => i >= 0 && i !== state.capitalIndex)
      .sort((a, b) => dist(cells[b], cells[state.capitalIndex]) - dist(cells[a], cells[state.capitalIndex]));
    if (owned[0] !== undefined) cells[owned[0]].city = true;
  }

  const relations = {};
  for (const a of states) {
    for (const b of states) {
      if (a.id >= b.id) continue;
      const cultural = 1 - Math.hypot(a.cultureX - b.cultureX, a.cultureY - b.cultureY) / Math.SQRT2;
      relations[pairKey(a.id, b.id)] = Math.round(-18 + cultural * 68);
    }
  }

  const world = rebuildDerived({
    schema: 1,
    seed: actualSeed,
    year: 1100,
    turn: 0,
    eraStartTurn: 0,
    branchCount: 0,
    pendingBranch: false,
    interventionUsed: false,
    milestone: false,
    laws: { war: 0.58, revolt: 0.48, trade: 0.55 },
    cells,
    states,
    relations,
    chronicle: [],
    snapshots: [],
    selectedStateId: states[0].id
  });

  addChronicle(world, 'Шесть держав разделили материк. Летопись началась.', 'birth', states.map((s) => s.id));
  pushSnapshot(world);
  return world;
}

function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function relation(world, a, b) {
  if (a === b) return 100;
  return world.relations[pairKey(a, b)] ?? 0;
}

function setRelation(world, a, b, value) {
  if (a === b) return;
  world.relations[pairKey(a, b)] = clamp(Math.round(value), -100, 100);
}

export function getStateCells(world, stateId) {
  const out = [];
  world.cells.forEach((cell, index) => {
    if (cell.owner === stateId) out.push(index);
  });
  return out;
}

export function getStateSummary(world, stateId) {
  const state = world.states.find((item) => item.id === stateId);
  if (!state) return null;
  const cells = getStateCells(world, stateId);
  const neighbors = new Set();
  for (const index of cells) {
    for (const ni of getNeighborIndices(world, index)) {
      const owner = world.cells[ni].owner;
      if (owner >= 0 && owner !== stateId) neighbors.add(owner);
    }
  }
  return {
    ...state,
    area: cells.length,
    neighbors: [...neighbors],
    influence: Math.round(cells.length * 2 + state.treasury * 0.45 + state.military * 0.7),
    relationMean: neighbors.size
      ? Math.round([...neighbors].reduce((sum, id) => sum + relation(world, stateId, id), 0) / neighbors.size)
      : 0
  };
}

function borders(world) {
  const pairs = new Map();
  world.cells.forEach((cell, index) => {
    if (!cell.land || cell.owner < 0) return;
    for (const ni of getNeighborIndices(world, index)) {
      const other = world.cells[ni];
      if (!other.land || other.owner < 0 || other.owner === cell.owner) continue;
      const key = pairKey(cell.owner, other.owner);
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push([index, ni]);
    }
  });
  return pairs;
}

function neighborsOf(world, stateId, borderMap = borders(world)) {
  const result = [];
  for (const key of borderMap.keys()) {
    const [a, b] = key.split(':').map(Number);
    if (a === stateId) result.push(b);
    if (b === stateId) result.push(a);
  }
  return result;
}

function aliveStates(world) {
  return world.states.filter((state) => state.alive && getStateCells(world, state.id).length > 0);
}

function strongestTarget(world, attacker, neighborIds, rng) {
  const candidates = neighborIds
    .map((id) => getStateSummary(world, id))
    .filter(Boolean)
    .sort((a, b) => {
      const hostilityA = -relation(world, attacker.id, a.id) + (attacker.military - a.military) * 0.7 + rng() * 14;
      const hostilityB = -relation(world, attacker.id, b.id) + (attacker.military - b.military) * 0.7 + rng() * 14;
      return hostilityB - hostilityA;
    });
  return candidates[0] ?? null;
}

function captureCells(world, attacker, defender, borderMap, rng) {
  const edgePairs = borderMap.get(pairKey(attacker.id, defender.id)) ?? [];
  if (!edgePairs.length) return 0;
  const possible = edgePairs
    .map(([a, b]) => world.cells[a].owner === defender.id ? a : b)
    .filter((value, index, array) => array.indexOf(value) === index);
  const origin = possible[Math.floor(rng() * possible.length)];
  const amount = clamp(1 + Math.floor(rng() * (attacker.claimBoost > 0 ? 4 : 3)), 1, possible.length);
  const queue = [origin];
  const visited = new Set();
  let captured = 0;
  while (queue.length && captured < amount) {
    const index = queue.shift();
    if (visited.has(index)) continue;
    visited.add(index);
    const cell = world.cells[index];
    if (cell.owner !== defender.id || cell.capital) continue;
    cell.owner = attacker.id;
    captured += 1;
    for (const ni of getNeighborIndices(world, index)) {
      if (world.cells[ni].owner === defender.id) queue.push(ni);
    }
  }
  if (captured === 0 && origin !== undefined) {
    const cell = world.cells[origin];
    if (!cell.capital) {
      cell.owner = attacker.id;
      captured = 1;
    }
  }
  return captured;
}

function maybeMoveCapital(world, state) {
  const owned = getStateCells(world, state.id);
  if (!owned.length) {
    state.alive = false;
    state.extinct = world.year;
    return false;
  }
  if (world.cells[state.capitalIndex]?.owner === state.id) return true;
  const replacement = owned
    .map((index) => ({ index, city: world.cells[index].city ? 1 : 0 }))
    .sort((a, b) => b.city - a.city)[0].index;
  world.cells.forEach((cell) => { if (cell.capital && cell.owner === state.id) cell.capital = false; });
  state.capitalIndex = replacement;
  world.cells[replacement].capital = true;
  world.cells[replacement].city = true;
  state.legitimacy = clamp(state.legitimacy - 12, 0, 100);
  return true;
}

function createRebelState(world, parent, rebelCells, rng) {
  const id = Math.max(...world.states.map((state) => state.id)) + 1;
  const capitalIndex = rebelCells[Math.floor(rng() * rebelCells.length)];
  const rebel = makeState(hash(world.seed, world.turn, id), id, capitalIndex, id);
  rebel.name = `${makeName(world.seed + world.turn * 71, id)}ская лига`;
  rebel.stability = 48;
  rebel.legitimacy = 34;
  rebel.military = clamp(Math.round(parent.military * 0.38), 22, 58);
  rebel.treasury = 20;
  rebel.founded = world.year;
  rebel.cultureX = clamp(parent.cultureX + (rng() - 0.5) * 0.28, 0, 1);
  rebel.cultureY = clamp(parent.cultureY + (rng() - 0.5) * 0.28, 0, 1);
  for (const index of rebelCells) {
    world.cells[index].owner = id;
    world.cells[index].capital = false;
  }
  world.cells[capitalIndex].capital = true;
  world.cells[capitalIndex].city = true;
  world.states.push(rebel);
  for (const state of world.states) {
    if (state.id === rebel.id) continue;
    const initial = state.id === parent.id ? -82 : -18 + Math.round(rng() * 44);
    setRelation(world, rebel.id, state.id, initial);
  }
  parent.stability = clamp(parent.stability + 18, 0, 100);
  parent.legitimacy = clamp(parent.legitimacy - 16, 0, 100);
  addChronicle(world, `${rebel.name} откололась от ${parent.name}.`, 'revolt', [parent.id, rebel.id]);
  return rebel;
}

function maybeRevolt(world, state, rng) {
  if (!state.alive || world.states.length >= STATE_COLORS.length) return false;
  const cells = getStateCells(world, state.id);
  if (cells.length < 8) return false;
  const chance = (100 - state.stability) / 100 * world.laws.revolt * 0.62 + state.revoltPressure;
  state.revoltPressure *= 0.55;
  if (rng() > chance) return false;
  const candidates = cells
    .filter((index) => index !== state.capitalIndex && !world.cells[index].capital)
    .sort((a, b) => dist(world.cells[b], world.cells[state.capitalIndex]) - dist(world.cells[a], world.cells[state.capitalIndex]));
  const seedIndex = candidates[Math.floor(rng() * Math.min(8, candidates.length))];
  if (seedIndex === undefined) return false;
  const queue = [seedIndex];
  const chosen = [];
  const wanted = clamp(3 + Math.floor(rng() * Math.min(8, Math.floor(cells.length / 2))), 3, 10);
  const seen = new Set();
  while (queue.length && chosen.length < wanted) {
    const index = queue.shift();
    if (seen.has(index)) continue;
    seen.add(index);
    if (world.cells[index].owner !== state.id || index === state.capitalIndex) continue;
    chosen.push(index);
    for (const ni of getNeighborIndices(world, index)) queue.push(ni);
  }
  if (chosen.length < 3) return false;
  createRebelState(world, state, chosen, rng);
  return true;
}

function driftRelations(world, rng) {
  const states = aliveStates(world);
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      const a = states[i];
      const b = states[j];
      const current = relation(world, a.id, b.id);
      const cultureDistance = Math.hypot(a.cultureX - b.cultureX, a.cultureY - b.cultureY);
      const target = 24 - cultureDistance * 62 + world.laws.trade * 18;
      const next = current + (target - current) * 0.055 + (rng() - 0.5) * 5;
      setRelation(world, a.id, b.id, next);
    }
  }
}

function maybeAllianceEvent(world, before, after, a, b) {
  if (before < 68 && after >= 68) addChronicle(world, `${a.name} и ${b.name} скрепили союз.`, 'alliance', [a.id, b.id]);
  if (before > -48 && after <= -48) addChronicle(world, `${a.name} и ${b.name} объявили друг друга врагами.`, 'war', [a.id, b.id]);
}

export function stepWorld(world) {
  const rng = mulberry32(hash(world.seed, world.turn, world.branchCount, 557));
  if (world.pendingBranch) {
    world.branchCount += 1;
    world.pendingBranch = false;
    addChronicle(world, `Открыта ветвь истории №${world.branchCount + 1}.`, 'branch', []);
  }

  const oldRelations = { ...world.relations };
  driftRelations(world, rng);
  for (const key of Object.keys(world.relations)) {
    const [aId, bId] = key.split(':').map(Number);
    const a = world.states.find((state) => state.id === aId);
    const b = world.states.find((state) => state.id === bId);
    if (a && b) maybeAllianceEvent(world, oldRelations[key] ?? 0, world.relations[key], a, b);
  }

  const borderMap = borders(world);
  const acting = aliveStates(world).sort((a, b) => (b.claimBoost - a.claimBoost) || (b.military - a.military));
  let wars = 0;
  for (const state of acting) {
    const summary = getStateSummary(world, state.id);
    if (!summary?.area) continue;
    const income = summary.area * (0.72 + world.laws.trade * 0.7) + state.tradeBoost * 6;
    state.treasury = clamp(state.treasury + income - state.military * 0.08, 0, 160);
    state.military = clamp(state.military + Math.min(5, state.treasury * 0.025) - (100 - state.stability) * 0.012, 8, 120);
    state.stability = clamp(state.stability + (state.legitimacy - 50) * 0.035 + (rng() - 0.5) * 4, 0, 100);
    state.legitimacy = clamp(state.legitimacy + (summary.area < 5 ? -3 : 0.8) + (rng() - 0.5) * 2, 0, 100);
    state.tradeBoost = Math.max(0, state.tradeBoost - 1);
    state.claimBoost = Math.max(0, state.claimBoost - 1);

    const neighborIds = neighborsOf(world, state.id, borderMap);
    const target = strongestTarget(world, state, neighborIds, rng);
    if (!target) continue;
    const hostility = -relation(world, state.id, target.id) / 100;
    const powerEdge = (state.military - target.military) / 110;
    const attackChance = world.laws.war * (0.15 + Math.max(0, hostility) * 0.36 + Math.max(0, powerEdge) * 0.52 + state.claimBoost * 0.08);
    if (rng() > attackChance) continue;

    const defender = world.states.find((item) => item.id === target.id);
    if (!defender) continue;
    const attackScore = state.military * (0.72 + rng() * 0.7) * (0.65 + state.stability / 150) * (state.claimBoost ? 1.22 : 1);
    const defendScore = defender.military * (0.78 + rng() * 0.72) * (0.72 + defender.stability / 145);
    state.military = clamp(state.military - 4 - rng() * 8, 0, 120);
    defender.military = clamp(defender.military - 3 - rng() * 9, 0, 120);
    setRelation(world, state.id, defender.id, relation(world, state.id, defender.id) - 18);
    if (attackScore > defendScore) {
      const captured = captureCells(world, state, defender, borderMap, rng);
      if (captured > 0) {
        wars += 1;
        state.legitimacy = clamp(state.legitimacy + 4, 0, 100);
        defender.stability = clamp(defender.stability - 7 - captured * 2, 0, 100);
        addChronicle(world, `${state.name} отняла у ${defender.name} ${captured} ${captured === 1 ? 'область' : 'области'}.`, 'war', [state.id, defender.id]);
      }
    } else {
      state.stability = clamp(state.stability - 5, 0, 100);
      defender.legitimacy = clamp(defender.legitimacy + 3, 0, 100);
      addChronicle(world, `${defender.name} отбила наступление ${state.name}.`, 'defense', [state.id, defender.id]);
    }
  }

  for (const state of world.states) {
    const wasAlive = state.alive;
    const alive = maybeMoveCapital(world, state);
    if (wasAlive && !alive) addChronicle(world, `${state.name} исчезла с карты.`, 'death', [state.id]);
  }

  for (const state of [...aliveStates(world)]) maybeRevolt(world, state, rng);

  world.year += 10;
  world.turn += 1;
  world.interventionUsed = false;
  world.milestone = world.turn > 0 && world.turn % 12 === 0;
  if (wars === 0 && rng() < 0.55) addChronicle(world, 'Десятилетие прошло без большой войны. Торговцы запомнили его лучше летописцев.', 'peace', []);
  pushSnapshot(world);
  return world;
}

export const INTERVENTIONS = {
  patronage: {
    label: 'Покровительство',
    short: 'Казна, армия и законность вверх.'
  },
  unrest: {
    label: 'Поднять смуту',
    short: 'Стабильность падает; возможен раскол.'
  },
  trade: {
    label: 'Открыть путь',
    short: 'Доход и отношения с соседями растут.'
  },
  claim: {
    label: 'Дать притязание',
    short: 'Следующая экспансия становится вероятнее.'
  }
};

export function applyIntervention(world, type, stateId) {
  if (world.interventionUsed) return { ok: false, reason: 'В этом десятилетии вмешательство уже использовано.' };
  const state = world.states.find((item) => item.id === stateId && item.alive);
  if (!state) return { ok: false, reason: 'Выберите живую державу.' };
  const neighbors = neighborsOf(world, state.id);
  switch (type) {
    case 'patronage':
      state.treasury = clamp(state.treasury + 34, 0, 160);
      state.military = clamp(state.military + 12, 0, 120);
      state.legitimacy = clamp(state.legitimacy + 9, 0, 100);
      state.stability = clamp(state.stability + 5, 0, 100);
      addChronicle(world, `Неизвестный покровитель усилил ${state.name}.`, 'favor', [state.id]);
      break;
    case 'unrest':
      state.stability = clamp(state.stability - 27, 0, 100);
      state.legitimacy = clamp(state.legitimacy - 8, 0, 100);
      state.revoltPressure += 0.44;
      addChronicle(world, `По землям ${state.name} пошли опасные слухи.`, 'revolt', [state.id]);
      break;
    case 'trade':
      state.treasury = clamp(state.treasury + 24, 0, 160);
      state.stability = clamp(state.stability + 8, 0, 100);
      state.tradeBoost = Math.max(state.tradeBoost, 3);
      for (const neighbor of neighbors) setRelation(world, state.id, neighbor, relation(world, state.id, neighbor) + 14);
      addChronicle(world, `${state.name} получила новый торговый путь.`, 'trade', [state.id, ...neighbors]);
      break;
    case 'claim':
      state.military = clamp(state.military + 7, 0, 120);
      state.claimBoost = Math.max(state.claimBoost, 3);
      for (const neighbor of neighbors) setRelation(world, state.id, neighbor, relation(world, state.id, neighbor) - 9);
      addChronicle(world, `${state.name} объявила древнее притязание на соседние земли.`, 'claim', [state.id, ...neighbors]);
      break;
    default:
      return { ok: false, reason: 'Неизвестное вмешательство.' };
  }
  world.interventionUsed = true;
  return { ok: true };
}

function snapshotData(world) {
  return {
    year: world.year,
    turn: world.turn,
    branchCount: world.branchCount,
    laws: { ...world.laws },
    cells: world.cells.map(({ q, r, land, owner, city, capital }) => ({ q, r, land, owner, city, capital })),
    states: world.states.map((state) => ({ ...state })),
    relations: { ...world.relations },
    chronicle: world.chronicle.map((entry) => ({ ...entry, stateIds: [...entry.stateIds] })),
    selectedStateId: world.selectedStateId
  };
}

export function pushSnapshot(world) {
  world.snapshots.push(snapshotData(world));
  if (world.snapshots.length > 31) world.snapshots.shift();
}

export function rewindWorld(world, snapshotIndex) {
  const snapshot = world.snapshots[snapshotIndex];
  if (!snapshot) return false;
  world.year = snapshot.year;
  world.turn = snapshot.turn;
  world.branchCount = snapshot.branchCount;
  world.laws = { ...snapshot.laws };
  world.cells = snapshot.cells.map((cell) => ({ ...cell }));
  world.states = snapshot.states.map((state) => ({ ...state }));
  world.relations = { ...snapshot.relations };
  world.chronicle = snapshot.chronicle.map((entry) => ({ ...entry, stateIds: [...entry.stateIds] }));
  world.selectedStateId = snapshot.selectedStateId;
  world.snapshots = world.snapshots.slice(0, snapshotIndex + 1);
  world.pendingBranch = true;
  world.interventionUsed = false;
  world.milestone = false;
  rebuildDerived(world);
  addChronicle(world, `Летопись отмотана к ${world.year} году. Следующий ход создаст новую ветвь.`, 'branch', []);
  return true;
}

export function serializeWorld(world) {
  const copy = { ...world };
  delete copy.cellIndex;
  return copy;
}

export function hydrateWorld(raw) {
  if (!raw || raw.schema !== 1 || !Array.isArray(raw.cells) || !Array.isArray(raw.states)) return null;
  const world = {
    ...raw,
    laws: {
      war: clamp(Number(raw.laws?.war ?? 0.58), 0.1, 1),
      revolt: clamp(Number(raw.laws?.revolt ?? 0.48), 0.1, 1),
      trade: clamp(Number(raw.laws?.trade ?? 0.55), 0.1, 1)
    },
    cells: raw.cells.map((cell) => ({ ...cell })),
    states: raw.states.map((state) => ({ ...state })),
    relations: { ...(raw.relations ?? {}) },
    chronicle: Array.isArray(raw.chronicle) ? raw.chronicle.map((entry) => ({ ...entry, stateIds: [...(entry.stateIds ?? [])] })) : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots.map((snap) => ({
      ...snap,
      laws: { ...snap.laws },
      cells: snap.cells.map((cell) => ({ ...cell })),
      states: snap.states.map((state) => ({ ...state })),
      relations: { ...snap.relations },
      chronicle: snap.chronicle.map((entry) => ({ ...entry, stateIds: [...(entry.stateIds ?? [])] }))
    })) : []
  };
  world.interventionUsed = Boolean(world.interventionUsed);
  world.pendingBranch = Boolean(world.pendingBranch);
  world.milestone = Boolean(world.milestone);
  return rebuildDerived(world);
}

export function getWorldLeaders(world) {
  const summaries = aliveStates(world).map((state) => getStateSummary(world, state.id));
  summaries.sort((a, b) => b.influence - a.influence);
  return {
    influence: summaries[0] ?? null,
    stability: [...summaries].sort((a, b) => b.stability - a.stability)[0] ?? null,
    military: [...summaries].sort((a, b) => b.military - a.military)[0] ?? null,
    alive: summaries.length
  };
}
