import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createGame, commandGame, stepGame, FIXED_DT, progressGame } from './engine.js';
import { createRenderer } from './renderer.js';
import {generateCourse} from './course.js';
import {ABILITIES,HOLD_ACTIONS,operatorAbilities} from './abilities.js';
import { createOnlineController } from './online.js';
installMobileRuntime();
const $ = id => document.getElementById(id);
const screens = ['menu','pause-panel','finish-panel'];
const canvas=$('scene'),renderer=createRenderer(canvas);
let game=createGame(), online=null, lastOnline=null, phase='menu', accumulated=0, lastFrame=performance.now(), muted=false, audio=null;
const storageKey='pocket-works:ne-zhmi:preferences';
let best=null,records={},localSeed=1,localCount=2;
try {const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');muted=!!saved.muted;best=Number.isFinite(saved.best)&&saved.best>0?saved.best:null;records=saved.records&&typeof saved.records==='object'?saved.records:{};} catch {}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({muted,best,records}));}catch{}}
function format(t){const sec=Math.max(0,Math.floor(t));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function sound(kind){
  if(muted)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(!audio)audio=new AC();
    if(audio.state==='suspended')void audio.resume();
    const oscillator=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;
    oscillator.type=kind==='reverse'?'triangle':'sine';
    const frequencies={magnet:450,brake:105,push:290,float:560,cargo:720,jump:425,reverse:190,land:90,respawn:120,checkpoint:620,finish:740,wall:100,spring:510,hazard:80,gate:140};
    const f=frequencies[kind]||280;oscillator.frequency.setValueAtTime(f,time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(65,kind==='jump'?f*1.4:f*.65),time+.115);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.10,time+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,time+.16);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start(time);oscillator.stop(time+.17);
  }catch{}
}
function announce(value){$('notice').textContent=value;}
function show(which){
  phase=which;
  $('menu').classList.toggle('hidden',which!=='menu');
  $('pause-panel').classList.toggle('hidden',which!=='pause');
  $('finish-panel').classList.toggle('hidden',which!=='finish');
  $('pause').classList.toggle('hidden',which!=='playing');
  $('online-role-chip').classList.toggle('hidden',which!=='online-playing');
  updateControls();
  $('status').textContent=which==='menu'?'ЖДЁМ СИГНАЛ':which==='online-lobby'?'ОЖИДАНИЕ ОПЕРАТОРОВ':which==='online-won'||which==='finish'?'ЗАДАНИЕ ВЫПОЛНЕНО':which==='pause'?'ПАУЗА':'ДВИЖЕНИЕ';
  if(which==='playing'||which==='online-playing')lastFrame=performance.now();
}
function start(fresh=true){
  if(fresh)localSeed=((Math.random()*0xffffffff)>>>0)||1;
  localCount=Number($('operator-count').value)||2;
  game=createGame(generateCourse(localSeed,5,localCount));
  accumulated=0;show('playing');announce('Трасса готова. '+localCount+' операторов, один Болтик.');
  $('record').textContent='ЛУЧШЕЕ '+(records[localSeed]?format(records[localSeed]):'—');
}
function pause(){if(phase==='playing'){show('pause');announce('Игра на паузе.');}}
function resume(){if(phase==='pause'){show('playing');announce('Игра продолжается.');}}
function backToMenu(){game=createGame();accumulated=0;show('menu');announce('Главное меню.');}
function finish(){
  const elapsed=game.wonAt||game.t;
  const record=!records[localSeed]||elapsed<records[localSeed];
  if(record){records[localSeed]=elapsed;persist();}
  $('result').textContent='Время '+format(elapsed)+' · падений '+game.respawns+' · прыжков '+game.jumps+' · разворотов '+game.reverses+(record?' · новый рекорд!':'');
  $('record').textContent='ЛУЧШЕЕ '+format(records[localSeed]||elapsed);
  show('finish');sound('finish');renderer.impact(1.4);
  announce('Финиш. '+$('result').textContent);
}
function activeCount(){return phase.startsWith('online')?online?.getSnapshot()?.players?.length||2:localCount;}
function updateControls(){
  const onlineRun=phase==='online-playing';
  const localRun=phase==='playing';
  const role=onlineRun?online?.getRole?.()??-1:-1;
  const count=activeCount();
  const deck=document.querySelector('.control-desk');
  deck.classList.toggle('crew-many',!onlineRun&&count>=3&&localRun);
  deck.classList.toggle('crew-online',onlineRun);
  $('crew-status').classList.toggle('hidden',!onlineRun);
  $('crew-status').replaceChildren();
  for(let i=0;i<ABILITIES.length;i++){
    const ability=ABILITIES[i],button=$(ability.id),station=button.closest('.control-station');
    const present=i<count && (localRun||onlineRun);
    station.classList.toggle('hidden',!present&&i>=2);
    station.classList.toggle('my-role',onlineRun&&role===i);
    const can=localRun&&i<count||onlineRun&&role===i&&online?.canInput(ability.id);
    button.disabled=!can;
    button.setAttribute('aria-label',ability.name+(ability.hold?' — удерживать':''));
    if(onlineRun&&i<count){
      const label=document.createElement('span');label.textContent=(i+1)+' '+ability.operator.toUpperCase();
      label.classList.toggle('active',role===i);
      label.classList.toggle('held',!!game?.held?.[ability.id]);
      $('crew-status').append(label);
    }
    if(i>=2){
      const meter=$('power-'+ability.id);
      if(meter)meter.style.setProperty('--energy',Math.round((game?.energy?.[ability.id]??1)*100)+'%');
    }
  }
}
function input(action,pressed=true){
  if(phase==='online-playing'){
    if(!online?.canInput(action))return;
    if(online.sendAction(action,pressed)){
      const el=$(action);el.classList.toggle('pressed',pressed);
      if(!HOLD_ACTIONS.includes(action)){setTimeout(()=>el.classList.remove('pressed'),105);sound(action);}
      else if(pressed)sound(action);
    }
    return;
  }
  if(phase!=='playing'||ABILITIES.findIndex(a=>a.id===action)>=localCount)return;
  const result=commandGame(game,action,pressed);
  if(result==='cooldown'){announce('Механизм ещё перезаряжается.');return;}
  if(result==='nochange')return;
  if(result==='reverse'||result==='push'){renderer.impact(.25);sound(action);}
  const element=$(action);element.classList.toggle('pressed',pressed);
  if(!HOLD_ACTIONS.includes(action)){setTimeout(()=>element.classList.remove('pressed'),105);if(action==='jump')sound(action);}
}
function releaseHeld(){
  for(const id of HOLD_ACTIONS)if(game.held?.[id] || $(id).classList.contains('pressed'))input(id,false);
}
$('start').addEventListener('click',()=>start(true));
try{$('player-name').value=localStorage.getItem('pocket-works:ne-zhmi:player')||'Игрок';}catch{}
function onlineView({active,snapshot,role,connected,troubled}){
  if(!active){if(phase.startsWith('online'))backToMenu();lastOnline=null;return;}
  if(snapshot?.phase==='lobby'||!snapshot){if(phase!=='online-lobby')show('online-lobby');return;}
  if(snapshot.phase==='play'){
    if(phase!=='online-playing')show('online-playing');
    if(lastOnline?.round!==snapshot.round){renderer.impact(.55);announce('Онлайн-испытание началось.');}
    const previous=lastOnline?.robot;
    if(previous&&previous.jumps<snapshot.robot.jumps){sound('jump');}
    if(previous&&previous.reverses<snapshot.robot.reverses){sound('reverse');renderer.impact(.25);}
    if(previous&&previous.respawns<snapshot.robot.respawns){sound('respawn');renderer.impact(1);}
    if(previous&&previous.checkpoint<snapshot.robot.checkpoint){sound('checkpoint');}
  }else if(snapshot.phase==='won'){
    if(phase!=='online-won'){show('online-won');sound('finish');renderer.impact(1.2);}
  }
  lastOnline=snapshot;
}
online=createOnlineController({onUpdate:onlineView,onExit:backToMenu,onNotice:announce});
$('create-online').addEventListener('click',()=>online.enter('create'));
$('join-online').addEventListener('click',()=>online.enter('join'));
const invite=new URLSearchParams(location.search).get('room');
if(invite&&/^[a-f0-9]{8}$|^[a-f0-9-]{36}$/i.test(invite)) {
  queueMicrotask(()=>online.enter('join',invite));
}else{
  try{if(sessionStorage.getItem('ne-zhmi:net:active')==='yes')queueMicrotask(()=>online.enter('resume'));}catch{}
}
$('again').addEventListener('click',()=>start(true));
$('retry-course').addEventListener('click',()=>start(false));
$('pause').addEventListener('click',pause);
$('resume').addEventListener('click',resume);
$('restart-pause').addEventListener('click',()=>start(false));
$('leave-pause').addEventListener('click',backToMenu);
$('leave-finish').addEventListener('click',backToMenu);
const pointerHolds=new Set();
for(const ability of ABILITIES){
 const button=$(ability.id),id=ability.id;
 button.addEventListener('pointerdown',e=>{
   if(e.button!==0||button.disabled)return;
   e.preventDefault();input(id,true);
   if(ability.hold){pointerHolds.add(id);try{button.setPointerCapture(e.pointerId);}catch{}}
 });
 if(ability.hold){
   const release=()=>{if(pointerHolds.has(id)){pointerHolds.delete(id);input(id,false);}};
   button.addEventListener('pointerup',release);
   button.addEventListener('pointercancel',release);
   button.addEventListener('lostpointercapture',release);
 }
 button.addEventListener('click',e=>{
   if(e.detail!==0)return;
   input(id,ability.hold?!button.classList.contains('pressed'):true);
 });
}
$('operator-count').addEventListener('change',()=>{
 localCount=Number($('operator-count').value)||2;
 if(phase==='menu')updateControls();
});
const soundButton=$('sound');
function updateSound(){soundButton.textContent='ЗВУК · '+(muted?'ВЫКЛ':'ВКЛ');soundButton.setAttribute('aria-label',muted?'Включить звук':'Выключить звук');}
soundButton.addEventListener('click',()=>{muted=!muted;persist();updateSound();if(!muted)sound('checkpoint');});
updateSound();
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){if(phase==='playing')pause();else if(phase==='pause')resume();else if(phase==='online-playing')$('online-out').click();return;}
  if(!['playing','online-playing'].includes(phase)||event.repeat||event.altKey||event.metaKey||event.ctrlKey)return;
  if(['Space','KeyW','ArrowUp'].includes(event.code)){event.preventDefault();input('jump');}
  else if(['KeyR','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();input('reverse');}
  else{
    const action={KeyM:'magnet',KeyB:'brake',KeyE:'push',KeyF:'float'}[event.code];
    if(action){event.preventDefault();input(action,true);}
  }
});
window.addEventListener('keyup',event=>{
 const action={KeyM:'magnet',KeyB:'brake',KeyF:'float'}[event.code];
 if(action)input(action,false);
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();accumulated=0;if(document.hidden){releaseHeld();if(phase==='playing')pause();}});
window.addEventListener('blur',releaseHeld);
window.addEventListener('pagehide',persist);
let previousHud=0;
function frame(now){
  const dt=Math.min(.06,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(phase==='playing'){
    accumulated+=dt;let loops=0;
    while(accumulated>=FIXED_DT&&loops<9){
      const events=stepGame(game,FIXED_DT);accumulated-=FIXED_DT;loops++;
      for(const event of events){
        if(['jump','land','respawn','checkpoint','wall','spring','hazard','gate'].includes(event)){
          if(['respawn','land','spring','hazard'].includes(event))renderer.impact(event==='respawn'||event==='hazard'?1.4:.8);
          sound(event);
          if(event==='respawn'||event==='hazard')announce(event==='hazard'?'Пресс сработал. Возвращаем к контрольной точке.':'Болтик упал. Возвращаем к контрольной точке.');
          if(event==='checkpoint')announce('Контрольная точка сохранена.');
        }
        if(event==='finish')finish();
      }
      if(phase!=='playing')break;
    }
    if(loops>=9)accumulated=0;
  }
  if(phase==='online-playing' || phase==='online-won'){
    const visual=online?.advance(dt)||online?.resultState();
    if(visual)game=visual;
  }
  renderer.frame(game,now,phase);
  if(now-previousHud>80){
    updateControls();
    previousHud=now;
    const label=game.level?.name||'ИСПЫТАТЕЛЬНЫЙ ЦЕХ';
    const segments=game.level?.sections?.length;
    $('scene-label').textContent=label+(segments?' / '+segments+' СЕКЦИЙ':' / 01');
    $('clock').textContent=format(game.t);
    $('falls').textContent='ПАДЕНИЯ '+String(game.respawns).padStart(2,'0');
    if(phase==='online-playing')$('status').textContent='POCKETNET · '+Math.round(progressGame(game)*100)+'%';
    if(phase==='playing')$('status').textContent=game.checkpoint>9?'ЧЕКПОИНТ ✓ · '+Math.round(progressGame(game)*100)+'%':'ДО ФИНИША · '+Math.round(progressGame(game)*100)+'%';
    if(phase==='playing'||phase==='pause')$('record').textContent='ЛУЧШЕЕ '+(records[localSeed]?format(records[localSeed]):'—');
  }
  requestAnimationFrame(frame);
}
createWorkshopMode({appName:'НЕ ЖМИ!',version:'0.4.0',cachePrefix: 'ne-zhmi-',storageNamespace: 'pocket-works:ne-zhmi',onReset:()=>{if(online?.isActive())online.leave();best=null;muted=false;updateSound();backToMenu();}});
window.addEventListener('workshopopen',()=>{if(phase==='playing')pause();});
show('menu');requestAnimationFrame(frame);
