
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {LEVELS,makeWorld,tickWorld,clamp} from './game-core.js';
import {drawWorld} from './render.js';
installMobileRuntime();
createWorkshopMode({appName:'ЛИПКИ',version:'1.0.0',cachePrefix:'lipki-',storageNamespace:'pocket-works:lipki'});
const $=id=>document.getElementById(id),k='pocket-works:lipki:';
function load(key,fallback=''){try{return localStorage.getItem(k+key)??fallback}catch{return fallback}}
function save(key,value){try{localStorage.setItem(k+key,String(value))}catch{}}
const MEM=new Map(),sessionStore={
 getItem(key){try{return sessionStorage.getItem(k+'net:'+key)}catch{return MEM.get(key)||null}},
 setItem(key,value){try{sessionStorage.setItem(k+'net:'+key,value)}catch{MEM.set(key,value)}},
 removeItem(key){try{sessionStorage.removeItem(k+'net:'+key)}catch{MEM.delete(key)}}
};
let identity=null,name=load('name','Игрок'),unlocked=clamp(Number(load('unlocked','0'))||0,0,11),sound=load('sound','on')!=='off';
let screen='menu',mode='solo',world=makeWorld(['demo'],0),server=null,net=null,me=null,connected=false,connecting=false,roomId='',busy=false,paused=false,changedLevel=-1;
let lastFrame=0,lastSend=0,toastTimer=0,predictAt=0,joinAfter='';
const held={left:false,right:false,jump:false,grab:false},keys=new Set(),softPositions=new Map();
const qs=new URLSearchParams(location.search),initialRoom=(qs.get('room')||'').trim().toUpperCase();
const netOrigin=location.origin+'/pocketnet';
function message(t){const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function tone(freq=430,kind='tap'){
 if(!sound)return;
 try{
  const Ac=window.AudioContext||window.webkitAudioContext;if(!Ac)return;
  const audio=window.__lipkiAudio||(window.__lipkiAudio=new Ac());audio.resume?.();
  const o=audio.createOscillator(),g=audio.createGain();o.type=kind==='spring'?'triangle':'sine';
  const t=audio.currentTime;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(kind==='spring'?1.8:.65),t+.125);
  g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.0001,t+.15);
  o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.16);
 }catch{}
}
function buzz(t=14){try{navigator.vibrate?.(t)}catch{}}
function resetHeld(){Object.keys(held).forEach(key=>held[key]=false);keys.clear();['left','right','jump','grab'].forEach(key=>$('button-'+key)?.classList.remove('pressed'));}
function setScreen(s){
 screen=s;document.body.dataset.screen=s;
 for(const id of ['menu','online','pause','result'])$(id+'Sheet').hidden=id!==s;
 $('hud').hidden=!(s==='play'||s==='pause'||s==='result');
 $('controls').hidden=s!=='play';
 $('pauseTrigger').hidden=s!=='play';
 if(s!=='play')resetHeld();
}
function displayProfile(){
 if(identity?.complete){name=identity.nickname;$('playerName').value=name;$('playerName').readOnly=true;$('playerLabel').textContent='POCKET ID';}
 else{$('playerName').readOnly=false;$('playerName').value=name;$('playerLabel').textContent='ВАШЕ ИМЯ';}
}
function playerName(){return identity?.complete?identity.nickname:($('playerName').value.trim().slice(0,22)||'Игрок');}
function updateHUD(){
 const w=mode==='net'?server?.world:world;if(!w)return;
 $('stageNumber').textContent=String(w.level+1).padStart(2,'0')+' / 12';
 $('stageName').textContent=LEVELS[w.level]?.name||'ЛИПКИ';
 $('stageHint').textContent=LEVELS[w.level]?.hint||'';
 $('button-grab').classList.toggle('attached',!!w.players.find(p=>p.id===(mode==='net'?me?.id:'solo'))?.grab);
 $('button-grab').querySelector('span').textContent=w.players.find(p=>p.id===(mode==='net'?me?.id:'solo'))?.grab?'ОТПУСТИ':'ЛИПНУТЬ';
}
function startSolo(level=unlocked){
 exitRoom(false);mode='solo';name=playerName();if(!identity?.complete)save('name',name);
 world=makeWorld(['solo'],level);paused=false;softPositions.clear();changedLevel=level;setScreen('play');updateHUD();tone(490);
}
function setRoomState(data){
 if(!data||!['lobby','play','cleared','finished'].includes(data.phase)||!Array.isArray(data.players))return;
 if(!data.world||!Number.isInteger(data.world.level)||data.world.level<0||data.world.level>=LEVELS.length)return;
 const prev=server;server=data;connecting=false;busy=false;
 if(data.phase==='lobby'){setScreen('online');renderOnline();return;}
 if(prev?.world?.level!==data.world.level){softPositions.clear();tone(600);changedLevel=data.world.level;}
 if(data.phase==='play'){
  if(screen!=='play'){setScreen('play');}updateHUD();
 }else{mode='net';showResult(data.phase==='finished');}
}
function status(t,bad=false){$('netStatus').textContent=t;$('netStatus').classList.toggle('offline',bad);}
function inviteCode(){return roomId.slice(0,8).toUpperCase();}
function renderOnline(){
 const hasRoom=!!roomId;
 $('onlineMenu').hidden=hasRoom;
 $('lobby').hidden=!hasRoom;
 $('onlineTitle').textContent=hasRoom?'ВАША КОМАНДА':'ИГРАЙТЕ ВМЕСТЕ';
 if(!hasRoom){$('roomCodeInput').value=joinAfter||$('roomCodeInput').value||initialRoom;return;}
 $('roomCode').textContent=inviteCode();
 $('roster').replaceChildren();
 const players=server?.players||[];
 for(const [i,p] of players.entries()){
  const line=document.createElement('div');line.className='rosterPlayer';
  const dot=document.createElement('span');dot.className='rosterDot';dot.style.background=['#ef876e','#64b8ad','#e8bb59','#a28bcb'][i%4];
  const title=document.createElement('b');title.textContent=p.name||'Игрок';
  const tag=document.createElement('small');tag.textContent=p.id===server?.host?'Ведущий':p.id===me?.id?'Вы':'';
  line.append(dot,title,tag);$('roster').append(line);
 }
 $('members').textContent=players.length+' / 4';
 $('startButton').hidden=server?.host!==me?.id;
 $('startButton').disabled=players.length<2||!connected;
 $('startButton').textContent=players.length<2?'ЖДЁМ ДРУГА':'НАЧАТЬ ВМЕСТЕ';
 status(connected?'POCKETNET · ПОДКЛЮЧЕНО':'ПОИСК СОЕДИНЕНИЯ',!connected);
}
function send(payload){
 if(!net||!connected)return false;
 try{net.sendGame(payload);return true}catch{status('СВЯЗЬ ПОТЕРЯНА',true);return false;}
}
function disconnect(){
 const old=net;net=null;server=null;me=null;roomId='';connecting=false;connected=false;busy=false;
 if(old){try{if(old.roomId&&old.socket?.readyState===1)old.leaveRoom()}catch{}try{old.close()}catch{}}
}
function exitRoom(toMenu=true){disconnect();if(toMenu)setScreen('menu');}
function connect(action,room=''){
 if(connecting||busy)return;
 mode='net';name=playerName();if(!identity?.complete)save('name',name);joinAfter=room.toUpperCase();
 connecting=true;busy=true;status('СОЕДИНЯЕМСЯ…');setScreen('online');renderOnline();
 const before=netOrigin;
 // A new explicit room action must not automatically rejoin an old room.
 sessionStore.removeItem('pocket-net:'+before);
 const client=new PocketNet({serverUrl:netOrigin,name,identityKey:identity?.complete?identity.id:'guest',storage:sessionStore});net=client;
 client.on('connected',event=>{if(net!==client)return;me=event.player;connected=true;status('POCKETNET · ПОДКЛЮЧЕНО');renderOnline();});
 client.on('room_joined',event=>{if(net!==client)return;roomId=event.roomId;connecting=false;busy=false;setRoomState(event.state);send({type:'sync'});});
 client.on('game_event',event=>{if(net!==client)return;
  if(event.event?.type==='state')setRoomState(event.event.payload);
  if(event.event?.type==='notice')message(String(event.event.payload||''));
 });
 client.on('presence',()=>{if(net===client)send({type:'sync'});});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;status('ВОССТАНАВЛИВАЕМ СВЯЗЬ',true);if(screen==='online')renderOnline();});
 client.on('room_closed',()=>{if(net!==client)return;exitRoom();message('Комната закрыта');});
 client.on('error',event=>{if(net!==client)return;connecting=false;busy=false;
  const errors={room_full:'В комнате уже четыре игрока',room_not_found:'Комната не найдена',match_in_progress:'Игра уже началась',game_unavailable:'Серверный модуль ещё не опубликован'};
  message(errors[event.code]||event.message||'Ошибка PocketNet');
  if(screen==='online')renderOnline();
 });
 client.connect().then(()=>{
  if(net!==client)return;
  if(action==='create')client.createRoom('lipki');
  else if(action==='join')client.joinRoom(room);
 }).catch(error=>{
  if(net!==client)return;
  disconnect();setScreen('online');status('НЕТ СОЕДИНЕНИЯ',true);
  message(error.message||'PocketNet сейчас недоступен');
 });
}
function showResult(finished=false){
 if(screen==='result')return;
 setScreen('result');
 const w=mode==='net'?server?.world:world;if(!w)return;
 const last=finished||w.level===LEVELS.length-1;
 $('resultTitle').textContent=last?'УЗОР ГОТОВ!':'СТЕЖОК ПРОЙДЕН';
 $('resultText').textContent=last?'Все двенадцать уровней пройдены.':LEVELS[w.level].name;
 $('nextButton').textContent=last?'ИГРАТЬ СНАЧАЛА':'СЛЕДУЮЩИЙ УРОВЕНЬ';
 $('nextButton').hidden=mode==='net'&&server?.host!==me?.id;
 $('waitingHost').hidden=mode!=='net'||server?.host===me?.id;
 if(mode==='solo'){unlocked=Math.max(unlocked,Math.min(w.level+1,11));save('unlocked',unlocked);}
 tone(810,'spring');buzz(30);
}
function advance(){
 if(mode==='net'){send({type:server?.phase==='finished'?'again':'next'});return;}
 const next=world.level+1;world=makeWorld(['solo'],next<LEVELS.length?next:0);
 if(next>=LEVELS.length){unlocked=11;save('unlocked',unlocked);}
 softPositions.clear();setScreen('play');updateHUD();
}
function restart(){
 if(mode==='net'){if(server?.host!==me?.id){message('Перезапуск доступен ведущему');return;}send({type:'restart'});}
 else{world=makeWorld(['solo'],world.level);setScreen('play');updateHUD();}
}
function pauseGame(){paused=true;setScreen('pause');$('pauseCaption').textContent=mode==='net'?'Сеть продолжает работать':'Тренировка приостановлена';$('restartButton').hidden=mode==='net'&&server?.host!==me?.id;updateSound();}
function resume(){paused=false;setScreen('play');}
function updateSound(){$('soundButton').textContent='ЗВУК: '+(sound?'ВКЛ':'ВЫКЛ');}
function copy(text){
 const fallback=()=>{
  const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.append(a);a.select();
  const ok=document.execCommand?.('copy');a.remove();if(!ok)throw Error('copy unavailable');
 };
 const go=async()=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else fallback();message('Скопировано');tone(640);}catch{message('Не удалось скопировать. Код: '+inviteCode());}};
 go();
}
function bindPress(el,key){
 let active=new Set();
 const update=()=>{held[key]=active.size>0;el.classList.toggle('pressed',held[key]);};
 el.addEventListener('pointerdown',e=>{if(e.button!==0||screen!=='play')return;e.preventDefault();active.add(e.pointerId);try{el.setPointerCapture(e.pointerId)}catch{}update();tone(key==='jump'?540:330);if(key==='grab')buzz(9);});
 const off=e=>{active.delete(e.pointerId);update();};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,off);
 window.addEventListener('blur',()=>{active.clear();update();});
}
['left','right','jump','grab'].forEach(key=>bindPress($('button-'+key),key));
document.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup',' ','a','d','w','e','shift'].includes(k)&&screen==='play'){e.preventDefault();keys.add(k);}
 if(k==='escape'&&!e.repeat){if(screen==='play')pauseGame();else if(screen==='pause')resume();}
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function input(){
 return {x:(held.right||keys.has('d')||keys.has('arrowright')?1:0)-(held.left||keys.has('a')||keys.has('arrowleft')?1:0),
  jump:held.jump||keys.has(' ')||keys.has('w')||keys.has('arrowup'),grab:held.grab||keys.has('e')||keys.has('shift')};
}
function animate(now){
 const dt=clamp((now-lastFrame)/1000||0,.001,.05);lastFrame=now;
 if(screen==='play'||screen==='result'||screen==='pause'){
  if(mode==='solo'&&screen==='play'&&world.phase==='play'){
   const before=world.players[0].grounded;
   tickWorld(world,dt,{solo:input()});
   if(!before&&world.players[0].grounded&&world.players[0].vy===0)tone(160);
   if(world.phase==='cleared')showResult(world.level===LEVELS.length-1);
  }else if(mode==='net'&&server?.phase==='play'&&connected&&now-lastSend>85){
   const a=screen==='play'?input():{x:0,jump:false,grab:false};
   send({type:'input',x:a.x,jump:a.jump,grab:a.grab});lastSend=now;
  }
 }
 let w=mode==='net'?server?.world:world;
 if(w){
  // Blend server snapshots for visual smoothness; all interactions remain server authoritative.
  if(mode==='net'){
   const used=new Set(),players=w.players.map(p=>{
    used.add(p.id);let q=softPositions.get(p.id);
    if(!q){q={x:p.x,y:p.y};softPositions.set(p.id,q);}
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d>180){q.x=p.x;q.y=p.y;}else{const f=1-Math.pow(.0006,dt);q.x+=(p.x-q.x)*f;q.y+=(p.y-q.y)*f;}
    return {...p,x:q.x,y:q.y};
   });
   for(const id of softPositions.keys())if(!used.has(id))softPositions.delete(id);
   w={...w,players};
  }
  drawWorld($('gameCanvas'),w,mode==='net'?(me?.id||''):(screen==='menu'?'demo':'solo'),now,mode==='net');
 }
 if(screen==='play'&&(now%600<20))updateHUD();
 requestAnimationFrame(animate);
}
$('soloButton').addEventListener('click',()=>startSolo());
$('onlineButton').addEventListener('click',()=>{setScreen('online');renderOnline();});
$('onlineBack').addEventListener('click',()=>exitRoom());
$('createButton').addEventListener('click',()=>connect('create'));
$('joinButton').addEventListener('click',()=>{
 const code=$('roomCodeInput').value.trim().toUpperCase();
 if(!/^(?:[0-9A-F]{8}|[0-9A-F-]{36})$/.test(code)){message('Введите код из восьми символов');return;}
 connect('join',code);
});
$('copyCode').addEventListener('click',()=>copy(inviteCode()));
$('copyLink').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('room',inviteCode());copy(url.href);});
$('startButton').addEventListener('click',()=>{if((server?.players.length||0)<2)return;send({type:'start'});});
$('pauseTrigger').addEventListener('click',pauseGame);
$('resumeButton').addEventListener('click',resume);
$('restartButton').addEventListener('click',restart);
$('quitButton').addEventListener('click',()=>{if(mode==='net')exitRoom();else setScreen('menu');});
$('resultQuit').addEventListener('click',()=>{if(mode==='net')exitRoom();else setScreen('menu');});
$('nextButton').addEventListener('click',advance);
$('soundButton').addEventListener('click',()=>{sound=!sound;save('sound',sound?'on':'off');updateSound();if(sound)tone(540);});
$('playerName').addEventListener('change',()=>{name=playerName();save('name',name)});
window.addEventListener('pagehide',resetHeld);
window.addEventListener('visibilitychange',()=>{if(document.hidden)resetHeld();lastFrame=performance.now()});
window.addEventListener('online',()=>{if(screen==='online'&&!connected)status('POCKETNET · ПОДКЛЮЧЕНИЕ')});
updateSound();displayProfile();setScreen('menu');requestAnimationFrame(animate);
getPocketIdentity().then(v=>{identity=v;displayProfile();if(initialRoom){setScreen('online');renderOnline();connect('join',initialRoom);}});
