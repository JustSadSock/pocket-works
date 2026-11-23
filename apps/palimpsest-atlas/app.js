import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { stories, getStory } from './stories.js';
import { initStudio } from './studio.js';
import { clamp, lerp, span, fraction, formatYear, displayYear, era,
  eventBefore, previousEvent, nextEvent, snapshotAt, zoomWindow,
  fittedWindow, smartTicks, playbackStep, validateStory } from './core.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const ui = {
  library:$('library'),viewer:$('viewer'),scene:$('scene'),stage:$('stage'),
  title:$('story-title'),caption:$('story-caption'),date:$('date-value'),era:$('date-era'),
  eventTitle:$('event-title'),eventSubtitle:$('event-subtitle'),eventClass:$('event-class'),
  play:$('play'),prev:$('prev'),next:$('next'),scrub:$('time-surface'),timeCanvas:$('time-canvas'),
  timeLeft:$('time-left'),timeRight:$('time-right'),timeHelp:$('time-help'),
  plus:$('map-plus'),minus:$('map-minus'),home:$('map-home'),zoomLabel:$('map-scale'),
  bookmark:$('bookmark'),list:$('list-toggle'),outline:$('outline'),outlineItems:$('outline-items'),
  outlineTitle:$('outline-title'),inspector:$('inspector'),inspectorName:$('inspector-name'),
  inspectorType:$('inspector-type'),confidence:$('confidence'),inspectorBody:$('inspector-description'),
  sources:$('sources'),tabNow:$('tab-now'),tabGeneral:$('tab-general'),toast:$('toast')
};
const mapCtx = ui.scene.getContext('2d', {alpha:false});
const timeCtx = ui.timeCanvas.getContext('2d');
const STORE = 'pocket-works:palimpsest-atlas:session:v1';
const CONFIDENCE = {
  confirmed:'Подтверждено историческими или археологическими источниками',
  estimated:'Приблизительная реконструкция. Даты или расположение обобщены',
  tradition:'Предание / традиционная датировка, не установленный факт',
  disputed:'Существуют разные исторические интерпретации',
  hypothetical:'Авторская гипотеза, не подтверждённый исторический факт'
};

let stored = {views:{},lastStory:null};
try {
  const parsed = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (parsed && typeof parsed === 'object') stored = {views:parsed.views || {},lastStory:parsed.lastStory || null};
} catch { /* Storage may be unavailable; app remains usable. */ }

const state = {
  story:stories[0],time:stories[0].range[0],window:[...stories[0].range],
  camera:{x:500,y:350,zoom:1},playing:false,inspector:null,tab:'now',
  activeEventId:null,mapPointers:new Map(),timePointers:new Map(),
  mapPinch:null,timePinch:null,suppressMapTap:false,
  dirty:true,lastFrame:0,lastSaved:0,
  sizes:{map:{width:1,height:1,dpr:1},time:{width:1,height:1,dpr:1}},
  hits:[],toastHandle:null
};

for (const story of stories) {
  const errors = validateStory(story);
  if (errors.length) throw new Error('Invalid historical story ' + story.id + ': ' + errors.join('; '));
}

