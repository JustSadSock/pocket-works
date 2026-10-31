import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { CONTESTANTS } from './contestants.js';
import { createRoseCloudSync } from './cloud-sync.js';
import { TIERS, createFirst, cleanEpisode, normalizeState, ensureEpisode, findTier, movePerson, countRated, rankChanges, eliminatedBeforeEpisode, visibleInEpisode } from './model.js';

installMobileRuntime();

const APP='pocket-works:rose-ranking-15';
const IDS=CONTESTANTS.map(person=>person.id);
const PEOPLE=new Map(CONTESTANTS.map(person=>[person.id,person]));
const TITLES={S:'Без конкуренции',A:'Очень нравятся',B:'Нравятся',C:'Пока нейтрально',D:'Не моё',F:'Последнее место','?':'Ещё не распределены'};
const DISPLAY_ORDER=['?','S','A','B','C','D','F'];
const guestStorage=createVersionedStore({namespace:APP,version:1,defaults:{data:null}});
let activeStorage=guestStorage;
let state=normalizeState(activeStorage.get('data'),IDS);
let cloud=null;
let modal={type:null,id:null};
let pendingImport=null;
let noticeTimeout=0;
let drag=null;
let catalogQuery='';

const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current=()=>state.episodes[state.current];
const safePerson=id=>PEOPLE.get(id);
const visiblePerson=id=>visibleInEpisode(safePerson(id),state.current,state.showAll);
const initials=name=>String(name).split(' ').map(x=>x[0]).slice(0,2).join('');
const episodeLabel=n=>String(n).padStart(2,'0');
const episodeDate=n=>n<=3?new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long'}).format(new Date(Date.UTC(2026,9,16+7*(n-1)))):'Личный рейтинг будущей серии';


const FIRST_OWNER=APP+':first-account-owner';
async function activateAccount(accountId){
 closePhoto();if(modal.type)closeSheet();
 if(!accountId){activeStorage=guestStorage;state=normalizeState(guestStorage.get('data'),IDS);render();return;}
 const next=createVersionedStore({namespace:APP+':account:'+accountId,version:1,defaults:{data:null}});
 let raw=next.get('data');
 let owner=null;try{owner=localStorage.getItem(FIRST_OWNER)}catch{}
 if(!raw&&!owner){
  raw=guestStorage.get('data');
  try{localStorage.setItem(FIRST_OWNER,accountId)}catch{}
  if(raw)next.set('data',raw);
 }
 activeStorage=next;state=normalizeState(raw,IDS);render();
}
async function applyCloudDocument(id,doc){
 if(id==='profile'){
  state.nicknames={...doc.nicknames};state.showAll=doc.showAll;state.profileEdited=doc.edited;
  state.current=doc.current;ensureEpisode(state,state.current,IDS);
 }else{
  const n=Number(id.slice(8));if(!Number.isInteger(n)||n<1||n>100)return;
  state.episodes[n]=cleanEpisode(doc.data,IDS);
 }
 activeStorage.set('data',state);render();
}

