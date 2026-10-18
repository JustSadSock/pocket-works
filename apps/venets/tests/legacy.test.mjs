import test from 'node:test';
import assert from 'node:assert/strict';
import {startCampaign,campaignYear,campaignAction,campaignChoices,campaignScore,
  serializeCampaign,loadCampaign,extendCampaign,assertCampaign} from '../sim/campaign.js';
import {campaignLegacy,campaignChronicleText} from '../sim/legacy.js';
import {changeTitleHolder} from '../sim/transactions.js';

const yearToEnd=g=>{while(!g.chapterComplete&&!g.finished&&g.world.year<=1156)campaignYear(g);return g};

test('an ending is a factual family archive, not randomly assigned narrative points',()=>{
 const g=yearToEnd(startCampaign({seed:413,countyId:'co-01'}));
 assert.ok(g.chapterComplete||g.finished);
 const legacy=campaignLegacy(g),score=campaignScore(g);
 assert.equal(legacy.year,g.world.year);
 assert.equal(legacy.stats.holdings,score.titles);
 assert.equal(legacy.stats.generations,score.generations);
 assert.equal(legacy.stats.decisions,g.actions);
 assert.equal(legacy.timeline[0].kind,'founding');
 assert.equal(legacy.timeline[0].year,1066);
 assert.equal(legacy.timeline.at(-1).kind,'ending');
 assert.ok(legacy.timeline.length>=2&&legacy.timeline.length<=7);
 assert.ok(legacy.timeline.every((e,i,a)=>i===0||a[i-1].year<=e.year));
 assert.ok(legacy.timeline.every(e=>e.heading&&e.detail));
 const text=campaignChronicleText(g);
 assert.ok(text.includes('1066–1156'));
 assert.ok(text.includes(legacy.title)&&text.includes(legacy.house));
 assert.ok(!text.includes('undefined')&&!text.includes('[object Object]'));
 assertCampaign(g);
});

test('political crown appears only if our family really holds the crown title',()=>{
 const g=startCampaign({seed:413,countyId:'co-02'}),w=g.world;
 assert.notEqual(campaignLegacy(g).id,'crown');
 const crown=w.titles.find(t=>t.rank==='kingdom');
 changeTitleHolder(w,{titleId:crown.id,newHolderId:g.playerId,cause:'controlled-test-coronation'});
 assert.equal(crown.holderId,g.playerId);
 const ending=campaignLegacy(g);
 assert.equal(ending.id,'crown');
 assert.equal(ending.stats.holdings,campaignScore(g).titles);
 assert.ok(ending.timeline.some(e=>e.kind==='title-transfer'&&e.titleId===crown.id));
 assertCampaign(g);
});

test('loss of the final title yields real exile while living family can still continue',()=>{
 const g=startCampaign({seed:413,countyId:'co-03'}),w=g.world;
 const own=w.titles.filter(t=>w.people.find(p=>p.id===t.holderId)?.dynastyId===g.dynastyId);
 const outsider=w.people.find(p=>p.alive&&p.dynastyId!==g.dynastyId);
 assert.ok(outsider);
 for(const t of own)changeTitleHolder(w,{titleId:t.id,newHolderId:outsider.id,cause:'controlled-test-exile'});
 assert.equal(campaignScore(g).titles,0);
 assert.ok(campaignScore(g).family>0);
 assert.equal(campaignLegacy(g).id,'exiles');
 assertCampaign(g);
});

test('archive counts only our own decisions, wars and legal transfers, not the whole realm',()=>{
 const g=startCampaign({seed:31,countyId:'co-01'});
 const a=campaignChoices(g).find(a=>a.kind==='faction');
 assert.ok(a);
 campaignAction(g,a);
 const legacy=campaignLegacy(g);
 assert.equal(legacy.stats.decisions,1);
 assert.deepEqual(legacy.paths,[{kind:'faction',label:'Создана фракция',count:1}]);
 assert.equal(legacy.stats.transfers,0);
 assert.ok(!legacy.timeline.some(e=>e.kind==='war-peace'));
});

test('all founders, both atlas sizes and resumable endings survive multi-generation replay',()=>{
 for(const size of [12,48])for(const [i,countyId] of ['co-01','co-02','co-03'].entries()){
  const g=startCampaign({seed:413+7*i,countyId,size});
  for(let j=0;j<45;j++)campaignYear(g);
  const saved=serializeCampaign(g),twin=loadCampaign(saved);
  for(let j=0;j<45;j++){campaignYear(g);campaignYear(twin);}
  assert.equal(serializeCampaign(g),serializeCampaign(twin));
  assert.equal(campaignChronicleText(g),campaignChronicleText(twin));
  const legacy=campaignLegacy(g);
  assert.ok(['crown','princes','duchy','landholders','survivors','exiles','end'].includes(legacy.id));
  assert.ok(g.chapterComplete||g.finished);
  const oldYear=g.world.year;
  if(g.chapterComplete&&!g.finished){
   extendCampaign(g);
   assert.equal(g.world.year,oldYear);
   campaignYear(g);
   assert.equal(g.world.year,oldYear+1);
  }
  assertCampaign(g);
 }
});

test('v0.9 save remains valid; archive is derived without migrating or editing the save',()=>{
 const g=startCampaign({seed:9001,countyId:'co-01'});
 for(let i=0;i<15;i++)campaignYear(g);
 const raw=serializeCampaign(g);
 const copy=loadCampaign(raw);
 const result=campaignLegacy(copy),scroll=campaignChronicleText(copy);
 assert.equal(serializeCampaign(copy),raw);
 assert.equal(result.year,1081);
 assert.ok(scroll.includes('1081'));
 assert.equal(serializeCampaign(g),serializeCampaign(copy));
});
