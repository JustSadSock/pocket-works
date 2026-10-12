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
 return {...o,jab:raw.jab===true,parry:raw.parry===true,dash:raw.dash===true};
}
export const NO_INPUT={mx:0,my:0,ax:0,ay:-1,jab:false,parry:false,dash:false};
export function spawn(i){
 return {x:180,y:i?167:367,vx:0,vy:0,a:i?Math.PI/2:-Math.PI/2,
  jab:0,attackCd:0,parry:0,parryCd:0,dash:0,dashCd:0,stagger:0,riposte:0,
  slash:0,step:0,immunity:0,hit:false};
}
export function createDuel(){
 return {phase:'battle',fighters:[spawn(0),spawn(1)],scores:[0,0],winner:null,
  elapsed:0,roundTime:47,round:1,freeze:0,eventId:0,event:null,revision:0,exchanges:0};
}
export const copyDuel=s=>structuredClone(s);
export function bound(f){
 let dx=(f.x-FIELD.cx)/FIELD.rx,dy=(f.y-FIELD.cy)/FIELD.ry;
 const r=Math.hypot(dx,dy);
 if(r>0.91){f.x=FIELD.cx+dx/r*FIELD.rx*.91;f.y=FIELD.cy+dy/r*FIELD.ry*.91;
  f.vx*=.28;f.vy*=.28;}
}
export function tip(f){
 const extend=f.jab>0&&f.jab<.215?19*Math.sin(Math.PI*clamp((.215-f.jab)/.215,0,1)):0;
 const reach=63+extend;
 return {x:f.x+Math.cos(f.a)*reach,y:f.y+Math.sin(f.a)*reach};
}
function pointSegment(px,py,ax,ay,bx,by){
 const vx=bx-ax,vy=by-ay,s=clamp(((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy||1),0,1);
 return length(px-(ax+vx*s),py-(ay+vy*s));
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
 const bladesBefore=s.fighters.map(f=>tip(f));
 for(let i=0;i<2;i++){
  const f=s.fighters[i],v=ins[i];
  for(const k of ['attackCd','parry','parryCd','dash','dashCd','stagger','riposte','immunity','slash'])f[k]=Math.max(0,f[k]-dt);
  if(f.jab>0)f.jab=Math.max(0,f.jab-dt);
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
  const moveSpeed=f.stagger>0?22:f.dash>0?0:f.jab>0?68:f.parry>0?72:186;
  const wantX=dx*moveSpeed+(attackActive?Math.cos(f.a)*thrust:0);
  const wantY=dy*moveSpeed+(attackActive?Math.sin(f.a)*thrust:0);
  const smooth=f.dash>0?.10:Math.min(1,dt*18);
  f.vx+=(wantX-f.vx)*smooth;f.vy+=(wantY-f.vy)*smooth;
  f.x+=f.vx*dt;f.y+=f.vy*dt;
  f.step+=length(f.vx,f.vy)*dt;
  bound(f);
 }
 const [a,b]=s.fighters;
 const d=length(a.x-b.x,a.y-b.y);
 if(d<27&&d>.0001){
  const ux=(a.x-b.x)/d,uy=(a.y-b.y)/d;
  a.x+=ux*(27-d)*.5;a.y+=uy*(27-d)*.5;
  b.x-=ux*(27-d)*.5;b.y-=uy*(27-d)*.5;
  bound(a);bound(b);
 }
 const candidates=[];
 for(let i=0;i<2;i++){
  const attacker=s.fighters[i],defender=s.fighters[1-i];
  if(attacker.jab<=.065||attacker.jab>=.225||attacker.hit||attacker.stagger>0)continue;
  const previous=bladesBefore[i],current=tip(attacker),old=before[1-i];
  const hit=pointSegment(defender.x,defender.y,previous.x,previous.y,current.x,current.y)<15.5||
    pointSegment(defender.x,defender.y,attacker.x,attacker.y,current.x,current.y)<15.5||
    length(current.x-defender.x,current.y-defender.y)<15.5||
    length(current.x-old.x,current.y-old.y)<15.5;
  if(!hit||defender.immunity>0)continue;
  const incoming=angle(attacker.x-defender.x,attacker.y-defender.y);
  const guarded=defender.parry>0&&defender.stagger<=0&&Math.abs(delta(defender.a,incoming))<.75;
  if(guarded){
   attacker.hit=true;attacker.jab=0;attacker.stagger=.30;attacker.vx=-Math.cos(attacker.a)*105;attacker.vy=-Math.sin(attacker.a)*105;
   defender.riposte=.48;defender.parry=0;defender.attackCd=0;
   event(s,'parry',1-i,defender.x,defender.y);
  }else candidates.push(i);
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
 const danger=op.jab>.07&&op.jab<.185&&dist<104;
 const facing=Math.abs(delta(f.a,heading))<.55;
 const parry=danger&&f.parryCd<=0&&f.jab<=0&&facing&&tier>0&&Math.sin(phase*7.3)>.05;
 const jab=dist<102&&dist>34&&f.attackCd<=0&&f.jab<=0&&f.stagger<=0&&
  (f.riposte>0||((Math.sin(s.elapsed*5.2+phase*2.1)>.56)&&op.parry<.05));
 const dash=(dist<57&&op.jab>.14&&f.dashCd<=0&&Math.sin(s.elapsed*13)>.3);
 return inputOf({mx,my,ax:Math.cos(heading),ay:Math.sin(heading),jab,parry,dash})||NO_INPUT;
}
