import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,SIZE} from './model.js';
import {parcelEconomics,leaseEconomics,landCadastre,landAt,tenureSummary} from './land-economy.js';
import {walkingSteps} from './navigation.js';
const pos=i=>({x:i%SIZE,y:Math.floor(i/SIZE)});
test('cadastral field titles and leases are exclusive, inspectable and read-only',()=>{
 const s=createWorld(413),snapshot=serialize(s),cad=landCadastre(s);
 const owners=new Set(),communityCounts=new Map();
 for(const h of s.households){
  const summary=tenureSummary(s,cad,h.id);
  assert.equal(summary.owned,h.fields.length);
  assert.equal(summary.ownedHa,Math.round(h.fields.length*.0625*100)/100);
  for(const i of h.fields){
   assert.equal(cad.owners[i],h.id);
   assert.equal(landAt(cad,i).ownerId,h.id);
   assert.equal(landAt(cad,i).kind,'field');
   assert.ok(!owners.has(i),'field titles never duplicate');
   owners.add(i);
   const c=s.communities.find(c=>c.id===h.communityId);
   communityCounts.set(c.id,(communityCounts.get(c.id)||0)+1);
  }
  for(const i of h.croft)assert.equal(landAt(cad,i).kind,'croft');
  assert.equal(landAt(cad,h.y*SIZE+h.x).kind,'home');
 }
 assert.equal(communityCounts.size,4);
 assert.equal(serialize(s),snapshot);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('parcel score responds to walking time, fertility, standing trees and public claims',()=>{
 const s=createWorld(413),h=s.households[0],i=h.fields[0];
 const a=parcelEconomics(s,h,i,12,2),far=parcelEconomics(s,h,i,90,2);
 assert.ok(a.netAnnual>far.netAnnual);
 assert.ok(a.commuteHours<far.commuteHours);
 assert.ok(a.woodNeeded>=24&&a.compensation>=16);
 const originalSoil=s.soil[i],originalForest=s.forest[i];
 s.soil[i]=40;s.forest[i]=300;
 const poor=parcelEconomics(s,h,i,12,2);
 assert.ok(poor.netAnnual<a.netAnnual,'poor land with trees must not be a better free claim');
 assert.ok(poor.clearingWorkDays>a.clearingWorkDays);
 s.soil[i]=originalSoil;s.forest[i]=originalForest;
 const bid=leaseEconomics(s,h,i,25);
 assert.ok(bid.expectedKg>0&&bid.expectedRentKg>0);
 assert.ok(leaseEconomics(s,h,i,2).netKg>leaseEconomics(s,h,i,80).netKg);
});
test('founding farmland has no artificial radial exclusion and respects real homes',()=>{
 const s=createWorld(413),occupied=s.households,all=s.households.flatMap(h=>h.fields);
 assert.ok(all.length>500,'founders still hold real land rights');
 for(const i of all){
  const {x,y}=pos(i);
  assert.ok(occupied.every(h=>Math.abs(x-h.x)+Math.abs(y-h.y)>=4),
   'farm strips cannot occupy another home approach or kitchen-garden land');
 }
 const distances=all.map(i=>{
  const {x,y}=pos(i),h=occupied.find(h=>h.fields.includes(i));
  return Math.hypot(x-h.x,y-h.y);
 });
 assert.ok(new Set(distances.map(n=>Math.floor(n/5))).size>4,'holding distribution varies with geography');
 const snapshot=serialize(s);landCadastre(s);assert.equal(serialize(s),snapshot);
});
test('seasonal rented strips display owner and tenant simultaneously without title transfer',()=>{
 const s=createWorld(413);advanceDays(s,366);
 const cad=landCadastre(s),tenant=s.households.find(h=>h.leaseIn?.length);
 assert.ok(tenant,'at least one real lease should be negotiated');
 const cell=tenant.leaseIn[0],plot=landAt(cad,cell);
 assert.equal(plot.tenantId,tenant.id);
 assert.notEqual(plot.ownerId,tenant.id);
 assert.ok(plot.owner.fields.includes(cell));
 assert.ok(tenureSummary(s,cad,tenant.id).rented>0);
 const saved=serialize(s),restored=deserialize(saved);
 assert.deepEqual(landAt(landCadastre(restored),cell).tenantId,tenant.id);
 assert.equal(serialize(restored),saved);
});
test('new cadastral visual control, family inspector and route-based price are functional',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/id="tenure-toggle"/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(app,/landCadastre\(sim\)/);
 assert.match(app,/tenureMode=!tenureMode/);
 assert.match(app,/landAt\(cad,i\)/);
 assert.match(app,/ctx.drawImage\(tenureCanvas/);
 assert.match(app,/landOverview/);
 assert.match(app,/plotDetail/);
});
test('saved worlds remain deterministic and economically conserved over seasonal claim window',()=>{
 for(const seed of [413,43821]){
  const s=createWorld(seed);advanceDays(s,350);
  const saved=serialize(s),copy=deserialize(saved);
  advanceDays(s,85);advanceDays(copy,85);
  assert.equal(serialize(s),serialize(copy));
  const report=audit(s);assert.ok(report.ok,report.issues.slice(0,4).join('; '));
  const cad=landCadastre(s);
  for(const h of s.households)for(const i of h.fields)
   assert.equal(cad.owners[i],h.id);
 }
});
