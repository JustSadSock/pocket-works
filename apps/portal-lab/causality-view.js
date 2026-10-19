import {createCausality,presetParameters,mouthB,sendSignal,audit,sampleWorldlines,CAUSAL_PRESETS} from './causality.js';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const STORE='pocket-works:portal-lab:causality-v08';
const safe=(v,defaultValue,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(n,lo,hi):defaultValue;};
const fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'—';
function label(ctx,t,x,y,size=11,color='#c5d8cc',align='left',bold=false){
 ctx.font=(bold?'700 ':'500 ')+size+'px ui-monospace,Consolas,monospace';
 ctx.textBaseline='middle';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(t,x,y);
}
function segment(ctx,p,q,color,width=1,dashed=false){
 ctx.save();ctx.beginPath();if(dashed)ctx.setLineDash([5,5]);
 ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();ctx.restore();
}
function dot(ctx,p,color,name){
 ctx.beginPath();ctx.arc(p.x,p.y,5,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
 ctx.lineWidth=2;ctx.strokeStyle='#0b1b20';ctx.stroke();
 label(ctx,name,p.x,p.y-14,10,color,'center',true);
}
const PRESETS=Object.fromEntries(Object.keys(CAUSAL_PRESETS).map(id=>[id,presetParameters(id)]));
export function createCausalityLab(canvas,{onAction}={}){
 let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
 const state={
  distance:safe(saved.distance??3,3,.3,12),
  speed:safe(saved.speed??.85,.85,0,.98),
  duration:safe(saved.duration??34,34,4,160),
  throatTime:safe(saved.throatTime??.55,.55,0,5),
  origin:saved.origin==='A'?'A':'B',
  route:saved.route==='exterior'?'exterior':'tunnel'
 };
 let model=createCausality(state),analysis=audit(model);
 let active=false,running=false,time=model.duration+8,signal=analysis.witness,signalSent=false,plot=null,drag=null;
 const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}};
 const limit=()=>model.duration+Math.max(18,model.maximumDistance+6);
 function rebuild(){
  model=createCausality(state);analysis=audit(model);
  time=model.duration+8;running=false;signal=analysis.witness;signalSent=false;
  save();update();
 }
 function configure(){update();}
 function setActive(on){active=on;if(active)update();else $('shoot').disabled=false;}
 function trigger(){time=0;running=true;signal=analysis.witness;signalSent=false;onAction?.('launch');update();}
 function reset(){time=model.duration+8;running=false;signal=analysis.witness;signalSent=false;onAction?.('mount');update();}
 function send(){
  signal=sendSignal(model,{origin:state.origin,first:state.route,time});
  signalSent=true;running=false;onAction?.(signal.loop?'paradox':'portal');update();
 }
 function tick(dt,scale=1){
  if(!active||!running)return;
  time=Math.min(limit(),time+Math.min(.08,dt)*scale*7);
  if(time>=limit()){running=false;onAction?.('mount');}
  update();
 }
 function update(){
  const b=mouthB(model,time),info=analysis;
  for(const [id,key,prec] of [
   ['causality-distance','distance',1],['causality-speed','speed',2],
   ['causality-duration','duration',1],['causality-throat','throatTime',2]
  ]){
   $(id).value=state[key];$(id+'-value').textContent=fmt(state[key],prec);
  }
  $('causality-scrub').max=limit();$('causality-scrub').value=time;
  $('causality-time').textContent=fmt(time);
  $('causality-clock-a').textContent=fmt(time);
  $('causality-clock-b').textContent=fmt(b.tau);
  $('causality-v').textContent=fmt(b.v,3);$('causality-x').textContent=fmt(b.x);
  $('causality-lag').textContent=fmt(info.lag,3);
  $('causality-age-b').textContent=fmt(info.ageB,3);
  $('causality-exterior').textContent=fmt(model.distance);
  $('causality-threshold').textContent=fmt(info.threshold);
  $('causality-margin').textContent=(info.analyticMargin>0?'+':'')+fmt(info.analyticMargin,3);
  $('causality-margin').dataset.loop=String(info.chronologyPossible);
  $('causality-status').textContent=info.chronologyPossible?'ПЕТЛЯ В ЗАДАННОЙ МОДЕЛИ':'ПЕТЛЯ НЕ ОБРАЗОВАЛАСЬ';
  $('causality-status').dataset.loop=String(info.chronologyPossible);
  $('causality-source').value=state.origin;$('causality-route').value=state.route;
  $('causality-origin').textContent=signal.origin;
  $('causality-depart').textContent=fmt(signal.departure);
  $('causality-portal-event').textContent=fmt(signal.firstArrival);
  $('causality-return').textContent=fmt(signal.returnTime);
  $('causality-event-margin').textContent=(signal.chronologyMargin>0?'+':'')+fmt(signal.chronologyMargin,3);
  $('causality-message').textContent=signalSent?
   (signal.loop?'Возврат к тому же устью ДО отправления: путь замыкается ожиданием.':
    'Возврат произошёл после отправления; причинная петля отсутствует.')
   :('Прогноз после рейса: '+(info.chronologyPossible?'существует причинный цикл.':'замкнутого пути нет.'));
  $('causality-signal-tag').textContent=signalSent?'ЗАПУЩЕННЫЙ СИГНАЛ':'ПРОГНОЗ';
  for(const b of document.querySelectorAll('[data-causality-preset]')){
   const p=PRESETS[b.dataset.causalityPreset];
   const yes=['distance','speed','duration','throatTime'].every(k=>Math.abs(p[k]-state[k])<.0005);
   b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));
  }
  if(active){
   $('shoot').disabled=running;
   $('shoot').innerHTML=(running?'Рейс выполняется':'Проиграть рейс')+' <span aria-hidden="true">↗</span>';
  }
 }
 function draw(ctx,w,h){
  if(!active)return;
  const small=w<590,pad=small?15:28;
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#153431');bg.addColorStop(1,'#0a1b24');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const chart={x:pad+22,y:55,w:w-pad*2-34,h:Math.max(145,Math.min(h*(small?.48:.60),h-(small?273:295)))};
  const maxX=model.maximumDistance+Math.max(2,model.distance*.12);
  const ymax=Math.max(limit(),signal.departure+3,signal.firstArrival+3,signal.returnTime+3);
  const ymin=Math.min(0,signal.returnTime-2,signal.firstArrival-2);
  const xf=x=>chart.x+clamp(x/maxX,0,1)*chart.w;
  const tf=t=>chart.y+chart.h-(t-ymin)/(ymax-ymin)*chart.h;
  const point=e=>({x:xf(e.x),y:tf(e.t)});
  plot={chart,maxX,ymin,ymax,xf,tf,spatialY:chart.y+chart.h+67};
  ctx.fillStyle='#0b2126';ctx.fillRect(chart.x,chart.y,chart.w,chart.h);
  for(let i=0;i<=5;i++){
   const y=chart.y+i*chart.h/5;
   segment(ctx,{x:chart.x,y},{x:chart.x+chart.w,y},'#779a8b28');
   label(ctx,fmt(ymax-(ymax-ymin)*i/5,0),chart.x-7,y,9,'#8eac9d','right');
  }
  for(let i=0;i<=5;i++){
   const x=chart.x+i*chart.w/5;
   segment(ctx,{x,y:chart.y},{x,y:chart.y+chart.h},'#779a8b1c');
  }
  const world=sampleWorldlines(model,241,Math.max(limit(),signal.departure+3,signal.returnTime+3));
  for(const [mouth,col] of [['xa','#90dbc0'],['xb','#ebaf92']]){
   ctx.beginPath();
   world.forEach((p,i)=>{
    const a=point({x:p[mouth],t:p.t});
    if(i===0)ctx.moveTo(a.x,a.y);else ctx.lineTo(a.x,a.y);
   });
   ctx.lineWidth=2.5;ctx.strokeStyle=col;ctx.stroke();
  }
  for(const t of [model.duration/2,model.duration]){
   segment(ctx,{x:chart.x,y:tf(t)},{x:chart.x+chart.w,y:tf(t)},'#f0dcac6e',1,true);
  }
  const currentY=clamp(tf(time),chart.y,chart.y+chart.h);
  segment(ctx,{x:chart.x,y:currentY},{x:chart.x+chart.w,y:currentY},'#f6ebd3',1);
  dot(ctx,{x:xf(0),y:currentY},'#91d8bb','');
  dot(ctx,{x:xf(mouthB(model,time).x),y:currentY},'#e3ad91','');
  signal.segments.forEach(q=>{
   const a=point(q.from),b=point(q.to);
   if(q.type==='exterior')segment(ctx,a,b,'#f0d5a2',2.2);
   else{
    ctx.save();ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);
    const bend=.12*chart.w*(a.x<b.x?1:-1);
    ctx.bezierCurveTo(a.x+bend,a.y+(b.y-a.y)*.3,b.x-bend,a.y+(b.y-a.y)*.7,b.x,b.y);
    ctx.strokeStyle='#d7b3e3';ctx.lineWidth=2;ctx.stroke();ctx.restore();
   }
  });
  signal.itinerary.forEach((e,i)=>dot(ctx,point(e),
   ['#e7b5d9','#f5dbac',signal.loop?'#edab8c':'#a3d8c2'][i],['I','II','III'][i]));
  label(ctx,'МИНКОВСКИЙ · ДВЕ МИРОВЫЕ ЛИНИИ',pad,22,small?10:13,'#c0e3ce','left',true);
  label(ctx,'t ↑',chart.x-14,chart.y-16,10);
  label(ctx,'x →',chart.x+chart.w,chart.y+chart.h+13,10,'#a3caba','right');
  label(ctx,'A',xf(0)+7,chart.y-14,12,'#9ad7b8','left',true);
  label(ctx,'B',xf(model.distance),chart.y-14,12,'#e6b193','left',true);
  label(ctx,'ВОЗВРАЩЕНИЕ · T',chart.x+chart.w-4,tf(model.duration)-12,small?8:10,'#f1deaf','right');
  const spatialY=plot.spatialY;
  label(ctx,'ПРОСТРАНСТВЕННЫЙ СРЕЗ · t='+fmt(time,1),pad,spatialY-29,small?10:12,'#c1e0c8','left',true);
  segment(ctx,{x:pad+18,y:spatialY},{x:w-pad-18,y:spatialY},'#8aa9a0',1.5);
  const spatialB=pad+18+(w-2*pad-36)*(mouthB(model,time).x/maxX);
  for(const [x,c,t] of [[pad+20,'#92dbc1','A'],[spatialB,'#e8b395','B']]){
   ctx.beginPath();ctx.arc(x,spatialY,small?12:15,0,Math.PI*2);
   ctx.fillStyle='#26413e';ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle=c;ctx.stroke();
   label(ctx,t,x,spatialY,12,c,'center',true);
  }
  label(ctx,'ПОДПИСЬ УСТЬЕВ: τвыход = τвход + δ',w/2,spatialY+30,small?8:10,'#cbb5d6','center');
  const clocksY=spatialY+51,cw=(w-2*pad-12)/2,ch=small?60:69;
  for(const [x,col,title,value] of [[pad,'#8bd7b8','ЧАСЫ A',time],
   [pad+cw+12,'#e9ae90','ЧАСЫ B',mouthB(model,time).tau]]){
   ctx.fillStyle='#1f3939';ctx.fillRect(x,clocksY,cw,ch);
   label(ctx,title,x+10,clocksY+15,small?9:11,col,'left',true);
   label(ctx,fmt(value,2),x+10,clocksY+42,small?19:24,'#f6eed8','left',true);
  }
  label(ctx,analysis.chronologyPossible?'В ЗАДАННОЙ СКЛЕЙКЕ ЕСТЬ ПЕТЛЯ':'ПЕТЛЯ НЕ ОБРАЗОВАЛАСЬ',
   w/2,h-14,small?9:11,analysis.chronologyPossible?'#edaf91':'#abceba','center',true);
 }
 function eventXY(e){
  const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!active||!plot||e.pointerType==='mouse'&&e.button!==0)return;
  const p=eventXY(e),q=plot;
  if(Math.abs(p.y-q.spatialY)<26&&Math.abs(p.x-q.xf(mouthB(model,time).x))<36){
   drag={id:e.pointerId,type:'distance'};e.preventDefault();canvas.setPointerCapture(e.pointerId);
  }else if(p.x>=q.chart.x&&p.x<=q.chart.x+q.chart.w&&p.y>=q.chart.y&&p.y<=q.chart.y+q.chart.h){
   drag={id:e.pointerId,type:'time'};running=false;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  }
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId||!plot)return;
  const p=eventXY(e),q=plot;
  if(drag.type==='time'){
   time=clamp(q.ymax-(p.y-q.chart.y)/q.chart.h*(q.ymax-q.ymin),0,limit());
   signal=analysis.witness;signalSent=false;update();
  }else{
   const sample=clamp((p.x-q.chart.x)/q.chart.w*q.maxX,.3,30);
   const excursion=mouthB(model,time).x-model.distance;
   state.distance=clamp(Math.round((sample-excursion)*10)/10,.3,12);rebuild();
  }
 });
 canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId){drag=null;onAction?.('mount')}});
 canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('lostpointercapture',()=>drag=null);
 for(const [id,key] of [['causality-distance','distance'],['causality-speed','speed'],
  ['causality-duration','duration'],['causality-throat','throatTime']])
  $(id).addEventListener('input',e=>{state[key]=Number(e.target.value);rebuild();});
 $('causality-scrub').addEventListener('input',e=>{
  time=Number(e.target.value);running=false;signal=analysis.witness;signalSent=false;update();
 });
 $('causality-source').addEventListener('change',e=>{state.origin=e.target.value;save();update();});
 $('causality-route').addEventListener('change',e=>{state.route=e.target.value;save();update();});
 $('causality-send').addEventListener('click',send);
 for(const btn of document.querySelectorAll('[data-causality-preset]'))
  btn.addEventListener('click',()=>{
   Object.assign(state,PRESETS[btn.dataset.causalityPreset]);rebuild();onAction?.('mount');
  });
 return {state,setActive,configure,trigger,reset,tick,draw,send,
  get running(){return running;},
  get snapshot(){return {params:{...state},timeline:time,running,signalSent,
   signals:signal,analysis:{...analysis},worldlines:sampleWorldlines(model,321)}}};
}
