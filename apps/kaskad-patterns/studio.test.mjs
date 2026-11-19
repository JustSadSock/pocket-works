import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld,inject,setRule,mutate,serialize,deserialize,cloneWorld} from './engine.js';
import {STUDIO_PRESETS,studioReport,paintStudio,scatterStudio} from './studio.js';
import {rasterize} from './renderer.js';
import {makeGif} from './exporters.js';

test('all seven authored preset simulations evolve with bounded valid states',()=>{
  for(const id of Object.keys(STUDIO_PRESETS)){
    const w=createWorld('studio',1234,id),initial=w.a.slice();
    assert.equal(w.mode,'studio');assert.equal(w.n,96);
    for(let i=0;i<25;i++)stepWorld(w,2);
    assert.equal(w.ticks,50);
    assert.ok(w.a.every(v=>v>=0&&v<w.params.states),id);
    assert.ok(w.a.some((v,i)=>v!==initial[i]),id+' should change');
    assert.deepEqual(serialize(cloneWorld(w)),serialize(w));
  }
});
test('same seed, scenario and transitions produce identical worlds',()=>{
  for(const id of Object.keys(STUDIO_PRESETS)){
    const a=createWorld('studio',789,id),b=createWorld('studio',789,id);
    stepWorld(a,18);stepWorld(b,18);
    assert.deepEqual(serialize(a),serialize(b),id);
  }
});
test('Conway glider moves diagonally without side effects',()=>{
  const w=createWorld('studio',7,'life');w.a.fill(0);
  for(const [x,y] of [[1,0],[2,1],[0,2],[1,2],[2,2]])paintStudio(w,x+30,y+30);
  stepWorld(w,4);
  for(const [x,y] of [[1,0],[2,1],[0,2],[1,2],[2,2]])assert.equal(w.a[(y+31)*w.n+(x+31)],1);
  assert.equal(studioReport(w).active,5);
});
test('different neighborhood and birth/survival rules have a real effect',()=>{
  const a=createWorld('studio',14,'life');a.a.fill(0);
  for(const [x,y] of [[47,48],[49,48],[48,47],[48,49]])paintStudio(a,x,y);
  const b=cloneWorld(a);
  setRule(b,'neighbors',4);
  stepWorld(a,1);stepWorld(b,1);
  assert.equal(a.a[48*a.n+48],0);
  assert.equal(b.a[48*b.n+48],1);
  setRule(b,'birth',[1,3,4]);setRule(b,'survive',[0,1,2]);
  assert.deepEqual(b.params.birth,[1,3,4]);
  assert.deepEqual(b.params.survive,[0,1,2]);
});
test('cyclic predators only advance when neighboring target species meets threshold',()=>{
  const w=createWorld('studio',1,'cyclic');w.a.fill(0);
  setRule(w,'threshold',2);
  paintStudio(w,30,30,1);paintStudio(w,31,30,1);
  stepWorld(w,1);assert.equal(w.a[30*w.n+30],1);assert.equal(w.a[30*w.n+31],1);
  paintStudio(w,29,30,1);stepWorld(w,1);assert.equal(w.a[30*w.n+30],1);
  assert.equal(w.params.family,'cyclic');
});
test('paint, mirror, erase and random fill operate on the exact lattice',()=>{
  const w=createWorld('studio',22,'brain');w.a.fill(0);
  paintStudio(w,10,18,1,2,'four');
  assert.equal(w.a[18*w.n+10],1);
  assert.equal(w.a[18*w.n+(w.n-11)],1);
  assert.equal(w.a[(w.n-19)*w.n+10],1);
  paintStudio(w,10,18,0,2,'four');assert.equal(studioReport(w).occupied,0);
  scatterStudio(w,.2);assert.ok(studioReport(w).active>200);
  const copy=cloneWorld(w);assert.deepEqual(serialize(copy),serialize(w));
});
test('fork mutation preserves original and changes the authored law',()=>{
  for(const id of ['life','crystals','cyclic','fire']){
    const a=createWorld('studio',42,id),before=serialize(a),b=mutate(a);
    assert.deepEqual(serialize(a),before);
    assert.notDeepEqual(b.params,a.params);
    stepWorld(b,4);assert.deepEqual(serialize(a),before);
  }
});
test('studio exact JSON roundtrip and invalid rule values are rejected',()=>{
  const w=createWorld('studio',555,'epidemic');
  assert.equal(setRule(w,'spread',.42),true);
  assert.equal(setRule(w,'regrow',.01),true);
  stepWorld(w,33);
  assert.deepEqual(serialize(deserialize(serialize(w))),serialize(w));
  assert.equal(setRule(w,'states',30),false);
  assert.equal(setRule(w,'spread',Infinity),false);
  assert.equal(setRule(w,'family','javascript'),false);
  assert.equal(setRule(w,'survive',[100]),false);
});
test('custom worlds render and offline GIF export without altering a simulation',()=>{
  const w=createWorld('studio',23,'cyclic'),before=serialize(w),r=rasterize(w,'tide');
  assert.equal(r.width,96);assert.equal(r.data.length,96*96*4);
  const gif=makeGif(w,'mineral',3);
  assert.equal(gif.type,'image/gif');assert.ok(gif.size>1000);
  assert.deepEqual(serialize(w),before);
});
