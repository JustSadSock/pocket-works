import { describe, expect, it } from 'vitest';
import { blankInput, createMatch, nextRound, stepMatch, type Input, type Match } from './core';
function run(s: Match, seconds: number, input: Partial<Input> = {}, opponent: Partial<Input> = {}) {
  for (let i = 0; i < seconds * 60; i++) stepMatch(s, { ...blankInput(), ...input }, 1 / 60, { ...blankInput(), ...opponent });
}
function ready() { const s = createMatch(); s.mode = 'fight'; s.fighters[0].x = 210; s.fighters[1].x = 243; return s; }
describe('combat rules', () => {
  it('gives attacks startup and exactly one contact per animation', () => {
    const s = ready(); run(s, .05, { punch: true }); expect(s.fighters[1].hp).toBe(100);
    run(s, .2); expect(s.fighters[1].hp).toBe(92); run(s, .2); expect(s.fighters[1].hp).toBe(92);
  });
  it('blocks a normal hit while gaining meter', () => {
    const s = ready(); run(s, .3, { punch: true }, { block: true });
    expect(s.fighters[1].hp).toBe(100); expect(s.fighters[1].energy).toBeGreaterThan(60);
  });
  it('spends special meter, creates a projectile and prevents free recasts', () => {
    const s = ready(); s.fighters[1].x = 360; run(s, .4, { special: true });
    expect(s.fighters[0].energy).toBe(0); expect(s.shots).toHaveLength(1);
    run(s, 1, { special: true }); expect(s.fighters[1].hp).toBe(80); expect(s.shots).toHaveLength(0);
  });
  it('lets a jump evade a ground projectile and land again', () => {
    const s = ready(); s.fighters[1].x = 360; run(s, .4, { special: true }, { jump: true });
    expect(s.fighters[1].y).toBeGreaterThan(30); run(s, .6); expect(s.fighters[1].y).toBe(0);
  });
  it('keeps bodies apart and players in the arena', () => {
    const s = ready(); run(s, 2, { right: true }); expect(s.fighters[1].x - s.fighters[0].x).toBeGreaterThanOrEqual(25);
    run(s, 10, { left: true }); expect(s.fighters[0].x).toBe(30);
  });
  it('freezes simulation while paused', () => {
    const s = ready(); s.mode = 'paused'; run(s, 2, { right: true }); expect(s.time).toBe(60); expect(s.fighters[0].x).toBe(210);
  });
  it('uses projectile travel direction for block and knockback after its owner turns', () => {
    const s = ready(); s.fighters[0].facing = -1; s.fighters[0].move = 'kick';
    s.shots.push({ owner: 0, x: 231, y: 24, dir: 1, age: .3 });
    run(s, .02, {}, { block: true }); expect(s.fighters[1].hp).toBe(97); expect(s.fighters[1].x).toBeGreaterThan(243);
  });
  it('keeps rounds and decides a best-of-three match', () => {
    const s = ready(); s.fighters[1].hp = 0; run(s, .02); expect(s.mode).toBe('round'); expect(s.fighters[0].wins).toBe(1);
    nextRound(s); expect(s.round).toBe(2); expect(s.fighters[1].hp).toBe(100); expect(s.fighters[0].wins).toBe(1);
    s.mode = 'fight'; s.fighters[1].hp = 0; run(s, .02); expect(s.mode).toBe('result'); expect(s.winner).toBe(0);
  });
  it('replays a tied timed round without awarding a win', () => {
    const s = ready(); s.time = .001; run(s, .02); expect(s.roundWinner).toBeNull(); expect(s.mode).toBe('round'); expect(s.fighters[0].wins).toBe(0);
  });
});

