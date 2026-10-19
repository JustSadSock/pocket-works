import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { ShockField } from './physics.js';
import { TraceRecorder, DEFAULT_SENSORS } from './traces.js';
import { LoadHistory } from './load-history.js';

installMobileRuntime();

const KEY = 'shock-lab:experiment:v1';
const PRESETS = ['reflector','slits','maze','channel','empty','tube','wedge','airfoil','cylinder','nozzle'];
const FLOW_PRESETS = new Set(['wedge','airfoil','cylinder','nozzle']);
const TITLES = {reflector:'ОТРАЖАТЕЛЬ',slits:'ДВОЙНАЯ ДИФРАКЦИЯ',maze:'ЛАБИРИНТ',channel:'СОПЛО / КАНАЛ',empty:'ЧИСТАЯ КАМЕРА',tube:'УДАРНАЯ ТРУБА',wedge:'КОСОЙ КЛИН',airfoil:'СВЕРХЗВУКОВОЕ КРЫЛО',cylinder:'ЦИЛИНДР / УДАРНАЯ ВОЛНА',nozzle:'СУЖЕНИЕ / РАСШИРЕНИЕ'};
const DEFAULTS = () => ({preset:'reflector',tool:'pulse',view:'pressure',power:4.5,speed:2,ratio:8,flowMach:1.8,angle:0,camber:0,thickness:11,gustAmplitude:0,gustPeriod:6,records:[],streamlines:true,sound:false,sensors:DEFAULT_SENSORS.map(p=>({...p})),edits:{reflector:[],slits:[],maze:[],channel:[],empty:[],tube:[],wedge:[],airfoil:[],cylinder:[],nozzle:[]}});
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const safeNumber = (v,a,b,fallback) => typeof v === 'number' && Number.isFinite(v) ? clamp(v,a,b) : fallback;
const state = DEFAULTS();
const display=$('display'), canvas=$('field'), overlay=$('overlay');
const g=canvas.getContext('2d',{alpha:false}), over=overlay.getContext('2d');
const raster=document.createElement('canvas'), rg=raster.getContext('2d',{alpha:false});
const runBtn=$('run'), dialog=$('dialog'), scope=$('scope'), scopeG=scope.getContext('2d');
let sim, image, pointer=null, probe=null, ripples=[],toastTimer=null, lastFrame=0, accumulator=0;
let stageW=0,stageH=0, paintW=0,paintH=0,dpr=1, active=true, audioCtx=null,lastPulseSound=0, audioVoiceCount=0;
let hintVisible=true, lastMetrics=0, lastDemoTime=0, tubeReady=false, armingSensor=null, plotMode='history', lastScope=0,compareIndex=-1,lastLoads=null,shapePreviewDrag=null;

