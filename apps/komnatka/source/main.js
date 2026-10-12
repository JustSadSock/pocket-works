import './styles.css';
import '../../../shared/mobile-runtime.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Engine, Scene, ArcRotateCamera, Vector3, Color3, TransformNode } from '@babylonjs/core';
import { CATALOG, COLORS, byType, makeItem } from './models.js';
import { WALLS, FLOORS, PATTERNS, createRoom } from './room.js';
import { load, save, starter, sanitize, valid, dimensions, findSupport, moveWithChildren, removeWithChildren, nextId } from './state.js';

installMobileRuntime().setScrollLocked(true);
registerEnhancedUpdate({appName:'КОМНАТКА',version:'0.1.0',releaseNotes:['Первая кукольная комната: мебель, отделка, свет, сохранение и фотографии.']});

const $=id=>document.getElementById(id);
const ui={canvas:$('roomCanvas'), loading:$('loading'), loadText:$('loadText'),dock:$('dock'),catalog:$('catalog'),categories:$('categories'),finish:$('finish'),selected:$('selection'),selectedName:$('selectionName'),swatches:$('selectionColors'),status:$('saveStatus'),hint:$('hint'),toast:$('toast'),resetDialog:$('resetDialog')};
let state=load(),scene,engine,camera,room,ready=false,muted=false,selectedId=null,pending=null,drag=null,history=[],future=[],roots=new Map(),lights=[],hintSeen=false;
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
const GROUPS=[['furniture','Мебель'],['lights','Свет'],['decor','Декор'],['walls','На стены'],['finish','Отделка']];
let activeGroup='furniture',savedTimer=0,toastTimer=0,audio;
const clone=value=>JSON.parse(JSON.stringify(value));
function sound(freq=450,kind='sine',duration=.085,volume=.045) {
 if(muted)return;
 try{
  audio||=(new (window.AudioContext||window.webkitAudioContext)());
  if(audio.state==='suspended')audio.resume();
  const o=audio.createOscillator(),g=audio.createGain();
  o.type=kind;o.frequency.setValueAtTime(freq,audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*.72),audio.currentTime+duration);
  g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);
  o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration+.015);
 }catch{}
}
function toast(message) {
 ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),2350);
}
function status(message='Сохранено'){ui.status.textContent=message;}
function persist() {
 clearTimeout(savedTimer);status('Сохраняем…');
 savedTimer=setTimeout(()=>{status(save(state)?'Сохранено':'Не удалось сохранить');},240);
}
function record(before) {
 if(before===JSON.stringify(state))return;
 history.push(before);if(history.length>55)history.shift();future.length=0;persist();updateActions();
}
function mutate(fn) {const before=JSON.stringify(state);fn();record(before);refresh();}
function undo(){
 if(!history.length)return;
 future.push(JSON.stringify(state));state=sanitize(JSON.parse(history.pop()));selectedId=null;cancelPending(false);refresh();persist();sound(400);updateActions();
}
function redo(){
 if(!future.length)return;
 history.push(JSON.stringify(state));state=sanitize(JSON.parse(future.pop()));selectedId=null;cancelPending(false);refresh();persist();sound(500);updateActions();
}
function updateActions() {
 $('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length;
 $('eveningBtn').classList.toggle('active',state.evening);
 $('eveningBtn').setAttribute('aria-pressed',String(state.evening));
 $('soundBtn').setAttribute('aria-pressed',String(!muted));
 $('soundBtn').title=muted?'Включить звук':'Выключить звук';
}
function sprite(type){
 const d={
 sofa:'<rect x="4" y="11" width="24" height="13" rx="5"/><path d="M7 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4M8 24v3m16-3v3M16 12v10"/>',
 chair:'<rect x="7" y="13" width="18" height="12" rx="5"/><path d="M9 14V7a7 7 0 0 1 14 0v7M10 25v3m12-3v3"/>',
 coffee:'<path d="M4 12h24v5H4zM8 17v11m16-11v11"/>',
 shelf:'<rect x="5" y="7" width="22" height="20" rx="2"/><path d="M5 17h22M14 12h4m-4 10h4"/>',
 bed:'<path d="M4 11V6h24v5M4 11h24v14H4zM4 25v3m24-3v3M4 16h24M8 12h7m3 0h7"/>',
 stool:'<rect x="5" y="11" width="22" height="5" rx="2"/><path d="m9 16-2 12m16-12 2 12M10 23h12"/>',
 floorlamp:'<path d="M9 4h14l3 11H6zM16 15v12M9 28h14"/>',
 tablelamp:'<path d="M10 5h12l4 11H6zM16 16v10M10 27h12"/>',
 plant:'<path d="M10 21h12l-2 8h-8zM16 21V7M16 15C5 15 5 5 5 5s12-1 11 10ZM16 18c0-13 12-13 12-13s2 12-12 13Z"/>',
 rug:'<rect x="5" y="9" width="22" height="14" rx="2"/><path d="M9 9V5m4 4V5m6 4V5m4 4V5M9 23v4m4-4v4m6-4v4m4-4v4M12 13l4-2 4 2-4 6z"/>',
 books:'<path d="M5 6h6v21H5zM13 4h6v23h-6zm7 6 6-2 5 18-6 2z"/>',
 mug:'<path d="M5 9h18v16a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5zM23 11h4c6 0 5 11-4 11"/>',
 frame:'<rect x="4" y="4" width="24" height="24" rx="1"/><path d="m7 23 7-10 4 5 3-4 4 9zM20 10h.01"/>',
 window:'<rect x="5" y="3" width="22" height="26" rx="1"/><path d="M16 3v26M5 16h22"/>'
 };
 return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(d[type]||d.sofa)+'</svg>';
}
function showCatalog() {
 ui.categories.innerHTML=GROUPS.map(([key,name])=>'<button type="button" data-group="'+key+'" class="'+(key===activeGroup?'on':'')+'">'+name+'</button>').join('');
 ui.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{activeGroup=b.dataset.group;cancelPending(false);showCatalog();sound(390);}));
 ui.catalog.hidden=activeGroup==='finish';ui.finish.hidden=activeGroup!=='finish';
 $('cancelPlacement').hidden=!pending;
 $('cancelPlacementMobile').hidden=!pending;
 if(activeGroup==='finish'){renderFinish();return;}
 ui.catalog.innerHTML=CATALOG.filter(it=>it.group===activeGroup).map(it=>'<button type="button" class="item-button '+(pending?.type===it.type?'choosing':'')+'" data-type="'+it.type+'"><span class="item-drawing '+it.type+'">'+sprite(it.type)+'</span><span>'+it.name+'</span></button>').join('');
 ui.catalog.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>beginPlacement(b.dataset.type)));
}
function renderFinish(){
 ui.finish.innerHTML='<div class="finish-row"><b>Стены</b><div class="color-row">'+WALLS.map((c,i)=>'<button class="paint-chip '+(state.wallColor===i?'picked':'')+'" style="--paint:'+c+'" data-wall="'+i+'" aria-label="Цвет стены '+(i+1)+'"></button>').join('')+'</div></div>'
 +'<div class="finish-row"><b>Обои</b><div class="pattern-row">'+PATTERNS.map((p,i)=>'<button class="'+(state.pattern===p?'picked':'')+'" data-pattern="'+p+'">'+['Краска','Полоска','Цветы'][i]+'</button>').join('')+'</div></div>'
 +'<div class="finish-row"><b>Пол</b><div class="floor-row">'+FLOORS.map((f,i)=>'<button class="'+(state.floor===f?'picked':'')+'" data-floor="'+f+'">'+['Мёд','Орех','Светлый','Плитка'][i]+'</button>').join('')+'</div></div>';
 ui.finish.querySelectorAll('[data-wall]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.wallColor=Number(el.dataset.wall));sound(500);}));
 ui.finish.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.pattern=el.dataset.pattern);sound(500);}));
 ui.finish.querySelectorAll('[data-floor]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.floor=el.dataset.floor);sound(500);}));
}
function beginPlacement(type){
 if(!ready)return;
 selectedId=null;hideSelection();
 const proto={id:'preview',type,x:0,z:0,y:0,rot:0,color:type==='rug'?'#d9ad97':type==='plant'?'#c79078':COLORS[2],wall:'back',support:null,variant:0};
 if(byType[type].layer==='wall'){proto.z=-3.91;proto.y=2.58;}
 pending={type,proto,ghost:makeItem(scene,proto),valid:false};
 pending.ghost.getChildMeshes().forEach(mesh=>{mesh.isPickable=false;if(mesh.material&&mesh.material.alpha!==undefined){/* Keep original materials for readable silhouettes. */}});
 ui.hint.textContent=byType[type].layer==='wall'?'Нажми на стену, чтобы повесить':'Нажми на свободное место в комнате';
 ui.hint.classList.add('visible');showCatalog();sound(680,'sine',.06);
}
function cancelPending(show=true){
 if(!pending)return;pending.ghost?.dispose(false,false);pending=null;
 if(show)toast('Добавление отменено');
 ui.hint.classList.remove('visible');showCatalog();
}
function updateGhost(ev){
 if(!pending)return;
 const target=pickTarget(ev,pending.proto);
 if(target){Object.assign(pending.proto,target);pending.ghost.position.set(target.x,target.y,target.z);pending.ghost.rotation.y=target.rot*Math.PI/2;
  pending.valid=valid(state,pending.proto,'preview');
  pending.ghost.scaling.setAll(pending.valid?1.04:1);
  const meshes=pending.ghost.getChildMeshes(false);
  for(const mesh of meshes){mesh.visibility=pending.valid?.70:.35;}
 }else{pending.valid=false;pending.ghost.getChildMeshes(false).forEach(mesh=>mesh.visibility=.3);}
}
function hideSelection(){ui.selected.hidden=true;}
function select(id) {
 if(pending)cancelPending(false);
 selectedId=state.items.some(x=>x.id===id)?id:null;
 if(!selectedId){hideSelection();return;}
 const item=state.items.find(x=>x.id===id);
 ui.selectedName.textContent=byType[item.type].name;
 ui.selected.hidden=false;
 ui.swatches.innerHTML=COLORS.map(c=>'<button type="button" class="color-dot '+(item.color===c?'picked':'')+'" style="--paint:'+c+'" data-color="'+c+'" aria-label="Цвет '+c+'"></button>').join('');
 ui.swatches.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{mutate(()=>{const found=state.items.find(i=>i.id===selectedId);if(found)found.color=button.dataset.color;});sound(540);}));
 $('rotateBtn').disabled=item.type==='window'||item.type==='frame';
 $('duplicateBtn').disabled=false;
 sound(340,'sine',.045,.022);
}
function refresh(){
 if(!ready)return;
 room.setFinish(state);
 room.setEvening(state.evening);
 room.clearLights();lights=[];
 for(const root of roots.values())root.dispose(false,false);
 roots.clear();
 for(const it of state.items){const root=makeItem(scene,it);roots.set(it.id,root);
  if(it.type==='tablelamp'||it.type==='floorlamp')lights.push(room.addPracticalLight(new Vector3(it.x,it.y+(it.type==='floorlamp'?2.05:.55),it.z),it.type==='tablelamp'));
 }
 room.setEvening(state.evening);
 if(selectedId){const s=state.items.find(i=>i.id===selectedId);if(s)select(s.id);else{selectedId=null;hideSelection();}}
 showCatalog();updateActions();
}
function pick(ev,predicate) {
 const r=ui.canvas.getBoundingClientRect();
 return scene.pick(ev.clientX-r.left,ev.clientY-r.top,predicate);
}
function pointOnGround(ev){
 const hit=pick(ev,m=>Boolean(m.metadata?.ground));
 return hit?.hit&&hit.pickedPoint?hit.pickedPoint:null;
}
function nearest(val){return Math.round(val*4)/4;}
function pickTarget(ev,item) {
 const meta=byType[item.type];
 if(meta.layer==='wall'){
  const p=pick(ev,m=>Boolean(m.metadata?.wall));
  if(!p?.hit||!p.pickedPoint)return null;
  const wall=p.pickedMesh.metadata.wall,coord=wall==='back'?nearest(p.pickedPoint.x):nearest(p.pickedPoint.z);
  return {x:wall==='left'?-3.91:coord,z:wall==='back'?-3.91:coord,y:Math.min(3.2,Math.max(1.03,nearest(p.pickedPoint.y))),wall,rot:wall==='left'?1:0};
 }
 const ground=pointOnGround(ev);if(!ground)return null;
 const x=nearest(ground.x),z=nearest(ground.z);
 if(meta.tabletop){
  const support=findSupport(state,item,x,z);
  return {x,z,y:support?byType[support.type].top:0,support:support?.id||null,rot:item.rot};
 }
 return {x,z,y:0,rot:item.rot};
}
function startPointer(ev){
 if(!ready||ev.button>0)return;
 ui.canvas.setPointerCapture(ev.pointerId);
 if(pending){updateGhost(ev);drag={kind:'place',startX:ev.clientX,startY:ev.clientY};return;}
 const hit=pick(ev,m=>Boolean(m.metadata?.itemId));
 const id=hit?.hit?hit.pickedMesh.metadata.itemId:null;
 if(id){
  if(selectedId!==id)select(id);
  drag={kind:'move',id,startX:ev.clientX,startY:ev.clientY,moved:false,before:JSON.stringify(state),startPoint:pointOnGround(ev)};
 }else {selectedId=null;hideSelection();drag={kind:'tap'};}
}
function movePointer(ev) {
 if(!ready)return;
 if(pending){updateGhost(ev);return;}
 if(!drag||drag.kind!=='move')return;
 if(Math.hypot(ev.clientX-drag.startX,ev.clientY-drag.startY)<5&&!drag.moved)return;
 const item=state.items.find(i=>i.id===drag.id);if(!item)return;
 const target=pickTarget(ev,item);if(!target)return;
 drag.moved=true;const dx=target.x-item.x,dz=target.z-item.z;
 moveWithChildren(state,item.id,dx,dz);
 Object.assign(item,target);
 const root=roots.get(item.id);root?.position.set(item.x,item.y,item.z);if(root)root.rotation.y=item.rot*Math.PI/2;
 for(const child of state.items.filter(it=>it.support===item.id))roots.get(child.id)?.position.set(child.x,child.y,child.z);
 const ok=valid(state,item);
 if(root)root.scaling.setAll(ok?1.055:0.97);
 root?.getChildMeshes(false).forEach(mesh=>mesh.visibility=ok?1:.57);
 drag.valid=ok;
}
function endPointer(ev) {
 if(!drag)return;
 const d=drag;drag=null;
 if(d.kind==='place'&&pending){
  updateGhost(ev);
  if(pending.valid){
   const proto={...pending.proto,id:nextId()};
   const before=JSON.stringify(state);
   state.items.push(proto);
   pending.ghost.dispose(false,false);pending=null;
   record(before);refresh();select(proto.id);ui.hint.classList.remove('visible');sound(720,'triangle',.12);
   toast('Предмет на месте');
  }else {sound(180,'triangle',.10);toast(byType[pending.type].tabletop?'Нужна свободная поверхность стола':'Выбери свободное место');}
 }else if(d.kind==='move'&&d.moved){
  if(d.valid&&state.items.every(i=>i.id===d.id||i.support!==d.id||valid(state,i))){record(d.before);refresh();sound(510,'triangle',.11);}
  else{state=sanitize(JSON.parse(d.before));refresh();sound(190,'sine',.10);toast('Здесь предмет не поместится');}
 }
}
function rotateSelected() {
 const item=state.items.find(i=>i.id===selectedId);if(!item||byType[item.type].layer==='wall')return;
 const before=JSON.stringify(state),prev=clone(item),children=state.items.filter(i=>i.support===item.id).map(clone);
 moveWithChildren(state,item.id,0,0,1);item.rot=(item.rot+1)%4;
 if(!valid(state,item)||state.items.some(i=>i.support===item.id&&!valid(state,i))){
  Object.assign(item,prev);for(const old of children)Object.assign(state.items.find(x=>x.id===old.id),old);
  toast('Нет места для поворота');sound(190);return;
 }
 record(before);refresh();sound(570,'triangle');
}
function duplicateSelected(){
 const it=state.items.find(i=>i.id===selectedId);if(!it)return;
 const next={...clone(it),id:nextId(),support:it.support||null};const meta=byType[it.type];
 const offsets=meta.layer==='wall'?[-2,-1.5,-1,.75,1,1.5,2,2.5,-2.5,3,-3].map(d=>it.wall==='back'?[d,0]:[0,d]):meta.tabletop?[[0,.35],[.35,0],[0,-.35],[-.35,0],[.35,.35],[-.35,-.35]]:[[2.8,0],[-2.8,0],[0,2.8],[0,-2.8],[2.8,1.5],[-2.8,1.5],[1.5,2.8],[-1.5,-2.8]];
 const free=offsets.find(([dx,dz])=>{next.x=Math.round((it.x+dx)*4)/4;next.z=Math.round((it.z+dz)*4)/4;return valid(state,next);});
 if(!free){toast('Для копии пока нет свободного места');return;}
 const before=JSON.stringify(state);state.items.push(next);record(before);refresh();select(next.id);sound(640);
}
function removeSelected(){
 if(!selectedId)return;
 const before=JSON.stringify(state);
 state.items=removeWithChildren(state,selectedId);selectedId=null;hideSelection();
 record(before);refresh();sound(280,'sine');
}
function addEvents(){
 ui.canvas.addEventListener('pointerdown',startPointer);
 ui.canvas.addEventListener('pointermove',movePointer);
 ui.canvas.addEventListener('pointerup',endPointer);
 ui.canvas.addEventListener('pointercancel',()=>{if(drag?.kind==='move'&&drag.before){state=sanitize(JSON.parse(drag.before));refresh();}drag=null;});
 window.addEventListener('blur',()=>{if(drag?.kind==='move'&&drag.before){state=sanitize(JSON.parse(drag.before));refresh();}drag=null;persist();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(savedTimer);save(state);status('Сохранено');}});
 window.addEventListener('pagehide',()=>{clearTimeout(savedTimer);save(state);});
 $('rotateBtn').addEventListener('click',rotateSelected);
 $('duplicateBtn').addEventListener('click',duplicateSelected);
 $('deleteBtn').addEventListener('click',removeSelected);
 $('doneBtn').addEventListener('click',()=>{selectedId=null;hideSelection();sound(420);});
 $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);
 $('eveningBtn').addEventListener('click',()=>mutate(()=>{state.evening=!state.evening; sound(450);}));
 $('soundBtn').addEventListener('click',()=>{muted=!muted;updateActions();if(!muted)sound(570);});
 $('photoBtn').addEventListener('click',()=>{
  try{const link=document.createElement('a');link.download='komnatka-'+new Date().toISOString().slice(0,10)+'.png';
   engine.renderEvenInBackground=true;scene.render();link.href=ui.canvas.toDataURL('image/png');link.click();toast('Снимок сохранён');sound(810,'triangle');}
  catch{toast('Не удалось сохранить изображение');}
 });
 $('resetBtn').addEventListener('click',()=>{$('resetDialog').hidden=false;});
 $('cancelReset').addEventListener('click',()=>{$('resetDialog').hidden=true;});
 $('confirmReset').addEventListener('click',()=>{const before=JSON.stringify(state);state=starter();selectedId=null;cancelPending(false);hideSelection();record(before);refresh();$('resetDialog').hidden=true;toast('Комната восстановлена');sound(600);});
 $('cancelPlacement').addEventListener('click',()=>cancelPending(false));
 $('cancelPlacementMobile').addEventListener('click',()=>cancelPending(false));
 document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){if(!$('resetDialog').hidden)$('resetDialog').hidden=true;else if(pending)cancelPending(false);else{selectedId=null;hideSelection();}}
  if(ev.target instanceof HTMLInputElement)return;
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();}
  else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ev.preventDefault();redo();}
  else if(ev.key.toLowerCase()==='r'&&selectedId)rotateSelected();
  else if((ev.key==='Delete'||ev.key==='Backspace')&&selectedId){ev.preventDefault();removeSelected();}
 });
}
function resize(){
 if(!engine||!camera)return;
 engine.resize();
 const w=ui.canvas.clientWidth||1,h=ui.canvas.clientHeight||1,aspect=w/h;
 const top=Math.max(6.35,6.4/aspect);
 camera.orthoTop=top;camera.orthoBottom=-top;camera.orthoLeft=-top*aspect;camera.orthoRight=top*aspect;
}
function setup(){
 engine=new Engine(ui.canvas,true,{preserveDrawingBuffer:true,stencil:true,alpha:true,antialias:true});
 engine.setHardwareScalingLevel(Math.max(1,Math.min(1.7,window.devicePixelRatio>2?1.3:1)));
 scene=new Scene(engine);
 camera=new ArcRotateCamera('fixed-portrait',Math.PI/4,Math.PI/3.1,17,new Vector3(0,1.53,0),scene);
 camera.inputs.clear();camera.minZ=.1;camera.mode=1; // Orthographic, fixed toy-diorama camera.
 room=createRoom(scene);
 resize();
 addEvents();ready=true;refresh();ui.loading.classList.add('hidden');
 if(!localStorage.getItem('pocket-works:komnatka:intro')){
  ui.hint.textContent='Выбери мебель справа или перетащи предмет в комнате';
  ui.hint.classList.add('visible');setTimeout(()=>ui.hint.classList.remove('visible'),4800);
  try{localStorage.setItem('pocket-works:komnatka:intro','1');}catch{}
 }
 window.addEventListener('resize',resize);new ResizeObserver(resize).observe(ui.canvas);
 let last=0;engine.runRenderLoop(()=>{
  if(document.hidden)return;
  const now=performance.now(),interval=drag||pending?16:50;
  if(now-last<interval)return;last=now;scene.render();
 });
}
function showError(error){console.error(error);ui.loadText.textContent='Не получилось открыть комнату';$('retryBtn').hidden=false;$('retryBtn').onclick=()=>location.reload();toast('Ошибка запуска 3D-сцены');}
showCatalog();updateActions();
try{setup();}catch(error){showError(error);}
