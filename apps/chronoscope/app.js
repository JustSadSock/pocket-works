import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { activeEvent, cameraCueAt, clamp, formatClock, interpolateTrack, smartPlaybackMultiplier } from './engine.js';
import { constantinople as scenario } from './scenario-constantinople.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const ui = {
  library: $('library'), viewer: $('viewer'), open: $('open-scenario'), back: $('back-library'),
  canvas: $('map'), clock: $('clock'), title: $('scenario-title'), play: $('play'), speed: $('speed'),
  phase: $('phase'), time: $('time-readout'), scrub: $('scrub'), progress: $('scrub-progress'),
  thumb: $('scrub-thumb'), ticks: $('scrub-events'), auto: $('auto-camera'), focus: $('focus-event'),
  zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), layerBtn: $('layers-button'), sheet: $('layers-sheet'),
  sheetClose: $('layers-close'), layerList: $('layer-list'), eventCard: $('event-card'),
  eventTime: $('event-time'), eventTitle: $('event-title'), eventBody: $('event-body'),
  eventConfidence: $('event-confidence'), eventClose: $('event-close'), toast: $('toast')
};
const ctx = ui.canvas.getContext('2d', { alpha: false });
const STORE = 'pocket-works:chronoscope:state:v1';
const COLORS = { ink:'#202624', paper:'#d8cfb6', sea:'#91a9ad', seaDeep:'#6e8e96', ottoman:'#8a493d', byz:'#274b59' };
const state = {
  time: 0, playing: false, autoCamera: true, speedMode: 'auto', manualSpeed: 1,
  camera: { x:420, y:350, zoom:.92 }, target: { x:420, y:350, zoom:.92 },
  layers: { terrain:true, walls:true, units:true, commanders:true, labels:true, events:true },
  pointers: new Map(), pan: null, pinch: null, dismissedEvent: null, lastEvent: null, lastFrame: performance.now()
};
let view = { width:1, height:1, dpr:1 };
let toastTimer = 0;

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved) return;
    if (Number.isFinite(saved.time)) state.time = clamp(saved.time, 0, scenario.duration);
    if (typeof saved.autoCamera === 'boolean') state.autoCamera = saved.autoCamera;
    if (saved.layers) Object.assign(state.layers, saved.layers);
  } catch {}
}
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify({ time:state.time, autoCamera:state.autoCamera, layers:state.layers })); } catch {}
}
function resize() {
  const r = ui.canvas.getBoundingClientRect();
  view.width = Math.max(1, r.width);
  view.height = Math.max(1, r.height);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  ui.canvas.width = Math.round(view.width * view.dpr);
  ui.canvas.height = Math.round(view.height * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}
function scale() { return Math.min(view.width / scenario.bounds.width, view.height / scenario.bounds.height) * state.camera.zoom; }
function worldToScreen(x, y) {
  const s = scale();
  return { x:view.width/2 + (x-state.camera.x)*s, y:view.height/2 + (y-state.camera.y)*s };
}
function screenToWorld(x, y) {
  const r = ui.canvas.getBoundingClientRect();
  const s = scale();
  return { x:state.camera.x + (x-r.left-view.width/2)/s, y:state.camera.y + (y-r.top-view.height/2)/s };
}
function path(points, fill, stroke, width) {
  if (!points || !points.length) return;
  ctx.beginPath();
  const a = worldToScreen(points[0][0], points[0][1]);
  ctx.moveTo(a.x, a.y);
  for (let i=1;i<points.length;i++) {
    const p = worldToScreen(points[i][0], points[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
}
function line(points, stroke, width, dash) {
  if (!points || !points.length) return;
  ctx.beginPath();
  const a = worldToScreen(points[0][0], points[0][1]);
  ctx.moveTo(a.x,a.y);
  for (let i=1;i<points.length;i++) {
    const p=worldToScreen(points[i][0],points[i][1]);
    ctx.lineTo(p.x,p.y);
  }
  ctx.strokeStyle=stroke; ctx.lineWidth=width || 2; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
}
function drawTerrain() {
  ctx.fillStyle=COLORS.paper; ctx.fillRect(0,0,view.width,view.height);
  if (!state.layers.terrain) return;
  path(scenario.terrain.marmara,COLORS.sea);
  path(scenario.terrain.bosporus,COLORS.seaDeep);
  path(scenario.terrain.goldenHorn,COLORS.sea);
  path(scenario.terrain.land,'#d8cfb6','rgba(32,38,36,.55)',1.2);
  path(scenario.terrain.galata,'#cbc09f','rgba(32,38,36,.5)',1.2);
  ctx.save(); ctx.globalAlpha=.08; ctx.strokeStyle=COLORS.ink; ctx.lineWidth=.8;
  for(let y=80;y<650;y+=36){
    const a=worldToScreen(90,y), b=worldToScreen(880,y+18*Math.sin(y*.03));
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  ctx.restore();
  const chainA=worldToScreen(846,203), chainB=worldToScreen(862,224);
  ctx.strokeStyle='#4e4638'; ctx.lineWidth=Math.max(1.4,2.2*scale()); ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(chainA.x,chainA.y); ctx.lineTo(chainB.x,chainB.y); ctx.stroke(); ctx.setLineDash([]);
}
function drawWalls() {
  if (!state.layers.walls) return;
  for (const wall of scenario.walls) {
    const s=scale(), outer=wall.kind==='major' ? '#675e4f' : '#7e7460';
    line(wall.points,'rgba(32,38,36,.28)',wall.width*s+3);
    line(wall.points,outer,wall.width*s);
    if (wall.kind==='major') line(wall.points,'#b5a887',Math.max(1,2.2*s),[4*s,5*s]);
  }
}
function drawPlaces() {
  if (!state.layers.labels) return;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='top';
  for (const place of scenario.places) {
    const p=worldToScreen(place.x,place.y), r=place.landmark?5:3;
    ctx.fillStyle=place.landmark?COLORS.byz:COLORS.ink;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
    ctx.font=(place.landmark?'700 11px Georgia':'600 9px Georgia');
    ctx.fillStyle='rgba(32,38,36,.86)'; ctx.fillText(place.label,p.x,p.y+7);
  }
  ctx.restore();
}
function drawUnit(unit) {
  const pos=interpolateTrack(unit.track,state.time); if(!pos) return;
  const p=worldToScreen(pos.x,pos.y), s=scale(), strength=clamp(pos.strength == null ? 1 : pos.strength,.05,1);
  const size=Math.max(6,unit.size*s*.8), color=unit.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  ctx.save(); ctx.translate(p.x,p.y); ctx.globalAlpha=.38+.62*strength; ctx.fillStyle=color;
  if(unit.shape==='dots'){
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ctx.beginPath();ctx.arc(Math.cos(a)*size*.62,Math.sin(a)*size*.45,Math.max(1.4,size*.12),0,Math.PI*2);ctx.fill();}
  } else if(unit.shape==='line') {
    ctx.fillRect(-size*.95,-size*.28,size*1.9,size*.56);
  } else {
    ctx.fillRect(-size*.75,-size*.45,size*1.5,size*.9);
    ctx.strokeStyle=unit.elite?'#efe5c9':'rgba(32,38,36,.7)'; ctx.lineWidth=unit.elite?2:1; ctx.strokeRect(-size*.75,-size*.45,size*1.5,size*.9);
  }
  if(state.camera.zoom>1.3){
    ctx.globalAlpha=.9; ctx.font='700 9px system-ui'; ctx.textAlign='center'; ctx.fillStyle=COLORS.ink; ctx.fillText(unit.label,0,size*.7+7);
  }
  ctx.restore();
}
function drawCommander(command) {
  const pos=interpolateTrack(command.track,state.time); if(!pos) return;
  const p=worldToScreen(pos.x,pos.y), color=command.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  ctx.save(); ctx.translate(p.x,p.y); ctx.fillStyle='#efe7d1'; ctx.strokeStyle=color; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(-4,0);ctx.lineTo(0,-4);ctx.lineTo(4,0);ctx.lineTo(0,4);ctx.closePath();ctx.fill();
  if(state.camera.zoom>1.35){ctx.font='800 9px system-ui';ctx.textAlign='center';ctx.fillStyle=COLORS.ink;ctx.fillText(command.short,0,12);}
  ctx.restore();
}
function drawEventPulse(ts) {
  if(!state.layers.events) return;
  const e=activeEvent(scenario.events,state.time,10); if(!e) return;
  const p=worldToScreen(e.focus.x,e.focus.y), pulse=(ts%1200)/1200;
  ctx.save(); ctx.strokeStyle='rgba(138,73,61,'+(.55*(1-pulse))+')'; ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(p.x,p.y,16+pulse*34,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function render(ts) {
  if(ui.viewer.hidden) return;
  drawTerrain(); drawWalls(); drawPlaces();
  if(state.layers.units) scenario.units.forEach(drawUnit);
  if(state.layers.commanders) scenario.commanders.forEach(drawCommander);
  drawEventPulse(ts || performance.now());
}
function phaseAt(t){const p=scenario.phases.find(x=>t>=x.from&&t<x.to);return (p || scenario.phases[scenario.phases.length-1]).name;}
function showEvent(e) {
  if(!e){ui.eventCard.hidden=true;return;}
  ui.eventCard.hidden=false; ui.eventTime.textContent=formatClock(scenario.startMinutes,e.t)+' · событие';
  ui.eventTitle.textContent=e.title; ui.eventBody.textContent=e.body; ui.eventConfidence.textContent=e.confidence;
  if(e.id!==state.lastEvent){state.lastEvent=e.id;if(e.importance>=4)try{navigator.vibrate?.([12,32,12]);}catch{}}
}
function updateUi(){
  const pct=state.time/scenario.duration*100, clock=formatClock(scenario.startMinutes,state.time);
  ui.progress.style.width=pct+'%';ui.thumb.style.left=pct+'%';ui.scrub.setAttribute('aria-valuenow',String(Math.round(pct)));
  ui.clock.textContent='29 мая · '+clock;ui.time.textContent=clock;ui.phase.textContent=phaseAt(state.time);
  ui.auto.classList.toggle('active',state.autoCamera);ui.auto.setAttribute('aria-pressed',String(state.autoCamera));
  ui.speed.textContent=state.speedMode==='auto'?'AUTO':'×'+state.manualSpeed;
  const e=activeEvent(scenario.events,state.time,7);
  if(e && e.id!==state.dismissedEvent) showEvent(e); else if(!e){ui.eventCard.hidden=true;state.dismissedEvent=null;}
}
function cameraForTime(immediate){
  const cue=cameraCueAt(scenario.camera,state.time); if(!cue)return;
  state.target={x:cue.x,y:cue.y,zoom:cue.zoom}; if(immediate) Object.assign(state.camera,state.target);
}
function manualCamera(){
  if(state.autoCamera){state.autoCamera=false;updateUi();toast('Автокамера выключена');persist();}
}
function focusNearest(){
  const e=activeEvent(scenario.events,state.time,40) || scenario.events.reduce((best,x)=>Math.abs(x.t-state.time)<Math.abs(best.t-state.time)?x:best,scenario.events[0]);
  state.autoCamera=true;state.target={x:e.focus.x,y:e.focus.y,zoom:e.focus.zoom};state.dismissedEvent=null;showEvent(e);updateUi();toast(e.title);
}
function toast(text){
  clearTimeout(toastTimer);ui.toast.textContent=text;ui.toast.hidden=false;toastTimer=setTimeout(()=>ui.toast.hidden=true,1400);
}
function setViewer(open){
  ui.library.hidden=open;ui.viewer.hidden=!open;state.playing=false;ui.play.classList.remove('playing');
  if(open) requestAnimationFrame(()=>{resize();cameraForTime(true);render();updateUi();});
  persist();
}
function scrubTo(clientX){
  const r=ui.scrub.getBoundingClientRect();state.time=clamp((clientX-r.left)/r.width,0,1)*scenario.duration;
  state.playing=false;ui.play.classList.remove('playing');state.dismissedEvent=null;if(state.autoCamera)cameraForTime(true);updateUi();render();persist();
}
function buildTicks(){
  ui.ticks.innerHTML='';
  scenario.events.forEach(e=>{const b=document.createElement('button');b.type='button';b.className='event-tick '+(e.importance>=4?'major':'');b.style.left=(e.t/scenario.duration*100)+'%';b.setAttribute('aria-label',e.title);b.addEventListener('click',ev=>{ev.stopPropagation();state.time=e.t;state.dismissedEvent=null;if(state.autoCamera){state.target={x:e.focus.x,y:e.focus.y,zoom:e.focus.zoom};Object.assign(state.camera,state.target);}showEvent(e);updateUi();render();persist();});ui.ticks.appendChild(b);});
}
function buildLayers(){
  const info={terrain:['География','берега и вода'],walls:['Укрепления','стены и ворота'],units:['Войска','группы и движение'],commanders:['Командиры','знаковые личности'],labels:['Подписи','места и ориентиры'],events:['События','пульсация точек интереса']};
  ui.layerList.innerHTML='';
  Object.entries(info).forEach(([key,val])=>{const row=document.createElement('div');row.className='layer-row';const copy=document.createElement('div');copy.innerHTML='<strong>'+val[0]+'</strong><br><span>'+val[1]+'</span>';const b=document.createElement('button');b.type='button';b.className='layer-toggle '+(state.layers[key]?'on':'');b.setAttribute('aria-label',val[0]);b.addEventListener('click',()=>{state.layers[key]=!state.layers[key];b.classList.toggle('on',state.layers[key]);render();persist();});row.append(copy,b);ui.layerList.appendChild(row);});
}
function cycleSpeed(){
  const modes=['auto',.5,1,2,4],current=state.speedMode==='auto'?'auto':state.manualSpeed;let i=modes.findIndex(x=>x===current);i=(i+1)%modes.length;const n=modes[i];
  if(n==='auto')state.speedMode='auto';else{state.speedMode='manual';state.manualSpeed=n;}updateUi();
}
function bindMap(){
  ui.canvas.addEventListener('pointerdown',e=>{ui.canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1)state.pan={id:e.pointerId,x:e.clientX,y:e.clientY,cx:state.camera.x,cy:state.camera.y};if(state.pointers.size===2){const p=[...state.pointers.values()];state.pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:state.camera.zoom};}manualCamera();});
  ui.canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===2&&state.pinch){const p=[...state.pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);state.camera.zoom=clamp(state.pinch.zoom*d/state.pinch.distance,.65,3.4);}else if(state.pan&&state.pan.id===e.pointerId){const s=scale();state.camera.x=state.pan.cx-(e.clientX-state.pan.x)/s;state.camera.y=state.pan.cy-(e.clientY-state.pan.y)/s;}render();});
  const end=e=>{state.pointers.delete(e.pointerId);if(state.pan?.id===e.pointerId)state.pan=null;if(state.pointers.size<2)state.pinch=null;persist();};
  ui.canvas.addEventListener('pointerup',end);ui.canvas.addEventListener('pointercancel',end);
  ui.canvas.addEventListener('wheel',e=>{e.preventDefault();manualCamera();const before=screenToWorld(e.clientX,e.clientY);state.camera.zoom=clamp(state.camera.zoom*Math.exp(-e.deltaY*.0014),.65,3.4);const after=screenToWorld(e.clientX,e.clientY);state.camera.x+=before.x-after.x;state.camera.y+=before.y-after.y;render();},{passive:false});
}
function tick(ts){
  const dt=Math.min(.05,(ts-state.lastFrame)/1000||0);state.lastFrame=ts;
  if(state.playing){
    const m=state.speedMode==='auto'?smartPlaybackMultiplier(scenario.events,state.time):state.manualSpeed;
    state.time=clamp(state.time+dt*180*m,0,scenario.duration);
    if(state.time>=scenario.duration){state.playing=false;ui.play.classList.remove('playing');}
    if(state.autoCamera)cameraForTime(false);updateUi();
  }
  if(state.autoCamera){
    const k=1-Math.pow(.001,dt);state.camera.x+=(state.target.x-state.camera.x)*k;state.camera.y+=(state.target.y-state.camera.y)*k;state.camera.zoom+=(state.target.zoom-state.camera.zoom)*k;
  }
  render(ts);requestAnimationFrame(tick);
}

restore();buildTicks();buildLayers();updateUi();bindMap();
ui.open.addEventListener('click',()=>setViewer(true));ui.back.addEventListener('click',()=>setViewer(false));
ui.play.addEventListener('click',()=>{if(state.time>=scenario.duration)state.time=0;state.playing=!state.playing;ui.play.classList.toggle('playing',state.playing);try{navigator.vibrate?.(10);}catch{}});
ui.speed.addEventListener('click',cycleSpeed);
ui.auto.addEventListener('click',()=>{state.autoCamera=!state.autoCamera;if(state.autoCamera)cameraForTime(false);updateUi();persist();});
ui.focus.addEventListener('click',focusNearest);
ui.zoomIn.addEventListener('click',()=>{manualCamera();state.camera.zoom=clamp(state.camera.zoom*1.22,.65,3.4);render();});
ui.zoomOut.addEventListener('click',()=>{manualCamera();state.camera.zoom=clamp(state.camera.zoom/1.22,.65,3.4);render();});
ui.layerBtn.addEventListener('click',()=>ui.sheet.hidden=!ui.sheet.hidden);ui.sheetClose.addEventListener('click',()=>ui.sheet.hidden=true);
ui.eventClose.addEventListener('click',()=>{const e=activeEvent(scenario.events,state.time,7);state.dismissedEvent=e?.id||null;ui.eventCard.hidden=true;});
ui.scrub.addEventListener('pointerdown',e=>{ui.scrub.setPointerCapture(e.pointerId);scrubTo(e.clientX);});
ui.scrub.addEventListener('pointermove',e=>{if(ui.scrub.hasPointerCapture(e.pointerId))scrubTo(e.clientX);});
ui.scrub.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='Home')state.time=0;else if(e.key==='End')state.time=scenario.duration;else state.time=clamp(state.time+(e.key==='ArrowRight'?5:-5),0,scenario.duration);if(state.autoCamera)cameraForTime(true);updateUi();render();persist();});
new ResizeObserver(resize).observe(ui.canvas);
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.playing=false;ui.play.classList.remove('playing');persist();}state.lastFrame=performance.now();});
window.addEventListener('pagehide',persist);
resize();cameraForTime(true);requestAnimationFrame(tick);
window.__AI_TEST_STATE__={app:'chronoscope',loadingState:'ready',scenario:scenario.id};
