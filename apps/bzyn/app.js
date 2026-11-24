import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import {WORLD,FIXED_STEP,buildWave,rubber,launchVector,capVelocity,advanceBall,clamp,magnitude} from './physics.mjs';

const $=id=>document.getElementById(id);
const canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false});
const ui={score:$('score'),wave:$('wave'),shots:$('shots'),hint:$('hint'),hintSub:$('hintSub'),badge:$('catchBadge'),flash:$('waveFlash'),fire:$('fireButton'),sound:$('soundButton'),pause:$('pauseScreen'),end:$('endScreen'),a11y:$('a11yStatus')};
const STORE='pocket-works:bzyn:preferences:v1';
function readPrefs(){try{const p=JSON.parse(localStorage.getItem(STORE)||'{}');return {best:Number.isSafeInteger(p.best)&&p.best>=0?p.best:0,sound:p.sound!==false}}catch{return {best:0,sound:true}}}
const prefs=readPrefs();
function savePrefs(){try{localStorage.setItem(STORE,JSON.stringify(prefs))}catch{}}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const DOCK={x:WORLD.dockX,y:WORLD.dockY};
const stage={wave:1,score:0,popped:0,shots:4,mode:'ready',waveData:buildWave(1),puck:{x:DOCK.x,y:DOCK.y,vx:0,vy:0,r:WORLD.radius},catchLeft:0,angle:0,paused:false,drag:null,particles:[],numbers:[],trail:[],flight:0,still:0,transition:0,respawn:0,time:0,clock:0,springVelocity:{x:0,y:0},spring:false,impulse:0};
let raf=null,lastFrame=0,accumulator=0,focusBeforeOverlay=null;

