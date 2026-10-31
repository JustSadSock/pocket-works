import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { CONTESTANTS } from './contestants.js';
import { TIERS, createFirst, normalizeState, ensureEpisode, findTier, movePerson, countRated, rankChanges, eliminatedBeforeEpisode, visibleInEpisode } from './model.js';

installMobileRuntime();

const APP='pocket-works:rose-ranking-15';
const IDS=CONTESTANTS.map(person=>person.id);
const PEOPLE=new Map(CONTESTANTS.map(person=>[person.id,person]));
const TITLES={S:'Без конкуренции',A:'Очень нравятся',B:'Нравятся',C:'Пока нейтрально',D:'Не моё',F:'Последнее место','?':'Ещё не распределены'};
const DISPLAY_ORDER=['?','S','A','B','C','D','F'];
const storage=createVersionedStore({namespace:APP,version:1,defaults:{data:null}});
let state=normalizeState(storage.get('data'),IDS);
let modal={type:null,id:null};
let pendingImport=null;
let noticeTimeout=0;
let drag=null;

const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current=()=>state.episodes[state.current];
const safePerson=id=>PEOPLE.get(id);
const visiblePerson=id=>visibleInEpisode(safePerson(id),state.current,state.showAll);
const initials=name=>String(name).split(' ').map(x=>x[0]).slice(0,2).join('');
const episodeLabel=n=>String(n).padStart(2,'0');
const episodeDate=n=>n<=3?new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long'}).format(new Date(Date.UTC(2026,9,16+7*(n-1)))):'Личный рейтинг будущей серии';

