import {PocketSocket} from './network.js';
import {renderScene,cameraFor} from './scene.js';
const $=id=>document.getElementById(id);
const canvas=$('view'),ctx=canvas.getContext('2d',{alpha:false});
const stage=$('stage'),overlay=$('start-screen'),status=$('status'),modeSelect=$('mode'),difficultySelect=$('difficulty'),nameInput=$('name'),roomInput=$('room');
canvas.tabIndex=0;canvas.setAttribute('role','application');
const roomPanel=$('room-panel'),phaseEl=$('phase'),feedback=$('feedback'),soundBtn=$('sound'),echoBtn=$('echo-btn');
const motionReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const WS_OPEN=PocketSocket.OPEN;
const STORE='pocket-works:katana-echo:settings';
let ws=null,engine=null,offlineState=null,session='menu',playerId=null,world={players:[],map:null,phase:'menu'};
let createPending=false,connected=false,seq=0,lastSend=performance.now(),lastPaint=performance.now(),lastFeedback=0;
let drawWidth=1,drawHeight=1,dpr=1;
let prevPlayers=new Map(),smoothing=new Map(),effects=[],previousPhase='',botNextEchoAt=0,botNavTime=0,botNav=null;
let soundOn=false,audio=null;
const input={keys:{w:false,a:false,s:false,d:false},lmb:false,rmb:false,dash:false,ghostToggle:false,mouseAngle:0};
const storageRead=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch{return {}}};
const saved=storageRead();
if(saved.name)nameInput.value=saved.name;if(saved.mode)modeSelect.value=saved.mode;
if(['easy','normal','hard'].includes(saved.difficulty))difficultySelect.value=saved.difficulty;
soundOn=!!saved.sound;soundBtn.setAttribute('aria-pressed',String(soundOn));soundBtn.textContent=soundOn?'Звук: вкл':'Звук: выкл';
const stats=Object.assign({wins:0,losses:0},saved.stats||{});
const updateRecord=()=>{$('training-record').textContent='Тренировка · победы '+stats.wins+' / поражения '+stats.losses;};
updateRecord();
const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify({name:nameInput.value.slice(0,22),mode:modeSelect.value,difficulty:difficultySelect.value,sound:soundOn,stats}))}catch{}};
nameInput.addEventListener('change',persist);modeSelect.addEventListener('change',persist);difficultySelect.addEventListener('change',persist);
function tone(kind){
 if(!soundOn)return;
 try{
  audio ||= new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==='suspended')audio.resume();
  const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();
  o.type=kind==='parry'?'triangle':'sawtooth';
  const frequencies={swing:[280,110],death:[130,55],parry:[640,340],ghost:[175,420],click:[420,330]};
  const [from,to]=frequencies[kind]||frequencies.click;
  o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+.10);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(kind==='death'?.075:.035,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+.15);
  o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.17);
 }catch{}
}
soundBtn.addEventListener('click',()=>{soundOn=!soundOn;soundBtn.setAttribute('aria-pressed',String(soundOn));soundBtn.textContent=soundOn?'Звук: вкл':'Звук: выкл';persist();tone('click')});
function note(message,type='info'){
 feedback.textContent=message;feedback.dataset.type=type;feedback.classList.add('visible');
 lastFeedback=performance.now()+3000;
}
function changeStatus(text,critical=false){status.textContent=text;status.dataset.problem=String(critical)}
function showMenu(show){
 if(show&&overlay.hidden&&session!=='menu'){
  clearInput();
  if(session==='online')sendInput(true);
 }
 overlay.hidden=!show;stage.classList.toggle('menu-open',show);
 $('resume').hidden=session==='menu';$('leave').hidden=session==='menu';
 if(!show)canvas.focus({preventScroll:true});
}
function clearInput(){
 Object.assign(input,{lmb:false,rmb:false,dash:false,ghostToggle:false});
 for(const k of Object.keys(input.keys))input.keys[k]=false;
 document.querySelectorAll('[data-key],[data-combat]').forEach(b=>b.classList.remove('pressed'));
}
function stop(){
 clearInput();
 if(ws){try{ws.leave?.()}catch{}ws.close();ws=null;}
 engine=null;offlineState=null;connected=false;session='menu';playerId=null;
 world={players:[],map:null,phase:'menu'};prevPlayers.clear();smoothing.clear();effects.length=0;
 createPending=false;previousPhase='';botNextEchoAt=0;botNav=null;botNavTime=0;roomPanel.hidden=true;changeStatus('Выбери режим');phaseEl.textContent='';
 $('training-label').hidden=true;showMenu(true);updateHud();
}
function resize(){
 const r=canvas.getBoundingClientRect();
 dpr=Math.min(window.devicePixelRatio||1,2);
 drawWidth=Math.max(1,r.width);drawHeight=Math.max(1,r.height);
 canvas.width=Math.round(drawWidth*dpr);canvas.height=Math.round(drawHeight*dpr);
}
const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
function emitEffect(kind,p){
 if(!p?.state||motionReduced&&kind==='swing')return;
 effects.push({type:kind==='swing'?'clash':kind,x:p.state.x,y:p.state.y,seed:(effects.length%7)*.71,started:performance.now(),duration:kind==='death'?650:kind==='ghost'?720:380});
 if(effects.length>42)effects.shift();
 tone(kind==='clash'?'parry':kind==='death'?'death':kind==='ghost'?'ghost':kind==='parry'?'parry':'swing');
}
function receive(next){
 if(!next||!Array.isArray(next.players))return;
 const fresh=new Map();
 for(const p of next.players){
  const old=prevPlayers.get(p.id);
  if(old){
   if(old.alive&&!p.alive)emitEffect('death',p);
   if(!old.attacking&&p.state?.attacking)emitEffect('swing',p);
   if(!old.ghost&&p.ghostActor?.alive)emitEffect('ghost',p);
   const extra=(p.events||[]).filter(event=>Number.isSafeInteger(event.id)&&event.id>(old.lastEvent||0));
   if(extra.some(x=>x.type==='parry'||x.type==='parried')){emitEffect('parry',p);if(p.id===playerId)note('Парирование!');}
   else if(extra.some(x=>x.type==='clash'||x.type==='block'))emitEffect('parry',p);
   else if(extra.some(x=>x.type==='ghostBreak'))emitEffect('ghost',p);
  }
  fresh.set(p.id,{alive:p.alive,attacking:p.state?.attacking,ghost:p.ghostActor?.alive,lastEvent:Math.max(old?.lastEvent||0,...(p.events||[]).map(e=>e.id||0))});
  if(!smoothing.has(p.id))smoothing.set(p.id,{x:p.state.x,y:p.state.y});
 }
 prevPlayers=fresh;world=next;
 const local=world.players.find(p=>p.id===playerId),enemy=world.players.find(p=>p.id!==playerId);
 if(next.phase==='lobby'){
  phaseEl.textContent='ОЖИДАНИЕ СОПЕРНИКА';
  changeStatus('Комната '+(roomInput.value||'')+' · ждём второго игрока');
 }else if(next.phase==='round-end'){
  phaseEl.textContent=local&&!local.alive?'ПОРАЖЕНИЕ':'ПОБЕДА';
  if(previousPhase!=='round-end'){
   if(session==='training'&&local&&enemy){
    if(local.alive&&!enemy.alive)stats.wins++;
    if(enemy.alive&&!local.alive)stats.losses++;
    updateRecord();persist();
   }
   note(local?.alive?'Точный удар · раунд за тобой!':'Раунд проигран · готовься к реваншу');
  }
 }else if(next.phase==='playing'){
  phaseEl.textContent='БОЙ';
  if(previousPhase==='round-end')note('Новый раунд');
  changeStatus(session==='training'?'Тренировка · ИИ-соперник':'Сетевая дуэль · '+(roomInput.value||'')); 
 }
 previousPhase=next.phase;
 updateHud(local,enemy);
}
function updateHud(a=world.players.find(p=>p.id===playerId),b=world.players.find(p=>p.id!==playerId)){
 $('left-name').textContent=a?.name||'РОНИН';
 $('right-name').textContent=b?.name||(session==='training'?'ТЕНЬ':'СОПЕРНИК');
 $('left-score').textContent=String(a?.score||0);
 $('right-score').textContent=String(b?.score||0);
 $('left-charge').style.width=((a?.state?.charge||0)/1800*100)+'%';
 $('right-charge').style.width=((b?.state?.charge||0)/1800*100)+'%';
 const dashCd=a?.state?.dashCooldown||0;
 const dashButton=document.querySelector('[data-combat="dash"]');
 if(dashButton){
  dashButton.disabled=!!a&&dashCd>25;
  dashButton.textContent=dashCd>25?'Рывок '+(dashCd/1000).toFixed(1)+'с':'РЫВОК';
  dashButton.title=dashCd>25?'Перезарядка рывка':'Пробел — рывок';
 }
 const cd=a?.ghost?.cooldown||0,en=a?.ghost?.energy;
 if(world.mode==='shadow-tail'){echoBtn.disabled=true;echoBtn.textContent='Эхо: авто';echoBtn.title='Тень повторяет движения автоматически через пять секунд';}
 else{
  echoBtn.disabled=cd>0||(en!==undefined&&en<.05&&!a?.ghost?.active);
  echoBtn.textContent=cd>0?'Эхо '+Math.ceil(cd/1000)+'с':en!==undefined?(a?.ghost?.active?'Завершить эхо':'Эхо '+Math.round(en*100)+'%'):'Призвать эхо';
  echoBtn.title=cd>0?'Перезарядка':'E — активировать боевое эхо';
 }
 $('round-label').textContent=world.phase==='round-end'?'Конец раунда':world.phase==='lobby'?'Ожидание':session==='training'?'СПАРРИНГ':'ДУЭЛЬ';
}

