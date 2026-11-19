import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld,stepWorld,inject,setRule,cloneWorld,serialize,deserialize,relaxSand,mutate } from './engine.js';
const same=(a,b)=>assert.deepEqual(serialize(a),serialize(b));

test('sandpile starts responsively and has finite bounded instability',()=>{
 const w=createWorld('sand',1234);
 assert.equal(w.n,161);
 assert.ok(w.a.some(v=>v>0));
 for(let i=0;i<80;i++)stepWorld(w,4);
 assert.equal(w.ticks,1800+80*4*40);
 assert.ok(w.a.every(v=>Number.isInteger(v)&&v>=0));
 assert.ok(w.queue.length-w.qHead<=w.n*w.n);
 same(w,cloneWorld(w));
});
test('sandpile eventually stabilizes without inventing particles',()=>{
 const w=createWorld('sand',42);
 const start=w.a.reduce((n,v)=>n+v,0);
 inject(w,80,80); 
 for(let i=0;i<500&&w.queue.length;i++)relaxSand(w,15000);
 assert.equal(w.queue.length,0);
 assert.ok(w.a.every(v=>v<w.params.neighbors));
 assert.ok(w.a.reduce((n,v)=>n+v,0)<=start+Math.max(220,w.params.feed*8));
 same(w,deserialize(serialize(w)));
});
test('eight-neighbor rule switches without mutating total grains at switch',()=>{
 const w=createWorld('sand',25);
 const before=w.a.reduce((n,v)=>n+v,0);
 setRule(w,'neighbors',8);
 assert.equal(w.params.neighbors,8);
 assert.equal(w.a.reduce((n,v)=>n+v,0),before);
 for(let i=0;i<10;i++)stepWorld(w,1);
 same(w,cloneWorld(w));
});
test('ant follows deterministic path and accepts independent rule mutation',()=>{
 const a=createWorld('ant',77);
 const b=cloneWorld(a);
 stepWorld(a,200);stepWorld(b,200);same(a,b);
 setRule(b,'rule','RLLR');
 assert.equal(b.params.rule,'RLLR');
 inject(b,14,14);
 assert.equal(b.ants.length,2);
 assert.equal(a.ants.length,1);
 same(b,cloneWorld(b));
});
test('reaction concentrations stay finite and cloning is bit-exact',()=>{
 const w=createWorld('reaction',77);
 stepWorld(w,12);
 inject(w,25,32);
 setRule(w,'feed',.035);
 setRule(w,'kill',.061);
 stepWorld(w,8);
 assert.ok(w.a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 assert.ok(w.b.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 same(w,cloneWorld(w));
});
test('branch changes a rule while leaving the original world untouched',()=>{
 for(const kind of ['sand','ant','reaction']){
  const a=createWorld(kind,23);
  const snapshot=serialize(a);
  const b=mutate(a);
  assert.deepEqual(serialize(a),snapshot);
  assert.notDeepEqual(b.params,a.params);
  stepWorld(b,3);
  assert.deepEqual(serialize(a),snapshot);
 }
});
test('invalid/corrupted serialized payload is rejected',()=>{
 const w=createWorld('sand');
 const saved=serialize(w);
 assert.throws(()=>deserialize({...saved,cells:'AA=='}),/Повреждённый мир/);
 assert.throws(()=>deserialize({...saved,v:9}),/Несовместимое/);
});
