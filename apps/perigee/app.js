import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { STAGE_COUNT, STEP, stageAt, launchVector, makeCraft, advanceCraft, predict, safeReadProgress } from './physics.js';
import { paint } from './renderer.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const app = $('app'), scene = $('scene'), ctx = scene.getContext('2d', { alpha: false });
const intro = $('intro'), modal = $('modal'), nav = $('missionNav');
const title = $('missionName'), sector = $('sector'), attemptsLabel = $('attemptsLabel');
const impulseLabel = $('impulseLabel'), impulseFill = $('impulseFill'), impulseTrack = $('impulseTrack');
const pauseBtn = $('pauseBtn'), soundBtn = $('soundBtn');
const primaryBtn = $('primaryBtn'), secondaryBtn = $('secondaryBtn');
const modalEyebrow = $('modalEyebrow'), modalTitle = $('modalTitle');
const modalDescription = $('modalDescription'), modalStat = $('modalStat');
const STORAGE_KEY = 'pocket-works:perigee:progress-v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let stored = {};
try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { stored = {}; }
let progress = safeReadProgress(stored);
let audio = null, master = null;
let index = 0, stage = null, pointerId = null, press = null;
let width = 0, height = 0, factor = 1, dpr = 1;
let last = 0, accumulator = 0, frameId = 0, launched = false;
let attempts = Array(STAGE_COUNT).fill(0);
const model = {
  mode: 'intro', drag: null, prediction: null,
  craft: null, trace: [], fx: null
};
let pausedFrom = 'ready', settleResult = null;
let completionCode = '';

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* restricted storage */ }
}
function vibrate(pattern=12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* optional */ }
}
function enableAudio() {
  if (!progress.sound || audio) { if(audio?.state==='suspended') audio.resume().catch(()=>{}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = new AC();
    master = audio.createGain();
    master.gain.value = .18;
    master.connect(audio.destination);
  } catch { audio = null; }
}
function tone(freq,duration=.14,type='sine',gain=.15,delay=0,bend=1) {
  if(!progress.sound || !audio || !master) return;
  const begin=audio.currentTime+delay;
  const osc=audio.createOscillator(), env=audio.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,begin);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*bend),begin+duration);
  env.gain.setValueAtTime(.001,begin);
  env.gain.exponentialRampToValueAtTime(Math.max(.002,gain),begin+.012);
  env.gain.exponentialRampToValueAtTime(.001,begin+duration);
  osc.connect(env);env.connect(master);osc.start(begin);osc.stop(begin+duration+.015);
}
function sound(which) {
  enableAudio();
  if(which==='aim')tone(310,.065,'sine',.045);
  if(which==='launch'){tone(95,.48,'sawtooth',.11,0,2.8);tone(400,.25,'triangle',.055,.10,.72);}
  if(which==='impact'){tone(155,.40,'triangle',.27,0,.23);tone(58,.55,'sawtooth',.1,.05,.45);}
  if(which==='lost')tone(190,.36,'triangle',.16,0,.58);
  if(which==='dock')for(let i=0;i<4;i++)tone([294,370,440,587][i],.54,'sine',.16,i*.10,1.02);
  if(which==='ui')tone(520,.10,'sine',.07);
}

