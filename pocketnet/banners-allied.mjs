// Allied Command protocol foundation. Not a public room endpoint until member-specific
// visibility, Durable Object persistence and browser tests are implemented.
// Reuses the immutable duel validator and hierarchy; never changes the battle engine.
import {hierarchy,validateOrders,clone} from './banners-match.mjs';
import {E} from './banners-engine-v1/engine.js';
const check=(ok,code)=>{if(!ok)throw Error(code)};
const formats=Object.freeze({'2vAI':[2,0],'2v1':[2,1],'2v2':[2,2],'3vAI':[3,0]});
const account=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const participant=(r,id)=>{let m=r.members.find(m=>m.id===id);check(m,'not_member');return m};
const captain=(r,id)=>{let m=participant(r,id);check(m.captain,'captain_required');return m};
export const nodes=(s,side)=>s.alliedTree?.[side]||hierarchy(s,side)?.nodes||[];
const sideUnits=(s,side)=>s.units.filter(u=>u.side===side&&(u.type!=='guard'||!hierarchy(s,side))).map(u=>u.id);
function selected(s,side,ids){
 check(Array.isArray(ids)&&ids.length<=32&&new Set(ids).size===ids.length,'invalid_assignment');
 let tree=nodes(s,side),used=new Set();
 for(const id of ids){let n=tree.find(n=>n.id===id);check(n&&n.level>0,'invalid_assignment');
  for(const u of n.ids){check(!used.has(u),'overlapping_assignment');used.add(u)}
 }
 return [...used].sort((a,b)=>a-b);
}
export function createAlliedRoster(format,owner){
 check(Object.hasOwn(formats,format)&&account(owner.id),'invalid_format');
 return {schema:1,format,capacity:[...formats[format]],phase:'lobby',round:0,revision:0,members:[{id:owner.id,name:String(owner.name||'Commander').slice(0,32),side:0,captain:true,groups:[],ai:false,seq:0,ready:false,draft:{}}],markers:[],locked:null};
}
export function joinAllied(r,user,side){
 check(account(user.id)&&(side===0||side===1),'invalid_member');
 const prior=r.members.find(m=>m.id===user.id);if(prior)return prior.side;
 check(r.phase==='lobby','lobby_closed');
 const team=r.members.filter(m=>m.side===side);
 check(team.length<r.capacity[side],'team_full');
 r.members.push({id:user.id,name:String(user.name||'Commander').slice(0,32),side,captain:team.length===0,groups:[],ai:false,seq:0,ready:false,draft:{}});
 r.revision++;return side
}
export function scope(r,s,id){
 let m=participant(r,id);
 const claimed=r.members.filter(a=>a.side===m.side&&!a.captain).flatMap(a=>selected(s,m.side,a.groups));
 return m.captain?sideUnits(s,m.side).filter(id=>!claimed.includes(id)):selected(s,m.side,m.groups)
}
// Assignment is a server-side transaction: validate the entire proposed allocation before mutation.
// The captain retains every unassigned regiment. No last-writer-wins combat orders.
export function allocate(r,s,actor,target,groups){
 let a=captain(r,actor),m=participant(r,target);
 check(r.phase==='lobby','assignment_frozen');
 check(!m.captain&&m.side===a.side,'invalid_assignment');
 let ids=selected(s,m.side,groups),claimed=r.members.filter(v=>v.side===m.side&&!v.captain&&v.id!==target).flatMap(v=>selected(s,m.side,v.groups));
 check(!ids.some(id=>claimed.includes(id)),'overlapping_assignment');
 m.groups=[...groups];r.revision++
}
// Mid-battle transfer is permitted only before any participant seals a round.
// No stale draft survives a reassignment, and old authorities cannot reuse a sequence.
export function transferAllied(r,s,actor,target,groups){
 let a=captain(r,actor),m=participant(r,target);
 check(r.phase==='planning'&&!r.members.some(v=>v.ready),'assignment_frozen');
 check(a.side===m.side&&!m.captain,'invalid_assignment');
 let ids=selected(s,m.side,groups),claimed=r.members.filter(v=>v.side===m.side&&!v.captain&&v.id!==target).flatMap(v=>selected(s,m.side,v.groups));
 check(ids.length&&!ids.some(id=>claimed.includes(id)),'overlapping_assignment');
 m.groups=[...groups];for(const v of r.members.filter(v=>v.side===a.side))v.draft={};
 r.revision++
}
export function handoffAllied(r,actor,target){
 let a=captain(r,actor),m=participant(r,target);
 check(r.phase==='lobby'||r.phase==='planning'&&!r.members.some(v=>v.ready),'delegation_frozen');
 check(a.id!==m.id&&a.side===m.side&&!m.ai&&m.groups.length>0,'invalid_delegation');
 a.captain=false;a.groups=[...m.groups];m.captain=true;m.groups=[];
 for(const v of r.members.filter(v=>v.side===a.side))v.draft={};
 r.revision++
}
export function beginAllied(r,s){
 check(r.phase==='lobby'||r.phase==='replay','invalid_phase');
 check(r.capacity.every((count,side)=>r.members.filter(m=>m.side===side).length===count),'team_incomplete');
 check(r.members.every(m=>m.captain||scope(r,s,m.id).length>0),'unassigned_commander');
 r.phase='planning';r.round=s.round;r.locked=null;r.markers=r.markers.filter(v=>v.round>=s.round-1);
 for(const m of r.members){m.ready=false;m.draft={}}
}
export function setAlliedAI(r,actor,target,on){
 let a=captain(r,actor),m=participant(r,target);
 check(typeof on==='boolean'&&a.side===m.side&&a.id!==m.id,'invalid_delegation');
 check(r.phase==='lobby'||r.phase==='planning'&&!r.members.some(v=>v.ready),'delegation_frozen');
 m.ai=on;m.draft={};r.revision++
}
function scopedOrders(r,s,m,input){
 let out=validateOrders(s,m.side,input),allowed=new Set(scope(r,s,m.id));
 if(out.commands){
  for(const q of out.commands){let n=nodes(s,m.side).find(n=>n.id===q.group);check(n&&n.ids.every(u=>allowed.has(u)),'outside_command')}
 }else for(const id of Object.keys(out))check(allowed.has(Number(id)),'outside_command');
 return out
}
function sequence(m,seq){check(Number.isInteger(seq)&&seq>0,'invalid_sequence');if(seq<=m.seq)return false;check(seq===m.seq+1,'sequence_gap');return true}
export function submitAllied(r,s,id,{round,seq,orders,seal=false}){
 let m=participant(r,id);if(!sequence(m,seq))return false;
 check(r.phase==='planning'&&r.round===round&&round===s.round&&!m.ready&&!m.ai,'round_locked');
 check(typeof seal==='boolean','invalid_request');
 if(orders!==undefined)m.draft=scopedOrders(r,s,m,orders);else check(seal,'invalid_orders');
 m.ready=seal;m.seq=seq;return true
}
// AI proposals are supplied only by the trusted server planner, never by a client's action.
// A deadline seals missing drafts; explicit AI delegation and full AI sides use filtered staff proposals.
export function lockAllied(r,s,{deadline=false,staff=()=>({})}={}){
 check(r.phase==='planning'&&r.round===s.round,'round_locked');
 check(deadline||r.members.every(m=>m.ready||m.ai),'not_ready');
 const merged=[{},{}];
 for(const side of [0,1]){
  const team=r.members.filter(m=>m.side===side);
  if(!team.length){check(r.capacity[side]===0,'team_incomplete');merged[side]=validateOrders(s,side,staff(side));continue}
  for(const m of team){
   let orders=m.ai||deadline&&!m.ready&&Object.keys(m.draft).length===0?staff(side,scope(r,s,m.id),m.ai):m.draft;
   // A planner may not issue a command to an overlapping ancestor; validate even trusted proposals.
   orders=scopedOrders(r,s,m,orders);
   if(orders.commands){merged[side].commands??=[];merged[side].commands.push(...orders.commands)}
   else for(const [id,order] of Object.entries(orders)){check(!Object.hasOwn(merged[side],id),'overlapping_commands');merged[side][id]=order.group?{...order,group:('seat'+r.members.indexOf(m)+'-'+order.group).slice(0,40)}:order}
  }
  if(merged[side].commands)merged[side].commands.sort((a,b)=>a.group.localeCompare(b.group));
  merged[side]=validateOrders(s,side,merged[side])
 }
 r.locked=clone(merged);r.phase='locked';return clone(merged)
}
export function completeAllied(r){check(r.phase==='locked','invalid_phase');r.phase='replay';r.locked=null}
// Map annotations carry only client-authored coordinates and an explicit audience.
// They are not observations and never disclose server-owned enemy positions.
export function markAllied(r,s,id,{round,seq,kind,x,y,recipient=null,group=null}){
 let m=participant(r,id);if(!sequence(m,seq))return false;
 check(r.phase==='planning'&&round===r.round&&!m.ai&&!m.ready,'round_locked');
 check(['intent','support','line','phase','reserve','threat','confirm'].includes(kind)&&Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=E.forState(s).W&&y<=E.forState(s).H,'invalid_marker');
 const historic=!!hierarchy(s,m.side);
 if(recipient!==null){let v=participant(r,recipient);check(v.side===m.side&&v.id!==m.id,'invalid_recipient')}
 check(!historic||recipient!==null,'direct_dispatch_required');
 check(group===null||nodes(s,m.side).some(n=>n.id===group),'invalid_assignment');
 check(r.markers.filter(v=>v.from===id&&v.round===r.round).length<12,'marker_limit');
 r.markers.push({from:id,recipient,side:m.side,kind,x,y,group,round,seq});m.seq=seq;return true
}
export function commandRosterView(r,s,id){
 const m=participant(r,id),team=r.members.filter(v=>v.side===m.side);
 return {format:r.format,phase:r.phase,round:r.round,revision:r.revision,side:m.side,role:m.captain?'captain':'subordinate',nextSeq:m.seq+1,
  scope:scope(r,s,id),draft:clone(m.draft),ready:m.ready,markers:r.markers.filter(v=>v.side===m.side&&(!v.recipient||v.from===id||v.recipient===id)).map(v=>({kind:v.kind,x:v.x,y:v.y,group:v.group,round:v.round,from:r.members.find(a=>a.id===v.from)?.name,own:v.from===id})),
  // Historical allies do not receive live remote drafts or even ready state.
  members:team.map(v=>({seat:r.members.indexOf(v),name:v.name,role:v.captain?'captain':'subordinate',groups:[...v.groups],self:v.id===id,ai:v.ai,...(!hierarchy(s,m.side)||v.id===id?{ready:v.ready}:{})}))}
}
