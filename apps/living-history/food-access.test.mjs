import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,foodAccess,serialize,deserialize} from './model.js';
import {walkingSteps} from './navigation.js';
const living=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
const balances=s=>{s.economy.grainInitial=Math.round(s.households.reduce((a,h)=>a+h.grain,0)*100)/100;s.economy.coinsInitial=s.households.reduce((a,h)=>a+h.coin,0);};
const release=(s,h)=>{for(const i of h.fields)s.usage[i]=0;h.fields=[];h.farmYear=null;};
test('a poor household can receive physical aid without money or invented grain',()=>{
 const s=createWorld(43821),donor=s.households[0],target=s.households.find(h=>h.id!==donor.id&&walkingSteps(s,donor,h)>1&&walkingSteps(s,donor,h)<22);
 assert.ok(target);
 for(const h of s.households){h.grain=300;h.coin=0;}
 donor.grain=3800;target.grain=0;balances(s);
 advanceDays(s,7);
 const shipment=s.shipments.find(t=>t.kind==='aid'&&t.buyer===target.id);
 assert.ok(shipment,'neighbor aid must not require cash');
 assert.equal(shipment.cost,0);
 assert.ok(shipment.day>s.day);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,shipment.day-s.day);
 assert.ok(target.grain>0,'food arrives only after carrying it');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('physically disconnected plenty does not feed a household automatically',()=>{
 const s=createWorld(413),target=s.households[0];s.scenario='isolated';
 const far=s.households.filter(h=>walkingSteps(s,target,h)>100).sort((a,b)=>walkingSteps(s,target,b)-walkingSteps(s,target,a))[0];
 assert.ok(far);
 for(const h of s.households){h.grain=0;h.oats=0;h.pulses=0;}
 s.economy.oatsInitial=0;s.economy.pulsesInitial=0;
 far.grain=10000;target.coin=0;balances(s);
 const before=foodAccess(s,target);
 assert.ok(before.reachableGrainKg<10000,'distant stored grain is not local food');
 advanceDays(s,115);
 assert.ok(living(s,target).some(p=>p.foodDebt>0)||!living(s,target).length);
 assert.ok((s.stats.starvationDeaths||0)>0,'zero local food and no seeds can cause deaths');
 assert.ok(s.foodCases?.length>0,'starvation records contain the household access situation');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('a destitute household can join a staffed host in another community without creating a dwelling',()=>{
 const s=createWorld(9001),source=s.households[0],people=living(s,source);
 const host=s.households.find(h=>h.communityId!==source.communityId&&walkingSteps(s,source,h)>0&&walkingSteps(s,source,h)<190&&h.fields.length>=18);
 assert.ok(host);
 // Place an unusually large but genuinely existing estate in the receiving village.
 const peers=s.households.filter(k=>k.communityId===host.communityId&&k.id!==host.id);
 for(const peer of peers){const strips=peer.fields.splice(0,22);host.fields.push(...strips);peer.farmYear=null;}
 host.farmYear=null;
 release(s,source);source.grain=90;host.grain=4500;
 for(const h of s.households)if(h.id!==host.id&&h.id!==source.id)h.grain=0;
 host.capacity=living(s,host).length+people.length;
 s.day=309;balances(s);
 const houses=s.households.length,original=s.households.reduce((n,h)=>n+h.grain,0);
 advanceDays(s,1);
 assert.ok(source.migration,'land-poor households must consider an economically possible host');
 assert.equal(source.migration.kind,'lodging');
 const destination=s.households.find(h=>h.id===source.migration.target);
 const days=source.migration.end-s.day;
 advanceDays(s,days);
 assert.ok(people.every(p=>p.houseId===destination.id),'people join the receiving household');
 assert.equal(s.households.length,houses,'no new housing is invented');
 assert.ok((s.stats.lodgingMigrants||0)>=people.length);
 assert.ok(s.households.reduce((n,h)=>n+h.grain,0)<original,'food is consumed, never created');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('access diagnosis is observational and deterministic through save/restore',()=>{
 const s=createWorld(7777);advanceDays(s,365);
 const snapshot=serialize(s),copy=deserialize(snapshot);
 assert.deepEqual(foodAccess(s,s.households[0]),foodAccess(copy,copy.households[0]));
 assert.equal(serialize(s),snapshot,'diagnostics cannot advance RNG or alter the world');
 advanceDays(s,90);advanceDays(copy,90);
 assert.equal(serialize(s),serialize(copy));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('real scarcity preserves mortality: aid is conditional, not a population floor',()=>{
 const s=createWorld(377);let removed=0;
 for(const h of s.households){removed+=h.grain;h.grain=0;release(s,h);}
 s.stats.consumed=Math.round((s.stats.consumed+removed)*100)/100;
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,200);
 assert.ok((s.stats.starvationDeaths||0)>0,'some residents must die when food cannot be obtained');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('successive occupants trigger successive estate settlements without stranded land rights',()=>{
 const s=createWorld(413),estate=s.households[0],other=s.households[1];
 for(const p of living(s,estate)){p.alive=false;p.job='dead';}
 advanceDays(s,1);
 assert.ok(estate.lastEstateDay);
 assert.equal(estate.fields.length,0);
 const adult=living(s,other).find(p=>p.age>=18);
 assert.ok(adult);
 other.members=other.members.filter(id=>id!==adult.id);estate.members.push(adult.id);adult.houseId=estate.id;
 const transferred=other.fields.splice(0,12);estate.fields.push(...transferred);
 other.farmYear=null;estate.farmYear=null;
 advanceDays(s,1);
 assert.equal(estate.lastEstateDay,null,'reoccupied house must reset the earlier vacancy marker');
 adult.alive=false;adult.job='dead';
 advanceDays(s,1);
 assert.equal(estate.fields.length,0,'second vacancy must transfer or release land again');
 assert.ok(transferred.every(cell=>s.usage[cell]===0||s.households.some(h=>h.id!==estate.id&&h.fields.includes(cell))));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('ownerless household property passes to a reachable local steward, not an inaccessible ghost wallet',()=>{
 const s=createWorld(7777),estate=s.households[0];
 const formerCoin=estate.coin;
 for(const p of living(s,estate)){p.alive=false;p.job='dead';}
 advanceDays(s,1);
 assert.equal(estate.coin,0,'unclaimed money should not remain in a house with no living owner');
 assert.ok((s.stats.escheatedCoin||0)>=formerCoin,'local custody is recorded as a real transfer');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
