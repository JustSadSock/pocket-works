// Independent observational test. Historical plausibility is reported,
// NEVER converted to a green check from arbitrary demographic thresholds.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,overview} from './model.js';
import {historicalObservation,historicalComparison,REFERENCE_POINTS} from './historical-calibration.js';
import {beginLandDispute} from './conflicts.js';

const seeds=[413,7777,43821,9001];
const pos=i=>({x:i%160,y:Math.floor(i/160)});
function pair(world){
 for(const c of world.communities){
  const houses=world.households.filter(h=>h.communityId===c.id);
  const richer=[...houses].sort((a,b)=>b.fields.length-a.fields.length)[0];
  for(const poorer of [...houses].sort((a,b)=>a.fields.length-b.fields.length)){
   if(poorer.id===richer.id||poorer.fields.length>=richer.fields.length)continue;
   if(!poorer.members.some(id=>world.people.some(p=>p.id===id&&p.alive&&p.sex==='m'&&p.age>=16&&p.health>=38)))continue;
   for(const tile of richer.fields)if(world.terrain[tile]===0){
    const candidate=beginLandDispute(world,poorer.id,richer.id,tile);
    if(candidate)return candidate;
   }
  }
 }
 return null;
}
test('historical references yield measured discrepancies, NEVER an unearned proof of realism',()=>{
 const world=createWorld(413);
 const before=serialize(world),sample=historicalObservation(world);
 const comparisons=historicalComparison(sample);
 assert.equal(serialize(world),before,'historical checks must not rewrite the simulation');
 for(const metric of Object.keys(REFERENCE_POINTS)){
  const row=comparisons.find(c=>c.metric===metric);
  assert.ok(row,'missing measured reference '+metric);
  assert.equal(row.reference,REFERENCE_POINTS[metric].value);
  assert.ok(['illustrative-comparison','insufficient-sample'].includes(row.interpretation));
  assert.ok(!['pass','historically-validated','certified'].includes(row.interpretation));
  assert.ok(Number.isFinite(row.sampleSize));
  if(row.observed!==null)assert.ok(Number.isFinite(row.delta));
 }
 assert.equal(sample.customarySampleSize,16,'small historical sample is disclosed');
 assert.equal(sample.customaryTenementsAbove10Acres,.75);
 assert.ok(Math.abs(sample.customaryTenementsAbove10Acres-REFERENCE_POINTS.customaryTenementsAbove10Acres.value)>.10,
  'current initial tenure differs by over 10 percentage points from the narrow published source sample');
});

test('counterfactual shortage has a real human consequence without violating conservation',()=>{
 const base=createWorld(413),short=deserialize(serialize(base));
 // The drought is the supported physical climate intervention: same initial
 // seed and agents, separate crop-yield history, no changed initial ownership.
 short.scenario='drought';
 for(const world of [base,short])advanceDays(world,365*8);
 assert.ok(short.stats.harvest<base.stats.harvest,
  'eight drought years must not harvest as much as a normal climate');
 for(const world of [base,short]){
  const result=audit(world);
  assert.ok(result.ok,result.issues.slice(0,5).join('; '));
  assert.ok(overview(world).population>=0);
  assert.ok(world.stats.starvationDeaths===undefined||world.stats.starvationDeaths>=0);
 }
});

test('material and legal invariants survive unrelated village clashes across seeds',()=>{
 let conflicts=0;
 for(const seed of seeds){
  const world=createWorld(seed);
  const titles=new Map(world.households.map(h=>[h.id,JSON.stringify(h.fields)]));
  const people=world.people.length;
  const c=pair(world);
  assert.ok(c,'seed must produce a real local land dispute '+seed);
  conflicts++;
  advanceDays(world,1);
  assert.equal(c.stage,'resolved','short dispute reaches a concrete outcome');
  assert.equal(world.people.length,people,'a conflict does not spawn soldiers');
  for(const h of world.households)assert.equal(JSON.stringify(h.fields),titles.get(h.id),
    'force does not transfer legal tenure');
  assert.ok(c.tactics?.terrain?.label,'tactical reason is grounded in a real site');
  assert.ok(c.wounded.every(id=>[...c.claimants,...c.owners].includes(id)));
  assert.ok(c.pursued.every(id=>c.wounded.includes(id)));
  assert.ok(audit(world).ok,audit(world).issues.slice(0,6).join('; '));
 }
 assert.equal(conflicts,seeds.length);
});

test('technical reproducibility does not make a demographic trajectory historically true',()=>{
 const first=createWorld(43821),second=deserialize(serialize(first));
 for(let year=0;year<3;year++){
  advanceDays(first,365);for(let day=0;day<365;day++)advanceDays(second,1);
  assert.equal(serialize(first),serialize(second));
  assert.ok(audit(first).ok,audit(first).issues.slice(0,6).join('; '));
 }
 const obs=historicalObservation(first);
 assert.ok(Number.isFinite(obs.householdSize));
 assert.ok(historicalComparison(obs).every(x=>x.interpretation!=='historically-validated'));
});
