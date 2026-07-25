// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { MatterEngine, migrateSnapshot, validateCustomMaterial } from './core.ts';
import { EXPERIMENTS, TASKS, loadExperiment } from './scenes.ts';

describe('phase transitions',()=>{
  it('freezes and boils water',()=>{const e=new MatterEngine(12,12);e.setCell(6,6,'water',-5);e.step();expect(e.materialAt(e.idx(6,6)).key).toBe('ice');e.setCell(6,6,'water',130);e.step();expect(e.countMaterial('steam')).toBeGreaterThan(0);});
  it('solidifies lava below its melting point',()=>{const e=new MatterEngine(8,8);e.setCell(4,4,'lava',500);e.step();expect(e.materialAt(e.idx(4,4)).key).toBe('stone');});
});

describe('reactions',()=>{
  it('water quenches lava and creates steam',()=>{const e=new MatterEngine(12,12);e.setCell(5,6,'lava',1100);e.setCell(6,6,'water',20);for(let i=0;i<3;i++)e.step();const keys=[e.materialAt(e.idx(5,6)).key,e.materialAt(e.idx(6,6)).key];expect(keys).toContain('stone');expect(e.countMaterial('steam')).toBeGreaterThan(0);});
  it('neutralizes acid and alkali',()=>{const e=new MatterEngine(10,10);e.setCell(4,5,'acid');e.setCell(5,5,'alkali');e.step();expect(e.countMaterial('neutral-solution')).toBeGreaterThan(0);});
  it('rejects an obvious infinite custom rule',()=>{const result=validateCustomMaterial({key:'loop',name:'Loop',state:'solid',rules:[{with:'loop',productA:'loop',productB:'loop',create:'loop',probability:1}]});expect(result.ok).toBe(false);});
});

describe('temperature and electricity',()=>{
  it('conducts heat between adjacent metal cells',()=>{const e=new MatterEngine(8,8);e.setCell(3,4,'metal',900);e.setCell(4,4,'metal',20);for(let i=0;i<20;i++)e.diffuseFields();expect(e.temp[e.idx(4,4)]).toBeGreaterThan(20);expect(e.temp[e.idx(3,4)]).toBeLessThan(900);});
  it('spreads charge through copper',()=>{const e=new MatterEngine(12,8);for(let x=2;x<10;x++)e.setCell(x,4,'copper');e.charge[e.idx(2,4)]=1;for(let i=0;i<30;i++)e.diffuseFields();expect(Math.abs(e.charge[e.idx(8,4)])).toBeGreaterThan(0);});
});

describe('save format',()=>{
  it('round-trips all core arrays',()=>{const e=new MatterEngine(20,20);e.rectangle(2,2,17,17,1,'water',true);e.applyTemperature(10,10,4,300);e.applyPressure(10,10,3,5);e.applyCharge(5,5,2,1);const snap=e.snapshot();const restored=new MatterEngine(4,4);restored.restore(snap);expect(restored.width).toBe(20);expect(restored.countMaterial('water')).toBe(e.countMaterial('water'));expect(restored.temp[restored.idx(10,10)]).toBeCloseTo(e.temp[e.idx(10,10)],1);});
  it('rejects corrupted snapshots',()=>{expect(migrateSnapshot({version:2,width:0,height:0,arrays:{}})).toBeNull();expect(migrateSnapshot(null)).toBeNull();});
  it('fills regions without fringe cells',()=>{const e=new MatterEngine(30,30);for(let x=4;x<=25;x++){e.setCell(x,4,'glass',null,{anchor:true});e.setCell(x,25,'glass',null,{anchor:true});}for(let y=4;y<=25;y++){e.setCell(4,y,'glass',null,{anchor:true});e.setCell(25,y,'glass',null,{anchor:true});}const changed=e.fill(10,10,'water');expect(changed).toBe(20*20);for(let y=5;y<=24;y++)for(let x=5;x<=24;x++)expect(e.materialAt(e.idx(x,y)).key).toBe('water');});
});

describe('product smoke',()=>{
  it('contains 15 experiments and 15 automatic tasks',()=>{expect(EXPERIMENTS).toHaveLength(15);expect(TASKS).toHaveLength(15);expect(TASKS.every(task=>typeof task.check==='function')).toBe(true);});
  it('builds every scene and evaluates every task safely',()=>{for(const scene of EXPERIMENTS){const e=new MatterEngine(120,180);scene.build(e);expect(()=>e.step(5)).not.toThrow();}for(const task of TASKS){const e=new MatterEngine(120,180);const loaded=loadExperiment(e,task.scene);task.setup?.(e);const result=task.check(e,{customMaterials:[]});expect(typeof result.done).toBe('boolean');expect(Number.isFinite(result.progress)).toBe(true);}});
  it('runs the first-launch scenario and restores it',()=>{const e=new MatterEngine(120,180);loadExperiment(e,'glacier-volcano');const lava=e.countMaterial('lava'),ice=e.countMaterial('ice');expect(lava).toBeGreaterThan(100);expect(ice).toBeGreaterThan(1000);expect(e.countMaterial('steam')).toBeGreaterThan(100);for(let i=0;i<60;i++)e.step();const clone=new MatterEngine(4,4);clone.restore(e.snapshot());expect(clone.countMaterial('lava')+clone.countMaterial('stone')).toBeGreaterThan(0);});
});
