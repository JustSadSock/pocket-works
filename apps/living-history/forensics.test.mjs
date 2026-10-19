import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,householdFamineTrace} from './model.js';
import {disputeReviewDay,disputeRiskPerReview,injuryImpact} from './conflicts.js';

test('four quarterly dispute reviews per community are deterministic, distributed and annual-risk preserving',()=>{
 const s=createWorld(413),year=4,days=[];
 for(const c of s.communities){
  const reviews=[0,1,2,3].map(q=>disputeReviewDay(s.seed,year,c.id,q));
  for(let q=0;q<4;q++){
   assert.ok(reviews[q]>=q*91&&reviews[q]<(q===3?365:(q+1)*91));
   assert.equal(reviews[q],disputeReviewDay(s.seed,year,c.id,q));
  }
  days.push(...reviews);
 }
 assert.ok(new Set(days).size>4,'communities must not all fight on the same day');
 for(const chance of [0,.08,.25,.43,1]){
  const quarterly=disputeRiskPerReview(chance);
  assert.ok(Math.abs((1-Math.pow(1-quarterly,4))-chance)<1e-10);
 }
 assert.notDeepEqual(
  [0,1,2,3].map(q=>disputeReviewDay(413,4,s.communities[0].id,q)),
  [0,1,2,3].map(q=>disputeReviewDay(7777,4,s.communities[0].id,q)));
 assert.ok(audit(s).ok);
});

test('injury severity has a rare physical lethal possibility and is reproducible',()=>{
 const injuries=Array.from({length:1000},(_,id)=>injuryImpact(413,401,id));
 const serious=injuries.filter(v=>v.serious);
 assert.ok(serious.length>0&&serious.length<140);
 assert.ok(serious.some(v=>v.damage>=50),'serious strike can truly be lethal to an already weakened participant');
 assert.ok(injuries.some(v=>!v.serious&&v.damage<32));
 assert.deepEqual(injuryImpact(413,401,7),injuryImpact(413,401,7));
 assert.notDeepEqual(injuryImpact(413,401,7),injuryImpact(413,402,7));
});

test('meal evidence belongs to the actual underfed family, retains phases and conserves stock',()=>{
 const s=createWorld(7777),poor=s.households.find(h=>h.members.some(id=>s.people.find(p=>p.id===id)?.alive));
 const wealthy=s.households.find(h=>h.id!==poor.id);
 assert.ok(poor&&wealthy);
 for(const good of ['grain','oats','pulses','garden','dairy']){
  wealthy[good]=Math.round(((wealthy[good]||0)+(poor[good]||0))*100)/100;
  poor[good]=0;
 }
 const original=serialize(s);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,2);
 const history=householdFamineTrace(s,poor.id);
 assert.ok(history.meals.length>=1);
 assert.ok(history.meals.every(x=>x.phase==='after-ration-before-market'&&x.needKg>0));
 assert.ok(history.meals.some(x=>x.deficitKg>0));
 assert.ok(history.meals.every(x=>x.day<=s.day&&x.eatenKg<=x.needKg+.02));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 const loaded=deserialize(serialize(s));
 assert.deepEqual(householdFamineTrace(loaded,poor.id),history);
 assert.ok(original.length>0);
});

test('famine deaths retain day-specific ration and transfer evidence without free rescue',()=>{
 const s=createWorld(43821),h=s.households[0],other=s.households[1];
 for(const good of ['grain','oats','pulses','garden','dairy']){
  other[good]=Math.round(((other[good]||0)+(h[good]||0))*100)/100;h[good]=0;
 }
 const victim=s.people.find(p=>h.members.includes(p.id)&&p.alive);
 assert.ok(victim);
 victim.health=0;
 const before=s.stats.starvationDeaths||0;
 advanceDays(s,1);
 const caseFile=(s.foodCases||[]).find(c=>c.personId===victim.id);
 assert.ok(caseFile,'death investigation must be saved');
 assert.equal(s.stats.starvationDeaths,before+1);
 assert.equal(caseFile.day,s.day);
 assert.equal(caseFile.mealPhase,'after-ration-before-next-market');
 assert.ok(caseFile.rationHistory.some(row=>row.day===s.day&&row.deficitKg>0));
 assert.ok(Array.isArray(caseFile.recentTransfers));
 assert.ok(Number.isFinite(caseFile.reachableGrainKg));
 assert.ok(caseFile.reachableGrainKg>=0);
 assert.deepEqual(householdFamineTrace(s,h.id).cases.at(-1),caseFile);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 assert.deepEqual(deserialize(serialize(s)).foodCases,s.foodCases);
});

test('forensic evidence is inspectable through the real household economy screen',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(app,/foodStressHistory/);
 assert.match(app,/famineDeaths/);
 assert.match(app,/distress/);
 assert.match(app,/after-ration-before-market/);
});
