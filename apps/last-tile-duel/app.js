import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createGame,advance,botAction,DIRECTIONS} from './engine.js';

installMobileRuntime();
createWorkshopMode({
 appName:'Последняя плита', version:'1.0.0',
 cachePrefix: 'last-tile-duel-', storageNamespace: 'pocket-works:last-tile-duel'
});
const $=id=>document.getElementById(id);
const SERVER=location.origin+'/pocketnet',PREFIX='pocket-works:last-tile-duel:';
const store={
 getItem(k){try{return localStorage.getItem(PREFIX+k);}catch{return null;}},
 setItem(k,v){try{localStorage.setItem(PREFIX+k,String(v));}catch{}},
 removeItem(k){try{localStorage.removeItem(PREFIX+k);}catch{}}
};
let nickname=store.getItem('nickname')||'Игрок';
let sound=store.getItem('sound')!=='off',practiceWins=Number(store.getItem('wins')||0);
let mode='menu',net=null,connected=false,me=null,roomId='',state=null,local=createGame();
let direction='stay',ability='step',abilityAt=-1,seq=0,connectGeneration=0;
let dialogMode='',roomIntent='',preloadedCode=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
let lastTurn=-1,lastSnapshotAt=Date.now(),lastPhase='',lastSoundTurn=-1,toaster=null,ctx=null,lastPlayed=0;
const tiles=[];
for(let i=0;i<49;i++){const tile=document.createElement('div');tile.className='cell';tile.dataset.hp='3';tile.setAttribute('aria-hidden','true');$('tiles').append(tile);tiles.push(tile);}
const positions=[[$('player0'),10],[$('player1'),38]];
function showToast(message) {
 $('toast').textContent=message;
 $('toast').classList.add('show');
 clearTimeout(toaster);
 toaster=setTimeout(()=>$('toast').classList.remove('show'),2800);
}
function chooseName(){
 const value=$('nickname').value.trim().replace(/\s+/g,' ').slice(0,22);
 if(!value){showToast('Введите имя');return false;}
 nickname=value;store.setItem('nickname',nickname);return true;
}
function game(){return mode==='practice'?local:mode==='online'&&state?.game?state.game:null;}
function mySide(){return state?.players?.findIndex(p=>p.id===me?.id)??0;}
function soundscape(kind){
 if(!sound || performance.now()-lastPlayed<42)return;
 lastPlayed=performance.now();
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  ctx ||=new Audio();if(ctx.state==='suspended')ctx.resume();
  const now=ctx.currentTime;
  // Ceramic/stone contacts: textured scrape plus a restrained low wooden thud.
  const length=kind==='fall'?.23:kind==='push'?.17:kind==='win'?.31:.075;
  const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate);
  const a=noise.getChannelData(0);let seed=kind.length*319+13;
  for(let i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;a[i]=((seed/4294967296)*2-1)*Math.pow(1-i/a.length,1.25);}
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=noise;filter.type='bandpass';filter.frequency.value=kind==='fall'?480:kind==='push'?690:kind==='win'?900:1700;
  filter.Q.value=.65;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(kind==='fall'?.09:.035,now+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,now+length);
  source.connect(filter).connect(gain).connect(ctx.destination);source.start(now);source.stop(now+length+.01);
  if(['fall','push','win','jump'].includes(kind)){
   const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=kind==='win'?'triangle':'sine';
   const f=kind==='win'?360:kind==='jump'?420:kind==='push'?153:100;
   osc.frequency.setValueAtTime(f,now);osc.frequency.exponentialRampToValueAtTime(f*.63,now+length);
   env.gain.setValueAtTime(.026,now);env.gain.exponentialRampToValueAtTime(.0001,now+length);
   osc.connect(env).connect(ctx.destination);osc.start(now);osc.stop(now+length+.01);
  }
 }catch{/* Audio is an optional feedback channel. */}
}
function drawBoard(g){
 const data=g||createGame();
 data.tiles.forEach((hp,i)=>{if(tiles[i].dataset.hp!==String(hp))tiles[i].dataset.hp=String(hp);});
 positions.forEach(([element],i)=>{
  const position=data.pos[i];element.classList.toggle('is-dead',position<0);
  if(position>=0) {
   element.style.left=((position%7+.5)/7*100)+'%';
   element.style.top=((Math.floor(position/7)+.5)/7*100)+'%';
  }
 });
}
function scoreView(g){
 $('score0').textContent=String(g.scores[0]);$('score1').textContent=String(g.scores[1]);
 $('round').textContent='РАУНД '+g.round;
 const players=mode==='online'&&state?.players?state.players:[{name:nickname},{name:'Бот'}];
 $('name0').textContent=players[0]?.name||'Синий';$('name1').textContent=players[1]?.name||'Оранжевый';
 $('netstate').textContent=mode==='practice'?'ЛОКАЛЬНО · 1 ГЦ':connected?'СЕРВЕР · 1 ГЦ':'НЕТ СВЯЗИ';
}
function feedback(g){
 if(!g)return;
 if(g.turn===lastTurn)return;
 const old=lastTurn;lastTurn=g.turn;lastSnapshotAt=Date.now();
 const events=g.effects||[];
 if(old>=0) {
  if(g.phase==='between'||g.phase==='finished')soundscape(g.phase==='finished'?'win':'fall');
  else if(events.some(e=>e.type==='push'))soundscape('push');
  else if(events.some(e=>e.type==='jump'))soundscape('jump');
  else if(events.some(e=>e.type==='step'))soundscape('step');
  for(const e of events)if(e.target>=0&&e.type==='step'){
   const chip=$('player'+e.who);chip.classList.remove('is-landing');void chip.offsetWidth;chip.classList.add('is-landing');
  }
 }
 if(ability!=='step'&&g.turn>abilityAt){ability='step';abilityAt=-1;}
}
function renderControls(g){
 const my=mySide(),jump=g.jump[mode==='online'?my:0],push=g.push[mode==='online'?my:0];
 const jumpButton=$('jump'),pushButton=$('push');
 jumpButton.disabled=jump>0 || g.phase!=='battle';pushButton.disabled=push>0||g.phase!=='battle';
 $('jumpCd').textContent=jump>0?jump+' тиков до готовности':'2 клетки';
 $('pushCd').textContent=push>0?push+' тиков до готовности':'Соседняя клетка';
 jumpButton.classList.toggle('selected',ability==='jump');pushButton.classList.toggle('selected',ability==='push');
 document.querySelectorAll('[data-dir]').forEach(b=>b.classList.toggle('selected',b.dataset.dir===direction));
 const label={up:'ВВЕРХ',right:'ВПРАВО',down:'ВНИЗ',left:'ВЛЕВО',stay:'СТОЙ'};
 $('command').textContent=(ability==='step'?'':ability==='jump'?'ПРЫЖОК · ':'ТОЛЧОК · ')+label[direction];
 if(g.phase==='between')$('event').textContent=g.last||'Раунд закончен';
 else if(!connected&&mode==='online')$('event').textContent='Восстанавливаем соединение';
 else $('event').textContent='Действие будет выполнено на следующем тике';
}
function render(){
 const g=game(),phase=mode==='online'?(state?.phase||'lobby'):mode==='practice'?(local.phase==='finished'?'finished':'playing'):mode;
 const onMenu=phase==='menu',onLobby=phase==='lobby',onGame=phase==='playing',onFinish=phase==='finished';
 $('menu').hidden=!onMenu;$('lobby').hidden=!onLobby;
 $('controls').hidden=!onGame;$('finished').hidden=!onFinish;
 $('score').hidden=!(onGame||onFinish);
 $('loading').hidden=mode!=='connecting';
 $('resume').hidden=!Boolean(readSavedRoom());
 if(onLobby&&state){
  const host=state.host===me?.id;
  $('roomCode').textContent=(roomId||'').slice(0,8).toUpperCase();
  $('seat0').textContent=state.players[0]?.name||'Игрок 1';
  $('seat1').textContent=state.players[1]?.name||'Ожидаем…';
  $('start').disabled=!host||state.players.length!==2||!connected;
  $('start').textContent=host?(state.players.length===2?'НАЧАТЬ МАТЧ':'ЖДЁМ СОПЕРНИКА'):'ЖДЁМ ХОЗЯИНА';
 }
 if(g){
  feedback(g);drawBoard(g);
  if(onGame||onFinish)scoreView(g);
  if(onGame)renderControls(g);
  $('roundToast').classList.toggle('visible',onGame&&g.phase==='between');
  $('roundToast').textContent=g.last||'Раунд завершён';
  if(onFinish){
   const side=mode==='online'?mySide():0;
   $('finishTitle').textContent=g.winner===side?'ПОБЕДА':g.winner===-1?'НИЧЬЯ':'ПОРАЖЕНИЕ';
   $('finishScore').textContent=g.scores[0]+' : '+g.scores[1];
   const host=mode==='practice'||state?.host===me?.id;
   $('again').disabled=!host||(mode==='online'&&!connected);
   $('again').textContent=host?'РЕВАНШ ↗':'ЖДЁМ РЕВАНША';
  }
 }else{
  drawBoard(createGame());$('roundToast').classList.remove('visible');
 }
 if(onMenu||onLobby)$('roundToast').classList.remove('visible');
 document.body.dataset.mode=phase;
 window.__AI_TEST_STATE__={
  mode,phase,connected,turn:g?.turn??null,round:g?.round??null,
  scores:g?.scores?.slice()||null,positions:g?.pos?.slice()||null,
  tileHealth:g?.tiles?.slice()||null,queued:{dir:direction,kind:ability},
  room:roomId?roomId.slice(0,8):null
 };
}
function savedNet(){
 try{return JSON.parse(store.getItem('pocket-net:'+SERVER)||'null');}
 catch{return null;}
}
function readSavedRoom(){return savedNet()?.roomId||'';}
function send(type,action){
 if(!net||!connected||mode!=='online')return false;
 try{net.sendGame({type,seq:++seq,action});return true;}catch{return false;}
}
function queueInput(){
 // Direction changes are held client-side; one packet per second keeps PocketNet cheap.
 updateLocalSelection();
}
function updateLocalSelection(){
 const g=game();
 if(g&&$('controls').hidden===false)renderControls(g);
}
function chooseDir(dir){
 if(!Object.hasOwn(DIRECTIONS,dir))return;
 direction=dir;
 if(dir==='stay')ability='step';
 soundscape('select');
 queueInput();
}
function chooseAbility(kind){
 const g=game();if(!g||g.phase!=='battle')return;
 const index=mode==='online'?mySide():0;
 if(g[kind][index]>0){showToast('Способность ещё восстанавливается');return;}
 ability=ability===kind?'step':kind;
 abilityAt=g.turn;
 soundscape('select');queueInput();
 if(direction==='stay'&&ability!=='step')showToast('Теперь выбери направление');
}
function resetAction(){
 direction='stay';ability='step';abilityAt=-1;seq=0;lastTurn=-1;lastSnapshotAt=Date.now();
}
function startPractice(){
 closeNet();resetAction();local=createGame();mode='practice';render();soundscape('select');
}
function closeNet(leave=true){
 connectGeneration++;
 if(net){if(leave&&net.roomId)try{net.leaveRoom();}catch{}
  net.close();
 }
 net=null;connected=false;me=null;roomId='';state=null;
 if(leave)store.removeItem('pocket-net:'+SERVER);
}
function backToMenu(){
 closeNet();resetAction();mode='menu';local=createGame();
 history.replaceState(null,'',location.pathname);
 render();
}
function openDialog(type){
 dialogMode=type;$('modal').hidden=false;
 $('nickname').value=nickname;
 $('nameLabel').hidden=type==='exit';$('nickname').hidden=type==='exit';
 $('codeLabel').hidden=type!=='join';$('invite').hidden=type!=='join';
 $('invite').value=preloadedCode;
 const title=type==='create'?'ВЫЗВАТЬ ДРУГА':type==='join'?'ВОЙТИ ПО КОДУ':'ПОКИНУТЬ МАТЧ?';
 $('dialogTitle').textContent=title;
 $('dialogHelp').textContent=type==='exit'?'В сетевой дуэли уход засчитывается как поражение.':type==='join'?'Введи 8 символов с экрана друга.':'Создадим отдельную комнату на двоих.';
 $('dialogOk').textContent=type==='exit'?'ПОКИНУТЬ':'ПРОДОЛЖИТЬ';
}
function closeDialog(){$('modal').hidden=true;dialogMode='';}
async function commitDialog(){
 const kind=dialogMode;
 if(kind==='exit'){closeDialog();backToMenu();return;}
 if(!chooseName())return;
 const code=$('invite').value.trim().toUpperCase();
 if(kind==='join'&&!/^(?:[0-9A-F]{8}|[0-9A-F]{8}-[0-9A-F-]{27})$/.test(code)){
  showToast('Проверь код: нужно 8 символов');return;
 }
 closeDialog();preloadedCode=code;
 await connectNet(kind,code);
}
async function connectNet(intent,code=''){
 closeNet(false);resetAction();mode='connecting';render();
 const attempt=connectGeneration;let pending=intent;
 if(intent!=='resume')store.removeItem('pocket-net:'+SERVER);
 net=new PocketNet({serverUrl:SERVER,name:nickname,storage:store});
 const active=()=>attempt===connectGeneration;
 net.on('connected',info=>{
  if(!active())return;connected=true;me=info?.player||me;
  if(pending==='create'){pending='';net.createRoom('last-tile-duel');}
  else if(pending==='join'){pending='';net.joinRoom(code);}
  else if(pending==='resume'){pending='';if(!net.roomId){backToMenu();showToast('Комната уже закрыта');}}
  render();
 });
 net.on('room_joined',info=>{
  if(!active())return;
  if(info.gameId!=='last-tile-duel'){
   backToMenu();showToast('Это комната другой игры');return;
  }
  roomId=info.roomId;state=info.state;mode='online';lastTurn=-1;
  connected=true;history.replaceState(null,'',location.pathname+'?room='+roomId.slice(0,8));
  render();
 });
 net.on('game_event',message=>{
  if(!active()||message?.roomId!==roomId)return;
  const event=message.event;
  if(event?.type==='notice'){if(!event.to||event.to===me?.id)showToast(event.payload);return;}
  if(event?.type==='state'&&event.payload&&(!state||event.payload.revision>=state.revision)) {
   const previous=state?.phase;
   state=event.payload;
   if(previous!=='playing'&&state.phase==='playing'){resetAction();}
   render();
  }
 });
 net.on('presence',message=>{
  if(!active()||message.roomId!==roomId)return;
  if(state&&Array.isArray(message.players)){state.players=message.players;render();}
  if(message.disconnected&&message.disconnected!==me?.id)showToast('Соперник отключился. Ожидаем связь…');
 });
 net.on('error',err=>{
  if(!active())return;
  showToast('Ошибка PocketNet: '+(typeof err==='string'?err:err?.code||err?.message||'соединение'));
  if(mode==='connecting'||err?.code==='room_not_found'||err?.code==='room_full')backToMenu();
 });
 net.on('disconnected',()=>{
  if(!active())return;connected=false;render();showToast('Связь потеряна. Переподключаемся…');
 });
 net.on('room_closed',()=>{
  if(!active())return;backToMenu();showToast('Комната закрыта');
 });
 net.on('room_kicked',()=>{
  if(!active())return;backToMenu();showToast('Комната недоступна');
 });
 try{
  await net.connect();
  if(!active())return;
 }catch(error){
  if(!active())return;backToMenu();showToast('Не удалось подключиться: '+error.message);
 }
}
function tick(){
 if(document.hidden)return;
 if(mode==='practice'&&local.phase!=='finished'){
  const old=local.phase;
  advance(local,[{dir:direction,kind:ability},botAction(local,1)]);
  if(ability!=='step'){ability='step';abilityAt=-1;}
  if(old!=='finished'&&local.phase==='finished'&&local.winner===0){
   practiceWins++;store.setItem('wins',String(practiceWins));
  }
  render();
 } else if(mode==='online'&&state?.phase==='playing'&&connected) {
  send('pulse',{dir:direction,kind:ability});
 }
}
function copy(text){
 if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).then(()=>showToast('Скопировано')).catch(()=>fallbackCopy(text));
 fallbackCopy(text);
}
function fallbackCopy(text){
 const input=document.createElement('textarea');
 input.value=text;input.style.position='fixed';input.style.left='-9999px';
 document.body.append(input);input.select();const ok=document.execCommand?.('copy');
 input.remove();showToast(ok?'Скопировано':'Выдели и скопируй код: '+text);
}
function shareRoom(){
 const url=location.origin+location.pathname+'?room='+roomId.slice(0,8).toUpperCase();
 if(navigator.share)navigator.share({title:'Последняя плита',text:'Дуэль 1 на 1',url}).catch(()=>{});
 else copy(url);
}
function handleKeys(event){
 if($('modal').hidden===false||document.activeElement?.tagName==='INPUT')return;
 if(mode!=='practice'&&!(mode==='online'&&state?.phase==='playing'))return;
 const code=event.code;
 const map={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
 if(map[code]){
  event.preventDefault();
  if(!event.repeat)chooseDir(map[code]);
 }else if(code==='Space'){event.preventDefault();if(!event.repeat)chooseAbility('jump');}
 else if(code==='KeyE'){event.preventDefault();if(!event.repeat)chooseAbility('push');}
 else if(code==='KeyX'||code==='KeyQ'){event.preventDefault();chooseDir('stay');}
}
$('create').addEventListener('click',()=>openDialog('create'));
$('join').addEventListener('click',()=>openDialog('join'));
$('practice').addEventListener('click',startPractice);
$('resume').addEventListener('click',()=>connectNet('resume'));
$('dialogOk').addEventListener('click',commitDialog);
$('dialogCancel').addEventListener('click',closeDialog);
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeDialog();});
$('invite').addEventListener('keydown',e=>{if(e.key==='Enter')commitDialog();});
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')commitDialog();});
$('sound').addEventListener('click',()=>{
 sound=!sound;store.setItem('sound',sound?'on':'off');
 $('sound').textContent=sound?'ЗВУК: ВКЛ':'ЗВУК: ВЫКЛ';
 $('sound').setAttribute('aria-label',sound?'Отключить звук':'Включить звук');
 if(sound)soundscape('select');
});
document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('click',()=>chooseDir(button.dataset.dir)));
$('jump').addEventListener('click',()=>chooseAbility('jump'));
$('push').addEventListener('click',()=>chooseAbility('push'));
$('quit').addEventListener('click',()=>{if(mode==='online')openDialog('exit');else backToMenu();});
$('start').addEventListener('click',()=>{
 if(mode==='online'&&connected&&state?.host===me?.id&&state?.players.length===2)send('start');
});
$('leaveLobby').addEventListener('click',backToMenu);
$('roomCode').addEventListener('click',()=>copy(roomId.slice(0,8).toUpperCase()));
$('copy').addEventListener('click',()=>copy(roomId.slice(0,8).toUpperCase()));
$('share').addEventListener('click',shareRoom);
$('again').addEventListener('click',()=>{
 if(mode==='practice')startPractice();
 else if(mode==='online'&&connected&&state?.host===me?.id)send('again');
});
$('finishExit').addEventListener('click',backToMenu);
$('cancelConnection').addEventListener('click',backToMenu);
document.addEventListener('keydown',handleKeys);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
setInterval(tick,1000);
setInterval(()=>{
 if(document.hidden||$('controls').hidden)return;
 const next=mode==='online'?state?.nextAt||Date.now()+1000:lastSnapshotAt+1000;
 const elapsed=Math.min(1,Math.max(0,1-(next-Date.now())/1000));
 $('tickProgress').style.width=Math.round(elapsed*100)+'%';
},90);
$('sound').textContent=sound?'ЗВУК: ВКЛ':'ЗВУК: ВЫКЛ';
$('nickname').value=nickname;
render();
if(preloadedCode)openDialog('join');
