import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,ITEMS,HOME} from '../apartment.mjs';
import {POWER_STAGE,readPower,powerOn,tripPower,unplugPlate,resetBreaker,powerHint} from '../power.mjs';

test('blackout state machine requires a real kitchen safety step before the breaker resets',()=>{
 const p=readPower(null);
 assert.equal(p.stage,POWER_STAGE.NORMAL);assert.equal(powerOn(p),true);
 assert.equal(tripPower(p,12,0),false);
 assert.equal(tripPower(p,30,1),true);assert.equal(powerOn(p),false);
 assert.equal(tripPower(p,30,1),false,'outage should occur once');
 assert.deepEqual(resetBreaker(p),{ok:false,reason:'overload'});
 assert.match(powerHint(p),/кухне/);
 assert.deepEqual(unplugPlate(p),{ok:true,stage:POWER_STAGE.SAFE});
 assert.match(powerHint(p),/щитку/);
 assert.deepEqual(unplugPlate(p),{ok:false,reason:'already'});
 assert.deepEqual(resetBreaker(p),{ok:true,stage:POWER_STAGE.RESTORED});
 assert.equal(powerOn(p),true);
 assert.equal(tripPower(p,1000,4),false,'restoration is permanent for current chapter');
 assert.deepEqual(resetBreaker(p),{ok:false,reason:'already-on'});
});
test('power state remains recoverable after suspend / resume and legacy saves',()=>{
 for(let seed=1;seed<=180;seed++){
  let a=new Apartment(seed,{layoutVersion:1,phases:[0,1,0,2]});
  assert.equal(a.powerAvailable(),true);
  assert.equal(a.tickPower(80,0),true);
  assert.equal(a.resetBreaker().ok,false);
  const radioBefore=a.radio.channel;
  assert.equal(a.tuneRadio(false).blocked,true,'unpowered radio must not tune');
  assert.equal(a.radio.channel,radioBefore);
  const tripped=new Apartment(seed,a.save());
  assert.equal(tripped.power.stage,'tripped');
  assert.equal(tripped.unplugPlate().ok,true);
  const safe=new Apartment(seed,tripped.save());
  assert.equal(safe.power.stage,'safe');
  assert.equal(safe.resetBreaker().ok,true);
  const restored=new Apartment(seed,safe.save());
  assert.equal(restored.powerAvailable(),true);
  assert.equal(restored.power.stage,'restored');
  assert.equal(restored.tickPower(500,4),false);
  for(const item of ITEMS){const pos=restored.itemPosition(item.id);assert.ok(restored.reachablePosition(pos),seed+':'+item.id)}
 }
});
test('both electrical controls have reachable interaction positions in 500 seeded room configurations',()=>{
 const aroundPlate=[[0,1.35],[0,-1.35],[1.45,0],[-1.45,0],[0,1.65],[0,-1.65]];
 const aroundFuse=[[.2,0],[.2,.35],[.3,-.35],[.4,.5]];
 for(let seed=1;seed<=500;seed++){
  const apartment=new Apartment(seed),plate=apartment.platePosition(),fuse=apartment.fusePosition();
  assert.equal(apartment.powerAvailable(),true);
  assert.ok(aroundPlate.some(([dx,dz])=>apartment.canStand(plate.x+dx,plate.z+dz)&&apartment.visible(plate.x+dx,plate.z+dz,plate.x,plate.z)),seed+': cannot reach kitchen hotplate');
  assert.ok(aroundFuse.some(([dx,dz])=>apartment.canStand(fuse.x+dx,fuse.z+dz)),seed+': cannot reach hallway fusebox');
  assert.ok(apartment.canStand(HOME.x,HOME.z),'power components must not obstruct entrance');
 }
});
test('malformed power save values safely default to off or restored state',()=>{
 assert.equal(readPower({stage:'tripped',unplugged:true}).stage,'safe');
 assert.equal(readPower({stage:'garbage'}).stage,'normal');
 assert.equal(readPower({stage:'restored',unplugged:true}).stage,'restored');
 assert.equal(readPower({stage:'safe',unplugged:false}).stage,'tripped');
});
