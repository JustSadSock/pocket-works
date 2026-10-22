import './styles.css';
import '../../../shared/mobile-runtime.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Engine, Scene, ArcRotateCamera, Vector3, Color3, TransformNode, Matrix } from '@babylonjs/core';
import { CATALOG, COLORS, byType, makeItem } from './models.js';
import { createSoundscape } from './soundscape.js';
import { createMotionDirector } from './motion.js';
import { buildFurnitureThumbnails } from './thumbnails.js';
import { createPlacementGuide } from './placement-guide.js';
import { catalogGestureIntent } from './catalog-gesture.js';
import { findSurfaceTarget } from './support-target.js';
import { hardwareScale } from './render-quality.js';
import { compareMemory } from './memory-review.js';
import { ROOM_KINDS, MATERIALS, byRoomKind, recommendedFor } from './room-kinds.js';
import { createOnlineController } from './online.js';
import { roomList,activeRoomId,loadRoom,saveRoom,selectRoom,addRoom,renameRoom,deleteRoom,ROOM_CAP } from './rooms.js';
import { LAYOUTS,leftWallX } from './layout.js';
import { createStudioUI } from './studio-ui.js';
import { sceneY } from './scene-position.js';
import { WALLS, FLOORS, PATTERNS, createRoom } from './room.js';
import { load, save, starter, sanitize, valid, dimensions, findSupport, moveWithChildren, removeWithChildren, nextId } from './state.js';

installMobileRuntime().setScrollLocked(true);
registerEnhancedUpdate({appName:'КОМНАТКА',version:'1.2.0',releaseNotes:['Пять назначений комнат, 46 моделей, семь материалов, новые обои и полы, пространственные задачи жильцов и сравнение по памяти.']});

