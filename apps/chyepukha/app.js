import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey,pocketAvatarMarkup,pocketPlayerBadge,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import {storageForTab,prepareSession,markActive,releaseActive} from './tab-session.js';
import {buildComicPrompt} from './comic-prompt.js';
import {createSoundscape} from './audio.js';
import {moderationStrip,moderationModal,candidateWaiting,pauseOverlay} from './moderation-view.js';
import {makeSubmission,outgoingPacket,validPending,isSafeReceipt,canRetry} from './submission-guard.js';
import {renderWaiting} from './waiting-view.js';
import {updateWaitingView} from './waiting-sync.js';
import {mayShowFinaleIntro} from './finale-state.js';
import {finaleCurtain} from './finale-intro.js';
import {renderWriting} from './writing-view.js';
import {screenSignature,transitionFor} from './editor-motion.js';
import {handoffCount,handoffWords,hasMinimumDraft} from './writer-flow.js';
import {readEditions,writeEditions,addFinishedEdition,removeEdition,storyText} from './story-library.js';
import {installScreenInspector,PREVIEW_PARAM} from './screen-inspector.js';
import {demoView} from './preview-data.js';
installMobileRuntime();
const PREVIEW_ID=new URLSearchParams(location.search).get(PREVIEW_PARAM);
const IS_PREVIEW=PREVIEW_ID!==null;
if(IS_PREVIEW)document.body.classList.add('chyepukha-preview');
const $=id=>document.getElementById(id);
const scene=$('scene'),network=$('network'),toastEl=$('toast');
const ORIGIN=location.origin+'/pocketnet',KEY='pocket-works:chyepukha:';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const read=(k,d='')=>{if(IS_PREVIEW)return d;try{return localStorage.getItem(KEY+k)??d}catch{return d}};
const save=(k,v)=>{if(IS_PREVIEW)return;try{localStorage.setItem(KEY+k,String(v))}catch{}};
const savedRoom=()=>{if(IS_PREVIEW||!identityReady)return '';try{const item=JSON.parse(storageForTab().getItem('pocket-net:'+ORIGIN)||'null');return item?.identityKey===sessionKey()?item.roomId||'':''}catch{return ''}};
const code=s=>{let x=String(s||'').trim();try{x=new URL(x).searchParams.get('room')||x}catch{}return /^(?:[a-f0-9]{8}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(x)?x.toLowerCase():''};
const words=s=>String(s||'').trim().split(/\s+/u).filter(Boolean);
const GENRE_TONES={"Приземлена драма":"Правдоподібні мотиви й наслідки.","Абсурдна комедія":"Смішна нісенітниця з внутрішньою логікою.","Горор":"Напруга й поступове відчуття загрози.","Нуарний детектив":"Підозри, тіні й моральна двозначність.","Романтична мелодрама":"Почуття, бажання й стосунки.","Фентезійна епіка":"Дивний світ, чудеса й масштаб.","Науково-фантастична параноя":"Технології, невідомість і недовіра.","Кіберпанк":"Контроль, технології й соціальна напруга.","Затишна дивина":"Незвична буденність без зайвої жорстокості.","Постапокаліпсис":"Виживання, нестача ресурсів, вибір.","Міф і легенда":"Символи, доля, обіцянки.","Сатира":"Висміювання звичаїв, правил і влади."};
const GENDERS=[['male','Чоловік'],['female','Жінка'],['nonbinary','Інше'],['unspecified','Неважливо']];
let net=null,view=null,me='',room='',roomVersion='v4',connected=false,connecting=false,notice='';
let name=(IS_PREVIEW?'':storageForTab().getItem(KEY+'tab-name'))||read('name',''),invitation=new URLSearchParams(location.search).get('room')||'',draftSelections={},storyId='',modal='',effectsEnabled=read('sound','off')==='on',musicEnabled=read('music','off')==='on',effectsVolume=Number(read('effectsVolume','.45')),musicVolume=Number(read('musicVolume','.22'));
const soundscape=createSoundscape();soundscape.config({effectsEnabled,musicEnabled,effectsLevel:effectsVolume,musicLevel:musicVolume});
let previewDraft='',previewEditions=[],previewWriterMeta={step:'draft',anchor:'',gender:'unspecified'};let readerMode='full',comicSource=null;
let archiveOpen=false,archiveEditionId='',archiveStoryId='',archivePendingDelete='';
let lastScreenSignature='',finaleIntroActive=false,roomJoinedOnSocket=false,modTarget='',modAction='';
let pocketIdentity=null,identityReady=false,netHealth='checking',netHealthConfirmedAt=0,identityRefresh=0,connectionAttempt=0,roomTimeout=null;
const member=()=>Boolean(pocketIdentity?.complete&&pocketIdentity?.nickname);
const playerName=()=>preferredPocketName(pocketIdentity,name.trim());
// Legacy v1 guest sessions used this key. Preserve them across the account-aware upgrade.
const sessionKey=()=>member()?pocketIdentitySessionKey(pocketIdentity):'chyepukha-1';
const archiveKey=()=>KEY+'archive:'+(member()?sessionKey():'guest:'+name.trim().toLocaleLowerCase());
function editions(){if(IS_PREVIEW)return previewEditions;if(!identityReady)return [];try{return readEditions(localStorage,archiveKey())}catch{return []}}
function archiveSelection(){const all=editions(),edition=all.find(x=>x.id===archiveEditionId)||all[0];return {all,edition,story:edition?.stories.find(x=>x.id===archiveStoryId)||edition?.stories[0]}}
function keepFinished(v){
 if(IS_PREVIEW||!identityReady||!room||v.phase!=='finished')return;
 const old=editions(),next=addFinishedEdition(old,room,v);
 if(next.length===old.length&&next.every((x,i)=>x.id===old[i].id))return;
 try{if(writeEditions(localStorage,archiveKey(),next))toast('Рукописи збережено на цьому пристрої.');
 else toast('Не вдалося зберегти архів. Скопіюй історії перед виходом.')}
 catch{toast('Немає доступу до локального архіву.')}
}
const portrait=()=>pocketAvatarMarkup(pocketIdentity?.artwork||pocketIdentity?.avatar,{accountId:pocketIdentity?.id||''});
const draftKey=()=>KEY+'draft:'+sessionKey()+':'+room+':'+(view?.round??0)+':'+(view?.sheet?.id||'');
const loadDraft=()=>{if(IS_PREVIEW)return previewDraft;try{return localStorage.getItem(draftKey())||''}catch{return ''}};
const saveDraft=x=>{if(IS_PREVIEW){previewDraft=x;return}try{localStorage.setItem(draftKey(),x)}catch{}};
const writerMetaKey=()=>draftKey()+':editor';
function readWriterMeta(){
 if(IS_PREVIEW)return previewWriterMeta;
 try{const v=JSON.parse(localStorage.getItem(writerMetaKey())||'null');
  if(v&&typeof v==='object')return {step:v.step==='select'?'select':'draft',anchor:String(v.anchor||'').slice(0,72),gender:String(v.gender||'unspecified'),selection:Array.isArray(v.selection)?v.selection.filter(Number.isInteger):[]};
 }catch{}
 return {step:'draft',anchor:'',gender:read('gender','unspecified'),selection:[]};
}
function saveWriterMeta(patch){
 const value={...readWriterMeta(),...patch};
 if(IS_PREVIEW){previewWriterMeta=value;return value}
 try{localStorage.setItem(writerMetaKey(),JSON.stringify(value))}catch{}
 return value;
}
const pendingStorageKey=()=>KEY+'submit:'+sessionKey()+':'+room;
function readPending(){
 if(IS_PREVIEW)return null;
 try{const v=JSON.parse(localStorage.getItem(pendingStorageKey())||'null');return validPending(v)?v:null}
 catch{return null}
}
function savePending(record){if(IS_PREVIEW)return true;try{localStorage.setItem(pendingStorageKey(),JSON.stringify(record));return true}catch{toast('Не вдалося зберегти відправку на цьому пристрої.');return false}}
function discardPending(){if(IS_PREVIEW)return;try{localStorage.removeItem(pendingStorageKey())}catch{}}
function acknowledgeReceipt(receipt){
 const p=readPending();
 if(!['v5','v6'].includes(roomVersion)||!isSafeReceipt(receipt,p))return false;
 try{localStorage.removeItem(p.draftStorageKey);localStorage.removeItem(p.draftStorageKey+':editor');localStorage.removeItem(pendingStorageKey())}catch{}
 delete draftSelections[p.draftStorageKey];
 return true;
}
function retryPending(){
 const p=readPending();
 if(!['v5','v6'].includes(roomVersion)||!p||!canRetry(p,view)||!connected||!net?.roomId)return false;
 return send(outgoingPacket(p));
}
const clearDraft=()=>{if(IS_PREVIEW){previewDraft='';previewWriterMeta={step:'draft',anchor:'',gender:'unspecified'};return}try{localStorage.removeItem(draftKey());localStorage.removeItem(writerMetaKey())}catch{}};
function toast(x){toastEl.textContent=String(x);toastEl.classList.add('show');clearTimeout(toastEl.timer);toastEl.timer=setTimeout(()=>toastEl.classList.remove('show'),3200)}
function tick(f=580){soundscape.fx(f>=750?'reveal':f>=680?'turn':f>=620?'word':f<500?'seal':'tap')}
function netStatus(){
 const status=IS_PREVIEW?'DEMO':connected?'ONLINE':connecting?'CONNECTING':netHealth==='online'?'ONLINE':netHealth==='checking'?'CHECKING':'OFFLINE';
 network.textContent='POCKETNET · '+status;
 network.classList.toggle('online',status==='ONLINE');
 network.classList.toggle('offline',status==='OFFLINE');
 network.setAttribute('aria-label',status==='ONLINE'?'Онлайн-сервер доступний':status==='OFFLINE'?'Інтернет-з’єднання недоступне':'Перевіряємо підключення');
}
function syncIdentityBar(){
 const button=$('profileBtn');if(!button)return;
 button.innerHTML=portrait()+'<span class="rail-user">'+escape(member()?pocketIdentity.nickname:identityReady?'Гість':'Профіль…')+'</span>';
 button.title=member()?'Профіль '+pocketIdentity.nickname:'Увійти в Pocket ID';
}
async function probeNetwork(){
 if(IS_PREVIEW)return;
 try{
  const reply=await fetch(ORIGIN+'/health',{cache:'no-store',signal:AbortSignal.timeout(6500)});
  const json=reply.ok?await reply.json():null;
  netHealth=reply.ok&&json?.ok!==false&&(!Array.isArray(json?.modules)||json.modules.includes('chyepukha'))?'online':'offline';
  if(netHealth==='online')netHealthConfirmedAt=Date.now();
 }catch{netHealth='offline'}
 netStatus();if(!view&&!connecting)render();
}
async function refreshPocketBadge(initial=false){
 if(IS_PREVIEW)return;
 const seq=++identityRefresh,wasKnown=identityReady;
 const before=wasKnown?pocketIdentitySessionKey(pocketIdentity):null;
 let next=await getPocketIdentity({force:true});
 // Distinguish a real logout from a transient Pocket ID portrait/profile failure.
 // WebKit can time out a forced shared-identity refresh even when /me itself is healthy.
 if(!next){
  try{
   const response=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(4500)});
   if(response.ok){const payload=await response.json();next=payload.user?.id?payload.user:null}
   else if(wasKnown&&member())return;
  }catch{if(wasKnown&&member())return}
 }
 if(seq!==identityRefresh)return;
 const after=pocketIdentitySessionKey(next);
 if(before!==null&&before!==after){
  ++connectionAttempt;clearRoomTimeout();
  net?.close();net=null;releaseActive();
  try{storageForTab().removeItem('pocket-net:'+ORIGIN)}catch{}
  const hadRoom=Boolean(view||room);view=null;me='';room='';connected=false;connecting=false;modal='';storyId='';archiveOpen=false;archiveEditionId='';archiveStoryId='';
  if(hadRoom){notice='Pocket ID змінився. Підключися до кімнати з новим профілем.';syncUrl();toast(notice)}
 }
 pocketIdentity=next;identityReady=true;
 if(member())name=pocketIdentity.nickname;
 syncIdentityBar();
 if(!view&&!connecting)render();else netStatus();
 if(initial){
  if(savedRoom())void connect('resume');
  else if(member()&&code(invitation))void connect('join');
 }
}
function clearRoomTimeout(){if(roomTimeout!==null){clearTimeout(roomTimeout);roomTimeout=null}}
function cancelConnection({preserveRoom=false}={}){
 ++connectionAttempt;clearRoomTimeout();releaseActive();
 const c=net;net=null;
 if(c){if(!preserveRoom)c.roomId=null;c.persist();c.close()}
 connected=false;connecting=false;view=null;room='';me='';modal='';storyId='';
 notice='';syncUrl();render();
}
async function openPocketInvites(){
 if(IS_PREVIEW){toast('Тестове запрошення друзів.');return}
 if(!member()||!room){toast('Увійди в Pocket ID та відкрий кімнату.');return}
 if(!window.PocketSocial?.open)try{await import('../../shared/pocket-social.js')}catch{}
 if(window.PocketSocial?.open)void window.PocketSocial.open(room,'chyepukha');
 else toast('Не вдалося відкрити друзів. Скопіюй посилання на кімнату.');
}
async function openPocketProfile(){
 if(IS_PREVIEW){toast('Тестовий профіль.');return}
 if(!member()){location.assign('/?pocket-id=login');return}
 if(!window.PocketSocial?.open){
  try{await import('../../shared/pocket-social.js')}catch{}
 }
 if(window.PocketSocial?.open)void window.PocketSocial.open();
 else location.assign(pocketIdProfileUrl);
}
function syncUrl(){if(IS_PREVIEW)return;const u=new URL(location.href);if(room)u.searchParams.set('room',room.slice(0,8));else u.searchParams.delete('room');history.replaceState({},'',u)}
function copyText(t){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(t).then(()=>toast('Скопійовано.')).catch(()=>fallbackCopy(t));return fallbackCopy(t)}
function fallbackCopy(t){const x=document.createElement('textarea');x.value=t;x.style.position='fixed';x.style.opacity='0';document.body.append(x);x.select();try{document.execCommand('copy');toast('Скопійовано.')}catch{toast('Копіювання недоступне.')}x.remove()}
function send(payload){if(IS_PREVIEW)return demoSend(payload);if(!connected||!net?.roomId){toast('Немає зв’язку. Дочекайся відновлення.');return false}try{net.sendGame(payload);return true}catch{toast('Не вдалося надіслати.');return false}}
function demoSend(payload){
 if(!connected){toast('Тестовий стан: PocketNet офлайн.');return false}
 if(!view)return false;
 if(payload.type==='sync')return true;
 if(payload.type==='settings'){
  view={...view,settings:{...view.settings,...payload.settings},revision:view.revision+1};
  render();toast('Тестові правила збережено.');return true;
 }
 if(payload.type==='start'||payload.type==='again'){
  const d=demoView('writing-first');
  view={...d.view,settings:view.settings,players:view.players.length>=2?view.players:demoView('lobby-ready').view.players};
  me='qa-host';previewDraft='';previewWriterMeta={step:'draft',anchor:'',gender:'unspecified',selection:[]};modal='';render();return true;
 }
 if(roomVersion==='v6'&&payload.type==='pause'){view={...view,paused:true,revision:view.revision+1};render();return true}
 if(roomVersion==='v6'&&payload.type==='resume'){view={...view,paused:false,revision:view.revision+1};render();return true}
 if(roomVersion==='v6'&&payload.type==='transfer_host'){view={...view,host:payload.targetId,revision:view.revision+1};render();return true}
 if(roomVersion==='v6'&&payload.type==='kick'){view={...view,players:view.players.map(p=>p.id===payload.targetId?{...p,vacant:true,departed:true}:p),revision:view.revision+1};render();return true}
 if(roomVersion==='v6'&&payload.type==='skip_seat'){view={...view,players:view.players.map(p=>p.id===payload.targetId?{...p,autoSkip:true}:p),revision:view.revision+1};render();return true}
 if(roomVersion==='v6'&&payload.type==='assign_seat'){const candidate=view.waitlist.find(p=>p.id===payload.candidateId);if(candidate){view={...view,players:view.players.map(p=>p.id===payload.seatId?{...p,id:candidate.id,name:candidate.name,vacant:false,departed:false}:p),waitlist:view.waitlist.filter(p=>p.id!==candidate.id),revision:view.revision+1};render();return true}}
 if(roomVersion==='v6'&&payload.type==='host_vote'){toast('Тестове голосування прийнято.');return true}
 if(payload.type==='submit'&&view.phase==='writing'&&!view.waiting){
  view={...view,waiting:true,players:view.players.map(p=>p.id===me?{...p,submitted:true}:p)};
  clearDraft();render();return true;
 }
 toast('Дія недоступна у тестовій кімнаті.');return false;
}
async function connect(how,settings){
 if(IS_PREVIEW){const d=demoView('lobby-ready');view=d.view;me=d.me;room=d.room;connected=true;connecting=false;notice='';render();return}
 if(connecting)return;
 const ticket=++connectionAttempt;
 if(!identityReady)await refreshPocketBadge(false);
 if(ticket!==connectionAttempt)return;
 // Identity is already hydrated. PocketNet itself verifies the current HttpOnly
 // cookie on session creation and WebSocket auth, preventing stale-account access.
 const nick=(member()?pocketIdentity.nickname:name.trim()).slice(0,24);
 if(!nick){toast('Вкажи ім’я.');return}
 if(!member()){name=nick;save('name',nick);try{storageForTab().setItem(KEY+'tab-name',nick)}catch{}}
 if(how==='join'&&!code(invitation)){toast('Вкажи правильний код кімнати.');return}
 if(how==='resume'&&!savedRoom()){toast('Збережена кімната для цього профілю недоступна.');return}
 if(net){net.close();net=null;releaseActive()}
 roomJoinedOnSocket=false;connected=false;connecting=true;notice='';render();
 try{
  // Avoid two adjacent checks of the same Edge endpoint. WebKit service workers
  // can deliver a stale offline response on the second GET despite a healthy session.
  // PocketNet /session and /ws remain the authoritative connectivity checks.
  if(netHealth!=='online'||Date.now()-netHealthConfirmedAt>20000){
   const health=await fetch(ORIGIN+'/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
   const info=health.ok?await health.json():null;
   if(!health.ok||!info?.ok||!info.modules?.includes('chyepukha'))throw Error('Онлайн-кімнати тимчасово недоступні.');
   netHealthConfirmedAt=Date.now();
  }
  netHealth='online';netStatus();
  const storage=await prepareSession(ORIGIN,nick,sessionKey());
  if(ticket!==connectionAttempt)return;
  const c=new PocketNet({serverUrl:ORIGIN,name:nick,storage,identityKey:sessionKey()});
  net=c;
  if(how!=='resume'){c.roomId=null;c.persist()}
  c.on('connected',v=>{if(net!==c)return;me=v.player?.id||'';connected=true;connecting=false;markActive(ORIGIN,c.token);netStatus();if(roomJoinedOnSocket)retryPending()});
  c.on('room_joined',v=>{
   if(net!==c)return;
   clearRoomTimeout();
   if(v.gameId!=='chyepukha'||!['v1','v2','v3','v4','v5','v6'].includes(v.version)||v.state?.protocol!==1){
    notice='Несумісна версія кімнати. Створи нову.';try{c.leaveRoom()}catch{}
    room='';view=null;render();return;
   }
   room=v.roomId;roomVersion=v.version;roomJoinedOnSocket=true;syncUrl();apply(v.state);send({type:'sync'});if(['v5','v6'].includes(roomVersion))retryPending();
  });
  c.on('game_event',v=>{if(net!==c)return;if(v.event?.type==='state')apply(v.event.payload);
   else if(v.event?.type==='receipt')acknowledgeReceipt(v.event.payload);
   else if(v.event?.type==='submission_rejected'){if(['v5','v6'].includes(roomVersion)&&readPending()?.requestId===v.event.payload?.requestId){discardPending();render()}toast(v.event.payload?.reason||'Відповідь не прийнято.')}
   else if(v.event?.type==='notice')toast(v.event.payload)});
  c.on('presence',()=>{if(net===c&&room&&connected)send({type:'sync'})});
  c.on('disconnected',()=>{if(net!==c)return;roomJoinedOnSocket=false;connected=false;connecting=true;netStatus()});
  c.on('room_kicked',()=>{if(net!==c)return;room='';view=null;connected=false;connecting=false;modTarget='';modal='';notice='Ведучий виключив тебе з кімнати.';syncUrl();render();});
  c.on('room_closed',()=>{if(net!==c)return;room='';view=null;connected=false;connecting=false;syncUrl();notice='Кімнату закрито.';render()});
  c.on('error',e=>{
   if(net!==c)return;connecting=false;clearRoomTimeout();
   const labels={room_not_found:'Кімната не існує або вже закрита.',room_full:'Усі місця зайняті.',match_in_progress:'Гра вже почалася.',room_version_unavailable:'Версія кімнати недоступна.',account_already_in_room:'Цей Pocket ID уже є в кімнаті.',server_at_capacity:'Сервер заповнений.',rate_limited:'Зачекай перед наступною дією.'};
   notice=labels[e?.code]||('Помилка підключення: '+String(e?.code||e?.message||'невідома'));
   if(!view){room='';c.close();net=null;releaseActive();connected=false;render()}
   toast(notice);
  });
  let authTimeout;
  try{
   await Promise.race([
    c.connect(),
    new Promise((_,reject)=>{authTimeout=setTimeout(()=>reject(Error('Сервер не підтвердив з’єднання.')),15000)})
   ]);
  }finally{clearTimeout(authTimeout)}
  if(net!==c||ticket!==connectionAttempt)return;
  if(how==='create')c.createRoom('chyepukha',{settings});
  else if(how==='join')c.joinRoom(code(invitation));
  else if(how==='resume'&&!c.roomId)throw Error('Попередню кімнату не знайдено.');
  roomTimeout=setTimeout(()=>{
   if(net!==c||ticket!==connectionAttempt||room)return;
   cancelConnection({preserveRoom:how==='resume'});
   notice='Сервер не відкрив кімнату. Перевір з’єднання й спробуй ще раз.';
   render();toast(notice);
  },12000);
 }catch(error){
  if(ticket!==connectionAttempt)return;
  clearRoomTimeout();net?.close();net=null;releaseActive();connected=false;connecting=false;
  netHealth='offline';view=null;
  notice='Не вдалося підключитися: '+String(error.message||error);render();toast(notice);
 }
}
function apply(v){if(!v||v.protocol!==1||!Array.isArray(v.players))return;
 if(view&&v.revision<view.revision)return;
 if(v.phase==='finished'&&Array.isArray(v.stories))v={...v,stories:v.stories.map(st=>({...st,text:st.fragments.map(f=>f.answer).join('\n\n')}))};
 if(['v5','v6'].includes(roomVersion))acknowledgeReceipt(v.lastReceipt);
  const prev=view;const changedModeration=roomVersion==='v6'&&prev&&(prev.paused!==v.paused||prev.host!==v.host||prev.waitingApproval!==v.waitingApproval||prev.hostOfflineSince!==v.hostOfflineSince||JSON.stringify(prev.onlineIds)!==JSON.stringify(v.onlineIds)||JSON.stringify(prev.waitlist)!==JSON.stringify(v.waitlist)||prev.players?.some((p,i)=>p.id!==v.players[i]?.id||p.vacant!==v.players[i]?.vacant||p.autoSkip!==v.players[i]?.autoSkip));
  const waitingSame=prev?.phase==='writing'&&v.phase==='writing'&&prev.waiting&&v.waiting&&prev.round===v.round;
 if(mayShowFinaleIntro(prev?.phase,v.phase,Array.isArray(v.stories)&&v.stories.length>0)&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)finaleIntroActive=true;
 const same=prev?.phase==='writing'&&v.phase==='writing'&&!prev.waiting&&!v.waiting&&prev.round===v.round&&prev.sheet?.id===v.sheet?.id;
 if(prev?.phase==='writing'&&!prev.waiting&&v.waiting&&!['v5','v6'].includes(roomVersion))clearDraft();
 view=v;soundscape.setScene(v.phase==='lobby'?'lobby':v.phase==='writing'?'writing':'finished');if(prev?.phase!==v.phase&&v.phase==='finished')soundscape.fx('reveal');if(v.phase==='finished')keepFinished(v);if(prev?.round!==v.round&&prev?.phase==='writing')tick(690);
 if(!changedModeration&&waitingSame&&updateWaitingView(scene.querySelector('.dispatch-room'),prev,v,{sound:type=>soundscape.fx(type)}))return;
 if(!changedModeration&&same){const el=$('sideRoster');if(el)el.innerHTML=rosterCompact();const progress=$('turnProgress');if(progress){const next=document.createElement('div');next.innerHTML=turnProgress();progress.replaceWith(next.firstElementChild)}return}
 render();
}
function mark(){return '<svg viewBox="0 0 200 230" aria-hidden="true"><path d="M78 14c-44 2-43 40-24 65-39 30-29 74 9 91 49 19 105-27 85-68-8-20-30-29-48-24 22-33 5-66-22-64Z" stroke="#975941" fill="none" stroke-width="5"/><path d="M70 75c5-22 27-16 30 0m22 0c12-15 28-2 26 13M74 129c23 25 48 22 66 0M83 189l-29 32m67-38 35 25M27 66l16-7m113 93 23 9" stroke="#975941" fill="none" stroke-width="5" stroke-linecap="round"/></svg>'}
function home(){
 const logged=member(),ready=identityReady;
 const identityTile='<div class="home-identity '+(logged?'is-member':'is-guest')+'"><span class="home-identity-art">'+portrait()+'</span><div><small>'+(logged?'POCKET ID · ПІДТВЕРДЖЕНО':ready?'ГОСТЬОВИЙ РЕЖИМ':'ПЕРЕВІРЯЄМО ПРОФІЛЬ')+'</small><strong>'+escape(logged?pocketIdentity.nickname:ready?'Твій профіль':'З’єднуємося…')+'</strong></div><button type="button" data-act="profile" class="identity-open">'+(logged?'Профіль ↗':'Увійти ↗')+'</button></div>';
 const field='<label class="guest-name"><span class="field-label">Ім’я автора</span><input id="guestNick" class="field" name="name" autocomplete="nickname" maxlength="24" placeholder="Як тебе звати?" value="'+escape(name)+'"></label>';
 const hold=ready?'':' disabled';
 return '<div class="home home-edition"><section class="paper home-cover"><div class="home-binding" aria-hidden="true"></div><div class="eyebrow">ВИДАВНИЦТВО НЕЙМОВІРНИХ ПРИГОД</div><h1>ЧЕПУХА<span class="home-period">.</span></h1><p class="lead">Одна історія. Кілька авторів. Ніхто не знає, що було до нього.</p><div class="home-sketch">'+mark()+'<span class="sketch-seal" aria-hidden="true">ЦІЛКОМ ТАЄМНО</span></div><div class="home-colophon"><span>№ 01 / НЕЗАКІНЧЕНІ ІСТОРІЇ</span><span>2–8 АВТОРІВ</span></div></section><div class="home-entry">'+identityTile+(logged?'':field)+'<section class="slip slip-create"><div class="slip-index">01 / ВІДКРИТИ ІСТОРІЮ</div><h3>Нова кімната</h3><form id="createForm"><button class="button" type="submit"'+hold+'>Створити кімнату <span>↗</span></button></form></section><section class="slip slip-join"><div class="slip-index">02 / ДОЄДНАТИСЯ</div><h3>Вже є код?</h3><form id="joinForm"><label><span class="field-label">Код або посилання</span><input class="field" name="room" autocomplete="off" spellcheck="false" placeholder="8 символів" required value="'+escape(invitation)+'"></label><button class="button outline" type="submit"'+hold+'>Приєднатися <span>↗</span></button></form></section>'+(savedRoom()?'<button class="return-ticket" type="button" data-act="resume">Повернутися до кімнати <span>↗</span></button>':'')+'<button class="archive-ticket" type="button" data-act="archive"><span>Архів рукописів <small>Збережено на пристрої</small></span><b>'+editions().length+' →</b></button>'+(notice?'<p class="warning home-warning">'+escape(notice)+'</p>':'')+'</div></div>';
}
function archiveScreen(){
 const {all,edition,story}=archiveSelection();
 const back='<button class="button outline small archive-back" type="button" data-act="archive-back">← До меню</button>';
 const heading='<header class="archive-heading"><div><div class="eyebrow">ПРИВАТНА ПОЛИЦЯ</div><h2>Архів рукописів</h2><p class="mini">Лише на цьому пристрої · '+all.length+' видань</p></div>'+back+'</header>';
 if(!edition)return '<div class="archive-page">'+heading+'<section class="paper archive-empty"><div class="eyebrow">ПОЛИЦЯ ПОКИ ПОРОЖНЯ</div><h3>Спочатку створіть історію</h3><p class="lead">Завершені партії з’являються тут автоматично. Тексти лишаються на цьому пристрої, не в хмарі.</p><button class="button" type="button" data-act="archive-back">Повернутися до гри →</button></section></div>';
 archiveEditionId=edition.id;archiveStoryId=story?.id||'';
 const date=new Date(edition.savedAt).toLocaleDateString('uk-UA',{day:'2-digit',month:'short',year:'numeric'});
 const episodes=edition.stories.map((x,i)=>'<button type="button" class="archive-tab '+(x.id===story.id?'is-active':'')+'" data-act="archive-story" data-id="'+escape(x.id)+'">'+String(i+1).padStart(2,'0')+' · '+escape(x.starter)+'</button>').join('');
 const fragments=story.fragments.map((f,i)=>'<details class="fragment"><summary>№ '+(i+1)+' · '+escape(f.author)+' · '+escape(f.question)+'</summary><p>'+escape(f.answer)+'</p></details>').join('');
 return '<div class="archive-page">'+heading+'<div class="results archive-layout"><nav class="chapters archive-editions"><h3>Видання</h3>'+all.map((item,i)=>'<button type="button" class="chapter '+(item.id===edition.id?'active':'')+'" data-act="archive-edition" data-id="'+escape(item.id)+'"><small>№ '+String(all.length-i).padStart(2,'0')+' · '+new Date(item.savedAt).toLocaleDateString('uk-UA')+'</small>'+item.stories.length+' історій · '+item.playerCount+' авторів</button>').join('')+'</nav><article class="paper story-paper archive-manuscript"><div class="progress"><span class="eyebrow">ЗБЕРЕЖЕНЕ ВИДАННЯ</span><span class="mini">'+date+'</span></div><h3>Історія '+escape(story.starter)+'</h3><p class="mini">'+escape(story.setLabel)+' · '+escape(story.genre)+'</p><div class="archive-tabs">'+episodes+'</div><div class="content"><div class="story-text">'+escape(storyText(story))+'</div><details class="archive-credits"><summary>Автори фрагментів</summary>'+fragments+'</details></div><div class="button-row"><button type="button" class="button outline small" data-act="archive-copy">Копіювати текст</button><button type="button" class="button small" data-act="archive-comic">Комікс через ChatGPT ↗</button></div><button class="leave archive-delete" type="button" data-act="archive-ask-delete">Видалити це видання</button></article></div></div>';
}
function opts(arr,id){return arr.map(x=>'<option value="'+escape(x.id)+'" '+(id===x.id?'selected':'')+'>'+escape(x.label)+'</option>').join('')}
function settingsForm(s){return '<form class="settings" id="settingsForm"><div class="two"><label><span class="field-label">Максимум гравців</span><select class="field" name="maxPlayers">'+[2,3,4,5,6,7,8].map(n=>'<option value="'+n+'" '+(n===s.maxPlayers?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label><span class="field-label">Передати слів</span><select class="field" name="visibleTailWords">'+[0,1,2,3,4,5,6,8,10,12].map(n=>'<option value="'+n+'" '+(n===s.visibleTailWords?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><label><span class="field-label">Сюжетний набір</span><select class="field" name="questionSet" id="questionSet">'+opts([...view.questionSets,{id:'random',label:'Випадковий'},{id:'perSheetRandom',label:'Різний для кожної історії'},{id:'custom',label:'Свої питання'}],s.questionSet)+'</select></label><label class="'+(s.questionSet==='custom'?'':'hidden')+'" id="customField"><span class="field-label">Свої питання (по одному на рядок)</span><textarea class="field" name="customQuestions" rows="4">'+escape(s.customQuestions?.join('\n')||'')+'</textarea></label><label><span class="field-label">Жанр</span><select class="field" name="genre" id="genre">'+opts([...view.genres,{id:'random',label:'Випадковий'},{id:'perSheetRandom',label:'Різний для кожної історії'},{id:'custom',label:'Свій жанр'}],s.genre)+'</select></label><label class="'+(s.genre==='custom'?'':'hidden')+'" id="customGenreField"><span class="field-label">Свій жанр</span><input class="field" name="customGenre" maxlength="60" value="'+escape(s.customGenre||'')+'"></label>'+(roomVersion==='v4'?'<label class="show-next"><input type="checkbox" name="showNextQuestion" '+(s.showNextQuestion!==false?'checked':'')+'> Показувати наступне питання при виборі слів</label>':'')+'<button class="button outline small" type="submit">Зберегти правила</button></form>'}
function roster(){return view.players.map((p,i)=>'<div class="person"><b class="person-index">'+String(i+1).padStart(2,'0')+'</b><span class="person-portrait">'+(p.verified&&p.accountId?pocketAvatarMarkup(p.avatar,{accountId:p.accountId}):'<span class="guest-monogram">'+escape(p.name?.charAt(0)?.toLocaleUpperCase()||'?')+'</span>')+'</span><strong>'+escape(p.name)+'</strong>'+(p.verified?pocketPlayerBadge(p,{showGuest:false}):'')+'<small>'+(p.id===view.host?'ВЕДУЧИЙ':view.phase==='writing'?(p.submitted?'ГОТОВО':p.departed?'ВІДСУТНІЙ':'ПИШЕ'):'АВТОР')+'</small></div>').join('')}
function rosterCompact(){return view.players.map(p=>'<div class="status"><span>'+escape(p.name)+(p.verified?pocketPlayerBadge(p,{showGuest:false}):'')+'</span><b>'+(p.submitted?'✓':p.departed?'×':'…')+'</b></div>').join('')}
function turnProgress(){
 const ready=view.players.filter(p=>p.submitted).length,total=view.players.length;
 return '<div class="turn-progress" id="turnProgress" aria-label="Готові фрагменти: '+ready+' із '+total+'"><div class="turn-progress-count"><strong>'+ready+' / '+total+'</strong><span>готово</span></div><div class="turn-progress-authors">'+view.players.map(p=>'<span class="turn-progress-author '+(p.submitted?'is-ready':'')+'" title="'+escape(p.name)+' — '+(p.submitted?'готово':'пише')+'"><i aria-hidden="true">'+(p.submitted?'✓':'·')+'</i><span>'+escape(p.name)+'</span></span>').join('')+'</div></div>';
}
function lobby(){const host=view.host===me,s=view.settings;return '<div class="room"><section class="paper"><div class="eyebrow">ЗБІР АВТОРІВ</div><h2>Чекаємо на хаос</h2><div class="mini">Код кімнати</div><div class="code">'+room.slice(0,8).toUpperCase()+'</div><div class="button-row"><button class="button outline small" data-act="copy-code">Копіювати код</button><button class="button outline small" data-act="copy-link">Посилання друзям</button></div><div class="roster">'+roster()+'</div>'+(member()?'<button type="button" class="invite-people" data-act="invite-social" data-social-invite>Запросити друзів із Pocket ID <span>↗</span></button>':'')+'<p class="mini">'+view.players.length+'/'+s.maxPlayers+' учасників. '+(view.players.length===s.maxPlayers?'Усі місця заповнено.':'Почати можна від двох авторів.')+'</p>'+(host?'<button class="button" data-act="start" '+(view.players.length<2?'disabled':'')+'>Почати писати <span>→</span></button>':'<p class="mini">Ведучий почне, коли всі зберуться.</p>')+(view.message?'<p class="warning">'+escape(view.message)+'</p>':'')+'<button class="leave" data-act="leave">Залишити кімнату</button></section><aside class="room-aside"><div class="eyebrow">ПРАВИЛА РЕДАКЦІЇ</div><h3>Аркуші підуть по колу</h3><p class="lobby-hint">У кожному раунді ти пишеш свою частину. Наступний автор побачить лише кілька обраних тобою слів. У фіналі історії відкриються повністю.</p>'+(host?settingsForm(s):'<p class="mini">Жанр і питання визначає ведучий. Ніхто не бачить приховані фрагменти.</p>')+'</aside></div>'}
function writing(){return renderWriting({view,roomVersion,draft:loadDraft(),meta:readWriterMeta(),chosen:indices(),pending:['v5','v6'].includes(roomVersion)&&Boolean(readPending()),escape,rosterCompact,turnProgress,genres:GENRE_TONES,genders:GENDERS})}
function waiting(){return renderWaiting({players:view?.players||[],myId:me,escape,round:view?.round||0,totalRounds:view?.total||0})}
function results(){
 if(!view.stories?.length)return waiting();
 const st=view.stories.find(s=>s.id===storyId)||view.stories[0];storyId=st.id;const pos=view.stories.findIndex(x=>x.id===st.id);
 const nav='<nav class="chapters"><h3>Рукописи</h3>'+view.stories.map((s,i)=>'<button class="chapter '+(s.id===st.id?'active':'')+'" data-act="story" data-id="'+escape(s.id)+'"><small>ІСТОРІЯ '+String(i+1).padStart(2,'0')+'</small>'+escape(s.starter)+'</button>').join('')+'</nav>';
 const body=readerMode==='parts'?'<div class="reader-parts">'+st.fragments.map((f,i)=>'<section class="reader-fragment"><div class="reader-fragment-meta">РОЗДІЛ '+String(i+1).padStart(2,'0')+' · '+escape(f.author)+'</div><h3>'+escape(f.question)+'</h3><p>'+escape(f.answer)+'</p></section>').join('')+'</div>':'<div class="story-text reader-prose selectable-content">'+escape(st.text)+'</div>';
 return '<div class="results reader-layout">'+nav+'<article class="paper story-paper"><div class="progress"><span class="eyebrow">ФІНАЛЬНЕ РОЗКРИТТЯ</span><span class="stamp">ГОТОВО</span></div><div class="reader-top"><div><div class="story-pager" aria-label="Перемикання історій"><button type="button" data-act="prev-story" aria-label="Попередня історія">←</button><strong>Історія '+(pos+1)+' / '+view.stories.length+'</strong><button type="button" data-act="next-story" aria-label="Наступна історія">→</button></div><h2>Історія '+escape(st.starter)+'</h2><p class="mini">'+escape(st.setLabel)+' · '+escape(st.genre)+'</p></div><div class="reader-switch" role="group" aria-label="Режим читання"><button type="button" data-act="reader-full" aria-pressed="'+(readerMode==='full')+'" class="'+(readerMode==='full'?'active':'')+'">Текст</button><button type="button" data-act="reader-parts" aria-pressed="'+(readerMode==='parts')+'" class="'+(readerMode==='parts'?'active':'')+'">Автори</button></div></div><div class="content reader-scroll" tabindex="0" aria-label="Текст історії">'+body+'</div><div class="button-row reader-actions"><button class="button outline small" data-act="copy-story">Копіювати текст</button><button class="button small" data-act="comic">Комікс через ChatGPT ↗</button></div><div class="reader-footer">'+(view.host===me?'<button class="leave" data-act="again">Нова партія</button>':'<span class="mini">Ведучий може запустити нову партію.</span>')+'<button class="leave" data-act="leave">Вийти до меню</button></div></article></div>'+(finaleIntroActive?finaleCurtain({count:view.stories.length}):'');
}
function overlay(){
  if(modal==='moderation'&&roomVersion==='v6'&&view)return moderationModal(view,me,modTarget);
  if(modal==='mod-confirm'&&roomVersion==='v6'&&view){const action=modAction==='kick'?'виключити автора':'пропускати незавершені фрагменти';return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner"><div class="eyebrow">ПІДТВЕРДЖЕННЯ</div><h3>Підтвердити дію?</h3><p>Ти збираєшся '+action+'. Уже здані частини залишаться збереженими.</p><div class="button-row"><button class="button outline" data-act="mod-open">Скасувати</button><button class="button" data-act="mod-confirm">Підтвердити</button></div></section></div>';}
 if(modal==='archive-delete')return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Видалити видання"><section class="comic-inner"><div class="eyebrow">ПІДТВЕРДИТИ ВИДАЛЕННЯ</div><h3>Видалити це видання?</h3><p class="mini">Усі рукописи цього випуску буде видалено лише з цього пристрою. Дію не можна скасувати.</p><div class="button-row"><button class="button outline" type="button" data-act="cancel">Залишити</button><button class="button" type="button" data-act="archive-confirm-delete">Видалити</button></div></section></div>';
 if(modal==='leave'){
   const live=['v5','v6'].includes(roomVersion)&&view?.phase==='writing';
   if(live)return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Вихід із кімнати"><section class="comic-inner safe-room-exit"><div class="eyebrow">РУКОПИСИ ЗБЕРЕЖЕНО</div><h3>Вийти з кімнати?</h3><p class="mini">Усі вже здані фрагменти зберігаються на сервері. Твоє місце не зникне.</p><div class="safe-exit-options"><button class="button" type="button" data-act="disconnect-room">Вийти тимчасово <span>↗</span></button><p class="mini">Можна повернутися до того самого раунду. Чернетка залишиться на пристрої.</p><button class="button outline" type="button" data-act="confirm-leave">Звільнити своє місце</button><p class="mini">Партія не обнулиться, але учасникам доведеться чекати твого повернення або завершення випуску ведучим.</p>'+(view.host===me?'<button class="button outline" type="button" data-act="ask-early-end">Завершити випуск достроково</button>':'')+'</div><button class="leave" type="button" data-act="cancel">Скасувати</button></section></div>';
   return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner"><h3>Залишити партію?</h3><p class="mini">'+(view?.phase==='writing'?'У старій версії кімнати вихід скине партію.':'Ти вийдеш із кімнати.')+'</p><div class="button-row"><button class="button outline" data-act="cancel">Залишитись</button><button class="button" data-act="confirm-leave">Вийти</button></div></section></div>';
 }
 if(modal==='early-end')return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Дострокове завершення"><section class="comic-inner"><div class="eyebrow">ЗАВЕРШЕННЯ ВИПУСКУ</div><h3>Завершити зараз?</h3><p>Усі здані фрагменти залишаться в готових рукописах. Незакінчені частини не буде вигадано або дописано автоматично. Продовжити ці раунди після завершення не можна.</p><div class="button-row"><button class="button outline" type="button" data-act="cancel">Продовжувати</button><button class="button" type="button" data-act="confirm-early-end">Зберегти й завершити</button></div></section></div>';
 if(modal==='audio')return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Налаштування звуку"><section class="comic-inner audio-modal"><div class="eyebrow">ЗВУК РЕДАКЦІЇ</div><h3>Звуки та музика</h3><label class="audio-row"><input type="checkbox" name="effectsEnabled" '+(effectsEnabled?'checked':'')+'><span>Ефекти: папір, печатки, перегортання</span></label><label class="audio-volume">Гучність ефектів <output id="effectsLevelOut">'+Math.round(effectsVolume*100)+'%</output><input type="range" name="effectsVolume" min="0" max="100" value="'+Math.round(effectsVolume*100)+'"></label><label class="audio-row"><input type="checkbox" name="musicEnabled" '+(musicEnabled?'checked':'')+'><span>Тиха інструментальна музика</span></label><label class="audio-volume">Гучність музики <output id="musicLevelOut">'+Math.round(musicVolume*100)+'%</output><input type="range" name="musicVolume" min="0" max="100" value="'+Math.round(musicVolume*100)+'"></label><p class="mini">Музика починає грати після дії користувача й стихає у фоновій вкладці.</p><div class="button-row"><button class="button" data-act="close-audio">Готово</button></div></section></div>';
 if(modal==='comic-prompt')return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Комікс через ChatGPT"><section class="comic-inner comic-ai"><div class="eyebrow">КОМІКС · 4 СТОРІНКИ</div><h3>Намалюй історію в ChatGPT</h3><p>Скопіюй готовий промпт і встав у ChatGPT. Зображення створює ChatGPT, а не гра.</p><div class="comic-actions"><button class="button" type="button" data-act="copy-comic-direct">Скопіювати промпт коміксу <span>↗</span></button><button class="button outline" type="button" data-act="copy-comic-safe">Спершу адаптувати історію <span>↗</span></button></div><p class="mini">Адаптація — два кроки: перший чат готує безпечний сценарій, другий створює чотири послідовні сторінки. Деякі сюжети потребуватимуть значної переробки, а генерація не гарантована.</p><div class="button-row"><a class="button outline small" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Відкрити ChatGPT ↗</a><button class="button outline small" data-act="close-comic">Закрити</button></div></section></div>';
 return '';
}
function render(){
 netStatus();syncIdentityBar();
 $('sound').textContent='Аудіо · '+(effectsEnabled||musicEnabled?'увімк.':'вимк.');
 soundscape.setScene(view?.phase==='lobby'?'lobby':view?.phase==='writing'?'writing':view?.phase==='finished'?'finished':'menu');
 const next=screenSignature({view,archiveOpen,connecting,room,writerStep:view?.phase==='writing'&&!view.waiting?readWriterMeta().step:'draft'});
 const motion=transitionFor(lastScreenSignature,next);
 lastScreenSignature=next;
 if(motion)scene.dataset.motion=motion;else delete scene.dataset.motion;
 if(connecting&&!view){
  scene.innerHTML='<section class="paper waiting"><div class="eyebrow">POCKETNET</div><h2>З’єднуємо авторів…</h2><p class="mini">Відновлюємо захищену кімнату.</p><button class="button outline" type="button" data-act="cancel-connect">Скасувати підключення</button></section>';
  return;
 }
 scene.innerHTML=(view?(view.phase==='lobby'?lobby():view.phase==='writing'?(view.waitingApproval&&roomVersion==='v6'?candidateWaiting():view.waiting?waiting():writing()):view.phase==='finished'?results():waiting()):archiveOpen?archiveScreen():home())+(view&&roomVersion==='v6'&&['writing','lobby'].includes(view.phase)&&!view.waitingApproval?moderationStrip(view,me):'')+(view&&roomVersion==='v6'&&view.phase==='writing'&&view.paused&&!view.waitingApproval?pauseOverlay(view.host===me):'')+overlay();
 if(view?.phase==='writing'&&!view.waiting)refreshWords();
}
function indices(){const w=words($('answer')?.value||loadDraft());return (draftSelections[draftKey()]||readWriterMeta().selection||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<w.length)}
function refreshWords(){
 const input=$('answer'),text=input?input.value:loadDraft(),counter=$('chars');
 if(counter)counter.textContent=text.length+'/800';
 const tray=$('wordTray');if(!tray)return;
 const needed=handoffCount({roomVersion,round:view.round,total:view.total,visibleTailWords:view.settings.visibleTailWords,answer:text});
 const chosen=indices().slice(0,needed);
 draftSelections[draftKey()]=chosen;
 tray.closest('.selection-stage')?.classList.toggle('is-complete',needed>0&&chosen.length===needed);
 tray.querySelectorAll('.word').forEach(button=>{
  const selected=chosen.includes(Number(button.dataset.index));
  button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
 });
 if($('wordCount'))$('wordCount').textContent=chosen.length+' / '+needed;
 const strip=$('selectedStrip');
 if(strip)strip.innerHTML=chosen.length?handoffWords(text,chosen).map(w=>'<span class="handoff-chip">'+escape(w)+'</span>').join(''):'<span class="handoff-placeholder">Слів поки не вибрано</span>';
}
function disconnectRoom(){
 ++connectionAttempt;clearRoomTimeout();releaseActive();
 const c=net;net=null;
 try{if(c){c.persist();c.close()}}catch{}
 connected=false;connecting=false;view=null;me='';room='';modal='';storyId='';
 notice='Місце збережено. Можна повернутися до партії.';
 syncUrl();render();
}
function leaveNow(){++connectionAttempt;clearRoomTimeout();releaseActive();const c=net;net=null;try{if(connected&&c?.roomId)c.leaveRoom()}catch{}try{if(c){c.roomId=null;c.persist();c.close()}}catch{}view=null;me='';room='';connected=false;connecting=false;modal='';storyId='';syncUrl();render()}
scene.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
 if(f.id==='createForm'||f.id==='joinForm'){const d=new FormData(f);if(!member())name=String($('guestNick')?.value||d.get('name')||'').trim().slice(0,24);invitation=String(d.get('room')||'');connect(f.id==='createForm'?'create':'join',{maxPlayers:4,questionSet:'collapsingPlan',visibleTailWords:3,genre:'absurdComedy'});return}
 if(f.id==='settingsForm'){const d=new FormData(f),settings={maxPlayers:+d.get('maxPlayers'),visibleTailWords:+d.get('visibleTailWords'),showNextQuestion:d.has('showNextQuestion'),questionSet:d.get('questionSet'),genre:d.get('genre'),customGenre:d.get('customGenre'),customQuestions:String(d.get('customQuestions')||'').split('\n').map(s=>s.trim()).filter(Boolean)};if(settings.questionSet==='custom'&&settings.customQuestions.length<2){toast('Додай хоча б два питання.');return}send({type:'settings',settings});return}
 if(f.id==='answerForm'){
 const answer=($('answer')?.value||loadDraft()).trim();
 const needed=handoffCount({roomVersion,round:view.round,total:view.total,visibleTailWords:view.settings.visibleTailWords,answer});
 if(!hasMinimumDraft(answer)){toast('Напиши хоча б чотири слова.');return}
 const meta=readWriterMeta();
 if(needed>0&&meta.step!=='select'){
  document.activeElement?.blur();
  saveWriterMeta({step:'select'});
  soundscape.fx('page');render();return;
 }
 const chosen=indices();
 if(chosen.length!==needed){toast('Познач рівно '+needed+' слів.');return}
 const gender=meta.gender||'unspecified';save('gender',gender);
 if(['v5','v6'].includes(roomVersion)){
    let p=readPending();
    if(p&&!canRetry(p,view)){discardPending();p=null}
    if(!p){
      p=makeSubmission({round:view.round,sheetId:view.sheet.id,answer,tailIndexes:chosen,gender,heroAnchor:meta.anchor||'',requestId:crypto.randomUUID(),draftStorageKey:draftKey()});
      if(!savePending(p))return;
    }
    if(send(outgoingPacket(p)))tick(445);
    render();
 }else if(send({type:'submit',round:view.round,sheetId:view.sheet.id,answer,tailIndexes:chosen,gender,heroAnchor:meta.anchor||''}))tick(445);
 }});
scene.addEventListener('input',e=>{if(e.target.id==='guestNick')name=e.target.value.slice(0,24);if(e.target.name==='room'&&e.target.closest('#joinForm'))invitation=e.target.value;if(e.target.id==='answer'){if(e.target.value!==loadDraft()){draftSelections[draftKey()]=[];saveWriterMeta({selection:[]})}saveDraft(e.target.value);refreshWords()}if(e.target.id==='heroAnchor')saveWriterMeta({anchor:e.target.value.slice(0,72)});if(e.target.name==='effectsEnabled'){effectsEnabled=e.target.checked;save('sound',effectsEnabled?'on':'off');soundscape.config({effectsEnabled,musicEnabled,effectsLevel:effectsVolume,musicLevel:musicVolume});soundscape.unlock();$('sound').textContent='Аудіо · '+(effectsEnabled||musicEnabled?'увімк.':'вимк.')}if(e.target.name==='musicEnabled'){musicEnabled=e.target.checked;save('music',musicEnabled?'on':'off');soundscape.config({effectsEnabled,musicEnabled,effectsLevel:effectsVolume,musicLevel:musicVolume});soundscape.unlock();$('sound').textContent='Аудіо · '+(effectsEnabled||musicEnabled?'увімк.':'вимк.')}if(e.target.name==='effectsVolume'){effectsVolume=Number(e.target.value)/100;save('effectsVolume',effectsVolume);$('effectsLevelOut').textContent=Math.round(effectsVolume*100)+'%';soundscape.config({effectsEnabled,musicEnabled,effectsLevel:effectsVolume,musicLevel:musicVolume})}if(e.target.name==='musicVolume'){musicVolume=Number(e.target.value)/100;save('musicVolume',musicVolume);$('musicLevelOut').textContent=Math.round(musicVolume*100)+'%';soundscape.config({effectsEnabled,musicEnabled,effectsLevel:effectsVolume,musicLevel:musicVolume})}if(e.target.id==='questionSet')$('customField')?.classList.toggle('hidden',e.target.value!=='custom');if(e.target.id==='genre')$('customGenreField')?.classList.toggle('hidden',e.target.value!=='custom')});
scene.addEventListener('change',e=>{if(e.target.name==='gender'&&e.target.checked)saveWriterMeta({gender:e.target.value})});
scene.addEventListener('animationend',e=>{if(e.target.classList?.contains('print-finale')){finaleIntroActive=false;e.target.remove()}});
scene.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
 if(act==='mod-open'){modal='moderation';render();return}
 if(act==='mod-close'){modal='';render();return}
 if(act==='mod-select'){modTarget=b.dataset.id;modal='moderation';render();return}
 if(act==='mod-toggle-pause'){send({type:view?.paused?'resume':'pause'});return}
 if(act==='mod-ask-kick'||act==='mod-ask-skip'){modAction=act==='mod-ask-kick'?'kick':'skip';modal='mod-confirm';render();return}
 if(act==='mod-confirm'){if(modTarget){const sent=send({type:modAction==='kick'?'kick':'skip_seat',targetId:modTarget});if(sent){modal='';modAction='';render()}}return}
 if(act==='mod-transfer'){if(modTarget&&send({type:'transfer_host',targetId:modTarget})){modal='';render()}return}
 if(act==='mod-assign'){if(modTarget&&send({type:'assign_seat',seatId:modTarget,candidateId:b.dataset.id})){modal='';render()}return}
 if(act==='mod-vote'){if(send({type:'host_vote',targetId:b.dataset.id})){modal='';render()}return}
 if(act==='skip-finale'){finaleIntroActive=false;scene.querySelector('.print-finale')?.remove();soundscape.fx('page');return}
 if(act==='back-to-draft'){saveWriterMeta({step:'draft'});soundscape.fx('page');render();return}
 if(act==='close-audio'){modal='';render();return}if(act==='copy-comic-direct'||act==='copy-comic-safe'){const txt=buildComicPrompt(comicSource,{adapt:act==='copy-comic-safe'});if(txt)void copyText(txt);else toast('Немає рукопису для промпту.');return}if(act==='word'){
 const i=Number(b.dataset.index),ids=indices();
 const needed=handoffCount({roomVersion,round:view.round,total:view.total,visibleTailWords:view.settings.visibleTailWords,answer:loadDraft()});
 const at=ids.indexOf(i);
 if(at>=0)ids.splice(at,1);
 else if(ids.length<needed)ids.push(i);
 else{toast('Вже вибрано '+needed+' слів.');return}
 draftSelections[draftKey()]=ids;saveWriterMeta({selection:ids});
 refreshWords();tick(650);b.focus({preventScroll:true});return;
}
 if(act==='archive'){archiveOpen=true;archiveEditionId='';archiveStoryId='';render();return}
  if(act==='archive-back'){archiveOpen=false;archiveEditionId='';archiveStoryId='';render();return}
  if(act==='archive-edition'){archiveEditionId=b.dataset.id;archiveStoryId='';render();return}
  if(act==='archive-story'){archiveStoryId=b.dataset.id;render();return}
  if(act==='archive-copy'){const st=archiveSelection().story;if(st)copyText(storyText(st));return}
  if(act==='archive-ask-delete'){archivePendingDelete=archiveSelection().edition?.id||'';modal='archive-delete';render();return}
  if(act==='archive-confirm-delete'){
   if(archivePendingDelete){try{const remaining=removeEdition(editions(),archivePendingDelete);if(IS_PREVIEW)previewEditions=remaining;else if(remaining.length){if(!writeEditions(localStorage,archiveKey(),remaining)){toast('Не вдалося видалити видання.');modal='';render();return}}else localStorage.removeItem(archiveKey());toast('Видання видалено.')}catch{toast('Не вдалося видалити видання.')}}
   archivePendingDelete='';archiveEditionId='';archiveStoryId='';modal='';render();return
  }
  if(act==='profile'){void openPocketProfile();return}if(act==='invite-social'){void openPocketInvites();return}if(act==='cancel-connect'){cancelConnection({preserveRoom:Boolean(savedRoom())});return}
 if(act==='resume'){connect('resume');return}if(act==='copy-code'){if(IS_PREVIEW){toast('Це демонстраційна кімната.');return}copyText(room.slice(0,8).toUpperCase());return}
 if(act==='copy-link'){if(IS_PREVIEW){toast('Тестове посилання не створюється.');return}copyText(location.origin+location.pathname+'?room='+room.slice(0,8));return}
 if(act==='start'||act==='again'){send({type:act});return}
 if(act==='leave'){modal='leave';render();return}if(act==='cancel'){modal='';render();return}
 if(act==='disconnect-room'){disconnectRoom();return}
 if(act==='ask-early-end'){modal='early-end';render();return}
 if(act==='confirm-early-end'){modal='';send({type:'finish_early'});render();return}
 if(act==='confirm-leave'){leaveNow();return}
 if(act==='reader-full'||act==='reader-parts'){readerMode=act==='reader-parts'?'parts':'full';soundscape.fx('page');render();return}if(act==='story'){storyId=b.dataset.id;soundscape.fx('page');render();return}
 if(act==='prev-story'||act==='next-story'){const list=view?.stories||[],index=list.findIndex(x=>x.id===storyId);if(list.length){const delta=act==='next-story'?1:-1;storyId=list[((index<0?0:index)+delta+list.length)%list.length].id;soundscape.fx('page');render()}return}
 if(act==='copy-story'){const st=view.stories.find(x=>x.id===storyId);if(st)copyText(st.text);return}
 if(act==='comic'||act==='archive-comic'){comicSource=act==='archive-comic'?archiveSelection().story:view?.stories?.find(x=>x.id===storyId);if(!comicSource){toast('Не знайдено історію.');return}modal='comic-prompt';tick(800);render();return}
 if(act==='close-comic'){modal='';comicSource=null;render();return}
});
$('sound').addEventListener('click',()=>{soundscape.unlock();modal='audio';render()});
document.addEventListener('pointerdown',()=>{if(effectsEnabled||musicEnabled)soundscape.unlock()},{once:true});
document.addEventListener('visibilitychange',()=>{
 if(IS_PREVIEW)return;
 // A hidden->visible transition is unreliable in embedded iOS / WKWebView; any
 // visibility event may indicate an account switch and must re-validate Pocket ID.
 void refreshPocketBadge();
 if(document.visibilityState==='visible'){void probeNetwork();if(connected&&room)send({type:'sync'})}
});
window.addEventListener('pageshow',event=>{if(!IS_PREVIEW&&event.persisted){void refreshPocketBadge();void probeNetwork()}});
window.addEventListener('focus',()=>{if(!IS_PREVIEW&&identityReady)void refreshPocketBadge()});
$('profileBtn')?.addEventListener('click',openPocketProfile);
if(IS_PREVIEW){
 const d=demoView(PREVIEW_ID);
 view=d.view;me=d.me;room=d.room;connected=d.connected;connecting=d.connecting;
 if(PREVIEW_ID.startsWith('mod-'))roomVersion='v6';
 notice=d.notice;invitation=d.invitation;storyId=d.storyId;modal=d.modal;previewDraft=d.answer;
  if(PREVIEW_ID==='archive'||PREVIEW_ID==='archive-empty'||PREVIEW_ID==='archive-delete'){
   archiveOpen=true;view=null;const final=demoView('results');
   previewEditions=PREVIEW_ID==='archive-empty'?[]:addFinishedEdition([],d.room,final.view,1760781600000);
   if(PREVIEW_ID==='archive-delete')modal='archive-delete';
  }
 if(PREVIEW_ID==='home-member'){pocketIdentity={id:'00000000-0000-4000-8000-000000000001',nickname:'Марта',avatar:'moss',complete:true};identityReady=true}
 else identityReady=true;
 if(view?.phase==='writing'){draftSelections[draftKey()]=d.selection;previewWriterMeta={step:d.writerStep||'draft',anchor:d.heroAnchor||'',gender:'unspecified',selection:d.selection||[]}}
 if(modal==='comic-prompt')comicSource=view?.stories?.[0]||null;
 if(PREVIEW_ID==='reveal')finaleIntroActive=true;

 window.addEventListener('keydown',e=>{
  if((e.code==='Backquote'&&!e.repeat)||e.key==='Escape'){
   e.preventDefault();e.stopImmediatePropagation();
   window.parent.postMessage({type:'chyepukha-qa-toggle'},location.origin);
  }
 },true);
}else{
 installScreenInspector();
}
render();if(!IS_PREVIEW){void refreshPocketBadge(true);void probeNetwork();}
