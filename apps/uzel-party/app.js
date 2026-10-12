import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {LEVELS,COLORS,newMatch,activatePlayer,command,step,drawBoard} from './game.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const ORIGIN=location.origin+'/pocketnet',PREFIX='pocket-works:uzel-party:';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=(k,d='')=>{try{return localStorage.getItem(PREFIX+k)||d}catch{return d}};
const store=(k,v)=>{try{localStorage.setItem(PREFIX+k,String(v))}catch{}};
const memory=new Map();
const storage={
 getItem(k){try{return sessionStorage.getItem(PREFIX+'session:'+k)}catch{return memory.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(PREFIX+'session:'+k,v)}catch{memory.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(PREFIX+'session:'+k)}catch{memory.delete(k)}}
};
let profile=null,name=local('name','Игрок'),sound=local('sound','on')!=='off',unlocked=clamp(+local('level','0')||0,0,3);
let mode='menu',net=null,me=null,server=null,practice=null,roomId='',connected=false,busy=false,screen='menu';
let paused=false,dash=false,keys=new Set(),move={x:0,y:0},pointer=null,lastSent=0,lastFrame=0,toastTimeout=0,lastLevel=-1,lastVictory=-1;
let code=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
function setStatus(text,bad=false){$('connection').textContent=text;$('connection').classList.toggle('bad',bad)}
function toast(text){const n=$('toast');n.textContent=String(text);n.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>n.classList.remove('show'),3000)}
function tone(f=590){if(!sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const a=window.__uzelAudio||(window.__uzelAudio=new C());a.resume?.();const o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.setValueAtTime(f,a.currentTime);o.frequency.exponentialRampToValueAtTime(f*.76,a.currentTime+.11);g.gain.setValueAtTime(.024,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.15);o.connect(g).connect(a.destination);o.start();o.stop(a.currentTime+.16)}catch{}}
function choose(next){screen=next;for(const id of ['menu','pair','play'])$(id).classList.toggle('hidden',id!==next);if(next!=='play'){paused=false;resetStick()}}
function saveName(){name=profile?.complete?profile.nickname:($('playerName').value.trim().slice(0,22)||'Игрок');$('playerName').value=name;if(!profile?.complete)store('name',name)}
function initIdentity(){if(profile?.complete){name=profile.nickname;$('playerName').value=name;$('playerName').readOnly=true;$('accountBadge').textContent='Pocket ID · '+name}else{$('playerName').value=name;$('playerName').readOnly=false;$('accountBadge').textContent='Гостевой режим · PocketNet доступен без аккаунта'}}
function endRoom(menu=true){const old=net;net=null;if(old){try{if(connected&&old.roomId)old.leaveRoom()}catch{}try{old.close()}catch{}}server=null;me=null;roomId='';connected=false;busy=false;mode='menu';if(menu)choose('menu')}
async function checkNet(){
 setStatus('ПРОВЕРКА');
 try{const r=await fetch(ORIGIN+'/health',{cache:'no-store',signal:AbortSignal.timeout(6500)});const data=await r.json();setStatus(r.ok&&data.modules?.includes('uzel-party')?'POCKETNET · ГОТОВ':'ОЖИДАЕМ МОДУЛЬ',!r.ok||!data.modules?.includes('uzel-party'))}
 catch{setStatus('POCKETNET · НЕТ СВЯЗИ',true)}
}
function buildLobby(){
 choose('pair');
 $('pairTitle').textContent=roomId?'Ваша команда':'Присоединиться';
 $('pairSubtitle').textContent='PocketNet: играйте из любых сетей по коду или ссылке. LAN-сопряжение не требуется.';
 const area=$('pairContent');
 if(busy){area.innerHTML='<div class="pair-content-section"><p>Соединяемся с PocketNet…</p></div>';$('pairPlay').classList.add('hidden');return}
 if(!roomId){
  area.innerHTML='<div class="pair-content-section"><label class="field-label" for="joinCodeField">КОД КОМНАТЫ</label><input id="joinCodeField" class="name-input" maxlength="36" autocomplete="off" value="'+esc(code)+'" placeholder="8 символов"><button class="primary-action" id="enterCode" type="button">Войти по коду ↗</button></div>';
  $('pairPlay').classList.add('hidden');$('pairReturn').classList.add('hidden');return;
 }
 const short=roomId.slice(0,8).toUpperCase(),list=(server?.players||[]).map((p,i)=>'<div class="roster-entry"><span class="roster-dot" style="background:'+COLORS[i%COLORS.length]+'"></span><b>'+esc(p.name)+'</b><small>'+(p.id===server?.host?'Ведущий':p.id===me?.id?'Ты':'Игрок')+'</small></div>').join('');
 area.innerHTML='<div class="pair-content-section"><div class="eyebrow">КОД-ПРИГЛАШЕНИЕ</div><div class="room-code" data-selectable>'+short+'</div><div class="two-actions"><button id="copyCode" type="button">Скопировать код</button><button id="copyLink" type="button">Ссылка другу</button></div><p>От 2 до 6 игроков. Комната доступна через интернет.</p></div><div class="pair-content-section"><div class="eyebrow">УЧАСТНИКИ · '+(server?.players.length||1)+'/6</div>'+list+'</div>';
 $('pairPlay').classList.toggle('hidden',server?.host!==me?.id);
 $('pairPlay').disabled=!connected||(server?.players.length||0)<2;
 $('pairReturn').classList.add('hidden');
}
function netView(){
 if(!server||!['play','done'].includes(server.phase))return null;
 const level=clamp(server.level||0,0,LEVELS.length-1);
 return {level,phase:server.phase==='done'?'won':'play',paused:false,elapsed:0,rev:server.revision,
  sparks:LEVELS[level].sparks.map((_,i)=>server.lit?.includes(i)||false),
  players:server.players.map((p,i)=>({id:p.id,name:String(p.name).replace(/^Гость · /,''),x:server.positions?.[p.id]?.x??350,y:server.positions?.[p.id]?.y??755,color:COLORS[i%COLORS.length],boost:0}))};
}
const frame=()=>mode==='solo'?practice:netView();
function updateHUD(){
 const g=frame();if(!g)return;const count=g.sparks.filter(Boolean).length,total=g.sparks.length;
 $('levelNo').textContent=String(g.level+1).padStart(2,'0');$('levelTitle').textContent=LEVELS[g.level].name;
 $('lightCount').textContent=count+' / '+total;
 $('stageHint').textContent=count===total?'Открыто! Соберитесь у ворот.':'Натяните верёвку через светящиеся кольца';
 $('controlPlayer').textContent=mode==='solo'?'Ведёшь: '+(g.players.find(p=>p.id===practice.activeId)?.name||name):'Ведёшь: '+(g.players.find(p=>p.id===me?.id)?.name||name);
 $('controlExplain').textContent=mode==='solo'?'Другой герой следует за тобой':'Вместе с друзьями';
 $('switchButton').classList.toggle('hidden',mode!=='solo');
 if(g.phase==='won'&&lastVictory!==g.level)showVictory();
}
function showVictory(){
 const g=frame();if(!g)return;lastVictory=g.level;tone(780);
 $('pauseOverlay').classList.add('hidden');$('winOverlay').classList.remove('hidden');
 const all=mode==='net'||g.level===LEVELS.length-1;
 $('winTitle').textContent=all?'Вся нить собрана.':'Испытание пройдено!';
 $('winTime').textContent=mode==='solo'?'Напарник не отстал. Идём дальше?':'Четыре испытания пройдены вместе.';
 $('nextButton').textContent=all?'Начать снова ↗':'Следующее испытание ↗';
 $('nextButton').disabled=mode==='net'&&server?.host!==me?.id;
 if(mode==='solo'){unlocked=Math.max(unlocked,Math.min(3,g.level+1));store('level',unlocked)}
}
function openGame(){
 choose('play');lastVictory=-1;paused=false;$('pauseOverlay').classList.add('hidden');$('winOverlay').classList.add('hidden');updateHUD();
}
function startSolo(level=unlocked){
 endRoom(false);saveName();mode='solo';practice=newMatch([{id:'main',name},{id:'companion',name:'Спутник'}],clamp(level,0,3),true);practice.activeId='main';openGame();tone(450);
}
function onState(data){
 if(!data||!['lobby','play','done'].includes(data.phase)||!Array.isArray(data.players)||data.players.length>6)return;
 const previous=server;server=data;busy=false;
 if(data.phase==='lobby'){if(screen!=='pair')buildLobby();else buildLobby();}
 else{
  if(previous?.level!==data.level&&data.phase==='play'){tone(680);toast('Испытание '+(data.level+1)+' · '+LEVELS[data.level]?.name)}
  if(screen!=='play')openGame();else updateHUD();
 }
}
function wire(client){
 client.on('connected',data=>{if(net!==client)return;me=data.player;connected=true;setStatus('POCKETNET · В СЕТИ')});
 client.on('room_joined',data=>{if(net!==client)return;roomId=data.roomId;busy=false;onState(data.state);send({type:'sync'});});
 client.on('game_event',data=>{if(net!==client)return;if(data.event?.type==='state')onState(data.event.payload);if(data.event?.type==='notice')toast(data.event.payload)});
 client.on('presence',()=>{if(net===client)send({type:'sync'})});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;setStatus('ВОССТАНОВЛЕНИЕ',true)});
 client.on('room_closed',()=>{if(net===client){endRoom();toast('Комната закрылась.')}});
 client.on('error',err=>{if(net!==client)return;busy=false;const issues={room_not_found:'Комната не найдена',room_full:'Комната заполнена',match_in_progress:'Игра уже началась',game_unavailable:'Игровой модуль не опубликован'};toast(issues[err?.code]||'Ошибка PocketNet');if(screen==='pair')buildLobby()});
}
async function connect(action){
 if(busy)return;
 saveName();if(net)endRoom(false);mode='net';busy=true;choose('pair');buildLobby();
 try{
  if(action!=='resume')storage.removeItem('pocket-net:'+ORIGIN);
  const client=new PocketNet({serverUrl:ORIGIN,name,storage,identityKey:profile?.id||'guest'});net=client;wire(client);
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Соединение не установлено')),12000))]);
  if(net!==client)return;
  busy=false;
  if(action==='create')client.createRoom('uzel-party');
  else if(action==='resume'){if(client.roomId)client.joinRoom(client.roomId);else buildLobby()}
  else buildLobby();
 }catch(e){endRoom();toast(e.message||'Не удалось подключиться');setStatus('POCKETNET · ОШИБКА',true)}
}
function send(action){if(!net||!connected)return false;try{net.sendGame(action);return true}catch{toast('Соединение потеряно');return false}}
function joinCode(){
 const raw=$('joinCodeField')?.value.trim().toUpperCase()||code;
 if(!/^(?:[0-9A-F]{8}|[0-9A-F-]{36})$/.test(raw)){toast('Нужен код из 8 символов.');return}
 if(!net||!connected){toast('Соединение ещё не готово.');return}
 code=raw;busy=true;buildLobby();try{net.joinRoom(code)}catch{busy=false;buildLobby();toast('Не удалось войти')}
}
function pause(open=!paused){if(screen!=='play')return;paused=open;$('pauseOverlay').classList.toggle('hidden',!open);resetStick();
 $('restartButton').disabled=mode==='net'&&server?.host!==me?.id;
 const label=$('pauseOverlay').querySelector('.eyebrow');if(label)label.textContent=mode==='net'?'ЛОКАЛЬНОЕ МЕНЮ':'ТРЕНИРОВКА ПРИОСТАНОВЛЕНА';
}
function switchHero(){if(!practice||mode!=='solo')return;const index=practice.players.findIndex(p=>p.id===practice.activeId);activatePlayer(practice,practice.players[(index+1)%practice.players.length].id);updateHUD();tone(380)}
function input(){
 let x=move.x,y=move.y;
 if(keys.has('a')||keys.has('arrowleft'))x-=1;
 if(keys.has('d')||keys.has('arrowright'))x+=1;
 if(keys.has('w')||keys.has('arrowup'))y-=1;
 if(keys.has('s')||keys.has('arrowdown'))y+=1;
 const d=Math.hypot(x,y);return d>1?{x:x/d,y:y/d}:{x,y};
}
function tick(t){
 const dt=clamp((t-lastFrame)/1000||0,0,.045);lastFrame=t;
 if(screen==='play'){
  const dir=input();
  if(!paused&&mode==='solo'&&practice?.phase==='play'){
   if(dash){command(practice,practice.activeId,{tug:true});dash=false;tone(340)}
   const events=step(practice,{[practice.activeId]:dir},dt);
   if(events.some(e=>e.type==='spark')){tone(690);updateHUD()}
   if(events.some(e=>e.type==='won'))updateHUD();
  }else if(!paused&&mode==='net'&&server?.phase==='play'&&connected&&t-lastSent>110){
   if(Math.hypot(dir.x,dir.y)>.05){send({type:'move',dx:dir.x,dy:dir.y,dash});dash=false;lastSent=t;}
  }
  const g=frame();if(g)drawBoard($('board'),g,t);
 }
 requestAnimationFrame(tick);
}
function resetStick(){pointer=null;move={x:0,y:0};$('joystickKnob').style.transform='translate(-50%,-50%)'}
function stick(e){
 const rect=$('joystick').getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,max=rect.width*.36;
 const dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy)||1,f=Math.min(1,max/d);
 move={x:dx*f/max,y:dy*f/max};
 $('joystickKnob').style.transform='translate(calc(-50% + '+Math.round(dx*f)+'px),calc(-50% + '+Math.round(dy*f)+'px))';
}
$('joystick').addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);stick(e)});
$('joystick').addEventListener('pointermove',e=>{if(pointer===e.pointerId){e.preventDefault();stick(e)}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,e=>{if(e.pointerId===pointer)resetStick()});
document.addEventListener('keydown',e=>{if(e.target.matches?.('input,textarea,[contenteditable]'))return;const k=e.key.toLowerCase();
 if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)){e.preventDefault();keys.add(k)}
 if(k===' '){dash=true;tone(320)}
 if(k==='tab'&&mode==='solo'&&screen==='play'){e.preventDefault();switchHero()}
 if(k==='escape'&&screen==='play')pause()
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();resetStick()});
async function copy(s){
 try{await navigator.clipboard.writeText(s);toast('Скопировано')}catch{const el=document.createElement('textarea');el.value=s;el.style.cssText='position:fixed;top:-100px;opacity:0';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();toast(ok?'Скопировано':'Выделите код вручную')}
}
$('soloButton').onclick=()=>startSolo();
$('hostButton').onclick=()=>connect('create');
$('joinButton').onclick=()=>connect('join');
$('pairBack').onclick=()=>endRoom();
$('pairPlay').onclick=()=>{if(server?.host===me?.id&&server.players.length>=2)send({type:'start'})};
$('pairReturn').onclick=openGame;
$('pairContent').addEventListener('click',e=>{
 const id=e.target.id;
 if(id==='enterCode')joinCode();
 if(id==='copyCode')copy(roomId.slice(0,8).toUpperCase());
 if(id==='copyLink')copy(new URL(location.pathname+'?room='+roomId.slice(0,8).toUpperCase(),location.origin).href);
});
$('pauseButton').onclick=()=>pause();
$('resumeButton').onclick=()=>pause(false);
$('restartButton').onclick=()=>{if(mode==='solo')startSolo(practice.level);else if(server?.host===me?.id){send({type:'restart'});pause(false)}};
$('leaveButton').onclick=()=>{if(mode==='net')endRoom();else{practice=null;mode='menu';choose('menu')}};
$('winMenuButton').onclick=$('leaveButton').onclick;
$('nextButton').onclick=()=>{if(mode==='solo')startSolo((practice.level+1)%LEVELS.length);else if(server?.host===me?.id)send({type:'start'})};
$('switchButton').onclick=switchHero;
$('tugButton').onclick=()=>{dash=true;tone(350)};
$('audioButton').onclick=()=>{sound=!sound;store('sound',sound?'on':'off');$('audioButton').textContent=sound?'♪':'♩';toast(sound?'Звук включён':'Звук выключен')};
$('audioButton').textContent=sound?'♪':'♩';
$('hostButton').textContent='Создать PocketNet';
$('pair').setAttribute('aria-label','Подключение к PocketNet');
$('pairSubtitle').textContent='Комнаты PocketNet работают через интернет.';
initIdentity();checkNet();requestAnimationFrame(tick);
getPocketIdentity().then(id=>{profile=id;initIdentity()}).catch(()=>{});
if(code)connect('join');
