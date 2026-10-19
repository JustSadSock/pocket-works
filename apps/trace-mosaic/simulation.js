function context(saved){const WebSocket={OPEN:1};const events=[];
const playerPalette = [
  "#ff6b6b",
  "#53d6ff",
  "#ffd166",
  "#7cf29c",
  "#c3a6ff",
  "#ff9f66",
];

const rooms = new Map();
const sockets = new Map();
const PRESENCE_GRACE_MS = 20000;

const artManifest = [{"id": "puzzle-01", "title": "Sky Loom", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-01.svg", "palette": ["#09131b", "#4cd5ff", "#ffe27a", "#f37272"], "difficulty": "easy"}, {"id": "puzzle-02", "title": "Petal Route", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-02.svg", "palette": ["#111827", "#b8ff5d", "#44c2ff", "#f5a6ff"], "difficulty": "medium"}, {"id": "puzzle-03", "title": "Neon Koi", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-03.svg", "palette": ["#140f1f", "#ffcc57", "#ff7b7b", "#7ce7db"], "difficulty": "spicy"}, {"id": "puzzle-04", "title": "Sand Relay", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-04.svg", "palette": ["#07131a", "#6cf0c2", "#76a5ff", "#f8f3d6"], "difficulty": "easy"}, {"id": "puzzle-05", "title": "Moss Beacon", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-05.svg", "palette": ["#11131a", "#f29e4c", "#f1c453", "#84dcc6"], "difficulty": "medium"}, {"id": "puzzle-06", "title": "Prism Orchard", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-06.svg", "palette": ["#0c1621", "#db5461", "#ffd166", "#3ec1d3"], "difficulty": "spicy"}, {"id": "puzzle-07", "title": "Nova Steps", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-07.svg", "palette": ["#09131b", "#4cd5ff", "#ffe27a", "#f37272"], "difficulty": "easy"}, {"id": "puzzle-08", "title": "Lagoon Pulse", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-08.svg", "palette": ["#111827", "#b8ff5d", "#44c2ff", "#f5a6ff"], "difficulty": "medium"}, {"id": "puzzle-09", "title": "Copper Bloom", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-09.svg", "palette": ["#140f1f", "#ffcc57", "#ff7b7b", "#7ce7db"], "difficulty": "spicy"}, {"id": "puzzle-10", "title": "Echo Nest", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-10.svg", "palette": ["#07131a", "#6cf0c2", "#76a5ff", "#f8f3d6"], "difficulty": "easy"}, {"id": "puzzle-11", "title": "Glass Dunes", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-11.svg", "palette": ["#11131a", "#f29e4c", "#f1c453", "#84dcc6"], "difficulty": "medium"}, {"id": "puzzle-12", "title": "Solar Stitch", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-12.svg", "palette": ["#0c1621", "#db5461", "#ffd166", "#3ec1d3"], "difficulty": "spicy"}, {"id": "puzzle-13", "title": "Mint Harbor", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-13.svg", "palette": ["#09131b", "#4cd5ff", "#ffe27a", "#f37272"], "difficulty": "easy"}, {"id": "puzzle-14", "title": "Amber Chorus", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-14.svg", "palette": ["#111827", "#b8ff5d", "#44c2ff", "#f5a6ff"], "difficulty": "medium"}, {"id": "puzzle-15", "title": "Fjord Signal", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-15.svg", "palette": ["#140f1f", "#ffcc57", "#ff7b7b", "#7ce7db"], "difficulty": "spicy"}, {"id": "puzzle-16", "title": "Drift Atlas", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-16.svg", "palette": ["#07131a", "#6cf0c2", "#76a5ff", "#f8f3d6"], "difficulty": "easy"}, {"id": "puzzle-17", "title": "Ribbon Spring", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-17.svg", "palette": ["#11131a", "#f29e4c", "#f1c453", "#84dcc6"], "difficulty": "medium"}, {"id": "puzzle-18", "title": "Quiet Meteor", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-18.svg", "palette": ["#0c1621", "#db5461", "#ffd166", "#3ec1d3"], "difficulty": "spicy"}, {"id": "puzzle-19", "title": "Golden Mural", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-19.svg", "palette": ["#09131b", "#4cd5ff", "#ffe27a", "#f37272"], "difficulty": "easy"}, {"id": "puzzle-20", "title": "Circuit Meadow", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-20.svg", "palette": ["#111827", "#b8ff5d", "#44c2ff", "#f5a6ff"], "difficulty": "medium"}, {"id": "puzzle-21", "title": "Velvet Tide", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-21.svg", "palette": ["#140f1f", "#ffcc57", "#ff7b7b", "#7ce7db"], "difficulty": "spicy"}, {"id": "puzzle-22", "title": "Crimson Grove", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-22.svg", "palette": ["#07131a", "#6cf0c2", "#76a5ff", "#f8f3d6"], "difficulty": "easy"}, {"id": "puzzle-23", "title": "Signal Fern", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-23.svg", "palette": ["#11131a", "#f29e4c", "#f1c453", "#84dcc6"], "difficulty": "medium"}, {"id": "puzzle-24", "title": "Polar Bloom", "width": 1600, "height": 1200, "path": "./assets/puzzles/puzzle-24.svg", "palette": ["#0c1621", "#db5461", "#ffd166", "#3ec1d3"], "difficulty": "spicy"}];

function makeId(length=6){return crypto.randomUUID().replaceAll('-','').slice(0,length).toUpperCase();}

function chooseGrid(playerCount) {
  if (playerCount <= 3) {
    return { cols: 4, rows: 4 };
  }
  if (playerCount === 4) {
    return { cols: 5, rows: 4 };
  }
  return { cols: 5, rows: 5 };
}

function chunkAssignments(totalTiles, playerIds) {
  const assignments = {};
  playerIds.forEach((playerId) => {
    assignments[playerId] = [];
  });
  for (let tileId = 0; tileId < totalTiles; tileId += 1) {
    const playerId = playerIds[tileId % playerIds.length];
    assignments[playerId].push(tileId);
  }
  return assignments;
}

function createGame(room) {
  const readyPlayers = Array.from(room.players.values()).filter((player) => player.connected);
  const grid = chooseGrid(readyPlayers.length);
  const totalTiles = grid.cols * grid.rows;
  const image = artManifest[(room.imageCursor || 0) % Math.max(artManifest.length, 1)] || {
    id: "fallback",
    title: "Fallback Bloom",
    path: "/assets/puzzles/puzzle-01.svg",
    width: 1600,
    height: 1200,
    palette: ["#1f2937", "#fbbf24", "#38bdf8"],
  };
  const playerIds = readyPlayers.map((player) => player.id);
  const assignments = chunkAssignments(totalTiles, playerIds);
  const durationSec = room.settings.durationSec;
  const tileMeta = Array.from({ length: totalTiles }, (_, tileId) => ({
    id: tileId,
    correctCell: tileId,
    ownerId: playerIds[tileId % playerIds.length],
  }));
  const now = Date.now();
  room.game = {
    image,
    grid,
    totalTiles,
    assignments,
    tileMeta,
    board: Array(totalTiles).fill(null),
    tileLocations: Object.fromEntries(tileMeta.map((tile) => [tile.id, { ownerId: tile.ownerId, kind: "inventory", slot: assignments[tile.ownerId].indexOf(tile.id) }])),
    trails: [],
    activeDrags: {},
    startedAt: now,
    endAt: now + durationSec * 1000,
    durationSec,
    completedAt: null,
  };
  room.phase = "playing";
  readyPlayers.forEach((player) => {
    player.ready = false;
    player.stats = {
      correctDrops: 0,
      wrongDrops: 0,
      trailBlocksCaused: 0,
      timesBlocked: 0,
      movedTiles: 0,
      netFlow: 0,
    };
  });
}

function createRoom(hostSocket, payload) {
  const roomId = makeId(5);
  const room = {
    id: roomId,
    hostId: hostSocket.playerId,
    createdAt: Date.now(),
    imageCursor: Math.floor(Math.random() * Math.max(artManifest.length, 1)),
    phase: "lobby",
    settings: {
      durationSec: clampNumber(payload?.durationSec, 90, 180, 120),
      maxPlayers: clampNumber(payload?.maxPlayers, 3, 5, 3),
    },
    players: new Map(),
    game: null,
  };
  rooms.set(roomId, room);
  joinRoom(hostSocket, { roomId, nickname: payload?.nickname });
  return room;
}

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getPlayerSnapshot(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    color: player.color,
    ready: player.ready,
    connected: player.connected,
    isHost: player.isHost,
    stats: player.stats,
  };
}

function buildRoomSnapshot(room, viewerId) {
  const players = Array.from(room.players.values()).map(getPlayerSnapshot);
  const snapshot = {
    roomId: room.id,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players,
    reconnectGraceSec: PRESENCE_GRACE_MS / 1000,
    viewerId,
    imagePreview: artManifest[(room.imageCursor || 0) % Math.max(artManifest.length, 1)] || null,
    catalogSize: artManifest.length,
  };
  if (room.game) {
    snapshot.game = buildGameSnapshot(room, viewerId);
  }
  return snapshot;
}

function buildGameSnapshot(room, viewerId) {
  const { game } = room;
  const player = room.players.get(viewerId);
  const assignments = game.assignments[viewerId] || [];
  return {
    image: game.image,
    grid: game.grid,
    totalTiles: game.totalTiles,
    durationSec: game.durationSec,
    startedAt: game.startedAt,
    endAt: game.endAt,
    board: game.board,
    tileMeta: game.tileMeta,
    tileLocations: game.tileLocations,
    assignments,
    trails: game.trails,
    activeDrags: game.activeDrags,
    score: getRoomScore(room),
    viewerStats: player?.stats || null,
  };
}

function broadcastRoom(room){}

function send(socket, type, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify({ type, payload }));
}

function joinRoom(socket, payload) {
  const room = rooms.get(String(payload?.roomId || "").trim().toUpperCase());
  if (!room) {
    send(socket, "toast", { tone: "error", message: "Room not found" });
    return null;
  }
  if ((room.phase === "playing" || room.phase === "results") && !room.players.has(socket.playerId)) {
    send(socket, "toast", { tone: "error", message: "Round already running" });
    return null;
  }
  if (room.players.size >= room.settings.maxPlayers && !room.players.has(socket.playerId)) {
    send(socket, "toast", { tone: "error", message: "Room is full" });
    return null;
  }
  leaveCurrentRoom(socket, false);
  const existing = room.players.get(socket.playerId);
  const color = existing?.color || playerPalette[room.players.size % playerPalette.length];
  const player = existing || {
    id: socket.playerId,
    color,
    ready: false,
    connected: true,
    lastSeenAt: Date.now(),
    socket,
    stats: {
      correctDrops: 0,
      wrongDrops: 0,
      trailBlocksCaused: 0,
      timesBlocked: 0,
      movedTiles: 0,
      netFlow: 0,
    },
  };
  player.nickname = sanitizeNickname(payload?.nickname || existing?.nickname || `Player ${room.players.size + 1}`);
  player.connected = true;
  player.lastSeenAt = Date.now();
  player.socket = socket;
  player.isHost = room.hostId === player.id;
  room.players.set(player.id, player);
  socket.roomId = room.id;
  broadcastRoom(room);
  return room;
}

function sanitizeNickname(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Player";
  }
  return trimmed.slice(0, 18);
}

