try {
  const payload = globalThis.__RAT_COMBAT_V2;
  if (typeof payload !== 'string' || payload.length !== 26413) {
    throw new Error(`Повреждён пакет боя: ${payload?.length ?? 0}/26413`);
  }
  eval(payload);
  if (typeof Simulation.prototype.resolveCollisions !== 'function' || typeof globalThis.drawUnit !== 'function') {
    throw new Error('Новая модель боя не активировалась');
  }
  globalThis.__RAT_COMBAT_V2_READY = true;
} catch (error) {
  globalThis.__RAT_COMBAT_V2_ERROR = error;
} finally {
  delete globalThis.__RAT_COMBAT_V2;
}
