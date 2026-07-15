export const SAVE_VERSION = 3;

const clampInt = (value, min, max, fallback = min) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
};

const finiteStroke = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
};

const normalizeCheckpoint = (value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  ? {
      x: Number(value.x),
      y: Number(value.y),
      safeX: Number.isFinite(Number(value.safeX)) ? Number(value.safeX) : Number(value.x),
      safeY: Number.isFinite(Number(value.safeY)) ? Number(value.safeY) : Number(value.y)
    }
  : null;

export function createDefaultSave(levelCount) {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    current: 0,
    best: Array(levelCount).fill(null),
    roundBest: null,
    campaignRun: null,
    endlessBest: 0,
    endlessBestStrokes: null,
    endlessRun: null,
    sound: true,
    haptics: true,
    tilt: false,
    hasAimed: false
  };
}

export function normalizeEndlessRun(value) {
  if (!value || typeof value !== 'object') return null;
  const seed = Number(value.seed) >>> 0;
  if (!seed) return null;
  return {
    seed,
    depth: Math.max(0, Math.trunc(Number(value.depth) || 0)),
    totalStrokes: Math.max(0, Math.trunc(Number(value.totalStrokes) || 0)),
    currentStrokes: finiteStroke(value.currentStrokes) ?? 0,
    checkpoint: normalizeCheckpoint(value.checkpoint),
    startedAt: Number.isFinite(Number(value.startedAt)) ? Number(value.startedAt) : Date.now()
  };
}

export function createCampaignRun(current, levelCount) {
  const hole = clampInt(current, 0, levelCount - 1, 0);
  return {
    startHole: hole,
    current: hole,
    strokes: Array(levelCount).fill(null),
    currentStrokes: 0,
    checkpoint: null,
    startedAt: Date.now()
  };
}

export function normalizeCampaignRun(value, levelCount) {
  if (!value || typeof value !== 'object') return null;
  const startHole = clampInt(value.startHole, 0, levelCount - 1, 0);
  const current = clampInt(value.current, startHole, levelCount - 1, startHole);
  const strokes = Array.from({ length: levelCount }, (_, index) => finiteStroke(value.strokes?.[index]));
  const checkpoint = normalizeCheckpoint(value.checkpoint);
  return {
    startHole,
    current,
    strokes,
    currentStrokes: finiteStroke(value.currentStrokes) ?? 0,
    checkpoint,
    startedAt: Number.isFinite(Number(value.startedAt)) ? Number(value.startedAt) : Date.now()
  };
}

export function normalizeSave(value, levelCount) {
  const defaults = createDefaultSave(levelCount);
  if (!value || typeof value !== 'object' || ![1, 2, SAVE_VERSION].includes(Number(value.version))) return defaults;
  const current = clampInt(value.current, 0, levelCount - 1, 0);
  return {
    ...defaults,
    version: SAVE_VERSION,
    unlocked: clampInt(value.unlocked, 1, levelCount, 1),
    current,
    best: Array.from({ length: levelCount }, (_, index) => finiteStroke(value.best?.[index])),
    roundBest: Number(value.version) === SAVE_VERSION ? finiteStroke(value.roundBest) : null,
    campaignRun: Number(value.version) === SAVE_VERSION ? normalizeCampaignRun(value.campaignRun, levelCount) : null,
    endlessBest: Math.max(0, Math.trunc(Number(value.endlessBest) || 0)),
    endlessBestStrokes: finiteStroke(value.endlessBestStrokes),
    endlessRun: normalizeEndlessRun(value.endlessRun),
    sound: value.sound !== false,
    haptics: value.haptics !== false,
    tilt: value.tilt === true,
    hasAimed: value.hasAimed === true
  };
}

export function checkpointCampaignRun(run, levelCount, hole, strokes, point, safePoint = point) {
  const normalized = normalizeCampaignRun(run, levelCount) || createCampaignRun(hole, levelCount);
  normalized.current = clampInt(hole, normalized.startHole, levelCount - 1, normalized.current);
  normalized.currentStrokes = finiteStroke(strokes) ?? 0;
  normalized.checkpoint = point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y, safeX: safePoint?.x ?? point.x, safeY: safePoint?.y ?? point.y }
    : null;
  return normalized;
}

export function checkpointEndlessRun(run, strokes, point, safePoint = point) {
  const normalized = normalizeEndlessRun(run);
  if (!normalized) return null;
  normalized.currentStrokes = finiteStroke(strokes) ?? 0;
  normalized.checkpoint = point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y, safeX: safePoint?.x ?? point.x, safeY: safePoint?.y ?? point.y }
    : null;
  return normalized;
}

export function recordCampaignHole(run, levelCount, hole, strokes) {
  const normalized = normalizeCampaignRun(run, levelCount) || createCampaignRun(hole, levelCount);
  const index = clampInt(hole, 0, levelCount - 1, 0);
  normalized.strokes[index] = finiteStroke(strokes) ?? 0;
  normalized.current = Math.min(levelCount - 1, index + 1);
  normalized.currentStrokes = 0;
  normalized.checkpoint = null;
  return normalized;
}

export function fullCampaignTotal(run, levelCount) {
  const normalized = normalizeCampaignRun(run, levelCount);
  if (!normalized || normalized.startHole !== 0 || !normalized.strokes.every(Number.isFinite)) return null;
  return normalized.strokes.reduce((sum, value) => sum + value, 0);
}

export function campaignSegmentTotal(run, levelCount) {
  const normalized = normalizeCampaignRun(run, levelCount);
  if (!normalized) return 0;
  return normalized.strokes.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function pluralRu(value, one, few, many) {
  const absolute = Math.abs(Math.trunc(Number(value) || 0));
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const strokeWord = (value) => pluralRu(value, 'удар', 'удара', 'ударов');
export const sectionWord = (value) => pluralRu(value, 'секция', 'секции', 'секций');