function leaveCurrentRoom(socket, notify = true) {
  if (!socket.roomId) {
    return;
  }
  const room = rooms.get(socket.roomId);
  if (!room) {
    socket.roomId = null;
    return;
  }
  const player = room.players.get(socket.playerId);
  if (player) {
    if (room.game?.activeDrags) delete room.game.activeDrags[player.id];
    player.connected = false;
    player.ready = false;
    player.socket = null;
    if (room.phase === "lobby") {
      room.players.delete(player.id);
    }
  }
  if (room.hostId === socket.playerId) {
    room.hostId = Array.from(room.players.values()).find(p=>p.id !== socket.playerId && p.connected)?.id || null;
  }
  if (room.phase !== "lobby") room.players.delete(socket.playerId);
  maintainPresence(room);
  socket.roomId = null;
  cleanupRoom(room);
  if (notify && rooms.has(room.id)) {
    broadcastRoom(room);
  }
}

function cleanupRoom(room) {
  const activePlayers = Array.from(room.players.values()).filter((player) => player.connected);
  if (activePlayers.length === 0 && room.phase !== "playing") {
    rooms.delete(room.id);
  }
}


function rebuildAssignments(game) {
  const result = {};
  for (const tile of game.tileMeta) {
    (result[tile.ownerId] ||= []).push(tile.id);
    if (game.tileLocations[tile.id]) game.tileLocations[tile.id].ownerId = tile.ownerId;
  }
  for (const tiles of Object.values(result)) tiles.forEach((id, slot) => {
    const location = game.tileLocations[id];
    if (location?.kind === "inventory") location.slot = slot;
  });
  game.assignments = result;
}
function maintainPresence(room, now = Date.now()) {
  const active = [];
  for (const p of room.players.values()) {
    const alive = room.practice || (p.connected !== false &&
      now - (Number.isFinite(p.lastSeenAt) ? p.lastSeenAt : room.createdAt) <= PRESENCE_GRACE_MS);
    p.connected = !!alive;
    if (alive) active.push(p);
    else {
      p.ready = false;
      if (room.game?.activeDrags) delete room.game.activeDrags[p.id];
    }
  }
  if (!active.some(p => p.id === room.hostId) && active.length) room.hostId = active[0].id;
  for (const p of room.players.values()) p.isHost = p.id === room.hostId;
  if (room.phase !== "playing" || !room.game || !active.length) return;
  const game = room.game, online = new Set(active.map(p=>p.id));
  const inventory = new Map(active.map(p=>[p.id,0]));
  for (const tile of game.tileMeta) {
    if (online.has(tile.ownerId) && game.tileLocations[tile.id]?.kind === "inventory")
      inventory.set(tile.ownerId, inventory.get(tile.ownerId)+1);
  }
  let changed = false;
  for (const tile of game.tileMeta) {
    if (online.has(tile.ownerId)) continue;
    const loc = game.tileLocations[tile.id];
    if (loc?.kind === "board" && loc.cell === tile.correctCell) continue;
    const next = [...inventory.keys()].sort((x,y)=>inventory.get(x)-inventory.get(y))[0];
    if (!next) continue;
    tile.ownerId = next; inventory.set(next,inventory.get(next)+1); changed = true;
  }
  for (const p of active) {
    if (inventory.get(p.id) > 0) continue;
    const movable = game.tileMeta.filter(tile=>tile.ownerId !== p.id &&
      game.tileLocations[tile.id]?.kind === "inventory" &&
      !Object.values(game.activeDrags).some(d=>d.tileId===tile.id));
    movable.sort((x,y)=>(inventory.get(y.ownerId)||0)-(inventory.get(x.ownerId)||0));
    const donor = movable[0];
    if (!donor || inventory.get(donor.ownerId)<=1) continue;
    inventory.set(donor.ownerId,inventory.get(donor.ownerId)-1);
    inventory.set(p.id,1); donor.ownerId=p.id; changed=true;
  }
  if(changed) rebuildAssignments(game);
}

