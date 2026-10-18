import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,population} from './model.js';
import {beginLandDispute,advanceLocalConflicts,fieldGrievances,conflictAudit} from './conflicts.js';
import {walkPath} from './navigation.js';
const settlementPair=s=>{
 for(const community of s.communities){
  const houses=s.households.filter(h=>h.communityId===community.id);
  const rich=[...houses].sort((a,b)=>b.fields.length-a.fields.length)[0];
  const poor=[...houses].sort((a,b)=>a.fields.length-b.fields.length).find(h=>h.id!==rich.id&&h.fields.length<rich.fields.length&&h.members.some(id=>s.people.find(p=>p.id===id)?.sex==='m'));
  if(!poor||!rich.fields.length)continue;
  const pos=i=>({x:i%160,y:Math.floor(i/160)});
  const plot=[...rich.fields].sort((a,b)=>Math.abs(pos(a).x-poor.x)+Math.abs(pos(a).y-poor.y)-Math.abs(pos(b).x-poor.x)-Math.abs(pos(b).y-poor.y))[0];
  if(walkPath(s,poor,pos(plot)).length>1&&walkPath(s,rich,pos(plot)).length>1)return {poor,rich,plot};
 }
 return null;
};
test('militia uses existing land, title and actual identifiable adults, never spawned troops',()=>{
 const s=createWorld(413),pair=settlementPair(s);
 assert.ok(pair);
 const beforePopulation=population(s),before=s.households.reduce((v,h)=>v+h.wood+(h.staveWood||0),0);
 const {poor,rich,plot}=pair;
 const oldOwners=new Map(s.households.map(h=>[h.id,h.fields.slice()]));
 const notices=[];
 const fight=beginLandDispute(s,poor.id,rich.id,plot,(...args)=>notices.push(args));
 assert.ok(fight);
 assert.equal(fight.stage,'mobilizing');
 assert.equal(fight.cell,plot);
 assert.equal(fight.ownerId,rich.id);
 assert.ok(fight.claimants.length>=1&&fight.claimants.length<=2);
 assert.ok(fight.owners.length>=1&&fight.owners.length<=2);
 assert.ok([...fight.claimants,...fight.owners].every(id=>s.people.some(p=>p.id===id&&p.alive)));
 assert.equal(population(s),beforePopulation);
 assert.equal(s.households.reduce((v,h)=>v+h.wood+(h.staveWood||0),0),before,'timber moved to reusable staves');
 assert.equal(s.stats.staveWoodMade,(fight.claimants.length+fight.owners.length)*2);
 assert.equal(notices[0][0],'armed-dispute');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 for(const [id,fields] of oldOwners)assert.deepEqual(s.households.find(h=>h.id===id).fields,fields);
});

test('a real skirmish progresses from mobilization through paid journeys to a conserved settlement',()=>{
 const s=createWorld(43821),pair=settlementPair(s);assert.ok(pair);
 const fight=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);
 assert.ok(fight);
 const coin=s.households.reduce((v,h)=>v+h.coin,0);
 const people=s.people.length;
 advanceDays(s,1);
 const c=s.conflicts.find(c=>c.id===fight.id);
 assert.equal(c.stage,'resolved');
 assert.equal(c.endDay,s.day);
 assert.ok(['claimant','owner','dispersed'].includes(c.outcome));
 assert.equal(s.stats.armedDisputesResolved,1);
 assert.equal(s.households.reduce((v,h)=>v+h.coin,0),coin,'compensation is transferred, not minted');
 assert.equal(s.people.length,people,'combat does not create people');
 assert.ok(c.wounded.every(id=>[...c.claimants,...c.owners].includes(id)));
 assert.ok([...c.claimants,...c.owners].some(id=>s.people.find(p=>p.id===id)?.workDays?.guard>0),'actual participants lose paid hours');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('armed fighting never converts combat wounds into fabricated famine records',()=>{
 const s=createWorld(7777),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);assert.ok(c);
 const wounded=s.people.find(p=>p.id===c.claimants[0]);
 wounded.combatFatalDay=1;wounded.health=0;
 const foodDeaths=s.stats.starvationDeaths||0;
 advanceDays(s,1);
 assert.equal(wounded.alive,false);
 assert.equal(s.stats.battleDeaths,1);
 assert.equal(s.stats.starvationDeaths||0,foodDeaths);
 assert.ok(wounded.lifeLog.some(row=>row.type==='death'&&row.text.includes('рана')));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('the same dispute history survives saves, old-format migration, and frame-rate changes',()=>{
 const s=createWorld(9001),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);assert.ok(c);
 const start=serialize(s),a=deserialize(start),b=deserialize(start);
 advanceDays(a,190);for(let day=0;day<190;day++)advanceDays(b,1);
 assert.equal(serialize(a),serialize(b));
 assert.equal(a.conflicts.find(v=>v.id===c.id).stage,'resolved');
 const legacy=JSON.parse(serialize(createWorld(413)));
 delete legacy.conflicts;delete legacy.stats.staveWoodMade;
 const restored=deserialize(JSON.stringify(legacy));
 assert.deepEqual(restored.conflicts,[]);
 assert.deepEqual(conflictAudit(restored),[]);
 assert.ok(audit(restored).ok);
});

test('organic land disputes are scored by actual neighbouring land titles and do not mutate observation',()=>{
 const s=createWorld(413),before=serialize(s);
 const candidates=fieldGrievances(s);
 for(const c of candidates){
  assert.ok(c.claimant.fields.length<c.owner.fields.length);
  assert.ok(c.owner.fields.includes(c.cell));
  assert.equal(c.claimant.communityId,c.owner.communityId);
  assert.ok(c.road>=0&&c.road<=42);
  assert.ok(c.claim>=0&&c.claim<=1&&c.chance>0);
 }
 assert.equal(serialize(s),before);
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(app,/sim\.conflicts/);
 assert.match(app,/stage==='mobilizing'/);
});
