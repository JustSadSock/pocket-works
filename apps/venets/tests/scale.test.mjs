import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepYear,serializeWorld,loadWorld,assertWorld} from '../sim/world.js';
import {startCampaign,campaignYear,serializeCampaign,loadCampaign} from '../sim/campaign.js';
import {makeAtlasGeometry,countyAtlasModel} from '../atlas-core.js';

test('48 counties, 12 duchies, 12 houses, connected 8x6 world and real families',()=>{
 const w=createWorld(413,{size:48});
 assert.equal(w.provinces.length,48);
 assert.equal(w.titles.length,61);
 assert.equal(w.dynasties.length,12);
 assert.equal(w.titles.filter(t=>t.rank==='duchy').length,12);
 assert.ok(w.people.length>=122 && w.people.length<=220);
 for(const d of w.titles.filter(t=>t.rank==='duchy')){
  const wards=w.titles.filter(t=>t.liegeId===d.id);
  assert.equal(wards.length,4);
 }
 const geometry=makeAtlasGeometry(413,48);
 assert.equal(geometry.polys.length,48);
 assert.equal(countyAtlasModel(w).polygons.length,48);
 assert.equal(new Set(geometry.polys.map(x=>x.path)).size,48);
 assertWorld(w);
});
test('original 12 world seed and save format remain unaffected',()=>{
 const original=createWorld(413);
 const explicit=createWorld(413,{size:12});
 assert.equal(serializeWorld(original),serializeWorld(explicit));
 assert.equal(original.profile,undefined);
 assert.equal(original.provinces.length,12);
 assertWorld(loadWorld(serializeWorld(original)));
});
test('48-world political activity and conservation stay legal across years',()=>{
 const w=createWorld(23,{size:48});
 const before=makeAtlasGeometry(w.seed,48).polys.map(x=>x.path);
 for(let n=0;n<20;n++)stepYear(w);
 assertWorld(w);
 assert.deepEqual(makeAtlasGeometry(w.seed,48).polys.map(x=>x.path),before);
 assert.ok(w.events.some(e=>e.kind==='political-decision'));
 const snapshot=serializeWorld(w);
 assert.equal(serializeWorld(loadWorld(snapshot)),snapshot);
});
test('48-land campaign accepts decisions, resumes and survives generations',()=>{
 const g=startCampaign({seed:31,countyId:'co-01',size:48});
 assert.equal(g.world.provinces.length,48);
 for(let n=0;n<18;n++)campaignYear(g);
 const saved=serializeCampaign(g),restored=loadCampaign(saved);
 assert.equal(serializeCampaign(restored),saved);
 campaignYear(g);campaignYear(restored);
 assert.equal(serializeCampaign(g),serializeCampaign(restored));
});
test('simple profile isolates structural generational simulation from autonomous diplomacy',()=>{
 const w=createWorld(38,{size:48,profile:'simple'});
 for(let n=0;n<15;n++)stepYear(w);
 assert.ok(!w.events.some(e=>e.kind==='political-decision'));
 assert.ok(w.events.some(e=>e.kind==='death'));
 assertWorld(w);
});
test('all four counterfactual switches are individually valid and deterministic',()=>{
 for(const component of ['memory','goals','diplomacy','inheritance']){
  const experiment={[component]:false};
  const w=createWorld(43,{size:12,experiment});
  for(let n=0;n<10;n++)stepYear(w);
  assertWorld(w);
  const saved=serializeWorld(w);
  const other=loadWorld(saved);
  stepYear(w);stepYear(other);
  assert.equal(serializeWorld(w),serializeWorld(other),component);
 }
});

test('extended 48-land campaign completes its full ninety-year founding chronicle',()=>{
 const g=startCampaign({seed:413,countyId:'co-02',size:48});
 for(let i=0;i<90;i++)campaignYear(g);
 assert.equal(g.world.year,1156);
 assert.equal(g.chapterComplete,true);
 assertWorld(g.world);
 const saved=serializeCampaign(g);
 const restored=loadCampaign(saved);
 assert.equal(restored.world.provinces.length,48);
 assert.equal(serializeCampaign(restored),saved);
});
