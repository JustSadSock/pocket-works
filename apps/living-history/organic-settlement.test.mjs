import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,SIZE} from './model.js';
import {walkPath} from './navigation.js';

const ix=(x,y)=>y*SIZE+x;
const positiveRoad=s=>s.traffic.filter(x=>x>14).length;
const nearVillage=(h,c)=>Math.hypot(h.x-c.x,h.y-c.y);

test('founders choose physical toft/croft titles and no site overlaps another property',()=>{
 for(const seed of [413,43821,9001]){
  const s=createWorld(seed),owners=new Set(),ids=new Set();
  assert.equal(s.communities.length,4);
  assert.ok(s.households.length>=32,`seed=${seed} households=${s.households.length}`);
  for(const h of s.households){
   const c=s.communities.find(c=>c.id===h.communityId);
   assert.ok(c);
   assert.ok(nearVillage(h,c)<36);
   assert.ok(h.croft?.length>=2,`no croft: ${seed} ${h.id}`);
   assert.equal(s.usage[ix(h.x,h.y)],1);
   for(const i of h.croft){
    assert.equal(s.usage[i],3,'crofts must be physically reserved');
    assert.ok(!owners.has(i),'multiple owners to one parcel');
    owners.add(i);
    assert.ok(!h.fields.includes(i),'croft is not a remote open-field strip');
   }
   ids.add(h.id);
  }
  assert.equal(ids.size,s.households.length);
  const report=audit(s);assert.ok(report.ok,`seed=${seed} ${report.issues.slice(0,8)}`);
 }
});

test('cultivation is no longer confined to scripted four cardinal rectangles',()=>{
 const s=createWorld(413);
 let other=0;
 for(const h of s.households){
  const c=s.communities.find(c=>c.id===h.communityId);
  for(const cell of h.fields){
   const dx=(cell%SIZE)-c.x,dy=Math.floor(cell/SIZE)-c.y;
   // The old model only allowed one coordinate to stay within 13 tiles
   // of the village centre. Organic blocks must reach some diagonal sectors.
   if(Math.abs(dx)>14&&Math.abs(dy)>14)other++;
   // Founding plots may now lie close to the village: actual available rights,
   // soil, household distance and garden protection determine the fringe.
   assert.ok(s.terrain[cell]===0&&s.usage[cell]===2);
  }
 }
 assert.ok(other>0,`no fields outside four artificial cross arms, seed 413`);
});

test('initial paths follow actual household destinations and later footfall wears them further',()=>{
 const s=createWorld(7777),start=positiveRoad(s);
 assert.ok(start>10,`occupied medieval valley begins with no inherited footpaths: ${start}`);
 const c=s.communities[0],home=s.households.find(h=>h.communityId===c.id);
 const route=walkPath(s,home,c);
 assert.ok(route.length>1);
 assert.ok(route.some(p=>s.traffic[ix(p.x,p.y)]>0),'market access is a walked path');
 const before=s.traffic.slice();
 advanceDays(s,365);
 assert.ok(s.traffic.some((n,i)=>n>before[i]),'actual transactions and fieldwork wear footpaths');
 assert.ok(audit(s).ok);
});

test('an illicit or unowned croft is rejected by the physical-rights audit',()=>{
 const s=createWorld(413),h=s.households[0],i=h.croft[0];
 h.croft=h.croft.filter(n=>n!==i);
 const report=audit(s);
 assert.ok(!report.ok);
 assert.ok(report.issues.some(t=>t.includes('Приусадебный участок без владельца')));
});

test('old saves without croft records remain readable; new saves preserve placement and deterministic years',()=>{
 const s=createWorld(9001);
 advanceDays(s,70);
 const saved=serialize(s),restored=deserialize(saved);
 assert.equal(serialize(restored),saved);
 advanceDays(s,20);advanceDays(restored,20);
 assert.equal(serialize(restored),serialize(s));
 // Legacy villages have no toft/croft ownership map. No land is gifted to
 // old households upon loading; their pre-existing cereal rights are kept.
 const legacy=JSON.parse(saved);
 for(const h of legacy.households){
  for(const cell of h.croft||[])legacy.usage[cell]=0;
  delete h.croft;
 }
 const old=deserialize(JSON.stringify(legacy));
 assert.ok(old.households.every(h=>h.croft.length===0));
 assert.ok(audit(old).ok);
});
