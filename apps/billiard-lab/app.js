import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {WIDTH,HEIGHT,SHAPES,inside,contain,sanitizeWorld,initialParticles,advance} from './physics.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),canvas=$('board'),ctx=canvas.getContext('2d',{alpha:false}),stage=$('stageBody');
const STORAGE='pocket-works:billiard-lab:wavefront-v2',RADII=[512,1024,2048,4096,8192];
const defaults={shape:'rectangle',origin:{x:366,y:243},circles:[],mirrors:[]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),number=(x,d)=>Number.isFinite(x)?x:d;
function read(){try{const v=JSON.parse(localStorage.getItem(STORAGE)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}
const saved=read();let world=sanitizeWorld(saved.world||defaults);
let rayIndex=clamp(Math.round(number(saved.rayIndex,matchMedia('(max-width:760px)').matches?2:3)),0,4);
let speed=clamp(number(saved.speed,100),25,250),trail=clamp(number(saved.trail,45),0,100);
let display=saved.display==='dots'?'dots':'line',tool='source';
let particleSet=initialParticles(RADII[rayIndex],world.origin),playing=true,elapsed=0;
let snapshots=[],sinceSnapshot=0,previousFrame=0,drag=null,undos=[],toastTimeout=0,resizeDirty=true,telemetryClock=0,forceDraw=true;
const title={rectangle:'ПРЯМОУГОЛЬНИК',circle:'КРУГ',stadium:'СТАДИОН',triangle:'ТРЕУГОЛЬНИК'};
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({world,rayIndex,speed,trail,display}))}catch{notify('Не удалось сохранить настройки. Проверь хранилище устройства.')}}
function notify(msg){const n=$('toast');n.textContent=msg;n.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>n.classList.remove('visible'),2600)}
function snapshot(){undos.push(JSON.stringify(world));if(undos.length>24)undos.shift()}
function startOver(){particleSet=initialParticles(RADII[rayIndex],world.origin);elapsed=0;snapshots=[];sinceSnapshot=0;forceDraw=true;updateNumbers();updateState()}
function modify(fn){snapshot();fn();world=sanitizeWorld(world);startOver();save();updateControls()}
function undo(){if(!undos.length)return;world=sanitizeWorld(JSON.parse(undos.pop()));startOver();save();updateControls();notify('Изменение отменено.')}
function setShape(shape){if(!SHAPES.includes(shape)||shape===world.shape)return;modify(()=>{world.shape=shape;world.origin=contain(shape,world.origin,42);world.circles=[];world.mirrors=[]});notify('Форма изменена. Волна запущена заново.')}
function setTool(name){if(!['source','circle','mirror','erase'].includes(name))return;tool=name;drag=null;updateControls()}
function updateState(){
 $('stateLabel').textContent=playing?'ДВИЖЕНИЕ':'ПАУЗА';
 $('playSymbol').textContent=playing?'Ⅱ':'▶';
 $('playText').textContent=playing?'ПАУЗА':'ПРОДОЛЖИТЬ';
 $('playBtn').setAttribute('aria-pressed',String(playing));
 $('stageBody').classList.toggle('paused',!playing);
}
function updateNumbers(){
 $('countStat').textContent=particleSet.count.toLocaleString('ru-RU');
 $('timeStat').textContent=elapsed.toFixed(1)+' с';
 $('bounceStat').textContent=particleSet.reflections.toLocaleString('ru-RU');
}
function updateControls(){
 $('shapeLabel').textContent=title[world.shape];
 document.querySelectorAll('[data-shape]').forEach(b=>{const selected=b.dataset.shape===world.shape;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});
 document.querySelectorAll('[data-tool]').forEach(b=>{const selected=b.dataset.tool===tool;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});
 document.querySelectorAll('[data-display]').forEach(b=>{const selected=b.dataset.display===display;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});
 $('raysRange').value=rayIndex;$('raysOut').textContent=RADII[rayIndex].toLocaleString('ru-RU');
 $('speedRange').value=speed;$('speedOut').textContent=(speed/100).toFixed(2).replace(/0$/,'')+'×';
 $('trailRange').value=trail;$('trailOut').textContent=trail+'%';
 $('undoBtn').disabled=undos.length===0;
 $('touchHint').textContent={source:'НАЖМИ ИЛИ ПОТЯНИ — ПЕРЕМЕСТИТЬ ИСТОЧНИК',circle:'НАЖМИ — ДОБАВИТЬ ОТРАЖАТЕЛЬ',mirror:'ПРОВЕДИ ЛИНИЮ — СОЗДАТЬ ПЕРЕГОРОДКУ',erase:'НАЖМИ — УДАЛИТЬ ПРЕПЯТСТВИЕ'}[tool];
 forceDraw=true;
}
function drawChamber(){
 ctx.beginPath();
 if(world.shape==='circle')ctx.arc(450,270,232,0,Math.PI*2);
 else if(world.shape==='stadium'){ctx.moveTo(278,46);ctx.lineTo(622,46);ctx.arc(622,270,224,-Math.PI/2,Math.PI/2);ctx.lineTo(278,494);ctx.arc(278,270,224,Math.PI/2,Math.PI*1.5);ctx.closePath()}
 else if(world.shape==='triangle'){ctx.moveTo(450,30);ctx.lineTo(855,506);ctx.lineTo(45,506);ctx.closePath()}
 else ctx.rect(26,27,848,486);
}
function drawBackdrop(){
 const bg=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);bg.addColorStop(0,'#0e2024');bg.addColorStop(.5,'#152a2d');bg.addColorStop(1,'#0c1c20');
 ctx.fillStyle='#091519';ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.save();drawChamber();ctx.fillStyle=bg;ctx.shadowBlur=17;ctx.shadowColor='#040e10';ctx.fill();ctx.clip();
 ctx.lineWidth=.7;ctx.strokeStyle='#4a65611c';
 ctx.beginPath();for(let x=0;x<=WIDTH;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT)}for(let y=0;y<=HEIGHT;y+=26){ctx.moveTo(0,y);ctx.lineTo(WIDTH,y)}ctx.stroke();
 ctx.lineWidth=.6;ctx.strokeStyle='#64817b18';ctx.beginPath();
 for(let r=50;r<850;r+=52){ctx.moveTo(world.origin.x+r,world.origin.y);ctx.arc(world.origin.x,world.origin.y,r,0,Math.PI*2)}ctx.stroke();
 ctx.strokeStyle='#bbba9830';ctx.lineWidth=1;
 for(let x=26;x<875;x+=104){ctx.beginPath();ctx.moveTo(x,27);ctx.lineTo(x,33);ctx.stroke()}
 ctx.restore();
}
function drawWave(x,y,count,color,width,maxLink=135,stride=1){
 ctx.beginPath();let prevX=x[0],prevY=y[0];ctx.moveTo(prevX,prevY);
 for(let i=stride;i<count+stride;i+=stride){
  const j=i>=count?0:i,cx=x[j],cy=y[j];
  if(Math.abs(cx-prevX)+Math.abs(cy-prevY)>maxLink){ctx.moveTo(cx,cy)}
  else ctx.lineTo(cx,cy);
  prevX=cx;prevY=cy;
 }
 ctx.lineWidth=width;ctx.strokeStyle=color;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
}
function renderWave(){
 if(trail>0&&snapshots.length){
  for(let i=0;i<snapshots.length;i+=2){
   const s=snapshots[i],age=1-(elapsed-s.time)/(.15+trail*.038);
   if(age<=0)continue;
   ctx.save();ctx.globalAlpha=Math.pow(age,2)*(.05+trail*.004);
   if(display==='line')drawWave(s.x,s.y,s.x.length,'#a6d7cd',1.25,180,Math.max(1,Math.ceil(s.x.length/900)));
   else drawDots(s.x,s.y,s.x.length,'#83bdb1',1.2,3);
   ctx.restore();
  }
 }
 if(display==='dots'){drawDots(particleSet.x,particleSet.y,particleSet.count,'#bde7d5',1.2,1);return}
 ctx.save();ctx.shadowColor='#89d9ba';ctx.shadowBlur=14;drawWave(particleSet.x,particleSet.y,particleSet.count,'#5bbba6',3.3);ctx.restore();
 drawWave(particleSet.x,particleSet.y,particleSet.count,'#e2eee1',1.55);
}
function drawDots(x,y,count,color,r,stride){
 ctx.fillStyle=color;
 for(let i=0;i<count;i+=stride){ctx.beginPath();ctx.arc(x[i],y[i],r,0,Math.PI*2);ctx.fill()}
}
function drawWorldObjects(){
 for(const c of world.circles){
  ctx.save();ctx.beginPath();ctx.arc(c.x,c.y,c.r+4,0,Math.PI*2);ctx.fillStyle='#101c1f';ctx.fill();
  ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fillStyle='#263f40';ctx.fill();
  ctx.strokeStyle='#e2a978';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.arc(c.x,c.y,3,0,Math.PI*2);ctx.fillStyle='#e4c7a3';ctx.fill();ctx.restore();
 }
 for(const m of world.mirrors){
  ctx.lineCap='round';ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.lineWidth=10;ctx.strokeStyle='#0a1a1e';ctx.stroke();
  ctx.lineWidth=3;ctx.strokeStyle='#d5aa7f';ctx.stroke();
  for(const p of [{x:m.x1,y:m.y1},{x:m.x2,y:m.y2}]){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#f7d0a7';ctx.fill()}
 }
 if(drag?.type==='mirror'){
  ctx.save();ctx.beginPath();ctx.moveTo(drag.from.x,drag.from.y);ctx.lineTo(drag.now.x,drag.now.y);ctx.strokeStyle='#edbe91';ctx.lineWidth=5;ctx.setLineDash([10,6]);ctx.stroke();ctx.restore();
 }
}
function drawSource(){
 const p=world.origin,t=elapsed;
 ctx.save();ctx.translate(p.x,p.y);
 ctx.strokeStyle='#e0b88e';ctx.lineWidth=1.2;
 ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fillStyle='#ffdbab';ctx.fill();
 ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(-15,0);ctx.moveTo(15,0);ctx.lineTo(21,0);ctx.moveTo(0,-21);ctx.lineTo(0,-15);ctx.moveTo(0,15);ctx.lineTo(0,21);ctx.stroke();
 ctx.restore();
}
function render(){
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);
 const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 ctx.setTransform(w/WIDTH,0,0,h/HEIGHT,0,0);
 drawBackdrop();
 ctx.save();drawChamber();ctx.clip();renderWave();drawWorldObjects();drawSource();ctx.restore();
 drawChamber();ctx.strokeStyle='#88afa5';ctx.lineWidth=4;ctx.stroke();
 drawChamber();ctx.strokeStyle='#36585a';ctx.lineWidth=10;ctx.stroke();
 if(!playing){ctx.fillStyle='#f4dfb9aa';ctx.font='700 12px ui-monospace,monospace';ctx.fillText('Ⅱ  ПАУЗА',40,67)}
}
function retainSnapshot(){
 if(trail<=0){snapshots=[];return}
 if(sinceSnapshot<.085)return;
 sinceSnapshot=0;
 snapshots.push({time:elapsed,x:particleSet.x.slice(),y:particleSet.y.slice()});
 const length=.15+trail*.038;
 while(snapshots.length&&(elapsed-snapshots[0].time>length||snapshots.length>22))snapshots.shift();
}
function frame(stamp){
 const delta=previousFrame?Math.min(.045,Math.max(0,(stamp-previousFrame)/1000)):0;previousFrame=stamp;
 if(playing&&document.visibilityState!=='hidden'){
  // Continuous ray/surface intersections, independent of rendering frame rate.
  const simulationDelta=delta*speed/100;
  advance(particleSet,world,175*simulationDelta);elapsed+=simulationDelta;
  sinceSnapshot+=simulationDelta;retainSnapshot();forceDraw=true;
 }
 telemetryClock+=delta;
 if(telemetryClock>.12){telemetryClock=0;updateNumbers()}
 if(forceDraw){render();forceDraw=false}
 requestAnimationFrame(frame);
}
function pt(e){const rect=canvas.getBoundingClientRect();return {x:clamp((e.clientX-rect.left)*WIDTH/rect.width,0,WIDTH),y:clamp((e.clientY-rect.top)*HEIGHT/rect.height,0,HEIGHT)}}
function closest(p){
 let best=null,distance=35;
 world.circles.forEach((o,index)=>{const d=Math.hypot(p.x-o.x,p.y-o.y);if(d<distance){best={type:'circle',index};distance=d}});
 world.mirrors.forEach((o,index)=>{const dx=o.x2-o.x1,dy=o.y2-o.y1,t=clamp(((p.x-o.x1)*dx+(p.y-o.y1)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(p.x-o.x1-t*dx,p.y-o.y1-t*dy);if(d<distance){best={type:'mirror',index};distance=d}});
 return best;
}
function pointerDown(e){
 if(e.button!==0||!$('clearModal').hidden)return;
 const p=pt(e);
 try{canvas.setPointerCapture(e.pointerId)}catch{}
 const selected=tool==='circle'?closest(p):null;
 drag={id:e.pointerId,from:p,now:p,type:tool==='circle'&&selected?.type==='circle'?'moveCircle':tool,index:selected?.index,before:JSON.stringify(world)};
 forceDraw=true;
}
function pointerMove(e){
 if(!drag||e.pointerId!==drag.id)return;
 drag.now=pt(e);
 if(drag.type==='source'){world.origin=contain(world.shape,drag.now,42);forceDraw=true}
 if(drag.type==='moveCircle'){world.circles[drag.index]={...world.circles[drag.index],...contain(world.shape,drag.now,40)};forceDraw=true}
 if(drag.type==='mirror')forceDraw=true;
}
function pointerEnd(e,cancel=false){
 if(!drag||e.pointerId!==drag.id)return;
 const action=drag;drag=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}
 if(cancel){world=sanitizeWorld(JSON.parse(action.before));startOver();return}
 const p=pt(e);
 if(action.type==='source'){
  undos.push(action.before);if(undos.length>24)undos.shift();world.origin=contain(world.shape,p,42);
  world=sanitizeWorld(world);startOver();save();updateControls();return;
 }
 if(action.type==='moveCircle'){
  undos.push(action.before);if(undos.length>24)undos.shift();world.circles[action.index]={...world.circles[action.index],...contain(world.shape,p,40)};
  world=sanitizeWorld(world);startOver();save();updateControls();return;
 }
 if(action.type==='circle'){
  if(world.circles.length>=12){notify('Не больше 12 отражателей.');return}
  const o=contain(world.shape,p,43);if(Math.hypot(o.x-world.origin.x,o.y-world.origin.y)<62){notify('Отражатель слишком близко к источнику.');return}
  modify(()=>world.circles.push({...o,r:24}));
  return;
 }
 if(action.type==='mirror'){
  if(world.mirrors.length>=12){notify('Не больше 12 перегородок.');return}
  const a=contain(world.shape,action.from,13),b=contain(world.shape,p,13);
  if(Math.hypot(b.x-a.x,b.y-a.y)<25){notify('Нарисуй перегородку длиннее.');forceDraw=true;return}
  modify(()=>world.mirrors.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y}));return;
 }
 if(action.type==='erase'){
  const obj=closest(p);
  if(!obj){notify('Рядом нет препятствий.');return}
  modify(()=>{if(obj.type==='circle')world.circles.splice(obj.index,1);else world.mirrors.splice(obj.index,1)});
 }
 forceDraw=true;
}
$('shapeGrid').addEventListener('click',e=>{const b=e.target.closest('[data-shape]');if(b)setShape(b.dataset.shape)});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
document.querySelectorAll('[data-display]').forEach(b=>b.addEventListener('click',()=>{display=b.dataset.display;updateControls();save()}));
$('raysRange').addEventListener('input',e=>{const next=Number(e.target.value);if(rayIndex===next)return;rayIndex=next;startOver();save();updateControls()});
$('speedRange').addEventListener('input',e=>{speed=Number(e.target.value);updateControls();save()});
$('trailRange').addEventListener('input',e=>{trail=Number(e.target.value);if(trail===0)snapshots=[];updateControls();save()});
$('playBtn').addEventListener('click',()=>{playing=!playing;previousFrame=0;updateState();forceDraw=true});
$('restartBtn').addEventListener('click',()=>{startOver();notify('Волна снова выходит из источника.')});
$('snapshotBtn').addEventListener('click',()=>{
 try{
  render();
  const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='rikoshet-'+Date.now()+'.png';
  document.body.append(link);link.click();link.remove();notify('Снимок сохранён.');
 }catch{notify('Не удалось сохранить изображение.')}
});
$('undoBtn').addEventListener('click',undo);
$('clearBtn').addEventListener('click',()=>{if(!world.circles.length&&!world.mirrors.length){notify('Поле уже пустое.');return}$('clearModal').hidden=false;$('cancelClear').focus()});
$('cancelClear').addEventListener('click',()=>{$('clearModal').hidden=true;$('clearBtn').focus()});
$('confirmClear').addEventListener('click',()=>{modify(()=>{world.circles=[];world.mirrors=[]});$('clearModal').hidden=true;notify('Все препятствия удалены.')});
canvas.addEventListener('pointerdown',pointerDown);
canvas.addEventListener('pointermove',pointerMove);
canvas.addEventListener('pointerup',e=>pointerEnd(e));
canvas.addEventListener('pointercancel',e=>pointerEnd(e,true));
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey||/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
 if(e.key==='Escape'){if(!$('clearModal').hidden){$('clearModal').hidden=true;return}if(drag){drag=null;world=sanitizeWorld(world);startOver()}return}
 if(!$('clearModal').hidden)return;
 if(e.code==='Space'){e.preventDefault();playing=!playing;previousFrame=0;updateState();forceDraw=true}
 if(e.key.toLowerCase()==='r'){e.preventDefault();startOver()}
 if(e.key.toLowerCase()==='z'&&e.shiftKey)undo();
});
document.addEventListener('visibilitychange',()=>{previousFrame=0;if(document.hidden)save()});
window.addEventListener('pagehide',save);
if('ResizeObserver'in window)new ResizeObserver(()=>forceDraw=true).observe(stage);
window.addEventListener('resize',()=>forceDraw=true);
createWorkshopMode({appName:'РИКОШЕТ',version:'2.0.0',cachePrefix:'billiard-lab-',storageNamespace:'pocket-works:billiard-lab',onReset(){try{localStorage.removeItem(STORAGE)}catch{}location.reload()}});
updateControls();updateState();updateNumbers();requestAnimationFrame(frame);
