import type { BossKind, Palette, StageDefinition } from './types';

const p = (paper: number, ink: number, accent: number, secondary: number, hazard: number, parry: number, sky: number): Palette =>
  ({ paper, ink, accent, secondary, hazard, parry, sky });

export const STAGES: StageDefinition[] = [
  { id:1, code:'CH 01', name:'LOCAL WEATHER', strap:'Tonight: impossible conditions.', bossKind:'weather', palette:p(0xeadfc6,0x1a2220,0xe95d3f,0x5b817d,0xe7bb49,0xff64c8,0x96b8ad), runLength:8200, encounterCount:4, baseBossHp:1380, enemyDensity:0.86, gravity:1180, moveSpeed:294, bossScale:1.0, unlockAfter:0 },
  { id:2, code:'CH 02', name:'DINNER AT ELEVEN', strap:'A recipe with no exit.', bossKind:'chef', palette:p(0xf1d2a5,0x2a211e,0xc8422d,0x7b8e55,0xe8902e,0xff6bc9,0x8a6f56), runLength:9000, encounterCount:4, baseBossHp:1560, enemyDensity:0.94, gravity:1200, moveSpeed:298, bossScale:1.0, unlockAfter:1 },
  { id:3, code:'CH 03', name:'SUNDAY FINAL', strap:'The crowd wants overtime.', bossKind:'sport', palette:p(0xe8e1c9,0x151a1d,0x2f6cb1,0xd25e39,0xf1c84a,0xff63cb,0x7ea29d), runLength:9800, encounterCount:5, baseBossHp:1760, enemyDensity:1.00, gravity:1220, moveSpeed:302, bossScale:1.02, unlockAfter:2 },
  { id:4, code:'CH 04', name:'SMILE CLUB', strap:'Everybody is happy. Keep smiling.', bossKind:'puppet', palette:p(0xf3d7cf,0x2e2730,0x7d66bd,0xf09cbd,0xd94a5b,0xff55c8,0xa8d0cc), runLength:14300, encounterCount:6, baseBossHp:2650, enemyDensity:1.02, gravity:1160, moveSpeed:294, bossScale:1.03, unlockAfter:3 },
  { id:5, code:'CH 05', name:'THE LAST CASE', strap:'Rain. Smoke. One witness.', bossKind:'noir', palette:p(0xd8d4c8,0x171819,0xb83232,0x676b68,0xd8d4c8,0xff5bc8,0x454847), runLength:15300, encounterCount:6, baseBossHp:2950, enemyDensity:1.05, gravity:1210, moveSpeed:296, bossScale:1.05, unlockAfter:4 },
  { id:6, code:'CH 06', name:'PLEASE STAND BY', strap:'There is no scheduled programme.', bossKind:'signal', palette:p(0xe6e0cb,0x101315,0x36b8a8,0xe85850,0xf3d643,0xff62ce,0x263a3c), runLength:16400, encounterCount:7, baseBossHp:3250, enemyDensity:1.10, gravity:1220, moveSpeed:298, bossScale:1.05, unlockAfter:5 },
  { id:7, code:'CH 07', name:'LOT 77', strap:'Everything must go.', bossKind:'auction', palette:p(0xe5d5b5,0x241e1c,0x9f3030,0x5f8067,0xd99a38,0xff61ca,0x7a6f63), runLength:17500, encounterCount:7, baseBossHp:3550, enemyDensity:1.15, gravity:1230, moveSpeed:300, bossScale:1.06, unlockAfter:6 },
  { id:8, code:'CH 08', name:'HIGH NOON AGAIN', strap:'The clock refuses to move.', bossKind:'western', palette:p(0xefd2a2,0x2c2118,0xbe4b31,0x46776a,0xdc9d3a,0xff5fca,0xbe8b5b), runLength:18700, encounterCount:7, baseBossHp:3900, enemyDensity:1.20, gravity:1240, moveSpeed:302, bossScale:1.07, unlockAfter:7 },
  { id:9, code:'CH 09', name:'OPEN LAB', strap:'Volunteers were not requested.', bossKind:'laboratory', palette:p(0xdce4ce,0x17221f,0x3b8c7c,0x9c69aa,0xd64a40,0xff58cf,0x6e938d), runLength:19900, encounterCount:8, baseBossHp:4250, enemyDensity:1.25, gravity:1190, moveSpeed:304, bossScale:1.07, unlockAfter:8 },
  { id:10, code:'CH 10', name:'MIDNIGHT HOUSE BAND', strap:'One more song. Then another.', bossKind:'band', palette:p(0xead8b7,0x19191d,0xd94b73,0x477f9a,0xf0b33c,0xff60d2,0x37364d), runLength:21200, encounterCount:8, baseBossHp:4600, enemyDensity:1.30, gravity:1210, moveSpeed:306, bossScale:1.08, unlockAfter:9 },
  { id:11, code:'CH 11', name:'THE PEOPLE VS. YOU', strap:'All rise.', bossKind:'court', palette:p(0xe9dcc1,0x211c1a,0x7f2d2d,0x6b7759,0xc89032,0xff60ce,0x70665a), runLength:22500, encounterCount:8, baseBossHp:5000, enemyDensity:1.35, gravity:1230, moveSpeed:308, bossScale:1.09, unlockAfter:10 },
  { id:12, code:'CH 12', name:'AFTER MIDNIGHT', strap:'Your future has already aired.', bossKind:'astrology', palette:p(0xe7d9c8,0x151521,0x6555a9,0xc45c86,0xe0ae3f,0xff5ed2,0x2b2846), runLength:23900, encounterCount:9, baseBossHp:5450, enemyDensity:1.42, gravity:1170, moveSpeed:310, bossScale:1.10, unlockAfter:11 },
  { id:13, code:'CH 13', name:'CONTROL ROOM', strap:'Do not touch the dial.', bossKind:'director', palette:p(0xe6dbc7,0x111315,0xe1513c,0x3a8b85,0xf0c342,0xff55cf,0x202426), runLength:25500, encounterCount:10, baseBossHp:6200, enemyDensity:1.50, gravity:1220, moveSpeed:312, bossScale:1.12, unlockAfter:12 }
];

export const stageById = (id: number): StageDefinition => {
  const safeId = Number.isFinite(id) ? Math.trunc(id) : 1;
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, safeId - 1))];
};

export const BOSS_ROTATION: BossKind[] = STAGES.map((stage) => stage.bossKind);

export const gradeFor = (score: number, damageTaken: number, elapsedMs: number, stageId: number): string => {
  const par = 105000 + stageId * 9000;
  let points = score;
  if (damageTaken === 0) points += 1600;
  if (elapsedMs < par) points += 900;
  if (points >= 8200) return 'S';
  if (points >= 6200) return 'A';
  if (points >= 4600) return 'B';
  if (points >= 3200) return 'C';
  return 'D';
};

export const encoreStage = (seed: number): StageDefinition => {
  const base = STAGES[Math.abs(seed) % STAGES.length];
  return {
    ...base,
    id: base.id,
    code: 'ENCORE',
    strap: 'The archive is no longer stable.',
    baseBossHp: Math.round(base.baseBossHp * 1.45),
    enemyDensity: base.enemyDensity * 1.32,
    moveSpeed: base.moveSpeed + 12,
    encounterCount: Math.min(8, base.encounterCount + 1)
  };
};
