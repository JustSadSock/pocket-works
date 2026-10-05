import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { activeEvent, cameraCueAt, clamp, formatClock, interpolateTrack, smartPlaybackMultiplier } from './engine.js';
import { constantinople as scenario } from './scenario-constantinople.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const ui = {
  library:$('library'), viewer:$('viewer'), open:$('open-scenario'), back:$('back-library'),
  canvas:$('map'), preview:$('event-preview'), clock:$('clock'), title:$('scenario-title'),
  play:$('play'), speed:$('speed'), prev:$('prev-event'), next:$('next-event'), overview:$('overview'),
  phase:$('phase'), time:$('time-readout'), scrub:$('scrub'), progress:$('scrub-progress'),
  thumb:$('scrub-thumb'), ticks:$('scrub-events'), timelineEvents:$('timeline-events'),
  auto:$('auto-camera'), focus:$('focus-event'), zoomIn:$('zoom-in'), zoomOut:$('zoom-out'),
  layerBtn:$('layers-button'), layersTab:$('layers-tab'), eventsTab:$('events-tab'), commandersTab:$('commanders-tab'),
  sheet:$('layers-sheet'), sheetClose:$('layers-close'), layerList:$('layer-list'), eventCard:$('event-card'),
  eventTime:$('event-time'), eventTitle:$('event-title'), eventBody:$('event-body'),
  eventConfidence:$('event-confidence'), eventClose:$('event-close'), toast:$('toast')
};
const ctx = ui.canvas.getContext('2d', { alpha: false });
const STORE = 'pocket-works:chronoscope:state:v2';
const COLORS = { ink:'#2c2c27', paper:'#ded4b9', paperHi:'#f1e8d2', land:'#d8cfb2', landAlt:'#cec3a2', sea:'#3f7892', seaDeep:'#326b85', ottoman:'#a93b32', ottomanHi:'#cb5547', byz:'#2d6f94', byzHi:'#4e91b2', wall:'#766c59' };
const state = {
  time: 130, playing: false, autoCamera: true, speedMode: 'auto', manualSpeed: 1,
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
  return base*state.camera.zoom*(portrait?1.10:1);
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
function drawTree(x,y,size=1) {
  const p=worldToScreen(x,y),s=scale()*size;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='rgba(73,91,68,.78)';
  ctx.beginPath();ctx.arc(0,-3*s,4.5*s,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(94,91,68,.42)';ctx.fillRect(-.8*s,1*s,1.6*s,4*s);
  ctx.restore();
}
function drawMainlandDetail() {
  ctx.save();polygonClip(scenario.terrain.mainland);ctx.clip();
  const roads=[
    [[20,110],[120,160],[220,240],[300,330]],
    [[10,330],[110,340],[210,365],[300,390]],
    [[20,590],[120,550],[210,500],[300,455]],
    [[90,40],[130,170],[160,290],[150,460],[120,670]]
  ];
  roads.forEach(r=>line(r,'rgba(112,99,75,.28)',Math.max(1,2.4*scale())));
  for(let x=35;x<285;x+=54){
    for(let y=65;y<660;y+=58){
      if(((x*3+y*5)%11)<4)continue;
      drawTree(x+((y/58)%2)*13,y,1);
    }
  }
  ctx.restore();
}
function drawUrbanDetail() {
  ctx.save();polygonClip(scenario.terrain.city);ctx.clip();
  const s=scale();
  const streets=[
    [[330,220],[455,250],[575,305],[705,390],[820,450]],
    [[325,330],[445,335],[575,355],[710,390],[850,405]],
    [[330,460],[455,440],[585,420],[705,390],[845,340]],
    [[405,205],[420,300],[440,390],[455,505],[475,585]],
    [[565,210],[570,300],[575,390],[590,500],[610,590]],
    [[730,240],[700,315],[705,390],[725,475],[760,545]]
  ];
  streets.forEach(r=>line(r,'rgba(116,101,78,.24)',Math.max(.8,2.1*s)));
  ctx.fillStyle='rgba(170,145,105,.22)';
  for(let x=360;x<835;x+=46){
    for(let y=245;y<555;y+=40){
      const p=worldToScreen(x+((y/40)%2)*8,y);
      const w=Math.max(5,24*s),h=Math.max(4,14*s);
      ctx.fillRect(p.x-w/2,p.y-h/2,w,h);
    }
  }
  ctx.restore();
}
function drawWaterTexture() {
  ctx.save();ctx.strokeStyle='rgba(236,244,238,.12)';ctx.lineWidth=1;
  for(let y=90;y<690;y+=34){
    const a=worldToScreen(430,y),b=worldToScreen(990,y+8*Math.sin(y*.03));
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.restore();
}
function drawTerrain() {
  ctx.fillStyle=COLORS.sea;ctx.fillRect(0,0,view.width,view.height);
  if(!state.layers.terrain)return;
  drawWaterTexture();
  path(scenario.terrain.mainland,COLORS.land,'rgba(73,67,56,.44)',1.2);
  path(scenario.terrain.city,'#e2d8bd','rgba(73,67,56,.46)',1.2);
  path(scenario.terrain.galata,COLORS.landAlt,'rgba(73,67,56,.4)',1.1);
  drawMainlandDetail();drawUrbanDetail();
}
function drawWallTowers(points) {
  const s=scale();
  for(let i=0;i<points.length-1;i++){
    const [x1,y1]=points[i],[x2,y2]=points[i+1],d=Math.hypot(x2-x1,y2-y1);
    const count=Math.max(1,Math.floor(d/58));
    for(let j=0;j<=count;j++){
      const t=j/count,p=worldToScreen(x1+(x2-x1)*t,y1+(y2-y1)*t),r=Math.max(2.1,4*s);
      ctx.fillStyle='#b9ab8b';ctx.strokeStyle='#5c564b';ctx.lineWidth=1;
      ctx.fillRect(p.x-r,p.y-r,r*2,r*2);ctx.strokeRect(p.x-r,p.y-r,r*2,r*2);
      ctx.fillStyle='#6f6859';ctx.fillRect(p.x-r*.4,p.y-r,r*.8,r*.55);
    }
  }
}
function activeBreaches() {
  return (scenario.breaches||[]).filter(b=>state.time>=b.from);
}
function drawBreachEffect(breach) {
  const p=worldToScreen(breach.x,breach.y),s=scale(),progress=clamp((state.time-breach.from)/24,0,1);
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#dfd4b8';ctx.fillRect(-Math.max(6,9*s),-Math.max(18,30*s),Math.max(12,18*s),Math.max(36,60*s));
  const rubble=[[-18,-20,5],[-9,-12,4],[-16,1,5],[-6,15,5],[9,-18,5],[18,-7,4],[10,8,4],[17,19,5],[-1,24,4]];
  rubble.forEach(([x,y,r],i)=>{
    ctx.globalAlpha=.5+.5*progress;ctx.fillStyle=i%3===0?'#6f6553':'#9f8f70';
    ctx.beginPath();ctx.arc(x*s*.72,y*s*.72,Math.max(1.8,r*s*.5),0,Math.PI*2);ctx.fill();
  });
  const glow=ctx.createRadialGradient(0,0,0,0,0,Math.max(12,28*s));
  glow.addColorStop(0,'rgba(232,145,65,.72)');glow.addColorStop(.35,'rgba(193,78,48,.38)');glow.addColorStop(1,'rgba(160,70,45,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,Math.max(12,28*s),0,Math.PI*2);ctx.fill();
  ctx.restore();
  if(state.time>=breach.from){
    ctx.save();ctx.font='700 10px Georgia';ctx.textAlign='center';
    const label='ПРОРЫВ В СТЕНАХ',m=ctx.measureText(label),w=m.width+14,h=24;
    const x=p.x-18,y=p.y-48;
    ctx.fillStyle='rgba(117,43,37,.95)';ctx.strokeStyle='#f0dfc3';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,5);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff5df';ctx.fillText(label,x,y+3);ctx.restore();
  }
}
function drawWalls() {
  if(!state.layers.walls)return;
  const breaches=activeBreaches();
  for(const wall of scenario.walls){
    const s=scale(),outer=wall.kind==='major'?'#675e4f':'#7e7460';
    const breach=wall.kind==='major'?breaches.find(b=>!b.wall||b.wall===wall.id):null;
    if(breach?.upper&&breach?.lower){
      for(const segment of [breach.upper,breach.lower]){
        line(segment,'rgba(32,38,36,.28)',wall.width*s+3);
        line(segment,outer,wall.width*s);
        line(segment,'#b5a887',Math.max(1,2.2*s),[4*s,5*s]);
      }
      drawWallTowers(breach.upper);drawWallTowers(breach.lower);
    }else{
      line(wall.points,'rgba(32,38,36,.28)',wall.width*s+3);
      line(wall.points,outer,wall.width*s);
      if(wall.kind==='major'){line(wall.points,'#b5a887',Math.max(1,2.2*s),[4*s,5*s]);drawWallTowers(wall.points);}
    }
  }
  breaches.forEach(drawBreachEffect);
}
function drawPlaces() {
  if(!state.layers.labels)return;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for(const place of scenario.places){
    const p=worldToScreen(place.x,place.y),kind=place.kind||'small';
    if(kind==='city'){
      ctx.font='700 17px Georgia';ctx.fillStyle='rgba(52,47,38,.9)';ctx.fillText(place.label,p.x,p.y);continue;
    }
    if(kind==='water'){
      ctx.font='italic 13px Georgia';ctx.fillStyle='rgba(235,238,225,.72)';ctx.fillText(place.label,p.x,p.y);continue;
    }
    if(kind==='waterSmall'){
      ctx.font='700 11px Georgia';ctx.fillStyle='rgba(244,239,221,.88)';ctx.fillText(place.label,p.x,p.y);continue;
    }
    if(kind==='region'){
      ctx.font='700 13px Georgia';ctx.fillStyle=place.side==='ottoman'?'#5c312d':'#50493f';ctx.fillText(place.label,p.x,p.y);continue;
    }
    if(kind==='landmark'){
      ctx.fillStyle=COLORS.byz;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();
      ctx.font='700 11px Georgia';ctx.fillStyle='#403b33';ctx.fillText(place.label,p.x,p.y+14);continue;
    }
    ctx.font='600 9px Georgia';ctx.fillStyle='rgba(58,54,47,.78)';ctx.fillText(place.label,p.x,p.y);
  }
  ctx.restore();
}
function drawFormationBlocks(size,color,count=4) {
  const gap=size*.14,blockW=size*.32,blockH=size*.72,total=count*blockW+(count-1)*gap;
  for(let i=0;i<count;i++){
    const x=-total/2+i*(blockW+gap);
    ctx.fillStyle='rgba(248,237,215,.85)';ctx.fillRect(x-1,-blockH/2-1,blockW+2,blockH+2);
    ctx.fillStyle=color;ctx.fillRect(x,-blockH/2,blockW,blockH);
    ctx.strokeStyle='rgba(50,46,40,.7)';ctx.lineWidth=.8;ctx.strokeRect(x,-blockH/2,blockW,blockH);
  }
}
function drawUnit(unit) {
  const pos=interpolateTrack(unit.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),s=scale(),strength=clamp(pos.strength??1,.05,1);
  const size=Math.max(11,unit.size*s*1.05),color=unit.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  const prev=interpolateTrack(unit.track,Math.max(0,state.time-4));
  const angle=prev?Math.atan2(pos.y-prev.y,pos.x-prev.x):0;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.globalAlpha=.45+.55*strength;
  if(unit.shape==='line'){
    drawFormationBlocks(size,color,5);
  }else{
    drawFormationBlocks(size,color,unit.elite?5:4);
    if(unit.elite){ctx.strokeStyle='#f4dfaf';ctx.lineWidth=1.5;ctx.strokeRect(-size*.82,-size*.44,size*1.64,size*.88);}
  }
  ctx.restore();
  if(state.camera.zoom>2.25){
    ctx.save();ctx.font='700 8px system-ui';ctx.textAlign='center';
    const m=ctx.measureText(unit.label),pad=3;ctx.fillStyle='rgba(241,232,210,.88)';
    ctx.fillRect(p.x-m.width/2-pad,p.y+size*.52,m.width+pad*2,13);ctx.fillStyle=COLORS.ink;ctx.fillText(unit.label,p.x,p.y+size*.52+9);ctx.restore();
  }
}
function drawCommander(command) {
  if(!state.layers.commanders)return;
  const pos=interpolateTrack(command.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),color=command.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#f3e8cd';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;ctx.fillRect(7,-13,2,18);ctx.beginPath();ctx.moveTo(9,-13);ctx.lineTo(21,-9);ctx.lineTo(9,-4);ctx.closePath();ctx.fill();
  if(state.camera.zoom>1.3){ctx.font='800 8px system-ui';ctx.textAlign='left';ctx.fillStyle='#3e3931';ctx.fillText(command.short,12,10);}
  ctx.restore();
}
function drawShip(ship) {
  const pos=interpolateTrack(ship.track,state.time);if(!pos)return;
  const p=worldToScreen(pos.x,pos.y),s=Math.max(.8,scale()),color=ship.side==='ottoman'?COLORS.ottoman:COLORS.byz;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#6b5540';ctx.beginPath();ctx.moveTo(-10*s,-2*s);ctx.lineTo(10*s,-2*s);ctx.lineTo(6*s,4*s);ctx.lineTo(-7*s,4*s);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#3d352e';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#4d4035';ctx.fillRect(-1*s,-11*s,1.5*s,10*s);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(.5*s,-11*s);ctx.lineTo(8*s,-8*s);ctx.lineTo(.5*s,-5*s);ctx.closePath();ctx.fill();
  ctx.restore();
}
function drawArrow(points,color,width=3,alpha=.55) {
  if(points.length<2)return;
  const screen=points.map(([x,y])=>worldToScreen(x,y));
  ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,width*scale());ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(screen[0].x,screen[0].y);
  if(screen.length===2){ctx.lineTo(screen[1].x,screen[1].y);}
  else{
    for(let i=1;i<screen.length-1;i++){
      const mid={x:(screen[i].x+screen[i+1].x)/2,y:(screen[i].y+screen[i+1].y)/2};
      ctx.quadraticCurveTo(screen[i].x,screen[i].y,mid.x,mid.y);
    }
    const last=screen[screen.length-1];ctx.lineTo(last.x,last.y);
  }
  ctx.stroke();
  const a=screen[screen.length-2],b=screen[screen.length-1],ang=Math.atan2(b.y-a.y,b.x-a.x),r=Math.max(7,11*scale());
  ctx.translate(b.x,b.y);ctx.rotate(ang);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(-r*.75,-r*.58);ctx.lineTo(-r*.45,0);ctx.lineTo(-r*.75,r*.58);ctx.closePath();ctx.fill();ctx.restore();
}
function drawImpact(x,y,phase,intensity=1) {
  const p=worldToScreen(x,y),r=(8+phase*24)*intensity;
  ctx.save();ctx.strokeStyle=`rgba(138,73,61,${.56*(1-phase)})`;ctx.lineWidth=1.6;
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=`rgba(103,94,79,${.18*(1-phase)})`;ctx.beginPath();ctx.arc(p.x,p.y,r*.65,0,Math.PI*2);ctx.fill();ctx.restore();
}
function sideColor(side) {
  return side==='byzantine'?COLORS.byz:COLORS.ottoman;
}
function visualIsActive(v) {
  return state.time>=v.from&&(v.to==null||state.time<=v.to);
}
function drawCannon(x,y,angle=0) {
  const p=worldToScreen(x,y),s=Math.max(.85,scale());
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
  ctx.fillStyle='#51493e';ctx.fillRect(-7*s,-2*s,12*s,4*s);ctx.fillRect(2*s,-5*s,8*s,3*s);
  ctx.beginPath();ctx.arc(-4*s,4*s,3*s,0,Math.PI*2);ctx.arc(5*s,4*s,3*s,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawBombardmentVisual(v,ts) {
  const targets=v.targets||[],sources=v.sources||[];
  sources.forEach(([x,y],i)=>drawCannon(x,y,-.15+i*.08));
  for(let i=0;i<Math.min(targets.length,sources.length);i++){
    const a=worldToScreen(...sources[i]),b=worldToScreen(...targets[i]);
    const lift=34+10*i,phase=((ts*.00042)+i*.31)%1;
    ctx.save();
    ctx.strokeStyle=v.side==='byzantine'?'rgba(39,75,89,.32)':'rgba(138,73,61,.32)';
    ctx.lineWidth=1.15;ctx.setLineDash([4,5]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,Math.min(a.y,b.y)-lift,b.x,b.y);ctx.stroke();ctx.restore();
    if(phase>.72)drawImpact(targets[i][0],targets[i][1],(phase-.72)/.28,.9);
  }
}
function drawArrowsVisual(v) {
  const color=sideColor(v.side);
  (v.arrows||[]).forEach(a=>drawArrow(a.points,color,a.width??3,a.alpha??.45));
}
function drawRetreatVisual(v,ts) {
  const center=v.center||v.path?.[0];if(!center)return;
  const p=worldToScreen(...center),pulse=((ts%1100)/1100),color=sideColor(v.side);
  ctx.save();
  ctx.strokeStyle=(v.side==='byzantine'?'rgba(39,75,89,':'rgba(138,73,61,')+(.7*(1-pulse))+')';
  ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,10+pulse*24,0,Math.PI*2);ctx.stroke();ctx.restore();
  if(v.path)drawArrow(v.path,color,2.2,.38);
}
function drawImpactVisual(v,ts) {
  const phase=((ts%1300)/1300),center=v.center;if(!center)return;
  drawImpact(center[0],center[1],phase,v.intensity??1);
}
function drawStandVisual(v,ts) {
  if(!v.center)return;
  const p=worldToScreen(...v.center),phase=((ts%1400)/1400);
  ctx.save();
  ctx.strokeStyle=(v.side==='ottoman'?'rgba(138,73,61,':'rgba(39,75,89,')+(.52*(1-phase))+')';
  ctx.lineWidth=2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(p.x,p.y,14+phase*20,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function drawEventScene(ts) {
  if(!state.layers.events)return;
  for(const v of scenario.visuals||[]){
    if(!visualIsActive(v))continue;
    if(v.type==='bombardment')drawBombardmentVisual(v,ts);
    else if(v.type==='arrows')drawArrowsVisual(v);
    else if(v.type==='retreat')drawRetreatVisual(v,ts);
    else if(v.type==='impact')drawImpactVisual(v,ts);
    else if(v.type==='stand')drawStandVisual(v,ts);
  }
  const e=activeEvent(scenario.events,state.time,9);if(!e)return;
  const p=worldToScreen(e.focus.x,e.focus.y),pulse=(ts%1200)/1200;
  ctx.save();ctx.strokeStyle='rgba(138,73,61,'+(.28*(1-pulse))+')';ctx.lineWidth=1.4;ctx.setLineDash([2,5]);
  ctx.beginPath();ctx.arc(p.x,p.y,14+pulse*26,0,Math.PI*2);ctx.stroke();ctx.restore();
}
function render(ts) {
  if(ui.viewer.hidden)return;
  drawTerrain();drawWalls();drawPlaces();
  if(state.layers.units)scenario.units.forEach(drawUnit);
  if(state.layers.units)(scenario.ships||[]).forEach(drawShip);
  if(state.layers.commanders)scenario.commanders.forEach(drawCommander);
  drawEventScene(ts||performance.now());
}
function phaseAt(t){const p=scenario.phases.find(x=>t>=x.from&&t<x.to);return (p || scenario.phases[scenario.phases.length-1]).name;}
function drawEventPreview(e) {
  if(!ui.preview||!e)return;
  const rect=ui.preview.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),c=ui.preview.getContext('2d');
  ui.preview.width=Math.max(1,Math.round(rect.width*dpr));ui.preview.height=Math.max(1,Math.round(rect.height*dpr));c.setTransform(dpr,0,0,dpr,0,0);
  const w=rect.width,h=rect.height;c.fillStyle='#d8cfb3';c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(87,75,57,.18)';c.lineWidth=1;
  for(let y=14;y<h;y+=18){c.beginPath();c.moveTo(0,y);c.lineTo(w,y+4);c.stroke();}
  const wallX=w*.57;c.strokeStyle='#746a58';c.lineWidth=7;c.beginPath();c.moveTo(wallX,8);c.lineTo(wallX,h-8);c.stroke();
  c.fillStyle='#b5a786';for(let y=12;y<h-8;y+=22)c.fillRect(wallX-6,y,12,10);
  const active=e.id==='breach'||e.id==='city'||e.id==='fall';
  if(active){c.fillStyle='#d8cfb3';c.fillRect(wallX-8,h*.43,16,26);c.fillStyle='#916747';for(let i=0;i<10;i++){c.beginPath();c.arc(wallX+(i%3-1)*8,h*.56+(Math.floor(i/3)-1)*6,2.8,0,Math.PI*2);c.fill();}}
  const red='#a93b32',blue='#2d6f94';
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){c.fillStyle=red;c.fillRect(10+col*13,18+row*21,8,15);}
  for(let row=0;row<3;row++){c.fillStyle=blue;c.fillRect(wallX+18,18+row*22,8,15);c.fillRect(wallX+30,24+row*22,8,15);}
  c.strokeStyle='rgba(169,59,50,.7)';c.lineWidth=3;c.beginPath();c.moveTo(48,h*.7);c.quadraticCurveTo(w*.42,h*.6,wallX-4,h*.55);c.stroke();
}
function showEvent(e) {
  if(!e){ui.eventCard.hidden=true;return;}
  ui.eventCard.hidden=false;ui.eventTime.textContent=formatClock(scenario.startMinutes,e.t);
  ui.eventTitle.textContent=e.title;ui.eventBody.textContent=e.body;ui.eventConfidence.textContent=e.confidence;
  requestAnimationFrame(()=>drawEventPreview(e));
  if(e.id!==state.lastEvent){state.lastEvent=e.id;if(e.importance>=4)try{navigator.vibrate?.([12,32,12]);}catch{}}
}
function updateUi(){
  const pct=state.time/scenario.duration*100, clock=formatClock(scenario.startMinutes,state.time);
  ui.progress.style.width=pct+'%';ui.thumb.style.left=pct+'%';ui.scrub.setAttribute('aria-valuenow',String(Math.round(pct)));
  ui.clock.textContent=clock;ui.time.textContent=clock;ui.phase.textContent=phaseAt(state.time);
  ui.auto.classList.toggle('active',state.autoCamera);ui.auto.setAttribute('aria-pressed',String(state.autoCamera));
  ui.speed.textContent=state.speedMode==='auto'?'AUTO':'×'+state.manualSpeed;
  const e=activeEvent(scenario.events,state.time,8);
  [...ui.timelineEvents.children].forEach((node,i)=>node.classList.toggle('current',scenario.events[i]===e));
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
function jumpToEvent(e) {
  state.time=e.t;state.dismissedEvent=null;state.playing=false;ui.play.classList.remove('playing');
  if(state.autoCamera){state.target={x:e.focus.x,y:e.focus.y,zoom:e.focus.zoom};Object.assign(state.camera,state.target);}
  showEvent(e);updateUi();render();persist();
}
function buildTicks(){
  ui.ticks.innerHTML='';ui.timelineEvents.innerHTML='';
  scenario.events.forEach(e=>{
    const b=document.createElement('button');b.type='button';b.className='event-tick '+(e.importance>=4?'major':'');
    b.style.left=(e.t/scenario.duration*100)+'%';b.setAttribute('aria-label',e.title);b.addEventListener('click',ev=>{ev.stopPropagation();jumpToEvent(e);});ui.ticks.appendChild(b);
    const label=document.createElement('button');label.type='button';label.className='timeline-event';label.innerHTML='<strong>'+formatClock(scenario.startMinutes,e.t)+'</strong><span>'+(e.short||e.title)+'</span>';
    label.addEventListener('click',()=>jumpToEvent(e));ui.timelineEvents.appendChild(label);
  });
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
ui.layerBtn.addEventListener('click',()=>ui.sheet.hidden=!ui.sheet.hidden);
ui.layersTab.addEventListener('click',()=>ui.sheet.hidden=!ui.sheet.hidden);
ui.eventsTab.addEventListener('click',focusNearest);
ui.commandersTab.addEventListener('click',()=>{state.layers.commanders=!state.layers.commanders;ui.commandersTab.classList.toggle('active',state.layers.commanders);render();persist();toast(state.layers.commanders?'Командиры включены':'Командиры скрыты');});
ui.sheetClose.addEventListener('click',()=>ui.sheet.hidden=true);
ui.eventClose.addEventListener('click',()=>{const e=activeEvent(scenario.events,state.time,8);state.dismissedEvent=e?.id||null;ui.eventCard.hidden=true;});
ui.prev.addEventListener('click',()=>{const prev=[...scenario.events].reverse().find(e=>e.t<state.time-1)||scenario.events[0];jumpToEvent(prev);});
ui.next.addEventListener('click',()=>{const next=scenario.events.find(e=>e.t>state.time+1)||scenario.events[scenario.events.length-1];jumpToEvent(next);});
ui.overview.addEventListener('click',()=>{state.playing=false;ui.play.classList.remove('playing');state.autoCamera=false;state.camera={x:500,y:360,zoom:.92};state.target={...state.camera};updateUi();render();persist();toast('Общий план');});
ui.scrub.addEventListener('pointerdown',e=>{ui.scrub.setPointerCapture(e.pointerId);scrubTo(e.clientX);});
ui.scrub.addEventListener('pointermove',e=>{if(ui.scrub.hasPointerCapture(e.pointerId))scrubTo(e.clientX);});
ui.scrub.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='Home')state.time=0;else if(e.key==='End')state.time=scenario.duration;else state.time=clamp(state.time+(e.key==='ArrowRight'?5:-5),0,scenario.duration);if(state.autoCamera)cameraForTime(true);updateUi();render();persist();});
new ResizeObserver(resize).observe(ui.canvas);
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.playing=false;ui.play.classList.remove('playing');persist();}state.lastFrame=performance.now();});
window.addEventListener('pagehide',persist);
resize();cameraForTime(true);requestAnimationFrame(tick);
window.__AI_TEST_STATE__={app:'chronoscope',loadingState:'ready',scenario:scenario.id,visualVersion:'1.3.0-reference'};
