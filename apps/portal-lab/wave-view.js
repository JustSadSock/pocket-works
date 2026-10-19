import {createWave,advanceWave,diagnostics,waveSnapshot,WAVE_SOURCE,WAVE_DETECTOR} from './waves.js';
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const key='pocket-works:portal-lab:wave-v05';
const presets={
 pass:{j:0,wavelength:.95,width:1.3,double:false,relativePhase:0},
 barrier:{j:3,wavelength:2.6,width:1.3,double:false,relativePhase:0},
 interfere:{j:0,wavelength:1.2,width:1.2,double:true,relativePhase:0},
 cancel:{j:0,wavelength:1.2,width:1.2,double:true,relativePhase:Math.PI}
};
function text(ctx,str,x,y,size=11,color='#bad8c8',align='left',weight=500){
 ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';
 ctx.fillStyle=color;ctx.textBaseline='middle';ctx.textAlign=align;ctx.fillText(str,x,y);
}
function stroke(ctx,x1,y1,x2,y2,color='#678e85',width=1){
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
}
function precision(n,d=2){return Number.isFinite(n)?n.toFixed(d):'—';}
export function createWaveLab(options={}){
 let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 const state={
  j:clamp(Math.round(saved?.j??2),0,5),
  wavelength:clamp(Number(saved?.wavelength??2.25),.6,3.5),
  width:clamp(Number(saved?.width??1.25),.7,2.5),
  double:saved?.double===true,
  relativePhase:saved?.relativePhase===Math.PI?Math.PI:0,
  amplitude:1
 };
 let metric={a:1,eta:0},wave=null,phase='ready',active=false;
 const waterfallCanvas=document.createElement('canvas');
 waterfallCanvas.width=201;waterfallCanvas.height=160;
 const waterfallCtx=waterfallCanvas.getContext('2d',{alpha:false});
 const waterfallImage=waterfallCtx.createImageData(201,160);
 let cachedLastRow=null;
 const onAction=options.onAction||(()=>{});
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{}};
 function rebuild(){
  wave=createWave({...state,eta:metric.eta});
  cachedLastRow=null;phase='ready';update();save();
 }
 function configure(m){metric={...m};rebuild();}
 function setActive(value){active=value;if(active){if(!wave)rebuild();update();}else{$('shoot').disabled=false;}}
 function update(){
  $('wave-harmonic').value=state.j;
  $('wave-harmonic-value').textContent=state.j;
  $('wave-lambda').value=state.wavelength;
  $('wave-lambda-value').textContent=precision(state.wavelength);
  $('wave-width').value=state.width;
  $('wave-width-value').textContent=precision(state.width);
  $('wave-source').value=state.double?'double':'single';
  $('wave-phase').value=state.relativePhase===Math.PI?'pi':'zero';
  $('wave-phase-group').hidden=!state.double;
  document.querySelectorAll('[data-wave-preset]').forEach(btn=>{
   const candidate=presets[btn.dataset.wavePreset];
   const selected=!!candidate&&Object.keys(candidate).every(k=>state[k]===candidate[k]);
   btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
  });
  if(!wave)return;
  const d=diagnostics(wave);
  $('wave-time').textContent=precision(d.t);
  $('wave-energy').textContent=precision(d.relativeEnergy*100,1);
  $('wave-budget').textContent=precision(d.budget*100,1);
  $('wave-reflection').textContent=state.double?'—':precision(d.reflection*100,1);
  $('wave-transmission').textContent=state.double?'—':precision(d.transmission*100,1);
  $('wave-loss').textContent=precision(d.loss*100,1);
  $('wave-potential').textContent=precision(d.centerPotential,3);
  $('wave-wavekind').textContent=state.double?'ДВУХСТОРОННЕЕ ВОЗБУЖДЕНИЕ · ИНТЕРФЕРЕНЦИЯ':'ОДНОСТОРОННИЙ ПАКЕТ · РАССЕЯНИЕ';
  $('wave-state').textContent=phase==='running'?'ЭВОЛЮЦИЯ ПОЛЯ':phase==='finished'?'ПАКЕТ ПОКИНУЛ РАСЧЁТНУЮ ОБЛАСТЬ':'ПАКЕТ ПОДГОТОВЛЕН';
  $('wave-meaning').textContent=state.double?
   'Одновременный запуск с двух сторон: поля складываются. Коэффициенты отражения и прохождения здесь не определены для отдельного падающего пакета.'
   :'Проценты R/T — интеграл потока энергии через датчики ±12a. Значения сходятся после рассеяния и прохождения датчиков, а не в момент запуска.';
  if(active){
   $('shoot').innerHTML=(phase==='running'?'Волна распространяется':phase==='finished'?'Повторить опыт':'Запустить волну')+' <span aria-hidden="true">↗</span>';
   $('shoot').disabled=phase==='running';
  }
 }
 function trigger(){
  if(phase==='running')return;
  if(!wave||phase==='finished')rebuild();
  phase='running';onAction('launch');update();
 }
 function reset(){rebuild();onAction('mount');}
 function tick(dt,timeScale=1){
  if(!active||phase!=='running'||!wave)return;
  const result=advanceWave(wave,Math.min(.5,dt*timeScale*2.5));
  if(result.phase==='finished'){phase='finished';onAction('mount');}
  update();
 }
 function draw(ctx,w,h){
  if(!active||!wave)return;
  const grid=wave.grid,d=diagnostics(wave),wide=w>=620,pad=wide?32:15;
  const topH=wide?74:60;
  ctx.fillStyle='#0b191f';ctx.fillRect(0,0,w,h);
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#163231');g.addColorStop(1,'#0c1820');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const map=x=>pad+(x+grid.span)/(2*grid.span)*(w-2*pad);
  const waterfallY=topH+9,waterfallH=Math.max(55,Math.floor(h*.25));
  ctx.fillStyle='#091719';ctx.fillRect(pad,waterfallY,w-2*pad,waterfallH);
  const history=wave.waterfall,rows=history.length;
  if(history.at(-1)!==cachedLastRow){
   const pixels=waterfallImage.data;
   for(let j=0;j<160;j++){
    const p=history[j-(160-rows)];
    for(let i=0;i<201;i++){
     const u=p?clamp(p[i],-1.6,1.6)/1.6:0;
     const o=(j*201+i)*4;
     const opacity=p?(.09+.74*Math.abs(u)):0;
     const rgb=u>=0?[193,227,197]:[222,147,120];
     pixels[o]=9+(rgb[0]-9)*opacity;
     pixels[o+1]=23+(rgb[1]-23)*opacity;
     pixels[o+2]=25+(rgb[2]-25)*opacity;
     pixels[o+3]=255;
    }
   }
   waterfallCtx.putImageData(waterfallImage,0,0);
   cachedLastRow=history.at(-1);
  }
  ctx.drawImage(waterfallCanvas,pad,waterfallY,w-2*pad,waterfallH);
  const throatX=map(0);
  stroke(ctx,throatX,waterfallY-5,throatX,waterfallY+waterfallH+4,'#f1d6b873',1.5);
  const da=map(WAVE_DETECTOR),db=map(-WAVE_DETECTOR);
  ctx.setLineDash([3,5]);
  stroke(ctx,da,waterfallY-4,da,waterfallY+waterfallH+4,'#99c9b368',1);
  stroke(ctx,db,waterfallY-4,db,waterfallY+waterfallH+4,'#dfa88f68',1);
  ctx.setLineDash([]);
  text(ctx,'SCALAR FIELD / X = ∫ dl/N',pad,23,wide?12:10,'#9dccbc', 'left',700);
  text(ctx,'T = '+precision(d.t)+' a/c',w-pad,23,wide?12:10,'#edd6b2','right',700);
  text(ctx,'ДАТЧИК B',db,waterfallY-12,9,'#e0ad94','center');
  text(ctx,'ГОРЛОВИНА',throatX,waterfallY-12,9,'#f2dfb9','center');
  text(ctx,'ДАТЧИК A',da,waterfallY-12,9,'#8dc4ad','center');
  const waveY=waterfallY+waterfallH+Math.max(54,(h-waterfallY-waterfallH)*.36);
  const wavH=Math.min(85,(h-waterfallY-waterfallH)*.26);
  ctx.fillStyle='#11282a';ctx.fillRect(pad,waveY-wavH-9,w-2*pad,wavH*2+18);
  for(let n=0;n<=4;n++)stroke(ctx,map(-20+10*n),waveY-wavH,map(-20+10*n),waveY+wavH,'#95b5a51b',1);
  stroke(ctx,pad,waveY,w-pad,waveY,'#9ebcb24a',1);
  ctx.save();ctx.beginPath();ctx.rect(pad,waveY-wavH,w-2*pad,wavH*2);ctx.clip();
  ctx.beginPath();
  const norm=1/Math.max(1,Math.sqrt(state.double?2:1));
  for(let i=0;i<grid.points;i++){
   const xx=map(grid.x[i]),yy=waveY-clamp(wave.field[i]*norm,-1,1)*wavH*.95;
   if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
  }
  ctx.lineWidth=wide?2.2:1.7;ctx.strokeStyle='#bce7ce';ctx.shadowColor='#66cdbb';ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;ctx.restore();
  const potentialY=waveY+wavH+24,pH=Math.max(24,h-potentialY-35);
  const potentialMax=Math.max(...wave.potential);
  ctx.save();ctx.beginPath();ctx.rect(pad,potentialY,w-2*pad,pH);ctx.clip();
  ctx.beginPath();ctx.moveTo(pad,potentialY+pH);
  for(let i=0;i<grid.points;i++)ctx.lineTo(map(grid.x[i]),potentialY+pH*(1-wave.potential[i]/Math.max(1e-9,potentialMax)));
  ctx.lineTo(w-pad,potentialY+pH);ctx.closePath();
  const pGrad=ctx.createLinearGradient(0,potentialY,0,potentialY+pH);
  pGrad.addColorStop(0,'#d8a77793');pGrad.addColorStop(1,'#db957409');
  ctx.fillStyle=pGrad;ctx.fill();ctx.strokeStyle='#dea77a';ctx.lineWidth=1.4;ctx.stroke();ctx.restore();
  text(ctx,'ВОЛНОВАЯ ФУНКЦИЯ ψ',pad,waveY-wavH-19,10,'#bce9d0');
  text(ctx,'Uⱼ(x) · ЭФФЕКТИВНЫЙ ПОТЕНЦИАЛ',pad,potentialY-9,10,'#e2b28e');
  text(ctx,'ℓ='+state.j+' · λ='+precision(state.wavelength)+'a',w-pad,potentialY-9,10,'#b3b9a5','right');
  text(ctx,'B',pad+7,waveY+wavH+5,10,'#d8a080','left',700);
  text(ctx,'A',w-pad-7,waveY+wavH+5,10,'#96cdba','right',700);
  text(ctx,'x = 0',throatX,waveY+wavH+5,9,'#eadcc0','center');
  // Radial null reference characteristic only. Not a complete ray-optics model of j>0 modes.
  if(phase==='running'&&wave.t<32){
   const reference=map(WAVE_SOURCE-wave.t);
   if(reference>=pad&&reference<=w-pad){
    stroke(ctx,reference,waveY-wavH-1,reference,waveY+wavH+1,'#b9d8dc60',1);
    text(ctx,'c',reference,waveY+wavH+5,9,'#bbd7d6','center');
   }
  }
 }
 for(const [id,key,normalize] of [
  ['wave-harmonic','j',n=>Math.round(n)],['wave-lambda','wavelength',n=>n],
  ['wave-width','width',n=>n]
 ])$(id).addEventListener('input',e=>{state[key]=normalize(Number(e.target.value));rebuild();});
 $('wave-source').addEventListener('change',e=>{state.double=e.target.value==='double';rebuild();});
 $('wave-phase').addEventListener('change',e=>{state.relativePhase=e.target.value==='pi'?Math.PI:0;rebuild();});
 for(const b of document.querySelectorAll('[data-wave-preset]'))
  b.addEventListener('click',()=>{Object.assign(state,presets[b.dataset.wavePreset]);rebuild();onAction('mount');});
 return {state,configure,setActive,draw,trigger,reset,tick,update,
  get phase(){return phase;},
  get snapshot(){return wave?{...waveSnapshot(wave),samples:{
   x:Array.from(wave.grid.x),l:Array.from(wave.grid.z),potential:Array.from(wave.potential),
   field:Array.from(wave.field),velocity:Array.from(wave.velocity)}}:null;},
  get diagnostics(){return wave?diagnostics(wave):null}
 };
}
