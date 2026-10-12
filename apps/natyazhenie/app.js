import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {GameRoom,cleanRoomCode} from './room.js';
import {paint,coverWorld} from './art.js';
import {advancePosition} from './engine.js';
import {newLocal,tickLocal,verifyLocalLayouts,CHAPTERS} from './local.js';
installMobileRuntime();
createWorkshopMode({appName:'НАТЯЖЕНИЕ',version:'1.3.0',cachePrefix:'natyazhenie-',storageNamespace:'pocket-works:natyazhenie'});
const $=id=>document.getElementById(id);
const localKey='pocket-works:natyazhenie:';
const read=(key,fallback='')=>{try{return localStorage.getItem(localKey+key)??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(localKey+key,String(value));}catch{}};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errors={room_not_found:'Комната не найдена. Проверь код.',room_full:'В комнате уже пять игроков.',account_already_in_room:'Этот Pocket ID уже участвует в комнате.',match_in_progress:'Игра уже началась.',game_unavailable:'Игра ещё не опубликована в PocketNet.',room_version_unavailable:'Эта комната требует другой версии игры.',server_at_capacity:'PocketNet переполнен.',rate_limited:'Слишком много действий, попробуйте снова.'};
const color=['#ff7282','#70c7f5','#8fdb8d','#ffc968','#b7a1f4'];
let profile=null,screen='menu',connecting=false,roomAction='create',gameMode='online',state=null,world=null;
let paused=false,keys=new Set(),touch=new Set(),touchPointers=new Map(),lastFrame=0,lastInput=0,lastInputSignature='',snapshotTime=0,localPrediction=null;
let visual=new Map(),lastLevel=-1,shownFinish=false,lastFalls=new Map(),lastCover=0,lastPhase=0;
let toastId=0,flashId=0,ctxAudio=null,sound=read('sound','on')!=='off';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('name').value=read('name','Игрок');
$('sound').textContent='Звук: '+(sound?'вкл':'выкл');
const memoryId=read('name','Игрок');
const fromUrl=new URLSearchParams(location.search).get('room');
const room=new GameRoom({
 connected(){connecting=false;$('signal').classList.remove('offline');if(screen==='lobby')updateLobby();},
 joined(event){connecting=false;updateUrl(event.roomId);setState(event.state);},
 state:setState,
 notice(value){toast(String(value));},
 presence(){updateLobby();},
 disconnected(){ $('signal').classList.add('offline');if(screen==='lobby')updateLobby();toast('Переподключаемся к друзьям…');},
 error(value){connecting=false;const code=value?.code||String(value?.message||value);toast(errors[code]||errors[code?.split(': ').at(-1)]||code||'Ошибка соединения');if(screen==='lobby')updateLobby();},
 closed(){leave();toast('Комната закрыта');}
});
function clickSound(kind='tap'){
 if(!sound)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctxAudio||=new Audio();ctxAudio.resume?.();const t=ctxAudio.currentTime;
 const o=ctxAudio.createOscillator(),v=ctxAudio.createGain(),hz={tap:370,jump:475,win:790,fail:180}[kind]||370;
 o.type='sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(kind==='win'?hz*1.6:hz*.65,t+.12);
 v.gain.setValueAtTime(.025,t);v.gain.exponentialRampToValueAtTime(.0001,t+.13);
 o.connect(v).connect(ctxAudio.destination);o.start(t);o.stop(t+.15);}catch{}
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastId);toastId=setTimeout(()=>el.classList.remove('visible'),2600);}
function flash(message){const el=$('flash');el.textContent=message;el.classList.add('on');clearTimeout(flashId);flashId=setTimeout(()=>el.classList.remove('on'),1300);}
function setScreen(name){screen=name;for(const id of ['menu','lobby','game'])$(id).hidden=id!==name;if(name!=='game'){$('pause-sheet').hidden=true;$('finish-sheet').hidden=true;paused=false;}clearInput();}
function clearInput(){keys.clear();touch.clear();touchPointers.clear();lastInputSignature='';if(room.connected&&gameMode==='online')room.send({type:'input',dir:0,jump:false,anchor:false});}
function nickname(){const name=(profile?.complete?profile.nickname:$('name').value.trim()).slice(0,22)||'Игрок';save('name',name);return name;}
function updateUrl(id){const u=new URL(location.href);if(id)u.searchParams.set('room',id.slice(0,8));else u.searchParams.delete('room');history.replaceState(null,'',u.pathname+u.search);}
function showJoin(){roomAction='join';setScreen('lobby');$('join-section').hidden=false;$('room-section').hidden=true;$('lobby-title').textContent='Присоединиться';$('status').textContent='Введи код комнаты друга';$('room-input').focus();}
function showConnecting(){setScreen('lobby');$('join-section').hidden=true;$('room-section').hidden=true;$('lobby-title').textContent='Связываемся…';$('status').textContent='Подключаем PocketNet';}
function updateLobby(){
 if(screen!=='lobby')return;
 if(!room.roomId){$('room-section').hidden=true;$('join-section').hidden=connecting||roomAction!=='join';$('status').textContent=connecting?'Подключаемся…':room.connected?'Соединение готово':'Нет соединения';return;}
 $('room-section').hidden=false;$('join-section').hidden=true;
 const team=state?.players||[];$('lobby-title').textContent='Команда собрана?';
 $('room-code').textContent=room.code();
 $('players').innerHTML=team.map((p,i)=>'<div class="player-badge" style="--dot:'+color[i%5]+'"><span>'+escape(p.name)+(p.id===room.self?.id?' (ты)':'')+'</span></div>').join('');
 $('lobby-hint').textContent=team.length<2?'Пригласи друга — нужно хотя бы двое.':team.length+'/5 игроков · можно начинать';
 $('status').textContent=room.connected?'Комната открыта':'Восстанавливаем соединение…';
 $('start').hidden=state?.host!==room.self?.id;
 $('start').disabled=team.length<2||!room.connected;
}
function setState(next){
 if(!next||!['lobby','play','done'].includes(next.phase)||!Array.isArray(next.players)||next.players.length>5)return;
 const phase=state?.phase,previousLevel=state?.world?.level??-1,previousStagePhase=state?.world?.phase??-1;
 state=next;world=next.world||null;snapshotTime=performance.now();
 if(next.phase==='lobby'){lastLevel=-1;localPrediction=null;setScreen('lobby');updateLobby();return;}
 if(screen!=='game'){setScreen('game');shownFinish=false;lastLevel=-1;}
 const currentLevel=world?.level??0;
 if(lastLevel!==currentLevel){
  if(lastLevel>=0){flash('УРОВЕНЬ ПРОЙДЕН!');clickSound('win');}
  localPrediction=null;visual.clear();lastFalls.clear();lastLevel=currentLevel;lastPhase=world?.phase??0;
 }
 if(previousLevel===currentLevel&&world?.phase>previousStagePhase&&previousStagePhase>=0){flash(world?.stage?.kind==='lift'&&world?.phase===1?'МАЯТНИК УСКОРИЛСЯ!':world?.stage?.rescue&&world?.phase===1?'МОСТ ПОЯВИЛСЯ!':'ЭТАП ВЫПОЛНЕН!');clickSound('win');}
 if(next.phase==='play'&&phase==='done'){$('finish-sheet').hidden=true;shownFinish=false;paused=false;}
 if(next.phase==='done'){if(!shownFinish){clickSound('win');save('clears',Number(read('clears','0'))+1);}shownFinish=true;$('finish-sheet').hidden=false;$('again').hidden=next.host!==room.self?.id;$('finish-copy').textContent='Все '+(next.levels||CHAPTERS.length)+' испытаний пройдены всей командой.';}
 updateGameUI();
}
function updateGameUI(){
 if(!world)return;
 $('chapter').textContent=world.stage.name;
 const stage=world.stage,seq=stage.sequence||[],goal=seq[world.phase||0];
 const names={wheels:'Заведи ленту на барабан',stars:'Собери искры',pads:'Займи кнопки и держи',
  beacons:'Протяни ленту через кольцо',tension:'Натяни связь и удержи',rescue:'Вытащи сорвавшегося друга',
  signals:'Проведи ленту через линзы',balance:'Удержи противовес'};
 const done=world.pads.filter(Boolean).length+world.stars.filter(Boolean).length+
  (world.beacons||[]).filter(Boolean).length+(world.wheelDone||[]).filter(Boolean).length+
  (world.tensionDone?1:0)+(world.saveCount>0?1:0);
 const total=world.pads.length+world.stars.length+(stage.beacons?.length||0)+
  (stage.wheels?.length||0)+(stage.tension?1:0)+(stage.rescue?1:0);
 $('hint').textContent=world.gateOpen?'Все к выходу →':seq.length?
  ((world.phase+1)+'/'+seq.length+' · '+(names[goal]||stage.hint)):
  stage.hint+' · '+done+'/'+total;

 $('progress').textContent=String(world.level+1).padStart(2,'0')+' / '+String(gameMode==='online'&&state?.levels?state.levels:CHAPTERS.length).padStart(2,'0');
 $('signal').classList.toggle('offline',gameMode==='online'&&!room.connected);
}
function startOnline(action,code=''){
 if(connecting)return;
 const name=nickname();roomAction=action;connecting=true;gameMode='online';state=null;world=null;$('local-help').hidden=true;
 showConnecting();
 room.open({name,identityKey:profile?.complete?profile.id:'guest',action,code});
}
function leave(){room.close();state=null;world=null;localPrediction=null;visual.clear();connecting=false;gameMode='online';paused=false;updateUrl('');setScreen('menu');}
function startLocal(){
 room.close();gameMode='local';state=null;world=newLocal();lastLevel=0;lastPhase=0;shownFinish=false;visual.clear();localPrediction=null;
 setScreen('game');$('local-help').hidden=false;updateGameUI();flash('ИГРОК 1 — WASD · ИГРОК 2 — СТРЕЛКИ');
}
function togglePause(flag){
 if(screen!=='game'||(gameMode==='online'&&state?.phase==='done'))return;
 paused=flag;$('pause-sheet').hidden=!flag;
 $('pause-description').textContent=gameMode==='online'?'У друзей игра продолжается.':'Оба персонажа остановлены.';
 $('restart').disabled=gameMode==='online'&&state?.host!==room.self?.id;
 if(flag){clearInput();$('resume').focus();}else document.activeElement?.blur?.();
}
function localControl(index){
 if(index===0)return {dir:(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),jump:keys.has('KeyW')||keys.has('Space'),anchor:keys.has('ShiftLeft')||keys.has('KeyE')};
 return {dir:(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0),jump:keys.has('ArrowUp'),anchor:keys.has('Enter')||keys.has('Numpad0')};
}
function control(){
 const dir=((keys.has('KeyD')||keys.has('ArrowRight')||touch.has('right'))?1:0)-((keys.has('KeyA')||keys.has('ArrowLeft')||touch.has('left'))?1:0);
 return {dir,jump:keys.has('Space')||keys.has('KeyW')||keys.has('ArrowUp')||touch.has('jump'),anchor:keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyE')||touch.has('anchor')};
}
function renderOnline(dt,now){
 if(!world||!world.players?.length)return;
 const age=Math.min(.12,(now-snapshotTime)/1000),input=paused?{dir:0,jump:false,anchor:false}:control(),selfId=room.self?.id;
 const stage={...world.stage,open:world.gateOpen};
 const projected=world.players.map((p,i)=>{
  if(p.id===selfId){
   if(!localPrediction)localPrediction={...p,jumpHeld:input.jump&&!p.ground};
   if(!paused&&room.connected)localPrediction=advancePosition(localPrediction,input,dt,stage,world.players);
   // Reconciliation uses a short server forward projection rather than snapping to an old sample.
   const serverFuture=advancePosition({...p,jumpHeld:localPrediction.jumpHeld},input,Math.min(.09,age+.04),stage,world.players);
   const gap=Math.hypot(localPrediction.x-serverFuture.x,localPrediction.y-serverFuture.y);
   if(gap>155)localPrediction={...serverFuture};
   else{const k=1-Math.exp(-dt/0.2);localPrediction.x+=(serverFuture.x-localPrediction.x)*k;localPrediction.y+=(serverFuture.y-localPrediction.y)*k;}
   localPrediction.name=p.name;return {...p,...localPrediction};
  }
  let q=visual.get(p.id);if(!q)q={x:p.x,y:p.y,vx:p.vx,vy:p.vy};
  let tx=p.x+p.vx*age,ty=p.y+(p.ground?0:p.vy*age+525*age*age);
  tx=Math.max(18,Math.min(1162,tx));ty=Math.max(18,Math.min(730,ty));
  const k=1-Math.exp(-dt/.075);if(Math.hypot(q.x-tx,q.y-ty)>170){q.x=tx;q.y=ty;}
  else{q.x+=(tx-q.x)*k;q.y+=(ty-q.y)*k;}
  q.vx=p.vx;q.vy=p.vy;visual.set(p.id,q);return {...p,...q};
 });
 paint($('canvas'),{...world,clock:(world.clock||0)+age,players:projected},{self:selfId,time:now/1000,reduced});
}
function frame(now){
 const dt=Math.min(.04,Math.max(0,(now-lastFrame)/1000||0));lastFrame=now;
 if(screen==='menu'&&now-lastCover>32){paint($('cover'),coverWorld(),{time:now/1000,cover:true,reduced});lastCover=now;}
 if(screen==='game'&&world){
  if(gameMode==='local'){
   if(!paused&&!world.finished){
    const prior=world.level,priorPhase=world.phase;tickLocal(world,[localControl(0),localControl(1)],dt);
    if(prior!==world.level){lastLevel=world.level;lastPhase=0;flash('УРОВЕНЬ ПРОЙДЕН!');clickSound('win');updateGameUI();}
    else if(priorPhase!==world.phase){lastPhase=world.phase;flash(world.stage.kind==='lift'&&world.phase===1?'МАЯТНИК УСКОРИЛСЯ!':world.stage.rescue&&world.phase===1?'МОСТ ПОЯВИЛСЯ!':'ЭТАП ВЫПОЛНЕН!');clickSound('win');updateGameUI();}
    else if(Math.floor(now/130)!==Math.floor((now-16)/130))updateGameUI();
    if(world.finished&&!shownFinish){shownFinish=true;$('finish-sheet').hidden=false;save('clears',Number(read('clears','0'))+1);clickSound('win');}
   }
   paint($('canvas'),world,{self:'local-0',time:now/1000,reduced});
  }else{
   if(state?.phase==='play'&&room.connected){
    const input=paused?{dir:0,jump:false,anchor:false}:control(),sig=input.dir+':'+input.jump+':'+input.anchor;
    const interval=paused?150:65;
    if(now-lastInput>interval||(sig!==lastInputSignature&&now-lastInput>26)){
     room.send({type:'input',...input});lastInput=now;lastInputSignature=sig;
    }
   }
   renderOnline(dt,now);
  }
 }
 requestAnimationFrame(frame);
}
$('sound').addEventListener('click',()=>{sound=!sound;save('sound',sound?'on':'off');$('sound').textContent='Звук: '+(sound?'вкл':'выкл');clickSound();});
$('create').addEventListener('click',()=>{clickSound();startOnline('create');});
$('join-open').addEventListener('click',()=>{clickSound();showJoin();});
$('local').addEventListener('click',()=>{clickSound();startLocal();});
$('lobby-back').addEventListener('click',leave);
$('join').addEventListener('click',()=>{const code=cleanRoomCode($('room-input').value);if(!code){toast('Введите восемь символов из приглашения.');return;}clickSound();startOnline('join',code);});
$('room-input').addEventListener('keydown',e=>{if(e.key==='Enter'){$('join').click();}});
$('start').addEventListener('click',()=>{if(room.send({type:'start'}))clickSound();});
$('copy-code').addEventListener('click',()=>copy(room.code()));
$('copy-link').addEventListener('click',()=>copy(room.link()));
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Скопировано');clickSound();}catch{toast('Скопируй код: '+room.code());}}
$('pause').addEventListener('click',()=>togglePause(true));
$('resume').addEventListener('click',()=>togglePause(false));
$('leave').addEventListener('click',leave);
$('finish-menu').addEventListener('click',leave);
$('restart').addEventListener('click',()=>{
 if(gameMode==='local'){world=newLocal(world.level);lastLevel=world.level;lastPhase=0;togglePause(false);updateGameUI();}
 else if(state?.host===room.self?.id){room.send({type:'restart'});togglePause(false);}
});
$('again').addEventListener('click',()=>{
 if(gameMode==='local'){world=newLocal();lastLevel=0;lastPhase=0;shownFinish=false;$('finish-sheet').hidden=true;updateGameUI();}
 else if(state?.host===room.self?.id)room.send({type:'start'});
});
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.altKey||e.metaKey||e.ctrlKey)return;
 if(e.code==='Escape'&&screen==='game'){e.preventDefault();if(!e.repeat)togglePause(!paused);return;}
 if(screen!=='game')return;
 const allowed=['KeyA','KeyD','KeyW','Space','ArrowLeft','ArrowRight','ArrowUp','ShiftLeft','ShiftRight','KeyE','Enter','Numpad0'];
 if(allowed.includes(e.code)){e.preventDefault();if(!keys.has(e.code)&&['Space','KeyW','ArrowUp'].includes(e.code))clickSound('jump');if(!keys.has(e.code)&&['ShiftLeft','ShiftRight','KeyE','Enter','Numpad0'].includes(e.code))clickSound('tap');keys.add(e.code);}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
