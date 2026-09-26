export type BossKind =
  | 'weather' | 'chef' | 'sport' | 'puppet' | 'noir' | 'signal'
  | 'auction' | 'western' | 'laboratory' | 'band' | 'court' | 'astrology' | 'director';

export type Palette = {
  paper: number;
  ink: number;
  accent: number;
  secondary: number;
  hazard: number;
  parry: number;
  sky: number;
};

export type StageDefinition = {
  id: number;
  code: string;
  name: string;
  strap: string;
  bossKind: BossKind;
  palette: Palette;
  runLength: number;
  encounterCount: number;
  baseBossHp: number;
  enemyDensity: number;
  gravity: number;
  moveSpeed: number;
  bossScale: number;
  unlockAfter: number;
};

export type StageStats = {
  stageId: number;
  mode: 'campaign' | 'archive' | 'encore';
  startedAt: number;
  elapsedMs: number;
  damageTaken: number;
  parries: number;
  deaths: number;
  shotsHit: number;
  shotsFired: number;
  score: number;
  grade: string;
};

export type BestRecord = {
  grade: string;
  score: number;
  timeMs: number;
  damageTaken: number;
  parries: number;
  clears: number;
};

export type SaveState = {
  version: 1;
  unlockedStage: number;
  completed: number[];
  best: Record<string, BestRecord>;
  totalPlayMs: number;
  deaths: number;
  sound: boolean;
  campaignComplete: boolean;
  encoreClears: number;
  lastStage: number;
};

export type InputState = {
  axis: number;
  jumpQueued: boolean;
  dashQueued: boolean;
  specialQueued: boolean;
  fireHeld: boolean;
};
