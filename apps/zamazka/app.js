import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey,pocketPlayerBadge,pocketAvatarMarkup,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import {zamazkaAchievements} from '../../shared/capabilities/zamazka-achievements.js';
import {inviteCode,parseRoomInput} from './room-code.js';
import {tabGuestName,tabStorage,rememberTabName,prepareTabGuest,markTabGuest,clearTabGuest} from './tab-guests.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,ARCHIVE_EDITION,normalizeArchiveEntry,artworkURL,artworkFallbackURL,loadArtwork} from './artworks.js';
import {Editor,renderArtwork} from './editor.js';
import {roundReviewMarkup,renderRoundThumbnails,openRoundViewer,closeRoundViewer} from './round-review.js';
import {getSavedEmblem,storeEmblem} from './emblem.js';
import {createMuseumMotion} from './museum-motion.js';
import {installGalleryLighting} from './museum-lighting.js';
import {MuseumAudio} from './museum-audio.js';
import {createExhibitionDirector,saveTone,animateCoinDeposit} from './exhibition-director.js';
import {setDressScene} from './scenography.js';
import {createCommonsBoard,COMMONS_COLORS} from './commons-board.js';
import {sendPaintingPaced} from './draft-transfer.js';
import {createZamazkaCloud} from './cloud-sync.js';
import {zamazkaStore} from './storage.js';
installMobileRuntime();
createWorkshopMode({appName:'ЗАМАЗКА',version:'1.37.2',cachePrefix: 'zamazka-',storageNamespace: 'pocket-works:zamazka',onReset(){try{sessionStorage.removeItem('pocket-net:'+location.origin+'/pocketnet')}catch{}for(const storage of [localStorage,sessionStorage])try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('pocket-works:zamazka:'))storage.removeItem(key)}}catch{}location.reload()}});
const screen=document.querySelector('#screen'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const exhibitionDirector=createExhibitionDirector(screen);
installGalleryLighting(screen);
function appearance(){return window.ZamazkaAppearance?.get()||'classic'}
function applyAppearance(mode,persist=false){
 const selected=window.ZamazkaAppearance?.apply(mode,persist)||'classic';
 const node=screen.firstElementChild;
 if(!node)return selected;
 if(selected==='new'){
  if(!node.classList.contains('has-scenography'))setDressScene(node,page);
 }else if(node.classList.contains('has-scenography')){
  node.querySelectorAll(':scope > .set-furniture,.museum-plinth').forEach(el=>el.remove());
  node.classList.remove('has-scenography');
  delete node.dataset.set;
 }
 return selected;
}
const NS='pocket-works:zamazka:',GALLERY_KEY=NS+'gallery',PRACTICE_KEY=NS+'practice',CONFIRM_VOTE_KEY=NS+'confirm-coins';
const POCKETNET_URL=location.origin+'/pocketnet';
const q=new URLSearchParams(location.search);
let invitedRoom=q.get('room')||'';
let page='home',net=null,me=null,view=null,roomId='',editor=null,practice=null,choice=null,chips=[0,0,0,0,0],chipTarget='',autoVoteTimer=null,connectionEpoch=0,beepEnabled=localStorage.getItem(NS+'sound')!=='off',lastPulse=0,lastUiKey='';
const museumAudio=new MuseumAudio(beepEnabled);
const SOUND_VOLUME_KEY=NS+'sound-volume';
let soundVolume=Math.max(0,Math.min(100,Number(localStorage.getItem(SOUND_VOLUME_KEY)??55)||0));
museumAudio.setVolume(soundVolume/100);
const sound=(event='press',gesture=false)=>museumAudio.play(event,gesture);
let personalEmblem=getSavedEmblem();
let zamazkaCloud=null;
let pocketIdentity=null;
let pendingVote=null,preparedRound='',preparingError='',archiveObserver=null,dialogFocus=null,loadedRound='';
const VOTE_KEY=NS+'pending-vote';
try{pendingVote=JSON.parse(sessionStorage.getItem(VOTE_KEY)||'null')}catch{}
function persistVote(){try{if(pendingVote)sessionStorage.setItem(VOTE_KEY,JSON.stringify(pendingVote));else sessionStorage.removeItem(VOTE_KEY)}catch{}}
function connectionStatus(state){const node=document.querySelector('#netStatus');if(!node)return;node.hidden=state==='off';node.dataset.state=state;node.textContent=state==='ok'?'В сети':state==='connecting'?'Подключение…':'Нет связи';}

const gameName=()=>preferredPocketName(pocketIdentity,tabGuestName());
const isPocketMember=()=>Boolean(pocketIdentity?.complete);
let museumMotion=null,commonsBoard=null,lastMuseumWheel=0,boardResync=false,roomModuleVersion='v3';
const museumOrder=[0,...PLAYABLE_IDS.filter(id=>id!==3),3];
let saved=(()=>{try{const a=JSON.parse(localStorage.getItem(GALLERY_KEY)||'[]');return Array.isArray(a)?a.slice(0,96).map(normalizeArchiveEntry):[]}catch{return[]}})();

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

function pocketPortrait(identity=pocketIdentity){
 return pocketAvatarMarkup(identity?.artwork||identity?.avatar,{accountId:identity?.id||''});
}
function memberSeal(p){
 const verified=Boolean(p?.verified&&p?.accountId);
 return '<span class="member-seal member-avatar'+(verified?' is-verified':'')+'">'+
   (verified?pocketAvatarMarkup(p.avatar,{accountId:p.accountId}):'<span class="guest-initial" aria-hidden="true">'+esc(String(p?.name||'?').charAt(0).toLocaleUpperCase())+'</span>')+'</span>';
}
function syncIdentity(){
 const btn=document.querySelector('#profileBtn');
 if(btn){btn.innerHTML=pocketPortrait();btn.title='Профиль Pocket ID';}
 screen.querySelectorAll('[data-pocket-identity]').forEach(el=>el.innerHTML=pocketPortrait());
}
function shiftMuseum(step){if(page!=='home'||!museumMotion)return;museumMotion.shift(step);sound('frame',true)}
function commonsHtml(leader){
 return '<section class="commons-desk" aria-label="Общий холст выставки">'+
 '<div class="commons-topline"><div><h3>Общий холст</h3></div><span class="commons-online"><i></i> ВМЕСТЕ</span></div>'+
 '<div class="commons-frame"><canvas id="commonsCanvas" width="960" height="600" aria-label="Общий холст для свободного рисования"></canvas><span class="commons-corner" aria-hidden="true">✳</span></div>'+
 '<div class="commons-controls"><div class="commons-palette" aria-label="Цвет кисти">'+COMMONS_COLORS.map((c,i)=>'<button class="commons-swatch'+(i===0?' selected':'')+'" data-commons-color="'+c+'" aria-label="Цвет '+(i+1)+'" style="--swatch:'+c+'"></button>').join('')+'</div>'+
 '<label class="commons-width">Толщина <input id="commonsSize" type="range" min="2" max="36" value="9"></label>'+
 (leader?'<button class="commons-wipe" data-action="board-clear">Очистить холст</button>':'<span class="commons-note">Очистка доступна куратору</span>')+'</div></section>';
}
let toastTimer,lastToast='',lastToastAt=0;
dialog.addEventListener('click',e=>{if(e.target===dialog&&!dialog.classList.contains('hidden'))closeDialog()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.classList.contains('hidden')){e.preventDefault();closeDialog()}});
function notify(t){const message=String(t||'');if(message===lastToast&&Date.now()-lastToastAt<5000)return;
 lastToast=message;lastToastAt=Date.now();toast.textContent=message;toast.classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}

function closeDialog(){if(settingsPreviewAppearance!==null){applyAppearance(settingsOriginalAppearance||'classic');settingsPreviewAppearance=null;settingsOriginalAppearance=null}if(settingsPreviewVolume!==null){museumAudio.setVolume(soundVolume/100);settingsPreviewVolume=null}closeRoundViewer();dialog.classList.remove('round-view-dialog');dialog.classList.add('hidden');dialog.innerHTML='';const focused=dialogFocus;dialogFocus=null;if(focused?.isConnected)focused.focus({preventScroll:true})}
function modal(title,body,buttons){dialogFocus=document.activeElement;dialog.classList.remove('hidden');dialog.innerHTML='<div class="dialog-box"><h2>'+title+'</h2>'+body+'<div class="stack" id="modalActions"></div></div>';const actionBox=dialog.querySelector('#modalActions');buttons.forEach(([label,fn,cls])=>{const b=document.createElement('button');b.className='btn '+(cls||'');b.textContent=label;b.addEventListener('click',()=>{sound('press',true);fn()});actionBox.append(b)});(actionBox.querySelector('.ghost')||actionBox.querySelector('button'))?.focus({preventScroll:true})}
let draftDelay=null,lastDraftPayload='',lastDraftRound='',lastDraftRevision='',lastDraftAckRevision='',lastDraftSentAt=0,autoSubmitted='',archiveAutoSaved='';
let activeSubmitTransfer=null,activeDraftTransfer=null,submissionBackoffUntil=0,draftSendAfter=0;
const SUBMIT_KEY=NS+'pending-submission';
let pendingSubmit=(()=>{try{return JSON.parse(sessionStorage.getItem(SUBMIT_KEY)||localStorage.getItem(SUBMIT_KEY)||'null')}catch{return null}})();
function persistPending(){
 const copy=pendingSubmit?structuredClone(pendingSubmit):null;
 try{if(copy)sessionStorage.setItem(SUBMIT_KEY,JSON.stringify(copy));else sessionStorage.removeItem(SUBMIT_KEY)}catch{}
 void (copy?zamazkaStore.set('pending',copy):zamazkaStore.remove('pending')).then(()=>{
   try{if(JSON.stringify(pendingSubmit)===JSON.stringify(copy))sessionStorage.removeItem(SUBMIT_KEY);localStorage.removeItem(SUBMIT_KEY)}catch{}
 }).catch(()=>{
   try{if(copy)localStorage.setItem(SUBMIT_KEY,JSON.stringify(copy));else localStorage.removeItem(SUBMIT_KEY)}
   catch{notify('Не удалось сохранить отправку: проверь хранилище устройства')}
 });
 return true;
}
function submissionToken(ass,round){return [roomId,round,ass.art,ass.variation].join(':')}
function confirmSubmission(art,round){
 if(!pendingSubmit||pendingSubmit.round!==round||pendingSubmit.art!==art||pendingSubmit.room!==roomId)return;
 activeSubmitTransfer?.abort();activeSubmitTransfer=null;
 const committed=pendingSubmit;pendingSubmit=null;persistPending();autoSubmitted=committed.token;
 screen.querySelector('.restore')?.classList.remove('is-submitting');
 const button=screen.querySelector('[data-action="submit"]');if(button)button.disabled=true;
 draftIndicator('Принято сервером ✓');sound('confirm');
}
function attemptSubmission(force=false){
 const p=pendingSubmit;
 if(!p||p.room!==roomId||!net||!view||view.phase!=='drawing'||view.done?.includes(me?.id)||
    activeSubmitTransfer||Date.now()<submissionBackoffUntil)return;
 // One complete upload at a time. Allow time for server persistence and its
 // authoritative acknowledgement before retransmitting a new revision.
 // When the drawing timer has ended the server only has a short upload
 // acceptance window. Retry lost receipts promptly instead of waiting 15s.
 const retryMs=view.deadline&&Date.now()>=view.deadline?3500:15000;
 if(!force&&p.sentAt&&Date.now()-p.sentAt<retryMs)return;
 activeDraftTransfer?.abort();activeDraftTransfer=null;
 clearTimeout(draftDelay);
 const controller=new AbortController();activeSubmitTransfer=controller;
 try{
  const result=sendPaintingPaced(packet=>net.sendGame(packet),
   {type:'submit_chunk',round:p.round,art:p.art,variation:p.variation,strokes:p.strokes},
   {signal:controller.signal,onProgress:(sent,total)=>{
      if(pendingSubmit===p)draftIndicator('Передаём работу · '+Math.round(sent/total*100)+'%');
   }});
  p.revision=result.revision;p.sentAt=Date.now();p.attempts=(p.attempts||0)+1;persistPending();
  const button=screen.querySelector('[data-action="submit"]');if(button)button.disabled=true;
  screen.querySelector('.restore')?.classList.add('is-submitting');
  result.completion.then(()=>{
   if(activeSubmitTransfer!==controller)return;
   activeSubmitTransfer=null;
   if(pendingSubmit===p)draftIndicator('Проверяем сохранение на сервере…');
  }).catch(()=>{
   if(activeSubmitTransfer!==controller)return;
   activeSubmitTransfer=null;
   if(pendingSubmit===p){
    p.sentAt=0;persistPending();submissionBackoffUntil=Date.now()+4000;
    draftIndicator('Не удалось передать все части · повторим автоматически');
   }
  });
 }catch{
  activeSubmitTransfer=null;p.sentAt=0;persistPending();
  submissionBackoffUntil=Date.now()+4000;
  draftIndicator('Работа на устройстве · повторим отправку');
 }
}
function submitArtwork({automatic=false}={}){
 if(!editor||!view?.mine||!roomId)return;
 const ass=view.mine,token=submissionToken(ass,view.round);
 if(pendingSubmit?.token===token){attemptSubmission(true);return}
 activeDraftTransfer?.abort();activeDraftTransfer=null;clearTimeout(draftDelay);
 const strokes=editor.getData();editor.saveSnapshot();
 pendingSubmit={token,room:roomId,round:view.round,art:ass.art,variation:ass.variation,strokes,revision:null,sentAt:0,attempts:0};
 // Seal the canvas immediately, even when the network is disconnected.
 screen.querySelector('.restore')?.classList.add('is-submitting');
 const submitButton=screen.querySelector('[data-action="submit"]');if(submitButton)submitButton.disabled=true;
 draftIndicator('Время зафиксировано · передаём рисунок…');
 persistPending();
 if(strokes.length&&archiveAutoSaved!==token){archiveAutoSaved=token;saveArtwork(ass.art,ass.variation,strokes)}
 attemptSubmission(true);
 if(!automatic)sound('paper');
}

