import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createDuel,copyDuel,tick,aiInput,inputOf,NO_INPUT,STEP,clamp} from './engine.js';
import {drawScene,toWorld} from './art.js';
installMobileRuntime();
const $=id=>document.getElementById(id),ui=$('ui'),canvas=$('arena');
const ctx=canvas.getContext('2d',{alpha:false}),SERVER=location.origin+'/pocketnet';
const SAVE='pocket-works:kromka-duel:';
const memory=new Map(),storage={
 getItem(k){try{return sessionStorage.getItem(SAVE+k)}catch{return memory.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(SAVE+k,v)}catch{memory.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(SAVE+k)}catch{memory.delete(k)}}
};
const saved=k=>{try{return localStorage.getItem(SAVE+k)}catch{return null}};
const persist=(k,v)=>{try{localStorage.setItem(SAVE+k,String(v))}catch{}};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codeFromUrl=new URLSearchParams(location.search).get('room')||'';
let name=saved('name')||'Дуэлянт',sound=saved('sound')!=='off',wins=Number(saved('wins')||0);
let difficulty=Number(saved('difficulty')||1),typedCode=codeFromUrl.trim().toUpperCase();
let mode='menu',modal='',net=null,me=null,state=null,practice=null,visual=null,roomId='',connected=false;
let loading=false,connectToken=0,netSeq=0,lastTransmit=0,lastSnapshot=0,display=null,displayTime=0;
let input={...NO_INPUT},oneshot={jab:false,parry:false,dash:false},fingers=new Map(),keys=new Set();
let effects=[],flash=0,shake=0,lastEventId=0,lastPhase='',lastStructure='',toastTimer=0,ac=null;
let resizeW=0,resizeH=0,pixelRatio=1,lastFrame=0,accum=0,wasWin=false;
let demoOffset=0;
function toast(text){const n=$('toast');n.textContent=String(text);n.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),3000);}
function emitSound(kind){
 if(!sound)return;
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ac ||=new AC();if(ac.state==='suspended')ac.resume();
  const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain(),metal=kind==='parry';
  o.type=metal?'square':kind==='point'?'sawtooth':'triangle';
  const pitch=kind==='point'?130:metal?810:kind==='dash'?185:370;
  o.frequency.setValueAtTime(pitch,t);o.frequency.exponentialRampToValueAtTime(pitch*(metal?.48:.63),t+.17);
  g.gain.setValueAtTime(metal?.028:kind==='point'?.042:.019,t);
  g.gain.exponentialRampToValueAtTime(.0001,t+.18);
  o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.19);
 }catch{}
}
function mySide(){return state?.players?.findIndex(p=>p.id===me?.id)??0;}
function current(){return mode==='practice'?practice:mode==='online'?visual:null;}
function networkStatus(){return connected?'● В СЕТИ':'○ НЕТ СВЯЗИ'}
function roomSaved(){try{return !!JSON.parse(storage.getItem('pocket-net:'+SERVER)||'null')?.roomId}catch{return false}}
function top(){return '<header class="top"><a class="back" href="../../" data-app-control data-native-press aria-label="В библиотеку"><span>←</span> Pocket Works</a>'+
 '<div class="logo">КРОМКА <i>II</i></div><button class="top-tool" data-action="help" title="Правила и звук" aria-label="Правила и звук">☷</button></header>';}