class ToySound{
  constructor(){this.context=null;this.noise=null;this.last={};}
  unlock(){
    if(!prefs.sound)return;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return;
    try{if(!this.context)this.context=new C();if(this.context.state==='suspended')this.context.resume().catch(()=>{});}catch{}
  }
  noiseBuffer(){
    if(this.noise||!this.context)return this.noise;
    const c=this.context,b=c.createBuffer(1,Math.round(c.sampleRate*.25),c.sampleRate),a=b.getChannelData(0);
    for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/a.length*2.5);
    this.noise=b;return b;
  }
  tone(frequency,delay,duration,volume,type='triangle',fall=1){
    const c=this.context;if(!c||c.state!=='running')return;
    const t=c.currentTime+delay,g=c.createGain(),o=c.createOscillator();
    o.type=type;o.frequency.setValueAtTime(frequency,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(45,frequency*fall),t+duration);
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.006);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g).connect(c.destination);o.start(t);o.stop(t+duration+.02);
  }
  thud(volume=1,frequency=400,duration=.09){
    const c=this.context;if(!c||c.state!=='running')return;
    const t=c.currentTime,g=c.createGain(),filter=c.createBiquadFilter(),source=c.createBufferSource();
    source.buffer=this.noiseBuffer();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.85;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.085*volume,t+.004);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter).connect(g).connect(c.destination);source.start(t);source.stop(t+duration+.02);
  }
  play(kind,strength=1){
    if(!prefs.sound)return;
    this.unlock();const c=this.context;if(!c||c.state!=='running')return;
    const now=c.currentTime;if(now-(this.last[kind]??-10)<(kind==='wall'?.095:.038))return;
    this.last[kind]=now;const p=.97+Math.random()*.06;
    if(kind==='grab'){this.thud(.32,420,.05);this.tone(260*p,0,.07,.025,'triangle',1.25);}
    if(kind==='launch'){this.thud(.75,520,.14);this.tone(175*p,0,.18,.07,'sawtooth',.44);this.tone(320*p,.04,.12,.025,'triangle',1.6);}
    if(kind==='wall'){this.thud(.26,550,.075);}
    if(kind==='bumper'){this.thud(.55,290+strength*90,.09);this.tone(195*p,0,.10,.04,'triangle',.72);}
    if(kind==='target'){this.tone(650*p,0,.37,.065,'sine',.94);this.tone(978*p,.008,.25,.022,'sine',.91);this.thud(.19,2500,.04);}
    if(kind==='clear'){this.tone(510,0,.24,.045,'triangle',1);this.tone(680,.1,.28,.055,'triangle',1);this.tone(905,.2,.41,.066,'sine',1);}
    if(kind==='end'){this.tone(235,0,.35,.045,'triangle',.78);this.tone(177,.17,.43,.04,'triangle',.71);}
  }
}
const sound=new ToySound();
function vibrate(duration){if(navigator.vibrate&&(!reducedMotion.matches))try{navigator.vibrate(duration)}catch{}}
function announce(text){ui.a11y.textContent=text;}
function publish(){window.__AI_TEST_STATE__={app:'bzyn',mode:stage.mode,paused:stage.paused,score:stage.score,wave:stage.wave,shots:stage.shots,targetsRemaining:stage.waveData.targets.filter(t=>!t.hit).length,popped:stage.popped,catchLeft:stage.catchLeft,dragging:!!stage.drag,puck:{x:Math.round(stage.puck.x),y:Math.round(stage.puck.y)},best:prefs.best};}
function syncUI(){
  ui.score.textContent=String(stage.score).padStart(4,'0');
  ui.wave.textContent=String(stage.wave).padStart(2,'0');
  ui.shots.textContent=Array.from({length:4},(_,i)=>i<stage.shots?'●':'○').join(' ');
  ui.badge.hidden=stage.mode!=='flying'||!stage.catchLeft||!!stage.drag||stage.paused;
  ui.fire.disabled=stage.mode!=='ready'||stage.paused||!!stage.drag;
  ui.sound.setAttribute('aria-pressed',String(prefs.sound));
  ui.sound.setAttribute('aria-label',prefs.sound?'Выключить звук':'Включить звук');
  if(stage.mode==='ready'){ui.hint.textContent='ПОТЯНИ КРАСНЫЙ ШАР ВНИЗ';ui.hintSub.textContent='Отпусти — полетит. Стрелки + пробел тоже работают.'}
  else if(stage.mode==='flying'){ui.hint.textContent=stage.catchLeft?'ЛОВИ ШАР ПРЯМО В ПОЛЁТЕ':'ЛОВИ РИКОШЕТЫ!';ui.hintSub.textContent=stage.catchLeft?'Один перехват на каждый запуск.':'Шар закончит полёт — будет новая попытка.'}
  else if(stage.mode==='transition'){ui.hint.textContent='ВСЕ КОЛОКОЛЬЧИКИ СБИТЫ!';ui.hintSub.textContent='Готовим новый набор мишеней.'}
  else if(stage.mode==='respawn'){ui.hint.textContent='СЛЕДУЮЩИЙ ЗАПУСК';ui.hintSub.textContent='Хороший рикошет начинается с прицела.'}
  publish();
}
function newRound(){
  stage.wave=1;stage.score=0;stage.popped=0;stage.shots=4;stage.angle=0;stage.paused=false;stage.combo=0;stage.comboClock=0;
  stage.particles.length=0;stage.numbers.length=0;stage.trail.length=0;
  ui.pause.hidden=true;ui.end.hidden=true;ui.flash.hidden=true;
  setupWave(1);
  if(document.activeElement?.closest('.overlay'))canvas.focus({preventScroll:true});
  announce('Новый раунд. Потяните красный шар и отпустите.');
}
function setupWave(number){
  stage.wave=number;stage.waveData=buildWave(number);stage.shots=4;stage.mode='ready';
  stage.drag=null;stage.catchLeft=0;stage.time=0;stage.flight=0;stage.still=0;stage.spring=false;
  stage.puck={x:DOCK.x,y:DOCK.y,vx:0,vy:0,r:WORLD.radius};
  stage.trail.length=0;stage.transition=0;stage.respawn=0;ui.flash.hidden=true;
  syncUI();
}
function startFlight(vector){
  if(stage.mode!=='ready'||!vector||stage.shots<=0)return false;
  stage.shots--;
  stage.mode='flying';stage.flight=0;stage.still=0;stage.catchLeft=1;stage.spring=false;
  const v=capVelocity(vector.vx,vector.vy,900);
  stage.puck.vx=v.vx;stage.puck.vy=v.vy;
  stage.trail.length=0;
  burst(stage.puck.x,stage.puck.y,7,'#f7d58a',120);
  sound.play('launch');vibrate(14);syncUI();
  announce('Запуск. Можно один раз поймать летящий шар.');
  return true;
}
function fireKeyboard(){
  if(stage.paused||stage.mode!=='ready')return;
  sound.unlock();const speed=720;
  const v={vx:Math.sin(stage.angle)*speed,vy:-Math.cos(stage.angle)*speed};
  stage.puck.x=DOCK.x;stage.puck.y=DOCK.y;startFlight(v);
}
function burst(x,y,count,color,force=145){
  if(reducedMotion.matches)return;
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,s=(.35+Math.random()*.65)*force;
    stage.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.35,max:.6,r:2+Math.random()*4,color});
  }
  if(stage.particles.length>95)stage.particles.splice(0,stage.particles.length-95);
}
function floatingScore(x,y,text,color='#ffe6a6'){
  if(reducedMotion.matches)return;
  stage.numbers.push({x,y,text,color,life:.85});
}
function onPhysics(event){
  if(event.type==='wall'){if(stage.flight>.08)sound.play('wall');return;}
  if(event.type==='bumper'){
    sound.play('bumper',clamp((event.impact||100)/550,.2,1));
    burst(event.x,event.y,5,'#f2b65a',90);
    stage.impulse=.12;return;
  }
  if(event.type!=='target')return;
  const remaining=stage.waveData.targets.filter(x=>!x.hit).length;
  const isCombo=stage.comboClock>0;
  stage.combo=isCombo?Math.min(9,(stage.combo||1)+1):1;
  stage.comboClock=1.45;
  const points=(event.target.gold?170:100)*stage.combo;
  stage.score+=points;stage.popped++;
  sound.play('target');vibrate(stage.combo>1?26:10);
  burst(event.x,event.y,16,event.target.gold?'#f4d071':'#fb9980',220);
  floatingScore(event.x,event.y,'+'+points+(stage.combo>=2?' ×'+stage.combo:''),'#ffe8a2');
  stage.impulse=.24;syncUI();
  announce('Колокольчик! '+points+' очков. Осталось '+remaining+'.');
  if(remaining===0)clearWave();
}
function clearWave(){
  stage.mode='transition';stage.transition=1.6;stage.score+=350+stage.shots*80;
  stage.impulse=.3;ui.flash.hidden=false;ui.flash.textContent='БЗЫ-Ы-ЫНЬ!';sound.play('clear');
  burst(180,235,35,'#fce6a0',360);
  announce('Волна '+stage.wave+' пройдена. Следующая волна.');
  syncUI();
}
function completeFlight(){
  if(stage.mode!=='flying')return;
  stage.catchLeft=0;
  if(stage.shots>0){stage.mode='respawn';stage.respawn=.32;stage.puck.vx=0;stage.puck.vy=0;syncUI();return;}
  endRound();
}
function endRound(){
  stage.mode='end';stage.drag=null;stage.catchLeft=0;stage.paused=false;
  ui.pause.hidden=true;ui.end.hidden=false;
  const newBest=stage.score>prefs.best;
  if(newBest){prefs.best=stage.score;savePrefs();}
  $('finalScore').textContent=stage.score.toLocaleString('ru-RU');
  $('endDetails').textContent='Волна '+stage.wave+' · сбито '+stage.popped+' колокольчиков';
  $('recordText').textContent=newBest?'НОВЫЙ РЕКОРД!':'ЛУЧШИЙ РЕЗУЛЬТАТ: '+prefs.best.toLocaleString('ru-RU');
  sound.play('end');announce('Раунд окончен. Вы набрали '+stage.score+' очков.');
  ui.end.querySelector('button').focus();syncUI();
}
function setPause(paused,autopause=false){
  if(stage.mode==='end'||stage.paused===paused)return;
  if(paused&&stage.drag)cancelDrag();
  stage.paused=paused;ui.pause.hidden=!paused;
  if(paused){focusBeforeOverlay=document.activeElement;$('resumeButton').focus();announce(autopause?'Игра остановлена при переключении приложения.':'Пауза.');}
  else{(focusBeforeOverlay||$('pauseButton')).focus();announce('Игра продолжается.');lastFrame=0;accumulator=0;}
  syncUI();
}

