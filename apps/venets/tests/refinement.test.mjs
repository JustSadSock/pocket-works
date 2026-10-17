import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepYear,assertWorld,serializeWorld,loadWorld} from '../sim/world.js';
import {possibleActions,remember,memoryImpact} from '../sim/politics.js';
import {getAtlasGeometry,makeAtlasGeometry} from '../atlas-core.js';
const person=(w,id)=>w.people.find(p=>p.id===id);

function rivalWorld({disabled=false}={}){
 const w=createWorld(413,{experiment:disabled?{memory:false}:{}});
 const rival=person(w,'pe-02'),owner=person(w,'pe-01');
 const contested=w.titles.find(t=>t.id==='co-01');
 contested.claims.push({personId:rival.id,origin:'passed-over',sourceId:owner.id,year:w.year});
 rival.politics.traits.ambition=100;
 rival.politics.traits.caution=15;
 return w;
}
test('old refusal has a measurable, traceable influence on political choice rankings',()=>{
 const w=rivalWorld();
 const before=possibleActions(w,'pe-02').find(a=>a.kind==='faction'&&a.titleId==='co-01');
 assert.ok(before);
 const change=remember(w,{witnessId:'pe-02',otherId:'pe-01',kind:'grievance',weight:-27,
   cause:'petition-refused-by-duke'});
 assert.equal(change,-27);
 const after=possibleActions(w,'pe-02').find(a=>a.kind==='faction'&&a.titleId==='co-01');
 assert.ok(after.score>=before.score+20,'grudge meaningfully increases opposition');
 assert.ok(after.reasons.includes('remembered-injustice'));
 assert.equal(memoryImpact(w,'pe-02','pe-01').source.cause,'petition-refused-by-duke');
 assertWorld(w);
});
test('disabled memory removes the extra leverage without changing legal prerequisites',()=>{
 const w=rivalWorld({disabled:true});
 const before=possibleActions(w,'pe-02').find(a=>a.kind==='faction'&&a.titleId==='co-01');
 remember(w,{witnessId:'pe-02',otherId:'pe-01',kind:'grievance',weight:-27,
   cause:'petition-refused-by-duke'});
 const after=possibleActions(w,'pe-02').find(a=>a.kind==='faction'&&a.titleId==='co-01');
 assert.equal(after.score,before.score);
 assert.ok(!after.reasons.includes('remembered-injustice'));
 assert.equal(memoryImpact(w,'pe-02','pe-01').value,0);
 assertWorld(w);
});
test('historical grudges naturally decay without invented events and survive reload',()=>{
 const w=rivalWorld();
 w.profile='simple';
 remember(w,{witnessId:'pe-02',otherId:'pe-01',kind:'grievance',weight:-24,
   cause:'old-refusal'});
 const original=memoryImpact(w,'pe-02','pe-01').value;
 for(let i=0;i<10;i++)stepYear(w);
 const middle=memoryImpact(w,'pe-02','pe-01').value;
 assert.ok(middle>original&&middle<0);
 const copy=loadWorld(serializeWorld(w));
 assert.deepEqual(memoryImpact(copy,'pe-02','pe-01'),memoryImpact(w,'pe-02','pe-01'));
 for(let i=0;i<15;i++)stepYear(w);
 assert.equal(memoryImpact(w,'pe-02','pe-01').value,0);
 assertWorld(w);
});
test('immutable atlas geometry is cached per seed and world size without changing paths',()=>{
 const a=getAtlasGeometry(413,12),b=getAtlasGeometry(413,12);
 const wide=getAtlasGeometry(413,48);
 assert.equal(a,b);
 assert.equal(wide,getAtlasGeometry(413,48));
 assert.notEqual(wide,a);
 assert.equal(wide.polys.length,48);
 assert.deepEqual(wide,makeAtlasGeometry(413,48));
 assert.deepEqual(a,makeAtlasGeometry(413,12));
});
test('long-run 12/48 worlds remain causally replayable after extra political memories',()=>{
 for(const size of [12,48]){
  const w=createWorld(43,{size});
  for(let i=0;i<30;i++)stepYear(w);
  const restored=loadWorld(serializeWorld(w));
  for(let i=0;i<8;i++){stepYear(w);stepYear(restored)}
  assert.equal(serializeWorld(w),serializeWorld(restored));
  assertWorld(w);
 }
});
