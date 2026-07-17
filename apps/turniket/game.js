export const BOARD_SIZE = 7;
export const GATES_PER_PLAYER = 7;
export const MATCH_TARGET = 3;
export const STORAGE_VERSION = 1;

const ORTHOGONAL = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cellIndex(cell, size = BOARD_SIZE) {
  return cell.r * size + cell.c;
}

export function sameCell(a, b) {
  return a.r === b.r && a.c === b.c;
}

export function inside(cell, size = BOARD_SIZE) {
  return cell.r >= 0 && cell.r < size && cell.c >= 0 && cell.c < size;
}

export function adjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function edgeKey(a, b, size = BOARD_SIZE) {
  const ia = cellIndex(a, size);
  const ib = cellIndex(b, size);
  return ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
}

export function gateEdges(gate, size = BOARD_SIZE) {
  if (gate.orientation === 'h') {
    return [
      [{ r: gate.r, c: gate.c }, { r: gate.r + 1, c: gate.c }],
      [{ r: gate.r, c: gate.c + 1 }, { r: gate.r + 1, c: gate.c + 1 }]
    ];
  }

  return [
    [{ r: gate.r, c: gate.c }, { r: gate.r, c: gate.c + 1 }],
    [{ r: gate.r + 1, c: gate.c }, { r: gate.r + 1, c: gate.c + 1 }]
  ];
}

export function createMatch(options = {}) {
  const size = options.size || BOARD_SIZE;
  const gatesPerPlayer = options.gatesPerPlayer || GATES_PER_PLAYER;
  const starter = options.starter ?? 0;
  const center = Math.floor(size / 2);

  return {
    storageVersion: STORAGE_VERSION,
    size,
    gatesPerPlayer,
    targetScore: options.targetScore || MATCH_TARGET,
    pawns: [
      { r: size - 1, c: center },
      { r: 0, c: center }
    ],
    gates: [],
    gatesLeft: [gatesPerPlayer, gatesPerPlayer],
    scores: options.scores ? [...options.scores] : [0, 0],
    turn: starter,
    starter,
    round: options.round || 1,
    nextGateId: 1,
    status: 'playing',
    winner: null,
    winReason: null,
    lastAction: null
  };
}

export function goalReached(state, player, cell = state.pawns[player]) {
  return player === 0 ? cell.r === 0 : cell.r === state.size - 1;
}

export function findGateForEdge(state, a, b) {
  const key = edgeKey(a, b, state.size);
  for (const gate of state.gates) {
    if (gateEdges(gate, state.size).some(([from, to]) => edgeKey(from, to, state.size) === key)) {
      return gate;
    }
  }
  return null;
}

export function edgeAllows(state, from, to) {
  if (!adjacent(from, to)) return false;
  const gate = findGateForEdge(state, from, to);
  if (!gate) return true;

  const fromIndex = cellIndex(from, state.size);
  const toIndex = cellIndex(to, state.size);
  const travellingLowToHigh = fromIndex < toIndex;
  return gate.dir === (travellingLowToHigh ? 1 : -1);
}

export function hasDirectedPath(state, player) {
  const start = state.pawns[player];
  const queue = [start];
  const visited = new Set([cellIndex(start, state.size)]);

  while (queue.length) {
    const current = queue.shift();
    if (goalReached(state, player, current)) return true;

    for (const [dr, dc] of ORTHOGONAL) {
      const next = { r: current.r + dr, c: current.c + dc };
      if (!inside(next, state.size) || !edgeAllows(state, current, next)) continue;
      const index = cellIndex(next, state.size);
      if (visited.has(index)) continue;
      visited.add(index);
      queue.push(next);
    }
  }

  return false;
}

function gateCollides(state, candidate) {
  const candidateKeys = new Set(gateEdges(candidate, state.size).map(([a, b]) => edgeKey(a, b, state.size)));

  return state.gates.some((gate) => {
    if (gate.orientation !== candidate.orientation && gate.r === candidate.r && gate.c === candidate.c) {
      return true;
    }
    return gateEdges(gate, state.size).some(([a, b]) => candidateKeys.has(edgeKey(a, b, state.size)));
  });
}