const $=id=>document.getElementById(id);
const ui={canvas:$('roomCanvas'), loading:$('loading'), loadText:$('loadText'),dock:$('dock'),catalog:$('catalog'),categories:$('categories'),finish:$('finish'),selected:$('selection'),selectedName:$('selectionName'),swatches:$('selectionColors'),status:$('saveStatus'),hint:$('hint'),toast:$('toast'),resetDialog:$('resetDialog')};
let currentRoomId=activeRoomId(),state=loadRoom(currentRoomId),scene,engine,camera,room,director,guide,ready=false,selectedId=null,pending=null,drag=null,history=[],future=[],roots=new Map();
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
const GROUPS=[['suggested','Для комнаты'],['furniture','Мебель'],['lights','Свет'],['decor','Декор'],['walls','На стены'],['finish','Отделка']];
let activeGroup='furniture',savedTimer=0,toastTimer=0,saveMessage='Сохранено';
const thumbnails=new Map();
let catalogGesture=null;
let online=null,offlineBackup=null,queuedSnapshot=null,studio=null;
let currentQuality=0,lastHomeCapture=0,homeCaptureAttempts=0;
const playerColors=['#93b3a0','#d89d81','#9f9ac8','#af9868','#7aadb6'];
const clone=value=>JSON.parse(JSON.stringify(value));
const soundscape=createSoundscape();
function sound(cue='select') {
 const key=typeof cue==='string'?cue:cue>=690?'place':cue<240?'blocked':cue<320?'delete':cue<440?'select':cue<570?'rotate':'place';
 soundscape.play(key);
}
function itemSound(item,action='place'){
 if(!item)return sound(action);
 const type=item.type;
 const cue=type==='mug'?'ceramic':type==='books'||type==='frame'?'paper':
   type==='plant'?'leaves':type==='rug'?'textile':
   type==='sofa'||type==='chair'||type==='bed'?'fabric':
   type==='floorlamp'||type==='tablelamp'?'glass':'wood';
 sound(action==='place'?cue:action);
}
function retireMissing(previous,next){
 if(!director)return;
 const kept=new Set(next.map(x=>x.id));
 for(const old of previous)if(!kept.has(old.id)){
  const root=roots.get(old.id);
  if(root){roots.delete(old.id);director.retire(old.id,root);}
 }
}
function toast(message) {
 ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),2350);
}
function status(message='Сохранено'){
 saveMessage=message;
 ui.status.textContent=online?.active?'Общая комната':saveMessage;
}
function hideHome(){
 $('homeScreen').hidden=true;
 $('menuBtn').setAttribute('aria-label','Открыть главное меню');
}
function captureHome(){
 if(!ready||!scene||!engine)return false;
 try{
  scene.render();
  const canvas=ui.canvas;
  // Test non-uniformity rather than transparency: transparent WebGL buffers
  // can still contain a real 3D model, and empty ones can be fully opaque.
  const sample=document.createElement('canvas');
  sample.width=64;sample.height=64;
  const ctx=sample.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(canvas,0,0,64,64);
  const data=ctx.getImageData(0,0,64,64).data;
  let covered=0,min=255,max=0;
  for(let i=0;i<data.length;i+=4){
   if(data[i+3]>12){covered++;const light=(data[i]+data[i+1]+data[i+2])/3;min=Math.min(min,light);max=Math.max(max,light);}
  }
  if(covered<64||max-min<12)return false;
  const image=$('homeRoomImage');
  image.onload=()=>{if(image.naturalWidth>1)image.classList.add('ready');};
  image.onerror=()=>image.classList.remove('ready');
  image.src=canvas.toDataURL('image/png');
  image.dataset.source='live-room';
  homeCaptureAttempts=0;
  return true;
 }catch(error){console.warn('Live room preview unavailable',error);return false;}
}
function updateHomePreview(){
 if(captureHome())return;
 // Saved gallery covers are photographs of the same real room too.
 const saved=roomList().find(entry=>entry.id===currentRoomId)?.preview;
 if(saved?.startsWith('data:image/')){
  const image=$('homeRoomImage');image.onload=()=>image.classList.add('ready');
  image.src=saved;image.dataset.source='saved-room';
 }
}
function showHome(){
 if(online?.active){online.open();return;}
 if(pending)cancelPending(false);
 selectedId=null;hideSelection();
 clearTimeout(savedTimer);
 if(!saveRoom(currentRoomId,state,thumbnail()))status('Не удалось сохранить');
 updateHomePreview();
 $('homeScreen').hidden=false;
}
function playHomeMode(mode){
 hideHome();
 if(mode==='solo'){sound('select');return;}
 online.open(mode,true);
 sound('select');
}
function thumbnail(){
 if(!ready||!scene)return null;
 try{scene.render();const canvas=document.createElement('canvas');canvas.width=220;canvas.height=164;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f6e9d8';ctx.fillRect(0,0,220,164);
  ctx.drawImage(ui.canvas,0,0,220,164);
  const result=canvas.toDataURL('image/jpeg',.52);return result.length<165000?result:null;}
 catch{return null;}
}
function switchSavedRoom(id){
 if(online?.active)return;
 clearTimeout(savedTimer);
 if(!saveRoom(currentRoomId,state,thumbnail())){status('Не удалось сохранить');toast('Проверь свободное место для сохранения');return;}
 if(!selectRoom(id)){toast('Не удалось переключить комнатку');return;}
 currentRoomId=id;state=loadRoom(id);
 for(const root of roots.values())root.dispose(false,false);
 roots.clear();history.length=0;future.length=0;
 selectedId=null;cancelPending(false);hideSelection();activeGroup='suggested';refresh();hideHome();toast('Комнатка открыта');
}
function createGalleryUI(){
 studio=createStudioUI({
  getState:()=>({
   records:roomList,rename:renameRoom,
   delete:id=>{const was=id===currentRoomId,done=deleteRoom(id);
    if(done&&was){currentRoomId=activeRoomId();state=loadRoom(currentRoomId);
     for(const root of roots.values())root.dispose(false,false);
     roots.clear();selectedId=null;history.length=0;future.length=0;refresh();}
    return done;},
   create:(name,layout,purpose)=>addRoom({name,layout,purpose})
  }),
  load:switchSavedRoom,
  save:()=>saveRoom(currentRoomId,state,thumbnail()),
  onClose:showHome,toast,
  photo:{
   angle:()=>({alpha:camera.alpha,beta:camera.beta}),
   setAngle:({alpha,beta})=>{camera.alpha=alpha;camera.beta=beta;scene.render();},
   capture:()=>{scene.render();return ui.canvas.toDataURL('image/png');}
  }
 });
}
function setupHome(){
 $('homeSolo').addEventListener('click',()=>playHomeMode('solo'));
 $('homeLibrary').addEventListener('click',()=>{hideHome();studio.gallery();sound('select');});
 $('homeTenants').addEventListener('click',()=>playHomeMode('tenants'));
 $('homeMemory').addEventListener('click',()=>playHomeMode('memory'));
 $('menuBtn').addEventListener('click',showHome);
}
function persist() {
 if(online?.active)return;
 clearTimeout(savedTimer);status('Сохраняем…');
 const roomId=currentRoomId,snapshot=clone(state);
 savedTimer=setTimeout(()=>{
  if(!online?.active)status(saveRoom(roomId,snapshot)?'Сохранено':'Не удалось сохранить');
 },240);
}
function record(before) {
 if(online?.active)return;
 if(before===JSON.stringify(state))return;
 history.push(before);if(history.length>55)history.shift();future.length=0;persist();updateActions();
}
function mutate(fn) {
 if(online?.active&&!online.canEdit){toast('Сначала дождитесь начала игры');return;}
 const before=JSON.stringify(state),previousEvening=state.evening;
 fn();record(before);refresh();
 if(previousEvening!==state.evening)sound('light');
}
function undo(){
 if(online?.active)return;
 if(!history.length)return;
 const previous=state.items;
 future.push(JSON.stringify(state));state=sanitize(JSON.parse(history.pop()));
 retireMissing(previous,state.items);
 selectedId=null;cancelPending(false);refresh();persist();sound('undo');updateActions();
 for(const item of state.items)if(!previous.some(prev=>prev.id===item.id))director?.appear(item.id);
}
function redo(){
 if(online?.active)return;
 if(!future.length)return;
 const previous=state.items;
 history.push(JSON.stringify(state));state=sanitize(JSON.parse(future.pop()));
 retireMissing(previous,state.items);
 selectedId=null;cancelPending(false);refresh();persist();sound('undo');updateActions();
 for(const item of state.items)if(!previous.some(prev=>prev.id===item.id))director?.appear(item.id);
}
function updateActions() {
 $('undoBtn').disabled=Boolean(online?.active)||!history.length;$('redoBtn').disabled=Boolean(online?.active)||!future.length;
 $('eveningBtn').classList.toggle('active',state.evening);
 $('stage').classList.toggle('night',state.evening);
 $('eveningBtn').setAttribute('aria-pressed',String(state.evening));
 $('soundBtn').setAttribute('aria-pressed',String(!soundscape.muted));
 $('soundBtn').title=soundscape.muted?'Включить звук':'Выключить звук';
 ui.status.textContent=online?.active?'Общая комната':saveMessage;
}
function sprite(type){
 const d={
 pillow:'<path d="M8 10Q16 7 24 10L27 14Q28 20 24 24Q16 27 8 24L5 20Q4 14 8 10Z"/><path d="M9 11q6 7 0 12m14-12q-6 7 0 12"/>',
 teddy:'<circle cx="9" cy="7" r="4"/><circle cx="23" cy="7" r="4"/><circle cx="16" cy="14" r="10"/><ellipse cx="16" cy="25" rx="9" ry="6"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
 vase:'<path d="M10 5h12M12 5c0 6-4 9-4 15 0 6 4 9 8 9s8-3 8-9c0-6-4-9-4-15M9 21h14"/>',
 basket:'<path d="M5 15h22l-3 13H8Z"/><path d="M11 15q0-12 5-12t5 12M9 20h14M11 25h10"/>',
 cactus:'<path d="M11 24V8a5 5 0 0 1 10 0v16M11 18H8c-3 0-3-5-3-8m16 7h3c3 0 3-5 3-8M8 24h16l-2 5H10Z"/>',
 candle:'<path d="M11 14h10v14H11zM16 14V9M16 3q7 6 0 8-7-2 0-8Z"/>',
 deskclock:'<circle cx="16" cy="18" r="10"/><path d="M16 11v7l5 3M8 7 5 10m19-3 3 3M10 29l-2 2m14-2 2 2"/>',
 teapot:'<path d="M7 13h18v10q-1 7-9 7t-9-7ZM10 13q1-7 6-7t6 7M15 5V3M25 16h4q3 6-4 9M7 17 2 15v7l5 1"/>',
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
 return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(d[type]||d[({table:'coffee',lamp:'floorlamp',shelf:'shelf',plant:'plant',mug:'mug',rug:'rug',frame:'frame'})[byType[type]?.icon]]||d.sofa)+'</svg>';
}
function showCatalog() {
 ui.categories.innerHTML=GROUPS.map(([key,name])=>'<button type="button" data-group="'+key+'" class="'+(key===activeGroup?'on':'')+'">'+name+'</button>').join('');
 ui.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{activeGroup=b.dataset.group;cancelPending(false);showCatalog();sound('select');}));
 ui.catalog.hidden=activeGroup==='finish';ui.finish.hidden=activeGroup!=='finish';
 $('cancelPlacement').hidden=!pending;
 $('cancelPlacementMobile').hidden=!pending;
 if(activeGroup==='finish'){renderFinish();return;}
 ui.catalog.innerHTML=CATALOG.filter(it=>activeGroup==='suggested'?recommendedFor(state.purpose,it.type):it.group===activeGroup).map(it=>'<button type="button" class="item-button '+(pending?.type===it.type?'choosing':'')+'" data-type="'+it.type+'"><span class="item-drawing '+it.type+'" data-image-type="'+it.type+'">'+(thumbnails.has(it.type)?'<img class="actual-thumbnail" src="'+thumbnails.get(it.type)+'" alt="">':sprite(it.type))+'</span><span>'+it.name+'</span></button>').join('');
 ui.catalog.querySelectorAll('button').forEach(b=>{
  b.addEventListener('pointerdown',catalogPointerDown);
  // A pointer release is handled by catalogPointerUp, not a synthetic click.
  b.addEventListener('click',ev=>{if(ev.detail===0)beginPlacement(b.dataset.type);});
 });
}
function renderFinish(){
 const PATTERN_NAMES=['Краска','Полоска','Цветы','Клетка','Ягодки','Звёзды','Ромашки','Горошек','Веточки','Лён','Штукатурка','Панели'];
 const FLOOR_NAMES=['Мёд','Орех','Светлый','Плитка','Розовый','Вишня','Ёлочка','Терраццо'];
 const chips=(key,attr)=>'<div class="color-row">'+WALLS.map((c,i)=>'<button class="paint-chip '+(state[key]===i?'picked':'')+'" style="--paint:'+c+'" data-'+attr+'="'+i+'" title="Цвет '+(i+1)+'"></button>').join('')+'</div>';
 const patterns=(key,attr)=>'<div class="pattern-row">'+PATTERNS.map((p,i)=>'<button class="'+(state[key]===p?'picked':'')+'" data-'+attr+'="'+p+'">'+PATTERN_NAMES[i]+'</button>').join('')+'</div>';
 ui.finish.innerHTML='<div class="finish-row"><b>Задняя стена</b>'+chips('wallColor','wall')+patterns('pattern','pattern')+'</div>'+
 '<div class="finish-row"><b>Боковая стена</b>'+chips('wallColorLeft','wall-left')+patterns('patternLeft','pattern-left')+'</div>'+
 '<div class="finish-row"><b>Пол</b><div class="floor-row">'+FLOORS.map((f,i)=>'<button class="'+(state.floor===f?'picked':'')+'" data-floor="'+f+'">'+FLOOR_NAMES[i]+'</button>').join('')+'</div></div>'+
 '<div class="finish-row"><b>Назначение</b><div class="room-kind-choices">'+ROOM_KINDS.map(kind=>'<button data-purpose="'+kind.id+'" class="'+(state.purpose===kind.id?'picked':'')+'">'+kind.name+'</button>').join('')+'</div></div>'+ 
  '<div class="finish-row"><b>Планировка</b><div class="floor-row">'+LAYOUTS.map(l=>'<button data-layout="'+l.id+'" class="'+(state.layout===l.id?'picked':'')+'">'+l.name+'</button>').join('')+'</div></div>';
 for(const [attr,key] of [['wall','wallColor'],['wall-left','wallColorLeft'],['pattern','pattern'],['pattern-left','patternLeft'],['floor','floor']])
  ui.finish.querySelectorAll('[data-'+attr+']').forEach(el=>el.addEventListener('click',()=>{
   const value=attr.startsWith('wall')?Number(el.getAttribute('data-'+attr)):el.getAttribute('data-'+attr);
   mutate(()=>{state[key]=value;});if(online?.active)online.send({type:'decorate',patch:{[key]:value}});
   sound('paint');
  }));
 ui.finish.querySelectorAll('[data-purpose]').forEach(el=>el.addEventListener('click',()=>{
  if(online?.active){toast('Назначение общей комнаты выбирается до раунда');return;}
  const next=el.dataset.purpose;if(state.purpose===next)return;
  mutate(()=>{state.purpose=next;});activeGroup='suggested';showCatalog();
  toast('Теперь '+byRoomKind[next].name.toLowerCase());sound('paint');
 }));
 ui.finish.querySelectorAll('[data-layout]').forEach(el=>el.addEventListener('click',()=>{
  if(online?.active){toast('Планировку онлайн-раунда выбирает сервер');return;}
  const next=el.dataset.layout;
  if(next===state.layout)return;
  const draft={...state,layout:next,items:state.items.map(item=>
   byType[item.type]?.layer==='wall'&&item.wall==='left'?{...item,x:leftWallX(next)}:{...item})};
  if(draft.items.some(item=>!valid(draft,item))){
   toast('Некоторые вещи не помещаются. Убери их или создай новую комнатку.');return;
  }
  mutate(()=>{state.layout=next;state.items=draft.items;});
  toast('Комнатка поменяла форму');sound('place');
 }));
}
function placementPalette(){
 const container=$('placementControls');
 container.hidden=!pending;
 if(!pending)return;
 const {proto,type}=pending;
 $('placementTitle').textContent='Подготовить: '+byType[type].name.toLowerCase();
 $('previewRotate').disabled=byType[type].layer==='wall';
 $('placementColors').innerHTML=COLORS.map(c=>'<button type="button" class="color-dot '+(proto.color===c?'picked':'')+'" style="--paint:'+c+'" data-preview-color="'+c+'" aria-label="Цвет '+c+'"></button>').join('');
 const choices=$('placementMaterials');
 choices.innerHTML=MATERIALS.map(m=>'<button type="button" data-preview-material="'+m.id+'" class="'+(proto.material===m.id?'picked':'')+'">'+m.name+'</button>').join('');
 choices.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  if(!pending)return;
  pending.proto.material=b.dataset.previewMaterial;
  const enabled=pending.previewReady;
  pending.ghost.dispose(false,false);pending.ghost=makeItem(scene,pending.proto);
  pending.rotAnim=null;pending.ghost.getChildMeshes(false).forEach(mesh=>{mesh.isPickable=false;mesh.visibility=pending.valid?1:.5;});
  pending.ghost.setEnabled(Boolean(enabled));placementPalette();sound('paint');
 }));
 $('placementColors').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
  if(!pending)return;pending.proto.color=button.dataset.previewColor;
  const enabled=pending.previewReady;
  pending.ghost.dispose(false,false);
  pending.ghost=makeItem(scene,pending.proto);
  pending.rotAnim=null;
  pending.ghost.getChildMeshes(false).forEach(mesh=>{mesh.isPickable=false;mesh.visibility=pending.valid?1:.5;});
  pending.ghost.setEnabled(Boolean(enabled));
  placementPalette();sound('paint');
 }));
}
function beginPlacement(type,fromCatalogDrag=false){
 if(!ready)return;
 if(online?.active&&!online.canEdit){toast('Редактор доступен после начала раунда');return;}
 if(pending)cancelPending(false);
 selectedId=null;hideSelection();
 const proto={id:'preview',type,x:0,z:0,y:0,rot:0,material:'linen',color:type==='rug'?'#d9ad97':type==='plant'?'#c79078':COLORS[2],wall:'back',support:null,variant:0};
 if(byType[type].layer==='wall'){proto.z=-3.91;proto.y=2.58;}
 pending={type,proto,ghost:makeItem(scene,proto),valid:false,previewReady:false};
 pending.ghost.getChildMeshes(false).forEach(mesh=>{mesh.isPickable=false;});
 pending.ghost.setEnabled(false); // No ghost bleeding through the furnished room until a valid target is known.
 ui.hint.textContent=byType[type].layer==='wall'?'Коснись стены, чтобы повесить':'Коснись места в комнате, чтобы поставить';
 ui.hint.classList.add('visible');placementPalette();if(!fromCatalogDrag)showCatalog();sound('lift');
}
function cancelPending(show=true){
 if(!pending)return;
 pending.ghost?.dispose(false,false);pending=null;hideGuide();placementPalette();
 if(show)toast('Добавление отменено');
 ui.hint.classList.remove('visible');showCatalog();
}
function updateGhost(ev){
 if(!pending)return;
 const target=pickTarget(ev,pending.proto);
 if(!target){
  pending.valid=false;pending.previewReady=false;pending.ghost.setEnabled(false);hideGuide();
  return;
 }
 Object.assign(pending.proto,target);
 pending.valid=valid(state,pending.proto,'preview');
 pending.previewReady=true;
 pending.ghost.setEnabled(true);
 pending.ghost.position.set(target.x,target.y,target.z);
 if(!pending.rotAnim)pending.ghost.rotation.y=target.rot*Math.PI/2;
 pending.ghost.scaling.setAll(pending.valid?1.025:1);
 for(const mesh of pending.ghost.getChildMeshes(false))mesh.visibility=pending.valid?1:.46;
  showGuide(pending.proto,pending.valid);
}
function rotatePlacement(){
 if(!pending||byType[pending.type].layer==='wall')return;
 pending.proto.rot=(pending.proto.rot+1)%4;
 pending.valid=pending.previewReady&&valid(state,pending.proto,'preview');
 pending.rotAnim={from:pending.ghost.rotation.y,to:pending.proto.rot*Math.PI/2,start:performance.now()};
 pending.ghost.getChildMeshes(false).forEach(mesh=>mesh.visibility=pending.valid?1:.46);
  if(pending.previewReady)showGuide(pending.proto,pending.valid);
 sound('rotate');
}
let expandedMaterials=false;
function hideSelection(){ui.selected.hidden=true;expandedMaterials=false;$('selectionMaterials').hidden=true;}
function select(id) {
 if(pending)cancelPending(false);
 if(selectedId!==id)expandedMaterials=false;
 selectedId=state.items.some(x=>x.id===id)?id:null;
 if(!selectedId){hideSelection();return;}
 const item=state.items.find(x=>x.id===id);
 ui.selectedName.textContent=byType[item.type].name;
 ui.selected.hidden=false;
 ui.swatches.innerHTML=COLORS.map(c=>'<button type="button" class="color-dot '+(item.color===c?'picked':'')+'" style="--paint:'+c+'" data-color="'+c+'" aria-label="Цвет '+c+'"></button>').join('');
 ui.swatches.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{const id=selectedId;mutate(()=>{const found=state.items.find(i=>i.id===id);if(found)found.color=button.dataset.color;});if(online?.active)online.send({type:'edit',id,patch:{color:button.dataset.color}});director?.touch(id);sound('paint');}));
 const materials=$('selectionMaterials');
 materials.hidden=!expandedMaterials;
 $('materialToggle').setAttribute('aria-expanded',String(expandedMaterials));
 materials.innerHTML=MATERIALS.map(m=>'<button type="button" data-material="'+m.id+'" class="'+(item.material===m.id?'picked':'')+'">'+m.name+'</button>').join('');
 materials.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  const id=selectedId,material=b.dataset.material;
  mutate(()=>{const found=state.items.find(i=>i.id===id);if(found)found.material=material;});
  if(online?.active)online.send({type:'edit',id,patch:{material}});
  sound('paint');
 }));
 $('rotateBtn').disabled=item.type==='window'||item.type==='frame';
 $('duplicateBtn').disabled=false;

}
function refresh(){
 if(!ready)return;
 room.setFinish(state);
 room.setEvening(state.evening);
 const present=new Set();
 let changed=false;
 for(const item of state.items){
  present.add(item.id);
  const signature=[item.type,item.color,item.variant,item.material].join('|');
  let root=roots.get(item.id);
  if(!root || root.metadata?.appearance!==signature){
   if(root)root.dispose(false,false);
   root=makeItem(scene,item);
   root.metadata={appearance:signature};
   roots.set(item.id,root);changed=true;
  }
  root.position.set(item.x,sceneY(item),item.z);
  root.rotation.y=item.rot*Math.PI/2;
  root.scaling.setAll(1);
  root.getChildMeshes(false).forEach(mesh=>mesh.visibility=1);
 }
 for(const [id,root] of roots){
  if(!present.has(id)){root.dispose(false,false);roots.delete(id);changed=true;}
 }
 if(changed)room.setShadowCasters(roots,state.items);
 room.syncPracticalLights(state.items);
 if(selectedId){
  const item=state.items.find(i=>i.id===selectedId);
  if(item)select(item.id);else{selectedId=null;hideSelection();}
 }
 showCatalog();updateActions();
}
function memoryReviewPhoto(items,finishes){
 const saved=state;
 try{
  state=sanitize({...finishes,items});
  refresh();scene.render();
  const thumb=document.createElement('canvas'),context=thumb.getContext('2d');
  thumb.width=440;
  thumb.height=Math.round(440*ui.canvas.height/Math.max(1,ui.canvas.width));
  context.fillStyle='#f3e6d4';context.fillRect(0,0,thumb.width,thumb.height);
  context.drawImage(ui.canvas,0,0,thumb.width,thumb.height);
  return thumb.toDataURL('image/jpeg',.91);
 }catch(error){console.warn('Comparison photograph unavailable',error);return null;}
 finally{state=saved;refresh();}
}
function produceMemoryReview(snapshot){
 const summary=compareMemory(snapshot.target||[],snapshot.items||[]);
 const finishes={...(snapshot.finishes||{}),layout:snapshot.layout||'classic',purpose:snapshot.purpose||'living'};
 const assembled=memoryReviewPhoto(snapshot.items||[],finishes);
 const model=memoryReviewPhoto(snapshot.target||[],{...finishes,...(snapshot.targetFinishes||{})});
 scene.render();
 return {summary,assembled,model};
}
function onOnlineRoom(snapshot,{reference,phaseChanged}={}){
 if(!snapshot)return;
 if(drag?.kind==='move'){queuedSnapshot={snapshot,reference,phaseChanged};return;}
 const before=new Map(state.items.map(item=>[item.id,{...item}]));
 const finishes={...(snapshot.finishes||{wallColor:0,pattern:'plain',floor:'honey',evening:false}),...(reference&&snapshot.targetFinishes||{}),layout:snapshot.layout||'classic',purpose:snapshot.purpose||'living'};
 const items=(reference?snapshot.target:snapshot.items)||[];
 state=sanitize({...finishes,items});
 selectedId=state.items.some(i=>i.id===selectedId)?selectedId:null;
 refresh();
 for(const item of state.items){
  const old=before.get(item.id);
  if(!old&&!reference&&snapshot.phase==='build')director?.appear(item.id);
  else if(old&&!reference&&(old.x!==item.x||old.z!==item.z||old.rot!==item.rot)&&snapshot.phase==='build')
   director?.land(item.id);
 }
 if(snapshot.phase==='result'&&snapshot.mode==='memory'&&phaseChanged&&Array.isArray(snapshot.target))
  return produceMemoryReview(snapshot);
}
let sharedPresence={},sharedPlayers=[],sharedMe=null;
function updateOnlinePresence(selections,players,me){
 sharedPresence=selections;sharedPlayers=players;sharedMe=me;
 drawOnlineMarkers();
}
function drawOnlineMarkers(){
 const holder=$('onlineMarkers');
 if(!holder||!online?.active||online.phase!=='build'){
  if(holder)holder.replaceChildren();
  return;
 }
 const stage=$('stage').getBoundingClientRect(),canvas=ui.canvas.getBoundingClientRect();
 if(!stage.width||!canvas.width)return;
 holder.replaceChildren();
 const viewport=camera.viewport.toGlobal(ui.canvas.width,ui.canvas.height);
 for(const [id,mark] of Object.entries(sharedPresence)){
  if(id===sharedMe||!mark?.id)continue;
  const index=sharedPlayers.findIndex(p=>p.id===id),player=sharedPlayers[index];
  const item=state.items.find(x=>x.id===mark.id);
  if(!player||!item)continue;
  const loc=Vector3.Project(new Vector3(item.x,item.y+(item.type==='floorlamp'?2.40:item.type==='plant'?1.6:item.type==='sofa'?1.5:item.type==='bed'?1.1:.85),item.z),Matrix.Identity(),scene.getTransformMatrix(),viewport);
  const x=canvas.left-stage.left+loc.x*canvas.width/ui.canvas.width;
  const y=canvas.top-stage.top+loc.y*canvas.height/ui.canvas.height;
  if(x<0||y<0||x>stage.width||y>stage.height)continue;
  const tag=document.createElement('div');
  tag.className='online-marker';tag.style.left=x+'px';tag.style.top=y+'px';
  tag.style.setProperty('--marker-color',playerColors[Math.max(index,0)%playerColors.length]);
  tag.textContent=player.name+' · '+(mark.action==='move'?'двигает':mark.action==='rotate'?'поворачивает':mark.action==='paint'?'красит':'выбрал')+' '+(byType[item.type]?.name?.toLowerCase()||'предмет');
  holder.appendChild(tag);
 }
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
  return {x:wall==='left'?leftWallX(state.layout):coord,z:wall==='back'?-3.91:coord,y:Math.min(3.2,Math.max(1.03,nearest(p.pickedPoint.y))),wall,rot:wall==='left'?1:0};
 }
 if(meta.tabletop){
  const rect=ui.canvas.getBoundingClientRect();
  const ray=scene.createPickingRay(ev.clientX-rect.left,ev.clientY-rect.top,Matrix.Identity(),camera);
  const supports=state.items.filter(part=>byType[part.type]?.top).map(part=>({
   id:part.id,x:part.x,z:part.z,top:byType[part.type].top,size:dimensions(part)
  }));
  const surface=findSurfaceTarget(ray,supports,item.id);
  if(surface)return {x:nearest(surface.x),z:nearest(surface.z),y:surface.y,support:surface.support,rot:item.rot};
 }
 const ground=pointOnGround(ev);if(!ground)return null;
 return {x:nearest(ground.x),z:nearest(ground.z),y:0,support:null,rot:item.rot};
}
function trashHovered(ev){
 const r=$('stage').getBoundingClientRect();
 return ev.clientX>=r.right-102 && ev.clientX<=r.right+58 &&
 ev.clientY>r.top+54 && ev.clientY<r.bottom-50;
}
function hideTrash(){
 $('trashZone').hidden=true;$('trashZone').classList.remove('hover');
}
function showGuide(item,allowed){
 if(!guide)return;
 const meta=byType[item.type],[width,depth]=dimensions(item);
 guide.show({x:item.x,z:item.z,y:meta.tabletop?item.y:0,width,depth,valid:allowed,wall:meta.layer==='wall'});
 ui.hint.classList.toggle('invalid',!allowed);
 if(allowed)ui.hint.classList.remove('visible');
 else{
  ui.hint.textContent=meta.tabletop&&!item.support?'Наведи на поверхность мебели':'Здесь нет свободного места';
  ui.hint.classList.add('visible');
 }
}
function hideGuide(){
 guide?.hide();ui.hint.classList.remove('invalid');
 if(!pending)ui.hint.classList.remove('visible');
}
function catalogPointerDown(ev){
 if(!ready||ev.button>0||activeGroup==='finish'||catalogGesture)return;
 if(online?.active&&!online.canEdit){toast('Ждём начала обустройства');return;}
 const stage=$('stage').getBoundingClientRect(),rect=ui.catalog.getBoundingClientRect();
 const portraitDock=rect.top>=stage.bottom-12;
 catalogGesture={pointerId:ev.pointerId,type:ev.currentTarget.dataset.type,startX:ev.clientX,
  startY:ev.clientY,lastX:ev.clientX,lastY:ev.clientY,portraitDock,dragging:false,scrolling:false};
 try{ui.dock.setPointerCapture(ev.pointerId);}catch{}
}
function catalogPointerMove(ev){
 const g=catalogGesture;if(!g||g.pointerId!==ev.pointerId)return;
 const dx=ev.clientX-g.startX,dy=ev.clientY-g.startY;
 if(!g.dragging&&!g.scrolling){
  const intent=catalogGestureIntent(dx,dy,g.portraitDock);
  if(intent==='scroll')g.scrolling=true;
  if(intent==='drag'){
   g.dragging=true;beginPlacement(g.type,true);
   if(!pending){catalogGesture=null;return;}
   drag={kind:'place',fromCatalog:true,pointerId:ev.pointerId,startX:g.startX,startY:g.startY};
  }
 }
 if(g.scrolling){
  if(g.portraitDock)ui.catalog.scrollLeft-=ev.clientX-g.lastX;
  else ui.catalog.scrollTop-=ev.clientY-g.lastY;
 }else if(g.dragging)updateGhost(ev);
 g.lastX=ev.clientX;g.lastY=ev.clientY;
}
function catalogPointerUp(ev){
 const g=catalogGesture;if(!g||g.pointerId!==ev.pointerId)return;
 catalogGesture=null;
 try{if(ui.dock.hasPointerCapture(ev.pointerId))ui.dock.releasePointerCapture(ev.pointerId);}catch{}
 if(g.scrolling)return;
 if(!g.dragging){beginPlacement(g.type);return;}
 const bounds=ui.canvas.getBoundingClientRect();
 const overStage=ev.clientX>=bounds.left&&ev.clientX<=bounds.right&&ev.clientY>=bounds.top&&ev.clientY<=bounds.bottom;
 if(overStage)endPointer(ev);
 else{drag=null;cancelPending(false);}
}
function catalogPointerCancel(ev){
 if(!catalogGesture||ev.pointerId!==catalogGesture.pointerId)return;
 catalogGesture=null;
 if(drag?.fromCatalog){drag=null;cancelPending(false);}
}
function startPointer(ev){
 if(!ready||ev.button>0||drag)return;
 if(online?.active&&!online.canEdit){toast('Ждём начала обустройства');return;}
 ui.canvas.setPointerCapture(ev.pointerId);
 if(pending){updateGhost(ev);drag={kind:'place',pointerId:ev.pointerId,startX:ev.clientX,startY:ev.clientY};return;}
 const hit=pick(ev,m=>Boolean(m.metadata?.itemId));
 const id=hit?.hit?hit.pickedMesh.metadata.itemId:null;
 if(id){
  if(selectedId!==id)select(id);
  online?.active&&online.select(id,'move');
  director?.lift(id);sound('lift');
  drag={kind:'move',id,pointerId:ev.pointerId,startX:ev.clientX,startY:ev.clientY,moved:false,before:JSON.stringify(state),startPoint:pointOnGround(ev),cell:null};
 }else {selectedId=null;hideSelection();drag={kind:'tap',pointerId:ev.pointerId};}
}
function movePointer(ev) {
 if(!ready||drag&&drag.pointerId!==undefined&&drag.pointerId!==ev.pointerId)return;
 if(pending){updateGhost(ev);return;}
 if(!drag||drag.kind!=='move')return;
 if(Math.hypot(ev.clientX-drag.startX,ev.clientY-drag.startY)<5&&!drag.moved)return;
 const item=state.items.find(i=>i.id===drag.id);if(!item)return;
 drag.moved=true;
 $('trashZone').hidden=false;
 drag.trash=trashHovered(ev);
 $('trashZone').classList.toggle('hover',Boolean(drag.trash));
 if(drag.trash){drag.valid=false;guide?.hide();director?.drag(item.id,0,0,false);return;}
 const target=pickTarget(ev,item);if(!target){drag.valid=false;showGuide(item,false);return;}
 drag.moved=true;const dx=target.x-item.x,dz=target.z-item.z;
 moveWithChildren(state,item.id,dx,dz);
 Object.assign(item,target);
 const root=roots.get(item.id);root?.position.set(item.x,sceneY(item),item.z);if(root)root.rotation.y=item.rot*Math.PI/2;
 for(const child of state.items.filter(it=>it.support===item.id))roots.get(child.id)?.position.set(child.x,sceneY(child),child.z);
 const ok=valid(state,item)&&state.items.every(child=>child.support!==item.id||valid(state,child));
 if(ok){
  const cell=item.x+':'+item.z+':'+(item.support||'');
  drag.cell=cell;
 }
 director?.drag(item.id,dx,dz,ok);
  showGuide(item,ok);
 drag.valid=ok;
}
function endPointer(ev) {
 if(!drag||drag.pointerId!==undefined&&drag.pointerId!==ev.pointerId)return;
 const d=drag;drag=null;hideTrash();hideGuide();
 if(d.kind==='move'&&d.moved&&d.trash){
  if(online?.active){
   if(!online.send({type:'delete',id:d.id}))toast('Нет соединения с комнатой');
   return; // The server owns the shared scene; wait for its authoritative update.
  }
  const previous=state.items;
  state.items=removeWithChildren(state,d.id);
  retireMissing(previous,state.items);
  selectedId=null;hideSelection();record(d.before);refresh();
  sound('delete');
  return;
 }
 if(d.kind==='place'&&pending){
  updateGhost(ev);
  if(pending.valid){
   const proto={...pending.proto,id:nextId()};
   const before=JSON.stringify(state);
   if(online?.active){
    if(!online.send({type:'add',item:proto})){toast('Нет соединения с комнатой');return;}
    cancelPending(false);sound('place');ui.hint.classList.remove('visible');
   }else{
    state.items.push(proto);cancelPending(false);
    record(before);refresh();select(proto.id);
    director?.appear(proto.id);itemSound(proto);
   }
  }else{
   sound('blocked');
   toast(byType[pending.type].tabletop?'Нужна свободная поверхность стола':'Выбери свободное место');
   if(d.fromCatalog)cancelPending(false);
  }
 }else if(d.kind==='move'&&d.moved){
  if(d.valid&&state.items.every(i=>i.id===d.id||i.support!==d.id||valid(state,i))){
   if(online?.active){
    const changed=state.items.find(i=>i.id===d.id);
    if(!online.send({type:'edit',id:d.id,patch:{x:changed.x,z:changed.z,y:changed.y,rot:changed.rot,support:changed.support}})){
     state=sanitize(JSON.parse(d.before));toast('Нет соединения с комнатой');
    }
   }
   record(d.before);refresh();
   director?.land(d.id);
   itemSound(state.items.find(i=>i.id===d.id));
  }else{
   state=sanitize(JSON.parse(d.before));refresh();
   director?.refuse(d.id);sound('blocked');
   toast('Здесь предмет не поместится');
  }
 }else if(d.kind==='move'&&!d.moved){
  director?.touch(d.id);
 }
 if(d.kind==='move'&&online?.active)online.send({type:'select',id:''});
}
function rotateSelected() {
 const item=state.items.find(i=>i.id===selectedId);if(!item||byType[item.type].layer==='wall')return;
 const before=JSON.stringify(state),prev=clone(item),children=state.items.filter(i=>i.support===item.id).map(clone);
 moveWithChildren(state,item.id,0,0,1);item.rot=(item.rot+1)%4;
 if(!valid(state,item)||state.items.some(i=>i.support===item.id&&!valid(state,i))){
  Object.assign(item,prev);for(const old of children)Object.assign(state.items.find(x=>x.id===old.id),old);
  director?.refuse(item.id);toast('Нет места для поворота');sound('blocked');return;
 }
 if(online?.active&&!online.send({type:'edit',id:item.id,patch:{rot:item.rot}})){
  Object.assign(item,prev);for(const old of children)Object.assign(state.items.find(x=>x.id===old.id),old);
  refresh();toast('Нет соединения с комнатой');return;
 }
 record(before);refresh();
 director?.rotate(item.id,(item.rot*Math.PI/2)-Math.PI/2);
 for(const child of children)director?.rotate(child.id,child.rot*Math.PI/2,{x:child.x,z:child.z});
 sound('rotate');
}
function duplicateSelected(){
 const it=state.items.find(i=>i.id===selectedId);if(!it)return;
 const next={...clone(it),id:nextId(),support:it.support||null};const meta=byType[it.type];
 const offsets=meta.layer==='wall'?[-2,-1.5,-1,.75,1,1.5,2,2.5,-2.5,3,-3].map(d=>it.wall==='back'?[d,0]:[0,d]):meta.tabletop?[[0,.35],[.35,0],[0,-.35],[-.35,0],[.35,.35],[-.35,-.35]]:[[2.8,0],[-2.8,0],[0,2.8],[0,-2.8],[2.8,1.5],[-2.8,1.5],[1.5,2.8],[-1.5,-2.8]];
 const free=offsets.find(([dx,dz])=>{next.x=Math.round((it.x+dx)*4)/4;next.z=Math.round((it.z+dz)*4)/4;return valid(state,next);});
 if(!free){toast('Для копии пока нет свободного места');return;}
 if(online?.active){online.send({type:'add',item:next});return;}
 const before=JSON.stringify(state);state.items.push(next);record(before);refresh();select(next.id);director?.appear(next.id);itemSound(next);
}
function removeSelected(){
 if(!selectedId)return;
 if(online?.active){if(!online.send({type:'delete',id:selectedId}))toast('Нет соединения с комнатой');return;}
 const before=JSON.stringify(state),previous=state.items;
 state.items=removeWithChildren(state,selectedId);retireMissing(previous,state.items);
 selectedId=null;hideSelection();record(before);refresh();sound('delete');
}
function switchDollhouseLighting(){
 if(online?.active&&!online.canEdit){
  toast('Свет можно менять во время обустройства');
  return;
 }
 // Important regression guard: an atmosphere change NEVER calls refresh(),
 // reassigns item transforms, recreates meshes or resets pointer selection.
 // All light animation is owned by room.tickLighting().
 const before=JSON.stringify(state);
 state.evening=!state.evening;
 room.setEvening(state.evening);
 record(before);
 updateActions();
 sound('light');
 if(online?.active)online.send({type:'decorate',patch:{evening:state.evening}});
}
function addEvents(){
 document.addEventListener('pointermove',catalogPointerMove);
  document.addEventListener('pointerup',catalogPointerUp);
  document.addEventListener('pointercancel',catalogPointerCancel);
  ui.canvas.addEventListener('pointerdown',startPointer);
 ui.canvas.addEventListener('pointermove',movePointer);
 ui.canvas.addEventListener('pointerup',ev=>{
  endPointer(ev);
  // Remote edits received mid-drag are delayed so they cannot steal the pointer.
  // Apply the newest authoritative snapshot as soon as the gesture ends.
  if(queuedSnapshot){const latest=queuedSnapshot;queuedSnapshot=null;onOnlineRoom(latest.snapshot,latest);}
 });
 ui.canvas.addEventListener('pointercancel',ev=>{
  if(drag?.pointerId!==undefined&&drag.pointerId!==ev.pointerId)return;
  if(drag?.kind==='move'&&drag.before){const id=drag.id;state=sanitize(JSON.parse(drag.before));refresh();director?.reset(id);online?.active&&online.send({type:'select',id:''});}
  drag=null;hideTrash();hideGuide();
  if(queuedSnapshot){const latest=queuedSnapshot;queuedSnapshot=null;onOnlineRoom(latest.snapshot,latest);}
 });
 window.addEventListener('blur',()=>{
  if(drag?.kind==='move'&&drag.before){const id=drag.id;state=sanitize(JSON.parse(drag.before));refresh();director?.reset(id);online?.active&&online.send({type:'select',id:''});}
  catalogGesture=null;drag=null;hideTrash();hideGuide();
  if(queuedSnapshot){const latest=queuedSnapshot;queuedSnapshot=null;onOnlineRoom(latest.snapshot,latest);}
  persist();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!online?.active){clearTimeout(savedTimer);status(saveRoom(currentRoomId,state)?'Сохранено':'Не удалось сохранить');}});
 window.addEventListener('pagehide',()=>{if(!online?.active){clearTimeout(savedTimer);saveRoom(currentRoomId,state);}});
 $('rotateBtn').addEventListener('click',rotateSelected);
 $('duplicateBtn').addEventListener('click',duplicateSelected);
 $('deleteBtn').addEventListener('click',removeSelected);
 $('doneBtn').addEventListener('click',()=>{selectedId=null;hideSelection();sound('select');});
 $('materialToggle').addEventListener('click',()=>{expandedMaterials=!expandedMaterials;
  $('selectionMaterials').hidden=!expandedMaterials;$('materialToggle').setAttribute('aria-expanded',String(expandedMaterials));sound('select');});
 $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);
 $('eveningBtn').addEventListener('click',switchDollhouseLighting);
 $('soundBtn').addEventListener('click',()=>{soundscape.toggle();updateActions();});
 $('photoBtn').addEventListener('click',()=>studio.photoOpen());
 $('resetBtn').addEventListener('click',()=>{if(online?.active){toast('Сброс недоступен в общей комнате');return;}$('resetDialog').hidden=false;});
 $('cancelReset').addEventListener('click',()=>{$('resetDialog').hidden=true;});
 $('confirmReset').addEventListener('click',()=>{const before=JSON.stringify(state),previous=state.items;state=starter();retireMissing(previous,state.items);selectedId=null;cancelPending(false);hideSelection();record(before);refresh();$('resetDialog').hidden=true;toast('Комната восстановлена');sound('place');});
 $('cancelPlacement').addEventListener('click',()=>cancelPending(false));
 $('cancelPlacementMobile').addEventListener('click',()=>cancelPending(false));
 $('closePlacement').addEventListener('click',()=>cancelPending(false));
 $('previewRotate').addEventListener('click',rotatePlacement);
 document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){
   if(online?.active&&$('onlineLayer')?.hidden===false){online.close();return;}if(!$('resetDialog').hidden)$('resetDialog').hidden=true;else if(pending)cancelPending(false);else{selectedId=null;hideSelection();}}
  if(ev.target instanceof HTMLInputElement)return;
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();}
  else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){ev.preventDefault();redo();}
  else if(ev.key.toLowerCase()==='r'&&pending)rotatePlacement();
  else if(ev.key.toLowerCase()==='r'&&selectedId)rotateSelected();
  else if((ev.key==='Delete'||ev.key==='Backspace')&&selectedId){ev.preventDefault();removeSelected();}
 });
}
function resize(){
 if(!engine||!camera)return;
 const bounds=ui.canvas.getBoundingClientRect();
 const nextQuality=hardwareScale({width:bounds.width,height:bounds.height,dpr:window.devicePixelRatio||1});
 if(nextQuality!==currentQuality){engine.setHardwareScalingLevel(nextQuality);currentQuality=nextQuality;}
 engine.resize();
 const w=ui.canvas.clientWidth||1,h=ui.canvas.clientHeight||1,aspect=w/h;
 const top=Math.max(6.35,6.4/aspect);
 camera.orthoTop=top;camera.orthoBottom=-top;camera.orthoLeft=-top*aspect;camera.orthoRight=top*aspect;
}
function setup(){
 engine=new Engine(ui.canvas,true,{preserveDrawingBuffer:true,stencil:true,alpha:true,antialias:true});
 // Retina native framebuffer quality is selected by resize(), not downsampled by device class.
 scene=new Scene(engine);
 camera=new ArcRotateCamera('fixed-portrait',Math.PI/4,Math.PI/3.1,17,new Vector3(0,1.53,0),scene);
 camera.inputs.clear();camera.minZ=.1;camera.mode=1; // Orthographic, fixed toy-diorama camera.
 room=createRoom(scene);
  guide=createPlacementGuide(scene);
 online=createOnlineController({
  toast,
  onEnter(){
   if(!offlineBackup){
    offlineBackup=clone(state);
    clearTimeout(savedTimer);
    if(!saveRoom(currentRoomId,offlineBackup))status('Не удалось сохранить');
   }
   history.length=0;future.length=0;
   selectedId=null;cancelPending(false);hideSelection();
   updateActions();
  },
  onExit(){
   if(offlineBackup){state=offlineBackup;offlineBackup=null;}
   queuedSnapshot=null;drag=null;$('onlineMarkers').replaceChildren();
   selectedId=null;cancelPending(false);hideSelection();refresh();showHome();
  },
  onDismiss:showHome,
  onRoom:onOnlineRoom,
  onPresence:updateOnlinePresence
 });
 director=createMotionDirector({getRoot:id=>roots.get(id),getItem:id=>state.items.find(i=>i.id===id),getItems:()=>state.items,reducedMotion:()=>reduce.matches});
 resize();
 addEvents();setupHome();createGalleryUI();ready=true;refresh();ui.loading.classList.add('hidden');
 setTimeout(()=>buildFurnitureThumbnails((type,src)=>{
  thumbnails.set(type,src);
  ui.catalog.querySelectorAll('[data-image-type]').forEach(el=>{
   if(el.dataset.imageType===type)el.innerHTML='<img class="actual-thumbnail" src="'+src+'" alt="">';
  });
 }),500);
 let introSeen=false;
 try{introSeen=Boolean(localStorage.getItem('pocket-works:komnatka:intro'));}catch{}
 if(!introSeen){
  ui.hint.textContent='Выбери мебель справа или перетащи предмет в комнате';
  ui.hint.classList.add('visible');setTimeout(()=>ui.hint.classList.remove('visible'),4800);
  try{localStorage.setItem('pocket-works:komnatka:intro','1');}catch{}
 }
 window.addEventListener('resize',resize);new ResizeObserver(resize).observe(ui.canvas);
 if(new URLSearchParams(location.search).has('room')){
  hideHome();online.open();
 }else{
  // Render the real saved room before presenting the distinct home screen.
  requestAnimationFrame(()=>updateHomePreview());
 }
 let last=0;engine.runRenderLoop(()=>{
  if(document.hidden)return;
  const now=performance.now();
  const lit=room.tickLighting(now),moving=director.tick(now);
  const previewTurn=Boolean(pending?.rotAnim);
  if(previewTurn){
   const animation=pending.rotAnim;
   const p=Math.max(0,Math.min(1,(now-animation.start)/190));
   pending.ghost.rotation.y=animation.from+(animation.to-animation.from)*(1-Math.pow(1-p,3));
   if(p>=1)pending.rotAnim=null;
  }
  const interval=drag||pending||lit||moving||previewTurn?16:50;
  if(now-last<interval)return;
  last=now;scene.render();
  if(!$('homeScreen').hidden && !$('homeRoomImage').classList.contains('ready') && homeCaptureAttempts<7 && now-lastHomeCapture>650){
   lastHomeCapture=now;homeCaptureAttempts++;updateHomePreview();
  }
  if(online?.active)drawOnlineMarkers();
 });
}
// Read-only browser QA bridge, enabled exclusively via ?qa=1. It projects a
// real pickable mesh into CSS pixels, allowing touch tests to reproduce
// day -> night -> move -> day without relying on arbitrary screenshot offsets.
if(new URLSearchParams(location.search).get('qa')==='1'){
 window.__KOMNATKA_TEST__={
  get stageReady(){return Boolean(ready&&scene&&roots.size);},
  get selection(){return selectedId;},
   get placement(){return pending?{type:pending.type,valid:pending.valid,ready:pending.previewReady,support:pending.proto.support}:null;},
   get dragging(){return drag?.kind||null;},
   get itemCount(){return state.items.length;},
   get gridVisible(){return Boolean(scene?.getMeshByName('placement-grid')?.isEnabled());},
   meshY(id){return roots.get(id)?.position.y??null;},
   meshRotation(id,name){return roots.get(id)?.getChildMeshes(false).find(mesh=>mesh.name===name)?.rotation.x??null;},
   groundPoint(x,z,y=0){
    if(!ready)return null;
    const rect=ui.canvas.getBoundingClientRect(),viewport=camera.viewport.toGlobal(ui.canvas.width,ui.canvas.height);
    const position=Vector3.Project(new Vector3(x,y,z),Matrix.Identity(),scene.getTransformMatrix(),viewport);
    return {x:rect.x+position.x*rect.width/ui.canvas.width,y:rect.y+position.y*rect.height/ui.canvas.height};
   },
  get lighting(){return room?.lightingDiagnostics()??null;},
  get purpose(){return state.purpose;},get materials(){return state.items.map(i=>({type:i.type,material:i.material}));},
  get quality(){return {scale:engine?.getHardwareScalingLevel(),dpr:devicePixelRatio,pixels:[ui.canvas.width,ui.canvas.height],preview:$('homeRoomImage').dataset.source||null};},
  item(id){return state.items.find(x=>x.id===id)?{...state.items.find(x=>x.id===id)}:null;},
  point(id){
   if(!ready)return null;
   const root=roots.get(id);if(!root)return null;
   const rect=ui.canvas.getBoundingClientRect(),viewport=camera.viewport.toGlobal(ui.canvas.width,ui.canvas.height);
   for(const mesh of root.getChildMeshes(false)){
    if(!mesh.isPickable||mesh.isDisposed())continue;
    mesh.computeWorldMatrix(true);
    const center=mesh.getBoundingInfo().boundingSphere.centerWorld;
    const position=Vector3.Project(center,Matrix.Identity(),scene.getTransformMatrix(),viewport);
    const px=position.x*rect.width/ui.canvas.width;
    const py=position.y*rect.height/ui.canvas.height;
    const hit=scene.pick(px,py,m=>Boolean(m.metadata?.itemId),false,camera);
    if(hit?.pickedMesh?.metadata?.itemId===id)return {x:rect.x+px,y:rect.y+py};
   }
   return null;
  }
 };
}
function showError(error){$('homeScreen').hidden=true;console.error(error);ui.loadText.textContent='Не получилось открыть комнату';$('retryBtn').hidden=false;$('retryBtn').onclick=()=>location.reload();toast('Ошибка запуска 3D-сцены');}
showCatalog();updateActions();
try{setup();}catch(error){showError(error);}
