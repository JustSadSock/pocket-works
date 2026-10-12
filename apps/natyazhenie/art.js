const colors=['#ff7282','#70c7f5','#8fdb8d','#ffc968','#b7a1f4'],ink='#25304b';
const themes=['#bceffa','#fbd8e6','#e4def9','#ffe8b3','#ccecdf','#ffdcc7'];
const box=(c,x,y,w,h,r,color,stroke=ink)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.lineWidth=3;c.strokeStyle=stroke;c.stroke();}};
const dot=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,7);c.fillStyle=color;c.fill();};
let cameraX=590,cameraY=0;
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const tensionMemory=new Map();
const active=(w,key)=>!w.stage.sequence?.length||w.stage.sequence[w.phase]===key;
// Positive y is downward in Canvas world coordinates. Gravity therefore adds
// positive y displacement regardless of which endpoint is left or right.
export function rubberPoints(start,end,{time=0,tight=0,reduced=false}={}){
 const dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy)||1;
 const segments=Math.max(8,Math.ceil(len/18)*2);
 const slack=Math.pow(1-clamp(tight,0,1),1.45);
 const sag=slack*Math.min(43,len*.22);
 const oscillation=reduced?0:Math.min(sag*.22,slack*2.6);
 const pts=[];
 for(let i=0;i<=segments;i++){
  const t=i/segments,b=Math.sin(Math.PI*t);
  const displacement=(sag+oscillation*Math.sin(t*Math.PI*3-time*5))*b;
  pts.push({x:start.x+dx*t,y:start.y+dy*t+displacement});
 }
 return pts;
}
function rubber(c,start,end,time,tight,reduced){
 const pts=rubberPoints(start,end,{time,tight,reduced});
 const stroke=()=>{c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);};
 c.lineJoin='round';c.lineCap='round';
 stroke();c.strokeStyle='#27314a';c.lineWidth=14-tight*4;c.stroke();
 const grad=c.createLinearGradient(start.x,start.y,end.x,end.y);
 grad.addColorStop(0,'#ffdfc7');grad.addColorStop(.45,tight>.72?'#ff8295':'#ffb5aa');grad.addColorStop(1,'#ffcecc');
 stroke();c.strokeStyle=grad;c.lineWidth=10-tight*4;c.stroke();
 stroke();c.strokeStyle='#fff1dbb8';c.lineWidth=2.2-tight*.8;c.stroke();
 c.strokeStyle=tight>.8?'#ffdae0':'#dc829c';c.lineWidth=1.6;
 for(let i=3;i<pts.length-3;i+=5){
  const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
  c.beginPath();c.moveTo(a.x-dy/d*4,a.y+dx/d*4);c.lineTo(a.x+dy/d*4,a.y-dx/d*4);c.stroke();
 }
 if(tight>.58&&!reduced){
  const p=pts[Math.floor((time*2.5%1)*(pts.length-1))];
  dot(c,p.x,p.y,2.5+tight*1.5,'#fff8e4');
 }
}

