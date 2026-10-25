// A room checkpoint is a short-lived *seat credential*, never a media backup.
// Authenticated players may recover after a complete browser restart; guests
// only use per-tab session storage to avoid sharing their identity across tabs.
export const ROOM_RECOVERY_TTL_MS = 12 * 60 * 60 * 1000;
export const ROOM_RECOVERY_KEY = 'room-recovery-v1';
const ROOM_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createRoomRecovery({storage, identityKey, now = () => Date.now()}) {
 const read = () => {
  try {
   const value = JSON.parse(storage?.getItem(ROOM_RECOVERY_KEY) || 'null');
   const age = now() - value?.savedAt;
   if(!value || value.identityKey !== identityKey ||
      !ROOM_ID.test(value.roomId || '') ||
      !['host','guest'].includes(value.mode) ||
      typeof value.token !== 'string' || value.token.length < 16 ||
      !Number.isFinite(age) || age < -60_000 || age > ROOM_RECOVERY_TTL_MS)
     return null;
   return value;
  } catch { return null; }
 };
 return {
  read,
  save({roomId, token, mode}) {
   if(!ROOM_ID.test(roomId || '') || typeof token !== 'string' ||
      token.length < 16 || !['host','guest'].includes(mode)) return false;
   try {
    storage?.setItem(ROOM_RECOVERY_KEY, JSON.stringify({
     roomId, token, mode, identityKey, savedAt:now()
    }));
    return true;
   } catch { return false; }
  },
  clear() {
   try {
    // Never destroy another logged-in account's checkpoint on a shared browser.
    const raw = JSON.parse(storage?.getItem(ROOM_RECOVERY_KEY) || 'null');
    if(raw?.identityKey === identityKey) storage?.removeItem(ROOM_RECOVERY_KEY);
   } catch { /* Storage may have become unavailable. */ }
  }
 };
}
