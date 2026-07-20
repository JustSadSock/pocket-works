import { describe, expect, it } from 'vitest';
import { cardForFoul, chargeToShotSpeed, decideBoundaryRestart, isOffsidePosition, matchMinute } from './core';

const bounds = { left: 30, right: 400, top: 80, bottom: 960, goalLeft: 160, goalRight: 270 };

describe('football rules', () => {
  it('awards a goal only through the mouth of the goal', () => {
    expect(decideBoundaryRestart({ x: 210, y: 70 }, 'home', bounds, true)).toMatchObject({ kind: 'goal', team: 'home' });
    expect(decideBoundaryRestart({ x: 80, y: 70 }, 'home', bounds, true).kind).toBe('goal-kick');
  });

  it('awards corners when the defender touched last', () => {
    expect(decideBoundaryRestart({ x: 80, y: 70 }, 'away', bounds, true)).toMatchObject({ kind: 'corner', team: 'home' });
  });

  it('detects offside only in the attacking half and beyond ball plus second-last defender', () => {
    expect(isOffsidePosition(180, 260, [170, 210, 330], true, 520)).toBe(true);
    expect(isOffsidePosition(240, 200, [170, 210, 330], true, 520)).toBe(false);
    expect(isOffsidePosition(600, 650, [610, 640, 700], false, 520)).toBe(false);
  });

  it('escalates a second caution into a sending-off', () => {
    expect(cardForFoul(0.7, false)).toBe('yellow');
    expect(cardForFoul(0.7, true)).toBe('second-yellow');
    expect(cardForFoul(0.98, false)).toBe('red');
  });

  it('clamps shot charging and maps two halves to ninety minutes', () => {
    expect(chargeToShotSpeed(0)).toBe(285);
    expect(chargeToShotSpeed(2000)).toBe(475);
    expect(matchMinute(150, 150)).toBe(45);
    expect(matchMinute(300, 150)).toBe(90);
  });
});
