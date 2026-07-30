export const STORAGE_SCHEMA = 2;

export function cloneValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function checksumText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeWorldForStorage(world) {
  const payload = cloneValue(world);
  if (!payload || typeof payload !== 'object') return null;
  payload.paused = false;
  payload.view = 'world';
  payload.fossilIndex = null;
  payload.selectedId = null;
  payload.selectedSpeciesId = null;
  payload.seedMode = false;
  return payload;
}

export function makeSnapshotRecord(world, revision = 1, savedAt = Date.now()) {
  const payload = normalizeWorldForStorage(world);
  if (!payload) throw new TypeError('КЛАДА: невозможно сохранить пустой мир');
  const json = JSON.stringify(payload);
  return {
    schema: STORAGE_SCHEMA,
    revision: Math.max(1, Math.round(Number(revision) || 1)),
    savedAt: Math.max(0, Math.round(Number(savedAt) || Date.now())),
    checksum: checksumText(json),
    json
  };
}

export function readSnapshotRecord(record) {
  if (!record || Number(record.schema) !== STORAGE_SCHEMA || typeof record.json !== 'string') return null;
  if (checksumText(record.json) !== record.checksum) return null;
  try {
    const payload = JSON.parse(record.json);
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
}

export function chooseSnapshot(primary, backup) {
  const candidates = [primary, backup]
    .map((record, index) => ({ record, payload: readSnapshotRecord(record), backup: index === 1 }))
    .filter((entry) => entry.payload)
    .sort((a, b) => (b.record.revision || 0) - (a.record.revision || 0));
  return candidates[0] || null;
}
