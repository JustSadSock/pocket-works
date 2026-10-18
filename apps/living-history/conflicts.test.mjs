import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,population} from './model.js';
import {beginLandDispute,advanceLocalConflicts,fieldGrievances,conflictAudit} from './conflicts.js';
import {walkPath} from './navigation.js';
import {assessFieldTactics,tacticalBreak,pursuitChance} from './battle-tactics.js';
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

test('organised militia musters at real households before marching and cannot create supplies',()=>{
 const s=createWorld(413),pair=settlementPair(s);assert.ok(pair);
 const pop=population(s),cash=s.households.reduce((n,h)=>n+h.coin,0);
 const timber=s.households.reduce((n,h)=>n+(h.wood||0)+(h.staveWood||0),0);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true});
 assert.ok(c,'physical roster and wood stock must permit mobilisation');
 assert.equal(c.stage,'mustering');
 assert.equal(c.rallyDay,s.day+1);assert.equal(c.meetDay,s.day+2);
 assert.ok(c.claimants.length<=4&&c.owners.length<=4);
 assert.equal(population(s),pop);
 assert.equal(s.households.reduce((n,h)=>n+(h.wood||0)+(h.staveWood||0),0),timber);
 advanceDays(s,1);
 assert.equal(c.stage,'mobilizing');
 for(const id of [...c.claimants,...c.owners]){
  const p=s.people.find(p=>p.id===id);
  if(p?.alive&&p.combatDutyDay===s.day){
   const h=s.households.find(h=>h.id===p.houseId);
   assert.deepEqual(p.dailyShift.to,{x:h.x,y:h.y},'muster is held at home');
  }
 }
 advanceDays(s,1);
 assert.equal(c.stage,'resolved');
 assert.deepEqual(Object.keys(c.arrived).sort(),['claimants','owners']);
 assert.ok(c.arrived.claimants<=c.claimants.length&&c.arrived.owners<=c.owners.length);
 assert.ok(Object.values(c.morale).every(x=>x>=0&&x<=1));
 assert.equal(s.households.reduce((n,h)=>n+h.coin,0),cash);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('morale enables a peaceful withdrawal from a vastly weaker and hungry side',()=>{
 const s=createWorld(413),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);
 assert.ok(c);
 for(const id of c.claimants)s.people.find(p=>p.id===id).health=38;
 for(const id of c.owners)s.people.find(p=>p.id===id).health=100;
 pair.poor.shortage=35;
 advanceDays(s,1);
 assert.equal(c.stage,'resolved');
 assert.equal(c.retreated,'claimants');
 assert.equal(c.outcome,'owner');
 assert.deepEqual(c.wounded,[],'retreat avoids a forced fight');
 assert.ok(c.morale.claimants<c.morale.owners);
 assert.equal(s.stats.disputeRetreats,1);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('muster preserves deterministic outcomes through two independent save/reload paths',()=>{
 const s=createWorld(43821),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true});
 assert.ok(c);
 const save=serialize(s),once=deserialize(save),stepwise=deserialize(save);
 advanceDays(once,18);for(let day=0;day<18;day++)advanceDays(stepwise,1);
 assert.equal(serialize(once),serialize(stepwise));
 const result=once.conflicts.find(x=>x.id===c.id);
 assert.equal(result.stage,'resolved');
 assert.ok(result.morale&&result.arrived);
 assert.ok(audit(once).ok,audit(once).issues.join('; '));
});

