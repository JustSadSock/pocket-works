import {metric,geometry,launch,advance,constraint,collectBeam,staticAcceleration,staticClockRate,nullEnergyRadial,localSpeed} from './relativity.js';
import {AudioBus} from './audio.js';
import {createObservatory} from './observatory.js';
import {createMaterialLab} from './material-view.js';
import {createWaveLab} from './wave-view.js';
import {createDesigner} from './designer.js';
import {createRotationLab} from './rotation-view.js';
import {createCausalityLab} from './causality-view.js';
import {throatDiagnostics,criticalImpact} from './spacetime.js';
const $=id=>document.getElementById(id),canvas=$('space'),ctx=canvas.getContext('2d',{alpha:false});
const sound=new AudioBus(),observatory=createObservatory(canvas,{onAction:kind=>sound.play(kind)}),materialLab=createMaterialLab({onAction:kind=>sound.play(kind)}),waveLab=createWaveLab({onAction:kind=>sound.play(kind)}),designer=createDesigner(canvas,{getMetric:()=>currentMetric(),onEdit:changes=>applyDesign(changes),onAction:kind=>sound.play(kind)}),rotationLab=createRotationLab({getMetric:()=>currentMetric(),onAction:kind=>sound.play(kind)}),causalityLab=createCausalityLab(canvas,{onAction:kind=>sound.play(kind)}),STORAGE='pocket-works:portal-lab:relativity-v2';
const defaults={model:'ellis',a:1,eta:.45,shape:0,shapeWidth:1.45,lapseBump:0,lapseWidth:1.3,kind:'light',count:13,spread:32,speed:.7,timeScale:1,view:'observer',source:{l:3.15,phi:Math.PI,alpha:Math.PI}};
let settings=structuredClone(defaults);
let rays=[],elapsed=0,paused=false,lastTime=0,accum=0,drag=null,displayW=800,displayH=600,layout=null,dirty=true,saveTimeout=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function clean(n,min,max,defaultValue){return Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):defaultValue;}
function load(){
 try{
  const value=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(!value||typeof value!=='object')return;
  const x=value.settings||{};
  settings.model=x.model==='custom'?'custom':x.model==='redshift'?'redshift':'ellis';
  settings.a=clean(x.a,.5,3,1);settings.eta=clean(x.eta,0,.85,.45);
  settings.shape=clean(x.shape,-.35,.55,0);settings.shapeWidth=clean(x.shapeWidth,.65,3,1.45);
  settings.lapseBump=clean(x.lapseBump,-.45,.45,0);settings.lapseWidth=clean(x.lapseWidth,.65,3,1.3);
  settings.kind=x.kind==='matter'?'matter':'light';
  settings.count=Math.round(clean(x.count,1,25,13));settings.spread=clean(x.spread,0,100,32);
  settings.speed=clean(x.speed,.05,.95,.7);settings.timeScale=clean(x.timeScale,.25,5,1);
  settings.view=['profile','map','matter','wave','designer','rotation','causality','observer'].includes(x.view)?x.view:'observer';
  if(x.source&&[x.source.l,x.source.phi,x.source.alpha].every(Number.isFinite))
   settings.source={l:Math.max(-24,Math.min(24,x.source.l)),phi:x.source.phi,alpha:x.source.alpha};
  if(Array.isArray(value.rays)&&value.rays.length<=35&&Number.isFinite(value.elapsed)){
   const restored=[];
   for(const r of value.rays){
    if(![r.l,r.phi,r.p,r.L,r.E,r.k,r.t,r.tau,r.crossings].every(Number.isFinite)||r.E<=0||Math.abs(r.l)>1000)continue;
    restored.push({...r,kind:r.k?'matter':'light',path:Array.isArray(r.path)?r.path.filter(p=>Number.isFinite(p.l)&&Number.isFinite(p.phi)).slice(-300):[]});
   }
   rays=restored.slice(-35);elapsed=Math.max(0,Math.min(value.elapsed,99999));
  }
 }catch{rays=[];elapsed=0;}
}
function currentMetric(){
 return metric({a:settings.a,eta:settings.model==='ellis'?0:settings.eta,
 shape:settings.model==='custom'?settings.shape:0,
 shapeWidth:settings.shapeWidth,
 lapseBump:settings.model==='custom'?settings.lapseBump:0,lapseWidth:settings.lapseWidth});
}
function applyDesign(patch){
 const keys=['a','eta','shape','shapeWidth','lapseBump','lapseWidth'];
 for(const key of keys)if(key in patch)settings[key]=patch[key];
 settings.model='custom';changeMetric();
}
function persist(){
 try{
  const snapshot={settings,elapsed,rays:rays.slice(-35).map(r=>({
   kind:r.kind,l:r.l,phi:r.phi,p:r.p,L:r.L,E:r.E,k:r.k,t:r.t,tau:r.tau,crossings:r.crossings,initial:r.initial,
   path:r.path.filter((_,i)=>i%3===0).slice(-240)
  }))};
  localStorage.setItem(STORAGE,JSON.stringify(snapshot));
 }catch{}
}
function scheduleSave(){clearTimeout(saveTimeout);saveTimeout=setTimeout(persist,500);}
function sync(){
 const m=currentMetric();
 $('model').value=settings.model;
 $('radius').value=settings.a;$('radius-value').textContent=settings.a.toFixed(2);
 $('eta').value=settings.eta;$('eta-value').textContent=settings.eta.toFixed(2);$('eta').disabled=settings.model==='ellis';
 $('count').value=settings.count;$('count-value').textContent=settings.count;
 $('spread').value=settings.spread;$('spread-value').textContent=settings.spread;
 $('speed').value=settings.speed;$('speed-value').textContent=settings.speed.toFixed(2);
 $('speed').disabled=settings.kind==='light';
 $('time-scale').value=settings.timeScale;$('time-value').textContent=settings.timeScale.toFixed(2);
 $('model-kind').textContent=settings.model==='ellis'?'01 / ЭЛЛИС':settings.model==='redshift'?'02 / КРАСНОЕ СМЕЩЕНИЕ':'03 / МЕТРИКА ПОЛЬЗОВАТЕЛЯ';
 $('formula').textContent=settings.model==='custom'?'ds²=−N(l)²dt²+dl²+R(l)²dΩ²':settings.model==='ellis'?'ds² = −dt² + dl² + (l²+a²)dφ²':'ds² = −N(l)²dt² + dl² + (l²+a²)dφ²';
 $('model-warning').textContent=settings.model==='ellis'?'Эллис: точная метрика с экзотическим источником':'Заданная метрика · Tμν вычисляется из уравнений Эйнштейна';
 $('clock-note').textContent=settings.model==='ellis'
   ?'Кривизна пространства есть, но статические часы идут одинаково: N = 1.'
   :'У горловины часы идут медленнее относительно координатного времени. Источник напряжений-энергии для этого анзаца не моделируется.';
 document.querySelectorAll('[data-kind]').forEach(b=>{const active=b.dataset.kind===settings.kind;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===settings.view;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 document.body.dataset.labView=settings.view;
 designer.setActive(settings.view==='designer');
 rotationLab.setActive(settings.view==='rotation');
 causalityLab.setActive(settings.view==='causality');
 observatory.setActive(settings.view==='observer');
 materialLab.setActive(settings.view==='matter');
 waveLab.setActive(settings.view==='wave');
 $('lab-headline').textContent=settings.view==='causality'?'Когда свет возвращается раньше':settings.view==='rotation'?'Вращение и горизонты':settings.view==='designer'?'Спроектировать пространство-время':settings.view==='matter'?'Материя под нагрузкой':settings.view==='wave'?'Волновая геометрия':settings.view==='observer'?'Увидеть искривлённое пространство':'Два региона. Одна геометрия.';
 $('shoot').disabled=(settings.view==='causality'&&causalityLab.running)||settings.view==='rotation'&&rotationLab.status.hasRun&&(rotationLab.status.wormhole==='flying'||rotationLab.status.blackHole==='flying')||settings.view==='designer'||(settings.view==='matter'&&materialLab.phase==='running')||(settings.view==='wave'&&waveLab.phase==='running');
 $('shoot').innerHTML=settings.view==='causality'?(causalityLab.running?'Рейс выполняется':'Проиграть рейс')+' <span aria-hidden="true">↗</span>':settings.view==='observer'?'Пройти горловину <span aria-hidden="true">↗</span>':settings.view==='rotation'?(rotationLab.status.hasRun?'Повторить сравнение':'Запустить фотоны')+' <span aria-hidden="true">↗</span>':settings.view==='matter'?(materialLab.phase==='running'?'Эксперимент идёт':materialLab.phase==='completed'?'Повторить испытание':'Запустить образец')+' <span aria-hidden="true">↗</span>':settings.view==='wave'?(waveLab.phase==='running'?'Волна распространяется':waveLab.phase==='finished'?'Повторить опыт':'Запустить волну')+' <span aria-hidden="true">↗</span>':'Испустить лучи <span aria-hidden="true">↗</span>';
 $('clear').textContent=settings.view==='causality'?'Вернуть часы':settings.view==='rotation'?'Сброс лучей':settings.view==='designer'?'Сбросить к Эллису':settings.view==='observer'?'Исходный вид':settings.view==='matter'?'Сброс опыта':settings.view==='wave'?'Сброс волны':'Очистить';
 $('canvas-hint').textContent=settings.view==='causality'?'Перетащите устье B внизу для изменения расстояния; по диаграмме можно перемещаться во времени.'
   :settings.view==='rotation'?'Две геодезические · одинаковые локальные параметры запуска · нелинейная шкала карты.'
   :settings.view==='designer'?'Перетащите светлые точки профилей для изменения метрики.'
   :settings.view==='wave'?'Настоящее поле Клейна — Гордона: профиль, история и эффективный потенциал.'
   :settings.view==='matter'?'Свободное падение через горловину. Схема деформации в локальной системе отсчёта.'
   :settings.view==='observer'
   ?'Перетащи для поворота камеры. Коснись изображения для данных фотона.'
   :settings.view==='profile'?'Профиль — изометрическое вложение пространственного среза. Масштаб проекции условный.'
   :'Коснись региона для перемещения источника. Потяни от источника для направления луча.';
 $('curvature').textContent=geometry(0,m).K.toFixed(3);
 $('acceleration').textContent=staticAcceleration(m.a,m).toFixed(3);
 updateReadouts();
 designer.refresh();
 if(settings.view==='causality')$('model-warning').textContent='Причинная склейка устьев задана гипотетически, не выведена из ОТО';
 if(settings.view==='rotation')$('model-warning').textContent='Вращение: заданная метрика типа Тео, источник материи не вычислен';
 dirty=true;
}
function resetData(prefill=false){
 rays=[];elapsed=0;paused=false;$('pause').textContent='Пауза';
 if(prefill)emit(true);
 sync();scheduleSave();
}
function emit(silent=false){
 if(settings.view==='profile'){settings.view='map';sync();}
 const m=currentMetric(),src=settings.source;
 const count= Math.max(1,Math.min(25,settings.count));
 const input={l:src.l*m.a,phi:src.phi,alpha:src.alpha};
 const beam=collectBeam(m,input,{count,spread:settings.spread*Math.PI/180,kind:settings.kind,speed:settings.speed});
 // Keep a bounded history. Every geodesic carries its own E, L, norm, and proper time.
 rays.push(...beam);
 if(rays.length>35)rays=rays.slice(-35);
 if(silent){
  const dt=1.8*m.a;
  for(const r of beam)advance(r,m,dt);
  elapsed+=dt;
 }else sound.play('launch');
 updateReadouts();dirty=true;scheduleSave();
}
function updateReadouts(){
 const m=currentMetric();
 $('elapsed').textContent=settings.view==='causality'?$('causality-time').textContent:settings.view==='rotation'?$('rotation-time').textContent:settings.view==='wave'?(waveLab.diagnostics?.t.toFixed(2)??'0.00'):elapsed.toFixed(2);
 $('track-count').textContent=settings.view==='causality'?'2 устья · 2 маршрута':settings.view==='rotation'?'2 фотона · 2 метрики':settings.view==='wave'?'801 узел · поле ψ':rays.length+' '+(rays.length===1?'траектория':'траекторий');
 $('crossings').textContent=rays.reduce((s,r)=>s+r.crossings,0);
 let error=0;for(const r of rays)error=Math.max(error,Math.abs(constraint(r,m)));
 $('precision').textContent=error<.001?error.toExponential(1):error.toFixed(4);
 const photon=rays.find(r=>r.k===0);
 $('impact').textContent=photon?Math.abs(photon.L/photon.E).toFixed(3):'—';
 $('critical-value').textContent=criticalImpact(m).b.toFixed(3);
 $('clock-near').textContent=(elapsed*staticClockRate(.8*m.a,m)).toFixed(3);
 $('clock-far').textContent=(elapsed*staticClockRate(5*m.a,m)).toFixed(3);
 $('frame-state').textContent=settings.view==='causality'?'c=1 · Δτ · ПРИЧИННОСТЬ':settings.view==='rotation'?'ВРАЩЕНИЕ · gₜφ ≠ 0':settings.view==='wave'?'□Φ=0 · ℓ='+waveLab.state.j:settings.view==='map'?(settings.model==='ellis'?'N=1 · ELLIS':`η=${settings.eta.toFixed(2)} · N(l)`):'R² = l² + a²';
}
function changeMetric(){
 // The existing E and L belong to the old metric: discard them rather than
 // spuriously preserving a worldline after editing the spacetime itself.
 resetData(true);
 observatory.configure(currentMetric());
 materialLab.configure(currentMetric());
 waveLab.configure(currentMetric());
 rotationLab.configure(currentMetric());
 designer.refresh();
}
const bindings=[
 ['radius','a',true],['eta','eta',true],['count','count',false],
 ['spread','spread',false],['speed','speed',false],['time-scale','timeScale',false]
];
for(const [id,key,rebuild]of bindings)$(id).addEventListener('input',e=>{
 settings[key]=Number(e.target.value);
 if(key==='a'){settings.source.l=Math.sign(settings.source.l||1)*Math.min(4.25,Math.max(.3,Math.abs(settings.source.l)));}
 if(rebuild)changeMetric();else{sync();scheduleSave();}
});
$('model').addEventListener('change',e=>{settings.model=e.target.value;changeMetric();});
for(const button of document.querySelectorAll('[data-kind]'))button.addEventListener('click',()=>{settings.kind=button.dataset.kind;sync();scheduleSave();});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{settings.view=button.dataset.view;sync();scheduleSave();});
$('shoot').addEventListener('click',()=>{if(settings.view==='observer')observatory.triggerFlight();else if(settings.view==='matter')materialLab.trigger();else if(settings.view==='rotation')rotationLab.trigger();else if(settings.view==='causality')causalityLab.trigger();else if(settings.view==='wave')waveLab.trigger();else if(settings.view!=='designer')emit();});
$('critical').addEventListener('click',()=>{
 const m=currentMetric(),src=settings.source;
 const R=geometry(src.l*m.a,m).R,N=geometry(src.l*m.a,m).N;
 const criticalB=criticalImpact(m).b;
 // Subcritical rays wind around the unstable photon sphere before traversing.
 const argument=Math.min(.999,criticalB*.996*N/R);
 settings.kind='light';settings.count=1;settings.spread=0;
 settings.source.alpha=Math.PI+Math.asin(argument);
 sync();emit();sound.play('mount');scheduleSave();
});
$('clear').addEventListener('click',()=>{if(settings.view==='observer')$('lens-reset').click();else if(settings.view==='matter')materialLab.reset();else if(settings.view==='rotation')rotationLab.reset();else if(settings.view==='causality')causalityLab.reset();else if(settings.view==='wave')waveLab.reset();else if(settings.view==='designer')applyDesign({shape:0,lapseBump:0,eta:0,shapeWidth:1.45,lapseWidth:1.3});else resetData();});
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'Продолжить':'Пауза';$('pause').setAttribute('aria-label',paused?'Продолжить':'Приостановить симуляцию');});
$('sound').addEventListener('click',()=>{sound.set(!sound.enabled);$('sound').classList.toggle('muted',!sound.enabled);$('sound').setAttribute('aria-label',sound.enabled?'Выключить звук':'Включить звук');});
$('sound').classList.toggle('muted',!sound.enabled);
$('export').addEventListener('click',()=>{
 const data={schema:'portal-lab-relativity-v8',description:'SHOV: geodesics, tidal physics, scalar waves, Einstein source, stationary null-ray comparison and conditional two-mouth causality model (c=1)',metric:currentMetric(),assumptions:['equatorial test-particle approximation','no self gravity or backreaction','custom and rotating metrics are prescribed ansatzes','Schwarzschild black hole is an exact vacuum solution','no computed Einstein matter tensor for rotating model','two-mouth external clock ageing follows special relativity, mouth event identification is an imposed assumption','a causal loop in the model is not a self-consistent Einstein solution or a prediction of real time travel'],elapsed,settings,observer:observatory.state,probe:observatory.probe,material:materialLab.snapshot,waves:waveLab.snapshot,designer:designer.snapshot,rotation:rotationLab.snapshot,causality:causalityLab.snapshot,rays};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='shov-relativity-experiment.json';document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
});
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
 if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(settings.view==='matter')materialLab.trigger();else if(settings.view==='causality')causalityLab.trigger();else if(settings.view==='rotation')rotationLab.trigger();else if(settings.view==='wave')waveLab.trigger();else if(settings.view==='designer')return;else if(settings.view==='observer')observatory.triggerFlight();else emit();}}
 if(e.code==='KeyR'){if(settings.view==='matter')materialLab.reset();else if(settings.view==='causality')causalityLab.reset();else if(settings.view==='rotation')rotationLab.reset();else if(settings.view==='wave')waveLab.reset();else if(settings.view==='designer')$('clear').click();else if(settings.view==='observer')$('lens-reset').click();else resetData();}
 if(e.code==='KeyP')$('pause').click();
});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){persist();sound.ctx?.suspend();}});
window.addEventListener('pagehide',persist);

