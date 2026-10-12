import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createPocketLan} from '../../shared/capabilities/lan.js';
import {getPocketIdentity,pocketIdProfileUrl} from '../../shared/capabilities/identity.js';
import {LEVELS,COLORS,newMatch,step,command,activatePlayer,snapshot,validSnapshot,drawBoard} from './game.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='pocket-works:uzel-party',NAME_KEY=STORE+':name',LEVEL_KEY=STORE+':level',SOUND_KEY=STORE+':sound';
let name='Игрок',identity=null,ownId='',unlocked=0,soundOn=true,audio=null;
try{name=localStorage.getItem(NAME_KEY)||'Игрок';unlocked=clamp(Number(localStorage.getItem(LEVEL_KEY))||0,0,4);soundOn=localStorage.getItem(SOUND_KEY)!=='off'}catch{}
try{ownId=sessionStorage.getItem(STORE+':id')||crypto.randomUUID();sessionStorage.setItem(STORE+':id',ownId)}catch{ownId='player-'+Math.random().toString(36).slice(2)}
$('playerName').value=name;
$('audioButton').textContent=soundOn?'♪':'×';
let currentScreen='menu',game=null,remoteState=null,room=null,lan=null,host=false,mode='',busy=false;
let roster=[],nearby=[],invite='',offer='',answer='',reply='',pairStatus='',pausedLocal=false,lastInputSend=0,lastSnapshotSend=0,lastFrame=0,lastText='',lastRev=-1,finishedShown=false;
let activeId=ownId,visual=[],localInput={x:0,y:0,tug:false},otherInputs=Object.create(null),lastRemoteInput=Object.create(null);
const keyboard=new Set();let toastTimer=null,joystickPointer=null,gameStartedAt=0;
function note(text){const el=$('toast');clearTimeout(toastTimer);el.textContent=text;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),2700)}
function sfx(kind){
 if(!soundOn||document.hidden)return;
 try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
  const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
  const patterns={spark:[620,900,.13],tug:[170,85,.11],win:[450,940,.42],tap:[300,380,.07]};
  const [a,b,len]=patterns[kind]||patterns.tap;
  osc.type=kind==='win'?'triangle':'sine';osc.frequency.setValueAtTime(a,now);osc.frequency.exponentialRampToValueAtTime(Math.max(35,b),now+len);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.075,now+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+len);
  osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+len+.02)
 }catch{}
}
function show(screen){
 currentScreen=screen;
 for(const id of ['menu','pair','play'])$(id).classList.toggle('hidden',screen!==id);
 if(screen==='pair')renderPair();
 if(screen==='play'){gameStartedAt=performance.now();renderHud()}
}
function who(){return {id:ownId,name:name.slice(0,22)}}
function displayName(){
 const value=$('playerName').value.trim().replace(/[\n\t]/g,' ').slice(0,22);
 if(identity?.complete)name=identity.nickname.slice(0,22);else name=value||'Игрок';
 $('playerName').value=name;try{localStorage.setItem(NAME_KEY,name)}catch{}
}
function rememberLevel(level){if(!game?.solo)return;unlocked=Math.max(unlocked,Math.min(4,level+1));try{localStorage.setItem(LEVEL_KEY,String(unlocked))}catch{}}
function makeSolo(){
 leaveRoom(false);displayName();
 const identities=[who(),{id:'bot-1',name:'Лён'},{id:'bot-2',name:'Мак'}];
 game=newMatch(identities,unlocked>=4?0:unlocked,true);activeId=ownId;remoteState=null;visual=[];otherInputs=Object.create(null);resetInputs();finishedShown=false;pausedLocal=false;hideOverlays();
 $('switchButton').classList.remove('hidden');show('play');note('Лови огни натянутым канатом')
}
function resetInputs(){localInput={x:0,y:0,tug:false};keyboard.clear();$('joystickKnob').style.transform='translate(-50%,-50%)'}
function hideOverlays(){$('pauseOverlay').classList.add('hidden');$('winOverlay').classList.add('hidden')}
function renderHud(){
 const s=host||!room?game:remoteState;if(!s)return;
 const level=LEVELS[s.level];
 $('levelNo').textContent=String(s.level+1).padStart(2,'0');$('levelTitle').textContent=level.name;
 $('lightCount').textContent=s.sparks.filter(Boolean).length+' / '+s.sparks.length;
 const mine=s.players.find(p=>p.id===(game?.solo?activeId:ownId));
 $('controlPlayer').textContent=mine?'Ты — '+mine.name:'Ты наблюдаешь';
 $('controlExplain').textContent=s.sparks.every(Boolean)?'Теперь все к воротам':'Проведи канатом через огни';
 $('stageHint').textContent=s.sparks.every(Boolean)?'Соберитесь у открытых ворот':level.subtitle;
 $('stageHint').style.opacity=performance.now()-gameStartedAt>9000&&!s.sparks.every(Boolean)?'0':'1';
 $('switchButton').classList.toggle('hidden',!game?.solo);
 $('pauseButton').textContent=s.paused?'▶':'Ⅱ';
 $('tugButton').disabled=!mine||s.phase!=='play'||Boolean(s.paused);
 if(s.phase==='won'&&!finishedShown)showWin(s);
 if(s.phase!=='won'){finishedShown=false;$('winOverlay').classList.add('hidden')}
}
function showWin(s){
 finishedShown=true;sfx('win');hideOverlays();$('winOverlay').classList.remove('hidden');
 $('winTitle').textContent=s.level===LEVELS.length-1?'Все узлы пройдены.':'Узел развязан.';
 $('winTime').textContent='Время: '+formatTime(s.finishedAt||s.elapsed);
 $('nextButton').textContent=s.level===LEVELS.length-1?'Сыграть ещё раз ↗':'Следующее испытание ↗';
 $('nextButton').classList.toggle('hidden',Boolean(room&&!host));
 if(room&&!host)$('winTime').textContent+=' · Ждём ведущего';
 if(!room)rememberLevel(s.level);
}
function formatTime(sec){return Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0')}
function nextLevel(restart=false){
 if(room&&!host)return;
 const level=restart?game.level:(game.level+1)%LEVELS.length;
 const members=game.solo?[who(),{id:'bot-1',name:'Лён'},{id:'bot-2',name:'Мак'}]:roster;
 game=newMatch(members,level,Boolean(!room));activeId=ownId;remoteState=null;visual=[];otherInputs=Object.create(null);
 resetInputs();finishedShown=false;pausedLocal=false;hideOverlays();show('play');
 if(room)sendSnapshot(true);
}
function togglePause(){
 if(!game&& !remoteState)return;
 if(!room||host){game.paused=!game.paused;pausedLocal=game.paused;if(room)sendSnapshot(true)}
 else pausedLocal=!pausedLocal;
 $('pauseOverlay').classList.toggle('hidden',!pausedLocal);
 if(pausedLocal){
  const foreign=room&&!host;
  $('restartButton').classList.toggle('hidden',foreign);
  $('pauseOverlay').querySelector('h2').textContent=foreign?'Локальная пауза':'Передохнём?';
  $('pauseOverlay').querySelector('.eyebrow').textContent=foreign?'ОСТАЛЬНЫЕ ПРОДОЛЖАЮТ ИГРАТЬ':'ИГРА ПРИОСТАНОВЛЕНА';
 }else resetInputs();
}
function leaveRoom(keepMenu=true){
 const previous=room;room=null;lan=null;host=false;mode='';busy=false;invite='';offer='';answer='';reply='';roster=[];nearby=[];otherInputs=Object.create(null);
 if(previous)try{previous.close()}catch{}
 if(keepMenu){game=null;remoteState=null;resetInputs();hideOverlays();show('menu')}
}
function ownLan(){
 return createPocketLan({applicationId:'uzel-party',protocolVersion:1,displayName:name,player:{id:ownId,name,metadata:{game:'uzel-party'}}});
}
function viewState(){return (!room||host)?game:remoteState}
function sendSnapshot(reliable=false){
 if(!host||!room||!game)return;
 try{room.broadcast('snapshot',snapshot(game),reliable?{}:{reliability:'realtime'})}catch{}
}
function sendLobby(){
 if(!room||!host)return;
 try{room.broadcast('lobby',{players:roster.map(p=>({id:p.id,name:p.name})),running:!!game,level:game?.level??0})}catch{}
}
function attachRoom(next,isHost){
 room=next;host=isHost;
 const anchor=next;
 next.on('peerjoin',({peer})=>{
  if(room!==anchor)return;
  if(host){
   if(!roster.some(p=>p.id===peer.id)&&roster.length<6)roster.push({id:peer.id,name:String(peer.name||'Игрок').slice(0,22)});
   sendLobby();if(game)sendSnapshot(true);renderPair();note(peer.name+' присоединился');
  }else{
   try{room.broadcast('need-state',{})}catch{}
   if(currentScreen==='pair')renderPair();
  }
 });
 next.on('peerleave',({peer})=>{
  if(room!==anchor)return;
  if(host){
   roster=roster.filter(p=>p.id!==peer.id);delete otherInputs[peer.id];
   if(game&&game.phase==='play'){
     const p=game.players.find(p=>p.id===peer.id);
     if(p){p.name+=' · оффлайн';otherInputs[peer.id]={x:0,y:0}}
   }
   sendLobby();renderPair();note('Игрок вышел из комнаты');
  }else{leaveRoom();note('Ведущий отключился. Проверь локальную сеть')}
 });
 next.on('message',({peer,type,payload})=>{
  if(room!==anchor||!peer||typeof peer.id!=='string')return;
  if(host){
   if(type==='input'){
    if(!game||!game.players.some(p=>p.id===peer.id))return;
    if(!payload||!Number.isFinite(payload.x)||!Number.isFinite(payload.y))return;
    const now=performance.now();if(now-(lastRemoteInput[peer.id]||0)<30)return;
    lastRemoteInput[peer.id]=now;
    otherInputs[peer.id]={x:clamp(payload.x,-1,1),y:clamp(payload.y,-1,1)};
    if(payload.tug===true)command(game,peer.id,{tug:true});
   }else if(type==='need-state'){sendLobby();if(game)sendSnapshot(true)}
  }else if(type==='lobby'){
   if(!payload||!Array.isArray(payload.players)||payload.players.length>6)return;
   roster=payload.players.filter(p=>typeof p.id==='string'&&typeof p.name==='string').map(p=>({id:p.id.slice(0,80),name:p.name.slice(0,22)}));
   if(currentScreen==='pair')renderPair();
  }else if(type==='snapshot'){
   if(!validSnapshot(payload))return;
   const old=remoteState;remoteState=payload;
   if(currentScreen!=='play'){finishedShown=false;hideOverlays();show('play')}
   if(old&&old.level!==payload.level){visual=[];finishedShown=false;hideOverlays();gameStartedAt=performance.now()}
   if(old&&!old.sparks.every(Boolean)&&payload.sparks.some((b,i)=>b&&!old.sparks[i]))sfx('spark');
   renderHud();
  }
 });
 next.on('close',()=>{if(room===anchor){leaveRoom();note('Локальная комната закрылась')}});
 next.on('error',()=>note('Соединение нестабильно. Проверьте одну Wi‑Fi сеть'));
}
async function beginHost(){
 if(busy)return;displayName();busy=true;
 try{
  lan=ownLan();const capability=await lan.getCapabilities();if(!capability?.supported)throw Error('PocketLAN недоступен');
  const next=await lan.hostRoom({name:'УЗЕЛ · '+name,maxPlayers:6});
  roster=[who()];game=null;remoteState=null;attachRoom(next,true);mode='host';show('pair');
  if(typeof next.createInvite==='function')await newInvite();
 }catch{note('Не удалось создать LAN-комнату. Проверь поддержку WebRTC');if(!room)show('menu')}
 finally{busy=false}
}
async function beginJoin(){
 if(busy)return;displayName();busy=true;
 try{
  lan=ownLan();const cap=await lan.getCapabilities();if(!cap?.supported)throw Error('PocketLAN недоступен');
  mode='join';game=null;remoteState=null;show('pair');
  if(cap.automaticDiscovery)await discoverRooms();
 }catch{note('PocketLAN недоступен в этом браузере');show('menu')}
 finally{busy=false}
}
async function discoverRooms(){
 try{nearby=await lan.discoverRooms({timeoutMs:1600})||[];renderPair();if(!nearby.length)note('Комнат не найдено. Проверь одну Wi‑Fi сеть')}
 catch{note('Автопоиск недоступен. Используй приглашение')}
}
async function newInvite(){
 if(!room||typeof room.createInvite!=='function')return;
 try{invite='';pairStatus='Создаём приглашение…';renderPair();invite=await room.createInvite();pairStatus='Передай приглашение другу';renderPair()}
 catch{pairStatus='Не удалось создать приглашение';renderPair()}
}
async function acceptAnswer(){
 if(!room?.completeInvite)return;
 const value=($('answerInput')?.value||answer).trim();
 if(!value.startsWith('PWL1.')){note('Вставь полный ответ от друга');return}
 try{await room.completeInvite(value);answer='';invite='';pairStatus='Участник подключается…';renderPair();await newInvite()}
 catch{note('Ответ не подошёл. Создай новое приглашение')}
}
async function joinOffer(){
 const value=($('offerInput')?.value||offer).trim();
 if(!value.startsWith('PWL1.')){note('Вставь приглашение PWL1 от ведущего');return}
 try{
  offer=value;pairStatus='Устанавливаем соединение…';renderPair();
  const result=await lan.joinInvite(offer);reply=result.answer;attachRoom(result.room,false);pairStatus='Отправь ответ ведущему и оставайся здесь';renderPair();
 }catch{pairStatus='Проверь приглашение и локальную сеть';renderPair();note('Не удалось принять приглашение')}
}
async function joinNative(index){
 const target=nearby[index];if(!target)return;
 try{const next=await lan.joinRoom(target);attachRoom(next,false);pairStatus='Ожидание начала игры';renderPair();
  try{room.broadcast('need-state',{})}catch{}
 }catch{note('Комната недоступна. Проверь Wi‑Fi')}
}
async function copyCode(text){
 if(!text)return;
 try{await navigator.clipboard.writeText(text);note('Код скопирован')}
 catch{const el=document.createElement('textarea');el.value=text;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();try{document.execCommand('copy');note('Код скопирован')}catch{note('Выдели текст и скопируй вручную')}el.remove()}
}
async function shareCode(text){
 if(!text)return;
 if(navigator.share){try{await navigator.share({title:'УЗЕЛ · PocketLAN',text});return}catch{}}
 await copyCode(text);
}
function renderPair(){
 if(currentScreen!=='pair')return;
 $('pairTitle').textContent=mode==='host'?'Собери своих.':'Войди в команду.';
 $('pairSubtitle').textContent='Одна Wi‑Fi сеть или точка доступа. Интернет не требуется; гостевые сети иногда изолируют устройства.';
 $('pairPlay').classList.toggle('hidden',mode!=='host'||roster.length<2);
 $('pairReturn').classList.toggle('hidden',mode!=='host'||!game);
 let html='';
 if(mode==='host'){
  html+='<div class="pair-step"><h3>В команде · '+roster.length+'/6</h3>';
  html+=roster.map((p,i)=>'<div class="room-player"><span><i class="player-dot" style="background:'+COLORS[i%COLORS.length]+'"></i>'+safe(p.name)+'</span><span>'+(i===0?'ведущий':'готов')+'</span></div>').join('');
  html+='<p class="status-note">Начать можно вдвоём. Новые друзья добавятся со следующего испытания.</p></div>';
  if(room&&typeof room.createInvite==='function'){
   html+='<div class="pair-step"><h3>1. Приглашение другу</h3><p>Отправь код на второе устройство. Для каждого нового игрока будет отдельное приглашение.</p><textarea id="inviteOutput" readonly aria-label="Приглашение">'+safe(invite)+'</textarea><div class="pair-row"><button data-action="copy-invite" '+(!invite?'disabled':'')+'>Копировать</button><button data-action="share-invite" '+(!invite?'disabled':'')+'>Поделиться</button><button data-action="new-invite">Обновить код</button></div></div>';
   html+='<div class="pair-step"><h3>2. Ответ друга</h3><textarea id="answerInput" placeholder="Вставь ответ PWL1.…" spellcheck="false">'+safe(answer)+'</textarea><div class="pair-row"><button data-action="accept">Подключить игрока →</button></div></div>';
  }else html+='<div class="pair-step"><h3>Комната обнаруживается автоматически</h3><p>Друзья могут выбрать её через поиск PocketLAN.</p></div>';
 }else{
  html+='<div class="pair-step"><h3>Найди ведущего</h3><div class="pair-row"><button data-action="discover">Найти рядом</button></div>';
  html+=nearby.map((x,i)=>'<div class="pair-row"><button data-action="native" data-index="'+i+'">'+safe(x.name||'Комната')+' →</button></div>').join('');
  html+='<p>В браузере без нативного поиска используй приглашение от ведущего.</p></div>';
  if(!room){
   html+='<div class="pair-step"><h3>1. Приглашение</h3><textarea id="offerInput" placeholder="Код PWL1.…" spellcheck="false">'+safe(offer)+'</textarea><div class="pair-row"><button data-action="join-offer">Создать ответ →</button></div></div>';
  }
  if(reply){
   html+='<div class="pair-step"><h3>2. Верни ответ ведущему</h3><p>После этого не закрывай игру, пока ведущий завершает подключение.</p><textarea readonly>'+safe(reply)+'</textarea><div class="pair-row"><button data-action="copy-reply">Копировать</button><button data-action="share-reply">Поделиться</button></div></div>';
  }
  if(roster.length)html+='<div class="pair-step"><h3>На связи</h3>'+roster.map(p=>'<div class="room-player">'+safe(p.name)+'</div>').join('')+'</div>';
 }
 html+='<p class="status-note">'+safe(pairStatus||'Локальное соединение работает напрямую между устройствами')+'</p>';
 $('pairContent').innerHTML=html;
}
function startOnline(){
 if(!host||roster.length<2){note('Для LAN нужны минимум два игрока');return}
 game=newMatch(roster,0,false);finishedShown=false;remoteState=null;visual=[];resetInputs();hideOverlays();show('play');sendLobby();sendSnapshot(true);
}
function keyVector(){
 const x=Number(keyboard.has('d')||keyboard.has('arrowright'))-Number(keyboard.has('a')||keyboard.has('arrowleft'));
 const y=Number(keyboard.has('s')||keyboard.has('arrowdown'))-Number(keyboard.has('w')||keyboard.has('arrowup'));
 return {x,y};
}
function sendControls(now){
 if(!room||host||currentScreen!=='play'||now-lastInputSend<55)return;
 lastInputSend=now;
 try{room.broadcast('input',{x:localInput.x,y:localInput.y,tug:localInput.tug},{reliability:'realtime'})}catch{}
 localInput.tug=false;
}
function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.min(.05,Math.max(0,(now-(lastFrame||now))/1000));lastFrame=now;
 if(currentScreen!=='play'||document.hidden)return;
 const k=keyVector();
 if(k.x||k.y){const m=Math.max(1,Math.hypot(k.x,k.y));localInput.x=k.x/m;localInput.y=k.y/m}
 else if(joystickPointer===null){localInput.x=0;localInput.y=0}
 if(!room||host){
  if(game&&!game.paused&&game.phase==='play'){
   if(localInput.tug){command(game,game.solo?activeId:ownId,{tug:true});localInput.tug=false;sfx('tug')}
   const inputs={...otherInputs,[game.solo?activeId:ownId]:{x:localInput.x,y:localInput.y}};
   const events=step(game,inputs,dt);
   for(const ev of events)if(ev.type==='spark'){sfx('spark');note('Огонёк пойман!')}else if(ev.type==='won')rememberLevel(game.level);
  }
  if(room&&host&&now-lastSnapshotSend>=66){lastSnapshotSend=now;sendSnapshot()}
 }else sendControls(now);
 const data=viewState();if(!data)return;
 if(room&&!host){
  const target=data.players;
  if(visual.length!==target.length||visual.some((p,i)=>p.id!==target[i].id))visual=target.map(p=>({...p}));
  for(let i=0;i<target.length;i++){visual[i].x+=(target[i].x-visual[i].x)*clamp(dt*12,0,1);visual[i].y+=(target[i].y-visual[i].y)*clamp(dt*12,0,1);visual[i].boost=target[i].boost}
 }
 drawBoard($('board'),data,now,room&&!host?visual:null);
 if(now-lastText>160||data.rev!==lastRev){lastText=now;lastRev=data.rev;renderHud()}
}
function joystickMove(e){
 const area=$('joystick').getBoundingClientRect(),cx=area.left+area.width/2,cy=area.top+area.height/2;
 const dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),limit=31;
 const f=Math.min(limit,len)/(len||1),x=dx*f,y=dy*f;
 localInput.x=x/limit;localInput.y=y/limit;
 $('joystickKnob').style.transform='translate(calc(-50% + '+x+'px),calc(-50% + '+y+'px))';
}
$('joystick').addEventListener('pointerdown',e=>{if(joystickPointer!==null)return;joystickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);joystickMove(e)});
$('joystick').addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)joystickMove(e)});
function releaseJoystick(e){if(e.pointerId!==joystickPointer)return;joystickPointer=null;localInput.x=0;localInput.y=0;$('joystickKnob').style.transform='translate(-50%,-50%)'}
$('joystick').addEventListener('pointerup',releaseJoystick);$('joystick').addEventListener('pointercancel',releaseJoystick);$('joystick').addEventListener('lostpointercapture',releaseJoystick);
document.addEventListener('keydown',e=>{
 const tag=document.activeElement?.tagName;
 if(['INPUT','TEXTAREA'].includes(tag))return;
 if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown',' '].includes(e.key.toLowerCase()))e.preventDefault();
 keyboard.add(e.key.toLowerCase());
 if(e.repeat)return;
 if(e.code==='Space'&&currentScreen==='play'){$('tugButton').click()}
 if(e.key==='Tab'&&currentScreen==='play'&&game?.solo){e.preventDefault();$('switchButton').click()}
 if(e.key==='Escape'&&currentScreen==='play')togglePause();
});
document.addEventListener('keyup',e=>keyboard.delete(e.key.toLowerCase()));
$('tugButton').addEventListener('click',()=>{if(currentScreen==='play'){localInput.tug=true;if(room&&!host){sendControls(performance.now()+100)} }});
$('switchButton').addEventListener('click',()=>{if(!game?.solo)return;const i=game.players.findIndex(p=>p.id===activeId);activeId=game.players[(i+1)%game.players.length].id;activatePlayer(game,activeId);resetInputs();renderHud();sfx('tap')});
$('soloButton').addEventListener('click',makeSolo);
$('hostButton').addEventListener('click',beginHost);
$('joinButton').addEventListener('click',beginJoin);
$('audioButton').addEventListener('click',()=>{soundOn=!soundOn;$('audioButton').textContent=soundOn?'♪':'×';try{localStorage.setItem(SOUND_KEY,soundOn?'on':'off')}catch{}if(soundOn)sfx('tap')});
$('pairBack').addEventListener('click',()=>leaveRoom());
$('pairPlay').addEventListener('click',startOnline);
$('pairReturn').addEventListener('click',()=>{if(game)show('play')});
$('pairContent').addEventListener('input',e=>{if(e.target.id==='answerInput')answer=e.target.value;if(e.target.id==='offerInput')offer=e.target.value});
$('pairContent').addEventListener('click',e=>{
 const button=e.target.closest('button[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='copy-invite')copyCode(invite);
 if(action==='share-invite')shareCode(invite);
 if(action==='new-invite')newInvite();
 if(action==='accept')acceptAnswer();
 if(action==='join-offer')joinOffer();
 if(action==='copy-reply')copyCode(reply);
 if(action==='share-reply')shareCode(reply);
 if(action==='discover')discoverRooms();
 if(action==='native')joinNative(Number(button.dataset.index));
});
$('pauseButton').addEventListener('click',togglePause);
$('resumeButton').addEventListener('click',togglePause);
$('restartButton').addEventListener('click',()=>nextLevel(true));
$('leaveButton').addEventListener('click',()=>leaveRoom());
$('winMenuButton').addEventListener('click',()=>leaveRoom());
$('nextButton').addEventListener('click',()=>nextLevel(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden){localInput.x=0;localInput.y=0;localInput.tug=false;keyboard.clear();joystickPointer=null}});
window.addEventListener('pagehide',()=>{try{room?.close()}catch{}});
(async()=>{try{identity=await getPocketIdentity();if(identity?.complete&&identity.nickname){name=identity.nickname.slice(0,22);$('playerName').value=name;$('playerName').readOnly=true;$('accountBadge').innerHTML='Pocket ID · <a href="'+pocketIdProfileUrl+'">Профиль ↗</a>'}}catch{}})();
requestAnimationFrame(animate);
