export const DIRECTIONS = Object.freeze([
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
]);

export const DEFAULT_RULES = Object.freeze({
  radius: 3,
  units: 6,
  captureThreshold: 2,
  supportLimit: 1,
  targetScore: 7,
  maxActions: 180,
  alternatingInitiative: true,
  pairedVictory: true,
  redeploy: true,
  signalLayout: 'wide'
});

const START_HOME = Object.freeze([
  [0, -3], [1, -3], [2, -3], [3, -3], [0, -2], [1, -2]
]);
const SIGNAL_LAYOUTS = Object.freeze({
  line: [[-1, 0], [0, 0], [1, 0]],
  triangle: [[0, 0], [-1, 1], [1, -1]],
  wide: [[0, 0], [-2, 1], [2, -1]]
});

export function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

export function parseCoord(key) {
  const [q, r] = String(key).split(',').map(Number);
  return [q, r];
}

export function negateCoord(coord) {
  return [-coord[0], -coord[1]];
}

export function makeBoard(radius = DEFAULT_RULES.radius) {
  const output = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.abs(q + r) <= radius) output.push(coordKey([q, r]));
    }
  }
  return output;
}

export function hexDistance(a, b = [0, 0]) {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function neighborsOf(key, boardSet = new Set(makeBoard())) {
  const [q, r] = parseCoord(key);
  return DIRECTIONS
    .map(([dq, dr]) => coordKey([q + dq, r + dr]))
    .filter((candidate) => boardSet.has(candidate));
}

export function homeCells(player, units = DEFAULT_RULES.units) {
  const source = START_HOME.slice(0, units);
  return source.map((coord) => coordKey(player === 0 ? coord : negateCoord(coord)));
}

export function signalCells(layout = DEFAULT_RULES.signalLayout) {
  return (SIGNAL_LAYOUTS[layout] || SIGNAL_LAYOUTS.line).map(coordKey);
}

export function createGame(options = {}) {
  const rules = { ...DEFAULT_RULES, ...(options.rules || {}) };
  const positions = [homeCells(0, rules.units), homeCells(1, rules.units)];
  const state = {
    schemaVersion: 1,
    rules,
    positions,
    reserve: [0, 0],
    score: [0, 0],
    round: 0,
    phase: 0,
    actionCount: 0,
    winner: null,
    resultReason: null,
    lastAction: null,
    lastCaptured: [],
    repetitions: {},
    history: []
  };
  rememberPosition(state);
  return state;
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function currentPlayer(state) {
  const starter = state.rules.alternatingInitiative ? state.round % 2 : 0;
  return state.phase === 0 ? starter : 1 - starter;
}

export function roundStarter(state) {
  return state.rules.alternatingInitiative ? state.round % 2 : 0;
}

export function occupiedSet(state) {
  return new Set([...state.positions[0], ...state.positions[1]]);
}

export function signalControl(state) {
  const signals = new Set(signalCells(state.rules.signalLayout));
  return [
    state.positions[0].filter((cell) => signals.has(cell)).length,
    state.positions[1].filter((cell) => signals.has(cell)).length
  ];
}

export function legalActions(state) {
  if (state.winner !== null) return [];
  const player = currentPlayer(state);
  const boardSet = new Set(makeBoard(state.rules.radius));
  const occupied = occupiedSet(state);
  const actions = [];

  for (const from of state.positions[player]) {
    for (const to of neighborsOf(from, boardSet)) {
      if (!occupied.has(to)) actions.push({ type: 'move', from, to });
    }
  }

  if (state.rules.redeploy && state.reserve[player] > 0) {
    for (const to of homeCells(player, state.rules.units)) {
      if (!occupied.has(to)) actions.push({ type: 'redeploy', to });
    }
  }

  return actions;
}

export function actionKey(action) {
  return action.type === 'move'
    ? `m:${action.from}>${action.to}`
    : `r:${action.to}`;
}

function assertLegalAction(state, action) {
  const keys = new Set(legalActions(state).map(actionKey));
  if (!keys.has(actionKey(action))) throw new Error('Недопустимый ход');
}

export function captureCandidates(state, attacker) {
  const boardSet = new Set(makeBoard(state.rules.radius));
  const attacking = new Set(state.positions[attacker]);
  const defending = new Set(state.positions[1 - attacker]);
  const victims = [];

  for (const cell of defending) {
    const adjacent = neighborsOf(cell, boardSet);
    const attackers = adjacent.filter((neighbor) => attacking.has(neighbor)).length;
    const support = adjacent.filter((neighbor) => defending.has(neighbor)).length;
    if (attackers >= state.rules.captureThreshold && support <= state.rules.supportLimit) {
      victims.push(cell);
    }
  }
  return victims;
}

export function applyAction(inputState, action, options = {}) {
  const state = cloneState(inputState);
  if (!options.skipValidation) assertLegalAction(state, action);
  const player = currentPlayer(state);
  const opponent = 1 - player;

  if (action.type === 'move') {
    const index = state.positions[player].indexOf(action.from);
    if (index < 0) throw new Error('Фигура не принадлежит игроку');
    state.positions[player][index] = action.to;
  } else if (action.type === 'redeploy') {
    if (state.reserve[player] <= 0) throw new Error('В резерве нет фигур');
    state.reserve[player] -= 1;
    state.positions[player].push(action.to);
  } else {
    throw new Error('Неизвестное действие');
  }

  const captured = captureCandidates(state, player);
  if (captured.length) {
    const capturedSet = new Set(captured);
    state.positions[opponent] = state.positions[opponent].filter((cell) => !capturedSet.has(cell));
    if (state.rules.redeploy) state.reserve[opponent] += captured.length;
  }

  state.lastAction = { ...action, player };
  state.lastCaptured = captured;
  state.actionCount += 1;
  state.history.push({ player, action: { ...action }, captured: [...captured] });

  if (!state.rules.redeploy && state.positions[opponent].length === 0) {
    state.winner = player;
    state.resultReason = 'elimination';
    return state;
  }

  if (state.phase === 0) {
    state.phase = 1;
  } else {
    state.phase = 0;
    const control = signalControl(state);
    if (control[0] >= 2) state.score[0] += 1;
    if (control[1] >= 2) state.score[1] += 1;
    state.round += 1;

    const targetReached = state.score[0] >= state.rules.targetScore || state.score[1] >= state.rules.targetScore;
    const fairCycleComplete = !state.rules.pairedVictory || state.round % 2 === 0;
    if (targetReached && fairCycleComplete && state.score[0] !== state.score[1]) {
      state.winner = state.score[0] > state.score[1] ? 0 : 1;
      state.resultReason = 'control';
      return state;
    }
  }

  if (state.actionCount >= state.rules.maxActions) {
    resolveActionLimit(state);
    return state;
  }

  const repetitions = rememberPosition(state);
  if (repetitions >= 3) {
    state.winner = -1;
    state.resultReason = 'repetition';
    return state;
  }

  if (legalActions(state).length === 0) {
    state.winner = 1 - currentPlayer(state);
    state.resultReason = 'immobilized';
  }

  return state;
}

function resolveActionLimit(state) {
  const control = signalControl(state);
  const ranking = [0, 1].map((player) => [
    state.score[player],
    control[player],
    state.positions[player].length,
    -state.reserve[player]
  ]);
  const comparison = compareTuple(ranking[0], ranking[1]);
  state.winner = comparison > 0 ? 0 : comparison < 0 ? 1 : -1;
  state.resultReason = 'limit';
}

function compareTuple(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

export function positionKey(state) {
  return [
    [...state.positions[0]].sort().join(';'),
    [...state.positions[1]].sort().join(';'),
    state.reserve.join(','),
    state.score.join(','),
    state.phase,
    state.round % 2,
    currentPlayer(state)
  ].join('|');
}

function rememberPosition(state) {
  const key = positionKey(state);
  state.repetitions[key] = (state.repetitions[key] || 0) + 1;
  const entries = Object.entries(state.repetitions);
  if (entries.length > 120) {
    state.repetitions = Object.fromEntries(entries.slice(-100));
  }
  return state.repetitions[key];
}

export function validateStoredState(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.schemaVersion !== 1) return null;
  const rules = { ...DEFAULT_RULES, ...(value.rules || {}) };
  const board = new Set(makeBoard(rules.radius));
  const positions = value.positions;
  if (!Array.isArray(positions) || positions.length !== 2) return null;
  if (!positions.every((side) => Array.isArray(side) && side.every((cell) => board.has(cell)))) return null;
  const all = [...positions[0], ...positions[1]];
  if (new Set(all).size !== all.length) return null;
  if (!Array.isArray(value.reserve) || value.reserve.length !== 2) return null;
  if (!Array.isArray(value.score) || value.score.length !== 2) return null;
  const state = {
    ...createGame({ rules }),
    ...cloneState(value),
    rules,
    positions: positions.map((side) => [...side]),
    reserve: value.reserve.map((count) => Math.max(0, Number(count) || 0)),
    score: value.score.map((count) => Math.max(0, Number(count) || 0)),
    round: Math.max(0, Number(value.round) || 0),
    phase: value.phase === 1 ? 1 : 0,
    actionCount: Math.max(0, Number(value.actionCount) || 0),
    repetitions: value.repetitions && typeof value.repetitions === 'object' ? { ...value.repetitions } : {},
    history: Array.isArray(value.history) ? value.history.slice(-180) : []
  };
  return state;
}
