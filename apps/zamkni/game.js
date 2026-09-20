export const BOARD_SIZE = 5;

export function createGame({ mode = 'ai', players = [] } = {}) {
  const normalizedPlayers = players.map((player, index) => ({
    id: player.id || `p${index + 1}`,
    name: player.name || `Игрок ${index + 1}`,
    color: player.color || ['#d65f45', '#2f6f9f', '#4e8b68', '#c29434'][index % 4],
    team: Number.isInteger(player.team) ? player.team : index
  }));

  if (normalizedPlayers.length < 2 || normalizedPlayers.length > 4) {
    throw new Error('A game needs between 2 and 4 players.');
  }

  return {
    schemaVersion: 1,
    mode,
    size: BOARD_SIZE,
    revision: 0,
    players: normalizedPlayers,
    currentPlayer: 0,
    horizontal: Array((BOARD_SIZE + 1) * BOARD_SIZE).fill(null),
    vertical: Array(BOARD_SIZE * (BOARD_SIZE + 1)).fill(null),
    boxes: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    scores: Array(normalizedPlayers.length).fill(0),
    finished: false,
    winners: [],
    lastMove: null
  };
}

export function edgeId(orientation, row, col) {
  return `${orientation}:${row}:${col}`;
}

export function parseEdgeId(id) {
  if (typeof id !== 'string') return null;
  const [orientation, rowText, colText] = id.split(':');
  const row = Number(rowText);
  const col = Number(colText);
  if (!['h', 'v'].includes(orientation) || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { orientation, row, col };
}

export function isValidEdge(game, id) {
  const parsed = parseEdgeId(id);
  if (!parsed) return false;
  const { orientation, row, col } = parsed;
  const size = game.size;
  if (orientation === 'h') return row >= 0 && row <= size && col >= 0 && col < size;
  return row >= 0 && row < size && col >= 0 && col <= size;
}

export function edgeIndex(game, id) {
  const parsed = parseEdgeId(id);
  if (!parsed || !isValidEdge(game, id)) return null;
  if (parsed.orientation === 'h') return parsed.row * game.size + parsed.col;
  return parsed.row * (game.size + 1) + parsed.col;
}

export function isEdgeOpen(game, id) {
  const parsed = parseEdgeId(id);
  const index = edgeIndex(game, id);
  if (!parsed || index === null) return false;
  return (parsed.orientation === 'h' ? game.horizontal[index] : game.vertical[index]) === null;
}

export function listOpenEdges(game) {
  const edges = [];
  for (let row = 0; row <= game.size; row += 1) {
    for (let col = 0; col < game.size; col += 1) {
      const id = edgeId('h', row, col);
      if (isEdgeOpen(game, id)) edges.push(id);
    }
  }
  for (let row = 0; row < game.size; row += 1) {
    for (let col = 0; col <= game.size; col += 1) {
      const id = edgeId('v', row, col);
      if (isEdgeOpen(game, id)) edges.push(id);
    }
  }
  return edges;
}

function boxIndex(game, row, col) {
  return row * game.size + col;
}

function adjacentBoxes(game, parsed) {
  const out = [];
  if (parsed.orientation === 'h') {
    if (parsed.row > 0) out.push([parsed.row - 1, parsed.col]);
    if (parsed.row < game.size) out.push([parsed.row, parsed.col]);
  } else {
    if (parsed.col > 0) out.push([parsed.row, parsed.col - 1]);
    if (parsed.col < game.size) out.push([parsed.row, parsed.col]);
  }
  return out;
}

export function boxSideCount(game, row, col) {
  const top = game.horizontal[row * game.size + col] !== null;
  const bottom = game.horizontal[(row + 1) * game.size + col] !== null;
  const left = game.vertical[row * (game.size + 1) + col] !== null;
  const right = game.vertical[row * (game.size + 1) + col + 1] !== null;
  return Number(top) + Number(bottom) + Number(left) + Number(right);
}

export function cloneGame(game) {
  return JSON.parse(JSON.stringify(game));
}

export function applyMove(game, id, playerIndex = game.currentPlayer) {
  if (game.finished) return { ok: false, reason: 'finished', game };
  if (playerIndex !== game.currentPlayer) return { ok: false, reason: 'turn', game };
  if (!isValidEdge(game, id) || !isEdgeOpen(game, id)) return { ok: false, reason: 'edge', game };

  const next = cloneGame(game);
  const parsed = parseEdgeId(id);
  const index = edgeIndex(next, id);
  if (parsed.orientation === 'h') next.horizontal[index] = playerIndex;
  else next.vertical[index] = playerIndex;

  const captured = [];
  for (const [row, col] of adjacentBoxes(next, parsed)) {
    const indexBox = boxIndex(next, row, col);
    if (next.boxes[indexBox] !== null) continue;
    if (boxSideCount(next, row, col) === 4) {
      next.boxes[indexBox] = playerIndex;
      next.scores[playerIndex] += 1;
      captured.push(indexBox);
    }
  }

  next.revision += 1;
  next.lastMove = { edge: id, playerIndex, captured };

  const openEdges = listOpenEdges(next);
  if (openEdges.length === 0) {
    next.finished = true;
    const teamScores = getTeamScores(next);
    const best = Math.max(...teamScores.map((entry) => entry.score));
    const winningTeams = new Set(teamScores.filter((entry) => entry.score === best).map((entry) => entry.team));
    next.winners = next.players.map((player, indexPlayer) => ({ player, index: indexPlayer }))
      .filter(({ player }) => winningTeams.has(player.team))
      .map(({ index }) => index);
  } else if (captured.length === 0) {
    next.currentPlayer = (next.currentPlayer + 1) % next.players.length;
  }

  return { ok: true, captured, game: next };
}

export function getTeamScores(game) {
  const map = new Map();
  game.players.forEach((player, index) => {
    const current = map.get(player.team) || 0;
    map.set(player.team, current + (game.scores[index] || 0));
  });
  return [...map.entries()].map(([team, score]) => ({ team, score }));
}

export function remainingBoxes(game) {
  return game.boxes.filter((owner) => owner === null).length;
}

export function validateGameState(value) {
  if (!value || value.schemaVersion !== 1 || value.size !== BOARD_SIZE) return false;
  if (!Array.isArray(value.players) || value.players.length < 2 || value.players.length > 4) return false;
  if (!Array.isArray(value.horizontal) || value.horizontal.length !== (BOARD_SIZE + 1) * BOARD_SIZE) return false;
  if (!Array.isArray(value.vertical) || value.vertical.length !== BOARD_SIZE * (BOARD_SIZE + 1)) return false;
  if (!Array.isArray(value.boxes) || value.boxes.length !== BOARD_SIZE * BOARD_SIZE) return false;
  if (!Array.isArray(value.scores) || value.scores.length !== value.players.length) return false;
  if (!Number.isInteger(value.currentPlayer) || value.currentPlayer < 0 || value.currentPlayer >= value.players.length) return false;
  if (!Number.isInteger(value.revision) || value.revision < 0) return false;
  return true;
}
