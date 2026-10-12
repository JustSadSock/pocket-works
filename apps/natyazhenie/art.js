const colors=['#ff7282','#70c7f5','#8fdb8d','#ffc968','#b7a1f4'],ink='#25304b';
const themes=['#bceffa','#fbd8e6','#e4def9','#ffe8b3','#ccecdf','#ffdcc7'];
const box=(c,x,y,w,h,r,color,stroke=ink)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.lineWidth=3;c.strokeStyle=stroke;c.stroke();}};
const dot=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,7);c.fillStyle=color;c.fill();};
let cameraX=590,cameraY=0;
const mix=(a,b,t)=>a+(b-a)*t;
const active=(w,key)=>!w.stage.sequence?.length||w.stage.sequence[w.phase]===key;
function rubber(c,start,end,time,tight,reduced,joined=false){
 const dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy)||1,
 nx=-dy/len,ny=dx/len,segments=Math.max(8,Math.ceil(len/9));
 const sag=Math.max(0,1-tight)*Math.min(48,len*.21),wave=reduced?0:(1-tight)*3.6;
 const points=[];
 for(let i=0;i<=segments;i++){
  const t=i/segments,b=Math.sin(t*Math.PI);
  const shift=sag*b+wave*Math.sin(t*3*Math.PI-time*7)*b;
  points.push({x:start.x+dx*t+nx*shift,y:start.y+dy*t+ny*shift});
 }
 const stroke=()=>{
  c.beginPath();c.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)c.lineTo(points[i].x,points[i].y);
 };
 c.lineJoin='round';c.lineCap='round';
 stroke();c.strokeStyle='#27314a';c.lineWidth=14-tight*4;c.stroke();
 const grad=c.createLinearGradient(start.x,start.y,end.x,end.y);
 grad.addColorStop(0,'#ffdfc7');grad.addColorStop(.45,tight>.72?'#ff8295':'#ffb5aa');grad.addColorStop(1,'#ffcecc');
 stroke();c.strokeStyle=grad;c.lineWidth=10-tight*4;c.stroke();
 stroke();c.strokeStyle='#fff1dbb8';c.lineWidth=2.2-tight*.8;c.stroke();
 // Short diagonal ridges visually distinguish elastic rubber from a plain cable.
 c.strokeStyle=tight>.8?'#ffdae0':'#dc829c';c.lineWidth=1.6;
 for(let i=3;i<points.length-3;i+=5){
  const a=points[i],b=points[i+1],ddx=b.x-a.x,ddy=b.y-a.y,dd=Math.hypot(ddx,ddy)||1;
  c.beginPath();c.moveTo(a.x-ddy/dd*4,a.y+ddx/dd*4);
  c.lineTo(a.x+ddy/dd*4,a.y-ddx/dd*4);c.stroke();
 }
 if(tight>.58&&!reduced){
  const t=(time*2.5)%1,p=points[Math.floor(t*(points.length-1))];
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
 const platforms=[...s.floors,...s.platforms,...bridge,...(s.lifts||[]).map(l=>({...l,y:l.y+Math.sin((world.clock||0)*Math.PI*2/l.period)*l.amp}))];
 for(const p of platforms){
  box(c,p.x,p.y,p.w,p.h,8,'#ffe3a7');
  box(c,p.x+2,p.y+2,p.w-4,13,5,'#9ee6b2',null);
  c.save();c.beginPath();c.rect(p.x+4,p.y+21,p.w-8,p.h-24);c.clip();
  for(let x=p.x-50;x<p.x+p.w+50;x+=36){c.beginPath();c.moveTo(x,p.y+p.h);c.lineTo(x+40,p.y+15);c.strokeStyle='#dfbd85';c.lineWidth=2;c.stroke();}c.restore();
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
 const players=world.players||[];
 for(let i=0;i<players.length-1;i++){
  const a=players[i],b=players[i+1],pin=s.hooks?.[world.wraps?.[i]];
  const path=pin?[a,pin,b]:[a,b];
  let length=0;for(let j=1;j<path.length;j++)length+=Math.hypot(path[j].x-path[j-1].x,path[j].y-path[j-1].y);
  const tight=Math.max(0,Math.min(1,(length-118)/132));
  c.save();
  for(let j=1;j<path.length;j++)rubber(c,path[j-1],path[j],time,tight,reduced,j>1);
  c.restore();
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

 if(s.sequence?.length&&!world.gateOpen){
  const goal=s.sequence[Math.min(world.phase||0,s.sequence.length-1)];
  const names={wheels:'ЗАЦЕПИ ЛЕНТУ',stars:'СОБЕРИ ИСКРЫ',pads:'УДЕРЖИ КНОПКИ',
   beacons:'ПРОВЕДИ ЧЕРЕЗ КОЛЬЦО',tension:'НАТЯГИВАЙ',rescue:'СПАСИ ДРУГА'};
  box(c,382,16,416,34,14,'#fffdf2');
  c.font='900 16px system-ui';c.fillStyle=ink;c.textAlign='center';
  c.fillText((world.phase+1)+'/'+s.sequence.length+'  '+(names[goal]||''),590,38);
 }
 if(s.tension){
  box(c,390,45,400,43,17,'#fffdf2');
  const fill=Math.max(0,Math.min(1,world.tensionCharge||0));
  if(fill>0)box(c,397,53,386*fill,27,11,'#ffb7ca',null);
  c.font='900 17px system-ui';c.fillStyle=ink;c.textAlign='center';
  c.fillText(world.tensionDone?'ЗАРЯЖЕНО!':'НАТЯНИ И ДЕРЖИ',590,73);
 }
 if(s.hold&&!world.gateOpen&&s.pads.length&&world.plateCharge>0){
  box(c,470,99,240,17,8,'#ffffffc8');
  box(c,475,103,230*world.plateCharge,9,5,'#8fe3b0',null);
 }
 if(cover){c.font='1000 27px system-ui';c.textAlign='center';c.fillStyle=ink;c.fillText('НЕ ОТПУСКАЙ!',560,215);}
 c.restore();
}
export function coverWorld(){
 return {stage:{theme:0,hooks:[],wheels:[],sequence:[],floors:[{x:0,y:540,w:480,h:80},{x:600,y:540,w:580,h:80}],platforms:[],lifts:[],hazards:[],beacons:[],springs:[],stars:[{x:585,y:310}],pads:[{x:455,y:540},{x:724,y:540}],gate:{x:1036,y:0,w:31,h:540},stretch:0},
 players:[{id:'a',name:'',x:355,y:455,vx:-20},{id:'b',name:'',x:747,y:390,vx:50}],pads:[false,true],stars:[false],gateOpen:false,stretch:0};
}