function canvasSize(){
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
 if(!rect.width||!rect.height)return;
 displayW=rect.width;displayH=rect.height;
 canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);
 ctx.setTransform(canvas.width/displayW,0,0,canvas.height/displayH,0,0);
 layout=makeLayout(displayW,displayH);
 dirty=true;
}
function makeLayout(w,h){
 const horizontal=w>600;
 const radius=horizontal?Math.min(w*.211,h*.355):Math.min(w*.425,h*.213);
 const y=horizontal?h*.525:0;
 return {horizontal,radius,centers:horizontal?[{x:w*.267,y},{x:w*.733,y}]:[{x:w*.5,y:h*.263},{x:w*.5,y:h*.735}],
  throat:Math.max(13,radius*.13),range:radius*.76,limit:5,};
}
const resize=new ResizeObserver(canvasSize);resize.observe(canvas);
function projection(l,phi){
 const side=l>=0?0:1,center=layout.centers[side];
 const r=layout.throat+(Math.abs(l)/settings.a)*(layout.range/layout.limit);
 return {x:center.x+Math.cos(phi)*r,y:center.y+Math.sin(phi)*r,side,r};
}
function fromCanvas(pos){
 if(!layout)return null;const centers=layout.centers;
 const a=Math.hypot(pos.x-centers[0].x,pos.y-centers[0].y),b=Math.hypot(pos.x-centers[1].x,pos.y-centers[1].y);
 const side=a<b?0:1,c=centers[side],d=Math.hypot(pos.x-c.x,pos.y-c.y);
 const l=(side===0?1:-1)*Math.max(.3,Math.min(4.25,(d-layout.throat)/layout.range*layout.limit));
 return {side,l,phi:Math.atan2(pos.y-c.y,pos.x-c.x)};
}
function coordinates(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
canvas.addEventListener('pointerdown',e=>{
 if(settings.view!=='map'||(e.pointerType==='mouse'&&e.button!==0))return;
 e.preventDefault();canvas.setPointerCapture(e.pointerId);
 const p=coordinates(e),hit=fromCanvas(p);if(!hit)return;
 const old=projection(settings.source.l*settings.a,settings.source.phi);
 drag={id:e.pointerId,start:p,hit,movingSource:Math.hypot(old.x-p.x,old.y-p.y)<28,changed:false};
 if(!drag.movingSource){settings.source.l=hit.l/settings.a;settings.source.phi=hit.phi;drag.changed=true;dirty=true;}
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.id)return;
 const p=coordinates(e),d=Math.hypot(p.x-drag.start.x,p.y-drag.start.y);
 if(d<=8)return;
 const emitter=projection(settings.source.l*settings.a,settings.source.phi),dx=p.x-emitter.x,dy=p.y-emitter.y;
 const phi=settings.source.phi,radial=dx*Math.cos(phi)+dy*Math.sin(phi),tangent=-dx*Math.sin(phi)+dy*Math.cos(phi);
 if(Math.hypot(dx,dy)>8){settings.source.alpha=Math.atan2(tangent,radial);drag.changed=true;}
 dirty=true;
});
canvas.addEventListener('pointerup',e=>{
 if(!drag||e.pointerId!==drag.id)return;
 if(!drag.changed&&!drag.movingSource){settings.source.l=drag.hit.l/settings.a;settings.source.phi=drag.hit.phi;}
 drag=null;dirty=true;scheduleSave();sound.play('mount');
});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('lostpointercapture',()=>drag=null);

