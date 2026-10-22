import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {campaign,endless,solve,step,solved,CAMPAIGN_NAMES} from './engine.js';
import {drawRobot,describeMove,bumpMotion,poseFor} from './actors.js';
import {drawDiorama,sceneFingerprint} from './diorama.js';
import {drawAxisImpulse,drawContactEffects,axisOf} from './feedback.js';
import {createSoundPlayer,soundForMove} from './sound.js';
import {isFreshOnlineRound,wonStageToken} from './online-flow.js';
import {makeReaction,reactionFrame,idleMoment,drawReactions} from './life.js';
installMobileRuntime();
const $=id=>document.getElementById(id),NET=location.origin+'/pocketnet',PREFIX='pocket-works:axis-pals:';
const local=(k,d='')=>{try{return localStorage.getItem(PREFIX+k)??d}catch{return d}};
const save=(k,v)=>{try{localStorage.setItem(PREFIX+k,String(v))}catch{}};
const memory=new Map(),storage={
 getItem(k){try{return sessionStorage.getItem(PREFIX+k)}catch{return memory.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(PREFIX+k,v)}catch{memory.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(PREFIX+k)}catch{memory.delete(k)}}
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let profile=null,name=local('name','Игрок'),sound=local('sound','on')!=='off',difficulty=local('difficulty','medium');
if(!['easy','medium','hard'].includes(difficulty))difficulty='medium';
let mode='menu',screen='menu',net=null,me=null,server=null,roomId='',connected=false,busy=false,offline=null;
let paused=false,overlayMode='',visual=null,lifeReaction=null,lastAction=performance.now(),toastTimer=0,previousKey='',lastAttempt='';
let autoAdvanceTimer=0,autoAdvanceKey='';
const AUTO_NEXT_DELAY=3200;
const soundPlayer=createSoundPlayer(()=>window.AudioContext||window.webkitAudioContext);
const pressTimers=new WeakMap();let axisTimer=0;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
let roomQuery=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
const roleIndex=()=>server?.roles?.indexOf(me?.id)??-1;
function notify(msg){$('toast').textContent=String(msg);$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2100)}
function noise(kind){soundPlayer.play(kind,sound)}
function flashAxis(direction){
 const axis=['up','down'].includes(direction)?'y':['left','right'].includes(direction)?'x':direction;
 if(axis!=='x'&&axis!=='y')return;
 const controls=document.querySelector('.controls');
 if(!controls)return;
 controls.dataset.activeAxis=axis;
 clearTimeout(axisTimer);
 axisTimer=setTimeout(()=>delete controls.dataset.activeAxis,155);
}
function pressFeedback(dir){
 flashAxis(dir);
 const button=document.querySelector('[data-move="'+dir+'"]');
 if(!button||button.disabled)return;
 clearTimeout(pressTimers.get(button));
 button.classList.remove('is-pressed');
 void button.offsetWidth;
 button.classList.add('is-pressed');
 pressTimers.set(button,setTimeout(()=>button.classList.remove('is-pressed'),145));
}

