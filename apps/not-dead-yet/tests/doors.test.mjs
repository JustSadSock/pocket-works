import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,HOME,ITEMS} from '../apartment.mjs';
import {MAX_SWING,blockedByPanels,panels,segmentDistance} from '../doors.mjs';

test('door leaf collision follows the exact hinge orientation, closed and open',()=>{
 for(let seed=1;seed<=180;seed++){
  const world=new Apartment(seed);
  assert.equal(world.doors().length,4);
  for(const door of world.doors()){
   const x=door.gate.x+.52,z=door.gate.z+.5;
   assert.equal(blockedByPanels(x,z,door.gate,door.insideSign,0,.15),true);
   assert.equal(blockedByPanels(x,z,door.gate,door.insideSign,MAX_SWING,.15),false);
   assert.ok(panels(door.gate,door.insideSign,.6).every(p=>segmentDistance(p.a.x,p.a.z,p.a,p.b)<.01));
  }
 }
});
test('opening and closing a door changes actual collision; progress persists across save',()=>{
 for(let seed=1;seed<=100;seed++){
  const w=new Apartment(seed),door=w.doors()[0],x=door.gate.x+.5,z=door.gate.z+.5;
  assert.ok(w.canStand(x,z,.16),'gate must initially be open');
  const close=w.toggleDoor(door.type,HOME.x,HOME.z);
  assert.deepEqual(close,{ok:true,open:false});
  w.updateDoors(.85);
  assert.equal(w.canStand(x,z,.16),false,'shut glass leaf must block passage');
  const saved=w.save(),restored=new Apartment(seed,saved);
  assert.equal(restored.doorStates[door.type].open,false);
  assert.equal(restored.canStand(x,z,.16),false,'save must preserve the locked geometry');
  assert.deepEqual(restored.toggleDoor(door.type,HOME.x,HOME.z),{ok:true,open:true});
  restored.updateDoors(.85);
  assert.ok(restored.canStand(x,z,.16),'opening should restore passage');
 }
});
test('closing will not sweep the player at the center of an opening',()=>{
 const w=new Apartment(56),door=w.doors()[0],center={x:door.gate.x+.55,z:door.gate.z+.5};
 assert.ok(w.canStand(center.x,center.z,.17));
 const attempt=w.toggleDoor(door.type,center.x,center.z);
 assert.equal(attempt.ok,false);
 assert.equal(attempt.reason,'occupied');
 assert.equal(w.doorStates[door.type].open,true);
});
test('legacy saves keep safe open gates and all memory tasks reachable',()=>{
 for(let seed=1;seed<=180;seed++){
  const w=new Apartment(seed,{phases:[1,2,1,0]});
  assert.ok(w.doors().every(x=>x.open));
  assert.ok(w.canStand(HOME.x,HOME.z));
  for(const item of ITEMS){const p=w.itemPosition(item.id);assert.ok(w.reachablePosition(p),item.id+' unreachable on '+seed)}
 }
});
test('transitions continue to be playable after an unseen room reconfigures',()=>{
 for(let seed=1;seed<=45;seed++){
  const w=new Apartment(seed);let changed=0;
  for(let t=5;t<44;t+=.5)if(w.tick(HOME.x,HOME.z,0,t))changed++;
  assert.ok(changed>0,'no memory-driven changes for '+seed);
  for(const item of ITEMS)assert.ok(w.reachablePosition(w.itemPosition(item.id)),item.id+' trapped on '+seed);
 }
});

test('closed doors occlude actual lines of sight and reopening restores visibility',()=>{
 for(let seed=1;seed<=100;seed++){
  const w=new Apartment(seed),d=w.doors()[0],x=d.gate.x+.5,z=d.gate.z+.5;
  const front=z-d.insideSign*1.45,back=z+d.insideSign*1.45;
  assert.equal(w.visible(x,front,x,back),true,'open leaf should not block middle of doorway');
  assert.equal(w.toggleDoor(d.type,HOME.x,HOME.z).ok,true);
  w.updateDoors(1);
  assert.equal(w.visible(x,front,x,back),false,'solid pane should occlude an enemy or quest item');
  w.toggleDoor(d.type,HOME.x,HOME.z);w.updateDoors(1);
  assert.equal(w.visible(x,front,x,back),true,'player can restore visibility by opening the leaf');
 }
});
test('a door cannot close through the players capsule during its swinging arc',()=>{
 const w=new Apartment(99),d=w.doors()[0];
 const leaf=panels(d.gate,d.insideSign,MAX_SWING*.55)[0];
 const near={x:(leaf.a.x+leaf.b.x)/2,z:(leaf.a.z+leaf.b.z)/2};
 assert.equal(w.toggleDoor(d.type,near.x,near.z).ok,false);
 assert.equal(w.doorStates[d.type].open,true);
});
