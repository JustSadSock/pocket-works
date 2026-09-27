import { describe, expect, it } from 'vitest';
import { BOSS_TIME, applyUpgrade, createGame, getUpgradeChoices, restoreGame, serializeGame, startGame, stepGame } from './core';

describe('Iron Swarm simulation', () => {
  it('starts with three physical modules in separated slots', () => {
    const state = createGame(7);
    expect(state.modules.map((module) => module.kind)).toEqual(['gun', 'shield', 'saw']);
    expect(new Set(state.modules.map((module) => module.slot)).size).toBe(3);
  });

  it('moves the mech and starts spawning a crowd', () => {
    const state = createGame(11);
    startGame(state);
    for (let i = 0; i < 120; i++) stepGame(state, { moveX: 1, moveZ: 0, rigTarget: 0 }, 1 / 60);
    expect(state.playerX).toBeGreaterThan(4);
    expect(state.enemies.length).toBeGreaterThan(0);
  });

  it('offers three unique upgrades and can mount a missing module', () => {
    const state = createGame(19);
    const choices = getUpgradeChoices(state);
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(3);
    applyUpgrade(state, { id: 'add-mortar', title: 'Миномёт', detail: '', kind: 'mortar' });
    expect(state.modules.some((module) => module.kind === 'mortar')).toBe(true);
  });

  it('spawns the final boss when the director reaches the boss mark', () => {
    const state = createGame(23);
    startGame(state);
    state.time = BOSS_TIME - .02;
    stepGame(state, { moveX: 0, moveZ: 0, rigTarget: 0 }, .04);
    expect(state.bossSpawned).toBe(true);
    expect(state.enemies.some((enemy) => enemy.kind === 'boss')).toBe(true);
  });

  it('round-trips a resumable run', () => {
    const state = createGame(31);
    startGame(state);
    state.playerX = 4.25;
    state.kills = 17;
    const restored = restoreGame(serializeGame(state));
    expect(restored?.playerX).toBe(4.25);
    expect(restored?.kills).toBe(17);
    expect(restored?.phase).toBe('running');
  });
});
