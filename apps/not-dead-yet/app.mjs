import {Apartment,ITEMS,HOME,hash} from './apartment.mjs';
import {Renderer} from './renderer.mjs';
import {createSoundscape} from './soundscape.mjs';
import {chapterJournal,chapterEnding} from './story.mjs';
const $=id=>document.getElementById(id),STORAGE='pocket-works:not-dead-yet:chapter-one:v2',OPTIONS='pocket-works:not-dead-yet:options';
const keys=new Set(),stick={x:0,y:0},quiet=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
let world,renderer,player,phase='menu',inventory=[],shadows=[],stress=0,elapsed=0,ammo=6,reserve=18,reloadTime=0,reloadDeadline=0,shotTime=0,stunTime=0,torch=true,energy=100,showHintUntil=0,spawnAt=8,saveAt=5,worldAt=0,lastFrame=performance.now(),moveCount=0,attemptCount=0,blockedCount=0,stepCount=0,joystickPointer=null,lookPointer=null,lastLook=null,sprintHeld=false,confirmSource='pause',screenNotice='',sound=true,runId=0;
try{sound=JSON.parse(localStorage.getItem(OPTIONS)||'{}').sound!==false}catch{}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const acoustics=createSoundscape();acoustics.setEnabled(sound);
function chirp(freq=280,secs=.09,vol=.018,form='sine'){if(sound)acoustics.tone(freq,secs,vol,form)}
function nextSeed(){runId++;const a=new Uint32Array(1);try{crypto.getRandomValues(a)}catch{a[0]=Date.now()>>>0}
 return hash(a[0],Math.floor(performance.now()*1000),Date.now(),runId)}
function readSave(){try{const o=JSON.parse(localStorage.getItem(STORAGE)||'null');if(!o||o.schema!==2||!Number.isFinite(o.seed)||!o.position||!Array.isArray(o.inventory)||!Number.isFinite(o.position.x)||!Number.isFinite(o.position.z))return null;return o}catch{return null}}
function persist(){if(phase!=='play'&&phase!=='paused'&&phase!=='inventory')return;try{localStorage.setItem(STORAGE,JSON.stringify({schema:2,seed:world.seed,world:world.save(),position:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch},stress,energy,inventory,ammo,reserve,elapsed,runId}))}catch{}}
function setup(seed,save=null){
 world=new Apartment(seed,save?.world);
 player={x:save?.position?.x??HOME.x,z:save?.position?.z??HOME.z,yaw:save?.position?.yaw??0,pitch:save?.position?.pitch??0,bob:0,movement:0,reduceMotion:quiet};
 if(!world.canStand(player.x,player.z)){player.x=HOME.x;player.z=HOME.z}
 stress=clamp(save?.stress??0,0,99);energy=clamp(save?.energy??100,0,100);
 ammo=clamp(save?.ammo??6,0,6);reserve=clamp(save?.reserve??18,0,40);
 inventory=(save?.inventory||[]).filter(id=>ITEMS.some(x=>x.id===id));
 elapsed=save?.elapsed??0;shadows=[];spawnAt=elapsed+7.5;worldAt=elapsed+1;saveAt=elapsed+5;reloadTime=0;reloadDeadline=0;shotTime=0;stunTime=0;
 torch=true;moveCount=0;attemptCount=0;blockedCount=0;stepCount=0;clearInputs();hud()
}
function overlay(id){for(const name of ['menu','pauseOverlay','inventoryOverlay','endOverlay','confirmOverlay']){const e=$(name);e.hidden=id!==name;e.classList.toggle('is-open',id===name)}}
function notice(message,seconds=2.6){screenNotice=message;showHintUntil=elapsed+seconds;$('hint').textContent=message;$('hint').classList.add('visible')}
function start(save=null){
 setup(save?.seed??nextSeed(),save);phase='play';overlay(null);hud();acoustics.activate();acoustics.event('radio');notice('Это твоя квартира. Вспомни, где лежат четыре вещи.',4);
 chirp(300,.20,.025,'triangle');persist();lastFrame=performance.now()
}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock?.()}
function clearStick(){joystickPointer=null;stick.x=0;stick.y=0;$('knob').style.transform='translate(0px,0px)'}
function clearInputs(){keys.clear();sprintHeld=false;lookPointer=null;lastLook=null;clearStick()}
function pause(){if(phase!=='play')return;phase='paused';clearInputs();releaseMouse();persist();acoustics.suspend();
 $('pauseText').textContent='Вещей: '+inventory.length+' / 4 · '+world.location(player.x,player.z)+' · '+Math.floor(elapsed/60)+' мин.';overlay('pauseOverlay');chirp(170,.12,.016)}
