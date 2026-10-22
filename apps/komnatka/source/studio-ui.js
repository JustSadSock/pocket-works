import {ROOM_KINDS,roomKind} from './room-kinds.js';
// Small UI coordinator for the dollhouse albums and dedicated photography.
// All commands use live room state from the editor; no fake or empty controls.
export function createStudioUI({getState,load,save,render,photo,onClose,toast}){
 const $=id=>document.getElementById(id);
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let newLayout='classic',newPurpose='living',gallerySource='home';
 function gallery(source=gallerySource){
  if(save()===false){toast('Не удалось сохранить комнатку. Освободи место для сохранения.');return false;}
  gallerySource=source;
  $('roomsBack').textContent=source==='editor'?'← В редактор':'← В меню';
  const records=getState().records(),limit=5;
  $('roomsCounter').textContent=records.length+'/'+limit;
  $('roomsGrid').innerHTML=records.map(r=>
   '<article class="room-album"><div class="room-album-preview">'+
   (r.preview?'<img alt="" src="'+r.preview+'">':'<span>⌂</span>')+'</div>'+
   '<input maxlength="32" data-name="'+safe(r.id)+'" aria-label="Название" value="'+safe(r.name)+'">'+
   '<small>'+((ROOM_KINDS.find(kind=>kind.id===r.purpose)?.name)||'Гостиная')+' · '+({classic:'Классическая',narrow:'Узкая',nook:'Уголок'}[r.layout]||'Классическая')+'</small>'+
   '<div class="room-album-actions"><button data-open="'+safe(r.id)+'">Открыть</button>'+
   (records.length>1?'<button class="delete" data-delete="'+safe(r.id)+'">Удалить</button>':'')+
   '</div></article>').join('')+
   (records.length<limit?'<button id="addAlbum" class="room-album-add" type="button"><span>＋</span>Новая комнатка</button>':'');
  $('roomsLayer').hidden=false;
  for(const button of $('roomsGrid').querySelectorAll('[data-open]'))button.onclick=()=>{
   if(load(button.dataset.open)===false)return;
   $('roomsLayer').hidden=true;$('newRoomForm').hidden=true;
  };
  for(const input of $('roomsGrid').querySelectorAll('[data-name]'))input.onchange=()=>{
   if(!getState().rename(input.dataset.name,input.value))toast('Не удалось переименовать комнатку');
   gallery();
  };
  for(const button of $('roomsGrid').querySelectorAll('[data-delete]'))button.onclick=()=>{
   if(!confirm('Удалить комнатку? Отменить удаление нельзя.'))return;
   if(!getState().delete(button.dataset.delete)){toast('Не удалось удалить комнатку');return;}
   gallery();
  };
  const add=$('addAlbum');if(add)add.onclick=()=>{$('newRoomForm').hidden=false;};
  return true;
 }
 function close(){ $('roomsLayer').hidden=true;$('newRoomForm').hidden=true;onClose?.(gallerySource);}
 $('roomsBack').onclick=close;
 $('roomCreateCancel').onclick=()=>{$('newRoomForm').hidden=true;};
 for(const b of $('newRoomLayouts').querySelectorAll('[data-layout]'))b.onclick=()=>{
  newLayout=b.dataset.layout;
  for(const x of $('newRoomLayouts').querySelectorAll('button'))x.classList.toggle('chosen',x===b);
 };
 for(const b of $('newRoomPurposes').querySelectorAll('[data-purpose]'))b.onclick=()=>{
  newPurpose=roomKind(b.dataset.purpose);
  for(const x of $('newRoomPurposes').querySelectorAll('button'))x.classList.toggle('chosen',x===b);
 };
 $('roomCreateConfirm').onclick=()=>{
  const created=getState().create($('newRoomName').value,newLayout,newPurpose);
  if(!created){toast('Не получилось создать комнатку');return;}
  if(load(created.id)===false){toast('Комнатка создана, но открыть её не удалось');gallery();return;}
  $('roomsLayer').hidden=true;$('newRoomForm').hidden=true;
 };
 let savedCamera=null;
 function preview(){
  try{$('photoPreview').src=photo.capture();}
  catch{toast('Не удалось создать снимок');photoClose();}
 }
 function photoOpen(){
  savedCamera=photo.angle();
  $('photoLayer').hidden=false;
  preview();
 }
 function photoClose(){
  $('photoLayer').hidden=true;
  if(savedCamera){photo.setAngle(savedCamera);savedCamera=null;}
 }
 $('photoExit').onclick=photoClose;
 $('photoLayer').querySelectorAll('[data-photo-angle]').forEach(b=>b.onclick=()=>{
  const adjustment=b.dataset.photoAngle==='left'?.21:b.dataset.photoAngle==='right'?-.21:0;
  photo.setAngle({alpha:savedCamera.alpha+adjustment,beta:b.dataset.photoAngle==='front'?Math.PI/3.8:savedCamera.beta});
  preview();
 });
 $('photoSave').onclick=()=>{
  const link=document.createElement('a');link.download='komnatka-'+new Date().toISOString().slice(0,10)+'.png';
  link.href=$('photoPreview').src;link.click();toast('Снимок сохранён');
 };
 return {gallery,close,photoOpen,photoClose};
}
