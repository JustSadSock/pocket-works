import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,ITEMS,HOME,validateApartment} from '../apartment.mjs';

test('300 seeded apartments are fully traversable and all objectives are reachable',()=>{
 for(let seed=1;seed<=300;seed++){
  assert.ok(validateApartment(seed),'seed '+seed+' trapped the player or an objective');
  const w=new Apartment(seed);
  assert.ok(w.canStand(HOME.x,HOME.z),'starting position must be walkable');
  assert.equal(new Set(w.rooms.map(x=>x.type)).size,4);
  for(const item of ITEMS){const p=w.itemPosition(item.id);assert.ok(w.canStand(p.x,p.z),item.id+' blocked in seed '+seed);
   assert.ok(w.findStep(HOME.x,HOME.z,p.x,p.z),item.id+' disconnected in seed '+seed);assert.ok(w.reachablePosition(p),item.id+' physically unreachable behind furniture '+seed)}
 }
});
test('new seeds result in genuinely different apartments',()=>{
 const variants=new Set();
 for(let seed=1;seed<=80;seed++)variants.add(new Apartment(seed).fingerprint());
 assert.ok(variants.size>24,'new game must not repeat the same layout');
});
test('reconfiguration is only performed offscreen, does not strand the player and keeps objectives accessible',()=>{
 for(let seed=1;seed<=70;seed++){
  const w=new Apartment(seed),start={...HOME},original=w.fingerprint();
  let reformed=false;
  for(let t=5;t<40;t+=.5)if(w.tick(start.x,start.z,0,t))reformed=true;
  assert.ok(reformed,'no unseen architecture change in seed '+seed);
  assert.notEqual(w.fingerprint(),original,'reconfiguration had no effect');
  assert.ok(w.canStand(start.x,start.z),'new furniture or door traps player');
  for(const item of ITEMS){const p=w.itemPosition(item.id);assert.ok(w.canStand(p.x,p.z));assert.ok(w.findStep(start.x,start.z,p.x,p.z));assert.ok(w.reachablePosition(p),'physically blocked after shifting '+seed)}
 }
});
test('doorways never cross exterior walls or become non-walkable',()=>{
 for(let seed=1;seed<=100;seed++)for(let phase=0;phase<5;phase++){
  const w=new Apartment(seed,{phases:[phase,phase,phase,phase]});
  for(const r of w.rooms){const p=w.door(r);assert.equal(w.cell(p.x,p.z),3);assert.equal(w.cell(p.x+1,p.z),3);
   assert.ok(w.pass(p.x,p.z+(r.z0<11?1:-1)),'hallway access closed')}
 }
});
test('save and resume preserves seed, room transformation and goals',()=>{
 const w=new Apartment(781);for(let t=5;t<35;t+=.5)w.tick(HOME.x,HOME.z,0,t);
 const restored=new Apartment(w.seed,w.save());
 assert.equal(w.fingerprint(),restored.fingerprint());
 for(const item of ITEMS)assert.deepEqual(w.itemPosition(item.id),restored.itemPosition(item.id));
});
