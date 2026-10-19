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
  return { players, act, view: i => game.viewForPlayer({ state, player: players[i] }) };
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
