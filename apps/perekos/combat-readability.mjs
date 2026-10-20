// PEREKOS v0.8 — tactical warnings from public, authoritative combat state.
// No prediction changes hitboxes or exposes runes, hidden inputs, or queued events.
import {W as WIDTH,H as HEIGHT,WALLS} from './core.mjs';
import {forgeSpellsStatus} from './forge-spells.mjs';
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const MAX_SHOTS=12,MAX_MINES=6;
const EPS=.00001;
function hitBox(x,y,vx,vy,horizon,{x:rx,y:ry,w,h},r=0){
 const left=rx-r,right=rx+w+r,top=ry-r,bottom=ry+h+r;
 let start=0,end=horizon;
 for(const [p,v,low,high] of [[x,vx,left,right],[y,vy,top,bottom]]){
  if(Math.abs(v)<EPS){if(p<low||p>high)return horizon;continue}
  let a=(low-p)/v,b=(high-p)/v;if(a>b)[a,b]=[b,a];
  start=Math.max(start,a);end=Math.min(end,b);
  if(end<start)return horizon;
 }
 return start;
}
function hitCircle(x,y,vx,vy,horizon,cx,cy,r){
 const px=x-cx,py=y-cy,speed2=vx*vx+vy*vy;
 if(px*px+py*py<=r*r)return 0;
 const half=px*vx+py*vy,disc=half*half-speed2*(px*px+py*py-r*r);
 if(disc<0||speed2<EPS)return horizon;
 const t=(-half-Math.sqrt(disc))/speed2;
 return t>=0&&t<horizon?t:horizon;
}
function travelUntilBlocked(q,state,horizon){
 const r=clamp(Number(q.r)||4,2,18);
 let t=horizon;
 for(const wall of WALLS){
  t=Math.min(t,hitBox(q.x,q.y,q.vx,q.vy,t,wall,r));
 }
 for(const b of (state.barriers||[]).slice(0,10)){
  if(finite(b.x)&&finite(b.y)&&finite(b.r)){
   t=Math.min(t,hitCircle(q.x,q.y,q.vx,q.vy,t,b.x,b.y,b.r+r));
  }
 }
 // Projectiles vanish at the actual arena borders.
 const xBound=q.vx>EPS?(WIDTH-19-q.x)/q.vx:q.vx<-EPS?(19-q.x)/q.vx:Infinity;
 const yBound=q.vy>EPS?(HEIGHT-21-q.y)/q.vy:q.vy<-EPS?(21-q.y)/q.vy:Infinity;
 return clamp(Math.min(t,xBound,yBound),0,horizon);
}
// World coordinates, never screen coordinates; returns only visible projectiles
// and already placed mines. Results are bounded and safe for untrusted snapshots.
export function combatCues(state,viewer=0){
 if(!state||state.phase!=='fight'||!Array.isArray(state.actors)||!Array.isArray(state.shots))return {shots:[],mines:[]};
 const self=state.actors[viewer===1?1:0];
 if(!self||!finite(self.x)||!finite(self.y))return {shots:[],mines:[]};
 const shots=[];
 for(const q of state.shots.slice(0,80)){
  if(q.owner===viewer||!finite(q.x)||!finite(q.y)||!finite(q.vx)||!finite(q.vy))continue;
  const speed=Math.hypot(q.vx,q.vy);if(speed<1||speed>1200)continue;
  const horizon=Math.min(.42,150/speed,finite(q.life)?Math.max(0,q.life):.42);
  const t=travelUntilBlocked(q,state,horizon);
  if(t<.015)continue;
  const ahead=clamp(((self.x-q.x)*q.vx+(self.y-q.y)*q.vy)/(speed*speed),0,t);
  const mx=q.x+q.vx*ahead,my=q.y+q.vy*ahead;
  const gap=Math.hypot(mx-self.x,my-self.y);
  const imminent=gap<12+clamp(Number(q.r)||5,2,18)+5&&ahead>.005&&ahead<.39;
  shots.push({x:q.x,y:q.y,endX:q.x+q.vx*t,endY:q.y+q.vy*t,
   impactX:mx,impactY:my,imminent,eta:ahead,gap,
   element:['fire','storm','stone'].includes(q.element)?q.element:'fire'});
 }
 shots.sort((a,b)=>Number(b.imminent)-Number(a.imminent)||a.gap-b.gap);
 const mines=[];
 for(const m of (Array.isArray(state.mines)?state.mines:[]).slice(0,32)){
  if(m.owner===viewer||!finite(m.x)||!finite(m.y)||!finite(m.r))continue;
  mines.push({x:clamp(m.x,0,WIDTH),y:clamp(m.y,0,HEIGHT),r:clamp(m.r,4,90),
   element:['fire','storm','stone'].includes(m.element)?m.element:'fire',
   distance:Math.hypot(self.x-m.x,self.y-m.y)});
 }
 mines.sort((a,b)=>a.distance-b.distance);
 return {shots:shots.slice(0,MAX_SHOTS),mines:mines.slice(0,MAX_MINES)};
}
const TONES={fire:'#f0b48e',storm:'#9fdfd8',stone:'#d1d5a9'};
export function drawGroundCues(ctx,state,viewer=0,time=0,reduced=false){
 if(!ctx)return;
 const cues=combatCues(state,viewer);
 ctx.save();
 for(const m of cues.mines){
  // Known mine trigger radius, never a fictitious explosion radius.
  ctx.globalAlpha=.58;ctx.strokeStyle=TONES[m.element];
  ctx.lineWidth=2;ctx.setLineDash([3,5]);ctx.beginPath();
  ctx.arc(m.x,m.y,m.r,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);
  for(let i=0;i<4;i++){
   const a=i*Math.PI/2;
   const x=m.x+Math.cos(a)*(m.r+3),y=m.y+Math.sin(a)*(m.r+3);
   ctx.fillStyle='#e7dfba';ctx.fillRect(Math.round(x),Math.round(y),3,3);
  }
 }
 for(const s of cues.shots){
  ctx.globalAlpha=s.imminent?(reduced?.83:.7+.18*Math.sin(time*14)**2):.26;
  ctx.lineWidth=s.imminent?3:1.4;
  ctx.strokeStyle=s.imminent?'#ffccaa':TONES[s.element];
  ctx.setLineDash(s.imminent?[5,4]:[2,8]);
  ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.endX,s.endY);ctx.stroke();
  ctx.setLineDash([]);
  if(s.imminent){
   ctx.globalAlpha=.92;ctx.strokeStyle='#fae7bf';ctx.lineWidth=2;
   ctx.beginPath();
   ctx.arc(s.impactX,s.impactY,8,Math.atan2(s.endY-s.y,s.endX-s.x)-.9,Math.atan2(s.endY-s.y,s.endX-s.x)+.9);
   ctx.stroke();
  }
 }
 ctx.restore();
}
export function drawActorCues(ctx,a,x,y,isMine,time=0,reduced=false){
 if(!ctx||!a||!finite(x)||!finite(y))return;
 ctx.save();
 // The same chevron shapes communicate player identity without relying on color.
 ctx.globalAlpha=.95;
 ctx.fillStyle=isMine?'#c4e9d5':'#e3a59b';
 if(isMine){
  ctx.fillRect(Math.round(x-9),Math.round(y+25),18,3);
  ctx.fillRect(Math.round(x-3),Math.round(y+22),6,3);
 }else{
  ctx.beginPath();ctx.moveTo(x-8,y+23);ctx.lineTo(x,y+29);ctx.lineTo(x+8,y+23);
  ctx.lineTo(x+8,y+27);ctx.lineTo(x,y+33);ctx.lineTo(x-8,y+27);ctx.closePath();ctx.fill();
 }
 const heat=clamp(finite(a.heat)?a.heat:0,0,100);
 if(heat>=62){
  // This is the genuine overload meter, not an assumed spell charge.
  const warning=heat>=85,angle=-Math.PI/2+Math.PI*2*heat/100;
  const blink=reduced?1:.8+.2*Math.sin(time*(warning?16:6))**2;
  ctx.globalAlpha=blink;
  ctx.strokeStyle='#1d2a26';ctx.lineWidth=5;ctx.beginPath();
  ctx.arc(x,y-6,29,-Math.PI/2,Math.PI*1.5);ctx.stroke();
  ctx.strokeStyle=warning?'#f6a38a':'#d7bd79';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(x,y-6,29,-Math.PI/2,angle);ctx.stroke();
  if(warning){
   ctx.fillStyle='#fff0c9';ctx.font='bold 12px monospace';ctx.textAlign='center';
   ctx.fillText('!',x+23,y-26);
  }
 }
 if((Number(a.slow)||0)>0){
  ctx.globalAlpha=.85;ctx.strokeStyle='#9bdcdb';ctx.lineWidth=2;
  for(let j=-1;j<=1;j++){ctx.beginPath();ctx.moveTo(x+j*7-2,y+17);ctx.lineTo(x+j*7+2,y+12);ctx.stroke()}
 }
 ctx.restore();
}

