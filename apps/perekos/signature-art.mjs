import {drawForgeBallistic} from './forge-spells.mjs';
// Real state-driven pixel forms for the three non-projectile signature attacks.
// The picture never decides range, damage or contact; the fixed-step core does.
const colors={
 fire:['#fff0bf','#ffbe72','#ec7845','#873c31'],
 storm:['#f2ffe5','#a1ead9','#5da6ac','#356879'],
 stone:['#eae7c7','#afbea0','#667f69','#32493e']
};
const r=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,w,h)};
const clip=(n,low,high)=>Math.max(low,Math.min(high,n));
function stage(c,a,t,reduced,ground=false){
 const w=a.windup;if(!w||!Number.isFinite(w.remaining)||!w.total)return;
 const p=clip(1-w.remaining/w.total,0,1),tone=colors[w.kind==='coil'?'storm':'stone'];
 const x=a.x,y=a.y;
 c.save();c.globalAlpha=.35+.55*p;
 if(w.kind==='pebble'){
  if(ground){
   // Server-locked landing location makes the ballistic risk readable.
   const tx=w.x,ty=w.y;
   for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,rr=20+p*6;
    r(c,tx+Math.cos(angle)*rr,ty+Math.sin(angle)*rr,3,3,tone[i%3]);
   }
  }else{
   for(let i=0;i<8;i++){
    const angle=i*Math.PI/4+t*(reduced?0:.045),dist=25*(1-p)+5;
    const sx=x+Math.cos(angle)*dist,sy=y-12+Math.sin(angle)*dist*.65;
    r(c,sx,sy,5+(i%2)*2,3,tone[(i+1)%3]);
   }
   r(c,x-6,y-19-p*11,12,9,tone[1]);
   r(c,x-3,y-20-p*11,6,3,tone[0]);
  }
 }else if(w.kind==='coil'&&!ground){
  for(let i=0;i<7;i++){
   const d=i*2.7,px=x+Math.cos(w.angle)*d,py=y-15+Math.sin(w.angle)*d;
   const off=(i%2?-1:1)*(9-4*p);
   r(c,px-Math.sin(w.angle)*off,py+Math.cos(w.angle)*off,4,4,tone[i%3]);
  }
  for(let i=0;i<4;i++){
   const angle=i*Math.PI/2+p*1.1,rr=17-7*p;
   r(c,x+Math.cos(angle)*rr,y-12+Math.sin(angle)*rr,3,3,tone[0]);
  }
 }else if(w.kind==='slate'&&ground){
  for(let i=0;i<8;i++){
   const angle=w.angle+(i/7-.5)*1.2,d=12+13*p;
   r(c,x+Math.cos(angle)*d,y+Math.sin(angle)*d,4,3,tone[3-i%3]);
  }
 }
 c.restore();
}
function boulderGround(c,q,time,reduced){
 if(![q.x,q.y,q.progress,q.height].every(Number.isFinite))return;
 // The shadow is on the authoritative projected ground track, unlike the
 // elevated rock sprite. The landing mark is a real intended destination.
 c.save();
 c.globalAlpha=.32+q.progress*.4;
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,d=7+q.height*.13;
  r(c,q.x+Math.cos(a)*d,q.y+Math.sin(a)*d*.55,4,3,'#192d29');
 }
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,d=(q.radius||33)*(.62+.38*q.progress);
  r(c,q.tx+Math.cos(a)*d,q.ty+Math.sin(a)*d,3,3,colors.stone[i%3]);
 }
 c.restore();
}
function boulderFallback(c,q,time,reduced){
 if(![q.x,q.y,q.progress,q.height].every(Number.isFinite))return;
 const x=q.x,y=q.y-q.height,tone=colors.stone;
 c.save();c.globalAlpha=1;
 const roll=reduced?0:Math.floor(time*.27+q.owner)%4;
 const bits=[[-10,-4,8,6,3],[-7,-11,11,9,2],[3,-8,8,8,1],
  [-11,2,9,6,3],[-3,0,12,9,2],[4,3,6,5,1],[-1,-8,6,4,0]];
 for(const [px,py,w,h,color] of bits)r(c,x+px+(roll%2),y+py,w,h,tone[color]);
 c.restore();
}
function flame(c,f,t,reduced){
 const tone=colors.fire,dx=Math.cos(f.angle),dy=Math.sin(f.angle),len=clip(f.length,0,242);
 if(len<4)return;
 // Parallel rows fan out from the caster: a connected flame, not a stream of bullets.
 for(let d=4;d<len;d+=5){
  const width=(f.width||17)*(.2+.8*Math.sin(Math.PI*.55*d/Math.max(30,len)));
  const wiggle=reduced?0:Math.sin(t*.23+d*.24+f.owner)*2.4;
  for(let lane=-2;lane<=2;lane++){
   const off=(lane/2)*width*.53+wiggle;
   const x=f.x+dx*d-dy*off,y=f.y+dy*d+dx*off;
   r(c,x-2,y-2,5,5,tone[Math.abs(lane)===2?3:Math.abs(lane)===1?2:d%3?1:0]);
  }
 }
 // Two ember flecks break free in the direction of flow.
 if(!reduced)for(let k=0;k<2;k++){
  const d=12+(t*3+k*47)%Math.max(18,len-12),side=Math.sin(d*.6+t*.11+k)*8;
  r(c,f.x+dx*d-dy*side,f.y+dy*d+dx*side,3,3,tone[k]);
 }
}
function thunder(c,b,t,reduced){
 const dx=Math.cos(b.angle),dy=Math.sin(b.angle),len=clip(b.length,0,300),life=clip(b.life/.24,0,1);
 const nx=-dy,ny=dx,wobble=reduced?0:Math.floor(t/2)*.71+b.owner*2.3;
 c.save();c.globalAlpha=Math.min(1,life*2);
 for(let layer=0;layer<2;layer++)for(let d=5;d<len;d+=5){
  const off=(layer===0?1:-1)*(3+Math.sin(d*.14+wobble+layer)*5);
  const x=b.x+dx*d+nx*off,y=b.y+dy*d+ny*off;
  r(c,x-2,y-2,layer===0?6:3,layer===0?5:3,colors.storm[layer===0?0:2]);
  if(layer===0&&d%30<5)for(let k=1;k<=3;k++)
   r(c,x+nx*k*4,y+ny*k*4,3,3,colors.storm[k%2?1:3]);
 }
 c.restore();
}
function quake(c,w,t,reduced,ground){
 const front=clip(w.reach||0,0,w.range||110),fade=clip((w.life||0)/.3,0,1);
 const tone=colors.stone;
 if(front<3)return;
 c.save();c.globalAlpha=(ground?.34:.9)*Math.min(1,fade*3);
 const samples=ground?28:18;
 for(let k=0;k<=samples;k++){
  const angle=w.angle+((k/samples)*2-1)*w.halfAngle;
  for(let layer=0;layer<(ground?1:3);layer++){
   const d=front-layer*6;if(d<4)continue;
   const x=w.x+Math.cos(angle)*d,y=w.y+Math.sin(angle)*d;
   r(c,x,y,ground?6:4,ground?4:5,tone[ground?3:(k+layer)%3]);
  }
 }
 if(!ground&&!reduced){
  for(let i=0;i<10;i++){
   const d=front*(.5+(i%3)*.18),a=w.angle+Math.sin(i*4.7+t*.04)*w.halfAngle;
   r(c,w.x+Math.cos(a)*d,w.y+Math.sin(a)*d-3-(i%4)*3,3+i%2,3,tone[i%3]);
  }
 }
 c.restore();
}
export function drawSignatureGround(ctx,s,time=0,reduced=false){
 if(!s||s.phase!=='fight')return;
 for(const a of (s.actors||[]))stage(ctx,a,time,reduced,true);
 for(const q of (s.lobs||[]).slice(0,12))boulderGround(ctx,q,time,reduced);
 for(const w of (s.waves||[]).slice(0,2))quake(ctx,w,time,reduced,true);
}
export function drawSignatureForeground(ctx,s,time=0,reduced=false){
 if(!s||s.phase!=='fight')return;
 for(const a of (s.actors||[]))stage(ctx,a,time,reduced,false);
 if(!drawForgeBallistic(ctx,s.lobs,time,reduced))
  for(const q of (s.lobs||[]).slice(0,12))boulderFallback(ctx,q,time,reduced);
 for(const w of (s.waves||[]).slice(0,2))quake(ctx,w,time,reduced,false);
 for(const b of (s.beams||[]).slice(0,3))thunder(ctx,b,time,reduced);
 for(const f of (s.streams||[]).slice(0,2))flame(ctx,f,time,reduced);
 for(const a of s.actors||[])if((a.burn||0)>0){
  const tone=colors.fire;const n=reduced?2:4;
  for(let k=0;k<n;k++){
   const x=a.x+(k-1.5)*5,y=a.y-16-(time*2+k*7)%18;
   r(ctx,x,y,3,4,tone[(k+1)%3]);
  }
 }
}
