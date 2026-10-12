import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey,pocketPlayerBadge,pocketAvatarMarkup,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import {inviteCode,parseRoomInput} from './room-code.js';
import {tabGuestName,tabStorage,rememberTabName,prepareTabGuest,markTabGuest,clearTabGuest} from './tab-guests.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,artworkURL,artworkFallbackURL,primeGallery} from './artworks.js';
import {Editor,renderArtwork} from './editor.js';
import {roundReviewMarkup,renderRoundThumbnails,openRoundViewer,closeRoundViewer} from './round-review.js';
import {getSavedEmblem,storeEmblem,paintEmblem,exportEmblem,EMBLEM_SIZE,EMBLEM_COLORS,EMBLEM_LIMITS} from './emblem.js';
import {createMuseumMotion} from './museum-motion.js';
import {createCommonsBoard,COMMONS_COLORS} from './commons-board.js';
import {sendPainting} from './draft-transfer.js';
import {createZamazkaCloud} from './cloud-sync.js';
installMobileRuntime();
createWorkshopMode({appName:'ЗАМАЗКА',version:'1.18.0',cachePrefix: 'zamazka-',storageNamespace: 'pocket-works:zamazka',onReset(){try{sessionStorage.removeItem('pocket-net:'+location.origin+'/pocketnet')}catch{}for(const storage of [localStorage,sessionStorage])try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('pocket-works:zamazka:'))storage.removeItem(key)}}catch{}location.reload()}});
const screen=document.querySelector('#screen'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const NS='pocket-works:zamazka:',GALLERY_KEY=NS+'gallery',PRACTICE_KEY=NS+'practice';
const POCKETNET_URL=location.origin+'/pocketnet';
const q=new URLSearchParams(location.search);
let invitedRoom=q.get('room')||'';
let page='home',net=null,me=null,view=null,roomId='',editor=null,practice=null,choice=null,chips=[0,0,0,0,0],chipTarget='',connectionEpoch=0,beepEnabled=localStorage.getItem(NS+'sound')!=='off',lastPulse=0,lastUiKey='';
let personalEmblem=getSavedEmblem();
let zamazkaCloud=null;
let pocketIdentity=null;
const gameName=()=>preferredPocketName(pocketIdentity,tabGuestName());
const isPocketMember=()=>Boolean(pocketIdentity?.complete);
let museumMotion=null,commonsBoard=null,lastMuseumWheel=0,boardResync=false,roomModuleVersion='v3';
const museumOrder=[0,...PLAYABLE_IDS.filter(id=>id!==3),3];
let saved=(()=>{try{const a=JSON.parse(localStorage.getItem(GALLERY_KEY)||'[]');return Array.isArray(a)?a.slice(0,96).map(g=>({...g,art:g.edition===3?g.art:g.edition===2?(g.art>=8?g.art+46:g.art):Number(g.art)+REAL_COUNT,edition:3})):[]}catch{return[]}})();

// Retry a smaller Wikimedia thumbnail when the original master is too small.
document.addEventListener('error',e=>{
 const image=e.target;
 if(!(image instanceof HTMLImageElement)||!image.dataset.artId)return;
 const id=Number(image.dataset.artId);
 const fallback=artworkFallbackURL(id,image.currentSrc||image.src);
 if(fallback&&fallback!==image.src){image.src=fallback;return}
 image.alt=ARTS[id]?.title+' · изображение временно недоступно';
},true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function imageTag(src,alt='Личный знак'){
 return typeof src==='string'&&src.length<=EMBLEM_LIMITS.encoded&&/^data:image\/(?:png|webp);base64,/.test(src)
   ?'<img src="'+esc(src)+'" alt="'+esc(alt)+'" loading="eager">'
   :'<span class="empty-seal" aria-hidden="true">✎</span>';
}
function mySealMarkup(){return '<span class="personal-seal">'+imageTag(personalEmblem.image)+'</span>'}
function memberSeal(p){
 const source=view?.emblems?.[p.id]||(p.id===me?.id?personalEmblem.image:'');
 return '<span class="member-seal">'+imageTag(source,'Личный знак '+p.name)+'</span>';
}
function syncIdentity(){
 const btn=document.querySelector('#profileBtn');
 if(btn){btn.innerHTML=imageTag(personalEmblem.image);btn.title='Редактировать свой знак';}
 screen.querySelectorAll('[data-personal-seal]').forEach(el=>el.innerHTML=imageTag(personalEmblem.image));
}
function shiftMuseum(step){if(page!=='home'||!museumMotion)return;museumMotion.shift(step);sound(365)}
function commonsHtml(leader){
 return '<section class="commons-desk" aria-label="Общий холст выставки">'+
 '<div class="commons-topline"><div><span class="section-label">ОБЩАЯ МАСТЕРСКАЯ</span><h3>Порисуем вместе?</h3><p>Рисуйте одновременно — мазки видны всем участникам комнаты.</p></div><span class="commons-online"><i></i> ВМЕСТЕ</span></div>'+
 '<div class="commons-frame"><canvas id="commonsCanvas" width="960" height="600" aria-label="Общий холст для свободного рисования"></canvas><span class="commons-corner" aria-hidden="true">✳</span></div>'+
 '<div class="commons-controls"><div class="commons-palette" aria-label="Цвет кисти">'+COMMONS_COLORS.map((c,i)=>'<button class="commons-swatch'+(i===0?' selected':'')+'" data-commons-color="'+c+'" aria-label="Цвет '+(i+1)+'" style="--swatch:'+c+'"></button>').join('')+'</div>'+
 '<label class="commons-width">Толщина <input id="commonsSize" type="range" min="2" max="36" value="9"></label>'+
 (leader?'<button class="commons-wipe" data-action="board-clear">Очистить холст</button>':'<span class="commons-note">Очистка доступна куратору</span>')+'</div></section>';
}
function editEmblem(){
 const current=personalEmblem.strokes.map(s=>({c:s.c,s:s.s,p:s.p.map(p=>[...p])}));
 let strokes=current,ink=EMBLEM_COLORS[0],size=7,drawing=null,pointer=null;
 let backupKey='';
 try{backupKey=Object.keys(localStorage).filter(k=>k.startsWith('pocket-works:zamazka:emblem-cloud-backup:')).sort().at(-1)||''}catch{}
 const markup='<p class="emblem-explainer">Твоя нарисованная подпись. Она появится рядом с ником у остальных игроков.</p>'+
  '<div class="emblem-board"><canvas id="emblemCanvas" width="'+EMBLEM_SIZE.w+'" height="'+EMBLEM_SIZE.h+'" aria-label="Холст личного знака"></canvas><span class="emblem-board-caption">ЛИЧНАЯ ПЕЧАТЬ · 240 × 144</span></div>'+
  '<div class="emblem-palette" aria-label="Цвет кисти">'+EMBLEM_COLORS.map((c,i)=>'<button type="button" class="emblem-ink'+(i===0?' selected':'')+'" data-emblem-ink="'+c+'" style="--ink-color:'+c+'" aria-label="Цвет '+(i+1)+'"></button>').join('')+'</div>'+
  '<div class="emblem-tools"><label>Толщина <input id="emblemSize" type="range" min="2" max="24" value="7"></label><button type="button" id="emblemUndo">↶ Отмена</button><button type="button" id="emblemClear">Очистить</button></div>';
 modal('Твой личный знак',markup,[['Сохранить',()=>{
   const image=exportEmblem(strokes);
   if(!image){notify('Слишком сложный рисунок. Уменьши количество деталей.');return}
   if(!storeEmblem(strokes,image)){notify('Не удалось сохранить знак на устройстве.');return}
   personalEmblem={strokes,image};
   zamazkaCloud?.schedule();
   if(net&&roomId&&view?.participants?.some(p=>p.id===me?.id)){try{net.sendGame({type:'emblem',image})}catch{notify('Знак сохранён. В комнате обновится после подключения.')}}
   closeDialog();syncIdentity();
   if(page==='lobby')lobby();
   notify('Личный знак сохранён');
 },'primary'],['Отмена',closeDialog,'ghost']]);
 const canvas=dialog.querySelector('#emblemCanvas'),palette=dialog.querySelector('.emblem-palette');
 const paint=()=>paintEmblem(canvas,strokes);
 paint();
 const point=e=>{
  const r=canvas.getBoundingClientRect();
  return [Math.round(Math.max(0,Math.min(EMBLEM_SIZE.w,(e.clientX-r.left)*EMBLEM_SIZE.w/r.width))),Math.round(Math.max(0,Math.min(EMBLEM_SIZE.h,(e.clientY-r.top)*EMBLEM_SIZE.h/r.height)))];
 };
 canvas.addEventListener('pointerdown',e=>{
  if(pointer!==null||strokes.length>=EMBLEM_LIMITS.strokes){if(strokes.length>=EMBLEM_LIMITS.strokes)notify('Лимит мазков. Отмени последний штрих.');return}
  e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);drawing={c:ink,s:size,p:[point(e)]};strokes.push(drawing);paint();
 });
 canvas.addEventListener('pointermove',e=>{
  if(pointer!==e.pointerId||!drawing)return;
  e.preventDefault();const p=point(e),q=drawing.p.at(-1);
  if(Math.hypot(p[0]-q[0],p[1]-q[1])<1.5)return;
  if(drawing.p.length>=300||strokes.reduce((n,s)=>n+s.p.length,0)>=EMBLEM_LIMITS.points)return;
  drawing.p.push(p);paint();
 });
 const stop=e=>{if(pointer===e.pointerId){pointer=null;drawing=null}};
 canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
 palette.addEventListener('click',e=>{
  const button=e.target.closest('[data-emblem-ink]');if(!button)return;
  ink=button.dataset.emblemInk;palette.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));
 });
 dialog.querySelector('#emblemSize').addEventListener('input',e=>size=Number(e.target.value));
 dialog.querySelector('#emblemUndo').addEventListener('click',()=>{strokes.pop();paint()});
 if(backupKey){
  const button=document.createElement('button');
  button.type='button';button.textContent='Вернуть предыдущую версию знака';button.className='emblem-restore-backup';
  dialog.querySelector('.emblem-tools').after(button);
  button.addEventListener('click',()=>{
   if(!confirm('Заменить текущий знак сохранённой локальной версией?'))return;
   try{
    const backup=JSON.parse(localStorage.getItem(backupKey));
    if(!storeEmblem(backup.strokes,backup.image))throw Error('Не удалось сохранить знак');
    personalEmblem=getSavedEmblem();zamazkaCloud?.schedule();
    closeDialog();syncIdentity();if(page==='lobby')lobby();
    notify('Предыдущий знак восстановлен');
   }catch{notify('Резервная копия не открывается')}
  });
 }
 let confirmClear=false;
 dialog.querySelector('#emblemClear').addEventListener('click',e=>{if(!confirmClear){confirmClear=true;e.currentTarget.textContent='Точно очистить?';return}strokes=[];confirmClear=false;e.currentTarget.textContent='Очистить';paint()});
}
function sound(f=560){if(!beepEnabled)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=window.__zamazkaAudio||(window.__zamazkaAudio=new Audio());if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*.83,ac.currentTime+.09);g.gain.setValueAtTime(.025,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.11);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.12)}catch{}}
let toastTimer,lastToast='',lastToastAt=0;
function notify(t){const message=String(t||'');if(message===lastToast&&Date.now()-lastToastAt<5000)return;
 lastToast=message;lastToastAt=Date.now();toast.textContent=message;toast.classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}

