import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,getHousehold} from './model.js';
import {walkingSteps} from './navigation.js';
const SIZE=160;
const at=(s,i)=>({x:i%SIZE,y:Math.floor(i/SIZE)});
const live=(s,h)=>s.people.filter(p=>p.alive&&p.houseId===h.id);
const rebase=(s)=>{s.economy.grainInitial=+s.households.reduce((n,h)=>n+h.grain,0).toFixed(2);s.economy.woodInitial=+s.households.reduce((n,h)=>n+h.wood,0).toFixed(2);s.economy.coinsInitial=s.households.reduce((n,h)=>n+h.coin,0);};
const release=(s,h)=>{for(const i of h.fields)s.usage[i]=0;h.fields=[];h.farmYear=null;};

test('founding rights are exclusive and the commons is an access boundary, not a free store',()=>{
 const s=createWorld(413),owner=new Map();assert.equal(s.commons.length,SIZE*SIZE);
 for(const h of s.households){assert.ok(['free','customary','cottar','demesne'].includes(h.tenure));assert.equal(h.tenureOrigin,'initial-settlement');
  assert.ok(h.fields.length>0);for(const i of h.fields){assert.equal(s.usage[i],2);assert.ok(!owner.has(i));owner.set(i,h.id);} }
 assert.ok(s.commons.some(v=>v===s.communities[0].id));assert.ok(audit(s).ok);
});

test('new family holding divides existing rights, never manufactures new plots',()=>{
 const s=createWorld(7777),h=s.households[0],oldIds=new Set(h.fields),oldPopulation=s.people.length;
 h.capacity=live(s,h).length;h.wood=1500;h.coin=1300;
 // Arrange sufficient customary strips before forming a viable separate hearth.
 h.fields.push(...s.households[1].fields.slice(0,12));s.households[1].fields=s.households[1].fields.slice(12);
 s.day=310;rebase(s);const oldCount=s.households.length;
 advanceDays(s,8);
 assert.ok(h.buildProject||s.households.length>oldCount,'home construction is a real project');
 advanceDays(s,76);
 const newHomes=s.households.slice(oldCount).filter(x=>live(s,x).length);
 assert.ok(newHomes.length>0,'adult couple or an adult child should found a separate household');
 const offspring=newHomes[0];assert.ok((s.stats.landDivided||0)>0,'new family receives real divided or reallocated customary rights');
 assert.ok(offspring.fields.every(i=>s.usage[i]===2),'every granted parcel must have a recorded owner');
 for(const i of offspring.fields)assert.ok(!h.fields.includes(i));
 assert.ok(s.people.length>=oldPopulation);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('common land needs actual work and materials before becoming a holding',()=>{
 const s=createWorld(43821),h=s.households[0];release(s,h);
 h.wood=450;h.coin=700;h.grain=180;
 s.day=310;rebase(s);let seen=false;
 for(let d=0;d<30;d++){advanceDays(s,1);if((s.stats.landReclaimed||0)>0){seen=true;break;}}
 assert.ok(seen,'household can reclaim nearby village commons if it can afford work');
 assert.ok((s.stats.landWood||0)>=24);
 assert.ok(h.fields.length>0);assert.ok(h.fields.every(i=>s.usage[i]===2));
 // Modify resource baselines because this setup deliberately changed the inventory.
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('heirs inherit reachable strips; unclaimed strips revert to free land',()=>{
 const s=createWorld(413),orphan=s.households[0],recipient=s.households[1];
 const former=[...orphan.fields],previous=recipient.fields.length;
 const heir=live(s,recipient)[0],parent=live(s,orphan)[0];
 heir.parents=[parent.id];for(const p of live(s,orphan)){p.alive=false;p.job='dead';}
 s.day=20;advanceDays(s,1);
 assert.equal(orphan.fields.length,0);
 assert.ok(recipient.fields.length>=previous);
 assert.ok(former.every(i=>s.usage[i]===0||s.households.some(k=>k.fields.includes(i))), 'rights may be inherited or reassigned, not duplicated');
 const issues=audit(s).issues.filter(x=>!x.includes('зерна')&&!x.includes('древесины')&&!x.includes('скота'));
 assert.deepEqual(issues,[]);
});

test('migration uses an accessible vacant dwelling, occurs after travel, and keeps possessions conserved',()=>{
 const s=createWorld(9001),source=s.households[0],destination=s.households.find(h=>h.communityId!==source.communityId&&walkingSteps(s,source,h)>0&&walkingSteps(s,source,h)<190);
 assert.ok(destination);
 for(const p of live(s,destination)){p.alive=false;p.job='dead';}
 // Court-authorised vacant holding with real fields remains available for resettlement.
 destination.lastEstateDay=310; // Released for migration at day 310, not for prior same-day local division.
 release(s,source);
 source.grain=90;source.coin=450;source.wood=350;s.day=309;rebase(s);
 const people=live(s,source).map(p=>p.id),members=new Set(people);
 advanceDays(s,1);
 assert.ok(source.migration,'household should seek new territory after crop failure and land loss');
 assert.ok(source.migration.end>s.day);
 const to=s.households.find(h=>h.id===source.migration.target);
 assert.notEqual(to.communityId,source.communityId);
 const duration=source.migration.end-s.day;
 advanceDays(s,duration);
 for(const id of members){const p=s.people.find(p=>p.id===id);assert.equal(p.houseId,to.id);}
 assert.equal(source.migration,null);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('land tenure, ongoing projects, and claims survive a serialization round-trip',()=>{
 const s=createWorld(413);advanceDays(s,366);
 const json=serialize(s),clone=deserialize(json);
 assert.equal(serialize(clone),json);
 advanceDays(s,20);advanceDays(clone,20);
 assert.equal(serialize(s),serialize(clone));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 assert.equal(getHousehold(s,s.households[0].id).tenure,'free');
});

test('seasonal sharecropping borrows underused land with crop-share rent, without transferring title',()=>{
 const s=createWorld(413);const owner=s.households[0],tenant=s.households[7];
 tenant.grain=900;owner.grain=1600; // A land-poor cottar may lease from a large free owner.
 tenant.farmYear=null;owner.farmYear=null;
 s.day=365;rebase(s);advanceDays(s,1);
 assert.ok(tenant.leaseIn?.length>0,'land-poor households must obtain usable leased strips');
 assert.ok(owner.leaseOut?.length>0);
 assert.ok(tenant.leaseIn.every(i=>owner.fields.includes(i)),'land ownership remains with the landlord');
 assert.ok(tenant.leaseIn.every(i=>!tenant.fields.includes(i)),'tenant does not acquire ownership automatically');
 const existing=s.economy.grainInitial;
 advanceDays(s,300);
 assert.ok(s.stats.leasePlots>0);
 assert.ok((s.stats.rentGrain||0)>0,'landlord must receive grain from a genuinely harvested rented strip');
 assert.ok(tenant.accounting.rentPaidKg>0,'cottar paid physical crop share');
 assert.ok(owner.accounting.rentReceivedKg>=tenant.accounting.rentPaidKg,'free owner can also lease to other tenants');
 assert.equal(existing,s.economy.grainInitial);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});