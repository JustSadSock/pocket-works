import { describe, expect, it } from 'vitest';
import { BOSS_ROTATION, STAGES, gradeFor, stageById } from './content';
import { createDefaultSave, recordStage } from './save';

describe('DEAD AIR campaign', () => {
  it('ships thirteen ordered stages with distinct boss identities', () => {
    expect(STAGES).toHaveLength(13);
    expect(STAGES.map((s) => s.id)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(new Set(BOSS_ROTATION).size).toBe(13);
    expect(STAGES.every((s) => s.runLength >= 5000 && s.baseBossHp >= 1400)).toBe(true);
  });

  it('clamps stage lookup to campaign bounds', () => {
    expect(stageById(-50).id).toBe(1);
    expect(stageById(99).id).toBe(13);
    expect(stageById(Number.NaN).id).toBe(1);
  });

  it('unlocks the next stage and preserves best records', () => {
    const initial = createDefaultSave();
    const first = recordStage(initial, {
      stageId: 1, mode: 'campaign', startedAt: 0, elapsedMs: 120000,
      damageTaken: 3, parries: 1, deaths: 0, shotsHit: 100, shotsFired: 140, score: 4100, grade: 'C'
    });
    expect(first.unlockedStage).toBe(2);
    const better = recordStage(first, {
      stageId: 1, mode: 'archive', startedAt: 0, elapsedMs: 90000,
      damageTaken: 1, parries: 4, deaths: 0, shotsHit: 120, shotsFired: 130, score: 6900, grade: 'A'
    });
    expect(better.best['1'].grade).toBe('A');
    expect(better.best['1'].timeMs).toBe(90000);
    expect(better.best['1'].clears).toBe(2);
  });

  it('grades high-score clean clears above low-score clears', () => {
    expect(gradeFor(9000, 0, 80000, 1)).toBe('S');
    expect(gradeFor(1000, 4, 240000, 1)).toBe('D');
  });
});
