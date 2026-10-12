import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {GLYPHS,glyphSVG} from './symbols.js';
installMobileRuntime();

const root=document.querySelector('#view');
const indicator=document.querySelector('#connection');
const toastNode=document.querySelector('#toast');
const modal=document.querySelector('#modal');
const SERVER=location.origin+'/pocketnet';
const STORE='pocket-works:picto:';
const params=new URLSearchParams(location.search);
let typedCode=(params.get('room')||'').trim().toUpperCase();
let savedName='Гость',profile=null,net=null,me=null,state=null,roomId='',code='';
let connected=false,health=null,connecting=false,draft=[],selected=-1,undo=[],drag=null;
let lastPhase='',lastAuthor='',pendingSend=0,toastTimer=0,confirmAction=null,requestSerial=0;
let soundEnabled=true;
try{savedName=localStorage.getItem(STORE+'name')||savedName;soundEnabled=localStorage.getItem(STORE+'sound')!=='off';}catch{}
const memory=new Map();
const adapter={
 getItem(k){try{return sessionStorage.getItem(STORE+'guest:'+k);}catch{return memory.get(k)||null;}},
 setItem(k,v){try{sessionStorage.setItem(STORE+'guest:'+k,v);}catch{memory.set(k,v);}},
 removeItem(k){try{sessionStorage.removeItem(STORE+'guest:'+k);}catch{memory.delete(k);}}
};
const tabChannel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(STORE+'tokens'):null;
let activeToken=null;
tabChannel?.addEventListener('message',event=>{
 const m=event.data;
 if(m?.type==='claim'&&activeToken&&m.token===activeToken)tabChannel.postMessage({type:'owned',nonce:m.nonce});
});
async function ensureUniqueTab(){
 const key='pocket-net:'+SERVER;
 let prior;try{prior=JSON.parse(adapter.getItem(key)||'null');}catch{}
 if(!prior?.token||!tabChannel)return;
 const nonce=crypto.randomUUID();
 const dup=await new Promise(resolve=>{
  const listener=e=>{if(e.data?.type==='owned'&&e.data.nonce===nonce){cleanup();resolve(true);}};
  const cleanup=()=>{clearTimeout(timer);tabChannel.removeEventListener('message',listener);};
  tabChannel.addEventListener('message',listener);
  const timer=setTimeout(()=>{cleanup();resolve(false);},180);
  tabChannel.postMessage({type:'claim',token:prior.token,nonce});
 });
 if(dup)adapter.removeItem(key);
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function notify(message){
 clearTimeout(toastTimer);toastNode.textContent=message;toastNode.classList.add('show');
 toastTimer=setTimeout(()=>toastNode.classList.remove('show'),3700);
}
function status(message,kind=''){indicator.textContent=message;indicator.className='connection '+kind;}
function playTone(freq=660){
 if(!soundEnabled)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=window.__pictoAudio||(window.__pictoAudio=new Audio());if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,ac.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.83,ac.currentTime+.11);g.gain.setValueAtTime(.02,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.14);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.15);}catch{}
}
async function loadProfile(){
 try{
  const res=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)throw Error('id unavailable');
  const data=await res.json();
  profile=data.user?.complete?data.user:null;
  if(profile?.nickname)savedName=profile.nickname;
 }catch{profile=null;}
}
async function checkHealth(){
 status('Проверка PocketNet');
 try{
  const res=await fetch(SERVER+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!res.ok)throw Error();
  const data=await res.json();
  health=data.ok&&data.modules?.includes('picto');
  status(health?'Сеть готова':'Модуль ожидает публикации',health?'ok':'bad');
 }catch{health=false;status('Нет соединения','bad');}
 if(!state&&!connecting)render();
}
function stampHTML(g,i,active=false){
 const selectedClass=active&&selected===i?' selected':'';
 return '<span class="stamp'+selectedClass+'" data-stamp="'+i+'" style="left:'+g.x+'%;top:'+g.y+'%;transform:translate(-50%,-50%) rotate('+g.r+'deg) scale('+g.s+')">'+glyphSVG(g.id)+'</span>';
}
function boardHTML(items,interactive=false,stageId='liveStage'){
 return '<div class="stage'+(interactive?'':' readonly')+'" id="'+stageId+'" '+(interactive?'data-gesture-surface data-block-callout':'')+' aria-label="Композиция из пиктограмм">'+items.map((g,i)=>stampHTML(g,i,interactive)).join('')+'</div>';
}
function boardPanel(items,interactive){
 return '<div class="board-panel"><div class="stage-frame">'+boardHTML(items,interactive)+'</div><div class="board-foot"><span>СТУДИЯ / 01</span><span>'+items.length+' / 26 ЗНАКОВ</span></div></div>';
}
function playerList(){
 const players=state?.players||[];
 return '<div class="roster"><h2>Участники · '+players.length+'/8</h2>'+players.map((p,i)=>
  '<div class="player"><span class="player-mark">'+String(i+1).padStart(2,'0')+'</span><span>'+esc(p.name)+(p.id===me?.id?' (ты)':'')+'</span><small>'+(p.id===state.host?'ведущий':'готов')+'</small></div>'
 ).join('')+'</div>';
}
function renderMenu(){
 const named=profile?.nickname||savedName;
 const profileLine=profile?
  '<div class="account-note"><span class="account-dot"></span> Pocket ID · '+esc(profile.nickname)+'</div>':
  '<p class="small-note">Гостевой вход разрешён. Аккаунт можно создать в PocketWorks.</p>';
 const resume=(()=>{try{return Boolean(JSON.parse(adapter.getItem('pocket-net:'+SERVER)||'null')?.roomId);}catch{return false;}})();
 root.innerHTML='<section class="screen hero">'+
  '<div class="hero-cover"><div class="micro">АТЕЛЬЕ НЕВОЗМОЖНЫХ СООБЩЕНИЙ · № 001</div>'+
  '<h1>ПИК<b>ТО</b></h1><div class="hero-demo">'+glyphSVG('bird')+'</div>'+
  '<p>Ни одного слова на холсте. Сколько угодно способов понять друг друга.</p></div>'+
  '<div class="menu-pane"><div class="micro">PICK / PLACE / GUESS</div><h2>Собери смысл.<br>Пусть угадают.</h2>'+
  '<p class="small-note">2–8 друзей · 6 видов загадок · смысл важнее совпадения значков.</p>'+
  '<div><label class="label" for="playerName">Твоё имя</label><input class="field" id="playerName" maxlength="22" autocomplete="nickname" value="'+esc(named)+'" '+(profile?'disabled':'')+'></div>'+profileLine+
  '<button class="btn primary full" data-action="create">Создать комнату ↗</button><div class="rule"></div>'+
  '<div><label class="label" for="roomCode">Код комнаты друга</label><input class="field field-code" id="roomCode" maxlength="36" placeholder="A17D0C9E" autocomplete="off" spellcheck="false" value="'+esc(typedCode)+'"></div>'+
  '<button class="btn blue full" data-action="join">Присоединиться →</button>'+
  (resume?'<button class="btn quiet full" data-action="resume">Вернуться в прежнюю комнату</button>':'')+
  (health===false?'<button class="btn quiet full" data-action="retry">Проверить PocketNet снова</button>':'')+
  '<button class="btn quiet slim" data-action="sound">Звук: '+(soundEnabled?'включён':'выключен')+'</button>'+
  '</div></section>';
}
function renderLobby(){
 const count=state.players.length,host=state.host===me?.id;
 root.innerHTML='<section class="screen"><div class="section-head"><div><span class="micro">КОМНАТА / ПОДГОТОВКА</span><h1>Собираем компанию.</h1><p>Каждый хотя бы раз станет автором знакового сообщения. Разгадываем вместе.</p></div></div>'+
  '<div class="room-grid"><div class="ticket"><span class="micro">КОД-ПРИГЛАШЕНИЕ</span><div class="ticket-code" data-selectable>'+esc(code||'········')+'</div>'+
  '<div class="ticket-actions"><button class="btn slim" data-action="copy-code">Скопировать код</button><button class="btn slim" data-action="copy-link">Ссылка другу</button></div>'+
  '<div class="rule"></div><p class="small-note">Покажи друзьям ссылку: они зайдут через свой браузер. Без отдельного приложения и настройки сервера.</p></div>'+playerList()+'</div>'+
  '<div class="room-footer"><button class="btn primary" data-action="start" '+(!host||count<2||!connected?'disabled':'')+'>'+(host?'Начать игру':'Ждём ведущего')+' →</button><button class="btn quiet" data-action="leave">Покинуть комнату</button></div></section>';
}
function phaseTop(title,subtitle){
 return '<div class="round-top"><div><span class="micro">РАУНД '+state.round+' / '+state.maxRounds+' · '+esc(subtitle)+'</span><h1>'+esc(title)+'</h1></div><div class="timer" id="timer">—</div></div>';
}
function renderCompose(){
 const author=state.author===me?.id;
 const authorName=state.players.find(p=>p.id===state.author)?.name||'Автор';
 const items=author?draft:state.board;
 const prompt=author?(state.prompt||'Получаем фразу…'):'Смотри, как рождается сообщение';
 const promptBar='<div class="prompt-strip"><div><span class="micro">'+(author?'ТВОЯ СЕКРЕТНАЯ ФРАЗА':'РАБОТАЕТ '+esc(authorName))+'</span><br><b>'+esc(prompt)+'</b></div>'+(author?'<button class="variant-peek" data-action="variants">4 смысла ↗</button>':'<span class="micro">НАБЛЮДАЙ</span>')+'</div>';
 const palette=GLYPHS.map(g=>'<button class="glyph-btn" type="button" data-glyph="'+g[0]+'" title="'+esc(g[1])+'" aria-label="Добавить: '+esc(g[1])+'">'+glyphSVG(g[0])+'</button>').join('');
 const toolbox=author?'<aside class="toolbox"><div class="toolbox-head"><span>АЛФАВИТ</span><span id="glyphHint">34 ЗНАКА</span></div>'+
  '<div class="palette">'+palette+'</div><div class="tools-row">'+
  '<button class="btn" data-action="rotate-left" title="Повернуть влево" aria-label="Повернуть влево" '+(selected<0?'disabled':'')+'>↶</button>'+
  '<button class="btn" data-action="rotate-right" title="Повернуть вправо" aria-label="Повернуть вправо" '+(selected<0?'disabled':'')+'>↷</button>'+
  '<button class="btn" data-action="shrink" title="Уменьшить" aria-label="Уменьшить" '+(selected<0?'disabled':'')+'>−</button>'+
  '<button class="btn" data-action="grow" title="Увеличить" aria-label="Увеличить" '+(selected<0?'disabled':'')+'>＋</button></div>'+
  '<div class="toolbox-actions"><button class="btn quiet slim" data-action="undo" '+(!undo.length?'disabled':'')+'>Отменить</button>'+
  '<button class="btn quiet slim" data-action="delete" '+(selected<0?'disabled':'')+'>Убрать знак</button>'+
  '<button class="btn primary slim" data-action="publish" '+(!draft.length||!connected?'disabled':'')+'>Показать друзьям ↗</button></div></aside>':
  '<aside class="toolbox"><div class="micro">СООБЩЕНИЕ В ПРОЦЕССЕ</div><p>Автор двигает символы вживую. Вскоре появятся четыре возможные расшифровки.</p>'+
  '<div class="wait-box">Автор: <b>'+esc(authorName)+'</b><br>Знаков сейчас: <b>'+items.length+'</b></div>'+
  '<button class="btn quiet slim" data-action="leave">Покинуть игру</button></aside>';
 root.innerHTML='<section class="game-shell">'+phaseTop(author?'Твоя очередь объяснять':'Скоро разгадываем','КОМПОЗИЦИЯ')+promptBar+
  '<div class="editor-layout">'+boardPanel(items,author)+toolbox+'</div></section>';
 updateClock();
}
function renderGuess(){
 const author=state.author===me?.id;
 const did=state.answered.includes(me?.id);
 const options=state.options||[];
 const optionHtml=author?'<div class="wait-box">Ты автор этой работы. Друзья пытаются расшифровать твою мысль. Ответ появится после голосования.</div>':
 options.map((opt,i)=>'<button class="option '+(state.myAnswer===i?'selected':'')+'" data-choice="'+i+'" '+(did||!connected?'disabled':'')+'><small>'+(i+1)+'</small>'+esc(opt)+'</button>').join('');
 root.innerHTML='<section class="game-shell">'+phaseTop('Что это значит?','РАСШИФРОВКА')+
  '<div class="prompt-strip"><b>'+(did?'Ответ принят — ждём остальных':author?'Твоё сообщение готово':'Выбери одну интерпретацию')+'</b><span class="micro">'+state.answered.length+' / '+(state.players.length-1)+' ОТВЕТОВ</span></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+optionHtml+
  '<button class="btn quiet slim" data-action="leave">Выйти из комнаты</button></div></div></section>';
 updateClock();
}
function renderReveal(){
 const result=state.history?.at(-1);
 const correct=state.correct;
 const peers=state.players.filter(p=>p.id!==state.author).map(p=>{
  const answer=state.answers[p.id];const isRight=answer===correct;
  return '<span class="answer-pill '+(answer===undefined?'':isRight?'yes':'no')+'">'+esc(p.name)+': '+(answer===undefined?'не ответил':isRight?'угадал':'другая версия')+'</span>';
 }).join('');
 root.innerHTML='<section class="game-shell">'+phaseTop('А вот что имелось в виду','РАСКРЫТИЕ')+
  '<div class="reveal-head"><div><span class="micro">ЗАГАДАННАЯ ФРАЗА</span><h2>'+esc(state.options[correct]||'—')+'</h2></div><strong>'+(result?.correct||0)+' / '+(result?.total||0)+'</strong></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+
  state.options.map((o,i)=>'<div class="option '+(i===correct?'correct':'wrong')+'"><small>'+(i+1)+'</small>'+esc(o)+'</div>').join('')+
  '<div class="reveal-peers">'+peers+'</div>'+
  (state.host===me?.id?'<button class="btn primary" data-action="next">Следующий этап →</button>':'<p class="small-note">Следующий этап начнётся автоматически.</p>')+
  '</div></div></section>';
 updateClock();
}
function renderResults(){
 const gallery=(state.history||[]).map((g,i)=>'<article class="gallery-card"><span class="micro">№ '+String(i+1).padStart(2,'0')+'</span>'+
  boardHTML(g.board,false,'gallery-'+i)+'<h3>'+esc(g.prompt)+'</h3><small>'+esc(g.name)+' · '+g.correct+'/'+g.total+' поняли</small></article>').join('');
 root.innerHTML='<section class="screen finish"><span class="micro">АРХИВ / СЕАНС ЗАВЕРШЁН</span>'+
  '<h1>Поняли.<br>Почти.</h1><div class="finish-score">Общих разгадок: '+state.score+' из '+state.attempts+'</div>'+
  '<p>Посмотрите, как разные люди объясняли совершенно невозможные фразы одним и тем же алфавитом.</p>'+
  '<div class="gallery">'+gallery+'</div><div class="room-footer">'+
  '<button class="btn primary" data-action="again" '+(state.host!==me?.id||!connected?'disabled':'')+'>'+(state.host===me?.id?'Играть ещё ↗':'Ждём ведущего')+'</button>'+
  '<button class="btn quiet" data-action="leave">Покинуть комнату</button></div></section>';
}
function render(){
 if(!state){renderMenu();return;}
 if(state.phase==='lobby')renderLobby();
 else if(state.phase==='compose')renderCompose();
 else if(state.phase==='guess')renderGuess();
 else if(state.phase==='reveal')renderReveal();
 else renderResults();
}
function updateClock(){
 const el=document.querySelector('#timer');
 if(!el)return;
 const remaining=Math.max(0,Math.ceil(((state?.deadline||0)-Date.now())/1000));
 el.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
}
function setState(next){
 if(!next||!Array.isArray(next.players)||!next.phase)return;
 const changed=state?.phase!==next.phase||state?.author!==next.author||state?.round!==next.round||state?.prompt!==next.prompt;
 state=next;
 if(changed){hideConfirm();selected=-1;undo=[];draft=(next.board||[]).map(g=>({...g}));drag=null;render();playTone(next.phase==='reveal'?830:540);return;}
 if(next.phase==='compose'&&next.author===me?.id){
  // Never destroy the active pointer surface when server echoes an edit.
  updateClock();return;
 }
 render();
}
function syncRoom(message){
 roomId=message.roomId;code=message.roomId?.slice(0,8).toUpperCase()||code;
 state=null;root.innerHTML='<section class="loading">Синхронизируем комнату…</section>';
 try{net.sendGame({type:'sync'});}catch{notify('Не удалось синхронизировать комнату.');}
 const address=new URL(location.href);address.searchParams.set('room',code);history.replaceState(null,'',address.pathname+address.search);
}
function stop(leave=true){
 requestSerial++;clearTimeout(pendingSend);pendingSend=0;drag=null;
 if(net){if(leave&&state)try{net.leaveRoom();}catch{}net.close();}
 net=null;activeToken=null;me=null;state=null;roomId='';code='';connecting=false;connected=false;
 if(leave)adapter.removeItem('pocket-net:'+SERVER);
 history.replaceState(null,'',location.pathname);
 status(health?'Сеть готова':'Нет соединения',health?'ok':'bad');
 render();
}
const networkErrors={room_not_found:'Комната не найдена. Проверь код.',room_full:'В комнате уже восемь игроков.',match_in_progress:'Партия уже идёт. Дождись следующей.',game_unavailable:'Модуль ПИКТО ещё не опубликован в PocketNet.',room_version_unavailable:'Эта версия игры недоступна.',invalid_token:'Срок гостевой сессии истёк.',rate_limited:'Слишком много действий — подожди секунду.',server_at_capacity:'На сервере сейчас нет свободных мест.',not_in_room:'Ты больше не в комнате.'};
async function connect(mode){
 if(connecting)return;
 const input=root.querySelector('#playerName');
 const name=(profile?.nickname||input?.value||savedName).trim().slice(0,22);
 if(!name){notify('Укажи имя игрока.');return;}
 if(!profile)try{localStorage.setItem(STORE+'name',name);}catch{}
 savedName=name;
 const target=String(root.querySelector('#roomCode')?.value||typedCode).trim().toUpperCase();
 if(mode==='join'&&!(/^[0-9A-F]{8}$/.test(target)||/^[0-9A-F-]{36}$/.test(target))){notify('Нужен код из восьми символов.');return;}
 typedCode=target;
 if(net)stop(false);
 const ticket=++requestSerial;
 connecting=true;root.innerHTML='<section class="loading">Открываем связь с PocketNet…</section>';status('Подключение');
 try{
  // A PocketNet guest transport identity is scoped to the active Pocket ID nickname.
  // Switching Google/Pocket ID accounts must not silently reuse a previous guest name.
  if(adapter.getItem('last-player-name')!==name)adapter.removeItem('pocket-net:'+SERVER);
  adapter.setItem('last-player-name',name);
  if(mode!=='resume')adapter.removeItem('pocket-net:'+SERVER);
  await ensureUniqueTab();
  const client=new PocketNet({serverUrl:SERVER,name,storage:adapter});
  net=client;
  client.on('connected',info=>{if(net!==client)return;me=info.player;connected=true;activeToken=client.token;status('В сети','ok');if(state)render();});
  client.on('room_joined',info=>{if(net!==client)return;connecting=false;syncRoom(info);});
  client.on('game_event',packet=>{if(net!==client)return;if(packet.event?.type==='state')setState(packet.event.payload);else if(packet.event?.type==='notice')notify(String(packet.event.payload));});
  client.on('presence',()=>{if(net===client&&state)try{client.sendGame({type:'sync'});}catch{}});
  client.on('disconnected',()=>{if(net!==client)return;connected=false;status('Переподключение','bad');if(state)render();});
  client.on('room_closed',()=>{if(net!==client)return;stop(false);notify('Комната закрыта. Можно создать новую.');});
  client.on('error',error=>{if(net!==client)return;notify(networkErrors[error?.code]||error?.code||error?.message||'Ошибка сети');if(connecting)stop(false);});
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Соединение не установлено за 12 секунд.')),12000))]);
  if(ticket!==requestSerial)return;
  if(mode==='create')client.createRoom('picto');
  else if(mode==='join')client.joinRoom(target);
  else if(!client.roomId)throw Error('Прежняя комната уже недоступна.');
 }catch(error){
  if(ticket!==requestSerial)return;
  stop(false);notify(error?.message||'Не удалось подключиться.');
 }
}
function send(action){
 if(!connected||!net){notify('Подключение к PocketNet потеряно.');return false;}
 try{net.sendGame(action);return true;}catch{notify('Команда не отправлена, ждём подключения.');return false;}
}
function flushBoard(){
 clearTimeout(pendingSend);pendingSend=0;
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 send({type:'edit',glyphs:draft});
}
function queueBoard(){
 clearTimeout(pendingSend);
 pendingSend=setTimeout(flushBoard,130);
}
function remember(){undo.push(draft.map(g=>({...g})));if(undo.length>30)undo.shift();}
function paintBoard(){
 const stage=document.querySelector('#liveStage');
 if(stage)stage.innerHTML=draft.map((g,i)=>stampHTML(g,i,true)).join('');
 const count=document.querySelector('.board-foot span:last-child');if(count)count.textContent=draft.length+' / 26 ЗНАКОВ';
 document.querySelectorAll('[data-action="rotate-left"],[data-action="rotate-right"],[data-action="shrink"],[data-action="grow"],[data-action="delete"]').forEach(b=>b.disabled=selected<0);
 const undoBtn=document.querySelector('[data-action="undo"]');if(undoBtn)undoBtn.disabled=!undo.length;
 const publish=document.querySelector('[data-action="publish"]');if(publish)publish.disabled=!draft.length||!connected;
}
function showVariants(){
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 const options=state.authorOptions||[];
 if(options.length!==4){notify('Варианты задания ещё загружаются.');return;}
 modal.classList.remove('hidden');confirmAction=null;
 modal.innerHTML='<div class="modal-box"><h2>Четыре смысла.</h2><p>Предметы здесь одинаковые. Покажи, какое именно действие произошло.</p>'+
 '<div class="variant-list">'+options.map((phrase,i)=>'<div class="variant-item '+(phrase===state.prompt?'target':'')+'">'+
 '<span>'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(phrase)+'</strong>'+(phrase===state.prompt?'<b>ТВОЁ</b>':'')+'</div>').join('')+
 '</div><div class="modal-actions"><button class="btn primary full" data-modal-close>К композиции →</button></div></div>';
}
function addSymbol(id){
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 if(draft.length>=26){notify('На доске может быть не больше 26 знаков.');return;}
 remember();
 const offset=(draft.length%7-3)*4;
 draft.push({id,x:Math.max(8,Math.min(92,50+offset)),y:Math.max(10,Math.min(90,50+(Math.floor(draft.length/7)-1)*9)),r:0,s:1});
 selected=draft.length-1;paintBoard();const hint=document.querySelector('#glyphHint');if(hint)hint.textContent=GLYPHS.find(g=>g[0]===id)?.[1]||'34 ЗНАКА';queueBoard();playTone(620);
}
function transform(type){
 if(selected<0||!draft[selected])return;
 remember();const g=draft[selected];
 if(type==='rotate-left')g.r=g.r<=-150?g.r+315:g.r-45;
 if(type==='rotate-right')g.r=g.r>=150?g.r-315:g.r+45;
 if(type==='shrink')g.s=Math.max(.55,Math.round((g.s-.15)*100)/100);
 if(type==='grow')g.s=Math.min(2.2,Math.round((g.s+.15)*100)/100);
 if(type==='delete'){draft.splice(selected,1);selected=Math.min(selected,draft.length-1);}
 paintBoard();queueBoard();playTone(490);
}
function confirmBox(title,body,callback){
 confirmAction=callback;
 modal.classList.remove('hidden');
 modal.innerHTML='<div class="modal-box"><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p><div class="modal-actions"><button class="btn quiet" data-confirm="no">Отмена</button><button class="btn primary" data-confirm="yes">Подтвердить</button></div></div>';
 modal.querySelector('[data-confirm="no"]')?.focus();
}
function hideConfirm(){modal.classList.add('hidden');modal.textContent='';confirmAction=null;}
modal.addEventListener('click',e=>{
 if(e.target.closest('[data-modal-close]')){hideConfirm();return;}
 const b=e.target.closest('[data-confirm]');if(!b)return;
 const cb=confirmAction;hideConfirm();if(b.dataset.confirm==='yes')cb?.();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))hideConfirm();});