export function paint(canvas,world,{self='',time=0,cover=false,reduced=false}={}){
 const c=canvas.getContext('2d',{alpha:false});if(!c||!world?.stage)return;
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,2);
 const cw=Math.round(w*dpr),ch=Math.round(h*dpr);if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 c.setTransform(dpr,0,0,dpr,0,0);
 const s=world.stage,scale=cover?Math.max(w/900,h/620):w/h<1.46?Math.max(h/620,w/840):Math.max(w/1180,h/620);
 const visible=w/scale,me=world.players?.find(p=>p.id===self);
 let target=590;if(w/h<1.46&&!cover)target=Math.max(visible/2,Math.min(1180-visible/2,(me?.x||world.players[0]?.x||590)+visible*.13));
 if(cover)target=550;cameraX+=(target-cameraX)*.18;if(w/h>=1.46&&!cover)cameraX=590;
 const low=Math.max(0,...(world.players||[]).map(p=>p.y));
 const targetY=cover?0:Math.max(0,Math.min(150,(low-566)*.72));
 cameraY+=(targetY-cameraY)*.15;
 c.fillStyle=themes[s.theme||0];c.fillRect(0,0,w,h);
 c.save();c.translate(w/2-cameraX*scale,(w/h>=1.46&&!cover?h-620*scale:(h-620*scale)/2)-cameraY*scale);c.scale(scale,scale);
 for(let i=0;i<7;i++){let x=80+i*210,y=100+i%3*58;dot(c,x,y,24,'#ffffff95');dot(c,x+24,y-9,30,'#ffffff95');dot(c,x+53,y,20,'#ffffff95');}
 c.beginPath();c.moveTo(-200,620);for(let x=-200;x<=1380;x+=18)c.lineTo(x,478+Math.sin(x/125+s.theme)*24);c.lineTo(1380,620);c.closePath();c.fillStyle='#91dfc4';c.fill();
 c.beginPath();c.moveTo(-200,620);for(let x=-200;x<=1380;x+=18)c.lineTo(x,525+Math.sin(x/93)*15);c.lineTo(1380,620);c.closePath();c.fillStyle='#6fcbbd';c.fill();
 for(const lift of s.lifts||[]){
  const py=lift.y+Math.sin((world.clock||0)*Math.PI*2/lift.period)*lift.amp;
  c.beginPath();c.moveTo(lift.x+lift.w/2,py+lift.h);c.lineTo(lift.x+lift.w/2,543);
  c.strokeStyle='#ffffffbc';c.lineWidth=5;c.setLineDash([8,8]);c.stroke();c.setLineDash([]);
 }
 const bridge=s.rescue&&(world.phase||0)>=1?[{x:439,y:530-22*Math.max(0,Math.min(1,(world.phaseTime||0)/.55)),w:136,h:18}]:[];
 const platforms=[...s.floors,...s.platforms,...bridge,...(s.ferry?[{...s.ferry,x:world.ferryX??s.ferry.x}]:[]),...(s.lifts||[]).map(l=>({...l,y:l.y+Math.sin((world.clock||0)*Math.PI*2/l.period)*l.amp}))];
 for(const p of platforms){
  box(c,p.x,p.y,p.w,p.h,8,'#ffe3a7');
  box(c,p.x+2,p.y+2,p.w-4,13,5,'#9ee6b2',null);
  c.save();c.beginPath();c.rect(p.x+4,p.y+21,p.w-8,p.h-24);c.clip();
  for(let x=p.x-50;x<p.x+p.w+50;x+=36){c.beginPath();c.moveTo(x,p.y+p.h);c.lineTo(x+40,p.y+15);c.strokeStyle='#dfbd85';c.lineWidth=2;c.stroke();}c.restore();
 }

 // The physical task is self-explanatory from the moving objects, no HUD prose.
 for(let i=0;i<(s.balances||[]).length;i++){
  const beam=s.balances[i],tilt=world.beamTilt?.[i]||0,charge=world.beamCharge?.[i]||0;
  dot(c,beam.x,beam.y+39,31,'#ffffff7a');
  box(c,beam.x-8,beam.y-2,16,45,6,'#f3ce9c');
  c.save();c.translate(beam.x,beam.y);c.rotate(tilt*.3);
  box(c,-109,-8,218,16,7,charge>=1?'#96e2ae':'#fde4ac');
  for(const direction of [-1,1]){
   box(c,direction*77-22,-24,44,20,6,charge>=1?'#8ce5b7':'#f7b7cf');
   dot(c,direction*77,-29,5,'#ffffffaf');
  }
  c.restore();
  box(c,beam.x-48,beam.y-79,96,12,6,'#fffbee');
  if(charge>0)box(c,beam.x-43,beam.y-75,86*charge,5,3,'#7dcfa0',null);
 }
 if(s.ferry){
  const x=world.ferryX??s.ferry.x;
  c.save();c.setLineDash([7,12]);
  c.beginPath();c.moveTo(s.ferry.start+s.ferry.w/2,s.ferry.y+30);c.lineTo(s.ferry.end+s.ferry.w/2,s.ferry.y+30);
  c.strokeStyle='#ffffffa9';c.lineWidth=5;c.stroke();c.restore();
  for(const side of [x+18,x+s.ferry.w-18]){
   dot(c,side,s.ferry.y+16,8,'#c39de5');dot(c,side,s.ferry.y+16,3,'#fff8df');
  }
  if(!world.ferryDone){
   c.font='900 34px system-ui';c.fillStyle='#fff8df';c.textAlign='center';
   c.fillText('→',x+s.ferry.w/2,s.ferry.y-27);
  }
 }
 if(s.cargo){
  for(const [i,wall] of s.cargo.barriers.entries()){
   box(c,wall.x,wall.y,wall.w,wall.h,6,i%2?'#bca4f4':'#ffb1bc');
   for(let k=0;k<4;k++){dot(c,wall.x+wall.w/2,wall.y+15+k*25,4,'#fffce6');}
  }
  dot(c,s.cargo.end,378,48,'#ffffff82');
  c.beginPath();c.arc(s.cargo.end,378,29,0,Math.PI*2);
  c.strokeStyle='#7ed8ab';c.lineWidth=9;c.stroke();
 }
 for(let i=0;i<(s.waveSlots||[]).length;i++){
  const slot=s.waveSlots[i],isNext=s.waveSequence?.[world.waveIndex||0]===i&&!world.gateOpen;
  const on=world.waveIndex>0&&world.waveSequence?.length>0;
  dot(c,slot.x,537,isNext?28:24,isNext?'#fffef4':'#ffffff99');
  box(c,slot.x-29,535,58,7,4,colors[i%5]);
  c.font='900 16px system-ui';c.textAlign='center';c.fillStyle=ink;c.fillText(i+1,slot.x,529);
  if(isNext&&!reduced){c.beginPath();c.arc(slot.x,488,24+Math.sin(time*8)*4,0,7);
   c.strokeStyle=colors[i%5];c.lineWidth=5;c.stroke();}
 }
 for(const h of s.hooks||[]){
  // Fixed little peg: the band rests in a visible notch.
  dot(c,h.x,h.y+14,28,'#ffffff79');
  box(c,h.x-10,h.y-6,20,43,9,'#ffe6a1');
  dot(c,h.x,h.y,13,'#fff7c8');dot(c,h.x,h.y,5,'#f3a3bd');
 }
 for(let i=0;i<(s.wheels||[]).length;i++){
  const h=s.hooks[s.wheels[i]];if(!h)continue;
  const done=world.wheelDone?.[i],charge=world.wheelCharge?.[i]||0;
  if(!active(world,'wheels')&&!done)c.globalAlpha=.3;
  c.save();c.translate(h.x,h.y);c.rotate(reduced?charge*4:(world.clock||0)*Math.PI*.13);
  dot(c,0,0,25,done?'#a8efbd':'#ffead0');
  c.lineWidth=5;c.strokeStyle=done?'#42bd80':'#f6a5ad';
  c.beginPath();c.arc(0,0,20,-Math.PI/2,-Math.PI/2+Math.PI*2*charge);c.stroke();
  for(let j=0;j<6;j++){let a=j*Math.PI/3;dot(c,Math.cos(a)*15,Math.sin(a)*15,3.3,'#ffffff');}
  dot(c,0,0,8,done?'#71cb98':'#f6c36c');c.restore();
  c.globalAlpha=1;
 }
 for(const spring of s.springs){
  const buzz=reduced?0:Math.sin(time*13+spring.x)*2;
  box(c,spring.x-30,526,60,13,5,'#e2a7f7');box(c,spring.x-32,509+buzz,64,11,5,'#f9cdf9');
  for(let i=0;i<3;i++){dot(c,spring.x-17+i*17,500+(reduced?0:Math.sin(time*7+i)*3),2.8,'#ffffffc0');}
 }
 const activeGoal=active(world,'pads');
 s.pads.forEach((p,i)=>{
  const engaged=!!world.pads?.[i],active=engaged&&activeGoal,drop=engaged?6:0,glow=engaged?Math.max(.16,world.plateCharge||0):0;
  if(active){dot(c,p.x,p.y-9,41,'#ffffff49');for(let j=0;j<4;j++){
   const a=j*Math.PI/2+(reduced?0:time*2);
   dot(c,p.x+Math.cos(a)*29,p.y-17+Math.sin(a)*9,3.6,'#fff6b0');
  }}
  box(c,p.x-31,p.y-10,62,13,6,active?colors[i%5]:'#fdf9e9');
  box(c,p.x-18,p.y-17+drop,36,9,4,active?'#faffc0':'#aeb9bf');
  c.font='900 11px system-ui';c.textAlign='center';c.fillStyle=ink;c.fillText(String(i+1),p.x,p.y-21+drop);
 });
 for(let i=0;i<(s.beacons||[]).length;i++){
  const b=s.beacons[i],on=!!world.beacons?.[i];
  c.save();if(!active(world,'beacons')&&!on)c.globalAlpha=.32;
  const radius=on?20:23+(reduced?0:Math.sin(time*4+i)*2);
  dot(c,b.x,b.y,radius,on?'#9df3c1':'#ffffff8c');
  c.beginPath();c.arc(b.x,b.y,13,0,Math.PI*2);c.strokeStyle=on?'#36b976':'#f196c4';c.lineWidth=7;c.stroke();
  dot(c,b.x,b.y,5,on?'#36b976':'#fff0a1');c.restore();
 }
 // Weighted beam: its real-time tilt communicates both the target and the wind.
 if(s.balance){
  const b=s.balance,charge=world.balanceCharge||0,tilt=clamp(world.balanceTilt||0,-1,1);
  box(c,b.x-10,b.y+7,20,36,6,'#f1d2a0');
  dot(c,b.x,b.y+6,11,'#fee8b8');
  c.save();c.translate(b.x,b.y);c.rotate(tilt*.14);
  box(c,-142,-10,284,20,9,charge>=1?'#8dddb2':'#fff0c8');
  for(const side of [-1,1]){
   box(c,side*103-25,-30,50,20,6,'#c7a7e3');
   c.beginPath();c.arc(side*111,-12,3,0,7);c.fillStyle='#ffffff';c.fill();
  }
  c.restore();
  box(c,b.x-83,b.y-65,166,16,8,'#fffdf4');
  if(charge>0)box(c,b.x-78,b.y-61,156*charge,8,4,'#a2dcba',null);
  if(active(world,'balance')&&charge<1){
   c.font='900 12px system-ui';c.textAlign='center';c.fillStyle=ink;
   c.fillText('ДЕРЖИ РАВНОВЕСИЕ',b.x,b.y-76);
  }
 }
 for(let i=0;i<(s.signals||[]).length;i++){
  const lens=s.signals[i],captured=i<(world.signalIndex||0)||(world.signalDone||false);
  const shown=active(world,'signals'),radius=shown?23:17;
  c.save();if(!shown&&!captured)c.globalAlpha=.3;
  dot(c,lens.x,lens.y,radius+9,'#ffffff72');
  c.beginPath();c.arc(lens.x,lens.y,radius,0,Math.PI*2);
  c.strokeStyle=captured?'#40be96':'#cf81c5';c.lineWidth=7;c.stroke();
  c.beginPath();c.arc(lens.x,lens.y,radius-8,0,Math.PI*2);
  c.strokeStyle='#fffbea';c.lineWidth=3;c.stroke();
  dot(c,lens.x,lens.y,captured?8:5,captured?'#4fceac':'#ffe69e');
  if(shown&&!captured&&!reduced){
   c.beginPath();c.arc(lens.x,lens.y,23+Math.sin(time*4+i)*2,0,Math.PI*2);
   c.strokeStyle='#ffffffa0';c.lineWidth=2;c.stroke();
  }
  c.restore();
 }
 if(active(world,'signals')&&(world.signalIndex||0)>0&&!world.signalDone){
  box(c,450,110,280,15,7,'#fffdf4');
  box(c,455,114,270*clamp((world.signalLeft||0)/(s.signalWindow||5),0,1),7,4,'#f8b3c5',null);
 }
 for(const hazard of s.hazards||[]){
  const speed=s.kind==='lift'&&(world.phase||0)>0?1.5:1;
  const x=hazard.x+Math.sin((world.clock||0)*speed*Math.PI*2/hazard.period)*hazard.amp,y=hazard.y;
  dot(c,x,y,hazard.r+8,'#fff1ba85');dot(c,x,y,hazard.r,'#ffa1a6');
  c.save();c.translate(x,y);c.rotate(reduced?0:time*4);
  c.strokeStyle=ink;c.lineWidth=4;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;c.beginPath();c.moveTo(Math.cos(a)*8,Math.sin(a)*8);c.lineTo(Math.cos(a)*hazard.r,Math.sin(a)*hazard.r);c.stroke();}
  dot(c,0,0,6,'#fff9e5');c.restore();
 }
 if(!world.gateOpen)box(c,s.gate.x,328,s.gate.w,212,4,'#f7a4c7');
 box(c,1080,444,83,96,18,world.gateOpen?'#83dfa9':'#fff2bf');box(c,1090,452,62,86,12,world.gateOpen?'#f3ffdd':'#dfdadd');
 c.font='1000 33px system-ui';c.fillStyle=ink;c.textAlign='center';c.fillText('→',1121,506);
 s.stars.forEach((p,i)=>{if(world.stars?.[i])return;c.save();if(!active(world,'stars'))c.globalAlpha=.25;const y=p.y+(reduced?0:Math.sin(time*3+i)*4);dot(c,p.x,y,27,'#ffffff99');c.save();c.translate(p.x,y);c.rotate(reduced?0:time);c.beginPath();for(let n=0;n<10;n++){const a=n*Math.PI/5-Math.PI/2,r=n%2?9:21;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fillStyle='#ffe06d';c.fill();c.lineWidth=3;c.strokeStyle=ink;c.stroke();c.restore();c.restore();});
 if(s.kind==='braid'){
  for(let i=0;i<(s.hooks||[]).length;i++){
   const h=s.hooks[i],latched=world.wraps?.[i]===i;
   dot(c,h.x,h.y-30,8,latched?'#72dca6':'#fff1d1');
  }
  box(c,429,45,322,18,8,'#fffdf1');
  if((world.braidCharge||0)>0)box(c,435,50,310*(world.braidCharge||0),8,4,'#88dcaa',null);
  if(world.braidDone){
   c.font='900 26px system-ui';c.textAlign='center';c.fillStyle=ink;
   c.fillText((world.escapeLeft||0).toFixed(1)+' с',590,96);
  }
 }
 const players=world.players||[];
 for(let i=0;i<players.length-1;i++){
  const a=players[i],b=players[i+1],pin=s.hooks?.[world.wraps?.[i]];
  const path=pin?[a,pin,b]:[a,b];
  let length=0;for(let j=1;j<path.length;j++)length+=Math.hypot(path[j].x-path[j-1].x,path[j].y-path[j-1].y);
  const targetTight=clamp((length-118)/132,0,1);
  const memoryKey=(s.index||0)+':'+a.id+'-'+b.id;
  const previous=tensionMemory.get(memoryKey)??targetTight;
  const tight=mix(previous,targetTight,reduced?1:.18);
  tensionMemory.set(memoryKey,tight);
  c.save();
  for(let j=1;j<path.length;j++)rubber(c,path[j-1],path[j],time,tight,reduced);
  c.restore();
 }

 if(s.cargo&&world.cargoBall){
  const ball=world.cargoBall;
  const a=players[0],b=players[players.length-1];
  if(a&&b){
   c.beginPath();c.moveTo(a.x,a.y-12);c.lineTo(ball.x,ball.y-7);c.lineTo(b.x,b.y-12);
   c.strokeStyle='#9f809ec0';c.lineWidth=3;c.setLineDash([5,6]);c.stroke();c.setLineDash([]);
  }
  dot(c,ball.x,ball.y,22,'#25304b');dot(c,ball.x,ball.y,18,'#fff4b6');
  dot(c,ball.x-6,ball.y-5,5,'#ffffffce');dot(c,ball.x+7,ball.y+6,4,'#f5bfc1');
  if(ball.cracks){c.beginPath();c.moveTo(ball.x-3,ball.y-12);c.lineTo(ball.x+2,ball.y-5);c.lineTo(ball.x-4,ball.y+2);
   c.lineTo(ball.x+5,ball.y+12);c.lineWidth=2;c.strokeStyle='#f6a3a8';c.stroke();}
 }
 players.forEach((p,i)=>{
  const local=players[i-1]||players[i+1],dist=local?Math.hypot(p.x-local.x,p.y-local.y):0;
  const strain=Math.max(0,Math.min(1,(dist-118)/132));
  const squish=Math.max(0,Math.min(1,p.squash||0));
  const ascending=Math.max(0,Math.min(1,-(p.vy||0)/680));
  const airborne=!p.ground&&!p.anchor;
  const sw=1+squish*.2-ascending*.12-strain*.07,sh=1-squish*.2+ascending*.19+strain*.15;
  const step=p.anchor?0:reduced?0:Math.sin(time*13.5+i*1.5)*Math.min(3.5,Math.abs(p.vx||0)/75);
  const lean=p.anchor?0:Math.max(-.2,Math.min(.2,(p.vx||0)/1180));
  const blink=!reduced&&Math.sin(time*.74+i*2.1)> .991;
  const worried=!!p.hang||Math.abs(p.vy||0)>520||strain>.87;
  const glance=local?Math.max(-2.5,Math.min(2.5,(local.x-p.x)/95)):0;
  if(p.anchor){dot(c,p.x,p.y+18,25,'#ffffff99');box(c,p.x-18,p.y+16,36,9,3,'#6cc89a');}
  if((p.hang||0)>0){
   for(let k=0;k<4;k++){const z=time*2+k*1.57;dot(c,p.x+Math.cos(z)*26,p.y+Math.sin(z)*28,3,'#fff8df');}
  }
  c.save();c.translate(p.x,p.y);c.rotate(lean+(p.hang?Math.sin(time*7+i)*.08:0));
  // Feet follow a rubbery spring instead of floating with the body.
  box(c,-14,11+step,12,10,4,ink,null);box(c,2,11-step,12,10,4,ink,null);
  c.save();c.scale(sw,sh);
  box(c,-19,-21+(p.anchor?2:0),38,40,11,colors[i%5]);
  box(c,-14,-17,28,8,4,'#ffffff78',null);
  const look=glance*(p.anchor?.4:1);
  if(blink){box(c,-10+look,-1,8,2,1,ink,null);box(c,4+look,-1,8,2,1,ink,null);}
  else{dot(c,-7+look,-1,3.5,ink);dot(c,7+look,-1,3.5,ink);}
  if(worried){dot(c,0,9,4.1,ink);dot(c,0,8,1.1,'#ffdedb');}
  else if(p.anchor){box(c,-5,8,10,2.5,1,ink,null);}
  else{c.beginPath();c.arc(0,7,4,.16,Math.PI-.16);c.lineWidth=2;c.strokeStyle=ink;c.stroke();}
  if(strain>.7){dot(c,-13,7,3,'#ffa7ad');dot(c,13,7,3,'#ffa7ad');}
  c.restore();c.restore();
  if(self===p.id&&!cover){
   c.beginPath();c.arc(p.x,p.y,29,Math.PI*1.05,Math.PI*1.95);c.strokeStyle='#fffdf2';c.lineWidth=4;c.stroke();
  }
  if(!cover){
   const name=String(p.name||'').slice(0,13);c.font='900 12px system-ui';
   const ww=Math.max(44,c.measureText(name).width+14);
   box(c,p.x-ww/2,p.y-49,ww,20,7,'#fffdf3');
   c.textAlign='center';c.fillStyle=ink;c.fillText(name,p.x,p.y-35);
  }
 });

 if(s.sequence?.length&&!world.gateOpen&&s.kind!=='pulse'&&s.kind!=='balance'){
  const goal=s.sequence[Math.min(world.phase||0,s.sequence.length-1)];
  const names={wheels:'ЗАЦЕПИ ЛЕНТУ',stars:'СОБЕРИ ИСКРЫ',pads:'УДЕРЖИ КНОПКИ',
   beacons:'ПРОВЕДИ ЧЕРЕЗ КОЛЬЦО',tension:'НАТЯГИВАЙ',rescue:'СПАСИ ДРУГА',
   signals:'ЛОВИ СИГНАЛЫ',balance:'УДЕРЖИ РАВНОВЕСИЕ'};
  box(c,382,16,416,34,14,'#fffdf2');
  c.font='900 16px system-ui';c.fillStyle=ink;c.textAlign='center';
  c.fillText((world.phase+1)+'/'+s.sequence.length+'  '+(names[goal]||''),590,38);
 }
 if(s.kind==='pulse'&&world.waveIndex>0&&!world.gateOpen){
  const steps=s.waveSequence.length,charge=world.waveIndex/steps;
  box(c,390,38,400,14,7,'#fffdf2');box(c,396,42,388*charge,6,3,'#ffa2b2',null);
 }
 if(s.tension){
  box(c,390,45,400,43,17,'#fffdf2');
  const fill=Math.max(0,Math.min(1,world.tensionCharge||0));
  if(fill>0)box(c,397,53,386*fill,27,11,'#ffb7ca',null);
  c.font='900 17px system-ui';c.fillStyle=ink;c.textAlign='center';
  c.fillText(world.tensionDone?'ЗАРЯЖЕНО!':'НАТЯНИ И ДЕРЖИ',590,73);
 }
 if(s.escape&&world.gateOpen){
  box(c,466,111,247,39,14,'#fffdf2');
  c.font='900 20px system-ui';c.textAlign='center';c.fillStyle=ink;
  c.fillText('УСПЕТЬ!  '+(world.escapeLeft||0).toFixed(1)+' с',590,138);
 }
 if(s.hold&&!world.gateOpen&&s.pads.length&&world.plateCharge>0){
  box(c,470,99,240,17,8,'#ffffffc8');
  box(c,475,103,230*world.plateCharge,9,5,'#8fe3b0',null);
 }
 if(cover){c.font='1000 27px system-ui';c.textAlign='center';c.fillStyle=ink;c.fillText('НЕ ОТПУСКАЙ!',560,215);}
 c.restore();
}
export function coverWorld(){
 return {stage:{theme:0,hooks:[],wheels:[],sequence:[],signals:[],balance:null,floors:[{x:0,y:540,w:480,h:80},{x:600,y:540,w:580,h:80}],platforms:[],lifts:[],hazards:[],beacons:[],springs:[],stars:[{x:585,y:310}],pads:[{x:455,y:540},{x:724,y:540}],gate:{x:1036,y:0,w:31,h:540},stretch:0},
 players:[{id:'a',name:'',x:355,y:455,vx:-20},{id:'b',name:'',x:747,y:390,vx:50}],pads:[false,true],stars:[false],gateOpen:false,stretch:0};
}


