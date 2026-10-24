// The v7 story module increments revision on every authoritative state change.
// Read-only syncs, duplicate receipts and rejected commands must not rewrite
// the SQLite room snapshot and four rolling manuscript checkpoints.
export function isReadOnlyChyepukhaUpdate(room, previous, next) {
 return room?.gameId === 'chyepukha' && room.version === 'v7'
   && Number.isSafeInteger(previous?.revision)
   && Number.isSafeInteger(next?.revision)
   && previous.revision === next.revision;
}