async function copyText(value){
 try{await navigator.clipboard.writeText(value);}
 catch{
  const input=document.createElement('textarea');input.value=value;input.style.cssText='position:fixed;opacity:0';document.body.append(input);input.select();
  const copied=document.execCommand('copy');input.remove();if(!copied){notify('Не удалось скопировать. Выдели код вручную.');return;}
 }
 notify('Скопировано.');playTone(690);
}
root.addEventListener('click',e=>{
 const glyph=e.target.closest('[data-glyph]');if(glyph&&!glyph.disabled){addSymbol(glyph.dataset.glyph);return;}
 const option=e.target.closest('[data-choice]');
 if(option&&!option.disabled){if(send({type:'answer',choice:Number(option.dataset.choice)})){option.disabled=true;option.classList.add('selected');playTone(740);}return;}
 const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(action==='create'||action==='join'||action==='resume'){connect(action);return;}
 if(action==='retry'){checkHealth();return;}
 if(action==='variants'){showVariants();return;}
 if(action==='sound'){soundEnabled=!soundEnabled;try{localStorage.setItem(STORE+'sound',soundEnabled?'on':'off');}catch{}render();return;}
 if(action==='copy-code'){copyText(code);return;}
 if(action==='copy-link'){copyText(new URL(location.pathname+'?room='+encodeURIComponent(code),location.origin).href);return;}
 if(action==='start'||action==='again'||action==='next'){send({type:action});playTone(700);return;}
 if(action==='publish'){flushBoard();if(draft.length)send({type:'publish'});return;}
 if(action==='undo'){if(!undo.length)return;draft=undo.pop();selected=Math.min(selected,draft.length-1);paintBoard();queueBoard();return;}
 if(['rotate-left','rotate-right','grow','shrink','delete'].includes(action)){transform(action);return;}
 if(action==='leave')confirmBox('Покинуть комнату?','Твоя текущая композиция останется у остальных участников, но ты выйдешь из партии.',()=>stop(true));
});
root.addEventListener('input',e=>{
 if(e.target?.id==='roomCode'){typedCode=e.target.value=e.target.value.toUpperCase().replace(/\s/g,'');}
});
root.addEventListener('pointerdown',e=>{
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 const stamp=e.target.closest('[data-stamp]');
 const stage=e.target.closest('#liveStage');
 if(!stamp||!stage)return;
 const index=Number(stamp.dataset.stamp);
 if(!draft[index])return;
 e.preventDefault();selected=index;remember();
 const box=stage.getBoundingClientRect();
 drag={pointer:e.pointerId,stage,box,index,changed:false};
 try{stage.setPointerCapture(e.pointerId);}catch{}
 paintBoard();
});
root.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.pointer)return;
 e.preventDefault();
 const g=draft[drag.index];if(!g)return;
 const x=Math.max(4,Math.min(96,100*(e.clientX-drag.box.left)/drag.box.width));
 const y=Math.max(5,Math.min(95,100*(e.clientY-drag.box.top)/drag.box.height));
 if(Math.hypot(x-g.x,y-g.y)<.15)return;
 g.x=Math.round(x*10)/10;g.y=Math.round(y*10)/10;drag.changed=true;
 paintBoard();queueBoard();
});
function finishDrag(e){
 if(!drag||e.pointerId!==drag.pointer)return;
 try{drag.stage.releasePointerCapture(drag.pointer);}catch{}
 if(!drag.changed)undo.pop();
 drag=null;paintBoard();if(state?.phase==='compose')flushBoard();
}
root.addEventListener('pointerup',finishDrag);
root.addEventListener('pointercancel',finishDrag);
window.addEventListener('pagehide',()=>{activeToken=null;clearTimeout(pendingSend);});
window.addEventListener('focus',async()=>{if(state)return;await loadProfile();render();});
setInterval(()=>{
 if(state?.deadline)updateClock();
 if(connected&&net&&state&&!['lobby','results'].includes(state.phase))try{net.sendGame({type:'pulse'});}catch{}
},1900);
setInterval(updateClock,350);
render();
(async()=>{await loadProfile();render();await checkHealth();})();