function botSteer(s,t){
 const walls=world.map?.walls||[];
 const free=(x,y)=>walls.every(w=>Math.abs(x-w.x)>=w.w/2+.56||Math.abs(y-w.y)>=w.h/2+.56);
 const dx=t.x-s.x,dy=t.y-s.y,d=Math.hypot(dx,dy);
 if(d<.001)return [0,0];
 // Direct pursuit only when the whole corridor is traversable, not just the target point.
 let clear=true;
 for(let i=1;i<=Math.ceil(d/.35);i++){
  const f=i/Math.ceil(d/.35);
  if(!free(s.x+dx*f,s.y+dy*f)){clear=false;break;}
 }
 if(clear)return [dx/d,dy/d];
 const bounds=world.map?.bounds||{w:22,h:14};
 const cell=.55,nx=Math.ceil(bounds.w/cell),ny=Math.ceil(bounds.h/cell),ox=-bounds.w/2,oy=-bounds.h/2;
 const gx=x=>Math.max(0,Math.min(nx-1,Math.floor((x-ox)/cell)));
 const gy=y=>Math.max(0,Math.min(ny-1,Math.floor((y-oy)/cell)));
 const index=(x,y)=>y*nx+x,position=(x,y)=>[ox+(x+.5)*cell,oy+(y+.5)*cell];
 const blocked=new Uint8Array(nx*ny);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const p=position(x,y);blocked[index(x,y)]=free(p[0],p[1])?0:1;
 }
 const sx=gx(s.x),sy=gy(s.y),tx=gx(t.x),ty=gy(t.y);
 // Flood from the target so every candidate neighbor tells us whether it advances.
 const dst=new Int16Array(nx*ny);dst.fill(-1);
 const queue=new Int32Array(nx*ny),goal=index(tx,ty);
 let front=0,back=0;
 if(!blocked[goal]){queue[back++]=goal;dst[goal]=0;}
 else{
  for(let y=Math.max(0,ty-2);y<=Math.min(ny-1,ty+2);y++)
  for(let x=Math.max(0,tx-2);x<=Math.min(nx-1,tx+2);x++){
   const n=index(x,y);if(!blocked[n]){dst[n]=0;queue[back++]=n;}
  }
 }
 const sides=[[1,0],[-1,0],[0,1],[0,-1]];
 while(front<back){
  const n=queue[front++],x=n%nx,y=(n/nx)|0;
  for(const [dx,dy] of sides){
   const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=nx||yy>=ny)continue;
   const ni=index(xx,yy);if(blocked[ni]||dst[ni]>=0)continue;
   dst[ni]=dst[n]+1;queue[back++]=ni;
  }
 }
 let ix=sx,iy=sy;
 if(dst[index(ix,iy)]<0){
  let nearest=null,best=Infinity;
  for(let y=Math.max(0,sy-3);y<=Math.min(ny-1,sy+3);y++)
  for(let x=Math.max(0,sx-3);x<=Math.min(nx-1,sx+3);x++){
   const n=index(x,y),p=position(x,y);
   const cost=Math.hypot(p[0]-s.x,p[1]-s.y);
   if(dst[n]>=0&&cost<best){best=cost;nearest=[x,y];}
  }
  if(!nearest)return [dx/d,dy/d];
  [ix,iy]=nearest;
 }
 // Look ahead across several cells; prevents grid-edge zigzag.
 for(let step=0;step<4;step++){
  const current=dst[index(ix,iy)];let next=null,best=current;
  for(const [ddx,ddy] of sides){
   const xx=ix+ddx,yy=iy+ddy;if(xx<0||yy<0||xx>=nx||yy>=ny)continue;
   const n=index(xx,yy);
   if(dst[n]>=0&&dst[n]<best){best=dst[n];next=[xx,yy];}
  }
  if(!next)break;
  [ix,iy]=next;
 }
 const [wx,wy]=position(ix,iy),nd=Math.hypot(wx-s.x,wy-s.y)||1;
 return [(wx-s.x)/nd,(wy-s.y)/nd];
}