function save() {
  const s = state.story;
  stored.lastStory = ui.viewer.hidden ? null : s.id;
  stored.views[s.id] = {
    time:state.time,
    window:[...state.window],
    camera:{...state.camera},
    bookmark:stored.views[s.id]?.bookmark ?? null
  };
  try { localStorage.setItem(STORE,JSON.stringify(stored)); } catch { /* private mode */ }
  state.lastSaved = performance.now();
}
function restoreView(story) {
  const saved = stored.views[story.id];
  state.time = Number.isFinite(saved?.time) ? clamp(saved.time,...story.range) : story.range[0];
  state.window = Array.isArray(saved?.window) && saved.window.length === 2 &&
    saved.window.every(Number.isFinite) && saved.window[1] > saved.window[0]
    ? fittedWindow(story.range,(saved.window[0]+saved.window[1])/2,saved.window[1]-saved.window[0])
    : [...story.range];
  if(state.time < state.window[0] || state.time > state.window[1]) state.window = fittedWindow(story.range,state.time,span(state.window));
  const camera = saved?.camera;
  state.camera = camera && Number.isFinite(camera.x) && Number.isFinite(camera.y) && Number.isFinite(camera.zoom)
    ? {x:clamp(camera.x,-200,1200),y:clamp(camera.y,-200,900),zoom:clamp(camera.zoom,.75,7)}
    : {x:story.world.width/2,y:story.world.height/2,zoom:1};
}
let studioApi=null;
function openStory(id) {
  const story=studioApi?.getStory(id)||getStory(id);
  state.story=story;state.playing=false;state.inspector=null;state.tab='now';
  state.activeEventId=null;state.mapPointers.clear();state.timePointers.clear();
  state.mapPinch=null;state.timePinch=null;
  restoreView(story);
  ui.library.hidden=true;$('studio').hidden=true;ui.viewer.hidden=false;ui.inspector.hidden=true;ui.outline.hidden=true;
  $('edit-story').hidden=story.type!=='custom';
  ui.list.setAttribute('aria-expanded','false');
  ui.title.textContent=story.title;
  ui.caption.textContent='ПАЛИМПСЕСТ / ИСТОРИЯ '+story.index;
  ui.outlineTitle.textContent=story.title;
  $('map-caveat').textContent='СХЕМАТИЧЕСКАЯ КАРТА';
  drawOutline();
  resize();
  refresh();
  save();
}
function toLibrary() {
  state.playing=false;
  ui.library.hidden=false;ui.viewer.hidden=true;
  ui.inspector.hidden=true;ui.outline.hidden=true;
  state.inspector=null;
  ui.list.setAttribute('aria-expanded','false');
  state.activeEventId=null;
  stored.lastStory=null; save();
}
function toast(message) {
  clearTimeout(state.toastHandle);
  ui.toast.textContent=message;
  ui.toast.hidden=false;
  state.toastHandle=setTimeout(()=>{ui.toast.hidden=true;},2300);
}
function setPlaying(value) {
  state.playing=!!value;
  ui.play.textContent=state.playing?'❚❚':'▶';
  ui.play.setAttribute('aria-label',state.playing?'Пауза':'Воспроизвести');
  state.dirty=true;
}
function seek(value,options={}) {
  const target=clamp(value,...state.story.range);
  state.time=target;
  if (target < state.window[0] || target > state.window[1]) {
    state.window=fittedWindow(state.story.range,target,span(state.window));
  }
  if(options.focus) focusPoint(options.focus);
  refresh();
}
function jumpEvent(event) {
  if(!event)return;
  setPlaying(false);seek(event.time,{focus:event.focus});
  ui.outline.hidden=true;ui.list.setAttribute('aria-expanded','false');
}
function updateBookmark() {
  const value=stored.views[state.story.id]?.bookmark;
  const active=Number.isFinite(value) && Math.abs(value-state.time)<Math.max(0.001,span(state.story.range)/10000);
  ui.bookmark.textContent=active?'◆':'◇';
  ui.bookmark.setAttribute('aria-pressed',String(active));
  ui.bookmark.setAttribute('aria-label',active?'Удалить закладку':'Сохранить закладку');
  ui.bookmark.title=active?'Удалить закладку':'Сохранить закладку';
}
function bookmarkAction() {
  const current=stored.views[state.story.id]?.bookmark;
  const same=Number.isFinite(current) && Math.abs(current-state.time)<Math.max(.001,span(state.story.range)/10000);
  stored.views[state.story.id] ||= {};
  stored.views[state.story.id].bookmark=same?null:state.time;
  save(); updateBookmark();
  toast(same?'Закладка удалена':'Момент сохранён. Нажми на ◇ и удерживай, чтобы вернуться к нему.');
}
let bookmarkTimer=null;
ui.bookmark.addEventListener('pointerdown',()=>{
  clearTimeout(bookmarkTimer);
  bookmarkTimer=setTimeout(()=>{
    bookmarkTimer=null;
    const time=stored.views[state.story.id]?.bookmark;
    if(Number.isFinite(time)){seek(time);toast('Открыта сохранённая дата');ui.bookmark.dataset.long='yes';}
  },550);
});
for (const type of ['pointerup','pointercancel','pointerleave']) ui.bookmark.addEventListener(type,()=>clearTimeout(bookmarkTimer));
ui.bookmark.addEventListener('click',()=>{if(ui.bookmark.dataset.long){delete ui.bookmark.dataset.long;return;}bookmarkAction();});

