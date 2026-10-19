import {rotatingMetric,rotatingGeometry,ergoSummary,schwarzschild,
 launchRotating,launchSchwarzschild,advanceRotating,advanceSchwarzschild,
 wormholeConstraint,schwarzschildConstraint,schwarzschildClock} from './rotation.js';
import {geometry} from './spacetime.js';
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),rad=d=>d*Math.PI/180;
const PRESETS={
 cross:{omega:.42,angle:.08,arealRadius:6},
 corotate:{omega:.72,angle:.19,arealRadius:6},
 counter:{omega:.72,angle:-.19,arealRadius:6},
 lens:{omega:0,angle:.49,arealRadius:6},
 ergo:{omega:.94,angle:.08,arealRadius:6}
};
const STORAGE='pocket-works:portal-lab:rotation-v07';
const colors={A:'#a7e6ce',B:'#e6a98b',black:'#edd7ab',ring:'#e4d2aa',grid:'#5d8980'};
const text=(ctx,t,x,y,size=11,color='#bbd6ca',align='left',weight=500)=>{
 ctx.textAlign=align;ctx.textBaseline='middle';ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';
 ctx.fillStyle=color;ctx.fillText(t,x,y);
};
const line=(ctx,x1,y1,x2,y2,color='#729588',weight=1)=>{
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();
};
const f=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—';
function nameStatus(status){
 return ({
 'flying':'В ДВИЖЕНИИ',
 'escaped-A':'ВОЗВРАЩЕНИЕ В A',
 'escaped-B':'ПРОХОД В РЕГИОН B',
 'escaped':'РАССЕЯНИЕ',
 'horizon':'ГОРИЗОНТ СОБЫТИЙ',
 'unresolved-orbit':'ДОЛГАЯ ОРБИТА',
 'numerical-error':'ЧИСЛЕННАЯ ОШИБКА'
 })[status]||status.toUpperCase();
}
function starNoise(ctx,cx,cy,r,seed,kind){
 let x=seed>>>0;
 const rng=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
 for(let i=0;i<190;i++){
  const a=rng()*Math.PI*2,rad=Math.sqrt(rng())*r,xx=cx+Math.cos(a)*rad,yy=cy+Math.sin(a)*rad;
  const alpha=.13+rng()*.4;
  ctx.fillStyle=kind==='wormhole'?'rgba(167,229,197,'+alpha+')':'rgba(238,210,168,'+alpha+')';
  ctx.beginPath();ctx.arc(xx,yy,rng()*.8+.2,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
function paintDisc(ctx,cx,cy,r,kind,eras){
 const bg=ctx.createRadialGradient(cx,cy,r*.18,cx,cy,r);
 if(kind==='wormhole'){
  bg.addColorStop(0,'#2d4742');bg.addColorStop(.45,'#173534');bg.addColorStop(1,'#0a1c22');
 }else{
  bg.addColorStop(0,'#311c1a');bg.addColorStop(.45,'#2e2b28');bg.addColorStop(1,'#101d22');
 }
 ctx.fillStyle=bg;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
 starNoise(ctx,cx,cy,r,kind==='wormhole'?10657:57391,kind);
 ctx.lineWidth=1;ctx.strokeStyle=kind==='wormhole'?'#96bca65c':'#dcb89b4a';
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
 // Radial tick circles, deliberately NON-ISOMETRIC atlas.
 for(let i=1;i<=4;i++){
  ctx.strokeStyle=i===4?'#abc4a544':'#a7bda41d';
  ctx.beginPath();ctx.arc(cx,cy,r*(.18+i*.2),0,Math.PI*2);ctx.stroke();
 }
 if(kind==='wormhole'){
  ctx.beginPath();ctx.arc(cx,cy,r*.20,0,Math.PI*2);ctx.fillStyle='#68483e';ctx.fill();
  ctx.lineWidth=2.2;ctx.strokeStyle=colors.ring;ctx.stroke();
  // The two asymptotic charts overlap graphically; the B path is styled amber.
  if(eras.present){
   ctx.beginPath();ctx.arc(cx,cy,r*(.2+eras.extent/13*.8),0,Math.PI*2);
   ctx.fillStyle='#c08b5540';ctx.fill();ctx.strokeStyle='#d5ac735c';ctx.lineWidth=1;ctx.stroke();
  }
  text(ctx,'ГОРЛОВИНА',cx,cy+6,9,'#f1d5ae','center',710);
 }else{
  const h=r*.2,photonRadius=r*(.2+.8*(1.5-1)/13);
  ctx.beginPath();ctx.arc(cx,cy,h,0,2*Math.PI);
  ctx.fillStyle='#04090e';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#f0d9a7a6';ctx.stroke();
  ctx.setLineDash([5,6]);ctx.strokeStyle='#e9a7799a';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(cx,cy,photonRadius,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);
 }
}
function rayPoint(pt,kind,center,r,a){
 const radius=kind==='wormhole'?Math.sqrt(pt.l*pt.l+a*a)/a:pt.r/a;
 // Explicitly visual-only compression preserving increasing physical R.
 const q=.2+.8*clamp((radius-1)/13,0,1);
 const angle=pt.phi+Math.PI/2;
 return {x:center.x+Math.cos(angle)*r*q,y:center.y+Math.sin(angle)*r*q};
}
function drawPath(ctx,ray,kind,center,r,a){
 const path=ray.path;
 if(path.length<=1)return;
 for(let i=1;i<path.length;i++){
  const prior=path[i-1],current=path[i],
   p=rayPoint(prior,kind,center,r,a),q=rayPoint(current,kind,center,r,a);
  const B=kind==='wormhole'&&current.l<0;
  ctx.strokeStyle=kind==='black'?colors.black:B?colors.B:colors.A;
  ctx.lineWidth=2.2;ctx.globalAlpha=.38+.62*i/path.length;
  if(B)ctx.setLineDash([4,4]);
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
  ctx.setLineDash([]);
 }
 ctx.globalAlpha=1;
 const last=path.at(-1),p=rayPoint(last,kind,center,r,a);
 ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);
 ctx.fillStyle=kind==='black'?colors.black:kind==='wormhole'&&last.l<0?colors.B:colors.A;
 ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#07131c';ctx.stroke();
}
export function createRotationLab({getMetric,onAction}={}){
 let persisted={};
 try{persisted=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{}}catch{}
 const state={
  omega:clamp(Number(persisted.omega??.42),-.95,.95),
  angle:clamp(Number(persisted.angle??.08),-.65,.65),
  arealRadius:clamp(Number(persisted.arealRadius??6),4,8)
 };
 let m=null,bh=null,wr=null,br=null,active=false,hasRun=false,lastStatus='',error='';
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}};
 function configure(base){
  const checked=rotatingMetric(base,{omega:state.omega});
  m=checked;bh=schwarzschild(checked.a/2);
  reset(true);
 }
 function setActive(v){
  active=v;
  if(active){if(!m)configure(getMetric());update();}
  else $('shoot').disabled=false;
 }
 function reset(silent=false){
  if(!m){m=rotatingMetric(getMetric(),{omega:state.omega});bh=schwarzschild(m.a/2);}
  wr=launchRotating(m,{angle:state.angle,arealRadius:state.arealRadius});
  br=launchSchwarzschild(bh,{angle:state.angle,arealRadius:state.arealRadius});
  hasRun=false;error='';lastStatus='';update();
  if(!silent)onAction?.('mount');
 }
 function update(){
  const erg=ergoSummary(m),geo=rotatingGeometry(0,m);
  $('rotation-spin').value=state.omega;$('rotation-spin-value').textContent=f(state.omega,2);
  $('rotation-angle').value=state.angle;$('rotation-angle-value').textContent=f(state.angle*180/Math.PI,1);
  $('rotation-radius').value=state.arealRadius;$('rotation-radius-value').textContent=f(state.arealRadius,1);
  $('rotation-omega').textContent=f(erg.omegaThroat,3);
  $('rotation-gtt').textContent=f(geo.gtt,4);
  $('rotation-ergo').textContent=erg.present?'ЕСТЬ · ±'+f(erg.extent,2)+' a':'НЕТ';
  $('rotation-ergo').dataset.active=String(erg.present);
  $('rotation-redshift').textContent=f(geo.N,3);
  $('rotation-clock').textContent=f(schwarzschildClock(state.arealRadius*bh.horizon,bh.M),3);
  $('rotation-wormhole-state').textContent=wr?nameStatus(wr.status):'ГОТОВО';
  $('rotation-hole-state').textContent=br?nameStatus(br.status):'ГОТОВО';
  $('rotation-wormhole-phi').textContent=wr?f(wr.phi,3):'0.000';
  $('rotation-hole-phi').textContent=br?f(br.phi,3):'0.000';
  $('rotation-wormhole-error').textContent=wr?wr.maxResidual.toExponential(1):'—';
  $('rotation-hole-error').textContent=br?br.maxResidual.toExponential(1):'—';
  $('rotation-wormhole-passed').textContent=wr?String(wr.crossings):'0';
  $('rotation-time').textContent=f(Math.max(wr?.t||0,br?.t||0)/m.a,1);
  $('rotation-state').textContent=!hasRun?'ГОТОВ К СРАВНЕНИЮ':
   wr.status==='flying'||br.status==='flying'?'ЛУЧИ В ДВИЖЕНИИ':'ОБА РАСЧЁТА ЗАВЕРШЕНЫ';
  document.querySelectorAll('[data-rotation-preset]').forEach(btn=>{
   const p=PRESETS[btn.dataset.rotationPreset];
   const yes=!!p&&Object.keys(p).every(k=>Math.abs(p[k]-state[k])<.0001);
   btn.classList.toggle('selected',yes);btn.setAttribute('aria-pressed',String(yes));
  });
  if(active){
   const running=hasRun&&(wr.status==='flying'||br.status==='flying');
   $('shoot').disabled=running;
   $('shoot').innerHTML=(running?'Траектории рассчитываются':hasRun?'Повторить сравнение':'Запустить фотоны')+' <span aria-hidden="true">↗</span>';
  }
 }
 function trigger(){
  if(!m)return;
  if(hasRun)reset(true);
  hasRun=true;onAction?.('launch');update();
 }
 function tick(dt,timeScale=1){
  if(!active||!hasRun)return;
  if(wr.status!=='flying'&&br.status!=='flying')return;
  const steps=Math.max(1,Math.min(14,Math.ceil(4*timeScale)));
  for(let i=0;i<steps;i++){
   if(wr.status==='flying')advanceRotating(wr,m,.06*m.a);
   if(br.status==='flying')advanceSchwarzschild(br,bh,.06*bh.horizon);
  }
  if(wr.status!=='flying'&&br.status!=='flying'&&lastStatus!=='done'){
   onAction?.('mount');lastStatus='done';
  }
  if(wr.status==='numerical-error'||br.status==='numerical-error')error='Численная ошибка. Измените параметры и повторите опыт.';
  update();
 }
 function draw(ctx,w,h){
  if(!active||!m)return;
  const portrait=w<690;
  ctx.fillStyle='#0b1920';ctx.fillRect(0,0,w,h);
  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#122b2a');gradient.addColorStop(.5,'#0d2027');gradient.addColorStop(1,'#1d2325');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  const pad=portrait?15:32;
  const panels=portrait?[
   {x:pad,y:26,w:w-2*pad,h:(h-55)/2-8},
   {x:pad,y:26+(h-55)/2+7,w:w-2*pad,h:(h-55)/2-8}
  ]:[
   {x:pad,y:34,w:(w-3*pad)/2,h:h-65},
   {x:2*pad+(w-3*pad)/2,y:34,w:(w-3*pad)/2,h:h-65}
  ];
  const erg=ergoSummary(m);
  for(let i=0;i<2;i++){
   const p=panels[i],kind=i?'black':'wormhole',
     radius=Math.min(p.w*.44,p.h*.36),cx=p.x+p.w*.5,cy=p.y+p.h*.53,
     center={x:cx,y:cy};
   ctx.strokeStyle=i?'#876e5f51':'#759b885a';ctx.lineWidth=1;
   ctx.strokeRect(p.x+.5,p.y+.5,p.w-1,p.h-1);
   paintDisc(ctx,cx,cy,radius,kind,erg);
   drawPath(ctx,i?br:wr,kind,center,radius,m.a);
   const header=i?'ШВАРЦШИЛЬД · ТОЧНАЯ МЕТРИКА':'ВРАЩАЮЩАЯСЯ НОРА · ТИП ТЕО';
   text(ctx,header,p.x+10,p.y+17,portrait?9:11,i?'#e9bf9f':'#9fdfc4','left',700);
   const status=nameStatus(i?br.status:wr.status);
   text(ctx,status,p.x+10,p.y+p.h-26,portrait?10:11,
     i?(br.status==='horizon'?'#f0a982':'#dcd1ac'):(wr.status==='escaped-B'?'#e5ab86':'#afd8c1'),'left',710);
   const time=i?br.t:wr.t;
   text(ctx,'t/a '+f(time/m.a,1),p.x+p.w-9,p.y+p.h-26,10,'#9db6ab','right');
   if(!i){
    text(ctx,'A · НЕБО',p.x+10,p.y+37,9,'#a1d5bc');
    text(ctx,'B · ПУНКТИР',p.x+p.w-10,p.y+37,9,'#deaa8c','right');
   }else{
    text(ctx,'ФОТОННАЯ СФЕРА · 3M',p.x+10,p.y+37,9,'#c0a18b');
    text(ctx,'ГОРИЗОНТ · 2M',p.x+p.w-10,p.y+37,9,'#e7cda5','right');
   }
  }
  text(ctx,'ОДИН ЛОКАЛЬНЫЙ УГОЛ И ОДИН АРЕАЛЬНЫЙ РАДИУС ЗАПУСКА',
    w/2,h-12,portrait?8:10,'#8eada0','center');
  if(error)text(ctx,error,w/2,h*.5,12,'#e7a18c','center',700);
 }
 for(const [id,key,minimum,maximum] of [
  ['rotation-spin','omega',-.95,.95],
  ['rotation-angle','angle',-.65,.65],
  ['rotation-radius','arealRadius',4,8]
 ]){
  $(id).addEventListener('input',e=>{
   state[key]=clamp(Number(e.target.value),minimum,maximum);
   m=rotatingMetric(getMetric(),{omega:state.omega});bh=schwarzschild(m.a/2);
   reset(true);save();
  });
 }
 for(const btn of document.querySelectorAll('[data-rotation-preset]'))
  btn.addEventListener('click',()=>{
   Object.assign(state,PRESETS[btn.dataset.rotationPreset]);
   m=rotatingMetric(getMetric(),{omega:state.omega});bh=schwarzschild(m.a/2);
   reset(true);save();onAction?.('mount');
  });
 return {state,configure,setActive,reset,trigger,tick,draw,update,
  get status(){return {wormhole:wr?.status,blackHole:br?.status,hasRun};},
  get snapshot(){return {settings:{...state},m,schwarzschild:bh,
   ergo:ergoSummary(m),wormhole:wr?{...wr,path:wr.path.map(x=>({...x}))}:null,
   blackHole:br?{...br,path:br.path.map(x=>({...x}))}:null};}
 };
}