function showNotice(message){
 const node=$('notice');node.textContent=message;node.hidden=false;
 clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>node.hidden=true,2900);
}
function persist(){
 const okay=activeStorage.set('data',state);
 cloud?.schedule();
 $('saveStatus').textContent=okay?'Сохранено':'Не удалось сохранить';
 $('saveStatus').style.color=okay?'#638073':'#b8474d';
 if(!okay)showNotice('Не удалось сохранить. Освободи место в браузере и создай резервную копию.');
}
function touchEpisode(){current().edited=Date.now();persist();}
function touchProfile(){state.profileEdited=Date.now();persist();}
function personCard(id,changes,{catalog=false}={}){
 const p=safePerson(id);if(!p)return '';
 const nick=state.nicknames[id]||'';
 const out=eliminatedBeforeEpisode(p,state.current);
 const delta=catalog?'':changes[id]||'';
 const rank=catalog?findTier(current().rows,id):'?';
 return `<article class="person${catalog?' catalog-person':''}" data-id="${escapeHtml(id)}">
  <button type="button" class="person-button" data-open-person="${escapeHtml(id)}" aria-label="${escapeHtml(p.name)}: выбрать тир и посмотреть описание" data-native-press>
    <span class="person-photo"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async"><span class="photo-fallback">${escapeHtml(initials(p.name))}</span></span>
    <span class="person-bottom"><span class="person-name">${escapeHtml(p.short)}${p.name!==p.short?' '+escapeHtml(p.name.split(' ').slice(1).join(' ')):''}</span>${nick?`<span class="person-nick">${escapeHtml(nick)}</span>`:''}</span>
  </button>
  <button type="button" class="photo-expand-button" data-open-photo="${escapeHtml(id)}" aria-label="Просмотреть фотографию ${escapeHtml(p.name)} на весь экран" data-native-press><span aria-hidden="true">⤢</span></button>
  ${catalog&&rank!=='?'?`<span class="catalog-rank" data-rank="${rank}" aria-label="Текущий тир ${rank}">${rank}</span>`:''}
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

function catalogHtml(){
 const query=catalogQuery.trim().toLocaleLowerCase();
 const ids=IDS.filter(id=>visiblePerson(id)&&(!query||((PEOPLE.get(id)?.name||'')+' '+(state.nicknames[id]||'')).toLocaleLowerCase().includes(query)));
 return `<section class="tier-section catalog-section" data-tier="?" aria-label="Каталог участниц; перенос сюда снимает оценку">
   <div class="tier-content" data-tier-content="?">${ids.length?ids.map(id=>personCard(id,{}, {catalog:true})).join(''):'<div class="tier-empty">Никого не найдено. Измени поиск или включи показ выбывших.</div>'}</div>
 </section>`;
}

function render(){
 const ep=current();
 const prev=state.episodes[state.current-1]?.rows;
 const changes=rankChanges(ep.rows,prev);
 $('candidateList').innerHTML=catalogHtml();
 $('board').innerHTML=DISPLAY_ORDER.filter(tier=>tier!=='?').map(tier=>tierHtml(tier,changes)).join('');
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
 touchProfile();render();
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
 cloud?.schedule(350);
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
 `<p class="sheet-hint">Сохранено серий: ${hadEpisodes}. Рейтинги всегда сохраняются локально. Войдя в Pocket ID, можно синхронизировать их между устройствами.</p>
 <div class="tool-actions">
  <button type="button" data-tool="cloud">Pocket Cloud <span>Синхронизировать</span></button>
  ${cloud?.conflicts().length?`<button type="button" data-tool="restore-conflict">Конфликтные копии <span>${cloud.conflicts().length} сохранено</span></button>`:''}
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
  normalized.profileEdited=Date.now();
  for(const ep of Object.values(normalized.episodes))ep.edited=Date.now();
  pendingImport=normalized;
  confirmAction('Заменить архив?','Файл «'+file.name+'» содержит '+Object.keys(normalized.episodes).length+' серий. Все текущие рейтинги и заметки на этом устройстве будут заменены.','Заменить',()=>{state=normalized;persist();closeSheet();render();showNotice('Архив восстановлен');});
 }catch{showNotice('Не удалось прочитать архив. Нужен JSON из этого приложения.');}
}
function handleTools(action){
 if(action==='toggle'){state.showAll=!state.showAll;touchProfile();render();openTools();return;}
 if(action==='cloud'){closeSheet();void cloud?.sync();return;}
 if(action==='restore-conflict'){
  const backup=cloud?.conflicts()[0];if(!backup)return;
  confirmAction('Восстановить версию?', 'Будет восстановлена сохранённая версия. Остальные серии не изменятся.','Восстановить',()=>{
   if(backup.id==='profile'){state.nicknames={...backup.data.nicknames};state.showAll=backup.data.showAll;touchProfile();}
   else{const n=Number(backup.id.slice(8));if(n>=1&&n<=100){state.episodes[n]=cleanEpisode(backup.data.data,IDS);state.episodes[n].edited=Date.now();persist();}}
   cloud.clearConflict(0);closeSheet();render();showNotice('Конфликтная копия восстановлена');
  });return;
 }
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
   state.episodes[number]=createFirst(IDS);state.episodes[number].edited=Date.now();persist();render();closeSheet();showNotice('Рейтинг серии '+number+' очищен');
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
  touchProfile();render();
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

/* Full-viewport photo reading keeps the original aspect ratio, regardless of
   the intentionally cropped small profile cards. This overlay is independent
   from the person editor so notes and unsaved input focus survive a photo view. */
let photoState=null;
const photoPointers=new Map();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function applyPhotoTransform() {
 if(!photoState)return;
 const img=$('photoFull');
 const stage=$('photoStage');
 const w=stage.clientWidth||window.innerWidth;
 const h=stage.clientHeight||window.innerHeight;
 if(img.naturalWidth&&img.naturalHeight&&w&&h){
  const width=Math.min(w,h*img.naturalWidth/img.naturalHeight);
  const height=Math.min(h,w*img.naturalHeight/img.naturalWidth);
  photoState.x=clamp(photoState.x,-Math.max(0,(width*photoState.zoom-w)/2),Math.max(0,(width*photoState.zoom-w)/2));
  photoState.y=clamp(photoState.y,-Math.max(0,(height*photoState.zoom-h)/2),Math.max(0,(height*photoState.zoom-h)/2));
 }else if(photoState.zoom===1){photoState.x=0;photoState.y=0;}
 img.style.transform='translate3d('+photoState.x+'px,'+photoState.y+'px,0) scale('+photoState.zoom+')';
 $('photoZoomOut').disabled=photoState.zoom<=1.001||img.hidden;
 $('photoZoomFit').disabled=photoState.zoom<=1.001||img.hidden;
 $('photoZoomIn').disabled=photoState.zoom>=3.999||img.hidden;
}
function setPhotoZoom(zoom){
 if(!photoState)return;
 photoState.zoom=clamp(zoom,1,4);
 if(photoState.zoom===1){photoState.x=0;photoState.y=0;}
 applyPhotoTransform();
}
function photoSucceeded(){
 if(!photoState||$('photoViewer').hidden)return;
 const img=$('photoFull');
 img.hidden=false;
 $('photoLoading').hidden=true;
 $('photoFailed').hidden=true;
 applyPhotoTransform();
}
function photoFailed(){
 if(!photoState||$('photoViewer').hidden)return;
 $('photoFull').hidden=true;
 $('photoLoading').hidden=true;
 $('photoFailed').hidden=false;
 applyPhotoTransform();
}
function openPhoto(id){
 const person=safePerson(id);
 if(!person)return;
 if(photoState)closePhoto();
 const focus=document.activeElement;
 photoState={id,focus,zoom:1,x:0,y:0,pinch:null};
 photoPointers.clear();
 const viewer=$('photoViewer');
 viewer.hidden=false;
 viewer.setAttribute('aria-label','Фотография: '+person.name);
 $('photoPersonName').textContent=person.name;
 $('photoEpisode').textContent='Серия '+episodeLabel(state.current)+' · оригинальный кадр';
 $('photoLoading').hidden=false;
 $('photoFailed').hidden=true;
 $('photoFailedName').textContent=person.name;
 $('photoSource').href=person.image;
 const img=$('photoFull');
 img.hidden=true;
 img.style.transform='';
 img.alt=person.name+' — фото целиком';
 img.src=person.image;
 if(img.complete&&img.naturalWidth>0)photoSucceeded();
 applyPhotoTransform();
 if(!$('modalRoot').hidden)$('modalRoot').inert=true;
 setDocumentScrollLocked(true);
 $('photoClose').focus({preventScroll:true});
}
function closePhoto(){
 if(!photoState)return;
 const oldFocus=photoState.focus;
 photoPointers.clear();
 photoState=null;
 $('photoViewer').hidden=true;
 $('modalRoot').inert=false;
 if($('modalRoot').hidden)setDocumentScrollLocked(false);
 if(oldFocus?.isConnected)oldFocus.focus({preventScroll:true});
}
function trapPhotoFocus(event){
 const controls=[...$('photoViewer').querySelectorAll('button:not(:disabled),a[href]')].filter(item=>!item.hidden&&item.offsetParent!==null);
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1],active=document.activeElement;
 if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
}
function photoDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function photoMidpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function pointerPhotoDown(event){
 if(!photoState||(event.pointerType==='mouse'&&event.button!==0)||event.target.closest('.photo-failed-actions'))return;
 event.preventDefault();
 try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
 photoPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(photoPointers.size===2){
  const [a,b]=[...photoPointers.values()];
  photoState.pinch={distance:Math.max(1,photoDistance(a,b)),startZoom:photoState.zoom,
   x:photoState.x,y:photoState.y,midpoint:photoMidpoint(a,b)};
 }
}
function pointerPhotoMove(event){
 if(!photoState||!photoPointers.has(event.pointerId))return;
 event.preventDefault();
 const original=photoPointers.get(event.pointerId);
 const dx=event.clientX-original.x,dy=event.clientY-original.y;
 photoPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(photoPointers.size>=2){
  const [a,b]=[...photoPointers.values()];
  const start=photoState.pinch;
  if(!start)return;
  const mid=photoMidpoint(a,b);
  photoState.zoom=clamp(start.startZoom*photoDistance(a,b)/start.distance,1,4);
  photoState.x=start.x+(mid.x-start.midpoint.x);
  photoState.y=start.y+(mid.y-start.midpoint.y);
 }else if(photoState.zoom>1){
  photoState.x+=dx;photoState.y+=dy;
 }else return;
 applyPhotoTransform();
}
function pointerPhotoEnd(event){
 if(!photoState)return;
 photoPointers.delete(event.pointerId);
 photoState.pinch=null;
}
function installPhotoViewer(){
 const viewer=$('photoViewer'),stage=$('photoStage'),image=$('photoFull');
 image.addEventListener('load',photoSucceeded);
 image.addEventListener('error',photoFailed);
 viewer.addEventListener('click',event=>{
  const button=event.target.closest('button[data-photo-action]');
  if(!button||!photoState)return;
  const action=button.dataset.photoAction;
  if(action==='close')closePhoto();
  if(action==='plus')setPhotoZoom(photoState.zoom+.5);
  if(action==='minus')setPhotoZoom(photoState.zoom-.5);
  if(action==='fit')setPhotoZoom(1);
  if(action==='retry'){
   $('photoFailed').hidden=true;$('photoLoading').hidden=false;
   const src=$('photoSource').href;
   image.removeAttribute('src');
   image.src=src;
   if(image.complete&&image.naturalWidth>0)photoSucceeded();
  }
 });
 stage.addEventListener('pointerdown',pointerPhotoDown);
 stage.addEventListener('pointermove',pointerPhotoMove,{passive:false});
 stage.addEventListener('pointerup',pointerPhotoEnd);
 stage.addEventListener('pointercancel',pointerPhotoEnd);
 stage.addEventListener('lostpointercapture',pointerPhotoEnd);
 window.addEventListener('resize',applyPhotoTransform);
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
 $('candidateSearch').addEventListener('input',event=>{catalogQuery=event.target.value;$('candidateList').innerHTML=catalogHtml();});
 $('workbench').addEventListener('click',event=>{
  if(drag)return;
  const photo=event.target.closest('[data-open-photo]');
  if(photo){openPhoto(photo.dataset.openPhoto);return;}
  const button=event.target.closest('[data-open-person]');
  if(button)openPerson(button.dataset.openPerson);
 });
 $('workbench').addEventListener('pointerdown',startPointer);
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
 createWorkshopMode({appName:'РОЗКЛАД ТРОЯНД',version:'1.2.0',cachePrefix: 'rose-ranking-15-', storageNamespace: 'pocket-works:rose-ranking-15',onReset(){activeStorage.reset();window.dispatchEvent(new CustomEvent('appdatareset'));}});
 installPhotoViewer();
 cloud=createRoseCloudSync({ids:IDS,getState:()=>state,setCloudDocument:applyCloudDocument,activateAccount,notify:showNotice});
 rankDock();render();cloud.start();
 document.documentElement.dataset.roseRankingReady='1';
}
initialize();
