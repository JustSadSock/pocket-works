import { WORLD, ENGINES, MISSIONS, orbitalElements, altitude } from './physics.js';
const TAU = Math.PI * 2;
const stars = Array.from({length:90}, (_, i) => {
  let seed = ((i + 1) * 1103515245 + 12345) >>> 0;
  const rnd = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
  return {x:rnd(),y:rnd(),r:0.35+rnd()*1.35,a:.18+rnd()*.54};
});
export function canvasFrame(canvas) {
  const rect=canvas.getBoundingClientRect();
  const w=Math.max(1,rect.width),h=Math.max(1,rect.height);
  const dpr=Math.min(2.5,window.devicePixelRatio||1);
  const bw=Math.round(w*dpr),bh=Math.round(h*dpr);
  if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
  const c=canvas.getContext('2d');
  c.setTransform(dpr,0,0,dpr,0,0);
  return {c,w,h};
}
const rect=(c,x,y,w,h,fill)=>{c.fillStyle=fill;c.fillRect(x,y,w,h);};
const line=(c,x1,y1,x2,y2,color,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
function rocketComponent(c,x,y,w,h,color,index,active=true){
  const metal=c.createLinearGradient(x-w/2,0,x+w/2,0);
  metal.addColorStop(0,'#6d817d');metal.addColorStop(.16,color);metal.addColorStop(.48,'#e4e9dc');metal.addColorStop(.65,color);metal.addColorStop(1,'#566f70');
  c.fillStyle=metal;c.fillRect(x-w/2,y,w,h);
  rect(c,x-w/2,y+h-3,w,3,'#496466');
  line(c,x-w/2+2,y+3,x+w/2-2,y+3,'#eff3e8',1);
  c.fillStyle='#718a85';
  for(let k=-1;k<=1;k++){c.beginPath();c.arc(x+k*w*.32,y+h-7,1.3,0,TAU);c.fill();}
  if(!active){rect(c,x-w/2,y,w,h,'#15322d29');}
  if(index%2===0){rect(c,x-w/2+3,y+5,4,Math.max(0,h-12),'#b66c4f');}
}
function drawRocket(c,x,bottom,stageList,selected,scale=1,flight=false,thrust=0,t=0){
  c.save(); c.translate(x,bottom);c.scale(scale,scale);
  const segmentH=34,engineH=23;
  const widths=stageList.map((s,i)=> 61-Math.max(0,i)*10);
  let y=0, hits=[];
  for(let i=0;i<stageList.length;i++){
    const s=stageList[i],w=widths[i];
    const startY=y;
    c.fillStyle='#314848';c.beginPath();c.moveTo(-w*.26,5);c.lineTo(w*.26,5);c.lineTo(w*.4,-engineH);c.lineTo(-w*.4,-engineH);c.closePath();c.fill();
    rect(c,-w*.32,-8,w*.64,6,'#b6c7bc');
    if(flight&&i===0&&thrust>0){
      const a=Math.min(1,thrust);
      const len=28+Math.sin(t*26)*8+22*a;
      c.fillStyle='#ffd69b';c.beginPath();c.moveTo(-w*.25,5);c.quadraticCurveTo(-w*.3,len*.5,0,len);c.quadraticCurveTo(w*.3,len*.5,w*.25,5);c.closePath();c.fill();
      c.fillStyle='#e77943';c.beginPath();c.moveTo(-w*.13,6);c.lineTo(0,len*.73);c.lineTo(w*.13,6);c.fill();
    }
    y-=engineH;
    for(let j=0;j<s.tanks;j++){y-=segmentH;rocketComponent(c,0,y,w,segmentH,i===0?'#a4b9b0':'#9eb0a8',i+j);}
    if(s.fins){
      c.fillStyle='#bd6647';
      c.beginPath();c.moveTo(-w/2,startY-18);c.lineTo(-w/2-17,startY+9);c.lineTo(-w/2-18,startY-23);c.lineTo(-w/2,startY-48);c.closePath();c.fill();
      c.beginPath();c.moveTo(w/2,startY-18);c.lineTo(w/2+17,startY+9);c.lineTo(w/2+18,startY-23);c.lineTo(w/2,startY-48);c.closePath();c.fill();
    }
    rect(c,-w/2-2,y-5,w+4,6,'#475f5d');
    if(!flight&&selected===i){
      c.strokeStyle='#c76d49';c.lineWidth=2;c.setLineDash([5,4]);c.strokeRect(-w/2-12,y-11,w+24,startY-y+21);c.setLineDash([]);
      c.fillStyle='#a64f33';c.fillRect(-w/2-29,y+(startY-y)/2-11,17,22);
      c.fillStyle='#fff';c.font='bold 12px monospace';c.fillText(String(i+1),-w/2-25,y+(startY-y)/2+4);
    }
    hits.push({index:i,left:x-(w/2+26)*scale,right:x+(w/2+26)*scale,
      top:bottom+(y-14)*scale,bottom:bottom+(startY+12)*scale});
    if(i<stageList.length-1){y-=5;rect(c,-w*.37,y,w*.74,4,'#ad694c');}
  }
  c.fillStyle='#dadfd4';c.beginPath();c.moveTo(-21,y);c.lineTo(-18,y-14);c.lineTo(0,y-48);c.lineTo(18,y-14);c.lineTo(21,y);c.closePath();c.fill();
  line(c,-18,y-13,18,y-13,'#b16449',2);
  rect(c,-11,y-5,22,4,'#758e85');
  c.restore();
  return {hits, height:-y+52};
}
export function renderBuild(canvas,craft,selected){
  const {c,w,h}=canvasFrame(canvas);
  c.clearRect(0,0,w,h);
  for(let x=0;x<w;x+=22) line(c,x+.5,0,x+.5,h,'#8e9e9639');
  for(let y=0;y<h;y+=22) line(c,0,y+.5,w,y+.5,'#71877d34');
  const full=craft.reduce((a,s)=>a+s.tanks*34+28,0)+50;
  const scale=Math.min(1.02,(h-47)/full,w/145);
  const x=w*.50,by=h-25;
  // Assembly gantry is a working alignment reference.
  rect(c,x-84,20,3,h-28,'#7b908854');
  rect(c,x+83,20,3,h-28,'#7b908854');
  for(let y=24;y<h-20;y+=34){
    line(c,x-84,y,x-74,y,'#74867e83',1.3);line(c,x+74,y,x+84,y,'#74867e83',1.3);
  }
  line(c,14,h-13,w-14,h-13,'#667f7488',2);
  rect(c,x-44,h-22,88,9,'#63756c');
  rect(c,x-63,h-13,126,7,'#455c53');
  const rocket=drawRocket(c,x,by,craft,selected,scale,false,0,0);
  const labels=rocket.hits.map((r,i)=>({...r,index:i}));
  return labels;
}
function planetDetails(c,x,y,R){
  const grad=c.createRadialGradient(x-R*.44,y-R*.5,R*.02,x,y,R);
  grad.addColorStop(0,'#dc9370');grad.addColorStop(.51,'#9c573f');grad.addColorStop(1,'#4e3a35');
  c.fillStyle=grad;c.beginPath();c.arc(x,y,R,0,TAU);c.fill();
  c.save();c.beginPath();c.arc(x,y,R,0,TAU);c.clip();
  for(let i=0;i<19;i++){
    const sx=x+Math.sin(i*11.8)*R*.82,sy=y+Math.cos(i*8.13)*R*.78;
    c.beginPath();c.ellipse(sx,sy,R*(.07+(i%4)*.04),R*(.016+(i%3)*.019),i*.39,0,TAU);
    c.fillStyle=i%3===0?'#e1a17b27':'#422d2a21';c.fill();
  }
  c.restore();
}
function atmosphere(c,x,y,R){
  c.beginPath();c.arc(x,y,R+6,0,TAU);c.strokeStyle='#ba775f55';c.lineWidth=11;c.stroke();
}
function drawOrbit(c,w,h,f,t){
  rect(c,0,0,w,h,'#0c1921');
  for(const s of stars){c.fillStyle='rgba(240,245,237,'+s.a+')';c.beginPath();c.arc(s.x*w,s.y*h,s.r,0,TAU);c.fill();}
  const cx=w/2,cy=h*.53,R=Math.min(w*.34,h*.31);
  atmosphere(c,cx,cy,R);
  planetDetails(c,cx,cy,R);
  const o=orbitalElements(f.x,f.y,f.vx,f.vy);
  const scale=R/WORLD.radius;
  const rx=f.x,ry=f.y,vx=f.vx,vy=f.vy,r=Math.hypot(rx,ry),speed2=vx*vx+vy*vy,dot=rx*vx+ry*vy;
  let ex=((speed2-WORLD.mu/r)*rx-dot*vx)/WORLD.mu;
  let ey=((speed2-WORLD.mu/r)*ry-dot*vy)/WORLD.mu;
  const e=Math.hypot(ex,ey);
  if(e>1e-6){ex/=e;ey/=e;}else{ex=0;ey=1;}
  const p=(rx*vy-ry*vx)**2/WORLD.mu;
  c.lineWidth=1.8;c.strokeStyle='#f4bb8b';c.setLineDash([5,3]);c.beginPath();
  const maxAngle= e>=1?Math.acos(Math.max(-1,Math.min(1,-1/e)))*.94:Math.PI;
  const steps=240;
  for(let i=0;i<=steps;i++){
    const nu=-maxAngle+2*maxAngle*i/steps,denom=1+e*Math.cos(nu);
    if(denom<=.01)continue;
    const rr=Math.min(WORLD.radius*10,p/denom);
    const px=rr*(ex*Math.cos(nu)-ey*Math.sin(nu));
    const py=rr*(ey*Math.cos(nu)+ex*Math.sin(nu));
    const sx=cx+px*scale,sy=cy-py*scale;
    if(i===0)c.moveTo(sx,sy);else c.lineTo(sx,sy);
  }
  c.stroke();c.setLineDash([]);
  const px=cx+f.x*scale,py=cy-f.y*scale;
  c.fillStyle='#fff';c.beginPath();c.arc(px,py,5,0,TAU);c.fill();
  c.strokeStyle='#eead7a';c.beginPath();c.arc(px,py,9,0,TAU);c.stroke();
  const target=MISSIONS[f.missionIndex];
  c.strokeStyle='#71b19e77';c.lineWidth=4;
  c.beginPath();c.arc(cx,cy,(WORLD.radius+target.min)*scale,0,TAU);c.stroke();
  c.beginPath();c.arc(cx,cy,(WORLD.radius+target.max)*scale,0,TAU);c.stroke();
  c.fillStyle='#c5d6d4';c.font='bold 11px Arial';c.fillText('ПРОГНОЗ ОРБИТЫ',14,h*.23);
  c.font='10px monospace';c.fillStyle='#86b4ad';c.fillText('ЦЕЛЕВОЙ КОРИДОР',14,h*.23+16);
  const ap=Number.isFinite(o.apoAlt)?Math.round(o.apoAlt/1000)+' км':'УХОД';
  const pe=Math.round(o.periAlt/1000)+' км';
  c.fillStyle='#f6c19a';c.font='11px monospace';c.fillText('AP '+ap+'  /  PE '+pe,14,h*.23+35);
}
export function renderFlight(canvas,f,map,t){
  const {c,w,h}=canvasFrame(canvas);
  if(map){drawOrbit(c,w,h,f,t);return;}
  const alt=Math.max(0,altitude(f));
  const atmos=Math.exp(-alt/30000);
  const sky=c.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#101d28');
  sky.addColorStop(1,alt<20000?'#8c5950':'#1b3037');
  rect(c,0,0,w,h,sky);
  for(const s of stars){c.fillStyle='rgba(235,243,241,'+(s.a*(1-atmos*.85))+')';c.beginPath();c.arc(s.x*w,s.y*h,s.r,0,TAU);c.fill();}
  const rocketY=h*.54, pxScale=Math.max(32,alt/(h*.32));
  const worldR=WORLD.radius/pxScale;
  const planetY=rocketY+(WORLD.radius+alt)/pxScale;
  if(planetY-worldR<h){
    atmosphere(c,w*.5,planetY,worldR);
    planetDetails(c,w*.5,planetY,worldR);
    if(alt<5000){
      const elevation=h*.84+Math.sin(f.t*.018)*3;
      rect(c,0,elevation,w,h-elevation,'#6f4335');
      for(let i=0;i<18;i++){
        const xx=((i*73.7+20)%w), yy=elevation+((i*7)%11);
        line(c,xx,yy,xx+5,yy-3,'#c0805b',1);
      }
    }
  }
  // Vehicle camera locked to craft, not to the inertial world.
  const activeStages=f.stages.slice(f.stageIndex);
  const rocketHeight=activeStages.reduce((a,s)=>a+s.tanks*34+28,0)+52;
  const scale=Math.min(.95, Math.max(.52,(h*.29)/rocketHeight));
  c.save();
  c.translate(w*.5,rocketY);
  c.rotate(f.pitch*Math.PI/180);
  drawRocket(c,0,rocketHeight*.42*scale,activeStages,-1,scale,true,
    f.fuel[f.stageIndex]>0?f.throttle:0,t);
  c.restore();
  if(alt<60000){
    const alpha=Math.min(.4,Math.exp(-alt/29000)*.4);
    rect(c,0,0,w,h,'rgba(172,105,75,'+alpha*.1+')');
  }
}