function vibrate(ms){try{navigator.vibrate?.(ms)}catch{}}
function show(which){
 screen=which;for(const id of ['menu','lobby','play'])$(id).classList.toggle('hidden',id!==which);
 if(which==='play'){renderHUD();resizeBoard()}else hideOverlay();
}
function getGame(){return mode==='online'?server:offline}
function updateName(){name=profile?.complete?profile.nickname:($('name').value.trim().slice(0,22)||'Игрок');$('name').value=name;if(!profile?.complete)save('name',name)}
function status(message,bad=false){$('netStatus').textContent=message;$('netStatus').classList.toggle('bad',bad)}
async function checkNet(){try{const r=await fetch(NET+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});const info=await r.json();status(r.ok&&info.modules?.includes('axis-pals')?'POCKETNET · ДОСТУПЕН':'POCKETNET · ОЖИДАНИЕ ПУБЛИКАЦИИ',!r.ok||!info.modules?.includes('axis-pals'))}catch{status('POCKETNET · НЕТ СОЕДИНЕНИЯ',true)}}
function setSound(){save('sound',sound?'on':'off');$('sound').textContent=sound?'ЗВУК ВКЛ':'ЗВУК ВЫКЛ'}
function localLevel(index,kind){return kind==='endless'?endless(index):campaign(index)}
function playLocal(kind='campaign',index){
 closeNet(false);mode='local';difficulty=local('difficulty','medium');
 const current=Number.isInteger(index)?index:(kind==='endless'?Math.max(1,+local('endless','1')||1):Math.min(CAMPAIGN_NAMES.length-1,+local('checkpoint','0')||0));
 const level=localLevel(current,kind);offline={kind,index:current,level,positions:level.starts.map(p=>({...p})),steps:0,phase:'play',difficulty,history:[],revision:0};
 visual=null;lifeReaction=null;lastAction=performance.now();paused=false;hideOverlay();show('play');noise('press');
}
function takeMove(dir){
 if(paused||overlayMode)return;
 const g=getGame();if(!g||g.phase!=='play')return;
 const isY=dir==='up'||dir==='down';
 if(mode==='online'){
  if(!connected){notify('Восстанавливаем соединение');return}
  const role=roleIndex();if(role<0||(role===0)!==isY){notify('Это ось партнёра');return}
  lastAttempt=dir;pressFeedback(dir);send({type:'move',direction:dir});return;
 }
 pressFeedback(dir);
 const outcome=step(g.level,g.positions,dir);if(!outcome.moved){visual=bumpMotion(g.positions,performance.now(),dir);lifeReaction=makeReaction(visual,g.level,g.phase,visual.at);lastAction=visual.at;noise('blocked');vibrate(14);notify('Оба ящика заблокированы');return}
 g.history.push(g.positions.map(p=>({...p})));g.positions=outcome.positions;g.steps++;g.revision++;
 visual=describeMove(g.history.at(-1),g.positions,performance.now(),dir);
 vibrate(outcome.blocked.some(Boolean)?12:6);
 if(solved(g.level,g.positions)){g.phase='won';noise('win');vibrate([40,50,40]);if(g.kind==='campaign')save('checkpoint',Math.max(+local('checkpoint','0')||0,Math.min(CAMPAIGN_NAMES.length,g.index+1)));if(g.kind==='endless')save('endless',Math.max(+local('endless','1')||1,g.index+1));setTimeout(()=>finishOverlay(),1500)}
 else if(g.steps>=g.level.moveLimits[g.difficulty]){g.phase='lost';setTimeout(()=>finishOverlay(),1050)}
 lifeReaction=makeReaction(visual,g.level,g.phase,visual.at);lastAction=visual.at;
 if(g.phase!=='won')noise(lifeReaction?.kind==='arrival'?'arrive':g.phase==='lost'?'error':soundForMove(visual));
 renderHUD();
}
function undo(){
 if(mode==='online')return;
 if(!offline||offline.phase!=='play'||!offline.history.length){notify('Нет хода для отмены');return}
 const before=offline.positions;offline.positions=offline.history.pop();offline.steps--;offline.revision++;
 visual=describeMove(before,offline.positions,performance.now(),'','undo');lifeReaction=makeReaction(visual,offline.level,offline.phase,visual?.at);lastAction=performance.now();renderHUD();noise('press');
}
function tip(){
 const g=getGame();if(!g||g.phase!=='play')return;
 if(mode==='online'){send({type:'hint'});return}
 const hint=solve(g.level,g.positions);const first=hint?.path?.[0];
 if(first){notify('Следующий ход: '+({up:'↑ вверх',down:'↓ вниз',left:'← влево',right:'→ вправо'}[first])+' · осталось '+hint.steps)}else notify('Решение не найдено');
}
function next(){
 const g=getGame();if(!g)return;
 if(mode==='online'){if(me?.id===g.host)send({type:g.phase==='complete'?'start':'next'});else notify('Следующий маршрут выбирает ведущий');return}
 if(g.kind==='campaign'&&g.index>=CAMPAIGN_NAMES.length-1){offline=null;show('menu');$('progress').textContent='КАМПАНИЯ · 12/12';return}
 playLocal(g.kind,g.index+1);
}
function restart(){
 const g=getGame();if(!g)return;
 if(mode==='online'){if(g.host!==me?.id){notify('Перезапускает ведущий');return}send({type:'restart'});return}
 playLocal(g.kind,g.index);
}
function hideOverlay(){overlayMode='';$('overlay').classList.add('hidden');paused=false}
function stopAutoAdvance(){
 clearTimeout(autoAdvanceTimer);autoAdvanceTimer=0;autoAdvanceKey='';
}
function scheduleAutoAdvance(snapshot=server){
 const token=wonStageToken(snapshot);
 if(!token||mode!=='online'||!connected||me?.id!==snapshot.host){stopAutoAdvance();return}
 if(token===autoAdvanceKey)return; // PocketNet sync/reconnect packets must not restart the countdown.
 stopAutoAdvance();autoAdvanceKey=token;
 autoAdvanceTimer=setTimeout(()=>{
  autoAdvanceTimer=0;
  if(mode==='online'&&connected&&me?.id===server?.host&&wonStageToken(server)===token)send({type:'next'});
 },AUTO_NEXT_DELAY);
}
function openOverlay(kind){
 overlayMode=kind;paused=true;$('overlay').classList.remove('hidden');
 $('overlayRestart').classList.remove('hidden');$('overlayMain').disabled=false;
 const g=getGame(),leader=mode!=='online'||g?.host===me?.id;
 if(kind==='pause'){$('overlayEyebrow').textContent='ПЕРЕРЫВ';$('overlayTitle').textContent='Смена на паузе';$('overlayText').textContent=mode==='online'?'Пауза только на этом устройстве. Партнёр остаётся в комнате.':'Маршрут сохранён до выхода в меню.';$('overlayMain').textContent='Продолжить';$('overlayRestart').disabled=!leader;}
 else if(kind==='won'){$('overlayEyebrow').textContent='ЗАКАЗ ВЫПОЛНЕН';$('overlayTitle').textContent='На своих местах.';$('overlayText').textContent='Оба груза доставлены за '+g.steps+' ходов. Оптимум: '+g.level.optimal+'.'+(mode==='online'?' Следующий маршрут начнётся автоматически.':'');$('overlayMain').textContent=mode==='online'?(leader?'Перейти сейчас':'Переход автоматически'):'Следующий маршрут';$('overlayMain').disabled=!leader;$('overlayRestart').disabled=!leader;}
 else if(kind==='lost'){$('overlayEyebrow').textContent='ЛИМИТ ИСЧЕРПАН';$('overlayTitle').textContent='Маршрут сорван';$('overlayText').textContent='Попробуйте иначе — используйте стены, чтобы разделять движения.';$('overlayMain').textContent=leader?'Попробовать снова':'Ожидаем ведущего';$('overlayMain').disabled=!leader;$('overlayRestart').classList.add('hidden');}
 else {$('overlayEyebrow').textContent='КАМПАНИЯ ЗАКРЫТА';$('overlayTitle').textContent='Склад покорён';$('overlayText').textContent='Все двенадцать маршрутов пройдены. Можно начать новую смену.';$('overlayMain').textContent=leader?'Начать заново':'Ожидаем ведущего';$('overlayMain').disabled=!leader;$('overlayRestart').classList.add('hidden')}
}
function finishOverlay(){const g=getGame();if(screen==='play'&&g&&['won','lost','complete'].includes(g.phase))openOverlay(g.phase)}
function renderHUD(){
 const g=getGame();if(screen!=='play'||!g?.level)return;
 const cap=g.level.moveLimits[g.difficulty]??'—';
 $('stageType').textContent=(g.kind==='endless'?'БЕСКОНЕЧНАЯ СМЕНА · ':'КАМПАНИЯ · ')+(g.kind==='endless'?String(g.index).padStart(2,'0'):String(g.index+1).padStart(2,'0')+'/12');
 $('stageName').textContent=g.level.name;$('counter').textContent=String(g.steps).padStart(2,'0')+' / '+String(cap).padStart(2,'0');
 const own=mode==='online'?roleIndex():-1;
 $('axisText').textContent=mode==='online'?(own===0?'ТВОЯ ОСЬ: Y':own===1?'ТВОЯ ОСЬ: X':'ОЖИДАНИЕ'):'ОБЕ ОСИ';
 document.querySelectorAll('[data-move]').forEach(b=>{const vertical=['up','down'].includes(b.dataset.move);b.disabled=g.phase!=='play'||paused||(mode==='online'&&(own<0||(own===0)!==vertical))});
 $('undo').disabled=mode==='online'||!g.history?.length||g.phase!=='play';
 $('hint').disabled=g.phase!=='play';
}
function refreshProgress(){const max=+local('checkpoint','0')||0;$('progress').textContent='КАМПАНИЯ · '+Math.max(0,Math.min(12,max))+'/12';const current=$('chapter').value||String(Math.min(max,CAMPAIGN_NAMES.length-1));$('chapter').replaceChildren(...CAMPAIGN_NAMES.slice(0,Math.min(CAMPAIGN_NAMES.length,Math.max(1,max+1))).map((name,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=String(i+1).padStart(2,'0')+' · '+name;return option}));$('chapter').value=Number(current)<=max?current:String(Math.min(max,CAMPAIGN_NAMES.length-1));}
function describeRole(id,index){return id===me?.id?'Вы · '+(index===0?'вертикаль ↕':'горизонталь ↔'):(index===0?'Вертикаль ↕':'Горизонталь ↔')}
function showLobby(){
 show('lobby');
 $('lobbyTitle').textContent=roomId?'Комната готова':'Войти в комнату';
 $('lobbyDescription').textContent=busy?'Соединяемся с сервером…':roomId?'Два оператора. Раздельное управление.':'Введите код из приглашения. Играть можно из любой сети.';
 $('codeEntry').classList.toggle('hidden',!!roomId||busy);
 $('roomArea').classList.toggle('hidden',!roomId);
 $('lobbyOptions').classList.toggle('hidden',!roomId);
 $('start').classList.toggle('hidden',!roomId||me?.id!==server?.host);
 $('start').disabled=!connected||server?.players?.length!==2;
 if(!roomId)return;
 $('roomCode').textContent=roomId.slice(0,8).toUpperCase();
 const list=server?.players||[];$('roster').innerHTML=list.map((p,i)=>'<div class="person"><b>'+esc(p.name)+'</b><small>'+describeRole(p.id,i)+'</small></div>').join('');
 $('kind').textContent=server?.kind==='endless'?'Бесконечная':'Кампания';
 $('kind').disabled=server?.host!==me?.id||server?.phase!=='lobby';
 document.querySelectorAll('[data-difficulty]').forEach(b=>{b.classList.toggle('selected',b.dataset.difficulty===server?.difficulty);b.disabled=server?.host!==me?.id||server?.phase==='play'});
}
function consume(next){
 if(!next||typeof next!=='object'||!['lobby','play','won','lost','complete'].includes(next.phase))return;
 const old=server,roundChanged=isFreshOnlineRound(old,next);server=next;
 if(next.phase==='lobby'){stopAutoAdvance();lifeReaction=null;visual=null;hideOverlay();showLobby();return}
 if(!next.level)return;
 if(screen!=='play'){hideOverlay();show('play')}
 else if(roundChanged)hideOverlay(); // Guest can already see the new board behind the old result modal.
 if(next.phase!=='won')stopAutoAdvance();
 if(old?.level&&old.revision!==next.revision&&old.level.seed===next.level.seed&&old.positions?.length===2&&next.positions?.length===2){
  visual=describeMove(old.positions,next.positions,performance.now());
  lifeReaction=makeReaction(visual,next.level,next.phase,visual?.at);
  if(visual){lastAction=visual.at}
  if(old.steps!==next.steps){if(next.phase==='play')noise(lifeReaction?.kind==='arrival'?'arrive':soundForMove(visual));else if(next.phase==='lost')noise('error');vibrate(visual?.blocked?.some(Boolean)?12:6);flashAxis(axisOf(visual))}
 }else{visual=null;lifeReaction=null;lastAction=performance.now()}
 renderHUD();
 const key=next.phase+':'+next.index;
 if(['won','lost','complete'].includes(next.phase)&&key!==previousKey){previousKey=key;if(next.phase==='won'||next.phase==='complete')noise('win');setTimeout(()=>finishOverlay(),next.phase==='lost'?1050:1500)}
 if(next.phase==='play')previousKey='';
 if(next.phase==='won')scheduleAutoAdvance(next);
}
function send(v){if(!net||!connected){notify('PocketNet отключён');return false}try{net.sendGame(v);return true}catch{notify('Нет соединения');return false}}
function closeNet(navigate=true){
 stopAutoAdvance();const active=net;net=null;if(active){try{if(connected&&active.roomId)active.leaveRoom()}catch{}active.close()}
 server=null;me=null;roomId='';connected=false;busy=false;if(navigate){mode='menu';show('menu');refreshProgress()}
}
function wire(client){
 client.on('connected',e=>{if(net!==client)return;connected=true;me=e.player;status('POCKETNET · В СЕТИ');if(screen==='lobby')showLobby();if(server?.phase==='won')scheduleAutoAdvance()});
 client.on('room_joined',e=>{if(net!==client)return;roomId=e.roomId;busy=false;consume(e.state);send({type:'sync'})});
 client.on('game_event',e=>{if(net!==client)return;if(e.event?.type==='state')consume(e.event.payload);if(e.event?.type==='notice'){if(String(e.event.payload).includes('Оба пути перекрыты')&&server?.positions?.length===2){visual=bumpMotion(server.positions,performance.now(),lastAttempt);lifeReaction=makeReaction(visual,server.level,server.phase,visual.at);lastAction=visual.at;noise('blocked');vibrate(14)}notify(e.event.payload)}});
 client.on('presence',()=>{if(net===client)send({type:'sync'})});
 client.on('disconnected',()=>{if(net===client){connected=false;stopAutoAdvance();status('POCKETNET · ПЕРЕПОДКЛЮЧЕНИЕ',true);renderHUD()}});
 client.on('room_closed',()=>{if(net===client){closeNet();notify('Комната закрылась')}});
 client.on('error',e=>{if(net!==client)return;busy=false;const why={room_full:'В комнате уже два игрока',room_not_found:'Комната не найдена',match_in_progress:'Игра уже идёт',game_unavailable:'Сервер игры пока не опубликован'};notify(why[e.code]||'Ошибка PocketNet');if(screen==='lobby')showLobby()});
}
async function connect(action){
 updateName();closeNet(false);mode='online';busy=true;showLobby();
 try{
  const client=new PocketNet({serverUrl:NET,name,storage,identityKey:profile?.id||'guest'});net=client;wire(client);
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Не удалось связаться с PocketNet')),13000))]);
  if(net!==client)return;
  if(action==='create')client.createRoom('axis-pals');
  else if(action==='join'){$('code').value=roomQuery;busy=false;showLobby()}
  else if(action==='resume'){if(client.roomId)client.joinRoom(client.roomId);else{busy=false;showLobby()}}
 }catch(e){closeNet();notify(e.message||'Ошибка подключения')}
}
function joinCode(){
 if(!net||!connected){notify('Сначала дождитесь подключения');return}
 const value=$('code').value.trim().toUpperCase();
 if(!/^[A-F0-9]{8}$|^[A-F0-9-]{36}$/i.test(value)){notify('Введите 8-значный код комнаты');return}
 busy=true;showLobby();try{net.joinRoom(value)}catch{busy=false;showLobby();notify('Не удалось войти')}
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);notify('Скопировано')}catch{
  const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;left:-9999px';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();notify(ok?'Скопировано':'Не удалось скопировать');
 }
}
const canvas=$('board'),ctx=canvas.getContext('2d',{alpha:false});let pixels=0,unit=1,sceneCache=null,sceneKey='';
function resizeBoard(){
 const g=getGame();if(screen!=='play'||!g?.level)return;
 const zone=document.querySelector('.board-zone');const rect=zone.getBoundingClientRect();
 if(rect.width<20||rect.height<20)return;
 const w=g.level.width,h=g.level.height,fit=Math.max(8,Math.min((rect.width-22)/(w+.2),(rect.height-24)/(h+.2)));
 const cw=w*fit,ch=h*fit;
 if(canvas.style.width!==cw+'px')canvas.style.width=cw+'px';
 if(canvas.style.height!==ch+'px')canvas.style.height=ch+'px';
 const dpr=Math.min(window.devicePixelRatio||1,2);
 const pw=Math.round(cw*dpr),ph=Math.round(ch*dpr);
 if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;sceneCache=null;sceneKey=''}
 pixels=dpr;unit=cw/w;
}
// Background/material lighting are rasterized only when the map or viewport changes.
function drawBoard(now){
 const g=getGame();if(screen!=='play'||!g?.level||!canvas.width)return;
 const lvl=g.level,d=pixels,u=unit;
 const key=sceneFingerprint(lvl,canvas.width,canvas.height,d);
 if(key!==sceneKey||!sceneCache){
  const surface=document.createElement('canvas');
  surface.width=canvas.width;surface.height=canvas.height;
  const sc=surface.getContext('2d',{alpha:false});
  if(sc){drawDiorama(sc,lvl,u,d);sceneCache=surface;sceneKey=key}
 }
 ctx.setTransform(d,0,0,d,0,0);
 if(sceneCache)ctx.drawImage(sceneCache,0,0,lvl.width*u,lvl.height*u);
 else{ctx.fillStyle='#cadacf';ctx.fillRect(0,0,lvl.width*u,lvl.height*u)}
 const reduced=Boolean(reducedMotion?.matches);
 const moment=reactionFrame(lifeReaction,now,reduced),idle=moment?null:idleMoment(lastAction,now,reduced);
 if(visual)drawAxisImpulse(ctx,visual,u,now,reduced);

 const base=g.positions||lvl.starts;
 if(base.length!==2)return;
 const positions=base.map((p,i)=>{
  if(visual&&visual.to&&now-visual.at<310){
   const pose=poseFor(visual,i,now,reduced);
   return {x:pose.x,y:pose.y};
  }
  return {x:p.x,y:p.y};
 });
 // Both machines share a control impulse, but each responds to obstacles individually.
 ctx.beginPath();ctx.moveTo((positions[0].x+.5)*u,(positions[0].y+.5)*u);ctx.lineTo((positions[1].x+.5)*u,(positions[1].y+.5)*u);
 ctx.strokeStyle='#30484444';ctx.setLineDash([u*.13,u*.12]);ctx.lineWidth=Math.max(1,u*.035);ctx.stroke();ctx.setLineDash([]);
 const win=g.phase==='won'||g.phase==='complete';
 for(let i=0;i<2;i++){
  const pose=visual&&now-visual.at<310?poseFor(visual,i,now,reduced):{x:positions[i].x,y:positions[i].y,impact:0,travel:0,lean:0,hop:0,dx:0,dy:0};
  const goal=lvl.goals[i],onGoal=base[i].x===goal.x&&base[i].y===goal.y;
  drawRobot(ctx,i,positions[i],positions[1-i],u,now,pose,{onGoal,win,reduced,reaction:moment,idleFace:idle?.id===i?idle.face:null});
 }
 if(visual)drawContactEffects(ctx,visual,u,now,reduced);
 if(lifeReaction)drawReactions(ctx,lifeReaction,positions,u,now,reduced);
}
function tick(t){if(screen==='play')drawBoard(t);requestAnimationFrame(tick)}
$('name').value=name;
$('sound').onclick=()=>{sound=!sound;setSound();noise('press')};setSound();
$('campaign').onclick=()=>{difficulty=$('localDifficulty').value;save('difficulty',difficulty);playLocal('campaign',Number($('chapter').value));};
$('endless').onclick=()=>{difficulty=$('localDifficulty').value;save('difficulty',difficulty);playLocal('endless');};
$('create').onclick=()=>connect('create');$('join').onclick=()=>connect('join');
$('lobbyBack').onclick=()=>closeNet();
$('enter').onclick=joinCode;
$('roomCode').onclick=()=>copy(roomId.slice(0,8).toUpperCase());
$('link').onclick=()=>copy(new URL(location.pathname+'?room='+roomId.slice(0,8).toUpperCase(),location.origin).href);
$('kind').onclick=()=>send({type:'kind',value:server?.kind==='campaign'?'endless':'campaign'});
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{if(mode==='online')send({type:'difficulty',value:b.dataset.difficulty});else{difficulty=b.dataset.difficulty;save('difficulty',difficulty);document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('selected',x.dataset.difficulty===difficulty));}});
$('start').onclick=()=>send({type:'start'});
document.querySelectorAll('[data-move]').forEach(b=>b.addEventListener('click',()=>takeMove(b.dataset.move)));
$('hint').onclick=tip;$('undo').onclick=undo;
$('pause').onclick=()=>{if(overlayMode)return;openOverlay('pause')};
$('overlayMain').onclick=()=>{const kind=overlayMode;if(kind==='pause'){hideOverlay();renderHUD();return}if(mode!=='online')hideOverlay();if(kind==='won'||kind==='complete')next();else if(kind==='lost')restart()};
$('overlayRestart').onclick=()=>{if(mode!=='online')hideOverlay();restart()};
$('overlayMenu').onclick=()=>{if(mode==='online')closeNet();else{offline=null;mode='menu';show('menu');refreshProgress()}};
document.addEventListener('keydown',e=>{
 if(screen!=='play'||e.repeat||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 const keys={KeyW:'up',KeyS:'down',ArrowLeft:'left',ArrowRight:'right'};
 if(keys[e.code]){e.preventDefault();if(!overlayMode)takeMove(keys[e.code])}
 if(e.code==='Escape'){e.preventDefault();if(overlayMode==='pause'){hideOverlay();renderHUD()}else if(!overlayMode)openOverlay('pause')}
 if(e.code==='KeyR'&&!overlayMode){e.preventDefault();restart()}
 if(e.code==='KeyZ'&&!overlayMode){e.preventDefault();undo()}
});
window.addEventListener('resize',resizeBoard);
window.visualViewport?.addEventListener('resize',resizeBoard);
if(window.ResizeObserver)new ResizeObserver(resizeBoard).observe(document.querySelector('.board-zone'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='play'&&!overlayMode)openOverlay('pause')});
document.addEventListener('keydown',e=>{if(screen==='lobby'&&e.code==='Enter'&&document.activeElement===$('code'))joinCode()});
$('localDifficulty').value=difficulty;$('localDifficulty').onchange=()=>{difficulty=$('localDifficulty').value;save('difficulty',difficulty)};refreshProgress();checkNet();requestAnimationFrame(tick);
getPocketIdentity().then(id=>{profile=id;if(profile?.complete){name=profile.nickname;$('name').value=name;$('name').readOnly=true}}).catch(()=>{});
if(roomQuery){$('code').value=roomQuery;connect('join')}
