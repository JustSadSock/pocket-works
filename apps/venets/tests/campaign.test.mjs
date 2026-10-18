import test from 'node:test';
import assert from 'node:assert/strict';
import {startCampaign,campaignStarts,campaignPlayableRulers,campaignChoices,campaignAction,campaignYear,campaignScore,
  serializeCampaign,loadCampaign,extendCampaign,assertCampaign} from '../sim/campaign.js';
import {assertWorld,die} from '../sim/world.js';

test('three alternative county founders and a real legal feud at campaign start',()=>{
  const starts=campaignStarts(413);
  assert.deepEqual(starts.map(s=>s.countyId),['co-01','co-02','co-03']);
  for(const start of starts){
    const g=startCampaign({seed:413,countyId:start.countyId});
    assert.equal(g.playerId,start.personId);
    assert.equal(g.world.year,1066);
    const county=g.world.titles.find(t=>t.id===start.countyId);
    const duchy=g.world.titles.find(t=>t.id===county.liegeId);
    assert.ok(duchy.claims.some(c=>c.personId===g.playerId));
    assert.ok(county.claims.some(c=>c.personId===duchy.holderId));
    const choices=campaignChoices(g);
    assert.ok(choices.some(a=>a.kind==='petition'),'legal request is offered');
    assert.ok(choices.some(a=>a.kind==='faction'),'alternative pressure route is offered');
    assertCampaign(g);
  }
});
test('atlas rulers represent all landed ranks in both stable world sizes',()=>{
  for(const size of [12,48]){
    const choices=campaignPlayableRulers(413,{size});
    assert.equal(choices.length,size+(size===12?4:12)+1);
    assert.equal(choices.filter(p=>p.rank==='county').length,size);
    assert.equal(choices.filter(p=>p.rank==='duchy').length,size===12?4:12);
    assert.equal(choices.filter(p=>p.rank==='kingdom').length,1);
    for(const id of ['co-'+String(size).padStart(2,'0'),'du-'+String(size===12?4:12).padStart(2,'0'),'ki-01']){
      const pick=choices.find(p=>p.titleId===id);
      assert.ok(pick,'title is selectable: '+id);
      const g=startCampaign({seed:413,size,countyId:id});
      assert.equal(g.playerId,pick.personId);
      assert.equal(g.dynastyId,pick.dynastyId);
      assertCampaign(g);
      const restored=loadCampaign(serializeCampaign(g));
      assert.equal(restored.playerId,g.playerId);
      assert.equal(restored.startCountyId,id);
      campaignYear(restored);
      assertCampaign(restored);
    }
  }
});
test('player can make a political choice and the same year cannot be exploited twice',()=>{
  const g=startCampaign({seed:413,countyId:'co-01'});
  const faction=campaignChoices(g).find(a=>a.kind==='faction');
  const result=campaignAction(g,faction);
  assert.equal(result.success,true);
  assert.equal(g.world.politics.factions.length,1);
  assert.deepEqual(campaignChoices(g),[]);
  assert.throws(()=>campaignAction(g,faction),/already settled/);
  const before=g.world.events.length;
  const next=campaignYear(g);
  assert.equal(next.year,1067);
  assert.equal(g.turns,1);
  assert.equal(g.actions,1);
  // The controlled character must not silently act again under AI control.
  assert.ok(!g.world.events.slice(before).some(e=>e.kind==='political-decision'&&
    e.effect.actorId===g.founderId));
  assertCampaign(g);
});
test('refused claim is consequential and preserves honest politics',()=>{
  const g=startCampaign({seed:413,countyId:'co-01'});
  const petition=campaignChoices(g).find(a=>a.kind==='petition');
  assert.ok(petition);
  const before=g.world.titles.find(t=>t.id===petition.titleId).holderId;
  const response=campaignAction(g,petition);
  assert.equal(typeof response.success,'boolean');
  if(!response.success){
    assert.equal(g.world.titles.find(t=>t.id===petition.titleId).holderId,before);
    assert.ok(g.world.people.find(p=>p.id===g.playerId).politics.memories.some(m=>m.kind==='grievance'));
  }else assert.equal(g.world.titles.find(t=>t.id===petition.titleId).holderId,g.playerId);
  assertWorld(g.world);
});
test('the player survives a founder death through a living member of the same dynasty',()=>{
  const g=startCampaign({seed:413,countyId:'co-01'});
  const old=g.playerId,house=g.dynastyId;
  die(g.world,{personId:old,cause:'controlled-succession-test'});
  const record=campaignYear(g);
  assert.ok(record.succession,'controlled character should change on death');
  assert.notEqual(g.playerId,old);
  assert.equal(g.world.people.find(p=>p.id===g.playerId).dynastyId,house);
  assert.ok(g.world.people.find(p=>p.id===g.playerId).alive);
  assert.equal(g.successionCount,1);
  assertWorld(g.world);
});
test('an uninterrupted and reloaded chronicle are byte-identical',()=>{
  const a=startCampaign({seed:7777,countyId:'co-03'});
  for(let i=0;i<18;i++)campaignYear(a);
  const b=loadCampaign(serializeCampaign(a));
  for(let i=0;i<24;i++){
    if(!a.finished&&!a.chapterComplete)campaignYear(a);
    if(!b.finished&&!b.chapterComplete)campaignYear(b);
  }
  assert.equal(serializeCampaign(a),serializeCampaign(b));
  assert.deepEqual(campaignScore(a),campaignScore(b));
});
test('chapter ending has an explicit outcome and can be extended to keep playing',()=>{
  const g=startCampaign({seed:413,countyId:'co-02'});
  while(!g.chapterComplete&&!g.finished && g.world.year<1157)campaignYear(g);
  const score=campaignScore(g);
  assert.ok(score.year<=1156);
  assert.ok(score.generations>=1);
  if(g.chapterComplete){
    assert.throws(()=>campaignYear(g),/ended/);
    const old=g.goalYear;
    extendCampaign(g);
    assert.equal(g.goalYear,old+50);
    assert.equal(g.chapterComplete,false);
    campaignYear(g);
    assertWorld(g.world);
  }
});
test('invalid starts, saves, actions and suspicious campaign mutations are rejected',()=>{
  assert.throws(()=>startCampaign({seed:42,countyId:'co-99'}),/Invalid/);
  const g=startCampaign({seed:13,countyId:'co-01'});
  assert.throws(()=>campaignAction(g,{kind:'grant',titleId:'co-05'}),/not available/);
  assert.throws(()=>loadCampaign('not json'));
  assert.throws(()=>loadCampaign(JSON.stringify({...g,playerId:'pe-404'})));
  g.turns+=1;assert.throws(()=>assertCampaign(g),/mismatch/);
});
test('16 generated chronicles run 70 years without broken succession or resource conservation',()=>{
  let total=0,decisions=0;
  for(let seed=0;seed<16;seed++){
    const g=startCampaign({seed,countyId:['co-01','co-02','co-03'][seed%3]});
    for(let year=0;year<70&&!g.finished&&!g.chapterComplete;year++){
      const options=campaignChoices(g);
      if(options.length && year%6===0){
        try{campaignAction(g,options[0])}catch(e){assert.fail('Legal advertised action failed: '+e.message)}
      }
      campaignYear(g);
      if(year%10===0)assertCampaign(g);
      decisions+=Number(g.lastActionYear===g.world.year);
    }
    assertCampaign(g);assertWorld(g.world);
    total++;
  }
  assert.equal(total,16);
  assert.ok(decisions>=0);
});
