import test from 'node:test';
import assert from 'node:assert/strict';
import {startCampaign,campaignChoices,campaignAction,campaignYear,serializeCampaign,loadCampaign} from '../sim/campaign.js';
import {createWorld,loadWorld,serializeWorld,assertWorld} from '../sim/world.js';
import {conflictChoices,performConflictAction,ensureConflicts,assertConflicts} from '../sim/conflicts.js';
const choose=(g,kind)=>campaignChoices(g).find(a=>a.kind===kind);

test('founder has grounded military, secret and contractual routes; no free war',()=>{
 const g=startCampaign({seed:413,countyId:'co-01'});
 const kinds=campaignChoices(g).map(a=>a.kind);
 assert.ok(kinds.includes('war'),'war requires an existing legal claim');
 assert.ok(kinds.includes('blackmail'),'political claim can be investigated');
 assert.ok(kinds.includes('contract'),'a finite service oath is possible');
 const war=choose(g,'war'),before=g.world.people.find(p=>p.id===g.playerId).treasury;
 const initial={...before};
 const outcome=campaignAction(g,war);
 assert.equal(outcome.success,true);
 assert.equal(g.world.conflicts.wars.length,1);
 assert.equal(g.world.conflicts.wars[0].attackerId,g.playerId);
 assert.equal(g.world.people.find(p=>p.id===g.playerId).treasury.coin,initial.coin-10);
 assert.equal(g.world.people.find(p=>p.id===g.playerId).treasury.grain,initial.grain-14);
 assert.deepEqual(campaignChoices(g),[]);
 assert.throws(()=>campaignAction(g,war),/already settled/);
 assertWorld(g.world);
});
test('paid sworn military service is a direct double-entry transfer, never minted',()=>{
 const g=startCampaign({seed:413,countyId:'co-02'}),a=choose(g,'contract');
 assert.ok(a);
 const w=g.world,actor=w.people.find(p=>p.id===g.playerId);
 const before=w.ledger.created.coin,coin=actor.treasury.coin;
 const recipient=w.people.find(p=>p.id===a.targetId);
 const rcoin=recipient.treasury.coin;
 const outcome=campaignAction(g,a);
 if(outcome.success){
   assert.equal(actor.treasury.coin,coin-8);
   assert.equal(recipient.treasury.coin,rcoin+8);
   assert.equal(w.conflicts.contracts.length,1);
 }else assert.equal(actor.treasury.coin,coin);
 assert.equal(w.ledger.created.coin,before,'service should not fabricate currency');
 assertWorld(w);
});
test('all claim wars end with a legal settlement inside eight years, never fight forever',()=>{
 let checked=0;
 for(const seed of [1,7,13,43,413,777]){
  const g=startCampaign({seed,countyId:'co-01'});
  const a=choose(g,'war');
  if(!a)continue;
  campaignAction(g,a);
  const id=g.world.conflicts.wars[0].id;
  for(let i=0;i<8 && g.world.conflicts.wars.some(w=>w.id===id);i++)campaignYear(g);
  assert.ok(!g.world.conflicts.wars.some(w=>w.id===id),'war must resolve');
  const peace=g.world.events.find(e=>e.kind==='war-peace'&&e.effect.warId===id);
  assert.ok(peace);
  assert.ok(['victory','defeat','withdrawal'].includes(peace.effect.outcome));
  assertWorld(g.world);
  checked++;
 }
 assert.ok(checked>=3);
});
test('plot requires money, takes calendar time and can never directly invent land',()=>{
 const g=startCampaign({seed:413,countyId:'co-03'});
 const a=choose(g,'blackmail');assert.ok(a);
 const before=g.world.people.find(p=>p.id===g.playerId).treasury.coin;
 const title=g.world.titles.find(t=>t.id===a.titleId);
 const old=title.holderId;
 campaignAction(g,a);
 assert.equal(g.world.people.find(p=>p.id===g.playerId).treasury.coin,before-8);
 assert.equal(title.holderId,old,'starting plot does not auto-conquer');
 let years=0;
 while(g.world.conflicts.schemes.length&&years<7){campaignYear(g);years++;}
 assert.equal(g.world.conflicts.schemes.length,0);
 const event=g.world.events.find(e=>e.kind==='scheme-ended'&&e.effect.kind==='blackmail');
 assert.ok(event);assert.ok(years>=2&&years<=6);
 if(title.holderId!==old)assert.equal(title.holderId,g.playerId);
 assertWorld(g.world);
});
test('peace is offered during a war and does not transfer a title',()=>{
 const g=startCampaign({seed:413,countyId:'co-01'});
 const declaration=choose(g,'war');campaignAction(g,declaration);
 campaignYear(g);
 const peace=choose(g,'peace');
 assert.ok(peace,'attacker must have an actionable exit');
 const owner=g.world.titles.find(t=>t.id===declaration.titleId).holderId;
 const res=campaignAction(g,peace);
 assert.ok(res.success);
 assert.equal(g.world.conflicts.wars.length,0);
 assert.equal(g.world.titles.find(t=>t.id===declaration.titleId).holderId,owner);
 assertWorld(g.world);
});
test('v0.6 saves migrate without inventing history and replay deterministically',()=>{
 const g=startCampaign({seed:413,countyId:'co-01'});
 const old=JSON.parse(serializeCampaign(g));delete old.world.conflicts;
 const migrated=loadCampaign(JSON.stringify(old));
 assert.ok(migrated.world.conflicts);
 assert.equal(migrated.world.conflicts.wars.length,0);
 const a=loadCampaign(serializeCampaign(migrated));
 for(let i=0;i<20;i++){campaignYear(migrated);campaignYear(a);}
 assert.equal(serializeCampaign(migrated),serializeCampaign(a));
 assertWorld(a.world);
});
test('20 autonomous sixty-year worlds preserve conflict, title, dynasty and conservation invariants',()=>{
 for(let seed=0;seed<20;seed++){
  const g=startCampaign({seed,countyId:['co-01','co-02','co-03'][seed%3]});
  for(let i=0;i<60&&!g.finished&&!g.chapterComplete;i++){
    if(i%7===0){
      const choices=campaignChoices(g);
      const choice=choices.find(a=>['contract','war','blackmail','peace','assassinate'].includes(a.kind));
      if(choice)campaignAction(g,choice);
    }
    campaignYear(g);
    if(i%10===0){assertWorld(g.world);assertConflicts(g.world);}
  }
  assertWorld(g.world);
 }
});
test('invalid conflict action never writes events or changes resource accounts',()=>{
 const g=startCampaign({seed:413,countyId:'co-01'}),w=g.world;
 const before=serializeWorld(w);
 assert.throws(()=>performConflictAction(w,{actorId:g.playerId,kind:'war',
   targetId:'pe-404',titleId:'du-99'}),/not available/);
 assert.equal(serializeWorld(w),before);
});