function draftIndicator(message){const el=screen.querySelector('#draftStatus');if(!el)return;el.textContent=message;el.dataset.state=saveTone(message)}
function backupDraft(force=false){
 if(!editor||page!=='drawing')return;
 editor.saveSnapshot();
 if(practice||!view||view.phase!=='drawing'||view.done?.includes(me?.id)||
    activeSubmitTransfer||activeDraftTransfer||Date.now()<draftSendAfter)return;
 const ass=view.mine;if(!ass)return;
 const token=[roomId,view.round,ass.art,ass.variation].join(':');
 if(autoSubmitted===token||pendingSubmit?.token===token)return; // final transfer owns this revision
 const strokes=editor.getSnapshot(),serialized=JSON.stringify(strokes);
 if(!force&&token===lastDraftRound&&serialized===lastDraftPayload&&
    (lastDraftAckRevision===lastDraftRevision||Date.now()-lastDraftSentAt<15000))return;
 if(!net)return;
 const controller=new AbortController();activeDraftTransfer=controller;
 try{
  const result=sendPaintingPaced(packet=>net.sendGame(packet),
    {type:'draft_chunk',round:view.round,art:ass.art,variation:ass.variation,strokes},
    {signal:controller.signal});
  lastDraftRound=token;lastDraftPayload=serialized;
  lastDraftRevision=result.revision;lastDraftSentAt=Date.now();draftIndicator('Сохраняем…');
  result.completion.then(()=>{
   if(activeDraftTransfer!==controller)return;
   activeDraftTransfer=null;draftSendAfter=Date.now()+1800;
  }).catch(()=>{
   if(activeDraftTransfer!==controller)return;
   activeDraftTransfer=null;lastDraftSentAt=0;lastDraftAckRevision='';
   draftSendAfter=Date.now()+4000;
   draftIndicator('Копия на устройстве · повторим сохранение');
  });
 }catch{
  activeDraftTransfer=null;draftSendAfter=Date.now()+4000;
  draftIndicator('Черновик на устройстве · повторим при подключении');
 }
}
function queueDraft(){
 if(practice)return;
 draftIndicator('Черновик на устройстве');
 clearTimeout(draftDelay);draftDelay=setTimeout(()=>backupDraft(),650);
}
function stopEditor(){
 clearTimeout(draftDelay);draftDelay=null;
 activeDraftTransfer?.abort();activeDraftTransfer=null;
 activeSubmitTransfer?.abort();activeSubmitTransfer=null;
 if(editor){editor.dispose();editor=null}
}
function autoFinishOnDeadline(){
 if(!editor||practice||page!=='drawing'||!view||view.phase!=='drawing'||!view.deadline||view.done?.includes(me?.id))return;
 // Freeze at the actual deadline, not 1.9 seconds before it. getData()
 // commits the finger/mouse stroke in progress before the final snapshot.
 if(Date.now()<view.deadline)return;
 const token=submissionToken(view.mine,view.round);
 if(autoSubmitted===token||pendingSubmit?.token===token)return;
 submitArtwork({automatic:true});
}
function finishVoteTransition(){
 if(!voteTransitionLayer)return;
 const old=voteTransitionLayer;voteTransitionLayer=null;
 clearTimeout(voteTransitionTimeout);voteTransitionTimeout=null;
 old.classList.add('is-finished');
 setTimeout(()=>old.remove(),260);
}
function change(html,which){
 if(archiveObserver){archiveObserver.disconnect();archiveObserver=null}
 if(page!==which)closeDialog();
 museumMotion?.dispose();museumMotion=null;commonsBoard?.dispose();commonsBoard=null;stopEditor();
 // Keep the complete, already painted ballot visible until the reveal's
 // heavy restoration canvases finish rendering. Never flash an empty gallery.
 const oldBallot=page==='vote'&&which==='reveal'?screen.firstElementChild:null;
 if(voteTransitionLayer)finishVoteTransition();
 if(oldBallot)oldBallot.remove();
 const previousRoom=screen.dataset.museumRoom;
 page=which;lastUiKey='';
 const freshScene=appearance()==='new'&&!oldBallot&&which!=='connecting';
 exhibitionDirector.replace(html,{animate:!freshScene&&!oldBallot&&which!=='connecting',scene:which});
 if(freshScene&&screen.firstElementChild)screen.firstElementChild.classList.add('atelier-scene-arrive');
 if(appearance()==='new')applyAppearance('new');
 if(appearance()==='new'&&previousRoom&&previousRoom!==screen.dataset.museumRoom&&!oldBallot&&which!=='connecting')sound('frame');
 if(oldBallot){
  oldBallot.classList.add('vote-transition-layer');
  oldBallot.setAttribute('aria-hidden','true');
  screen.appendChild(oldBallot);
  voteTransitionLayer=oldBallot;
  voteTransitionTimeout=setTimeout(finishVoteTransition,2500);
 }
}
const phaseMenuButton=()=>'<button class="phase-menu" type="button" data-action="menu" aria-label="Вернуться в главное меню" title="В главное меню">← <span>Меню</span></button>';
const head=(phase,title,until,context='',untimed=false)=>'<div class="phase-head"><div class="phase-intro"><div class="eyebrow">'+esc(phase)+'</div><h2>'+esc(title)+'</h2>'+(context?'<div class="art-head-context">'+context+'</div>':'')+'</div><div class="phase-head-controls"><div class="timer" id="clock">'+(untimed?'Без лимита':until?'…':'')+'</div>'+phaseMenuButton()+'</div></div>';
function artFactsHtml(id){
 const art=ARTS[id];if(!art)return '';
 const identity=[art.artist,art.date].filter(Boolean).map(esc).join(' · ');
 const facts=[art.schoolCountry?'Школа: '+art.schoolCountry:null,art.creationPlace?'Создано: '+art.creationPlace.city+', '+art.creationPlace.country:null].filter(Boolean).map(esc).join(' · ');
 return '<span class="art-head-identity">'+identity+'</span>'+(facts?'<span class="art-head-origin">'+facts+'</span>':'');
}
const picture=id=>'<div class="frame"><img src="'+artworkURL(id)+'" alt="'+esc(ARTS[id].title)+'"></div>';
function home(skipLeave=false){
 connectionEpoch++;
 // Unconfirmed uploads remain on this device and can resume upon rejoining their room.
 invitedRoom='';
 if(q.has('room')||q.has('server'))history.replaceState(null,'',location.pathname+location.hash);
 clearTabGuest();
 if(net){if(!skipLeave)try{net.leaveRoom()}catch{}net.close();net=null}
 view=null;roomId='';practice=null;boardResync=false;roomModuleVersion='v3';preparedRound='';preparingError='';loadedRound='';pendingVote=null;persistVote();connectionStatus('off');
 change('<section class="museum-home">'+
  
  '<div class="museum-headline"><h1>Подделай<br><em>шедевр.</em></h1></div>'+
  '<div class="museum-display">'+
    '<div class="museum-luminaire" aria-hidden="true"><span class="museum-luminaire-stem"></span><span class="museum-luminaire-housing"></span><span class="museum-luminaire-lens"></span></div>'+
    '<div class="museum-stage" id="museumStage" aria-label="Перелистываемая музейная экспозиция"></div>'+
    '<div class="museum-stage-caption" id="museumCaption" aria-live="polite"><strong>Девушка с жемчужной серёжкой</strong><span>Ян Вермеер · ок. 1665</span></div>'+
    '<div class="museum-wheel"><button data-action="museum-prev" aria-label="Предыдущая картина">‹</button><button data-action="museum-next" aria-label="Следующая картина">›</button></div><span class="museum-exhibit-number">01 / '+museumOrder.length+'</span>'+
  '</div>'+
  '<div class="museum-control">'+'<button class="start-restoration" id="primary-action" data-action="create"><span class="start-emblem" aria-hidden="true">✳</span><span><strong>Играть с друзьями</strong><small>Создать совместную выставку</small></span><span class="start-arrow" aria-hidden="true">↗</span></button>'+
    '<div class="museum-lower"><button data-action="practice"><span>✳</span> Одиночная реставрация</button><button data-action="join"><span>↗</span> Ввести код</button></div>'+
    '<div class="museum-footer"><button type="button" class="home-pocket-identity" data-action="pocket-profile"><span data-pocket-identity>'+pocketPortrait()+'</span><span><strong>'+esc(gameName())+'</strong><small>Профиль Pocket ID</small></span></button><button data-action="collection">Мой архив <span>'+String(saved.length).padStart(2,'0')+'</span></button><button data-action="achievements">Достижения</button><button data-action="cloud-sync" class="cloud-control">Синхронизация</button>'+
    ((storedPractice||sessionStorage.getItem(PRACTICE_KEY)||localStorage.getItem(PRACTICE_KEY))?'<button data-action="resume">ПРОДОЛЖИТЬ ЧЕРНОВИК ↗</button>':'')+'</div>'+
  '</div></section>','home');
 museumMotion=createMuseumMotion(screen.querySelector('#museumStage'),{order:museumOrder,url:artworkURL,arts:ARTS,onExhibit(id){sound('frame',true);inspect(id,true)},onCenter(id){const caption=screen.querySelector('#museumCaption');if(caption)caption.innerHTML='<strong>'+esc(ARTS[id].title)+'</strong><span>'+esc(ARTS[id].artist)+' · '+esc(ARTS[id].date||'')+'</span>';const number=screen.querySelector('.museum-exhibit-number');if(number)number.textContent=String(museumOrder.indexOf(id)+1).padStart(2,'0')+' / '+String(museumOrder.length).padStart(2,'0')}});
 syncIdentity();
 zamazkaCloud?.render();

}
function setup(mode,error='',roomValue=invitedRoom){
 const creating=mode==='create';
 const display=creating?'Создать комнату':'Присоединиться';
 const identity='<button type="button" class="entry-profile" data-action="pocket-profile"><span data-pocket-identity>'+pocketPortrait()+'</span><span><strong>'+esc(gameName())+'</strong><small>'+(isPocketMember()?'Профиль Pocket ID':'Гостевой игрок · открыть Pocket ID')+'</small></span><span aria-hidden="true">↗</span></button>';
 change('<section class="page lobby-entry">'+
  '<header class="entry-heading"><span class="section-label">ИГРА С ДРУЗЬЯМИ</span><h2>'+display+'</h2></header>'+
  '<div class="entry-content">'+identity+
   '<div class="entry-fields"><label class="field" for="who">Имя игрока</label><input class="input" id="who" maxlength="22" autocomplete="nickname" placeholder="Как тебя зовут?" value="'+esc(gameName())+'" '+(isPocketMember()?'readonly aria-readonly="true"':'')+'>'+
   (creating?'':'<label class="field" for="room">Код или ссылка на комнату</label><input class="input room-entry-input" id="room" maxlength="250" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="Код из восьми символов" value="'+esc(roomValue)+'">')+
   (error?'<div class="notice entry-error" role="alert">'+esc(error)+'</div>':'')+
   '</div><div class="entry-actions"><button class="btn primary" data-action="connect" data-mode="'+mode+'">'+display+' ↗</button><button class="btn ghost" data-action="menu">Назад</button></div>'+
  '</div><aside class="entry-art" aria-hidden="true"><span class="entry-art-frame"><img src="'+artworkURL(0)+'" alt="" loading="eager"></span></aside></section>','setup');
}