function button(text,action,css='',disabled=false){return '<button class="btn '+css+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+text+'</button>';}
function menu(){
 return '<section class="menu"><div class="hero"><div class="eyebrow">ФЕХТОВАЛЬНАЯ МИНИАТЮРА</div><h1>КРОМКА</h1>'+
 '<p>ОДНО ДВИЖЕНИЕ — ОДИН ШАНС</p></div><div class="menu-buttons">'+
 button('Начать тренировку','practice','primary')+
 button('Вызвать друга','create','')+
 button('Войти по коду','join-menu','outline')+
 (roomSaved()?button('Вернуться в комнату','resume','quiet'):'')+
 '<div class="footnote"><span>МАСТЕР: '+(difficulty?'ОПЫТНЫЙ':'НОВИЧОК')+'</span>'+button('Сменить','difficulty','mini')+'</div>'+
 '</div></section>';
}
function lobby(){
 const people=state.players||[],host=state.host===me?.id;
 return '<section class="sheet"><div class="eyebrow">POCKETNET · ЗАЛ ДУЭЛИ</div><h2>Вызов отправлен.</h2>'+
 '<span class="eyebrow">КОД КОМНАТЫ</span><div class="room-code">'+html(roomId.slice(0,8).toUpperCase())+'</div>'+
 '<div class="split">'+button('Скопировать код','copy','small')+button('Ссылка другу','share','small')+'</div>'+
 '<div class="seats"><span><b>01</b>'+html(people[0]?.name||'—')+'</span><em>×</em><span><b>02</b>'+html(people[1]?.name||'Ожидаем')+'</span></div>'+
 button(host?'Начать поединок':'Ждём хозяина','start','primary',!host||people.length!==2||!connected)+
 button('Покинуть комнату','leave','outline')+'</section>';
}
function activeUI(){
 const m=current()||createDuel(),online=mode==='online',players=online?state?.players: [{name:'Ты'},{name:'Маэстро'}];
 const phase=m.phase==='finished'?'finished':'battle';
 const score0=m.scores?.[0]||0,score1=m.scores?.[1]||0;
 const score='<div class="scoreboard"><div class="fighter-score"><span id="name0">'+html(players?.[0]?.name||'Ты')+'</span><strong id="score0">'+score0+'</strong></div>'+
 '<div class="round-mark"><small>ПЕРВЫЙ ДО ПЯТИ</small><span id="clock">'+Math.ceil(m.roundTime||0)+'</span></div>'+
 '<div class="fighter-score right"><strong id="score1">'+score1+'</strong><span id="name1">'+html(players?.[1]?.name||'Маэстро')+'</span></div></div>';
 const desc='<div class="stage-line" id="stageLine">'+(phase==='finished'?'ПОЕДИНОК ЗАВЕРШЁН':'РАПИРЫ НАГОТОВЕ')+'</div>';
 if(phase==='finished'){
  const side=online?mySide():0,won=m.winner===side;
  if(!online&&!wasWin&&won){wins++;persist('wins',wins);wasWin=true;}
  return score+'<section class="sheet result"><span class="eyebrow">КОНЕЦ ПОЕДИНКА</span><h2>'+
  (m.winner===-1?'Ничья':won?'Победа.':'Пора реванша.')+'</h2><p>'+
  (won?'Твоя точность решила дуэль.':'Следующий выпад может всё изменить.')+'</p>'+
  (online?button(state?.host===me?.id?'Реванш':'Ждём хозяина','again','primary',state?.host!==me?.id||!connected):
  button('Снова на дорожку','practice','primary'))+
  button('В главное меню','exit','outline')+'</section>';
 }
 return score+desc+'<section class="controls">'+
 '<div class="control-group"><div class="pad-label">ДВИЖЕНИЕ</div><div class="pad" data-pad="move" aria-label="Управление шагом"><div class="rings"></div><div id="stepThumb" class="thumb"></div></div></div>'+
 '<div class="center-controls"><button class="dodge" data-action="dash" aria-label="Уклониться рывком">↝<small>РЫВОК</small></button><span class="hint">ШАГ / ВЫПАД</span></div>'+
 '<div class="control-group"><div class="pad-label">ОСТРИЁ</div><div class="pad foil-pad" data-pad="aim" aria-label="Провести рапирой и отпустить для выпада; коснуться для парирования"><div class="rings"></div><div id="aimThumb" class="thumb"></div></div></div>'+
 '</section><div class="gesture-hint">СПРАВА: СМАХНИ — ВЫПАД · КОСНИСЬ — ПАРИРУЙ</div>';
}
function dialogs(){
 if(!modal)return '';
 let inner='';
 if(modal==='help')inner='<h2>Острие решает.</h2><p>Левым пальцем двигайся. Справа проведи и отпусти палец — быстрый выпад по направлению рапиры. Короткое касание справа — парирование. Центральная кнопка — уход с линии.</p>'+
 '<p>Увидел укол противника? Встречай его остриём вовремя или уходи рывком. После удачного парирования сразу отвечай.</p>'+
 '<p class="faint">На компьютере: WASD — шаг, мышь — направление, ЛКМ / Пробел — выпад, ПКМ / Q — парирование, Shift — рывок.</p>'+
 button('Звук: '+(sound?'включён':'выключен'),'sound','outline')+button('Продолжить','close','primary')+
 (mode==='practice'||mode==='online'?button('Покинуть дуэль','exit','quiet'):'');
 else if(modal==='exit')inner='<h2>Покинуть дуэль?</h2><p>В сети выход из активной партии засчитывает поражение.</p>'+button('Покинуть','confirm-exit','primary')+button('Остаться','close','outline');
 else if(modal==='create'||modal==='join')inner='<h2>'+(modal==='create'?'Открыть зал.':'Принять вызов.')+'</h2>'+
 '<label for="nickname">ИМЯ ДУЭЛЯНТА</label><input id="nickname" maxlength="22" autocomplete="nickname" value="'+html(name)+'">'+
 (modal==='join'?'<label for="roomInput">КОД КОМНАТЫ</label><input id="roomInput" maxlength="36" autocomplete="off" value="'+html(typedCode)+'" placeholder="8 символов">':'')+
 button(modal==='create'?'Создать комнату':'Присоединиться',modal==='create'?'create-room':'join-room','primary')+
 button('Отмена','close','outline');
 return '<div class="scrim"><section class="dialog">'+button('×','close','x')+inner+'</section></div>';
}
function render(force=false){
 const struct=[mode,modal,state?.phase,practice?.phase,state?.players?.length,connected?'online':'offline',state?.host===me?.id].join('|');
 if(!force&&struct===lastStructure)return;
 lastStructure=struct;
 const content=mode==='menu'?menu():mode==='connecting'?'<section class="sheet"><h2>Соединяемся…</h2><p>Подключаем PocketNet.</p>'+button('Отмена','cancel','outline')+'</section>':
 mode==='online'&&state?.phase==='lobby'?lobby():activeUI();
 ui.innerHTML=top()+content+dialogs();
 updatePad();
}
function refreshHUD(){
 if(mode!=='online'&&mode!=='practice')return;
 const s=current();if(!s)return;
 const t=$('clock');if(t)t.textContent=Math.ceil(s.roundTime);
 const z=$('score0'),q=$('score1');if(z)z.textContent=s.scores[0];if(q)q.textContent=s.scores[1];
 const l=$('stageLine');if(l){
  const event=s.event?.type;
  l.textContent=!connected&&mode==='online'?'ВОССТАНАВЛИВАЕМ СВЯЗЬ':s.freeze>0?
  event==='parry'?'ПАРИРОВАНО':event==='point'?'ЧИСТОЕ КАСАНИЕ':event==='double'?'ОБОЮДНЫЙ УКОЛ':'КОНТАКТ':
  s.fighters?.[mySide()]?.riposte>0?'ОТВЕТЬ СЕЙЧАС':'';
 }
}
function updatePad(){
 const mapping=[['stepThumb',input.mx,input.my],['aimThumb',input.ax,input.ay]];
 for(const [id,x,y] of mapping){const el=$(id);if(el){
   // Player one sees an inverted camera; the thumb should always reflect screen directions.
   const sign=mode==='online'&&mySide()===1?-1:1;
   el.style.transform='translate(calc(-50% + '+x*sign*30+'px),calc(-50% + '+y*sign*30+'px))';
 }}
}
function initialInput(){
 const flip=mode==='online'&&mySide()===1?-1:1;
 input={...NO_INPUT,ax:0,ay:-flip};
}
function eventFX(e){
 if(!e||e.id===lastEventId)return;
 lastEventId=e.id;
 if(['parry','point','dash','double'].includes(e.type)){
  effects.push({...e,at:performance.now()});if(effects.length>18)effects.shift();
 }
 if(e.type==='point'||e.type==='double'){flash=.9;shake=7;emitSound('point');navigator.vibrate?.(e.type==='point'?[35,30,50]:35);}
 else if(e.type==='parry'){flash=.25;shake=2.9;emitSound('parry');navigator.vibrate?.(20);}
 else if(e.type==='thrust')emitSound('jab');
 else if(e.type==='dash')emitSound('dash');
}
function practiceMode(){
 stopNet();modal='';mode='practice';state=null;me=null;wasWin=false;
 practice=createDuel();visual=null;initialInput();effects=[];lastEventId=0;
 render(true);emitSound('jab');
}
function stopNet(leave=true){
 connectToken++;
 if(net){if(leave&&state)try{net.leaveRoom()}catch{}net.close();}
 net=null;connected=false;loading=false;roomId='';netSeq=0;
 if(leave)storage.removeItem('pocket-net:'+SERVER);
}
function mainMenu(){
 stopNet();modal='';mode='menu';state=null;practice=null;visual=null;display=null;fingers.clear();keys.clear();
 initialInput();history.replaceState(null,'',location.pathname);render(true);
}
function send(payload){if(!net||!connected)return false;try{net.sendGame(payload);return true}catch{return false;}}
function transmit(immediate=false){
 if(mode!=='online'||state?.phase!=='battle'||!connected)return;
 const now=performance.now();
 if(!immediate&&now-lastTransmit<80)return;
 const normalized=inputOf({...input,...oneshot});
 if(!normalized)return;
 if(send({type:'input',seq:++netSeq,input:normalized})){
  lastTransmit=now;oneshot={jab:false,parry:false,dash:false};
 }
}
function synced(next){
 if(!next||typeof next!=='object'||(state&&next.revision<state.revision))return;
 const prior=state?.phase;const eventPrior=lastEventId;
 state=next;
 if(next.duel){
  if(next.duel.event?.id!==eventPrior)eventFX(next.duel.event);
  visual=copyDuel(next.duel);
 }
 if(next.phase==='battle'&&prior!=='battle'){effects=[];lastEventId=0;initialInput();wasWin=false;}
 if(next.phase!==prior){render(true);}
 else render();
 refreshHUD();
}
async function connect(modeToStart){
 if(loading)return;
 const chosen=($('nickname')?.value||name).trim().slice(0,22);
 if(!chosen){toast('Укажи имя игрока.');return;}
 name=chosen;persist('name',name);
 const room=String($('roomInput')?.value||typedCode).trim().toUpperCase();
 if(modeToStart==='join'&&!(/^[A-F0-9]{8}$/.test(room)||/^[0-9A-F-]{36}$/.test(room))){toast('Введи код из восьми символов.');return;}
 typedCode=room;
 stopNet(false);if(modeToStart!=='resume')storage.removeItem('pocket-net:'+SERVER);
 const generation=++connectToken;
 loading=true;modal='';mode='connecting';state=null;practice=null;render(true);
 try{
  const client=new PocketNet({serverUrl:SERVER,name,storage,identityKey:'rapier:'+name});
  net=client;
  client.on('connected',message=>{
   if(net!==client)return;
   connected=true;me=message.player;loading=false;render(true);
  });
  client.on('room_joined',message=>{
   if(net!==client)return;
   roomId=message.roomId;mode='online';loading=false;state=null;netSeq=0;
   synced(message.state);history.replaceState(null,'',location.pathname+'?room='+roomId.slice(0,8).toUpperCase());
   render(true);
  });
  client.on('game_event',packet=>{if(net!==client)return;
   if(packet.event?.type==='state')synced(packet.event.payload);
   if(packet.event?.type==='notice')toast(packet.event.payload);
  });
  client.on('presence',()=>{if(net===client)send({type:'sync'});});
  client.on('disconnected',()=>{if(net!==client)return;connected=false;toast('Связь потеряна. Восстанавливаем комнату.');render(true);});
  client.on('room_closed',()=>{if(net!==client)return;mainMenu();toast('Комната закрыта.');});
  client.on('error',e=>{if(net!==client)return;
   const message=({room_not_found:'Комната не найдена.',room_full:'В комнате уже два дуэлянта.',match_in_progress:'Поединок уже идёт.',game_unavailable:'Сервер игры пока не обновился.',server_at_capacity:'Сервер переполнен.'})[e.code]||e.code||e.message||'Ошибка PocketNet';
   toast(message);
   if(mode==='connecting'){mainMenu();}
  });
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Нет ответа от сервера.')),11000))]);
  if(generation!==connectToken)return;
  if(modeToStart==='create')client.createRoom('kromka-duel');
  else if(modeToStart==='join')client.joinRoom(room);
  else if(!client.roomId)throw Error('Прежняя комната закрыта.');
 }catch(e){if(generation!==connectToken)return;mainMenu();toast(e.message||'Ошибка подключения.');}
}
async function copy(value){
 try{await navigator.clipboard.writeText(value)}catch{
  const el=document.createElement('textarea');el.value=value;el.style.cssText='position:fixed;opacity:0';
  document.body.append(el);el.select();document.execCommand('copy');el.remove();
 }toast('Скопировано.');emitSound('jab');
}
function pulse(type){
 if(mode==='practice'){if(practice?.phase==='finished')return;
  oneshot[type]=true;emitSound(type==='parry'?'parry':'jab');
 }else if(mode==='online'){
  if(state?.phase!=='battle'||!connected){toast('Ожидаем связь.');return;}
  oneshot[type]=true;
  if(visual?.phase==='battle'){
   const packets=state.inputs?.map(v=>v||NO_INPUT)||[{...NO_INPUT},{...NO_INPUT,ay:1}];
   packets[mySide()]=inputOf({...input,...oneshot})||NO_INPUT;
   tick(visual,packets,STEP);
  }
  transmit(true);
 }
}
ui.addEventListener('click',e=>{
 const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
 const action=target.dataset.action;
 if(action==='practice'){practiceMode();return;}
 if(action==='difficulty'){difficulty=1-difficulty;persist('difficulty',difficulty);render(true);return;}
 if(action==='create'||action==='join-menu'){modal=action==='create'?'create':'join';render(true);return;}
 if(action==='resume'){connect('resume');return;}
 if(action==='create-room'||action==='join-room'){connect(action==='create-room'?'create':'join');return;}
 if(action==='help'){modal='help';render(true);return;}
 if(action==='close'){modal='';render(true);return;}
 if(action==='sound'){sound=!sound;persist('sound',sound?'on':'off');render(true);return;}
 if(action==='start'||action==='again'){if(send({type:action}))emitSound('jab');return;}
 if(action==='copy'){copy(roomId.slice(0,8).toUpperCase());return;}
 if(action==='share'){copy(new URL(location.pathname+'?room='+roomId.slice(0,8).toUpperCase(),location.origin).href);return;}
 if(action==='dash'){pulse('dash');return;}
 if(action==='exit'||action==='leave'){modal='exit';render(true);return;}
 if(action==='confirm-exit'||action==='cancel'){mainMenu();return;}
});
ui.addEventListener('input',e=>{if(e.target?.id==='roomInput')typedCode=e.target.value=e.target.value.toUpperCase().replace(/\s/g,'');});
function aimFromPointer(pad,e){
 const rect=pad.getBoundingClientRect();
 let px=(e.clientX-rect.left-rect.width/2)/(rect.width*.36),py=(e.clientY-rect.top-rect.height/2)/(rect.height*.36);
 const scale=Math.max(1,Math.hypot(px,py));px/=scale;py/=scale;
 const flip=mode==='online'&&mySide()===1?-1:1;
 if(pad.dataset.pad==='move'){input.mx=Math.round(px*flip*100)/100;input.my=Math.round(py*flip*100)/100;}
 else if(Math.hypot(px,py)>.12){input.ax=Math.round(px*flip*100)/100;input.ay=Math.round(py*flip*100)/100;}
 updatePad();
}
ui.addEventListener('pointerdown',e=>{
 const pad=e.target.closest('[data-pad]');if(!pad||fingers.has(pad.dataset.pad))return;
 if(!['practice','online'].includes(mode)||current()?.phase!=='battle'||(mode==='online'&&!connected))return;
 e.preventDefault();
 fingers.set(pad.dataset.pad,{id:e.pointerId,pad,at:performance.now(),x:e.clientX,y:e.clientY,moved:0});
 pad.setPointerCapture(e.pointerId);aimFromPointer(pad,e);
});
ui.addEventListener('pointermove',e=>{
 for(const f of fingers.values())if(f.id===e.pointerId){
  e.preventDefault();f.moved=Math.max(f.moved,Math.hypot(e.clientX-f.x,e.clientY-f.y));
  aimFromPointer(f.pad,e);break;
 }
});
function endPointer(e){
 for(const [key,f] of fingers)if(f.id===e.pointerId){
  try{f.pad.releasePointerCapture(e.pointerId)}catch{}
  const duration=performance.now()-f.at;
  if(key==='move'){input.mx=0;input.my=0;}
  else if(e.type==='pointerup'){pulse(f.moved<12&&duration<160?'parry':'jab');}
  fingers.delete(key);updatePad();break;
 }
}
ui.addEventListener('pointerup',endPointer);ui.addEventListener('pointercancel',endPointer);
const moveKeys={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};
function refreshKeys(){
 let mx=0,my=0;
 for(const k of keys){const d=moveKeys[k];if(d){mx+=d[0];my+=d[1];}}
 const l=Math.max(1,Math.hypot(mx,my)),flip=mode==='online'&&mySide()===1?-1:1;
 if(!fingers.has('move')){input.mx=mx/l*flip;input.my=my/l*flip;updatePad();}
}
document.addEventListener('keydown',e=>{
 if(e.target?.tagName==='INPUT')return;
 const k=e.key.toLowerCase();
 if(moveKeys[k]){keys.add(k);refreshKeys();e.preventDefault();}
 if(!e.repeat&&[' ','shift','q'].includes(k)){pulse(k==='shift'?'dash':k==='q'?'parry':'jab');e.preventDefault();}
 if(k==='escape'&&modal){modal='';render(true);}
});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(moveKeys[k]){keys.delete(k);refreshKeys();}});
document.addEventListener('mousemove',e=>{
 if((mode!=='online'&&mode!=='practice')||fingers.has('aim'))return;
 if(e.target.closest('[data-pad]')||e.target.closest('.dialog'))return;
 const duel=current();if(!duel)return;
 const side=mode==='online'?mySide():0,f=duel.fighters[side],point=toWorld(e.clientX,e.clientY,resizeW||innerWidth,resizeH||innerHeight,side);
 const dx=point.x-f.x,dy=point.y-f.y,l=Math.hypot(dx,dy);
 if(l>12){input.ax=dx/l;input.ay=dy/l;updatePad();}
});
document.addEventListener('mousedown',e=>{
 if(e.target.closest('button,input,a,.dialog,[data-pad]'))return;
 if(mode!=='online'&&mode!=='practice')return;
 if(e.button===0)pulse('jab');if(e.button===2)pulse('parry');
});
document.addEventListener('contextmenu',e=>{if(mode==='online'||mode==='practice')e.preventDefault();});
function loop(time){
 if(!lastFrame)lastFrame=time;
 const dt=Math.min(.042,(time-lastFrame)/1000);lastFrame=time;
 if(mode==='practice'&&practice?.phase==='battle'){
  accum+=dt;
  while(accum>=STEP){
   const local=inputOf({...input,...oneshot})||NO_INPUT;
   const bot=aiInput(practice,difficulty);
   tick(practice,[local,bot],STEP);
   oneshot={jab:false,parry:false,dash:false};accum-=STEP;
   if(practice.event?.id!==lastEventId)eventFX(practice.event);
   if(practice.phase==='finished'){render(true);break;}
  }
 }else if(mode==='online'&&state?.phase==='battle'){
  transmit();
  if(visual?.phase==='battle'){
   accum+=dt;
   while(accum>=STEP){
    const self=mySide(),local=inputOf({...input,...oneshot})||NO_INPUT;
    const all=state.inputs?.map(v=>v||NO_INPUT)||[{...NO_INPUT},{...NO_INPUT,ay:1}];
    all[self]=local;
    tick(visual,all,STEP);
    oneshot={jab:false,parry:false,dash:false};accum-=STEP;
    if(visual.phase==='finished')break;
   }
  }
 }
 const d=current();
 if(d){
  if(!display||display.phase!==d.phase||display.fighters.length!==d.fighters.length)display=copyDuel(d);
  else{
   display.phase=d.phase;display.event=d.event;
   const alpha=1-Math.exp(-dt*23);
   for(let i=0;i<2;i++){
    const target=d.fighters[i],out=display.fighters[i];
    for(const k of ['x','y','a'])out[k]+=(target[k]-out[k])*alpha;
    for(const k of ['jab','vx','vy','step','slash','parry','dash','stagger','riposte'])out[k]=target[k];
   }
  }
 }else display=null;
 flash=Math.max(0,flash-dt*4.2);shake=Math.max(0,shake-dt*23);
 effects=effects.filter(e=>time-e.at<630);
 const w=innerWidth,h=innerHeight;
 if(w!==resizeW||h!==resizeH){
  resizeW=w;resizeH=h;pixelRatio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(w*pixelRatio);canvas.height=Math.round(h*pixelRatio);
 }
 drawScene(ctx,w,h,time,display,{side:mode==='online'?Math.max(0,mySide()):0,
  effects,shake,flash,pixelRatio});
 refreshHUD();
 requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('pagehide',()=>{if(net)net.close();});
(async()=>{
 try{
  const res=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
  if(res.ok){const data=await res.json();if(data.user?.complete&&data.user.nickname)name=data.user.nickname;}
 }catch{}
 if(typedCode){modal='join';render(true);}
 else render(true);
})();
render(true);