function resize(force=false) {
  const box=scene.getBoundingClientRect();
  const w=Math.max(1,box.width),h=Math.max(1,box.height);
  if(!force && Math.abs(w-width)<2 && Math.abs(h-height)<2)return;
  const wasPlaying = model.mode==='flight' || model.mode==='settling' || model.mode==='aim';
  width=w;height=h;
  dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
  scene.width=Math.round(w*dpr);scene.height=Math.round(h*dpr);
  factor=w/1000;
  ctx.setTransform(dpr*factor,0,0,dpr*factor,0,0);
  stage=stageAt(index,h/factor);
  if(wasPlaying && launched) {
    model.mode='ready'; model.craft=null;model.trace=[];model.fx=null;
    accumulator=0;settleResult=null;
  }
  model.drag=null;model.prediction=null;
  updateHud();
}
function point(ev) {
  const box=scene.getBoundingClientRect();
  return {x:(ev.clientX-box.left)/factor,y:(ev.clientY-box.top)/factor};
}
function updateHud() {
  if(!stage)return;
  title.textContent=stage.name;
  sector.textContent=stage.sector;
  attemptsLabel.textContent='ПОПЫТОК '+attempts[index];
  let hint='ТЯНИ КУРС ОТ ЗОНДА';
  let power=0;
  if(model.mode==='aim' && model.drag) {
    const vec=launchVector(stage.start,model.drag);
    power=vec?Math.min(100,Math.round((vec.speed-200)/770*100)):0;
    const e=model.prediction?.event;
    hint=e?.type==='dock'?'СТЫКОВКА ВОЗМОЖНА':e?.type==='impact'?'РИСК СТОЛКНОВЕНИЯ':'ОТПУСТИ ДЛЯ ЗАПУСКА';
  } else if(model.mode==='flight')hint='ЗОНД В ПОЛЁТЕ';
  else if(model.mode==='settling')hint='ПРИНИМАЕМ ТЕЛЕМЕТРИЮ';
  else if(model.mode==='pause')hint='ПОЛЁТ НА ПАУЗЕ';
  impulseLabel.textContent=hint;
  impulseFill.style.width=power+'%';
  impulseTrack.setAttribute('aria-valuenow',String(power));
}
function renderNav() {
  nav.replaceChildren();
  for(let i=0;i<STAGE_COUNT;i++){
    const btn=document.createElement('button');
    btn.type='button';btn.textContent=String(i+1).padStart(2,'0');
    btn.setAttribute('aria-label','Экспедиция '+(i+1));
    const open=i<progress.unlocked;
    btn.disabled=!open;
    if(!open)btn.title='Откроется после предыдущей миссии';
    if(i===index) {btn.classList.add('current');btn.setAttribute('aria-current','step');}
    if(progress.best[i])btn.classList.add('cleared');
    btn.addEventListener('click',()=>{if(i===index)return;enableAudio();sound('ui');goTo(i);});
    nav.append(btn);
  }
}
function goTo(i) {
  index=Math.max(0,Math.min(progress.unlocked-1,i));
  stage=stageAt(index,height/factor);
  model.mode='ready';model.craft=null;model.trace=[];
  model.drag=null;model.prediction=null;model.fx=null;
  accumulator=0;settleResult=null;pointerId=null;press=null;
  completionCode='';
  launched=true;
  intro.hidden=true;modal.hidden=true;
  app.classList.remove('is-intro');
  renderNav();updateHud();
}
function startGame() {
  enableAudio();sound('ui');vibrate();
  goTo(index);
}
function launch(vector) {
  if(!vector)return;
  model.mode='flight';
  model.craft=makeCraft(stage,vector);
  model.trace=[{x:stage.start.x,y:stage.start.y}];
  model.drag=null;model.prediction=null;model.fx=null;
  attempts[index]+=1;
  accumulator=0;settleResult=null;
  sound('launch');vibrate(18);updateHud();
}
function finish(event) {
  settleResult=event;
  model.mode='settling';
  model.fx={type:event.type,x:event.x,y:event.y,elapsed:.001};
  sound(event.type==='dock'?'dock':event.type==='impact'?'impact':'lost');
  vibrate(event.type==='dock'?[18,70,24]:[30,55,20]);
  if(event.type==='dock') {
    const old=progress.best[index];
    if(!old || attempts[index]<old) progress.best[index]=attempts[index];
    progress.unlocked=Math.min(STAGE_COUNT,Math.max(progress.unlocked,index+2));
    save();renderNav();
  }
  updateHud();
}
function showModal(type) {
  completionCode=type;
  modal.hidden=false;
  if(type==='pause') {
    modalEyebrow.textContent='РАСЧЁТ ОСТАНОВЛЕН';
    modalTitle.textContent='ПАУЗА.';
    modalDescription.textContent='Траектория никуда не исчезла. Продолжи полёт или попробуй другой импульс.';
    modalStat.textContent=stage.sector+' · ПОПЫТОК '+attempts[index];
    primaryBtn.innerHTML='ПРОДОЛЖИТЬ <span>→</span>';
    secondaryBtn.textContent='НАЧАТЬ МАНЁВР ЗАНОВО';
  } else if(type==='dock') {
    const finale=index===STAGE_COUNT-1;
    modalEyebrow.textContent=finale?'ВСЕ ЭКСПЕДИЦИИ ЗАВЕРШЕНЫ':'СИГНАЛ ПРИНЯТ';
    modalTitle.textContent=finale?'ОРБИТА ЗАМКНУТА.':'СТЫКОВКА.';
    modalDescription.textContent=finale?'Все шесть маршрутов пройдены. Теперь попробуй выполнить их с меньшим числом попыток.':'Траектория рассчитана верно. Следующий сектор открыт.';
    modalStat.textContent='ПОПЫТОК: '+attempts[index]+' · ЛУЧШИЙ РЕЗУЛЬТАТ: '+progress.best[index];
    primaryBtn.innerHTML=finale?'ПРОЙТИ СНАЧАЛА <span>↗</span>':'СЛЕДУЮЩИЙ СЕКТОР <span>↗</span>';
    secondaryBtn.textContent='УЛУЧШИТЬ МАНЁВР';
  } else {
    modalEyebrow.textContent=type==='impact'?'ПОТЕРЯ СВЯЗИ / УДАР':'ПОТЕРЯ СВЯЗИ / ВЫХОД ИЗ СЕКТОРА';
    modalTitle.textContent=type==='impact'?'СЛИШКОМ БЛИЗКО.':'КУРС ПОТЕРЯН.';
    modalDescription.textContent=type==='impact'?'Притяжение оказалось сильнее расчёта. Измени угол или стартовый импульс.':'Зонд покинул рабочую область. Попробуй более короткую дугу.';
    modalStat.textContent='ПОПЫТОК В СЕКТОРЕ: '+attempts[index];
    primaryBtn.innerHTML='НОВЫЙ ИМПУЛЬС <span>↗</span>';
    secondaryBtn.textContent=index>0?'ПРЕДЫДУЩИЙ СЕКТОР':'ПОВТОРИТЬ СЕКТОР';
  }
}
function pause() {
  if(model.mode==='intro'||model.mode==='pause'||!modal.hidden)return;
  pausedFrom=model.mode==='flight'?'flight':'ready';
  if(model.mode==='aim'){model.drag=null;model.prediction=null;}
  model.mode='pause';
  showModal('pause');
  updateHud();
}
function actPrimary() {
  enableAudio();sound('ui');vibrate(9);
  if(completionCode==='pause') {modal.hidden=true;model.mode=pausedFrom;accumulator=0;last=performance.now();}
  else if(completionCode==='dock') {goTo(index===STAGE_COUNT-1?0:index+1);}
  else goTo(index);
  updateHud();
}
function actSecondary() {
  enableAudio();sound('ui');
  if(completionCode==='lost'||completionCode==='impact') {
    goTo(Math.max(0,index-1));
  } else goTo(index);
}

