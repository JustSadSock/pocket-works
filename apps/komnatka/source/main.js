import './styles.css';
import '../../../shared/mobile-runtime.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Engine, Scene, ArcRotateCamera, Vector3, Color3, TransformNode, Matrix } from '@babylonjs/core';
import { CATALOG, COLORS, byType, makeItem } from './models.js';
import { createSoundscape } from './soundscape.js';
import { createMotionDirector } from './motion.js';
import { buildFurnitureThumbnails } from './thumbnails.js';
import { createOnlineController } from './online.js';
import { sceneY } from './scene-position.js';
import { WALLS, FLOORS, PATTERNS, createRoom } from './room.js';
import { load, save, starter, sanitize, valid, dimensions, findSupport, moveWithChildren, removeWithChildren, nextId } from './state.js';

installMobileRuntime().setScrollLocked(true);
registerEnhancedUpdate({appName:'КОМНАТКА',version:'0.2.0',releaseNotes:['Два сетевых режима: Новые жильцы и Собери по памяти. Комнаты друзей на 2–5 игроков с общей расстановкой мебели и видимыми действиями.']});

const $=id=>document.getElementById(id);
const ui={canvas:$('roomCanvas'), loading:$('loading'), loadText:$('loadText'),dock:$('dock'),catalog:$('catalog'),categories:$('categories'),finish:$('finish'),selected:$('selection'),selectedName:$('selectionName'),swatches:$('selectionColors'),status:$('saveStatus'),hint:$('hint'),toast:$('toast'),resetDialog:$('resetDialog')};
let state=load(),scene,engine,camera,room,director,ready=false,selectedId=null,pending=null,drag=null,history=[],future=[],roots=new Map();
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
const GROUPS=[['furniture','Мебель'],['lights','Свет'],['decor','Декор'],['walls','На стены'],['finish','Отделка']];
let activeGroup='furniture',savedTimer=0,toastTimer=0;
const thumbnails=new Map();
let online=null,offlineBackup=null,queuedSnapshot=null;
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
function status(message='Сохранено'){ui.status.textContent=message;}
function persist() {
 if(online?.active)return;
 clearTimeout(savedTimer);status('Сохраняем…');
 savedTimer=setTimeout(()=>{status(save(state)?'Сохранено':'Не удалось сохранить');},240);
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
 ui.status.textContent=online?.active?'Общая комната':'Сохранено';
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
 ui.categories.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{activeGroup=b.dataset.group;cancelPending(false);showCatalog();sound('select');}));
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
 ui.finish.querySelectorAll('[data-wall]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.wallColor=Number(el.dataset.wall));if(online?.active)online.send({type:'decorate',patch:{wallColor:state.wallColor}});sound('paint');}));
 ui.finish.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.pattern=el.dataset.pattern);if(online?.active)online.send({type:'decorate',patch:{pattern:state.pattern}});sound('paint');}));
 ui.finish.querySelectorAll('[data-floor]').forEach(el=>el.addEventListener('click',()=>{mutate(()=>state.floor=el.dataset.floor);if(online?.active)online.send({type:'decorate',patch:{floor:state.floor}});sound('paint');}));
}
function placementPalette(){
 const container=$('placementControls');
 container.hidden=!pending;
 if(!pending)return;
 const {proto,type}=pending;
 $('placementTitle').textContent='Подготовить: '+byType[type].name.toLowerCase();
 $('previewRotate').disabled=byType[type].layer==='wall';
 $('placementColors').innerHTML=COLORS.map(c=>'<button type="button" class="color-dot '+(proto.color===c?'picked':'')+'" style="--paint:'+c+'" data-preview-color="'+c+'" aria-label="Цвет '+c+'"></button>').join('');
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
function beginPlacement(type){
 if(!ready)return;
 if(online?.active&&!online.canEdit){toast('Редактор доступен после начала раунда');return;}
 if(pending)cancelPending(false);
 selectedId=null;hideSelection();
 const proto={id:'preview',type,x:0,z:0,y:0,rot:0,color:type==='rug'?'#d9ad97':type==='plant'?'#c79078':COLORS[2],wall:'back',support:null,variant:0};
 if(byType[type].layer==='wall'){proto.z=-3.91;proto.y=2.58;}
 pending={type,proto,ghost:makeItem(scene,proto),valid:false,previewReady:false};
 pending.ghost.getChildMeshes(false).forEach(mesh=>{mesh.isPickable=false;});
 pending.ghost.setEnabled(false); // No ghost bleeding through the furnished room until a valid target is known.
 ui.hint.textContent=byType[type].layer==='wall'?'Коснись стены, чтобы повесить':'Коснись места в комнате, чтобы поставить';
 ui.hint.classList.add('visible');placementPalette();showCatalog();sound('lift');
}
function cancelPending(show=true){
 if(!pending)return;
 pending.ghost?.dispose(false,false);pending=null;placementPalette();
 if(show)toast('Добавление отменено');
 ui.hint.classList.remove('visible');showCatalog();
}
function updateGhost(ev){
 if(!pending)return;
 const target=pickTarget(ev,pending.proto);
 if(!target){
  pending.valid=false;pending.previewReady=false;pending.ghost.setEnabled(false);
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
}
function rotatePlacement(){
 if(!pending||byType[pending.type].layer==='wall')return;
 pending.proto.rot=(pending.proto.rot+1)%4;
 pending.valid=pending.previewReady&&valid(state,pending.proto,'preview');
 pending.rotAnim={from:pending.ghost.rotation.y,to:pending.proto.rot*Math.PI/2,start:performance.now()};
 pending.ghost.getChildMeshes(false).forEach(mesh=>mesh.visibility=pending.valid?1:.46);
 sound('rotate');
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
 ui.swatches.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{const id=selectedId;mutate(()=>{const found=state.items.find(i=>i.id===id);if(found)found.color=button.dataset.color;});if(online?.active)online.send({type:'edit',id,patch:{color:button.dataset.color}});director?.touch(id);sound('paint');}));
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
  const signature=[item.type,item.color,item.variant].join('|');
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
function onOnlineRoom(snapshot,{reference,phaseChanged}={}){
 if(!snapshot)return;
 if(drag?.kind==='move'){queuedSnapshot={snapshot,reference,phaseChanged};return;}
 const before=new Map(state.items.map(item=>[item.id,{...item}]));
 const finishes=snapshot.finishes||{wallColor:0,pattern:'plain',floor:'honey',evening:false};
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
function trashHovered(ev){
 const r=$('stage').getBoundingClientRect();
 return ev.clientX>=r.right-102 && ev.clientX<=r.right+58 &&
 ev.clientY>r.top+54 && ev.clientY<r.bottom-50;
}
function hideTrash(){
 $('trashZone').hidden=true;$('trashZone').classList.remove('hover');
}
function snapFeedback(ev){
 if(reduce.matches)return;
 const pulse=$('snapPulse'),rect=$('stage').getBoundingClientRect();
 pulse.style.left=(ev.clientX-rect.left)+'px';
 pulse.style.top=(ev.clientY-rect.top)+'px';
 pulse.getAnimations?.().forEach(animation=>animation.cancel());
 pulse.animate([{transform:'translate(-50%,-50%) scale(.4)',opacity:.36},
   {transform:'translate(-50%,-50%) scale(1.35)',opacity:0}],
   {duration:190,easing:'ease-out',fill:'both'});
}
function startPointer(ev){
 if(!ready||ev.button>0)return;
 if(online?.active&&!online.canEdit){toast('Ждём начала обустройства');return;}
 ui.canvas.setPointerCapture(ev.pointerId);
 if(pending){updateGhost(ev);drag={kind:'place',startX:ev.clientX,startY:ev.clientY};return;}
 const hit=pick(ev,m=>Boolean(m.metadata?.itemId));
 const id=hit?.hit?hit.pickedMesh.metadata.itemId:null;
 if(id){
  if(selectedId!==id)select(id);
  online?.active&&online.select(id,'move');
  director?.lift(id);sound('lift');
  drag={kind:'move',id,startX:ev.clientX,startY:ev.clientY,moved:false,before:JSON.stringify(state),startPoint:pointOnGround(ev),cell:null};
 }else {selectedId=null;hideSelection();drag={kind:'tap'};}
}
function movePointer(ev) {
 if(!ready)return;
 if(pending){updateGhost(ev);return;}
 if(!drag||drag.kind!=='move')return;
 if(Math.hypot(ev.clientX-drag.startX,ev.clientY-drag.startY)<5&&!drag.moved)return;
 const item=state.items.find(i=>i.id===drag.id);if(!item)return;
 drag.moved=true;
 $('trashZone').hidden=false;
 drag.trash=trashHovered(ev);
 $('trashZone').classList.toggle('hover',Boolean(drag.trash));
 if(drag.trash){drag.valid=false;director?.drag(item.id,0,0,false);return;}
 const target=pickTarget(ev,item);if(!target)return;
 drag.moved=true;const dx=target.x-item.x,dz=target.z-item.z;
 moveWithChildren(state,item.id,dx,dz);
 Object.assign(item,target);
 const root=roots.get(item.id);root?.position.set(item.x,sceneY(item),item.z);if(root)root.rotation.y=item.rot*Math.PI/2;
 for(const child of state.items.filter(it=>it.support===item.id))roots.get(child.id)?.position.set(child.x,sceneY(child),child.z);
 const ok=valid(state,item);
 if(ok){
  const cell=item.x+':'+item.z+':'+(item.support||'');
  if(drag.cell!==cell){drag.cell=cell;snapFeedback(ev);}
 }
 director?.drag(item.id,dx,dz,ok);
 drag.valid=ok;
}
function endPointer(ev) {
 if(!drag)return;
 const d=drag;drag=null;hideTrash();
 if(d.kind==='move'&&d.moved&&d.trash){
  const previous=state.items;
  if(online?.active)online.send({type:'delete',id:d.id});
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
  }
 }else if(d.kind==='move'&&d.moved){
  if(d.valid&&state.items.every(i=>i.id===d.id||i.support!==d.id||valid(state,i))){
   if(online?.active){const changed=state.items.find(i=>i.id===d.id);online.send({type:'edit',id:d.id,patch:{x:changed.x,z:changed.z,y:changed.y,rot:changed.rot,support:changed.support}});}
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
}
function rotateSelected() {
 const item=state.items.find(i=>i.id===selectedId);if(!item||byType[item.type].layer==='wall')return;
 const before=JSON.stringify(state),prev=clone(item),children=state.items.filter(i=>i.support===item.id).map(clone);
 moveWithChildren(state,item.id,0,0,1);item.rot=(item.rot+1)%4;
 if(!valid(state,item)||state.items.some(i=>i.support===item.id&&!valid(state,i))){
  Object.assign(item,prev);for(const old of children)Object.assign(state.items.find(x=>x.id===old.id),old);
  director?.refuse(item.id);toast('Нет места для поворота');sound('blocked');return;
 }
 if(online?.active)online.send({type:'edit',id:item.id,patch:{rot:item.rot}});
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
 const before=JSON.stringify(state),previous=state.items;
 if(online?.active)online.send({type:'delete',id:selectedId});
 state.items=removeWithChildren(state,selectedId);retireMissing(previous,state.items);
 selectedId=null;hideSelection();record(before);refresh();sound('delete');
}
function addEvents(){
 ui.canvas.addEventListener('pointerdown',startPointer);
 ui.canvas.addEventListener('pointermove',movePointer);
 ui.canvas.addEventListener('pointerup',ev=>{
  endPointer(ev);
  // Remote edits received mid-drag are delayed so they cannot steal the pointer.
  // Apply the newest authoritative snapshot as soon as the gesture ends.
  if(queuedSnapshot){const latest=queuedSnapshot;queuedSnapshot=null;onOnlineRoom(latest.snapshot,latest);}
 });
 ui.canvas.addEventListener('pointercancel',()=>{if(drag?.kind==='move'&&drag.before){const id=drag.id;state=sanitize(JSON.parse(drag.before));refresh();director?.reset(id);}drag=null;hideTrash();});
 window.addEventListener('blur',()=>{if(drag?.kind==='move'&&drag.before){const id=drag.id;state=sanitize(JSON.parse(drag.before));refresh();director?.reset(id);}drag=null;hideTrash();persist();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!online?.active){clearTimeout(savedTimer);save(state);status('Сохранено');}});
 window.addEventListener('pagehide',()=>{if(!online?.active){clearTimeout(savedTimer);save(state);}});
 $('rotateBtn').addEventListener('click',rotateSelected);
 $('duplicateBtn').addEventListener('click',duplicateSelected);
 $('deleteBtn').addEventListener('click',removeSelected);
 $('doneBtn').addEventListener('click',()=>{selectedId=null;hideSelection();sound('select');});
 $('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);
 $('eveningBtn').addEventListener('click',()=>{mutate(()=>{state.evening=!state.evening;});if(online?.active&&online.canEdit)online.send({type:'decorate',patch:{evening:state.evening}});});
 $('soundBtn').addEventListener('click',()=>{soundscape.toggle();updateActions();});
 $('photoBtn').addEventListener('click',()=>{
  try{const link=document.createElement('a');link.download='komnatka-'+new Date().toISOString().slice(0,10)+'.png';
   engine.renderEvenInBackground=true;scene.render();link.href=ui.canvas.toDataURL('image/png');link.click();toast('Снимок сохранён');sound(810,'triangle');}
  catch{toast('Не удалось сохранить изображение');}
 });
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
 online=createOnlineController({
  toast,
  onEnter(){
   if(!offlineBackup)offlineBackup=clone(state);
   history.length=0;future.length=0;
   selectedId=null;cancelPending(false);hideSelection();
   updateActions();
  },
  onExit(){
   if(offlineBackup){state=offlineBackup;offlineBackup=null;}
   selectedId=null;cancelPending(false);hideSelection();refresh();
  },
  onRoom:onOnlineRoom,
  onPresence:updateOnlinePresence
 });
 director=createMotionDirector({getRoot:id=>roots.get(id),getItem:id=>state.items.find(i=>i.id===id),reducedMotion:()=>reduce.matches});
 resize();
 addEvents();ready=true;refresh();ui.loading.classList.add('hidden');
 setTimeout(()=>buildFurnitureThumbnails((type,src)=>{
  thumbnails.set(type,src);
  ui.catalog.querySelectorAll('[data-image-type]').forEach(el=>{
   if(el.dataset.imageType===type)el.innerHTML='<img class="actual-thumbnail" src="'+src+'" alt="">';
  });
 }),500);
 if(!localStorage.getItem('pocket-works:komnatka:intro')){
  ui.hint.textContent='Выбери мебель справа или перетащи предмет в комнате';
  ui.hint.classList.add('visible');setTimeout(()=>ui.hint.classList.remove('visible'),4800);
  try{localStorage.setItem('pocket-works:komnatka:intro','1');}catch{}
 }
 window.addEventListener('resize',resize);new ResizeObserver(resize).observe(ui.canvas);
 if(new URLSearchParams(location.search).has('room'))online.open();
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
  if(online?.active)drawOnlineMarkers();
 });
}
function showError(error){console.error(error);ui.loadText.textContent='Не получилось открыть комнату';$('retryBtn').hidden=false;$('retryBtn').onclick=()=>location.reload();toast('Ошибка запуска 3D-сцены');}
showCatalog();updateActions();
try{setup();}catch(error){showError(error);}