function closeDialog(){closeRoundViewer();dialog.classList.remove('round-view-dialog');dialog.classList.add('hidden');dialog.innerHTML=''}
function modal(title,body,buttons){dialog.classList.remove('hidden');dialog.innerHTML='<div class="dialog-box"><h2>'+title+'</h2>'+body+'<div class="stack" id="modalActions"></div></div>';const actionBox=dialog.querySelector('#modalActions');buttons.forEach(([label,fn,cls])=>{const b=document.createElement('button');b.className='btn '+(cls||'');b.textContent=label;b.addEventListener('click',()=>{sound();fn()});actionBox.append(b)})}
let draftDelay=null,lastDraftPayload='',lastDraftRound='',lastDraftRevision='',lastDraftAckRevision='',lastDraftSentAt=0,autoSubmitted='',archiveAutoSaved='';
const SUBMIT_KEY=NS+'pending-submission';
let pendingSubmit=(()=>{try{return JSON.parse(localStorage.getItem(SUBMIT_KEY)||'null')}catch{return null}})();
function persistPending(){try{if(pendingSubmit)localStorage.setItem(SUBMIT_KEY,JSON.stringify(pendingSubmit));else localStorage.removeItem(SUBMIT_KEY)}catch{}}
function submissionToken(ass,round){return [roomId,round,ass.art,ass.variation].join(':')}
function confirmSubmission(art,round){
 if(!pendingSubmit||pendingSubmit.round!==round||pendingSubmit.art!==art||pendingSubmit.room!==roomId)return;
 const committed=pendingSubmit;pendingSubmit=null;persistPending();autoSubmitted=committed.token;
 const button=screen.querySelector('[data-action="submit"]');if(button)button.disabled=true;
 draftIndicator('Принято сервером ✓');sound(700);
}
function attemptSubmission(force=false){
 const p=pendingSubmit;
 if(!p||p.room!==roomId||!net||!view||view.phase!=='drawing'||view.done?.includes(me?.id))return;
 if(!force&&Date.now()-(p.sentAt||0)<3600)return;
 try{
  const result=sendPainting(packet=>net.sendGame(packet),
   {type:'submit_chunk',round:p.round,art:p.art,variation:p.variation,strokes:p.strokes});
  p.revision=result.revision;p.sentAt=Date.now();p.attempts=(p.attempts||0)+1;persistPending();
  const button=screen.querySelector('[data-action="submit"]');if(button)button.disabled=true;
  draftIndicator('Передаём работу…');
 }catch{
  p.sentAt=0;persistPending();
  draftIndicator('Нет связи · работа сохранена на устройстве');
 }
}
function submitArtwork({automatic=false}={}){
 if(!editor||!view?.mine||!roomId)return;
 const ass=view.mine,token=submissionToken(ass,view.round);
 if(pendingSubmit?.token===token){attemptSubmission(true);return}
 const strokes=editor.getData();editor.saveSnapshot();
 pendingSubmit={token,room:roomId,round:view.round,art:ass.art,variation:ass.variation,strokes,revision:null,sentAt:0,attempts:0};
 persistPending();
 if(strokes.length&&archiveAutoSaved!==token){archiveAutoSaved=token;saveArtwork(ass.art,ass.variation,strokes)}
 attemptSubmission(true);
 if(!automatic)sound(550);
}