function onPointerDown(ev) {
  if(model.mode!=='ready'||!modal.hidden||!intro.hidden||pointerId!==null) return;
  if(ev.button!==undefined && ev.button!==0)return;
  ev.preventDefault();
  enableAudio();
  pointerId=ev.pointerId;
  press={clientX:ev.clientX,clientY:ev.clientY};
  model.mode='aim';model.drag=point(ev);
  model.prediction=predict(stage,launchVector(stage.start,model.drag));
  try {scene.setPointerCapture(ev.pointerId);} catch {/* OS interruption */}
  updateHud();
}
function onPointerMove(ev) {
  if(pointerId!==ev.pointerId||model.mode!=='aim')return;
  ev.preventDefault();
  const next=point(ev);
  model.drag={x:Math.max(-80,Math.min(stage.width+80,next.x)),y:Math.max(-90,Math.min(stage.height+90,next.y))};
  model.prediction=predict(stage,launchVector(stage.start,model.drag));
  updateHud();
}
function onPointerUp(ev) {
  if(pointerId!==ev.pointerId)return;
  ev.preventDefault();
  const start=press;
  pointerId=null;press=null;
  try {scene.releasePointerCapture(ev.pointerId);} catch {}
  if(model.mode!=='aim')return;
  const moved=start?Math.hypot(ev.clientX-start.clientX,ev.clientY-start.clientY):0;
  const vec=moved>10?launchVector(stage.start,model.drag):null;
  model.mode='ready';model.drag=null;model.prediction=null;
  if(vec)launch(vec);
  else {sound('aim');updateHud();}
}
function onPointerCancel(ev) {
  if(ev.pointerId!==pointerId)return;
  pointerId=null;press=null;
  if(model.mode==='aim'){model.mode='ready';model.drag=null;model.prediction=null;updateHud();}
}
function toggleSound() {
  progress.sound=!progress.sound;save();
  soundBtn.classList.toggle('muted',!progress.sound);
  soundBtn.textContent=progress.sound?'♫':'×';
  soundBtn.setAttribute('aria-label',progress.sound?'Выключить звук':'Включить звук');
  if(progress.sound){enableAudio();sound('ui');}
}
soundBtn.classList.toggle('muted',!progress.sound);
soundBtn.textContent=progress.sound?'♫':'×';
soundBtn.setAttribute('aria-label',progress.sound?'Выключить звук':'Включить звук');
$('startBtn').addEventListener('click',startGame);
$('resetBtn').addEventListener('click',()=>{if(model.mode==='intro')return;sound('ui');goTo(index);});
pauseBtn.addEventListener('click',pause);
soundBtn.addEventListener('click',toggleSound);
primaryBtn.addEventListener('click',actPrimary);
secondaryBtn.addEventListener('click',actSecondary);
scene.addEventListener('pointerdown',onPointerDown);
scene.addEventListener('pointermove',onPointerMove);
scene.addEventListener('pointerup',onPointerUp);
scene.addEventListener('pointercancel',onPointerCancel);
scene.addEventListener('lostpointercapture',onPointerCancel);
window.addEventListener('keydown',ev=>{
  if(ev.key==='Escape') {
    if(model.mode==='pause')actPrimary();
    else pause();
    return;
  }
  if(ev.key==='r'||ev.key==='R'){if(launched)goTo(index);}
  if(ev.key===' '&&model.mode==='intro'){ev.preventDefault();startGame();}
  const number=Number(ev.key);
  if(number>=1&&number<=STAGE_COUNT&&model.mode!=='intro'&&number<=progress.unlocked)goTo(number-1);
});
window.addEventListener('resize',()=>resize());
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){save();last=0;}
  else if(launched&&model.mode==='flight'){pause();}
});
window.addEventListener('blur',()=>{pointerId=null;press=null;if(model.mode==='aim'){model.mode='ready';model.drag=null;model.prediction=null;updateHud();}});

function frame(now) {
  frameId=requestAnimationFrame(frame);
  if(document.hidden)return;
  if(!width||!height)return;
  const dt=last?Math.min(.05,Math.max(0,(now-last)/1000)):0;
  last=now;
  if(model.mode==='flight') {
    accumulator+=dt;
    let iterations=0;
    while(accumulator>=STEP&&iterations++<4) {
      accumulator-=STEP;
      const event=advanceCraft(model.craft,stage);
      if(model.craft.steps%2===0)model.trace.push({x:model.craft.x,y:model.craft.y});
      if(event){model.trace.push({x:model.craft.x,y:model.craft.y});finish(event);break;}
    }
  } else accumulator=0;
  if(model.mode==='settling'&&model.fx) {
    model.fx.elapsed+=dt;
    if(model.fx.elapsed>=.92) {
      const type=settleResult?.type||'lost';
      model.mode=type==='dock'?'end':'lost';
      showModal(type);
    }
  }
  ctx.setTransform(dpr*factor,0,0,dpr*factor,0,0);
  paint(ctx,stage,model,now,reduceMotion.matches);
}

resize(true);
renderNav();
updateHud();
frameId=requestAnimationFrame(frame);
if('serviceWorker' in navigator) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}),{once:true});
}
