import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {LEVELS,initialize,simulate,getView,resetLevel} from './physics.js';
import {draw} from './art.js';
installMobileRuntime();
createWorkshopMode({appName:'ЛИПКИ',version:'1.0.0',cachePrefix:'lipki-',storageNamespace:'pocket-works:lipki'});
const $=id=>document.getElementById(id),ORIGIN=location.origin+'/pocketnet',PREFIX='pocket-works:lipki:';
const store=(k,v)=>{try{localStorage.setItem(PREFIX+k,String(v))}catch{}};
const read=(k,d='')=>{try{return localStorage.getItem(PREFIX+k)??d}catch{return d}};
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const memory=new Map(),socketStore={
 getItem(k){try{return sessionStorage.getItem(PREFIX+k)}catch{return memory.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(PREFIX+k,v)}catch{memory.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(PREFIX+k)}catch{memory.delete(k)}}
};
let name=read('name','Игрок'),sound=read('sound','on')!=='off',unlocked=Math.min(LEVELS.length-1,Math.max(0,Number(read('level','0'))||0));
let profile=null,screen='menu',mode='local',world=null,server=null,net=null,connected=false,connecting=false,me=null,room='',paused=false;
let activeId='hero-1',keys=new Set(),touch=new Set(),press=new Map(),lastFrame=0,lastNet=0,lastLevel=-1,audio=null,toastTimer=0,requestedRoom=new URLSearchParams(location.search).get('room')||'';
const options=$('levelChoice');
LEVELS.forEach((l,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=(i+1)+'. '+l.name;options.append(opt)});
function tone(kind='tap'){
 if(!sound)return;
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio||=new C();audio.resume?.();
  const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();
  const [hz,span]=({tap:[370,.09],jump:[440,.17],stick:[190,.12],win:[670,.28]})[kind]||[360,.1];
  o.type=kind==='stick'?'triangle':'sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*(kind==='win'?1.4:.7),t+span);
  g.gain.setValueAtTime(.036,t);g.gain.exponentialRampToValueAtTime(.0001,t+span);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+span+.01);
 }catch{}
}
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2500)}
function show(s){screen=s;for(const id of ['menu','lobby','game'])$(id).hidden=id!==s;$('pauseSheet').hidden=true;$('endSheet').hidden=true;paused=false;keys.clear();touch.clear();press.clear();}
function nickname(){if(profile?.complete)return profile.nickname;name=$('nickname').value.trim().slice(0,22)||'Игрок';store('name',name);return name}
function netStatus(s,bad=false){$('netStatus').textContent=s;$('netStatus').classList.toggle('error',bad)}
async function identity(){try{profile=await getPocketIdentity();if(profile?.complete){name=profile.nickname;$('nickname').value=name;$('nickname').readOnly=true;$('identity').textContent='Pocket ID · '+name;}else $('identity').textContent='Гостевой профиль'}catch{}}
async function health(){try{const res=await fetch(ORIGIN+'/health',{cache:'no-store',signal:AbortSignal.timeout(4500)}),body=await res.json();netStatus(res.ok&&body.modules?.includes('lipki')?'PocketNet · подключён':'PocketNet · ожидает публикации',!res.ok||!body.modules?.includes('lipki'));}catch{netStatus('PocketNet · недоступен',true)}}
function exitRoom(){const old=net;net=null;connected=false;connecting=false;server=null;room='';me=null;if(old){try{if(old.roomId)old.leaveRoom()}catch{}try{old.close()}catch{}}}
function view(){return mode==='local'&&world?getView(world):server?.world||null}
function updateGame(){
 const v=view();if(!v)return;const i=Math.min(v.level,LEVELS.length-1);
 $('levelIndex').textContent=(i+1)+' / '+LEVELS.length;$('levelName').textContent=LEVELS[i].name;$('levelHint').textContent=LEVELS[i].hint;
 $('roleLabel').textContent=mode==='local'?'Герой '+(v.players.findIndex(x=>x.id===activeId)+1):(v.players.find(x=>x.id===me?.id)?.name||'Игрок');
 $('switchBtn').hidden=mode!=='local';$('roomIndicator').hidden=mode!=='online';$('roomIndicator').textContent=connected?'PocketNet':'Переподключение…';
 if(v.level!==lastLevel){if(lastLevel>=0&&v.level>lastLevel){tone('win');toast('Уровень пройден!')}lastLevel=v.level;
  if(mode==='local'&&v.level>unlocked){unlocked=v.level;store('level',unlocked);[...options.options].forEach((op,i)=>op.disabled=i>unlocked);options.value=unlocked}}
 if(v.finished){$('endSheet').hidden=false;paused=true;$('againBtn').hidden=mode==='online'&&server?.host!==me?.id;}
}
function beginLocal(level=unlocked){exitRoom();mode='local';world=initialize([{id:'hero-1',name:nickname()},{id:'hero-2',name:'Напарник'}],level);activeId='hero-1';lastLevel=-1;show('game');updateGame();tone();}
function switchHero(){if(mode!=='local'||!world||paused)return;const n=world.players.findIndex(p=>p.id===activeId);activeId=world.players[(n+1)%world.players.length].id;keys.clear();touch.clear();updateGame();tone()}
function onState(state){if(!state||!['lobby','play','done'].includes(state.phase)||!Array.isArray(state.players)||state.players.length>4)return;
 const previousPhase=server?.phase;server=state;connecting=false;if(state.phase==='lobby'){show('lobby');updateLobby()}else{if(screen!=='game'){lastLevel=-1;show('game')}if(state.phase==='play'&&previousPhase==='done'){paused=false;lastLevel=-1;$('endSheet').hidden=true;$('pauseSheet').hidden=true;}updateGame()}}