function normalizeEdits(edits){
  const result={};
  for(const preset of PRESETS){
    const list=Array.isArray(edits?.[preset])?edits[preset]:[];
    result[preset]=list.slice(-90).map((stroke)=>{
      if(!stroke || !['wall','erase'].includes(stroke.tool) || !Array.isArray(stroke.points))return null;
      const points=stroke.points.slice(0,400).filter(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)).map(pt=>[+pt[0].toFixed(4),+pt[1].toFixed(4)]);
      return points.length?{tool:stroke.tool,points}:null;
    }).filter(Boolean);
  }
  return result;
}
function applyData(input){
  if(!input||typeof input!=='object')return false;
  state.preset=PRESETS.includes(input.preset)?input.preset:'reflector';
  state.tool=['pulse','wall','erase','probe'].includes(input.tool)?input.tool:'pulse';
  state.view=['pressure','density','schlieren','mach','vorticity'].includes(input.view)?input.view:'pressure';
  state.power=safeNumber(input.power,.7,10,4.5);
  state.speed=Math.round(safeNumber(input.speed,1,5,2));
  state.sound=!!input.sound;
  state.ratio=safeNumber(input.ratio,2,16,8);
  state.flowMach=safeNumber(input.flowMach,.3,3.2,1.8);
  state.angle=Math.round(safeNumber(input.angle,-14,14,0));
  state.camber=Math.round(safeNumber(input.camber,-6,6,0));
  state.thickness=Math.round(safeNumber(input.thickness,5,22,11));
  state.gustAmplitude=Math.round(safeNumber(input.gustAmplitude,0,14,0));
  state.gustPeriod=Math.round(safeNumber(input.gustPeriod,2,18,6));
  state.records=Array.isArray(input.records)?input.records.slice(-4).map(r=>{
    if(!r||!['airfoil','wedge','cylinder'].includes(r.type))return null;
    const finite=v=>typeof v==='number'&&Number.isFinite(v);
    if(!finite(r.cd)||!finite(r.cl)||!finite(r.mach)||!finite(r.time)||!Array.isArray(r.upper)||!Array.isArray(r.lower))return null;
    const curve=a=>a.slice(0,250).map(v=>finite(v)?Math.max(-20,Math.min(20,v)):null);
    return {type:r.type,angle:Math.round(safeNumber(r.angle,-14,14,0)),mach:safeNumber(r.mach,.3,3.2,1.8),time:Math.max(0,r.time),cd:r.cd,cl:r.cl,cm:finite(r.cm)?r.cm:0,camber:Math.round(safeNumber(r.camber,-6,6,0)),thickness:Math.round(safeNumber(r.thickness,5,22,11)),upper:curve(r.upper),lower:curve(r.lower)};
  }).filter(Boolean):[];
  state.streamlines=input.streamlines!==false;
  state.sensors=Array.isArray(input.sensors)&&input.sensors.length===2?input.sensors.map((p,i)=>({x:safeNumber(p?.x,0,1,DEFAULT_SENSORS[i].x),y:safeNumber(p?.y,0,1,DEFAULT_SENSORS[i].y)})):DEFAULT_SENSORS.map(p=>({...p}));
  state.edits=normalizeEdits(input.edits);
  return true;
}
try{const stored=JSON.parse(localStorage.getItem(KEY)||'null');if(stored)applyData(stored)}catch{/* private mode or corrupt data: use defaults */}
const trace=new TraceRecorder(state.sensors);
const loadHistory=new LoadHistory();
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({preset:state.preset,tool:state.tool,view:state.view,power:state.power,speed:state.speed,ratio:state.ratio,flowMach:state.flowMach,angle:state.angle,camber:state.camber,thickness:state.thickness,gustAmplitude:state.gustAmplitude,gustPeriod:state.gustPeriod,records:state.records,streamlines:state.streamlines,sound:state.sound,sensors:trace.sensors,edits:state.edits}))}catch{/* unavailable quota; simulation stays usable */}
}
function toast(message){
  const el=$('toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function setActive(value){
  if(value&&tubeReady)releaseTube();
  active=value;
  $('run-symbol').textContent=active?'Ⅱ':'▷';
  $('run-text').textContent=tubeReady?'ПУСК':(active?'ПАУЗА':'ПРОДОЛЖИТЬ');
  $('sim-status').textContent=active?'СИМУЛЯЦИЯ':'ПАУЗА';
  document.querySelector('.live-indicator').classList.toggle('paused',!active);
  runBtn.setAttribute('aria-pressed',String(!active));
}
function refreshControls(){
  document.querySelectorAll('[data-tool]').forEach(b=>{const yes=b.dataset.tool===state.tool;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  document.querySelectorAll('[data-preset]').forEach(b=>{const yes=b.dataset.preset===state.preset;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  document.querySelectorAll('[data-view]').forEach(b=>{const yes=b.dataset.view===state.view;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  $('power').value=String(state.power);$('speed').value=String(state.speed);
  $('ratio').value=String(state.ratio);$('ratio-value').textContent=state.ratio.toFixed(1)+':1';
  $('tube-params').hidden=state.preset!=='tube';$('rupture').hidden=!tubeReady;
  const isFlow=FLOW_PRESETS.has(state.preset),hasBody=['airfoil','wedge','cylinder'].includes(state.preset);
  $('load-panel').hidden=!hasBody;
  $('angle-controls').hidden=!['airfoil','wedge'].includes(state.preset);
  $('attack-angle').value=String(state.angle);
  $('attack-angle-value').textContent=(state.angle>=0?'+':'')+state.angle+'°';
  $('shape-controls').hidden=state.preset!=='airfoil';
  $('camber').value=String(state.camber);
  $('thickness').value=String(state.thickness);
  $('camber-value').textContent=(state.camber>0?'+':'')+state.camber+'%';
  $('thickness-value').textContent=state.thickness+'%';
  refreshShapePreview();
  $('flow-panel').hidden=!isFlow;
  $('flow-metric').hidden=!isFlow;
  $('flow-mach').value=String(state.flowMach);
  $('flow-mach-value').textContent=state.flowMach.toFixed(1)+' M';
  $('flow-chip').hidden=!isFlow;
  $('flow-chip').textContent='→ M '+state.flowMach.toFixed(1);
  $('regime').textContent=state.flowMach>=1?'СВЕРХЗВУК':'ДОЗВУК';
  $('flow-velocity').textContent=(state.flowMach*Math.sqrt(1.4)).toFixed(2);
  $('gust-amplitude').value=String(state.gustAmplitude);
  $('gust-period').value=String(state.gustPeriod);
  $('gust-amplitude-value').textContent=state.gustAmplitude+'°';
  $('gust-period-value').textContent=state.gustPeriod+' τ';
  $('clear-loads').disabled=state.records.length===0;
  $('stream-state').textContent=state.streamlines?'ВКЛ.':'ВЫКЛ.';
  $('streamlines').setAttribute('aria-pressed',String(state.streamlines));
  $('streamlines').classList.toggle('enabled',state.streamlines);
  $('clear').textContent=state.preset==='tube'?'ПЕРЕЗАПУСК ТРУБЫ':isFlow?'СБРОС ПОТОКА':'СБРОС ВОЛН';
  $('run-text').textContent=tubeReady?'ПУСК':(active?'ПАУЗА':'ПРОДОЛЖИТЬ');
  $('sensor-a').classList.toggle('arming',armingSensor===0);
  $('sensor-b').classList.toggle('arming',armingSensor===1);
  $('sensor-hint').textContent=armingSensor!==null?('УКАЖИТЕ ТОЧКУ ДЛЯ ДАТЧИКА '+(armingSensor===0?'А':'Б')):'Нажмите А или Б, затем укажите новое место на поле';
  $('power-value').textContent=state.power.toFixed(1);$('speed-value').textContent=state.speed+'×';
  $('chamber-name').textContent=TITLES[state.preset];
  $('view-short').textContent=({pressure:'ΔP',density:'ρ',schlieren:'∇ρ',mach:'M',vorticity:'ω'})[state.view];
  $('legend-low').textContent=state.view==='vorticity'?'↻ ПО ЧАСОВОЙ':state.view==='mach'?'ДОЗВУК':'РАЗРЕЖЕНИЕ';
  $('legend-high').textContent=state.view==='vorticity'?'↺ ПРОТИВ ЧАСОВОЙ':state.view==='mach'?'СВЕРХЗВУК':'СЖАТИЕ';
  $('legend-ramp').classList.toggle('mach-ramp',state.view==='mach');
  $('legend-ramp').classList.toggle('vorticity-ramp',state.view==='vorticity');
  $('sound').textContent=state.sound?'ЗВУК ВКЛ.':'ЗВУК ВЫКЛ.';
  $('sound').classList.toggle('on',state.sound);
  $('sound').setAttribute('aria-pressed',String(state.sound));
  $('sound').setAttribute('aria-label',state.sound?'Выключить звук':'Включить звук');
  $('mode-help').textContent=({pulse:isFlow?'КАСАНИЕ: ИМПУЛЬС В ПОТОК':'ТАП: ИМПУЛЬС · УДЕРЖАНИЕ: СЕРИЯ',wall:'ВЕДИТЕ ПАЛЬЦЕМ, ЧТОБЫ ПОСТРОИТЬ СТЕНУ',erase:'ПРОВЕДИТЕ ПО СТЕНЕ, ЧТОБЫ СТЕРЕТЬ',probe:'КАСАНИЕ: ИЗМЕРИТЬ ПАРАМЕТРЫ'})[state.tool];
  $('hint').textContent=isFlow?'ПОТОК СЛЕВА НАПРАВО · ПЕРЕКЛЮЧИ РЕЖИМ И ИЗМЕРЯЙ':'Коснись камеры, чтобы создать ударную волну';
  $('undo').disabled=!state.edits[state.preset].length;
  $('remove-edits').disabled=!state.edits[state.preset].length;
  display.dataset.tool=state.tool;
  document.querySelectorAll('[data-plot]').forEach(b=>b.classList.toggle('selected',b.dataset.plot===plotMode));
}
function rebuildGeometry(){
  if(!sim)return;
  sim.geometry(state.preset,state.angle,{camber:state.camber,thickness:state.thickness});
  for(const stroke of state.edits[state.preset]){
    const radius=brushRadius();
    for(let i=0;i<stroke.points.length;i++){
      const a=stroke.points[Math.max(0,i-1)],b=stroke.points[i];
      sim.stroke(a[0]*sim.nx,a[1]*sim.ny,b[0]*sim.nx,b[1]*sim.ny,stroke.tool==='wall',radius);
    }
  }
  refreshControls();
}
const brushRadius=()=>clamp(Math.min(sim.nx,sim.ny)*.021,1.4,2.9);
function resetGas(withStart=false){
  if(!sim)return;
  sim.resetGas();
  const flow=FLOW_PRESETS.has(state.preset);
  if(flow){sim.setGust(state.gustAmplitude,state.gustPeriod);sim.startFlow(state.flowMach);}
  tubeReady=state.preset==='tube';
  if(tubeReady){sim.loadTube(state.ratio);setActive(false);}
  else if(withStart || flow){setActive(true);}
  trace.clear();trace.record(sim,true);
  loadHistory.clear();loadHistory.record(sim,.13,true);
  ripples=[];
  lastDemoTime=0;
  if(withStart&&!tubeReady&&!flow){
    const x=state.preset==='reflector'?.18:state.preset==='slits'?.17:state.preset==='channel'?.18:.13;
    sim.pulse(sim.nx*x,sim.ny*.50,state.power,clamp(Math.min(sim.nx,sim.ny)*.037,2.3,4.0));
    for(let k=0;k<7;k++)sim.step();
    ripples.push({x:x*sim.nx,y:sim.ny*.5,time:performance.now(),start:true});
  }
  refreshControls();updateMetrics();
}
function releaseTube(){
  if(!tubeReady)return;
  tubeReady=false;
  trace.clear();trace.record(sim,true);
  $('rupture').hidden=true;clearHint();playSound('pulse');
  toast('ДИАФРАГМА ОТКРЫТА · ВОЛНА ЗАПУЩЕНА');
}
function resizeField(){
  const rect=display.getBoundingClientRect();
  if(rect.width<80||rect.height<80)return;
  if(Math.abs(stageW-rect.width)<6&&Math.abs(stageH-rect.height)<6)return;
  stageW=rect.width;stageH=rect.height;
  dpr=Math.min(window.devicePixelRatio||1,2);
  paintW=Math.round(stageW*dpr);paintH=Math.round(stageH*dpr);
  for(const c of [canvas,overlay]){c.width=paintW;c.height=paintH;}
  const nx=clamp(Math.round(stageW/5.4),86,156);
  const ny=clamp(Math.round(nx*stageH/stageW),54,125);
  const oldField=sim,oldTubeReady=tubeReady;
  sim=new ShockField(nx,ny);
  raster.width=nx;raster.height=ny;image=rg.createImageData(nx,ny);
  rebuildGeometry();
  if(!oldField)resetGas(true);
  else if(oldTubeReady){
    sim.loadTube(state.ratio);
    tubeReady=true;setActive(false);
    trace.clear();trace.record(sim,true);
  }else{
    // Remap conserved quantities by normalised chamber coordinates. A resize
    // preserves a running experiment instead of silently resetting the gas.
    // Sensor histories are cleared because changing cell scale invalidates
    // the formerly measured arrival speeds.
    if(oldField.flowActive){sim.setGust(state.gustAmplitude,state.gustPeriod);sim.startFlow(state.flowMach);}
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const i=y*nx+x;if(sim.solid[i])continue;
      const ox=Math.round(x*(oldField.nx-1)/Math.max(1,nx-1));
      const oy=Math.round(y*(oldField.ny-1)/Math.max(1,ny-1));
      const oldI=oy*oldField.nx+ox;if(oldField.solid[oldI])continue;
      for(let j=0;j<4;j++)sim.U[i*4+j]=oldField.U[oldI*4+j];
    }
    sim.V.set(sim.U);
    sim.time=oldField.time;
    sim.maxPressure=oldField.maxPressure;
    sim.maxMach=oldField.maxMach;
    trace.clear();trace.record(sim,true);
  }
  loadHistory.clear();loadHistory.record(sim,.13,true);
  refreshControls();updateMetrics();
  lastFrame=0;accumulator=0;
  render();drawScope();drawLoadScope();
}
function getPosition(ev){
  const rect=display.getBoundingClientRect();
  return {x:clamp((ev.clientX-rect.left)/rect.width,0,1),y:clamp((ev.clientY-rect.top)/rect.height,0,1)};
}
function sampleAt(pos){return sim.sample(pos.x*(sim.nx-1),pos.y*(sim.ny-1))}
function clearHint(){if(hintVisible){hintVisible=false;$('hint').classList.add('hidden')}}
function addPulse(pos,quiet=false){
  if(!sim)return;
  const x=pos.x*(sim.nx-1),y=pos.y*(sim.ny-1);
  const at=sim.sample(x,y);
  if(at.solid){if(!quiet)toast('СТЕНА БЛОКИРУЕТ ИМПУЛЬС');return;}
  sim.pulse(x,y,state.power,clamp(Math.min(sim.nx,sim.ny)*.037,2.5,4.2));
  ripples.push({x,y,time:performance.now()});
  if(ripples.length>14)ripples.shift();
  if(!quiet)playSound('pulse');
  updateMetrics();
}
function beginGesture(ev){
  if(ev.button!==0||!sim||!dialog.hidden)return;
  ev.preventDefault();clearHint();
  const pos=getPosition(ev);
  if(armingSensor!==null){
    if(sampleAt(pos).solid){toast('ДАТЧИК НЕЛЬЗЯ ПОСТАВИТЬ В СТЕНУ');return;}
    trace.moveSensor(armingSensor,pos);
    state.sensors=trace.sensors.map(p=>({...p}));
    armingSensor=null;persist();refreshControls();updateMetrics();playSound('wall');
    toast('ДАТЧИК ПЕРЕМЕЩЁН · ЗАПИСЬ ОЧИЩЕНА');
    return;
  }
  if(state.preset==='airfoil'&&state.tool==='pulse'&&sim.sample(pos.x*sim.nx,pos.y*sim.ny).solid){
    const ix=Math.min(sim.nx-1,Math.floor(pos.x*sim.nx)),iy=Math.min(sim.ny-1,Math.floor(pos.y*sim.ny));
    if(sim.body[iy*sim.nx+ix]){
      try{display.setPointerCapture(ev.pointerId)}catch{}
      pointer={id:ev.pointerId,pos,tool:'shape',initialY:pos.y,initialCamber:state.camber};
      $('hint').textContent='ПЕРЕТАСКИВАЙТЕ КРЫЛО · МЕНЯЙТЕ КРИВИЗНУ';return;
    }
  }
    if(state.tool==='pulse'&&tubeReady){toast('СНАЧАЛА РАЗОРВИТЕ МЕМБРАНУ');return;}
  try{display.setPointerCapture(ev.pointerId)}catch{}
  pointer={id:ev.pointerId,pos,at:performance.now(),points:[pos],tool:state.tool};
  if(state.tool==='pulse')addPulse(pos);
  if(state.tool==='probe')probe=pos;
  if(state.tool==='wall'||state.tool==='erase')sim.stroke(pos.x*sim.nx,pos.y*sim.ny,pos.x*sim.nx,pos.y*sim.ny,state.tool==='wall',brushRadius());
}
function moveGesture(ev){
  if(!pointer||pointer.id!==ev.pointerId||!sim)return;
  ev.preventDefault();
  const pos=getPosition(ev),old=pointer.pos;
  if(pointer.tool==='shape'){
    const proposed=clamp(Math.round(pointer.initialCamber-(pos.y-pointer.initialY)*120),-6,6);
    $('camber').value=String(proposed);$('camber-value').textContent=(proposed>0?'+':'')+proposed+'%';
    refreshShapePreview(proposed);
  }else if(pointer.tool==='wall'||pointer.tool==='erase'){
    sim.stroke(old.x*sim.nx,old.y*sim.ny,pos.x*sim.nx,pos.y*sim.ny,pointer.tool==='wall',brushRadius());
    if(Math.hypot(pos.x-old.x,pos.y-old.y)>.0025)pointer.points.push(pos);
  }else if(pointer.tool==='probe')probe=pos;
  else if(pointer.tool==='pulse'){
    const now=performance.now();
    const pixelDistance=Math.hypot((pos.x-old.x)*stageW,(pos.y-old.y)*stageH);
    if(now-pointer.at>210&&pixelDistance>8){addPulse(pos,true);pointer.at=now;playSound('pulse');}
  }
  pointer.pos=pos;
}
function endGesture(ev){
  if(!pointer||ev.pointerId!==pointer.id)return;
  if(pointer.tool==='shape'){
    const proposed=+$('camber').value;
    if(proposed!==state.camber){
      state.camber=proposed;persist();rebuildGeometry();resetGas(false);drawCpChart();drawLoadScope();
      toast('ФОРМА КРЫЛА ИЗМЕНЕНА · НОВЫЙ РАСЧЁТ');
    }else refreshControls();
  }else if(pointer.tool==='wall'||pointer.tool==='erase'){
    const points=pointer.points.map(p=>[+p.x.toFixed(4),+p.y.toFixed(4)]);
    const tail=pointer.pos;
    const last=points[points.length-1];
    if(last&&Math.hypot(last[0]-tail.x,last[1]-tail.y)>.0001)points.push([+tail.x.toFixed(4),+tail.y.toFixed(4)]);
    state.edits[state.preset].push({tool:pointer.tool,points});
    if(state.edits[state.preset].length>90)state.edits[state.preset].shift();
    persist();refreshControls();playSound('wall');
  }
  try{display.releasePointerCapture(ev.pointerId)}catch{}
  pointer=null;
}
display.addEventListener('pointerdown',beginGesture);
display.addEventListener('pointermove',moveGesture);
display.addEventListener('pointerup',endGesture);
display.addEventListener('pointercancel',endGesture);
display.addEventListener('lostpointercapture',ev=>{if(pointer?.id===ev.pointerId)endGesture(ev)});
display.addEventListener('contextmenu',e=>e.preventDefault());

function palette(t,points){
  const scaled=clamp(t,0,1)*(points.length-1);
  const i=Math.min(points.length-2,Math.floor(scaled)),f=scaled-i;
  return [0,1,2].map(k=>Math.round(points[i][k]*(1-f)+points[i+1][k]*f));
}
function drawPhysics(){
  if(!sim)return;
  const W=sim.nx,H=sim.ny,solid=sim.solid,U=sim.U,d=image.data;
  const hot=[[17,34,40],[109,72,44],[198,114,50],[255,185,94],[255,242,183]];
  const cold=[[18,34,40],[34,107,132],[73,184,201],[156,231,232]];
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x,k=i*4,r=k;
      if(solid[i]){
        const edge=x===0||x===W-1||y===0||y===H-1||!solid[i-1]||!solid[i+1]||!solid[i-W]||!solid[i+W];
        d[r]=edge?180:52;d[r+1]=edge?158:78;d[r+2]=edge?124:80;d[r+3]=255;continue;
      }
      const rho=Math.max(.025,U[k]),vx=U[k+1]/rho,vy=U[k+2]/rho;
      const p=Math.max(.025,.4*(U[k+3]-.5*rho*(vx*vx+vy*vy)));
      let value;
      if(state.view==='pressure')value=p-1;
      else if(state.view==='density')value=(rho-1)*3;
      else if(state.view==='mach')value=Math.hypot(vx,vy)/Math.sqrt(1.4*p/rho);
      else if(state.view==='vorticity')value=sim.vorticity(x,y);
      else {
        const il=(y*W+Math.max(0,x-1))*4,ir=(y*W+Math.min(W-1,x+1))*4;
        const it=(Math.max(0,y-1)*W+x)*4,ib=(Math.min(H-1,y+1)*W+x)*4;
        const grad=Math.hypot(U[ir]-U[il],U[ib]-U[it]);
        value=Math.min(7,grad*6) * (p>=1?1:-1);
      }
      let color;
      if(state.view==='vorticity'){
        const intensity=clamp(Math.asinh(Math.abs(value)*10)/Math.asinh(6),0,1);
        const neg=[[19,36,41],[38,90,115],[64,173,198],[156,231,225]];
        const pos=[[19,36,41],[107,65,45],[202,108,59],[252,211,120]];
        color=palette(intensity,value<0?neg:pos);
      }else if(state.view==='mach'){
        // Mach 1 is the visible transition: blue subsonic, amber supersonic.
        const sonic=[[24,55,71],[48,112,132],[83,177,179],[110,130,124]];
        const fast=[[110,130,124],[116,107,90],[163,91,64],[239,128,68],[255,227,169]];
        color=value<1?palette(clamp(value,0,1),sonic)
          :palette(clamp((value-1)/2.2,0,1),fast);
      }else if(value>=0){const range=state.preset==='tube'?Math.log1p(state.ratio*7.5):FLOW_PRESETS.has(state.preset)?Math.log1p(10):Math.log1p(4.5);const t=clamp(Math.log1p(Math.min(24,value)*2.5)/range,0,1);color=palette(t,hot);}
      else {const t=clamp(Math.sqrt(-value*1.6),0,1);color=palette(t,cold);}
      // Thin isolines follow the actual pressure field; no animated fake wavefront.
      if(state.view==='pressure'&&Math.abs(value)>.05){
        const contour=Math.abs((Math.log1p(Math.abs(value))*7)%1-.5);
        if(contour<.04){color[0]=Math.min(255,color[0]+14);color[1]=Math.min(255,color[1]+12);color[2]=Math.min(255,color[2]+9);}
      }
      d[r]=color[0];d[r+1]=color[1];d[r+2]=color[2];d[r+3]=255;
    }
  }
  rg.putImageData(image,0,0);
  g.imageSmoothingEnabled=true;
  g.clearRect(0,0,paintW,paintH);
  g.drawImage(raster,0,0,paintW,paintH);
}
function drawStreamlines() {
  if(!state.streamlines||!sim?.flowActive)return;
  const px=paintW/sim.nx,py=paintH/sim.ny;
  over.save();
  // Deterministic streamline integral curves from current Euler velocity,
  // not precomputed geometry or hand-drawn shock rays.
  for(let lane=0;lane<19;lane++){
    let x=1.3, y=sim.ny*(.055+lane*.049);
    let visible=false;
    over.beginPath();
    for(let k=0;k<Math.ceil(sim.nx/1.8)+10;k++){
      if(x>=sim.nx-1.5 || y<=1 || y>=sim.ny-2)break;
      const p=sim.sample(x,y);
      if(p.solid||p.u<=.04||!Number.isFinite(p.v))break;
      const v=Math.hypot(p.u,p.v);
      if(v<.04)break;
      const xx=x*px,yy=y*py;
      if(!visible){over.moveTo(xx,yy);visible=true;}else over.lineTo(xx,yy);
      const dx=1.8*p.u/v,dy=1.8*p.v/v;
      const middle=sim.sample(x+dx*.5,y+dy*.5);
      if(middle.solid||middle.u<=.02)break;
      const norm=Math.hypot(middle.u,middle.v);
      if(norm<=.02)break;
      x+=1.8*middle.u/norm;
      y+=1.8*middle.v/norm;
    }
    if(visible){
      over.lineWidth=(lane%3===0?.95:.65)*dpr;
      over.strokeStyle=lane%3===0?'rgba(226,242,218,.36)':'rgba(166,204,204,.19)';
      over.stroke();
    }
  }
  // Direction indicators follow the same local measured velocity field.
  for(let row=0;row<9;row++){
    for(let col=1;col<5;col++){
      const x=sim.nx*(col/5),y=sim.ny*(.09+row*.102);
      const p=sim.sample(x,y);if(p.solid||p.u<=.1)continue;
      const speed=Math.hypot(p.u,p.v);
      const cx=x*px,cy=y*py,len=5*dpr;
      const ux=p.u/speed,uy=p.v/speed;
      over.strokeStyle='rgba(238,217,164,.46)';
      over.lineWidth=.85*dpr;over.beginPath();
      over.moveTo(cx-len*ux,cy-len*uy);over.lineTo(cx+len*ux,cy+len*uy);
      over.lineTo(cx+len*ux-3*dpr*(ux+uy),cy+len*uy-3*dpr*(uy-ux));
      over.moveTo(cx+len*ux,cy+len*uy);
      over.lineTo(cx+len*ux-3*dpr*(ux-uy),cy+len*uy-3*dpr*(uy+ux));
      over.stroke();
    }
  }
  over.restore();
}

function drawOverlay(now){
  if(!sim)return;
  over.clearRect(0,0,paintW,paintH);
  const unitX=paintW/sim.nx,unitY=paintH/sim.ny;
  over.lineWidth=Math.max(1,dpr);
  drawStreamlines();
  if(sim.flowActive&&sim.bodyBounds&&sim.time>.5&&lastLoads){
    const loads=lastLoads,bounds=sim.bodyBounds;
    const cx=(bounds.left+bounds.right)*.5*unitX,cy=paintH*.5;
    const fx=clamp(loads.cd*54*dpr,-61*dpr,61*dpr);
    const fy=clamp(-loads.cl*54*dpr,-61*dpr,61*dpr);
    const size=Math.hypot(fx,fy);
    over.save();
    if(size>4*dpr){
      const ux=fx/size,uy=fy/size,head=7*dpr;
      over.strokeStyle='#fbe0a7';over.fillStyle='#fbe0a7';
      over.lineWidth=2.1*dpr;over.shadowColor='#e8be7588';over.shadowBlur=5*dpr;
      over.beginPath();over.moveTo(cx,cy);over.lineTo(cx+fx,cy+fy);
      over.moveTo(cx+fx,cy+fy);over.lineTo(cx+fx-head*(ux-uy*.5),cy+fy-head*(uy+ux*.5));
      over.moveTo(cx+fx,cy+fy);over.lineTo(cx+fx-head*(ux+uy*.5),cy+fy-head*(uy-ux*.5));
      over.stroke();over.shadowBlur=0;
      over.font=(9*dpr)+'px monospace';over.fillText('Fₚ',cx+fx+4*dpr,cy+fy-8*dpr);
    }
    over.beginPath();over.fillStyle='#fff0c6';over.arc(cx,cy,2.5*dpr,0,Math.PI*2);over.fill();
    over.restore();
  }
  if(tubeReady){
    const x=paintW*.42,y0=paintH*.20,y1=paintH*.80;
    over.save();over.strokeStyle='#faf0d5';over.lineWidth=2*dpr;
    over.setLineDash([7*dpr,5*dpr]);over.beginPath();over.moveTo(x,y0);over.lineTo(x,y1);over.stroke();
    over.setLineDash([]);over.fillStyle='#f7e7bd';over.font=(11*dpr)+'px monospace';
    over.fillText('МЕМБРАНА',x+7*dpr,y0+14*dpr);over.restore();
  }
  if(plotMode==='profile'){
    over.save();over.setLineDash([5*dpr,6*dpr]);
    over.strokeStyle='rgba(179,212,207,.55)';over.lineWidth=dpr;
    over.beginPath();over.moveTo(0,paintH*.5);over.lineTo(paintW,paintH*.5);over.stroke();over.restore();
  }
  trace.sensors.forEach((p,i)=>{
    const x=p.x*paintW,y=p.y*paintH,col=i===0?'#f6cc80':'#8ed8e3';
    over.save();over.strokeStyle=col;over.fillStyle=col;over.lineWidth=1.5*dpr;
    over.beginPath();over.arc(x,y,5*dpr,0,Math.PI*2);over.stroke();
    over.beginPath();over.moveTo(x-10*dpr,y);over.lineTo(x-6*dpr,y);
    over.moveTo(x+6*dpr,y);over.lineTo(x+10*dpr,y);
    over.moveTo(x,y-10*dpr);over.lineTo(x,y-6*dpr);
    over.moveTo(x,y+6*dpr);over.lineTo(x,y+10*dpr);over.stroke();
    over.font=(12*dpr)+'px monospace';over.fillText(i===0?'А':'Б',x+10*dpr,y-9*dpr);over.restore();
  });
  for(const r of ripples){
    const age=(now-r.time)/1000;
    if(age<0||age>.48)continue;
    const cx=r.x*unitX,cy=r.y*unitY;
    over.strokeStyle='rgba(255,232,169,'+(1-age/.48)*.85+')';
    over.beginPath();over.arc(cx,cy,Math.max(2,(age*21+2)*Math.min(unitX,unitY)),0,Math.PI*2);over.stroke();
  }
  ripples=ripples.filter(r=>(now-r.time)<480);
  if(probe){
    const x=probe.x*paintW,y=probe.y*paintH;
    over.strokeStyle='#f7e7b7';over.fillStyle='#f7e7b7';over.lineWidth=1.2*dpr;
    over.beginPath();over.arc(x,y,10*dpr,0,Math.PI*2);over.moveTo(x-17*dpr,y);over.lineTo(x-6*dpr,y);over.moveTo(x+6*dpr,y);over.lineTo(x+17*dpr,y);over.moveTo(x,y-17*dpr);over.lineTo(x,y-6*dpr);over.moveTo(x,y+6*dpr);over.lineTo(x,y+17*dpr);over.stroke();
    const s=sampleAt(probe),label=s.solid?'СТЕНА':'P '+s.pressure.toFixed(2)+' P₀ · M '+s.mach.toFixed(2)+' · ρ '+s.rho.toFixed(2);
    over.font=(10*dpr)+'px monospace';const tw=over.measureText(label).width;
    const left=clamp(x-tw*.5-7*dpr,4*dpr,paintW-tw-16*dpr),top=clamp(y-40*dpr,8*dpr,paintH-27*dpr);
    over.fillStyle='#101c20e6';over.fillRect(left,top,tw+14*dpr,23*dpr);
    over.fillStyle='#ead8af';over.fillText(label,left+7*dpr,top+15*dpr);
  }
  if(pointer&&(pointer.tool==='wall'||pointer.tool==='erase')){
    const x=pointer.pos.x*paintW,y=pointer.pos.y*paintH;
    over.strokeStyle=pointer.tool==='wall'?'#e9c184':'#7bbdc9';over.setLineDash([3*dpr,4*dpr]);
    over.beginPath();over.arc(x,y,brushRadius()*unitX,0,Math.PI*2);over.stroke();over.setLineDash([]);
  }
}
// Analog-style signal recorder: every stroke comes from actual solver samples.
function drawScope() {
  if(!sim)return;
  const bounds=scope.getBoundingClientRect();
  if(bounds.width<30||bounds.height<30)return;
  const pixelRatio=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(1,Math.round(bounds.width*pixelRatio)),ch=Math.max(1,Math.round(bounds.height*pixelRatio));
  if(scope.width!==cw||scope.height!==ch){scope.width=cw;scope.height=ch;}
  const w=bounds.width,h=bounds.height,c=scopeG;
  c.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  c.fillStyle='#0c2026';c.fillRect(0,0,w,h);
  const l=36,r=w-10,t=12,b=h-22,pw=Math.max(1,r-l),ph=Math.max(1,b-t);
  const history=plotMode==='history';
  const recent=trace.samples;
  const maxTime=recent.length?recent[recent.length-1].t:0;
  const minTime=Math.max(0,maxTime-16);
  const values=history?recent.filter(s=>s.t>=minTime).flatMap(s=>[s.a,s.b]):trace.profile(sim);
  const finite=values.filter(v=>v!==null&&Number.isFinite(v));
  const maxP=Math.min(30,Math.max(1.6,...finite)*1.08);
  const minP=Math.max(0,Math.min(.75,...finite)-.1);
  const toY=p=>b-clamp((p-minP)/Math.max(.001,maxP-minP),0,1)*ph;
  c.lineWidth=1;
  c.font='9px monospace';
  c.textBaseline='middle';
  for(let i=0;i<=4;i++){
    const py=t+i*ph/4;
    c.strokeStyle='#28464b';c.beginPath();c.moveTo(l,py);c.lineTo(r,py);c.stroke();
    c.fillStyle='#79979b';c.textAlign='right';
    c.fillText((maxP-(maxP-minP)*i/4).toFixed(1),l-6,py);
  }
  c.textBaseline='alphabetic';
  for(let i=0;i<=4;i++){
    const px=l+i*pw/4;
    c.strokeStyle='#20393e';c.beginPath();c.moveTo(px,t);c.lineTo(px,b);c.stroke();
    c.fillStyle='#809a9e';c.textAlign=i===0?'left':i===4?'right':'center';
    c.fillText(history?(minTime+(maxTime>16?16:Math.max(4,maxTime))*i/4).toFixed(1):(100*i/4).toFixed(0)+'%',px,h-7);
  }
  function drawSeries(points,color){
    if(points.length<2)return;
    c.lineWidth=1.9;c.lineJoin='round';c.strokeStyle=color;
    c.beginPath();let began=false;
    for(const point of points){
      if(point[1]===null||!Number.isFinite(point[1])){began=false;continue;}
      const x=l+clamp(point[0],0,1)*pw,y=toY(point[1]);
      if(!began){c.moveTo(x,y);began=true;}else c.lineTo(x,y);
    }
    c.stroke();
  }
  if(history){
    const duration=Math.max(4,maxTime-minTime);
    const points=recent.filter(s=>s.t>=minTime);
    drawSeries(points.map(s=>[(s.t-minTime)/duration,s.a]),'#f2c47d');
    drawSeries(points.map(s=>[(s.t-minTime)/duration,s.b]),'#83cdd9');
    c.fillStyle='#718f96';c.textAlign='left';c.font='8px monospace';
    c.fillText('P/P₀ · ВРЕМЯ τ',l+3,t+10);
  }else{
    const p=trace.profile(sim);
    drawSeries(p.map((v,i)=>[i/Math.max(1,p.length-1),v]),'#f2c47d');
    for(let i=0;i<2;i++){
      const x=l+trace.sensors[i].x*pw,y=toY(trace.read(sim)[i].pressure);
      c.fillStyle=i===0?'#f2c47d':'#83cdd9';
      c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();
    }
    c.fillStyle='#718f96';c.textAlign='left';c.font='8px monospace';
    c.fillText('P/P₀ · ЛИНИЯ Y=0.5',l+3,t+10);
  }
}

function formatLoad(v){return Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(3):'—';}

function renderRecords() {
  const host=$('record-list');host.replaceChildren();
  if(!state.records.length){
    const p=document.createElement('p');p.textContent='Замеров пока нет. Выберите угол атаки, дайте потоку развиться и сохраните результат.';
    host.append(p);return;
  }
  state.records.forEach((r,i)=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.record=String(i);button.className='stored-run';
    button.classList.toggle('selected',compareIndex===i);
    button.setAttribute('aria-pressed',String(compareIndex===i));
    const label=document.createElement('span');
    const names={airfoil:'КРЫЛО',wedge:'КЛИН',cylinder:'ЦИЛИНДР'};
    label.textContent=(names[r.type]||r.type)+' · '+(r.angle>=0?'+':'')+r.angle+'° · M '+r.mach.toFixed(1)+(r.type==='airfoil'?' · К '+r.camber+'% · Т '+r.thickness+'%':'');
    const vals=document.createElement('strong');vals.textContent='L '+formatLoad(r.cl)+' / D '+formatLoad(r.cd)+' / m '+formatLoad(r.cm);
    button.append(label,vals);host.append(button);
  });
}
function drawCpChart(){
  if(!sim)return;
  const canvas=$('cp-chart');if(canvas.closest('[hidden]'))return;
  const rect=canvas.getBoundingClientRect();if(rect.width<30||rect.height<30)return;
  const ratio=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
  const iw=Math.round(w*ratio),ih=Math.round(h*ratio);
  if(canvas.width!==iw||canvas.height!==ih){canvas.width=iw;canvas.height=ih;}
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.fillStyle='#11252b';ctx.fillRect(0,0,w,h);
  const l=39,r=w-11,t=16,b=h-22;const width=r-l,height=b-t;
  const current=lastLoads;
  const reference=state.records[compareIndex];
  const values=[...(current?.upper||[]),...(current?.lower||[]),...(reference?.upper||[]),...(reference?.lower||[])].filter(v=>v!==null&&Number.isFinite(v));
  const lim=Math.max(.5,...values.map(v=>Math.abs(v)))*1.15;
  const toY=v=>t+(lim-v)/(2*lim)*height;
  ctx.font='10px monospace';ctx.lineWidth=1;
  for(let j=0;j<5;j++){
    const p=t+j*height/4;ctx.strokeStyle='#2a4549';ctx.beginPath();ctx.moveTo(l,p);ctx.lineTo(r,p);ctx.stroke();
    ctx.fillStyle='#8ba6a6';ctx.textAlign='right';ctx.fillText((lim-j*lim/2).toFixed(1),l-7,p+3);
  }
  for(let i=0;i<5;i++){const x=l+i*width/4;ctx.strokeStyle='#253d41';ctx.beginPath();ctx.moveTo(x,t);ctx.lineTo(x,b);ctx.stroke();ctx.fillStyle='#8ba6a6';ctx.textAlign='center';ctx.fillText((i*25)+'%',x,h-6);}
  // Smooth the visual trace by a 3-cell moving window to reduce
  // staircase aliasing; stored profiles and integrated forces stay raw.
  function filtered(points){
    if(!Array.isArray(points))return points;
    return points.map((v,i)=>{
      if(v===null||!Number.isFinite(v))return null;
      let total=0,count=0;
      for(let j=Math.max(0,i-2);j<=Math.min(points.length-1,i+2);j++){
        if(points[j]!==null&&Number.isFinite(points[j])){total+=points[j];count++;}
      }
      return count?total/count:v;
    });
  }
  function series(points,color,dashed=false){
    if(!points?.length)return;
    points=filtered(points);
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=dashed?1.3:2;
    ctx.setLineDash(dashed?[4,3]:[]);
    let moved=false;
    points.forEach((v,i)=>{
      if(v===null||!Number.isFinite(v)){moved=false;return;}
      const x=l+i/Math.max(1,points.length-1)*width,y=toY(v);
      if(!moved){ctx.moveTo(x,y);moved=true;}else ctx.lineTo(x,y);
    });ctx.stroke();ctx.setLineDash([]);
  }
  if(reference){series(reference.upper,'#ebbe77',true);series(reference.lower,'#83cbd5',true);}
  if(current){series(current.upper,'#f2c982');series(current.lower,'#8bd4d8');}
  ctx.textAlign='left';ctx.fillStyle='#a7b9b0';ctx.font='9px monospace';
  ctx.fillText('Cₚ',l+4,t+10);
}


function refreshShapePreview(camber=state.camber,thickness=state.thickness){
 const p=$('shape-preview-path');if(!p)return;
 const top=[],bottom=[];
 for(let i=0;i<=26;i++){
  const t=i/26,x=12+t*236,arch=camber*.86*4*t*(1-t),half=.53*thickness*Math.pow(Math.max(0,Math.sin(Math.PI*t)),.85);
  top.push([x,32-arch-half]);bottom.push([x,32-arch+half]);
 }
 p.setAttribute('d',[...top,...bottom.reverse()].map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ')+' Z');
}
function drawLoadScope(){
 const node=$('load-scope');if(node.closest('[hidden]'))return;
 const rect=node.getBoundingClientRect();if(rect.width<30||rect.height<30)return;
 const ratio=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;
 if(node.width!==Math.round(w*ratio)||node.height!==Math.round(h*ratio)){node.width=Math.round(w*ratio);node.height=Math.round(h*ratio)}
 const c=node.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#0d2429';c.fillRect(0,0,w,h);
 const l=39,r=w-10,t=14,b=h-20,ww=r-l,hh=b-t;
 const all=loadHistory.samples,end=all.length?all[all.length-1].t:0,min=Math.max(0,end-16);
 const selected=all.filter(x=>x.t>=min);
 let peak=.25;for(const q of selected)peak=Math.max(peak,Math.abs(q.cl),Math.abs(q.cd));
 peak=Math.min(20,peak*1.18);
 const yy=v=>t+(peak-v)/(2*peak)*hh;
 c.font='9px monospace';
 for(let i=0;i<=4;i++){
  const y=t+i*hh/4;c.strokeStyle=i===2?'#607875':'#2c4447';c.lineWidth=i===2?1.2:1;
  c.beginPath();c.moveTo(l,y);c.lineTo(r,y);c.stroke();
  c.fillStyle='#93aaa8';c.textAlign='right';c.fillText((peak-i*peak/2).toFixed(2),l-5,y+3);
 }
 for(let i=0;i<=4;i++){
  const x=l+i*ww/4;c.strokeStyle='#2c4245';c.beginPath();c.moveTo(x,t);c.lineTo(x,b);c.stroke();
  c.fillStyle='#8b9ea0';c.textAlign='center';c.fillText((min+i*Math.max(4,end-min)/4).toFixed(1),x,h-5);
 }
 const duration=Math.max(4,end-min);
 function series(key,color,dashed=false,scale=1){
  if(selected.length<2)return;c.strokeStyle=color;c.lineWidth=dashed?1:2;c.setLineDash(dashed?[4,4]:[]);c.beginPath();
  for(let i=0;i<selected.length;i++){const q=selected[i],x=l+ww*(q.t-min)/duration,y=yy(q[key]*scale);if(!i)c.moveTo(x,y);else c.lineTo(x,y);}
  c.stroke();c.setLineDash([]);
 }
 series('cl','#f3cb85');series('cd','#87ccd5');series('gust','#8499a4',true,.04);
 c.fillStyle='#829b9a';c.textAlign='left';c.fillText('CL / CD · τ',l+4,t+10);
}
function render(now=performance.now()){if(!sim)return;drawPhysics();drawOverlay(now)}
function updateMetrics(){
  if(!sim)return;
  $('time').textContent=sim.time.toFixed(2);
  $('flow-peak').textContent=sim.maxMach.toFixed(2);
  $('mach-peak').textContent=sim.maxMach.toFixed(2);
  $('gust-live').textContent=(sim.gustAngle>=0?'+':'')+sim.gustAngle.toFixed(1)+'°';
  const loads=sim.aeroForces();lastLoads=loads;
  $('lift-value').textContent=loads?formatLoad(loads.cl):'—';
  $('drag-value').textContent=loads?formatLoad(loads.cd):'—';
  $('moment-value').textContent=loads?formatLoad(loads.cm):'—';
  const ref=state.records[compareIndex];
  if(loads&&ref&&loads.type===ref.type&&Math.abs(loads.mach-ref.mach)<.11&&loads.incidence!==ref.angle&&sim.time>=4&&state.gustAmplitude===0&&(loads.type!=='airfoil'||(ref.camber===state.camber&&ref.thickness===state.thickness))){
    const slope=(loads.cm-ref.cm)/(loads.incidence-ref.angle);
    $('stability-line').textContent='ΔCm/Δα ≈ '+formatLoad(slope)+' / градус · '+(slope<-.0006?'ВОССТАНАВЛИВАЮЩАЯ ТЕНДЕНЦИЯ':slope>.0006?'РАСКАЧИВАЮЩАЯ ТЕНДЕНЦИЯ':'СЛАБАЯ РЕАКЦИЯ ПО МОМЕНТУ')+' (условно, без динамики)';
  }else{
    $('stability-line').textContent='Для оценки тенденции сравните Cm при одинаковой форме и M, разных углах и выключенных порывах (≥4 τ).';
  }
  $('record-load').disabled=!loads || sim.time<.15;
  const stats=loadHistory.stats();
  $('cl-mean').textContent=stats?formatLoad(stats.clMean):'—';
  $('cl-rms').textContent=stats?stats.clRms.toFixed(4):'—';
  $('omega-rms').textContent=stats?stats.omegaRms.toFixed(4):'—';
  $('loads-csv').disabled=loadHistory.samples.length<2;
  $('peak').innerHTML=sim.maxPressure.toFixed(2)+' <em>×P₀</em>';
  if(probe){const s=sampleAt(probe);$('probe').textContent=s.solid?'СТЕНА':s.pressure.toFixed(2)+' P₀';}
  else $('probe').textContent='—';
  const readings=trace.read(sim);
  $('reading-a').textContent=readings[0].solid?'—':readings[0].pressure.toFixed(2);
  $('reading-b').textContent=readings[1].solid?'—':readings[1].pressure.toFixed(2);
  const [ta,tb]=trace.arrival;
  $('lag').textContent=ta!==null&&tb!==null?Math.abs(tb-ta).toFixed(2)+' τ':'—';
  const velocity=trace.speed(sim);
  $('front-speed').textContent=velocity!==null?velocity.toFixed(2):'—';
  $('samples').textContent=trace.samples.length+' отсчётов';
  $('csv').disabled=trace.samples.length<2;
}
function loop(now){
  requestAnimationFrame(loop);
  if(document.hidden||!sim)return;
  if(!lastFrame)lastFrame=now;
  const elapsed=Math.min(45,now-lastFrame);lastFrame=now;
  if(active){
    accumulator+=elapsed/16.667*state.speed;
    let executed=0;
    while(accumulator>=1&&executed<9){sim.step();trace.record(sim);loadHistory.record(sim);accumulator-=1;executed++;}
    if(executed===9)accumulator=0;
    if(hintVisible && !tubeReady && !FLOW_PRESETS.has(state.preset) && state.preset!=='tube' && sim.time-lastDemoTime>3.7){
      const x=sim.nx*.19,y=sim.ny*.5;
      sim.pulse(x,y,state.power*.85,clamp(Math.min(sim.nx,sim.ny)*.037,2.5,4.2));
      ripples.push({x,y,time:now});lastDemoTime=sim.time;
    }
  }
  if(now-lastMetrics>110){updateMetrics();drawScope();drawCpChart();drawLoadScope();lastMetrics=now;}
  render(now);
}
document.addEventListener('visibilitychange',()=>{lastFrame=0;accumulator=0;if(document.hidden&&audioCtx?.state==='running')audioCtx.suspend().catch(()=>{});});
window.addEventListener('pagehide',persist);
const observer=new ResizeObserver(()=>resizeField());observer.observe(display);
window.addEventListener('resize',resizeField);
requestAnimationFrame(loop);

// A restrained material palette: pressure pulse = short broadband air crack + bass
// compression; geometry edit = filtered chalk scrape. No loops or stock UI beeps.
function playSound(type){
  if(!state.sound)return;
  const now=performance.now();
  if(type==='pulse'&&now-lastPulseSound<95)return;
  if(type==='pulse')lastPulseSound=now;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    if(audioVoiceCount>=5)return;
    const t=audioCtx.currentTime,duration=type==='pulse'?.34:.085;
    const N=Math.ceil(audioCtx.sampleRate*duration),buffer=audioCtx.createBuffer(1,N,audioCtx.sampleRate),arr=buffer.getChannelData(0);
    for(let i=0;i<N;i++){
      const q=i/N;arr[i]=(Math.random()*2-1)*(1-q)*(type==='pulse'?1:.35);
    }
    const src=audioCtx.createBufferSource();src.buffer=buffer;
    const filter=audioCtx.createBiquadFilter();filter.type=type==='pulse'?'lowpass':'bandpass';
    filter.frequency.setValueAtTime(type==='pulse'?1150:1600,t);
    filter.frequency.exponentialRampToValueAtTime(type==='pulse'?100:600,t+duration);
    const gain=audioCtx.createGain();gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(type==='pulse'?.125:.045,t+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start(t);src.stop(t+duration);
    if(type==='pulse'){
      const osc=audioCtx.createOscillator(),bass=audioCtx.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(95,t);osc.frequency.exponentialRampToValueAtTime(38,t+.22);
      bass.gain.setValueAtTime(.001,t);bass.gain.exponentialRampToValueAtTime(.07,t+.015);bass.gain.exponentialRampToValueAtTime(.0001,t+.27);
      osc.connect(bass).connect(audioCtx.destination);osc.start(t);osc.stop(t+.28);
    }
    audioVoiceCount++;src.onended=()=>{audioVoiceCount=Math.max(0,audioVoiceCount-1);src.disconnect();filter.disconnect();gain.disconnect();};
  }catch{/* no audio permission; keep visual feedback */}
}

document.querySelector('.controls').addEventListener('pointerdown', clearHint, { once:true });
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{
  state.tool=b.dataset.tool;armingSensor=null;persist();refreshControls();toast('ИНСТРУМЕНТ: '+b.textContent.trim());
}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
  if(state.preset===b.dataset.preset)return;
  state.preset=b.dataset.preset;probe=null;armingSensor=null;compareIndex=-1;rebuildGeometry();resetGas(true);persist();refreshControls();drawScope();drawCpChart();renderRecords();toast('КАМЕРА: '+TITLES[state.preset]);
}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  state.view=b.dataset.view;persist();refreshControls();drawScope();
}));
$('power').addEventListener('input',e=>{state.power=+e.target.value;$('power-value').textContent=state.power.toFixed(1);persist()});
$('speed').addEventListener('input',e=>{state.speed=+e.target.value;$('speed-value').textContent=state.speed+'×';persist()});
$('flow-mach').addEventListener('input',e=>{
  $('flow-mach-value').textContent=(+e.target.value).toFixed(1)+' M';
  $('regime').textContent=(+e.target.value)>=1?'СВЕРХЗВУК':'ДОЗВУК';
  $('flow-velocity').textContent=((+e.target.value)*Math.sqrt(1.4)).toFixed(2);
});
$('flow-mach').addEventListener('change',e=>{
  const requested=+e.target.value;
  if(state.flowMach===requested)return;
  state.flowMach=requested;persist();refreshControls();
  if(FLOW_PRESETS.has(state.preset)){resetGas(false);drawScope();render();toast('ПОТОК: МАХ '+state.flowMach.toFixed(1));}
});
$('streamlines').addEventListener('click',()=>{
  state.streamlines=!state.streamlines;persist();refreshControls();render();
});
$('attack-angle').addEventListener('input',e=>{
  const degrees=+e.target.value;
  $('attack-angle-value').textContent=(degrees>=0?'+':'')+degrees+'°';
});
$('attack-angle').addEventListener('change',e=>{
  state.angle=Math.round(+e.target.value);persist();
  if(!['airfoil','wedge'].includes(state.preset))return;
  rebuildGeometry();resetGas(false);refreshControls();drawCpChart();render();
  toast('УГОЛ АТАКИ: '+(state.angle>=0?'+':'')+state.angle+'° · НОВЫЙ ПРОГОН');
});
$('record-load').addEventListener('click',()=>{
  const r=sim?.aeroForces();if(!r||sim.time<.15)return;
  state.records.push({type:r.type,angle:r.incidence,mach:r.mach,time:r.time,
    cd:r.cd,cl:r.cl,cm:r.cm,camber:state.camber,thickness:state.thickness,upper:r.upper,lower:r.lower});
  if(state.records.length>4)state.records.shift();
  compareIndex=state.records.length-1;
  persist();refreshControls();renderRecords();drawCpChart();
  toast('ЗАМЕР СОХРАНЁН · '+state.records.length+'/4');
});
$('clear-loads').addEventListener('click',()=>{
  if(!state.records.length)return;
  if(!window.confirm('Удалить все сохранённые замеры аэродинамики?'))return;
  state.records=[];compareIndex=-1;persist();refreshControls();renderRecords();drawCpChart();toast('СОХРАНЁННЫЕ ЗАМЕРЫ ОЧИЩЕНЫ');
});
$('record-list').addEventListener('click',e=>{
  const button=e.target.closest('button[data-record]');if(!button)return;
  const index=Number(button.dataset.record);
  compareIndex=compareIndex===index?-1:index;
  renderRecords();drawCpChart();
});