function resume(){if(phase!=='paused'&&phase!=='inventory')return;phase='play';overlay(null);acoustics.activate();lastFrame=performance.now()}
function showInventory(){if(phase!=='play')return;phase='inventory';clearInputs();releaseMouse();drawInventory();overlay('inventoryOverlay');persist()}
function drawInventory(){const list=$('inventoryList');list.replaceChildren();
 for(const item of ITEMS){const row=document.createElement('div');row.className='inventory-row'+(inventory.includes(item.id)?' found':'');
  const mark=document.createElement('span');mark.textContent=inventory.includes(item.id)?'●':'○';
  const detail=document.createElement('div'),name=document.createElement('strong'),desc=document.createElement('small');
  name.textContent=item.label;desc.textContent=inventory.includes(item.id)?item.note:'Ещё не найдено';
  detail.append(name,desc);row.append(mark,detail);list.append(row)}
 const journal=chapterJournal(inventory,world.recognizedCount(),world.radio.heard);
 const notes=$('journalList');notes.replaceChildren();
 for(const entry of journal.entries){
  const card=document.createElement('article'),title=document.createElement('strong'),body=document.createElement('p');
  card.className='memory-entry';title.textContent=entry.title;body.textContent=entry.body;
  card.append(title,body);notes.append(card)
 }
 $('journalStatus').textContent=journal.radio+' '+journal.memory;
 $('inventoryAdvice').textContent=journal.goal
}
function finish(won){
 if(phase!=='play')return;phase='end';clearInputs();releaseMouse();localStorage.removeItem(STORAGE);
 const ending=chapterEnding({won,inventory,recognized:world.recognizedCount(),heard:world.radio.heard,seconds:elapsed});
 $('endTag').textContent=ending.tag;$('endTitle').textContent=ending.title;$('endText').textContent=ending.text;
 overlay('endOverlay');acoustics.event(won?'win':'lose')
}
function nearItem(){
 let found=null,best=2;
 for(const item of ITEMS){if(inventory.includes(item.id))continue;const p=world.itemPosition(item.id),dist=Math.hypot(p.x-player.x,p.z-player.z);
  if(dist<best&&world.visible(player.x,player.z,p.x,p.z)){best=dist;found=p}}
 return found
}
function nearExit(){return Math.hypot(player.x-15.5,player.z-21)<2.25}
function nearFuse(){const p=world.fusePosition();return Math.hypot(player.x-p.x,player.z-p.z)<2.0?p:null}
function nearPlate(){const p=world.platePosition();return Math.hypot(player.x-p.x,player.z-p.z)<2.25&&world.visible(player.x,player.z,p.x,p.z)?p:null}
function nearRadio(){
 const pos=world.radioPosition();const d=Math.hypot(player.x-pos.x,player.z-pos.z);
 return d<2.25&&world.visible(player.x,player.z,pos.x,pos.z)?pos:null
}
function nearMemory(){
 let found=null,best=2.05;
 for(const r of world.rooms){const state=world.memoryState(r.type);if(!state?.active)continue;
  const p=world.memorySpot(r.type),d=Math.hypot(player.x-p.x,player.z-p.z);
  if(d<best&&world.visible(player.x,player.z,p.x,p.z)){best=d;found={...p,kind:state.kind,room:r.type}}
 }return found
}
function interact(){
 if(phase!=='play')return;
 const item=nearItem();
 if(item){inventory.push(item.id);stress=Math.max(0,stress-13);notice('Вспомнил: '+item.label+'. '+item.note,4.5);acoustics.event('pickup');persist();hud();return}
 const memory=nearMemory();
 if(memory){const result=world.recognize(memory.room);
  if(result.ok){stress=Math.max(0,stress-18);energy=Math.min(100,energy+7);
   acoustics.event('memory');
   notice(['Я помню эту комнату. Всё было иначе.','Знакомое место. Страх отступил.','Вот как здесь было раньше.'][hash(world.seed,world.epoch)%3],3.4);
   hud();persist();return
  }
 }
 if(nearExit()){if(inventory.length===4)finish(true);else notice('Ты уверен, что собрал все свои вещи?',2.3);return}
 if(nearPlate()&&!world.powerAvailable()){
  const result=world.unplugPlate();
  if(result.ok){notice('Электроплитка отключена. Теперь — щиток у входа.',4);acoustics.event('breaker');persist();hud()}
  else notice('Плитка уже выключена.',1.6);
  return
 }
 if(nearFuse()&&!world.powerAvailable()){
  const result=world.resetBreaker();
  if(result.ok){notice('Свет вернулся. Снова слышно холодильник.',4);stress=Math.max(0,stress-8);acoustics.event('power-return');persist();hud()}
  else{notice('Автомат снова выбило. Сначала выключи плитку на кухне.',4);acoustics.event('breaker')}
  return
 }
 if(nearRadio()){
  if(!world.powerAvailable()){notice('Приёмник без питания. Сначала верни электричество.',2.6);return}
  const result=world.tuneRadio(inventory.includes('album'));
  acoustics.event(result.sound,{intensity:1});
  if(result.newMemory){stress=Math.max(0,stress-16);world.nextShift+=13}
  notice(result.message,result.newMemory?5:3.3);
  persist();hud();return
 }
 const door=world.nearestDoor(player.x,player.z,2.2);
 if(door){const result=world.toggleDoor(door.room,player.x,player.z);
  if(result.ok){acoustics.event('door');notice(result.open?'Дверь открылась.':'Дверь закрылась.',1.6);persist()}
  else notice('Отойди от дверного полотна.',1.8);
  hud();return
 }
 notice('Здесь нечего взять.',1)
}
function toggleTorch(){if(phase!=='play')return;torch=!torch;notice(torch?'Фонарь включён.':'Фонарь выключен.',1);acoustics.event('torch');hud()}
function reload(){
 if(phase!=='play')return;
 if(reloadTime>0){notice('Руки ещё заняты перезарядкой.',.8);return}
 if(ammo===6||reserve===0){notice(reserve===0?'Запасных патронов больше нет.':'Барабан уже полон.',1);return}
 reloadTime=1.55;reloadDeadline=performance.now()+1550;notice('Перезаряжаю...',1.5);acoustics.event('reload')
}
function shoot(){
 if(phase!=='play')return;
 if(reloadTime>0){notice('Сначала перезарядить.',.8);return}
 if(ammo<=0){acoustics.event('empty');notice('Пустой барабан. R — перезарядить.',1.7);return}
 ammo--;shotTime=.17;stress=clamp(stress+1.6,0,100);acoustics.event('shot');if(navigator.vibrate)navigator.vibrate(40);
 let victim=null,best=15;
 for(const s of shadows){const dx=s.x-player.x,dz=s.z-player.z,dist=Math.hypot(dx,dz);
  const angle=Math.atan2(dx,-dz)-player.yaw,heading=Math.atan2(Math.sin(angle),Math.cos(angle));
  if(dist<best&&Math.abs(heading)<.16&&Math.abs(player.pitch)<.38&&world.visible(player.x,player.z,s.x,s.z)){best=dist;victim=s}}
 if(victim){shadows=shadows.filter(x=>x!==victim);stress=Math.max(0,stress-5);notice('Фигура рассыпалась. Там никого не было.',2.8);chirp(370,.22,.018,'triangle')}
 else notice('Эхо ударило в стены.',1.3);hud()
}
function makeShadow(){
 if(shadows.length>=3)return;
 const rooms=[...world.rooms].sort(()=>Math.random()-.5);
 for(const r of rooms){const p=world.point(r.type),d=Math.hypot(p.x-player.x,p.z-player.z);
  if(d<5||!world.canStand(p.x,p.z))continue;
  const dot=((p.x-player.x)*Math.sin(player.yaw)-(p.z-player.z)*Math.cos(player.yaw))/d;
  if(dot>.6&&world.visible(player.x,player.z,p.x,p.z))continue;
  shadows.push({x:p.x,z:p.z,age:0,speed:.45+Math.random()*.24,kind:Math.random()<.45?'coat':'figure',path:null,pathTime:0,hit:0});acoustics.event('sighting',{pan:Math.sign(p.x-player.x)*.5});return
 }
}
function simulate(dt){
 elapsed+=dt;world.updateDoors(dt);
 if(world.tickPower(elapsed,inventory.length)){
  acoustics.event('blackout');notice('Свет погас. Старую проводку снова выбило. Фонарь работает.',5);
  stress=Math.min(100,stress+5);hud();persist()
 }
 if(reloadTime>0){reloadTime=Math.max(0,(reloadDeadline-performance.now())/1000);if(reloadTime===0){const load=Math.min(6-ammo,reserve);ammo+=load;reserve-=load;chirp(310,.13,.023);hud()}}
 shotTime=Math.max(0,shotTime-dt);stunTime=Math.max(0,stunTime-dt);
 let forward=(Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')))+stick.y;
 let side=(Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')))+stick.x;
 const amount=Math.hypot(forward,side);if(amount>1){forward/=amount;side/=amount}
 const running=(sprintHeld||keys.has('shift'))&&energy>4&&amount>.04,velocity=running?3.25:1.85;
 energy=clamp(energy+(running?-16:9)*dt,0,100);
 const dx=(Math.sin(player.yaw)*forward+Math.cos(player.yaw)*side)*velocity*dt;
 const dz=(-Math.cos(player.yaw)*forward+Math.sin(player.yaw)*side)*velocity*dt;
 if(amount>.03){
  attemptCount++;const x=player.x,z=player.z;
  // Sliding independent axes prevents a door-frame corner from locking both directions.
  const slices=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.14));
  for(let i=0;i<slices;i++){
   const sx=dx/slices,sz=dz/slices;
   if(world.canStand(player.x+sx,player.z))player.x+=sx;
   if(world.canStand(player.x,player.z+sz))player.z+=sz;
  }
  const moved=Math.hypot(player.x-x,player.z-z);if(moved>.0001){moveCount++;stepCount+=moved}else{blockedCount++;if(blockedCount%120===0)notice('Здесь стена. Попробуй повернуться.',1.4)}
  if(stepCount>.95){stepCount=0;acoustics.event('footstep',{room:world.location(player.x,player.z),intensity:running?1.3:1})}
 }
 player.movement=Math.min(1,amount);player.bob=quiet?0:Math.sin(elapsed*(running?13:8))*Math.min(.025,amount*.019);
 if(elapsed>worldAt){worldAt=elapsed+.42;const changed=world.tick(player.x,player.z,player.yaw,elapsed);if(changed){
   acoustics.event('shift',{pan:.55});
   const wrong=world.memoryState(world.lastChange?.type);
   notice(wrong?.active?'Ты же помнил, где стоит эта мебель.':'Что-то переместилось в соседней комнате.',2.4)
  }}
 if(elapsed>=spawnAt){makeShadow();spawnAt=elapsed+10+Math.random()*5}
 for(const e of shadows){
  e.age+=dt;e.pathTime-=dt;
  if(e.pathTime<0){e.pathTime=.8;e.path=world.findStep(e.x,e.z,player.x,player.z)}
  if(e.kind==='figure'&&e.path){const vx=e.path.x-e.x,vz=e.path.z-e.z,l=Math.hypot(vx,vz);if(l>.08){
   const step=Math.min(l,e.speed*dt),nx=e.x+vx/l*step,nz=e.z+vz/l*step;
   if(world.canStand(nx,nz,.09)){e.x=nx;e.z=nz}}}
  const d=Math.hypot(e.x-player.x,e.z-player.z);
  if(d<1.35){stress=clamp(stress+(e.kind==='coat'?8:18)*dt,0,100);if(elapsed>showHintUntil)notice('Только не смотри на него.',1)}
  if(d<12&&torch&&world.visible(player.x,player.z,e.x,e.z)){
   const angle=Math.atan2(e.x-player.x,-(e.z-player.z))-player.yaw;
   if(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))<.33){e.hit+=dt;if(e.hit>1.25){e.age=100;notice('Это всего лишь тень.',1.7);stress=Math.max(0,stress-5)}}
  }
 }
 shadows=shadows.filter(e=>e.age<30&&world.canStand(e.x,e.z,.07));
 stress=clamp(stress-(shadows.length===0?.75:.15)*dt+(!world.powerAvailable()&&!torch?.45:0)*dt,0,100);
 if(stress>=100){finish(false);return}
 acoustics.tick({elapsed,room:world.location(player.x,player.z),stress,active:phase==='play',powered:world.powerAvailable()});
 if(elapsed>=saveAt){saveAt=elapsed+5;persist()}
 if(showHintUntil&&elapsed>=showHintUntil){showHintUntil=0;$('hint').classList.remove('visible')}
 hud()
}
function hud(){
 if(!world||!player)return;
 $('sector').textContent='КВАРТИРА №17 / '+world.location(player.x,player.z);
 $('count').textContent=inventory.length+' / 4';$('packCount').textContent=inventory.length;
 $('ammo').textContent=ammo+' / '+reserve;$('lifeFill').style.width=(100-stress)+'%';
 $('objective').textContent=!world.powerAvailable()?world.powerObjective():inventory.length===4?'Вернуться к входной двери':'Найти четыре знакомые вещи';
 $('perception').style.opacity=String(clamp(.08+stress/170,0,.7));
 $('reload').textContent=reloadTime>0?'…':'↻';$('torch').textContent='Свет: '+(torch?'вкл':'выкл');
 const item=nearItem(),memory=!item?nearMemory():null,exit=nearExit();
 const radio=!item&&!memory&&!exit?nearRadio():null;
 const plate=!item&&!memory&&!exit&&!radio&&!world.powerAvailable()?nearPlate():null;
 const fuse=!item&&!memory&&!exit&&!radio&&!plate&&!world.powerAvailable()?nearFuse():null;
 const door=!item&&!memory&&!exit&&!radio&&!plate&&!fuse?world.nearestDoor(player.x,player.z,2.2):null;
 $('aimHint').textContent=item?'E / ВЗЯТЬ — '+item.label:memory?'E / ВСПОМНИТЬ — '+world.location(memory.x,memory.z):radio?'E / '+(world.powerAvailable()?'НАСТРОИТЬ ПРИЁМНИК':'ПРИЁМНИК БЕЗ СВЕТА'):plate?'E / ОТКЛЮЧИТЬ ПЛИТКУ':fuse?'E / ВКЛЮЧИТЬ АВТОМАТ':exit?(inventory.length===4?'E / ОТКРЫТЬ ДВЕРЬ':'Дверь заперта'):door?'E / '+(door.open?'ЗАКРЫТЬ':'ОТКРЫТЬ')+' — '+world.location(world.point(door.room).x,world.point(door.room).z):'';
 $('interact').textContent=item?'Взять':memory?'Вспомнить':radio?'Настроить':plate?'Выключить':fuse?'Включить':door?(door.open?'Закрыть':'Открыть'):exit?'Открыть':'Взять';
 $('interact').classList.toggle('ready',Boolean(item||memory||(radio&&world.powerAvailable())||plate||fuse||exit||door));
}
function paint(t){
 const dt=Math.min(.20,Math.max(0,(t-lastFrame)/1000));lastFrame=t;
 if(phase==='play')simulate(dt);
 if(world&&renderer&&!renderer.lost){const items=ITEMS.filter(i=>!inventory.includes(i.id)).map(i=>world.itemPosition(i.id));renderer.draw(world,player,shadows,items,torch,elapsed,stress/100,shotTime/.17,reloadTime>0?1-reloadTime/1.55:0)}
 window.__PW_TEST_STATE__={phase,seed:world?.seed,variant:world?.fingerprint?.(),position:player?{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch}:null,health:100-stress,inventory:[...inventory],ammo,elapsed,rearrangements:world?.changes||0,attempts:attemptCount,moves:moveCount,blocked:blockedCount,renderer3D:!!renderer&&!renderer.lost,textureBytes:renderer?.textureBytes||0,soundEnabled:sound,weaponAnimated:true,memoryTraces:world?.rooms.map(r=>world.memoryState(r.type)),radio:world?.radio?{...world.radio}:null,recognized:world?.recognizedCount(),layoutVersion:world?.layoutVersion,doors:world?.doors().map(d=>({room:d.type,open:d.open,angle:d.angle,gate:d.gate})),sovietInterior:true,power:world?.power?{...world.power}:null,powerAvailable:world?.powerAvailable()};
 requestAnimationFrame(paint)
}
function moveStick(e){const b=$('joystick').getBoundingClientRect(),x=e.clientX-b.left-b.width*.5,y=e.clientY-b.top-b.height*.5,rad=b.width*.38,d=Math.max(.01,Math.hypot(x,y)),scale=Math.min(1,rad/d);stick.x=x*scale/rad;stick.y=-y*scale/rad;$('knob').style.transform='translate('+(x*scale)+'px,'+(y*scale)+'px)'}
const joy=$('joystick');
joy.addEventListener('pointerdown',e=>{if(phase!=='play')return;e.preventDefault();joystickPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e)});
joy.addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)moveStick(e)});
for(const kind of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(kind,e=>{if(joystickPointer===e.pointerId)clearStick()});
const look=$('touchLook');
const turn=(dx,dy)=>{if(phase!=='play')return;player.yaw+=dx*.004;player.pitch=clamp(player.pitch+dy*.004,-1.14,1.14)};
look.addEventListener('pointerdown',e=>{if(phase!=='play')return;e.preventDefault();lookPointer=e.pointerId;lastLook=[e.clientX,e.clientY];look.setPointerCapture(e.pointerId)});
look.addEventListener('pointermove',e=>{if(lookPointer!==e.pointerId||!lastLook)return;turn(e.clientX-lastLook[0],e.clientY-lastLook[1]);lastLook=[e.clientX,e.clientY]});
for(const kind of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(kind,e=>{if(lookPointer===e.pointerId){lookPointer=null;lastLook=null}});
document.addEventListener('mousemove',e=>{if(phase==='play'&&document.pointerLockElement===$('view')){player.yaw+=e.movementX*.0024;player.pitch=clamp(player.pitch+e.movementY*.0024,-1.14,1.14)}});
$('view').addEventListener('click',e=>{if(phase!=='play')return;if(document.pointerLockElement===$('view'))shoot();else if(e.pointerType!=='touch'&&window.matchMedia?.('(pointer:fine)')?.matches)$('view').requestPointerLock?.().catch(()=>{})});
document.addEventListener('mousedown',e=>{if(phase==='play'&&document.pointerLockElement===$('view')&&e.button===0)e.preventDefault()});
document.addEventListener('keydown',e=>{
 const key=e.key.toLowerCase();
 if(['w','a','s','d','shift','arrowup','arrowdown','arrowleft','arrowright',' ','e','f','i','r'].includes(key))e.preventDefault();
 if(key==='escape'){if(phase==='play')pause();else if(phase==='paused')resume();else if(phase==='inventory')resume();return}
 if(phase==='play'&&!e.repeat){if(key==='e')interact();if(key==='r')reload();if(key==='f')toggleTorch();if(key==='i')showInventory();if(key===' ')shoot()}
 keys.add(key)
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();clearStick();sprintHeld=false});
const run=$('run');run.addEventListener('pointerdown',e=>{if(phase!=='play')return;e.preventDefault();sprintHeld=true;run.setPointerCapture(e.pointerId);run.classList.add('held')});
for(const ev of ['pointercancel','pointerup','lostpointercapture'])run.addEventListener(ev,()=>{sprintHeld=false;run.classList.remove('held')});
$('torch').addEventListener('click',toggleTorch);$('fire').addEventListener('click',shoot);$('interact').addEventListener('click',interact);$('reload').addEventListener('click',reload);$('pack').addEventListener('click',showInventory);
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',resume);$('closePack').addEventListener('click',resume);
$('continue').addEventListener('click',()=>{const save=readSave();if(save)start(save)});
$('start').addEventListener('click',()=>{if(readSave()){confirmSource='menu';overlay('confirmOverlay')}else start()});
$('new').addEventListener('click',()=>{confirmSource='pause';overlay('confirmOverlay')});
$('cancel').addEventListener('click',()=>overlay(confirmSource==='menu'?'menu':'pauseOverlay'));
$('erase').addEventListener('click',()=>{localStorage.removeItem(STORAGE);start()});
$('again').addEventListener('click',()=>start());
function toggleSound(){sound=!sound;acoustics.setEnabled(sound);const label='Звук: '+(sound?'вкл':'выкл');$('sound').textContent=label;$('pauseSound').textContent=label;try{localStorage.setItem(OPTIONS,JSON.stringify({sound}))}catch{}}
$('sound').addEventListener('click',toggleSound);$('pauseSound').addEventListener('click',toggleSound);
$('sound').textContent='Звук: '+(sound?'вкл':'выкл');$('pauseSound').textContent=$('sound').textContent;
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
window.addEventListener('pagehide',()=>{persist();acoustics.dispose()});
try{
 renderer=new Renderer($('view'));setup(nextSeed());phase='menu';overlay('menu');$('continue').hidden=!readSave();
 if(new URLSearchParams(window.location?.search||'').get('qa')==='1'){
  window.__PW_TEST_HOOKS__={
   teleportNearPower(kind){
    if(phase!=='play')return false;
    const p=kind==='fuse'?world.fusePosition():world.platePosition();
    const candidates=kind==='fuse'?[[.2,0],[.2,.35],[.3,-.35],[.4,.5]]:[[0,1.35],[0,-1.35],[1.45,0],[-1.45,0],[0,1.65],[0,-1.65]];
    for(const [dx,dz] of candidates){let x=p.x+dx,z=p.z+dz;
     if(world.canStand(x,z)&&Math.hypot(x-p.x,z-p.z)<2.1&&(kind==='fuse'||world.visible(x,z,p.x,p.z))){player.x=x;player.z=z;hud();return true}
    }return false
   },
   triggerBlackout(){
    if(phase!=='play')return false;
    const worked=world.tickPower(Math.max(80,elapsed),inventory.length);hud();return worked
   },
   teleportNearRadio(){
    if(phase!=='play')return false;
    const pos=world.radioPosition();
    // The table itself has a collision footprint, so stand next to the front edge.
    const candidates=[[0,1.25],[0,-1.25],[1.45,0],[-1.45,0],[0,1.65],[0,-1.65]];
    for(const [dx,dz] of candidates){const x=pos.x+dx,z=pos.z+dz;
     if(world.canStand(x,z)&&world.visible(x,z,pos.x,pos.z)){player.x=x;player.z=z;hud();return true}
    }return false
   },
   teleportNearMemory(type){
    if(phase!=='play')return false;
    const spot=world.memorySpot(type);if(!spot)return false;
    if(!world.canStand(spot.x,spot.z))return false;
    player.x=spot.x;player.z=spot.z;hud();return true
   },
   triggerUnseenShift(type){
    if(phase!=='play')return false;const r=world.room(type);if(!r)return false;
    const time=elapsed+30;
    player.yaw=r.z0<11?Math.PI:0;
    for(const other of world.rooms)if(other!==r)other.lastChanged=time;
    r.lastSeen=-30;r.lastChanged=-30;world.nextShift=time;
    const worked=world.tick(player.x,player.z,player.yaw,time);
    hud();return Boolean(worked&&world.lastChange?.type===type)
   },
   teleportNearDoor(type){
    if(phase!=='play')return false;
    const door=world.doors().find(d=>d.type===type);if(!door)return false;
    const x=door.gate.x+.5,z=door.gate.z+.5-door.insideSign*1.05;
    if(!world.canStand(x,z))return false;
    player.x=x;player.z=z;hud();return true
   }
  }
 }
 $('view').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('fatal').hidden=false});
 requestAnimationFrame(paint)
}catch(e){console.error('NOT DEAD YET error',e);$('fatal').hidden=false}
