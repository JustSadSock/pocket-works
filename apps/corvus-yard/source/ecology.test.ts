import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import { Ecology, type EcologyProgress } from './ecology';
import { createCrowState } from './flight';

const allocated:Array<{engine:NullEngine;ecology:Ecology}>=[];
function setup(saved?:EcologyProgress,surfaceHeight?:(x:number,z:number,y:number)=>number){
  vi.spyOn(SceneLoader,'LoadAssetContainerAsync').mockRejectedValue(new Error('Asset intentionally absent in headless unit physics test'));
  const engine=new NullEngine(),scene=new Scene(engine);
  const ecology=new Ecology(scene,[{id:'tower-top',position:new Vector3(20,14,20),radius:2,kind:'tower'}],saved,surfaceHeight);
  allocated.push({engine,ecology});return ecology;
}
afterEach(()=>{allocated.splice(0).forEach(({ecology,engine})=>{ecology.dispose();engine.dispose();});vi.restoreAllMocks();});
describe('crow food and objects',()=>{
  it('requires proximity and controlled speed, and eats food only once',()=>{
    const ecology=setup(),state=createCrowState({x:.5,y:.46,z:-14});
    state.speed=10;expect(ecology.interact(state)).toContain('затормози');expect(ecology.carrying).toBe(false);
    state.speed=0;expect(ecology.interact(state)).toContain('в клюве');expect(ecology.carrying).toBe(true);
    ecology.eat(state);expect(ecology.progress.foods).toBe(1);ecology.eat(state);expect(ecology.progress.foods).toBe(1);
    state.position={x:45,y:.46,z:45};expect(ecology.interact(state)).toContain('ближе');
  });
  it('requires dropping a walnut onto hard ground before it is edible',()=>{
    const ecology=setup(),state=createCrowState({x:1,y:.46,z:-15});
    expect(ecology.interact(state)).toContain('Орех');expect(ecology.eat(state)).toContain('скорлупа');
    state.position={x:10,y:7,z:-15};ecology.update(1/60,0,state);ecology.drop(state);
    for(let i=0;i<180;i++)ecology.update(1/60,i/60,state);
    expect(ecology.progress.nuts).toBe(1);
    const nut=ecology.summary().targets.find(t=>t.kind==='walnut'&&t.cracked)!;
    expect(nut).toBeTruthy();expect(nut.position[1]).toBeCloseTo(.12,1);
    state.position={x:nut.position[0],y:.46,z:nut.position[2]};ecology.interact(state);ecology.eat(state);
    expect(ecology.progress.foods).toBe(1);
  });
  it('does not crack low drops or count visiting the tower before prerequisites',()=>{
    const ecology=setup(),state=createCrowState({x:1,y:.46,z:-15});ecology.interact(state);ecology.update(1/60,0,state);ecology.drop(state);
    for(let i=0;i<60;i++)ecology.update(1/60,i/60,state);expect(ecology.progress.nuts).toBe(0);
    state.position={x:20,y:14.46,z:20};ecology.update(1/60,1,state);expect(ecology.progress.visited).toEqual([]);
    ecology.progress.foods=2;ecology.progress.nuts=1;ecology.update(1/60,2,state);expect(ecology.progress.visited).toEqual(['tower-top']);
    ecology.update(1/60,3,state);expect(ecology.progress.visited).toHaveLength(1);
  });
  it('restores consumed items and cracked walnuts without counting the same object twice',()=>{
    const ecology=setup(),state=createCrowState({x:.5,y:.46,z:-14});
    ecology.interact(state);ecology.eat(state);
    state.position={x:1,y:.46,z:-15};ecology.interact(state);
    state.position={x:10,y:7,z:-15};ecology.drop(state);
    for(let i=0;i<180;i++)ecology.update(1/60,i/60,state);
    const restored=setup(JSON.parse(JSON.stringify(ecology.progress)));
    expect(restored.progress.foods).toBe(1);expect(restored.progress.nuts).toBe(1);
    expect(restored.summary().targets.filter(t=>t.kind==='scrap')).toHaveLength(5);
    const nut=restored.summary().targets.find(t=>t.kind==='walnut'&&t.cracked)!;
    state.position={x:nut.position[0],y:.46,z:nut.position[2]};restored.interact(state);
    state.position={x:10,y:7,z:-15};restored.drop(state);
    for(let i=0;i<180;i++)restored.update(1/60,i/60,state);
    expect(restored.progress.nuts).toBe(1);
  });
  it('lands physical items on queried rooftop surfaces and follows horizontal movement',()=>{
    const ecology=setup(undefined,(x,_z,previousY)=>x>8&&previousY>=4?4:0),state=createCrowState({x:1,y:.46,z:-15});
    ecology.interact(state);state.position={x:10,y:8,z:-15};ecology.drop(state);
    for(let i=0;i<180;i++)ecology.update(1/60,i/60,state);
    const nut=ecology.summary().targets.find(t=>t.kind==='walnut'&&t.cracked)!;
    expect(nut.position[1]).toBeCloseTo(4.12,2);expect(ecology.progress.nuts).toBe(1);
  });
  it('validates malformed progression counters and identifier arrays',()=>{
    const ecology=setup({foods:NaN,nuts:Infinity,visited:['tower-top','tower-top'],consumedIds:['food-scrap-0','food-scrap-0']});
    expect(ecology.progress.foods).toBe(0);expect(ecology.progress.nuts).toBe(0);
    expect(ecology.progress.visited).toEqual(['tower-top']);expect(ecology.progress.consumedIds).toEqual(['food-scrap-0']);
  });
  it('preserves existing progression and keeps shiny objects inedible',()=>{
    const ecology=setup({foods:3,nuts:1,visited:['tower-top']}),state=createCrowState({x:4,y:.46,z:-16});
    ecology.interact(state);expect(ecology.eat(state)).toContain('несъедобна');expect(ecology.carrying).toBe(true);
    ecology.drop(state);expect(ecology.carrying).toBe(false);expect(ecology.progress.foods).toBe(3);expect(ecology.progress.visited).toEqual(['tower-top']);
  });
});
