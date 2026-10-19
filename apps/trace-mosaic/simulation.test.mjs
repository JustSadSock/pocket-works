import test from 'node:test';
import assert from 'node:assert/strict';
import game, { createPractice } from './simulation.js';

function solo() {
  const player = { id: 'local-test', name: 'Tester' };
  let state = createPractice(player);
  function act(type, payload = {}) {
    state = game.onMessage({ state, player, payload: { type, payload } }).state;
    return game.viewForPlayer({ state, player });
  }
  return { player, act };
}

function team(n) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'player-' + i, name: 'Player ' + i }));
  let state = game.createRoom({ player: players[0], payload: { maxPlayers: n, durationSec: 180 } }).state;
  for (const player of players.slice(1)) state = game.onJoin({ state, player }).state;
  function act(playerIndex, type, payload = {}) {
    state = game.onMessage({ state, player: players[playerIndex], payload: { type, payload } }).state;
    return game.viewForPlayer({ state, player: players[playerIndex] });
  }
  return {
    players, act,
    view: i => game.viewForPlayer({ state, player: players[i] }),
    markStale: i => { state.room.players.find(p => p.id === players[i].id).lastSeenAt = Date.now() - 30000; },
    leave: i => { state = game.onLeave({ state, player: players[i] }).state; }
  };
}

test('solo round starts, places correctly, never farms a no-op', () => {
  const { act } = solo();
  let view = act('start_game');
  assert.equal(view.phase, 'playing');
  act('drag_update', { tileId: 0, cells: [0], targetCell: 0 });
  view = act('drag_end', { tileId: 0, cells: [0], targetCell: 0 });
  assert.equal(view.game.board[0], 0);
  assert.equal(view.players[0].stats.correctDrops, 1);
  assert.equal(view.players[0].stats.netFlow, 3);
  const completion = view.game.score.completion;
  act('drag_update', { tileId: 0, cells: [0], targetCell: 0 });
  view = act('drag_end', { tileId: 0, cells: [0], targetCell: 0 });
  assert.equal(view.players[0].stats.correctDrops, 1);
  assert.equal(view.players[0].stats.netFlow, 3);
  assert.equal(view.game.score.completion, completion);
});

test('server refuses fabricated nonadjacent and multi-tile teleport trails', () => {
  const { act } = solo();
  let view = act('start_game');
  const fullBoard = Array.from({ length: view.game.totalTiles }, (_, i) => i);
  act('drag_update', { tileId: 1, cells: fullBoard, targetCell: 1 });
  view = act('drag_end', { tileId: 1, cells: fullBoard, targetCell: 1 });
  assert.equal(view.game.trails.length, 0);
  assert.equal(view.game.board[1], null);
  act('drag_update', { tileId: 1, cells: [0, 15], targetCell: 15 });
  view = act('drag_end', { tileId: 1, cells: [0, 15], targetCell: 15 });
  assert.equal(view.game.trails.length, 0);
});

test('cancel does not create a trail or move a piece', () => {
  const { act } = solo();
  act('start_game');
  act('drag_update', { tileId: 2, cells: [2], targetCell: 2 });
  const view = act('drag_end', { tileId: 2, cells: [], targetCell: -1 });
  assert.equal(view.game.trails.length, 0);
  assert.equal(view.game.board[2], null);
});

for (const count of [3, 5]) {
  test(count + ' players get a complete disjoint set of tiles', () => {
    const { act, players, view } = team(count);
    for (let i = 1; i < count; i++) act(i, 'toggle_ready');
    const started = act(0, 'start_game');
    assert.equal(started.phase, 'playing');
    const allIds = players.flatMap((_, i) => view(i).game.assignments);
    assert.equal(allIds.length, started.game.totalTiles);
    assert.equal(new Set(allIds).size, allIds.length);
  });
}

test('repeated collision with same trace is counted only once', () => {
  const { act, view } = team(3);
  act(1, 'toggle_ready');
  act(2, 'toggle_ready');
  act(0, 'start_game');
  act(0, 'drag_update', { tileId: 0, cells: [0], targetCell: 0 });
  act(0, 'drag_end', { tileId: 0, cells: [0], targetCell: 0 });
  act(1, 'drag_update', { tileId: 1, cells: [0], targetCell: 0 });
  const once = view(1).players.find(p => p.id === 'player-1').stats.timesBlocked;
  act(1, 'drag_update', { tileId: 1, cells: [0], targetCell: 0 });
  const twice = view(1).players.find(p => p.id === 'player-1').stats.timesBlocked;
  assert.equal(once, 1);
  assert.equal(twice, once);
});

test('cancelled or moved-away correct piece cannot generate infinite net flow', () => {
  const { act } = solo();
  act('start_game');
  act('drag_update', { tileId: 0, cells: [0], targetCell: 0 });
  act('drag_end', { tileId: 0, cells: [0], targetCell: 0 });
  act('drag_update', { tileId: 0, cells: [0, 1], targetCell: 1 });
  let view = act('drag_end', { tileId: 0, cells: [0, 1], targetCell: 1 });
  assert.equal(view.players[0].stats.netFlow, 0);
  act('drag_update', { tileId: 0, cells: [1, 0], targetCell: 0 });
  view = act('drag_end', { tileId: 0, cells: [1, 0], targetCell: 0 });
  assert.equal(view.players[0].stats.netFlow, 3);
  assert.equal(view.players[0].stats.correctDrops, 1);
});

