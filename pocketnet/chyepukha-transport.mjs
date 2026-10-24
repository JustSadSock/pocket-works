// Chyepukha transport invariants; immutable game rules remain pinned.
export const CHYEPUKHA_SYNC_COOLDOWN_MS = 800;
export const CHYEPUKHA_STATE_HEADROOM_BYTES = 8 * 1024;
export const CHYEPUKHA_VIEW_HEADROOM_BYTES = 2 * 1024;
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

export function checkChyepukhaViewBudget(room, view, maxEventBytes) {
  if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes <= CHYEPUKHA_VIEW_HEADROOM_BYTES) throw Error('invalid_room_view_limit');
  const join = {roomId:room.id,gameId:room.gameId,version:room.version,state:view,players:room.players};
  const event = {roomId:room.id,event:{type:'state',payload:view}};
  const bytes = Math.max(encoder.encode(JSON.stringify(join)).byteLength,
    encoder.encode(JSON.stringify(event)).byteLength);
  return {ok:bytes <= maxEventBytes - CHYEPUKHA_VIEW_HEADROOM_BYTES,
    bytes,limit:maxEventBytes - CHYEPUKHA_VIEW_HEADROOM_BYTES};
}
