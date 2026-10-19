import { beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, Vector3, Quaternion } from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ChaseCamera } from './camera';
import type { Vehicle } from './vehicle';
import { applyImpact, createDamageState, deriveDamageEffects } from './damage';

beforeAll(async () => { await RAPIER.init(); });
describe('fixed-world driving camera', () => {
  function rig() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    let yaw = 0;
    const vehicle = { root: { position: new Vector3(0, 0, 0), rotationQuaternion: Quaternion.Identity() }, syncVisual() {}, forward: () => new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), speedKmh: () => 0 } as unknown as Vehicle;
    const camera = new ChaseCamera(scene, world);
    return { camera, vehicle, turn: (v: number) => { yaw = v; }, dispose: () => { world.free(); engine.dispose(); } };
  }
  it('keeps its world azimuth when the car makes a U-turn', () => {
    const r = rig();r.camera.snap(r.vehicle);
    const before = r.camera.camera.position.clone();r.turn(Math.PI);r.camera.snap(r.vehicle);
    expect(Vector3.Distance(before,r.camera.camera.position)).toBeLessThan(0.0001);r.dispose();
  });
  it('follows translation smoothly without changing the fixed view direction', () => {
    const r = rig();r.camera.snap(r.vehicle);r.vehicle.root.position.set(15,0,8);r.turn(Math.PI/2);
    for(let i=0;i<240;i++)r.camera.update(r.vehicle,1/60);
    const delta=r.camera.camera.position.subtract(r.vehicle.root.position);
    expect(delta.x).toBeCloseTo(10,2);expect(delta.y).toBeCloseTo(12,2);expect(delta.z).toBeCloseTo(-13,2);r.dispose();
  });
  it('retains the chase option with heading-relative framing', () => {
    const r=rig();r.camera.mode='chase';r.camera.snap(r.vehicle);const before=r.camera.camera.position.clone();
    r.turn(Math.PI);r.camera.snap(r.vehicle);expect(Vector3.Distance(before,r.camera.camera.position)).toBeGreaterThan(10);r.dispose();
  });
});
it('accumulated frontal impacts still reduce structural integrity and engine power',()=>{
  const state=createDamageState();const before=deriveDamageEffects(state);
  const hit={force:150000,dt:1/90,relativeSpeed:20,ownMass:1490,otherMass:1e10,obstacleStiffness:1.4,contactArea:.5,angleCos:1,zone:'front' as const,crushResistance:1};
  applyImpact(state,hit);applyImpact(state,hit);const after=deriveDamageEffects(state);
  expect(state.impactCount).toBe(2);expect(state.zoneDamage.front).toBeGreaterThan(0);
  expect(after.structuralIntegrity).toBeLessThan(before.structuralIntegrity);expect(after.enginePower).toBeLessThan(before.enginePower);
});
