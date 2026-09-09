import { Matrix, MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { ObstacleField } from './obstacle-field';

describe('ObstacleField',()=>{
  it('raises the flight surface inside a visible canopy and keeps open terrain clear',()=>{
    const engine=new NullEngine();const scene=new Scene(engine);
    const source=MeshBuilder.CreateCylinder('fir_test',{height:10,diameter:8,tessellation:8},scene);source.bakeTransformIntoVertices(Matrix.Translation(0,5,0));
    const tree=source.createInstance('tree');tree.position.set(12,0,18);tree.scaling.set(1.25,1.4,1.25);
    const world={heightAt:()=>2,chunks:new Map([['0:0',{instances:[tree]}]])} as any;
    const canopy={instances:[]} as any;
    const field=new ObstacleField(world,canopy);field.update(0,true);
    expect(field.colliderCount).toBe(1);
    expect(field.surfaceAt(12,18,0)).toBeGreaterThan(13.5);
    expect(field.surfaceAt(45,18,0)).toBe(2);
    tree.dispose();source.dispose();scene.dispose();engine.dispose();
  });
});