test('completed puzzle keeps its time bonus after the clock advances', () => {
  const { act } = solo();
  let view = act('start_game');
  for (let tileId = 0; tileId < view.game.totalTiles; tileId++) {
    act('drag_update', { tileId, cells: [tileId], targetCell: tileId });
    view = act('drag_end', { tileId, cells: [tileId], targetCell: tileId });
  }
  assert.equal(view.phase, 'results');
  assert.equal(view.game.score.completionPercent, 100);
  const finalScore = view.game.score.teamScore;
  const originalNow = Date.now;
  try {
    const future = originalNow() + 45000;
    Date.now = () => future;
    view = act('pulse');
    assert.equal(view.game.score.teamScore, finalScore);
  } finally {
    Date.now = originalNow;
  }
});

test('short disconnect does not transfer any fragments or host authority', () => {
  const t = team(3);
  t.act(1, 'toggle_ready');
  t.act(2, 'toggle_ready');
  const original = t.act(0, 'start_game');
  const baseline = original.game.tileMeta.map(tile => tile.ownerId).join(',');
  const time = Date.now;
  try {
    Date.now = () => time() + 12000;
    const view = t.act(1, 'pulse');
    assert.equal(view.hostId, t.players[0].id);
    assert.equal(view.game.tileMeta.map(tile => tile.ownerId).join(','), baseline);
  } finally { Date.now = time; }
});

for (const size of [3, 5]) {
  test(size + ' players: stale host passes control and unfinished pieces without losses', () => {
    const t = team(size);
    for (let i = 1; i < size; i++) t.act(i, 'toggle_ready');
    t.act(0, 'start_game');
    // The first piece is complete. Its location must survive redistribution.
    t.act(0, 'drag_update', { tileId: 0, cells: [0], targetCell: 0 });
    t.act(0, 'drag_end', { tileId: 0, cells: [0], targetCell: 0 });
    t.markStale(0);
    const changed = t.act(1, 'pulse');
    assert.equal(changed.hostId, t.players[1].id);
    assert.equal(changed.game.board[0], 0);
    assert.equal(changed.game.tileMeta.every(tile => tile.ownerId !== t.players[0].id || tile.id === 0), true);
    assert.equal(changed.players.find(p => p.id === t.players[0].id).connected, false);
    const assignments = changed.game.tileMeta.map(tile => tile.id);
    assert.equal(new Set(assignments).size, changed.game.totalTiles);
    for (const tile of changed.game.tileMeta) {
      assert.equal(changed.game.tileLocations[tile.id].ownerId, tile.ownerId);
    }
    const back = t.act(0, 'pulse');
    assert.equal(back.players.find(p => p.id === t.players[0].id).connected, true);
    assert.equal(back.hostId, t.players[1].id);
    assert.equal(back.game.assignments.length > 0, true);
  });
}

test('explicit leave during play transfers host and remaining fragments', () => {
  const t = team(3);
  t.act(1, 'toggle_ready');
  t.act(2, 'toggle_ready');
  t.act(0, 'start_game');
  t.leave(0);
  const view = t.view(1);
  assert.equal(view.hostId, t.players[1].id);
  assert.equal(view.players.some(p => p.id === t.players[0].id), false);
  assert.equal(view.game.tileMeta.every(tile => tile.ownerId !== t.players[0].id), true);
});

test('a live client settles the expired deadline even after all tabs slept', () => {
  const t = team(3);
  t.act(1, 'toggle_ready');
  t.act(2, 'toggle_ready');
  const playing = t.act(0, 'start_game');
  const originalNow = Date.now;
  try {
    Date.now = () => playing.game.endAt + 1000;
    const result = t.act(1, 'pulse');
    assert.equal(result.phase, 'results');
    assert.equal(result.game.score.timeLeftSec, 0);
    const resultAgain = t.act(1, 'pulse');
    assert.equal(resultAgain.game.score.teamScore, result.game.score.teamScore);
  } finally { Date.now = originalNow; }
});

for (const size of [3, 5]) {
  test(size + ' players can finish a complete authoritative online simulation', () => {
    const t = team(size);
    for (let i = 1; i < size; i++) t.act(i, 'toggle_ready');
    let view = t.act(0, 'start_game');
    for (let tileId = 0; tileId < view.game.totalTiles; tileId++) {
      const owner = view.game.tileMeta[tileId].ownerId;
      const playerIndex = t.players.findIndex(p => p.id === owner);
      t.act(playerIndex, 'drag_update', { tileId, cells: [tileId], targetCell: tileId });
      view = t.act(playerIndex, 'drag_end', { tileId, cells: [tileId], targetCell: tileId });
    }
    assert.equal(view.phase, 'results');
    assert.equal(view.game.score.completionPercent, 100);
    assert.equal(view.game.board.every((id, cell) => id === cell), true);
  });
}
