import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {WIDTH,HEIGHT,SHAPES,inside,contain,shapePolygon,validatePolygon,sanitizeWorld,initialParticles,advance} from './physics.mjs';
installMobileRuntime();

const $=id=>document.getElementById(id),canvas=$('board'),ctx=canvas.getContext('2d',{alpha:false}),stage=$('stageBody');
const STORAGE='pocket-works:billiard-lab:wavefront-v2',DENSITIES=[512,1024,2048,4096,8192],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const defaults={shape:'rectangle',origin:{x:366,y:243},circles:[],mirrors:[]};
const NAMES={rectangle:'ПРЯМОУГОЛЬНИК',circle:'КРУГ',stadium:'СТАДИОН',triangle:'ТРЕУГОЛЬНИК',ellipse:'ЭЛЛИПС',diamond:'РОМБ',pentagon:'ПЯТИУГОЛЬНИК',hexagon:'ШЕСТИУГОЛЬНИК',octagon:'ВОСЬМИУГОЛЬНИК',star:'ЗВЕЗДА',custom:'МОЁ ПОЛЕ'};
const PALETTES={
 spectrum:['#79f3f0','#91c6ff','#c5a0ff','#ff88b5','#ffcb84'],
 aurora:['#bdfbdd','#66f5c1','#52cae5','#a3a9ff','#acfce3'],
 ember:['#ffe7ad','#ff9e65','#ff6785','#ffc3a0','#ffd070'],
 arctic:['#d8ffff','#77d4f6','#7dacf7','#e8f8ff','#a0fffa'],
 mono:['#f7f6ed','#d0e6dc','#fafff6','#d4f0e5','#f8fbf3']
};
const PALETTE_NAMES={spectrum:'СПЕКТР',aurora:'СИЯНИЕ',ember:'ЗАКАТ',arctic:'ЛЁД',mono:'МОНОХРОМ'};
function read(){try{const r=JSON.parse(localStorage.getItem(STORAGE)||'{}');return r&&typeof r==='object'?r:{}}catch{return {}}}
const saved=read(),isCompact=matchMedia('(max-width:760px)').matches;
let world=sanitizeWorld(saved.world||defaults),customVertices=Array.isArray(saved.customVertices)?saved.customVertices:(world.shape==='custom'?world.vertices:null);
let rayIndex=clamp(Math.round(Number.isFinite(saved.rayIndex)?saved.rayIndex:(isCompact?1:2)),0,4);
let speed=clamp(Number.isFinite(saved.speed)?saved.speed:100,25,250);
let display=saved.display==='dots'?'dots':'line',palette=Object.hasOwn(PALETTES,saved.palette)?saved.palette:'spectrum',tool='source';
let particles=initialParticles(DENSITIES[rayIndex],world.origin),playing=true,elapsed=0,previousFrame=0,lastRender=0,telemetryAt=0;
let undos=[],builder=null,drag=null,forceDraw=true,toastTimer=0,frameSamples=0,renderSamples=0;
let fit={scale:1,left:0,top:0},pixelRatio=1,lastCanvasW=0,lastCanvasH=0,backgroundGradient=null;
function notify(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2450)}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({world,customVertices,rayIndex,speed,display,palette}))}catch{notify('Не удалось сохранить параметры лаборатории.')}}
function takeUndo(){undos.push(JSON.stringify(world));if(undos.length>24)undos.shift()}
function effectiveCount(){
 const sides=world.edges.length,obstacles=world.circles.length+world.mirrors.length;
 let cap=sides>=10?1024:sides>=8?1536:sides>=6?2048:sides>=3?3072:8192;
 if(obstacles>8)cap=Math.min(cap,1024);
 else if(obstacles>3)cap=Math.min(cap,2048);
 else if(obstacles>0)cap=Math.min(cap,4096);
 return Math.min(DENSITIES[rayIndex],cap);
}
function startOver(){particles=initialParticles(effectiveCount(),world.origin);elapsed=0;previousFrame=0;forceDraw=true;updateNumbers()}
function commit(action){
 takeUndo();action();world=sanitizeWorld(world);
 startOver();save();updateControls();
}
function undo(){if(builder){removeVertex();return}if(!undos.length)return;world=sanitizeWorld(JSON.parse(undos.pop()));startOver();save();updateControls();notify('Предыдущее изменение отменено.')}
function updateNumbers(){
 $('countStat').textContent=particles.count.toLocaleString('ru-RU');
 $('timeStat').textContent=elapsed.toFixed(1)+' с';
 $('bounceStat').textContent=particles.reflections.toLocaleString('ru-RU');
}
function updateState(){
 $('stateLabel').textContent=builder?'ПОСТРОЕНИЕ':playing?'ДВИЖЕНИЕ':'ПАУЗА';
 $('playSymbol').textContent=playing?'Ⅱ':'▶';
 $('playText').textContent=playing?'ПАУЗА':'ПРОДОЛЖИТЬ';
 $('playBtn').disabled=!!builder;
 $('playBtn').setAttribute('aria-pressed',String(playing));
 stage.classList.toggle('paused',!playing);
}
function updateControls(){
 $('shapeLabel').textContent=builder?'КОНСТРУКТОР ПОЛЯ':NAMES[world.shape];
 document.querySelectorAll('[data-shape]').forEach(b=>{const active=b.dataset.shape===(builder?'custom':world.shape);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 document.querySelectorAll('[data-tool]').forEach(b=>{const active=b.dataset.tool===tool;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 document.querySelectorAll('[data-display]').forEach(b=>{const active=b.dataset.display===display;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 document.querySelectorAll('[data-palette]').forEach(b=>{const active=b.dataset.palette===palette;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
 $('paletteName').textContent=PALETTE_NAMES[palette];
 $('raysRange').value=rayIndex;$('raysOut').textContent=DENSITIES[rayIndex].toLocaleString('ru-RU');
 $('rayCapNote').textContent=effectiveCount()<DENSITIES[rayIndex]?'В этой камере активны '+effectiveCount().toLocaleString('ru-RU')+' лучей — ограничение нагрузки.':'Все выбранные лучи активны.';
 $('speedRange').value=speed;$('speedOut').textContent=(speed/100).toFixed(2).replace(/0$/,'')+'×';
 $('undoBtn').disabled=(!undos.length&&!builder);
 $('customSetup').hidden=!(builder||world.shape==='custom');
 $('customHelp').textContent=builder?'Нажимай на поле по периметру. От 3 до 16 точек, без пересечения стенок.':'Это твоя собственная геометрия. Можно нарисовать новый контур.';
 $('customDrawBtn').textContent=builder?'Начать заново':'Изменить контур';
 $('customBackBtn').hidden=!builder;
 $('customBackBtn').disabled=!builder?.points.length;
 $('customFinishBtn').hidden=!builder;
 $('customFinishBtn').disabled=!builder||builder.points.length<3;
 $('customCancelBtn').hidden=!builder;
 $('touchHint').textContent=builder?'НАЖИМАЙ ПО ПЕРИМЕТРУ • ГОТОВО — ЗАМКНУТЬ':{
 source:'НАЖМИ ИЛИ ПОТЯНИ — ПЕРЕМЕСТИТЬ ИСТОЧНИК',
 circle:'НАЖМИ — ДОБАВИТЬ ОТРАЖАТЕЛЬ',
 mirror:'ПРОВЕДИ ЛИНИЮ — ПЕРЕГОРОДКА',
 erase:'НАЖМИ — УДАЛИТЬ ПРЕПЯТСТВИЕ'
 }[tool];
 updateState();forceDraw=true;
}
function openBuilder(){
 if(builder)return;
 builder={points:[],previousPlaying:playing};playing=false;drag=null;updateControls();
 notify('Построй поле точками. Заверши кнопкой «Готово».');
}
function removeVertex(){if(!builder)return;builder.points.pop();updateControls()}
function cancelBuilder(){if(!builder)return;playing=builder.previousPlaying;builder=null;drag=null;previousFrame=0;updateControls()}
function addVertex(p){
 if(!builder)return;
 const q={x:clamp(Math.round(p.x),38,862),y:clamp(Math.round(p.y),38,502)};
 if(builder.points.length>=16){notify('Максимум 16 углов. Замкни контур.');return}
 if(builder.points.some(a=>Math.hypot(a.x-q.x,a.y-q.y)<24)){notify('Слишком близко к соседней точке.');return}
 builder.points.push(q);updateControls();
}
function finishBuilder(){
 if(!builder)return;
 const result=validatePolygon(builder.points);
 if(!result.ok){notify(result.reason);return}
 const prevPlaying=builder.previousPlaying,points=result.points;
 builder=null;playing=prevPlaying;customVertices=points;
 commit(()=>{world.shape='custom';world.vertices=points;world.origin=contain('custom',world.origin,20,points);world.circles=[];world.mirrors=[]});
 notify('Собственная камера создана. Волна перестроена.');
}
function setShape(shape){
 if(!SHAPES.includes(shape))return;
 if(shape==='custom'){
  if(builder)return;
  if(!customVertices||!validatePolygon(customVertices).ok){openBuilder();return}
 }
 if(builder)cancelBuilder();
 if(shape===world.shape)return;
 commit(()=>{
  world.shape=shape;
  if(shape==='custom')world.vertices=customVertices;
  world.origin=contain(shape,world.origin,20,shape==='custom'?customVertices:null);
  world.circles=[];world.mirrors=[];
 });
}
function setTool(next){if(!['source','circle','mirror','erase'].includes(next))return;tool=next;drag=null;updateControls()}

function chamberPath(){
 ctx.beginPath();
 if(world.shape==='rectangle')ctx.rect(26,27,848,486);
 else if(world.shape==='circle')ctx.arc(450,270,232,0,Math.PI*2);
 else if(world.shape==='ellipse')ctx.ellipse(450,270,386,232,0,0,Math.PI*2);
 else if(world.shape==='stadium'){
  ctx.moveTo(278,46);ctx.lineTo(622,46);ctx.arc(622,270,224,-Math.PI/2,Math.PI/2);
  ctx.lineTo(278,494);ctx.arc(278,270,224,Math.PI/2,Math.PI*1.5);ctx.closePath();
 }else{
  const poly=world.polygon||shapePolygon(world.shape,world.vertices);
  if(poly?.length){ctx.moveTo(poly[0].x,poly[0].y);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x,poly[i].y);ctx.closePath()}
 }
}
function paletteGradient(){
 const g=ctx.createLinearGradient(45,100,840,435),colors=PALETTES[palette];
 colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));
 return g;
}
function paintBackground(){
 ctx.fillStyle='#08161a';ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.save();chamberPath();ctx.clip();
 if(!backgroundGradient){backgroundGradient=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);backgroundGradient.addColorStop(0,'#14272c');backgroundGradient.addColorStop(.5,'#0d2228');backgroundGradient.addColorStop(1,'#142930')}
 ctx.fillStyle=backgroundGradient;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.strokeStyle='#72908b18';ctx.lineWidth=.75;ctx.beginPath();
 for(let x=0;x<=WIDTH;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT)}
 for(let y=0;y<=HEIGHT;y+=32){ctx.moveTo(0,y);ctx.lineTo(WIDTH,y)}
 ctx.stroke();
 ctx.restore();
}
function drawLine(){
 const {x,y,count}=particles;
 if(count<2)return;
 ctx.beginPath();ctx.moveTo(x[0],y[0]);
 for(let i=1;i<count;i++)ctx.lineTo(x[i],y[i]);
 ctx.closePath();
 ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=paletteGradient();ctx.lineWidth=1.75;
 ctx.stroke();
}
function drawDots(){
 const {x,y,count}=particles,colors=PALETTES[palette],n=colors.length;
 for(let j=0;j<n;j++){
  const start=Math.floor(j*count/n),end=Math.floor((j+1)*count/n);
  ctx.beginPath();
  for(let i=start;i<end;i++){ctx.moveTo(x[i]+1.2,y[i]);ctx.arc(x[i],y[i],1.2,0,Math.PI*2)}
  ctx.fillStyle=colors[j];ctx.fill();
 }
}
function drawObstacles(){
 for(const c of world.circles){
  ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);
  ctx.fillStyle='#1c3841';ctx.fill();ctx.strokeStyle='#e0ac86';ctx.lineWidth=2.5;ctx.stroke();
  ctx.beginPath();ctx.arc(c.x,c.y,3,0,Math.PI*2);ctx.fillStyle='#f3c19a';ctx.fill();
 }
 for(const m of world.mirrors){
  ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.strokeStyle='#e1ad85';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();
  for(const point of [{x:m.x1,y:m.y1},{x:m.x2,y:m.y2}]){ctx.beginPath();ctx.arc(point.x,point.y,4,0,Math.PI*2);ctx.fillStyle='#f1d4b4';ctx.fill()}
 }
 if(drag?.type==='mirror'){
  ctx.beginPath();ctx.moveTo(drag.from.x,drag.from.y);ctx.lineTo(drag.now.x,drag.now.y);
  ctx.strokeStyle='#f9ce93';ctx.lineWidth=4;ctx.setLineDash([8,7]);ctx.stroke();ctx.setLineDash([]);
 }
}
function drawSource(){
 const {x,y}=world.origin;ctx.save();ctx.translate(x,y);
 ctx.strokeStyle='#e5af84';ctx.lineWidth=1.5;
 ctx.beginPath();ctx.arc(0,0,12,0,2*Math.PI);ctx.stroke();
 ctx.fillStyle='#ffe7be';ctx.beginPath();ctx.arc(0,0,3.5,0,2*Math.PI);ctx.fill();
 ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(-15,0);ctx.moveTo(15,0);ctx.lineTo(21,0);ctx.moveTo(0,-21);ctx.lineTo(0,-15);ctx.moveTo(0,15);ctx.lineTo(0,21);ctx.stroke();ctx.restore();
}
function drawCustomDraft(){
 if(!builder)return;
 const p=builder.points;if(!p.length)return;
 ctx.save();ctx.strokeStyle='#ffd2ab';ctx.lineWidth=3;ctx.fillStyle='#ffbd8e';
 ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);
 for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);
 if(p.length>2){ctx.closePath();ctx.fillStyle='#d7a27216';ctx.fill()}
 ctx.stroke();
 if(drag?.type==='vertex'){ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(p[p.length-1].x,p[p.length-1].y);ctx.lineTo(drag.now.x,drag.now.y);ctx.stroke();ctx.setLineDash([])}
 for(let i=0;i<p.length;i++){
  ctx.beginPath();ctx.arc(p[i].x,p[i].y,6,0,2*Math.PI);
  ctx.fillStyle=i===0?'#a6eeb8':'#ffbc85';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#0d292b';ctx.stroke();
 }
 ctx.restore();
}
function resizeCanvas(){
 const box=canvas.getBoundingClientRect(),cssW=Math.max(1,box.width),cssH=Math.max(1,box.height);
 // CSS size stays fixed. Only the pixel buffer changes: no intrinsic-size feedback loops.
 pixelRatio=Math.max(1,Math.min(1.5,window.devicePixelRatio||1,Math.sqrt(1_500_000/(cssW*cssH))));
 const w=Math.round(cssW*pixelRatio),h=Math.round(cssH*pixelRatio);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;lastCanvasW=w;lastCanvasH=h}
 const scale=Math.min(cssW/WIDTH,cssH/HEIGHT);
 fit={scale,left:(cssW-WIDTH*scale)/2,top:(cssH-HEIGHT*scale)/2};
}
function render(){
 resizeCanvas();
 const box=canvas.getBoundingClientRect();
 ctx.setTransform(1,0,0,1,0,0);
 ctx.fillStyle='#08171b';ctx.fillRect(0,0,canvas.width,canvas.height);
 const s=fit.scale*pixelRatio;
 ctx.setTransform(s,0,0,s,fit.left*pixelRatio,fit.top*pixelRatio);
 paintBackground();
 ctx.save();chamberPath();ctx.clip();
 if(!builder){if(display==='dots')drawDots();else drawLine()}
 drawObstacles();drawSource();ctx.restore();
 chamberPath();ctx.strokeStyle='#87b1ab';ctx.lineWidth=2.5;ctx.stroke();
 if(builder)drawCustomDraft();
 if(!playing&&!builder){ctx.fillStyle='#d9c0a5';ctx.font='700 13px ui-monospace,monospace';ctx.fillText('Ⅱ   ПАУЗА',42,65)}
}
function frame(timestamp){
 const raw=previousFrame?Math.max(0,Math.min(.06,(timestamp-previousFrame)/1000)):0;previousFrame=timestamp;
 // 50Hz display ceiling avoids double-work on 120Hz phones and high-DPI desktops.
 if(timestamp-lastRender<20&&!forceDraw){requestAnimationFrame(frame);return}
 const dt=lastRender?Math.min(.052,(timestamp-lastRender)/1000):0;
 const elapsedForDraw=lastRender?timestamp-lastRender:20;lastRender=timestamp;
 if(playing&&document.visibilityState==='visible'){
  const step=Math.max(0,dt)*speed/100;
  if(step>0){advance(particles,world,175*step);elapsed+=step}
  forceDraw=true;
 }
 if(forceDraw){
  render();forceDraw=false;frameSamples++;
 }
 renderSamples+=elapsedForDraw;
 if(renderSamples>=850){
  const fps=Math.round(frameSamples*1000/renderSamples);
  $('fpsLabel').textContent=fps+' FPS · БЕЗ ШЛЕЙФОВ';
  frameSamples=0;renderSamples=0;updateNumbers();
 }
 requestAnimationFrame(frame);
}
function pointOf(e){
 const rect=canvas.getBoundingClientRect();
 return {x:clamp((e.clientX-rect.left-fit.left)/fit.scale,0,WIDTH),y:clamp((e.clientY-rect.top-fit.top)/fit.scale,0,HEIGHT)};
}
function closest(p){
 let found=null,min=35;
 world.circles.forEach((c,i)=>{const d=Math.hypot(p.x-c.x,p.y-c.y);if(d<min){found={type:'circle',i};min=d}});
 world.mirrors.forEach((m,i)=>{const dx=m.x2-m.x1,dy=m.y2-m.y1,t=clamp(((p.x-m.x1)*dx+(p.y-m.y1)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(p.x-m.x1-t*dx,p.y-m.y1-t*dy);if(d<min){found={type:'mirror',i};min=d}});
 return found;
}
function down(e){
 if(e.button!==0||!$('clearModal').hidden)return;
 const p=pointOf(e);
 if(!builder&&!inside(world.shape,p.x,p.y,0,world.vertices))return;
 try{canvas.setPointerCapture(e.pointerId)}catch{}
 if(builder){drag={id:e.pointerId,type:'vertex',from:p,now:p};return}
 const selected=tool==='circle'?closest(p):null;
 drag={id:e.pointerId,type:tool==='circle'&&selected?.type==='circle'?'moveCircle':tool,index:selected?.i,from:p,now:p,before:JSON.stringify(world)};
 forceDraw=true;
}
function move(e){
 if(!drag||drag.id!==e.pointerId)return;
 drag.now=pointOf(e);
 if(drag.type==='source')world.origin=contain(world.shape,drag.now,20,world.vertices);
 if(drag.type==='moveCircle')world.circles[drag.index]={...world.circles[drag.index],...contain(world.shape,drag.now,45,world.vertices)};
 forceDraw=true;
}
function up(e,cancel=false){
 if(!drag||drag.id!==e.pointerId)return;
 const action=drag;drag=null;
 try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)}catch{}
 if(cancel){if(action.before)world=sanitizeWorld(JSON.parse(action.before));forceDraw=true;return}
 const p=pointOf(e);
 if(action.type==='vertex'){addVertex(p);forceDraw=true;return}
 if(action.type==='source'||action.type==='moveCircle'){
  undos.push(action.before);if(undos.length>24)undos.shift();
  if(action.type==='source')world.origin=contain(world.shape,p,20,world.vertices);
  else world.circles[action.index]={...world.circles[action.index],...contain(world.shape,p,45,world.vertices)};
  world=sanitizeWorld(world);startOver();updateControls();save();return;
 }
 if(action.type==='circle'){
  if(world.circles.length>=12){notify('Максимум 12 отражателей.');return}
  const c=contain(world.shape,p,31,world.vertices);
  if(Math.hypot(c.x-world.origin.x,c.y-world.origin.y)<50){notify('Слишком близко к источнику.');return}
  commit(()=>world.circles.push({...c,r:22}));return;
 }
 if(action.type==='mirror'){
  if(world.mirrors.length>=12){notify('Максимум 12 перегородок.');return}
  const a=contain(world.shape,action.from,12,world.vertices),b=contain(world.shape,p,12,world.vertices);
  if(Math.hypot(a.x-b.x,a.y-b.y)<27){notify('Проведи более длинную перегородку.');forceDraw=true;return}
  commit(()=>world.mirrors.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y}));return;
 }
 if(action.type==='erase'){
  const found=closest(p);
  if(!found){notify('Рядом нет препятствий.');return}
  commit(()=>{if(found.type==='circle')world.circles.splice(found.i,1);else world.mirrors.splice(found.i,1)});
 }
}
$('shapeGrid').addEventListener('click',e=>{const el=e.target.closest('[data-shape]');if(el)setShape(el.dataset.shape)});
document.querySelectorAll('[data-tool]').forEach(el=>el.addEventListener('click',()=>setTool(el.dataset.tool)));
document.querySelectorAll('[data-display]').forEach(el=>el.addEventListener('click',()=>{display=el.dataset.display;updateControls();save()}));
document.querySelectorAll('[data-palette]').forEach(el=>el.addEventListener('click',()=>{palette=el.dataset.palette;updateControls();save()}));
$('raysRange').addEventListener('input',e=>{const next=Number(e.target.value);if(next!==rayIndex){rayIndex=next;startOver();save();updateControls()}});
$('speedRange').addEventListener('input',e=>{speed=Number(e.target.value);updateControls();save()});
$('playBtn').addEventListener('click',()=>{if(builder)return;playing=!playing;previousFrame=0;updateState();forceDraw=true});
$('restartBtn').addEventListener('click',()=>{if(builder){notify('Сначала заверши создание поля.');return}startOver();notify('Волна запущена заново.')});
$('snapshotBtn').addEventListener('click',()=>{try{render();const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='rikoshet-'+Date.now()+'.png';document.body.append(a);a.click();a.remove();notify('Изображение сохранено.')}catch{notify('Не удалось сохранить изображение.')}});
$('customDrawBtn').addEventListener('click',()=>{if(builder){builder.points=[];updateControls()}else openBuilder()});
$('customBackBtn').addEventListener('click',removeVertex);
$('customFinishBtn').addEventListener('click',finishBuilder);
$('customCancelBtn').addEventListener('click',cancelBuilder);
$('undoBtn').addEventListener('click',undo);
$('clearBtn').addEventListener('click',()=>{if(builder){notify('Заверши создание поля.');return}if(!world.circles.length&&!world.mirrors.length){notify('Препятствий нет.');return}$('clearModal').hidden=false;$('cancelClear').focus()});
$('cancelClear').addEventListener('click',()=>{$('clearModal').hidden=true;$('clearBtn').focus()});
$('confirmClear').addEventListener('click',()=>{commit(()=>{world.circles=[];world.mirrors=[]});$('clearModal').hidden=true;notify('Препятствия очищены.')});
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',e=>up(e));canvas.addEventListener('pointercancel',e=>up(e,true));canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
 if(e.metaKey||e.altKey||e.ctrlKey||/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
 if(e.key==='Escape'){if(!$('clearModal').hidden){$('clearModal').hidden=true;return}if(builder){cancelBuilder();return}if(drag){world=sanitizeWorld(JSON.parse(drag.before));drag=null;forceDraw=true}return}
 if(!$('clearModal').hidden)return;
 if(e.key==='Backspace'&&builder){e.preventDefault();removeVertex();return}
 if(e.key==='Enter'&&builder){e.preventDefault();finishBuilder();return}
 if(e.code==='Space'){e.preventDefault();if(!builder){playing=!playing;previousFrame=0;updateState();forceDraw=true}}
 if(e.key.toLowerCase()==='r'&&!builder){startOver()}
 if(e.key.toLowerCase()==='z'&&e.shiftKey){undo()}
});
document.addEventListener('visibilitychange',()=>{previousFrame=0;lastRender=0;if(document.hidden)save()});
window.addEventListener('pagehide',save);
if('ResizeObserver'in window)new ResizeObserver(()=>forceDraw=true).observe(stage);
window.addEventListener('resize',()=>forceDraw=true);
createWorkshopMode({appName:'РИКОШЕТ',version:'2.1.0',cachePrefix:'billiard-lab-',storageNamespace:'pocket-works:billiard-lab',onReset(){try{localStorage.removeItem(STORAGE)}catch{}location.reload()}});
startOver();updateControls();updateNumbers();requestAnimationFrame(frame);
