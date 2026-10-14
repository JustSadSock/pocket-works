import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize} from './model.js';
import {fieldAppearance,personPosition,cattlePosition} from './visual-land.js';

test('owned but unplanted parcels are visually fallow, ploughed area becomes real crop only after work',()=>{
 const s=createWorld(413),h=s.households[0];
 const before=fieldAppearance(s);
 assert.ok(h.fields.every(i=>before[i]>=1&&before[i]<=2));
 advanceDays(s,365+120);const map=fieldAppearance(s);
 const real=h.farmYear;assert.ok(real.sownArea>0);
 assert.ok(real.active.some(i=>map[i]===2));
 assert.ok(h.fields.some(i=>map[i]===1));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('visual movement interpolates actual worker position without changing serialized world',()=>{
 const s=createWorld(17),p=s.people[0],prior=new Map([[p.id,{x:p.x-2,y:p.y-3}]]);
 const before=serialize(s);
 const a=personPosition(p,s,prior,0,true),b=personPosition(p,s,prior,1,true);
 assert.ok(Number.isFinite(a.x)&&Number.isFinite(b.y));
 assert.equal(serialize(s),before);
 assert.deepEqual(cattlePosition(s.households[0],17,0),cattlePosition(s.households[0],18,0)); // no artificial circles
});

test('grazing and haymaking consume finite shared meadow, cattle can perish, all physical accounts reconcile',()=>{
 const s=createWorld(413),init=s.households.reduce((n,h)=>n+h.cattle,0);
 assert.ok(init>0);const initialPasture=s.pasture.reduce((a,b)=>a+b,0);
 advanceDays(s,365*3);
 assert.ok(s.stats.forageConsumed>0);
 assert.ok(s.stats.forageGrown>0);
 assert.ok(s.pasture.some(v=>v<200));
 assert.ok(s.households.some(h=>h.fodder>0));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 const restored=deserialize(serialize(s));advanceDays(restored,40);advanceDays(s,40);
 assert.equal(serialize(restored),serialize(s));
 assert.ok(initialPasture>0);
});

test('pasture scarcity kills cattle without introducing or deleting physical resources',()=>{
 const s=createWorld(13),h=s.households.find(h=>h.cattle>0);assert.ok(h);
 h.fodder=0;s.economy.forageInitial=Number((s.pasture.reduce((n,v)=>n+v,0)+s.households.reduce((n,v)=>n+v.fodder,0)+s.stats.forageConverted).toFixed(2));
 s.pasture.fill(0);s.economy.forageInitial=Number((s.households.reduce((n,v)=>n+v.fodder,0)+s.stats.forageConverted).toFixed(2));
 const old=s.stats.cattleDied;for(let d=0;d<70;d++)advanceDays(s,1);
 assert.ok(s.stats.cattleDied>old);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});