function screenPoint(event){
  const b=canvas.getBoundingClientRect();
  return {x:(event.clientX-b.left)/Math.max(1,b.width)*WORLD.width,y:(event.clientY-b.top)/Math.max(1,b.height)*WORLD.height};
}
function sample(input,point){
  const t=performance.now();
  input.samples.push({x:point.x,y:point.y,t});
  while(input.samples.length>2&&input.samples[0].t<t-150)input.samples.shift();
}
function gestureVelocity(input){
  const samples=input.samples;if(samples.length<2)return {vx:0,vy:0};
  const last=samples[samples.length-1],cutoff=last.t-100;
  let first=samples[0];
  for(const s of samples){if(s.t>=cutoff){first=s;break;}}
  const dt=Math.max(.016,(last.t-first.t)/1000);
  return capVelocity((last.x-first.x)/dt,(last.y-first.y)/dt,1400);
}
function pointerDown(event){
  if(stage.paused||!['ready','flying'].includes(stage.mode)||stage.drag)return;
  if(event.button!==undefined&&event.button!==0)return;
  const p=screenPoint(event),b=stage.puck;
  if(magnitude(p.x-b.x,p.y-b.y)>47)return;
  if(stage.mode==='flying'&&!stage.catchLeft)return;
  sound.unlock();sound.play('grab');
  const kind=stage.mode==='ready'?'sling':'catch';
  const input={id:event.pointerId,kind,start:p,startBall:{x:b.x,y:b.y},oldVelocity:{vx:b.vx,vy:b.vy},samples:[]};
  stage.drag=input;stage.spring=false;
  if(kind==='catch'){stage.catchLeft=0;b.vx=0;b.vy=0;stage.trail.length=0;}
  sample(input,p);
  try{canvas.setPointerCapture(event.pointerId)}catch{}
  event.preventDefault();syncUI();
}
function pointerMove(event){
  const input=stage.drag;if(!input||input.id!==event.pointerId)return;
  const p=screenPoint(event),deltaX=p.x-input.start.x,deltaY=p.y-input.start.y;
  if(input.kind==='sling'){
    const raw=magnitude(deltaX,deltaY),range=rubber(raw,113,.16)/Math.max(raw,.001);
    stage.puck.x=clamp(input.startBall.x+deltaX*range,38,322);
    stage.puck.y=clamp(input.startBall.y+deltaY*range,39,536);
  }else{
    stage.puck.x=clamp(input.startBall.x+deltaX,38,322);
    stage.puck.y=clamp(input.startBall.y+deltaY,39,536);
  }
  sample(input,p);event.preventDefault();
}
function releaseCapture(input){
  if(canvas.hasPointerCapture&&canvas.hasPointerCapture(input.id))try{canvas.releasePointerCapture(input.id)}catch{}
}
function pointerUp(event){
  const input=stage.drag;if(!input||input.id!==event.pointerId)return;
  const point=screenPoint(event);sample(input,point);
  const vel=gestureVelocity(input),b=stage.puck;
  stage.drag=null;releaseCapture(input);event.preventDefault();
  if(input.kind==='sling'){
    const shot=launchVector(b.x-DOCK.x,b.y-DOCK.y,vel.vx,vel.vy);
    if(!startFlight(shot)){
      stage.spring=true;stage.springVelocity={x:0,y:0};syncUI();
    }
  }else{
    const moving=magnitude(vel.vx,vel.vy)>=110;
    const vx=moving?vel.vx*.87+input.oldVelocity.vx*.19:input.oldVelocity.vx*.85;
    const vy=moving?vel.vy*.87+input.oldVelocity.vy*.19:input.oldVelocity.vy*.85;
    const v=capVelocity(vx,vy,900);
    b.vx=v.vx;b.vy=v.vy;stage.still=0;
    sound.play('launch');vibrate(12);syncUI();
    announce('Шар перенаправлен. Перехват потрачен.');
  }
}
function cancelDrag(){
  const input=stage.drag;if(!input)return;
  stage.drag=null;
  if(input.kind==='sling'){
    stage.puck.x=DOCK.x;stage.puck.y=DOCK.y;stage.spring=false;
  }else{
    stage.puck.x=input.startBall.x;stage.puck.y=input.startBall.y;
    stage.puck.vx=input.oldVelocity.vx;stage.puck.vy=input.oldVelocity.vy;stage.catchLeft=1;
  }
  releaseCapture(input);syncUI();
}
canvas.addEventListener('pointerdown',pointerDown);
canvas.addEventListener('pointermove',pointerMove);
canvas.addEventListener('pointerup',pointerUp);
canvas.addEventListener('pointercancel',event=>{if(stage.drag?.id===event.pointerId)cancelDrag()});
canvas.addEventListener('lostpointercapture',event=>{if(stage.drag?.id===event.pointerId)cancelDrag()});
$('fireButton').addEventListener('click',fireKeyboard);
$('pauseButton').addEventListener('click',()=>setPause(true));
$('resumeButton').addEventListener('click',()=>setPause(false));
$('restartButton').addEventListener('click',()=>newRound());
$('againButton').addEventListener('click',()=>newRound());
ui.sound.addEventListener('click',()=>{prefs.sound=!prefs.sound;savePrefs();if(prefs.sound)sound.unlock();syncUI();announce(prefs.sound?'Звук включён.':'Звук выключен.');});
document.addEventListener('keydown',event=>{
  const modal=stage.paused?ui.pause:stage.mode==='end'?ui.end:null;
  if(modal&&event.key==='Tab'){
    const focusables=Array.from(modal.querySelectorAll('button:not(:disabled),a[href]'));
    const first=focusables[0],last=focusables[focusables.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  if(event.key==='Escape'||event.key.toLowerCase()==='p'){
    if(stage.mode!=='end'){event.preventDefault();setPause(!stage.paused);}return;
  }
  if(stage.paused||stage.mode!=='ready')return;
  const target=event.target;
  if(target&&(['BUTTON','A','INPUT','TEXTAREA'].includes(target.tagName))&&event.code==='Space')return;
  if(event.code==='Space'){event.preventDefault();fireKeyboard();}
  if(event.key==='ArrowLeft'||event.key==='a'||event.key==='A'){
    event.preventDefault();stage.angle=clamp(stage.angle-.12,-.95,.95);
    ui.hint.textContent='ПРИЦЕЛ: '+Math.round(stage.angle*180/Math.PI)+'°';sound.play('grab');
  }
  if(event.key==='ArrowRight'||event.key==='d'||event.key==='D'){
    event.preventDefault();stage.angle=clamp(stage.angle+.12,-.95,.95);
    ui.hint.textContent='ПРИЦЕЛ: '+Math.round(stage.angle*180/Math.PI)+'°';sound.play('grab');
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(stage.drag)cancelDrag();
    if(stage.mode!=='end'&&!stage.paused)setPause(true,true);
    if(raf!==null)cancelAnimationFrame(raf);raf=null;
  }else if(raf===null){lastFrame=0;raf=requestAnimationFrame(frame);}
});
window.addEventListener('blur',()=>{if(stage.drag)cancelDrag();});
window.addEventListener('resize',resize);
function resize(){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);

function update(dt){
  stage.clock+=dt;if(stage.paused)return;
  stage.time+=dt;stage.comboClock=Math.max(0,(stage.comboClock||0)-dt);
  stage.impulse=Math.max(0,stage.impulse-dt);
  if(stage.waveData.spinner)stage.waveData.spinner.x=180+Math.sin(stage.time*stage.waveData.spinner.speed)*stage.waveData.spinner.range;
  if(stage.spring&&stage.mode==='ready'&&!stage.drag){
    const b=stage.puck,v=stage.springVelocity;
    v.x+=(DOCK.x-b.x)*140*dt;v.y+=(DOCK.y-b.y)*140*dt;
    v.x*=Math.exp(-18*dt);v.y*=Math.exp(-18*dt);
    b.x+=v.x*dt;b.y+=v.y*dt;
    if(magnitude(b.x-DOCK.x,b.y-DOCK.y)<.55&&magnitude(v.x,v.y)<7){b.x=DOCK.x;b.y=DOCK.y;stage.spring=false;}
  }
  if(stage.mode==='flying'&&!stage.drag){
    stage.flight+=dt;
    const events=advanceBall(stage.puck,dt,stage.waveData,stage.time);
    for(const e of events)onPhysics(e);
    if(!reducedMotion.matches&&Math.random()<.55){
      stage.trail.push({x:stage.puck.x,y:stage.puck.y,life:.30});
      if(stage.trail.length>16)stage.trail.shift();
    }
    const speed=magnitude(stage.puck.vx,stage.puck.vy);
    stage.still=speed<48?stage.still+dt:0;
    if(stage.mode==='flying'&&(stage.still>.75&&stage.flight>1.3||stage.flight>7.4))completeFlight();
  }
  if(stage.mode==='respawn'){stage.respawn-=dt;if(stage.respawn<=0){
    stage.mode='ready';stage.puck={x:DOCK.x,y:DOCK.y,vx:0,vy:0,r:WORLD.radius};stage.trail.length=0;syncUI();
  }}
  if(stage.mode==='transition'){stage.transition-=dt;if(stage.transition<=0){setupWave(stage.wave+1);announce('Волна '+stage.wave+'. Потяните шар для запуска.');}}
  for(const particle of stage.particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=160*dt;particle.vx*=.98;particle.life-=dt;}
  stage.particles=stage.particles.filter(p=>p.life>0);
  for(const text of stage.numbers){text.y-=36*dt;text.life-=dt;}
  stage.numbers=stage.numbers.filter(p=>p.life>0);
  for(const trail of stage.trail)trail.life-=dt;
  stage.trail=stage.trail.filter(p=>p.life>0);
}
function rounded(x,y,w,h,r,fill,stroke,width=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
}
function disk(x,y,r,fill,stroke,width=1){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
}
function background(){
  ctx.fillStyle='#215054';ctx.fillRect(0,0,360,580);
  rounded(13,13,334,554,25,'#295c5d','#153b42',5);
  rounded(25,24,310,526,18,'#245354','#598279',1.5);
  ctx.strokeStyle='#56817a';ctx.lineWidth=1;ctx.globalAlpha=.22;
  for(let y=54;y<539;y+=27){ctx.beginPath();ctx.moveTo(38,y);ctx.lineTo(322,y);ctx.stroke();}
  ctx.globalAlpha=1;
  ctx.fillStyle='#123e44';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.letterSpacing='2px';
  ctx.fillText('RICOCHET  /  TOY NO. 01',180,61);ctx.letterSpacing='0px';
  // Embossed edge markings and tiny painted fasteners.
  for(let i=0;i<13;i++){
    const y=85+i*34;ctx.fillStyle=i%2?'#477876':'#e3b96d';
    ctx.fillRect(29,y,5,13);ctx.fillRect(326,y,5,13);
  }
  for(const [x,y] of [[35,36],[325,36],[35,540],[325,540]]){
    disk(x,y,7,'#e8bb79','#183e43',2);
    ctx.strokeStyle='#976d46';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-3,y+3);ctx.lineTo(x+3,y-3);ctx.stroke();
  }
  // Decorative knock marks: manufactured toy, not a flat game grid.
  ctx.strokeStyle='#76a39a';ctx.lineWidth=2;ctx.globalAlpha=.5;
  for(const x of [104,256]){
    ctx.beginPath();ctx.arc(x,465,34,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
  }
  ctx.globalAlpha=1;
  rounded(110,421,140,89,24,'#173f45','#65928b',2);
  disk(DOCK.x,DOCK.y,31,'#214d53','#b18b55',2);
  disk(DOCK.x,DOCK.y,23,null,'#4d7c78',1.5);
  ctx.strokeStyle='#a27b4b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(DOCK.x-25,DOCK.y+25);ctx.lineTo(DOCK.x+25,DOCK.y+25);ctx.stroke();
}
function drawTarget(target){
  if(target.hit)return;
  const x=target.x,y=target.y,t=stage.time;
  disk(x+3,y+5,23,'#123b4099');
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*1.8+x*.02)*.065);
  for(let i=0;i<8;i++){
    ctx.save();ctx.rotate(i*Math.PI/4);rounded(-7,-24,14,22,6,target.gold?'#f9d87c':'#ff9e76','#204249',2);ctx.restore();
  }
  disk(0,0,18,target.gold?'#e6b64b':'#ee7558','#194249',3);
  disk(0,-2,12,target.gold?'#ffeb9a':'#ffbd88','#ffecbe',2);
  disk(0,1,5,'#214d53');
  ctx.strokeStyle='#1d4b51';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-5,14);ctx.lineTo(5,14);ctx.stroke();
  ctx.restore();
}
function drawBumper(b,index,active=false){
  const x=b.x,y=b.y,r=b.r;
  disk(x+4,y+6,r+5,'#173a40');
  disk(x,y,r+3,'#f2ae6b','#183e44',4);
  disk(x,y,r-2,active?'#f6cf84':'#e4745b','#fff1ba',3);
  disk(x-4,y-5,r*.47,'#ffcf97');
  disk(x+6,y+4,r*.19,'#c65548');
  ctx.strokeStyle='#285159';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(x,y,r-8,Math.PI*.1,Math.PI*.8);ctx.stroke();
  if(active){
    ctx.strokeStyle='#ffe6ae';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(x,y,r+12+Math.sin(stage.time*5)*2,0,Math.PI*2);ctx.stroke();
  }
}
function drawAim(){
  const b=stage.puck;
  const pulled=stage.drag?.kind==='sling';
  const dx=pulled?b.x-DOCK.x:Math.sin(stage.angle)*-70,dy=pulled?b.y-DOCK.y:70*Math.cos(stage.angle);
  if(pulled){
    const power=Math.min(1,magnitude(dx,dy)/116);
    ctx.lineCap='round';ctx.strokeStyle='#efc06a';ctx.lineWidth=5;
    for(const sx of [-19,19]){ctx.beginPath();ctx.moveTo(DOCK.x+sx,DOCK.y+15);ctx.lineTo(b.x+sx*.27,b.y+8);ctx.stroke();}
    ctx.strokeStyle='#173e45';ctx.lineWidth=2;
    for(const sx of [-19,19]){ctx.beginPath();ctx.moveTo(DOCK.x+sx,DOCK.y+15);ctx.lineTo(b.x+sx*.27,b.y+8);ctx.stroke();}
    const len=magnitude(dx,dy)||1,ux=-dx/len,uy=-dy/len;
    for(let k=1;k<=11;k++){
      const scale=(.35+k/11*.65);
      disk(b.x+ux*scale*(power*230+20),b.y+uy*scale*(power*230+20),2.2+k*.18,'#ffdfa0');
    }
  }else if(stage.mode==='ready'&&!stage.spring){
    const ux=Math.sin(stage.angle),uy=-Math.cos(stage.angle);
    for(let k=1;k<=7;k++)disk(DOCK.x+ux*k*24,DOCK.y+uy*k*24,3.7-k*.3,'#e0b76c88');
    ctx.fillStyle='#b2ba90';ctx.textAlign='center';ctx.font='900 10px system-ui';
    ctx.fillText('ПОТЯНИ ↓',180,555);
  }
}
function drawPuck(){
  const b=stage.puck,dragging=!!stage.drag;
  const velocity=magnitude(b.vx,b.vy);
  if(stage.mode==='flying'&&stage.trail.length){
    for(let i=0;i<stage.trail.length;i++){
      const t=stage.trail[i];ctx.globalAlpha=Math.min(.24,t.life*.6);
      disk(t.x,t.y,Math.max(2,8*t.life/.3),'#faab80');
    }
    ctx.globalAlpha=1;
  }
  if(stage.mode==='respawn')return;
  if(stage.mode==='transition')return;
  if(stage.mode==='flying'&&stage.catchLeft&&!reducedMotion.matches){
    ctx.strokeStyle='#fedc9b';ctx.lineWidth=2;ctx.globalAlpha=.55;
    ctx.beginPath();ctx.arc(b.x,b.y,24+Math.sin(stage.clock*8)*2,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  ctx.save();ctx.translate(b.x,b.y);
  const stretch=dragging?1.12:1+Math.min(velocity/800,.10);
  const a=velocity>70?Math.atan2(b.vy,b.vx):0;
  ctx.rotate(a*.17);ctx.scale(stretch,1/stretch);
  disk(3,5,19,'#11343b99');
  disk(0,0,20,'#ed674d','#143e44',4);
  ctx.beginPath();ctx.arc(-3,-5,12,Math.PI*1.15,Math.PI*1.78);ctx.strokeStyle='#ffc19a';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();
  ctx.fillStyle='#193e43';
  ctx.beginPath();ctx.ellipse(-7,-1,2.9,4.4,0,0,Math.PI*2);ctx.ellipse(7,-1,2.9,4.4,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(0,5,4,0,Math.PI);ctx.lineWidth=2;ctx.strokeStyle='#193e43';ctx.stroke();
  ctx.restore();
}
function draw(){
  if(canvas.width<=1||canvas.height<=1)resize();
  const sx=canvas.width/WORLD.width,sy=canvas.height/WORLD.height;
  ctx.setTransform(sx,0,0,sy,0,0);
  ctx.clearRect(0,0,WORLD.width,WORLD.height);
  ctx.save();
  if(!reducedMotion.matches&&stage.impulse>0){
    ctx.translate(Math.sin(stage.clock*80)*stage.impulse*3,Math.cos(stage.clock*68)*stage.impulse*2);
  }
  background();
  for(const t of stage.waveData.targets)drawTarget(t);
  stage.waveData.bumpers.forEach((b,i)=>drawBumper(b,i,false));
  if(stage.waveData.spinner)drawBumper(stage.waveData.spinner,0,true);
  if(stage.mode==='ready')drawAim();
  drawPuck();
  for(const p of stage.particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate((p.life*8)%6);rounded(-p.r/2,-p.r/2,p.r,p.r,1,p.color);ctx.restore();
  }ctx.globalAlpha=1;
  for(const p of stage.numbers){ctx.globalAlpha=clamp(p.life/.6,0,1);
    ctx.fillStyle='#193f44';ctx.font='1000 21px system-ui';ctx.textAlign='center';ctx.fillText(p.text,p.x+2,p.y+2);
    ctx.fillStyle=p.color;ctx.fillText(p.text,p.x,p.y);
  }ctx.globalAlpha=1;
  if(stage.mode==='transition'&&!reducedMotion.matches){
    ctx.globalAlpha=.08+Math.sin(stage.clock*15)*.04;ctx.fillStyle='#ffe9ad';ctx.fillRect(21,20,317,529);ctx.globalAlpha=1;
  }
  ctx.restore();
  publish();
}
function frame(now){
  raf=null;
  if(document.hidden)return;
  const delta=lastFrame?clamp((now-lastFrame)/1000,0,.055):0;
  lastFrame=now;accumulator=Math.min(.08,accumulator+delta);
  let steps=0;
  while(accumulator>=FIXED_STEP&&steps<8){update(FIXED_STEP);accumulator-=FIXED_STEP;steps++;}
  draw();
  raf=requestAnimationFrame(frame);
}
newRound();resize();raf=requestAnimationFrame(frame);

installMobileRuntime();
createWorkshopMode({appName:"БЗЫНЬ!",version:"1.0.0",cachePrefix:"bzyn-",storageNamespace:"pocket-works:bzyn",onReset(){location.reload()}});
