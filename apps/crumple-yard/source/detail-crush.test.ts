import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { dentVertices, impactDirection, DetailCrushSystem } from './detail-crush';

describe('localized visual damage on authored trim', () => {
  it('dents only vertices close to the contact, not the opposite side', () => {
    const v = new Float32Array([0, 0, 0, 2.5, 0, 0, 0.4, 0, 0]);
    const c = new Float32Array(3);
    dentVertices(v,c,Vector3.Zero(),new Vector3(0,0,-1),1,0.8);
    expect(v[2]).toBeLessThan(-0.15);
    expect(v[5]).toBe(0);
    expect(v[8]).toBeLessThan(0);
  });
  it('progressively crushes with a finite depth rather than exploding on repeat impacts', () => {
    const v = new Float32Array([0, 0, 0]);
    const c = new Float32Array(1);
    for (let i = 0; i < 100; i++) dentVertices(v,c,Vector3.Zero(),new Vector3(0,0,-1),1.4,1);
    expect(c[0]).toBeLessThanOrEqual(0.48);
    expect(v[2]).toBeGreaterThanOrEqual(-0.48);
    expect(v[2]).toBeLessThan(-0.3);
  });
  it('pushes front, rear and sides into the vehicle, not outward', () => {
    expect(impactDirection('front',Vector3.Zero()).z).toBeLessThan(-0.9);
    expect(impactDirection('rear',Vector3.Zero()).z).toBeGreaterThan(0.9);
    expect(impactDirection('left',Vector3.Zero()).x).toBeGreaterThan(0.9);
    expect(impactDirection('right',Vector3.Zero()).x).toBeLessThan(-0.9);
    expect(impactDirection('roof',Vector3.Zero()).y).toBeLessThan(-0.9);
  });
  it('bends a Babylon hood mesh and preserves an unhit rear piece', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode('car', scene);
    const hood = MeshBuilder.CreateBox('hood', {width:1.3,height:0.08,depth:0.9,updatable:true},scene);
    const trunk = MeshBuilder.CreateBox('trunk', {width:1.3,height:0.08,depth:0.9,updatable:true},scene);
    hood.parent = root;
    trunk.parent = root;
    hood.position.z = 1.65;
    trunk.position.z = -1.65;
    const detail = new DetailCrushSystem();
    detail.register(hood,'front');
    detail.register(trunk,'rear');
    const beforeHood = hood.getVerticesData(VertexBuffer.PositionKind)!.slice();
    const beforeTrunk = trunk.getVerticesData(VertexBuffer.PositionKind)!.slice();
    detail.deform(root,new Vector3(0,0,2),0.8,'front');
    expect(hood.getVerticesData(VertexBuffer.PositionKind)).not.toEqual(beforeHood);
    expect(trunk.getVerticesData(VertexBuffer.PositionKind)).toEqual(beforeTrunk);
    engine.dispose();
  });
});