function draftIndicator(message){const el=screen.querySelector('#draftStatus');if(el)el.textContent=message}
function backupDraft(force=false){
 if(!editor||page!=='drawing')return;
 editor.saveSnapshot();
 if(practice||!view||view.phase!=='drawing'||view.done?.includes(me?.id))return;
 const ass=view.mine;if(!ass)return;
 const token=[roomId,view.round,ass.art,ass.variation].join(':');
 if(autoSubmitted===token||pendingSubmit?.token===token)return; // final transfer owns this revision
 const strokes=editor.getSnapshot(),serialized=JSON.stringify(strokes);
 if(!force&&token===lastDraftRound&&serialized===lastDraftPayload&&
    (lastDraftAckRevision===lastDraftRevision||Date.now()-lastDraftSentAt<6500))return;
 try{
  if(!net)throw Error('offline');
  const result=sendPainting(packet=>net.sendGame(packet),
    {type:'draft_chunk',round:view.round,art:ass.art,variation:ass.variation,strokes});
  lastDraftRound=token;lastDraftPayload=serialized;
  lastDraftRevision=result.revision;lastDraftSentAt=Date.now();draftIndicator('Сохраняем…');
 }catch{draftIndicator('Черновик на устройстве · повторим при подключении')}
}
function queueDraft(){
 if(practice)return;
 draftIndicator('Черновик на устройстве');
 clearTimeout(draftDelay);draftDelay=setTimeout(()=>backupDraft(),650);
}
function stopEditor(){clearTimeout(draftDelay);draftDelay=null;if(editor){editor.dispose();editor=null}}
function autoFinishOnDeadline(){
 if(!editor||practice||page!=='drawing'||!view||view.phase!=='drawing'||view.done?.includes(me?.id))return;
 if(Date.now()<view.deadline-1900)return;
 const token=submissionToken(view.mine,view.round);
 if(autoSubmitted===token||pendingSubmit?.token===token)return;
 submitArtwork({automatic:true});
}
function change(html,which){if(page!==which)closeDialog();museumMotion?.dispose();museumMotion=null;commonsBoard?.dispose();commonsBoard=null;stopEditor();page=which;lastUiKey='';screen.innerHTML=html;screen.scrollTop=0}
const head=(phase,title,until,context='')=>'<div class="phase-head"><div><div class="eyebrow">'+esc(phase)+'</div><h2>'+esc(title)+'</h2>'+(context?'<div class="art-head-context">'+context+'</div>':'')+'</div><div class="timer" id="clock">'+(until?'…':'')+'</div></div>';
function artFactsHtml(id){
 const art=ARTS[id];if(!art)return '';
 const identity=[art.artist,art.date].filter(Boolean).map(esc).join(' · ');
 const facts=[art.schoolCountry?'Школа: '+art.schoolCountry:null,art.creationPlace?'Создано: '+art.creationPlace.city+', '+art.creationPlace.country:null].filter(Boolean).map(esc).join(' · ');
 return '<span class="art-head-identity">'+identity+'</span>'+(facts?'<span class="art-head-origin">'+facts+'</span>':'');
}
const picture=id=>'<div class="frame"><img src="'+artworkURL(id)+'" alt="'+esc(ARTS[id].title)+'"></div>';
function home(){
 connectionEpoch++;
 pendingSubmit=null;persistPending();
 invitedRoom='';
 if(q.has('room')||q.has('server'))history.replaceState(null,'',location.pathname+location.hash);
 clearTabGuest();
 if(net){try{net.leaveRoom()}catch{}net.close();net=null}
 view=null;roomId='';practice=null;boardResync=false;roomModuleVersion='v3';
 change('<section class="museum-home">'+
  
  '<div class="museum-headline"><h1>Искусство<br><em>подделки.</em></h1></div>'+
  '<div class="museum-display">'+
    '<div class="museum-stage" id="museumStage" aria-label="Перелистываемая музейная экспозиция"></div>'+
    '<div class="museum-stage-caption" id="museumCaption" aria-live="polite"><strong>Девушка с жемчужной серёжкой</strong><span>Ян Вермеер · ок. 1665</span></div>'+
    '<div class="museum-wheel"><button data-action="museum-prev" aria-label="Предыдущая картина">‹</button><button data-action="museum-next" aria-label="Следующая картина">›</button></div><span class="museum-exhibit-number">01 / 54</span>'+
  '</div>'+
  '<div class="museum-control">'+'<button class="museum-persona" data-action="emblem" aria-label="Нарисовать или изменить свой личный знак"><span data-personal-seal class="personal-seal">'+imageTag(personalEmblem.image)+'</span><span class="persona-caption"><strong>'+esc(gameName())+'</strong><small>Изменить знак</small></span><span class="persona-edit" aria-hidden="true">✎</span></button>'+
    '<button class="start-restoration" id="primary-action" data-action="practice" disabled><span class="start-emblem" aria-hidden="true">✳</span><span><strong>Загружаем оригиналы…</strong><small>Загрузка картин</small></span><span class="start-arrow" aria-hidden="true">↗</span></button>'+
    '<div class="museum-lower"><button data-action="create"><span>＋</span> Создать комнату</button><button data-action="join"><span>↗</span> Ввести код</button></div>'+
    '<div class="museum-footer"><button data-action="collection">Мой архив <span>'+String(saved.length).padStart(2,'0')+'</span></button><button data-action="cloud-sync" class="cloud-control">☁ Облако</button>'+
    (localStorage.getItem(PRACTICE_KEY)?'<button data-action="resume">ПРОДОЛЖИТЬ ЧЕРНОВИК ↗</button>':'')+'</div>'+
  '</div></section>','home');
 museumMotion=createMuseumMotion(screen.querySelector('#museumStage'),{order:museumOrder,url:artworkURL,arts:ARTS,onCenter(id){const caption=screen.querySelector('#museumCaption');if(caption)caption.innerHTML='<strong>'+esc(ARTS[id].title)+'</strong><span>'+esc(ARTS[id].artist)+' · '+esc(ARTS[id].date||'')+'</span>';const number=screen.querySelector('.museum-exhibit-number');if(number)number.textContent=String(id+1).padStart(2,'0')+' / '+String(museumOrder.length).padStart(2,'0')}});
 syncIdentity();
 zamazkaCloud?.render();
 primeGallery().then(results=>{
   if(page!=='home')return;
   const primary=screen.querySelector('#primary-action');
   if(!primary)return;
   const ready=results.every(r=>r.status==='fulfilled');
   primary.disabled=!ready;
   primary.querySelector('strong').textContent=ready?'Начать реставрацию':'Оригиналы пока недоступны';
   primary.querySelector('small').textContent=ready?'Пробный раунд':'Нет доступа к изображениям';
   if(!ready){
     const foot=screen.querySelector('.museum-footer');
     const retry=document.createElement('button');retry.dataset.action='retry-gallery';retry.textContent='ПОВТОРИТЬ ЗАГРУЗКУ ↗';foot?.append(retry);
   }
 });
}
function setup(mode,error='',roomValue=invitedRoom){
 const creating=mode==='create';
 change('<section class="page lobby-entry">'+
  '<div class="entry-heading"><div><h2>'+(creating?'Создать комнату':'Войти по коду')+'</h2></div><div class="entry-stamp" aria-hidden="true">З<br>М</div></div>'+
  '<div class="entry-identity"><button class="identity-seal-button" data-action="emblem" aria-label="Нарисовать свой знак">'+mySealMarkup()+'<span>✎</span></button><div class="identity-label"><strong>Твой знак</strong></div></div>'+ '<label class="field" for="who">Твой ник</label><input class="input" id="who" maxlength="22" autocomplete="nickname" placeholder="Имя реставратора" value="'+esc(gameName())+'" '+(isPocketMember()?'readonly aria-readonly="true"':'')+'>'+
   '<p class="hint pw-room-identity">'+(isPocketMember()?pocketAvatarMarkup(pocketIdentity.artwork||pocketIdentity.avatar,{small:true,accountId:pocketIdentity.id})+' Ник подтверждён Pocket ID · <a href="'+pocketIdProfileUrl+'">Изменить профиль</a>':'Гостевой режим · <a href="'+pocketIdProfileUrl+'">Войти через Pocket ID</a>')+'</p>'+
  (creating?'':
   '<label class="field" for="room">Код комнаты или ссылка</label><input class="input room-entry-input" id="room" maxlength="250" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="Например, A3F92C10" value="'+esc(roomValue)+'"><p class="hint">Восемь символов. Ссылку тоже можно вставить целиком.</p>')+
  (error?'<div class="notice entry-error" role="alert">'+esc(error)+'</div>':'')+
  '<div class="subtle-rule"></div><div class="stack"><button class="btn primary" data-action="connect" data-mode="'+mode+'">'+(creating?'Создать комнату ↗':'Присоединиться ↗')+'</button><button class="btn ghost" data-action="menu">В главное меню</button></div></section>','setup');
}
let roundsChoice=3;
let drawingSecondsChoice=160;
const DRAWING_TIME_OPTIONS=[[60,'1 минута'],[90,'1:30'],[120,'2 минуты'],[160,'2:40 · стандарт'],[240,'4 минуты'],[300,'5 минут']];
function lobby(){
 if(!view||!roomId)return;
 const players=view.participants||[],leader=view.host===me?.id,code=inviteCode(roomId);
 const markup='<section class="page exhibition-lobby"><div class="section-label">ЧАСТНАЯ ЭКСПОЗИЦИЯ / ЗАЛ ОЖИДАНИЯ</div><h2>Ждём гостей.</h2>'+
  '<button class="lobby-self" data-action="emblem"><span data-personal-seal class="personal-seal">'+imageTag(personalEmblem.image)+'</span><span><strong>'+esc(me?.name||tabGuestName())+'</strong><small>Твоя эмблема · изменить рисунок</small></span><span class="lobby-self-arrow">✎</span></button>'+'<div class="room-ticket"><div class="ticket-top"><span class="section-label">КОД КОМНАТЫ</span><span class="ticket-live"><span></span> ОТКРЫТА</span></div>'+
  '<div class="room-code" aria-label="Код комнаты">'+esc(code)+'</div>'+
  '<div class="ticket-actions"><button class="btn primary" data-action="copy-code">Скопировать код</button><button class="btn ghost" data-action="share">Отправить ссылку ↗</button>'+(isPocketMember()?'<button class="btn ghost" type="button" data-social-invite data-room-id="'+esc(roomId)+'">Позвать друзей Pocket ID</button>':'')+'</div></div>'+
  '<div class="lobby-list-heading"><span class="section-label">ИГРОКИ · '+players.length+'/8</span><span>'+(leader?'Ты — куратор':'Ожидаем куратора')+'</span></div>'+
  '<div class="players">'+players.map(p=>'<div class="player">'+memberSeal(p)+'<div class="player-name">'+esc(p.name)+pocketPlayerBadge(p)+(p.id===me?.id?' <span class="me-tag">ты</span>':'')+'</div><span class="status">'+(p.id===view.host?'Куратор':'Реставратор')+'</span></div>').join('')+'</div>'+
  (Number(roomModuleVersion.slice(1))>=3?commonsHtml(leader):'<div class="notice legacy-room">Эта комната создана до появления общего холста. Для совместного рисования открой новую комнату.</div>')+'<div class="stack">'+(leader?'<label class="field" for="rounds">Раундов</label><select class="input" id="rounds">'+[1,3,5].map(n=>'<option value="'+n+'" '+(roundsChoice===n?'selected':'')+'>'+n+' '+(n===1?'раунд':n===5?'раундов':'раунда')+'</option>').join('')+'</select><label class="field" for="drawingSeconds">Время рисования</label><select class="input" id="drawingSeconds">'+DRAWING_TIME_OPTIONS.map(([seconds,label])=>'<option value="'+seconds+'" '+(drawingSecondsChoice===seconds?'selected':'')+'>'+label+'</option>').join('')+'</select><button class="btn primary" data-action="start" '+(players.length<2?'disabled':'')+'>'+(players.length<2?'Ждём второго игрока':'Начать выставку ↗')+'</button>':'<div class="notice">Когда куратор начнёт выставку, игра запустится автоматически.</div>')+
  '<button class="btn ghost" data-action="leave">Покинуть комнату</button></div></section>';
 if(page==='lobby'&&commonsBoard){
   const future=document.createElement('div');future.innerHTML=markup;
   for(const selector of ['.lobby-self','.lobby-list-heading','.players','.exhibition-lobby>.stack']){
     const old=screen.querySelector(selector),newer=future.querySelector(selector);if(old&&newer)old.replaceWith(newer);
   }
   const controls=screen.querySelector('.commons-controls');
   if(controls){
     const wipe=controls.querySelector('[data-action="board-clear"]'),note=controls.querySelector('.commons-note');
     if(leader&&!wipe){note?.remove();controls.insertAdjacentHTML('beforeend','<button class="commons-wipe" data-action="board-clear">Очистить холст</button>')}
     if(!leader&&wipe){wipe.remove();controls.insertAdjacentHTML('beforeend','<span class="commons-note">Очистка доступна куратору</span>')}
   }
   if(view?.board&&(boardResync||commonsBoard.revision!==view.board.revision)){commonsBoard.reset(view.board);boardResync=false}
   return;
 }
 change(markup,'lobby');
 if(Number(roomModuleVersion.slice(1))>=3)commonsBoard=createCommonsBoard(screen.querySelector('.commons-desk'),{send:packet=>net?.sendGame(packet),onError:notify,canClear:leader,snapshot:view?.board||{revision:0,segments:[]}});
 boardResync=false;
}
function galleryHtml(list,select=false){return '<div class="gallery exhibition-grid">'+list.map((id,i)=>'<button class="picture'+(choice===id&&select?' selected':'')+'" data-'+(select?'choice':'inspect')+'="'+id+'"><span class="picture-image"><img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'" loading="eager"></span><span class="picture-index">ОБЪЕКТ '+String(i+1).padStart(2,'0')+'</span><span class="caption">'+esc(ARTS[id]?.title||'Картина')+'</span><span class="style">'+esc(ARTS[id]?.artist||ARTS[id]?.style)+' · '+esc(ARTS[id]?.date||'')+(ARTS[id]?.schoolCountry?' · '+esc(ARTS[id].schoolCountry):'')+'</span></button>').join('')+'</div>'}
function preview(local=false){
 const v=local?practice:view;
 change('<section class="phase-page">'+head('РАУНД '+v.round+' / '+(v.rounds||1),'Запомни оригиналы',v.deadline)+'<div class="phase-body"><p class="phase-directive">Запомни детали пяти картин.</p>'+galleryHtml(v.selected)+(local?'<button class="btn primary wide" data-action="skip">Перейти к реставрации</button>':'')+'</div></section>','preview');
}
function editorIcon(name){
 const shapes={
 brush:'<path d="m15 4 5 5-8 8-4-4zM7 14c-3 0-3 3-3 6 3 0 6-1 6-4"/>',
 fill:'<path d="m4 11 8-8 8 8-8 8zM4 11h16M20 17c.7 1 1.5 2 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.7.8-1.7 1.5-2.7Z"/>',
 picker:'<path d="m12 4 2-2 8 8-2 2-2-2-10 10-4 1 1-4L14 6zM12 8l4 4"/>',
 erase:'<path d="m4 13 8-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-8 7H8l-4-4a2 2 0 0 1 0-3zM9 9l8 8M13 20h8"/>',
 hand:'<path d="M9 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 5-3 7-7 7h-2c-3 0-5-2-6-4l-2-3a2 2 0 0 1 3-2z"/>',
 undo:'<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6"/>',
 redo:'<path d="m15 7 5 5-5 5M20 12H10a6 6 0 0 0-6 6"/>',
 out:'<path d="M5 12h14"/>',in:'<path d="M5 12h14M12 5v14"/>',
 center:'<path d="M12 3v4m0 10v4M3 12h4m10 0h4"/><circle cx="12" cy="12" r="5"/>',
 precision:'<circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
 swap:'<path d="m8 5-4 4 4 4M4 9h15m-3 10 4-4-4-4M20 15H5"/>'
 };
 return '<svg class="draw-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||'')+'</svg>';
}
function toolbar(){
 const tools=[['brush','Кисть'],['fill','Заливка'],['picker','Пипетка'],['erase','Ластик'],['hand','Панорама']];
 const palette=['#304a43','#9d4c3c','#d6ae6f','#f1e4c5','#263d57','#637f68'];
 const toolButton=(name,label,command=false)=>'<button type="button" class="tool'+(name==='brush'&&!command?' active':'')+'" '+(command?'data-cmd':'data-tool')+'="'+name+'" aria-label="'+label+'" title="'+label+'">'+editorIcon(name)+'<span>'+label+'</span></button>';
 return '<div class="tools">'+tools.map(([name,label])=>toolButton(name,label)).join('')+'</div>'+
 '<div class="colors" aria-label="Цвета кисти">'+palette.map((color,i)=>'<button type="button" class="swatch'+(i===0?' active':'')+'" data-color="'+color+'" aria-label="Цвет '+(i+1)+'" style="background:'+color+'"></button>').join('')+
 '<input type="color" class="color-input" id="customColor" value="#304a43" aria-label="Свой цвет"></div>'+
 '<div class="adjust"><label for="brushSize">Толщина</label><input type="range" id="brushSize" aria-label="Толщина кисти" min="1" max="48" value="12"><div class="adjust-actions">'+
 toolButton('undo','Отменить',true)+toolButton('redo','Вернуть',true)+
 '<button type="button" class="mode-switch" data-cmd="precision" aria-pressed="false" title="Переключить режим рисования">'+editorIcon('precision')+'<span>Прямое</span></button>'+
 '</div></div><div class="zoom-actions">'+toolButton('out','Отдалить',true)+toolButton('in','Приблизить',true)+toolButton('center','К повреждению',true)+'</div>';
}
function drawing(local=false){
  const v=local?practice:view,ass=v.mine;
  if(!ass){change('<section class="phase-page">'+head('ЭКСПОЗИЦИЯ','Матч уже идёт',v.deadline)+'<div class="phase-body"><div class="notice">Ты подключился после начала. Доступ к реставрации откроется в новой комнате после завершения матча.</div><button class="btn ghost wide" data-action="leave">Выйти из комнаты</button></div></section>','waiting');return}
  if(!local&&v.done?.includes(me?.id)){waiting();return}
  change('<section class="restore"><div class="rest-head">'+head('РАУНД '+v.round+' · РЕСТАВРАЦИЯ',ARTS[ass.art].title,v.deadline,artFactsHtml(ass.art))+'</div><div class="work-area"><div class="work-stage"><div class="viewport" data-gesture-surface><canvas id="paintCanvas" width="600" height="450" aria-label="Холст для дорисовывания"></canvas><div class="brush-cursor" id="brushCursor" aria-hidden="true" hidden></div></div></div><button type="button" id="precisionArm" class="precision-arm" data-gesture-surface aria-label="Удерживай вторым пальцем, чтобы рисовать" aria-pressed="false" hidden><span class="precision-arm-circle" aria-hidden="true"></span><strong>РИСОВАТЬ</strong></button><button type="button" id="precisionSide" class="precision-side" data-cmd="handedness" aria-label="Переместить кнопку рисования на другую сторону" hidden><svg class="draw-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5-4 4 4 4M4 9h15m-3 10 4-4-4-4M20 15H5"/></svg></button><div class="work-tip" id="drawingTip">Рисуй в повреждённой части</div></div><div class="work-tools">'+toolbar()+'<div class="work-foot"><div class="work-save-info"><div class="quiet" id="strokeCount">Линий: 0 / 100</div><div class="quiet" id="draftStatus">Автосохранение</div></div><button class="btn primary" data-action="submit">Сдать работу</button></div></div></section>','drawing');
  editor=new Editor(screen,{id:ass.art,variation:ass.variation,round:v.round,onChange:n=>{const t=document.querySelector('#strokeCount');if(t)t.textContent=n<0?'Лимит точек или линий · отмените штрих':'Линий: '+n+' / 100';if(n>=0)queueDraft()}});
  if(!local&&Array.isArray(ass.draft))editor.adoptDraft(ass.draft);
  const counter=document.querySelector('#strokeCount');if(counter)counter.textContent='Линий: '+editor.strokes.length+' / 100';
  if(!local)backupDraft(true);
}

function waiting(){
 const v=view,ass=v?.mine;if(!v||!ass)return;
 const finished=v.done||[],players=v.participants||[];
 change('<section class="phase-page waiting-phase">'+head('РАУНД '+v.round+' · РАБОТА СДАНА','Твой шедевр в музее',v.deadline,artFactsHtml(ass.art))+
 '<div class="phase-body waiting-layout"><div class="waiting-work">'+
 '<h3>'+esc(ARTS[ass.art]?.title||'Твоя работа')+'</h3><p class="phase-directive">Двигай ползунок, чтобы сравнить с оригиналом.</p>'+
 '<div class="unveil-frame" id="unveilStage" style="--split:50%"><canvas id="restCanvas" class="unveil-bottom" aria-label="Моя реставрация"></canvas><canvas id="origCanvas" class="unveil-top" aria-label="Оригинальная картина"></canvas><span class="unveil-label left">МОЯ РАБОТА</span><span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
 '<label class="unveil-control" for="unveilRange">Сравнить до и после <input id="unveilRange" type="range" min="0" max="100" value="50" aria-label="Сравнить мою реставрацию и оригинал"></label></div>'+
 '<aside class="waiting-progress"><h3>Ожидаем остальных</h3><strong id="readyCount">'+finished.length+' / '+players.length+'</strong>'+
 '<details class="waiting-players"><summary>Кто ещё рисует <span aria-hidden="true">⌄</span></summary><div id="readyList" class="waiting-roster">'+players.map(p=>'<div class="waiting-person">'+memberSeal(p)+'<span>'+esc(p.name)+'</span><strong>'+(finished.includes(p.id)?'Готово':'Рисует')+'</strong></div>').join('')+'</div></details></aside></div></section>','waiting');
 void renderArtwork(screen.querySelector('#restCanvas'),ass.art,ass.variation,ass.strokes||[],true);
 void renderArtwork(screen.querySelector('#origCanvas'),ass.art,0,null,false);
}
function chipDots(count){return '<span class="chip-dots">'+Array.from({length:count},()=>'<i class="chip-dot" aria-hidden="true"></i>').join('')+'</span>'}
function updateChips(){
 const total=chips.reduce((a,b)=>a+b,0);
 screen.querySelectorAll('[data-chip-count]').forEach(el=>{el.textContent=chips[Number(el.dataset.chipCount)]});
 screen.querySelectorAll('[data-chipadd]').forEach(el=>{el.disabled=total>=3});
 screen.querySelectorAll('[data-chipsub]').forEach(el=>{el.disabled=chips[Number(el.dataset.chipsub)]===0});
 screen.querySelectorAll('[data-stake-card]').forEach(el=>{const i=Number(el.dataset.stakeCard),n=chips[i];el.classList.toggle('has-chips',n>0);el.querySelector('[data-chip-pips]').innerHTML=chipDots(n)});
 const remain=screen.querySelector('#chipsRemaining');if(remain)remain.innerHTML=chipDots(3-total)+'<strong>'+(3-total)+'</strong> свободно';
 const button=screen.querySelector('[data-action="vote"]');if(button)button.disabled=total!==3;
}
function vote(){
 const v=view,target=v.author,isOwn=target?.id===me?.id,already=(v.voted||[]).includes(me?.id);
 const sessionKey=v.round+':'+v.turn;
 if(chipTarget!==sessionKey){chipTarget=sessionKey;chips=[0,0,0,0,0]}
 const count=(v.voted||[]).length,expected=v.participants.length-1;
 const examined=v.candidate;
 change('<section class="phase-page expert-phase">'+head('ЭКСПЕРТИЗА · '+(v.turn+1)+' / '+v.participants.length,'Найди реставрацию',v.deadline)+
 '<div class="phase-body expert-round"><div class="expert-intro"><div><div class="expert-author">'+(target?memberSeal(target):'')+'<h3>'+esc(target?.name||'Реставратор')+'</h3></div><p class="phase-directive">Одна из пяти картин отреставрирована.</p></div><p class="expert-observers">Заключений: <strong id="votesReady">'+count+' / '+expected+'</strong></p></div>'+
 '<div class="expert-ballot"><p class="hint">'+(isOwn?'Это твоя реставрация. Ставки на неё делают остальные.':already?'Твои фишки приняты. Можешь рассматривать картины, пока остальные голосуют.':'Распредели 3 фишки между картинами.')+'</p>'+
 '<div class="stake-gallery suspect-gallery">'+v.selected.map((id,i)=>'<div class="stake-card" data-stake-card="'+i+'"><div class="stake-frame">'+
 (examined?.art===id?'<canvas class="candidate-art" id="examinedCanvas" aria-label="Полотно № '+(i+1)+'"></canvas>':'<img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Полотно')+'" loading="eager">')+
 '<span class="stake-number">'+String(i+1).padStart(2,'0')+'</span></div><div class="stake-details"><strong>'+esc(ARTS[id]?.title||'Картина')+'</strong><small>'+esc(ARTS[id]?.artist||'')+'</small></div>'+
 (!isOwn&&!already?'<div class="stake-actions"><button data-chipsub="'+i+'" aria-label="Убрать фишку с полотна '+(i+1)+'">−</button><div class="stake-amount"><strong data-chip-count="'+i+'">0</strong><span data-chip-pips></span></div><button data-chipadd="'+i+'" aria-label="Поставить фишку на полотно '+(i+1)+'">＋</button></div>':'<span class="stake-locked">№ '+(i+1)+'</span>')+'</div>').join('')+'</div>'+
 (!isOwn&&!already?'<div class="stake-tray"><div id="chipsRemaining">'+chipDots(3)+'<strong>3</strong> свободно</div><button class="btn primary" data-action="vote" disabled>Подтвердить три фишки</button></div>':'<div class="stake-wait">Ожидаем завершения голосования…</div>')+
 '</div></div></section>','vote');
 if(examined)void renderArtwork(screen.querySelector('#examinedCanvas'),examined.art,examined.variation,examined.strokes||[],true);
 if(!isOwn&&!already)updateChips();
}

function verdict(){
 const v=view,g=v.gallery?.[v.turn];if(!g)return;
 const people=v.participants||[];
 const ballotTotals=v.selected.map((id,i)=>Object.values(g.votes||{}).reduce((n,bet)=>n+(Array.isArray(bet)?bet[i]||0:0),0));
 const stakeNames=(index)=>people.filter(p=>p.id!==g.id).flatMap(p=>Array.from({length:Array.isArray(g.votes?.[p.id])?(g.votes[p.id][index]||0):0},()=>p.name));
 change('<section class="phase-page verdict-phase">'+head('ПРОТОКОЛ ГОЛОСОВАНИЯ · '+(v.turn+1)+' / '+people.length,'Фишки уже на столе',v.deadline)+
 '<div class="phase-body"><div class="verdict-intro"><h3>'+esc(g.name)+' — реставратор под следствием</h3><p class="phase-directive">Ставки раскрыты. Сейчас покажем ответ.</p></div>'+
 '<div class="verdict-gallery">'+v.selected.map((id,i)=>'<div class="verdict-card"><div class="verdict-image"><img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'"><span>№ '+(i+1)+'</span></div><strong>'+esc(ARTS[id]?.title||'Картина')+'</strong><div class="verdict-tokens">'+chipDots(ballotTotals[i])+'<em>'+ballotTotals[i]+' фиш.</em></div><small>'+esc(stakeNames(i).join(' · ')||'Без ставок')+'</small></div>').join('')+'</div>'+
 '<div class="verdict-footer"><span>Следующий этап — сравнение с подлинником</span>'+(me?.id===v.host?'<button class="btn ghost" data-action="advance">Раскрыть сейчас ↗</button>':'<span class="busy"></span>')+'</div></div></section>','verdict');
}
function reveal(local=false){
 const v=local?practice:view,index=local?0:v.turn;
 const g=local?{name:'Твоя реставрация',...v.mine,strokes:v.strokes,votes:{}}:v.gallery?.[index];
 if(!g)return;
 const idIndex=local?-1:v.selected.indexOf(g.art),others=Math.max(1,(v.participants?.length||2)-1);
 const breakdown=local?[]:v.participants.filter(p=>p.id!==g.id).map(p=>{
  const ballot=g.votes?.[p.id],correct=Array.isArray(ballot)?ballot[idIndex]||0:0;
  const total=Array.isArray(ballot)?ballot.reduce((a,b)=>a+b,0):0;
  return {name:p.name,correct,wrong:total-correct,points:Math.round(correct*100/others)};
 });
 const wrong=breakdown.reduce((n,x)=>n+x.wrong,0);
 const bonus=Math.round(wrong*50/others);
 change('<section class="phase-page reveal-phase">'+head(local?'УЧЕБНАЯ РЕСТАВРАЦИЯ · ГОТОВО':'РАЗОБЛАЧЕНИЕ · '+(index+1)+' / '+v.participants.length,'Подлинник найден',local?0:v.deadline)+
 '<div class="phase-body reveal-layout"><div class="reveal-main"><h3>'+esc(g.name)+'</h3><p class="hint">Подлинник: <strong>'+esc(ARTS[g.art].title)+'</strong> · '+esc(ARTS[g.art].artist)+'</p>'+
 (local?'':'<div class="reveal-answer-strip" aria-label="Итоги голосования — правильный вариант подсвечен">'+v.selected.map((id,i)=>'<div class="reveal-option'+(id===g.art?' is-answer':'')+'"><div class="reveal-option-image">'+(id===g.art?'<canvas id="correctCandidate" aria-label="Отреставрированное полотно"></canvas>':'<img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id].title)+'">')+'</div><span>№ '+(i+1)+(id===g.art?' · ВЕРНО':'')+'</span></div>').join('')+'</div>')+
  '<div class="unveil-frame" id="unveilStage" style="--split:100%"><canvas id="restCanvas" class="unveil-bottom" aria-label="Реставрация"></canvas><canvas id="origCanvas" class="unveil-top" aria-label="Подлинник"></canvas><span class="unveil-label left">РЕСТАВРАЦИЯ</span><span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
 '<label class="unveil-control" for="unveilRange">Сравнение: двигай разделитель <input id="unveilRange" type="range" min="0" max="100" value="100" aria-label="Показать фрагмент оригинала"></label>'+
 (g.source?'<p class="hint">'+esc(g.source)+'</p>':'')+'</div>'+
 '<div class="reveal-brief">'+
 (local?'<h3>Личная реставрация</h3><p>Сдвигай разделитель и сравни свою работу с настоящим изображением.</p>':
 '<div class="outcome-head"><span>ПРАВИЛЬНЫЙ ОТВЕТ</span><h3>Полотно № '+(idIndex+1)+'</h3><strong>'+esc(ARTS[g.art].title)+'</strong></div>'+
 '<div class="audit-lines">'+breakdown.map(x=>'<div class="audit-line"><span>'+esc(x.name)+'</span><span class="audit-chips">'+chipDots(x.correct)+'<small>'+x.correct+' верно · '+x.wrong+' мимо</small></span><strong>+'+x.points+'</strong></div>').join('')+'</div>'+
 '<div class="outcome-bonus"><span>Реставратору за '+wrong+' ошибочных фишек</span><strong>+'+bonus+' очк.</strong></div>')+
 ''+
 (local?'<div class="stack"><button class="btn primary" data-action="practice">Новая реставрация</button><button class="btn ghost" data-action="collection">Моя галерея</button><button class="btn ghost" data-action="menu">В главное меню</button></div>':(me?.id===v.host?'<button class="btn primary" data-action="advance">Следующий экспонат ↗</button>':'<div class="stake-wait">Ожидаем следующий экспонат…</div>'))+
 '</div></div></section>','reveal');
 const correctCanvas=screen.querySelector('#correctCandidate');
  if(correctCanvas)void renderArtwork(correctCanvas,g.art,g.variation,g.strokes||[],true);
  const source=screen.querySelector('#restCanvas'),original=screen.querySelector('#origCanvas'),stage=screen.querySelector('#unveilStage');
 Promise.all([renderArtwork(original,g.art,0,null,false),renderArtwork(source,g.art,g.variation,g.strokes||[],true)]).then(()=>{
  if(stage?.isConnected){requestAnimationFrame(()=>{if(stage.isConnected)stage.style.setProperty('--split','50%')});const range=screen.querySelector('#unveilRange');if(range)range.value='50';}
 });
}
function roundReview(){
 if(!view?.gallery?.length)return;
 const v=view;
 change(roundReviewMarkup(v,me?.id,ARTS,esc),'round-review');
 renderRoundThumbnails(screen,v,renderArtwork);
}
function results(){
 const rank=[...view.participants].sort((a,b)=>(view.scores[b.id].mask+view.scores[b.id].eye)-(view.scores[a.id].mask+view.scores[a.id].eye));
 change('<section class="page"><div class="section-label">ИТОГИ ВЫСТАВКИ</div><h2>Каталог разоблачений</h2><div class="notice">Обман и наблюдательность оцениваются отдельно. Побеждает самая высокая сумма.</div>'+rank.map((p,i)=>'<div class="result-item"><div class="result-rank"><div class="result-identity">'+memberSeal(p)+'<div><span class="section-label">№ '+(i+1)+'</span><h3>'+esc(p.name)+pocketPlayerBadge(p)+'</h3></div></div><div class="points">'+(view.scores[p.id].mask+view.scores[p.id].eye)+' очк.</div></div><div class="quiet">Маскировка '+view.scores[p.id].mask+' · Экспертиза '+view.scores[p.id].eye+'</div></div>').join('')+'<div class="stack" style="margin-top:20px">'+(me?.id===view.host?'<button class="btn primary" data-action="next">Новый матч с этой компанией</button>':'<div class="hint">Создатель комнаты может начать следующий матч.</div>')+'<button class="btn ghost" data-action="leave">Выйти из комнаты</button></div></section>','results')
}
function collection(){
 change('<section class="page"><div class="section-label">ЛИЧНЫЙ ФОНД</div><h2>Мои реставрации</h2><div class="zamazka-cloud-row"><span data-cloud-status>Только на этом устройстве</span><button class="btn ghost" data-action="cloud-sync">☁ Синхронизировать</button></div>'+(saved.length?'<div class="gallery">'+saved.map((g,i)=>'<button class="picture" data-saved="'+i+'"><canvas data-saved-canvas="'+i+'"></canvas><span class="caption">'+esc(ARTS[g.art]?.title||'Работа')+'</span><span class="style">'+new Date(g.time).toLocaleDateString('ru-RU')+'</span></button>').join('')+'</div>':'<div class="notice">Фонд пуст. Сделай первую реставрацию в тренировке, и она появится здесь.</div>')+'<div class="subtle-rule"></div><button class="btn ghost wide" data-action="menu">В главное меню</button></section>','collection');
 zamazkaCloud?.render();
 screen.querySelectorAll('[data-saved-canvas]').forEach(c=>{const g=saved[Number(c.dataset.savedCanvas)];renderArtwork(c,g.art,g.variation,g.strokes,true)});
}
function saveArtwork(art,variation,strokes){saved=[{art,variation,strokes,time:Date.now(),edition:3},...saved].slice(0,96);try{localStorage.setItem(GALLERY_KEY,JSON.stringify(saved));zamazkaCloud?.schedule()}catch{}}
function persistPractice(){if(practice)try{localStorage.setItem(PRACTICE_KEY,JSON.stringify({phase:practice.phase,round:practice.round,rounds:practice.rounds,selected:practice.selected,deadline:practice.deadline,mine:practice.mine,strokes:practice.strokes,edition:3}))}catch{}}
function newPractice(){const order=[...PLAYABLE_IDS];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}const selected=order.slice(0,5);practice={phase:'preview',round:1,rounds:1,selected,deadline:Date.now()+25000,mine:{art:selected[Math.floor(Math.random()*5)],variation:Math.floor(Math.random()*0xffffffff)},strokes:[]};persistPractice();preview(true)}
function resumePractice(){try{const p=JSON.parse(localStorage.getItem(PRACTICE_KEY)||'null');if(!p||!Array.isArray(p.selected)||!ARTS[p.mine?.art]||!['preview','drawing'].includes(p.phase))throw Error('missing');if(p.edition===2){p.mine.art=p.mine.art>=8?p.mine.art+46:p.mine.art;p.selected=p.selected.map(i=>i>=8?i+46:i)}else if(p.edition!==3){p.mine.art+=REAL_COUNT;p.selected=p.selected.map(i=>i+REAL_COUNT)}practice=p;if(p.deadline<Date.now())practice.deadline=Date.now()+30000;if(p.phase==='drawing')drawing(true);else preview(true)}catch{newPractice()}}
function practiceStep(){if(!practice)return;if(practice.phase==='preview'){practice.phase='drawing';practice.deadline=Date.now()+160000;persistPractice();drawing(true)}else if(practice.phase==='drawing')finishPractice()}
function finishPractice(){if(!practice||practice.phase!=='drawing')return;practice.strokes=editor?editor.getData():[];saveArtwork(practice.mine.art,practice.mine.variation,practice.strokes);editor?.clearDraft();practice.phase='reveal';practice.deadline=0;localStorage.removeItem(PRACTICE_KEY);reveal(true)}
function renderView(){
 if(!view)return;
 if(view.phase==='drawing'&&view.done?.includes(me?.id)&&editor)editor.clearDraft();
 const key=view.phase+':'+view.round+':'+view.turn+':'+(view.done||[]).includes(me?.id)+':'+(view.voted||[]).includes(me?.id);
 if(page==='drawing'&&view.phase==='drawing'&&key===lastUiKey)return;
  if(page==='waiting'&&view.phase==='drawing'&&key===lastUiKey){
    const count=screen.querySelector('#readyCount');if(count)count.textContent=(view.done||[]).length+' / '+view.participants.length;
    screen.querySelectorAll('.waiting-person').forEach((el,i)=>{const p=view.participants[i],status=el.querySelector('strong');if(p&&status)status.textContent=(view.done||[]).includes(p.id)?'Готово':'Рисует'});
    return;
  }
 if(page==='round-review'&&view.phase==='round-review'&&key===lastUiKey)return;
 if(page==='vote'&&view.phase==='voting'&&key===lastUiKey){
  const ready=screen.querySelector('#votesReady');if(ready)ready.textContent=(view.voted||[]).length+' / '+(view.participants.length-1);
  return;
 }
 lastUiKey=key;choice=null;
 if(view.phase==='lobby')lobby();
 else if(view.phase==='preview')preview();
 else if(view.phase==='drawing')drawing();
 else if(view.phase==='voting')vote();
 else if(view.phase==='verdict')verdict();
 else if(view.phase==='reveal')reveal();
 else if(view.phase==='round-review')roundReview();
 else if(view.phase==='results')results();
 lastUiKey=key;
}
async function connect(mode){
 pocketIdentity=await getPocketIdentity({force:true});
 const name=isPocketMember()?pocketIdentity.nickname:(mode==='resume'?tabGuestName():(screen.querySelector('#who')?.value||'').trim());
 const input=(screen.querySelector('#room')?.value||'').trim();
 const room=mode==='join'?parseRoomInput(input,location.href):'';
 if(!name||name.length>22){notify('Введи ник до 22 символов');return}
 if(mode==='join'&&!room){notify('Введи код из 8 символов или ссылку');screen.querySelector('#room')?.focus();return}
 rememberTabName(name);
 const epoch=++connectionEpoch;
 me=null;view=null;roomId='';
 change('<section class="page center connecting-room"><span class="busy"></span><h2>Открываем зал…</h2><p class="hint">Соединяем с выставкой.</p><button class="btn ghost wide" data-action="menu">Отменить</button></section>','connecting');
 try{
   const response=await fetch(POCKETNET_URL+'/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error('Выставки временно недоступны. Попробуй ещё раз.');
   const health=await response.json();
   if(!health.ok||!health.modules?.includes('zamazka'))throw new Error('Онлайн-комнаты сейчас недоступны.');
   if(epoch!==connectionEpoch)return;
   // Separate authenticated identities for each open browser tab.
   const storage=await prepareTabGuest(POCKETNET_URL,name);
   if(epoch!==connectionEpoch)return;
   if(net)net.close();
   const client=new PocketNet({serverUrl:POCKETNET_URL,name,storage,identityKey:pocketIdentitySessionKey(pocketIdentity)});
   net=client;
   if(mode!=='resume'){client.roomId=null;client.persist()}
   if(mode==='resume'&&!client.roomId)throw Error('Предыдущая сессия завершена');
   client.on('connected',data=>{if(client.closed)return;me=data.player;markTabGuest(POCKETNET_URL,client.token)});
   client.on('room_joined',msg=>{
     if(client.closed)return;
     roomId=msg.roomId;
     roomModuleVersion=msg.version||'v1';
     boardResync=true;
     client.sendGame({type:'sync'});
     if(page==='drawing')backupDraft(true);
     if(personalEmblem.image)client.sendGame({type:'emblem',image:personalEmblem.image});
     if(view)renderView();
     else change('<section class="page center connecting-room"><span class="busy"></span><h2>Готовим экспозицию…</h2><p class="hint">Собираем гостей.</p></section>','connecting');
   });
   client.on('game_event',msg=>{
     if(client.closed)return;
     const event=msg.event;
     if(event?.type==='state'){view=event.payload;renderView()}
     else if(event?.type==='draft_saved'){
       if(view?.phase==='drawing'&&event.payload?.round===view.round&&event.payload?.art===view.mine?.art&&
          event.payload.revision===lastDraftRevision){
         lastDraftAckRevision=lastDraftRevision;
         draftIndicator('Копия в PocketNet ✓');
       }
     }
     else if(event?.type==='board_delta'){if(page==='lobby'&&event.payload?.u!==me?.id)commonsBoard?.accept(event.payload)}
     else if(event?.type==='board_reset'){if(page==='lobby')commonsBoard?.reset(event.payload)}
     else if(event?.type==='notice'){lastDraftSentAt=0;lastDraftAckRevision='';notify(String(event.payload||'Не удалось выполнить действие'))}
   });
   client.on('presence',data=>{
     if(client.closed)return;
     if(data.disconnected)notify('Один из гостей потерял соединение');
     try{client.sendGame({type:'sync'})}catch{}
   });
   client.on('room_closed',()=>{if(client.closed)return;home();notify('Комната закрыта')});
   client.on('disconnected',()=>{if(!client.closed){lastDraftSentAt=0;lastDraftAckRevision='';autoSubmitted='';notify('Связь прервана. Переподключаемся…')}});
   client.on('error',error=>{
     if(client.closed)return;
     const code=String(error?.code||error?.message||'');
     const messages={room_not_found:'Комната не найдена. Проверь код и попробуй снова.',room_full:'В комнате уже восемь человек.',server_at_capacity:'Все игровые комнаты заняты.',game_unavailable:'Игра временно недоступна.',room_version_unavailable:'Эта комната создана в старой версии.'};
     if(page==='connecting'&&messages[code]){
       client.close();if(net===client)net=null;clearTabGuest();setup(mode,messages[code],input);
     }else if(!client.closed)notify(messages[code]||'Ошибка подключения: '+code);
   });
   await client.connect();
   if(epoch!==connectionEpoch){client.close();return}
   if(mode==='create')client.createRoom('zamazka');
   else if(mode==='join')client.joinRoom(room);
   // Stored rooms are rejoined automatically after PocketNet authentication.
 }catch(error){
   if(epoch!==connectionEpoch)return;
   if(net){net.close();net=null}
   clearTabGuest();
   const message=error?.name==='TimeoutError'?'Сервер не ответил. Попробуй ещё раз.':error instanceof TypeError?'Нет соединения с интернетом. Проверь сеть.':error?.message||'Не удалось подключиться. Попробуй ещё раз.';
   if(mode==='resume'){home();notify('Не удалось восстановить комнату · проверь подключение')}else setup(mode,message,input);
 }
}
function doSubmit(){if(page==='drawing'&&practice){finishPractice();return}
 if(!editor||!net)return;
 const data=editor.getData();editor.saveSnapshot();modal('Сдать реставрацию?','<p class="hint">После отправки изменять мазки нельзя. Работа будет доступна остальным на экспертизе.</p>',[
 ['Сдать',()=>{closeDialog();submitArtwork()} ,'primary'],
 ['Продолжить рисовать',closeDialog,'ghost']]);}
async function copyText(value,success){
 try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(value);notify(success)}
 catch{
   modal('Скопируй приглашение','<p class="hint">Выдели и скопируй текст ниже.</p><input class="input" id="manualCopy" readonly value="'+esc(value)+'">',[['Готово',closeDialog,'primary']]);
   dialog.querySelector('#manualCopy')?.select();
 }
}
function share(){
 if(!roomId)return;
 const url=new URL(location.pathname,location.origin);
 url.searchParams.set('room',inviteCode(roomId));
 const href=url.toString();
 if(navigator.share)navigator.share({title:'ЗАМАЗКА — приглашение',text:'Код комнаты: '+inviteCode(roomId),url:href}).catch(error=>{if(error?.name!=='AbortError')copyText(href,'Ссылка скопирована')});
 else copyText(href,'Ссылка скопирована');
}
function inspect(id){const a=ARTS[id];modal(esc(a.title),'<img class="art-inspection" data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(a.title)+'"><div class="art-metadata"><div class="art-inspect-facts">'+artFactsHtml(id)+'</div><div>Хранится: '+esc(a.museum)+'</div></div><p class="hint">Запомни цвета и фактуру оригинала.</p>'+(a.isReal?'<a class="art-source" href="'+esc(a.source)+'" target="_blank" rel="noopener noreferrer">Происхождение изображения ↗</a>':''),[['Закрыть',closeDialog,'primary']])}
function magnify(id){const cand=view?.candidate;modal(esc(ARTS[id].title),'<canvas id="largeCandidate" style="width:100%;aspect-ratio:4/3;display:block;max-height:55vh"></canvas><p class="hint">'+esc(ARTS[id].style)+' · Внимательно изучи мазки и фактуру.</p>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#largeCandidate'),id,cand?.variation||0,cand?.strokes||[],cand?.art===id)}
function settings(){
 modal('Настройки','<label class="field" for="settingName">Мой ник</label><input class="input" id="settingName" maxlength="22" value="'+esc(tabGuestName())+'"><label class="field"><input type="checkbox" id="settingSound" '+(beepEnabled?'checked':'')+'> Звуки интерфейса</label><p class="hint">Новый ник применится при следующем подключении к комнате.</p>',[
  ['Сохранить',()=>{rememberTabName(dialog.querySelector('#settingName').value.trim().slice(0,22)||'Реставратор');beepEnabled=dialog.querySelector('#settingSound').checked;localStorage.setItem(NS+'sound',beepEnabled?'on':'off');closeDialog();notify('Настройки сохранены')},'primary'],['Отмена',closeDialog,'ghost']]);
}
document.querySelector('#settingsBtn').addEventListener('click',settings);
document.querySelector('#profileBtn')?.addEventListener('click',editEmblem);
syncIdentity();
screen.addEventListener('click',e=>{
 const b=e.target.closest('[data-action],[data-inspect],[data-magnify],[data-choice],[data-saved],[data-chipadd],[data-chipsub],[data-review-open]');if(!b)return;
 if(b.hasAttribute('data-review-open')){openRoundViewer({index:Number(b.dataset.reviewOpen),view,dialog,renderArtwork,arts:ARTS,esc,closeDialog});return}
 if(b.hasAttribute('data-magnify')){magnify(Number(b.dataset.magnify));return}
 if(b.hasAttribute('data-chipadd')){const i=Number(b.dataset.chipadd);if(chips.reduce((a,b)=>a+b,0)<3){chips[i]++;sound(450);updateChips()}return}
 if(b.hasAttribute('data-chipsub')){const i=Number(b.dataset.chipsub);if(chips[i]>0){chips[i]--;sound(360);updateChips()}return}
 if(b.hasAttribute('data-choice')){choice=Number(b.dataset.choice);screen.querySelectorAll('[data-choice]').forEach(x=>x.closest('.picture')?.classList.toggle('selected',Number(x.dataset.choice)===choice));const v=screen.querySelector('[data-action=vote]');if(v)v.disabled=false;return}
 if(b.hasAttribute('data-inspect')){if(page==='preview'||page==='vote'&&(view?.author?.id===me?.id||(view?.voted||[]).includes(me?.id)))inspect(Number(b.dataset.inspect));return}
 if(b.hasAttribute('data-saved')){const g=saved[Number(b.dataset.saved)];modal('Реставрация из фонда','<div class="compare"><div><img src="'+artworkURL(g.art)+'" style="width:100%" alt=""><small>Подлинник</small></div><div><canvas id="savedFull"></canvas><small>Твоя работа</small></div></div>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#savedFull'),g.art,g.variation,g.strokes,true);return}
 const action=b.dataset.action;sound();
 if(action==='create'||action==='join')setup(action);
 else if(action==='emblem')editEmblem();
 else if(action==='museum-next')shiftMuseum(1);
 else if(action==='museum-prev')shiftMuseum(-1);
 else if(action==='board-clear')modal('Очистить общий холст?','<p class="hint">Рисунки всех участников исчезнут без возможности восстановления.</p>',[['Очистить',()=>{closeDialog();try{net?.sendGame({type:'board_clear'})}catch{notify('Нет связи с комнатой')}},'primary'],['Отмена',closeDialog,'ghost']]);
 else if(action==='practice')newPractice();
 else if(action==='retry-gallery')home();
 else if(action==='resume')resumePractice();
 else if(action==='collection')collection();
 else if(action==='cloud-sync')void zamazkaCloud?.sync();
 else if(action==='menu'){if(net||practice&&practice.phase==='drawing'){modal('Покинуть выставку?','<p class="hint">Текущая партия будет покинута. Несданные мазки сохраняются на устройстве.</p>',[['Покинуть',()=>{closeDialog();home()},'primary'],['Остаться',closeDialog,'ghost']])}else home()}
 else if(action==='connect')connect(b.dataset.mode);
 else if(action==='share')share();
 else if(action==='copy-code')copyText(inviteCode(roomId),'Код комнаты скопирован');
 else if(action==='start')net?.sendGame({type:'start',rounds:Number(screen.querySelector('#rounds')?.value||3),drawingSeconds:Number(screen.querySelector('#drawingSeconds')?.value||160)});
 else if(action==='leave')modal('Выйти из комнаты?','<p class="hint">Другие реставраторы смогут продолжить без тебя.</p>',[['Выйти',()=>{closeDialog();home()},'primary'],['Отмена',closeDialog,'ghost']]);
 else if(action==='skip')practiceStep();
 else if(action==='submit')doSubmit();
 else if(action==='vote'&&chips.reduce((a,b)=>a+b,0)===3){try{net?.sendGame({type:'vote',chips:[...chips]});b.disabled=true;notify('Три фишки поставлены')}catch{notify('Потеряно соединение')}}
 else if(action==='advance')net?.sendGame({type:'advance'});
 else if(action==='continue'&&view?.phase==='round-review'&&me?.id===view.host){b.disabled=true;try{net?.sendGame({type:'continue'})}catch{b.disabled=false;notify('Нет соединения с комнатой')}}
 else if(action==='next')net?.sendGame({type:'next'});
});
function tick(){
 if(practice&&['preview','drawing'].includes(practice.phase)&&Date.now()>=practice.deadline)practiceStep();
 autoFinishOnDeadline();
 const v=practice||view,clock=document.querySelector('#clock');
 if(clock&&v?.deadline){const s=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));clock.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');clock.classList.toggle('urgent',s<=10)}
 if(net&&view&&view.deadline&&Date.now()>view.deadline-2400&&Date.now()-lastPulse>1800){lastPulse=Date.now();try{net.sendGame({type:'pulse'})}catch{}}
}
let museumSwipe=null;
screen.addEventListener('pointerdown',e=>{if(page==='home'&&e.target.closest('.museum-display'))museumSwipe={x:e.clientX,y:e.clientY,id:e.pointerId}});
screen.addEventListener('pointerup',e=>{if(!museumSwipe||e.pointerId!==museumSwipe.id)return;const x=e.clientX-museumSwipe.x,y=e.clientY-museumSwipe.y;museumSwipe=null;if(Math.abs(x)>42&&Math.abs(x)>Math.abs(y)*1.2)shiftMuseum(x<0?1:-1)});
screen.addEventListener('pointercancel',()=>museumSwipe=null);
screen.addEventListener('wheel',e=>{if(page!=='home'||!e.target.closest('.museum-display'))return;e.preventDefault();if(Math.abs(e.deltaY)<4&&Math.abs(e.deltaX)<4)return;if(Date.now()-lastMuseumWheel<85)return;lastMuseumWheel=Date.now();shiftMuseum((Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX)>0?1:-1)},{passive:false});
document.addEventListener('keydown',e=>{if(page==='home'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();shiftMuseum(e.key==='ArrowRight'?1:-1)}});
screen.addEventListener('change',e=>{if(e.target.id==='rounds')roundsChoice=Number(e.target.value)||3;else if(e.target.id==='drawingSeconds')drawingSecondsChoice=Number(e.target.value)||160});
screen.addEventListener('input',e=>{if(e.target.id==='unveilRange'){const stage=screen.querySelector('#unveilStage');if(stage){stage.style.transition='none';stage.style.setProperty('--split',e.target.value+'%')}}});
setInterval(tick,350);
setInterval(()=>{
 if(page!=='drawing')return;
 if(pendingSubmit?.room===roomId&&pendingSubmit.round===view?.round)attemptSubmission();
 else backupDraft();
},3600);
document.addEventListener('visibilitychange',()=>{if(page==='drawing')backupDraft(true);if(!document.hidden)tick()});
window.addEventListener('pagehide',()=>{if(page==='drawing')backupDraft(true)});
async function refreshPocketBadge(){
 const prior=(pocketIdentity?.id||'')+':'+(pocketIdentity?.updatedAt||'');
 const priorAccount=pocketIdentity?.id||null;
 pocketIdentity=await getPocketIdentity({force:true});
 if(net && priorAccount!==(pocketIdentity?.id||null)){
  home();
  notify('Аккаунт Pocket ID изменился — подключись к комнате заново');
  return;
 }
 if(prior===(pocketIdentity?.id||'')+':'+(pocketIdentity?.updatedAt||''))return;
 if(page==='home'){
  const caption=screen.querySelector('.persona-caption strong');
  if(caption)caption.textContent=gameName();
 } else if(page==='setup') {
  const field=screen.querySelector('#who');
  if(field){field.value=gameName();field.readOnly=isPocketMember();}
  const note=screen.querySelector('.pw-room-identity');
  if(note)note.innerHTML=isPocketMember()?pocketAvatarMarkup(pocketIdentity.artwork||pocketIdentity.avatar,{small:true,accountId:pocketIdentity.id})+' Ник подтверждён Pocket ID · <a href="'+pocketIdProfileUrl+'">Изменить профиль</a>':'Гостевой режим · <a href="'+pocketIdProfileUrl+'">Войти через Pocket ID</a>';
 }
}
zamazkaCloud=createZamazkaCloud({
 getArchive:()=>saved,
 setArchive(items){
  saved=items;
  localStorage.setItem(GALLERY_KEY,JSON.stringify(saved));
  if(page==='collection')collection();
  if(page==='home'){const number=screen.querySelector('.museum-footer [data-action="collection"] span');if(number)number.textContent=String(saved.length).padStart(2,'0');}
 },
 getEmblem:()=>personalEmblem,
 setEmblem(emblem){
  if(!storeEmblem(emblem.strokes,emblem.image))throw Error('Не удалось сохранить облачный знак на устройство');
  personalEmblem=getSavedEmblem();syncIdentity();
  if(page==='lobby')lobby();
 },
 notify
});
const savedRoom=(()=>{try{return JSON.parse(tabStorage().getItem('pocket-net:'+POCKETNET_URL)||'null')}catch{return null}})();
if(q.has('room'))setup('join');
else if(savedRoom?.roomId&&savedRoom?.token){
 change('<section class="page center connecting-room"><span class="busy"></span><h2>Возвращаемся в зал…</h2><p class="hint">Восстанавливаем комнату.</p><button class="btn ghost wide" data-action="menu">Выйти</button></section>','connecting');
 void connect('resume');
}else home();
zamazkaCloud.start();
void refreshPocketBadge();
window.addEventListener('pageshow',()=>void refreshPocketBadge());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshPocketBadge()});
// Shared update manager owns service worker registration and activation.