let roundsChoice=3;
let drawingSecondsChoice=160;
const DRAWING_TIME_OPTIONS=[[60,'1 минута'],[90,'1:30'],[120,'2 минуты'],[160,'2:40 · стандарт'],[240,'4 минуты'],[300,'5 минут'],[600,'10 минут'],[0,'Без ограничения']];
const DURATION_VALUES=DRAWING_TIME_OPTIONS.map(([seconds])=>seconds);
const SOLO_DURATION_KEY=NS+'solo-drawing-seconds';
const normalizedDuration=value=>value!==''&&value!=null&&DURATION_VALUES.includes(Number(value))?Number(value):160;
let soloDrawingSecondsChoice=normalizedDuration(localStorage.getItem(SOLO_DURATION_KEY)??160);
const durationOptionsHtml=selected=>DRAWING_TIME_OPTIONS.map(([seconds,label])=>'<option value="'+seconds+'" '+(selected===seconds?'selected':'')+'>'+label+'</option>').join('');
function practiceSettings(){
 modal('Одиночная реставрация','<label class="field" for="soloDrawingSeconds">Время рисования</label><select class="input" id="soloDrawingSeconds">'+durationOptionsHtml(soloDrawingSecondsChoice)+'</select><p class="hint">Без ограничения: закончи реставрацию кнопкой «Сдать работу».</p>',[
  ['Начать',()=>{soloDrawingSecondsChoice=normalizedDuration(dialog.querySelector('#soloDrawingSeconds')?.value);try{localStorage.setItem(SOLO_DURATION_KEY,String(soloDrawingSecondsChoice))}catch{}closeDialog();newPractice()},'primary'],
  ['Отмена',closeDialog,'ghost']]);
}
function lobby(){
 if(!view||!roomId)return;
 const players=view.participants||[],leader=view.host===me?.id,code=inviteCode(roomId);
 const markup='<section class="page exhibition-lobby">'+
  '<header class="lobby-mast"><div><span class="section-label">СОВМЕСТНАЯ ВЫСТАВКА</span><h2>Комната ожидания</h2></div>'+
  '<button type="button" class="lobby-self" data-action="pocket-profile" title="Открыть профиль Pocket ID"><span data-pocket-identity>'+pocketPortrait()+'</span><span><strong>'+esc(me?.name||gameName())+'</strong><small>Профиль Pocket ID</small></span></button><button class="lobby-exit" type="button" data-action="menu">← Выйти</button></header>'+
  '<div class="lobby-invite"><div class="room-ticket"><div class="ticket-top"><span class="section-label">ПРИГЛАСИТЬ В КОМНАТУ</span><span class="ticket-live"><span></span> ОТКРЫТА</span></div>'+
  '<div class="room-code" aria-label="Код комнаты">'+esc(code)+'</div>'+
  '<div class="ticket-actions"><button class="btn primary" data-action="copy-code">Скопировать код</button><button class="btn ghost" data-action="share">Ссылка ↗</button>'+
  (isPocketMember()?'<button class="btn ghost pocket-invite" type="button" data-social-invite data-room-id="'+esc(roomId)+'">Пригласить друзей</button>':'')+'</div></div>'+
  '<div class="lobby-list-heading"><span class="section-label">УЧАСТНИКИ · '+players.length+'/8</span><span>'+(leader?'Ты — ведущий':'Ожидаем ведущего')+'</span></div>'+
  '<div class="players">'+players.map(p=>'<div class="player">'+memberSeal(p)+'<div class="player-name">'+esc(p.name)+pocketPlayerBadge(p)+(p.id===me?.id?' <span class="me-tag">ты</span>':'')+'</div><span class="status">'+(p.id===view.host?'Ведущий':'Игрок')+'</span>'+
  (leader&&p.id!==me?.id&&Number(roomModuleVersion.slice(1))>=14?'<button type="button" class="lobby-kick" data-action="kick-player" data-player-id="'+esc(p.id)+'" aria-label="Исключить '+esc(p.name)+' из комнаты">Исключить</button>':'')+'</div>').join('')+'</div></div>'+
  (Number(roomModuleVersion.slice(1))>=3?commonsHtml(leader):'<div class="notice legacy-room">Общий холст недоступен в старой комнате. Для совместного рисования открой новую комнату.</div>')+
  '<div class="stack lobby-controls"><div class="lobby-controls-title">Настройки выставки</div>'+
  (leader?'<label class="field" for="rounds">Раундов</label><select class="input" id="rounds">'+[1,3,5].map(n=>'<option value="'+n+'" '+(roundsChoice===n?'selected':'')+'>'+n+' '+(n===1?'раунд':n===5?'раундов':'раунда')+'</option>').join('')+'</select>'+
   '<label class="field" for="drawingSeconds">Время рисования</label><select class="input" id="drawingSeconds">'+durationOptionsHtml(drawingSecondsChoice)+'</select>'+
   '<button class="btn primary" data-action="start" '+(players.length<2?'disabled':'')+'>'+(players.length<2?'Ждём второго игрока':'Начать выставку ↗')+'</button>':
   '<p class="lobby-guest-wait">Ведущий запустит игру, когда все будут готовы.</p>')+
   '</div></section>';
 if(page==='lobby'&&commonsBoard){
   const future=document.createElement('div');future.innerHTML=markup;
   for(const selector of ['.lobby-self','.lobby-list-heading','.players','.lobby-controls']){
     const old=screen.querySelector(selector),newer=future.querySelector(selector);if(old&&newer)old.replaceWith(newer);
   }
   const controls=screen.querySelector('.commons-controls');
   if(controls){
     const wipe=controls.querySelector('[data-action="board-clear"]'),note=controls.querySelector('.commons-note');
     if(leader&&!wipe){note?.remove();controls.insertAdjacentHTML('beforeend','<button class="commons-wipe" data-action="board-clear">Очистить холст</button>')}
     if(!leader&&wipe){wipe.remove();controls.insertAdjacentHTML('beforeend','<span class="commons-note">Очистка доступна ведущему</span>')}
   }
   if(view?.board&&(boardResync||commonsBoard.revision!==view.board.revision)){commonsBoard.reset(view.board);boardResync=false}
   return;
 }
 change(markup,'lobby');
 if(Number(roomModuleVersion.slice(1))>=3)commonsBoard=createCommonsBoard(screen.querySelector('.commons-desk'),{send:packet=>net?.sendGame(packet),onError:notify,canClear:leader,snapshot:view?.board||{revision:0,segments:[]}});
 boardResync=false;
}