function handleToggleReady(socket) {
  const room = rooms.get(socket.roomId);
  if (!room || room.phase !== "lobby") {
    return;
  }
  const player = room.players.get(socket.playerId);
  if (!player) {
    return;
  }
  player.ready = !player.ready;
  broadcastRoom(room);
}

function handleCycleImage(socket, delta) {
  const room = rooms.get(socket.roomId);
  if (!room || room.hostId !== socket.playerId || room.phase !== "lobby" || artManifest.length === 0) {
    return;
  }
  room.imageCursor = (room.imageCursor + delta + artManifest.length) % artManifest.length;
  broadcastRoom(room);
}

function handleUpdateSettings(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room || room.hostId !== socket.playerId || room.phase !== "lobby") {
    return;
  }
  room.settings.durationSec = clampNumber(payload?.durationSec, 90, 180, room.settings.durationSec);
  room.settings.maxPlayers = clampNumber(payload?.maxPlayers, 3, 5, room.settings.maxPlayers);
  broadcastRoom(room);
}

function handleStartGame(socket) {
  const room = rooms.get(socket.roomId);
  if (!room || room.hostId !== socket.playerId || room.phase !== "lobby") {
    return;
  }
  const connectedPlayers = Array.from(room.players.values()).filter((player) => player.connected);
  const readyPlayers = connectedPlayers.filter((player) => player.ready || player.id === room.hostId);
  if (connectedPlayers.length < (room.practice?1:3)) {
    send(socket, "toast", { tone: "error", message: "Need at least 3 players" });
    return;
  }
  if (readyPlayers.length !== connectedPlayers.length) {
    send(socket, "toast", { tone: "error", message: "Everyone must be ready" });
    return;
  }
  createGame(room);
  broadcastRoom(room);
}

