
import {H,W,GROUND,LEVELS,COLORS,terrain,clamp} from './game-core.js';
const PI=Math.PI;
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
const hash=n=>{const x=Math.sin(n*127.1+63.17)*43758.5453;return x-Math.floor(x);};
const circle=(c,x,y,r,fill,stroke='',width=1)=>{c.beginPath();c.arc(x,y,r,0,PI*2);c.fillStyle=fill;c.fill();if(stroke){c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}};
function stitch(c,x,y,width,step=22,color='#f0d4a7'){
 c.strokeStyle=color;c.lineWidth=2;c.lineCap='round';
 for(let i=x+10;i<x+width-5;i+=step){c.beginPath();c.moveTo(i,y-2);c.lineTo(i+6,y+3);c.stroke();}
}
function fabric(c,x,y,w,h,top=false){
 const g=c.createLinearGradient(x,y,x,y+h);
 if(top){g.addColorStop(0,'#8dc2a6');g.addColorStop(.15,'#5f9a80');g.addColorStop(1,'#416d5e');}
 else{g.addColorStop(0,'#b88766');g.addColorStop(.22,'#a77458');g.addColorStop(1,'#8a5d49');}
 c.fillStyle=g;rr(c,x,y,w,h,top?7:11);c.fill();
 c.fillStyle='rgba(255,255,255,.055)';
 for(let yy=y+12;yy<y+h;yy+=13)for(let xx=x+11;xx<x+w;xx+=17){c.fillRect(xx+hash(xx*yy)*3,yy,4,1);}
 c.strokeStyle=top?'#245e4d':'#684638';c.lineWidth=3;rr(c,x+2,y+2,w-4,h-4,top?6:10);c.stroke();
 stitch(c,x+3,y+9,w-6,21,top?'#b5dbc0':'#e7c59a');
}
function background(c,viewX,viewW,time){
 const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#f6e9d3');g.addColorStop(.62,'#e8d8ba');g.addColorStop(1,'#dcc8a8');c.fillStyle=g;c.fillRect(viewX,0,viewW,H);
 // Stable canvas weave; micro-detail does not flicker between frames.
 c.lineWidth=.85;c.strokeStyle='rgba(123,95,68,.055)';
 for(let yy=13;yy<H;yy+=11){c.beginPath();c.moveTo(viewX,yy);c.lineTo(viewX+viewW,yy);c.stroke();}
 for(let xx=Math.floor(viewX/15)*15;xx<viewX+viewW+15;xx+=15){c.beginPath();c.moveTo(xx,0);c.lineTo(xx,H);c.stroke();}
 // Oversized tailoring objects give scale, without interfering with the playfield.
 for(let i=0;i<7;i++){
  const x=90+i*235,y=100+(i%3)*47,r=40+(i%2)*13;
  if(x+r<viewX-100||x-r>viewX+viewW+100)continue;
  c.save();c.translate(x,y);c.rotate((i%3-1)*.18);
  c.fillStyle='rgba(89,71,53,.05)';c.beginPath();c.ellipse(5,21,r*1.2,r*.38,0,0,PI*2);c.fill();
  circle(c,0,0,r,'#e4c9a8','#d2b28c',5);
  for(let q=0;q<12;q++){const a=q*PI/6;c.strokeStyle=i%2?'#bb8f7a':'#95a5a1';c.lineWidth=5;c.beginPath();c.moveTo(Math.cos(a)*15,Math.sin(a)*15);c.lineTo(Math.cos(a)*r*.82,Math.sin(a)*r*.82);c.stroke();}
  circle(c,0,0,13,'#c39b72','#f3ddbc',4);
  c.restore();
 }
 // Back-row strings hanging from invisible ceiling.
 c.strokeStyle='rgba(169,129,101,.18)';c.lineWidth=3;
 for(let i=0;i<14;i++){const x=105+i*118;if(x<viewX-40||x>viewX+viewW+40)continue;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x-19,54,x+31,60,x+8,112);c.stroke();}
}
function drawButton(c,x,y,active,i){
 c.save();c.translate(x,y);
 const r=33;c.shadowColor='rgba(70,40,40,.18)';c.shadowBlur=14;c.shadowOffsetY=7;
 circle(c,0,5,r+4,'#835849');c.shadowColor='transparent';
 circle(c,0,0,r+2,active?'#8ec8a2':'#e6a17f','#85584e',4);
 circle(c,0,0,r-8,active?'#c4e5c0':'#f2c8ad','#f4e9cc',2);
 for(let a=0;a<4;a++){const th=a*PI/2+.5;circle(c,Math.cos(th)*13,Math.sin(th)*13,4,'#af725e');}
 if(active){c.strokeStyle='#356e52';c.lineWidth=4;c.beginPath();c.moveTo(-10,0);c.lineTo(-2,9);c.lineTo(13,-10);c.stroke();}
 c.restore();
}
function drawBall(c,b,time){
 c.save();c.translate(b.x,b.y);c.rotate(b.x/76);
 c.shadowColor='rgba(49,37,36,.22)';c.shadowBlur=12;c.shadowOffsetY=6;
 circle(c,0,0,b.r,'#d09d5c','#875743',4);c.shadowColor='transparent';
 c.lineWidth=3;c.strokeStyle='#f0d4a1';
 for(let i=0;i<7;i++){const a=i*1.24;c.beginPath();c.arc(0,0,6+i*3,a,a+PI*1.2);c.stroke();}
 circle(c,0,0,5,'#795a46');c.restore();
}
function drawSpring(c,s,time){
 c.save();c.translate(s.x,s.y);
 c.fillStyle='#865846';rr(c,-35,0,70,17,4);c.fill();c.strokeStyle='#dd8c71';c.lineWidth=9;c.lineCap='round';
 c.beginPath();c.moveTo(-24,0);
 for(let j=0;j<7;j++)c.lineTo(-20+j*7,-11-(j%2)*14);
 c.lineTo(25,-2);c.stroke();c.strokeStyle='#ffd4a7';c.lineWidth=2;c.stroke();
 c.restore();
}
function drawGate(c,x,open){
 if(open)return;
 c.save();c.shadowColor='rgba(78,50,40,.24)';c.shadowBlur=8;c.shadowOffsetX=-5;
 fabric(c,x,363,33,GROUND-363,true);c.shadowColor='transparent';
 c.fillStyle='#eacb99';c.fillRect(x+12,369,7,GROUND-375);
 for(let y=380;y<GROUND-6;y+=15){c.fillStyle=y%2?'#aa6950':'#d58b67';c.fillRect(x+12,y,7,7);}
 c.restore();
}
function drawDoor(c,x,y,ready,t){
 c.save();c.translate(x,y);
 c.fillStyle='rgba(96,65,50,.15)';c.beginPath();c.ellipse(0,45,79,19,0,0,PI*2);c.fill();
 c.fillStyle='#cf9370';rr(c,-54,-81,108,126,39);c.fill();
 c.fillStyle=ready?'#7eac8f':'#a47178';rr(c,-42,-70,84,111,29);c.fill();
 c.fillStyle='#4f6256';rr(c,-27,-50,54,94,24);c.fill();
 c.strokeStyle='#e6c6ab';c.lineWidth=4;c.setLineDash([4,9]);rr(c,-47,-75,94,116,32);c.stroke();c.setLineDash([]);
 c.fillStyle='#efd49c';c.beginPath();c.moveTo(-66,-87);c.lineTo(0,-107);c.lineTo(66,-87);c.lineTo(0,-71);c.closePath();c.fill();
 for(let k=-1;k<=1;k++)circle(c,k*16,-91,4,'#bd7c62');
 c.restore();
}
function limb(c,x,y,angle,len,col){
 c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle='#8a5f55';c.lineWidth=16;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.lineTo(0,len);c.stroke();
 c.strokeStyle=col;c.lineWidth=12;c.beginPath();c.moveTo(0,0);c.lineTo(0,len);c.stroke();c.restore();
}
function drawHero(c,p,index,time,focus){
 const col=COLORS[index%COLORS.length],bob=Math.sin(time*.003+index)*1.9;
 c.save();c.translate(p.x,p.y+bob);
 c.fillStyle='rgba(53,43,40,.17)';c.beginPath();c.ellipse(0,25,31,8,0,0,PI*2);c.fill();
 const speed=clamp(Math.abs(p.vx||0)/260,0,1),squash=p.squash||0;
 limb(c,-15,13,speed*Math.sin(time*.023+index)*.28,18,col);
 limb(c,15,13,-speed*Math.sin(time*.023+index)*.28,18,col);
 limb(c,-22,-1,Math.sin(time*.007+index)*.18,17,col);
 limb(c,22,-1,-Math.sin(time*.007+index)*.18,17,col);
 c.save();c.scale(1+squash*.19,1-squash*.13);
 c.shadowColor='rgba(74,42,36,.21)';c.shadowBlur=8;c.shadowOffsetY=5;
 c.fillStyle='#805d57';c.beginPath();c.moveTo(-19,-7);c.bezierCurveTo(-37,-30,-24,-36,-16,-26);c.bezierCurveTo(0,-36,25,-37,21,-15);c.bezierCurveTo(38,0,30,21,17,25);c.bezierCurveTo(-10,33,-33,23,-31,3);c.closePath();c.fill();
 c.shadowColor='transparent';c.fillStyle=col;
 c.beginPath();c.moveTo(-19,-9);c.bezierCurveTo(-35,-27,-22,-34,-14,-23);c.bezierCurveTo(2,-32,21,-31,19,-12);c.bezierCurveTo(36,2,27,22,15,23);c.bezierCurveTo(-9,31,-31,18,-28,3);c.closePath();c.fill();
 c.strokeStyle='rgba(255,245,228,.65)';c.lineWidth=2.1;c.setLineDash([2,7]);c.stroke();c.setLineDash([]);
 c.fillStyle='rgba(255,238,212,.24)';c.beginPath();c.ellipse(-10,-12,13,8,-.5,0,PI*2);c.fill();
 for(let i=0;i<2;i++)circle(c,(-8+i*17)+(p.face===-1?-3:2),-1,3.3,'#372f36');
 c.lineWidth=2;c.strokeStyle='#573e42';c.beginPath();c.arc(p.face*2,7,5,0,PI);c.stroke();
 if(p.grab)for(let k=-1;k<=1;k++){c.strokeStyle='#f5e7ae';c.lineWidth=3;c.beginPath();c.moveTo(k*10,26);c.lineTo(k*10+3,32);c.stroke();}
 c.restore();
 if(focus){c.lineWidth=3;c.strokeStyle='#fff6df';c.setLineDash([4,7]);c.beginPath();c.arc(0,1,36,0,PI*2);c.stroke();c.setLineDash([]);}
 c.restore();
}
export function drawWorld(canvas,world,focusId='',now=0,online=false){
 if(!world)return;const c=canvas.getContext('2d');if(!c)return;
 const bounds=canvas.getBoundingClientRect();if(bounds.width<2||bounds.height<2)return;
 const dpr=Math.min(2,window.devicePixelRatio||1),bw=Math.round(bounds.width*dpr),bh=Math.round(bounds.height*dpr);
 if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
 const scale=bh/H,viewW=bw/scale,me=world.players.find(p=>p.id===focusId)||world.players[0]||{x:260};
 const viewX=clamp(me.x-viewW*.44,0,Math.max(0,W-viewW));
 c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,bw,bh);c.setTransform(scale,0,0,scale,-viewX*scale,0);
 background(c,viewX,viewW,now);
 const {solids,padActive,def}=terrain(world);
 // Sewing-thread paths connect the scene to the exit.
 c.strokeStyle='rgba(138,106,88,.13)';c.lineWidth=2;c.setLineDash([6,11]);c.beginPath();c.moveTo(55,GROUND-40);
 c.bezierCurveTo(250,GROUND-94,560,GROUND-105,1100,GROUND-65);c.stroke();c.setLineDash([]);
 solids.filter(p=>p.type==='floor').forEach(p=>fabric(c,p.x,p.y,p.w,p.h));
 solids.filter(p=>p.type==='block').forEach(p=>fabric(c,p.x,p.y,p.w,p.h,true));
 (def.pads||[]).forEach((x,i)=>drawButton(c,x,GROUND-9,!!padActive[i],i));
 (def.springs||[]).forEach(s=>drawSpring(c,s,now));
 (def.balls||[]).forEach((b,i)=>{if(world.balls[i])drawBall(c,world.balls[i],now)});
 if(def.gate)drawGate(c,def.gate,padActive.every(Boolean));
 drawDoor(c,world.exit.x,GROUND-47,world.players.every(p=>Math.abs(p.x-world.exit.x)<105),now);
 world.players.forEach((p,i)=>{
  if(p.grab&&p.grab.kind!=='wall'){
   const other=[...world.players,...world.balls].find(o=>o.id===p.grab.id);
   if(other){c.lineWidth=13;c.strokeStyle='#875b46';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(other.x,other.y);c.stroke();
    c.lineWidth=5;c.strokeStyle='#f4cfa4';c.setLineDash([4,6]);c.stroke();c.setLineDash([]);}
  }
 });
 world.players.forEach((p,i)=>drawHero(c,p,i,now,p.id===focusId));
 // Screen-edge collaborator location indicators.
 c.save();c.setTransform(1,0,0,1,0,0);
 world.players.forEach((p,i)=>{
  if(p.id===focusId)return;
  const x=(p.x-viewX)*scale;if(x>20&&x<bw-20)return;
  const edge=clamp(x,26,bw-26);circle(c,edge,bh*.5,13,COLORS[i%COLORS.length],'#fff2d7',3);
  c.fillStyle='#49362e';c.beginPath();c.moveTo(edge+(x<0?-6:6),bh*.5);c.lineTo(edge-(x<0?-1:1)*3,bh*.5-5);c.lineTo(edge-(x<0?-1:1)*3,bh*.5+5);c.fill();
 });
 c.restore();
}