function wire(client){
 client.on('connected',v=>{if(net!==client)return;me=v.player;connected=true;netStatus('PocketNet · подключён');if(screen==='lobby')updateLobby()});
 client.on('room_joined',v=>{if(net!==client)return;room=v.roomId;onState(v.state);try{client.sendGame({type:'sync'})}catch{}});
 client.on('game_event',v=>{if(net!==client)return;if(v.event?.type==='state')onState(v.event.payload);if(v.event?.type==='notice')toast(String(v.event.payload))});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;netStatus('Переподключение…',true);if(screen==='lobby')updateLobby()});
 client.on('presence',()=>{if(net===client&&connected)try{client.sendGame({type:'sync'})}catch{}});
 client.on('error',e=>{if(net!==client)return;connecting=false;const errors={game_unavailable:'Модуль PocketNet не опубликован',room_not_found:'Комната не найдена',room_full:'Комната заполнена',match_in_progress:'Матч уже идёт'};toast(errors[e?.code]||e?.message||'Ошибка PocketNet');if(screen==='lobby')updateLobby()});
 client.on('room_closed',()=>{if(net===client){exitRoom();show('menu');toast('Комната закрыта')}});
}
async function connect(action){
 if(connecting)return;exitRoom();mode='online';connecting=true;show('lobby');updateLobby();
 try{socketStore.removeItem('pocket-net:'+ORIGIN);
  const client=new PocketNet({serverUrl:ORIGIN,name:nickname(),storage:socketStore,identityKey:profile?.complete?profile.id:'guest'});net=client;wire(client);
  await Promise.race([client.connect(),new Promise((_,rej)=>setTimeout(()=>rej(Error('Сервер не отвечает')),11000))]);
  if(net!==client)return;connected=true;connecting=false;
  if(action==='create')client.createRoom('lipki');
  else if(action==='join'&&requestedRoom){client.joinRoom(requestedRoom.trim().toUpperCase());requestedRoom='';}
  else updateLobby();
 }catch(e){exitRoom();show('menu');toast(e.message||'Нет соединения');netStatus('PocketNet · недоступен',true)}
}
function send(a){if(!net||!connected)return false;try{net.sendGame(a);return true}catch{toast('Связь потеряна');return false}}
function updateLobby(){
 $('lobbyHeading').textContent=connecting?'Подключаемся':room?'Твоя команда':'Присоединиться';
 $('connectLine').textContent=connecting?'Связываемся с сервером…':connected?'PocketNet · связь установлена':'Нет соединения';
 $('roomBlock').hidden=!room;$('joinBlock').hidden=!!room||connecting;
 if(!room){$('joinInput').value=requestedRoom;$('joinBtn').disabled=!connected;return}
 $('roomCode').textContent=room.slice(0,8).toUpperCase();$('people').replaceChildren();
 (server?.players||[]).forEach((p,i)=>{const row=document.createElement('div');row.className='player-row';row.innerHTML='<span class="swatch swatch-'+i+'"></span><b>'+safe(p.name)+'</b><small>'+(p.id===server.host?'Ведущий':p.id===me?.id?'Ты':'Игрок')+'</small>';$('people').append(row)});
 $('startBtn').hidden=server?.host!==me?.id;$('startBtn').disabled=!connected||(server?.players.length||0)<2;
 $('lobbyHint').textContent=(server?.players.length||0)<2?'Пригласи друга: нужно 2–4 игрока':'Команда собрана. Ведущий начинает.';
}
function join(){const code=$('joinInput').value.trim().toUpperCase();if(!/^(?:[0-9A-F]{8}|[0-9A-F-]{36})$/.test(code)){toast('Нужен код из 8 символов');return}if(connected){requestedRoom=code;try{net.joinRoom(code)}catch{toast('Не удалось войти')}}}
function copy(text){if(!navigator.clipboard?.writeText){toast('Копирование недоступно');return}navigator.clipboard.writeText(text).then(()=>toast('Скопировано')).catch(()=>toast('Копирование недоступно'))}
function control(){return {x:(keys.has('a')||keys.has('arrowleft')||touch.has('left')?-1:0)+(keys.has('d')||keys.has('arrowright')||touch.has('right')?1:0),jump:keys.has(' ')||keys.has('arrowup')||keys.has('w')||touch.has('jump'),stick:keys.has('e')||keys.has('s')||touch.has('stick'),up:keys.has('w')||keys.has('arrowup')}}
function pauseGame(){if(screen!=='game')return;paused=!paused;$('pauseSheet').hidden=!paused;keys.clear();touch.clear();$('restartBtn').disabled=mode==='online'&&server?.host!==me?.id;$('pauseCaption').textContent=mode==='online'?'Игра у друзей продолжается':'Тренировка на паузе'}
function restart(){if(mode==='local'){resetLevel(world);activeId='hero-1';paused=false;$('pauseSheet').hidden=true}else send({type:'restart'});tone()}
const preview=initialize([{id:'a',name:'Пух'},{id:'b',name:'Нить'}]);preview.players[0].x=390;preview.players[0].y=375;preview.players[1].x=515;preview.players[1].y=315;preview.players[1].stuck={kind:'world',x:515,y:315};
function frame(now){
 const dt=Math.max(0,Math.min((now-lastFrame)/1000||0,.042));lastFrame=now;
 const live=screen==='game'&&!paused&&(mode!=='online'||connected);
 if(live&&mode==='local'&&world&&!world.finished){
  world.inputs[activeId]=control();const other=world.players.find(p=>p.id!==activeId);if(other)world.inputs[other.id]={x:0,jump:false,stick:false};
  simulate(world,dt);updateGame();
 }else if(live&&mode==='online'&&server?.phase==='play'&&now-lastNet>73){send({type:'input',...control()});lastNet=now}
 if(screen==='game'){const v=view();if(v)draw($('canvas'),v,{me:mode==='local'?activeId:me?.id,time:now/1000})}
 else if(screen==='menu')draw($('preview'),getView(preview),{me:'a',time:now/1000});
 requestAnimationFrame(frame);
}
$('nickname').value=name;$('soundBtn').textContent=sound?'Звук: вкл':'Звук: выкл';
$('soundBtn').addEventListener('click',()=>{sound=!sound;store('sound',sound?'on':'off');$('soundBtn').textContent=sound?'Звук: вкл':'Звук: выкл';tone()});
$('soloBtn').addEventListener('click',()=>beginLocal(Number(options.value)||0));
$('hostBtn').addEventListener('click',()=>connect('create'));
$('onlineBtn').addEventListener('click',()=>connect('join'));
$('joinBtn').addEventListener('click',join);
$('joinInput').addEventListener('keydown',e=>{if(e.key==='Enter')join()});
$('backLobby').addEventListener('click',()=>{exitRoom();show('menu')});
$('backGame').addEventListener('click',pauseGame);
$('resumeBtn').addEventListener('click',pauseGame);
$('restartBtn').addEventListener('click',restart);
$('leaveBtn').addEventListener('click',()=>{exitRoom();show('menu')});
$('switchBtn').addEventListener('click',switchHero);
$('startBtn').addEventListener('click',()=>send({type:'start'}));
$('copyCode').addEventListener('click',()=>copy(room.slice(0,8).toUpperCase()));
$('copyLink').addEventListener('click',()=>copy(location.origin+location.pathname+'?room='+room.slice(0,8).toUpperCase()));
$('againBtn').addEventListener('click',()=>{if(mode==='local')beginLocal(0);else send({type:'start'});$('endSheet').hidden=true;paused=false});
$('endExit').addEventListener('click',()=>{exitRoom();show('menu')});
$('levelChoice').addEventListener('change',e=>{if(Number(e.target.value)>unlocked){toast('Уровень пока закрыт');options.value=unlocked}});
[...options.options].forEach((op,i)=>op.disabled=i>unlocked);options.value=unlocked;
for(const el of document.querySelectorAll('[data-hold]')){
 el.addEventListener('pointerdown',e=>{if(screen!=='game'||paused)return;e.preventDefault();el.setPointerCapture?.(e.pointerId);press.set(e.pointerId,el.dataset.hold);touch.add(el.dataset.hold);el.classList.add('held');if(el.dataset.hold==='jump')tone('jump');if(el.dataset.hold==='stick')tone('stick')});
 const up=e=>{const k=press.get(e.pointerId);press.delete(e.pointerId);if(k&&!Array.from(press.values()).includes(k))touch.delete(k);el.classList.remove('held')};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
}
window.addEventListener('blur',()=>{keys.clear();touch.clear();press.clear()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();touch.clear();press.clear()}});
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
 if(['ArrowLeft','ArrowRight','ArrowUp',' ','Tab'].includes(e.key))e.preventDefault();
 const key=e.key.toLowerCase();if(key==='escape'&&screen==='game'){pauseGame();return}
 if((key==='q'||key==='tab')&&screen==='game'){if(!e.repeat)switchHero();return}keys.add(key)});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
show('menu');identity();health();
if(requestedRoom&&/^(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f-]{36})$/.test(requestedRoom)){$('joinInput').value=requestedRoom;connect('join')}
requestAnimationFrame(frame);
