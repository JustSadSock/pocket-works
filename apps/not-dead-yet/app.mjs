import {World,SIZE} from './world.mjs';
import {Renderer} from './renderer.mjs';
const $=id=>document.getElementById(id),STORE='pocket-works:not-dead-yet:run-v1',OPT='pocket-works:not-dead-yet:options';
const goals=[{cx:1,cy:0},{cx:0,cy:-1},{cx:-1,cy:1}].map((a,i)=>({...a,id:i,x:a.cx*SIZE+SIZE/2+.5,z:a.cy*SIZE+SIZE/2+.5}));
const home={home:true,x:SIZE/2+.5,z:SIZE/2+.5};
let renderer,world,player,enemies=[],collected=new Set(),phase='menu',elapsed=0,health=100,spawnAt=7,simTick=0,autosaveAt=0,hintUntil=0,lookId=null,joyId=null,heldSprint=false,torchOn=true,prevFrame=performance.now(),steps=0,confirmBack='paused';
let audio=null;const keys=new Set(),motion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
let soundOn=true;try{soundOn=JSON.parse(localStorage.getItem(OPT)||'{}').sound!==false}catch{}
function tone(freq,duration=.12,kind='sine',vol=.04){if(!soundOn)return;try{audio ||=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type=kind;osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(25,freq*.55),audio.currentTime+duration);gain.gain.setValueAtTime(vol,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration)}catch{}}
function safeRead(){try{const s=JSON.parse(localStorage.getItem(STORE)||'null');if(!s||!Number.isFinite(s.seed)||!Number.isFinite(s.player?.x)||!Number.isFinite(s.player?.z)||!(s.health>0)||!Array.isArray(s.collected))return null;return s}catch{return null}}
function save(){if(phase!=='play'&&phase!=='paused')return;try{localStorage.setItem(STORE,JSON.stringify({seed:world.seed,epochs:world.serialize(),player:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch},health,elapsed,collected:[...collected]}))}catch{}}
function reset(seed,old=null){
 world=new World(seed,old?.epochs||[]);world.tick(old?.player?.x??home.x,old?.player?.z??home.z,0);
 const pp=old?.player;
 player={x:pp?.x??home.x,z:pp?.z??home.z,yaw:pp?.yaw??0,pitch:pp?.pitch??0,bob:0};
 if(!world.canStand(player.x,player.z)){player.x=home.x;player.z=home.z}
 health=old?.health??100;elapsed=old?.elapsed??0;collected=new Set((old?.collected||[]).filter(n=>Number.isInteger(n)&&n>=0&&n<3));
 enemies=[];spawnAt=elapsed+7;simTick=elapsed;autosaveAt=elapsed+5;torchOn=true;steps=0;updateHUD();
}
function overlay(name){for(const id of ['menu','pauseOverlay','endOverlay','confirmOverlay']){const el=$(id);if(id===name){el.hidden=false;el.classList.add('is-open')}else{el.hidden=true;el.classList.remove('is-open')}}}
function start(old=null){
 reset(old?.seed??(Date.now()>>>0),old);
 phase='play';overlay('');keys.clear();say('Три сигнала. Найди их и вернись к началу.',3.4);tone(330,.24,'triangle');
 requestLock();save();
}
function requestLock(){if(window.matchMedia('(pointer:fine)').matches&&document.pointerLockElement!==$('view'))$('view').requestPointerLock?.().catch(()=>{})}
function releaseLock(){if(document.pointerLockElement)document.exitPointerLock?.()}
function pause(){if(phase!=='play')return;phase='paused';save();releaseLock();keys.clear();heldSprint=false;clearJoystick();$('pauseText').textContent='Найдено '+collected.size+' из 3 сигналов. Время: '+Math.floor(elapsed/60)+' мин '+Math.floor(elapsed%60)+' с.';overlay('pauseOverlay');tone(205,.11,'triangle')}
function resume(){if(phase!=='paused')return;phase='play';overlay('');keys.clear();requestLock();prevFrame=performance.now()}
function finish(win){if(phase!=='play')return;phase='end';releaseLock();keys.clear();heldSprint=false;clearJoystick();localStorage.removeItem(STORE);$('endTag').textContent=win?'ЭКСПЕРИМЕНТ ЗАВЕРШЁН':'СВЯЗЬ ПОТЕРЯНА';$('endTitle').textContent=win?'Ты помнишь выход.':'Ты остался здесь.';$('endText').textContent=win?'Ты вынес три сигнала из лабиринта за '+Math.round(elapsed)+' секунд. Стены больше не удерживают тебя.':'Лабиринт забрал последнее воспоминание. Собрано сигналов: '+collected.size+'/3.';overlay('endOverlay');tone(win?620:91,.48,'sawtooth',.028)}
function say(s,seconds=2){$('hint').textContent=s;$('hint').classList.add('visible');hintUntil=elapsed+seconds}
function updateHUD(){
 $('count').textContent=collected.size+' / 3';
 $('sector').textContent='СЕКТОР '+Math.floor(player.x/SIZE)+' / '+Math.floor(player.z/SIZE);
 $('lifeFill').style.width=Math.max(0,health)+'%';
 $('lifeFill').style.background=health<30?'#c15753':'#d9b58a';
 $('torch').classList.toggle('off',!torchOn);
 const targets=goals.filter(g=>!collected.has(g.id));const target=targets.length?targets.reduce((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)<Math.hypot(b.x-player.x,b.z-player.z)?a:b):home;
 const angle=Math.atan2(target.x-player.x,-(target.z-player.z))-player.yaw;
 $('needle').style.transform='rotate('+angle+'rad)';
 $('distance').textContent=Math.round(2*Math.hypot(target.x-player.x,target.z-player.z))+' м';
}
function attemptSpawn(){
 if(enemies.filter(e=>e.real).length>=2&&enemies.length>=4)return;
 const facing=[Math.sin(player.yaw),-Math.cos(player.y)];
 for(let n=0;n<32;n++){
  const a=Math.random()*Math.PI*2,d=7+Math.random()*6,x=Math.floor(player.x+Math.cos(a)*d)+.5,z=Math.floor(player.z+Math.sin(a)*d)+.5;
  if(!world.canStand(x,z))continue;
  const dx=x-player.x,dz=z-player.z;
  if((dx*facing[0]+dz*facing[1])/Math.hypot(dx,dz)>.55&&world.visible(player.x,player.z,x,z))continue;
  const real=Math.random()>.7;enemies.push({x,z,real,age:0,pathClock:0,path:null,stun:0,exposure:0,attack:0});return;
 }
}
function follow(e,dt){
 e.pathClock-=dt;if(e.pathClock<=0){e.pathClock=.55+Math.random()*.25;e.path=world.findStep(e.x,e.z,player.x,player.z,920)}
 if(e.path&&e.stun<=0){
  const dx=e.path.x-e.x,dz=e.path.z-e.z,d=Math.hypot(dx,dz),speed=1.05;
  if(d>.07){const step=Math.min(d,dt*speed),nx=e.x+step*dx/d,nz=e.z+step*dz/d;if(world.canStand(nx,nz,.09)){e.x=nx;e.z=nz}else{e.path=null;e.pathClock=0}}
 }
}
function simulate(dt){
 elapsed+=dt;let f=0,s=0;
 if(keys.has('w')||keys.has('arrowup'))f+=1;if(keys.has('s')||keys.has('arrowdown'))f-=1;
 if(keys.has('a')||keys.has('arrowleft'))s-=1;if(keys.has('d')||keys.has('arrowright'))s+=1;
 f+=stick.y;s+=stick.x;const norm=Math.max(1,Math.hypot(f,s));f/=norm;s/=norm;
 const moving=Math.hypot(f,s)>.025,sprint=heldSprint||keys.has('shift'),speed=sprint?4.35:2.65;
 const dx=(Math.sin(player.yaw)*f+Math.cos(player.yaw)*s)*speed*dt;
 const dz=(-Math.cos(player.yaw)*f+Math.sin(player.yaw)*s)*speed*dt;
 if(world.canStand(player.x+dx,player.z)){player.x+=dx;steps+=Math.abs(dx)}
 if(world.canStand(player.x,player.z+dz)){player.z+=dz;steps+=Math.abs(dz)}
 player.bob=moving&&!motion?Math.sin(elapsed*(sprint?15:10))*.035:0;
 if(moving&&steps>4.4){steps=0;tone(sprint?85:110,.035,'triangle',.006)}
 if(elapsed-simTick>=.85){simTick=elapsed;world.tick(player.x,player.z,elapsed);for(const e of enemies)if(!world.canStand(e.x,e.z,.09))e.age=100}
 for(const g of goals)if(!collected.has(g.id)&&Math.hypot(g.x-player.x,g.z-player.z)<.95){collected.add(g.id);say('СИГНАЛ ВОССТАНОВЛЕН · '+collected.size+' / 3',3);tone(550+collected.size*120,.36,'sine',.065);save()}
 if(collected.size===3&&Math.hypot(player.x-home.x,player.z-home.z)<1.2){finish(true);return}
 if(elapsed>=spawnAt){attemptSpawn();spawnAt=elapsed+5.4+Math.random()*3.5}
 const forward=[Math.sin(player.yaw),-Math.cos(player.yaw)];
 for(const e of enemies){
  e.age+=dt;e.attack-=dt;e.stun=Math.max(0,e.stun-dt);
  const d=Math.hypot(e.x-player.x,e.z-player.z);
  const dot=((e.x-player.x)*forward[0]+(e.z-player.z)*forward[1])/Math.max(.01,d);
  const seen=d<12&&world.visible(player.x,player.z,e.x,e.z)&&dot>.83&&torchOn&&Math.abs(player.pitch)<.6;
  if(seen){if(!e.real){e.age=100;tone(420,.09,'sine',.013);continue}e.exposure+=dt;if(e.exposure>1.1){e.stun=2.1;e.exposure=0;tone(175,.10,'triangle',.01)}}
  else e.exposure=Math.max(0,e.exposure-dt*.8);
  if(!e.real){if(e.age>5)e.age=100;continue}
  if(d<30)follow(e,dt);
  if(d<.9&&e.attack<=0){health=Math.max(0,health-24);e.attack=1.1;orientationPulse();tone(63,.3,'sawtooth',.045);say('ОНО НАСТОЯЩЕЕ. БЕГИ.',1.6);if(health===0){finish(false);return}}
 }
 enemies=enemies.filter(e=>e.age<50&&Math.hypot(e.x-player.x,e.z-player.z)<55);
 if(elapsed>=autosaveAt){autosaveAt=elapsed+5;save()}
 if(hintUntil&&elapsed>=hintUntil){$('hint').classList.remove('visible');hintUntil=0}
 updateHUD()
}
function orientationPulse(){if(navigator.vibrate)navigator.vibrate(40)}
function paint(t){const dt=Math.min(.05,Math.max(0,(t-prevFrame)/1000));prevFrame=t;
 if(phase==='play')simulate(dt);
 if(world&&renderer&&!renderer.lost){const anchors=goals.filter(g=>!collected.has(g.id));anchors.push(home);renderer.draw(world,player,enemies,anchors,torchOn,elapsed)}
 window.__PW_TEST_STATE__={phase,seed:world?.seed??0,position:player?{x:player.x,z:player.z,yaw:player.yaw}:null,health,collected:collected.size,alive:phase==='play',chunkCount:world?.chunks.size||0,regenerations:world?.changes||0,enemies:enemies.length,renderer3D:!!renderer&&!renderer.lost};
 requestAnimationFrame(paint)}
