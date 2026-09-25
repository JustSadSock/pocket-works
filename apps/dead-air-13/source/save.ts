import type { BestRecord, SaveState, StageStats } from './types';

export const STORAGE_KEY = 'pocket-works:dead-air-13:save';

export const createDefaultSave = (): SaveState => ({
  version: 1,
  unlockedStage: 1,
  completed: [],
  best: {},
  totalPlayMs: 0,
  deaths: 0,
  sound: true,
  campaignComplete: false,
  encoreClears: 0,
  lastStage: 1
});

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};

export function loadSave(): SaveState {
  const fallback = createDefaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    if (parsed.version !== 1) return fallback;
    const completed = Array.isArray(parsed.completed)
      ? [...new Set(parsed.completed.map(Number).filter((id) => Number.isInteger(id) && id >= 1 && id <= 13))]
      : [];
    return {
      ...fallback,
      ...parsed,
      version: 1,
      unlockedStage: clampInt(parsed.unlockedStage, 1, 13, 1),
      completed,
      best: parsed.best && typeof parsed.best === 'object' ? parsed.best as Record<string, BestRecord> : {},
      totalPlayMs: clampInt(parsed.totalPlayMs, 0, Number.MAX_SAFE_INTEGER, 0),
      deaths: clampInt(parsed.deaths, 0, Number.MAX_SAFE_INTEGER, 0),
      encoreClears: clampInt(parsed.encoreClears, 0, Number.MAX_SAFE_INTEGER, 0),
      lastStage: clampInt(parsed.lastStage, 1, 13, 1),
      sound: parsed.sound !== false,
      campaignComplete: parsed.campaignComplete === true || completed.length >= 13
    };
  } catch {
    return fallback;
  }
}

export function persistSave(save: SaveState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch {}
}

export function recordStage(save: SaveState, stats: StageStats): SaveState {
  const key = String(stats.stageId);
  const previous = save.best[key];
  const nextBest: BestRecord = !previous ? {
    grade: stats.grade,
    score: stats.score,
    timeMs: stats.elapsedMs,
    damageTaken: stats.damageTaken,
    parries: stats.parries,
    clears: 1
  } : {
    grade: ['D','C','B','A','S'].indexOf(stats.grade) > ['D','C','B','A','S'].indexOf(previous.grade) ? stats.grade : previous.grade,
    score: Math.max(previous.score, stats.score),
    timeMs: Math.min(previous.timeMs, stats.elapsedMs),
    damageTaken: Math.min(previous.damageTaken, stats.damageTaken),
    parries: Math.max(previous.parries, stats.parries),
    clears: previous.clears + 1
  };

  const completed = [...new Set([...save.completed, stats.stageId])].sort((a,b) => a-b);
  const unlockedStage = Math.min(13, Math.max(save.unlockedStage, stats.stageId + 1));
  const next: SaveState = {
    ...save,
    completed,
    unlockedStage,
    best: { ...save.best, [key]: nextBest },
    totalPlayMs: save.totalPlayMs + stats.elapsedMs,
    campaignComplete: save.campaignComplete || completed.length >= 13,
    encoreClears: save.encoreClears + (stats.mode === 'encore' ? 1 : 0),
    lastStage: Math.min(13, stats.stageId + (stats.mode === 'campaign' ? 1 : 0))
  };
  persistSave(next);
  return next;
}

export function recordDeath(save: SaveState): SaveState {
  const next = { ...save, deaths: save.deaths + 1 };
  persistSave(next);
  return next;
}

export function clearSave(): SaveState {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  return createDefaultSave();
}
