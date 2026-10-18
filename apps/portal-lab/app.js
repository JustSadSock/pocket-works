import {SCALE,W,H,advance,makeBall,portalPairs,kinetic} from './physics.js';
import {LEVELS,buildLevel} from './levels.js';
import {AudioBus} from './audio.js';

const $=(id)=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const audio=new AudioBus();
const COLORS=['#8de0ce','#efa975'];
const STORE='pocket-works:portal-lab:progress';
let persisted={level:0,completed:[]};
try{const old=JSON.parse(localStorage.getItem(STORE)||'null');if(old&&Array.isArray(old.completed))persisted={level:Math.max(0,Math.min(LEVELS.length-1,Number(old.level)||0)),completed:old.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<LEVELS.length)};}catch{}
let index=persisted.level,sim,selectedPair=0,selectedEnd=0,angle=-.56,power=14.5;
let particles=[],preview=[],aimDirty=true,won=false,paused=false;
let previous=0,accumulator=0,elapsed=0,lastTelemetry=0,toastTimer=0,pointer=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){persisted.level=index;try{localStorage.setItem(STORE,JSON.stringify(persisted))}catch{}}
function notify(message){
 $('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2350);
}
function select(pair,end=selectedEnd){
 selectedPair=pair;selectedEnd=end;
 document.querySelectorAll('[data-pair]').forEach(el=>{el.classList.toggle('selected',Number(el.dataset.pair)===pair);el.setAttribute('aria-pressed',Number(el.dataset.pair)===pair?'true':'false')});
 document.querySelectorAll('[data-end]').forEach(el=>{el.classList.toggle('selected',Number(el.dataset.end)===end);el.setAttribute('aria-pressed',Number(el.dataset.end)===end?'true':'false')});
}
function loadLevel(next){
 index=(next+LEVELS.length)%LEVELS.length;sim=buildLevel(index);won=false;paused=false;
 selectedPair=0;selectedEnd=0;angle=LEVELS[index].emitter.aim;
 power=LEVELS[index].power;
 $('power').value=power;$('power-value').textContent=power.toFixed(1);
 $('stage-index').textContent=`ОПЫТ ${String(index+1).padStart(2,'0')} / ${String(LEVELS.length).padStart(2,'0')}`;
 $('stage-title').textContent=LEVELS[index].name;$('stage-desc').textContent=LEVELS[index].subtitle;
 $('shots').textContent='00';$('win').hidden=true;$('pause').textContent='Ⅱ';
 $('sandbox-tools').hidden=!LEVELS[index].sandbox;
 $('gravity').value=sim.gravity;$('gravity-value').textContent=sim.gravity.toFixed(2);
 $('bounce').value=sim.restitution;$('bounce-value').textContent=sim.restitution.toFixed(2);
 $('physics-note').textContent=LEVELS[index].hint;
 $('mobile-step').textContent=`${String(index+1).padStart(2,'0')} / ${String(LEVELS.length).padStart(2,'0')}`;
 $('mission-list').replaceChildren(...LEVELS.map((item,i)=>{
  const button=document.createElement('button');button.type='button';button.className='mission'+(index===i?' active':'');
  button.innerHTML=`<span class="number">${String(i+1).padStart(2,'0')}</span><span class="mission-label"></span><span class="check">${persisted.completed.includes(i)?'✓':''}</span>`;
  button.querySelector('.mission-label').textContent=item.name;
  button.addEventListener('click',()=>loadLevel(i));return button;
 }));
 select(0,0);particles=[];preview=[];aimDirty=true;save();telemetry();
}
function mount(siteIndex){
 const ids=sim.pairSites[selectedPair];if(siteIndex===ids[1-selectedEnd]){
  select(selectedPair,1-selectedEnd);notify('Этот конец уже закреплён здесь');return;
 }
 // One socket cannot host two endpoints. Swapping occupied mounts preserves both channels.
 for(let p=0;p<sim.pairSites.length;p++)for(let e=0;e<sim.pairSites[p].length;e++){
  if(p===selectedPair&&e===selectedEnd)continue;
  if(sim.pairSites[p][e]===siteIndex)sim.pairSites[p][e]=ids[selectedEnd]??-1;
 }
 ids[selectedEnd]=siteIndex;select(selectedPair,1-selectedEnd);
 audio.play('mount');aimDirty=true;notify('Портал установлен');
}
function resetBodies(){sim.balls=[];sim.anchorWork=0;sim.events.length=0;particles=[];won=false;$('win').hidden=true;aimDirty=true;notify('Камера очищена');}
function shoot(){
 if(won){notify('Опыт завершён. Выбери следующий.');return;}
 audio.play('launch');const e=LEVELS[index].emitter;
 const vx=Math.cos(angle)*power,vy=Math.sin(angle)*power;
 const b=makeBall(e.x+Math.cos(angle)*33,e.y+Math.sin(angle)*33,vx,vy,{r:14,m:1});
 if(sim.balls.length>=12)sim.balls.shift();
 sim.balls.push(b);sim.shotCount++;$('shots').textContent=String(sim.shotCount).padStart(2,'0');
 particles.push(...burst(e.x,e.y,5,'#c3d6cb',1));aimDirty=true;
}
function goalCheck(){
 const goal=LEVELS[index].goal;if(!goal||won)return;
 for(const b of sim.balls){
  if(Math.hypot(b.x-goal.x,b.y-goal.y)<goal.r+b.r*.45){
   won=true;audio.play('success');$('win').hidden=false;
   particles.push(...burst(goal.x,goal.y,34,COLORS[0],2));
   if(!persisted.completed.includes(index))persisted.completed.push(index);
   save();return;
  }
 }
}
function aimTo(x,y){const e=LEVELS[index].emitter;const d=Math.hypot(x-e.x,y-e.y);
 if(d<22)return;angle=Math.atan2(y-e.y,x-e.x);aimDirty=true;}
function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
function closestSite(x,y){let nearest=-1,range=36;sim.sites.forEach((s,i)=>{const d=Math.hypot(s.x-x,s.y-y);if(d<range){range=d;nearest=i;}});return nearest;}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.pointerType==='mouse')return;
 e.preventDefault();canvas.setPointerCapture(e.pointerId);
 const p=point(e),emit=LEVELS[index].emitter;
 pointer={id:e.pointerId,start:p,fromEmitter:Math.hypot(p.x-emit.x,p.y-emit.y)<85};
 if(pointer.fromEmitter)aimTo(p.x,p.y);
});
canvas.addEventListener('pointermove',e=>{
 if(!pointer||e.pointerId!==pointer.id)return;
 e.preventDefault();const p=point(e);
 if(pointer.fromEmitter)aimTo(p.x,p.y);
});
canvas.addEventListener('pointerup',e=>{
 if(!pointer||e.pointerId!==pointer.id)return;e.preventDefault();
 const p=point(e),drag=Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y),site=closestSite(p.x,p.y);
 if(site!==-1&&drag<35)mount(site);
 else if(pointer.fromEmitter&&drag>34){aimTo(p.x,p.y);shoot();}
 else if(site===-1)aimTo(p.x,p.y);
 pointer=null;
});
canvas.addEventListener('pointercancel',()=>{pointer=null});
canvas.addEventListener('lostpointercapture',()=>{pointer=null});
document.querySelectorAll('[data-pair]').forEach(el=>el.addEventListener('click',()=>{select(Number(el.dataset.pair));audio.play('mount')}));
document.querySelectorAll('[data-end]').forEach(el=>el.addEventListener('click',()=>select(selectedPair,Number(el.dataset.end))));
$('fire').addEventListener('click',shoot);
$('reset').addEventListener('click',resetBodies);
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'Продолжить':'Пауза');});
$('prev').addEventListener('click',()=>loadLevel(index-1));$('next').addEventListener('click',()=>loadLevel(index+1));$('win-next').addEventListener('click',()=>loadLevel(index+1));
$('sound').addEventListener('click',()=>{audio.set(!audio.enabled);$('sound').textContent=audio.enabled?'♪':'×';$('sound').setAttribute('aria-label',audio.enabled?'Звук включен':'Звук выключен');notify(audio.enabled?'Звук включен':'Звук выключен')});
$('sound').textContent=audio.enabled?'♪':'×';$('sound').setAttribute('aria-label',audio.enabled?'Звук включен':'Звук выключен');
$('power').addEventListener('input',e=>{power=Number(e.target.value);$('power-value').textContent=power.toFixed(1);aimDirty=true;});
$('gravity').addEventListener('input',e=>{sim.gravity=Number(e.target.value);$('gravity-value').textContent=sim.gravity.toFixed(2);aimDirty=true});
$('bounce').addEventListener('input',e=>{sim.restitution=Number(e.target.value);$('bounce-value').textContent=sim.restitution.toFixed(2);aimDirty=true});
window.addEventListener('keydown',e=>{
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','KeyP','Digit1','Digit2'].includes(e.code)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName))e.preventDefault();
 if(e.repeat&&e.code==='Space')return;
 if(e.code==='Space')shoot();if(e.code==='KeyR')resetBodies();
 if(e.code==='KeyP')$('pause').click();
 if(e.code==='Digit1')select(0);if(e.code==='Digit2')select(1);
 if(e.code==='ArrowUp'||e.code==='ArrowLeft'){angle-=.055;aimDirty=true;}
 if(e.code==='ArrowDown'||e.code==='ArrowRight'){angle+=.055;aimDirty=true;}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){accumulator=0;audio.ctx?.suspend();}previous=0});
