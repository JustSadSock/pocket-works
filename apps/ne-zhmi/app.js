import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createGame, commandGame, stepGame, FIXED_DT, progressGame } from './engine.js';
import { createRenderer } from './renderer.js';
import { createSoundscape } from './soundscape.js';
import {generateCourse} from './course.js';
import {ABILITIES,HOLD_ACTIONS,operatorAbilities} from './abilities.js';
import { createOnlineController } from './online.js';
installMobileRuntime();
const $ = id => document.getElementById(id);
const screens = ['menu','pause-panel','finish-panel'];
const canvas=$('scene'),renderer=createRenderer(canvas);
let game=createGame(), online=null, lastOnline=null, phase='menu', accumulated=0, lastFrame=performance.now(), muted=false;
const soundscape=createSoundscape();
const storageKey='pocket-works:ne-zhmi:preferences';
let best=null,records={},localSeed=1,localCount=2;
try {const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');muted=!!saved.muted;best=Number.isFinite(saved.best)&&saved.best>0?saved.best:null;records=saved.records&&typeof saved.records==='object'?saved.records:{};} catch {}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({muted,best,records}));}catch{}}
function format(t){const sec=Math.max(0,Math.floor(t));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function sound(kind){return soundscape.play(kind);}
function tactile(action){
  if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'&&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    try{navigator.vibrate(action==='push'?[14,20,12]:action==='jump'?12:7);}catch{}
  }
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
  $('hazard-guide').classList.toggle('hidden',!['playing','online-playing'].includes(which));
  $('status').textContent=which==='menu'?'ЖДЁМ СИГНАЛ':which==='online-lobby'?'ОЖИДАНИЕ ОПЕРАТОРОВ':which==='online-won'||which==='finish'?'ЗАДАНИЕ ВЫПОЛНЕНО':which==='pause'?'ПАУЗА':'ДВИЖЕНИЕ';
  if(which==='playing'||which==='online-playing')lastFrame=performance.now();
}
function start(fresh=true){
  if(fresh)localSeed=((Math.random()*0xffffffff)>>>0)||1;
  localCount=Number($('operator-count').value)||2;
  game=createGame(generateCourse(localSeed,5,localCount));
  renderer.reset();sound('button');
  accumulated=0;show('playing');
  // Paint the first course frame in the same interaction turn. Otherwise
  // on mobile a screenshot or compositor frame can briefly show empty canvas.
  renderer.frame(game,performance.now(),'playing');
  announce('Трасса готова. '+localCount+' операторов, один Болтик.');
  $('record').textContent='ЛУЧШЕЕ '+(records[localSeed]?format(records[localSeed]):'—');
}
function pause(){if(phase==='playing'){releaseHeld();show('pause');sound('button');announce('Игра на паузе.');}}
function resume(){if(phase==='pause'){show('playing');sound('button');announce('Игра продолжается.');}}
function backToMenu(){renderer.reset();game=createGame();accumulated=0;show('menu');announce('Главное меню.');}
function finish(){
  const elapsed=game.wonAt||game.t;
  const record=!records[localSeed]||elapsed<records[localSeed];
  if(record){records[localSeed]=elapsed;persist();}
  $('result').textContent='Время '+format(elapsed)+' · падений '+game.respawns+' · прыжков '+game.jumps+' · разворотов '+game.reverses+(record?' · новый рекорд!':'');
  $('record').textContent='ЛУЧШЕЕ '+format(records[localSeed]||elapsed);
  show('finish');sound('finish');renderer.cue('finish',game);
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
    button.disabled=!can || (ability.hold && (game?.energy?.[ability.id]??1)<.14 && !game?.held?.[ability.id]);
    button.classList.toggle('engaged',!!(game?.held?.[ability.id]&&ability.hold));
    button.classList.toggle('charging',ability.id==='push'?(game?.pushCooldown||0)>.025:
      ability.hold&&(game?.energy?.[ability.id]??1)<.14);
    button.setAttribute('aria-label',ability.name+(ability.hold?' — удерживать':''));
    if(onlineRun&&i<count){
      const label=document.createElement('span');label.textContent=(i+1)+' '+ability.operator.toUpperCase();
      label.classList.toggle('active',role===i);
      label.classList.toggle('held',!!game?.held?.[ability.id]);
      $('crew-status').append(label);
    }
    if(i>=2){
      const meter=$('power-'+ability.id);
      if(meter){
        const fraction=ability.id==='push' ? 1-Math.min(1,(game?.pushCooldown||0)/1.15) : (game?.energy?.[ability.id]??1);
        meter.style.setProperty('--energy',Math.round(fraction*100)+'%');
        if(ability.hold && fraction<=.005)button.classList.remove('pressed');
      }
    }
  }
}
function input(action,pressed=true){
  if(phase==='online-playing'){
    if(!online?.canInput(action))return;
    if(online.sendAction(action,pressed)){
      const el=$(action);el.classList.toggle('pressed',pressed);
      if(pressed){sound('button');tactile(action);}
      if(!HOLD_ACTIONS.includes(action))setTimeout(()=>el.classList.remove('pressed'),105);
    }
    return;
  }
  if(phase!=='playing'||ABILITIES.findIndex(a=>a.id===action)>=localCount)return;
  const result=commandGame(game,action,pressed);
  if(result==='cooldown'){announce('Механизм ещё перезаряжается.');return;}
  if(result==='empty'){announce('Энергия закончилась — отпустите кнопку для зарядки.');return;}
  if(result==='nochange'){if(!pressed)$(action).classList.remove('pressed');return;}
  if(result==='reverse'||result==='push'){renderer.cue(action,game);sound(action);}
  if(pressed&&HOLD_ACTIONS.includes(action)){renderer.cue(action,game);sound(action);}
  if(pressed)tactile(action);
  const element=$(action);element.classList.toggle('pressed',pressed);
  if(!HOLD_ACTIONS.includes(action))setTimeout(()=>element.classList.remove('pressed'),105);
}
function releaseHeld(){
  for(const id of HOLD_ACTIONS)if(game.held?.[id] || $(id).classList.contains('pressed'))input(id,false);
}
$('start').addEventListener('click',()=>start(true));
try{$('player-name').value=localStorage.getItem('pocket-works:ne-zhmi:player')||'Игрок';}catch{}
function onlineView({active,snapshot,role,connected,troubled}){
  if(!active){if(phase.startsWith('online'))backToMenu();lastOnline=null;return;}
  if(snapshot?.phase==='lobby'||!snapshot){
    if(phase!=='online-lobby')show('online-lobby');
    return;
  }
  if(snapshot.phase==='play'){
    const changedRound=lastOnline?.round!==snapshot.round;
    if(phase!=='online-playing')show('online-playing');
    if(changedRound){
      renderer.reset();sound('button');announce('Новый раунд. Команда подключена.');
    }
    const prev=!changedRound?lastOnline?.robot:null;
    const next=snapshot.robot;
    if(prev&&next){
      const changes=[
        ['jumps','jump'],['reverses','reverse'],['pushes','push'],
        ['respawns','respawn'],['impacts','land']
      ];
      for(const [key,type] of changes)if((next[key]||0)>(prev[key]||0)){
        // One network batch may contain several events. Show one concise burst.
        renderer.cue(type,next);sound(type);
      }
      if(next.checkpoint>prev.checkpoint){renderer.cue('checkpoint',next);sound('checkpoint');}
      for(const action of ['magnet','brake','float']){
        if(next.held?.[action]&&!prev.held?.[action]){renderer.cue(action,next);sound(action);}
      }
      const oldCargo=prev.cargo||[],newCargo=next.cargo||[];
      if(newCargo.some((box,i)=>box.latched&&!oldCargo[i]?.latched)){
        renderer.cue('cargo',next);sound('cargo');
      }
    }
  }else if(snapshot.phase==='won'){
    if(phase!=='online-won'){
      show('online-won');renderer.cue('finish',snapshot.robot);sound('finish');
    }
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
function updateSound(){soundscape.setMuted(muted);soundButton.textContent='ЗВУК · '+(muted?'ВЫКЛ':'ВКЛ');soundButton.setAttribute('aria-label',muted?'Включить звук':'Выключить звук');}
soundButton.addEventListener('click',()=>{muted=!muted;persist();updateSound();if(!muted)sound('checkpoint');});
soundscape.setMuted(muted);
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
        if(['jump','land','respawn','checkpoint','wall','spring','hazard','gate','cargo'].includes(event)){
          renderer.cue(event,game);
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
    const current=game.level?.sections?.find(s=>game.x>=s.x&&game.x<s.x+s.w);
    $('scene-label').textContent=label+(current?' / '+String(current.index).padStart(2,'0')+' · '+current.name.toUpperCase():segments?' / СТАРТ':' / 01');
    const ahead=(game.level?.devices||[]).filter(d=>d.x+Math.max(.2,d.w)>=game.x&&d.x-game.x<2.85)
      .sort((a,b)=>a.x-b.x)[0];
    const guide={
      press:'ПРЕСС · БЕРЕГИСЬ',gate:'ШЛЮЗ · ЛОВИ МОМЕНТ',
      'cargo-gate':'ПРОХОД · ПЕРЕДВИНЬ ГРУЗ','cargo':'ГРУЗ · ТОЛЧОК',
      'mag-rail':'РЕЛЬС · МАГНИТ','balloon-sign':'ПРОЛЁТ · ПОПЛАВОК',
      'belt-left':'ВСТРЕЧНАЯ ЛЕНТА','fan-up':'ВОЗДУШНЫЙ ПОТОК','fan-side':'БОКОВОЙ ВЕТЕР'
    };
    const warning=guide[ahead?.type];
    const gameplay=['playing','online-playing'].includes(phase);
    $('hazard-guide').classList.toggle('hidden',!warning||!gameplay);
    if(warning)$('hazard-text').textContent=warning;
    $('clock').textContent=format(game.t);
    $('falls').textContent='ПАДЕНИЯ '+String(game.respawns).padStart(2,'0');
    if(phase==='online-playing')$('status').textContent='POCKETNET · '+Math.round(progressGame(game)*100)+'%';
    if(phase==='playing')$('status').textContent=game.checkpoint>9?'ЧЕКПОИНТ ✓ · '+Math.round(progressGame(game)*100)+'%':'ДО ФИНИША · '+Math.round(progressGame(game)*100)+'%';
    if(phase==='playing'||phase==='pause')$('record').textContent='ЛУЧШЕЕ '+(records[localSeed]?format(records[localSeed]):'—');
  }
  requestAnimationFrame(frame);
}
createWorkshopMode({appName:'НЕ ЖМИ!',version:'0.5.0',cachePrefix: 'ne-zhmi-',storageNamespace: 'pocket-works:ne-zhmi',onReset:()=>{if(online?.isActive())online.leave();best=null;muted=false;updateSound();backToMenu();}});
window.addEventListener('workshopopen',()=>{if(phase==='playing')pause();});
show('menu');requestAnimationFrame(frame);
