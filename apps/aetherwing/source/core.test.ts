import { describe, expect, it } from 'vitest';
import { makeFlightState, stepFlight } from './core';

describe('AETHERWING flight model', () => {
  it('loses altitude when slow without enough lift', () => {
    const s = makeFlightState(); s.velocity = { x: 0, y: 0, z: 8 };
    for (let i=0;i<120;i++) stepFlight(s,{x:0,y:0,boost:0,brake:0},1/60);
    expect(s.verticalSpeed).toBeLessThan(-1);
  });
  it('dive converts altitude into speed and exposes the dive state', () => {
    const s=makeFlightState(); const before=s.speed;
    for(let i=0;i<180;i++) stepFlight(s,{x:0,y:-1,boost:0,brake:0},1/60);
    expect(s.speed).toBeGreaterThan(before+4);
    expect(s.verticalSpeed).toBeLessThan(-4);
    expect(s.mode).toBe('dive');
  });
  it('can reverse a sustained climb into a deep mobile dive', () => {
    const s=makeFlightState();
    for(let i=0;i<180;i++) stepFlight(s,{x:0,y:1,boost:0,brake:0},1/60);
    expect(s.pitch).toBeGreaterThan(.08);
    const beforeDive=s.speed;
    for(let i=0;i<252;i++) stepFlight(s,{x:0,y:-1,boost:0,brake:0},1/60);
    expect(s.pitch).toBeLessThan(-.18);
    expect(s.verticalSpeed).toBeLessThan(-4);
    expect(s.speed).toBeGreaterThan(beforeDive*.92);
    expect(s.mode).toBe('dive');
  });
  it('air brake reduces forward speed', () => {
    const s=makeFlightState(); s.velocity={x:0,y:0,z:58};
    for(let i=0;i<100;i++) stepFlight(s,{x:0,y:0,boost:0,brake:1},1/60);
    expect(s.speed).toBeLessThan(52);
    expect(s.mode).toBe('brake');
  });
  it('bank input produces roll and yaw instead of flat yaw rotation', () => {
    const s=makeFlightState();
    for(let i=0;i<120;i++) stepFlight(s,{x:1,y:0,boost:.2,brake:0},1/60);
    expect(Math.abs(s.roll)).toBeGreaterThan(.18);
    expect(Math.abs(s.yaw)).toBeGreaterThan(.1);
  });
});
