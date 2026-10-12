import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {pieceInfo,pieceSVG,INKS} from './pieces.js';
installMobileRuntime();
createWorkshopMode({appName:'ЧУШЬ!',version:'1.1.0',cachePrefix: 'chush-',storageNamespace: 'pocket-works:chush'});

const root=document.querySelector('#view'),statusNode=document.querySelector('#connection'),toast=document.querySelector('#toast'),modal=document.querySelector('#dialog');
const SERVER=location.origin+'/pocketnet',STORE='pocket-works:chush:',params=new URLSearchParams(location.search);
let roomCode=(params.get('room')||'').trim().toUpperCase(),net=null,me=null,state=null,roomId='',connected=false,connecting=false,health=null;
const MAX_MARKS=140;
let profile=null,name='Гость',sound=true,lastRound=0,lastPhase='',draft=[],brush=-1,brushColor=0,brushSize=.65,eraser=false,history=[],drag=null,sendTimer=0,toastTimer=0,chosen=-1,stars=3,confirmCallback=null,serial=0;
try{name=localStorage.getItem(STORE+'name')||name;sound=localStorage.getItem(STORE+'sound')!=='off';}catch{}
const mem=new Map(),storage={
 getItem(k){try{return sessionStorage.getItem(STORE+k);}catch{return mem.get(k)||null;}},
 setItem(k,v){try{sessionStorage.setItem(STORE+k,v);}catch{mem.set(k,v);}},
 removeItem(k){try{sessionStorage.removeItem(STORE+k);}catch{mem.delete(k);}}
};
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(STORE+'tabs'):null;
let activeToken=null;
channel?.addEventListener('message',e=>{if(e.data?.type==='claim'&&activeToken===e.data.token)channel.postMessage({type:'owned',nonce:e.data.nonce});});
async function distinctTab(){
 let prior;try{prior=JSON.parse(storage.getItem('pocket-net:'+SERVER)||'null');}catch{}
 if(!prior?.token||!channel)return;
 const nonce=crypto.randomUUID();
 const duplicate=await new Promise(resolve=>{
  const check=e=>{if(e.data?.type==='owned'&&e.data.nonce===nonce){cleanup();resolve(true);}};
  const cleanup=()=>{clearTimeout(timer);channel.removeEventListener('message',check);};
  channel.addEventListener('message',check);
  const timer=setTimeout(()=>{cleanup();resolve(false);},190);
  channel.postMessage({type:'claim',token:prior.token,nonce});
 });
 if(duplicate)storage.removeItem('pocket-net:'+SERVER);
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cloneBoard=b=>b.map(x=>({...x}));
function notify(message){clearTimeout(toastTimer);toast.textContent=String(message);toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),3200);}
function status(message,kind=''){statusNode.textContent=message;statusNode.className='network '+kind;}
function tone(hz=440){
 if(!sound)return;
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ac=window.__chushAudio||(window.__chushAudio=new C());if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.setValueAtTime(hz,ac.currentTime);o.frequency.exponentialRampToValueAtTime(hz*.72,ac.currentTime+.09);g.gain.setValueAtTime(.015,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.11);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.12);}catch{}
}
async function loadProfile(){
 try{const r=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('No profile');const data=await r.json();profile=data.user?.complete?data.user:null;if(profile?.nickname)name=profile.nickname;}catch{profile=null;}
}
async function checkHealth(){
 status('ПОИСК СЕТИ');
 try{const r=await fetch(SERVER+'/health',{cache:'no-store',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Unreachable');const data=await r.json();health=Boolean(data.ok&&data.modules?.includes('chush'));status(health?'СЕТЬ ГОТОВА':'ЖДЁМ МОДУЛЬ',health?'good':'bad');}catch{health=false;status('НЕТ СВЯЗИ','bad');}
 if(!state&&!connecting)render();
}
function box(piece,i){
 const flip=piece.f===1?-1:1;
 return '<div class="piece" style="left:'+piece.x+'%;top:'+piece.y+'%;z-index:'+i+';transform:translate(-50%,-50%) rotate('+piece.r+'deg) scale('+piece.s+') scaleX('+flip+')">'+pieceSVG(piece.t,piece.c)+'</div>';
}
function artboard(items,editable=false,id=''){
 return '<div class="stage'+(editable?' ink-surface':' readonly')+'" '+(id?'id="'+id+'"':'')+' aria-label="Рисунок из цветных отпечатков" '+(editable?'data-gesture-surface data-block-callout':'')+'>'+items.map((p,i)=>box(p,i)).join('')+(!items.length?'<div class="empty-hint">'+(editable?'ВЫБЕРИ КИСТЬ И РИСУЙ':'ПУСТОЙ ХОЛСТ')+'</div>':'')+'</div>';
}
function roundHead(phase){
 return '<div class="round-head"><div><div class="eyebrow">РАУНД '+state.round+' / '+state.maxRounds+' · '+phase+'</div><h1>'+(phase==='РИСОВАНИЕ'?'Твоя версия абсурда.':phase==='ГОЛОСОВАНИЕ'?'Кто попал в точку?':'Разоблачение!')+'</h1></div><div class="clock" id="timer">—</div></div>';
}
function prompt(){return '<div class="prompt"><span class="eyebrow">НАРИСУЙ ЭТО</span><b>'+esc(state.prompt)+'</b></div>';}
function lobbyRoster(){
 return '<div class="roster"><h2>КТО ТУТ · '+state.players.length+'/8</h2>'+state.players.map((p,i)=>'<div class="person"><span class="num">'+String(i+1).padStart(2,'0')+'</span>'+esc(p.name)+(p.id===me?.id?' (ты)':'')+'<span class="tag">'+(p.id===state.host?'ВЕДУЩИЙ':'В ИГРЕ')+'</span></div>').join('')+'</div>';
}
function renderMenu(){
 const comeback=(()=>{try{return Boolean(JSON.parse(storage.getItem('pocket-net:'+SERVER)||'null')?.roomId);}catch{return false;}})();
 root.innerHTML='<section class="scene hero"><div class="hero-mark"><div class="eyebrow">ПОДПОЛЬНЫЙ ТЕАТР НЕВОЗМОЖНОГО</div><h1 class="hero-title">ЧУШЬ<b>!</b></h1><div class="hero-art"><span class="first">'+pieceSVG(1)+'</span><span class="second">'+pieceSVG(192)+'</span></div><div class="caption">64 СИЛУЭТА · 5 ЦВЕТОВ · 320 ШТАМПОВ.</div></div>'+
 '<div class="start-pane"><span class="eyebrow">2–8 ИГРОКОВ · POCKETNET</span><h2>Нелепость.<br>Состязание.<br>Смешные картинки.</h2><div class="instructions"><div><b>01</b>Всем одна безумная фраза</div><div><b>02</b>Каждому свои 18–22 кисти</div><div><b>03</b>Рисуй, анонимно голосуй</div></div>'+
 '<div class="fields"><div><label class="label" for="playerName">ТВОЁ ИМЯ'+(profile?' · POCKET ID':'')+'</label><input class="field" id="playerName" value="'+esc(profile?.nickname||name)+'" maxlength="22" autocomplete="nickname" '+(profile?'disabled':'')+'></div><div><label class="label" for="roomCode">КОД КОМНАТЫ ДРУГА</label><input class="field" id="roomCode" value="'+esc(roomCode)+'" placeholder="A1B2C3D4" maxlength="36" autocomplete="off" autocapitalize="characters" spellcheck="false"></div></div>'+
 '<div class="actions"><button class="btn hot full" data-action="create">+ СОЗДАТЬ КОМНАТУ</button><button class="btn dark full" data-action="join">→ ВОЙТИ ПО КОДУ</button>'+(comeback?'<button class="btn blue full" data-action="resume">↻ ВЕРНУТЬСЯ В КОМНАТУ</button>':'')+(health===false?'<button class="btn full" data-action="retry">↻ ПОВТОРИТЬ ПРОВЕРКУ СЕТИ</button>':'')+'</div><div class="bar"></div><button class="btn plain tiny" data-action="sound">ЗВУК · '+(sound?'ВКЛ':'ВЫКЛ')+'</button><p class="subdued">Раунд — 2,5 минуты. Выбери штамп, проведи пальцем и получи рисунок из повторяющихся силуэтов.</p></div></section>';
}
function renderLobby(){
 const host=state.host===me?.id;
 root.innerHTML='<section class="scene"><div class="eyebrow">ЗАЛ ОЖИДАНИЯ / РАУНДЫ ЕЩЁ НЕ НАЧАЛИСЬ</div><h1 class="display">Публика собирается.</h1><p class="lede">Пригласи 1–7 человек. Каждый получит свои кисти. Пять раундов — пять невозможных сцен.</p><div class="ticket"><div><span class="eyebrow">БИЛЕТ В ТЕАТР · КОД</span><div class="ticket-code">'+esc(roomCode||'········')+'</div><div class="button-row"><button class="btn yellow" data-action="copy-code">СКОПИРОВАТЬ КОД</button><button class="btn" data-action="copy-link">ОТПРАВИТЬ ССЫЛКУ</button></div><p class="subdued">Друг откроет ссылку на телефоне или ПК. Всё работает через интернет без локальной сети.</p></div>'+lobbyRoster()+'</div><div class="lobby-bottom button-row"><button class="btn hot" data-action="start" '+(!host||state.players.length<2||!connected?'disabled':'')+'>'+(host?'НАЧАТЬ ПРЕДСТАВЛЕНИЕ ↗':'ЖДЁМ ВЕДУЩЕГО')+'</button><button class="btn" data-action="leave">ВЫЙТИ ИЗ КОМНАТЫ</button></div></section>';
}
function renderCompose(){
 const ready=state.ready.includes(me?.id);
 if(brush<0&&!ready&&state.deck?.length){brush=state.deck[0];brushColor=pieceInfo(brush).variant;}
 const items=(state.deck||[]).map(t=>'<button class="asset'+(brush===t&&!eraser?' chosen':'')+'" data-brush="'+t+'" title="'+esc(pieceInfo(t).name)+'" aria-label="Кисть '+esc(pieceInfo(t).name)+'">'+pieceSVG(t)+'<span class="brush-dot" style="background:'+pieceInfo(t).color+'"></span></button>').join('');
 const inks=INKS.map((hex,i)=>'<button type="button" class="ink'+(brushColor===i?' active':'')+'" data-ink="'+i+'" style="--swatch:'+hex+'" title="Цвет '+(i+1)+'" aria-label="Цвет '+(i+1)+'"></button>').join('');
 root.innerHTML='<section class="scene">'+roundHead('РИСОВАНИЕ')+prompt()+'<div class="editor-grid"><div class="workshop"><div class="stage-wrap'+(ready?' finished':'')+'">'+artboard(draft,!ready,'canvas')+'<div class="meta"><span>ХОЛСТ · '+(ready?'СДАНО':'РИСУЙ ПАЛЬЦЕМ')+'</span><span id="pieceCount">'+draft.length+' / '+(state.maxMarks||MAX_MARKS)+' ОТПЕЧАТКОВ</span></div></div><div class="button-row"><button class="btn tiny" data-action="save">↓ SVG</button>'+(ready?'<span class="eyebrow">РИСУНОК ГОТОВ</span>':'<button class="btn tiny" data-action="undo" '+(!history.length?'disabled':'')+'>↶ ОТМЕНИТЬ МАЗОК</button><button class="btn tiny" data-action="clear" '+(!draft.length?'disabled':'')+'>ОЧИСТИТЬ</button>')+'</div></div>'+
 (ready?'<aside class="editor-tools"><div class="ready-figure"><h2>Рисунок сдан.</h2><p>Он останется на экране до общего голосования.</p><div class="ready-track">'+state.players.map(p=>'<span class="'+(state.ready.includes(p.id)?'done':'')+'" title="'+esc(p.name)+'"></span>').join('')+'</div><div class="eyebrow">'+state.ready.length+' / '+state.players.length+' ГОТОВО</div></div></aside>':
 '<aside class="editor-tools"><p class="tool-note">ТВОИ КИСТИ · КАЖДОЙ МОЖНО РИСОВАТЬ СКОЛЬКО УГОДНО</p><div class="palette" role="group" aria-label="Кисти">'+items+'</div><div class="tools"><div class="brush-controls"><div class="brush-active">'+(brush>=0?pieceSVG(brush,brushColor):'')+'</div><div class="brush-settings"><div class="selected-name" id="selectedName">'+(eraser?'Ластик':brush>=0?esc(pieceInfo(brush).name):'Выбери кисть')+'</div><label class="label" for="brushSize">РАЗМЕР <span id="brushSizeValue">'+Math.round(brushSize*100)+'%</span></label><input id="brushSize" class="brush-size" type="range" min="0.35" max="1.55" step="0.05" value="'+brushSize+'"></div></div><div class="ink-picker" role="group" aria-label="Цвет кисти">'+inks+'</div><div class="tool-group"><button class="btn tiny'+(eraser?' selected':'')+'" data-action="erase">⌫ ЛАСТИК</button><button class="btn tiny" data-action="paint">✦ РИСОВАТЬ</button></div></div><div class="editor-action"><span class="eyebrow">ДВИЖЕНИЕ — МАЗОК. ТАП — ОТПЕЧАТОК.</span><button class="btn hot" data-action="publish" '+(!draft.length||!connected?'disabled':'')+'>СДАТЬ РИСУНОК →</button></div></aside>')+'</div></section>';
 updateClock();
}
function galleryCard(g,reveal=false){
 const own=g.mine,selectable=!own&&state.phase==='vote'&&!state.myVote;
 return '<button class="art-entry'+(own?' own':'')+(chosen===g.index?' picked':'')+(reveal&&g.points>0?' winner':'')+'" data-entry="'+g.index+'" '+(!selectable?'disabled':'')+'><span class="entry-title"><span>ЭКСПОНАТ №'+String(g.index+1).padStart(2,'0')+'</span><span>'+((reveal&&g.name)?esc(g.name):own?'ТВОЙ':'? ? ?')+'</span></span>'+artboard(g.board||[])+'<div class="entry-foot">'+(reveal?'<b>'+g.points+' ОЧКОВ · '+g.votes+' ГОЛОСОВ</b>':own?'СВОЙ ЭКСПОНАТ':(state.players.length===2?'ОЦЕНИ РАБОТУ':'НАЖМИ ДЛЯ ВЫБОРА'))+'</div></button>';
}
function renderVote(){
 if(state.players.length===2&&chosen<0)chosen=state.gallery.find(g=>!g.mine)?.index??-1;
 const submitted=Boolean(state.myVote);
 root.innerHTML='<section class="scene">'+roundHead('ГОЛОСОВАНИЕ')+prompt()+'<p class="lede">'+(state.players.length===2?'Вдвоём голосовать за единственную чужую работу бессмысленно. Поэтому оцени её от 1 до 5.':'Выбери одну картину, которая лучше всего попала в описание. Авторы скрыты. За свою нельзя.')+'</p><div class="vote-grid">'+state.gallery.map(g=>galleryCard(g)).join('')+'</div>'+
 '<div class="vote-footer"><div>'+(submitted?'<b>ТВОЙ ГОЛОС ПРИНЯТ</b><div class="subdued">Ждём остальных. Все работы уже открыты для просмотра.</div>':
 (state.players.length===2?'<div class="eyebrow">ОЦЕНКА ЧУЖОЙ КАРТИНЫ / 1–5</div><div class="stars">'+[1,2,3,4,5].map(n=>'<button class="btn tiny'+(stars===n?' selected':'')+'" data-stars="'+n+'" aria-label="Оценка '+n+'">'+n+'</button>').join('')+'</div>':'<b>ВЫБРАНО: '+(chosen<0?'ПОКА НИЧЕГО':'№'+String(chosen+1).padStart(2,'0'))+'</b>'))+'</div>'+
 (submitted?'<button class="btn" data-action="save-voted">СОХРАНИТЬ СВОЁ SVG</button>':'<button class="btn hot" data-action="vote" '+(chosen<0||!connected?'disabled':'')+'>ПОДТВЕРДИТЬ ГОЛОС →</button>')+'</div></section>';
 updateClock();
}
function renderReveal(){
 const last=state.history?.at(-1),winners=last?.winners||[];
 const names=winners.map(id=>state.players.find(p=>p.id===id)?.name||'Участник');
 root.innerHTML='<section class="scene result">'+roundHead('РАЗОБЛАЧЕНИЕ')+prompt()+'<div class="result-winner">'+(names.length?'ЛУЧШАЯ ЧУШЬ РАУНДА: '+esc(names.join(' + ')):'ГОЛОСОВ НЕТ · ВСЕ ПО-СВОЕМУ ПРЕКРАСНЫ')+'</div><div class="vote-grid">'+(state.gallery||[]).map(g=>galleryCard(g,true)).join('')+'</div><div class="button-row"><button class="btn hot" data-action="next" '+(state.host!==me?.id?'disabled':'')+'>'+(state.host===me?.id?'СЛЕДУЮЩИЙ РАУНД →':'СКОРО НОВЫЙ РАУНД')+'</button><button class="btn" data-action="save-voted">СОХРАНИТЬ СВОЁ SVG</button></div></section>';
 updateClock();
}
function scores(){
 return Object.entries(state.scores||{}).map(([id,score])=>({id,score,name:state.players.find(p=>p.id===id)?.name||'Игрок'})).sort((a,b)=>b.score-a.score);
}
function renderResults(){
 const ranks=scores(),max=ranks[0]?.score||0;
 root.innerHTML='<section class="scene"><div class="eyebrow">АПЛОДИСМЕНТЫ / СПАСИБО ЗА УЧАСТИЕ</div><h1 class="display">ВЕЛИКАЯ ЧУШЬ<br>СОСТОЯЛАСЬ.</h1><p class="lede">'+(max?'Победитель: '+esc(ranks.filter(r=>r.score===max).map(r=>r.name).join(' + '))+'.':'Никто не голосовал — это тоже концептуальное искусство.')+'</p><div class="score-list">'+ranks.map((r,i)=>'<div class="score"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><div><b>'+esc(r.name)+'</b><small>'+(r.id===me?.id?'ТВОЙ РЕЗУЛЬТАТ':'УЧАСТНИК')+'</small></div><span class="points">'+r.score+'</span></div>').join('')+'</div><h2>ГАЛЕРЕЯ СЦЕН</h2><div class="history">'+(state.history||[]).map(h=>'<div class="history-line"><b>'+h.round+'. '+esc(h.prompt)+'</b><span>'+esc(h.works?.filter(w=>h.winners.includes(w.id)).map(w=>w.name).join(', ')||'Без победителя')+'</span></div>').join('')+'</div><div class="button-row"><button class="btn hot" data-action="again" '+(state.host!==me?.id||!connected?'disabled':'')+'>'+(state.host===me?.id?'СЫГРАТЬ ЕЩЁ ↗':'ЖДЁМ ВЕДУЩЕГО')+'</button><button class="btn" data-action="leave">ПОКИНУТЬ КОМНАТУ</button></div></section>';
}
function render(){
 if(!state)return renderMenu();
 if(state.phase==='lobby')renderLobby();
 else if(state.phase==='compose')renderCompose();
 else if(state.phase==='vote')renderVote();
 else if(state.phase==='reveal')renderReveal();
 else renderResults();
}
function updateClock(){
 const node=document.querySelector('#timer');if(!node||!state?.deadline)return;
 const sec=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
 node.textContent=Math.floor(sec/60).toString().padStart(2,'0')+':'+(sec%60).toString().padStart(2,'0');
 node.classList.toggle('urgent',sec<=15);
}
function setState(next){
 if(!next||!Array.isArray(next.players)||!next.phase)return;
 const newScene=next.phase!==lastPhase||next.round!==lastRound;
 const wasReady=state?.ready?.includes(me?.id),previousReadyCount=state?.ready?.length??0;
 state=next;
 if(newScene){
  lastRound=next.round;lastPhase=next.phase;
  brush=next.deck?.[0]??-1;brushColor=brush>=0?pieceInfo(brush).variant:0;brushSize=.65;eraser=false;history=[];drag=null;chosen=-1;stars=3;draft=cloneBoard(next.myBoard||[]);
  render();tone(next.phase==='reveal'?840:430);return;
 }
 if(next.phase==='compose'){
  const ready=next.ready?.includes(me?.id);
  if(ready!==wasReady||(ready&&(next.ready?.length??0)!==previousReadyCount))render();
  else updateClock(); // do not replace the canvas or lose pointer capture on echoed edits
  return;
 }
 if(next.phase==='vote'&&state.myVote&&document.querySelector('[data-action="vote"]')){render();return;}
 if(['reveal','results','lobby'].includes(next.phase))render();
 updateClock();
}
function loading(message){root.innerHTML='<div class="loading">'+esc(message)+'</div>';}
function joined(message){
 roomId=message.roomId;roomCode=(roomId||'').slice(0,8).toUpperCase();
 state=null;lastPhase='';lastRound=0;loading('ЗАХОДИМ В ТЕАТР…');
 const url=new URL(location.href);url.searchParams.set('room',roomCode);window.history.replaceState(null,'',url.pathname+url.search);
 try{net.sendGame({type:'sync'});}catch{notify('Не получается получить состояние комнаты.');}
}
function disconnect(leave=true){
 serial++;clearTimeout(sendTimer);sendTimer=0;
 if(net){if(leave&&state)try{net.leaveRoom();}catch{}net.close();}
 net=null;activeToken=null;me=null;state=null;roomId='';connected=false;connecting=false;drag=null;lastPhase='';lastRound=0;
 if(leave)storage.removeItem('pocket-net:'+SERVER);
 window.history.replaceState(null,'',location.pathname);
 status(health?'СЕТЬ ГОТОВА':'НЕТ СВЯЗИ',health?'good':'bad');render();
}
const netErrors={room_not_found:'Комната не найдена. Проверь код.',room_full:'Уже восемь игроков.',match_in_progress:'Игра уже идёт, присоединяйся в следующую партию.',game_unavailable:'Сетевая версия ЧУШИ ещё не опубликована.',room_version_unavailable:'Версия этой комнаты больше недоступна.',rate_limited:'Слишком часто. Попробуй ещё раз.',server_at_capacity:'Слишком много открытых комнат.',not_in_room:'Ты покинул комнату.',invalid_token:'Сессия истекла.'};
async function connect(mode){
 if(connecting)return;
 const input=root.querySelector('#playerName');
 const chosenName=(profile?.nickname||input?.value||name).trim().slice(0,22);
 if(!chosenName){notify('Введи имя.');return;}
 name=chosenName;if(!profile)try{localStorage.setItem(STORE+'name',name);}catch{}
 const target=String(root.querySelector('#roomCode')?.value||roomCode).trim().toUpperCase();
 if(mode==='join'&&!(/^[0-9A-F]{8}$/.test(target)||/^[0-9A-F-]{36}$/.test(target))){notify('Код состоит из восьми символов.');return;}
 roomCode=target;if(net)disconnect(false);
 connecting=true;const current=++serial;loading('СВЯЗЫВАЕМСЯ С POCKETNET…');status('ПОДКЛЮЧЕНИЕ');
 try{
  if(storage.getItem('last-name')!==name)storage.removeItem('pocket-net:'+SERVER);
  storage.setItem('last-name',name);
  if(mode!=='resume')storage.removeItem('pocket-net:'+SERVER);
  await distinctTab();
  const client=new PocketNet({serverUrl:SERVER,name,storage});net=client;
  client.on('connected',info=>{if(net!==client)return;me=info.player;connected=true;activeToken=client.token;status('В СЕТИ','good');if(state)render();});
  client.on('room_joined',info=>{if(net!==client)return;connecting=false;joined(info);});
  client.on('game_event',pack=>{if(net!==client)return;if(pack.event?.type==='state')setState(pack.event.payload);else if(pack.event?.type==='notice')notify(pack.event.payload);});
  client.on('presence',()=>{if(net===client&&state)try{client.sendGame({type:'sync'});}catch{}});
  client.on('disconnected',()=>{if(net!==client)return;connected=false;status('ВОССТАНОВЛЕНИЕ','bad');if(state)render();});
  client.on('room_closed',()=>{if(net!==client)return;disconnect(false);notify('Комната закрылась.');});
  client.on('error',e=>{if(net!==client)return;notify(netErrors[e.code]||e.message||e.code||'Ошибка связи');if(connecting)disconnect(false);});
  await Promise.race([client.connect(),new Promise((_,rej)=>setTimeout(()=>rej(Error('Сервер не ответил за 12 секунд.')),12000))]);
  if(current!==serial)return;
  if(mode==='create')client.createRoom('chush');else if(mode==='join')client.joinRoom(target);else if(!client.roomId)throw Error('Нет предыдущей комнаты.');
 }catch(e){if(current!==serial)return;disconnect(false);notify(e.message||'Не удалось подключиться.');}
}
function send(payload){
 if(!connected||!net){notify('Потеряна связь с комнатой.');return false;}
 try{net.sendGame(payload);return true;}catch{notify('Не удалось отправить действие.');return false;}
}
function pushBoard(){clearTimeout(sendTimer);sendTimer=0;if(state?.phase==='compose'&&!state.ready.includes(me?.id))send({type:'edit',board:draft});}
function queueBoard(){clearTimeout(sendTimer);sendTimer=setTimeout(pushBoard,480);}
function checkpoint(){history.push(cloneBoard(draft));if(history.length>36)history.shift();}
function pointFromEvent(e,bounds){
 return {x:Math.round(Math.max(0,Math.min(100,(e.clientX-bounds.left)/bounds.width*100))*10)/10,y:Math.round(Math.max(0,Math.min(100,(e.clientY-bounds.top)/bounds.height*100))*10)/10};
}
function paint(){
 const stage=document.querySelector('#canvas');
 if(stage)stage.innerHTML=draft.map((p,i)=>box(p,i)).join('')+(!draft.length?'<div class="empty-hint">РИСУЙ ПО ХОЛСТУ</div>':'');
 const counter=document.querySelector('#pieceCount');if(counter)counter.textContent=draft.length+' / '+(state.maxMarks||MAX_MARKS)+' ОТПЕЧАТКОВ';
 const undo=document.querySelector('[data-action="undo"]');if(undo)undo.disabled=!history.length;
 const clear=document.querySelector('[data-action="clear"]');if(clear)clear.disabled=!draft.length;
 const publish=document.querySelector('[data-action="publish"]');if(publish)publish.disabled=!draft.length||!connected;
}
function updateBrushUI(){
 document.querySelectorAll('[data-brush]').forEach(el=>el.classList.toggle('chosen',Number(el.dataset.brush)===brush&&!eraser));
 document.querySelectorAll('[data-ink]').forEach(el=>el.classList.toggle('active',Number(el.dataset.ink)===brushColor));
 const node=document.querySelector('.brush-active');if(node)node.innerHTML=brush>=0?pieceSVG(brush,brushColor):'';
 const label=document.querySelector('#selectedName');if(label)label.textContent=eraser?'Ластик':brush>=0?pieceInfo(brush).name:'Выбери кисть';
 document.querySelector('[data-action="erase"]')?.classList.toggle('selected',eraser);
 document.querySelector('[data-action="paint"]')?.classList.toggle('selected',!eraser);
 const meter=document.querySelector('#brushSizeValue');if(meter)meter.textContent=Math.round(brushSize*100)+'%';
}
function placeMark(x,y){
 const max=state?.maxMarks||MAX_MARKS;
 if(draft.length>=max){if(drag&&!drag.limitNotified){notify('Холст заполнен. Можно стереть или отменить мазок.');drag.limitNotified=true;}return false;}
 if(brush<0)return false;
 draft.push({t:brush,x,y,r:0,s:brushSize,f:0,c:brushColor});
 return true;
}
function eraseAt(x,y){
 const radius=Math.max(3.5,Math.min(12,brushSize*12));
 let changed=false;
 for(let i=draft.length-1;i>=0;i--){
  const p=draft[i];
  if(Math.hypot(p.x-x,p.y-y)<=radius){draft.splice(i,1);changed=true;}
 }
 return changed;
}
function strokePoint(x,y){
 const changed=eraser?eraseAt(x,y):placeMark(x,y);
 if(changed){paint();queueBoard();}
 return changed;
}
function boardSVG(items){
 const parts=items.map(p=>{const flip=p.f===1?-1:1;return '<g transform="translate('+p.x*6+' '+p.y*6+') rotate('+p.r+') scale('+(p.s*flip)+' '+p.s+') translate(-72 -72)"><svg x="0" y="0" width="144" height="144" viewBox="0 0 100 100">'+pieceSVG(p.t,p.c)+'</svg></g>';}).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#fffef6"/>'+parts+'</svg>';
}
function downloadBoard(){
 let board=draft;
 if(state?.phase==='vote'||state?.phase==='reveal'){const own=state.gallery?.find(g=>g.mine);board=own?.board||[];}
 if(!board?.length){notify('Здесь пока нечего сохранять.');return;}
 const blob=new Blob([boardSVG(board)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='chush-round-'+(state?.round||1)+'.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('SVG готов.');tone(730);
}
function confirmAction(title,message,callback){
 confirmCallback=callback;modal.classList.remove('hidden');modal.innerHTML='<div class="dialog-box"><h2>'+esc(title)+'</h2><p>'+esc(message)+'</p><div class="dialog-actions"><button class="btn" data-confirm="no">ОТМЕНА</button><button class="btn hot" data-confirm="yes">ПОДТВЕРДИТЬ</button></div></div>';modal.querySelector('[data-confirm=no]')?.focus();
}
function closeDialog(){modal.classList.add('hidden');modal.textContent='';confirmCallback=null;}
modal.addEventListener('click',e=>{const b=e.target.closest('[data-confirm]');if(!b)return;const f=confirmCallback;closeDialog();if(b.dataset.confirm==='yes')f?.();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))closeDialog();});
async function copy(value){
 try{await navigator.clipboard.writeText(value);}catch{const ta=document.createElement('textarea');ta.value=value;ta.style.cssText='position:fixed;opacity:0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok){notify('Не удалось скопировать.');return;}}
 notify('Скопировано.');tone(740);
}
root.addEventListener('click',e=>{
 const item=e.target.closest('[data-brush]');if(item&&!item.disabled){brush=Number(item.dataset.brush);brushColor=pieceInfo(brush).variant;eraser=false;updateBrushUI();tone(500);return;}
 const colorButton=e.target.closest('[data-ink]');if(colorButton){brushColor=Number(colorButton.dataset.ink);eraser=false;updateBrushUI();tone(480);return;}
 const card=e.target.closest('[data-entry]');if(card&&!card.disabled&&state.phase==='vote'&&!state.myVote){chosen=Number(card.dataset.entry);document.querySelectorAll('.art-entry').forEach(el=>el.classList.toggle('picked',Number(el.dataset.entry)===chosen));const voteBtn=document.querySelector('[data-action=vote]');if(voteBtn)voteBtn.disabled=false;const word=document.querySelector('.vote-footer b');if(word)word.textContent='ВЫБРАНО: №'+String(chosen+1).padStart(2,'0');tone(490);return;}
 const star=e.target.closest('[data-stars]');if(star){stars=Number(star.dataset.stars);document.querySelectorAll('[data-stars]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.stars)===stars));tone(380+stars*75);return;}
 const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(['create','join','resume'].includes(action)){connect(action);return;}
 if(action==='retry'){checkHealth();return;}
 if(action==='sound'){sound=!sound;try{localStorage.setItem(STORE+'sound',sound?'on':'off');}catch{}render();return;}
 if(action==='copy-code'){copy(roomCode);return;}
 if(action==='copy-link'){copy(new URL('./?room='+encodeURIComponent(roomCode),location.href).href);return;}
 if(action==='start'||action==='again'||action==='next'){send({type:action});tone(660);return;}
 if(action==='publish'){
  if(!draft.length)return;
  confirmAction('Выставить работу?','После сдачи рисунок нельзя изменить. Галерея откроется после остальных работ.',()=>{clearTimeout(sendTimer);send({type:'publish',board:draft});});
  return;
 }
 if(action==='vote'){
  if(chosen<0)return;
  confirmAction('Отдать голос?','Решение окончательное. Авторы откроются после окончания голосования.',()=>{if(send({type:'vote',entry:chosen,stars})){const b=document.querySelector('[data-action=vote]');if(b)b.disabled=true;}});
  return;
 }
 if(action==='save'||action==='save-voted'){downloadBoard();return;}
 if(action==='undo'){if(!history.length)return;draft=history.pop();paint();queueBoard();tone(360);return;}
 if(action==='clear'){if(!draft.length)return;confirmAction('Очистить рисунок?','Все отпечатки будут удалены. Это действие можно отменить.',()=>{checkpoint();draft=[];paint();queueBoard();tone(280);});return;}
 if(action==='erase'){eraser=true;updateBrushUI();tone(340);return;}
 if(action==='paint'){eraser=false;updateBrushUI();tone(520);return;}
 if(action==='leave'){confirmAction('Покинуть театр?','Ты выйдешь из партии. Остальные продолжат без тебя, если смогут.',()=>disconnect(true));}
});
root.addEventListener('input',e=>{if(e.target.id==='roomCode')roomCode=e.target.value=e.target.value.toUpperCase().replace(/\s/g,'');});
root.addEventListener('change',e=>{
 if(e.target?.id==='brushSize'){brushSize=Number(e.target.value);updateBrushUI();}
});
root.addEventListener('input',e=>{
 if(e.target?.id==='brushSize'){brushSize=Number(e.target.value);updateBrushUI();}
});
root.addEventListener('pointerdown',e=>{
 if(state?.phase!=='compose'||state.ready.includes(me?.id))return;
 const stage=e.target.closest('#canvas');if(!stage||e.button>0)return;
 e.preventDefault();
 const bounds=stage.getBoundingClientRect(),p=pointFromEvent(e,bounds);
 checkpoint();drag={pointer:e.pointerId,stage,bounds,last:p,moved:false,modified:false,limitNotified:false};
 try{stage.setPointerCapture(e.pointerId);}catch{}
 if(strokePoint(p.x,p.y))drag.modified=true;
});
root.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.pointer)return;
 e.preventDefault();
 const pos=pointFromEvent(e,drag.bounds),start=drag.last;
 const length=Math.hypot(pos.x-start.x,pos.y-start.y);
 const spacing=eraser?Math.max(2,brushSize*5):Math.max(2.8,brushSize*6.7);
 if(length<spacing)return;
 const count=Math.floor(length/spacing);
 for(let i=1;i<=count;i++){
  const ratio=i*spacing/length;
  const x=Math.round((start.x+(pos.x-start.x)*ratio)*10)/10,y=Math.round((start.y+(pos.y-start.y)*ratio)*10)/10;
  if(strokePoint(x,y))drag.modified=true;
 }
 drag.last={x:Math.round((start.x+(pos.x-start.x)*(count*spacing/length))*10)/10,y:Math.round((start.y+(pos.y-start.y)*(count*spacing/length))*10)/10};
 drag.moved=true;
});
function release(e){
 if(!drag||drag.pointer!==e.pointerId)return;
 try{drag.stage.releasePointerCapture(e.pointerId);}catch{}
 const wasChanged=drag.modified;
 if(!wasChanged)history.pop();
 drag=null;
 if(wasChanged)pushBoard();paint();
}
root.addEventListener('pointerup',release);root.addEventListener('pointercancel',release);

window.addEventListener('pagehide',()=>{activeToken=null;clearTimeout(sendTimer);});
window.addEventListener('focus',async()=>{if(state)return;await loadProfile();render();});
setInterval(()=>{updateClock();if(connected&&state&&me?.id===state.host&&state.deadline)try{net.sendGame({type:'pulse'});}catch{}},1800);
render();(async()=>{await loadProfile();if(!state&&!connecting)render();await checkHealth();})();