// Authored diagrams on the pre-level book, drawn from the same miniature world language.
export function paintBook(canvas,stage){
 if(!canvas||!stage)return;
 const c=canvas.getContext('2d');if(!c)return;
 const dpr=Math.min(2,typeof devicePixelRatio==='number'?devicePixelRatio:1);
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 c.setTransform(canvas.width/600,0,0,canvas.height/360,0,0);
 c.clearRect(0,0,600,360);
 const doodle=(x,y,color,tilt=0)=>{
  c.save();c.translate(x,y);c.rotate(tilt);
  box(c,-26,-32,52,60,16,color);box(c,-16,23,12,12,4,ink,null);
  box(c,4,23,12,12,4,ink,null);dot(c,-9,-9,4,ink);dot(c,10,-9,4,ink);
  c.beginPath();c.arc(1,2,6,.18,Math.PI-.18);c.lineWidth=2;c.strokeStyle=ink;c.stroke();c.restore();
 };
 const platform=(x,y,width)=>{box(c,x,y,width,25,7,'#ffe8b5');box(c,x+4,y+3,width-8,8,4,'#97deb8',null);};
 const strand=(a,b,color='#fa93a4')=>{c.beginPath();c.moveTo(a[0],a[1]);c.quadraticCurveTo((a[0]+b[0])/2,(a[1]+b[1])/2+20,b[0],b[1]);
  c.lineWidth=14;c.lineCap='round';c.strokeStyle=ink;c.stroke();c.lineWidth=9;c.strokeStyle=color;c.stroke();};
 c.save();
 // Framing lines evoke the opening pages of a tactile instruction book.
 c.strokeStyle='#bf885060';c.lineWidth=2;
 c.beginPath();c.moveTo(18,302);c.lineTo(582,302);c.stroke();
 if(stage.kind==='balance'){
  platform(49,248,510);
  for(const x of [235,407]){
   box(c,x-9,215,18,33,5,'#e0b27d');c.save();c.translate(x,215);c.rotate(x===235?.16:-.16);
   box(c,-100,-8,200,16,6,'#f4c994');c.restore();dot(c,x,221,10,'#fff5d6');
  }
  doodle(105,197,colors[0],-.12);doodle(308,184,colors[1]);doodle(508,197,colors[2],.1);
  strand([130,197],[282,184]);strand([334,184],[482,197]);
 }else if(stage.kind==='ferry'){
  platform(33,256,220);platform(455,256,120);
  box(c,245,200,205,23,10,'#ffc8a3');box(c,270,217,13,25,5,'#c7a4ee');box(c,407,217,13,25,5,'#c7a4ee');
  doodle(127,203,colors[0],-.1);doodle(340,151,colors[1],.08);doodle(403,152,colors[2],-.06);
  strand([150,202],[316,154]);strand([365,151],[379,152]);
  c.font='900 36px system-ui';c.fillStyle=ink;c.fillText('→',340,270);
 }else if(stage.kind==='cargo'){
  platform(37,262,536);
  for(const [x,y,hh] of [[204,95,123],[386,146,113]]){
   box(c,x,y,26,hh,6,'#d5b1e8');for(let i=0;i<4;i++)dot(c,x+13,y+14+i*25,3.5,'#fffaf0');
  }
  doodle(88,225,colors[0]);doodle(303,226,colors[1]);doodle(524,225,colors[2]);
  strand([115,214],[278,214]);strand([329,214],[500,214]);
  c.beginPath();c.moveTo(90,211);c.lineTo(309,122);c.lineTo(520,211);c.strokeStyle='#eaa1ac';c.lineWidth=3;c.stroke();
  dot(c,309,122,25,ink);dot(c,309,122,20,'#fff1b1');dot(c,304,115,6,'#ffffff');
 }else if(stage.kind==='pulse'){
  platform(37,259,536);
  for(let i=0;i<3;i++){const x=125+i*172;
   box(c,x-37,253,74,8,4,colors[i]);doodle(x,208-i%2*28,colors[i]);}
  strand([151,208],[272,180]);strand([326,180],[442,208]);
  c.strokeStyle='#eb668c';c.lineWidth=6;c.setLineDash([7,9]);c.beginPath();
  c.moveTo(126,129);c.quadraticCurveTo(300,17,470,129);c.stroke();c.setLineDash([]);
  dot(c,469,130,9,'#eb668c');
 }else{
  platform(35,260,532);
  doodle(98,208,colors[0]);doodle(294,210,colors[1]);doodle(507,208,colors[2]);
  for(const x of [198,406]){box(c,x-10,179,20,78,7,'#ffe1ab');dot(c,x,178,13,'#eab0bf');}
  strand([125,207],[198,178]);strand([198,178],[269,210]);
  strand([319,210],[406,178]);strand([406,178],[481,207]);
  c.beginPath();c.arc(530,107,30,0,7);c.strokeStyle='#8ed6b6';c.lineWidth=9;c.stroke();
 }
 c.restore();
}
