import {forgeSpellsStatus} from './forge-spells.mjs';
// PEREKOS — kinetic ink, grit and directional spell language.
// Cosmetic only. All marks originate in actual shots, hit events or casts.
import {mage} from './mages.mjs';
import {previewAttack} from './core.mjs';
const TAU=Math.PI*2;
const schemes={
 fire:['#fff0b4','#f7ab70','#9e5841'],
 storm:['#edffdf','#8bd9d0','#477d86'],
 stone:['#f0e6b8','#b1c19d','#748775']
};
const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function hash(seed){let x=(seed|0)^0x9e3779b9;x=Math.imul(x^x>>>16,0x21f0aaad);x=Math.imul(x^x>>>15,0x735a2d97);return ((x^x>>>15)>>>0)/4294967296}
function stroke(ctx,x,y,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}
function palette(actor){return schemes[mage(actor?.mageId).school]||schemes.fire}
export class DuelFeedback{
 constructor(){this.last=0;this.particles=[];this.scars=[];this.round=0}
 ingest(state,reduced=false){
  if(!state||state.phase!=='fight'){this.particles.length=0;this.scars.length=0;this.last=0;return}
  if(state.serial<this.last||state.round!==this.round){this.particles.length=0;this.scars.length=0;this.last=0;this.round=state.round}
  for(const f of state.fx||[]){
   if(!Number.isFinite(f.id)||f.id<=this.last)continue;
   const contact=state.actors.reduce((best,a)=>!best||Math.hypot(a.x-f.x,a.y-f.y)<Math.hypot(best.x-f.x,best.y-f.y)?a:best,null);
   const colors=palette(contact),impact=f.k==='hit'||f.k.startsWith('impact_')||f.k.startsWith('react_')||f.k==='overload'||f.k==='phase_entry'||f.k==='phase_exit'||f.k==='ricochet';
   if(impact){
    const type=f.k.includes('rock')||f.k.includes('crack')?'stone':f.k.includes('arc')||f.k.includes('bolt')||f.k.includes('steam')?'storm':f.k.includes('flame')||f.k.includes('orb')||f.k.includes('slag')?'fire':mage(contact?.mageId).school;
    this.scars.push({x:f.x,y:f.y,age:0,life:f.k==='overload'?2.8:1.7,kind:type,seed:f.id});
   }
   const n=reduced?0:f.k==='shoot'?6:impact?10:f.k==='dash'?6:f.k==='shield'?5:0;
   for(let i=0;i<n;i++){
    const angle=TAU*hash(f.id*97+i*331),speed=(14+hash(f.id*541+i*37)*82)*(f.k==='shoot'?.65:1);
    const life=.22+hash(f.id+i*729)*.45;
    this.particles.push({x:f.x,y:f.y,ox:f.x,oy:f.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-13,
     life,age:0,size:i%4===0?4:2,color:colors[i%3],kind:f.k,seed:i});
   }
  }
  this.last=Math.max(this.last,state.serial||0);
  if(this.particles.length>72)this.particles.splice(0,this.particles.length-72);
  if(this.scars.length>24)this.scars.splice(0,this.scars.length-24);
 }
 advance(dt,reduced=false){
  dt=clip(dt||0,0,.065);
  for(const p of this.particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.92;p.vy+=dt*(p.kind==='shoot'?-32:75)}
  for(const s of this.scars)s.age+=dt;
  this.particles=this.particles.filter(p=>p.age<p.life);
  this.scars=this.scars.filter(s=>s.age<s.life);
  if(reduced)this.particles.length=0;
 }
 ground(ctx,reduced=false){
  if(!ctx)return;
  ctx.save();
  for(const s of this.scars){
   const alpha=(1-s.age/s.life)*.6;
   ctx.globalAlpha=alpha;
   if(s.kind==='stone'){
    stroke(ctx,s.x-15,s.y-2,s.x+7,s.y+4,'#d3d6a5',2);
    stroke(ctx,s.x+7,s.y+4,s.x+17,s.y-7,'#2c483e',3);
    stroke(ctx,s.x-4,s.y-1,s.x-6,s.y+11,'#c3c2a0',1.5);
    stroke(ctx,s.x+6,s.y+3,s.x+13,s.y+13,'#6c8470',1.5);
   }else if(s.kind==='storm'){
    ctx.strokeStyle='#a4dcc8';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(s.x,s.y,11,5,0,0,TAU);ctx.stroke();
    stroke(ctx,s.x-15,s.y,s.x-9,s.y-6,'#e0f3c9',2);
    stroke(ctx,s.x+8,s.y+4,s.x+16,s.y-3,'#a4dcc8',2);
   }else{
    ctx.fillStyle='#2a3229';ctx.beginPath();ctx.ellipse(s.x,s.y,12,6,0,0,TAU);ctx.fill();
    ctx.strokeStyle='#b17950';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,9,-Math.PI*.9,-.1);ctx.stroke();
    ctx.fillStyle='#e6a06b';ctx.fillRect(Math.round(s.x-2),Math.round(s.y+3),3,2);
   }
  }
  ctx.restore();
 }
 actors(ctx,state,time=0,reduced=false){
  if(!ctx||state?.phase!=='fight')return;
  if(forgeSpellsStatus()==='ready')return; // Native cast glyphs replace duplicate beams.
  ctx.save();
  for(const a of state.actors){
   if(!a||a.cast<=0)continue;
   const school=mage(a.mageId).school,colors=palette(a),reload=.56*mage(a.mageId).reload;
   const progress=clip(1-a.cast/reload,0,1),strength=clip(1-progress*3,0,1);
   if(strength<=.005)continue;
   const dx=Math.cos(a.face),dy=Math.sin(a.face),nx=-dy,ny=dx;
   ctx.globalAlpha=reduced?.65:strength;
   const sx=a.x+dx*12,sy=a.y+dy*12;
   if(school==='fire'){
    ctx.fillStyle=colors[1];
    for(let i=0;i<3;i++){
     const along=12+i*8+progress*13,off=(i-1)*6;
     ctx.fillRect(Math.round(sx+dx*along+nx*off),Math.round(sy+dy*along+ny*off),6-i,5-i);
    }
    stroke(ctx,sx,sy,sx+dx*34,sy+dy*34,colors[0],3);
   }else if(school==='storm'){
    const jitter=reduced?0:Math.sin(time*45+a.id*11)*3;
    for(const side of [-1,1]){
     stroke(ctx,sx+nx*side*5,sy+ny*side*5,sx+dx*14+nx*(side*9+jitter),sy+dy*14+ny*(side*9+jitter),colors[2],3);
     stroke(ctx,sx+dx*14+nx*(side*9+jitter),sy+dy*14+ny*(side*9+jitter),sx+dx*33+nx*side*2,sy+dy*33+ny*side*2,colors[0],2);
    }
   }else{
    const reach=24+progress*12;
    stroke(ctx,sx+nx*10,sy+ny*10,sx+dx*reach+nx*7,sy+dy*reach+ny*7,colors[2],5);
    stroke(ctx,sx-nx*10,sy-ny*10,sx+dx*reach-nx*7,sy+dy*reach-ny*7,colors[1],3);
    ctx.fillStyle=colors[0];ctx.fillRect(Math.round(sx+dx*reach-2),Math.round(sy+dy*reach-2),5,5);
   }
   // This narrow sightline always shares the exact angle used for the
   // authoritative projectile velocity, regardless of sprite orientation.
   stroke(ctx,a.x+dx*12,a.y+dy*12,a.x+dx*45,a.y+dy*45,colors[0],1);
  }
  ctx.restore();
 }
 air(ctx){
  if(!ctx)return;
  ctx.save();
  for(const p of this.particles){
   const fade=1-p.age/p.life;ctx.globalAlpha=fade*.85;ctx.fillStyle=p.color;
   const w=Math.max(1,Math.round(p.size*fade));
   ctx.fillRect(Math.round(p.x),Math.round(p.y),w,w);
   if(p.seed%3===0){
    stroke(ctx,p.x-p.vx*.025,p.y-p.vy*.025,p.x,p.y,p.color,1);
   }
  }
  ctx.restore();
 }
 aim(ctx,actor,target,{reduced=false,state=null,special=false}={}){
  if(!ctx||!actor||!target||!state)return;
  const g=previewAttack(state,actor,target,special),col=palette(actor)[0];
  ctx.save();ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.5;ctx.globalAlpha=.76;
  ctx.setLineDash(g.blocked?[3,5]:[4,8]);
  for(const seg of g.segments){if(seg.phase){ctx.strokeStyle='#a4d3c5';ctx.setLineDash([1,4])}else{ctx.strokeStyle=col;ctx.setLineDash(g.blocked?[3,5]:[4,8])}ctx.beginPath();ctx.moveTo(seg.x,seg.y);ctx.lineTo(seg.toX,seg.toY);ctx.stroke()}
  ctx.setLineDash([]);
  if(g.type==='cone'||g.type==='sector'){
   const half=g.type==='sector'?g.width:Math.atan(g.width/Math.max(1,g.length));ctx.globalAlpha=.42;
   for(let i=-5;i<=5;i++){
    const theta=g.angle+half*i/5;
    const q=previewAttack(state,actor,{x:actor.x+Math.cos(theta)*100,y:actor.y+Math.sin(theta)*100},special);
    if(!q.segments.length)continue;
    const seg=q.segments[0];ctx.beginPath();ctx.moveTo(actor.x,actor.y);ctx.lineTo(seg.toX,seg.toY);ctx.stroke();
   }
  }
  if(g.type==='lob'||g.type==='placement'){ctx.beginPath();ctx.arc(g.x,g.y,g.radius,0,Math.PI*2);ctx.stroke()}
  const size=g.blocked?7:5;ctx.globalAlpha=.95;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(g.x-size,g.y-size);ctx.lineTo(g.x+size,g.y+size);ctx.moveTo(g.x-size,g.y+size);ctx.lineTo(g.x+size,g.y-size);ctx.stroke();
  if(g.blocked){ctx.strokeStyle='#efa67f';ctx.beginPath();ctx.arc(g.x,g.y,9,0,Math.PI*2);ctx.stroke()}
  ctx.restore();
 }
}