function galleryHtml(list,select=false){
 const facets='<i class="picture-bevel picture-bevel-top" aria-hidden="true"></i><i class="picture-bevel picture-bevel-bottom" aria-hidden="true"></i><i class="picture-bevel picture-bevel-left" aria-hidden="true"></i><i class="picture-bevel picture-bevel-right" aria-hidden="true"></i>';
 return '<div class="gallery exhibition-grid">'+list.map((id,i)=>'<button class="picture'+(choice===id&&select?' selected':'')+'" data-'+(select?'choice':'inspect')+'="'+id+'"><span class="picture-image"><span class="picture-mat">'+facets+'<img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'" loading="eager"></span></span><span class="picture-index">ОБЪЕКТ '+String(i+1).padStart(2,'0')+'</span><span class="caption">'+esc(ARTS[id]?.title||'Картина')+'</span><span class="style">'+esc(ARTS[id]?.artist||ARTS[id]?.style)+' · '+esc(ARTS[id]?.date||'')+(ARTS[id]?.schoolCountry?' · '+esc(ARTS[id].schoolCountry):'')+'</span></button>').join('')+'</div>';
}
function preloadPreviewImage(id){
 return new Promise((resolve,reject)=>{
   const image=new Image();let fallback=false;
   image.onload=()=>resolve();
   image.onerror=()=>{
     if(!fallback){fallback=true;const src=artworkFallbackURL(id,image.src);if(src){image.src=src;return}}
     reject(Error('Не удалось загрузить полотно'));
   };
   image.src=artworkURL(id);
 });
}
function preparing(local=false){
 const v=local?practice:view;if(!v)return;
 const progress=local?'Готовим оригиналы…':'Готовим оригиналы · '+(v.readyCount||0)+' / '+v.participants.length;
 change('<section class="page center art-preparing"><span class="busy" aria-hidden="true"></span><h2>Готовим экспозицию</h2><p id="artPreparingStatus" class="hint">'+esc(progress)+'</p><button class="btn ghost" data-action="retry-art-preload" hidden>Повторить загрузку</button><button class="btn ghost preparing-menu" data-action="menu">← В главное меню</button></section>','preparing');
 void prepareRoundImages(local);
}
async function prepareRoundImages(local=false,retry=false){
 const v=local?practice:view;if(!v||v.phase!=='preparing')return;
 const token=(local?'local':roomId)+':'+v.round;
 if(preparedRound===token&&!retry)return;
 preparedRound=token;preparingError='';loadedRound='';
 const status=screen.querySelector('#artPreparingStatus'),retryButton=screen.querySelector('[data-action="retry-art-preload"]');
 if(status)status.textContent='Загружаем пять картин…';
 if(retryButton)retryButton.hidden=true;
 try{
   await Promise.all(v.selected.flatMap(id=>[loadArtwork(id),preloadPreviewImage(id)]));
   if(preparedRound!==token)return;
   loadedRound=token;
   if(local){
     if(practice!==v||v.phase!=='preparing')return;
     v.phase='preview';v.deadline=Date.now()+25000;persistPractice();preview(true);
   }else if(view?.phase==='preparing'&&roomId&&net){
     if(status?.isConnected)status.textContent='Картины готовы · ожидаем остальных';
     net.sendGame({type:'art_ready',round:v.round});
   }
 }catch{
   if(preparedRound!==token)return;
   preparingError='Не удалось загрузить картины. Проверь соединение.';
   if(status?.isConnected)status.textContent=preparingError;
   if(retryButton?.isConnected)retryButton.hidden=false;
 }
}
function updateMobileGalleryNav(rail){
 const nav=rail?.parentElement?.querySelector('.mobile-gallery-nav');
 if(!nav)return;
 const cards=[...rail.children],first=cards[0];
 if(!first)return;
 const index=Math.max(0,Math.min(cards.length-1,
  cards.reduce((closest,card,i)=>Math.abs(card.offsetLeft-first.offsetLeft-rail.scrollLeft)<
   Math.abs(cards[closest].offsetLeft-first.offsetLeft-rail.scrollLeft)?i:closest,0)));
 const count=nav.querySelector('output');if(count)count.textContent=(index+1)+' / '+cards.length;
 nav.querySelector('[data-action="preview-previous"]').disabled=index===0;
 nav.querySelector('[data-action="preview-next"]').disabled=index===cards.length-1;
}
function moveMobileGallery(direction){
 if(page!=='preview')return;
 const rail=screen.querySelector('.mobile-preview .gallery.exhibition-grid');
 if(!rail)return;
 const cards=[...rail.children],first=cards[0];
 if(!first)return;
 const current=cards.reduce((closest,card,i)=>Math.abs(card.offsetLeft-first.offsetLeft-rail.scrollLeft)<
  Math.abs(cards[closest].offsetLeft-first.offsetLeft-rail.scrollLeft)?i:closest,0);
 const next=Math.max(0,Math.min(cards.length-1,current+direction));
 rail.scrollTo({left:cards[next].offsetLeft-first.offsetLeft,behavior:'smooth'});
}
function preview(local=false){
 const v=local?practice:view;
 change('<section class="phase-page mobile-preview">'+head('РАУНД '+v.round+' / '+(v.rounds||1),'Запомни оригиналы',v.deadline)+
 '<div class="phase-body"><p class="phase-directive">Запомни детали пяти картин.</p>'+galleryHtml(v.selected)+
 '<nav class="mobile-gallery-nav" aria-label="Перелистывание картин">'+
 '<button type="button" data-action="preview-previous" aria-label="Предыдущая картина" disabled>‹</button>'+
 '<output aria-live="polite">1 / '+v.selected.length+'</output>'+
 '<button type="button" data-action="preview-next" aria-label="Следующая картина">›</button></nav>'+
 (local?'<button class="btn primary wide" data-action="skip">Перейти к реставрации</button>':'')+
 '</div></section>','preview');
 const rail=screen.querySelector('.mobile-preview .gallery.exhibition-grid');
 if(rail){
  let scheduled=false;
  rail.addEventListener('scroll',()=>{
   if(scheduled)return;scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;if(rail.isConnected)updateMobileGalleryNav(rail)});
  },{passive:true});
  updateMobileGalleryNav(rail);
 }
}
function editorIcon(name){
 const shapes={
 brush:'<path d="m15 4 5 5-8 8-4-4zM7 14c-3 0-3 3-3 6 3 0 6-1 6-4"/>',
 fill:'<path d="m4 11 8-8 8 8-8 8zM4 11h16M20 17c.7 1 1.5 2 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.7.8-1.7 1.5-2.7Z"/>',
 picker:'<path d="m12 4 2-2 8 8-2 2-2-2-10 10-4 1 1-4L14 6zM12 8l4 4"/>',
 erase:'<path d="m4 13 8-9a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-8 7H8l-4-4a2 2 0 0 1 0-3zM9 9l8 8M13 20h8"/>',
 smudge:'<path d="M3 17c3-4 5-4 9-3s7 0 9-4M3 21c4-4 7-3 10-2s6 0 8-3M5 9c3-4 7-5 11-3"/><path d="M5 12c2-1 3-1 5-1"/>',
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
function toolbar(local=false){
 const tools=[['brush','Кисть'],['fill','Заливка'],['picker','Пипетка'],['erase','Ластик'],['smudge','Растушёвка'],['hand','Панорама']];
 const palette=['#304a43','#9d4c3c','#d6ae6f','#f1e4c5','#263d57','#637f68'];
 const toolButton=(name,label,command=false)=>'<button type="button" class="tool'+(name==='brush'&&!command?' active':'')+'" '+(command?'data-cmd':'data-tool')+'="'+name+'" aria-label="'+label+'" title="'+label+'">'+editorIcon(name)+'<span>'+label+'</span></button>';
 return '<div class="tools">'+tools.map(([name,label])=>toolButton(name,label)).join('')+'</div>'+
 '<div class="colors" aria-label="Цвета кисти">'+palette.map((color,i)=>'<button type="button" class="swatch'+(i===0?' active':'')+'" data-color="'+color+'" aria-label="Цвет '+(i+1)+'" style="background:'+color+'"></button>').join('')+
 '<input type="color" class="color-input" id="customColor" value="#304a43" aria-label="Свой цвет"></div>'+
 '<div class="adjust"><label for="brushSize">Толщина <output id="brushSizeValue">12</output><span class="size-sample" id="sizeSample" aria-hidden="true"></span></label><input type="range" id="brushSize" aria-label="Толщина кисти" min="'+(local||Number(roomModuleVersion.slice(1))>=15?'.25':'1')+'" max="48" step=".25" value="12"><div class="adjust-actions">'+
 toolButton('undo','Отменить',true)+toolButton('redo','Вернуть',true)+
 '<button type="button" class="mode-switch" data-cmd="precision" aria-pressed="false" title="Переключить режим рисования">'+editorIcon('precision')+'<span>Прямое</span></button>'+
 '</div></div><div class="zoom-actions">'+toolButton('out','Отдалить',true)+toolButton('in','Приблизить',true)+toolButton('center','К повреждению',true)+'</div>';
}
function drawing(local=false){
  const v=local?practice:view,ass=v.mine;
  if(!ass){change('<section class="phase-page">'+head('ЭКСПОЗИЦИЯ','Матч уже идёт',v.deadline)+'<div class="phase-body"><div class="notice">Ты подключился после начала. Доступ к реставрации откроется в новой комнате после завершения матча.</div><button class="btn ghost wide" data-action="leave">Выйти из комнаты</button></div></section>','waiting');return}
  if(!local&&v.done?.includes(me?.id)){waiting();return}
  change('<section class="restore"><div class="rest-head">'+head('РАУНД '+v.round+' · РЕСТАВРАЦИЯ',ARTS[ass.art].title,v.deadline,artFactsHtml(ass.art),v.drawingSeconds===0)+'</div><div class="work-area"><div class="work-stage"><div class="viewport" data-gesture-surface><canvas id="paintCanvas" width="600" height="450" aria-label="Холст для дорисовывания"></canvas><div class="brush-cursor" id="brushCursor" aria-hidden="true" hidden></div><div class="picker-preview" id="pickerPreview" aria-hidden="true" hidden></div></div></div><button type="button" id="precisionArm" class="precision-arm" data-gesture-surface aria-label="Включить или остановить точное перо" aria-pressed="false" hidden><span class="precision-arm-circle" aria-hidden="true"></span><strong>РИСОВАТЬ</strong></button><div class="precision-help" id="precisionHelp" aria-live="polite" role="status"></div><button type="button" id="precisionSide" class="precision-side" data-cmd="handedness" aria-label="Переместить кнопку рисования на другую сторону" hidden><svg class="draw-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5-4 4 4 4M4 9h15m-3 10 4-4-4-4M20 15H5"/></svg></button><div class="work-tip" id="drawingTip">Рисуй в повреждённой части</div></div><div class="work-tools">'+toolbar(local)+'<div class="work-foot"><div class="work-save-info"><div class="quiet" id="strokeCount">Мазков: 0</div><div class="quiet" id="draftStatus" data-state="idle" role="status">Автосохранение</div></div><button class="btn primary" data-action="submit">Сдать работу</button></div></div></section>','drawing');
  editor=new Editor(screen,{id:ass.art,variation:ass.variation,round:v.round,onPersistenceError:()=>notify('Не удалось сохранить черновик: проверь место в браузере.'),onPersistenceStatus:state=>{if(practice||!net){draftIndicator(state==='local'?'На устройстве':state==='error'?'Не удалось сохранить':'Копия на устройстве')}},onSound:event=>sound(event,true),onChange:n=>{const t=document.querySelector('#strokeCount');if(t)t.textContent=n<0?'Предел рисунка · отмените мазок':'Мазков: '+n;if(n>=0)queueDraft()}});
  if(!local&&Array.isArray(ass.draft))editor.adoptDraft(ass.draft);
  editor.updateSizeSample();
  const counter=document.querySelector('#strokeCount');if(counter)counter.textContent='Мазков: '+editor.strokes.length;
  if(!local){
   if(pendingSubmit?.room===roomId&&pendingSubmit.round===view.round&&
      pendingSubmit.art===ass.art&&pendingSubmit.variation===ass.variation){
     const submit=screen.querySelector('[data-action="submit"]');if(submit)submit.disabled=true;
     screen.querySelector('.restore')?.classList.add('is-submitting');
     draftIndicator('Восстанавливаем отправку…');
   }else backupDraft(true);
 }
}

function waiting(){
 const v=view,ass=v?.mine;if(!v||!ass)return;
 const finished=v.done||[],players=v.participants||[];
 change('<section class="phase-page waiting-phase">'+head('РАУНД '+v.round+' · РАБОТА СДАНА','Твой шедевр в музее',v.deadline,artFactsHtml(ass.art),v.drawingSeconds===0)+
 '<div class="phase-body waiting-layout"><div class="waiting-work">'+
 '<h3>'+esc(ARTS[ass.art]?.title||'Твоя работа')+'</h3><p class="phase-directive">Двигай ползунок, чтобы сравнить с оригиналом.</p>'+
 '<div class="unveil-frame" id="unveilStage" style="--split:50%"><canvas id="restCanvas" class="unveil-bottom" aria-label="Моя реставрация"></canvas><canvas id="origCanvas" class="unveil-top" aria-label="Оригинальная картина"></canvas><span class="unveil-label left">МОЯ РАБОТА</span><span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
 '<label class="unveil-control" for="unveilRange">Сравнить до и после <input id="unveilRange" type="range" min="0" max="100" value="50" aria-label="Сравнить мою реставрацию и оригинал"></label></div>'+
 '<aside class="waiting-progress"><h3>Ожидаем остальных</h3><strong id="readyCount">'+finished.length+' / '+players.length+'</strong>'+
 '<details class="waiting-players"><summary>Кто ещё рисует <span aria-hidden="true">⌄</span></summary><div id="readyList" class="waiting-roster">'+players.map(p=>'<div class="waiting-person'+(finished.includes(p.id)?' is-ready':'')+'">'+memberSeal(p)+'<span>'+esc(p.name)+'</span><strong>'+(finished.includes(p.id)?'Готово':'Рисует')+'</strong></div>').join('')+'</div></details></aside></div></section>','waiting');
 void renderArtwork(screen.querySelector('#restCanvas'),ass.art,ass.variation,ass.strokes||[],true);
 void renderArtwork(screen.querySelector('#origCanvas'),ass.art,0,null,false);
}
function voteToken(v){return [roomId,v.round,v.turn].join(':')}
function attemptVote(force=false){
 if(!pendingVote||!net||!view||view.phase!=='voting'||voteToken(view)!==pendingVote.token)return;
 if(view.voted?.includes(me?.id)){pendingVote=null;persistVote();return}
 if(!force&&Date.now()-(pendingVote.sentAt||0)<5500)return;
 try{
   net.sendGame({type:'vote',chips:[...pendingVote.chips]});
   pendingVote.sentAt=Date.now();pendingVote.attempts=(pendingVote.attempts||0)+1;persistVote();
   const button=screen.querySelector('[data-action="vote"]');
   if(button){button.disabled=true;button.textContent='Подтверждаем фишки…'}
 }catch{
   pendingVote.sentAt=0;persistVote();
   const button=screen.querySelector('[data-action="vote"]');
   if(button){button.disabled=false;button.textContent='Повторить отправку'}
 }
}
function submitVote(){
 if(autoVoteTimer!==null){clearTimeout(autoVoteTimer);autoVoteTimer=null}
 if(!view||view.phase!=='voting'||view.voted?.includes(me?.id))return;
 if(!pendingVote||pendingVote.token!==voteToken(view)){
   if(chips.reduce((a,b)=>a+b,0)!==3)return;
   pendingVote={token:voteToken(view),round:view.round,turn:view.turn,chips:[...chips],sentAt:0,attempts:0};
   persistVote();
 }
 attemptVote(true);updateChips();
}
function chipDots(count){return '<span class="chip-dots">'+Array.from({length:count},()=>'<i class="chip-dot" aria-hidden="true"></i>').join('')+'</span>'}
function updateChips(){
 const total=chips.reduce((a,b)=>a+b,0);
 screen.querySelectorAll('[data-chip-count]').forEach(el=>{el.textContent=chips[Number(el.dataset.chipCount)]});
 screen.querySelectorAll('[data-chipadd]').forEach(el=>{el.disabled=Boolean(pendingVote?.token===voteToken(view))||total>=3});
 screen.querySelectorAll('[data-chipsub]').forEach(el=>{el.disabled=Boolean(pendingVote?.token===voteToken(view))||chips[Number(el.dataset.chipsub)]===0});
 screen.querySelectorAll('[data-stake-card]').forEach(el=>{const i=Number(el.dataset.stakeCard),n=chips[i];el.classList.toggle('has-chips',n>0);el.querySelector('[data-chip-pips]').innerHTML=chipDots(n)});
 const remain=screen.querySelector('#chipsRemaining');if(remain)remain.innerHTML=chipDots(3-total)+'<strong>'+(3-total)+'</strong> свободно';
 const button=screen.querySelector('[data-action="vote"]');if(button){button.disabled=total!==3||Boolean(pendingVote?.token===voteToken(view));if(pendingVote?.token===voteToken(view))button.textContent='Подтверждаем фишки…'}
 // In the default quick-voting mode the third coin is the final action.
 // Give the player a brief correction window, then submit exactly once.
 if(autoVoteTimer!==null){clearTimeout(autoVoteTimer);autoVoteTimer=null}
 const automatic=localStorage.getItem(CONFIRM_VOTE_KEY)!=='on';
 const pending=Boolean(pendingVote?.token===voteToken(view));
 const status=screen.querySelector('#coinVoteStatus');
 if(status)status.textContent=pending?'Передаём фишки…':total===3?'Голос уйдёт автоматически':total+' / 3 фишки';
 if(automatic&&total===3&&!pending&&view?.phase==='voting'&&!view.voted?.includes(me?.id)){
  const token=voteToken(view);
  autoVoteTimer=setTimeout(()=>{
   autoVoteTimer=null;
   if(page==='vote'&&view?.phase==='voting'&&voteToken(view)===token&&
      chips.reduce((a,b)=>a+b,0)===3&&!pendingVote)submitVote();
  },850);
 }
}
function vote(){
 if(autoVoteTimer!==null){clearTimeout(autoVoteTimer);autoVoteTimer=null}
 const v=view,target=v.author,isOwn=target?.id===me?.id,already=(v.voted||[]).includes(me?.id);
 const sessionKey=v.round+':'+v.turn;
 voteScreenToken=sessionKey;
 if(chipTarget!==sessionKey){chipTarget=sessionKey;chips=pendingVote?.token===voteToken(v)?[...pendingVote.chips]:[0,0,0,0,0]}
 const count=(v.voted||[]).length,expected=v.participants.length-1;
 const examined=v.candidate;
 change('<section class="phase-page expert-phase">'+head('ЭКСПЕРТИЗА · '+(v.turn+1)+' / '+v.participants.length,'Найди реставрацию',v.deadline)+
 '<div class="phase-body expert-round"><div class="expert-intro"><div><div class="expert-author">'+(target?memberSeal(target):'')+'<h3>'+esc(target?.name||'Реставратор')+'</h3></div><p class="phase-directive">Одна из пяти картин отреставрирована.</p></div><p class="expert-observers">Заключений: <strong id="votesReady">'+count+' / '+expected+'</strong></p></div>'+
 '<div class="expert-ballot"><p class="hint">'+(isOwn?'Это твоя реставрация. Ставки на неё делают остальные.':already?'Твои фишки приняты. Можешь рассматривать картины, пока остальные голосуют.':'Распредели 3 фишки между картинами.')+'</p>'+
 '<div class="stake-gallery suspect-gallery">'+v.selected.map((id,i)=>'<div class="stake-card" data-stake-card="'+i+'"><div class="stake-frame">'+
 (examined?.art===id?'<canvas class="candidate-art" id="examinedCanvas" aria-label="Полотно № '+(i+1)+'"></canvas>':'<img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Полотно')+'" loading="eager">')+
 '<span class="stake-number">'+String(i+1).padStart(2,'0')+'</span></div><div class="stake-details"><strong>'+esc(ARTS[id]?.title||'Картина')+'</strong><small>'+esc(ARTS[id]?.artist||'')+'</small></div>'+
 (!isOwn&&!already?'<div class="stake-actions"><button data-chipsub="'+i+'" aria-label="Убрать фишку с полотна '+(i+1)+'">−</button><div class="stake-amount"><strong data-chip-count="'+i+'">0</strong><span data-chip-pips></span></div><button data-chipadd="'+i+'" aria-label="Поставить фишку на полотно '+(i+1)+'">＋</button></div>':'<span class="stake-locked">№ '+(i+1)+'</span>')+'</div>').join('')+'</div>'+
 (!isOwn&&!already?'<div class="stake-tray"><div id="chipsRemaining">'+chipDots(3)+'<strong>3</strong> свободно</div>'+(localStorage.getItem(CONFIRM_VOTE_KEY)==='on'?'<button class="btn primary" data-action="vote" disabled>Подтвердить три фишки</button>':'<span class="coin-auto-status" id="coinVoteStatus" role="status" aria-live="polite">3 фишки — и голос учтён</span>')+'</div>':'<div class="stake-wait">Ожидаем завершения голосования…</div>')+
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
  stage?.closest('.reveal-phase')?.classList.add('is-composed');
  finishVoteTransition();
 }).catch(()=>{stage?.closest('.reveal-phase')?.classList.add('is-composed');finishVoteTransition()});
}
function roundReview(){
 if(!view?.gallery?.length)return;
 const v=view;
 change(roundReviewMarkup(v,me?.id,ARTS,esc),'round-review');
 renderRoundThumbnails(screen,v,renderArtwork);
}
function results(){
 const rank=[...view.participants].sort((a,b)=>(view.scores[b.id].mask+view.scores[b.id].eye)-(view.scores[a.id].mask+view.scores[a.id].eye));
 change('<section class="page"><div class="section-label">ИТОГИ ВЫСТАВКИ</div><h2>Каталог разоблачений</h2><div class="notice">Обман и наблюдательность оцениваются отдельно. Побеждает самая высокая сумма.</div>'+rank.map((p,i)=>'<div class="result-item"><div class="result-rank"><div class="result-identity">'+memberSeal(p)+'<div><span class="section-label">№ '+(i+1)+'</span><h3>'+esc(p.name)+pocketPlayerBadge(p)+'</h3></div></div><div class="points">'+(view.scores[p.id].mask+view.scores[p.id].eye)+' очк.</div></div><div class="quiet">Маскировка '+view.scores[p.id].mask+' · Экспертиза '+view.scores[p.id].eye+'</div></div>').join('')+'<div class="stack" style="margin-top:20px">'+(me?.id===view.host?'<button class="btn primary" data-action="next">Новый матч с этой компанией</button>':'<div class="hint">Создатель комнаты может начать следующий матч.</div>')+'<button class="btn ghost" data-action="achievements">Достижения и награды</button><button class="btn ghost" data-action="menu">← В главное меню</button></div></section>','results')
}
let earnedAchievementIds=new Set();
async function achievements(){
 earnedAchievementIds=new Set(); // Never retain another account's cached achievements.
 change('<section class="page zamazka-achievements"><div class="section-label">КОЛЛЕКЦИЯ</div><h2>Достижения</h2>'+
  '<div id="zamAchievements" class="achievement-grid"><div class="notice">Проверяем награды Pocket ID…</div></div>'+
  '<button class="btn ghost wide" data-action="achievements-back">← Назад</button></section>','achievements');
 const mount=screen.querySelector('#zamAchievements');
 let message='';
 if(isPocketMember()){
  try{
   const response=await fetch('/pocket-social/achievements',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('Не удалось получить награды. Попробуй открыть страницу снова.');
   const data=await response.json();
   earnedAchievementIds=new Set((data.achievements||[]).map(a=>a.id));
  }catch(e){message=e.message||'Нет связи с Pocket ID.'}
 }else message='Войди в Pocket ID, чтобы получать косметику в сетевых матчах.';
 if(!mount.isConnected)return;
 mount.innerHTML=(message?'<div class="notice">'+esc(message)+'</div>':'')+
  '<div class="achievement-progress">'+zamazkaAchievements.filter(a=>earnedAchievementIds.has(a.id)).length+' / 7 получено</div>'+
  zamazkaAchievements.map(a=>'<article class="achievement-entry" data-earned="'+earnedAchievementIds.has(a.id)+'">'+
   '<div class="achievement-entry__heading"><strong>'+esc(a.name)+'</strong><span>'+esc(a.tier)+'</span></div>'+
   '<p>'+esc(a.detail)+'</p><div class="achievement-entry__foot"><span>'+esc(a.reward)+'</span><b>'+
   (earnedAchievementIds.has(a.id)?'Получено':'Не открыто')+'</b></div></article>').join('');
}
function collection(){
 change('<section class="page collection-page"><div class="section-label">ЛИЧНЫЙ ФОНД</div><h2>Мои реставрации</h2><div class="zamazka-cloud-row"><span data-cloud-status>Только на этом устройстве</span><button class="btn ghost" data-action="cloud-sync">☁ Синхронизировать</button>'+(saved.length?'<button class="btn ghost" data-action="export-archive">Экспорт архива ↓</button>':'')+'</div><div id="archiveLocalStatus" class="archive-local-status" role="status"></div>'+(saved.length?'<div class="gallery archive-gallery">'+saved.map((g,i)=>'<button class="picture archive-work" data-saved="'+i+'"><span class="picture-image archive-art-frame"><canvas data-saved-canvas="'+i+'" width="480" height="360"></canvas></span><span class="archive-caption"><span class="caption">'+esc(ARTS[g.art]?.title||'Работа')+'</span><span class="style">'+new Date(g.time).toLocaleDateString('ru-RU')+'</span></span></button>').join('')+'</div>':'<div class="notice">Фонд пуст. Сделай первую реставрацию в тренировке, и она появится здесь.</div>')+'<div class="subtle-rule"></div><button class="btn ghost wide" data-action="menu">В главное меню</button></section>','collection');
 zamazkaCloud?.render();archiveWriteIndicator();
 const canvases=[...screen.querySelectorAll('[data-saved-canvas]')];
 const draw=canvas=>{if(!canvas.isConnected||canvas.dataset.loaded)return;canvas.dataset.loaded='1';const g=saved[Number(canvas.dataset.savedCanvas)];if(g)void renderArtwork(canvas,g.art,g.variation,g.strokes,true,true)};
 if('IntersectionObserver'in window){
   const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);draw(entry.target)}},{root:null,rootMargin:'260px'});
   archiveObserver=observer;canvases.forEach(c=>observer.observe(c));
 }else canvases.forEach(draw);
}
function exportArchive(){
 if(!saved.length){notify('Архив пуст');return}
 try{
  const payload=JSON.stringify({format:'zamazka-archive',version:1,exportedAt:new Date().toISOString(),works:saved},null,2);
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download='zamazka-archive-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  notify('Архив подготовлен для сохранения');
 }catch{notify('Не получилось экспортировать архив')}
}
function openArchive(index){
 const records=saved.map(g=>({...g,name:'Моя реставрация',votes:{}}));
 const archived={phase:'archive',gallery:records,selected:[],round:1};
 openRoundViewer({index,view:archived,dialog,renderArtwork,arts:ARTS,esc,closeDialog,onNavigate:next=>openArchive(next)});
}
let archiveSavePromise=Promise.resolve(),archiveWriteState='ready';
function archiveWriteIndicator(){const node=screen.querySelector('#archiveLocalStatus');if(!node)return;node.dataset.state=archiveWriteState;node.textContent=archiveWriteState==='saving'?'Сохраняем в фонде…':archiveWriteState==='error'?'Не удалось сохранить в фонд':'Фонд сохранён на устройстве'}
function saveArtwork(art,variation,strokes){
 saved=[{art,variation,strokes,time:Date.now(),edition:ARCHIVE_EDITION},...saved].slice(0,96);
 const copy=structuredClone(saved);
 archiveWriteState='saving';archiveWriteIndicator();
 // Serial writes prevent an older artwork snapshot from overwriting a newer one.
 archiveSavePromise=archiveSavePromise.catch(()=>{}).then(()=>zamazkaStore.set('archive',copy)).then(()=>{
   try{localStorage.removeItem(GALLERY_KEY)}catch{}
   archiveWriteState='ready';archiveWriteIndicator();zamazkaCloud?.schedule();
   return true;
 }).catch(()=>{
   try{localStorage.setItem(GALLERY_KEY,JSON.stringify(copy));archiveWriteState='ready';archiveWriteIndicator();zamazkaCloud?.schedule();return true}
   catch{archiveWriteState='error';archiveWriteIndicator();notify('Архив не сохранился: в браузере закончилось место.');return false}
 });
 return archiveSavePromise;
}
let storedPractice=null;
function persistPractice(){
 if(!practice)return;
 const data=JSON.stringify({phase:practice.phase,round:practice.round,rounds:practice.rounds,
  selected:practice.selected,deadline:practice.deadline,drawingSeconds:practice.drawingSeconds,
  mine:practice.mine,strokes:practice.strokes,edition:ARCHIVE_EDITION});
 storedPractice=JSON.parse(data);
 try{sessionStorage.setItem(PRACTICE_KEY,data)}catch{}
 void zamazkaStore.set('practice',storedPractice).then(()=>{
   try{if(sessionStorage.getItem(PRACTICE_KEY)===data)sessionStorage.removeItem(PRACTICE_KEY);localStorage.removeItem(PRACTICE_KEY)}catch{}
 }).catch(()=>{try{localStorage.setItem(PRACTICE_KEY,data)}catch{notify('Недостаточно места для черновика.')}});
}
function newPractice(){const order=[...PLAYABLE_IDS];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}const selected=order.slice(0,5);practice={phase:'preparing',round:1,rounds:1,selected,deadline:0,drawingSeconds:soloDrawingSecondsChoice,mine:{art:selected[Math.floor(Math.random()*5)],variation:Math.floor(Math.random()*0xffffffff)},strokes:[]};preparedRound='';persistPractice();preparing(true)}
function resumePractice(){try{const p=JSON.parse(sessionStorage.getItem(PRACTICE_KEY)||'null')||storedPractice||JSON.parse(localStorage.getItem(PRACTICE_KEY)||'null');if(!p||!Array.isArray(p.selected)||!ARTS[p.mine?.art]||!['preparing','preview','drawing'].includes(p.phase))throw Error('missing');if(p.edition!==ARCHIVE_EDITION){
 p.mine.art=normalizeArchiveEntry({art:p.mine.art,edition:p.edition}).art;
 p.selected=p.selected.map(art=>normalizeArchiveEntry({art,edition:p.edition}).art);
 p.edition=ARCHIVE_EDITION;
 }
 practice=p;practice.drawingSeconds=normalizedDuration(p.drawingSeconds??160);if(p.deadline>0&&p.deadline<Date.now())practice.deadline=Date.now()+30000;if(p.phase==='drawing')drawing(true);else if(p.phase==='preparing'){preparedRound='';preparing(true)}else preview(true)}catch{newPractice()}}
