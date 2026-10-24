// Chyepukha transport invariants; immutable game rules remain pinned.
export const CHYEPUKHA_SYNC_COOLDOWN_MS = 800;
export const CHYEPUKHA_STATE_HEADROOM_BYTES = 8 * 1024;
const encoder = new TextEncoder();

export function isChyepukhaSync(gameId, payload) {
  return gameId === 'chyepukha' && payload !== null &&
    typeof payload === 'object' && !Array.isArray(payload) && payload.type === 'sync';
}
export function canServeChyepukhaSync(lastAt, now) {
  return !Number.isFinite(lastAt) || now - lastAt >= CHYEPUKHA_SYNC_COOLDOWN_MS;
}
export function checkChyepukhaStateBudget(state, maxStateBytes) {
  const limit = maxStateBytes - CHYEPUKHA_STATE_HEADROOM_BYTES;
  if (!Number.isSafeInteger(maxStateBytes) || limit <= 0) throw Error('invalid_room_state_limit');
  const bytes = encoder.encode(JSON.stringify(state)).byteLength;
  return {ok: bytes <= limit, bytes, limit};
}
