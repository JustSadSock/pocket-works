import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { activeEvent, cameraCueAt, clamp, formatClock, interpolateTrack, smartPlaybackMultiplier } from './engine.js';
import { constantinople as scenario } from './scenario-constantinople.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const ui = {
  library:$('library'),viewer:$('viewer'),open:$('open-scenario'),back:$('back-library'),
  canvas:$('map'),clock:$('clock'),title:$('scenario-title'),play:$('play'),speed:$('speed'),
  phase:$('phase'),time:$('time-readout'),scrub:$('scrub'),progress:$('scrub-progress'),
  thumb:$('scrub-thumb'),ticks:$('scrub-events'),auto:$('auto-camera'),focus:$('focus-event'),
  zoomIn:$('zoom-in'),zoomOut:$('zoom-out'),layerBtn:$('layers-button'),sheet:$('layers-sheet'),
  sheetClose:$('layers-close'),layerList:$('layer-list'),eventCard:$('event-card'),
  eventTime:$('event-time'),eventTitle:$('event-title'),eventBody:$('event-body'),
  eventConfidence:$('event-confidence'),eventClose:$('event-close'),toast:$('toast')
};

const ctx=ui.canvas.getContext('2d',{alpha:false});
const STORE='pocket-works:chronoscope:state:v1';
const COLORS={
  bg:'#0b0e0e',sea:'#0d1718',sea2:'#111e20',land:'#292e2c',land2:'#313734',
  street:'rgba(224,216,196,.10)',wall:'#d8d0bc',wallDim:'#77776f',
  ottoman:'#a44d3f',ottomanHi:'#d06a55',byz:'#567f93',byzHi:'#86a9b9',
  label:'#b9b7ae',muted:'#68706c',white:'#ece5d2'
};
const state={
  time:0,playing:false,autoCamera:true,speedMode:'auto',manualSpeed:1,
  camera:{x:420,y:350,zoom:.92},target:{x:420,y:350,zoom:.92},
  layers:{terrain:true,walls:true,units:true,commanders:true,labels:true,events:true},
  pointers:new Map(),pan:null,pinch:null,dismissedEvent:null,lastEvent:null,lastFrame:performance.now()
};
let view={width:1,height:1,dpr:1};
let toastTimer=0;

