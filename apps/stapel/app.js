import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { WORLD, ENGINES, MISSIONS, defaultCraft, isValidCraft, craftStats, altitude,
  orbitalElements, createFlight, advanceFlight, separateStage, remainingFuel, clamp } from './physics.js';
import { renderBuild, renderFlight } from './renderer.js';

installMobileRuntime();
const KEY='pocket-works:stapel:v1';
const $=id=>document.getElementById(id);
const N=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const safeRead=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
const data=safeRead();
let craft=isValidCraft(data.craft)?data.craft.map(s=>({...s})):defaultCraft();
let missionIndex=Number.isInteger(data.missionIndex)?clamp(data.missionIndex,0,MISSIONS.length-1):0;
let selected=0,mode='build',flight=null,paused=false,warpIndex=0,map=false;
let lastFrame=0,frameId=0,hitRects=[],seenEvent='',pendingConfirmation=null;
let savedSound=typeof data.sound==='boolean'?data.sound:false;
let restoreFlightPause=null;
let audioContext=null;
const warpLevels=[1,4,12,24];
const sleepFrames=()=>{cancelAnimationFrame(frameId);frameId=0;lastFrame=0;};
function save(){
  try{localStorage.setItem(KEY,JSON.stringify({craft,missionIndex,sound:savedSound,completed:Array.isArray(data.completed)?data.completed:[]}));}
  catch(e){$('buildMessage').textContent='Не удалось сохранить конструкцию. Проверьте память устройства.';}
}
function beep(freq=520,duration=.065,gain=.018){
  if(!savedSound)return;
  try{
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    const osc=audioContext.createOscillator(),vol=audioContext.createGain();
    osc.type='triangle';osc.frequency.value=freq;vol.gain.setValueAtTime(gain,audioContext.currentTime);
    vol.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);
    osc.connect(vol).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);
  }catch(e){savedSound=false;setSoundButton();}
}
function setSoundButton(){
  const b=$('soundButton');
  b.textContent=savedSound?'♪':'♪̸';
  b.setAttribute('aria-label',savedSound?'Выключить звук':'Включить звук');
  b.setAttribute('aria-pressed',String(savedSound));
}
function notify(message){$('buildMessage').textContent=message;}
function refreshBuild(){
  const m=MISSIONS[missionIndex];
  $('missionIndex').textContent=String(missionIndex+1).padStart(2,'0')+' / 03'+(Array.isArray(data.completed)&&data.completed.includes(missionIndex)?'  ✓':'');
  $('missionName').textContent=m.name;
  $('missionConditions').textContent=N.format(m.payload)+' кг · орбита '+Math.round(m.min/1000)+'–'+Math.round(m.max/1000)+' км';
  $('missionPrev').disabled=missionIndex===0;
  $('missionNext').disabled=missionIndex===MISSIONS.length-1;
  const tabs=$('stageTabs');tabs.replaceChildren();
  craft.forEach((stage,index)=>{
    const button=document.createElement('button');
    button.type='button';button.className='stage-tab'+(index===selected?' active':'');
    button.textContent='№ '+String(index+1).padStart(2,'0');
    button.setAttribute('aria-label','Выбрать ступень '+(index+1));
    button.setAttribute('aria-pressed',String(index===selected));
    button.addEventListener('click',()=>{selected=index;beep(450);refreshBuild();});
    tabs.append(button);
  });
  const s=craft[selected]; const e=ENGINES[s.engine];
  $('stageTitle').textContent='СТУПЕНЬ '+(selected+1)+' · '+(selected===0?'СТАРТОВАЯ':selected===craft.length-1?'ВЕРХНЯЯ':'ПРОМЕЖУТОЧНАЯ');
  $('removeStage').disabled=craft.length===1;
  $('addStage').disabled=craft.length===3;
  $('tankCount').textContent=s.tanks;
  $('tankMinus').disabled=s.tanks<=1;
  $('tankPlus').disabled=s.tanks>=6;
  $('engineName').textContent=e.name;
  $('engineStats').textContent=N.format(e.thrust/1000)+' кН · '+e.ispVac+' с · '+e.role;
  $('finsButton').setAttribute('aria-pressed',String(s.fins));
  $('finsValue').textContent=s.fins?'ДА':'НЕТ';
  const stats=craftStats(craft,m.payload);
  $('deltaV').textContent=N.format(stats.deltaV)+' м/с';
  $('twr').textContent=stats.twr.toFixed(2).replace('.',',');
  $('cost').textContent=stats.cost.toFixed(1).replace('.',',')+' / '+m.budget;
  $('cost').classList.toggle('warn',stats.cost>m.budget);
  $('twr').classList.toggle('warn',stats.twr<=1.05);
  const budgetOK=stats.cost<=m.budget;
  const liftOK=stats.twr>1.01;
  $('launchButton').disabled=!budgetOK||!liftOK;
  if(!budgetOK)notify('Превышен бюджет. Уменьши число баков или смени двигатель.');
  else if(!liftOK)notify('Тяги недостаточно для старта с Марса. Нужен TWR выше 1,01.');
  else notify('Готово к испытанию. Расчёт ΔV — в вакууме, без потерь.');
  hitRects=renderBuild($('buildCanvas'),craft,selected);
}
function mutate(fn){fn();beep(480,.055);save();refreshBuild();}
function confirmAction(title,text,action){
  const o=$('confirmOverlay');$('confirmTitle').textContent=title;$('confirmText').textContent=text;
  pendingConfirmation=action;o.hidden=false;
}
function hideConfirm(){pendingConfirmation=null;$('confirmOverlay').hidden=true;if(restoreFlightPause!==null){if(mode==='flight')paused=restoreFlightPause;restoreFlightPause=null;}}
$('confirmCancel').addEventListener('click',()=>hideConfirm());
$('confirmYes').addEventListener('click',()=>{const action=pendingConfirmation;hideConfirm();if(action)action();});
$('soundButton').addEventListener('click',()=>{savedSound=!savedSound;setSoundButton();save();beep(640,.095);});
$('missionPrev').addEventListener('click',()=>{if(missionIndex>0)mutate(()=>{missionIndex--;});});
$('missionNext').addEventListener('click',()=>{if(missionIndex<MISSIONS.length-1)mutate(()=>{missionIndex++;});});
$('tankMinus').addEventListener('click',()=>{if(craft[selected].tanks>1)mutate(()=>{craft[selected].tanks--;});});
$('tankPlus').addEventListener('click',()=>{if(craft[selected].tanks<6)mutate(()=>{craft[selected].tanks++;});});
$('engineButton').addEventListener('click',()=>mutate(()=>{
  const keys=Object.keys(ENGINES),index=keys.indexOf(craft[selected].engine);
  craft[selected].engine=keys[(index+1)%keys.length];
}));
$('finsButton').addEventListener('click',()=>mutate(()=>{craft[selected].fins=!craft[selected].fins;}));
$('addStage').addEventListener('click',()=>{if(craft.length>=3)return;mutate(()=>{
  craft.push({tanks:1,engine:'vac',fins:false});selected=craft.length-1;
});});
$('removeStage').addEventListener('click',()=>{if(craft.length<=1)return;confirmAction(
  'Снять ступень?','Выбранный блок будет удалён из конструкции.',
  ()=>mutate(()=>{craft.splice(selected,1);selected=Math.min(selected,craft.length-1);})
);});
$('resetCraft').addEventListener('click',()=>confirmAction('Новый прототип?','Текущая конфигурация будет заменена базовой двухступенчатой ракетой.',()=>{
  craft=defaultCraft();selected=0;save();refreshBuild();beep(410,.11);
}));
$('buildCanvas').addEventListener('pointerup',event=>{
  if(mode!=='build')return;
  const rect=$('buildCanvas').getBoundingClientRect();
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  for(const hit of [...hitRects].reverse()){
    if(x>=hit.left&&x<=hit.right&&y>=hit.top&&y<=hit.bottom){
      selected=hit.index;beep(400,.05);refreshBuild();return;
    }
  }
});
function showBuilder(){
  mode='build';flight=null;paused=false;sleepFrames();
  $('builder').hidden=false;$('flight').hidden=true;$('result').hidden=true;
  $('confirmOverlay').hidden=true;pendingConfirmation=null;
  refreshBuild();
}
function startLaunch(){
  const stats=craftStats(craft,MISSIONS[missionIndex].payload);
  if(stats.cost>MISSIONS[missionIndex].budget||stats.twr<=1.05){refreshBuild();return;}
  save();mode='flight';flight=createFlight(craft,missionIndex);
  paused=false;map=false;warpIndex=0;seenEvent='';
  $('builder').hidden=true;$('flight').hidden=false;$('result').hidden=true;
  $('mapButton').textContent='ОРБИТА';$('pauseButton').textContent='ПАУЗА';
  refreshFlight();beep(185,.3,.032);sleepFrames();frameId=requestAnimationFrame(tick);
}
$('launchButton').addEventListener('click',startLaunch);
$('retryButton').addEventListener('click',startLaunch);
$('reviseButton').addEventListener('click',showBuilder);
$('abortFlight').addEventListener('click',()=>{
  if(!flight)return;
  restoreFlightPause=paused;
  paused=true;
  confirmAction('Прервать полёт?','Текущий полёт будет завершён. Проект ракеты останется в ангаре.',()=>showBuilder());
});
$('autoButton').addEventListener('click',()=>{
  if(!flight||flight.outcome)return;
  flight.auto=!flight.auto;
  if(!flight.auto){flight.mode='manual';} else {flight.mode='ascent';}
  beep(flight.auto?640:380);refreshFlight();
});
$('warpButton').addEventListener('click',()=>{if(!flight||flight.outcome)return;warpIndex=(warpIndex+1)%warpLevels.length;beep(480);refreshFlight();});
$('pauseButton').addEventListener('click',()=>{
  if(!flight||flight.outcome)return;paused=!paused;
  $('pauseButton').textContent=paused?'ПРОДОЛЖИТЬ':'ПАУЗА';beep(420);
});
$('mapButton').addEventListener('click',()=>{
  if(!flight)return;map=!map;$('mapButton').textContent=map?'ВИД ПОЛЁТА':'ОРБИТА';
  renderFlight($('flightCanvas'),flight,map,flight.t);beep(520);
});
function overridePilot(){if(!flight||flight.outcome)return;flight.auto=false;flight.mode='manual';}
$('pitchMinus').addEventListener('click',()=>{if(!flight)return;overridePilot();flight.pitch=clamp(flight.pitch-5,-15,100);refreshFlight();beep(350);});
$('pitchPlus').addEventListener('click',()=>{if(!flight)return;overridePilot();flight.pitch=clamp(flight.pitch+5,-15,100);refreshFlight();beep(430);});
$('throttleSlider').addEventListener('input',event=>{
  if(!flight)return;overridePilot();flight.throttle=Number(event.target.value)/100;refreshFlight();
});
$('stageButton').addEventListener('click',()=>{
  if(!flight||flight.outcome)return;
  if(separateStage(flight)){beep(225,.18,.025);refreshFlight();}
});
function formatAlt(v){
  if(!Number.isFinite(v))return '∞';
  if(v<0)return '−'+N.format(Math.abs(v)/1000)+' км';
  return (v/1000).toFixed(v<100000?1:0).replace('.',',')+' км';
}
function flightReport(f){
  if(!f)return;
  mode='result';sleepFrames();
  const m=MISSIONS[f.missionIndex],orb=orbitalElements(f.x,f.y,f.vx,f.vy);
  const ok=f.outcome==='success';
  const report=$('result').querySelector('.report');report.classList.toggle('success',ok);
  $('resultSeal').textContent=ok?'✓':'×';
  $('resultTitle').textContent=ok?'ОРБИТА ДОСТИГНУТА':f.outcome==='crash'?'АВАРИЯ НА МАРСЕ':'ПУСК ЗАВЕРШЁН';
  let reason=f.reason;
  if(!ok&&!reason){
    if(orb.apoAlt<m.min)reason='Недостаточно энергии: апогей ниже целевой орбиты.';
    else if(orb.periAlt<0)reason='Апогей достигнут, но горизонтальной скорости не хватает для орбиты.';
    else reason='Параметры орбиты вышли за заданный коридор.';
  }
  $('resultDescription').textContent=ok
    ?m.reward+'. Перигей '+formatAlt(orb.periAlt)+'; апогей '+formatAlt(orb.apoAlt)+'. Испытание засчитано.'
    :reason+' Апогей '+formatAlt(orb.apoAlt)+'; перигей '+formatAlt(orb.periAlt)+'. Измени конструкцию или профиль полёта.';
  $('resultAltitude').textContent=formatAlt(f.maxAlt);
  $('resultSpeed').textContent=N.format(f.peakSpeed)+' м/с';
  $('resultTime').textContent=Math.floor(f.t/60)+':'+String(Math.floor(f.t%60)).padStart(2,'0');
  if(ok){
    const done=new Set(Array.isArray(data.completed)?data.completed:[]);
    done.add(f.missionIndex);data.completed=[...done];save();beep(690,.21);
  }else beep(190,.3);
  $('result').hidden=false;
}
function refreshFlight(){
  if(!flight)return;
  const f=flight,orb=orbitalElements(f.x,f.y,f.vx,f.vy);
  $('flightClock').textContent='T+ '+String(Math.floor(f.t/3600)).padStart(2,'0')+':'+String(Math.floor((f.t%3600)/60)).padStart(2,'0')+':'+String(Math.floor(f.t%60)).padStart(2,'0');
  $('flightMode').textContent= f.auto ? ({ascent:'НАБОР ВЫСОТЫ',coast:'СВОБОДНЫЙ ПОЛЁТ',circularize:'ВЫХОД НА ОРБИТУ'}[f.mode]||'АВТОПИЛОТ') : 'РУЧНОЕ УПРАВЛЕНИЕ';
  $('altitudeValue').textContent=formatAlt(orb.altitude);
  $('velocityValue').textContent=N.format(orb.speed)+' м/с';
  $('apoValue').textContent=formatAlt(orb.apoAlt);
  $('periValue').textContent=formatAlt(orb.periAlt);
  $('pitchValue').textContent=Math.round(f.pitch)+'°';
  $('throttleValue').textContent=Math.round(f.throttle*100)+'%';
  $('throttleSlider').value=Math.round(f.throttle*100);
  $('autoButton').classList.toggle('on',f.auto);
  $('autoButton').setAttribute('aria-pressed',String(f.auto));
  $('autoButton').querySelector('b').textContent=f.auto?'ВКЛ':'ВЫКЛ';
  $('warpButton').textContent='ВРЕМЯ ×'+warpLevels[warpIndex];
  $('stageDisplay').textContent='СТУПЕНЬ '+(f.stageIndex+1)+' / '+f.stages.length;
  const stage=f.stages[f.stageIndex];
  const remaining=f.fuel[f.stageIndex],max=stage.tanks*900;
  $('fuelBar').style.width=(remaining/max*100).toFixed(2)+'%';
  $('fuelValue').textContent=Math.round(remaining/max*100)+'% ТОПЛИВА';
  const available=f.stageIndex<f.stages.length-1;
  $('stageButton').disabled=!available;
  $('stageButton').innerHTML=available?'ОТДЕЛИТЬ<br><strong>СТУПЕНЬ</strong>':'ПОСЛЕДНЯЯ<br><strong>СТУПЕНЬ</strong>';
  const msg=f.events[f.events.length-1]||'ИСПЫТАНИЕ';
  if(msg!==seenEvent){$('flightEvent').textContent=msg;seenEvent=msg;}
}
let displayTick=0;
function tick(timestamp){
  frameId=0;
  if(mode!=='flight'||!flight||document.hidden)return;
  const dt=lastFrame?clamp((timestamp-lastFrame)/1000,0,.055):0;
  lastFrame=timestamp;
  if(!paused){
    advanceFlight(flight,dt*warpLevels[warpIndex]);
    if(flight.outcome){flightReport(flight);return;}
  }
  renderFlight($('flightCanvas'),flight,map,flight.t);
  displayTick+=dt;
  if(displayTick>.11){displayTick=0;refreshFlight();}
  frameId=requestAnimationFrame(tick);
}
window.addEventListener('resize',()=>{if(mode==='build')hitRects=renderBuild($('buildCanvas'),craft,selected);else if(flight&&mode==='flight')renderFlight($('flightCanvas'),flight,map,flight.t);});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(mode==='flight')paused=true;sleepFrames();}
  else if(mode==='flight'){lastFrame=0;$('pauseButton').textContent='ПРОДОЛЖИТЬ';frameId=requestAnimationFrame(tick);}
});
window.addEventListener('pagehide',save);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('confirmOverlay').hidden){hideConfirm();return;}if(mode==='flight')$('abortFlight').click();}
  if(mode==='flight'&&e.code==='Space'){e.preventDefault();$('pauseButton').click();}
});
createWorkshopMode({
  appName: 'СТАПЕЛЬ',
  version: '1.0.0',
  cachePrefix: 'stapel-',
  storageNamespace: 'pocket-works:stapel',
  onReset(){
    craft=defaultCraft();
    missionIndex=0; selected=0;
    data.completed=[];
    savedSound=false;
    setSoundButton();
    showBuilder();
  }
});
setSoundButton();
refreshBuild();
