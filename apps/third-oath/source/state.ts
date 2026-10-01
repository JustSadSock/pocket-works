export type GameMode = 'menu' | 'explore' | 'dialogue' | 'combat' | 'cutscene' | 'pause' | 'dead' | 'complete';

export type Skill = 'will' | 'insight';

export interface PlayerStats {
  will: number;
  insight: number;
}

export interface SaveState {
  schema: 1;
  health: number;
  maxHealth: number;
  resolve: number;
  inventory: string[];
  flags: Record<string, boolean>;
  checks: Record<string, boolean>;
  checkpoint: { x: number; y: number };
  position: { x: number; y: number };
  stats: PlayerStats;
  sound: boolean;
  completed: boolean;
  playSeconds: number;
  checkSeed: number;
}

const STORAGE_KEY = 'pocket-works:third-oath:save:v1';

export function freshSave(): SaveState {
  return {
    schema: 1,
    health: 5,
    maxHealth: 5,
    resolve: 0,
    inventory: [],
    flags: {},
    checks: {},
    checkpoint: { x: 450, y: 2100 },
    position: { x: 450, y: 2100 },
    stats: { will: 3, insight: 2 },
    sound: true,
    completed: false,
    playSeconds: 0,
    checkSeed: 7319
  };
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeSave(raw: unknown): SaveState {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<SaveState>;
  const maxHealth = Math.max(1, Math.min(9, finite(data.maxHealth, base.maxHealth)));
  const rawHealth = finite(data.health, base.health);
  const health = rawHealth <= 0 ? maxHealth : Math.max(0.5, Math.min(maxHealth, rawHealth));
  const resolve = Math.max(0, Math.min(100, finite(data.resolve, base.resolve)));
  const inventory = Array.isArray(data.inventory)
    ? [...new Set(data.inventory.filter((item): item is string => typeof item === 'string'))].slice(0, 40)
    : base.inventory;
  const flags = data.flags && typeof data.flags === 'object' ? { ...data.flags } as Record<string, boolean> : {};
  const checks = data.checks && typeof data.checks === 'object' ? { ...data.checks } as Record<string, boolean> : {};
  const position = data.position && typeof data.position === 'object'
    ? { x: finite(data.position.x, base.position.x), y: finite(data.position.y, base.position.y) }
    : base.position;
  const checkpoint = data.checkpoint && typeof data.checkpoint === 'object'
    ? { x: finite(data.checkpoint.x, base.checkpoint.x), y: finite(data.checkpoint.y, base.checkpoint.y) }
    : base.checkpoint;
  return {
    ...base,
    ...data,
    schema: 1,
    maxHealth,
    health,
    resolve,
    inventory,
    flags,
    checks,
    position: rawHealth <= 0 ? { ...checkpoint } : position,
    checkpoint,
    stats: {
      will: Math.max(0, Math.min(8, finite(data.stats?.will, base.stats.will))),
      insight: Math.max(0, Math.min(8, finite(data.stats?.insight, base.stats.insight)))
    },
    sound: data.sound !== false,
    completed: data.completed === true,
    playSeconds: Math.max(0, finite(data.playSeconds, 0)),
    checkSeed: Math.max(1, Math.floor(finite(data.checkSeed, base.checkSeed)))
  };
}

export function loadSave(): SaveState {
  if (typeof localStorage === 'undefined') return freshSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : freshSave();
  } catch {
    return freshSave();
  }
}

export function persistSave(save: SaveState) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch { /* storage may be unavailable */ }
}

export function clearSave() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

export function addItem(save: SaveState, id: string) {
  if (!save.inventory.includes(id)) save.inventory.push(id);
}

export function removeItem(save: SaveState, id: string) {
  save.inventory = save.inventory.filter((item) => item !== id);
}

export function hasItem(save: SaveState, id: string) {
  return save.inventory.includes(id);
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveHiddenCheck(save: SaveState, id: string, skill: Skill, difficulty: number) {
  if (id in save.checks) return save.checks[id];
  const roll = 1 + ((hash(id + ':' + save.checkSeed) + save.checkSeed) % 20);
  const result = roll + save.stats[skill] >= difficulty;
  save.checks[id] = result;
  return result;
}
