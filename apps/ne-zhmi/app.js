import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createGame, commandGame, stepGame, FIXED_DT, progressGame } from './engine.js';
import { createRenderer } from './renderer.js';
import { createOnlineController } from './online.js';
installMobileRuntime();
const $ = id => document.getElementById(id);
const screens = ['menu','pause-panel','finish-panel'];
const canvas=$('scene'),renderer=createRenderer(canvas);
let game=createGame(), online=null, lastOnline=null, phase='menu', accumulated=0, lastFrame=performance.now(), muted=false, audio=null;
const storageKey='pocket-works:ne-zhmi:preferences';
let best=null;
try {const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');muted=!!saved.muted;best=Number.isFinite(saved.best)&&saved.best>0?saved.best:null;} catch {}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({muted,best}));}catch{}}
function format(t){const sec=Math.max(0,Math.floor(t));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function sound(kind){
  if(muted)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(!audio)audio=new AC();
    if(audio.state==='suspended')void audio.resume();
    const oscillator=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;
    oscillator.type=kind==='reverse'?'triangle':'sine';
    const frequencies={jump:425,reverse:190,land:90,respawn:120,checkpoint:620,finish:740,wall:100};
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
  for(const id of ['jump','reverse'])$(id).disabled=which==='online-playing'?!online?.canInput(id):which!=='playing';
  $('status').textContent=which==='menu'?'ЖДЁМ СИГНАЛ':which==='online-lobby'?'ОЖИДАНИЕ ОПЕРАТОРОВ':which==='online-won'||which==='finish'?'ЗАДАНИЕ ВЫПОЛНЕНО':which==='pause'?'ПАУЗА':'ДВИЖЕНИЕ';
  if(which==='playing'||which==='online-playing')lastFrame=performance.now();
}
function start(){
  game=createGame();accumulated=0;show('playing');announce('Начато испытание.');
}
function pause(){if(phase==='playing'){show('pause');announce('Игра на паузе.');}}
function resume(){if(phase==='pause'){show('playing');announce('Игра продолжается.');}}
function backToMenu(){game=createGame();accumulated=0;show('menu');announce('Главное меню.');}
function finish(){
  const elapsed=game.wonAt||game.t;
  const record=!best||elapsed<best;
  if(record){best=elapsed;persist();}
  $('result').textContent='Время '+format(elapsed)+' · падений '+game.respawns+' · прыжков '+game.jumps+' · разворотов '+game.reverses+(record?' · новый рекорд!':'');
  if(best)$('record').textContent='РЕКОРД '+format(best);
  show('finish');sound('finish');renderer.impact(1.4);
  announce('Финиш. '+$('result').textContent);
}
function input(action){
  if(phase==='online-playing'){
    if(!online?.canInput(action))return;
    if(online.sendAction(action)){const el=$(action);el.classList.add('pressed');setTimeout(()=>el.classList.remove('pressed'),100);sound(action);}
    return;
  }
  if(phase!=='playing')return;
  const result=commandGame(game,action);
  if(result==='cooldown'){announce('Разворот перезаряжается.');return;}
  if(result==='reverse'){renderer.impact(.25);sound('reverse');}
  const element=$(action==='jump'?'jump':'reverse');element.classList.add('pressed');
  window.setTimeout(()=>element.classList.remove('pressed'),95);
}
$('start').addEventListener('click',start);
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
$('again').addEventListener('click',start);
$('pause').addEventListener('click',pause);
$('resume').addEventListener('click',resume);
$('restart-pause').addEventListener('click',start);
$('leave-pause').addEventListener('click',backToMenu);
$('leave-finish').addEventListener('click',backToMenu);
for(const [id,action] of [['jump','jump'],['reverse','reverse']]){
  $(id).addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();input(action);});
  $(id).addEventListener('click',event=>{if(event.detail===0)input(action);}); // keyboard/switch-access activation
}
const soundButton=$('sound');
function updateSound(){soundButton.textContent='ЗВУК · '+(muted?'ВЫКЛ':'ВКЛ');soundButton.setAttribute('aria-label',muted?'Включить звук':'Выключить звук');}
soundButton.addEventListener('click',()=>{muted=!muted;persist();updateSound();if(!muted)sound('checkpoint');});
updateSound();
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'){if(phase==='playing')pause();else if(phase==='pause')resume();else if(phase==='online-playing')$('online-out').click();return;}
  if(!['playing','online-playing'].includes(phase)||event.repeat||event.altKey||event.metaKey||event.ctrlKey)return;
  if(['Space','KeyW','ArrowUp'].includes(event.code)){event.preventDefault();input('jump');}
  else if(['KeyR','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();input('reverse');}
});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();accumulated=0;if(document.hidden&&phase==='playing')pause();});
window.addEventListener('pagehide',persist);
let previousHud=0;
function frame(now){
  const dt=Math.min(.06,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(phase==='playing'){
    accumulated+=dt;let loops=0;
    while(accumulated>=FIXED_DT&&loops<9){
      const events=stepGame(game,FIXED_DT);accumulated-=FIXED_DT;loops++;
      for(const event of events){
        if(['jump','land','respawn','checkpoint','wall'].includes(event)){
          if(event==='respawn'||event==='land')renderer.impact(event==='respawn'?1.4:.8);
          sound(event);
          if(event==='respawn')announce('Болтик упал. Возвращаем к контрольной точке.');
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
    previousHud=now;
    $('clock').textContent=format(game.t);
    $('falls').textContent='ПАДЕНИЯ '+String(game.respawns).padStart(2,'0');
    if(phase==='online-playing')$('status').textContent='POCKETNET · '+Math.round(progressGame(game)*100)+'%';
    if(phase==='playing')$('status').textContent=game.checkpoint>9?'ЧЕКПОИНТ ✓ · '+Math.round(progressGame(game)*100)+'%':'ДО ФИНИША · '+Math.round(progressGame(game)*100)+'%';
    if(best)$('record').textContent='РЕКОРД '+format(best);
  }
  requestAnimationFrame(frame);
}
createWorkshopMode({appName:'НЕ ЖМИ!',version:'0.1.0',cachePrefix: 'ne-zhmi-',storageNamespace: 'pocket-works:ne-zhmi',onReset:()=>{if(online?.isActive())online.leave();best=null;muted=false;updateSound();backToMenu();}});
window.addEventListener('workshopopen',()=>{if(phase==='playing')pause();});
show('menu');requestAnimationFrame(frame);
