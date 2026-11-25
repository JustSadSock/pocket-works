import test from 'node:test';
import assert from 'node:assert/strict';
import {createAlliedMatch,joinAlliedMatch,mutateAlliedMatch,tickAlliedMatch,resolveAlliedLocked,viewAlliedMatch,viewAlliedRound,alliedRematchSource} from '../../pocketnet/banners-allied-room.mjs';
import {createMatch,viewMatch} from '../../pocketnet/banners-match.mjs';
const user=i=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Commander '+i});
const id='1234567890abcdef';
async function fixture(format,historical,extra={}){
 const m=await createAlliedMatch(user(1),{alliedFormat:format,historical,landscape:'flat',seconds:60,planSeconds:30,...extra},0,id);
 const n=m.allied.capacity.reduce((a,b)=>a+b,0);
 for(let i=2;i<=n;i++)joinAlliedMatch(m,user(i),1);
 const view=i=>viewAlliedMatch(m,user(i),2);
 const act=(i,type,p={},now=3)=>mutateAlliedMatch(m,user(i),{type,seq:view(i).nextSeq,revision:view(i).allied.revision,...p},now);
 for(let side of [0,1]){
  let team=m.allied.members.map((a,i)=>({...a,i:i+1})).filter(a=>a.side===side),cap=team.find(a=>a.captain);
  if(!cap)continue;let available=view(cap.i).nodes.filter(n=>n.level===3);
  for(const [j,a] of team.filter(a=>!a.captain).entries())act(cap.i,'allocate',{seat:a.i-1,groups:[available[j].id]});
 }
 return {m,n,view,act}
}
function orders(v){return v.scenario.historical?{commands:[{group:v.nodes.find(n=>n.permitted&&n.level===3).id,task:'advance',anchor:{x:v.side?600:800,y:450}}]}:{[v.allied.scope[0]]:{kind:'advance',path:[{x:v.side?600:800,y:450}]}}}
for(const [format,historical] of [['2vAI',false],['2v1',true],['2v2',true],['3vAI',false]]){
 test('integrated allied '+format+' reaches final archive',async()=>{
  let {m,n,view,act}=await fixture(format,historical);
  assert.equal(m.allied.members.length,n);assert.equal(view(1).allied.assigned,true);
  for(let i=1;i<=n;i++)act(i,'accept',{checksum:m.checksum});
  assert.equal(m.phase,'planning');
  assert.throws(()=>viewAlliedMatch(m,user(9),4),/not_member/);
  for(let i=1;i<=n;i++)act(i,'ready',{round:1,orders:orders(view(i))});
  assert.equal(m.phase,'locked');
  let row=resolveAlliedLocked(m,5);assert.equal(m.completed,1);
  assert.throws(()=>resolveAlliedLocked(m,5),/round_not_locked/);
  assert.equal(Object.keys(row.seatFrames).length,historical?n:0);
  for(let i=1;i<=n;i++)assert.deepEqual(Object.keys(viewAlliedRound(m,user(i),row,row.seatFrames[i-1])).sort(),['frames','number']);
  assert.equal(m.phase,'replay');
  for(let i=1;i<=n;i++)act(i,'replay_done',{round:1});
  for(let i=1;i<=n;i++)act(i,'ready',{round:2,orders:{}});
  row=resolveAlliedLocked(m,6);assert.equal(m.phase,'finished');
  let archive=viewAlliedRound(m,user(1),row,row.seatFrames[0]);assert.ok(archive.orders);assert.equal(archive.alliedOrders.length,n);
  assert.equal(alliedRematchSource(m,user(1)).alliedFormat,format);
 });
}
test('deadline retains authority and prior drafts; historical direct marker and stale revision do not leak',async()=>{
 const {m,view,act}=await fixture('2v2',true);
 for(let i=1;i<=4;i++)act(i,'accept',{checksum:m.checksum});
 const g=view(2).nodes.find(n=>n.permitted&&n.level===3);
 const draft={commands:[{group:g.id,task:'hold',anchor:{x:501.123,y:401.321},autonomy:'bounded'}]};
 act(2,'draft',{round:1,orders:draft});
 assert.deepEqual(view(2).draft,draft);
 assert.deepEqual(view(1).draft,{});
 assert.ok(!JSON.stringify(view(3)).includes('501.123'));
 assert.throws(()=>act(1,'ready',{round:1,orders:draft}),/outside_command/);
 assert.throws(()=>act(1,'handoff',{seat:1}),/saved_orders_exist/);
 assert.throws(()=>act(1,'ready',{round:1,revision:0,orders:{}}),/authority_changed/);
 act(2,'marker',{round:1,kind:'support',x:501.123,y:400,recipient:0});
 assert.equal(view(1).allied.markers.length,0);assert.equal(view(3).allied.markers.length,0);
 const deadline=m.deadline;assert.equal(tickAlliedMatch(m,deadline-1),false);assert.equal(tickAlliedMatch(m,deadline),true);
 assert.deepEqual(m.allied.locked[0].commands,draft.commands);
 const restored=JSON.parse(JSON.stringify(m));
 const row=resolveAlliedLocked(restored,deadline+1);
 assert.equal(restored.completed,1);assert.equal(restored.allied.members[1].groups[0],g.id);
 assert.equal(viewAlliedMatch(restored,user(2),deadline+2).allied.role,'subordinate');
 assert.ok(!JSON.stringify(viewAlliedRound(restored,user(3),row,row.seatFrames[2])).includes('501.123'));
});
test('duel state still has its original wire shape and no allied record',async()=>{
 const m=await createMatch(user(1),{seconds:60,landscape:'flat'},0,id);
 assert.equal(m.allied,undefined);assert.equal(viewMatch(m,user(1),0).allied,undefined);
});

test('opposing readiness and authority revision cannot cancel own unsealed planning',async()=>{
 const {m,view,act}=await fixture('2v2',true);
 for(let i=1;i<=4;i++)act(i,'accept',{checksum:m.checksum});
 const oldRevision=view(3).allied.revision;
 act(3,'ready',{round:1,orders:{}});
 const blueRevision=view(1).allied.revision;
 act(1,'handoff',{seat:1});
 assert.equal(view(2).allied.role,'captain');
 assert.ok(view(1).allied.revision>blueRevision);
 assert.equal(view(3).allied.revision,oldRevision);
 assert.equal(view(3).ready[1],true);
 act(4,'ready',{round:1,revision:oldRevision,orders:{}});
 assert.equal(m.allied.members[3].ready,true);
});
