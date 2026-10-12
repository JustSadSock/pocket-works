// @ts-nocheck
import type { PocketModule } from '../../../pocket-server/module-contract.js';
// KROMKA 2.0. Shared pure real-time fencing rules for PocketNet and local sparring.
// All world geometry is fixed; renderers never decide hits.
export const FIELD={w:360,h:540,cx:180,cy:267,rx:151,ry:199};
export const STEP=1/60;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angle=(x,y)=>Math.atan2(y,x);
export const delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const length=(x,y)=>Math.hypot(x,y);
export const fixed=n=>Math.round(n*1000)/1000;
export function inputOf(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const o={};
 for(const k of ['mx','my','ax','ay']){
  if(typeof raw[k]!=='number'||!Number.isFinite(raw[k])||Math.abs(raw[k])>1.01)return null;
  o[k]=Math.round(clamp(raw[k],-1,1)*100)/100;
 }
 for(const [x,y] of [['mx','my'],['ax','ay']]){
  const r=length(o[x],o[y]);
  if(r>1){o[x]=Math.trunc(o[x]/r*100)/100;o[y]=Math.trunc(o[y]/r*100)/100;}
 }
 return {...o,jab:raw.jab===true,parry:raw.parry===true,dash:raw.dash===true,guard:raw.guard===true};
}
export const NO_INPUT={mx:0,my:0,ax:0,ay:-1,jab:false,parry:false,dash:false,guard:false};
export function spawn(i){
 return {x:180,y:i?167:367,vx:0,vy:0,a:i?Math.PI/2:-Math.PI/2,
  jab:0,attackCd:0,parry:0,parryCd:0,dash:0,dashCd:0,stagger:0,riposte:0,
  slash:0,step:0,immunity:0,hit:false,guard:false,
  sx:i?166:194,sy:i?185:349,svx:0,svy:0,shieldAngle:i?Math.PI/2:-Math.PI/2,
  shieldFlash:0,bladeKick:0,clashCd:0};
}
export function createDuel(){
 return {phase:'battle',fighters:[spawn(0),spawn(1)],scores:[0,0],winner:null,
  elapsed:0,roundTime:47,round:1,freeze:0,eventId:0,event:null,revision:0,exchanges:0};
}
export const copyDuel=s=>JSON.parse(JSON.stringify(s));
export function bound(f){
 let dx=(f.x-FIELD.cx)/FIELD.rx,dy=(f.y-FIELD.cy)/FIELD.ry;
 const r=Math.hypot(dx,dy);
 if(r>0.91){f.x=FIELD.cx+dx/r*FIELD.rx*.91;f.y=FIELD.cy+dy/r*FIELD.ry*.91;
  f.vx*=.28;f.vy*=.28;}
}
export function tip(f){
 const extend=f.jab>0&&f.jab<.215?19*Math.sin(Math.PI*clamp((.215-f.jab)/.215,0,1)):0;
 const reach=63+extend,bearing=f.a+(f.bladeKick||0);
 return {x:f.x+Math.cos(bearing)*reach,y:f.y+Math.sin(bearing)*reach};
}
// The light off-hand buckler is physically tethered to the torso, never independently steered.
export function shieldOf(f){
 const bearing=f.shieldAngle??f.a,front=f.guard?24:17,side=f.guard?9:14;
 return {x:Number.isFinite(f.sx)?f.sx:f.x+Math.cos(bearing)*front-Math.sin(bearing)*side,
  y:Number.isFinite(f.sy)?f.sy:f.y+Math.sin(bearing)*front+Math.cos(bearing)*side,
  r:f.guard?16:12,angle:bearing};
}
export function bladeOf(f){
 const bearing=f.a+(f.bladeKick||0),end=tip(f);
 return {ax:f.x+Math.cos(bearing)*13,ay:f.y+Math.sin(bearing)*13,
         bx:end.x,by:end.y};
}
function pointSegment(px,py,ax,ay,bx,by){
 const vx=bx-ax,vy=by-ay,s=clamp(((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy||1),0,1);
 return length(px-(ax+vx*s),py-(ay+vy*s));
}
function segmentDistance(a,b){
 const crossing=(x,y,u,v)=> (y.x-x.x)*(v.y-u.y)-(y.y-x.y)*(v.x-u.x);
 const A={x:a.ax,y:a.ay},B={x:a.bx,y:a.by},C={x:b.ax,y:b.ay},D={x:b.bx,y:b.by};
 const r1=crossing(A,B,A,C),r2=crossing(A,B,A,D),r3=crossing(C,D,C,A),r4=crossing(C,D,C,B);
 if(r1*r2<=0&&r3*r4<=0)return 0;
 return Math.min(pointSegment(A.x,A.y,C.x,C.y,D.x,D.y),
  pointSegment(B.x,B.y,C.x,C.y,D.x,D.y),
  pointSegment(C.x,C.y,A.x,A.y,B.x,B.y),pointSegment(D.x,D.y,A.x,A.y,B.x,B.y));
}
function event(s,type,who,x,y){
 s.eventId++;s.event={id:s.eventId,type,who,x:fixed(x),y:fixed(y)};
}
export function tick(s,raw,dt=STEP){
 if(s.phase!=='battle')return s;
 const ins=raw.map(i=>inputOf(i)||NO_INPUT);
 dt=clamp(dt,.001,.042);
 s.elapsed+=dt;
 if(s.freeze>0){
  s.freeze-=dt;
  if(s.freeze<=0&&s.event?.type==='point'){
   if(Math.max(...s.scores)>=5||s.roundTime<=0){
    s.phase='finished';
    s.winner=s.scores[0]===s.scores[1]?-1:s.scores.indexOf(Math.max(...s.scores));
   }else{s.round++;s.fighters=[spawn(0),spawn(1)];}
  }
  return s;
 }
 s.roundTime=Math.max(0,s.roundTime-dt);
 const before=s.fighters.map(f=>({x:f.x,y:f.y}));
 const bladesBefore=s.fighters.map(f=>bladeOf(f));
 for(let i=0;i<2;i++){
  const f=s.fighters[i],v=ins[i];
  for(const k of ['attackCd','parry','parryCd','dash','dashCd','stagger','riposte','immunity','slash','shieldFlash','clashCd'])f[k]=Math.max(0,f[k]-dt);
  if(f.jab>0)f.jab=Math.max(0,f.jab-dt);
  f.guard=v.guard;
  f.bladeKick=(f.bladeKick||0)*Math.exp(-dt*4.2);
  if(length(v.ax,v.ay)>.14){
   const aim=angle(v.ax,v.ay);
   const turn=clamp(delta(f.a,aim),-18*dt,18*dt);
   f.a+=turn;
  }
  if(v.parry&&f.parryCd<=0&&f.jab<=0&&f.stagger<=0){
   f.parry=.17;f.parryCd=.42;f.slash=.22;
   event(s,'guard',i,f.x,f.y);
  }
  if(v.jab&&f.attackCd<=0&&f.stagger<=0&&f.dash<=0){
   f.jab=.275;f.attackCd=f.riposte>0?.275:.41;f.riposte=0;f.hit=false;f.slash=.28;
   event(s,'thrust',i,f.x,f.y);
  }
  let dx=v.mx,dy=v.my;let magnitude=length(dx,dy);
  if(magnitude>1){dx/=magnitude;dy/=magnitude;}
  if(v.dash&&f.dashCd<=0&&f.stagger<=0){
   f.dash=.17;f.dashCd=.83;f.immunity=.115;
   if(magnitude<.08){dx=-Math.sin(f.a);dy=Math.cos(f.a);}
   f.vx=dx*345;f.vy=dy*345;
   event(s,'dash',i,f.x,f.y);
  }
  const attackActive=f.jab>.065&&f.jab<.225;
  const thrust=attackActive?155:0;
  const moveSpeed=f.stagger>0?22:f.dash>0?0:f.jab>0?68:f.guard?115:f.parry>0?72:186;
  const wantX=dx*moveSpeed+(attackActive?Math.cos(f.a)*thrust:0);
  const wantY=dy*moveSpeed+(attackActive?Math.sin(f.a)*thrust:0);
  const smooth=f.dash>0?.10:Math.min(1,dt*18);
  f.vx+=(wantX-f.vx)*smooth;f.vy+=(wantY-f.vy)*smooth;
  f.x+=f.vx*dt;f.y+=f.vy*dt;
  f.step+=length(f.vx,f.vy)*dt;
  bound(f);
  // Damped spring in world space: the off-hand stays attached while lagging under acceleration.
  const shoulderX=f.x+Math.cos(f.a)*(f.guard?24:17)-Math.sin(f.a)*(f.guard?9:14);
  const shoulderY=f.y+Math.sin(f.a)*(f.guard?24:17)+Math.cos(f.a)*(f.guard?9:14);
  f.svx=clamp((f.svx+(shoulderX-f.sx)*210*dt)*Math.exp(-17*dt),-125,125);
  f.svy=clamp((f.svy+(shoulderY-f.sy)*210*dt)*Math.exp(-17*dt),-125,125);
  f.sx+=f.svx*dt;f.sy+=f.svy*dt;
  const lag=length(f.sx-shoulderX,f.sy-shoulderY);
  if(lag>6.5){f.sx=shoulderX+(f.sx-shoulderX)*6.5/lag;f.sy=shoulderY+(f.sy-shoulderY)*6.5/lag;
   f.svx*=.52;f.svy*=.52;}
  f.shieldAngle+=clamp(delta(f.shieldAngle,f.a),-8*dt,8*dt);
 }
 const [a,b]=s.fighters;
 const d=length(a.x-b.x,a.y-b.y);
 if(d<27&&d>.0001){
  const ux=(a.x-b.x)/d,uy=(a.y-b.y)/d;
  a.x+=ux*(27-d)*.5;a.y+=uy*(27-d)*.5;
  b.x-=ux*(27-d)*.5;b.y-=uy*(27-d)*.5;
  bound(a);bound(b);
 }
 // Old-school blade contact is real geometry, not a timed button-only defence.
 const swords=s.fighters.map(bladeOf);
 const candidates=[];
 for(let i=0;i<2;i++){
  const attacker=s.fighters[i],defender=s.fighters[1-i];
  const previous=bladesBefore[i],current=swords[i],other=swords[1-i];
  const clash=segmentDistance(current,other)<5.4||
    pointSegment(current.bx,current.by,other.ax,other.ay,other.bx,other.by)<5.4||
    pointSegment(previous.bx,previous.by,other.ax,other.ay,other.bx,other.by)<5.4;
  const active=attacker.jab>.065&&attacker.jab<.225&&!attacker.hit&&attacker.stagger<=0;
  if(clash&&attacker.clashCd<=0&&defender.clashCd<=0&&
   (active||defender.jab>.02||length(attacker.vx,attacker.vy)>75)){
   const swing=delta(attacker.a,defender.a);
   const beat=active&&defender.jab<=0&&defender.parry<=0&&!defender.guard;
   const sign=Math.sin(swing)>=0?1:-1;
   attacker.bladeKick=clamp(attacker.bladeKick+sign*(beat?-.08:.17),-.68,.68);
   defender.bladeKick=clamp(defender.bladeKick-sign*(beat?.85:.2),-.96,.96);
   attacker.clashCd=.2;defender.clashCd=.2;
   event(s,'bind',i,(current.bx+other.bx)/2,(current.by+other.by)/2);
  }
  if(!active)continue;
  const old=before[1-i],bladeTip=tip(attacker);
  const bodyHit=pointSegment(defender.x,defender.y,previous.bx,previous.by,bladeTip.x,bladeTip.y)<15.5||
    pointSegment(defender.x,defender.y,current.ax,current.ay,current.bx,current.by)<15.5||
    length(bladeTip.x-defender.x,bladeTip.y-defender.y)<15.5||
    length(bladeTip.x-old.x,bladeTip.y-old.y)<15.5;
  const incoming=angle(attacker.x-defender.x,attacker.y-defender.y);
  const front=Math.abs(delta(defender.a,incoming));
  const timedParry=defender.parry>0&&defender.stagger<=0&&front<1.02&&
   length(attacker.x-defender.x,attacker.y-defender.y)<113;
  const shield=shieldOf(defender);
  const shieldContact=front<1.36&&(pointSegment(shield.x,shield.y,previous.bx,previous.by,current.bx,current.by)<shield.r+3||
   pointSegment(shield.x,shield.y,current.ax,current.ay,current.bx,current.by)<shield.r+3);
  const bladeContact=clash&&front<1.75&&(defender.guard||defender.parry>0||defender.jab>.03);
  const protectedBy=timedParry?'parry':shieldContact?'shield':bladeContact?'bind':null;
  if(protectedBy){
   attacker.hit=true;attacker.jab=0;attacker.stagger=protectedBy==='parry'?.26:.13;
   attacker.vx-=Math.cos(attacker.a)*70;attacker.vy-=Math.sin(attacker.a)*70;
   attacker.bladeKick=clamp(attacker.bladeKick+(i===0?.31:-.31),-.58,.58);
   if(protectedBy==='parry'){defender.riposte=.48;defender.parry=0;defender.attackCd=0;}
   if(protectedBy==='shield'){
    defender.shieldFlash=.21;
    defender.svx+=(attacker.x-defender.x)*.18;
    defender.svy+=(attacker.y-defender.y)*.18;
   }
   event(s,protectedBy,1-i,protectedBy==='shield'?shield.x:defender.x,protectedBy==='shield'?shield.y:defender.y);
  }else if(bodyHit&&defender.immunity<=0)candidates.push(i);
 }
 if(candidates.length){
  const simultaneous=candidates.length===2;
  if(!simultaneous){const side=candidates[0];s.scores[side]++;event(s,'point',side,s.fighters[1-side].x,s.fighters[1-side].y);}
  else event(s,'double',-1,(a.x+b.x)/2,(a.y+b.y)/2);
  s.exchanges++;s.freeze=.62;
  for(const who of candidates)s.fighters[who].hit=true;
 }
 if(s.roundTime<=0&&s.freeze<=0){
  s.phase='finished';s.winner=s.scores[0]===s.scores[1]?-1:s.scores.indexOf(Math.max(...s.scores));
 }
 return s;
}
export function aiInput(s,tier=1){
 const f=s.fighters[1],op=s.fighters[0],dx=op.x-f.x,dy=op.y-f.y,dist=length(dx,dy);
 const heading=angle(dx,dy),phase=Math.floor(s.elapsed*1.4),sway=Math.sin(s.elapsed*2.9+phase*.7);
 const desired=dist>89?1:dist<54?-.92:0;
 const strafe=(phase%4<2?1:-1)*(.38+sway*.17);
 let mx=Math.cos(heading)*desired-Math.sin(heading)*strafe;
 let my=Math.sin(heading)*desired+Math.cos(heading)*strafe;
 if(length(mx,my)>1){const l=length(mx,my);mx/=l;my/=l;}
 // A finite, visible reaction window avoids impossible instant AI parries.
 const danger=op.jab>.14&&op.jab<.27&&dist<116;
 const facing=Math.abs(delta(f.a,heading))<.55;
 const parry=danger&&f.parryCd<=0&&f.jab<=0&&facing&&tier>0&&Math.sin(phase*7.3)>-.2;
 const jab=dist<102&&dist>34&&f.attackCd<=0&&f.jab<=0&&f.stagger<=0&&
  (f.riposte>0||((Math.sin(s.elapsed*5.2+phase*2.1)>.56)&&op.parry<.05));
 const dash=(dist<57&&op.jab>.14&&f.dashCd<=0&&Math.sin(s.elapsed*13)>.3);
 return inputOf({mx,my,ax:Math.cos(heading),ay:Math.sin(heading),jab,parry,dash})||NO_INPUT;
}

export const MIN_PLAYERS=2;
export const RULESET_VERSION=3;
const stateEvent=s=>[{type:'state',payload:s}];
const warning=(to,message)=>[{type:'notice',to,payload:message}];
function wake(s){
 if(s.phase!=='battle')return;
 const now=Date.now(),dt=Math.min(.22,Math.max(0,(now-s.clock)/1000));
 s.clock=now;
 let remaining=dt;
 while(remaining>0){
  const duration=Math.min(STEP,remaining);
  const inputs=s.inputs.map((v,i)=>(now-s.lastSeen[i]>420?{...NO_INPUT,ax:v.ax,ay:v.ay}:v));
  tick(s.duel,inputs,duration);
  // Discrete actions are consumed once, regardless of server tick rate.
  s.inputs=s.inputs.map(v=>({...v,jab:false,dash:false,parry:false}));
  remaining-=duration;
  if(s.duel.phase==='finished'){s.phase='finished';break;}
 }
}
function begin(s){
 s.phase='battle';s.duel=createDuel();
 s.inputs=[{...NO_INPUT},{...NO_INPUT,ay:1}];s.seq=[-1,-1];
 s.lastSeen=[Date.now(),Date.now()];s.clock=Date.now();s.revision++;
}
const module: PocketModule<any>={
 protocolVersion:1,
 createRoom({player}){
  return {state:{phase:'lobby',host:player.id,players:[player],duel:null,revision:0,
   inputs:[{...NO_INPUT},{...NO_INPUT,ay:1}],seq:[-1,-1],clock:0,lastSeen:[0,0]}};
 },
 onJoin({state,players}){
  if(players.length>2)throw Error('room_full');
  if(state.phase!=='lobby')throw Error('match_in_progress');
  state.players=players;state.revision++;
  return {state,events:stateEvent(state)};
 },
 onLeave({state,player,players}){
  const side=state.players.findIndex(p=>p.id===player.id);
  if(state.phase==='battle'&&side>=0){
   state.duel.scores[1-side]=5;
   state.duel.winner=1-side;state.duel.phase='finished';
   state.phase='finished';state.revision++;
  }
  if(state.phase==='lobby')state.players=players;
  if(state.host===player.id)state.host=players[0]?.id||'';
  return {state,events:stateEvent(state)};
 },
 onMessage({state,player,payload}){
  const side=state.players.findIndex(p=>p.id===player.id);
  if(side<0)return {state,events:warning(player.id,'Нет места в этой дуэли.')};
  const raw=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  wake(state);
  if(raw.type==='start'||raw.type==='again'){
   const valid=raw.type==='start'&&state.phase==='lobby'||raw.type==='again'&&state.phase==='finished';
   if(!valid||state.host!==player.id||state.players.length!==2)
    return {state,events:warning(player.id,'Начать или повторить дуэль может хозяин при двух игроках.')};
   begin(state);return {state,events:stateEvent(state)};
  }
  if(raw.type==='sync')return {state,events:[{type:'state',to:player.id,payload:state}]};
  if(raw.type==='input'&&state.phase==='battle'){
   const seq=raw.seq,input=inputOf(raw.input);
   if(!Number.isSafeInteger(seq)||seq<0||seq>1e9||seq<=state.seq[side]||!input)
    return {state,events:[]};
   const now=Date.now();
   // Rate-limit large bursts without dropping legitimate action edges.
   if(now-state.lastSeen[side]<31&&!(input.jab||input.parry||input.dash))return {state,events:[]};
   state.seq[side]=seq;state.inputs[side]=input;state.lastSeen[side]=now;
   state.revision++;
   return {state,events:stateEvent(state)};
  }
  if(raw.type==='pulse'&&state.phase==='battle'){
   return {state,events:stateEvent(state)};
  }
  return {state,events:state.phase==='finished'?stateEvent(state):[]};
 }
};
export default module;
