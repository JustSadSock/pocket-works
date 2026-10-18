import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { DEFAULTS, PRESETS, sanitize, simulateBubble, sampleAt } from './physics.js';
import { resizeCanvas, renderScene, renderGraph, sceneMetrics } from './render.js';
installMobileRuntime();

const $=id=>document.getElementById(id);
const field=$('field'),graph=$('trace');
const control={pressure:$('pressure'),size:$('size'),distance:$('distance')};
const key='pocket-works:cavitation-lab:state:v1';
let restored={};
try{restored=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{restored={}}
let config=sanitize(restored.config||DEFAULTS);
let speed= [0.6,1,1.8].includes(restored.speed)?restored.speed:1;
let solution=simulateBubble(config),timeTau=Math.min(Math.max(0,+restored.timeTau||0),solution.durationTau);
let mode=restored.mode==='ready'?'ready':timeTau>0?'paused':'ready';
let lastFrame=0,draggingWall=null,scrubbing=false,lastDimensions=null,pendingRebuild=false,needGraph=true,dirty=true;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const num=(n,d=2)=>n.toFixed(d).replace('.',',');
const formatMicros=(n)=>Math.round(n).toLocaleString('ru-RU');
const pauseButton=$('pause');
function save(){
 try{localStorage.setItem(key,JSON.stringify({config,speed,timeTau,mode}))}catch{ /* Storage unavailable, experiment still works */ }
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
 $('collapse-time').textContent=formatMicros(solution.collapseTimeUs)+' мкс';
 $('min-radius').textContent=num(solution.minRadiusMm,3)+' мм';
 $('jet-status').textContent=solution.jetFactor>.48?'Вероятна микроструя':solution.jetFactor>.12?'Слабая асимметрия':'Почти свободный';
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
 else if(mode==='running' && timeTau<solution.firstMinimumTau*.7)label='ДАВЛЕНИЕ СЖИМАЕТ ПУЗЫРЁК';
 else if(mode==='running' && timeTau<solution.firstMinimumTau)label='УСКОРЕНИЕ КОЛЛАПСА';
 else if(mode==='running')label=solution.jetFactor>.15?'КОЛЛАПС · СТРУЯ У СТЕНКИ':'КОЛЛАПС · РАДИАЛЬНАЯ ВОЛНА';
 $('phase-label').textContent=label;
 $('graph-caption').textContent=mode==='ready'?'РАСЧЁТНАЯ ТРАЕКТОРИЯ':'РАДИУС / РЕАЛЬНОЕ ВРЕМЯ';
 $('wall-instruction').style.opacity=mode==='running'?'.35':'.75';
}
function applyConfig(next){
 config=sanitize(next);
 mode='ready';timeTau=0;
 // Coalesce slider gestures to one numerical solve per paint.
 if(!pendingRebuild) {
   pendingRebuild=true;
   requestAnimationFrame(()=>{
    pendingRebuild=false;
    try{solution=simulateBubble(config);syncControls();refreshState();needGraph=true;save()}
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
$('launch').addEventListener('click',()=>{
 if(pendingRebuild) {
  pendingRebuild=false;
  solution=simulateBubble(config);
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
 const g=sceneMetrics(rect.width,rect.height,config.standOff);
 if(Math.abs(px-g.wallX)>Math.max(31,g.baseRadius*.55)||py>rect.height-96)return;
 draggingWall={x:e.clientX,gamma:config.standOff,pointerId:e.pointerId};
 field.setPointerCapture(e.pointerId);e.preventDefault();
});
field.addEventListener('pointermove',e=>{
 if(!draggingWall||draggingWall.pointerId!==e.pointerId)return;
 const rect=field.getBoundingClientRect();
 const g=sceneMetrics(rect.width,rect.height,config.standOff);
 const next=draggingWall.gamma+(e.clientX-draggingWall.x)/Math.max(68,g.baseRadius*1.4);
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
 const point=mode==='ready'?sampleAt(solution,0):sampleAt(solution,timeTau);
 if(dirty||mode==='running'||!lastDimensions||fieldBox.w!==lastDimensions.w||fieldBox.h!==lastDimensions.h){
   lastDimensions=renderScene(fieldBox.ctx,fieldBox.w,fieldBox.h,solution,point,mode,timestamp/1000);
   $('radius-now').innerHTML=num(config.radiusMm*point.radius,3)+' <small>мм</small>';
   $('time-now').innerHTML=formatMicros(point.t*solution.scaleUs)+' <small>мкс</small>';
   dirty=false;
 }
 if(needGraph||graph.width===0){
  const graphBox=resizeCanvas(graph);
  renderGraph(graphBox.ctx,graphBox.w,graphBox.h,solution,timeTau,mode!=='ready');
  needGraph=false;
 }
 requestAnimationFrame(render);
}
addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='running'){mode='paused';refreshState();save()}});
addEventListener('resize',()=>{needGraph=true;dirty=true});
syncControls();refreshState();requestAnimationFrame(render);
