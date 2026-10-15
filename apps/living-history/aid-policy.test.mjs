import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,foodAccess,aidEligibility,aidAssessment} from './model.js';

function nearbyPair(s){
 for(const target of s.households){
  if(!target.members.some(id=>s.people.some(p=>p.id===id&&p.alive)))continue;
  const candidates=s.households.filter(d=>d.id!==target.id&&
   Math.hypot(d.x-target.x,d.y-target.y)<28&&
   d.members.some(id=>s.people.some(p=>p.id===id&&p.alive&&p.age>=15&&p.health>25)));
  for(const donor of candidates){
   // Test conditions are *explicitly* artificial; do not interpret as
   // simulation scenarios or as auditable physical additions of food.
   target.grain=0;donor.grain=10000;
   const trial=aidEligibility(s,donor,target);
   if(trial.eligible)return {target,donor};
  }
 }
 throw Error('Expected at least one reachable donor pair in initial village');
}

test('pair evaluator uses actual kin, seed reserve, route and carrier checks without mutation',()=>{
 const s=createWorld(413);
 const {target,donor}=nearbyPair(s);
 const before=serialize(s);
 const yes=aidEligibility(s,donor,target);
 assert.equal(yes.eligible,true);
 assert.ok(yes.quantityKg>0&&yes.quantityKg<=80);
 assert.ok(yes.carrierId);
 assert.ok(yes.travelDays>=1);
 assert.equal(serialize(s),before,'an eligibility query must not change the world');

 donor.grain=0;
 const shortage=aidEligibility(s,donor,target);
 assert.equal(shortage.eligible,false);
 assert.ok(['unrelated-relief-rule','donor-reserve'].includes(shortage.reason));
 donor.grain=10000;
 for(const p of s.people)if(donor.members.includes(p.id))p.health=20;
 const impossible=aidEligibility(s,donor,target);
 assert.equal(impossible.eligible,false);
 assert.equal(impossible.reason,'no-hauler');
});

test('aid assessment distinguishes 7-day scheduling, donor choice and pending aid',()=>{
 const s=createWorld(413),{target,donor}=nearbyPair(s);
 for(const h of s.households)if(h.id!==donor.id)h.grain=0;
 const original=serialize(s);
 s.day=1;
 const waiting=aidAssessment(s,target);
 assert.equal(waiting.status,'awaiting-weekly-review');
 assert.equal(waiting.canDispatchNow,false);
 assert.equal(waiting.dispatchableKg,0);
 assert.ok(waiting.eligibleIfReviewedNowKg>0);
 assert.equal(waiting.donorId,donor.id);
 s.day=7;
 const due=aidAssessment(s,target);
 assert.equal(due.status,'dispatchable');
 assert.equal(due.canDispatchNow,true);
 assert.equal(due.dispatchableKg,aidEligibility(s,donor,target).quantityKg);
 assert.equal(foodAccess(s,target).potentialAidKg,due.dispatchableKg);
 assert.equal(foodAccess(s,target).aid.carrierId,due.carrierId);
 assert.ok(due.nextReviewDay===s.day);
 s.shipments.push({kind:'aid',buyer:target.id,seller:donor.id,good:'grain',amount:1,day:12});
 const pending=aidAssessment(s,target);
 assert.equal(pending.status,'delivery-pending');
 assert.equal(pending.canDispatchNow,false);
 assert.equal(foodAccess(s,target).potentialAidKg,0);
 assert.notEqual(original,serialize(s),'test modified the scenario only in controlled ways');
});

test('a home with enough grain cannot receive relief even beside a wealthy donor',()=>{
 const s=createWorld(413),{target,donor}=nearbyPair(s);
 target.grain=1e4;
 assert.equal(aidEligibility(s,donor,target).reason,'not-needy');
 assert.equal(aidAssessment(s,target).status,'not-needy');
 assert.equal(foodAccess(s,target).potentialAidKg,0);
});

test('diagnostic is pure across representative monthly worlds and actual aid is physically audited',()=>{
 const s=createWorld(7777);
 for(let day=1;day<=365;day++){
  advanceDays(s,1);
  if(day%30===0){
   const before=serialize(s);
   for(const h of s.households.slice(0,10)){
    const a=aidAssessment(s,h),b=aidAssessment(s,h);
    assert.deepEqual(a,b);
    assert.equal(foodAccess(s,h).potentialAidKg,a.dispatchableKg);
    assert.equal(a.dispatchableKg>0,a.canDispatchNow);
   }
   assert.equal(serialize(s),before,'read-only aid diagnosis must not change serializable state');
  }
 }
 const checked=audit(s);
 assert.ok(checked.ok,checked.issues.join('; '));
});

test('fixed baseline 25-year world remains unchanged by the aid decision refactor',()=>{
 const s=createWorld(413);
 advanceDays(s,365*25);
 const people=s.people.filter(p=>p.alive).length;
 assert.equal(people,188);
 assert.equal(s.stats.starvationDeaths,50);
 assert.ok(audit(s).ok);
});