export function validGateSlot(state, slot) {
  return Boolean(
    slot &&
    (slot.orientation === 'h' || slot.orientation === 'v') &&
    Number.isInteger(slot.r) &&
    Number.isInteger(slot.c) &&
    slot.r >= 0 &&
    slot.c >= 0 &&
    slot.r < state.size - 1 &&
    slot.c < state.size - 1 &&
    !gateCollides(state, { ...slot, dir: 1 })
  );
}

export function getPlacementDirections(state, slot, player = state.turn) {
  if (state.status !== 'playing' || state.gatesLeft[player] <= 0 || !validGateSlot(state, slot)) return [];

  return [-1, 1].filter((dir) => {
    const next = clone(state);
    next.gates.push({ id: `g${next.nextGateId}`, ...slot, dir });
    return hasDirectedPath(next, 0) && hasDirectedPath(next, 1);
  });
}

function pathEdges(start, path) {
  const edges = [];
  let from = start;
  for (const to of path) {
    edges.push([from, to]);
    from = to;
  }
  return edges;
}

function rawMoveCandidates(state, player) {
  const start = state.pawns[player];
  const opponent = state.pawns[1 - player];
  const candidates = [];

  for (const [dr, dc] of ORTHOGONAL) {
    const adjacentCell = { r: start.r + dr, c: start.c + dc };
    if (!inside(adjacentCell, state.size) || !edgeAllows(state, start, adjacentCell)) continue;

    if (!sameCell(adjacentCell, opponent)) {
      candidates.push({
        to: adjacentCell,
        path: [adjacentCell],
        kind: 'step'
      });
      continue;
    }

    const beyond = { r: opponent.r + dr, c: opponent.c + dc };
    if (inside(beyond, state.size) && edgeAllows(state, opponent, beyond)) {
      candidates.push({
        to: beyond,
        path: [opponent, beyond],
        kind: 'jump'
      });
      continue;
    }

    const sideVectors = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [sr, sc] of sideVectors) {
      const side = { r: opponent.r + sr, c: opponent.c + sc };
      if (!inside(side, state.size) || !edgeAllows(state, opponent, side)) continue;
      candidates.push({
        to: side,
        path: [opponent, side],
        kind: 'diagonal'
      });
    }
  }

  return candidates;
}

function simulateMove(state, player, move) {
  const next = clone(state);
  const start = next.pawns[player];
  const flippedGateIds = [];

  for (const [from, to] of pathEdges(start, move.path)) {
    const gate = findGateForEdge(next, from, to);
    if (gate) {
      gate.dir *= -1;
      flippedGateIds.push(gate.id);
    }
  }

  next.pawns[player] = { ...move.to };
  return { next, flippedGateIds };
}

export function getLegalMoves(state, player = state.turn) {
  if (state.status !== 'playing') return [];

  return rawMoveCandidates(state, player).filter((candidate) => {
    const { next } = simulateMove(state, player, candidate);
    if (goalReached(next, player)) return true;
    return hasDirectedPath(next, 0) && hasDirectedPath(next, 1);
  });
}

function finishRound(state, winner, reason) {
  state.winner = winner;
  state.winReason = reason;
  state.scores[winner] += 1;
  state.status = state.scores[winner] >= state.targetScore ? 'match-over' : 'round-over';
  return state;
}

function checkLockAfterTurn(state, actingPlayer) {
  if (state.status !== 'playing') return state;
  if (getLegalMoves(state, state.turn).length === 0) {
    return finishRound(state, actingPlayer, 'locked');
  }
  return state;
}

