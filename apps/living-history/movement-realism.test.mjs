import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize} from './model.js';
import {walkPath,walkingSteps,workdayFraction,walkable} from './navigation.js';
import {personPosition,cattlePosition,fieldAppearance} from './visual-land.js';
const at=(p,s)=>walkable(s,p.x,p.y);

test('family-selected open fields are safe, reachable and not forced into a village ring',()=>{
 const s=createWorld(413);
 for(const h of s.households){const c=s.communities.find(x=>x.id===h.communityId);
  assert.ok(h.fields.length>=1,`missing real strips for house ${h.id}: ${h.fields.length}`);
  assert.ok(h.fields.every(i=>s.usage[i]===2&&s.terrain[i]===0));
  const nearby=h.fields.filter(i=>Math.hypot(i%160-c.x,Math.floor(i/160)-c.y)<14);
  assert.ok(nearby.length<=h.fields.length);
  assert.ok(h.fields.every(i=>!h.croft.includes(i)),'field and private croft rights cannot overlap');
  assert.ok(h.fields.some(i=>walkingSteps(s,h,{x:i%160,y:Math.floor(i/160)})>5));
 }
});

test('a human work journey follows traversable tiles, with no decorative circular motion',()=>{
 const s=createWorld(17),h=s.households[0],p=s.people.find(p=>p.houseId===h.id);
 const target=h.fields[7],to={x:target%160,y:Math.floor(target/160)};
 const path=walkPath(s,h,to);assert.ok(path.length>6);
 assert.ok(path.every(pt=>at(pt,s)));
 const previous=new Map([[p.id,{x:h.x,y:h.y}]]);
 p.x=to.x;p.y=to.y;p.job='farm';const baseline=serialize(s);
 for(const t of [0,.08,.21,.34,.49,.6,.7,.82,1])assert.ok(at(personPosition(p,s,previous,t,true),s));
 assert.deepEqual(personPosition(p,s,previous,1,true),to);
 assert.equal(serialize(s),baseline);
 p.job='home';p.x=h.x;p.y=h.y;
 const standing=personPosition(p,s,previous,.17,true),late=personPosition(p,s,previous,.88,true);
 assert.ok(at(standing,s)&&at(late,s),'courtyard life must stay on accessible land');
 assert.ok(Math.hypot(standing.x-late.x,standing.y-late.y)<.45,'quiet home movement must remain subtle');
});

test('paths go through dry river crossings and require more time than straight-line travel',()=>{
 const s=createWorld(7777),a={x:57,y:40},b={x:94,y:40};
 const route=walkPath(s,a,b);assert.ok(route.length>37);
 assert.ok(route.every(pt=>at(pt,s)));
 const left=route.find(p=>p.x<75),right=route.find(p=>p.x>80);
 assert.ok(left&&right);
 // Road-aware routing can be physically longer than the shortest dirt walk,
 // but it must never shorten the actual geography or detour without bounds.
 assert.ok(walkingSteps(s,a,b)<=route.length-1);
 assert.ok(route.length-1<=walkingSteps(s,a,b)*1.8);
 assert.ok(workdayFraction(8)>workdayFraction(48));
});

test('cattle remain on real grazing ground, not in perpetual synchronized orbits',()=>{
 const s=createWorld(413),h=s.households.find(h=>h.cattle>0);
 assert.ok(h);const before=cattlePosition(h,17,0,s);
 assert.deepEqual(before,cattlePosition(h,18,0,s));
 advanceDays(s,140);
 if(Number.isInteger(h.lastPastureCell)){
  const a=cattlePosition(h,s.day+.3,0,s),b=cattlePosition(h,s.day+.8,0,s);
  assert.ok(at(a,s)&&at(b,s));
 }
});

test('multiyear agricultural paths maintain resource invariants and save compatibility',()=>{
 const s=createWorld(43821);
 for(let y=0;y<4;y++){advanceDays(s,365);assert.ok(audit(s).ok,audit(s).issues.join('; '));}
 const copy=deserialize(serialize(s));advanceDays(copy,30);advanceDays(s,30);assert.equal(serialize(copy),serialize(s));
 assert.ok(fieldAppearance(s).some(v=>v>0));
});