function showNotice(message){
 const node=$('notice');node.textContent=message;node.hidden=false;
 clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>node.hidden=true,2900);
}
function persist(){
 const okay=storage.set('data',state);
 $('saveStatus').textContent=okay?'Сохранено':'Не удалось сохранить';
 $('saveStatus').style.color=okay?'#638073':'#b8474d';
 if(!okay)showNotice('Не удалось сохранить. Освободи место в браузере и создай резервную копию.');
}
function touchEpisode(){current().edited=Date.now();persist();}
function personCard(id,changes){
 const p=safePerson(id);if(!p)return '';
 const nick=state.nicknames[id]||'';
 const out=eliminatedBeforeEpisode(p,state.current);
 const delta=changes[id]||'';
 return `<article class="person" data-id="${escapeHtml(id)}">
  <button type="button" class="person-button" data-open-person="${escapeHtml(id)}" aria-label="${escapeHtml(p.name)}: выбрать тир и посмотреть описание" data-native-press>
    <span class="person-photo"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async"><span class="photo-fallback">${escapeHtml(initials(p.name))}</span></span>
    <span class="person-bottom"><span class="person-name">${escapeHtml(p.short)}${p.name!==p.short?' '+escapeHtml(p.name.split(' ').slice(1).join(' ')):''}</span>${nick?`<span class="person-nick">${escapeHtml(nick)}</span>`:''}</span>
  </button>
  <button type="button" class="photo-expand-button" data-open-photo="${escapeHtml(id)}" aria-label="Просмотреть фотографию ${escapeHtml(p.name)} на весь экран" data-native-press><span aria-hidden="true">⤢</span></button>
  ${out?`<span class="person-exit">Выбыла · ${p.exit} серия</span>`:''}
  ${delta?`<span class="person-delta" data-change="${delta}" aria-label="${delta==='up'?'Поднялась':delta==='down'?'Опустилась':delta==='new'?'Новая оценка':'Без оценки'}">${delta==='up'?'↑':delta==='down'?'↓':delta==='new'?'＋':'·'}</span>`:''}
  <button type="button" class="person-grip" data-drag-id="${escapeHtml(id)}" title="Перетащить карточку" aria-label="Перетащить ${escapeHtml(p.name)}" data-gesture-surface data-block-callout>⠿</button>
 </article>`;
}
function tierHtml(tier,changes){
 const ids=current().rows[tier].filter(visiblePerson);
 const total=current().rows[tier].length;
 return `<section class="tier-section" data-tier="${tier}" aria-label="Тир ${tier==='?'?'не распределены':tier}">
 <div class="tier-top"><span class="tier-ribbon" data-rank="${tier}">${tier}</span><span class="tier-name">${TITLES[tier]}</span><span class="tier-count">${ids.length}${total!==ids.length?' / '+total:''}</span></div>
 <div class="tier-content" data-tier-content="${tier}">${ids.length?ids.map(id=>personCard(id,changes)).join(''):`<div class="tier-empty">${tier==='?'?'Все участницы распределены':'Нажми на карточку или перетащи сюда'}</div>`}</div>
 </section>`;
}
function render(){
 const ep=current();
 const prev=state.episodes[state.current-1]?.rows;
 const changes=rankChanges(ep.rows,prev);
 $('board').innerHTML=DISPLAY_ORDER.map(tier=>tierHtml(tier,changes)).join('');
 $('episodeTitle').innerHTML=episodeLabel(state.current)+' <small>серии</small>';
 $('episodeDate').textContent=episodeDate(state.current);
 $('previousEpisode').disabled=state.current<=1;
 $('nextEpisode').disabled=state.current>=100;
 const rated=countRated(ep.rows),total=IDS.length;
 $('progressText').textContent=rated+' из '+total+' распределены';
 $('progressBar').style.width=(rated/total*100).toFixed(1)+'%';
 $('nextEpisode').setAttribute('aria-label','Перейти к '+(state.current+1)+' серии');
 $('previousEpisode').setAttribute('aria-label','Перейти к '+(state.current-1)+' серии');
}
function changeEpisode(delta){
 const next=state.current+delta;if(next<1||next>100)return;
 ensureEpisode(state,next,IDS);
 state.current=next;
 persist();render();
 window.scrollTo({top:0,behavior:'instant'});
 showNotice('Серия '+next+' · оценки сохраняются отдельно');
}
function move(id,tier,index=Infinity){
 if(!PEOPLE.has(id)||!TIERS.includes(tier))return false;
 const changed=movePerson(current().rows,id,tier,index);
 if(changed){touchEpisode();render();}
 return changed;
}
function moveWithin(id,offset){
 const tier=findTier(current().rows,id);
 const list=current().rows[tier];
 const index=list.indexOf(id);
 const target=index+offset;
 if(target<0||target>=list.length)return;
 move(id,tier,offset>0?index+2:index-1);
}
function createSheet(title,subtitle,body){
 const root=$('modalRoot');
 root.hidden=false;
 root.innerHTML=`<button class="scrim" data-close-sheet aria-label="Закрыть"></button>
 <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
  <div class="sheet-handle"></div>
  <header class="sheet-top"><div><div class="sheet-kicker">${escapeHtml(subtitle)}</div><h2 class="sheet-title" id="sheetTitle">${escapeHtml(title)}</h2></div><button class="sheet-close" type="button" data-close-sheet aria-label="Закрыть">×</button></header>
  ${body}</section>`;
 setDocumentScrollLocked(true);
 root.querySelector('.sheet-close')?.focus({preventScroll:true});
}
function closeSheet(){
 if(modal.type==='none')return;
 modal={type:null,id:null};pendingImport=null;
 $('modalRoot').hidden=true;$('modalRoot').replaceChildren();
 setDocumentScrollLocked(false);
}
function openPerson(id){
 const p=safePerson(id);if(!p)return;
 modal={type:'person',id};
 const selected=findTier(current().rows,id),rank=current().rows[selected],index=rank.indexOf(id),out=eliminatedBeforeEpisode(p,state.current);
 const img=`<button type="button" class="profile-photo-button" data-open-photo="${escapeHtml(id)}" aria-label="Увеличить фото ${escapeHtml(p.name)}" data-native-press><img class="profile-photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="eager" decoding="async"><div class="profile-fallback" hidden>${escapeHtml(initials(p.name))}</div><span class="profile-photo-caption">⤢ Смотреть целиком</span></button>`;
 createSheet(p.name,'УЧАСТНИЦА · СЕРИЯ '+episodeLabel(state.current),
 `<div class="profile"><div class="profile-image">${img}</div><div><div class="person-meta">${escapeHtml(p.subtitle)}</div><p class="person-fact">${escapeHtml(p.fact)}</p>${out?`<div class="person-elimination">Выбыла в ${p.exit}-й серии · можно продолжить оценивать</div>`:''}</div></div>
 <span class="sheet-label">МОЁ МЕСТО В РЕЙТИНГЕ</span>
 <div class="rank-select" role="group" aria-label="Выбрать тир">${TIERS.map(t=>`<button type="button" class="${selected===t?'active':''}" data-pick-tier="${t}" aria-pressed="${selected===t}">${t}</button>`).join('')}</div>
 <div class="inline-moves"><button type="button" data-shift="-1" ${index<=0?'disabled':''}>↑ Выше в тире</button><button type="button" data-shift="1" ${index>=rank.length-1?'disabled':''}>↓ Ниже в тире</button></div>
 <label class="sheet-label" for="nickname">МОЁ ПРОЗВИЩЕ · ОБЩЕЕ ДЛЯ ВСЕХ СЕРИЙ</label>
 <input id="nickname" type="text" maxlength="38" autocomplete="off" placeholder="Например, Королева драмы" value="${escapeHtml(state.nicknames[id]||'')}">
 <label class="sheet-label" for="personNote">ЗАМЕТКА ПО ЭТОЙ СЕРИИ</label>
 <textarea id="personNote" maxlength="500" rows="3" placeholder="Почему именно этот тир?">${escapeHtml(current().notes[id]||'')}</textarea>
 <p class="sheet-hint">Изменения сохраняются сразу. Прозвище видно во всех сериях, заметка — только в ${state.current}-й.</p>
 <button type="button" class="secondary-action" data-close-sheet>Готово</button>`);
}
function refreshPerson(){
 const id=modal.id;
 if(!id)return;
 const active=document.activeElement?.id;
 openPerson(id);
 if(active==='nickname'||active==='personNote')$(active)?.focus();
}
function openTools(){
 modal={type:'tools',id:null};
 const hadEpisodes=Object.keys(state.episodes).length;
 createSheet('Мой архив','РОЗКЛАД ТРОЯНД',
 `<p class="sheet-hint">Сохранено серий: ${hadEpisodes}. Все рейтинги, заметки и прозвища хранятся на этом устройстве.</p>
 <div class="tool-actions">
  <button type="button" data-tool="toggle">Показывать выбывших <span>${state.showAll?'Вкл':'Выкл'}</span></button>
  <button type="button" data-tool="export">Скачать резервную копию <span>JSON ↓</span></button>
  <button type="button" data-tool="import">Восстановить из файла <span>JSON ↑</span></button>
  <button type="button" data-tool="copy-prev" ${state.current<=1?'disabled':''}>Восстановить оценки предыдущей серии <span>${state.current>1?(state.current-1)+' → '+state.current:'Недоступно'}</span></button>
  <button type="button" data-tool="reset" class="destructive">Очистить рейтинг ${state.current}-й серии <span>Сброс</span></button>
 </div>
 <input id="restoreInput" type="file" accept=".json,application/json" hidden>
 <hr class="sheet-divider">
 <p class="sheet-hint">Серии независимы: переход вперёд создаёт копию рейтинга, но любые следующие изменения сохраняются только в выбранном выпуске. При первом запуске фотографии требуют интернета.</p>
 <button type="button" class="secondary-action" data-close-sheet>Вернуться к рейтингу</button>`);
}
function confirmAction(title,message,yesLabel,action){
 modal={type:'confirm',id:null,action};
 createSheet(title,'ПОДТВЕРЖДЕНИЕ',
 `<p class="person-fact" style="font-size:14px;line-height:1.55;margin-top:18px">${escapeHtml(message)}</p>
 <div class="confirm-buttons"><button type="button" data-cancel-confirm>Отмена</button><button type="button" class="danger" data-confirm>${escapeHtml(yesLabel)}</button></div>`);
}
function downloadBackup(){
 const data={format:'rozklad-troyand-backup',exportedAt:new Date().toISOString(),data:state};
 const file=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(file),link=document.createElement('a');
 link.href=url;link.download='rozklad-troyand-holostyak15-'+new Date().toISOString().slice(0,10)+'.json';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 showNotice('Резервная копия загружена');
}
async function importBackup(file){
 if(!file)return;
 if(file.size>2_000_000){showNotice('Файл слишком большой (максимум 2 МБ)');return;}
 try{
  const json=JSON.parse(await file.text());
  if(json?.format!=='rozklad-troyand-backup'||json.data?.schema!==1||!json.data.episodes||typeof json.data.episodes!=='object')throw Error('Неверный формат');
  const normalized=normalizeState(json.data,IDS);
  pendingImport=normalized;
  confirmAction('Заменить архив?','Файл «'+file.name+'» содержит '+Object.keys(normalized.episodes).length+' серий. Все текущие рейтинги и заметки на этом устройстве будут заменены.','Заменить',()=>{state=normalized;persist();closeSheet();render();showNotice('Архив восстановлен');});
 }catch{showNotice('Не удалось прочитать архив. Нужен JSON из этого приложения.');}
}
function handleTools(action){
 if(action==='toggle'){state.showAll=!state.showAll;persist();render();openTools();return;}
 if(action==='export'){downloadBackup();return;}
 if(action==='import'){$('restoreInput')?.click();return;}
 if(action==='copy-prev'){
  if(state.current<=1)return;
  const number=state.current;
  confirmAction('Вернуть предыдущий рейтинг?','Оценки '+number+'-й серии будут заменены копией '+(number-1)+'-й. Заметки текущей серии сохранятся.','Заменить оценки',()=>{
   current().rows=structuredClone(state.episodes[number-1].rows);touchEpisode();render();closeSheet();showNotice('Рейтинг скопирован из предыдущей серии');
  });return;
 }
 if(action==='reset'){
  const number=state.current;
  confirmAction('Очистить серию '+number+'?','Все 23 участницы этой серии вернутся в «Не распределены», заметки данной серии удалятся. Остальные серии и прозвища сохранятся.','Очистить',()=>{
   state.episodes[number]=createFirst(IDS);persist();render();closeSheet();showNotice('Рейтинг серии '+number+' очищен');
  });
 }
}
function handleSheetClick(event){
 const target=event.target.closest('button');if(!target)return;
 if(target.matches('[data-close-sheet]')){closeSheet();return;}
 if(target.hasAttribute('data-open-photo')){openPhoto(target.dataset.openPhoto);return;}
 if(target.matches('[data-open-person]')){openPerson(target.dataset.openPerson);return;}
 if(modal.type==='person'){
  const id=modal.id;
  if(target.hasAttribute('data-pick-tier')){
   move(id,target.dataset.pickTier);refreshPerson();return;
  }
  if(target.hasAttribute('data-shift')){
   moveWithin(id,Number(target.dataset.shift));refreshPerson();return;
  }
 }
 if(modal.type==='tools'&&target.dataset.tool){handleTools(target.dataset.tool);return;}
 if(modal.type==='confirm'){
  if(target.hasAttribute('data-cancel-confirm')){closeSheet();openTools();return;}
  if(target.hasAttribute('data-confirm')){const act=modal.action;if(typeof act==='function')act();return;}
 }
}
function handleSheetInput(event){
 if(modal.type!=='person'||!modal.id)return;
 const id=modal.id;
 if(event.target.id==='nickname'){
  const name=event.target.value.slice(0,38);
  if(name.trim())state.nicknames[id]=name;else delete state.nicknames[id];
  persist();render();
 }
 if(event.target.id==='personNote'){
  const note=event.target.value.slice(0,500);
  if(note.trim())current().notes[id]=note;else delete current().notes[id];
  touchEpisode();
 }
}
function photoLoad(event){
 const image=event.target;
 if(!image.matches('.person-photo img'))return;
 image.classList.add('loaded');
 const fallback=image.nextElementSibling;
 if(fallback?.classList.contains('photo-fallback'))fallback.hidden=true;
}
function photoError(event){
 const image=event.target;if(!image.matches('img'))return;
 const fallback=image.nextElementSibling;
 if(fallback&&fallback.classList.contains('photo-fallback')){image.hidden=true;fallback.hidden=false;}
 if(fallback&&fallback.classList.contains('profile-fallback')){image.hidden=true;fallback.hidden=false;}
}
function rankDock(){const dock=$('rankDock');dock.querySelector('.rank-dock-buttons').innerHTML=TIERS.map(t=>`<span data-dock-tier="${t}">${t}</span>`).join('');}
function pointerAt(x,y){
 document.querySelectorAll('.drag-over,.target-card,.hovered').forEach(node=>node.classList.remove('drag-over','target-card','hovered'));
 if(drag?.ghost){drag.ghost.style.left=x+'px';drag.ghost.style.top=(y-16)+'px';}
 const element=document.elementFromPoint(x,y);
 const dock=element?.closest('[data-dock-tier]');const card=element?.closest('.person[data-id]');const section=element?.closest('.tier-section[data-tier]');
 if(dock){
  dock.classList.add('hovered');
  return {tier:dock.dataset.dockTier,index:Infinity};
 }
 if(section){
  section.classList.add('drag-over');
  const tier=section.dataset.tier;
  if(card&&card.dataset.id!==drag?.id){
   card.classList.add('target-card');
   const list=current().rows[tier];
   const index=list.indexOf(card.dataset.id)+(x>card.getBoundingClientRect().left+card.getBoundingClientRect().width/2?1:0);
   return {tier,index};
  }
  return {tier,index:Infinity};
 }
 return null;
}
function disposeDrag(){
 if(!drag)return;
 drag.ghost?.remove();
 drag.handle?.closest('.person')?.classList.remove('grabbed');
 document.querySelectorAll('.drag-over,.target-card,.hovered').forEach(node=>node.classList.remove('drag-over','target-card','hovered'));
 $('rankDock').hidden=true;
 drag=null;
}
function startPointer(event){
 const handle=event.target.closest('[data-drag-id]');
 if(!handle||event.button!==0||drag||modal.type)return;
 const id=handle.dataset.dragId;
 if(!PEOPLE.has(id))return;
 drag={id,handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,ghost:null,drop:null};
 try{handle.setPointerCapture(event.pointerId);}catch{}
}
function movePointer(event){
 if(!drag||drag.pointerId!==event.pointerId)return;
 const dist=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
 if(!drag.moved&&dist<6)return;
 if(!drag.moved){
  drag.moved=true;
  const p=safePerson(drag.id);
  const ghost=document.createElement('div');ghost.className='drag-ghost';
  const image=document.createElement('img');image.src=p.image;image.alt='';
  const name=document.createElement('span');name.textContent=p.short;
  ghost.append(image,name);document.body.append(ghost);drag.ghost=ghost;
  drag.handle.closest('.person')?.classList.add('grabbed');
  $('rankDock').hidden=false;
 }
 event.preventDefault();
 drag.drop=pointerAt(event.clientX,event.clientY);
 if(event.clientY<72)window.scrollBy(0,-16);
 if(event.clientY>window.innerHeight-130)window.scrollBy(0,10);
}
function finishPointer(event){
 if(!drag||drag.pointerId!==event.pointerId)return;
 const {id,moved,drop}=drag;
 disposeDrag();
 if(event.type==='pointerup'){
  if(moved){if(drop){const changed=move(id,drop.tier,drop.index);if(changed)showNotice('Перемещено в '+drop.tier);}else showNotice('Перемещение отменено');}
  else openPerson(id);
 }
}
function initialize(){
 $('previousEpisode').addEventListener('click',()=>changeEpisode(-1));
 $('nextEpisode').addEventListener('click',()=>changeEpisode(1));
 $('openTools').addEventListener('click',openTools);
 $('board').addEventListener('click',event=>{
  if(drag)return;
  const photo=event.target.closest('[data-open-photo]');
  if(photo){openPhoto(photo.dataset.openPhoto);return;}
  const button=event.target.closest('[data-open-person]');
  if(button)openPerson(button.dataset.openPerson);
 });
 $('board').addEventListener('pointerdown',startPointer);
 document.addEventListener('pointermove',movePointer,{passive:false});
 document.addEventListener('pointerup',finishPointer);
 document.addEventListener('pointercancel',finishPointer);
 document.addEventListener('lostpointercapture',event=>{if(drag&&event.pointerId===drag.pointerId)disposeDrag();},true);
 $('modalRoot').addEventListener('click',handleSheetClick);
 $('modalRoot').addEventListener('input',handleSheetInput);
 $('modalRoot').addEventListener('change',event=>{if(event.target.id==='restoreInput')void importBackup(event.target.files?.[0]);});
 document.addEventListener('error',photoError,true);
 document.addEventListener('load',photoLoad,true);
 document.addEventListener('keydown',event=>{if(photoState){if(event.key==='Escape'){event.preventDefault();closePhoto();}else if(event.key==='Tab')trapPhotoFocus(event);return;}if(event.key==='Escape'&&modal.type)closeSheet();if(event.key==='ArrowRight'&&!modal.type&&event.altKey)changeEpisode(1);if(event.key==='ArrowLeft'&&!modal.type&&event.altKey)changeEpisode(-1);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){persist();disposeDrag();}});
 window.addEventListener('pagehide',()=>{persist();disposeDrag();});
 window.addEventListener('appdatareset',()=>{closePhoto();state=normalizeState(null,IDS);render();closeSheet();showNotice('Данные приложения сброшены');});
 createWorkshopMode({appName:'РОЗКЛАД ТРОЯНД',version:'1.1.0',cachePrefix:'rose-ranking-15-',storageNamespace:APP,onReset(){storage.reset();window.dispatchEvent(new CustomEvent('appdatareset'));}});
 installPhotoViewer();
 rankDock();render();
 document.documentElement.dataset.roseRankingReady='1';
}
initialize();