function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORE)||'null');
    if(!saved)return;
    if(Number.isFinite(saved.time))state.time=clamp(saved.time,0,scenario.duration);
    if(typeof saved.autoCamera==='boolean')state.autoCamera=saved.autoCamera;
    if(saved.layers)Object.assign(state.layers,saved.layers);
  }catch{}
}
function persist(){
  try{localStorage.setItem(STORE,JSON.stringify({time:state.time,autoCamera:state.autoCamera,layers:state.layers}));}catch{}
}
function resize(){
  const r=ui.canvas.getBoundingClientRect();
  view.width=Math.max(1,r.width);view.height=Math.max(1,r.height);view.dpr=Math.min(window.devicePixelRatio||1,2);
  ui.canvas.width=Math.round(view.width*view.dpr);ui.canvas.height=Math.round(view.height*view.dpr);
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);
}
function scale(){return Math.min(view.width/scenario.bounds.width,view.height/scenario.bounds.height)*state.camera.zoom;}
function worldToScreen(x,y){
  const s=scale();return{x:view.width/2+(x-state.camera.x)*s,y:view.height/2+(y-state.camera.y)*s};
}
function screenToWorld(x,y){
  const r=ui.canvas.getBoundingClientRect(),s=scale();
  return{x:state.camera.x+(x-r.left-view.width/2)/s,y:state.camera.y+(y-r.top-view.height/2)/s};
}
function beginPolygon(points){
  if(!points?.length)return false;
  const a=worldToScreen(points[0][0],points[0][1]);ctx.beginPath();ctx.moveTo(a.x,a.y);
  for(let i=1;i<points.length;i++){const p=worldToScreen(points[i][0],points[i][1]);ctx.lineTo(p.x,p.y);}
  ctx.closePath();return true;
}
function polygon(points,fill,stroke,width=1){
  if(!beginPolygon(points))return;
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function line(points,stroke,width=2,dash=[]){
  if(!points?.length)return;
  const a=worldToScreen(points[0][0],points[0][1]);ctx.beginPath();ctx.moveTo(a.x,a.y);
  for(let i=1;i<points.length;i++){const p=worldToScreen(points[i][0],points[i][1]);ctx.lineTo(p.x,p.y);}
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
}
function drawBackgroundGrid(){
  ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,view.width,view.height);
  ctx.save();ctx.strokeStyle='rgba(236,229,210,.035)';ctx.lineWidth=1;
  const step=42;
  for(let x=(view.width%step)/2;x<view.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,view.height);ctx.stroke();}
  for(let y=(view.height%step)/2;y<view.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(view.width,y);ctx.stroke();}
  ctx.restore();
}
function drawWater(ts){
  polygon(scenario.terrain.marmara,COLORS.sea);
  polygon(scenario.terrain.bosporus,COLORS.sea2);
  polygon(scenario.terrain.goldenHorn,COLORS.sea);
  const t=(ts||0)*.00018;
  ctx.save();ctx.strokeStyle='rgba(134,169,185,.12)';ctx.lineWidth=1;
  for(let i=0;i<12;i++){
    const y=170+i*35;
    const x=540+Math.sin(i*1.7+t)*18;
    const a=worldToScreen(x,y),b=worldToScreen(x+260,y+20*Math.sin(i+t));
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,a.y-8,b.x,b.y);ctx.stroke();
  }
  ctx.restore();
}
function drawUrbanTexture(){
  if(!beginPolygon(scenario.terrain.land))return;
  ctx.save();ctx.clip();
  const s=scale();
  ctx.strokeStyle=COLORS.street;ctx.lineWidth=Math.max(.6,.8*s);
  const roads=[
    [[165,160],[310,230],[470,300],[650,385],[795,470]],
    [[170,330],[330,330],[500,350],[650,385],[830,400]],
    [[180,500],[340,470],[510,430],[650,385],[765,300]],
    [[275,120],[300,230],[330,330],[340,470],[350,590]],
    [[500,155],[510,265],[500,350],[510,430],[520,620]],
    [[700,190],[680,285],[650,385],[690,480],[760,575]]
  ];
  roads.forEach(r=>line(r,COLORS.street,Math.max(.6,1*s)));
  ctx.fillStyle='rgba(224,216,196,.035)';
  for(let x=210;x<780;x+=54){
    for(let y=150;y<560;y+=46){
      const q=worldToScreen(x+((y/46)%2)*10,y),w=Math.max(4,24*s),h=Math.max(3,13*s);
      ctx.fillRect(q.x-w/2,q.y-h/2,w,h);
    }
  }
  ctx.restore();
}
function drawTerrain(ts){
  drawBackgroundGrid();
  if(!state.layers.terrain)return;
  drawWater(ts);
  polygon(scenario.terrain.land,COLORS.land,'rgba(216,208,188,.38)',1.1);
  polygon(scenario.terrain.galata,COLORS.land2,'rgba(216,208,188,.28)',1);
  drawUrbanTexture();
  const chainA=worldToScreen(846,203),chainB=worldToScreen(862,224);
  ctx.save();ctx.strokeStyle='rgba(216,208,188,.55)';ctx.lineWidth=1.4;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(chainA.x,chainA.y);ctx.lineTo(chainB.x,chainB.y);ctx.stroke();ctx.restore();
}
function drawWallStroke(points,width,s){
  line(points,'rgba(0,0,0,.55)',Math.max(4,width*s+5));
  line(points,COLORS.wall,Math.max(2.5,width*s));
  line(points,'#232826',Math.max(1,width*s*.42),[Math.max(3,8*s),Math.max(2,5*s)]);
}
function drawBreach(){
  if(state.time<322)return;
  const p=worldToScreen(123,334),s=scale(),progress=clamp((state.time-322)/30,0,1);
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='rgba(11,14,14,.92)';
  ctx.fillRect(-Math.max(4,8*s),-Math.max(12,26*s),Math.max(8,16*s),Math.max(24,52*s));
  const rubble=[
    [-17,-19,5],[-10,-8,4],[-15,8,4],[-8,20,5],[10,-18,4],[15,-5,5],[11,12,4],[17,21,3]
  ];
  rubble.forEach(([x,y,r],i)=>{
    ctx.globalAlpha=.42+.45*progress;
    ctx.fillStyle=i%3===0?'#d8d0bc':'#77776f';
    ctx.fillRect(x*s*.7-r*.45,y*s*.7-r*.35,Math.max(2,r*s*.65),Math.max(2,r*s*.45));
  });
  ctx.strokeStyle=`rgba(208,106,85,${.25+.55*progress})`;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-21*s,-18*s);ctx.lineTo(19*s,19*s);ctx.stroke();
  ctx.restore();
}
function drawWalls(){
  if(!state.layers.walls)return;
  const s=scale();
  for(const wall of scenario.walls){
    if(wall.kind==='major'){
      if(state.time>=322){
        const upper=[[116,126],[123,212],[119,302],[121,314]];
        const lower=[[124,352],[126,392],[116,470],[151,548],[222,608]];
        drawWallStroke(upper,wall.width,s);
        drawWallStroke(lower,wall.width,s);
      }else{
        drawWallStroke(wall.points,wall.width,s);
      }
    }else{
      line(wall.points,'rgba(216,208,188,.6)',Math.max(1.1,wall.width*s));
    }
  }
  drawBreach();
}
function drawPlaces(){
  if(!state.layers.labels)return;
  ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';
  for(const place of scenario.places){
    const p=worldToScreen(place.x,place.y);
    const landmark=!!place.landmark;
    ctx.fillStyle=landmark?COLORS.white:'#858b87';
    ctx.beginPath();ctx.arc(p.x,p.y,landmark?3.5:2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=landmark?'#dfd9c8':COLORS.label;
    ctx.font=landmark?'800 10px "Arial Narrow",system-ui':'700 8px "Arial Narrow",system-ui';
    ctx.letterSpacing='0.08em';
    ctx.fillText(place.label.toUpperCase(),p.x+7,p.y);
  }
  ctx.restore();
}
function sampleTrail(unit){
  const pts=[];
  for(let i=0;i<unit.track.length;i++){
    const k=unit.track[i];
    if(k.t<=state.time)pts.push([k.x,k.y]);
    else{
      if(i>0){
        const p=interpolateTrack(unit.track,state.time);if(p)pts.push([p.x,p.y]);
      }
      break;
    }
  }
  if(pts.length===1){
    const p=interpolateTrack(unit.track,state.time);if(p)pts.push([p.x,p.y]);
  }
  return pts;
}
function unitAngle(unit,pos){
  const prev=interpolateTrack(unit.track,Math.max(0,state.time-5));
  if(!prev)return 0;
  return Math.atan2(pos.y-prev.y,pos.x-prev.x);
}
function drawArrowGlyph(size,color){
  ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(size*.9,0);ctx.lineTo(size*.35,-size*.56);ctx.lineTo(size*.35,-size*.2);
  ctx.lineTo(-size*.85,-size*.2);ctx.lineTo(-size*.85,size*.2);ctx.lineTo(size*.35,size*.2);
  ctx.lineTo(size*.35,size*.56);ctx.closePath();ctx.fill();
}
function drawUnit(unit){
  const pos=interpolateTrack(unit.track,state.time);if(!pos)return;
  const trail=sampleTrail(unit),color=unit.side==='ottoman'?COLORS.ottoman:COLORS.byz,hi=unit.side==='ottoman'?COLORS.ottomanHi:COLORS.byzHi;
  if(trail.length>1){
    ctx.save();ctx.globalAlpha=.28;line(trail,color,Math.max(1.5,3*scale()));ctx.restore();
  }
  const p=worldToScreen(pos.x,pos.y),strength=clamp(pos.strength??1,.05,1);
  const size=Math.max(8,unit.size*scale()*.8),angle=unitAngle(unit,pos);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.globalAlpha=.35+.65*strength;
  if(unit.shape==='dots'){
    for(let i=0;i<11;i++){
      const xx=((i%4)-1.5)*size*.28,yy=(Math.floor(i/4)-1)*size*.27;
      ctx.fillStyle=i%3===0?hi:color;ctx.beginPath();ctx.arc(xx,yy,Math.max(1.6,size*.095),0,Math.PI*2);ctx.fill();
    }
    drawArrowGlyph(size*.72,color);
  }else if(unit.shape==='line'){
    ctx.fillStyle=color;ctx.fillRect(-size*.95,-size*.22,size*1.7,size*.44);
    ctx.fillStyle=hi;ctx.fillRect(size*.55,-size*.22,size*.2,size*.44);
  }else{
    ctx.fillStyle='rgba(7,10,10,.8)';ctx.fillRect(-size*.84,-size*.46,size*1.68,size*.92);
    ctx.strokeStyle=hi;ctx.lineWidth=unit.elite?2.4:1.5;ctx.strokeRect(-size*.84,-size*.46,size*1.68,size*.92);
    ctx.fillStyle=color;ctx.fillRect(-size*.73,-size*.34,size*1.2,size*.68);
    ctx.fillStyle=hi;ctx.beginPath();ctx.moveTo(size*.47,-size*.34);ctx.lineTo(size*.78,0);ctx.lineTo(size*.47,size*.34);ctx.closePath();ctx.fill();
  }
  ctx.restore();
  if(state.camera.zoom>1.22){
    ctx.save();ctx.font='800 8px "Arial Narrow",system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
    const label=unit.label.toUpperCase(),metrics=ctx.measureText(label),pad=5;
    ctx.fillStyle='rgba(9,12,12,.78)';ctx.fillRect(p.x+size*.65,p.y-8,metrics.width+pad*2,16);
    ctx.fillStyle=hi;ctx.fillText(label,p.x+size*.65+pad,p.y);ctx.restore();
  }
}
function drawCommander(command){
  const pos=interpolateTrack(command.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),color=command.side==='ottoman'?COLORS.ottomanHi:COLORS.byzHi;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#0d1111';ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-3.5);ctx.lineTo(3.5,0);ctx.lineTo(0,3.5);ctx.lineTo(-3.5,0);ctx.closePath();ctx.fill();
  if(state.camera.zoom>1.2){
    ctx.font='900 8px "Arial Narrow",system-ui';ctx.textAlign='left';ctx.fillStyle='#d8d3c4';
    ctx.fillText(command.short.toUpperCase(),11,0);
  }
  ctx.restore();
}
function drawFrontPressure(ts){
  if(!state.layers.events)return;
  const e=activeEvent(scenario.events,state.time,18);if(!e)return;
  const p=worldToScreen(e.focus.x,e.focus.y),phase=((ts||0)%1400)/1400;
  const r=22+phase*36;
  ctx.save();
  ctx.strokeStyle=`rgba(208,106,85,${.42*(1-phase)})`;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(236,229,210,.42)';ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}
function drawVignette(){
  const g=ctx.createRadialGradient(view.width*.52,view.height*.44,view.width*.18,view.width*.52,view.height*.44,Math.max(view.width,view.height)*.76);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.42)');
  ctx.fillStyle=g;ctx.fillRect(0,0,view.width,view.height);
}
function render(ts=performance.now()){
  if(ui.viewer.hidden)return;
  drawTerrain(ts);drawWalls();
  if(state.layers.units)scenario.units.forEach(drawUnit);
  if(state.layers.commanders)scenario.commanders.forEach(drawCommander);
  drawPlaces();drawFrontPressure(ts);drawVignette();
}
function phaseAt(t){
  const p=scenario.phases.find(x=>t>=x.from&&t<x.to);
  return(p||scenario.phases[scenario.phases.length-1]).name;
}
function showEvent(e){
  if(!e){ui.eventCard.hidden=true;return;}
  ui.eventCard.hidden=false;
  ui.eventTime.textContent=formatClock(scenario.startMinutes,e.t)+' / EVENT '+String(scenario.events.indexOf(e)+1).padStart(2,'0');
  ui.eventTitle.textContent=e.title;
  ui.eventBody.textContent=e.body;
  ui.eventConfidence.textContent=e.confidence;
  if(e.id!==state.lastEvent){
    state.lastEvent=e.id;
    if(e.importance>=4)try{navigator.vibrate?.([12,32,12]);}catch{}
  }
}
function updateUi(){
  const pct=state.time/scenario.duration*100,clock=formatClock(scenario.startMinutes,state.time);
  ui.progress.style.width=pct+'%';ui.thumb.style.left=pct+'%';
  ui.scrub.setAttribute('aria-valuenow',String(Math.round(pct)));
  ui.clock.textContent='29 MAY / '+clock;ui.time.textContent=clock;ui.phase.textContent=phaseAt(state.time).toUpperCase();
  ui.auto.classList.toggle('active',state.autoCamera);ui.auto.setAttribute('aria-pressed',String(state.autoCamera));
  ui.speed.textContent=state.speedMode==='auto'?'AUTO':'×'+state.manualSpeed;
  const e=activeEvent(scenario.events,state.time,7);
  if(e&&e.id!==state.dismissedEvent)showEvent(e);else if(!e){ui.eventCard.hidden=true;state.dismissedEvent=null;}
}
function cameraForTime(immediate){
  const cue=cameraCueAt(scenario.camera,state.time);if(!cue)return;
  state.target={x:cue.x,y:cue.y,zoom:cue.zoom};if(immediate)Object.assign(state.camera,state.target);
}
function manualCamera(){
  if(state.autoCamera){state.autoCamera=false;updateUi();toast('DIRECTOR OFF');persist();}
}
function focusNearest(){
  const e=activeEvent(scenario.events,state.time,40)||scenario.events.reduce((best,x)=>Math.abs(x.t-state.time)<Math.abs(best.t-state.time)?x:best,scenario.events[0]);
  state.autoCamera=true;state.target={x:e.focus.x,y:e.focus.y,zoom:e.focus.zoom};state.dismissedEvent=null;showEvent(e);updateUi();toast('FOCUS / '+e.title.toUpperCase());
}
function toast(text){
  clearTimeout(toastTimer);ui.toast.textContent=text;ui.toast.hidden=false;toastTimer=setTimeout(()=>ui.toast.hidden=true,1200);
}
function setViewer(open){
  ui.library.hidden=open;ui.viewer.hidden=!open;state.playing=false;ui.play.classList.remove('playing');
  if(open)requestAnimationFrame(()=>{resize();cameraForTime(true);render();updateUi();});
  persist();
}
function scrubTo(clientX){
  const r=ui.scrub.getBoundingClientRect();
  state.time=clamp((clientX-r.left)/r.width,0,1)*scenario.duration;
  state.playing=false;ui.play.classList.remove('playing');state.dismissedEvent=null;
  if(state.autoCamera)cameraForTime(true);updateUi();render();persist();
}
function buildTicks(){
  ui.ticks.innerHTML='';
  scenario.events.forEach((e,index)=>{
    const b=document.createElement('button');b.type='button';b.className='event-tick '+(e.importance>=4?'major':'');
    b.style.left=(e.t/scenario.duration*100)+'%';b.setAttribute('aria-label',e.title);b.title=String(index+1).padStart(2,'0')+' '+e.title;
    b.addEventListener('click',ev=>{
      ev.stopPropagation();state.time=e.t;state.dismissedEvent=null;
      if(state.autoCamera){state.target={x:e.focus.x,y:e.focus.y,zoom:e.focus.zoom};Object.assign(state.camera,state.target);}
      showEvent(e);updateUi();render();persist();
    });
    ui.ticks.appendChild(b);
  });
}
function buildLayers(){
  const info={
    terrain:['ГЕОГРАФИЯ','берега, вода и город'],
    walls:['УКРЕПЛЕНИЯ','стены и оборонительные линии'],
    units:['ВОЙСКА','формирования, направления, следы'],
    commanders:['КОМАНДИРЫ','ключевые личности'],
    labels:['ПОДПИСИ','места и ориентиры'],
    events:['СОБЫТИЯ','точки давления и фокус']
  };
  ui.layerList.innerHTML='';
  Object.entries(info).forEach(([key,val])=>{
    const row=document.createElement('div');row.className='layer-row';
    const copy=document.createElement('div');copy.innerHTML='<strong>'+val[0]+'</strong><br><span>'+val[1]+'</span>';
    const b=document.createElement('button');b.type='button';b.className='layer-toggle '+(state.layers[key]?'on':'');b.setAttribute('aria-label',val[0]);
    b.addEventListener('click',()=>{state.layers[key]=!state.layers[key];b.classList.toggle('on',state.layers[key]);render();persist();});
    row.append(copy,b);ui.layerList.appendChild(row);
  });
}
function cycleSpeed(){
  const modes=['auto',.5,1,2,4],current=state.speedMode==='auto'?'auto':state.manualSpeed;
  let i=modes.findIndex(x=>x===current);i=(i+1)%modes.length;const n=modes[i];
  if(n==='auto')state.speedMode='auto';else{state.speedMode='manual';state.manualSpeed=n;}updateUi();
}
function bindMap(){
  ui.canvas.addEventListener('pointerdown',e=>{
    ui.canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.pointers.size===1)state.pan={id:e.pointerId,x:e.clientX,y:e.clientY,cx:state.camera.x,cy:state.camera.y};
    if(state.pointers.size===2){const p=[...state.pointers.values()];state.pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:state.camera.zoom};}
    manualCamera();
  });
  ui.canvas.addEventListener('pointermove',e=>{
    if(!state.pointers.has(e.pointerId))return;state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(state.pointers.size===2&&state.pinch){
      const p=[...state.pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      state.camera.zoom=clamp(state.pinch.zoom*d/state.pinch.distance,.65,3.4);
    }else if(state.pan&&state.pan.id===e.pointerId){
      const s=scale();state.camera.x=state.pan.cx-(e.clientX-state.pan.x)/s;state.camera.y=state.pan.cy-(e.clientY-state.pan.y)/s;
    }
    render();
  });
  const end=e=>{state.pointers.delete(e.pointerId);if(state.pan?.id===e.pointerId)state.pan=null;if(state.pointers.size<2)state.pinch=null;persist();};
  ui.canvas.addEventListener('pointerup',end);ui.canvas.addEventListener('pointercancel',end);
  ui.canvas.addEventListener('wheel',e=>{
    e.preventDefault();manualCamera();const before=screenToWorld(e.clientX,e.clientY);
    state.camera.zoom=clamp(state.camera.zoom*Math.exp(-e.deltaY*.0014),.65,3.4);
    const after=screenToWorld(e.clientX,e.clientY);state.camera.x+=before.x-after.x;state.camera.y+=before.y-after.y;render();
  },{passive:false});
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
    const k=1-Math.pow(.0015,dt);
    state.camera.x+=(state.target.x-state.camera.x)*k;state.camera.y+=(state.target.y-state.camera.y)*k;state.camera.zoom+=(state.target.zoom-state.camera.zoom)*k;
  }
  render(ts);requestAnimationFrame(tick);
}