function getTrailCellOwner(game, cellIndex, viewerId) {
  const now = Date.now();
  for (const trail of game.trails) {
    if (trail.playerId === viewerId) {
      continue;
    }
    if (trail.expiresAt <= now) {
      continue;
    }
    if (trail.cells.includes(cellIndex)) {
      return trail.playerId;
    }
  }
  for (const [playerId, active] of Object.entries(game.activeDrags)) {
    if (playerId === viewerId) {
      continue;
    }
    if (active.cells.includes(cellIndex)) {
      return playerId;
    }
  }
  return null;
}

function normalizeCellList(value, maxCells) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item < maxCells)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, maxCells);
}

function areNeighborCells(a, b, cols) {
  const dx = Math.abs(a % cols - b % cols);
  const dy = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  return (dx > 0 || dy > 0) && dx <= 1 && dy <= 1;
}

function handleDragUpdate(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room || room.phase !== "playing" || !room.game) return;
  const player = room.players.get(socket.playerId);
  if (!player || !player.connected) return;
  const { game } = room;
  const tileId = Number(payload?.tileId);
  const tile = game.tileMeta[tileId];
  const location = game.tileLocations[tileId];
  if (!tile || tile.ownerId !== socket.playerId || location?.ownerId !== socket.playerId) return;
  const active = game.activeDrags[socket.playerId];
  if (active && active.tileId !== tileId) return;

  // Treat client paths as proposals, never as authoritative block lists.
  const cells = normalizeCellList(payload?.cells, game.totalTiles);
  if (!Array.isArray(payload?.cells) || cells.length === 0 ||
      cells.length !== payload.cells.length ||
      cells.some((cell, i) => cell !== payload.cells[i])) return;
  const oldCells = active?.cells || [];
  if (cells.length < oldCells.length || oldCells.some((cell, i) => cells[i] !== cell)) return;
  if (!active && location.kind === "board" && cells[0] !== location.cell) return;
  // A pointer sweep across the entire board cannot trace a 25-cell snake in one packet.
  if (cells.length - oldCells.length > Math.max(game.grid.cols, game.grid.rows) + 1) return;
  for (let i = Math.max(1, oldCells.length); i < cells.length; i += 1) {
    if (!areNeighborCells(cells[i - 1], cells[i], game.grid.cols)) return;
  }
  const targetCell = Number.isInteger(payload?.targetCell) ? payload.targetCell : -1;
  if (!cells.includes(targetCell)) return;

  const blockedCell = cells.find((cell) => getTrailCellOwner(game, cell, socket.playerId));
  if (blockedCell !== undefined) {
    const blockerId = getTrailCellOwner(game, blockedCell, socket.playerId);
    const blockedKey = blockerId + ":" + blockedCell;
    if (active?.lastDenied !== blockedKey) {
      const blocker = room.players.get(blockerId);
      if (blocker) { blocker.stats.trailBlocksCaused += 1; blocker.stats.netFlow -= 1; }
      player.stats.timesBlocked += 1;
      player.stats.netFlow -= 1;
    }
    game.activeDrags[socket.playerId] = {
      ...(active || { playerId: socket.playerId, color: player.color, tileId, cells: oldCells, targetCell: null }),
      lastDenied: blockedKey, updatedAt: Date.now()
    };
    send(socket, "drag_denied", { tileId, blockedCell, blockerId });
    return;
  }

  game.activeDrags[socket.playerId] = {
    playerId: socket.playerId, color: player.color, tileId,
    cells, targetCell, updatedAt: Date.now(), lastDenied: null
  };
  broadcastRoom(room);
}

