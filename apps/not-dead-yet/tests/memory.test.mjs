import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,HOME,ITEMS,floorplan} from '../apartment.mjs';

test('new apartments have asymmetric seeded proportions and always-walkable objectives',()=>{
 const floorprints=new Set(),fail=[];
 for(let seed=1;seed<=500;seed++){
  const world=new Apartment(seed);
  assert.equal(world.layoutVersion,2);
  floorprints.add(world.rooms.map(r=>[r.x0,r.x1,r.z0,r.z1].join(',')).join('|'));
  for(const item of ITEMS){const p=world.itemPosition(item.id);
   if(!world.canStand(p.x,p.z)||!world.reachablePosition(p))fail.push([seed,item.id])
  }
  if(!world.canStand(HOME.x,HOME.z))fail.push([seed,'start'])
 }
 assert.deepEqual(fail,[]);
 assert.ok(floorprints.size>=8,'new apartment footprints should not all match');
});
test('existing saves use original floor rectangles and retain item and player locations',()=>{
 for(let seed=1;seed<=150;seed++){
  const original=new Apartment(seed,{phases:[0,0,0,0],doors:{}});
  const restored=new Apartment(seed,{phases:[0,0,0,0],doors:{},layoutVersion:1});
  assert.equal(original.layoutVersion,1);
  assert.deepEqual(original.rooms.map(r=>({x0:r.x0,x1:r.x1,z0:r.z0,z1:r.z1})),
   floorplan(seed,true).map(r=>({x0:r.x0,x1:r.x1,z0:r.z0,z1:r.z1})));
  assert.equal(original.fingerprint(),restored.fingerprint());
  for(const item of ITEMS)assert.deepEqual(original.itemPosition(item.id),restored.itemPosition(item.id));
 }
});
test('an unseen architectural shift creates a specific, recognizable memory error',()=>{
 for(let seed=1;seed<=100;seed++){
  const w=new Apartment(seed);let shifts=0;
  assert.ok(w.rooms.every(r=>!w.memoryState(r.type).active));
  for(let t=5;t<37;t+=.5)if(w.tick(HOME.x,HOME.z,0,t)){
   shifts++;
   const type=w.lastChange.type,state=w.memoryState(type);
   assert.equal(state.active,true,'unseen room must have a wrong remembered object');
   assert.ok(['reversed-photo','wrong-television','missing-reflection','doubled-crockery'].includes(state.kind));
   const position=w.memorySpot(type);assert.ok(position&&w.reachablePosition(position));
   assert.deepEqual(w.recognize(type),{ok:true,type,kind:state.kind});
   assert.equal(w.memoryState(type).active,false,'recognition must restore the room cue');
   assert.equal(w.recognize(type).ok,false,'recognition cannot be farmed for infinite healing');
  }
  assert.ok(shifts>=1,'offscreen shift missing in seed '+seed);
 }
});
test('recognition and floor plan persist alongside unchanged save schema',()=>{
 const w=new Apartment(781);for(let t=5;t<12;t+=.5)w.tick(HOME.x,HOME.z,0,t);
 const type=w.lastChange.type;
 assert.ok(w.memoryState(type).active);
 w.recognize(type);
 const restored=new Apartment(w.seed,w.save());
 assert.equal(restored.layoutVersion,2);
 assert.equal(restored.memoryState(type).active,false);
 assert.equal(restored.fingerprint(),w.fingerprint());
 for(const item of ITEMS)assert.deepEqual(restored.itemPosition(item.id),w.itemPosition(item.id));
});
test('familiar-object traces never move into a wall during subsequent shifts',()=>{
 for(let seed=1;seed<=110;seed++){
  const w=new Apartment(seed);
  for(let t=5;t<48;t+=.5)w.tick(HOME.x,HOME.z,0,t);
  for(const item of ITEMS)assert.ok(w.reachablePosition(w.memorySpot(item.room)),item.room+' trapped '+seed);
 }
});
