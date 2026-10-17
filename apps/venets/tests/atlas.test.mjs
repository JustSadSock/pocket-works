import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepYear,changeTitleHolder} from '../sim/world.js';
import {startCampaign,campaignYear} from '../sim/campaign.js';
import {makeAtlasGeometry,countyAtlasModel,atlasOwnerSnapshot,transferHighlights,
  familyRelations,heraldryFor} from '../atlas-core.js';

test('12 contiguous illustrated counties persist across dates and reloads',()=>{
 const w=createWorld(413),a=makeAtlasGeometry(w.seed),b=makeAtlasGeometry(w.seed);
 assert.deepEqual(a,b);
 assert.equal(a.polys.length,12);
 assert.equal(new Set(a.polys.map(p=>p.id)).size,12);
 for(const polygon of a.polys){
  assert.ok(polygon.path.startsWith('M')&&polygon.path.endsWith(' Z'));
  assert.ok(polygon.center.x>35&&polygon.center.x<830);
  assert.ok(polygon.center.y>20&&polygon.center.y<560);
 }
 const old=a.polys.map(p=>p.path);
 for(let i=0;i<20;i++)stepYear(w);
 assert.deepEqual(makeAtlasGeometry(w.seed).polys.map(p=>p.path),old);
});
test('contiguous shared geometry preserves neighbor-boundary topology',()=>{
 const g=makeAtlasGeometry(17),polygons=g.polys;
 for(const p of polygons)for(const q of polygons){
  const cornerHits=p.corners.filter(c=>q.corners.some(d=>c.key===d.key));
  const neighbor=Math.abs(p.x-q.x)+Math.abs(p.y-q.y)===1;
  if(neighbor)assert.equal(cornerHits.length,2,p.id+' '+q.id);
  else if(p.id!==q.id)assert.ok(cornerHits.length<2,p.id+' '+q.id);
 }
});
test('heraldry is stable across ownership transfers and 5 houses are distinct',()=>{
 const w=createWorld(23),atlas=countyAtlasModel(w);
 const before=atlasOwnerSnapshot(w);
 assert.equal(atlas.polygons.length,12);
 assert.ok(atlas.polygons.every(x=>x.holder&&x.title.id===x.province.titleId));
 const dynasties=w.dynasties.map(d=>heraldryFor(d.id));
 assert.equal(new Set(dynasties.map(v=>v.charge)).size,5);
 const county=w.titles.find(t=>t.id==='co-01');
 const other=w.people.find(p=>p.alive&&p.id!==county.holderId);
 changeTitleHolder(w,{titleId:county.id,newHolderId:other.id,cause:'atlas-qa-transfer'});
 assert.deepEqual(transferHighlights(before,w),['pr-01']);
 assert.equal(countyAtlasModel(w).polygons[0].holder.id,other.id);
 assert.deepEqual(makeAtlasGeometry(w.seed).polys,atlas.polys);
});
test('lineage is taken from actual family relations, not fake heirs',()=>{
 const w=createWorld(413),p=w.people.find(p=>p.id==='pe-01');
 const relations=familyRelations(w,p.id);
 assert.equal(relations.person.id,p.id);
 assert.deepEqual(relations.parents.map(x=>x.id),p.parentIds.filter(Boolean));
 assert.ok(relations.children.every(x=>x.parentIds.includes(p.id)));
 assert.equal(relations.spouse?.id??null,p.spouseId);
 assert.ok(relations.held.every(x=>x.holderId===p.id));
});
test('a long campaign retains stable geography while lineage and title colors change',()=>{
 const g=startCampaign({seed:413,countyId:'co-01'});
 const paths=makeAtlasGeometry(413).polys.map(p=>p.path);
 let transitions=0;
 for(let i=0;i<80&&!g.finished&&!g.chapterComplete;i++){
  const before=atlasOwnerSnapshot(g.world);
  campaignYear(g);
  transitions+=transferHighlights(before,g.world).length;
  assert.deepEqual(makeAtlasGeometry(g.world.seed).polys.map(p=>p.path),paths);
  assert.equal(countyAtlasModel(g.world).polygons.length,12);
 }
 assert.ok(transitions>0,'living political atlas must observe actual title transfers');
});
