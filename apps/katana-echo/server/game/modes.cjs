const GHOST_MODES = {
  ECHO_TRAP: 'echo-trap',
  SHADOW_TAIL: 'shadow-tail',
  CHANNEL_ECHO: 'channel-echo'
};

function createGhostState(mode) {
  switch (mode) {
    case GHOST_MODES.ECHO_TRAP:
      return { buffer: [], playback: null, cooldown: 0 };
    case GHOST_MODES.SHADOW_TAIL:
      return { buffer: [], delayMs: 5000, ghostAlive: true, respawnTimer: 0 };
    case GHOST_MODES.CHANNEL_ECHO:
      return { buffer: [], delayMs: 5000, active: false, energy: 1, regen: 0.15 };
    default:
      return {};
  }
}

function updateGhost(player, dt) {
  const { ghostMode, ghost } = player;
  if (!ghostMode) return;
  if (ghostMode === GHOST_MODES.ECHO_TRAP) {
    ghost.cooldown = Math.max(0, ghost.cooldown - dt);
    ghost.buffer.push({ ...player.inputState, timestamp: Date.now() });
    const cutoff = Date.now() - 5000;
    ghost.buffer = ghost.buffer.filter((f) => f.timestamp >= cutoff);
    if (player.triggers.spawnGhost && ghost.cooldown === 0 && ghost.buffer.length) {
      ghost.playback = ghost.buffer.map((f) => ({ ...f }));
      ghost.cooldown = 8000;
      player.events.push({ type: 'ghostSpawn' });
    }
    if (ghost.playback && ghost.playback.length) {
      const frame = ghost.playback.shift();
      player.ghostInput = frame;
      if (!ghost.playback.length) ghost.playback = null;
    } else {
      player.ghostInput = null;
    }
    player.triggers.spawnGhost = false;
  } else if (ghostMode === GHOST_MODES.SHADOW_TAIL) {
    ghost.buffer.push({ ...player.inputState });
    if (ghost.buffer.length > 300) ghost.buffer.shift();
    if (ghost.buffer.length > 0) {
      player.ghostInput = ghost.buffer[0];
      ghost.buffer.shift();
    }
    ghost.respawnTimer = Math.max(0, ghost.respawnTimer - dt);
  } else if (ghostMode === GHOST_MODES.CHANNEL_ECHO) {
    ghost.buffer.push({ ...player.inputState });
    if (ghost.buffer.length > 300) ghost.buffer.shift();
    if (player.triggers.toggleGhost && ghost.energy > 0) {
      ghost.active = !ghost.active;
      player.triggers.toggleGhost = false;
    }
    if (ghost.active) {
      ghost.energy = Math.max(0, ghost.energy - dt * 0.00035);
      if (ghost.energy === 0) ghost.active = false;
      if (ghost.buffer.length > 0) {
        player.ghostInput = ghost.buffer[0];
        ghost.buffer.shift();
      }
    } else {
      ghost.energy = Math.min(1, ghost.energy + dt * ghost.regen);
      player.ghostInput = null;
    }
  }
}

module.exports = { GHOST_MODES, createGhostState, updateGhost };