restore();buildTicks();buildLayers();updateUi();bindMap();
ui.open.addEventListener('click',()=>setViewer(true));ui.back.addEventListener('click',()=>setViewer(false));
ui.play.addEventListener('click',()=>{if(state.time>=scenario.duration)state.time=0;state.playing=!state.playing;ui.play.classList.toggle('playing',state.playing);try{navigator.vibrate?.(10);}catch{}});
ui.speed.addEventListener('click',cycleSpeed);
ui.auto.addEventListener('click',()=>{state.autoCamera=!state.autoCamera;if(state.autoCamera)cameraForTime(false);updateUi();persist();toast(state.autoCamera?'DIRECTOR ON':'DIRECTOR OFF');});
ui.focus.addEventListener('click',focusNearest);
ui.zoomIn.addEventListener('click',()=>{manualCamera();state.camera.zoom=clamp(state.camera.zoom*1.22,.65,3.4);render();});
ui.zoomOut.addEventListener('click',()=>{manualCamera();state.camera.zoom=clamp(state.camera.zoom/1.22,.65,3.4);render();});
ui.layerBtn.addEventListener('click',()=>ui.sheet.hidden=!ui.sheet.hidden);ui.sheetClose.addEventListener('click',()=>ui.sheet.hidden=true);
ui.eventClose.addEventListener('click',()=>{const e=activeEvent(scenario.events,state.time,7);state.dismissedEvent=e?.id||null;ui.eventCard.hidden=true;});
ui.scrub.addEventListener('pointerdown',e=>{ui.scrub.setPointerCapture(e.pointerId);scrubTo(e.clientX);});
ui.scrub.addEventListener('pointermove',e=>{if(ui.scrub.hasPointerCapture(e.pointerId))scrubTo(e.clientX);});
ui.scrub.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  if(e.key==='Home')state.time=0;else if(e.key==='End')state.time=scenario.duration;else state.time=clamp(state.time+(e.key==='ArrowRight'?5:-5),0,scenario.duration);
  if(state.autoCamera)cameraForTime(true);updateUi();render();persist();
});
new ResizeObserver(resize).observe(ui.canvas);
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.playing=false;ui.play.classList.remove('playing');persist();}state.lastFrame=performance.now();});
window.addEventListener('pagehide',persist);
resize();cameraForTime(true);requestAnimationFrame(tick);
window.__AI_TEST_STATE__={app:'chronoscope',loadingState:'ready',scenario:scenario.id,visualVersion:'1.1.0'};