test('carried field rations conserve actual grain and prevent double meals at home',()=>{
 const s=createWorld(413),pair=settlementPair(s);assert.ok(pair);
 const allGrain=()=>s.households.reduce((sum,h)=>sum+h.grain,0)+
  (s.conflicts||[]).reduce((sum,c)=>sum+(c.supply?.claimants?.grain||0)+(c.supply?.owners?.grain||0),0);
 const initial=allGrain();
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true,expedition:true});
 assert.ok(c,'actual reserve grain must enable expedition');
 assert.equal(c.stage,'mustering');
 assert.ok(c.supply.claimants.loaded>0&&c.supply.owners.loaded>0);
 assert.ok(Math.abs(allGrain()-initial)<.03,'loading grain does not create or consume it');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,1);assert.equal(c.stage,'marching');
 advanceDays(s,1);
 assert.ok(c.travelDays>=1);
 assert.ok(c.supply.claimants.eaten>0&&c.supply.owners.eaten>0,'carried food eaten while marching');
 assert.ok([...c.claimants,...c.owners].some(id=>s.people.find(p=>p.id===id)?.combatAwayDay===s.day));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 for(let i=0;i<12&&c.stage!=='resolved';i++){advanceDays(s,1);assert.ok(audit(s).ok,audit(s).issues.join('; '));}
 assert.equal(c.stage,'resolved','survivors physically return home');
 assert.ok(c.returnDays>=1);
 for(const side of ['claimants','owners']){
  const bag=c.supply[side];
  assert.equal(bag.grain,0);
  assert.ok(Math.abs(bag.loaded-bag.eaten-bag.returned)<.04,'no free or lost field grain');
 }
 assert.equal(s.stats.expeditionGrainEaten,
  Math.round((c.supply.claimants.eaten+c.supply.owners.eaten)*100)/100);
});

test('insufficient initial rations reject an expedition without any inventory mutation',()=>{
 const s=createWorld(43821),pair=settlementPair(s);assert.ok(pair);
 const original=pair.poor.grain;
 pair.poor.grain=0;
 s.economy.grainInitial-=original;
 const before=serialize(s);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true,expedition:true});
 assert.equal(c,null);
 assert.equal(serialize(s),before);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('field ration exhaustion cancels a march, sends survivors back and balances returned grain',()=>{
 const s=createWorld(9001),pair=settlementPair(s);assert.ok(pair);
 // Leave precisely one day of provisions after protecting the household reserve.
 const people=pair.poor.members.filter(id=>s.people.some(p=>p.id===id&&p.alive)).length;
 const fighters=pair.poor.members.map(id=>s.people.find(p=>p.id===id))
  .filter(p=>p?.alive&&p.sex==='m'&&p.age>=16&&p.age<=62&&p.health>=38).length;
 const desired=people*.68*3+Math.min(4,fighters)*.68;
 const original=pair.poor.grain;
 pair.poor.grain=Math.round(desired*100)/100;
 s.economy.grainInitial=Math.round((s.economy.grainInitial+pair.poor.grain-original)*100)/100;
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true,expedition:true});
 assert.ok(c);
 advanceDays(s,1);
 for(let i=0;i<14&&c.stage!=='resolved';i++)advanceDays(s,1);
 assert.equal(c.stage,'resolved');
 assert.equal(c.aborted,'food');
 assert.equal(c.outcome,'dispersed');
 assert.ok(s.stats.expeditionsAborted>=1);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('expedition across saves has identical grain, participants and chronological positions',()=>{
 const s=createWorld(7777),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true,expedition:true});assert.ok(c);
 advanceDays(s,2);
 const snap=serialize(s),a=deserialize(snap),b=deserialize(snap);
 advanceDays(a,25);for(let i=0;i<25;i++)advanceDays(b,1);
 assert.equal(serialize(a),serialize(b));
 const after=a.conflicts.find(x=>x.id===c.id);
 assert.equal(after.stage,'resolved');
 assert.ok(audit(a).ok,audit(a).issues.join('; '));
});