for(const id of ['camber','thickness']){
 const control=$(id),output=$(id+'-value');
 control.addEventListener('input',()=>{
  const v=+control.value;output.textContent=(id==='camber'&&v>0?'+':'')+v+'%';
  refreshShapePreview(id==='camber'?v:state.camber,id==='thickness'?v:state.thickness);
 });
 control.addEventListener('change',()=>{
  const v=+control.value;if(state[id]===v)return;
  state[id]=v;persist();
  if(state.preset==='airfoil'){rebuildGeometry();resetGas(false);drawCpChart();drawLoadScope();render();toast('ФОРМА ИЗМЕНЕНА · НОВАЯ ГАЗОДИНАМИКА');}
  refreshControls();
 });
}
for(const [id,key] of [['gust-amplitude','gustAmplitude'],['gust-period','gustPeriod']]){
 const control=$(id),output=$(id+'-value');
 control.addEventListener('input',()=>output.textContent=control.value+(key==='gustAmplitude'?'°':' τ'));
 control.addEventListener('change',()=>{
  state[key]=+control.value;persist();
  if(sim?.flowActive)sim.setGust(state.gustAmplitude,state.gustPeriod);
  refreshControls();toast(state.gustAmplitude?'ПОРЫВЫ ВКЛЮЧЕНЫ':'ПОТОК СНОВА ПОСТОЯННЫЙ');
 });
}
$('loads-csv').addEventListener('click',()=>{
 if(loadHistory.samples.length<2)return;
 const url=URL.createObjectURL(new Blob([loadHistory.csv()],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;
 a.download='shock-unsteady-'+state.preset+'-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2200);
 toast('ВРЕМЕННЫЕ ДАННЫЕ СОХРАНЕНЫ');
});
$('flow-restart').addEventListener('click',()=>{
  if(!FLOW_PRESETS.has(state.preset))return;
  resetGas(false);drawScope();render();toast('НАБЕГАЮЩИЙ ПОТОК ПЕРЕЗАПУЩЕН');
});
$('ratio').addEventListener('input',e=>{
  state.ratio=+e.target.value;persist();
  if(state.preset==='tube'){resetGas();drawScope();}
  refreshControls();
});
$('rupture').addEventListener('pointerdown',e=>e.stopPropagation());
$('rupture').addEventListener('click',e=>{e.stopPropagation();if(!tubeReady)return;setActive(true);refreshControls();});
document.querySelectorAll('[data-plot]').forEach(button=>button.addEventListener('click',()=>{
  plotMode=button.dataset.plot;refreshControls();drawScope();
}));
for(const index of [0,1])$('sensor-'+(index===0?'a':'b')).addEventListener('click',()=>{
  armingSensor=armingSensor===index?null:index;refreshControls();
  toast(armingSensor===null?'РАЗМЕЩЕНИЕ ОТМЕНЕНО':'КОСНИТЕСЬ КАМЕРЫ ДЛЯ ДАТЧИКА '+(index===0?'А':'Б'));
});
$('csv').addEventListener('click',()=>{
  if(trace.samples.length<2)return;
  const blob=new Blob([trace.csv()],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='shock-pressure-'+state.preset+'-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
  toast('ОСЦИЛЛОГРАММА СОХРАНЕНА · CSV');
});
$('sound').addEventListener('click',()=>{state.sound=!state.sound;persist();refreshControls();if(state.sound)playSound('wall')});
runBtn.addEventListener('click',()=>setActive(!active));
$('step').addEventListener('click',()=>{if(tubeReady)releaseTube();setActive(false);if(sim){sim.step();trace.record(sim,true);}updateMetrics();drawScope();render();});
$('clear').addEventListener('click',()=>{resetGas();drawScope();toast(state.preset==='tube'?'ТРУБА ЗАРЯЖЕНА · ОЖИДАНИЕ РАЗРЫВА':FLOW_PRESETS.has(state.preset)?'НАБЕГАЮЩИЙ ПОТОК ПЕРЕЗАПУЩЕН':'ДАВЛЕНИЕ СБРОШЕНО ДО P₀');});
$('undo').addEventListener('click',()=>{
  if(!state.edits[state.preset].length)return;
  state.edits[state.preset].pop();rebuildGeometry();persist();toast('ПОСЛЕДНИЙ ШТРИХ ОТМЕНЁН');
});
$('remove-edits').addEventListener('click',()=>{if(state.edits[state.preset].length)dialog.hidden=false;});
$('cancel-remove').addEventListener('click',()=>dialog.hidden=true);
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.hidden=true});
$('confirm-remove').addEventListener('click',()=>{
  state.edits[state.preset]=[];dialog.hidden=true;rebuildGeometry();persist();toast('ПРАВКИ КАМЕРЫ УДАЛЕНЫ');
});
$('export').addEventListener('click',()=>{
  const payload={format:'shock-lab-v1',exportedAt:new Date().toISOString(),experiment:{preset:state.preset,tool:state.tool,view:state.view,power:state.power,speed:state.speed,ratio:state.ratio,flowMach:state.flowMach,angle:state.angle,records:state.records,streamlines:state.streamlines,sensors:trace.sensors,sound:state.sound,edits:state.edits}};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='shock-'+state.preset+'-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('ЭКСПЕРИМЕНТ ЭКСПОРТИРОВАН');
});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>350000){toast('ФАЙЛ СЛИШКОМ БОЛЬШОЙ');return;}
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed.format!=='shock-lab-v1'||!parsed.experiment||!applyData(parsed.experiment))throw new Error('bad format');
    trace.setSensors(state.sensors);compareIndex=-1;probe=null;refreshControls();rebuildGeometry();resetGas(true);persist();drawScope();drawCpChart();renderRecords();toast('ЭКСПЕРИМЕНТ ВОССТАНОВЛЕН');
  }catch{toast('НЕВЕРНЫЙ ФОРМАТ ФАЙЛА');}
});
document.addEventListener('keydown',ev=>{
  const tag=document.activeElement?.tagName?.toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  if(ev.key==='Escape'&&!dialog.hidden){dialog.hidden=true;return;}
  if(!dialog.hidden)return;
  if(ev.code==='Space'){ev.preventDefault();setActive(!active);}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){$('undo').click();ev.preventDefault();}
  if(['1','2','3','4'].includes(ev.key)){state.tool=['pulse','wall','erase','probe'][Number(ev.key)-1];armingSensor=null;persist();refreshControls();}
  if(ev.key==='Enter'&&document.activeElement===canvas)addPulse({x:.22,y:.5});
});
createWorkshopMode({
  appName:'SHOCK',version:'1.4.0',cachePrefix:'shock-lab-',storageNamespace:'pocket-works:shock-lab',
  onReset(){try{localStorage.removeItem(KEY)}catch{}Object.assign(state,DEFAULTS());trace.setSensors(state.sensors);armingSensor=null;compareIndex=-1;probe=null;refreshControls();rebuildGeometry();resetGas(true);drawScope();drawCpChart();renderRecords();toast('НАСТРОЙКИ И ПРАВКИ СБРОШЕНЫ');}
});
refreshControls();
resizeField();
drawScope();
renderRecords();
drawCpChart();
