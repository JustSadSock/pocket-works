// Allied room protocol v1, independent of legacy duel room state.
// Physics, historical delivery and ordinary order validation remain pinned to banners-engine-v1.
import {createMatch,viewMatch,roomSummary,rematchSource,clone,hierarchy,validateOrders,observedUnits,compactFrame,deploy} from './banners-match.mjs';
import {E} from './banners-engine-v1/engine.js';
import {validateScenarioProject} from './banners-engine-v1/laboratory.js';
import {establishCommand,establishOpposingCommand} from './banners-engine-v1/historical-command.js';
import {createAlliedRoster,joinAllied,participant,nodes,scope,allocate,transferAllied,handoffAllied,setAlliedAI,beginAllied,submitAllied,lockAllied,completeAllied,markAllied,commandRosterView} from './banners-allied.mjs';

const check=(ok,code)=>{if(!ok)throw Error(code)};
const roster=m=>m.allied;
const sideRevision=(r,side)=>r.sideRevision?.[side]??r.revision;
function bumpAuthority(r,side,lobby=false){r.sideRevision??=[r.revision-1,r.revision-1];if(lobby){r.sideRevision[0]++;r.sideRevision[1]++}else r.sideRevision[side]++;}
const seat=(r,i)=>{check(Number.isInteger(i)&&i>=0&&i<r.members.length,'invalid_seat');return r.members[i]};
const member=(m,u)=>participant(roster(m),u.id);
const finishedReveal=m=>m.phase==='finished'&&m.rules.reveal;
const empty=o=>Object.keys(o||{}).length===0;
const phase=(m,name,now,seconds=0)=>{m.phase=name;m.allied.phase=name;m.updatedAt=now;m.deadline=seconds?now+seconds*1000:null};
const captain=(m,u)=>{let a=member(m,u);check(a.captain,'captain_required');return a};
const full=r=>r.capacity.every((n,side)=>r.members.filter(v=>v.side===side).length===n);
const assigned=(m)=>roster(m).members.every(v=>scope(roster(m),m.battle,v.id).some(id=>m.battle.units.find(u=>u.id===id)?.type!=='guard'));
const authorityClear=(r,side)=>{check(r.members.filter(v=>v.side===side).every(v=>!v.ready&&empty(v.draft)),'saved_orders_exist')};
const resetAccept=r=>{for(const v of r.members)v.accepted=false};
const teamsReady=(r,field)=>[0,1].map(side=>r.members.filter(v=>v.side===side).every(v=>v[field]||field==='ready'&&v.ai));
function assignmentTree(s){
 if(hierarchy(s,0))return;
 // Construct allocation-only trees on a snapshot; free WEGO does not enable messengers.
 const F=E.forState(s),copy=F.snapshot(s);
 establishCommand(F,copy,0);establishOpposingCommand(F,copy);
 s.alliedTree=[0,1].map(side=>hierarchy(copy,side).nodes.map(n=>({id:n.id,parent:n.parent,level:n.level,name:n.name,ids:n.ids.slice()})));
}
export async function createAlliedMatch(owner,payload,now,id){
 const r=createAlliedRoster(payload.alliedFormat,owner);
 const m=await createMatch(owner,payload,now,id);
 m.allied=r;m.alliedProtocol=1;r.sideRevision=[0,0];
 m.aiPolicy=payload.aiPolicy==='legacy'?'legacy':'modern';
 m.battle=validateScenarioProject(m.project).state;
 m.battle.fog=m.project.fog;
 m.battle.aiVersionBySide=[m.aiPolicy==='legacy'?3:4,m.aiPolicy==='legacy'?3:4];
 assignmentTree(m.battle);
 m.allied.members[0].accepted=false;
 return m
}
export function joinAlliedMatch(m,user,now,payload={}){
 const r=roster(m),existing=r.members.find(v=>v.id===user.id);
 if(existing){existing.name=String(user.name||existing.name).slice(0,32);return existing.side}
 let side=payload.side;
 if(side===undefined||side===null)side=[0,1].find(i=>r.members.filter(v=>v.side===i).length<r.capacity[i]);
 check(side===0||side===1,'room_full');
 joinAllied(r,user,side);bumpAuthority(r,side,true);r.members.at(-1).accepted=false;resetAccept(r);m.updatedAt=now;return side
}
function startPlanning(m,now){
 const r=roster(m);if(r.phase==='deployment')r.phase='lobby';
 beginAllied(r,m.battle);
 // The original duel accepts authored scenario orders. Team rooms keep them only
 // when they can be assigned unambiguously; unassigned initial plans are not injected.
 for(const v of r.members){v.replayReady=false;v.actions=0;v.edits=0;v.sealedAt=null}
 m.drawOffer=null;m.planningStarted=now;phase(m,'planning',now,m.rules.planSeconds);
}
function startMatch(m,now){
 if(m.rules.deployment==='free'){
  check(m.project.armies.every((a,side)=>a.units.every(u=>side?u.x>=m.project.width/2:u.x<=m.project.width/2)),'free_deployment_not_supported_for_scenario');
  for(const v of roster(m).members)v.ready=false;
  phase(m,'deployment',now,0)
 }else startPlanning(m,now)
}
function afterDeployment(m,now){
 const s=m.battle,F=E.forState(s);
 if(s.commandHierarchy){establishCommand(F,s,0);establishOpposingCommand(F,s)}
 F.refreshVisibility(s);startPlanning(m,now)
}
function staffOrders(m,side,ids,explicit=true){
 const s=m.battle,F=E.forState(s),h=hierarchy(s,side),allowed=new Set(ids??s.units.filter(u=>u.side===side).map(u=>u.id));
 const mode=explicit?'staff':m.rules.fallback;
 if(mode==='latest'||mode==='continue')return {};
 if(mode==='hold'){
  if(h){const commands=h.nodes.filter(n=>n.level>0&&n.ids.every(id=>allowed.has(id))&&!h.nodes.some(a=>a.level>0&&a.id!==n.id&&a.ids.length>n.ids.length&&n.ids.every(id=>a.ids.includes(id))&&a.ids.every(id=>allowed.has(id)))).filter(n=>n.lastReport).map(n=>({group:n.id,task:'hold',anchor:{x:n.lastReport.x,y:n.lastReport.y},autonomy:'strict'}));return validateOrders(s,side,{commands})}
  return validateOrders(s,side,Object.fromEntries(s.units.filter(u=>allowed.has(u.id)&&F.alive(u)&&!u.rout).map(u=>[u.id,{kind:'hold',path:[]}])) )
 }
 const raw=F.command(s,side);
 if(h){
  const key=side===0?'__historical':'__enemyHistorical',commands=[];
  for(const {manual,...q} of raw[key]||[]){let n=h.nodes.find(v=>v.id===q.group);
   if(n&&n.ids.every(id=>allowed.has(id)))commands.push(q);
   // A report-driven group request may span a delegated subtree. Split it
   // into maximal wholly-owned descendants, preserving the requested task.
   else if(n){let within=h.nodes.filter(v=>v.level>n.level&&v.ids.every(id=>n.ids.includes(id)&&allowed.has(id)));let maximal=within.filter(v=>!within.some(a=>a.level<v.level&&v.ids.every(id=>a.ids.includes(id))));for(const v of maximal)commands.push({...q,group:v.id})}
  }
  return validateOrders(s,side,{commands})
 }
 const out={};
 for(const [id,q] of Object.entries(raw))if(allowed.has(Number(id))){
  const {labPlan,commandPacket,...o}=q;
  try{Object.assign(out,validateOrders(s,side,{[id]:o}))}catch{/* A generated stale target is never trusted. Keep the previous order instead. */}
 }
 return out
}
function lock(m,now,deadline=false){
 const r=roster(m);
 lockAllied(r,m.battle,{deadline,staff:(side,ids,explicit)=>staffOrders(m,side,ids,explicit!==false)});
 m.lockedRound=m.battle.round;phase(m,'locked',now)
}
function replayReady(m,now){if(roster(m).members.every(v=>v.replayReady||v.ai))startPlanning(m,now)}
export function tickAlliedMatch(m,now){
 if(m.phase==='planning'&&m.deadline!==null&&now>=m.deadline){lock(m,now,true);return true}
 if(m.phase==='replay'&&m.deadline!==null&&now>=m.deadline){startPlanning(m,now);return true}
 return false
}
export function mutateAlliedMatch(m,user,p,now){
 const r=roster(m),a=member(m,user);
 check(p&&typeof p.type==='string','invalid_request');
 if(p.type==='sync')return false;
 check(Number.isInteger(p.seq)&&p.seq>0,'invalid_sequence');
 if(p.seq<=a.seq)return false;
 check(p.seq===a.seq+1,'sequence_gap');
 if(['allocate','transfer','handoff','delegate','accept','draft','ready'].includes(p.type))check(p.revision===sideRevision(r,a.side),'authority_changed');
 if(p.type==='allocate'||p.type==='transfer'){
  captain(m,user);const target=seat(r,p.seat);authorityClear(r,a.side);
  if(p.type==='allocate')allocate(r,m.battle,user.id,target.id,p.groups);else transferAllied(r,m.battle,user.id,target.id,p.groups);
  bumpAuthority(r,a.side,m.phase==='lobby');if(m.phase==='lobby')resetAccept(r);
 }else if(p.type==='handoff'){
  captain(m,user);authorityClear(r,a.side);handoffAllied(r,user.id,seat(r,p.seat).id);bumpAuthority(r,a.side,m.phase==='lobby');if(m.phase==='lobby')resetAccept(r)
 }else if(p.type==='delegate'){
  captain(m,user);const t=seat(r,p.seat);check(empty(t.draft),'saved_orders_exist');setAlliedAI(r,user.id,t.id,p.on);bumpAuthority(r,a.side,m.phase==='lobby');if(m.phase==='lobby')resetAccept(r)
 }else if(p.type==='accept'){
  check(m.phase==='lobby'&&full(r)&&assigned(m)&&p.checksum===m.checksum,'scenario_not_confirmed');
  a.accepted=true;
  if(r.members.every(v=>v.accepted))startMatch(m,now)
 }else if(p.type==='deploy'){
  check(m.phase==='deployment'&&!a.ready&&!a.ai,'deployment_locked');
  const own=new Set(scope(r,m.battle,user.id));check(Array.isArray(p.placements)&&p.placements.every(v=>own.has(v.id)),'outside_command');
  deploy(m,a.side,p.placements)
 }else if(p.type==='deploy_ready'){
  check(m.phase==='deployment'&&!a.ready&&!a.ai,'deployment_locked');a.ready=true;
  if(r.members.every(v=>v.ready||v.ai))afterDeployment(m,now)
 }else if(p.type==='draft'||p.type==='ready'){
  if(p.orders!==undefined){a.actions=(a.actions||0)+1;if(!empty(a.draft))a.edits=(a.edits||0)+1}
  submitAllied(r,m.battle,user.id,{round:p.round,seq:p.seq,orders:p.orders,seal:p.type==='ready'});
  if(p.type==='ready')a.sealedAt=now;
  if(r.members.every(v=>v.ready||v.ai))lock(m,now)
 }else if(p.type==='marker'){
  const recipient=p.recipient===null||p.recipient===undefined?null:seat(r,p.recipient).id;
  markAllied(r,m.battle,user.id,{round:p.round,seq:p.seq,kind:p.kind,x:p.x,y:p.y,recipient,group:p.group??null});
 }else if(p.type==='replay_done'){
  check(m.phase==='replay'&&p.round===m.completed,'stale_replay');a.replayReady=true;replayReady(m,now)
 }else if(['surrender','draw_offer','draw_accept'].includes(p.type)){
  captain(m,user);check(['planning','deployment','replay'].includes(m.phase),'cannot_end');
  if(p.type==='draw_offer')m.drawOffer=a.side;
  else{check(p.type!=='draw_accept'||m.drawOffer===1-a.side,'no_draw_offer');m.battle.result=p.type==='draw_accept'?'draw':a.side===0?'loss':'win';m.battle.resultReason=p.type==='draw_accept'?'agreement':'surrender';phase(m,'finished',now)}
 }else throw Error('unknown_action');
 a.seq=p.seq;m.updatedAt=now;return true
}
function projectUnit(F,u,exact,reported=false){
 const d=F.dims(u);
 return {id:u.id,side:u.side,type:u.type,name:u.historicalName||F.spec(u).name,x:Math.round(u.x*10)/10,y:Math.round(u.y*10)/10,a:u.a,w:d.w,d:d.d,form:u.form,n:exact?Math.round(u.n):Math.max(10,Math.round(u.n/20)*20),morale:exact?Math.round(u.morale):null,cohesion:exact?Math.round(u.cohesion):null,rout:!!u.rout,reported}
}
// Historical views use only the commander's assigned regiments, local sight and
// (for the captain) the engine's HQ reports. No allied side-wide exact feed.
export function alliedUnits(m,a,s=m.battle){
 const F=E.forState(s),h=hierarchy(s,a.side),own=new Set(scope(roster(m),s,a.id));
 if(!h)return observedUnits(s,a.side,false);
 const observers=s.units.filter(u=>u.side===a.side&&F.alive(u)&&!u.rout&&!u.pendingArrival&&(own.has(u.id)||a.captain&&u.type==='guard'));
 const out=new Map();
 if(a.captain)for(const u of observedUnits(s,a.side,false))out.set(u.id,u);
 for(const u of s.units){
  if(!F.alive(u)||u.pendingArrival)continue;
  if(own.has(u.id)||a.captain&&u.side===a.side&&u.type==='guard')out.set(u.id,projectUnit(F,u,true));
  else if(observers.some(v=>F.lineOfSight(s.terrain,v,u,F.spec(v).horse?420:300)))out.set(u.id,projectUnit(F,u,false))
 }
 return [...out.values()].sort((a,b)=>a.id-b.id)
}
function unitFrame(m,a,s){return {time:s.time,units:alliedUnits(m,a,s).map(u=>[u.id,u.side,u.type,u.x,u.y,u.a,u.w,u.d,u.n,u.morale,u.cohesion,u.rout,u.reported,u.reportedAt??null])}}
function teamSnapshot(m){
 const r=roster(m);
 return r.members.map((a,i)=>({seat:i,name:a.name,side:a.side,role:a.captain?'captain':'subordinate',groups:a.groups.slice(),scope:scope(r,m.battle,a.id),ai:a.ai,ready:a.ready,draft:clone(a.draft),actions:a.actions||0,edits:a.edits||0,planningMs:a.sealedAt===null||a.sealedAt===undefined?null:Math.max(0,a.sealedAt-m.planningStarted)}))
}
export function resolveAlliedLocked(m,now){
 const r=roster(m),s=m.battle,F=E.forState(s);
 check(m.phase==='locked'&&r.phase==='locked'&&m.lockedRound===s.round&&m.completed===s.round-1&&Array.isArray(r.locked),'round_not_locked');
 const before={...F.snapshot(s),terrain:null},orders={},history=teamSnapshot(m);
 for(const side of [0,1]){let q=r.locked[side];if(q.commands)orders[side===0?'__historical':'__enemyHistorical']=q.commands.map(v=>({...v,manual:true}));else Object.assign(orders,q)}
 const next=F.snapshot(s),frames=[[],[],[]],seatFrames={};
 const historical=!!s.commandHierarchy;
 if(historical)for(const [i] of r.members.entries())seatFrames[i]=[];
 const capture=()=>{frames[2].push(compactFrame(next,0,true));if(historical){for(const [i,a] of r.members.entries())seatFrames[i].push(unitFrame(m,a,next))}else for(const side of [0,1])frames[side].push(compactFrame(next,side))};
 const start=performance.now();F.prepare(next,orders);capture();
 for(let i=0;i<F.STEPS&&!next.result;i++){F.step(next);if(i%4===3||next.result)capture()}
 if(next.fog)F.refreshVisibility(next);next.round++;
 m.battle=next;m.completed=m.lockedRound;m.lockedRound=null;completeAllied(r);
 for(const a of r.members){a.ready=false;a.replayReady=false;a.draft={}}
 phase(m,next.result?'finished':'replay',now,next.result?0:m.rules.replaySeconds);
 return {number:m.completed,before,orders,after:{...F.snapshot(next),terrain:null},frames,seatFrames,alliedOrders:history,markers:r.markers.filter(v=>v.round===m.completed).map(v=>({from:r.members.findIndex(a=>a.id===v.from),recipient:v.recipient===null?null:r.members.findIndex(a=>a.id===v.recipient),kind:v.kind,x:v.x,y:v.y,group:v.group,side:v.side})),computeMs:performance.now()-start}
}
export function viewAlliedMatch(m,user,now,{terrain=false}={}){
 const r=roster(m),a=member(m,user),index=r.members.indexOf(a),s=m.battle,own=new Set(scope(r,s,a.id)),h=hierarchy(s,a.side);
 const players=[0,1].map(side=>{let t=r.members.filter(v=>v.side===side);return {id:t.find(v=>v.captain)?.id??'ai-'+side,name:t.length?t.map(v=>v.name).join(' / '):r.capacity[side]?'Ожидаются командиры':'Штаб ИИ'}});
 players[a.side].id=a.id;
 const accepted=teamsReady(r,'accepted'),ready=teamsReady(r,m.phase==='replay'?'replayReady':'ready');
 accepted[a.side]=a.accepted;ready[a.side]=a.ai||(m.phase==='replay'?a.replayReady:a.ready);
 const base=viewMatch({...m,players,accepted,ready,draft:[{},{}],seq:[0,0]},user,now,{terrain});
 base.nextSeq=a.seq+1;base.draft=m.phase==='planning'?clone(a.draft):{};
 base.units=finishedReveal(m)?observedUnits(s,a.side,true):m.phase==='lobby'||m.phase==='deployment'?observedUnits(s,a.side,true).filter(u=>u.side===a.side):alliedUnits(m,a);
 const team=commandRosterView(r,s,a.id);team.revision=sideRevision(r,a.side);team.seat=index;team.capacity=r.capacity.slice();team.full=full(r);team.assigned=assigned(m);team.canAccept=team.full&&team.assigned&&!a.accepted;
 team.readyCount=r.members.filter(v=>v.side===a.side&&(v.ai||(m.phase==='replay'?v.replayReady:v.ready))).length;
 team.members=team.members.map(v=>({...v,accepted:r.members[v.seat].accepted,ready:h&&!v.self&&m.phase!=='lobby'?undefined:(m.phase==='replay'?r.members[v.seat].replayReady:r.members[v.seat].ready)}));
 if(h)team.markers=team.markers.filter(v=>v.own||v.round<r.round); // historic dispatch arrives next planning round
 const known=new Map(base.nodes.map(n=>[n.id,n])),F=E.forState(s);
 base.nodes=nodes(s,a.side).map(n=>{
  const permitted=n.ids.every(id=>own.has(id)),owner=r.members.find(v=>v.side===a.side&&n.ids.every(id=>scope(r,s,v.id).includes(id)));
  const view={id:n.id,parent:n.parent,level:n.level,name:n.name,ids:n.ids.slice(),permitted,ownerSeat:owner?r.members.indexOf(owner):null};
  if(!h||permitted){const us=base.units.filter(u=>n.ids.includes(u.id));if(us.length)view.report={time:s.time,x:us.reduce((sum,u)=>sum+u.x,0)/us.length,y:us.reduce((sum,u)=>sum+u.y,0)/us.length,units:us.length}}
  else if(a.captain&&known.get(n.id)?.report)view.report=known.get(n.id).report;
  if(a.captain&&known.get(n.id)?.packet)view.packet=known.get(n.id).packet;
  return view
 });
 base.allied=team;base.allied.aiPolicy=m.aiPolicy;return base
}
export function viewAlliedRound(m,user,row,personal){
 const a=member(m,user),full=finishedReveal(m),historical=!!hierarchy(m.battle,a.side);
 check(row&&row.number<=m.completed,'round_unavailable');
 if(full)return {number:row.number,frames:row.frames[2],before:row.before,after:row.after,orders:row.orders,computeMs:row.computeMs,terrain:m.project.terrain,engine:m.engine,alliedOrders:row.alliedOrders,markers:row.markers};
 const frames=historical?personal:row.frames[a.side];check(Array.isArray(frames),'round_unavailable');return {number:row.number,frames}
}
export function alliedRoomSummary(m,user){const a=member(m,user);return {id:m.id,title:m.project.title+' · '+roster(m).format,phase:m.phase,round:m.battle.round,side:a.side,ready:m.phase==='replay'?a.replayReady:a.ready,deadline:m.deadline,result:m.battle.result||null,updatedAt:m.updatedAt}}
export function alliedRematchSource(m,user){
 const a=member(m,user);check(m.phase==='finished','match_not_finished');
 // Keep the same scenario and format, but new room identity and fresh allocation.
 return {project:m.project,mode:m.rules.mode,planSeconds:m.rules.planSeconds,fallback:m.rules.fallback,deployment:m.rules.deployment,reveal:m.rules.reveal,alliedFormat:roster(m).format,aiPolicy:m.aiPolicy}
}