for(const button of document.querySelectorAll('[data-key]')){
 button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touchPointers.set(e.pointerId,button.dataset.key);touch.add(button.dataset.key);if(button.dataset.key==='jump')clickSound('jump');button.classList.add('held');});
 const release=e=>{const k=touchPointers.get(e.pointerId);touchPointers.delete(e.pointerId);if(k&&![...touchPointers.values()].includes(k))touch.delete(k);button.classList.remove('held');};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();lastFrame=performance.now();});
window.addEventListener('pagehide',clearInput);
window.__natyazhenieQA=()=>({screen,mode:gameMode,connected:room.connected,players:world?.players?.length||state?.players?.length||0,
 level:world?.level??-1,finished:!!world?.finished,issues:verifyLocalLayouts()});
(async()=>{try{profile=await getPocketIdentity();if(profile?.complete){$('identity').textContent='Pocket ID · '+profile.nickname;$('name').value=profile.nickname;$('name').readOnly=true;}else $('identity').textContent='Гость';}catch{$('identity').textContent='Гостевой профиль';}
 if(fromUrl){const code=cleanRoomCode(fromUrl);if(code){$('room-input').value=code;showJoin();startOnline('join',code);}}
})();
if(verifyLocalLayouts().length)console.error('NATYAZHENIE: invalid local layouts',verifyLocalLayouts());
requestAnimationFrame(frame);
