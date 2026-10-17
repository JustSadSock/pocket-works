import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, stepYear, advanceYears, assertWorld, serializeWorld, loadWorld, summary,
  possibleActions, politicalYear, performPoliticalAction, opinion, remember
} from '../sim/world.js';

const get=(w,id)=>w.people.find(p=>p.id===id);
const title=(w,id)=>w.titles.find(t=>t.id===id);

test('founding characters have distinct bounded personalities and active political registry',()=>{
  for(const seed of [0,1,413,7777,0xffffffff]){
    const w=createWorld(seed);
    assert.equal(w.schemaVersion,4);
    assert.equal(w.politics.nextFactionId,1);
    assert.ok(w.people.every(p=>p.politics && Object.keys(p.politics.traits).length===4));
    assert.ok(new Set(w.people.map(p=>JSON.stringify(p.politics.traits))).size>20);
    assertWorld(w);
  }
});
test('autonomous political AI explains scores and produces real world consequences',()=>{
  const w=advanceYears(createWorld(413),25);
  const decisions=w.events.filter(e=>e.kind==='political-decision');
  assert.ok(decisions.length>40,'agents must be active');
  assert.ok(w.politics.stats.actions===decisions.length);
  assert.ok(decisions.some(e=>e.effect.kind==='gift'&&e.effect.outcome.success));
  assert.ok(decisions.some(e=>e.effect.kind==='marriage'&&e.effect.outcome.success));
  assert.ok(decisions.every(e=>Number.isSafeInteger(e.effect.score)&&
    e.effect.reasons.length>0&&typeof e.effect.goal==='string'));
  assert.ok(w.people.some(p=>p.politics.memories.length),'must store remembered interactions');
  assert.ok(w.events.some(e=>e.kind==='goal-changed'),'must update long-term goals when world changes');
  assertWorld(w);
});
test('different temperaments lead to different utility rankings with same objective state',()=>{
  const base=createWorld(99);
  const actor=base.people.find(p=>p.treasury.coin>=14 &&
    possibleActions(base,p.id).some(a=>a.kind==='gift'));
  assert.ok(actor);
  // Only character weights change; identical world and resources.
  const peer=get(base,'pe-01');
  const before=possibleActions(base,actor.id).find(a=>a.kind==='gift');
  assert.ok(before,'The ruler should be able to offer diplomacy');
  const old={...actor.politics.traits};
  actor.politics.traits.diplomacy=100;actor.politics.traits.loyalty=95;actor.politics.traits.ambition=15;
  const diplomatic=possibleActions(base,actor.id).find(a=>a.kind==='gift');
  actor.politics.traits.diplomacy=15;actor.politics.traits.loyalty=15;actor.politics.traits.ambition=100;
  const aggressive=possibleActions(base,actor.id).find(a=>a.kind==='gift');
  assert.ok(diplomatic.score>aggressive.score+20,'high diplomacy and loyalty should favor gifts');
  actor.politics.traits=old;
  assert.ok(peer);
});
test('direct diplomatic gift is constrained by wallet and changes opinion + ledger',()=>{
  const w=createWorld(123);
  const actor=w.people.find(p=>p.alive&&p.treasury.coin>=14&&
    possibleActions(w,p.id).some(a=>a.kind==='gift'));
  assert.ok(actor);
  const a=possibleActions(w,actor.id).find(a=>a.kind==='gift');
  const before=actor.treasury.coin,recipient=get(w,a.targetId).treasury.coin;
  const result=performPoliticalAction(w,{actorId:actor.id,kind:'gift',targetId:a.targetId});
  assert.equal(result.success,true);
  assert.equal(actor.treasury.coin,before-result.amount);
  assert.equal(get(w,a.targetId).treasury.coin,recipient+result.amount);
  assert.ok(opinion(w,a.targetId,actor.id)>0);
  assert.equal(w.politics.stats.gifts,1);
  assert.equal(w.events.at(-1).kind,'political-decision');
  assert.throws(()=>performPoliticalAction(w,{actorId:actor.id,kind:'gift',targetId:a.targetId}),
    /not available/,'cooldown must block spam');
  assertWorld(w);
});
test('claimant coalition can recruit nobles and negotiate a real title transfer',()=>{
  const w=createWorld(413),holder=get(w,'pe-01'),claimant=get(w,'pe-02');
  title(w,'co-01').claims.push({personId:claimant.id,origin:'passed-over',
    sourceId:holder.id,year:w.year});
  claimant.politics.traits.ambition=100;
  claimant.politics.traits.caution=15;
  const founded=performPoliticalAction(w,{actorId:claimant.id,kind:'faction',
    targetId:holder.id,titleId:'co-01'});
  assert.equal(founded.success,true);
  const f=w.politics.factions[0];
  for(const id of ['pe-03','pe-04']) {
    const options=possibleActions(w,id).filter(a=>a.kind==='join'&&a.meta.factionId===f.id);
    assert.equal(options.length,1);
    performPoliticalAction(w,{actorId:id,kind:'join',targetId:f.leaderId,
      titleId:'co-01',factionId:f.id});
  }
  // Faction must be old enough to negotiate, no battle/fake province occupation.
  f.createdYear=w.year-1;
  holder.politics.traits.caution=100;holder.politics.traits.ambition=15;
  const accepted=performPoliticalAction(w,{actorId:claimant.id,kind:'ultimatum',
    targetId:holder.id,titleId:'co-01',factionId:f.id});
  assert.equal(accepted.success,true);
  assert.equal(title(w,'co-01').holderId,claimant.id);
  assert.equal(title(w,'co-01').history.at(-1).to,claimant.id);
  assert.equal(w.politics.factions.length,0);
  assert.equal(w.politics.stats.concessions,1);
  assert.ok(w.events.some(e=>e.kind==='faction-ended'));
  assertWorld(w);
});
test('rejected ultimatum has persistent political cost, not a fabricated war',()=>{
  const w=createWorld(9),holder=get(w,'pe-01'),claimant=get(w,'pe-02');
  title(w,'co-01').claims.push({personId:claimant.id,origin:'passed-over',
    sourceId:holder.id,year:w.year});
  claimant.politics.traits.ambition=100;claimant.politics.traits.caution=15;
  performPoliticalAction(w,{actorId:claimant.id,kind:'faction',
    targetId:holder.id,titleId:'co-01'});
  const f=w.politics.factions[0];f.createdYear=w.year-1;
  performPoliticalAction(w,{actorId:'pe-03',kind:'join',targetId:f.leaderId,titleId:'co-01',factionId:f.id});
  holder.politics.traits.caution=15;holder.politics.traits.ambition=100;
  const previous=opinion(w,claimant.id,holder.id);
  const refused=performPoliticalAction(w,{actorId:claimant.id,kind:'ultimatum',
    targetId:holder.id,titleId:'co-01',factionId:f.id});
  assert.equal(refused.success,false);
  assert.equal(refused.reason,'ultimatum-rejected');
  assert.equal(title(w,'co-01').holderId,holder.id);
  assert.ok(opinion(w,claimant.id,holder.id)<previous);
  assert.ok(get(w,claimant.id).politics.memories.some(m=>m.kind==='grievance'));
  assert.equal(w.politics.stats.refusals,1);
  assertWorld(w);
});
test('relationship memories decay and remain bounded; invalid relation rejected',()=>{
  const w=createWorld(77);
  assert.throws(()=>remember(w,{witnessId:'pe-01',otherId:'pe-01',kind:'favor',weight:2,cause:'self'}));
  for(let i=0;i<45;i++)remember(w,{witnessId:'pe-01',otherId:'pe-02',
    kind:'favor',weight:1,cause:'interaction-'+i});
  assert.equal(get(w,'pe-01').politics.memories.length,12);
  assert.ok(opinion(w,'pe-01','pe-02')<=100);
  assertWorld(w);
});
test('v0.3 migration preserves titles, balances, history and adds only forward-looking politics',()=>{
  const original=createWorld(777);
  const old=structuredClone(original);
  old.schemaVersion=3;
  delete old.politics;
  for(const p of old.people)delete p.politics;
  const history=JSON.stringify(old.events),titles=JSON.stringify(old.titles),ledger=JSON.stringify(old.ledger);
  const upgraded=loadWorld(JSON.stringify(old));
  assert.equal(upgraded.schemaVersion,4);
  assert.equal(JSON.stringify(upgraded.titles),titles);
  assert.equal(JSON.stringify(upgraded.ledger),ledger);
  assert.equal(JSON.stringify(upgraded.events.slice(0,-1)),history);
  assert.equal(upgraded.events.at(-1).cause,'schema-v3-to-v4');
  assert.equal(loadWorld(serializeWorld(upgraded)).events.length,upgraded.events.length);
  advanceYears(upgraded,2);assertWorld(upgraded);
});
test('full journal, factions and political memory are deterministic over save/load',()=>{
  const a=advanceYears(createWorld(9001),25),b=loadWorld(serializeWorld(a));
  advanceYears(a,30);advanceYears(b,30);
  assert.equal(serializeWorld(a),serializeWorld(b));
  assert.deepEqual(summary(a),summary(b));
});
test('stress: 100 seeds × 100 years, audited factions, titles, budgets and relationships',()=>{
  let actions=0,concessions=0,marriages=0;
  for(let seed=0;seed<100;seed++){
    const w=advanceYears(createWorld(seed),100);
    assertWorld(w);
    assert.equal(w.year,1166);
    assert.equal(w.titles.length,17);
    actions+=w.politics.stats.actions;
    concessions+=w.politics.stats.concessions;
    marriages+=w.politics.stats.marriages;
  }
  assert.ok(actions>1000,'politicians must actually negotiate');
  assert.ok(marriages>100,'dynasties must continue reproducing');
  assert.ok(concessions>=0);
});