test('field tactics use only actual arrivals and navigable flanking positions',()=>{
 const s=createWorld(413),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);assert.ok(c);
 advanceDays(s,1);
 assert.equal(c.stage,'resolved');
 assert.ok(c.tactics&&c.tactics.terrain&&c.tactics.claimants);
 assert.equal(c.tactics.claimants.count,c.arrived.claimants);
 assert.equal(c.tactics.owners.count,c.arrived.owners);
 assert.ok(c.tactics.advantage>=0&&c.tactics.advantage<=1);
 assert.ok(['одиночка','пара','плотный ряд','рассеянная группа'].includes(c.tactics.claimants.formation));
 if(c.tactics.flank){
  const {personId,fromCell,toCell,routeCells}=c.tactics.flank;
  assert.ok(c.claimants.includes(personId));
  assert.equal(fromCell,pair.plot);
  assert.equal(routeCells[0],fromCell);
  assert.equal(routeCells[routeCells.length-1],toCell);
  assert.equal(routeCells.length,2);
 }
 assert.ok(c.pursued.every(id=>c.wounded.includes(id)));
 assert.ok(c.wounded.every(id=>[...c.claimants,...c.owners].includes(id)));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('an adjacent wooded or rocky edge gives a measurable local defensive advantage',()=>{
 const s=createWorld(43821),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot);assert.ok(c);
 for(const id of [...c.claimants,...c.owners]){
  const p=s.people.find(x=>x.id===id);
  p.combatDutyDay=s.day;p.dailyShift={day:s.day,workHours:3};
 }
 const x=pair.plot%160,y=Math.floor(pair.plot/160);
 const adjacent=[x>0?pair.plot-1:-1,x<159?pair.plot+1:-1,y>0?pair.plot-160:-1,y<159?pair.plot+160:-1]
  .find(index=>index>=0&&s.terrain[index]===0);
 assert.ok(adjacent!==undefined);
 const previous=s.forest[adjacent];
 const left={power:2,morale:.7},right={power:2,morale:.7};
 s.forest[adjacent]=0;
 const flat=assessFieldTactics(s,c,left,right);
 s.forest[adjacent]=300;
 const protectedSite=assessFieldTactics(s,c,left,right);
 assert.ok(protectedSite.terrain.cover>=flat.terrain.cover);
 assert.ok(protectedSite.owners.power>=flat.owners.power);
 assert.ok(protectedSite.advantage<=flat.advantage);
 s.forest[adjacent]=previous;
 const before=serialize(s);assessFieldTactics(s,c,left,right);
 assert.equal(serialize(s),before,'tactical observation cannot mutate the world');
});

test('group cohesion controls formation break and pursuit without phantom attackers',()=>{
 const stronger={claimants:{count:3,cohesion:.94,power:3.2},
  owners:{count:2,cohesion:.31,power:.7}};
 assert.equal(tacticalBreak(stronger,'owners'),true);
 assert.equal(tacticalBreak(stronger,'claimants'),false);
 assert.ok(pursuitChance(stronger,'claimants','owners')>0);
 assert.equal(pursuitChance(stronger,'owners','claimants'),0);
 assert.equal(pursuitChance(stronger,'claimants','claimants'),0);
 const other={claimants:{count:0,cohesion:.9,power:3.2},
  owners:{count:2,cohesion:.2,power:.1}};
 assert.equal(tacticalBreak(other,'owners'),false,'absent pursuers cannot break anyone');
 assert.equal(pursuitChance(other,'claimants','owners'),0);
});

test('tactics are deterministic across a save taken before an expedition battle',()=>{
 const s=createWorld(9001),pair=settlementPair(s);assert.ok(pair);
 const c=beginLandDispute(s,pair.poor.id,pair.rich.id,pair.plot,null,{muster:true,expedition:true});
 assert.ok(c);
 advanceDays(s,2);
 const raw=serialize(s),a=deserialize(raw),b=deserialize(raw);
 advanceDays(a,16);for(let i=0;i<16;i++)advanceDays(b,1);
 assert.equal(serialize(a),serialize(b));
 const fight=a.conflicts.find(x=>x.id===c.id);
 assert.equal(fight.stage,'resolved');
 if(!fight.aborted)assert.ok(fight.tactics?.terrain?.label);
 assert.ok(audit(a).ok,audit(a).issues.join('; '));
});