const palette={A:'#88c6af',B:'#dba179',photon:'#fff5ba',particle:'#d9eeeb'};
function strokeLine(x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function write(str,x,y,{size=11,color='#91a89d',align='left',font='ui-monospace,monospace',weight=400}={}){
 ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;ctx.fillText(str,x,y);
}
function background(){
 const w=displayW,h=displayH,gradient=ctx.createLinearGradient(0,0,w,h);
 gradient.addColorStop(0,'#172c2c');gradient.addColorStop(.54,'#112225');gradient.addColorStop(1,'#0c1c21');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 const step=34;ctx.strokeStyle='#8ebca310';ctx.lineWidth=.6;
 for(let x=17;x<w;x+=step)strokeLine(x,0,x,h,'#9ec4af0d');
 for(let y=20;y<h;y+=step)strokeLine(0,y,w,y,'#9ec4af0d');
}
function drawSheet(index){
 const m=currentMetric(),center=layout.centers[index],radius=layout.radius,color=index===0?palette.A:palette.B;
 const shell=ctx.createRadialGradient(center.x,center.y,layout.throat*.6,center.x,center.y,radius);
 if(index===0){shell.addColorStop(0,'#355e57');shell.addColorStop(.35,'#28423f');shell.addColorStop(1,'#1b3334');}
 else{shell.addColorStop(0,'#745444');shell.addColorStop(.35,'#493c36');shell.addColorStop(1,'#34312e');}
 ctx.beginPath();ctx.arc(center.x,center.y,radius,0,Math.PI*2);ctx.fillStyle=shell;ctx.fill();
 ctx.beginPath();ctx.arc(center.x,center.y,radius,0,Math.PI*2);ctx.strokeStyle=index===0?'#6aa59661':'#af81666c';ctx.lineWidth=1.2;ctx.stroke();
 ctx.save();ctx.beginPath();ctx.arc(center.x,center.y,radius-.5,0,Math.PI*2);ctx.clip();
 const lineColor=index===0?'#b8e2c32f':'#f0c39a31';
 for(let i=0;i<16;i++){
  const theta=i*Math.PI/8;
  strokeLine(center.x+Math.cos(theta)*layout.throat,center.y+Math.sin(theta)*layout.throat,center.x+Math.cos(theta)*radius,center.y+Math.sin(theta)*radius,lineColor,.9);
 }
 for(let l=0;l<=5.1;l+=.5){
  const r=layout.throat+l*layout.range/layout.limit;
  if(r>radius)break;
  ctx.beginPath();ctx.arc(center.x,center.y,r,0,Math.PI*2);
  ctx.strokeStyle=l%1===0?lineColor:(index===0?'#97baae18':'#d8ad9818');
  ctx.lineWidth=l%1===0?1.1:.7;ctx.stroke();
 }
 // Curvature representation: dynamically sampled angular displacement of equatorial geodesics,
 // NOT a fake force-field gradient. All actual curves are integrated in relativity.js.
 ctx.restore();
 ctx.beginPath();ctx.arc(center.x,center.y,layout.throat+4,0,2*Math.PI);ctx.strokeStyle=color+'a8';ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.arc(center.x,center.y,layout.throat-4,0,2*Math.PI);ctx.strokeStyle=color+'55';ctx.lineWidth=4;ctx.stroke();
 ctx.beginPath();ctx.arc(center.x,center.y,Math.max(4,layout.throat*.4),0,2*Math.PI);ctx.fillStyle='#0c191b';ctx.fill();
 write(index===0?'РЕГИОН A · l > 0':'РЕГИОН B · l < 0',center.x,center.y-radius-19,
  {size:layout.horizontal?13:11,color,align:'center',weight:700});
 write('ГОРЛОВИНА',center.x,center.y+layout.throat+14,{size:9,color:'#bdd6bd',align:'center'});
 if(m.eta>0)write('N₀ '+geometry(0,m).N.toFixed(2),center.x,center.y-layout.throat-10,{size:10,color:color,align:'center'});
 for(const n of [2,4]){
  const r=layout.throat+n*layout.range/layout.limit;
  write(n+'a',center.x+r+4,center.y,{size:9,color:'#7a9b88'});
 }
}
function drawSeam(){
 if(!layout)return;
 const a=layout.centers[0],b=layout.centers[1],clr='#86a59e';
 ctx.save();ctx.setLineDash([4,8]);strokeLine(a.x,a.y,b.x,b.y,'#a5ccad60',2);ctx.setLineDash([]);
 // Overlay center legend along the topological identification.
 if(layout.horizontal){
  ctx.fillStyle='#112426';ctx.fillRect((a.x+b.x)/2-46,a.y-12,92,24);
  write('l = 0 ↔ l = 0',(a.x+b.x)/2,a.y,{size:10,color:'#c4d6ba',align:'center'});
 }else{
  const cy=(a.y+b.y)/2;
  ctx.fillStyle='#112426';ctx.fillRect(a.x-68,cy-11,136,22);
  write('ОДНА ГОРЛОВИНА',a.x,cy,{size:10,color:'#c4d6ba',align:'center'});
 }
 ctx.restore();
}
function drawPath(ray,i){
 const tail=ray.path;
 if(tail.length<2)return;
 const col=ray.kind==='light'?'#f6e7b2':'#cfeddd',alpha=i%3===0?.79:.49;
 ctx.save();ctx.strokeStyle=col;ctx.lineWidth=ray.kind==='light'?1.4:2;
 ctx.globalAlpha=alpha;ctx.beginPath();let drawing=false,prev=null;
 for(const p of tail){
  if(Math.abs(p.l)>settings.a*5.1){drawing=false;prev=p;continue;}
  const projected=projection(p.l,p.phi);
  if(!prev||Math.sign(prev.l)!==Math.sign(p.l)){
   // One physical throat, shown as two separate atlas charts.
   ctx.stroke();ctx.beginPath();ctx.moveTo(projected.x,projected.y);drawing=true;
  }else if(drawing)ctx.lineTo(projected.x,projected.y);
  else{ctx.moveTo(projected.x,projected.y);drawing=true;}
  prev=p;
 }
 ctx.stroke();ctx.restore();
 if(Math.abs(ray.l)<=settings.a*5.1){
  const pos=projection(ray.l,ray.phi);
  ctx.save();ctx.shadowColor=col;ctx.shadowBlur=reduced?0:10;
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(pos.x,pos.y,ray.kind==='light'?2.7:4.3,0,Math.PI*2);ctx.fill();ctx.restore();
 }
}
function drawSource(){
 const src=settings.source,p=projection(src.l*settings.a,src.phi);
 const side=src.l>=0?0:1,col=side===0?palette.A:palette.B;
 ctx.save();ctx.translate(p.x,p.y);
 ctx.beginPath();ctx.arc(0,0,9,0,2*Math.PI);ctx.fillStyle='#f0f6e4';ctx.fill();
 ctx.beginPath();ctx.arc(0,0,14,0,2*Math.PI);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
 const phi=src.phi,alpha=src.alpha;
 const dx=Math.cos(phi)*Math.cos(alpha)-Math.sin(phi)*Math.sin(alpha);
 const dy=Math.sin(phi)*Math.cos(alpha)+Math.cos(phi)*Math.sin(alpha);
 const length=34;
 strokeLine(0,0,dx*length,dy*length,'#f7f7d9',2.6);
 const arrow=Math.atan2(dy,dx);
 ctx.beginPath();ctx.moveTo(dx*length,dy*length);
 ctx.lineTo(dx*length-9*Math.cos(arrow-.5),dy*length-9*Math.sin(arrow-.5));
 ctx.lineTo(dx*length-9*Math.cos(arrow+.5),dy*length-9*Math.sin(arrow+.5));
 ctx.closePath();ctx.fillStyle='#f7f7d9';ctx.fill();ctx.restore();
 write('ИСТОЧНИК',p.x,p.y-27,{size:10,color:'#f1eaca',align:'center'});
}
function drawMap(){
 background();drawSeam();drawSheet(0);drawSheet(1);
 for(let i=0;i<rays.length;i++)drawPath(rays[i],i);
 drawSource();
 write('СОБСТВЕННОЕ РАДИАЛЬНОЕ РАССТОЯНИЕ: |l|',17,displayH-34,{size:10,color:'#799589'});
 write('ЦВЕТ — ОБЛАСТЬ, ЛИНИИ — ГЕОДЕЗИЧЕСКИЕ',17,displayH-18,{size:9,color:'#6a857a'});
}
function drawProfile(){
 background();
 const m=currentMetric(),cx=displayW*.5,cy=displayH*.52;
 const maxL=4,steps=240,dz=maxL/steps,zVals=new Float64Array(steps+1);
 let valid=true,lastSlope=1;
 for(let i=0;i<=steps;i++){
  const g=geometry(i*dz*m.a,m),sq=1-g.Rp*g.Rp;
  if(sq<-.000001)valid=false;
  const slope=Math.sqrt(Math.max(0,sq));
  if(i>0)zVals[i]=zVals[i-1]+.5*(slope+lastSlope)*dz*m.a;
  lastSlope=slope;
 }
 if(!valid){
  const left=displayW*.1,right=displayW*.9,top=displayH*.20,bottom=displayH*.75;
  const rMax=geometry(4*m.a,m).R/m.a;
  write('ЭТА МЕТРИКА НЕ ИМЕЕТ ПОЛНОГО ВЛОЖЕНИЯ В E³',cx,55,
   {size:Math.min(14,displayW/43),color:'#efba9c',align:'center',weight:700});
  write('|R′(l)| > 1 в части интервала. Показан истинный радиальный профиль.',cx,76,
   {size:Math.min(11,displayW/51),color:'#c8ccba',align:'center'});
  ctx.strokeStyle='#799b9277';ctx.lineWidth=1;ctx.strokeRect(left,top,right-left,bottom-top);
  for(const sign of [-1,1]){
   ctx.beginPath();
   for(let i=0;i<=steps;i++){
    const l=sign*maxL*i/steps,rr=geometry(l*m.a,m).R/m.a;
    const x=left+(l+4)/8*(right-left);
    const y=bottom-(rr-.85)/(Math.max(rMax,2)-.85)*(bottom-top);
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.strokeStyle=sign>0?'#8dd0ba':'#d5a086';ctx.lineWidth=2.3;ctx.stroke();
  }
  write('l/a',right,bottom+22,{size:11,color:'#a8c4b5',align:'right'});
  write('R(l)/a',left,top-17,{size:11,color:'#a8c4b5'});
  return;
 }
 function height(l){
  const x=Math.min(steps,Math.abs(l)/m.a/dz),i=Math.min(steps-1,Math.floor(x)),t=x-i;
  return Math.sign(l)*(zVals[i]*(1-t)+zVals[i+1]*t);
 }
 const maxR=geometry(4*m.a,m).R;
 const scale=Math.min(displayW*.29/maxR,displayH*.35/Math.max(.2,zVals[steps]));
 const sx=scale,sy=scale*.95,depth=.28;
 function project(l,theta){
  const g=geometry(l,m);
  return {x:cx+sx*g.R*Math.cos(theta),y:cy-sy*height(l)+sx*g.R*Math.sin(theta)*depth};
 }
 ctx.save();
 for(const th of Array.from({length:28},(_,i)=>i*Math.PI/14)){
  ctx.beginPath();
  for(let k=0;k<=130;k++){
   const l=(-4+8*k/130)*m.a,p=project(l,th);
   if(!k)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  ctx.strokeStyle='#9bb6a34b';ctx.lineWidth=.85;ctx.stroke();
 }
 for(let q=-4;q<=4.01;q+=.5){
  const l=q*m.a;ctx.beginPath();
  for(let i=0;i<=120;i++){
   const p=project(l,2*Math.PI*i/120);
   if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  ctx.strokeStyle=Math.abs(q)<.01?'#f0d7a2':q>0?'#8ac4af72':'#dca07975';
  ctx.lineWidth=Math.abs(q)<.01?3:Math.abs(q-Math.round(q))<.01?1.4:.7;ctx.stroke();
 }
 ctx.restore();
 write('ИЗОМЕТРИЧЕСКОЕ ВЛОЖЕНИЕ ПРОСТРАНСТВЕННОГО СРЕЗА',cx,36,
  {size:Math.min(12,displayW/42),color:'#c0d0bd',align:'center'});
 write('R(l) · ВЫЧИСЛЕНО ИЗ ВЫБРАННОЙ МЕТРИКИ',cx,61,
  {size:Math.min(13,displayW/48),color:'#d5e7d5',align:'center'});
 write('dz/dl = √(1 − R′(l)²)',cx,82,
  {size:Math.min(13,displayW/48),color:'#a4bfb0',align:'center'});
 write('A · l > 0',cx,cy-Math.min(155,sy*1.5),
  {size:12,color:palette.A,align:'center',weight:700});
 write('B · l < 0',cx,cy+Math.min(165,sy*1.5),
  {size:12,color:palette.B,align:'center',weight:700});
 write('МИНИМАЛЬНЫЙ РАДИУС: a',cx,cy-15,{size:11,color:'#f6e2b2',align:'center'});
 write('Вложение показывает геометрию среза, а не гравитационную силу.',cx,displayH-40,
  {size:Math.min(11,displayW/51),color:'#8da99a',align:'center'});
}
function tick(t){
 if(!lastTime)lastTime=t;
 const dt=Math.min(.05,(t-lastTime)/1000);lastTime=t;
 if(!document.hidden){
  if(!paused&&settings.view!=='designer'){
   const advanceTime=dt*settings.timeScale*2;
   elapsed+=advanceTime;
   const m=currentMetric();
   if(settings.view==='observer'){
    observatory.tick(dt,settings.timeScale);
   }else if(settings.view==='causality'){
    causalityLab.tick(dt,settings.timeScale);
   }else if(settings.view==='rotation'){
    rotationLab.tick(dt,settings.timeScale);
   }else if(settings.view==='wave'){
    waveLab.tick(dt,settings.timeScale);
   }else if(settings.view==='matter'){
    materialLab.tick(dt,settings.timeScale);
   }else{
    for(const ray of rays){
     if(Math.abs(ray.l)<m.a*30&&ray.t<220*m.a)advance(ray,m,advanceTime);
    }
   }
   accum+=dt;dirty=true;
   if(accum>.11){updateReadouts();accum=0;}
  }
  if(settings.view==='observer'){observatory.draw(ctx,displayW,displayH);dirty=false;}
  else if(settings.view==='matter'){materialLab.draw(ctx,displayW,displayH);dirty=false;}
  else if(settings.view==='wave'){waveLab.draw(ctx,displayW,displayH);dirty=false;}
  else if(settings.view==='rotation'){rotationLab.draw(ctx,displayW,displayH);dirty=false;}
  else if(settings.view==='causality'){causalityLab.draw(ctx,displayW,displayH);dirty=false;}
  else if(settings.view==='designer'&&dirty){designer.draw(ctx,displayW,displayH);dirty=false;}
  else if(dirty){if(layout){if(settings.view==='profile')drawProfile();else drawMap();}dirty=false;}
 }
 requestAnimationFrame(tick);
}
load();
settings.source.l=Math.sign(settings.source.l||1)*Math.min(4.25,Math.max(.3,Math.abs(settings.source.l)));
observatory.configure(currentMetric());
materialLab.configure(currentMetric());
waveLab.configure(currentMetric());
rotationLab.configure(currentMetric());
causalityLab.configure();
sync();if(!rays.length)emit(true);
requestAnimationFrame(tick);
window.__SHOV__={snapshot:()=>({
 metric:currentMetric(),settings:structuredClone(settings),elapsed,observer:{...observatory.state},optics:observatory.status,tidal:observatory.probe,material:materialLab.snapshot,waves:waveLab.snapshot,designer:designer.snapshot,rotation:rotationLab.snapshot,causality:causalityLab.snapshot,
 rays:rays.map(r=>({l:r.l,phi:r.phi,E:r.E,L:r.L,k:r.k,crossings:r.crossings,constraint:constraint(r,currentMetric())}))
 }),emit,clear:()=>resetData(),setModel:(model)=>{settings.model=model==='redshift'?'redshift':'ellis';changeMetric();}};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