function practiceStep(){if(!practice)return;if(practice.phase==='preview'){practice.phase='drawing';practice.deadline=practice.drawingSeconds===0?0:Date.now()+practice.drawingSeconds*1000;persistPractice();drawing(true)}else if(practice.phase==='drawing')finishPractice()}
function finishPractice(){if(!practice||practice.phase!=='drawing')return;practice.strokes=editor?editor.getData():[];saveArtwork(practice.mine.art,practice.mine.variation,practice.strokes);editor?.clearDraft();practice.phase='reveal';practice.deadline=0;try{localStorage.removeItem(PRACTICE_KEY)}catch{}try{sessionStorage.removeItem(PRACTICE_KEY)}catch{}storedPractice=null;void zamazkaStore.remove('practice').catch(()=>{});reveal(true)}
let previousVisualPhase='',lastPhaseCue='',voteScreenToken='',voteTransitionLayer=null,voteTransitionTimeout=null;
function renderView(){
 if(!view)return;
 const phaseToken=view.round+':'+view.phase;
 if(previousVisualPhase&&previousVisualPhase!==phaseToken&&lastPhaseCue!==phaseToken){
   lastPhaseCue=phaseToken;
   if(view.phase==='voting')sound('paper');
   else if(view.phase==='reveal')sound('reveal');
   else if(view.phase==='round-review')sound('confirm');
 }
 previousVisualPhase=phaseToken;
 if(view.phase==='drawing'&&view.done?.includes(me?.id)){
   if(view.mine)confirmSubmission(view.mine.art,view.round);
   if(editor)editor.clearDraft();
 }
 const key=view.phase+':'+view.round+':'+view.turn+':'+(view.done||[]).includes(me?.id)+':'+(view.voted||[]).includes(me?.id);
 if(page==='drawing'&&view.phase==='drawing'&&key===lastUiKey)return;
  if(page==='waiting'&&view.phase==='drawing'&&key===lastUiKey){
    const count=screen.querySelector('#readyCount');if(count)count.textContent=(view.done||[]).length+' / '+view.participants.length;
    screen.querySelectorAll('.waiting-person').forEach((el,i)=>{const p=view.participants[i],status=el.querySelector('strong');if(p&&status){const ready=(view.done||[]).includes(p.id);if(ready&&!el.classList.contains('is-ready')){el.classList.add('just-ready');setTimeout(()=>el.classList.remove('just-ready'),440)}status.textContent=ready?'Готово':'Рисует';el.classList.toggle('is-ready',ready)}});
    return;
  }
 if(page==='preparing'&&view.phase==='preparing'&&key===lastUiKey){
   const status=screen.querySelector('#artPreparingStatus');if(status&&!preparingError&&loadedRound===roomId+':'+view.round){const total=view.participants?.length||0;status.textContent='Картины готовы · '+(view.readyCount||0)+' / '+total+' игроков'}
   return;
 }
 if(page==='preview'&&view.phase==='preview'&&key===lastUiKey)return; // Do not reset the player's mobile swipe position on server updates.
 if(page==='round-review'&&view.phase==='round-review'&&key===lastUiKey)return;
 if(page==='vote'&&view.phase==='voting'&&voteScreenToken===view.round+':'+view.turn){
  // Authoritative vote receipts can update dozens of times per round.
  // Preserve the live gallery, five loaded originals, coin controls, scroll
  // position and any animation instead of recreating the entire DOM.
  const ready=screen.querySelector('#votesReady');
  if(ready)ready.textContent=(view.voted||[]).length+' / '+(view.participants.length-1);
  const hasVoted=(view.voted||[]).includes(me?.id);
  if(hasVoted){
   if(autoVoteTimer!==null){clearTimeout(autoVoteTimer);autoVoteTimer=null}
   screen.querySelectorAll('[data-chipadd],[data-chipsub]').forEach(b=>{b.disabled=true});
   const status=screen.querySelector('#coinVoteStatus');
   if(status)status.textContent='Монеты приняты';
   const tray=screen.querySelector('.stake-tray');
   if(tray)tray.classList.add('is-vote-locked');
   const note=screen.querySelector('.expert-ballot > p.hint');
   if(note)note.textContent='Твои фишки приняты. Ожидаем остальных.';
  }
  lastUiKey=key;
  return;
 }
 lastUiKey=key;choice=null;
 if(view.phase==='lobby')lobby();
 else if(view.phase==='preparing')preparing();
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
 connectionStatus('connecting');
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
   client.on('connected',data=>{if(client.closed)return;me=data.player;connectionStatus('ok');markTabGuest(POCKETNET_URL,client.token)});
   client.on('room_joined',msg=>{
     if(client.closed)return;
     roomId=msg.roomId;
     roomModuleVersion=msg.version||'v1';
     boardResync=true;
     client.sendGame({type:'sync'});
     if(page==='drawing'&&!pendingSubmit)backupDraft(true);
     // Legacy room emblems are read only for backwards compatibility; Pocket ID is the visible identity.
     if(view)renderView();
     else change('<section class="page center connecting-room"><span class="busy"></span><h2>Готовим экспозицию…</h2><p class="hint">Собираем гостей.</p></section>','connecting');
   });
   // Big eight-player galleries arrive in ordered, bounded PocketNet frames.
   // Reconstruct only complete authoritative snapshots; never show partial art.
   const stateStreams=new Map();
   client.on('game_event',msg=>{
     if(client.closed)return;
     let event=msg.event;
     if(event?.type==='state_stream'){
       const p=event.payload;
       if(!p||typeof p.stream!=='string'||!Array.isArray(stateStreams.get(p.stream)?.parts)&&
          (!Number.isInteger(p.total)||p.total<1||p.total>512))return;
       if(!Number.isInteger(p.index)||p.index<0||p.index>=p.total||
          typeof p.part!=='string'||p.part.length>15000)return;
       const now=Date.now();
       for(const [id,s] of stateStreams)if(now-s.created>15000)stateStreams.delete(id);
       let entry=stateStreams.get(p.stream);
       if(!entry){entry={created:now,total:p.total,parts:new Array(p.total),count:0};stateStreams.set(p.stream,entry)}
       if(entry.total!==p.total)return;
       if(entry.parts[p.index]===undefined){entry.parts[p.index]=p.part;entry.count++}
       if(entry.count!==entry.total)return;
       stateStreams.delete(p.stream);
       try{event=JSON.parse(entry.parts.join(''))}catch{notify('Не удалось собрать данные выставки. Повторяем…');client.sendGame({type:'sync'});return}
     }
     if(event?.type==='achievement_awarded'){
      const item=zamazkaAchievements.find(a=>a.id===event.payload?.id);
      if(item){earnedAchievementIds.add(item.id);sound('confirm');notify('Достижение: '+item.name+' · '+item.reward);}
      return;
     }
     if(event?.type==='state'){
       view=event.payload;
       if(pendingVote&&(view.phase!=='voting'||voteToken(view)!==pendingVote.token||view.voted?.includes(me?.id))){pendingVote=null;persistVote()}
       if(view?.mine&&view.done?.includes(me?.id))confirmSubmission(view.mine.art,view.round);
       renderView();
       if(view?.phase==='drawing'&&!view.done?.includes(me?.id)&&
          pendingSubmit?.room===roomId&&pendingSubmit.round===view.round){
         const retryMs=view.deadline&&Date.now()>=view.deadline?3500:15000;
         if(!pendingSubmit.sentAt||Date.now()-pendingSubmit.sentAt>retryMs)attemptSubmission();
       }
     }
     else if(event?.type==='submission_saved'){
       if(pendingSubmit&&event.payload?.round===pendingSubmit.round&&
          event.payload?.art===pendingSubmit.art&&event.payload?.revision===pendingSubmit.revision)
         confirmSubmission(event.payload.art,event.payload.round);
     }
     else if(event?.type==='vote_saved'){
       if(pendingVote?.round===event.payload?.round&&pendingVote?.turn===event.payload?.turn){pendingVote=null;persistVote()}
     }
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
   client.on('room_kicked',()=>{if(net!==client||client.closed)return;home(true);notify('Куратор исключил тебя из комнаты')});
   client.on('room_closed',()=>{if(client.closed)return;home();notify('Комната закрыта')});
   client.on('disconnected',()=>{
     if(client.closed)return;connectionStatus('offline');
     activeDraftTransfer?.abort();activeDraftTransfer=null;
     activeSubmitTransfer?.abort();activeSubmitTransfer=null;
     lastDraftSentAt=0;lastDraftAckRevision='';autoSubmitted='';
     if(pendingSubmit){pendingSubmit.sentAt=0;persistPending();draftIndicator('Нет связи · работа на устройстве')}
     else draftIndicator('Нет связи · черновик на устройстве');
     notify('Связь прервана · восстанавливаем комнату');
   });
   client.on('error',error=>{
     if(client.closed)return;
     const code=String(error?.code||error?.message||'');
     const messages={room_not_found:'Комната больше недоступна.',room_full:'В комнате уже восемь человек.',server_at_capacity:'Все игровые комнаты заняты.',game_unavailable:'Игра временно недоступна.',room_version_unavailable:'Эта версия комнаты недоступна.',message_too_large:'Сбой передачи · локальный рисунок сохранён',rate_limited:'Передаём слишком быстро · повторяем',not_in_room:'Восстанавливаем соединение с комнатой'};

     if(code==='rate_limited'){
       activeDraftTransfer?.abort();activeDraftTransfer=null;
       activeSubmitTransfer?.abort();activeSubmitTransfer=null;
       submissionBackoffUntil=Date.now()+6500;draftSendAfter=Date.now()+6500;
       lastDraftSentAt=0;lastDraftAckRevision='';
       if(pendingSubmit){pendingSubmit.sentAt=0;persistPending()}
       draftIndicator('Сервер занят · повторим отправку через несколько секунд');
       return;
     }
     if(page==='connecting'&&messages[code]){
       client.close();if(net===client)net=null;clearTabGuest();
       if(mode==='resume'){client.roomId=null;client.persist();home();notify('Комната больше недоступна')}
       else setup(mode,messages[code],input);
     }else if(!client.closed){
       if(pendingSubmit){pendingSubmit.sentAt=0;persistPending()}
       notify(messages[code]||'Проблема соединения · повторим');
     }
   });
   await client.connect();
   if(epoch!==connectionEpoch){client.close();return}
   if(mode==='create')client.createRoom('zamazka');
   else if(mode==='join')client.joinRoom(room);
   // Stored rooms are rejoined automatically after PocketNet authentication.
 }catch(error){
   if(epoch!==connectionEpoch)return;
   connectionStatus('offline');
   if(net){net.close();net=null}
   clearTabGuest();
   const message=error?.name==='TimeoutError'?'Сервер не ответил. Попробуй ещё раз.':error instanceof TypeError?'Нет соединения с интернетом. Проверь сеть.':error?.message||'Не удалось подключиться. Попробуй ещё раз.';
   if(mode==='resume'){home();notify('Не удалось восстановить комнату · проверь подключение')}else setup(mode,message,input);
 }
}
function doSubmit(){
 if(page==='drawing'&&practice){finishPractice();return}
 if(!editor||!net||page!=='drawing'||pendingSubmit)return;
 editor.saveSnapshot();
 modal('Сдать реставрацию?','<p class="hint">После отправки изменять мазки нельзя. Работа будет доступна остальным на экспертизе.</p>',[
  ['Сдать',()=>{closeDialog();submitArtwork()},'primary'],
  ['Продолжить рисовать',closeDialog,'ghost']]);
}
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
function inspect(id,fromHome=false){
 const art=ARTS[id];
 modal(esc(art.title),
  '<div class="inspection-stage"><span class="inspection-loading" role="status">Загружаем картину…</span><img class="art-inspection" data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(art.title)+'" decoding="async"></div>'+
  '<div class="inspection-details"><div class="art-metadata"><div class="art-inspect-facts">'+artFactsHtml(id)+'</div><div>Хранится: '+esc(art.museum)+'</div></div>'+
  (art.isReal?'<a class="art-source" href="'+esc(art.source)+'" target="_blank" rel="noopener noreferrer">Источник изображения ↗</a>':'')+'</div>',
  [['Закрыть',closeDialog,'primary']]
 );
 const image=dialog.querySelector('.inspection-stage .art-inspection');
 const stage=image?.closest('.inspection-stage');
 if(!image||!stage)return;
 const loaded=async()=>{
  if(!image.isConnected||!image.naturalWidth)return;
  try{await image.decode()}catch{}
  if(stage.isConnected)stage.classList.add('is-ready');
 };
 image.addEventListener('load',()=>void loaded(),{once:true});
 image.addEventListener('error',()=>setTimeout(()=>{
  if(stage.isConnected&&!image.naturalWidth){
   stage.querySelector('.inspection-loading').textContent='Не удалось открыть изображение';
  }
 },1200));
 if(image.complete&&image.naturalWidth)void loaded();
}

function magnify(id){const cand=view?.candidate;modal(esc(ARTS[id].title),'<canvas id="largeCandidate" style="width:100%;aspect-ratio:4/3;display:block;max-height:55vh"></canvas><p class="hint">'+esc(ARTS[id].style)+' · Внимательно изучи мазки и фактуру.</p>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#largeCandidate'),id,cand?.variation||0,cand?.strokes||[],cand?.art===id)}
let settingsPreviewVolume=null,settingsPreviewAppearance=null,settingsOriginalAppearance=null;
function settings(){
 const oldVolume=soundVolume;
 const oldAppearance=appearance();settingsOriginalAppearance=oldAppearance;
 modal('Настройки',
  '<label class="field" for="settingName">Мой ник</label><input class="input" id="settingName" maxlength="22" value="'+esc(tabGuestName())+'">'+
  '<label class="field"><input type="checkbox" id="settingSound" '+(beepEnabled?'checked':'')+'> Звуки мастерской</label>'+
  '<label class="field sound-volume-label" for="settingVolume"><span>Громкость эффектов</span><output id="settingVolumeValue">'+soundVolume+'%</output></label>'+
  '<input class="sound-volume-range" id="settingVolume" type="range" min="0" max="100" step="5" value="'+soundVolume+'" aria-label="Громкость эффектов">'+
  '<label class="field"><input type="checkbox" id="settingConfirmVote" '+(localStorage.getItem(CONFIRM_VOTE_KEY)==='on'?'checked':'')+'> Подтверждать распределение монет</label>'+
  '<label class="field appearance-choice" for="settingNewAppearance"><span class="appearance-choice-text"><strong>Новый внешний вид</strong><small>Экспериментальная музейная мастерская</small></span><input type="checkbox" role="switch" id="settingNewAppearance" '+(appearance()==='new'?'checked':'')+'><span class="appearance-track" aria-hidden="true"></span></label>'+
  '<p class="hint">Новый ник применится при следующем подключении.</p>',[
  ['Сохранить',()=>{
   rememberTabName(dialog.querySelector('#settingName').value.trim().slice(0,22)||'Реставратор');
   beepEnabled=dialog.querySelector('#settingSound').checked;
   soundVolume=Math.max(0,Math.min(100,Number(dialog.querySelector('#settingVolume').value)||0));
   try{
    localStorage.setItem(NS+'sound',beepEnabled?'on':'off');
    localStorage.setItem(SOUND_VOLUME_KEY,String(soundVolume));
    localStorage.setItem(CONFIRM_VOTE_KEY,dialog.querySelector('#settingConfirmVote').checked?'on':'off');
   }catch{}
   museumAudio.setEnabled(beepEnabled);museumAudio.setVolume(soundVolume/100);
   applyAppearance(dialog.querySelector('#settingNewAppearance').checked?'new':'classic',true);
   settingsPreviewAppearance=null;settingsOriginalAppearance=null;
   settingsPreviewVolume=null;closeDialog();
   if(page==='vote'&&view?.phase==='voting')vote();
   notify('Настройки сохранены');
  },'primary'],
  ['Отмена',()=>{museumAudio.setVolume(oldVolume/100);settingsPreviewVolume=null;closeDialog()},'ghost']
 ]);
 const volume=dialog.querySelector('#settingVolume'),value=dialog.querySelector('#settingVolumeValue');
 volume?.addEventListener('input',()=>{
  value.textContent=volume.value+'%';
  settingsPreviewVolume=Number(volume.value);museumAudio.setVolume(settingsPreviewVolume/100);
 });
 volume?.addEventListener('change',()=>{if(dialog.querySelector('#settingSound')?.checked)museumAudio.play('tool',true)});
 dialog.querySelector('#settingNewAppearance')?.addEventListener('change',event=>{
  settingsPreviewAppearance=event.target.checked?'new':'classic';
  applyAppearance(settingsPreviewAppearance);
 });
}

