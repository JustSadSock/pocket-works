import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioProject,hierarchy,resolveDuel} from '../../pocketnet/banners-match.mjs';
import {validateScenarioProject} from '../../pocketnet/banners-engine-v1/laboratory.js';
import {createAlliedRoster,joinAllied,scope,allocate,transferAllied,handoffAllied,markAllied,beginAllied,setAlliedAI,submitAllied,lockAllied,completeAllied,commandRosterView} from '../../pocketnet/banners-allied.mjs';
const user=i=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Commander '+i});
const fixture=(historical=true)=>validateScenarioProject(scenarioProject({historical,landscape:'flat',seconds:60})).state;
const group=(s,side)=>hierarchy(s,side).nodes.find(n=>n.level===1);
const order=n=>({commands:[{group:n.id,task:'hold',anchor:{x:500,y:400},autonomy:'strict'}]});
test('team formats respect independent seat capacity and AI-only sides',()=>{
 for(const [format,counts] of Object.entries({'2vAI':[2,0],'2v1':[2,1],'2v2':[2,2],'3vAI':[3,0]})){
  let r=createAlliedRoster(format,user(1)),i=2;for(let side of [0,1])for(let j=side?0:1;j<counts[side];j++)joinAllied(r,user(i++),side);
  assert.deepEqual(r.capacity,counts);for(let side of [0,1])assert.throws(()=>joinAllied(r,user(20+side),side),/team_full/);
 }
});
test('historical allocation prevents overlapping ancestors, unauthorized orders and stale or duplicate seals',()=>{
 const s=fixture(),r=createAlliedRoster('2v2',user(1));joinAllied(r,user(2),0);joinAllied(r,user(3),1);joinAllied(r,user(4),1);
 const g=group(s,0),h=group(s,1);
 allocate(r,s,user(1).id,user(2).id,[g.id]);allocate(r,s,user(3).id,user(4).id,[h.id]);
 assert.throws(()=>allocate(r,s,user(1).id,user(4).id,[h.id]),/invalid_assignment/);
 assert.throws(()=>allocate(r,s,user(2).id,user(1).id,[g.id]),/captain_required/);
 assert.ok(scope(r,s,user(1).id).every(id=>!g.ids.includes(id)));
 beginAllied(r,s);
 assert.throws(()=>allocate(r,s,user(1).id,user(2).id,[]),/assignment_frozen/);
 assert.throws(()=>submitAllied(r,s,user(1).id,{round:s.round,seq:1,orders:order(g)}),/outside_command/);
 assert.throws(()=>submitAllied(r,s,user(2).id,{round:s.round,seq:1,orders:order(h)}),/invalid_command/);
 const root=hierarchy(s,0).nodes.find(n=>n.level===0);
 assert.throws(()=>submitAllied(r,s,user(1).id,{round:s.round,seq:1,orders:order(root)}),/outside_command/);
 assert.equal(submitAllied(r,s,user(2).id,{round:s.round,seq:1,orders:order(g),seal:true}),true);
 assert.equal(submitAllied(r,s,user(2).id,{round:s.round,seq:1,orders:order(g),seal:true}),false);
 assert.throws(()=>submitAllied(r,s,user(2).id,{round:s.round,seq:2,orders:order(g)}),/round_locked/);
 assert.throws(()=>lockAllied(r,s),/not_ready/);
 assert.equal(commandRosterView(r,s,user(1).id).members.find(m=>!m.self).ready,undefined);
 assert.deepEqual(commandRosterView(r,s,user(3).id).draft,{});
 assert.throws(()=>commandRosterView(r,s,user(8).id),/not_member/);
 for(const i of [1,3,4])submitAllied(r,s,user(i).id,{round:s.round,seq:1,seal:true});
 assert.deepEqual(lockAllied(r,s)[0].commands,order(g).commands);
 completeAllied(r);assert.equal(r.phase,'replay');
});
test('delegation and deadline cannot bypass the same scope validation',()=>{
 const s=fixture(),r=createAlliedRoster('2vAI',user(1));joinAllied(r,user(2),0);let g=group(s,0);
 allocate(r,s,user(1).id,user(2).id,[g.id]);beginAllied(r,s);
 setAlliedAI(r,user(1).id,user(2).id,true);
 assert.throws(()=>submitAllied(r,s,user(2).id,{round:s.round,seq:1,seal:true}),/round_locked/);
 submitAllied(r,s,user(1).id,{round:s.round,seq:1,seal:true});
 assert.throws(()=>setAlliedAI(r,user(1).id,user(2).id,false),/delegation_frozen/);
 assert.throws(()=>lockAllied(r,s,{staff:()=>order(group(s,1))}),/invalid_command/);
 assert.deepEqual(lockAllied(r,s,{staff:(side)=>order(side?group(s,1):g)}).map(q=>q.commands.length),[1,1]);
});

test('handoff, transfer, direct historical markers and actual engine round',()=>{
 const s=fixture(),r=createAlliedRoster('2v2',user(1));joinAllied(r,user(2),0);joinAllied(r,user(3),1);joinAllied(r,user(4),1);
 let g=group(s,0),h=group(s,1);allocate(r,s,user(1).id,user(2).id,[g.id]);allocate(r,s,user(3).id,user(4).id,[h.id]);beginAllied(r,s);
 submitAllied(r,s,user(2).id,{round:s.round,seq:1,orders:order(g)});
 handoffAllied(r,user(1).id,user(2).id);
 assert.equal(commandRosterView(r,s,user(2).id).role,'captain');
 assert.deepEqual(commandRosterView(r,s,user(2).id).draft,{});
 assert.deepEqual(scope(r,s,user(1).id),g.ids.slice().sort((a,b)=>a-b));
 transferAllied(r,s,user(2).id,user(1).id,[g.id]);
 assert.throws(()=>markAllied(r,s,user(2).id,{round:s.round,seq:2,kind:'support',x:500,y:400}),/direct_dispatch_required/);
 assert.throws(()=>markAllied(r,s,user(2).id,{round:s.round,seq:2,kind:'support',x:500,y:400,recipient:user(4).id}),/invalid_recipient/);
 assert.equal(markAllied(r,s,user(2).id,{round:s.round,seq:2,kind:'support',x:500,y:400,recipient:user(1).id,group:g.id}),true);
 assert.equal(commandRosterView(r,s,user(1).id).markers.length,1);
 assert.equal(commandRosterView(r,s,user(3).id).markers.length,0);
 submitAllied(r,s,user(1).id,{round:s.round,seq:1,orders:order(g),seal:true});
 submitAllied(r,s,user(2).id,{round:s.round,seq:3,seal:true});
 submitAllied(r,s,user(3).id,{round:s.round,seq:1,seal:true});
 submitAllied(r,s,user(4).id,{round:s.round,seq:1,orders:order(h),seal:true});
 let merged=lockAllied(r,s),orders={__historical:merged[0].commands,__enemyHistorical:merged[1].commands};
 let result=resolveDuel(s,orders,{frames:false});
 assert.ok(result.state.time>0);assert.equal(result.state.round,s.round+1);
 assert.ok(result.state.commandHierarchy.queue.length>0);
 assert.ok(result.state.enemyHierarchy.queue.length>0);
 completeAllied(r);beginAllied(r,result.state);assert.equal(r.round,result.state.round);
});