const LIGHT_RGB={fire:'255,172,98',storm:'157,231,214',stone:'206,212,159'};
function spill(ctx,x,y,r,rgb,strength){
 if(!finite(x)||!finite(y))return;
 const g=ctx.createRadialGradient(x,y,2,x,y,r);
 g.addColorStop(0,'rgba('+rgb+','+strength+')');
 g.addColorStop(.31,'rgba('+rgb+','+(strength*.37)+')');
 g.addColorStop(1,'rgba('+rgb+',0)');
 ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}
// A small, real-time pass over the already painted stone. Every pool is
// sourced from a visible active projectile, mine or actual actor status.
export function drawSpellLighting(ctx,state,time=0,reduced=false){
 if(!ctx||!state||state.phase!=='fight'||typeof ctx.createRadialGradient!=='function')return;
 if(forgeSpellsStatus()==='ready'){
  // One-pixel bounced light instead of a screen-blended radial gradient.
  for(const q of (state.shots||[]).slice(0,12)){
   if(!finite(q.x)||!finite(q.y))continue;
   const col=q.element==='storm'?'#73ada0':q.element==='stone'?'#9fbb8a':'#bd8152';
   ctx.fillStyle=col;ctx.globalAlpha=.28;
   ctx.fillRect(Math.round(q.x)-6,Math.round(q.y)+4,12,1);
   ctx.fillRect(Math.round(q.x)-2,Math.round(q.y)+6,4,1);
  }
  ctx.globalAlpha=1;return;
 }
 ctx.save();ctx.globalCompositeOperation='screen';
 for(const q of (Array.isArray(state.shots)?state.shots:[]).slice(0,8)){
  if(!finite(q.x)||!finite(q.y))continue;
  const kind=['fire','storm','stone'].includes(q.element)?q.element:'fire';
  const r=kind==='fire'?39:kind==='storm'?32:29;
  spill(ctx,q.x,q.y,r,LIGHT_RGB[kind],reduced?.15:.16);
 }
 for(const m of (Array.isArray(state.mines)?state.mines:[]).slice(0,5)){
  if(!finite(m.x)||!finite(m.y))continue;
  const kind=['fire','storm','stone'].includes(m.element)?m.element:'fire';
  spill(ctx,m.x,m.y,35,LIGHT_RGB[kind],reduced?.085:.08+.025*Math.sin(time*5+m.x)**2);
 }
 for(const a of (Array.isArray(state.actors)?state.actors:[]).slice(0,2)){
  if(!finite(a.x)||!finite(a.y))continue;
  if((Number(a.heat)||0)>=85)spill(ctx,a.x,a.y,43,LIGHT_RGB.fire,.105);
  else if((Number(a.cast)||0)>.12){
   const kind=a.mageId==='wire'||a.mageId==='coil'?'storm':a.mageId==='pebble'||a.mageId==='slate'?'stone':'fire';
   spill(ctx,a.x,a.y,30,LIGHT_RGB[kind],.07);
  }
 }
 ctx.restore();
}
