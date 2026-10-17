import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, advanceYears, stepYear, assertWorld, serializeWorld, loadWorld,
  birth, marry, die, setSuccessionLaw, descendantBranches, changeTitleHolder, summary, ancestors
} from '../sim/world.js';

function titled(world,id) { return world.titles.filter(t=>t.holderId===id).map(t=>t.id).sort(); }
function lord(world,id='pe-17') { return world.people.find(p=>p.id===id); }
function addRoyalChildren(world,n=2) {
  const king=lord(world);
  assert.equal(king.sex,'male');
  const mother=lord(world,king.spouseId);
  for(let i=0;i<n;i++) birth(world,{motherId:mother.id,fatherId:king.id,cause:'test-child-'+i});
  return descendantBranches(world,king.id).map(p=>p.id);
}
test('all founders have coherent spouses, child chronology and title legal records',()=>{
  for(const seed of [0,1,413,7777,4294967295]){
    const world=createWorld(seed);
    assert.equal(world.schemaVersion,3);
    assert.equal(world.titles.length,17);
    assert.ok(world.people.length>=34);
    assert.equal(world.people.filter(p=>p.origin==='founder-spouse').length,17);
    assert.equal(world.people.filter(p=>p.alive).length,world.people.length);
    assertWorld(world);
    for(const t of world.titles){
      assert.ok(['partition','primogeniture','seniority'].includes(t.law));
      assert.equal(t.history.at(-1).to,t.holderId);
    }
    for(const p of world.people){
      if(p.parentIds[0]) assert.ok(world.people.find(x=>x.id===p.parentIds[0]).birthYear+16<=p.birthYear);
    }
  }
});
test('marriage and birth change real kinship with reproducible parent IDs',()=>{
  const world=createWorld(29),king=lord(world),mother=lord(world,king.spouseId);
  const before=world.people.length;
  const child=birth(world,{motherId:mother.id,fatherId:king.id});
  assert.equal(world.people.length,before+1);
  assert.deepEqual(child.parentIds,[king.id,mother.id]);
  assert.equal(child.dynastyId,king.dynastyId);
  assert.ok(ancestors(world,child.id).has(king.id));
  assert.ok(world.events.some(e=>e.kind==='birth'&&e.effect.personId===child.id));
  assert.throws(()=>marry(world,{personAId:king.id,personBId:mother.id}),/Already married/);
  assert.throws(()=>marry(world,{personAId:child.id,personBId:king.id}),/Already married|adults|living|opposite-sex/);
  assertWorld(world);
});
test('primogeniture passes crown to first represented descendant',()=>{
  const world=createWorld(413),king=lord(world);
  addRoyalChildren(world,2);
  const branches=descendantBranches(world,king.id);
  assert.ok(branches.length>=2);
  const oldTitles=titled(world,king.id);
  const previous=king.treasury.coin;
  die(world,{personId:king.id,cause:'scripted-test-death'});
  assert.equal(king.alive,false);
  assert.equal(king.deathYear,world.year);
  assert.equal(world.titles.find(t=>t.id==='ki-01').holderId,branches[0].id);
  assert.ok(titled(world,branches[0].id).length>=oldTitles.length);
  assert.equal(king.treasury.coin,0);
  assert.ok(branches[0].treasury.coin>=previous);
  assert.equal(lord(world,king.spouseId)?.alive,undefined); // deceased keeps historical spouse pointer
  assertWorld(world);
});
test('partible succession distributes several real counties to separate branches',()=>{
  const world=createWorld(15),king=lord(world);
  addRoyalChildren(world,3);
  const branches=descendantBranches(world,king.id).map(p=>p.id);
  for(const id of ['co-01','co-02','co-03']){
    changeTitleHolder(world,{titleId:id,newHolderId:king.id,cause:'pre-succession-grant'});
    setSuccessionLaw(world,{titleId:id,law:'partition',cause:'test-law'});
  }
  die(world,{personId:king.id,cause:'partible-test'});
  const owners=['co-01','co-02','co-03'].map(id=>world.titles.find(t=>t.id===id).holderId);
  assert.deepEqual(owners,branches.slice(0,3));
  assert.ok(new Set(owners).size>=2);
  for(const id of ['co-01','co-02','co-03']) {
    const t=world.titles.find(x=>x.id===id);
    assert.equal(t.history.at(-1).to,t.holderId);
    assert.ok(t.claims.some(c=>branches.includes(c.personId)&&c.personId!==t.holderId));
  }
  assertWorld(world);
});
test('seniority allows another elder house member to inherit over children',()=>{
  const world=createWorld(123),king=lord(world);
  addRoyalChildren(world);
  setSuccessionLaw(world,{titleId:'ki-01',law:'seniority'});
  const elders=world.people.filter(p=>p.alive&&p.id!==king.id&&p.dynastyId===king.dynastyId)
    .sort((a,b)=>a.birthYear-b.birthYear || a.id.localeCompare(b.id));
  const expected=elders[0].id;
  die(world,{personId:king.id,cause:'house-seniority-test'});
  assert.equal(world.titles.find(t=>t.id==='ki-01').holderId,expected);
  assertWorld(world);
});
test('childless lord falls back to a living dynasty member or liege, never dead owner',()=>{
  const world=createWorld(91);
  const holder=world.people.find(p=>p.origin==='founder'&&!world.people.some(ch=>ch.parentIds.includes(p.id)));
  assert.ok(holder,'Need at least one childless founder');
  const oldTitles=titled(world,holder.id);
  assert.ok(oldTitles.length);
  die(world,{personId:holder.id,cause:'childless-test'});
  assert.equal(titled(world,holder.id).length,0);
  for(const id of oldTitles)assert.ok(world.people.find(p=>p.id===world.titles.find(t=>t.id===id).holderId).alive);
  assertWorld(world);
});
test('widow keeps marital history and can receive childless spouse estate',()=>{
  const world=createWorld(52);
  const holder=world.people.find(p=>p.origin==='founder'&&!world.people.some(ch=>ch.parentIds.includes(p.id)));
  assert.ok(holder);
  const spouse=lord(world,holder.spouseId),old=holder.treasury.grain;
  // A titled spouse's title passes according to law, while personal estate goes to that heir.
  die(world,{personId:holder.id,cause:'widow-test'});
  assert.equal(spouse.spouseId,null);
  assert.equal(holder.spouseId,spouse.id);
  assert.ok(spouse.marriages.some(m=>m.spouseId===holder.id));
  assert.equal(holder.treasury.grain,0);
  assert.ok(world.events.some(e=>e.kind==='inheritance'&&e.effect.deceasedId===holder.id));
  assert.ok(old>=0);
  assertWorld(world);
});
test('all 17 titles survive a 100-year world and no deceased character holds land',()=>{
  const w=advanceYears(createWorld(413),100);
  assert.equal(w.year,1166);
  assert.equal(w.titles.length,17);
  for(const title of w.titles){
    assert.ok(w.people.find(p=>p.id===title.holderId).alive);
    assert.ok(title.history.length>=1);
  }
  assert.ok(w.stats.deaths>=10);
  assert.ok(w.stats.births>=10);
  assert.ok(w.stats.marriages>=5);
  assertWorld(w);
});
test('snapshot replay and new marriages/births reproduce same world bit-for-bit',()=>{
  const a=advanceYears(createWorld(9001),41);
  const b=loadWorld(serializeWorld(a));
  advanceYears(a,45);
  advanceYears(b,45);
  assert.equal(serializeWorld(a),serializeWorld(b));
  assert.deepEqual(summary(a),summary(b));
});
test('v2 snapshot migrates to v3 without changing known money, titles or event journal',()=>{
  const model=createWorld(77);
  const old=structuredClone(model);
  old.people=old.people.slice(0,17).map(p=>{
    const {sex,parentIds,spouseId,marriages,alive,deathYear,origin,...v2}=p;return v2;
  });
  old.titles=old.titles.map(t=>{const {law,claims,history,...rest}=t;return rest;});
  delete old.nextPersonId;
  for(const key of ['births','deaths','marriages','escheats','partitions'])delete old.stats[key];
  old.schemaVersion=2;
  for(const good of ['grain','coin'])old.ledger.initial[good]=
    [...old.people,...old.provinces].reduce((s,p)=>s+p.treasury[good],0);
  old.events[0].effect.people=17;
  const converted=loadWorld(JSON.stringify(old));
  assert.equal(converted.schemaVersion,3);
  assert.equal(converted.people.length,17);
  assert.deepEqual(converted.ledger,old.ledger);
  assert.equal(converted.events.at(-1).kind,'migration');
  assert.equal(converted.events.length,old.events.length+1);
  assertWorld(converted);
  advanceYears(converted,5);
  assertWorld(converted);
});
test('v0.3 ensemble accepts at least 100 seeds by 100 years with balanced estates',()=>{
  let total=0,deaths=0,births=0,partitions=0,distinctHistories=new Set();
  for(let seed=0;seed<100;seed++){
    const world=advanceYears(createWorld(seed),100);
    assert.equal(world.year,1166);
    assertWorld(world);
    deaths+=world.stats.deaths;
    births+=world.stats.births;
    partitions+=world.stats.partitions;
    distinctHistories.add(world.people.length+':'+world.stats.deaths+':'+world.stats.marriages+':'+world.titles.find(t=>t.id==='ki-01').holderId);
    total++;
  }
  assert.equal(total,100);
  assert.ok(deaths>100,'Model must simulate real generational replacement');
  assert.ok(births>100,'Model must include births over multiple generations');
  assert.ok(partitions>0,'At least some division of multi-titled holdings');
  assert.ok(distinctHistories.size>80,'Worlds must yield meaningfully different demographics');
});
