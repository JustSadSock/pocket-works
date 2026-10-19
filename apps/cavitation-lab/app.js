import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { DEFAULTS, PRESETS, sanitize, simulateBubble, sampleAt } from './physics.js';
import { resizeCanvas, renderScene, renderGraph, sceneMetrics } from './render.js';
import { sanitizeCloud, simulateCloud, cloudAt } from './coupling.js';
import { cloudViewport, renderCloudScene, renderCloudGraph } from './cloud-render.js';
import { MAX_BUBBLES, layoutTemplate, editedBubble, findNewBubble, cascadeMetrics, normalizeBubbles, layoutIssue } from './constructor.js';
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
let selectedBubble=Math.max(0,Math.floor(Number(restored.selectedBubble)||0));
let customDraft=normalizeBubbles(restored.customDraft||cloud.bubbles||layoutTemplate());
let history=[];
let bubbleDrag=null;
let speed= [0.6,1,1.8].includes(restored.speed)?restored.speed:1;
let solution=simulateCloud(config,cloud),timeTau=Math.min(Math.max(0,+restored.timeTau||0),solution.durationTau);
let mode=restored.mode==='ready'?'ready':timeTau>0?'paused':'ready';
selectedBubble=Math.min(selectedBubble,solution.geometry.length-1);
let lastFrame=0,draggingWall=null,scrubbing=false,lastDimensions=null,pendingRebuild=false,needGraph=true,dirty=true;
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const num=(n,d=2)=>n.toFixed(d).replace('.',',');
const formatMicros=(n)=>Math.round(n).toLocaleString('ru-RU');
const pauseButton=$('pause');
function save(){
 try{localStorage.setItem(key,JSON.stringify({config,speed,timeTau,mode,cloud,showPressure,customDraft,selectedBubble}))}catch{ /* Storage unavailable, experiment still works */ }
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
 const custom=cloud.mode==='custom';
 document.querySelector('.app-shell').classList.toggle('custom-mode',custom);
 $('experiment-presets').hidden=custom;
 $('constructor-panel').hidden=!custom;
 $('cloud-options').hidden=cloud.mode==='single';
 if(custom){
   $('edit-size').value=String(cloud.bubbles[selectedBubble]?.s||1);
   $('edit-size-label').firstChild.textContent='Радиус R'+(selectedBubble+1)+' ';
   $('edit-size-val').textContent=num(cloud.bubbles[selectedBubble]?.s||1)+' R₀';
   $('add-bubble').disabled=cloud.bubbles.length>=MAX_BUBBLES;
   $('remove-bubble').disabled=cloud.bubbles.length<=1;
   $('undo-bubble').disabled=history.length===0;
   const cascade=cascadeMetrics(solution);
   $('cascade-summary').textContent='ПОРЯДОК '+cascade.order.map(i=>'R'+(i+1)).join(' → ')
     +' · разброс '+formatMicros(cascade.spreadUs)+' мкс';
 }
 $('wall-mode').setAttribute('aria-pressed',String(cloud.wall));
 $('wall-mode').textContent='Отражение стенки · '+(cloud.wall?'вкл.':'выкл.');
 $('pressure-view').setAttribute('aria-pressed',String(showPressure));
 $('pressure-view').textContent='Поле давления · '+(showPressure?'вкл.':'выкл.');
 $('experiment-title').innerHTML=cloud.mode==='single'?'01 <span>/</span> ОДИН ПУЗЫРЁК'
   :cloud.mode==='pair'?'02 <span>/</span> СВЯЗАННАЯ ПАРА'
   :cloud.mode==='cluster'?'05 <span>/</span> ОБЛАКО ПУЗЫРЬКОВ'
   :String(solution.geometry.length).padStart(2,'0')+' <span>/</span> МОЯ УСТАНОВКА';
 $('radius-label').textContent=solution.kind==='cloud'?'РАДИУС R'+(selectedBubble+1):'РАДИУС';
 $('graph-axis').textContent=solution.kind==='cloud'?'R / Rᵢ₀':'R / R₀';
 $('pressure-legend').hidden=solution.kind!=='cloud'||!showPressure;
 $('model-note').textContent=solution.kind==='cloud'?'СВЯЗАННЫЕ СФЕРЫ · ПОЛЕ БЕЗ УДАРНЫХ ВОЛН':'СФЕРИЧЕСКАЯ МОДЕЛЬ · СТРУЯ У СТЕНКИ — СХЕМА';
 $('collapse-time').textContent=solution.kind==='cloud'
   ?(custom?formatMicros(solution.individualCollapseUs[selectedBubble])+' мкс · R'+(selectedBubble+1)
     :solution.individualCollapseUs.map(n=>formatMicros(n)).join(' / ')+' мкс')
   :formatMicros(solution.collapseTimeUs)+' мкс';
 $('min-radius').textContent=num(custom&&solution.kind==='cloud'
   ?solution.minRatios[selectedBubble]*solution.geometry[selectedBubble].r0*config.radiusMm
   :solution.minRadiusMm,3)+' мм';
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
 for(const element of document.querySelectorAll('#constructor-panel button,#edit-size')){
   element.disabled=mode==='running'||(element.id==='remove-bubble'&&cloud.bubbles?.length<=1)
     ||(element.id==='add-bubble'&&cloud.bubbles?.length>=MAX_BUBBLES)
     ||(element.id==='undo-bubble'&&history.length===0);
 }
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
 $('wall-instruction').textContent=cloud.mode==='custom'
   ?'ПЕРЕТАЩИТЕ ПУЗЫРЁК · КОСНИТЕСЬ ВОДЫ ДЛЯ ДОБАВЛЕНИЯ'
   :solution.kind==='cloud'?'ВЫБЕРИТЕ ПУЗЫРЁК · СТЕНКА ↔'
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
function editorNotice(message,error=false){
 const element=$('editor-message');
 element.textContent=message;
 element.classList.toggle('error',error);
}
function rememberLayout(){
 if(cloud.mode!=='custom')return;
 history.push(cloud.bubbles.map(b=>({...b})));
 if(history.length>20)history.shift();
 $('undo-bubble').disabled=false;
}
function commitLayout(next,selection=selectedBubble){
 if(cloud.mode!=='custom'||mode==='running')return;
 cloud=sanitizeCloud({mode:'custom',wall:cloud.wall,bubbles:next});
 customDraft=cloud.bubbles.map(b=>({...b}));
 selectedBubble=Math.min(Math.max(0,selection),customDraft.length-1);
 applyConfig(config);
}
document.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
 if(cloud.mode!=='custom'||mode==='running')return;
 const layout=layoutTemplate(button.dataset.layout);
 const issue=layoutIssue(layout,config.standOff);
 if(issue){editorNotice(issue,true);return}
 rememberLayout();commitLayout(layout,0);
 editorNotice('Установка перестроена. Запустите импульс.');
}));
$('add-bubble').addEventListener('click',()=>{
 if(cloud.mode!=='custom'||mode==='running')return;
 const outcome=findNewBubble(cloud.bubbles,config.standOff);
 if(outcome.error){editorNotice(outcome.error,true);return}
 rememberLayout();commitLayout(outcome.bubbles,outcome.bubbles.length-1);
 editorNotice('Новый пузырёк добавлен. Измените его радиус или положение.');
});
$('remove-bubble').addEventListener('click',()=>{
 if(cloud.mode!=='custom'||mode==='running'||cloud.bubbles.length<=1)return;
 rememberLayout();
 const bubbles=cloud.bubbles.filter((_,i)=>i!==selectedBubble);
 commitLayout(bubbles,Math.max(0,selectedBubble-1));
 editorNotice('Пузырёк удалён. Можно вернуть действие кнопкой «Отменить».');
});
$('undo-bubble').addEventListener('click',()=>{
 if(cloud.mode!=='custom'||mode==='running'||!history.length)return;
 const previous=history.pop();
 commitLayout(previous,Math.min(selectedBubble,previous.length-1));
 editorNotice('Предыдущее расположение восстановлено.');
});
let sizeGesture=false;
$('edit-size').addEventListener('input',event=>{
 if(cloud.mode!=='custom'||mode==='running')return;
 if(!sizeGesture){rememberLayout();sizeGesture=true}
 const answer=editedBubble(cloud.bubbles,selectedBubble,{s:Number(event.target.value)},config.standOff);
 if(answer.error){
   editorNotice(answer.error,true);
   event.target.value=String(cloud.bubbles[selectedBubble].s);
   return;
 }
 commitLayout(answer.bubbles);
 editorNotice('Радиус R'+(selectedBubble+1)+' = '+num(answer.bubbles[selectedBubble].s)+' R₀');
});
$('edit-size').addEventListener('change',()=>{sizeGesture=false});
document.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&cloud.mode==='custom'&&dialog.hidden){
   event.preventDefault();$('undo-bubble').click();
 }
});
for(const [name,el] of Object.entries(control)){
 el.addEventListener('input',()=>{
  const keyName=name==='pressure'?'pressureBar':name==='size'?'radiusMm':'standOff';
  if(name==='distance'&&cloud.mode==='custom'&&layoutIssue(cloud.bubbles,Number(el.value))){
    el.value=String(config.standOff);
    editorNotice('Переместите пузырёк, чтобы приблизить стенку',true);
    return;
  }
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
 if(cloud.mode==='custom')customDraft=normalizeBubbles(cloud.bubbles);
 const custom=el.dataset.cloud==='custom';
 cloud=sanitizeCloud({mode:el.dataset.cloud,wall:cloud.wall,...(custom?{bubbles:customDraft}:{})});
 selectedBubble=0;history=[];applyConfig(config);
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
// Direct manipulation: tap to select, drag to move, tap clear water to add.
field.addEventListener('pointerdown',event=>{
 if(mode==='running')return;
 const rect=field.getBoundingClientRect();
 const px=event.clientX-rect.left,py=event.clientY-rect.top;
 const g=solution.kind==='cloud'?cloudViewport(rect.width,rect.height,solution):sceneMetrics(rect.width,rect.height,config.standOff);
 if(solution.kind==='cloud'){
   let index=-1,nearest=Infinity;
   g.bubbles.forEach((b,i)=>{
     const dist=Math.hypot(px-b.x,py-b.y);
     if(dist<nearest&&dist<Math.max(19,b.r+9)){nearest=dist;index=i}
   });
   if(index>=0){
     selectedBubble=index;syncControls();refreshState();needGraph=true;dirty=true;save();
     if(cloud.mode==='custom'){
       bubbleDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,
         start:{...cloud.bubbles[index]},index,scale:g.scale,moved:false};
       field.setPointerCapture(event.pointerId);
       event.preventDefault();
     }
     return;
   }
   if(cloud.mode==='custom'&&px<g.wallX-16&&py<rect.height-108&&py>36){
     const [x,y]=g.toWorld(px,py);
     const newBubble=findNewBubble(cloud.bubbles,config.standOff,{x,y});
     if(newBubble.error){editorNotice(newBubble.error,true);return}
     rememberLayout();commitLayout(newBubble.bubbles,newBubble.bubbles.length-1);
     editorNotice('Новый пузырёк создан касанием воды.');
     event.preventDefault();return;
   }
 }
 if(Math.abs(px-g.wallX)>Math.max(27,g.baseRadius*.48)||py>rect.height-100)return;
 draggingWall={x:event.clientX,gamma:config.standOff,pointerId:event.pointerId,scale:g.baseRadius};
 field.setPointerCapture(event.pointerId);event.preventDefault();
});
field.addEventListener('pointermove',event=>{
 if(bubbleDrag&&bubbleDrag.pointerId===event.pointerId){
   const drag=bubbleDrag;
   const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
   if(!drag.moved&&Math.hypot(dx,dy)<3)return;
   if(!drag.moved){rememberLayout();drag.moved=true}
   const outcome=editedBubble(cloud.bubbles,drag.index,{
     x:drag.start.x+dx/drag.scale,y:drag.start.y-dy/drag.scale
   },config.standOff);
   if(outcome.error){editorNotice(outcome.error,true)}
   else{
     // Keep the pointer path responsive: preview centers optically, integrate once on release.
     drag.pending=outcome.bubbles;
     solution.geometry[drag.index].x=outcome.bubbles[drag.index].x;
     solution.geometry[drag.index].y=outcome.bubbles[drag.index].y;
     dirty=true;
     editorNotice('R'+(drag.index+1)+' · x '+num(outcome.bubbles[drag.index].x)+' / y '+num(outcome.bubbles[drag.index].y));
   }
   event.preventDefault();return;
 }
 if(!draggingWall||draggingWall.pointerId!==event.pointerId)return;
 const wall=draggingWall;
 const next=wall.gamma+(event.clientX-wall.x)/Math.max(35,wall.scale);
 const v=Math.round(Math.max(1.15,Math.min(4,next))*20)/20;
 if(cloud.mode==='custom'&&layoutIssue(cloud.bubbles,v)){
   editorNotice('Стенка слишком близко к пузырьку',true);
   return;
 }
 applyConfig({...config,standOff:v});
 event.preventDefault();
});
function stopDrag(){
 if(bubbleDrag){
  if(bubbleDrag.pending)commitLayout(bubbleDrag.pending,bubbleDrag.index);
  else if(bubbleDrag.moved){
    history.pop();
    // If a gesture could not change the geometry, restore the original position.
    solution.geometry[bubbleDrag.index].x=bubbleDrag.start.x;
    solution.geometry[bubbleDrag.index].y=bubbleDrag.start.y;
    dirty=true;
  }
 }
 bubbleDrag=null;draggingWall=null;
}
field.addEventListener('pointerup',stopDrag);
field.addEventListener('pointercancel',stopDrag);
field.addEventListener('lostpointercapture',stopDrag);
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
