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
function scale() {
  const base=Math.min(view.width/scenario.bounds.width,view.height/scenario.bounds.height);
  const portrait=view.height>view.width*1.25;
  const wideShot=clamp((1.55-state.camera.zoom)/.75,0,1);
  const framing=portrait?1.12+wideShot*.12:1;
  return base*state.camera.zoom*framing;
}
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
function polygonClip(points) {
  if(!points?.length)return;
  const a=worldToScreen(points[0][0],points[0][1]);
  ctx.beginPath();ctx.moveTo(a.x,a.y);
  for(let i=1;i<points.length;i++){const p=worldToScreen(points[i][0],points[i][1]);ctx.lineTo(p.x,p.y);}
  ctx.closePath();
}
function drawUrbanDetail() {
  ctx.save();polygonClip(scenario.terrain.land);ctx.clip();
  const s=scale();
  const streets=[
    [[176,160],[310,225],[470,300],[650,385],[800,454]],
    [[168,328],[330,326],[505,350],[650,385],[835,405]],
    [[178,505],[340,474],[510,435],[650,385],[780,310]],
    [[290,122],[305,230],[330,326],[345,474],[365,590]],
    [[500,154],[512,265],[505,350],[510,435],[525,620]],
    [[705,192],[682,286],[650,385],[690,480],[758,568]]
  ];
  streets.forEach(r=>line(r,'rgba(32,38,36,.085)',Math.max(.55,.8*s)));
  ctx.fillStyle='rgba(32,38,36,.038)';
  for(let x=220;x<800;x+=56){
    for(let y=150;y<575;y+=48){
      const jitter=((x+y)/8)%13;
      const p=worldToScreen(x+(y%96?8:-4)+jitter*.18,y);
      const w=Math.max(3.5,21*s),h=Math.max(2.5,11*s);
      ctx.fillRect(p.x-w/2,p.y-h/2,w,h);
    }
  }
  ctx.restore();
}
function drawTerrain() {
  ctx.fillStyle=COLORS.paper;ctx.fillRect(0,0,view.width,view.height);
  if(!state.layers.terrain)return;
  path(scenario.terrain.marmara,COLORS.sea);
  path(scenario.terrain.bosporus,COLORS.seaDeep);
  path(scenario.terrain.goldenHorn,COLORS.sea);
  path(scenario.terrain.land,'#d8cfb6','rgba(32,38,36,.55)',1.2);
  path(scenario.terrain.galata,'#cbc09f','rgba(32,38,36,.5)',1.2);
  drawUrbanDetail();
  ctx.save();ctx.globalAlpha=.075;ctx.strokeStyle=COLORS.ink;ctx.lineWidth=.75;
  for(let y=82;y<650;y+=34){
    const a=worldToScreen(90,y),b=worldToScreen(885,y+14*Math.sin(y*.032));
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.restore();
  const chainA=worldToScreen(846,203),chainB=worldToScreen(862,224);
  ctx.strokeStyle='#4e4638';ctx.lineWidth=Math.max(1.4,2.2*scale());ctx.setLineDash([4,4]);
  ctx.beginPath();ctx.moveTo(chainA.x,chainA.y);ctx.lineTo(chainB.x,chainB.y);ctx.stroke();ctx.setLineDash([]);
}
function drawWallTowers(points) {
  const s=scale();
  for(let i=0;i<points.length-1;i++){
    const [x1,y1]=points[i],[x2,y2]=points[i+1],d=Math.hypot(x2-x1,y2-y1);
    const count=Math.max(1,Math.floor(d/48));
    for(let j=0;j<=count;j++){
      const t=j/count,p=worldToScreen(x1+(x2-x1)*t,y1+(y2-y1)*t),r=Math.max(1.8,3.3*s);
      ctx.fillStyle='#c5b999';ctx.strokeStyle='#625b4f';ctx.lineWidth=1;
      ctx.fillRect(p.x-r,p.y-r,r*2,r*2);ctx.strokeRect(p.x-r,p.y-r,r*2,r*2);
    }
  }
}
function drawBreach() {
  if(state.time<318)return;
  const p=worldToScreen(123,334),s=scale(),progress=clamp((state.time-318)/35,0,1);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(.035);
  ctx.fillStyle='#d8cfb6';ctx.fillRect(-Math.max(4,7*s),-Math.max(11,25*s),Math.max(8,14*s),Math.max(22,50*s));
  const rubble=[[-17,-17,4],[-10,-9,3],[-15,6,4],[-8,18,5],[10,-16,4],[15,-5,4],[11,10,3],[17,20,4]];
  rubble.forEach(([x,y,r],i)=>{
    ctx.globalAlpha=.45+.5*progress;ctx.fillStyle=i%3===0?'#6a6253':'#a59677';
    ctx.beginPath();ctx.arc(x*s*.72,y*s*.72,Math.max(1.3,r*s*.42),0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}
function drawWalls() {
  if(!state.layers.walls)return;
  for(const wall of scenario.walls){
    const s=scale(),outer=wall.kind==='major'?'#675e4f':'#7e7460';
    if(wall.kind==='major'&&state.time>=318){
      const upper=[[116,126],[123,212],[119,302],[121,316]];
      const lower=[[124,352],[126,392],[116,470],[151,548],[222,608]];
      for(const segment of [upper,lower]){
        line(segment,'rgba(32,38,36,.28)',wall.width*s+3);
        line(segment,outer,wall.width*s);
        line(segment,'#b5a887',Math.max(1,2.2*s),[4*s,5*s]);
      }
      drawWallTowers(upper);drawWallTowers(lower);
    }else{
      line(wall.points,'rgba(32,38,36,.28)',wall.width*s+3);
      line(wall.points,outer,wall.width*s);
      if(wall.kind==='major'){line(wall.points,'#b5a887',Math.max(1,2.2*s),[4*s,5*s]);drawWallTowers(wall.points);}
    }
  }
  drawBreach();
}
function drawPlaces() {
  if(!state.layers.labels)return;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='top';
  for(const place of scenario.places){
    const p=worldToScreen(place.x,place.y),r=place.landmark?5:3;
    ctx.fillStyle=place.landmark?COLORS.byz:COLORS.ink;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    ctx.font=place.landmark?'700 11px Georgia':'600 9px Georgia';
    const label=place.label;
    const m=ctx.measureText(label),pad=3;
    ctx.fillStyle='rgba(232,223,201,.72)';ctx.fillRect(p.x-m.width/2-pad,p.y+5,m.width+pad*2,13);
    ctx.fillStyle='rgba(32,38,36,.9)';ctx.fillText(label,p.x,p.y+7);
  }
  ctx.restore();
}
function drawUnit(unit) {
  const pos=interpolateTrack(unit.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),s=scale(),strength=clamp(pos.strength??1,.05,1);
  const size=Math.max(7,unit.size*s*.82),color=unit.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  const prev=interpolateTrack(unit.track,Math.max(0,state.time-5));
  const angle=prev?Math.atan2(pos.y-prev.y,pos.x-prev.x):0;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.globalAlpha=.42+.58*strength;
  if(unit.shape==='dots'){
    for(let i=0;i<12;i++){
      const col=i%4,row=Math.floor(i/4),jx=((i*7)%5-2)*.08;
      ctx.fillStyle=i%3===0?'#a76051':color;
      ctx.beginPath();ctx.arc((col-1.5+jx)*size*.31,(row-1)*size*.3,Math.max(1.35,size*.1),0,Math.PI*2);ctx.fill();
    }
  }else if(unit.shape==='line'){
    ctx.fillStyle='rgba(239,231,209,.72)';ctx.fillRect(-size,-size*.32,size*2,size*.64);
    ctx.fillStyle=color;ctx.fillRect(-size*.92,-size*.22,size*1.84,size*.44);
    ctx.strokeStyle='rgba(32,38,36,.65)';ctx.lineWidth=1;ctx.strokeRect(-size,-size*.32,size*2,size*.64);
    for(let i=-.6;i<=.6;i+=.4){ctx.beginPath();ctx.moveTo(i*size,-size*.22);ctx.lineTo(i*size,size*.22);ctx.stroke();}
  }else{
    ctx.fillStyle='rgba(239,231,209,.8)';ctx.fillRect(-size*.82,-size*.52,size*1.64,size*1.04);
    ctx.fillStyle=color;ctx.fillRect(-size*.68,-size*.38,size*1.14,size*.76);
    ctx.strokeStyle=unit.elite?'#f0e7d1':'rgba(32,38,36,.72)';ctx.lineWidth=unit.elite?2:1.1;ctx.strokeRect(-size*.82,-size*.52,size*1.64,size*1.04);
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(size*.45,-size*.38);ctx.lineTo(size*.8,0);ctx.lineTo(size*.45,size*.38);ctx.closePath();ctx.fill();
  }
  ctx.restore();
  if(state.camera.zoom>1.2){
    ctx.save();ctx.font='700 9px system-ui';ctx.textAlign='center';
    const m=ctx.measureText(unit.label),pad=4;
    ctx.fillStyle='rgba(232,223,201,.86)';ctx.fillRect(p.x-m.width/2-pad,p.y+size*.72,m.width+pad*2,14);
    ctx.fillStyle=COLORS.ink;ctx.fillText(unit.label,p.x,p.y+size*.72+10);ctx.restore();
  }
}
function drawCommander(command) {
  const pos=interpolateTrack(command.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),color=command.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#efe7d1';ctx.strokeStyle=color;ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(0,-4);ctx.lineTo(4,0);ctx.lineTo(0,4);ctx.closePath();ctx.fill();
  if(state.camera.zoom>1.28){
    ctx.font='800 9px system-ui';ctx.textAlign='left';const m=ctx.measureText(command.short);
    ctx.fillStyle='rgba(232,223,201,.88)';ctx.fillRect(11,-7,m.width+7,14);ctx.fillStyle=COLORS.ink;ctx.fillText(command.short,14,4);
  }
  ctx.restore();
}
function drawArrow(points,color,width=3,alpha=.55) {
  if(points.length<2)return;
  ctx.save();ctx.globalAlpha=alpha;
  line(points,color,Math.max(1.4,width*scale()));
  const a=worldToScreen(points[points.length-2][0],points[points.length-2][1]);
  const b=worldToScreen(points[points.length-1][0],points[points.length-1][1]);
  const ang=Math.atan2(b.y-a.y,b.x-a.x),r=Math.max(5,9*scale());
  ctx.translate(b.x,b.y);ctx.rotate(ang);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(-r*.7,-r*.55);ctx.lineTo(-r*.4,0);ctx.lineTo(-r*.7,r*.55);ctx.closePath();ctx.fill();ctx.restore();
}
function drawImpact(x,y,phase,intensity=1) {
  const p=worldToScreen(x,y),r=(8+phase*24)*intensity;
  ctx.save();ctx.strokeStyle=`rgba(138,73,61,${.56*(1-phase)})`;ctx.lineWidth=1.6;
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=`rgba(103,94,79,${.18*(1-phase)})`;ctx.beginPath();ctx.arc(p.x,p.y,r*.65,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawBombardment(ts) {
  if(state.time<8||state.time>52)return;
  const targets=[[123,318],[121,342],[120,365]],sources=[[48,278],[42,332],[50,390]];
  for(let i=0;i<3;i++){
    const a=worldToScreen(...sources[i]),b=worldToScreen(...targets[i]);
    const lift=34+10*i,phase=((ts*.00042)+i*.31)%1;
    ctx.save();ctx.strokeStyle='rgba(138,73,61,.32)';ctx.lineWidth=1.15;ctx.setLineDash([4,5]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,Math.min(a.y,b.y)-lift,b.x,b.y);ctx.stroke();ctx.restore();
    if(phase>.72)drawImpact(targets[i][0],targets[i][1],(phase-.72)/.28,.9);
  }
}
function drawWaveScenes() {
  if(state.time>=38&&state.time<150){
    drawArrow([[62,360],[88,355],[111,348]],COLORS.ottoman,3,.42);
    drawArrow([[54,385],[82,375],[111,360]],COLORS.ottoman,2.4,.3);
  }
  if(state.time>=120&&state.time<250){
    drawArrow([[60,468],[86,445],[116,414]],COLORS.ottoman,3.5,.42);
    drawArrow([[54,430],[85,422],[117,405]],COLORS.ottoman,2.2,.26);
  }
  if(state.time>=205&&state.time<365){
    drawArrow([[62,300],[93,313],[128,327]],COLORS.ottoman,4.2,.6);
    drawArrow([[70,278],[102,294],[128,318]],COLORS.ottoman,2.6,.34);
  }
}
function drawGiustinianiScene(ts) {
  if(state.time<286||state.time>330)return;
  const p=worldToScreen(158,320),pulse=((ts%1100)/1100);
  ctx.save();ctx.strokeStyle=`rgba(39,75,89,${.7*(1-pulse)})`;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(p.x,p.y,10+pulse*24,0,Math.PI*2);ctx.stroke();ctx.restore();
  drawArrow([[158,320],[184,304],[218,291]],COLORS.byz,2.2,.38);
}
function drawBreachScene(ts) {
  if(state.time<312)return;
  const pulse=((ts%1300)/1300);drawImpact(124,334,pulse,1.15);
  if(state.time>=322){
    drawArrow([[108,326],[135,334],[170,340],[208,346]],COLORS.ottoman,4.4,.62);
    drawArrow([[111,346],[143,350],[188,361]],COLORS.ottoman,3,.38);
  }
}
function drawLastStandScene(ts) {
  if(state.time<344||state.time>385)return;
  const p=worldToScreen(180,344),phase=((ts%1400)/1400);
  ctx.save();ctx.strokeStyle=`rgba(39,75,89,${.52*(1-phase)})`;ctx.lineWidth=2;ctx.setLineDash([3,4]);
  ctx.beginPath();ctx.arc(p.x,p.y,14+phase*20,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function drawCityIngress() {
  if(state.time<376)return;
  drawArrow([[172,340],[265,352],[360,360],[485,370]],COLORS.ottoman,4,.48);
  drawArrow([[182,352],[280,395],[410,420]],COLORS.ottoman,2.8,.3);
  drawArrow([[176,328],[290,300],[430,285]],COLORS.ottoman,2.6,.26);
}
function drawEventScene(ts) {
  if(!state.layers.events)return;
  drawBombardment(ts);drawWaveScenes();drawGiustinianiScene(ts);drawBreachScene(ts);drawLastStandScene(ts);drawCityIngress();
  const e=activeEvent(scenario.events,state.time,9);if(!e)return;
  const p=worldToScreen(e.focus.x,e.focus.y),pulse=(ts%1200)/1200;
  ctx.save();ctx.strokeStyle=`rgba(138,73,61,${.28*(1-pulse)})`;ctx.lineWidth=1.4;ctx.setLineDash([2,5]);
  ctx.beginPath();ctx.arc(p.x,p.y,14+pulse*26,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function render(ts) {
  if(ui.viewer.hidden)return;
  drawTerrain();drawWalls();drawPlaces();
  if(state.layers.units)scenario.units.forEach(drawUnit);
  if(state.layers.commanders)scenario.commanders.forEach(drawCommander);
  drawEventScene(ts||performance.now());
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
window.__AI_TEST_STATE__={app:'chronoscope',loadingState:'ready',scenario:scenario.id,visualVersion:'1.2.0-atlas'};