function handleDragEnd(socket, payload) {
  const room = rooms.get(socket.roomId);
  if (!room || room.phase !== "playing" || !room.game) return;
  const player = room.players.get(socket.playerId);
  if (!player || !player.connected) return;
  const { game } = room;
  const active = game.activeDrags[socket.playerId];
  const tileId = Number(payload?.tileId);
  const tile = game.tileMeta[tileId];
  if (!active || !tile || active.tileId !== tileId || tile.ownerId !== socket.playerId) return;
  delete game.activeDrags[socket.playerId];

  const destinationCell = Number.isInteger(payload?.targetCell) ? payload.targetCell : -1;
  // An empty-path or out-of-board release is a cancellation, never a scored drop.
  if (!Array.isArray(payload?.cells) || !payload.cells.length || destinationCell < 0 ||
      !active.cells.length || !active.cells.includes(destinationCell)) {
    broadcastRoom(room);
    return;
  }

  const pathCells = active.cells; // trusted server-validated path, not payload.cells
  const now = Date.now();
  game.trails.push({
    id: socket.playerId + "-" + now,
    playerId: socket.playerId,
    color: player.color,
    cells: pathCells,
    createdAt: now,
    expiresAt: now + 30000
  });

  const currentLocation = game.tileLocations[tileId];
  const canPlaceOnCell =
    destinationCell < game.totalTiles &&
    (game.board[destinationCell] === null || game.board[destinationCell] === tileId);
  if (canPlaceOnCell && getTrailCellOwner(game, destinationCell, socket.playerId) === null) {
    // Releasing in the same occupied cell is a no-op, not another correct placement.
    const oldCell = currentLocation?.kind === "board" ? currentLocation.cell : null;
    if (oldCell !== destinationCell) {
      const wasCorrect = oldCell === tile.correctCell;
      const isCorrect = destinationCell === tile.correctCell;
      if (oldCell !== null && Number.isInteger(oldCell)) game.board[oldCell] = null;
      game.board[destinationCell] = tileId;
      game.tileLocations[tileId] = { ownerId: socket.playerId, kind: "board", cell: destinationCell };
      player.stats.movedTiles += 1;
      if (isCorrect && !wasCorrect) {
        player.stats.netFlow += 3;
        if (!tile.everCorrect) { player.stats.correctDrops += 1; tile.everCorrect = true; }
      } else if (wasCorrect && !isCorrect) {
        player.stats.wrongDrops += 1;
        player.stats.netFlow -= 3;
      } else if (!isCorrect) {
        player.stats.wrongDrops += 1;
        player.stats.netFlow -= 1;
      }
    }
  }
  expireTrails(game);
  maybeFinishGame(room);
  broadcastRoom(room);
}