export function applyMove(state, requestedMove) {
  if (state.status !== 'playing') return null;
  const legalMoves = getLegalMoves(state, state.turn);
  const move = legalMoves.find((candidate) =>
    sameCell(candidate.to, requestedMove.to) &&
    candidate.path.length === requestedMove.path.length &&
    candidate.path.every((cell, index) => sameCell(cell, requestedMove.path[index]))
  );
  if (!move) return null;

  const player = state.turn;
  const { next, flippedGateIds } = simulateMove(state, player, move);
  next.lastAction = {
    type: 'move',
    player,
    from: { ...state.pawns[player] },
    to: { ...move.to },
    path: move.path.map((cell) => ({ ...cell })),
    kind: move.kind,
    flippedGateIds
  };

  if (goalReached(next, player)) {
    return finishRound(next, player, 'reached');
  }

  next.turn = 1 - player;
  return checkLockAfterTurn(next, player);
}

export function applyGate(state, slot, dir) {
  if (state.status !== 'playing') return null;
  const legalDirections = getPlacementDirections(state, slot, state.turn);
  if (!legalDirections.includes(dir)) return null;

  const next = clone(state);
  const player = next.turn;
  const gate = {
    id: `g${next.nextGateId}`,
    orientation: slot.orientation,
    r: slot.r,
    c: slot.c,
    dir,
    owner: player
  };

  next.nextGateId += 1;
  next.gates.push(gate);
  next.gatesLeft[player] -= 1;
  next.lastAction = { type: 'gate', player, gate: { ...gate } };
  next.turn = 1 - player;
  return checkLockAfterTurn(next, player);
}

export function startNextRound(state) {
  const starter = 1 - state.starter;
  return createMatch({
    size: state.size,
    gatesPerPlayer: state.gatesPerPlayer,
    targetScore: state.targetScore,
    starter,
    scores: state.scores,
    round: state.round + 1
  });
}

export function restartRound(state) {
  return createMatch({
    size: state.size,
    gatesPerPlayer: state.gatesPerPlayer,
    targetScore: state.targetScore,
    starter: state.starter,
    scores: state.scores,
    round: state.round
  });
}

export function placementSlots(state) {
  const slots = [];
  for (let r = 0; r < state.size - 1; r += 1) {
    for (let c = 0; c < state.size - 1; c += 1) {
      for (const orientation of ['h', 'v']) {
        const slot = { r, c, orientation };
        const legalDirs = getPlacementDirections(state, slot);
        if (legalDirs.length) slots.push({ ...slot, legalDirs });
      }
    }
  }
  return slots;
}

export function directionLabel(slot, dir) {
  if (slot.orientation === 'h') return dir === 1 ? 'ВНИЗ' : 'ВВЕРХ';
  return dir === 1 ? 'ВПРАВО' : 'ВЛЕВО';
}

export function hydrateState(raw) {
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if (!state || state.storageVersion !== STORAGE_VERSION) return null;
    if (!Number.isInteger(state.size) || state.size < 5 || state.size > 11 || state.size % 2 === 0) return null;
    if (!Array.isArray(state.pawns) || state.pawns.length !== 2 || state.pawns.some((cell) => !inside(cell, state.size))) return null;
    if (!Array.isArray(state.gates) || !Array.isArray(state.gatesLeft) || !Array.isArray(state.scores)) return null;
    if (![0, 1].includes(state.turn) || ![0, 1].includes(state.starter)) return null;
    if (!['playing', 'round-over', 'match-over'].includes(state.status)) return null;
    if (state.gates.some((gate) => !['h', 'v'].includes(gate.orientation) || ![-1, 1].includes(gate.dir) || ![0, 1].includes(gate.owner))) return null;

    const rebuilt = { ...state, gates: [] };
    for (const gate of state.gates) {
      if (!validGateSlot(rebuilt, gate)) return null;
      rebuilt.gates.push(gate);
    }

    if (!hasDirectedPath(rebuilt, 0) || !hasDirectedPath(rebuilt, 1)) return null;
    return rebuilt;
  } catch {
    return null;
  }
}
