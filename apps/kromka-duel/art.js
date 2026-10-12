// A fully procedural top-down illustration. No sprite sheets or rigid-body puppets.
import {FIELD,tip,clamp,delta} from './engine.js';
const TAU=Math.PI*2;
const noise=(x)=>{let z=Math.sin(x*91.379+43.71)*43758.5453;return z-Math.floor(z);};
const stones=Array.from({length:380},(_,i)=>({x:noise(i+3)*FIELD.w,y:noise(i*2+17)*FIELD.h,
 r:.25+noise(i*3+4)*1.35,o:noise(i*5+9)*.2}));
const chips=Array.from({length:110},(_,i)=>({a:i*2.3999,r:Math.sqrt((i+.4)/110),t:noise(i*6+3)}));
let slab=null,sw=0,sh=0;
export function camera(width,height,side=0){
 const panel=width<690?217:145;
 const available=Math.max(290,height-panel);
 const scale=clamp(Math.min((width-20)/FIELD.w,(available-10)/FIELD.h),.53,1.45);
 return {scale,cx:width*.5,cy:available*.52,angle:side===1?Math.PI:0};
}
export function toWorld(x,y,width,height,side=0){
 const m=camera(width,height,side),dx=(x-m.cx)/m.scale,dy=(y-m.cy)/m.scale;
 const flip=side===1?-1:1;
 return {x:FIELD.cx+dx*flip,y:FIELD.cy+dy*flip};
}
function pathCircle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function line(ctx,x,y,ex,ey,color,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();}
function outline(ctx,x,y,rx,ry,color,width=1){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();}
function makeFloor(){
 const c=document.createElement('canvas');c.width=540;c.height=700;
 const x=c.getContext('2d');x.scale(1.5,700/540);
 x.fillStyle='#172520';x.fillRect(0,0,360,540);
 const g=x.createRadialGradient(180,257,26,180,257,290);
 g.addColorStop(0,'#69786c');g.addColorStop(.52,'#526357');g.addColorStop(.83,'#384c40');g.addColorStop(1,'#1a3027');
 x.beginPath();x.ellipse(180,FIELD.cy,FIELD.rx+12,FIELD.ry+12,0,0,TAU);x.fillStyle='#172d25';x.fill();
 x.beginPath();x.ellipse(180,FIELD.cy,FIELD.rx+7,FIELD.ry+7,0,0,TAU);x.fillStyle='#bcaf91';x.fill();
 x.beginPath();x.ellipse(180,FIELD.cy,FIELD.rx,FIELD.ry,0,0,TAU);x.fillStyle=g;x.fill();
 x.save();x.beginPath();x.ellipse(180,FIELD.cy,FIELD.rx,FIELD.ry,0,0,TAU);x.clip();
 // Irregular, hand-cut stone rather than a grid of anonymous rectangles.
 for(let row=0;row<14;row++){
  for(let col=-1;col<9;col++){
   const yy=70+row*31,shift=row%2?26:0,xx=col*54+shift+noise(col*17+row)*6;
   x.beginPath();x.moveTo(xx,yy);x.lineTo(xx+47,yy+noise(row*31+col)*3);
   x.lineTo(xx+52,yy+29);x.lineTo(xx+noise(row+col)*4,yy+28);x.closePath();
   x.fillStyle=noise(col+row*9)>.56?'#eee0ba07':'#12241b0b';x.fill();
   x.strokeStyle='#e8e0bc16';x.lineWidth=.95;x.stroke();
  }
 }
 for(const q of stones)pathCircle(x,q.x,q.y,q.r,'rgba(234,223,189,'+q.o+')');
 for(let i=0;i<7;i++){
  const y=104+i*55;
  x.beginPath();x.moveTo(34,y);x.bezierCurveTo(115,y+15,251,y-12,324,y+2);
  x.strokeStyle=i%2?'#d4e1cc10':'#e8e2c625';x.lineWidth=2+i%3;x.stroke();
 }
 x.restore();
 outline(x,180,FIELD.cy,FIELD.rx-10,FIELD.ry-10,'#d4cc9d7c',1.7);
 outline(x,180,FIELD.cy,FIELD.rx-27,FIELD.ry-27,'#a9b7a13e',1);
 outline(x,180,FIELD.cy,FIELD.rx+3,FIELD.ry+3,'#1b302ae2',4);
 for(let i=0;i<24;i++){
  const a=i*TAU/24,rr=FIELD.rx-16,ry=FIELD.ry-16;
  line(x,180+Math.cos(a)*rr,FIELD.cy+Math.sin(a)*ry,
    180+Math.cos(a)*(rr-(i%3===0?10:5)),FIELD.cy+Math.sin(a)*(ry-(i%3===0?11:5)),
    '#dfd4b187',i%3===0?2:1);
 }
 for(let i=0;i<4;i++){
  const a=i*TAU/4,x0=180+Math.cos(a)*88,y0=FIELD.cy+Math.sin(a)*122;
  outline(x,x0,y0,10,10,'#d9d6b066',1);
  line(x,x0-6,y0,x0+6,y0,'#e7dab366',1);
  line(x,x0,y0-6,x0,y0+6,'#e7dab366',1);
 }
 outline(x,180,FIELD.cy,22,22,'#d6cbaa50',1);
 line(x,167,FIELD.cy,193,FIELD.cy,'#d6cbaa65',1);
 line(x,180,FIELD.cy-13,180,FIELD.cy+13,'#d6cbaa65',1);
 return c;
}
function mark(ctx,x,y,r,type,t){
 if(type==='dash'){outline(ctx,x,y,13+t*29,(13+t*29)*.8,'rgba(241,228,189,'+(1-t)*.38+')',1.5);return;}
 if(type==='point'||type==='parry'){
  for(let k=0;k<12;k++){
   const a=k*TAU/12+.22,dist=8+t*(type==='point'?85:52)*(k%3/4+.75);
   const xx=x+Math.cos(a)*dist,yy=y+Math.sin(a)*dist;
   line(ctx,xx,yy,xx+Math.cos(a)*(13*(1-t)),yy+Math.sin(a)*(13*(1-t)),
     type==='point'?'rgba(255,246,207,'+(1-t)+')':'rgba(219,241,222,'+(1-t)+')',2*(1-t)+.4);
  }
  outline(ctx,x,y,10+t*45,7+t*30,'rgba(255,242,205,'+(1-t)*.7+')',1.5);
 }
}
function duelist(ctx,f,i,t){
 const player=i===0,primary=player?'#e2e5d7':'#382d2b',border=player?'#99b6a8':'#b9967c';
 const bob=Math.sin(t*.015+f.step*.1)*1.1,feet=Math.sin(f.step*.12)*3.5;
 ctx.save();ctx.translate(f.x,f.y+bob);ctx.rotate(f.a+Math.PI/2);
 pathCircle(ctx,3,9,19,'#0e221f5e');
 // The coat acts like a calligraphic stroke, angled and elastic in the sprint.
 const lean=clamp(Math.hypot(f.vx,f.vy)/310,0,.7);
 const cloak=player?'#24362f':'#443733';
 ctx.beginPath();ctx.moveTo(-11,-10);ctx.quadraticCurveTo(-18,0,-16-lean*5,15+feet*.4);
 ctx.quadraticCurveTo(-4,21+lean*11,0,18+lean*10);
 ctx.quadraticCurveTo(4,21+lean*11,16+lean*5,15-feet*.4);
 ctx.quadraticCurveTo(18,-1,11,-10);ctx.closePath();
 ctx.fillStyle=cloak;ctx.fill();ctx.strokeStyle=border;ctx.lineWidth=1.6;ctx.stroke();
 line(ctx,-5,-8,-5,16,player?'#668b78':'#876455',1.2);
 line(ctx,5,-8,5,16,player?'#668b78':'#876455',1.2);
 // Two feet seen overhead, gait does not require a sprite rig.
 ctx.fillStyle=player?'#172623':'#292321';
 ctx.fillRect(-13,8+feet,6,11);ctx.fillRect(7,8-feet,6,11);
 // Asymmetric padded shoulders give facing and handedness.
 ctx.beginPath();ctx.ellipse(-12,-6,6.5,9,-.2,0,TAU);ctx.fillStyle=player?'#86978c':'#8b685b';ctx.fill();
 ctx.beginPath();ctx.ellipse(12,-4,7,9,.15,0,TAU);ctx.fillStyle=player?'#758d7e':'#aa8770';ctx.fill();
 ctx.beginPath();ctx.ellipse(0,-9,9,11,0,0,TAU);ctx.fillStyle=primary;ctx.fill();ctx.strokeStyle='#17221f';ctx.lineWidth=2;ctx.stroke();
 line(ctx,-6,-14,6,-14,player?'#f8f3df':'#907d6b',2);
 line(ctx,-4,-3,4,-3,'#15211c',1);
 // Hands overlap torso, fencing stance in plan view.
 pathCircle(ctx,9,-10,4.3,player?'#cfb399':'#baa28d');
 ctx.restore();
}
function foil(ctx,f,i,t){
 const p=tip(f),a=f.a,r=63;
 ctx.save();ctx.translate(f.x,f.y);ctx.rotate(a);
 const thrust=f.jab>0&&f.jab<.225;
 const k=thrust?.5+.5*Math.sin((.225-f.jab)/.225*Math.PI):0;
 const bladeColor=i===0?'#f3f5e8':'#d2bba5';
 if(thrust){
  ctx.beginPath();ctx.moveTo(20,-9);ctx.lineTo(92,-7-k*5);ctx.lineTo(105,0);ctx.lineTo(92,7+k*5);ctx.closePath();
  ctx.fillStyle=i===0?'#e1f7da16':'#edbc9a18';ctx.fill();
 }
 ctx.shadowColor='#040b09af';ctx.shadowBlur=3;ctx.shadowOffsetY=4;
 ctx.beginPath();ctx.moveTo(12,-2);ctx.lineTo(62,-1.5);ctx.lineTo(71,0);ctx.lineTo(62,1.5);ctx.lineTo(12,2);ctx.closePath();
 ctx.fillStyle=bladeColor;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 line(ctx,12,-1,69,-.3,'#ffffffbb',.9);
 // Basket guard and grip
 line(ctx,10,-7,10,7,i===0?'#e5cba5':'#b99577',3);
 ctx.beginPath();ctx.arc(10,0,8,-Math.PI/2,Math.PI/2,false);ctx.strokeStyle=i===0?'#dbb890':'#9a806c';ctx.lineWidth=2;ctx.stroke();
 line(ctx,-1,0,8,0,'#352f29',4);
 pathCircle(ctx,-2,0,2.5,'#dbbe9a');
 ctx.restore();
 if(thrust){
  const e=Math.max(0,1-f.jab/.225);
  for(let k2=0;k2<4;k2++){
   const trail=4+k2*10;
   line(ctx,p.x-Math.cos(a)*trail,p.y-Math.sin(a)*trail,p.x-Math.cos(a)*(trail+15),p.y-Math.sin(a)*(trail+15),
    'rgba(247,246,226,'+(.23*(1-k2/4))+')',1.9-k2*.3);
  }
 }
}
export function drawScene(ctx,w,h,t,duel,options={}){
 const side=options.side??0,cam=camera(w,h,side);
 ctx.setTransform(options.pixelRatio||1,0,0,options.pixelRatio||1,0,0);
 const backdrop=ctx.createLinearGradient(0,0,0,h);
 backdrop.addColorStop(0,'#182923');backdrop.addColorStop(.58,'#0f201c');backdrop.addColorStop(1,'#0c1815');
 ctx.fillStyle=backdrop;ctx.fillRect(0,0,w,h);
 ctx.save();
 let bump=0;if(options.shake>0)bump=options.shake*Math.sin(t*.19);
 ctx.translate(cam.cx+bump,cam.cy+options.shake*.2*Math.cos(t*.22));
 ctx.scale(cam.scale,cam.scale);ctx.rotate(cam.angle);ctx.translate(-FIELD.cx,-FIELD.cy);
 if(!slab)slab=makeFloor();
 ctx.drawImage(slab,0,0,FIELD.w,FIELD.h);
 const shine=Math.sin(t*.0007)*.025;
 ctx.fillStyle='rgba(234,236,212,'+(shine+.037)+')';
 ctx.beginPath();ctx.ellipse(180,267,FIELD.rx-19,FIELD.ry-19,0,0,TAU);ctx.fill();
 if(duel){
  // Fleeting ripples tie motion to the floor.
  for(const f of duel.fighters){
   if(Math.hypot(f.vx,f.vy)>60){
    outline(ctx,f.x-f.vx*.04,f.y-f.vy*.04,8+Math.sin(t*.011+f.step*.13)*3,5,'#edecce4d',.9);
   }
  }
  for(let i=0;i<2;i++)duelist(ctx,duel.fighters[i],i,t);
  for(let i=0;i<2;i++)foil(ctx,duel.fighters[i],i,t);
 }else{
  const a={x:180+Math.sin(t*.0014)*22,y:356+Math.cos(t*.0012)*12,a:-Math.PI/2+.25*Math.sin(t*.002),vx:0,vy:0,step:t*.04,jab:0};
  const b={x:180+Math.cos(t*.0017)*18,y:176+Math.sin(t*.001)*10,a:Math.PI/2+.31*Math.sin(t*.0016),vx:0,vy:0,step:t*.04,jab:0};
  duelist(ctx,a,0,t);duelist(ctx,b,1,t);foil(ctx,a,0,t);foil(ctx,b,1,t);
 }
 for(const effect of options.effects||[]){
  const age=(t-effect.at)/620;
  if(age>=0&&age<=1)mark(ctx,effect.x,effect.y,1,effect.type,age);
 }
 ctx.restore();
 const edge=ctx.createRadialGradient(w*.5,h*.42,w*.2,w*.5,h*.42,h*.75);
 edge.addColorStop(0,'#03090900');edge.addColorStop(1,'#030d0a79');
 ctx.fillStyle=edge;ctx.fillRect(0,0,w,h);
 if(options.flash>0){ctx.fillStyle='rgba(255,250,226,'+options.flash*.32+')';ctx.fillRect(0,0,w,h);}
}