function expireTrails(game) {
  const now = Date.now();
  game.trails = game.trails.filter((trail) => trail.expiresAt > now);
  for (const [playerId, drag] of Object.entries(game.activeDrags)) {
    if (now - drag.updatedAt > 10000) delete game.activeDrags[playerId];
  }
}

function getCompletion(room) {
  if (!room.game) {
    return 0;
  }
  let correct = 0;
  room.game.board.forEach((tileId, cellIndex) => {
    if (tileId === null || tileId === undefined) {
      return;
    }
    if (room.game.tileMeta[tileId]?.correctCell === cellIndex) {
      correct += 1;
    }
  });
  return correct / room.game.totalTiles;
}

function getRoomScore(room) {
  const completion = getCompletion(room);
  if (!room.game) {
    return {
      completion,
      completionPercent: 0,
      timeLeftSec: 0,
      teamScore: 0,
    };
  }
  // Freeze the speed bonus at completion; finished games must never decay.
  const scoreTime = room.game.completedAt ?? Date.now();
  const timeLeftSec = Math.max(0, Math.ceil((room.game.endAt - scoreTime) / 1000));
  const speedWeight = completion === 1 ? timeLeftSec / room.game.durationSec : (timeLeftSec / room.game.durationSec) * completion;
  const teamScore = Math.round(completion * 700 + speedWeight * 300);
  return {
    completion,
    completionPercent: Math.round(completion * 100),
    timeLeftSec,
    teamScore,
  };
}