function burst(x,y,num,color,scale=1){return Array.from({length:num},()=>({x,y,vx:(Math.random()-.5)*230*scale,vy:(Math.random()-.5)*230*scale,life:.24+Math.random()*.32,max:.6,color,r:1+Math.random()*3}));}
function consumeEvents(){
 for(const event of sim.events.splice(0)){
  if(event.type==='portal'){
   particles.push(...burst(event.x,event.y,12,COLORS[event.pair],1));
   audio.play('portal');sim.transits++;
  }else if(event.type==='impact'&&event.speed>1.8){
   particles.push(...burst(event.x,event.y,Math.min(6,Math.floor(event.speed)), '#cfbda4',.4));
   if(event.speed>3&&sim.balls.length>0)audio.play('impact',Math.min(6,event.speed));
  }
 }
 if(particles.length>260)particles=particles.slice(-260);
}
function predict(){
 // Identical force/collision integration as the live world, isolated from telemetry/events.
 const e=LEVELS[index].emitter;
 const ghost={...sim,balls:[makeBall(e.x+Math.cos(angle)*33,e.y+Math.sin(angle)*33,Math.cos(angle)*power,Math.sin(angle)*power)],anchorWork:0,events:[]};
 const data=[];let prev=null;
 for(let i=0;i<165&&ghost.balls.length;i++){
  advance(ghost,1/120);const b=ghost.balls[0];if(!b)break;
  if(i%3===0){
   const point={x:b.x,y:b.y,hop:b.transits};
   if(prev&&point.hop!==prev.hop)data.push(null);data.push(point);prev=point;
  }
  ghost.events.length=0;
 }
 preview=data;aimDirty=false;
}
function telemetry(){
 const b=sim.balls.at(-1),v=b?Math.hypot(b.vx,b.vy):0;
 $('speed').innerHTML=v.toFixed(1)+' <small>м/с</small>';
 $('kinetic').innerHTML=(b?kinetic(b):0).toFixed(1)+' <small>Дж</small>';
 $('work').innerHTML=sim.anchorWork.toFixed(1)+' <small>Дж</small>';
 $('transits').textContent=String(sim.transits);
}
function line(x1,y1,x2,y2,stroke,width=1){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function circle(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function background(t){
 const gradient=ctx.createLinearGradient(0,0,W,H);gradient.addColorStop(0,'#22373a');gradient.addColorStop(.6,'#16262b');gradient.addColorStop(1,'#0e1c20');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.strokeStyle='#86a8a312';ctx.lineWidth=1;
 for(let x=36;x<W;x+=36)line(x,0,x,H,'#a2c8bd0e');
 for(let y=40;y<H;y+=36)line(0,y,W,y,'#b0cfc00d');ctx.restore();
 ctx.save();ctx.globalAlpha=.12;
 ctx.font='bold 92px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#45666a';ctx.fillText('SEAM',355,245);
 ctx.font='12px ui-monospace,monospace';ctx.fillStyle='#c7e1d7';ctx.textAlign='left';
 ctx.fillText('STATION / '+String(index+1).padStart(2,'0'),65,125);ctx.restore();
 for(let i=0;i<8;i++){const x=60+i*87;ctx.fillStyle='#91d1c522';ctx.fillRect(x,64,47,4);ctx.fillStyle='#b9f0df0e';ctx.beginPath();ctx.moveTo(x-6,70);ctx.lineTo(x+53,70);ctx.lineTo(x+79,160);ctx.lineTo(x-32,160);ctx.fill();}
 // Welded measurement markings.
 for(let y=105;y<855;y+=30){line(27,y,36+(y%90===15?8:0),y,'#8db8ab55');line(684,y,692,y,'#8db8ab55');}
}
function walls(){
 for(const w of sim.walls){
  ctx.save();
  const g=ctx.createLinearGradient(w.x,w.y,w.x+w.w,w.y+w.h);
  g.addColorStop(0,'#506367');g.addColorStop(.22,'#34474c');g.addColorStop(.6,'#24373c');g.addColorStop(1,'#17282c');
  ctx.fillStyle=g;ctx.fillRect(w.x,w.y,w.w,w.h);
  ctx.fillStyle='#d3e2d121';ctx.fillRect(w.x+2,w.y+2,Math.max(1,w.w-4),Math.min(3,w.h-2));
  ctx.strokeStyle='#0a191d';ctx.lineWidth=4;ctx.strokeRect(w.x,w.y,w.w,w.h);
  ctx.strokeStyle='#9cb1a321';ctx.lineWidth=1;
  for(let t=0;t<w.w+w.h;t+=18){ctx.beginPath();ctx.moveTo(w.x+t,w.y);ctx.lineTo(w.x+t-w.h,w.y+w.h);ctx.stroke();}
  if(w.w<85&&w.h>80)for(let y=w.y+31;y<w.y+w.h;y+=83){circle(w.x+w.w/2,y,2.8,'#a2b4aa');circle(w.x+w.w/2+.5,y+.6,1.1,'#293c3d');}
  if(w.h<85&&w.w>80)for(let x=w.x+31;x<w.x+w.w;x+=83){circle(x,w.y+w.h/2,2.8,'#a2b4aa');}
  ctx.restore();
 }
}
function drawSocket(s,index,active,color,time){
 const dx=s.tx=-s.ny,dy=s.ty=s.nx,half=s.span/2;
 const px=s.x,py=s.y;
 ctx.save();ctx.lineCap='square';
 line(px-dx*(half+8),py-dy*(half+8),px+dx*(half+8),py+dy*(half+8),'#b5c5ae90',16);
 line(px-dx*half,py-dy*half,px+dx*half,py+dy*half,'#102226',11);
 if(active){
  ctx.shadowColor=color;ctx.shadowBlur=reduced?5:22;
  line(px-dx*half,py-dy*half,px+dx*half,py+dy*half,color,8);
  ctx.shadowBlur=0;
  line(px-dx*(half-3),py-dy*(half-3),px+dx*(half-3),py+dy*(half-3),'#f2f1dc',2.4);
  if(!reduced)for(let j=0;j<6;j++){
    const u=((j/6+time*.25)%1-.5)*s.span,v=2+Math.sin(time*4+j*1.7)*3;
    circle(px+dx*u+s.nx*v,py+dy*u+s.ny*v,1.7,color);
  }
 }else{
  ctx.setLineDash([7,8]);line(px-dx*half,py-dy*half,px+dx*half,py+dy*half,'#9bb4ae8c',3);ctx.setLineDash([]);
 }
 for(const side of [-1,1]){
  const ax=px+dx*half*side,ay=py+dy*half*side;
  ctx.save();ctx.translate(ax,ay);ctx.rotate(Math.atan2(dy,dx));
  ctx.fillStyle=active?'#c4d2bd':'#718781';ctx.fillRect(-9,-8,18,16);ctx.fillStyle='#15272b';ctx.fillRect(-5,-8,10,16);ctx.restore();
 }
 if(active)line(px+s.nx*12,py+s.ny*12,px+s.nx*25,py+s.ny*25,color,2);
 ctx.restore();
}
function drawPortals(t){
 const ps=portalPairs(sim),active=new Map();
 for(const p of ps){active.set(p.a.id,COLORS[p.pair]);active.set(p.b.id,COLORS[p.pair]);}
 sim.sites.forEach((s,i)=>drawSocket({...s},i,active.has(i),active.get(i),t));
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 13px ui-monospace,monospace';
 for(const p of ps)for(const [site,end] of [[p.a,'I'],[p.b,'II']]){
  circle(site.x+site.nx*34,site.y+site.ny*34,13,'#102327');
  ctx.fillStyle=COLORS[p.pair];ctx.fillText((p.pair===0?'A':'Б')+end,site.x+site.nx*34,site.y+site.ny*34);
 }
}
function drawGoal(t){
 const g=LEVELS[index].goal;if(!g)return;
 ctx.save();ctx.translate(g.x,g.y);
 ctx.strokeStyle='#b3f4be';ctx.lineWidth=5;ctx.shadowBlur=reduced?0:21;ctx.shadowColor='#a2f0a3';
 ctx.beginPath();ctx.arc(0,0,g.r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
 ctx.setLineDash([7,9]);ctx.strokeStyle='#e4e9b4a8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,g.r+12,t*.25,t*.25+Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 for(let a=0;a<Math.PI*2;a+=Math.PI/4)line(Math.cos(a)*(g.r+16),Math.sin(a)*(g.r+16),Math.cos(a)*(g.r+24),Math.sin(a)*(g.r+24),'#b2e3b4',2);
 circle(0,0,6,'#b5e6b4');ctx.restore();
}
function drawLauncher(){
 const e=LEVELS[index].emitter;
 ctx.save();ctx.translate(e.x,e.y);circle(0,0,29,'#14292f');circle(0,0,22,'#597678');circle(0,0,16,'#243d43');
 ctx.rotate(angle);
 ctx.fillStyle='#678588';ctx.fillRect(2,-14,41,28);
 ctx.fillStyle='#bfcebd';ctx.fillRect(15,-10,31,20);
 ctx.fillStyle='#12282f';ctx.fillRect(39,-8,8,16);
 line(5,-13,39,-13,'#d9ead5',2);ctx.restore();
 circle(e.x,e.y,5,'#cee3d3');
}
function drawBall(b,alpha=1){
 ctx.save();ctx.globalAlpha=alpha;const r=b.r;
 ctx.shadowColor='#090e14';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
 const g=ctx.createRadialGradient(b.x-r*.38,b.y-r*.5,1,b.x,b.y,r);
 g.addColorStop(0,'#f2f9e4');g.addColorStop(.27,'#d0d8c9');g.addColorStop(.65,'#789a9d');g.addColorStop(1,'#2b434b');
 circle(b.x,b.y,r,g);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.strokeStyle='#d8f1e0';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(b.x,b.y,r-.8,0,Math.PI*2);ctx.stroke();
 ctx.translate(b.x,b.y);ctx.rotate(b.angle);
 line(-r*.65,0,r*.65,0,'#233c44',1.8);line(0,-r*.65,0,r*.65,'#d6efdc',1.5);
 circle(0,0,3.5,'#1c3c3f');ctx.restore();
}
function drawTrails(){
 for(const b of sim.balls){
  b.history.push({x:b.x,y:b.y});if(b.history.length>32)b.history.shift();
  ctx.save();for(let i=1;i<b.history.length;i++){
   const a=b.history[i-1],c=b.history[i],f=i/b.history.length;
   line(a.x,a.y,c.x,c.y,`rgba(159,227,212,${f*.43})`,1+f*3);
  }ctx.restore();
 }
}
function drawPrediction(){
 if(!preview.length||won)return;
 ctx.save();ctx.setLineDash([4,10]);ctx.lineWidth=2;ctx.strokeStyle='#b6c7b780';ctx.beginPath();
 let starting=true;for(const p of preview){
  if(!p){starting=true;continue;}if(starting){ctx.moveTo(p.x,p.y);starting=false}else ctx.lineTo(p.x,p.y);
 }ctx.stroke();ctx.setLineDash([]);
 for(let i=0;i<preview.length;i+=13)if(preview[i])circle(preview[i].x,preview[i].y,2.6,'#c8d6bd8e');
 ctx.restore();
}
function render(t){
 background(t);walls();drawGoal(t);drawPrediction();drawPortals(t);drawLauncher();drawTrails();
 for(const b of sim.balls)drawBall(b);
 for(const p of particles){ctx.globalAlpha=Math.min(1,p.life/p.max);circle(p.x,p.y,p.r,p.color);}
 ctx.globalAlpha=1;
 ctx.fillStyle='#d0e1d28c';ctx.font='12px ui-monospace,monospace';ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.fillText(`g = ${sim.gravity.toFixed(2)} m/s²`,54,837);
 ctx.textAlign='right';ctx.fillText('1 m = 72 px',665,837);
 if(paused){ctx.fillStyle='#0c1b20ae';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#d5eadb';ctx.font='bold 29px system-ui';ctx.fillText('ПАУЗА',W/2,H/2);}
}
function frame(timestamp){
 if(!previous)previous=timestamp;
 const dt=Math.min(.05,(timestamp-previous)/1000);previous=timestamp;
 if(!document.hidden){
  elapsed+=dt;
  if(!paused&&!won){
   accumulator=Math.min(.06,accumulator+dt);
   while(accumulator>=1/120){advance(sim,1/120);accumulator-=1/120;consumeEvents();goalCheck();if(won)break;}
  }
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=dt*260;}
  particles=particles.filter(p=>p.life>0);
  if(aimDirty&&!won)predict();
  if(timestamp-lastTelemetry>110){telemetry();lastTelemetry=timestamp;}
  render(elapsed);
 }
 requestAnimationFrame(frame);
}
loadLevel(index);requestAnimationFrame(frame);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
window.__PORTAL_LAB__={
 snapshot:()=>({index,shotCount:sim.shotCount,won,paused,balls:sim.balls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,transits:b.transits})),pairs:sim.pairSites.map(v=>[...v]),work:sim.anchorWork}),
 load:loadLevel,shoot,aim:(a)=>{angle=a;aimDirty=true},mount:(site,pair=0,end=0)=>{select(pair,end);mount(site)}
};
