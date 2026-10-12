import type { PocketModule } from '../../../pocket-server/module-contract.js';

export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 1;

type Person = {id:string;name:string};
type Runner = {x:number;y:number;vx:number;vy:number;jumpUntil:number;pingUntil:number;hits:number};
type State = {phase:'lobby'|'playing'|'finished';host:string;players:Person[];runners:Record<string,Runner>;inputs:Record<string,{x:number;y:number;hold:boolean}>;level:number;unlocked:boolean;crate:{x:number;y:number}|null;clock:number;levelTime:number;clearAt:number;totalHits:number;revision:number};
type Rect = [number,number,number,number];
type Stage = {name:string;brief:string;pads:[[number,number],[number,number]];walls:Rect[];belts?:{rect:Rect;dx:number;dy:number}[];hazards?:Rect[];crate?:[number,number];cargoPad?:[number,number]};
const W=18,H=12;
const GATE:Rect=[8,4,2,.8];
const COMMON:Rect[]=[[0,4,8,.8],[10,4,8,.8]];
const STAGES:Stage[]=[
 {name:'ПЕРВАЯ СМЕНА',brief:'Займите две плиты. Каждый видит только напарника.',pads:[[3,7],[15,7]],walls:[]},
 {name:'НЕ ТУДА',brief:'Обходите ящики. Подсказывайте друг другу повороты.',pads:[[4,6.8],[13.5,9]],walls:[[5,6,1,2.7],[11.4,7.8,1,2.7],[8,9,2,.8]]},
 {name:'НЕСЁТ',brief:'Лента движется сама. Подсказывайте поправки.',pads:[[3.5,7.2],[14,7.2]],walls:[[6,6,1.1,2.4],[11,6,1.1,2.4]],belts:[{rect:[2,8,6,2.3],dx:1.35,dy:0},{rect:[10,8,6,2.3],dx:-1.35,dy:0}]},
 {name:'ТЯЖЁЛАЯ РАБОТА',brief:'Удерживайте E рядом с ящиком. Поставьте его на ромб.',pads:[[3,7],[15,7]],walls:[[5,6,1,1.5],[12,6,1,1.5]],crate:[8,9],cargoPad:[9,7]},
 {name:'ПРЕСС',brief:'Прыжок на Space спасает от пресса.',pads:[[3,7],[15,7]],walls:[[7,6,1,1.8],[10,6,1,1.8]],hazards:[[5,9,3,1],[10,9,3,1]]},
 {name:'ПОСЛЕДНИЙ ЗАКАЗ',brief:'Лента, пресс и общий груз. Работайте вместе.',pads:[[3,7],[15,7]],walls:[[5,6,1,2],[12,6,1,2]],belts:[{rect:[2,9,5,1.5],dx:1,dy:0},{rect:[11,9,5,1.5],dx:-1,dy:0}],hazards:[[7.3,7,3.4,.8]],crate:[9,9.3],cargoPad:[9,6.3]}
];
const now=()=>Date.now();
const range=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const near=(a:{x:number;y:number},b:{x:number;y:number},r:number)=>Math.hypot(a.x-b.x,a.y-b.y)<=r;
const inside=(p:{x:number;y:number},r:Rect,rad:number)=>p.x+rad>r[0]&&p.x-rad<r[0]+r[2]&&p.y+rad>r[1]&&p.y-rad<r[1]+r[3];
const stage=(s:State)=>STAGES[s.level];
const active=(s:State)=>[...COMMON,...stage(s).walls,...(!s.unlocked?[GATE]:[])];
const blocked=(s:State,p:{x:number;y:number},rad=.31,checkCrate=true)=>{
 if(p.x<.52||p.x>W-.52||p.y<.52||p.y>H-.52)return true;
 if(active(s).some(r=>inside(p,r,rad)))return true;
 return checkCrate&&!!s.crate&&near(p,s.crate,.66);
};
const serialize=(s:State)=>({phase:s.phase,host:s.host,players:s.players,runners:s.runners,level:s.level,levelCount:STAGES.length,unlocked:s.unlocked,crate:s.crate,elapsed:now()-s.levelTime,clearAt:s.clearAt,totalHits:s.totalHits,revision:s.revision,stage:stage(s)});
const events=(s:State)=>[{type:'state',payload:serialize(s)}];
const notice=(id:string,message:string)=>[{type:'notice',to:id,payload:message}];
function setup(s:State,index:number){
 s.level=index;s.phase='playing';s.unlocked=false;s.crate=stage(s).crate?{x:stage(s).crate![0],y:stage(s).crate![1]}:null;
 s.clock=now();s.levelTime=s.clock;s.clearAt=0;s.inputs={};
 s.players.forEach((p,i)=>{s.runners[p.id]={x:i?15:3,y:10,vx:0,vy:0,jumpUntil:0,pingUntil:0,hits:s.runners[p.id]?.hits||0};s.inputs[p.id]={x:0,y:0,hold:false}});
 s.revision++;
}
function moveCrate(s:State,dx:number,dy:number):boolean{
 const c=s.crate;if(!c)return false;
 const next={x:c.x+dx,y:c.y+dy};
 if(blocked(s,next,.43,false))return false;
 c.x=next.x;c.y=next.y;return true;
}
function moveAxis(s:State,p:Runner,axis:'x'|'y',delta:number,hold:boolean){
 if(Math.abs(delta)<.00001)return;
 const next={x:p.x,y:p.y};next[axis]+=delta;
 if(s.crate&&near(next,s.crate,.67)&&hold){
  const pushed=axis==='x'?moveCrate(s,delta,0):moveCrate(s,0,delta);
  if(!pushed){p[axis==='x'?'vx':'vy']=0;return;}
 }
 if(blocked(s,next,.30)){p[axis==='x'?'vx':'vy']=0;return;}
 p[axis]=next[axis];
}
function simulate(s:State,dt:number,t:number){
 const stageDef=stage(s);
 if(s.clearAt){if(t>=s.clearAt){if(s.level===STAGES.length-1){s.phase='finished';s.clearAt=0;}else setup(s,s.level+1);}return;}
 for(const [i,person] of s.players.entries()){
  const p=s.runners[person.id],ctl=s.inputs[person.id]||{x:0,y:0,hold:false};
  if(!p)continue;
  const mag=Math.hypot(ctl.x,ctl.y)||1;
  const tx=ctl.x/mag*3.65,ty=ctl.y/mag*3.65;
  const eased=Math.min(1,dt*14);
  p.vx+=(tx-p.vx)*eased;p.vy+=(ty-p.vy)*eased;
  let dx=p.vx*dt,dy=p.vy*dt;
  for(const belt of stageDef.belts||[])if(inside(p,belt.rect,.14)){dx+=belt.dx*dt;dy+=belt.dy*dt;}
  // Collision is separated per axis to allow sliding along walls.
  moveAxis(s,p,'x',dx,ctl.hold);moveAxis(s,p,'y',dy,ctl.hold);
  const dangerous=(stageDef.hazards||[]).some((r,j)=>inside(p,r,.26)&&((t-s.levelTime+j*330)%2600)<1420);
  if(dangerous&&p.jumpUntil<t){
   p.hits++;s.totalHits++;p.x=i?15:3;p.y=10;p.vx=0;p.vy=0;
  }
 }
 const [a,b]=stageDef.pads;
 const roles=s.players.map(p=>s.runners[p.id]).filter(Boolean);
 const padsHeld=roles.length===2&&((near(roles[0],{x:a[0],y:a[1]},.66)&&near(roles[1],{x:b[0],y:b[1]},.66))||(near(roles[1],{x:a[0],y:a[1]},.66)&&near(roles[0],{x:b[0],y:b[1]},.66)));
 const crateHeld=!stageDef.cargoPad||(s.crate&&near(s.crate,{x:stageDef.cargoPad[0],y:stageDef.cargoPad[1]},.59));
 if(padsHeld&&crateHeld)s.unlocked=true;
 if(s.unlocked&&roles.length===2&&roles.every(p=>near(p,{x:9,y:2.35},1.25)))s.clearAt=t+1550;
}
const module:PocketModule<State>={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,players:[player],runners:{},inputs:{},level:0,unlocked:false,crate:null,clock:now(),levelTime:now(),clearAt:0,totalHits:0,revision:0}};},
 onJoin({state,player,players}){
  if(players.length>2)throw Error('room_full');
  if(state.phase==='playing')throw Error('match_in_progress');
  state.players=players;
  return {state,events:events(state)};
 },
 onLeave({state,player,players}){
  if(state.phase==='playing'){state.phase='lobby';state.level=0;state.unlocked=false;state.clearAt=0;}
  state.players=players;delete state.runners[player.id];delete state.inputs[player.id];
  if(state.host===player.id)state.host=players[0]?.id||'';
  return {state,events:events(state)};
 },
 onMessage({state,player,players,payload}){
  const data=(payload&&typeof payload==='object'?payload:{}) as Record<string,unknown>;
  if(!state.players.some(p=>p.id===player.id))return {state,events:notice(player.id,'Нет места в комнате.')};
  if(data.type==='sync')return {state,events:[{type:'state',to:player.id,payload:serialize(state)}]};
  if(data.type==='start'||data.type==='again'){
   if(state.host!==player.id||state.players.length!==2||players.length!==2)return {state,events:notice(player.id,'Нужны два подключённых игрока.')};
   if(data.type==='start'&&state.phase!=='lobby'||data.type==='again'&&state.phase!=='finished')return {state,events:notice(player.id,'Действие сейчас недоступно.')};
   sStart: {state.totalHits=0;state.runners={};setup(state,0);}
   return {state,events:events(state)};
  }
  if(state.phase!=='playing')return {state,events:[]};
  if(data.type==='input'){
   const vx=Number(data.x),vy=Number(data.y);
   if(!Number.isFinite(vx)||!Number.isFinite(vy)||Math.abs(vx)>1||Math.abs(vy)>1||typeof data.hold!=='boolean')return {state,events:[]};
   const t=now(),p=state.runners[player.id];
   if(!p)return {state,events:[]};
   state.inputs[player.id]={x:vx,y:vy,hold:data.hold};
   if(data.jump===true&&p.jumpUntil<t)p.jumpUntil=t+650;
   if(data.ping===true&&p.pingUntil<t)p.pingUntil=t+800;
   let remaining=range((t-state.clock)/1000,0,.16);
   while(remaining>0){const step=Math.min(remaining,1/45);simulate(state,step,t);remaining-=step;}
   state.clock=t;state.revision++;
   return {state,events:events(state)};
  }
  return {state,events:[]};
 }
};
export default module;