function maybeFinishGame(room) {
  if (!room.game || room.phase !== "playing") {
    return;
  }
  const completion = getCompletion(room);
  if (completion === 1 || Date.now() >= room.game.endAt) {
    room.phase = "results";
    room.game.completedAt = Date.now();
  }
}

function handlePlayAgain(socket) {
  const room = rooms.get(socket.roomId);
  if (!room || room.hostId !== socket.playerId) {
    return;
  }
  room.phase = "lobby";
  room.game = null;
  room.imageCursor = (room.imageCursor + 1) % Math.max(artManifest.length, 1);
  for (const player of room.players.values()) {
    player.ready = player.connected && player.id !== room.hostId ? false : false;
  }
  broadcastRoom(room);
}

function tickGames() {
  for (const room of rooms.values()) {
    if (!room.game) {
      continue;
    }
    expireTrails(room.game);
    maybeFinishGame(room);
    broadcastRoom(room);
  }
}


 function socket(id){let s=sockets.get(id);if(s)return s;s={playerId:id,roomId:null,readyState:1,send(text){const m=JSON.parse(text);if(m.type!=='room_state')events.push({type:'legacy',to:id,payload:m});}};sockets.set(id,s);return s;}
 let room=null;
 if(saved){room={...structuredClone(saved.room),players:new Map(saved.room.players.map(p=>[p.id,{...structuredClone(p),socket:socket(p.id)}]))};rooms.set(room.id,room);for(const p of room.players.values())p.socket.roomId=room.id;}
 function pack(r){return {room:{...r,players:[...r.players.values()].map(p=>({...p,socket:null}))}};}
 return {room,events,socket,pack,create:createRoom,join:joinRoom,leave:leaveCurrentRoom,view:buildRoomSnapshot,
 touch(id){const p=room?.players.get(id);if(p){p.lastSeenAt=Date.now();p.connected=true;}},
  tick(){if(room){maintainPresence(room);if(room.game){expireTrails(room.game);maybeFinishGame(room);}}},
 message(s,type,p){switch(type){case 'toggle_ready':handleToggleReady(s);break;case 'cycle_image':handleCycleImage(s,Number(p?.delta)>=0?1:-1);break;case 'update_settings':handleUpdateSettings(s,p);break;case 'start_game':handleStartGame(s);break;case 'drag_update':handleDragUpdate(s,p);break;case 'drag_end':handleDragEnd(s,p);break;case 'play_again':handlePlayAgain(s);break;case 'pulse':break;default:throw Error('Неизвестная команда');}}
 };
}
function output(c,r){return {state:c.pack(r),events:[...c.events,{type:'state',payload:{}}]};}
export default {protocolVersion:1,
 createRoom({player,payload}){const c=context(null),s=c.socket(player.id);const r=c.create(s,payload);return output(c,r);},
  onJoin({state,player}){const c=context(state),r=c.room,s=c.socket(player.id);if(r.players.has(player.id)){const p=r.players.get(player.id);p.connected=true;p.lastSeenAt=Date.now();p.socket=s;}else{if(!c.join(s,{roomId:r.id,nickname:player.name}))throw Error('Комната заполнена или раунд уже начат');}c.tick();return output(c,r);},
 onLeave({state,player}){const c=context(state),r=c.room;c.leave(c.socket(player.id),true);return output(c,r);},
  onMessage({state,player,payload:m}){const c=context(state),r=c.room;if(!r.players.has(player.id))throw Error('Игрок не в комнате');c.touch(player.id);c.tick();c.message(c.socket(player.id),m?.type,m?.payload);c.tick();return output(c,r);},
 viewForPlayer({state,player}){const c=context(state);return {...c.view(c.room,player.id),practice:c.room.practice===true};}
};
export function createPractice(player){const c=context(null),r=c.create(c.socket(player.id),{nickname:player.name});r.practice=true;return c.pack(r);}