const stick={x:0,y:0};
function clearJoystick(){joyId=null;stick.x=stick.y=0;$('knob').style.transform='translate(0px,0px)'}
const joy=$('joystick');
function handleStick(e){const rect=joy.getBoundingClientRect(),ox=e.clientX-(rect.left+rect.width/2),oy=e.clientY-(rect.top+rect.height/2),radius=rect.width*.39,d=Math.hypot(ox,oy)||1,fac=Math.min(1,radius/d);const px=ox*fac,py=oy*fac;stick.x=px/radius;stick.y=-py/radius;$('knob').style.transform='translate('+px+'px,'+py+'px)'}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyId=e.pointerId;joy.setPointerCapture(e.pointerId);handleStick(e)});
joy.addEventListener('pointermove',e=>{if(joyId===e.pointerId)handleStick(e)});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,e=>{if(joyId===e.pointerId)clearJoystick()});
let lastLook=null;const look=$('touchLook');
look.addEventListener('pointerdown',e=>{if(phase!=='play')return;lookId=e.pointerId;lastLook=[e.clientX,e.clientY];look.setPointerCapture(e.pointerId)});
look.addEventListener('pointermove',e=>{if(lookId!==e.pointerId||phase!=='play'||!lastLook)return;player.yaw+=(e.clientX-lastLook[0])*.004;player.pitch=Math.max(-.9,Math.min(.9,player.pitch+(e.clientY-lastLook[1])*.004));lastLook=[e.clientX,e.clientY]});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(ev,e=>{if(lookId===e.pointerId){lookId=null;lastLook=null}});
document.addEventListener('mousemove',e=>{if(phase==='play'&&document.pointerLockElement===$('view')){player.yaw+=e.movementX*.0023;player.pitch=Math.max(-.92,Math.min(.92,player.pitch+e.movementY*.0023))}});
$('view').addEventListener('click',()=>{if(phase==='play')requestLock()});
document.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();if(['w','a','s','d','shift','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
 if(k==='escape'){if(phase==='play')pause();else if(phase==='paused')resume();return}
 if(k==='f'&&phase==='play'&&!e.repeat){torchOn=!torchOn;tone(torchOn?390:160,.1);updateHUD()}
 if(k==='m'&&!e.repeat)toggleSound();
 keys.add(k);
});document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
const run=$('run');run.addEventListener('pointerdown',e=>{e.preventDefault();heldSprint=true;run.classList.add('held');run.setPointerCapture(e.pointerId)});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])run.addEventListener(ev,()=>{heldSprint=false;run.classList.remove('held')});
$('torch').addEventListener('click',()=>{if(phase!=='play')return;torchOn=!torchOn;updateHUD();tone(torchOn?390:150,.08)});
function toggleSound(){soundOn=!soundOn;try{localStorage.setItem(OPT,JSON.stringify({sound:soundOn}))}catch{}$('sound').textContent='Звук: '+(soundOn?'вкл':'выкл')}
$('pause').addEventListener('click',pause);
$('start').addEventListener('click',()=>{if(safeRead()){confirmBack='menu';overlay('confirmOverlay')}else start()});
$('continue').addEventListener('click',()=>{const s=safeRead();if(s)start(s)});
$('resume').addEventListener('click',resume);
$('new').addEventListener('click',()=>{confirmBack='paused';overlay('confirmOverlay')});
$('cancel').addEventListener('click',()=>{overlay(confirmBack==='menu'?'menu':'pauseOverlay')});
$('erase').addEventListener('click',()=>{localStorage.removeItem(STORE);start()});
$('again').addEventListener('click',()=>start());
$('sound').addEventListener('click',toggleSound);$('sound').textContent='Звук: '+(soundOn?'вкл':'выкл');
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
window.addEventListener('pagehide',save);
document.addEventListener('pointerlockchange',()=>{if(phase==='play'&&document.pointerLockElement!==$('view')&&window.matchMedia('(pointer:fine)').matches)pause()});
try{
 renderer=new Renderer($('view'));reset((Date.now()>>>0));phase='menu';overlay('menu');$('continue').hidden=!safeRead();
 window.addEventListener('webglcontextlost',()=>{pause();$('fatal').hidden=false});
 requestAnimationFrame(paint)
}catch(e){console.error('NOT DEAD YET boot failed',e);$('fatal').hidden=false}