function openPocketProfile(){
 if(window.PocketSocial?.open)void window.PocketSocial.open();
 else notify('Профиль Pocket ID пока загружается. Попробуй ещё раз.');
}
document.querySelector('#profileBtn')?.addEventListener('click',openPocketProfile);
document.querySelector('#settingsBtn').addEventListener('click',settings);
syncIdentity();
screen.addEventListener('click',e=>{
 const b=e.target.closest('[data-action],[data-inspect],[data-magnify],[data-choice],[data-saved],[data-chipadd],[data-chipsub],[data-review-open]');if(!b)return;
 if(b.hasAttribute('data-review-open')){openRoundViewer({index:Number(b.dataset.reviewOpen),view,dialog,renderArtwork,arts:ARTS,esc,closeDialog});return}
 if(b.hasAttribute('data-magnify')){magnify(Number(b.dataset.magnify));return}
 if(b.hasAttribute('data-chipadd')){const i=Number(b.dataset.chipadd);if(chips.reduce((a,b)=>a+b,0)<3){animateCoinDeposit(b);chips[i]++;sound('token',true);updateChips()}return}
 if(b.hasAttribute('data-chipsub')){const i=Number(b.dataset.chipsub);if(chips[i]>0){chips[i]--;sound('token',true);updateChips()}return}
 if(b.hasAttribute('data-choice')){sound('paper',true);choice=Number(b.dataset.choice);screen.querySelectorAll('[data-choice]').forEach(x=>x.closest('.picture')?.classList.toggle('selected',Number(x.dataset.choice)===choice));const v=screen.querySelector('[data-action=vote]');if(v)v.disabled=false;return}
 if(b.hasAttribute('data-inspect')){sound('paper',true);if(page==='preview'||page==='vote'&&(view?.author?.id===me?.id||(view?.voted||[]).includes(me?.id)))inspect(Number(b.dataset.inspect));return}
 if(b.hasAttribute('data-saved')){openArchive(Number(b.dataset.saved));return}

 const action=b.dataset.action;
 if(action!=='museum-next'&&action!=='museum-prev')sound(['submit','vote','advance','next','continue','start'].includes(action)?'confirm':['collection','resume','menu','skip'].includes(action)?'paper':'press',true);
 if(action==='pocket-profile')openPocketProfile();
 else if(action==='create'||action==='join')setup(action);
  else if(action==='museum-next')shiftMuseum(1);
 else if(action==='museum-prev')shiftMuseum(-1);
 else if(action==='preview-previous')moveMobileGallery(-1);
 else if(action==='preview-next')moveMobileGallery(1);
 else if(action==='kick-player'){
  const targetId=b.dataset.playerId;
  const player=view?.participants?.find(p=>p.id===targetId);
  if(page!=='lobby'||view?.host!==me?.id||Number(roomModuleVersion.slice(1))<14||!player||player.id===me.id)return;
  modal('Исключить реставратора?','<p class="hint"><strong>'+esc(player.name)+'</strong> будет удалён из комнаты. При необходимости его можно пригласить снова.</p>',[
   ['Исключить',()=>{
    closeDialog();
    if(!net||view?.phase!=='lobby'||view.host!==me?.id||!view.participants.some(p=>p.id===targetId))return;
    try{net.sendGame({type:'kick_player',targetId})}catch{notify('Нет связи с комнатой')}
   },'primary'],['Отмена',closeDialog,'ghost']
  ]);
 }
 else if(action==='board-clear')modal('Очистить общий холст?','<p class="hint">Рисунки всех участников исчезнут без возможности восстановления.</p>',[['Очистить',()=>{closeDialog();try{net?.sendGame({type:'board_clear'})}catch{notify('Нет связи с комнатой')}},'primary'],['Отмена',closeDialog,'ghost']]);
 else if(action==='practice')practiceSettings();
 else if(action==='retry-gallery')home();
 else if(action==='retry-art-preload')void prepareRoundImages(Boolean(practice),true);
 else if(action==='resume')resumePractice();
 else if(action==='collection')collection();
 else if(action==='export-archive')exportArchive();
 else if(action==='achievements')void achievements();
 else if(action==='achievements-back'){if(net&&view)renderView();else home();}
 else if(action==='cloud-sync')void zamazkaCloud?.sync();
 else if(action==='menu'){
    editor?.finishStroke();
    if(net||practice&&['preparing','preview','drawing'].includes(practice.phase)){
      modal('Вернуться в главное меню?','<p class="hint">Текущая партия будет покинута. Несданный рисунок останется на устройстве; одиночный черновик можно продолжить из главного меню.</p>',[
        ['В меню',()=>{closeDialog();home()},'primary'],
        ['Остаться',closeDialog,'ghost']
      ]);
    }else home();
  }
 else if(action==='connect')connect(b.dataset.mode);
 else if(action==='share')share();
 else if(action==='copy-code')copyText(inviteCode(roomId),'Код комнаты скопирован');
 else if(action==='start')net?.sendGame({type:'start',preload:true,rounds:Number(screen.querySelector('#rounds')?.value||3),drawingSeconds:Number(screen.querySelector('#drawingSeconds')?.value??160)});
 else if(action==='leave')modal('Выйти из комнаты?','<p class="hint">Другие реставраторы смогут продолжить без тебя.</p>',[['Выйти',()=>{closeDialog();home()},'primary'],['Отмена',closeDialog,'ghost']]);
 else if(action==='skip')practiceStep();
 else if(action==='submit')doSubmit();
 else if(action==='vote')submitVote()
 else if(action==='advance')net?.sendGame({type:'advance'});
 else if(action==='continue'&&view?.phase==='round-review'&&me?.id===view.host){b.disabled=true;try{net?.sendGame({type:'continue'})}catch{b.disabled=false;notify('Нет соединения с комнатой')}}
 else if(action==='next')net?.sendGame({type:'next'});
});
// Quiet, tactile clock ticks are only for the two timed creation stages.
// Never sound alarms on voting, revealing, waiting or result screens.
let lastClockCue='';
function tick(){
 if(pendingVote)attemptVote();
 if(practice&&practice.deadline>0&&['preview','drawing'].includes(practice.phase)&&Date.now()>=practice.deadline)practiceStep();
 autoFinishOnDeadline();
 const v=practice||view,clock=document.querySelector('#clock');
 const clockStage=(page==='preview'||page==='drawing')&&
                  (v?.phase==='preview'||v?.phase==='drawing');
 if(clock&&v?.deadline){
  const s=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));
  clock.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  clock.classList.toggle('urgent',Boolean(clockStage&&s<=10));
  if(clockStage&&s>0&&s<=10){
   const cue=(practice?'practice':roomId)+':'+v.round+':'+v.phase+':'+s;
   if(cue!==lastClockCue){lastClockCue=cue;sound('clock-tick')}
  }
 }
 if(net&&view&&view.deadline&&Date.now()>view.deadline-2400&&Date.now()-lastPulse>1800){
  lastPulse=Date.now();try{net.sendGame({type:'pulse'})}catch{}
 }
}
let museumSwipe=null;
screen.addEventListener('pointerdown',e=>{if(page==='home'&&e.target.closest('.museum-display'))museumSwipe={x:e.clientX,y:e.clientY,id:e.pointerId}});
screen.addEventListener('pointerup',e=>{if(!museumSwipe||e.pointerId!==museumSwipe.id)return;const x=e.clientX-museumSwipe.x,y=e.clientY-museumSwipe.y;museumSwipe=null;if(Math.abs(x)>42&&Math.abs(x)>Math.abs(y)*1.2)shiftMuseum(x<0?1:-1)});
screen.addEventListener('pointercancel',()=>museumSwipe=null);
screen.addEventListener('wheel',e=>{if(page!=='home'||!e.target.closest('.museum-display'))return;e.preventDefault();if(Math.abs(e.deltaY)<4&&Math.abs(e.deltaX)<4)return;if(Date.now()-lastMuseumWheel<85)return;lastMuseumWheel=Date.now();shiftMuseum((Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX)>0?1:-1)},{passive:false});
document.addEventListener('keydown',e=>{if(page==='home'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();shiftMuseum(e.key==='ArrowRight'?1:-1)}});
screen.addEventListener('change',e=>{if(e.target.id==='rounds')roundsChoice=Number(e.target.value)||3;else if(e.target.id==='drawingSeconds')drawingSecondsChoice=normalizedDuration(e.target.value)});
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
 const initialIdentityKnown=pocketIdentity!==null;
 const priorAccount=pocketIdentity?.id||null;
 pocketIdentity=await getPocketIdentity({force:true});
 if(net && initialIdentityKnown && priorAccount!==(pocketIdentity?.id||null)){
  home();
  notify('Аккаунт Pocket ID изменился — подключись к комнате заново');
  return;
 }
 if(prior===(pocketIdentity?.id||'')+':'+(pocketIdentity?.updatedAt||''))return;
 syncIdentity();
 screen.querySelectorAll('.home-pocket-identity strong,.entry-profile strong,.lobby-self strong').forEach(el=>el.textContent=gameName());
 if(page==='setup'){
  const field=screen.querySelector('#who');
  if(field){field.value=gameName();field.readOnly=isPocketMember()}
  const note=screen.querySelector('.entry-profile small');
  if(note)note.textContent=isPocketMember()?'Профиль Pocket ID':'Гостевой игрок · открыть Pocket ID';
 }

}
zamazkaCloud=createZamazkaCloud({
 getArchive:()=>saved,
 setArchive(items){
  saved=items.map(normalizeArchiveEntry);
  void zamazkaStore.set('archive',saved).catch(()=>{try{localStorage.setItem(GALLERY_KEY,JSON.stringify(saved))}catch{}});
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
if(q.has('room')){
 setup('join');
 // A verified Pocket ID may enter a valid invitation without pressing Join again.
 // Guests keep the explicit name form, rather than silently creating an identity.
 void getPocketIdentity({force:true}).then(identity=>{
  if(identity?.complete&&page==='setup'&&invitedRoom&&q.get('room')===invitedRoom)
   void connect('join');
 }).catch(()=>{});
}
else if(savedRoom?.roomId&&savedRoom?.token){
 change('<section class="page center connecting-room"><span class="busy"></span><h2>Возвращаемся в зал…</h2><p class="hint">Восстанавливаем комнату.</p><button class="btn ghost wide" data-action="menu">Выйти</button></section>','connecting');
 void connect('resume');
}else home();
// Hydrate the local archive before cloud reconciliation to prevent lost works.
void Promise.all([
 zamazkaStore.migrate('archive',GALLERY_KEY),
 zamazkaStore.migrate('pending',SUBMIT_KEY),
 zamazkaStore.migrate('practice',PRACTICE_KEY)
]).then(([archive,pending,solo])=>{
 if(Array.isArray(archive)){
  const seen=new Set();
  saved=[...saved,...archive].filter(item=>{
   const k=[item.time,item.art,item.variation].join(':');
   if(seen.has(k))return false;seen.add(k);return true;
  }).sort((a,b)=>b.time-a.time).slice(0,96).map(normalizeArchiveEntry);
  if(page==='collection')collection();
  const count=screen.querySelector('.museum-footer [data-action="collection"] span');
  if(count)count.textContent=String(saved.length).padStart(2,'0');
 }
 if(!pendingSubmit&&pending?.room)pendingSubmit=pending;
 if(solo?.mine)storedPractice=solo;
 if(storedPractice&&page==='home'&&!screen.querySelector('[data-action="resume"]'))home(true);
}).catch(()=>{}).finally(()=>zamazkaCloud.start());
void refreshPocketBadge();
window.addEventListener('pageshow',()=>void refreshPocketBadge());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshPocketBadge()});
// Shared update manager owns service worker registration and activation.
