import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { ShockField } from './physics.js';

installMobileRuntime();

const KEY = 'shock-lab:experiment:v1';
const PRESETS = ['reflector','slits','maze','channel','empty'];
const TITLES = {reflector:'ОТРАЖАТЕЛЬ',slits:'ДВОЙНАЯ ДИФРАКЦИЯ',maze:'ЛАБИРИНТ',channel:'СОПЛО / КАНАЛ',empty:'ЧИСТАЯ КАМЕРА'};
const DEFAULTS = () => ({preset:'reflector',tool:'pulse',view:'pressure',power:4.5,speed:2,sound:false,edits:{reflector:[],slits:[],maze:[],channel:[],empty:[]}});
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const safeNumber = (v,a,b,fallback) => typeof v === 'number' && Number.isFinite(v) ? clamp(v,a,b) : fallback;
const state = DEFAULTS();
const display=$('display'), canvas=$('field'), overlay=$('overlay');
const g=canvas.getContext('2d',{alpha:false}), over=overlay.getContext('2d');
const raster=document.createElement('canvas'), rg=raster.getContext('2d',{alpha:false});
const runBtn=$('run'), dialog=$('dialog');
let sim, image, pointer=null, probe=null, ripples=[],toastTimer=null, lastFrame=0, accumulator=0;
let stageW=0,stageH=0, paintW=0,paintH=0,dpr=1, active=true, audioCtx=null,lastPulseSound=0, audioVoiceCount=0;
let hintVisible=true, lastMetrics=0, lastDemoTime=0;

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
  state.view=['pressure','density','schlieren'].includes(input.view)?input.view:'pressure';
  state.power=safeNumber(input.power,.7,10,4.5);
  state.speed=Math.round(safeNumber(input.speed,1,5,2));
  state.sound=!!input.sound;
  state.edits=normalizeEdits(input.edits);
  return true;
}
try{const stored=JSON.parse(localStorage.getItem(KEY)||'null');if(stored)applyData(stored)}catch{/* private mode or corrupt data: use defaults */}
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({preset:state.preset,tool:state.tool,view:state.view,power:state.power,speed:state.speed,sound:state.sound,edits:state.edits}))}catch{/* unavailable quota; simulation stays usable */}
}
function toast(message){
  const el=$('toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function setActive(value){
  active=value;
  $('run-symbol').textContent=active?'Ⅱ':'▷';
  $('run-text').textContent=active?'ПАУЗА':'ПРОДОЛЖИТЬ';
  $('sim-status').textContent=active?'СИМУЛЯЦИЯ':'ПАУЗА';
  document.querySelector('.live-indicator').classList.toggle('paused',!active);
  runBtn.setAttribute('aria-pressed',String(!active));
}
function refreshControls(){
  document.querySelectorAll('[data-tool]').forEach(b=>{const yes=b.dataset.tool===state.tool;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  document.querySelectorAll('[data-preset]').forEach(b=>{const yes=b.dataset.preset===state.preset;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  document.querySelectorAll('[data-view]').forEach(b=>{const yes=b.dataset.view===state.view;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes))});
  $('power').value=String(state.power);$('speed').value=String(state.speed);
  $('power-value').textContent=state.power.toFixed(1);$('speed-value').textContent=state.speed+'×';
  $('chamber-name').textContent=TITLES[state.preset];
  $('view-short').textContent=({pressure:'ΔP',density:'ρ',schlieren:'∇ρ'})[state.view];
  $('sound').textContent=state.sound?'ЗВУК ВКЛ.':'ЗВУК ВЫКЛ.';
  $('sound').classList.toggle('on',state.sound);
  $('sound').setAttribute('aria-pressed',String(state.sound));
  $('sound').setAttribute('aria-label',state.sound?'Выключить звук':'Включить звук');
  $('mode-help').textContent=({pulse:'ТАП: ИМПУЛЬС · УДЕРЖАНИЕ: СЕРИЯ',wall:'ВЕДИТЕ ПАЛЬЦЕМ, ЧТОБЫ ПОСТРОИТЬ СТЕНУ',erase:'ПРОВЕДИТЕ ПО СТЕНЕ, ЧТОБЫ СТЕРЕТЬ',probe:'КАСАНИЕ: ИЗМЕРИТЬ ПАРАМЕТРЫ'})[state.tool];
  $('undo').disabled=!state.edits[state.preset].length;
  $('remove-edits').disabled=!state.edits[state.preset].length;
  display.dataset.tool=state.tool;
}
function rebuildGeometry(){
  if(!sim)return;
  sim.geometry(state.preset);
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
  ripples=[];
  lastDemoTime=0;
  if(withStart){
    const x=state.preset==='reflector'?.18:state.preset==='slits'?.17:state.preset==='channel'?.18:.13;
    sim.pulse(sim.nx*x,sim.ny*.50,state.power,clamp(Math.min(sim.nx,sim.ny)*.037,2.3,4.0));
    for(let k=0;k<7;k++)sim.step();
    ripples.push({x:x*sim.nx,y:sim.ny*.5,time:performance.now(),start:true});
  }
  updateMetrics();
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
  sim=new ShockField(nx,ny);
  raster.width=nx;raster.height=ny;image=rg.createImageData(nx,ny);
  rebuildGeometry();resetGas(true);
  lastFrame=0;accumulator=0;
  render();
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
  if(pointer.tool==='wall'||pointer.tool==='erase'){
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
  if(pointer.tool==='wall'||pointer.tool==='erase'){
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
      else {
        const il=(y*W+Math.max(0,x-1))*4,ir=(y*W+Math.min(W-1,x+1))*4;
        const it=(Math.max(0,y-1)*W+x)*4,ib=(Math.min(H-1,y+1)*W+x)*4;
        const grad=Math.hypot(U[ir]-U[il],U[ib]-U[it]);
        value=Math.min(7,grad*6) * (p>=1?1:-1);
      }
      let color;
      if(value>=0){const t=clamp(Math.log1p(Math.min(24,value)*2.5)/Math.log1p(4.5),0,1);color=palette(t,hot);}
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
function drawOverlay(now){
  if(!sim)return;
  over.clearRect(0,0,paintW,paintH);
  const unitX=paintW/sim.nx,unitY=paintH/sim.ny;
  over.lineWidth=Math.max(1,dpr);
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
    const s=sampleAt(probe),label=s.solid?'СТЕНА':'P '+s.pressure.toFixed(2)+' × P₀  ·  M '+s.mach.toFixed(2);
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
function render(now=performance.now()){if(!sim)return;drawPhysics();drawOverlay(now)}
function updateMetrics(){
  if(!sim)return;
  $('time').textContent=sim.time.toFixed(2);
  $('peak').innerHTML=sim.maxPressure.toFixed(2)+' <em>×P₀</em>';
  if(probe){const s=sampleAt(probe);$('probe').textContent=s.solid?'СТЕНА':s.pressure.toFixed(2)+' P₀';}
  else $('probe').textContent='—';
}
function loop(now){
  requestAnimationFrame(loop);
  if(document.hidden||!sim)return;
  if(!lastFrame)lastFrame=now;
  const elapsed=Math.min(45,now-lastFrame);lastFrame=now;
  if(active){
    accumulator+=elapsed/16.667*state.speed;
    let executed=0;
    while(accumulator>=1&&executed<9){sim.step();accumulator-=1;executed++;}
    if(executed===9)accumulator=0;
    if(hintVisible && sim.time-lastDemoTime>3.7){
      const x=sim.nx*.19,y=sim.ny*.5;
      sim.pulse(x,y,state.power*.85,clamp(Math.min(sim.nx,sim.ny)*.037,2.5,4.2));
      ripples.push({x,y,time:now});lastDemoTime=sim.time;
    }
  }
  if(now-lastMetrics>110){updateMetrics();lastMetrics=now;}
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

document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{
  state.tool=b.dataset.tool;persist();refreshControls();toast('ИНСТРУМЕНТ: '+b.textContent.trim());
}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
  if(state.preset===b.dataset.preset)return;
  state.preset=b.dataset.preset;probe=null;rebuildGeometry();resetGas(true);persist();refreshControls();toast('КАМЕРА: '+TITLES[state.preset]);
}));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  state.view=b.dataset.view;persist();refreshControls();
}));
$('power').addEventListener('input',e=>{state.power=+e.target.value;$('power-value').textContent=state.power.toFixed(1);persist()});
$('speed').addEventListener('input',e=>{state.speed=+e.target.value;$('speed-value').textContent=state.speed+'×';persist()});
$('sound').addEventListener('click',()=>{state.sound=!state.sound;persist();refreshControls();if(state.sound)playSound('wall')});
runBtn.addEventListener('click',()=>setActive(!active));
$('step').addEventListener('click',()=>{setActive(false);if(sim)sim.step();updateMetrics();render();});
$('clear').addEventListener('click',()=>{resetGas();toast('ДАВЛЕНИЕ СБРОШЕНО ДО P₀');});
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
  const payload={format:'shock-lab-v1',exportedAt:new Date().toISOString(),experiment:{preset:state.preset,tool:state.tool,view:state.view,power:state.power,speed:state.speed,sound:state.sound,edits:state.edits}};
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
    probe=null;refreshControls();rebuildGeometry();resetGas(true);persist();toast('ЭКСПЕРИМЕНТ ВОССТАНОВЛЕН');
  }catch{toast('НЕВЕРНЫЙ ФОРМАТ ФАЙЛА');}
});
document.addEventListener('keydown',ev=>{
  const tag=document.activeElement?.tagName?.toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  if(ev.key==='Escape'&&!dialog.hidden){dialog.hidden=true;return;}
  if(!dialog.hidden)return;
  if(ev.code==='Space'){ev.preventDefault();setActive(!active);}
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){$('undo').click();ev.preventDefault();}
  if(['1','2','3','4'].includes(ev.key)){state.tool=['pulse','wall','erase','probe'][Number(ev.key)-1];persist();refreshControls();}
  if(ev.key==='Enter'&&document.activeElement===canvas)addPulse({x:.22,y:.5});
});
createWorkshopMode({
  appName:'SHOCK',version:'1.0.0',cachePrefix:'shock-lab-',storageNamespace:'pocket-works:shock-lab',
  onReset(){try{localStorage.removeItem(KEY)}catch{}Object.assign(state,DEFAULTS());probe=null;refreshControls();rebuildGeometry();resetGas(true);toast('НАСТРОЙКИ И ПРАВКИ СБРОШЕНЫ');}
});
refreshControls();
resizeField();
