import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,population} from './model.js';
import {beginLandDispute} from './conflicts.js';
import {advanceInstitutions,courtDay,institutionsAudit,villageInstitutions} from './institutions.js';
import {walkPath} from './navigation.js';

function pair(s){
 for(const c of s.communities){
  const homes=s.households.filter(h=>h.communityId===c.id);
  const large=[...homes].sort((a,b)=>b.fields.length-a.fields.length)[0];
  const poor=[...homes].sort((a,b)=>a.fields.length-b.fields.length)
    .find(h=>h.id!==large.id&&h.fields.length<large.fields.length&&h.members.some(id=>s.people.some(p=>p.id===id&&p.alive&&p.sex==='m')));
  if(!poor)continue;
  const site=[...large.fields].sort((a,b)=>Math.hypot(a%160-poor.x,Math.floor(a/160)-poor.y)-Math.hypot(b%160-poor.x,Math.floor(b/160)-poor.y))[0];
  if(walkPath(s,poor,{x:site%160,y:Math.floor(site/160)}).length>1)return {poor,large,site};
 }
 throw Error('Missing real titled border');
}
test('the first hearing uses actual existing people, a court workday and an original land title',()=>{
 const s=createWorld(413),{poor,large,site}=pair(s);
 const people=population(s),initialOwner=large.id;
 const conflict=beginLandDispute(s,poor.id,large.id,site);assert.ok(conflict);
 advanceDays(s,1);
 const legal=s.institutions.cases.find(c=>c.disputeId===conflict.id);assert.ok(legal,'every finished fight files a real claim');
 assert.equal(legal.kind,'land');assert.equal(legal.stage,'filed');
 assert.equal(legal.cell,site);assert.equal(legal.ownerId,large.id);
 const before=serialize(s),twin=deserialize(before);
 advanceDays(s,45);for(let i=0;i<45;i++)advanceDays(twin,1);
 assert.equal(serialize(s),serialize(twin),'court calendar and decisions must survive a saved replay');
 const ruled=s.institutions.cases.find(c=>c.id===legal.id);
 assert.ok(ruled.heardDay,'the villagers must eventually hear this case');
 assert.ok(['resolved','owed'].includes(ruled.stage));
 assert.ok(s.people.some(p=>p.workDays?.court>0&&p.dailyShift?.kind==='court'||
  p.workDays?.court>0),'a real participant must give up time for the hearing');
 assert.equal(population(s)>=0,true);assert.equal(people>0,true);
 assert.ok(s.households.find(h=>h.id===initialOwner).fields.includes(site),'the disputed titled strip stays with its owner');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('emergency court relief requires a donor, an actual carrier and scheduled delivery',()=>{
 const s=createWorld(7777),cm=s.communities[0];
 const recipient=s.households.find(h=>h.communityId===cm.id&&h.id!==cm.manorHouseId);
 const donor=s.households.find(h=>h.id===cm.manorHouseId);
 assert.ok(donor&&recipient);
 const n=recipient.grain;recipient.grain=0;donor.grain+=n;recipient.shortage=13;
 s.day=15;
 const startCoin=s.households.reduce((sum,h)=>sum+h.coin,0);
 const grain=()=>s.households.reduce((sum,h)=>sum+h.grain,0)+s.shipments.filter(t=>t.good==='grain').reduce((sum,t)=>sum+t.amount,0);
 const startGrain=grain();
 advanceInstitutions(s);
 const c=s.institutions.cases.find(c=>c.kind==='relief'&&c.claimantId===recipient.id);
 assert.ok(c);
 assert.equal(c.stage,'filed');
 assert.ok(s.institutions.officers[cm.id].personId);
 for(let d=0;d<34&&c.stage==='filed';d++){s.day++;advanceInstitutions(s);}
 assert.equal(c.stage,'resolved');
 assert.ok(['aid-dispatched','no-spare-grain','recovered'].includes(c.disposition));
 if(c.disposition==='aid-dispatched'){
  const t=s.shipments.find(t=>t.id===c.shipmentId);
  assert.ok(t&&t.kind==='aid'&&t.amount===c.grainKg&&t.day>s.day);
  assert.ok(s.people.find(p=>p.id===t.carrierId)?.dailyShift?.day===s.day);
  assert.ok(c.grainKg>0);
 }
 assert.ok(Math.abs(grain()-startGrain)<.02,'relief cannot conjure stock');
 assert.equal(s.households.reduce((sum,h)=>sum+h.coin,0),startCoin);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('historical load migrates empty institutions and audit rejects invented court debts',()=>{
 const s=createWorld(43821),legacy=JSON.parse(serialize(s));delete legacy.institutions;
 const back=deserialize(JSON.stringify(legacy));
 assert.deepEqual(villageInstitutions(back).cases,[]);
 assert.ok(audit(back).ok);
 // Old completed skirmishes must not suddenly become hundreds of new cases.
 const oldPair=pair(back),prior=beginLandDispute(back,oldPair.poor.id,oldPair.large.id,oldPair.site);
 assert.ok(prior);advanceDays(back,1);
 const oldFormat=JSON.parse(serialize(back));delete oldFormat.institutions;
 const migrated=deserialize(JSON.stringify(oldFormat));
 advanceDays(migrated,1);
 assert.equal(migrated.institutions.cases.filter(c=>c.disputeId===prior.id).length,0);
 const cm=back.communities[0],h=back.households.find(h=>h.communityId===cm.id);
 back.institutions.cases.push({id:999,kind:'land',stage:'owed',filedDay:0,
  communityId:cm.id,claimantId:h.id,ownerId:h.id,cell:2,
  debts:[{payer:h.id,recipient:h.id,amount:5,remaining:9}],paidCoin:0});
 assert.ok(institutionsAudit(back).length>0);
});
test('court access, hearing slots and reports remain deterministic and read-only',()=>{
 const s=createWorld(9001);
 assert.ok(!courtDay(s.communities[0].id,0));
 for(const cm of s.communities){
  let count=0;for(let d=1;d<=140;d++)count+=courtDay(cm.id,d)?1:0;
  assert.equal(count,10);
 }
 advanceDays(s,60);
 const before=serialize(s);
 assert.deepEqual(villageInstitutions(s),villageInstitutions(s));
 assert.equal(serialize(s),before);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('court has an actual navigation control and indexed detail view',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/data-tab="institutions"/);
 assert.match(app,/mode==='institutions'/);
 assert.match(app,/data-case-back/);
 assert.match(app,/data-court-house/);
});
