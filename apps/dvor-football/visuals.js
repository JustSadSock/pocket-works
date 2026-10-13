// ДВОР v1.2 — an actual overhead view, not a sideways person rotated on a flat pitch.
import {FIELD,limit,kits,skins,hairs} from './sim.js';
const TAU=Math.PI*2;
const INK='#1d3d3d',CHALK='#f2f4dc',YELLOW='#ffe4a2',BLUE='#2a84b5',RED='#dc7154';
export const CAMERA=Object.freeze({left:12,top:39,width:1056,height:542});
export const PLAYER_SCALE=.57;
const circle=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=color;c.fill();};
const oval=(c,x,y,a,b,color)=>{c.beginPath();c.ellipse(x,y,a,b,0,0,TAU);c.fillStyle=color;c.fill();};
const rect=(c,x,y,w,h,r,color)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();};
const stroke=(c,a,b,color,width)=>{c.beginPath();c.moveTo(...a);c.lineTo(...b);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const gradient=(c,x,y,r,light,dark)=>{
 const g=c.createRadialGradient(x-r*.35,y-r*.4,r*.06,x,y,r);
 g.addColorStop(0,light);g.addColorStop(1,dark);return g;
};
export function pitchTransform(view){
 const scale=Math.min(view.width/CAMERA.width,view.height/CAMERA.height);
 return {scale,x:(view.width-CAMERA.width*scale)/2,y:(view.height-CAMERA.height*scale)/2};
}
export function toPitch(rect,clientX,clientY){
 const {scale,x,y}=pitchTransform(rect);
 return {x:CAMERA.left+(clientX-rect.left-x)/scale,y:CAMERA.top+(clientY-rect.top-y)/scale};
}
function stadium(c){
 // The visible area is mostly grass. No false isometric walls, horizon or tilted stands.
 c.fillStyle='#2d5a50';c.fillRect(0,0,FIELD.w,FIELD.h);
 c.fillStyle='#345f50';c.fillRect(42,42,996,535);
 // Above/below the touchline: a narrow handcrafted miniature running border.
 for(const top of [true,false]){
  c.fillStyle='#27463e';c.fillRect(17,top?39:570,1046,11);
  for(let i=0;i<96;i++){
   const x=28+i*10.7,y=top?45:575,col=['#e1b56e','#e2d7ad','#ca795f','#6b978e','#9fb175'][i%5];
   rect(c,x,y,7,5,1,col);
  }
 }
 c.fillStyle='#366e50';c.fillRect(48,50,984,520);
 c.save();c.beginPath();c.rect(FIELD.left,FIELD.top,FIELD.right-FIELD.left,FIELD.bottom-FIELD.top);c.clip();
 for(let j=0;j<12;j++){c.fillStyle=j%2?'#589767':'#619e6b';c.fillRect(54+j*81,56,81,508);}
 // Very fine diagonal grass streaks, never distracting repeating grid/soccer texture.
 for(let i=0;i<510;i++){
  const x=54+(i*119)%973,y=56+(i*213)%509;
  stroke(c,[x,y],[x+3,y-1],i%3?'#183f3410':'#f6ebc111',.7);
 }
 // Stylized ambient turf shadows around the edges of the field, still pure top-down.
 const ambient=c.createLinearGradient(54,56,54,564);
 ambient.addColorStop(0,'#102c2c16');ambient.addColorStop(.25,'#102c2c00');
 ambient.addColorStop(.75,'#102c2c00');ambient.addColorStop(1,'#102c2c19');
 c.fillStyle=ambient;c.fillRect(54,56,972,508);
 c.restore();
 c.strokeStyle=CHALK;c.lineWidth=2.5;c.strokeRect(54,56,972,508);
 stroke(c,[540,56],[540,564],CHALK,2.2);
 c.strokeStyle=CHALK;c.lineWidth=2.5;c.beginPath();c.arc(540,310,75,0,TAU);c.stroke();
 circle(c,540,310,3,CHALK);
 for(const side of [0,1]){
  const left=side===0,x=left?54:1026,dir=left?1:-1;
  c.strokeStyle=CHALK;c.lineWidth=2.4;c.strokeRect(left?54:892,187,134,246);
  c.lineWidth=2;c.strokeRect(left?54:969,245,57,130);
  circle(c,x+dir*147,310,3,CHALK);
  // A clear little net UNDER the fixed overhead camera.
  c.fillStyle='#e5ebd9';c.fillRect(left?18:1026,216,36,188);
  for(let q=0;q<=6;q++){
   const n=(left?18:1026)+q*6;
   stroke(c,[n,217],[n,404],'#9ab4a5',.8);
  }
  for(let yy=218;yy<=404;yy+=13)stroke(c,[left?18:1026,yy],[left?54:1062,yy],'#9ab4a5',.8);
  stroke(c,[x,216],[x,404],'#fef7de',6);
  for(const yy of [216,404])circle(c,x,yy,4,'#fff7d5');
 }
}
let pitchCache=null;
function paintPitch(ctx){
 if(!pitchCache){
  pitchCache=document.createElement('canvas');
  pitchCache.width=FIELD.w;pitchCache.height=FIELD.h;
  stadium(pitchCache.getContext('2d'));
 }
 ctx.drawImage(pitchCache,0,0);
}
function overheadHair(c,style,color){
 // Only the TOP of the hairstyle is visible: no eyes, mouths or profile-facing faces.
 if(style===1){
  for(let i=0;i<8;i++){
   const t=i*2.37;
   circle(c,Math.cos(t)*7.2,Math.sin(t)*7.2-8,3.8,color);
  }
 }else if(style===2){
  circle(c,0,-8,10,color);
  stroke(c,[-7,-12],[6,-8],'#eee1bd99',1.4);
 }else if(style===3){
  circle(c,0,-8,10.6,color);
  c.beginPath();c.moveTo(-9,-10);c.quadraticCurveTo(-2,-22,11,-14);
  c.quadraticCurveTo(14,-5,5,3);c.lineTo(1,-7);c.quadraticCurveTo(-5,-6,-9,-10);
  c.fillStyle=color;c.fill();
 }else{
  circle(c,0,-8,10.5,color);
  c.beginPath();c.moveTo(-9,-11);c.quadraticCurveTo(0,-19,10,-12);c.lineTo(6,-9);c.quadraticCurveTo(-5,-12,-9,-7);c.fillStyle='#ffffff28';c.fill();
 }
 // Crown shine: a small reflected patch conveys round volume from directly overhead.
 oval(c,-3,-12,4,2.5,'#ffffff24');
}
export function drawOverheadPlayer(ctx,p,selected=false,t=0,size=1){
 const side=p.side===1,team=side?RED:BLUE,kit=kits[limit(p.kit??(side?1:0),0,4)];
 const skin=skins[limit(p.skin??1,0,3)],hair=hairs[limit(p.hair??0,0,3)];
 const angle=Math.atan2(p.fy??0,p.fx??(side?-1:1))+Math.PI/2;
 const moving=limit(Math.hypot(p.vx||0,p.vy||0)/220,0,1);
 const gait=Math.sin(t*15+(p.id||0)*2.3)*moving*3.4;
 ctx.save();ctx.translate(p.x,p.y);
 // Small shadow on turf anchors the head-sized figurine to the pitch without perspective.
 const r=15*size,ground=ctx.createRadialGradient(1,3,1,2,4,r);
 ground.addColorStop(0,'#0e35375c');ground.addColorStop(1,'#0e353700');
 ctx.fillStyle=ground;ctx.beginPath();ctx.ellipse(2,4,r*1.35,r*1.1,0,0,TAU);ctx.fill();
 if(selected){
  const R=18.4*size;
  ctx.strokeStyle='#ffed98';ctx.lineWidth=2.3;ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.stroke();
  ctx.strokeStyle='#133d3acc';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(0,0,R+2,0,TAU);ctx.stroke();
  ctx.fillStyle='#ffeaa6';ctx.beginPath();ctx.moveTo(-4,-R-10);ctx.lineTo(4,-R-10);ctx.lineTo(0,-R-4);ctx.fill();
 }
 ctx.rotate(angle);ctx.scale(PLAYER_SCALE*size,PLAYER_SCALE*size);
 // Both shins are separate short pieces under an overhead torso, not long cartoon legs.
 rect(ctx,-11,9+gait,8.5,16,3,'#e6e5dc');
 rect(ctx,2.5,9-gait,8.5,16,3,'#e6e5dc');
 rect(ctx,-12,19+gait,10.5,6,2,'#193a42');rect(ctx,2,19-gait,10.5,6,2,'#193a42');
 // Shoulder pads are curved ovals at left and right; bent forearms trail below them.
 oval(ctx,-15,0,7,10,team);oval(ctx,15,0,7,10,team);
 oval(ctx,-18,6+gait*.35,4.7,7.4,skin);oval(ctx,18,6-gait*.35,4.7,7.4,skin);
 // Overhead upper back, narrowing near waist, partly occluded by the spherical hair crown.
 ctx.beginPath();ctx.moveTo(-13,-8);ctx.quadraticCurveTo(0,-16,13,-8);
 ctx.lineTo(11,13);ctx.quadraticCurveTo(0,18,-11,13);ctx.closePath();
 ctx.fillStyle=gradient(ctx,-5,-7,24,kit,side?'#b85742':'#16628c');ctx.fill();
 ctx.strokeStyle='#153d46';ctx.lineWidth=1.35;ctx.stroke();
 // Shirt's central stripe and real shirt collar, not a flat full-body colored rectangle.
 rect(ctx,-2,-3,4,14,1,'#fff6d569');
 oval(ctx,0,-6,6,3.5,'#153d4588');
 ctx.font='1000 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='#fff5d5';ctx.fillText(String(p.number??9),0,8);
 // Head is foremost and ROUND, viewed from ABOVE: hair dominates, ears only peep out.
 circle(ctx,-11,-7,2.7,skin);circle(ctx,11,-7,2.7,skin);
 circle(ctx,0,-8,12.6,gradient(ctx,-3,-12,13,'#ffdfb2',skin));
 overheadHair(ctx,p.hair|0,hair);
 ctx.restore();
}
function overheadKeeper(ctx,g,side,time){
 // Same physical top-down language as outfield players, small yellow shirt and outstretched gloves.
 const k={x:g.x,y:g.y,fx:side?-1:1,fy:0,vx:0,vy:0,side,kit:2,skin:1,hair:2,number:1,id:80+side};
 ctx.save();ctx.translate(k.x,k.y);
 const theta=Math.atan2(k.fy,k.fx)+Math.PI/2;
 ctx.rotate(theta);ctx.scale(PLAYER_SCALE*.87,PLAYER_SCALE*.87);
 oval(ctx,2,7,20,16,'#173d3947');
 rect(ctx,-28,-9,56,10,5,'#e9b96b');
 rect(ctx,-31,-12,9,15,3,'#294b4c');rect(ctx,22,-12,9,15,3,'#294b4c');
 rect(ctx,-8,12,7,14,3,'#f4e7ca');rect(ctx,2,12,7,14,3,'#f4e7ca');
 oval(ctx,0,3,13,16,'#e6b04e');
 circle(ctx,0,-9,12,gradient(ctx,-4,-12,14,'#ffdfb2','#c88d65'));
 circle(ctx,0,-10,9,'#504037');oval(ctx,-2,-14,3,2,'#ffffff22');
 ctx.restore();
}
function overheadBall(ctx,b,time){
 const speed=Math.hypot(b.vx||0,b.vy||0);
 ctx.save();ctx.translate(b.x,b.y);
 oval(ctx,1.3,3.3,9.8,5.6,'#123d3d70');
 ctx.rotate(time*(.6+speed*.003)+(b.spin||0)*3);
 circle(ctx,0,0,8.8,'#fff9e9');
 ctx.lineWidth=1.1;ctx.strokeStyle='#263d40';ctx.beginPath();ctx.arc(0,0,8.8,0,TAU);ctx.stroke();
 ctx.fillStyle='#284145';ctx.beginPath();
 for(let i=0;i<5;i++){
  const a=-Math.PI/2+i*TAU/5;const x=Math.cos(a)*4.4,y=Math.sin(a)*4.4;
  i?ctx.lineTo(x,y):ctx.moveTo(x,y);
 }
 ctx.closePath();ctx.fill();
 for(let i=0;i<5;i++){
  const a=i*TAU/5;
  stroke(ctx,[Math.cos(a)*5.6,Math.sin(a)*5.6],[Math.cos(a)*8,Math.sin(a)*8],'#284145',1);
 }
 circle(ctx,-3,-3,1.7,'#ffffff88');ctx.restore();
}
function aimGuide(ctx,p,g,angle,power){
 if(!p||g.hold>0||g.phase!=='play')return;
 const near=Math.hypot(p.x-g.ball.x,p.y-g.ball.y)<39;
 const dx=Math.cos(angle),dy=Math.sin(angle),start=22,length=near?105+power*60:65;
 ctx.save();ctx.translate(p.x,p.y);
 ctx.setLineDash([4,6]);ctx.lineWidth=1.6;ctx.strokeStyle=near?'#ffe9a5c9':'#fdf3d46b';
 ctx.beginPath();ctx.moveTo(dx*start,dy*start);ctx.lineTo(dx*length,dy*length);ctx.stroke();
 ctx.setLineDash([]);
 if(near&&power>0){
  ctx.lineWidth=2.2;ctx.strokeStyle=YELLOW;ctx.beginPath();
  ctx.arc(0,0,23,-Math.PI/2,-Math.PI/2+TAU*limit(power/1.2,0,1));ctx.stroke();
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
  this.rings.push({x,y,r:9,life:.36,full:.36,power:intensity,color});
  this.cameraEnergy=Math.max(this.cameraEnergy,Math.min(1,intensity)*1.5);
 }
 burst(x,y,count,color='#f5d47c'){
  for(let i=0;i<count;i++){
   const a=i*2.399+(i*i*.37),speed=27+(i*31%110);
   const d=.23+i%3*.1;
   this.dust.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:d,full:d,color,size:1.2+i%3});
  }
  this.dust=this.dust.slice(-110);
 }
 observe(g,dt){
  if(!g)return;
  const b=g.ball,score=g.score.join(':');
  if(this.lastScore!==null&&score!==this.lastScore){
   this.goalTeam=g.score[0]!==+this.lastScore.split(':')[0]?0:1;
   this.flash=.47;this.burst(this.goalTeam===0?1010:70,310,30,this.goalTeam===0?'#a1dce9':'#f0bc94');
   this.rings.push({x:540,y:310,r:18,life:.78,full:.78,power:1.8,color:'#fff3c3'});
   this.trail=[];
  }else if(this.lastBall&&!g.hold){
   const prev=this.lastBall,delta=Math.hypot(b.vx-prev.vx,b.vy-prev.vy);
   if(delta>155&&Math.hypot(b.vx,b.vy)>180&&Math.hypot(b.x-prev.x,b.y-prev.y)<55){
    this.impact(b.x,b.y,limit(delta/700,.27,1),'#f7e7b6');
    this.burst(b.x,b.y,5,'#e6ddaa');
   }
  }
  if(this.lastEvent!==null&&this.lastEvent!==g.eventId&&g.event==='СЕЙВ!'){
   this.rings.push({x:b.x,y:b.y,r:9,life:.42,full:.42,power:.75,color:'#fff4d2'});
  }
  this.lastScore=score;this.lastEvent=g.eventId;
  this.lastBall={x:b.x,y:b.y,vx:b.vx,vy:b.vy};
  if(Math.hypot(b.vx,b.vy)>180)this.trail.push({x:b.x,y:b.y,life:.15,full:.15,size:2.3});
  const step=Math.min(dt,.07);
  for(const r of this.rings){r.r+=125*step*(r.power||1);r.life-=step;}
  for(const d of this.dust){d.x+=d.vx*step;d.y+=d.vy*step;d.life-=step;}
  for(const p of this.trail)p.life-=step;
  this.rings=this.rings.filter(e=>e.life>0).slice(-14);
  this.dust=this.dust.filter(e=>e.life>0).slice(-85);
  this.trail=this.trail.filter(e=>e.life>0).slice(-18);
  this.cameraEnergy=Math.max(0,this.cameraEnergy-step*13);
  this.flash=Math.max(0,this.flash-step);
 }
 drawUnder(ctx){
  for(const p of this.trail){ctx.globalAlpha=.25*p.life/p.full;circle(ctx,p.x,p.y,p.size,'#fff6e3');}
  for(const p of this.dust){ctx.globalAlpha=.52*p.life/p.full;circle(ctx,p.x,p.y,p.size*p.life/p.full,p.color);}
  ctx.globalAlpha=1;
 }
 drawOver(ctx){
  for(const p of this.rings){
   ctx.globalAlpha=.58*p.life/p.full;
   ctx.strokeStyle=p.color;ctx.lineWidth=1.8*p.power;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.stroke();
  }
  ctx.globalAlpha=1;
  if(this.flash){
   ctx.fillStyle='rgba(255,245,205,'+(this.flash*.12)+')';ctx.fillRect(54,56,972,508);
  }
 }
}
function fit(canvas){
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
 const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 return {ctx,w:rect.width,h:rect.height};
}
export function renderTopdown(canvas,g,time,{selected=-1,aim=null,charge=0,fx=null,online=false,dt=.016}={}){
 if(!g)return;
 const {ctx,w,h}=fit(canvas);
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#2d5a50';ctx.fillRect(0,0,w,h);
 const {scale,x,y}=pitchTransform({width:w,height:h});
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.translate(-CAMERA.left,-CAMERA.top);
 paintPitch(ctx);fx?.drawUnder(ctx);
 for(const p of g.players){
  let q=p;
  if(online&&fx){
   const prev=fx.visualPlayers[p.id]||(fx.visualPlayers[p.id]={x:p.x,y:p.y});
   const blend=limit(dt*11,0,1);prev.x+=(p.x-prev.x)*blend;prev.y+=(p.y-prev.y)*blend;
   q={...p,x:prev.x,y:prev.y};
  }
  drawOverheadPlayer(ctx,q,p.id===selected,time);
 }
 for(let side=0;side<2;side++)overheadKeeper(ctx,g.keepers[side],side,time);
 let ball=g.ball;
 if(online&&fx){
  const prev=fx.visualBall||(fx.visualBall={x:ball.x,y:ball.y});
  const blend=limit(dt*17,0,1);prev.x+=(ball.x-prev.x)*blend;prev.y+=(ball.y-prev.y)*blend;
  ball={...ball,x:prev.x,y:prev.y};
 }
 overheadBall(ctx,ball,time);
 if(aim!==null&&Number.isFinite(aim))aimGuide(ctx,g.players.find(p=>p.id===selected),g,aim,charge);
 fx?.drawOver(ctx);
 if(g.hold>0){
  ctx.save();ctx.fillStyle='#fdf0c9ef';ctx.beginPath();ctx.roundRect(459,277,162,40,8);ctx.fill();
  ctx.fillStyle=INK;ctx.font='900 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(g.event==='ГОЛ!'?'К ЦЕНТРУ':'ИГРАЕМ!',540,296);ctx.restore();
 }
 ctx.restore();
}
export function renderPortrait(canvas,profile){
 const {ctx,w,h}=fit(canvas);ctx.clearRect(0,0,w,h);
 const s=Math.min(w/104,h/120);
 ctx.save();ctx.translate(w/2,h*.54);ctx.scale(s,s);
 oval(ctx,0,2,42,43,'#e8ad5840');
 drawOverheadPlayer(ctx,{...profile,id:3,side:0,x:0,y:0,fx:0,fy:-1,vx:0,vy:0},false,0,3.1);
 ctx.restore();
}
