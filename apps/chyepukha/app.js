import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity,preferredPocketName,pocketIdentitySessionKey,pocketAvatarMarkup,pocketPlayerBadge,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import {storageForTab,prepareSession,markActive,releaseActive} from './tab-session.js';
import {makeComic} from './comic.js';
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
const GENDERS=[['male','Чоловік'],['female','Жінка'],['nonbinary','Інше'],['unspecified','Неважливо']];
let net=null,view=null,me='',room='',connected=false,connecting=false,notice='';
let name=read('name',''),invitation=new URLSearchParams(location.search).get('room')||'',draftSelections={},storyId='',comicImage='',modal='',sound=read('sound','off')==='on',audio=null;
let previewDraft='';
let pocketIdentity=null,identityReady=false,netHealth='checking',netHealthConfirmedAt=0,identityRefresh=0,connectionAttempt=0;
const member=()=>Boolean(pocketIdentity?.complete&&pocketIdentity?.nickname);
const playerName=()=>preferredPocketName(pocketIdentity,name.trim());
// Legacy v1 guest sessions used this key. Preserve them across the account-aware upgrade.
const sessionKey=()=>member()?pocketIdentitySessionKey(pocketIdentity):'chyepukha-1';
const portrait=()=>pocketAvatarMarkup(pocketIdentity?.artwork||pocketIdentity?.avatar,{accountId:pocketIdentity?.id||''});
const draftKey=()=>KEY+'draft:'+sessionKey()+':'+room+':'+(view?.round??0)+':'+(view?.sheet?.id||'');
const loadDraft=()=>{if(IS_PREVIEW)return previewDraft;try{return localStorage.getItem(draftKey())||''}catch{return ''}};
const saveDraft=x=>{if(IS_PREVIEW){previewDraft=x;return}try{localStorage.setItem(draftKey(),x)}catch{}};
const clearDraft=()=>{if(IS_PREVIEW){previewDraft='';return}try{localStorage.removeItem(draftKey())}catch{}};
function toast(x){toastEl.textContent=String(x);toastEl.classList.add('show');clearTimeout(toastEl.timer);toastEl.timer=setTimeout(()=>toastEl.classList.remove('show'),3200)}
function tick(f=580){if(!sound)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;audio||=new A();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.026,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.12);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.13)}catch{}}
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
   const response=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
   if(response.ok){const payload=await response.json();next=payload.user?.id?payload.user:null}
   else if(wasKnown&&member())return;
  }catch{if(wasKnown&&member())return}
 }
 if(seq!==identityRefresh)return;
 const after=pocketIdentitySessionKey(next);
 if(before!==null&&before!==after){
  ++connectionAttempt;
  net?.close();net=null;releaseActive();
  try{storageForTab().removeItem('pocket-net:'+ORIGIN)}catch{}
  const hadRoom=Boolean(view||room);view=null;me='';room='';connected=false;connecting=false;modal='';storyId='';
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
  me='qa-host';previewDraft='';modal='';render();return true;
 }
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
 if(how==='join'&&!code(invitation)){toast('Вкажи правильний код кімнати.');return}
 if(how==='resume'&&!savedRoom()){toast('Збережена кімната для цього профілю недоступна.');return}
 if(net){net.close();net=null;releaseActive()}
 connected=false;connecting=true;notice='';render();
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
  c.on('connected',v=>{if(net!==c)return;me=v.player?.id||'';connected=true;connecting=false;markActive(ORIGIN,c.token);netStatus()});
  c.on('room_joined',v=>{
   if(net!==c)return;
   if(v.gameId!=='chyepukha'||!['v1','v2'].includes(v.version)||v.state?.protocol!==1){
    notice='Несумісна версія кімнати. Створи нову.';try{c.leaveRoom()}catch{}
    room='';view=null;render();return;
   }
   room=v.roomId;syncUrl();apply(v.state);send({type:'sync'});
  });
  c.on('game_event',v=>{if(net!==c)return;if(v.event?.type==='state')apply(v.event.payload);
   else if(v.event?.type==='notice')toast(v.event.payload)});
  c.on('presence',()=>{if(net===c&&room&&connected)send({type:'sync'})});
  c.on('disconnected',()=>{if(net!==c)return;connected=false;connecting=true;netStatus()});
  c.on('room_closed',()=>{if(net!==c)return;room='';view=null;connected=false;connecting=false;syncUrl();notice='Кімнату закрито.';render()});
  c.on('error',e=>{
   if(net!==c)return;connecting=false;
   const labels={room_not_found:'Кімната не існує або вже закрита.',room_full:'Усі місця зайняті.',match_in_progress:'Гра вже почалася.',room_version_unavailable:'Версія кімнати недоступна.',account_already_in_room:'Цей Pocket ID уже є в кімнаті.',server_at_capacity:'Сервер заповнений.',rate_limited:'Зачекай перед наступною дією.'};
   notice=labels[e?.code]||('Помилка підключення: '+String(e?.code||e?.message||'невідома'));
   if(!view){room='';c.close();net=null;releaseActive();connected=false;render()}
   toast(notice);
  });
  await c.connect();
  if(net!==c||ticket!==connectionAttempt)return;
  if(how==='create')c.createRoom('chyepukha',{settings});
  else if(how==='join')c.joinRoom(code(invitation));
  else if(how==='resume'&&!c.roomId)throw Error('Попередню кімнату не знайдено.');
 }catch(error){
  if(ticket!==connectionAttempt)return;
  net?.close();net=null;releaseActive();connected=false;connecting=false;
  netHealth='offline';view=null;
  notice='Не вдалося підключитися: '+String(error.message||error);render();toast(notice);
 }
}
function apply(v){if(!v||v.protocol!==1||!Array.isArray(v.players))return;
 if(view&&v.revision<view.revision)return;
 if(v.phase==='finished'&&Array.isArray(v.stories))v={...v,stories:v.stories.map(st=>({...st,text:st.fragments.map(f=>f.answer).join('\n\n')}))};
 const prev=view;const same=prev?.phase==='writing'&&v.phase==='writing'&&!prev.waiting&&!v.waiting&&prev.round===v.round&&prev.sheet?.id===v.sheet?.id;
 if(prev?.phase==='writing'&&!prev.waiting&&v.waiting)clearDraft();
 view=v;if(prev?.round!==v.round&&prev?.phase==='writing')tick(690);
 if(same){const el=$('sideRoster');if(el)el.innerHTML=rosterCompact();return}
 render();
}
function mark(){return '<svg viewBox="0 0 200 230" aria-hidden="true"><path d="M78 14c-44 2-43 40-24 65-39 30-29 74 9 91 49 19 105-27 85-68-8-20-30-29-48-24 22-33 5-66-22-64Z" stroke="#975941" fill="none" stroke-width="5"/><path d="M70 75c5-22 27-16 30 0m22 0c12-15 28-2 26 13M74 129c23 25 48 22 66 0M83 189l-29 32m67-38 35 25M27 66l16-7m113 93 23 9" stroke="#975941" fill="none" stroke-width="5" stroke-linecap="round"/></svg>'}
function home(){
 const logged=member(),ready=identityReady;
 const identityTile='<div class="home-identity '+(logged?'is-member':'is-guest')+'"><span class="home-identity-art">'+portrait()+'</span><div><small>'+(logged?'POCKET ID · ПІДТВЕРДЖЕНО':ready?'ГОСТЬОВИЙ РЕЖИМ':'ПЕРЕВІРЯЄМО ПРОФІЛЬ')+'</small><strong>'+escape(logged?pocketIdentity.nickname:ready?'Твій профіль':'З’єднуємося…')+'</strong></div><button type="button" data-act="profile" class="identity-open">'+(logged?'Профіль ↗':'Увійти ↗')+'</button></div>';
 const field='<label class="guest-name"><span class="field-label">Ім’я автора</span><input id="guestNick" class="field" name="name" autocomplete="nickname" maxlength="24" placeholder="Як тебе звати?" value="'+escape(name)+'"></label>';
 const hold=ready?'':' disabled';
 return '<div class="home home-edition"><section class="paper home-cover"><div class="home-binding" aria-hidden="true"></div><div class="eyebrow">ВИДАВНИЦТВО НЕЙМОВІРНИХ ПРИГОД</div><h1>ЧЕПУХА<span class="home-period">.</span></h1><p class="lead">Одна історія. Кілька авторів. Ніхто не знає, що було до нього.</p><div class="home-sketch">'+mark()+'<span class="sketch-seal" aria-hidden="true">ЦІЛКОМ ТАЄМНО</span></div><div class="home-colophon"><span>№ 01 / НЕЗАКІНЧЕНІ ІСТОРІЇ</span><span>2–8 АВТОРІВ</span></div></section><div class="home-entry">'+identityTile+(logged?'':field)+'<section class="slip slip-create"><div class="slip-index">01 / ВІДКРИТИ ІСТОРІЮ</div><h3>Нова кімната</h3><form id="createForm"><button class="button" type="submit"'+hold+'>Створити кімнату <span>↗</span></button></form></section><section class="slip slip-join"><div class="slip-index">02 / ДОЄДНАТИСЯ</div><h3>Вже є код?</h3><form id="joinForm"><label><span class="field-label">Код або посилання</span><input class="field" name="room" autocomplete="off" spellcheck="false" placeholder="8 символів" required value="'+escape(invitation)+'"></label><button class="button outline" type="submit"'+hold+'>Приєднатися <span>↗</span></button></form></section>'+(savedRoom()?'<button class="return-ticket" type="button" data-act="resume">Повернутися до кімнати <span>↗</span></button>':'')+(notice?'<p class="warning home-warning">'+escape(notice)+'</p>':'')+'</div></div>';
}
function opts(arr,id){return arr.map(x=>'<option value="'+escape(x.id)+'" '+(id===x.id?'selected':'')+'>'+escape(x.label)+'</option>').join('')}
function settingsForm(s){return '<form class="settings" id="settingsForm"><div class="two"><label><span class="field-label">Максимум гравців</span><select class="field" name="maxPlayers">'+[2,3,4,5,6,7,8].map(n=>'<option value="'+n+'" '+(n===s.maxPlayers?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label><span class="field-label">Передати слів</span><select class="field" name="visibleTailWords">'+[0,1,2,3,4,5,6,8,10,12].map(n=>'<option value="'+n+'" '+(n===s.visibleTailWords?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><label><span class="field-label">Сюжетний набір</span><select class="field" name="questionSet" id="questionSet">'+opts([...view.questionSets,{id:'random',label:'Випадковий'},{id:'perSheetRandom',label:'Різний для кожної історії'},{id:'custom',label:'Свої питання'}],s.questionSet)+'</select></label><label class="'+(s.questionSet==='custom'?'':'hidden')+'" id="customField"><span class="field-label">Свої питання (по одному на рядок)</span><textarea class="field" name="customQuestions" rows="4">'+escape(s.customQuestions?.join('\n')||'')+'</textarea></label><label><span class="field-label">Жанр</span><select class="field" name="genre" id="genre">'+opts([...view.genres,{id:'random',label:'Випадковий'},{id:'perSheetRandom',label:'Різний для кожної історії'},{id:'custom',label:'Свій жанр'}],s.genre)+'</select></label><label class="'+(s.genre==='custom'?'':'hidden')+'" id="customGenreField"><span class="field-label">Свій жанр</span><input class="field" name="customGenre" maxlength="60" value="'+escape(s.customGenre||'')+'"></label><button class="button outline small" type="submit">Зберегти правила</button></form>'}
function roster(){return view.players.map((p,i)=>'<div class="person"><b class="person-index">'+String(i+1).padStart(2,'0')+'</b><span class="person-portrait">'+(p.verified&&p.accountId?pocketAvatarMarkup(p.avatar,{accountId:p.accountId}):'<span class="guest-monogram">'+escape(p.name?.charAt(0)?.toLocaleUpperCase()||'?')+'</span>')+'</span><strong>'+escape(p.name)+'</strong>'+(p.verified?pocketPlayerBadge(p,{showGuest:false}):'')+'<small>'+(p.id===view.host?'ВЕДУЧИЙ':view.phase==='writing'?(p.submitted?'ГОТОВО':'ПИШЕ'):'АВТОР')+'</small></div>').join('')}
function rosterCompact(){return view.players.map(p=>'<div class="status"><span>'+escape(p.name)+(p.verified?pocketPlayerBadge(p,{showGuest:false}):'')+'</span><b>'+(p.submitted?'✓':'…')+'</b></div>').join('')}
function lobby(){const host=view.host===me,s=view.settings;return '<div class="room"><section class="paper"><div class="eyebrow">ЗБІР АВТОРІВ</div><h2>Чекаємо на хаос</h2><div class="mini">Код кімнати</div><div class="code">'+room.slice(0,8).toUpperCase()+'</div><div class="button-row"><button class="button outline small" data-act="copy-code">Копіювати код</button><button class="button outline small" data-act="copy-link">Посилання друзям</button></div><div class="roster">'+roster()+'</div>'+(member()?'<button type="button" class="invite-people" data-act="invite-social" data-social-invite>Запросити друзів із Pocket ID <span>↗</span></button>':'')+'<p class="mini">'+view.players.length+'/'+s.maxPlayers+' учасників. Потрібно мінімум двоє.</p>'+(host?'<button class="button" data-act="start" '+(view.players.length<2?'disabled':'')+'>Почати писати <span>→</span></button>':'<p class="mini">Ведучий почне, коли всі зберуться.</p>')+(view.message?'<p class="warning">'+escape(view.message)+'</p>':'')+'<button class="leave" data-act="leave">Залишити кімнату</button></section><aside class="room-aside"><div class="eyebrow">ПРАВИЛА РЕДАКЦІЇ</div><h3>Аркуші підуть по колу</h3><p class="lobby-hint">У кожному раунді ти пишеш свою частину. Наступний автор побачить лише кілька обраних тобою слів. У фіналі історії відкриються повністю.</p>'+(host?settingsForm(s):'<p class="mini">Жанр і питання визначає ведучий. Ніхто не бачить приховані фрагменти.</p>')+'</aside></div>'}
function writing(){const s=view.sheet;if(!s)return '<section class="paper waiting"><h2>Очікуємо аркуш…</h2></section>';
 const hero=s.gender?GENDERS.find(([id])=>id===s.gender)?.[1]||'Неважливо':null;return '<div class="play"><section class="paper writing"><div class="progress"><span class="eyebrow">ІСТОРІЯ · АРКУШ</span><button type="button" class="leave mobile-leave" data-act="leave">Вийти</button><strong>'+String(view.round+1).padStart(2,'0')+' / '+view.total+'</strong></div><div class="mini" style="margin-top:12px">'+escape(s.setLabel)+' · '+escape(s.genreLabel)+'</div><h2 class="question">'+escape(s.question?.prompt||'Продовж історію')+'</h2><div class="incoming"><b>'+ (s.tail?'ВІД ПОПЕРЕДНЬОГО АВТОРА':'ПОЧАТОК ІСТОРІЇ')+'</b><p>'+escape(s.tail||'Ти пишеш першим. Нехай буде дивно.')+'</p>'+(hero?'<span class="mini">Головний герой: '+escape(hero)+'</span>':'')+'</div><details class="note"><summary>Підказка до питання</summary><p>'+escape(s.question?.guidance||'')+' '+escape(s.question?.creativeFreedom||'')+'</p></details><form id="answerForm" class="writer"><textarea id="answer" class="answer" maxlength="800" name="answer" placeholder="Продовж історію..." aria-label="Твій фрагмент">'+escape(loadDraft())+'</textarea>'+(view.round===0?'<div class="genders" role="group" aria-label="Стать героя">'+GENDERS.map(([id,label])=>'<label><input name="gender" type="radio" value="'+id+'" '+(read('gender','unspecified')===id?'checked':'')+'>'+label+'</label>').join('')+'</div>':'')+'<div class="word-head"><span>ВИБЕРИ СЛОВА ДЛЯ НАСТУПНОГО</span><span id="wordCount"></span></div><div id="wordTray" class="word-tray"></div><div class="submit-row"><button class="button" type="submit">Запечатати аркуш <span>↗</span></button><span id="chars" class="mini"></span></div></form></section><aside class="side"><div class="stamp">СЕКРЕТНО</div><h3>Наступний автор побачить лише вибрані слова</h3><p class="mini">Передай рівно '+view.settings.visibleTailWords+' слів. Слова можна вибрати в будь-якій частині тексту.</p><div id="sideRoster">'+rosterCompact()+'</div><button class="leave" data-act="leave">Вийти з партії</button></aside></div>'}
function waiting(){return '<section class="paper waiting"><div class="eyebrow">АРКУШ ПЕРЕДАНО</div><div class="wax" aria-hidden="true">✓</div><h2>Запечатано</h2><p class="lead">Твоя частина прихована. Чекаємо решту авторів.</p><div class="roster" style="width:100%">'+roster()+'</div><button class="leave" data-act="leave">Залишити партію</button></section>'}
function results(){if(!view.stories?.length)return waiting();let st=view.stories.find(s=>s.id===storyId)||view.stories[0];storyId=st.id;return '<div class="results"><nav class="chapters"><h3>Рукописи</h3>'+view.stories.map((s,i)=>'<button class="chapter '+(s.id===st.id?'active':'')+'" data-act="story" data-id="'+escape(s.id)+'"><small>ІСТОРІЯ '+String(i+1).padStart(2,'0')+'</small>'+escape(s.starter)+'</button>').join('')+'</nav><article class="paper story-paper"><div class="progress"><span class="eyebrow">ФІНАЛЬНЕ РОЗКРИТТЯ</span><span class="stamp">ГОТОВО</span></div><h2 style="margin-top:17px">Історія '+escape(st.starter)+'</h2><p class="mini">'+escape(st.setLabel)+' · '+escape(st.genre)+'</p><div class="content"><div class="story-text">'+escape(st.text)+'</div><details style="margin-top:12px"><summary style="cursor:pointer">Показати авторів фрагментів</summary>'+st.fragments.map((f,i)=>'<details class="fragment"><summary>№'+(i+1)+' · '+escape(f.author)+' · '+escape(f.question)+'</summary><p>'+escape(f.answer)+'</p></details>').join('')+'</details></div><div class="button-row"><button class="button outline small" data-act="copy-story">Копіювати текст</button><button class="button small" data-act="comic">Зробити комікс ↗</button></div>'+(view.host===me?'<button class="leave" data-act="again">Нова партія</button>':'<p class="mini">Ведучий може запустити нову партію.</p>')+'<button class="leave" data-act="leave">Вийти до меню</button></article></div>'}
function overlay(){if(modal==='leave')return '<div class="comic-modal"><section class="comic-inner"><h3>Залишити партію?</h3><p class="mini">Якщо гра триває, для інших авторів партію буде скинуто.</p><div class="button-row"><button class="button outline" data-act="cancel">Залишитись</button><button class="button" data-act="confirm-leave">Вийти</button></div></section></div>';
 if(modal==='comic')return '<div class="comic-modal"><section class="comic-inner"><div class="eyebrow">ДОДАТКОВИЙ ВИПУСК</div><h3>Комікс зібрано</h3><img alt="Автоматично зібрана ілюстрована сторінка" src="'+comicImage+'"><div class="button-row"><a class="button small" download="chyepukha-comic.png" href="'+comicImage+'">Зберегти PNG ↓</a><button class="button outline small" data-act="close-comic">Закрити</button></div></section></div>';
 return ''}
function render(){netStatus();syncIdentityBar();$('sound').textContent='Звук: '+(sound?'увімк.':'вимк.');
 if(connecting&&!view){scene.innerHTML='<section class="paper waiting"><div class="eyebrow">POCKETNET</div><h2>З’єднуємо авторів…</h2><p class="mini">Відновлюємо захищену кімнату.</p></section>';return}
 scene.innerHTML=(view?(view.phase==='lobby'?lobby():view.phase==='writing'?(view.waiting?waiting():writing()):view.phase==='finished'?results():waiting()):home())+overlay();
 if(view?.phase==='writing'&&!view.waiting)refreshWords();
}
function indices(){const w=words($('answer')?.value||'');return (draftSelections[draftKey()]||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<w.length)}
function refreshWords(){const a=$('answer'),tray=$('wordTray');if(!a||!tray)return;const ws=words(a.value),need=Math.min(view.settings.visibleTailWords,ws.length);let ids=indices().slice(0,need);draftSelections[draftKey()]=ids;tray.innerHTML=ws.length?ws.map((w,i)=>'<button type="button" class="word '+(ids.includes(i)?'selected':'')+'" data-act="word" data-index="'+i+'" aria-pressed="'+ids.includes(i)+'">'+escape(w)+'</button>').join(''):'<span class="mini">Спершу напиши свій фрагмент.</span>';$('wordCount').textContent=ids.length+'/'+need;$('chars').textContent=a.value.length+'/800'}
function leaveNow(){++connectionAttempt;releaseActive();const c=net;net=null;try{if(connected&&c?.roomId)c.leaveRoom()}catch{}try{c?.close()}catch{}view=null;me='';room='';connected=false;connecting=false;modal='';storyId='';syncUrl();render()}
scene.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
 if(f.id==='createForm'||f.id==='joinForm'){const d=new FormData(f);if(!member())name=String($('guestNick')?.value||d.get('name')||'').trim().slice(0,24);invitation=String(d.get('room')||'');connect(f.id==='createForm'?'create':'join',{maxPlayers:4,questionSet:'collapsingPlan',visibleTailWords:3,genre:'absurdComedy'});return}
 if(f.id==='settingsForm'){const d=new FormData(f),settings={maxPlayers:+d.get('maxPlayers'),visibleTailWords:+d.get('visibleTailWords'),questionSet:d.get('questionSet'),genre:d.get('genre'),customGenre:d.get('customGenre'),customQuestions:String(d.get('customQuestions')||'').split('\n').map(s=>s.trim()).filter(Boolean)};if(settings.questionSet==='custom'&&settings.customQuestions.length<2){toast('Додай хоча б два питання.');return}send({type:'settings',settings});return}
 if(f.id==='answerForm'){const answer=$('answer').value.trim(),ws=words(answer),chosen=indices(),needed=Math.min(view.settings.visibleTailWords,ws.length);
 if(ws.length<4){toast('Напиши хоча б чотири слова.');return}if(chosen.length!==needed){toast('Познач рівно '+needed+' слів.');return}
 const gender=document.querySelector('input[name=gender]:checked')?.value||'unspecified';save('gender',gender);
 if(send({type:'submit',round:view.round,sheetId:view.sheet.id,answer,tailIndexes:chosen,gender}))tick(445);
 }});