function botInput(){
 const bot=world.players.find(p=>p.id==='bot'),me=world.players.find(p=>p.id===playerId);
 if(!bot||!me||!bot.alive||!me.alive)return {keys:{}};
 const s=bot.state,t=me.state,dx=t.x-s.x,dy=t.y-s.y,d=Math.hypot(dx,dy)||.001,ang=Math.atan2(dy,dx),now=performance.now();
 const lateral=Math.sin(now*.0011)>0?1:-1;
 const difficulty=difficultySelect.value;
 if(!botNav||now-botNavTime>(difficulty==='hard'?90:175)){
  botNav=botSteer(s,t);botNavTime=now;
 }
 const [navX,navY]=botNav;
 const vx=(d>2.3?navX:d<1.2?-dx/d*.65:0)+(-dy/d)*lateral*(d>2.3?.12:.62);
 const vy=(d>2.3?navY:d<1.2?-dy/d*.65:0)+(dx/d)*lateral*(d>2.3?.12:.62);
 const shieldRange=difficulty==='hard'?2.85:difficulty==='easy'?1.65:2.45;
 const shield=d<shieldRange&&t.attacking&&s.shieldCooldown<=0&&(difficulty==='hard'||Math.sin(now*.009)>(difficulty==='easy'?.82:.15));
 const chargePhase=now%(difficulty==='hard'?1480:difficulty==='easy'?2200:1800);
 const releaseAt=difficulty==='hard'?880:difficulty==='easy'?340:610;
 const keys={w:vy<-.28,s:vy>.28,a:vx<-.28,d:vx>.28};
 let ghostToggle=false;
 if(now>=botNextEchoAt){
  const active=!!bot.ghost?.active;
  ghostToggle=world.mode==='channel-echo'?active||bot.ghost?.energy>.5:
   world.mode==='echo-trap'&&bot.ghost?.cooldown===0;
  botNextEchoAt=now+(active?3600:difficulty==='easy'?13000:8300);
 }
 return {keys,mouseAngle:ang,lmb:chargePhase<releaseAt&&!shield,rmb:shield,
  dash:d>(difficulty==='hard'?3.5:6)&&s.dashCooldown<=0&&Math.sin(now*.003)>(difficulty==='hard'?.12:.8),
  ghostToggle};
}
function sendInput(force=false){
 if(document.hidden&&!force||session==='menu'||overlay.hidden===false)return;
 const now=performance.now(),payload={seq:++seq,dt:Math.min(250,now-lastSend),
  keys:{...input.keys},mouseAngle:input.mouseAngle,lmb:input.lmb,rmb:input.rmb,dash:input.dash,ghostToggle:input.ghostToggle};
 lastSend=now;input.dash=false;input.ghostToggle=false;
 if(session==='training'&&engine&&offlineState){
  try{
   offlineState=engine.onMessage({state:offlineState,player:{id:playerId},payload:{type:'input',payload}}).state;
   offlineState=engine.onMessage({state:offlineState,player:{id:'bot'},payload:{type:'input',payload:botInput()}}).state;
   receive(engine.viewForPlayer({state:offlineState,player:{id:playerId}}));
  }catch(e){changeStatus('Ошибка симуляции: '+e.message,true);stop();note('Тренировка остановлена: '+e.message,'error');}
 }else if(session==='online'&&connected&&ws?.readyState===WS_OPEN){
  try{ws.send(JSON.stringify({type:'input',payload}));}catch(e){changeStatus('Нет связи · восстанавливаем',true);}
 }
}
setInterval(()=>sendInput(),1000/24);
async function practice(){
 stop();showMenu(true);changeStatus('Загружаем тренировку…');$('practice').disabled=true;
 try{
  const module=await import('./training-engine.js');
  engine=module.default;
  const you={id:'local',name:nameInput.value.trim().slice(0,22)||'Ронин'};
  const first=engine.createRoom({player:you,payload:{mode:modeSelect.value}}).state;
  offlineState=engine.onJoin({state:first,player:{id:'bot',name:'Тень мастера'}}).state;
  playerId=you.id;session='training';connected=true;previousPhase='';botNextEchoAt=0;botNav=null;botNavTime=0;
  roomInput.value='';roomPanel.hidden=true;$('training-label').hidden=false;
  receive(engine.viewForPlayer({state:offlineState,player:you}));
  persist();showMenu(false);note('Тренировка началась · E — эхо, пробел — рывок');
 }catch(e){
  session='menu';changeStatus('Не удалось запустить тренировку',true);note(e.message,'error');showMenu(true);
 }finally{$('practice').disabled=false;}
}
function online(create){
 stop();session='online';createPending=true;persist();
 changeStatus('Подключение к PocketNet…');
 globalThis.katanaCreate=create;
 ws=new PocketSocket('');
 const target=ws;
 let keepPaused=false;
 target.addEventListener('open',()=>{
  if(target!==ws)return;
  changeStatus('Соединение установлено · вход в комнату');
  target.send(JSON.stringify({type:'join',roomCode:roomInput.value.trim(),name:nameInput.value.trim()||'Ронин',mode:modeSelect.value}));
 });
 target.addEventListener('message',event=>{
  if(target!==ws)return;
  let msg;try{msg=JSON.parse(event.data)}catch{return;}
  if(msg.type==='room'){
   playerId=msg.data.playerId;roomInput.value=msg.data.roomCode;
   const firstJoin=createPending;
   createPending=false;connected=true;roomPanel.hidden=false;
   $('room-code').textContent=msg.data.roomCode;
   $('training-label').hidden=true;
   if(firstJoin||!keepPaused)showMenu(false);
   keepPaused=false;
   changeStatus('Комната '+msg.data.roomCode);
   note(firstJoin?'Код '+msg.data.roomCode+' · пригласи второго бойца':'Связь с дуэлью восстановлена');
  }
  if(msg.type==='state')receive(msg.data);
 });
 target.addEventListener('reconnected',()=>{
  if(target!==ws)return;
  connected=false;keepPaused=!overlay.hidden;
  changeStatus('Повторный вход в дуэль…');
 });
 target.addEventListener('error',event=>{
  if(target!==ws)return;
  const details=event.detail||{},message=details.message||'Ошибка подключения';
  changeStatus(message,true);note(message,'error');
  if(details.fatal){
   createPending=false;connected=false;roomPanel.hidden=true;
   target.close();ws=null;showMenu(true);
  }
 });
 target.addEventListener('close',()=>{
  if(target===ws){connected=false;changeStatus('Связь прервана · переподключаемся',true);}
 });
}
$('practice').addEventListener('click',practice);
$('create').addEventListener('click',()=>online(true));
$('connect').addEventListener('click',()=>{
 if(!/^[a-f0-9]{8}$/i.test(roomInput.value.trim())){note('Введи восьмизначный код комнаты','error');roomInput.focus();return;}
 online(false);
});
$('menu-toggle').addEventListener('click',()=>showMenu(!overlay.hidden));
$('resume').addEventListener('click',()=>showMenu(false));
$('leave').addEventListener('click',stop);
$('room-copy').addEventListener('click',async()=>{
 const value=roomInput.value;
 if(!value)return;
 try{await navigator.clipboard.writeText(value);note('Код '+value+' скопирован');}
 catch{roomInput.select();note('Скопируй выделенный код комнаты');showMenu(true);}
});
function aim(e){
 const r=canvas.getBoundingClientRect();
 const camera=cameraFor(world,r.width,r.height);
 const x=(e.clientX-r.left-camera.x)/camera.scale,y=(e.clientY-r.top-camera.y)/camera.scale;
 const me=world.players.find(p=>p.id===playerId);
 if(me)input.mouseAngle=Math.atan2(y-me.state.y,x-me.state.x);
}
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')aim(e)});
canvas.addEventListener('pointerdown',e=>{
 if(session==='menu'||!overlay.hidden)return;
 if(e.pointerType==='touch'){aim(e);return;}
 aim(e);canvas.setPointerCapture(e.pointerId);
 if(e.button===0)input.lmb=true;if(e.button===2)input.rmb=true;sendInput(true);
});
const canvasUp=e=>{if(e.button===0)input.lmb=false;if(e.button===2)input.rmb=false;sendInput(true)};
canvas.addEventListener('pointerup',canvasUp);
canvas.addEventListener('pointercancel',()=>{input.lmb=false;input.rmb=false;sendInput(true)});
canvas.addEventListener('lostpointercapture',()=>{input.lmb=false;input.rmb=false;sendInput(true)});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const moveKey={KeyW:'w',ArrowUp:'w',KeyA:'a',ArrowLeft:'a',KeyS:'s',ArrowDown:'s',KeyD:'d',ArrowRight:'d'};
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'&&session!=='menu'){
  showMenu(overlay.hidden);e.preventDefault();return;
 }
 if(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea,[contenteditable]'))return;
 if(session==='menu'||!overlay.hidden)return;
 if(moveKey[e.code]){input.keys[moveKey[e.code]]=true;e.preventDefault();}
 if(!e.repeat&&(e.code==='Space'||e.code==='ShiftLeft'||e.code==='ShiftRight')){input.dash=true;sendInput(true);e.preventDefault();}
 if(!e.repeat&&e.code==='KeyE'){input.ghostToggle=true;sendInput(true);e.preventDefault();}
 if(e.code==='KeyJ'){if(!input.lmb){input.lmb=true;sendInput(true)}e.preventDefault();}
 if(e.code==='KeyK'){if(!input.rmb){input.rmb=true;sendInput(true)}e.preventDefault();}
});
window.addEventListener('keyup',e=>{
 if(moveKey[e.code])input.keys[moveKey[e.code]]=false;
 if(e.code==='KeyJ'){input.lmb=false;sendInput(true);}
 if(e.code==='KeyK'){input.rmb=false;sendInput(true);}
});
for(const button of document.querySelectorAll('[data-key],[data-combat]')){
 const set=down=>{
  if(button.disabled)return;
  button.classList.toggle('pressed',down);
  if(button.dataset.key){input.keys[button.dataset.key]=down;}
  else{
   const action=button.dataset.combat;
   if(down&&(action==='lmb'||action==='rmb'||action==='ghostToggle')){
    const me=world.players.find(p=>p.id===playerId),enemy=world.players.find(p=>p.id!==playerId&&p.alive);
    if(me&&enemy)input.mouseAngle=Math.atan2(enemy.state.y-me.state.y,enemy.state.x-me.state.x);
   }
   input[action]=down;
  }
  sendInput(true);
 };
 button.addEventListener('pointerdown',e=>{if(!overlay.hidden)return;button.setPointerCapture(e.pointerId);set(true);e.preventDefault()});
 button.addEventListener('pointerup',()=>set(false));
 button.addEventListener('pointercancel',()=>set(false));
 button.addEventListener('lostpointercapture',()=>set(false));
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){clearInput();if(session==='online')sendInput(true);}
});
window.addEventListener('blur',()=>{clearInput();if(session==='online')sendInput(true)});
function render(t){
 const elapsed=Math.min(60,t-lastPaint);lastPaint=t;
 if(!document.hidden){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const alpha=1-Math.exp(-elapsed/45);
  for(const p of world.players){
   const s=smoothing.get(p.id);
   if(s&&p.state){s.x+=(p.state.x-s.x)*alpha;s.y+=(p.state.y-s.y)*alpha;}
  }
  effects=effects.filter(e=>t-e.started<e.duration);
  renderScene(ctx,world,playerId,t,drawWidth,drawHeight,effects,smoothing);
  if(lastFeedback&&t>lastFeedback){feedback.classList.remove('visible');lastFeedback=0;}
 }
 requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.render_game_to_text=()=>JSON.stringify({session,playerId,phase:world.phase,mode:world.mode,room:roomInput.value,players:world.players.map(p=>({id:p.id,alive:p.alive,score:p.score||0,state:p.state,ghost:p.ghost,ghostActor:p.ghostActor})),map:world.map});
window.advanceTime=async ms=>new Promise(resolve=>setTimeout(resolve,Math.min(1200,ms)));
showMenu(true);updateHud();changeStatus('Тренировка или дуэль с другом');