function refresh() {
  const story=state.story;
  const event=eventBefore(story,state.time);
  const previous=state.activeEventId;
  ui.date.textContent=displayYear(state.time);
  ui.era.textContent=era(state.time);
  ui.eventTitle.textContent=event?.title || story.title;
  ui.eventSubtitle.textContent=event?.subtitle || story.intro;
  ui.eventClass.textContent=event?.category || 'ВСТУПЛЕНИЕ';
  ui.timeLeft.textContent=formatYear(state.window[0]);
  ui.timeRight.textContent=formatYear(state.window[1]);
  ui.timeHelp.textContent=span(state.window)>=span(story.range)*.85?
    'Перетащи · разведи пальцы для деталей':'Разведи пальцы · сдвинь для перемотки';
  ui.scrub.setAttribute('aria-valuenow',String(Math.round(fraction(state.time,story.range)*1000)));
  ui.scrub.setAttribute('aria-valuetext',formatYear(state.time));
  ui.zoomLabel.textContent=state.camera.zoom>3?'ДЕТАЛИ МЕСТНОСТИ':state.camera.zoom>1.5?'ЛОКАЛЬНЫЕ ОБЪЕКТЫ':'ОБЗОР РЕГИОНА';
  updateBookmark();
  if(previous!==event?.id){state.activeEventId=event?.id;drawOutline();}
  if(state.inspector) updateInspector();
  state.dirty=true;
}
function drawOutline() {
  const fragment=document.createDocumentFragment();
  const active=eventBefore(state.story,state.time)?.id;
  for(const event of state.story.events){
    const button=document.createElement('button');
    button.type='button';button.className='outline-item'+(active===event.id?' active':'');
    button.setAttribute('data-native-press','');
    const date=document.createElement('time');date.textContent=formatYear(event.time);
    const body=document.createElement('span');
    const title=document.createElement('strong');title.textContent=event.title;
    const subtitle=document.createElement('small');subtitle.textContent=event.subtitle;
    body.append(title,subtitle);button.append(date,body);
    button.addEventListener('click',()=>jumpEvent(event));
    fragment.append(button);
  }
  ui.outlineItems.replaceChildren(fragment);
}
function sourceList(ids) {
  ui.sources.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const id of ids||[]) {
    const source=state.story.sources.find(item=>item.id===id);
    if(!source || !/^https:\/\//i.test(source.url))continue;
    const link=document.createElement('a');
    link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.title;
    fragment.append(link);
  }
  if(!fragment.childNodes.length) {
    const text=document.createElement('span');text.className='no-source';
    text.textContent='Источник не указан для этого информационного объекта.';
    fragment.append(text);
  }
  ui.sources.append(fragment);
}
function openInspector(kind,item) {
  state.inspector={kind,id:item.id};state.tab='now';
  ui.inspector.hidden=false;ui.outline.hidden=true;
  ui.list.setAttribute('aria-expanded','false');updateInspector();
}
function updateInspector() {
  const record=state.inspector;if(!record)return;
  const item=record.kind==='event'?state.story.events.find(x=>x.id===record.id):
    state.story.entities.find(x=>x.id===record.id);
  if(!item){ui.inspector.hidden=true;state.inspector=null;return;}
  ui.inspectorType.textContent=record.kind==='event'?'ИСТОРИЧЕСКОЕ СОБЫТИЕ':item.type.toUpperCase();
  ui.inspectorName.textContent=record.kind==='event'?item.title:item.name;
  ui.confidence.textContent=CONFIDENCE[item.confidence]||CONFIDENCE.estimated;
  ui.tabNow.classList.toggle('active',state.tab==='now');ui.tabGeneral.classList.toggle('active',state.tab==='general');
  ui.tabNow.setAttribute('aria-pressed',String(state.tab==='now'));
  ui.tabGeneral.setAttribute('aria-pressed',String(state.tab==='general'));
  if(record.kind==='event'){
    ui.inspectorBody.textContent=state.tab==='now'?
      formatYear(item.time)+' · '+item.subtitle+'\n\n'+item.text :
      item.text+'\n\nПоказанный на сцене маршрут или граница может быть схематичным. Степень исторической уверенности указана выше.';
  } else {
    ui.inspectorBody.textContent=state.tab==='now'?
      (state.time < item.from ? 'На выбранную дату объект ещё не отмечен в этой реконструкции.' : item.current) :
      item.description;
  }
  sourceList(item.sources);
}
function resizeOne(canvas,record) {
  const rect=canvas.getBoundingClientRect();
  if(rect.width===0 || rect.height===0)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  record.width=rect.width;record.height=rect.height;record.dpr=dpr;
  canvas.width=Math.max(1,Math.round(rect.width*dpr));
  canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function resize(){ if(ui.viewer.hidden)return;
  resizeOne(ui.scene,state.sizes.map);
  resizeOne(ui.timeCanvas,state.sizes.time);
  state.dirty=true;
}
function scale() {
  const v=state.sizes.map,w=state.story.world;
  return Math.min(v.width/w.width,v.height/w.height)*state.camera.zoom*1.12;
}
function project(x,y) {
  const v=state.sizes.map,s=scale();
  return {x:v.width/2+(x-state.camera.x)*s,y:v.height/2+(y-state.camera.y)*s};
}
function unproject(x,y) {
  const v=state.sizes.map,s=scale();
  return {x:state.camera.x+(x-v.width/2)/s,y:state.camera.y+(y-v.height/2)/s};
}
function zoomMap(point,factor) {
  const old=unproject(point.x,point.y);
  state.camera.zoom=clamp(state.camera.zoom*factor,.75,7);
  const v=state.sizes.map,sc=scale();
  state.camera.x=clamp(old.x-(point.x-v.width/2)/sc,-260,1260);
  state.camera.y=clamp(old.y-(point.y-v.height/2)/sc,-260,960);
  refresh();
}
function focusPoint(point) {
  if(!point)return;
  state.camera.x=clamp(point[0],-200,1200);
  state.camera.y=clamp(point[1],-200,900);
  refresh();
}
function line(points,color,width,dash=[]) {
  if(!points || !points.length)return;
  mapCtx.beginPath();
  let first=project(points[0][0],points[0][1]);mapCtx.moveTo(first.x,first.y);
  for(let i=1;i<points.length;i++){const p=project(points[i][0],points[i][1]);mapCtx.lineTo(p.x,p.y);}
  mapCtx.strokeStyle=color;mapCtx.lineWidth=width;mapCtx.lineCap='round';mapCtx.lineJoin='round';
  mapCtx.setLineDash(dash);mapCtx.stroke();mapCtx.setLineDash([]);
}
function textAt(label,x,y,options={}) {
  const ctx=mapCtx;
  ctx.textAlign=options.align||'center';ctx.textBaseline='middle';
  ctx.font=(options.italic?'italic ':'')+(options.bold?'700 ':'500 ')+(options.size||12)+'px '+(options.serif?'Georgia,serif':'ui-sans-serif,system-ui');
  ctx.lineWidth=3;ctx.strokeStyle=options.halo||'rgba(234,224,202,.94)';
  if(options.halo!==false)ctx.strokeText(label,x,y);
  ctx.fillStyle=options.color||'#384940';ctx.fillText(label,x,y);
}
function drawGrid(w,h){
  mapCtx.fillStyle=state.story.palette.paper;mapCtx.fillRect(0,0,w,h);
  mapCtx.strokeStyle='rgba(94,98,83,.11)';mapCtx.lineWidth=1;
  const s=scale(),origin=project(0,0);
  for(let x=origin.x%Math.max(1,120*s);x<=w;x+=Math.max(1,120*s)){
    mapCtx.beginPath();mapCtx.moveTo(x,0);mapCtx.lineTo(x,h);mapCtx.stroke();
  }
  for(let y=origin.y%Math.max(1,120*s);y<=h;y+=Math.max(1,120*s)){
    mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(w,y);mapCtx.stroke();
  }
}
function ellipseAt(feature,fill,stroke,opacity=1){
  const p=project(feature.x,feature.y),s=scale(),ctx=mapCtx;
  ctx.save();ctx.globalAlpha=opacity;ctx.translate(p.x,p.y);ctx.rotate(feature.rotation||0);
  ctx.beginPath();ctx.ellipse(0,0,feature.rx*s,feature.ry*s,0,0,Math.PI*2);
  ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke();}
  ctx.restore();
}
function drawTerrain(snapshot){
  const ctx=mapCtx,story=state.story,s=scale();
  for(const feature of snapshot.features.filter(x=>x.kind==='region')){
    ellipseAt(feature,'rgba(143,137,103,.14)','rgba(117,105,83,.3)',.9);
    const p=project(feature.x,feature.y);
    if(state.camera.zoom<3)textAt(feature.label,p.x,p.y,{size:Math.max(9,Math.min(13,11*state.camera.zoom)),color:'#787765',bold:true});
  }
  for(const feature of snapshot.features.filter(x=>x.kind==='hill')){
    ellipseAt(feature,'#c7bc99','rgba(92,98,76,.36)',.82);
    for(let i=0;i<3;i++){
      const q=1-i*.19;
      const e={...feature,rx:feature.rx*q,ry:feature.ry*q};
      ellipseAt(e,'rgba(215,203,165,'+(0.12+i*.04)+')','rgba(86,89,66,'+(.13+i*.05)+')',1);
    }
    const p=project(feature.x,feature.y);
    if(state.camera.zoom<3.2)textAt(feature.label,p.x,p.y-(feature.ry*s*.65),{size:11,serif:true,italic:true,color:'#74664a'});
  }
  for(const water of story.waterways||[]){
    line(water,'rgba(103,140,143,.20)',Math.max(12,42*s));
    line(water,'#89afb0',Math.max(7,24*s));
    line(water,'#b3c9c5',Math.max(2,7*s));
  }
  for(const feature of snapshot.features.filter(x=>x.kind==='zone')){
    const age=state.time-feature.from;
    const fade=clamp(.45+age/Math.max(5,span(story.range)*.06),.45,1);
    if(feature.id==='city-core')ellipseAt(feature,'rgba(159,78,58,.09)','rgba(152,79,62,.66)',fade);
    else ellipseAt(feature,'rgba(156,118,70,.24)','rgba(130,102,62,.65)',fade);
    const p=project(feature.x,feature.y);
    if(state.camera.zoom>1.2)textAt(feature.label,p.x,p.y,{size:12,serif:true,color:'#9b593b'});
  }
  for(const path of snapshot.paths){
    const dash=path.confidence==='estimated'?[5,7]:[];
    line(path.points,'rgba(130,96,66,.64)',Math.max(1.5,3*s),dash);
  }
  // Maps are deliberately generalized; avoid falsely precise geopolitical boundaries.
  ctx.save();ctx.globalAlpha=.26;
  const left=project(44,656);
  textAt(story.type==='origins'?'LATIUM':'EUROPA CENTRALIS',left.x,left.y,{align:'left',size:20,serif:true,italic:true,color:'#73755f'});
  ctx.restore();
}
function drawSettlement(p,kind){
  const ctx=mapCtx;
  ctx.save();ctx.translate(p.x,p.y);
  if(kind==='settlement'){
    for(let i=-1;i<=1;i++){
      const x=i*13,y=(i%2)*6;
      ctx.fillStyle='#ab7951';ctx.beginPath();ctx.moveTo(x-6,y+5);ctx.lineTo(x,y-8);ctx.lineTo(x+7,y+5);ctx.fill();
      ctx.fillStyle='#e7cf9d';ctx.fillRect(x-5,y+4,10,6);
    }
  } else if(kind==='city'){
    ctx.fillStyle='#a45b43';ctx.fillRect(-8,-6,16,13);
    ctx.fillRect(-12,-11,5,18);ctx.fillRect(7,-11,5,18);
    ctx.fillStyle='#e5d9c2';ctx.fillRect(-2,1,4,6);
  } else if(kind==='legend'){
    ctx.strokeStyle='#a4513b';ctx.lineWidth=2;ctx.beginPath();
    ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#a4513b';ctx.fillRect(-2,-8,4,16);ctx.fillRect(-8,-2,16,4);
  } else if(kind==='battle'){
    ctx.strokeStyle='#a0523c';ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke();
  } else {
    ctx.fillStyle=kind==='river'?'#5d8588':'#a15340';
    ctx.beginPath();ctx.arc(0,0,4.6,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function drawEntities(snapshot){
  const ctx=mapCtx;state.hits=[];
  const objects=snapshot.entities;
  for(const entity of objects){
    const p=project(entity.x,entity.y);
    if(p.x<-70||p.x>state.sizes.map.width+90||p.y<-70||p.y>state.sizes.map.height+90)continue;
    if(state.story.type==='origins' && state.camera.zoom<1.35 && ['capitoline','aventine'].includes(entity.id))continue;
    const selected=state.inspector?.kind==='entity'&&state.inspector.id===entity.id;
    ctx.beginPath();ctx.arc(p.x,p.y,selected?19:14,0,Math.PI*2);
    ctx.fillStyle=selected?'rgba(163,78,57,.20)':'rgba(246,238,219,.7)';ctx.fill();
    drawSettlement(p,entity.type);
    const labelY=p.y+(entity.type==='hill'?19:23);
    textAt(entity.name,p.x,labelY,{size:state.camera.zoom>3?13:11,color:selected?'#9f513b':'#41483c',serif:true,bold:selected});
    state.hits.push({entity,x:p.x,y:p.y,radius:Math.max(22,Math.min(39,22*state.camera.zoom))});
  }
}
function drawSpot(snapshot){
  const event=snapshot.currentEvent;if(!event?.focus)return;
  const ctx=mapCtx,p=project(event.focus[0],event.focus[1]);
  if(p.x<-100||p.x>state.sizes.map.width+100||p.y<-100||p.y>state.sizes.map.height+100)return;
  const accent=state.story.palette.accent;
  ctx.beginPath();ctx.arc(p.x,p.y,24,0,Math.PI*2);
  ctx.fillStyle='rgba(157,73,53,.07)';ctx.fill();
  ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.setLineDash([4,5]);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();
  const title=event.title;
  const y=p.y-33;
  ctx.font='700 11px ui-sans-serif,system-ui';
  const width=clamp(ctx.measureText(title).width+20,70,240);
  const x=clamp(p.x-width/2,5,state.sizes.map.width-width-5);
  ctx.fillStyle='#f1e7d2';ctx.fillRect(x,y-12,width,25);
  ctx.strokeStyle='rgba(145,86,65,.54)';ctx.strokeRect(x+.5,y-11.5,width-1,24);
  ctx.save();ctx.beginPath();ctx.rect(x+5,y-11,width-10,23);ctx.clip();
  textAt(title,x+10,y+1,{size:11,align:'left',bold:true,color:accent,halo:false});
  ctx.restore();
}
function renderMap(){
  const ctx=mapCtx,{width,height}=state.sizes.map;
  if(width<1||height<1)return;
  drawGrid(width,height);
  const snapshot=snapshotAt(state.story,state.time);
  drawTerrain(snapshot);drawEntities(snapshot);drawSpot(snapshot);
  // Thin atlas corner rules, a visible cue that this is a diagram, not a raster basemap.
  ctx.strokeStyle='rgba(82,89,76,.19)';ctx.lineWidth=1;
  ctx.strokeRect(8.5,8.5,width-17,height-17);
}
function canvasTimeline(){
  const ctx=timeCtx,w=state.sizes.time.width,h=state.sizes.time.height,window=state.window;
  if(w<=1||h<=1)return;
  ctx.clearRect(0,0,w,h);
  const left=13,right=w-13,length=right-left;
  const calc=(time)=>left+fraction(time,window)*length;
  ctx.strokeStyle='#b5ac97';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(left,28.5);ctx.lineTo(right,28.5);ctx.stroke();
  ctx.fillStyle='rgba(163,82,60,.15)';
  const px=clamp(calc(state.time),left,right);
  ctx.fillRect(left,26,px-left,5);
  ctx.font='500 10px ui-sans-serif,system-ui';ctx.textAlign='center';
  for(const tick of smartTicks(window,6)){
    const x=calc(tick);
    if(x<24||x>w-24)continue;
    ctx.fillStyle='#857f6e';ctx.fillText(String(Math.abs(Math.trunc(tick))),x,12);
    ctx.fillStyle='#b4aa94';ctx.fillRect(x-.5,18,1,6);
  }
  for(const event of state.story.events){
    if(event.time<window[0]||event.time>window[1])continue;
    const x=calc(event.time),importance=event.importance||1;
    ctx.fillStyle=event.confidence==='tradition'?'#9d8064':'#9c5a45';
    ctx.fillRect(x-1.5,29-importance*3,3,importance*3+7);
    if(event.id===eventBefore(state.story,state.time)?.id){
      ctx.beginPath();ctx.arc(x,27,5,0,Math.PI*2);
      ctx.fillStyle='#a4513b';ctx.fill();
    }
  }
  const bm=stored.views[state.story.id]?.bookmark;
  if(Number.isFinite(bm)&&bm>=window[0]&&bm<=window[1]){
    const x=calc(bm);
    ctx.fillStyle='#496d74';ctx.beginPath();ctx.moveTo(x,46);ctx.lineTo(x-5,51);ctx.lineTo(x+5,51);ctx.closePath();ctx.fill();
  }
  ctx.beginPath();ctx.moveTo(px,18);ctx.lineTo(px,47);
  ctx.strokeStyle='#273931';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#273931';ctx.beginPath();ctx.arc(px,27,5.6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#f3eddb';ctx.lineWidth=2;ctx.stroke();
}
function locateTap(x,y){
  const hit=[...state.hits].reverse()
    .map(h=>({...h,d:Math.hypot(h.x-x,h.y-y)}))
    .filter(h=>h.d<h.radius)
    .sort((a,b)=>a.d-b.d)[0];
  if(hit){setPlaying(false);openInspector('entity',hit.entity);return;}
  const current=eventBefore(state.story,state.time);
  if(current?.focus){
    const p=project(current.focus[0],current.focus[1]);
    if(Math.hypot(p.x-x,p.y-y)<48){openInspector('event',current);return;}
  }
  if(!ui.inspector.hidden){ui.inspector.hidden=true;state.inspector=null;state.dirty=true;}
}
function pointerPosition(event,element){
  const rect=element.getBoundingClientRect();
  return {x:event.clientX-rect.left,y:event.clientY-rect.top};
}
function registerMapPointers(){
  const c=ui.scene;
  c.addEventListener('pointerdown',(event)=>{
    if(event.button!==0 && event.pointerType==='mouse')return;
    c.setPointerCapture(event.pointerId);
    const p=pointerPosition(event,c);
    state.mapPointers.set(event.pointerId,{...p,moved:false});
    state.suppressMapTap=state.mapPointers.size>1;
    if(state.mapPointers.size===2){
      const pts=[...state.mapPointers.values()];
      state.mapPinch={distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),zoom:state.camera.zoom};
    }
  });
  c.addEventListener('pointermove',(event)=>{
    const old=state.mapPointers.get(event.pointerId);if(!old)return;
    const p=pointerPosition(event,c);
    const delta=Math.hypot(p.x-old.x,p.y-old.y);
    if(delta>2)old.moved=true;
    if(state.mapPointers.size===1){
      if(delta>=.1){
        const sc=scale();
        state.camera.x=clamp(state.camera.x-(p.x-old.x)/sc,-260,1260);
        state.camera.y=clamp(state.camera.y-(p.y-old.y)/sc,-260,960);
        refresh();
      }
    }
    old.x=p.x;old.y=p.y;
    if(state.mapPointers.size===2){
      const pts=[...state.mapPointers.values()];
      const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
      const distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));
      const factor=distance/(state.mapPinch?.distance||distance);
      state.mapPinch={distance,zoom:state.camera.zoom};
      zoomMap(mid,factor);
    }
  });
  function end(event){
    const old=state.mapPointers.get(event.pointerId);if(!old)return;
    const p=pointerPosition(event,c);
    const tap=state.mapPointers.size===1&&!state.suppressMapTap&&
      !old.moved&&Math.hypot(p.x-old.x,p.y-old.y)<8&&event.type==='pointerup';
    state.mapPointers.delete(event.pointerId);
    if(state.mapPointers.size<2)state.mapPinch=null;
    if(state.mapPointers.size===0)state.suppressMapTap=false;
    if(tap)locateTap(p.x,p.y);
    save();
  }
  c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
  c.addEventListener('lostpointercapture',(event)=>{if(state.mapPointers.has(event.pointerId))end(event);});
  c.addEventListener('wheel',(event)=>{
    event.preventDefault();
    const factor=Math.exp(-event.deltaY*.001);
    zoomMap(pointerPosition(event,c),factor);
    save();
  },{passive:false});
}
function timeFromX(x,window=state.window) {
  const w=state.sizes.time.width;
  return window[0]+clamp((x-13)/Math.max(1,w-26),0,1)*span(window);
}
function registerTimePointers(){
  const surface=ui.scrub;
  surface.addEventListener('pointerdown',(event)=>{
    if(event.button!==0 && event.pointerType==='mouse')return;
    surface.setPointerCapture(event.pointerId);
    state.timePointers.set(event.pointerId,pointerPosition(event,surface));
    setPlaying(false);
    if(state.timePointers.size===1){
      seek(timeFromX(pointerPosition(event,surface).x));
    } else if(state.timePointers.size===2){
      const pts=[...state.timePointers.values()];
      const mid=(pts[0].x+pts[1].x)/2;
      state.timePinch={distance:Math.max(4,Math.abs(pts[0].x-pts[1].x)),
        window:[...state.window],anchor:timeFromX(mid)};
    }
  });
  surface.addEventListener('pointermove',(event)=>{
    if(!state.timePointers.has(event.pointerId))return;
    state.timePointers.set(event.pointerId,pointerPosition(event,surface));
    if(state.timePointers.size===1){
      seek(timeFromX(pointerPosition(event,surface).x));
    }else if(state.timePointers.size===2 && state.timePinch){
      const pts=[...state.timePointers.values()];
      const distance=Math.max(4,Math.abs(pts[0].x-pts[1].x));
      const zoom=state.timePinch.distance/distance;
      state.window=zoomWindow(state.story.range,state.timePinch.window,state.timePinch.anchor,zoom);
      refresh();
    }
  });
  const end=(event)=>{
    if(!state.timePointers.has(event.pointerId))return;
    state.timePointers.delete(event.pointerId);
    if(state.timePointers.size<2)state.timePinch=null;
    save();
  };
  surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);
  surface.addEventListener('lostpointercapture',end);
  surface.addEventListener('wheel',(event)=>{
    if(event.ctrlKey||event.shiftKey||Math.abs(event.deltaY)>5){
      event.preventDefault();
      const anchor=timeFromX(pointerPosition(event,surface).x);
      state.window=zoomWindow(state.story.range,state.window,anchor,event.deltaY<0?.8:1.25);
      refresh();save();
    }
  },{passive:false});
  surface.addEventListener('keydown',(event)=>{
    let handled=true;
    const delta=span(state.window)/(event.shiftKey?15:80);
    if(event.key==='ArrowRight')seek(state.time+delta);
    else if(event.key==='ArrowLeft')seek(state.time-delta);
    else if(event.key==='Home')seek(state.story.range[0]);
    else if(event.key==='End')seek(state.story.range[1]);
    else if(event.key==='PageUp'){state.window=zoomWindow(state.story.range,state.window,state.time,.5);refresh();}
    else if(event.key==='PageDown'){state.window=zoomWindow(state.story.range,state.window,state.time,2);refresh();}
    else handled=false;
    if(handled){event.preventDefault();save();}
  });
}
function wireControls() {
  document.querySelectorAll('[data-story]').forEach(button=>
    button.addEventListener('click',()=>openStory(button.dataset.story)));
  $('back').addEventListener('click',toLibrary);
  $('edit-story').addEventListener('click',()=>{if(state.story.type==='custom'){setPlaying(false);save();studioApi.edit(state.story.id);}});
  ui.play.addEventListener('click',()=>{
    if(!state.playing&&state.time>=state.story.range[1]-.0001)seek(state.story.range[0]);
    setPlaying(!state.playing);
  });
  ui.prev.addEventListener('click',()=>jumpEvent(previousEvent(state.story,state.time)));
  ui.next.addEventListener('click',()=>jumpEvent(nextEvent(state.story,state.time)));
  $('inspect-event').addEventListener('click',()=>{
    const event=eventBefore(state.story,state.time);
    if(event)openInspector('event',event);
  });
  ui.plus.addEventListener('click',()=>{zoomMap({x:state.sizes.map.width/2,y:state.sizes.map.height/2},1.4);save();});
  ui.minus.addEventListener('click',()=>{zoomMap({x:state.sizes.map.width/2,y:state.sizes.map.height/2},1/1.4);save();});
  ui.home.addEventListener('click',()=>{
    state.camera={x:state.story.world.width/2,y:state.story.world.height/2,zoom:1};
    refresh();save();
  });
  $('time-plus').addEventListener('click',()=>{state.window=zoomWindow(state.story.range,state.window,state.time,.5);refresh();save();});
  $('time-minus').addEventListener('click',()=>{state.window=zoomWindow(state.story.range,state.window,state.time,2);refresh();save();});
  ui.list.addEventListener('click',()=>{
    ui.outline.hidden=!ui.outline.hidden;ui.inspector.hidden=true;state.inspector=null;
    ui.list.setAttribute('aria-expanded',String(!ui.outline.hidden));
  });
  $('outline-close').addEventListener('click',()=>{ui.outline.hidden=true;ui.list.setAttribute('aria-expanded','false');});
  $('inspector-close').addEventListener('click',()=>{ui.inspector.hidden=true;state.inspector=null;state.dirty=true;});
  ui.tabNow.addEventListener('click',()=>{state.tab='now';updateInspector();});
  ui.tabGeneral.addEventListener('click',()=>{state.tab='general';updateInspector();});
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){
      if(studioApi?.isOpen()){$('studio-back').click();return;}
      if(!ui.outline.hidden){ui.outline.hidden=true;ui.list.setAttribute('aria-expanded','false');}
      else if(!ui.inspector.hidden){ui.inspector.hidden=true;state.inspector=null;}
      else if(!ui.viewer.hidden)toLibrary();
    }
    if(event.code==='Space' && !ui.viewer.hidden && !['BUTTON','INPUT','TEXTAREA'].includes(document.activeElement?.tagName) && document.activeElement!==ui.scrub){
      event.preventDefault();setPlaying(!state.playing);
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){setPlaying(false);save();}});
  window.addEventListener('pagehide',save);
  window.addEventListener('resize',resize);
  if('ResizeObserver' in window){
    const observer=new ResizeObserver(resize);observer.observe(ui.stage);observer.observe(ui.scrub);
  }
  registerMapPointers();registerTimePointers();
}
function frame(timestamp) {
  const dt=state.lastFrame?clamp((timestamp-state.lastFrame)/1000,0,.075):0;
  state.lastFrame=timestamp;
  if(!ui.viewer.hidden){
    if(state.playing){
      state.time=Math.min(state.story.range[1],state.time+playbackStep(state.story,state.time,state.window,dt));
      if(state.time>=state.window[1]-.000001){
        state.window=fittedWindow(state.story.range,state.time,span(state.window));
      }
      refresh();
      if(state.time>=state.story.range[1]){
        setPlaying(false);toast('Конец истории. Можно вернуться к любому событию.');
      }
      if(timestamp-state.lastSaved>1600)save();
    }
    if(state.dirty){
      renderMap();canvasTimeline();state.dirty=false;
    }
  }
  requestAnimationFrame(frame);
}
studioApi=initStudio({onOpen:openStory,onNotify:toast,builtins:stories});
wireControls();
if(stored.lastStory && (stories.some(story=>story.id===stored.lastStory)||studioApi.getStory(stored.lastStory)))openStory(stored.lastStory);
requestAnimationFrame(frame);
