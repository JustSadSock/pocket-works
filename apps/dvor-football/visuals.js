// DVOR pitch illustration. All geometry is drawn looking STRAIGHT DOWN.
// The camera never tilts, rotates, follows players, or crops the field.
import {FIELD,limit,kits,skins,hairs} from './sim.js';
const TAU=Math.PI*2;
const ink='#173e43',ivory='#f8efd5',blue='#268ab4',coral='#e57655';
const centered=(ctx,x,y,r,fill)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();};
const line=(ctx,pts,color,width)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
const ellipse=(ctx,x,y,w,h,fill)=>{ctx.beginPath();ctx.ellipse(x,y,w,h,0,0,TAU);ctx.fillStyle=fill;ctx.fill();};
const rounded=(ctx,x,y,w,h,r,fill)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();};
const palette={grass:'#518758',mow:'#66996c',track:'#234a47',chalk:'#f6f1d9',gold:'#f2c85a'};
export function pitchTransform(rect){
 const scale=Math.min(rect.width/FIELD.w,rect.height/FIELD.h);
 return {scale,x:(rect.width-FIELD.w*scale)/2,y:(rect.height-FIELD.h*scale)/2};
}
export function toPitch(rect,x,y){
 const {scale,x:ox,y:oy}=pitchTransform(rect);
 return {x:(x-rect.left-ox)/scale,y:(y-rect.top-oy)/scale};
}
function paintPitch(ctx){
 ctx.fillStyle=palette.track;ctx.fillRect(0,0,FIELD.w,FIELD.h);
 // Spectator booths viewed from above: colored little blocks, no horizon or fake perspective.
 for(let side=0;side<2;side++){
  const upper=side===0,cy=upper?28:592;
  ctx.fillStyle='#143b3e';ctx.fillRect(22,upper?8:577,FIELD.w-44,34);
  for(let i=0;i<94;i++){
   const x=36+i*10.7,seed=(i*53+side*71)%13;
   rounded(ctx,x,cy-7,8,10,2,['#e0b45c','#e7d8b6','#cd7556','#79a2a0','#98ac74'][seed%5]);
   if(i%8===0)rounded(ctx,x,cy+7,5,5,1,'#365453');
  }
 }
 // Touchline buffer and soft pitch perimeter.
 ctx.fillStyle='#396850';ctx.fillRect(42,44,996,532);
 for(let i=0;i<12;i++){
  ctx.fillStyle=i%2?'#5f9967':'#569160';ctx.fillRect(54+i*81,56,81,508);
 }
 // A restrained pattern of cut grass, fixed in world coordinates (no per-frame noise).
 for(let i=0;i<360;i++){
  const x=63+(i*97%956),y=68+(i*163%485);
  ctx.strokeStyle=i%4?'#ffffff0a':'#133f3015';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+5,y-2);ctx.stroke();
 }
 ctx.strokeStyle=palette.chalk;ctx.lineWidth=2.8;
 ctx.strokeRect(FIELD.left,FIELD.top,FIELD.right-FIELD.left,FIELD.bottom-FIELD.top);
 line(ctx,[[540,56],[540,564]],palette.chalk,2.8);
 ctx.beginPath();ctx.arc(540,310,83,0,TAU);ctx.stroke();
 centered(ctx,540,310,4,palette.chalk);
 for(const side of [0,1]){
  const left=!side,x=left?54:1026,dir=left?1:-1;
  ctx.strokeRect(left?54:884,171,142,278);
  ctx.strokeRect(left?54:964,225,62,170);
  centered(ctx,x+dir*154,310,3,palette.chalk);
  // Two dimensional goal mouth with mesh threads and thick white posts.
  ctx.fillStyle='#ece8d1';ctx.fillRect(left?18:1026,204,36,212);
  ctx.strokeStyle='#a3b6ac';ctx.lineWidth=1;
  for(let n=1;n<7;n++){const u=left?18+n*6:1026+n*6;line(ctx,[[u,206],[u,416]],'#a3b6ac',.85);}
  for(let v=207;v<416;v+=12)line(ctx,[[left?18:1026,v],[left?54:1062,v]],'#a3b6ac',.85);
  line(ctx,[[x,204],[x,416]],palette.chalk,8);
  centered(ctx,x,204,4.5,ivory);centered(ctx,x,416,4.5,ivory);
  // Corner flags and small world-anchored line details.
  const cornerX=x;
  for(const y of [56,564]){
   centered(ctx,cornerX,y,5,'#f4cd6a');
   line(ctx,[[cornerX,y],[cornerX+dir*9,y+(y<310?9:-9)]],'#203d44',2);
  }
 }
 // Crisp overhead painted team initials outside the touchline.
 ctx.save();ctx.globalAlpha=.16;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='1000 12px system-ui';
 ctx.fillStyle=ivory;ctx.fillText('Д В О Р',540,51);ctx.restore();
}
export function drawOverheadPlayer(ctx,p,selected=false,time=0,size=1){
 const team=p.side===1?coral:blue;
 const skin=skins[limit(p.skin??1,0,3)],hair=hairs[limit(p.hair??0,0,3)],stripe=kits[limit(p.kit??0,0,4)];
 const angle=Math.atan2(p.fy||0,p.fx||1)+Math.PI/2;
 const moving=limit(Math.hypot(p.vx||0,p.vy||0)/190,0,1);
 const leg=Math.sin(time*18+p.id*2.3)*moving*5;
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(size,size);
 ellipse(ctx,2,7,21,19,'#113e3860');
 if(selected){
  ctx.beginPath();ctx.arc(0,0,30,0,TAU);ctx.lineWidth=4;ctx.strokeStyle='#ffea94';ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,35,-Math.PI*.6,-Math.PI*.39);ctx.lineWidth=6;ctx.strokeStyle='#fff7d2';ctx.stroke();
  ctx.save();ctx.rotate(angle);ctx.fillStyle='#ffe69c';ctx.beginPath();ctx.moveTo(0,-44);ctx.lineTo(-8,-33);ctx.lineTo(8,-33);ctx.closePath();ctx.fill();ctx.restore();
 }
 ctx.rotate(angle);
 // Shoes and both planted feet extend BEHIND the overhead shoulders.
 rounded(ctx,-13,12+leg,10,16,4,'#f4e8cf');
 rounded(ctx,3,12-leg,10,16,4,'#f4e8cf');
 rounded(ctx,-14,23+leg,12,8,3,'#223e46');
 rounded(ctx,3,23-leg,12,8,3,'#223e46');
 rounded(ctx,-14,9,28,13,5,'#1d3d47');
 // Wide horizontal shoulder axis and arms are always visible from the ceiling.
 ctx.save();ctx.rotate(-leg*.009);
 rounded(ctx,-23,-13,11,29,6,skin);rounded(ctx,12,-13,11,29,6,skin);
 rounded(ctx,-22,-14,9,13,4,team);rounded(ctx,13,-14,9,13,4,team);
 ctx.restore();
 rounded(ctx,-16,-18,32,35,11,'#1b4751');
 rounded(ctx,-14,-17,28,31,10,team);
 rounded(ctx,-11,-15,7,25,3,stripe);rounded(ctx,5,-15,6,25,3,stripe);
 rounded(ctx,-10,-9,20,14,4,'#ffffff15');
 // Jersey number on the BACK, not on the face.
 ctx.fillStyle='#f8edd8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='1000 13px system-ui';
 ctx.shadowColor='#153f49';ctx.shadowBlur=2;ctx.fillText(String(p.number||9),0,4);ctx.shadowBlur=0;
 // Crown of the head in front of the collar. This is a top-of-head silhouette.
 centered(ctx,0,-23,13.3,skin);
 centered(ctx,0,-23,10.7,hair);
 switch(p.hair|0){
  case 0: // swept hair wedge
   ctx.fillStyle=hair;ctx.beginPath();ctx.moveTo(-11,-25);ctx.quadraticCurveTo(2,-42,12,-27);ctx.lineTo(8,-19);ctx.quadraticCurveTo(0,-24,-11,-21);ctx.fill();break;
  case 1: // warm curly crown
   for(let i=0;i<7;i++)centered(ctx,Math.sin(i*2.4)*8,-24+Math.cos(i*1.7)*7,4.2,hair);
   break;
  case 2: // short flat crown stripe
   rounded(ctx,-11,-29,21,5,3,'#5b6265');break;
  case 3: // long side swept
   ctx.fillStyle=hair;ctx.beginPath();ctx.moveTo(-12,-23);ctx.quadraticCurveTo(-8,-37,8,-34);ctx.quadraticCurveTo(14,-31,12,-18);ctx.lineTo(5,-25);ctx.closePath();ctx.fill();break;
 }
 // Rim light and small side ears help silhouette at half phone resolution.
 centered(ctx,-13,-22,2.3,skin);centered(ctx,13,-22,2.3,skin);
 ctx.restore();
}
function drawKeeper(ctx,p,side,t){
 const f=side? -1:1,keeper={...p,side,kit:2,hair:0,number:1,skin:1,id:side?92:91,fx:f,fy:0,vx:0,vy:0};
 ctx.save();ctx.translate(p.x,p.y);
 ellipse(ctx,1,5,23,21,'#103e3a88');
 ctx.rotate(side?-Math.PI/2:Math.PI/2);
 // Long sleeves and goalkeeper gloves create a visible T-shaped top-down body.
 rounded(ctx,-30,-7,60,13,6,'#f9d37b');
 rounded(ctx,-33,-8,10,15,4,'#223e43');rounded(ctx,23,-8,10,15,4,'#223e43');
 rounded(ctx,-11,14,9,16,4,'#24414a');rounded(ctx,3,14,9,16,4,'#24414a');
 rounded(ctx,-12,-10,24,24,8,'#e9bc60');
 centered(ctx,0,-13,12,skins[1]);centered(ctx,0,-15,9,hairs[0]);
 ctx.fillStyle='#203e44';ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText('1',0,9);
 ctx.restore();
}
function drawFootball(ctx,ball,time){
 ctx.save();ctx.translate(ball.x,ball.y);
 const velocity=Math.hypot(ball.vx||0,ball.vy||0);
 ellipse(ctx,3+limit(velocity/150,0,3),8,13,7,'#163d3a90');
 ctx.rotate(time*(.65+velocity*.0025)+(ball.spin||0)*2.5);
 centered(ctx,0,0,12,'#fff8e7');
 ctx.strokeStyle='#163d47';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,12,0,TAU);ctx.stroke();
 ctx.fillStyle='#253f47';ctx.beginPath();
 for(let i=0;i<5;i++){const a=i*TAU/5-.3;const x=Math.cos(a)*6,y=Math.sin(a)*6;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
 ctx.closePath();ctx.fill();
 for(let i=0;i<5;i++){const a=i*TAU/5+.5;line(ctx,[[Math.cos(a)*7,Math.sin(a)*7],[Math.cos(a)*11,Math.sin(a)*11]],'#253f47',1.5);}
 ctx.restore();
}
function drawAim(ctx,p,g,angle,power,pass){
 if(!p||!g||g.phase!=='play'||g.hold>0)return;
 ctx.save();ctx.translate(p.x,p.y);
 const distance=Math.hypot(p.x-g.ball.x,p.y-g.ball.y);
 const ready=distance<55;
 const length=ready?150+power*70:85;
 const dx=Math.cos(angle),dy=Math.sin(angle);
 ctx.lineWidth=ready?3:1.8;ctx.lineCap='round';ctx.setLineDash([7,7]);
 ctx.strokeStyle=ready?(pass?'#dff2ef':'#fbea9d'):'#edf2e97a';
 ctx.beginPath();ctx.moveTo(dx*30,dy*30);ctx.lineTo(dx*length,dy*length);ctx.stroke();
 ctx.setLineDash([]);
 const end=length+5;ctx.fillStyle=ready?'#ffe49b':'#e0e8e3aa';
 ctx.beginPath();ctx.moveTo(dx*end,dy*end);ctx.lineTo(dx*(end-14)-dy*6,dy*(end-14)+dx*6);ctx.lineTo(dx*(end-14)+dy*6,dy*(end-14)-dx*6);ctx.closePath();ctx.fill();
 if(ready&&power>0){
  ctx.strokeStyle='#f5d477';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,37,-Math.PI/2,-Math.PI/2+TAU*limit(power/1.2,0,1));ctx.stroke();
 }
 ctx.restore();
}
export class TopdownFX{
 constructor(){this.reset();}
 reset(){
  this.rings=[];this.dust=[];this.trail=[];this.cameraEnergy=0;this.flash=0;this.goalTeam=null;
  this.lastBall=null;this.lastScore=null;this.lastEvent=null;this.visualPlayers={};this.visualBall=null;
 }
 impact(x,y,intensity=1,color='#f8e6a2'){
  this.rings.push({x,y,r:13,life:.4,full:.4,power:intensity,color});
  this.cameraEnergy=Math.max(this.cameraEnergy,Math.min(1,intensity)*2.5);
 }
 burst(x,y,count,color='#f5d47c'){
  for(let i=0;i<count;i++){
   const a=i*2.399+(.37*i*i),speed=38+(i*31%135);
   this.dust.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:.35+i%3*.14,full:.35+i%3*.14,color,size:2+i%4});
  }
  if(this.dust.length>125)this.dust.splice(0,this.dust.length-125);
 }
 observe(g,dt,online=false){
  if(!g)return;
  const b=g.ball;
  const score=g.score.join(':');
  if(this.lastScore!==null&&score!==this.lastScore){
   this.goalTeam=g.score[0]!==+(this.lastScore.split(':')[0])?0:1;
   this.flash=.5;this.cameraEnergy=6;this.burst(this.goalTeam===0?1004:76,310,34,this.goalTeam===0?'#9bd6e6':'#ffd4a0');
   this.rings.push({x:540,y:310,r:12,life:.95,full:.95,power:2,color:'#fff2ba'});
   this.trail=[];
  }else if(this.lastBall&&!g.hold){
   const prev=this.lastBall,delta=Math.hypot(b.vx-prev.vx,b.vy-prev.vy);
   if(delta>155&&Math.hypot(b.vx,b.vy)>180&&Math.hypot(b.x-prev.x,b.y-prev.y)<55){
    this.impact(b.x,b.y,limit(delta/600,.35,1), '#f7e7b6');
    this.burst(b.x,b.y,6,'#e6ddaa');
   }
  }
  if(this.lastEvent!==null&&this.lastEvent!==g.eventId&&g.event==='СЕЙВ!'){
   const k=g.keepers.reduce((a,c)=>Math.hypot(c.x-b.x,c.y-b.y)<Math.hypot(a.x-b.x,a.y-b.y)?c:a,g.keepers[0]);
   this.rings.push({x:k.x,y:k.y,r:11,life:.45,full:.45,power:.8,color:'#fff4d2'});
  }
  this.lastScore=score;this.lastEvent=g.eventId;
  this.lastBall={x:b.x,y:b.y,vx:b.vx,vy:b.vy};
  const speed=Math.hypot(b.vx,b.vy);
  if(speed>150&&this.trail.length<28){
   this.trail.push({x:b.x,y:b.y,life:.23,full:.23,size:limit(speed/115,2,5)});
  }
  if(speed<=150)this.trail.length=Math.max(0,this.trail.length-1);
  for(const p of g.players){
   if(Math.hypot(p.vx||0,p.vy||0)>185&&Math.random()<.22){
    this.dust.push({x:p.x-p.vx*.03,y:p.y-p.vy*.03,vx:-p.vx*.18,vy:-p.vy*.18,life:.24,full:.24,color:'#d4ddaa',size:2});
   }
  }
  const step=Math.min(dt,.07);
  for(const r of this.rings){r.r+=160*step*(r.power||1);r.life-=step;}
  for(const d of this.dust){d.x+=d.vx*step;d.y+=d.vy*step;d.vx*=Math.exp(-8*step);d.vy*=Math.exp(-8*step);d.life-=step;}
  for(const p of this.trail)p.life-=step;
  this.rings=this.rings.filter(e=>e.life>0).slice(-20);
  this.dust=this.dust.filter(e=>e.life>0).slice(-110);
  this.trail=this.trail.filter(e=>e.life>0).slice(-24);
  this.cameraEnergy=Math.max(0,this.cameraEnergy-step*13);
  this.flash=Math.max(0,this.flash-step);
 }
 drawUnder(ctx){
  for(const p of this.trail){ctx.globalAlpha=.23*p.life/p.full;centered(ctx,p.x,p.y,p.size,'#fff6d7');}
  ctx.globalAlpha=1;
  for(const p of this.dust){
   ctx.globalAlpha=.63*p.life/p.full;
   centered(ctx,p.x,p.y,p.size*p.life/p.full,p.color);
  }
  ctx.globalAlpha=1;
 }
 drawOver(ctx){
  for(const e of this.rings){
   ctx.globalAlpha=.8*Math.pow(e.life/e.full,1.2);
   ctx.lineWidth=2.7*e.power;ctx.strokeStyle=e.color;
   ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,TAU);ctx.stroke();
  }
  ctx.globalAlpha=1;
  if(this.flash>0){
   ctx.fillStyle='rgba(255,243,193,'+(this.flash*.16)+')';ctx.fillRect(55,56,970,508);
  }
 }
}
let fieldCache=null;
function paintCachedPitch(ctx){
 if(!fieldCache){
  fieldCache=document.createElement('canvas');fieldCache.width=FIELD.w;fieldCache.height=FIELD.h;
  paintPitch(fieldCache.getContext('2d'));
 }
 ctx.drawImage(fieldCache,0,0);
}
function fit(canvas){
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
 const ww=Math.max(1,Math.round(rect.width*dpr)),hh=Math.max(1,Math.round(rect.height*dpr));
 if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 return {ctx,w:rect.width,h:rect.height};
}
export function renderTopdown(canvas,g,time,{selected=-1,aim=null,charge=0,pass=false,fx=null,online=false,dt=.016}={}){
 if(!g)return;
 const {ctx,w,h}=fit(canvas);
 ctx.clearRect(0,0,w,h);ctx.fillStyle=palette.track;ctx.fillRect(0,0,w,h);
 const {scale,x,y}=pitchTransform({width:w,height:h});
 // Camera position and orientation are immutable: only micro-impulses occur on the fixed overhead rig.
 const kick=fx?.cameraEnergy||0;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const shake=reduced?0:kick;
 const zoom=1+(reduced?0:Math.min(.011,kick*.002));
 ctx.save();
 ctx.translate(x+FIELD.w*scale/2+Math.sin(time*37)*shake,y+FIELD.h*scale/2+Math.cos(time*29)*shake*.58);
 ctx.scale(scale*zoom,scale*zoom);ctx.translate(-FIELD.w/2,-FIELD.h/2);
 paintCachedPitch(ctx);
 fx?.drawUnder(ctx);
 for(const p of g.players){
  let q=p;
  if(online&&fx){
   const vis=fx.visualPlayers[p.id]||(fx.visualPlayers[p.id]={x:p.x,y:p.y});
   const blend=limit(dt*11,0,1);
   vis.x+=(p.x-vis.x)*blend;vis.y+=(p.y-vis.y)*blend;
   q={...p,x:vis.x,y:vis.y};
  }
  drawOverheadPlayer(ctx,q,p.id===selected,time);
 }
 for(let side=0;side<2;side++)drawKeeper(ctx,g.keepers[side],side,time);
 let ball=g.ball;
 if(online&&fx){
  const vis=fx.visualBall||(fx.visualBall={x:ball.x,y:ball.y});
  const blend=limit(dt*17,0,1);vis.x+=(ball.x-vis.x)*blend;vis.y+=(ball.y-vis.y)*blend;
  ball={...ball,x:vis.x,y:vis.y};
 }
 drawFootball(ctx,ball,time);
 if(aim!==null&&Number.isFinite(aim)){
  const p=g.players.find(p=>p.id===selected);
  drawAim(ctx,p,g,aim,charge,pass);
 }
 fx?.drawOver(ctx);
 if(g.hold>0){
  rounded(ctx,433,266,214,48,10,'#fff0c9');
  ctx.font='950 23px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ink;
  ctx.fillText(g.event==='ГОЛ!'?'В ЦЕНТР ПОЛЯ':'К СВИСТКУ!',540,290);
 }
 ctx.restore();
}
export function renderPortrait(canvas,profile){
 const {ctx,w,h}=fit(canvas);
 ctx.clearRect(0,0,w,h);
 const sc=Math.min(w/104,h/113),p={...profile,id:9,side:0,x:0,y:0,fx:0,fy:-1,vx:0,vy:0};
 ctx.save();ctx.translate(w/2,h*.55);ctx.scale(sc,sc);
 ellipse(ctx,0,6,41,49,'#e8ad5860');
 drawOverheadPlayer(ctx,p,false,0,2.05);
 ctx.restore();
}