scene.addEventListener('input',e=>{if(e.target.id==='guestNick')name=e.target.value.slice(0,24);if(e.target.id==='answer'){saveDraft(e.target.value);refreshWords()}if(e.target.id==='questionSet')$('customField')?.classList.toggle('hidden',e.target.value!=='custom');if(e.target.id==='genre')$('customGenreField')?.classList.toggle('hidden',e.target.value!=='custom')});
scene.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
 if(act==='word'){const i=Number(b.dataset.index),ids=indices(),need=Math.min(view.settings.visibleTailWords,words($('answer')?.value).length),at=ids.indexOf(i);if(at>=0)ids.splice(at,1);else if(ids.length<need)ids.push(i);else{toast('Вже вибрано '+need+' слів.');return}draftSelections[draftKey()]=ids;refreshWords();tick(650);return}
 if(act==='profile'){openPocketProfile();return}if(act==='invite-social'){if(window.PocketSocial?.open)void window.PocketSocial.open(room,'chyepukha');else toast('Запрошення друзів тимчасово недоступне.');return}
 if(act==='resume'){connect('resume');return}if(act==='copy-code'){if(IS_PREVIEW){toast('Це демонстраційна кімната.');return}copyText(room.slice(0,8).toUpperCase());return}
 if(act==='copy-link'){if(IS_PREVIEW){toast('Тестове посилання не створюється.');return}copyText(location.origin+location.pathname+'?room='+room.slice(0,8));return}
 if(act==='start'||act==='again'){send({type:act});return}
 if(act==='leave'){modal='leave';render();return}if(act==='cancel'){modal='';render();return}if(act==='confirm-leave'){leaveNow();return}
 if(act==='story'){storyId=b.dataset.id;render();return}
 if(act==='copy-story'){const st=view.stories.find(x=>x.id===storyId);if(st)copyText(st.text);return}
 if(act==='comic'){const st=view.stories.find(x=>x.id===storyId);if(!st)return;try{b.disabled=true;b.textContent='Створюємо…';comicImage=makeComic(st).toDataURL('image/png');modal='comic';tick(800);render()}catch(error){toast('Не вдалося зібрати комікс: '+error.message);b.disabled=false}return}
 if(act==='close-comic'){modal='';comicImage='';render();return}
});
$('sound').addEventListener('click',()=>{sound=!sound;save('sound',sound?'on':'off');render();tick()});
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
 notice=d.notice;invitation=d.invitation;storyId=d.storyId;modal=d.modal;previewDraft=d.answer;
 if(PREVIEW_ID==='home-member'){pocketIdentity={id:'00000000-0000-4000-8000-000000000001',nickname:'Марта',avatar:'moss',complete:true};identityReady=true}
 else identityReady=true;
 if(view?.phase==='writing')draftSelections[draftKey()]=d.selection;
 if(modal==='comic'){
  try{comicImage=makeComic(view.stories[0]).toDataURL('image/png')}
  catch{modal='';notice='Тестовий комікс не вдалося зібрати.'}
 }
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
