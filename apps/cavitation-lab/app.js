import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { DEFAULTS, PRESETS, sanitize, simulateBubble, sampleAt } from './physics.js';
import { resizeCanvas, renderScene, renderGraph, sceneMetrics } from './render.js';
import { sanitizeCloud, simulateCloud, cloudAt } from './coupling.js';
import { cloudViewport, renderCloudScene, renderCloudGraph } from './cloud-render.js';
installMobileRuntime();

const $=id=>document.getElementById(id);
const field=$('field'),graph=$('trace');
const control={pressure:$('pressure'),size:$('size'),distance:$('distance')};
const key='pocket-works:cavitation-lab:state:v1';
let restored={};
try{restored=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{restored={}}
let config=sanitize(restored.config||DEFAULTS);
let cloud=sanitizeCloud(restored.cloud);
let showPressure=restored.showPressure!==false;
let selectedBubble=0;
let speed= [0.6,1,1.8].includes(restored.speed)?restored.speed:1;
let solution=simulateCloud(config,cloud),timeTau=Math.min(Math.max(0,+restored.timeTau||0),solution.durationTau);
let mode=restored.mode==='ready'?'ready':timeTau>0?'paused':'ready';
let lastFrame=0,draggingWall=null,scrubbing=false,lastDimensions=null,pendingRebuild=false,needGraph=true,dirty=true;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const num=(n,d=2)=>n.toFixed(d).replace('.',',');
const formatMicros=(n)=>Math.round(n).toLocaleString('ru-RU');
const pauseButton=$('pause');
function save(){
 try{localStorage.setItem(key,JSON.stringify({config,speed,timeTau,mode,cloud,showPressure}))}catch{ /* Storage unavailable, experiment still works */ }
}
function syncControls(){
 control.pressure.value=String(config.pressureBar);
 control.size.value=String(config.radiusMm);
 control.distance.value=String(config.standOff);
 $('pressure-val').textContent=num(config.pressureBar)+' бар';
 $('size-val').textContent=num(config.radiusMm)+' мм';
 $('distance-val').textContent=num(config.standOff)+' R₀';
 document.querySelectorAll('[data-preset]').forEach(el=>{
  const p=PRESETS[el.dataset.preset];
  const active=Object.keys(p).every(k=>Math.abs(p[k]-config[k])<0.025);
  el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
 });
 document.querySelectorAll('[data-cloud]').forEach(el=>{
   const active=el.dataset.cloud===cloud.mode;
   el.classList.toggle('active',active);
   el.setAttribute('aria-pressed',String(active));
 });
 $('cloud-options').hidden=cloud.mode==='single';
 $('wall-mode').setAttribute('aria-pressed',String(cloud.wall));
 $('wall-mode').textContent='Отражение стенки · '+(cloud.wall?'вкл.':'выкл.');
 $('pressure-view').setAttribute('aria-pressed',String(showPressure));
 $('pressure-view').textContent='Поле давления · '+(showPressure?'вкл.':'выкл.');
 $('experiment-title').innerHTML=cloud.mode==='single'?'01 <span>/</span> ОДИН ПУЗЫРЁК':cloud.mode==='pair'?'02 <span>/</span> СВЯЗАННАЯ ПАРА':'05 <span>/</span> ОБЛАКО ПУЗЫРЬКОВ';
 $('radius-label').textContent=solution.kind==='cloud'?'РАДИУС R'+(selectedBubble+1):'РАДИУС';
 $('graph-axis').textContent=solution.kind==='cloud'?'R / Rᵢ₀':'R / R₀';
 $('pressure-legend').hidden=solution.kind!=='cloud'||!showPressure;
 $('model-note').textContent=solution.kind==='cloud'?'СВЯЗАННЫЕ СФЕРЫ · ПОЛЕ БЕЗ УДАРНЫХ ВОЛН':'СФЕРИЧЕСКАЯ МОДЕЛЬ · СТРУЯ У СТЕНКИ — СХЕМА';
 $('collapse-time').textContent=solution.kind==='cloud'
   ?solution.individualCollapseUs.map(n=>formatMicros(n)).join(' / ')+' мкс'
   :formatMicros(solution.collapseTimeUs)+' мкс';
 $('min-radius').textContent=num(solution.minRadiusMm,3)+' мм';
 $('jet-status').textContent=solution.kind==='cloud'
   ?(cloud.wall?'Источники + отражения':'Взаимодействие без стенки')
   :solution.jetFactor>.48?'Вероятна микроструя':solution.jetFactor>.12?'Слабая асимметрия':'Почти свободный';
 $('speed').textContent=num(speed, speed===1?0:1)+'×';
}
function refreshState(){
 dirty=true;
 $('launch-label').textContent=mode==='running'?'НАЧАТЬ ЗАНОВО':mode==='paused'?'ПРОДОЛЖИТЬ ОПЫТ':mode==='complete'?'ПОВТОРИТЬ ИМПУЛЬС':'СХЛОПНУТЬ ПУЗЫРЁК';
 pauseButton.disabled=mode==='ready'||mode==='complete';
 pauseButton.textContent=mode==='paused'?'▶':'Ⅱ';
 pauseButton.setAttribute('aria-label',mode==='paused'?'Продолжить':'Пауза');
 pauseButton.title=mode==='paused'?'Продолжить':'Пауза';
 $('status-led').classList.toggle('impact',timeTau>=solution.firstMinimumTau&&mode!=='ready');
 let label='ГОТОВ К ИМПУЛЬСУ';
 if(mode==='paused')label='ОПЫТ НА ПАУЗЕ';
 else if(mode==='complete')label='ОПЫТ ЗАВЕРШЁН · ПОВТОРИТЕ';
 else if(mode==='running' && timeTau<solution.firstMinimumTau*.7)label=solution.kind==='cloud'?'СЖАТИЕ · СВЯЗАННАЯ СИСТЕМА':'ДАВЛЕНИЕ СЖИМАЕТ ПУЗЫРЁК';
 else if(mode==='running' && timeTau<solution.firstMinimumTau)label='УСКОРЕНИЕ КОЛЛАПСА';
 else if(mode==='running')label=solution.kind==='cloud'?'СВЯЗАННЫЙ КОЛЛАПС · '+solution.geometry.length+' ПУЗЫРЬКОВ':solution.jetFactor>.15?'КОЛЛАПС · СТРУЯ У СТЕНКИ':'КОЛЛАПС · РАДИАЛЬНАЯ ВОЛНА';
 $('phase-label').textContent=label;
 $('graph-caption').textContent=solution.kind==='cloud'
   ?(mode==='ready'?'ВЫБЕРИТЕ ПУЗЫРЁК В КАМЕРЕ':'РАСЧЁТНЫЕ РАДИУСЫ')
   :(mode==='ready'?'РАСЧЁТНАЯ ТРАЕКТОРИЯ':'РАДИУС / РЕАЛЬНОЕ ВРЕМЯ');
 $('wall-instruction').textContent=solution.kind==='cloud'
   ?'ВЫБЕРИТЕ ПУЗЫРЁК · СТЕНКА ↔'
   :'↔ СТЕНКУ МОЖНО ДВИГАТЬ';
 $('wall-instruction').style.opacity=mode==='running'?'.25':'.75';
}
function applyConfig(next){
 config=sanitize(next);
 mode='ready';timeTau=0;
 // Coalesce slider gestures to one numerical solve per paint.
 if(!pendingRebuild) {
   pendingRebuild=true;
   requestAnimationFrame(()=>{
    pendingRebuild=false;
    try{solution=simulateCloud(config,cloud);syncControls();refreshState();needGraph=true;save()}
    catch(error){$('phase-label').textContent='ОШИБКА РАСЧЁТА';console.error(error)}
   });
 }
}
for(const [name,el] of Object.entries(control)){
 el.addEventListener('input',()=>{
  const keyName=name==='pressure'?'pressureBar':name==='size'?'radiusMm':'standOff';
  config=sanitize({...config,[keyName]:Number(el.value)});
  $('pressure-val').textContent=num(config.pressureBar)+' бар';
  $('size-val').textContent=num(config.radiusMm)+' мм';
  $('distance-val').textContent=num(config.standOff)+' R₀';
  applyConfig(config);
 });
}
document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>applyConfig(PRESETS[el.dataset.preset])));
document.querySelectorAll('[data-cloud]').forEach(el=>el.addEventListener('click',()=>{
 if(cloud.mode===el.dataset.cloud)return;
 cloud=sanitizeCloud({...cloud,mode:el.dataset.cloud});
 selectedBubble=0;applyConfig(config);
}));
$('wall-mode').addEventListener('click',()=>{
 cloud=sanitizeCloud({...cloud,wall:!cloud.wall});applyConfig(config);
});
$('pressure-view').addEventListener('click',()=>{
 showPressure=!showPressure;syncControls();dirty=true;save();
});
$('launch').addEventListener('click',()=>{
 if(pendingRebuild) {
  pendingRebuild=false;
  solution=simulateCloud(config,cloud);
  syncControls();
 }
 if(mode!=='paused')timeTau=0;
 mode='running';
 lastFrame=performance.now();
 refreshState();needGraph=true;save();
});
pauseButton.addEventListener('click',()=>{
 if(mode==='running')mode='paused';
 else if(mode==='paused') {mode='running';lastFrame=performance.now()}
 refreshState();save();
});
$('speed').addEventListener('click',()=>{
 const options=[0.6,1,1.8];speed=options[(options.indexOf(speed)+1)%options.length];
 syncControls();save();
});
const dialog=$('science-panel');
let previousFocus=null;
function showScience(){
 previousFocus=document.activeElement;
 if(mode==='running'){mode='paused';refreshState();save()}
 dialog.hidden=false;
 $('close-science').focus();
}
function closeScience(){dialog.hidden=true;previousFocus?.focus()}
$('science').addEventListener('click',showScience);
$('close-science').addEventListener('click',closeScience);
$('science-done').addEventListener('click',closeScience);
dialog.addEventListener('pointerdown',ev=>{if(ev.target===dialog)closeScience()});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!dialog.hidden)closeScience()});
field.addEventListener('pointerdown',e=>{
 if(mode==='running')return;
 const rect=field.getBoundingClientRect();
 const px=e.clientX-rect.left,py=e.clientY-rect.top;
 const g=solution.kind==='cloud'?cloudViewport(rect.width,rect.height,solution):sceneMetrics(rect.width,rect.height,config.standOff);
 if(solution.kind==='cloud'){
   // Use the nearest object first; overlapping touch targets must not steal taps.
   let index=-1,nearest=Infinity;
   g.bubbles.forEach((bubble,i)=>{
     const d=Math.hypot(bubble.x-px,bubble.y-py);
     if(d<nearest&&d<Math.max(20,bubble.r+10)){nearest=d;index=i}
   });
   if(index>=0){
     selectedBubble=index;syncControls();refreshState();needGraph=true;dirty=true;save();return;
   }
 }
 if(Math.abs(px-g.wallX)>Math.max(31,g.baseRadius*.55)||py>rect.height-96)return;
 draggingWall={x:e.clientX,gamma:config.standOff,pointerId:e.pointerId,scale:g.baseRadius};

 field.setPointerCapture(e.pointerId);e.preventDefault();
});
field.addEventListener('pointermove',e=>{
 if(!draggingWall||draggingWall.pointerId!==e.pointerId)return;
 const rect=field.getBoundingClientRect();
 const next=draggingWall.gamma+(e.clientX-draggingWall.x)/Math.max(35,draggingWall.scale);
 applyConfig({...config,standOff:Math.round(Math.max(1.15,Math.min(4,next))*20)/20});
 e.preventDefault();
});
function cancelWall(){draggingWall=null}
field.addEventListener('pointerup',cancelWall);
field.addEventListener('pointercancel',cancelWall);
field.addEventListener('lostpointercapture',cancelWall);
// Scrub the physically integrated radius curve without starting playback.
function graphScrub(e){
 const rect=graph.getBoundingClientRect();
 timeTau=Math.max(0,Math.min(solution.durationTau,(e.clientX-rect.left)/rect.width*solution.durationTau));
 mode='paused';refreshState();needGraph=true;save();
}
graph.addEventListener('pointerdown',e=>{
 if(mode==='running')mode='paused';
 scrubbing=true;graph.setPointerCapture(e.pointerId);graphScrub(e);e.preventDefault();
});
graph.addEventListener('pointermove',e=>{if(scrubbing)graphScrub(e)});
graph.addEventListener('pointerup',()=>{scrubbing=false});
graph.addEventListener('pointercancel',()=>{scrubbing=false});
graph.addEventListener('lostpointercapture',()=>{scrubbing=false});
function render(timestamp){
 if(document.hidden){lastFrame=timestamp;requestAnimationFrame(render);return}
 const dt=lastFrame?Math.min(.07,Math.max(0,(timestamp-lastFrame)/1000)):0;
 lastFrame=timestamp;
 if(mode==='running'){
  const total=reduceMotion.matches?2.4:4.2;
  timeTau=Math.min(solution.durationTau,timeTau+dt*speed*solution.durationTau/total);
  if(timeTau>=solution.durationTau){mode='complete';save()}
  refreshState();needGraph=true;
 }
 const fieldBox=resizeCanvas(field);
 const point=solution.kind==='cloud'?cloudAt(solution,mode==='ready'?0:timeTau)
   :mode==='ready'?sampleAt(solution,0):sampleAt(solution,timeTau);
 if(dirty||mode==='running'||!lastDimensions||fieldBox.w!==lastDimensions.w||fieldBox.h!==lastDimensions.h){
   lastDimensions=solution.kind==='cloud'
     ?renderCloudScene(fieldBox.ctx,fieldBox.w,fieldBox.h,solution,point,mode,selectedBubble,showPressure)
     :renderScene(fieldBox.ctx,fieldBox.w,fieldBox.h,solution,point,mode,timestamp/1000);
   $('radius-now').innerHTML=num(config.radiusMm*(solution.kind==='cloud'?point.bubbles[selectedBubble].radius:point.radius),3)+' <small>мм</small>';
   $('time-now').innerHTML=formatMicros(point.t*solution.scaleUs)+' <small>мкс</small>';
   dirty=false;
 }
 if(needGraph||graph.width===0){
  const graphBox=resizeCanvas(graph);
  if(solution.kind==='cloud')renderCloudGraph(graphBox.ctx,graphBox.w,graphBox.h,solution,timeTau,mode!=='ready',selectedBubble);
  else renderGraph(graphBox.ctx,graphBox.w,graphBox.h,solution,timeTau,mode!=='ready');
  needGraph=false;
 }
 requestAnimationFrame(render);
}
addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='running'){mode='paused';refreshState();save()}});
addEventListener('resize',()=>{needGraph=true;dirty=true});
syncControls();refreshState();requestAnimationFrame(render);
