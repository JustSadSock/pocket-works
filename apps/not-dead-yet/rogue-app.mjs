import {RogueWorld,SECTOR,hash,UPGRADES,REWARDS} from './rogue-world.mjs';
import {Renderer} from './renderer.mjs';
import {createSoundscape} from './soundscape.mjs';
import {acousticEvent,updatePresence,shouldDespawn,presenceCue} from './presences.mjs';

const $=id=>document.getElementById(id),STORAGE='pocket-works:not-dead-yet:rogue:v1',BEST='pocket-works:not-dead-yet:rogue:best',OPTIONS='pocket-works:not-dead-yet:options';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),keys=new Set(),stick={x:0,y:0};
const quiet=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false;
let world,renderer,player,phase='menu',stress=0,energy=100,ammo=6,reserve=18,elapsed=0,shotTime=0,reloadTime=0,reloadAt=0;
let torch=true,enemies=[],upgrades={},collected=0,kills=0,sectorBest=0,spawnAt=4,saveAt=6,worldAt=0,noise=null;
let lastFrame=performance.now(),moveSteps=0,moves=0,attempts=0,blocked=0,joystickPointer=null,lookPointer=null,lastLook=null,sprintHeld=false,sound=true,noticeUntil=0,upgradeChoices=[];
const audio=createSoundscape();
try{sound=JSON.parse(localStorage.getItem(OPTIONS)||'{}').sound!==false}catch{}
audio.setEnabled(sound);
function maxStress(){return 100+(upgrades.tea||0)*20}
function maxReserve(){return 24+(upgrades.pockets||0)*12}
function limitAmmo(){ammo=clamp(ammo,0,6);reserve=clamp(reserve,0,maxReserve())}
function newSeed(){const bits=new Uint32Array(1);try{crypto.getRandomValues(bits)}catch{bits[0]=Date.now()>>>0}return hash(bits[0],Date.now(),Math.floor(performance.now()*1000))}
function readSave(){try{const s=JSON.parse(localStorage.getItem(STORAGE)||'null');return s?.schema===1&&Number.isFinite(s.seed)&&Number.isFinite(s.position?.x)&&Number.isFinite(s.position?.z)&&Number.isFinite(s.stress)?s:null}catch{return null}}
function persist(){if(!['play','pause','inventory','upgrade'].includes(phase))return;try{
 localStorage.setItem(STORAGE,JSON.stringify({schema:1,seed:world.seed,position:{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch},world:world.save(),
  stress,energy,ammo,reserve,elapsed,upgrades,collected,kills,choices:upgradeChoices,phase:phase==='upgrade'?'upgrade':'play'}))
}catch{}}
function setup(seed,data=null){
 world=new RogueWorld(seed,data?.world);
 player={x:data?.position?.x??9.5,z:data?.position?.z??9.5,yaw:data?.position?.yaw??0,pitch:data?.position?.pitch??0,bob:0,movement:0,reduceMotion:quiet,sight:0};
 if(!world.canStand(player.x,player.z)){player.x=9.5;player.z=9.5}
 upgrades={...(data?.upgrades||{})};player.sight=upgrades.glasses||0;
 stress=clamp(data?.stress??0,0,maxStress()-1);energy=clamp(data?.energy??100,0,100);
 ammo=data?.ammo??6;reserve=data?.reserve??18;limitAmmo();
 elapsed=data?.elapsed??0;collected=data?.collected??0;kills=data?.kills??0;
 upgradeChoices=Array.isArray(data?.choices)?data.choices.filter(id=>UPGRADES.some(u=>u.id===id)):[];enemies=[];noise=null;
 spawnAt=elapsed+5;worldAt=elapsed+.4;saveAt=elapsed+6;reloadAt=0;reloadTime=0;shotTime=0;moveSteps=0;moves=0;attempts=0;blocked=0;
 clearInputs();showHud()
}
function overlay(id){for(const n of ['menu','pauseOverlay','inventoryOverlay','endOverlay','confirmOverlay','upgradeOverlay']){
 const el=$(n);if(!el)continue;el.hidden=n!==id;el.classList.toggle('is-open',n===id)}}
function notify(msg,duration=2.6){const h=$('hint');if(!h)return;h.textContent=msg;h.classList.add('visible');noticeUntil=elapsed+duration}
function start(data=null){
 setup(data?.seed??newSeed(),data);phase='play';overlay(null);lastFrame=performance.now();audio.activate();audio.event('radio');
 notify(data?'Ты опять здесь.':'Знакомый коридор. Дальше — ещё одна дверь.',4);
 if(data?.phase==='upgrade'&&upgradeChoices.length)openUpgrade(true);else persist()
}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock?.()}
function clearStick(){joystickPointer=null;stick.x=0;stick.y=0;if($('knob'))$('knob').style.transform='translate(0px,0px)'}
function clearInputs(){keys.clear();sprintHeld=false;lookPointer=null;lastLook=null;clearStick()}
function pause(){if(phase!=='play')return;phase='pause';clearInputs();releaseMouse();audio.suspend();persist();
 $('pauseText').textContent='Исследовано участков: '+world.visited.size+' · Видений рассеяно: '+kills+' · Улучшений: '+Object.values(upgrades).reduce((a,b)=>a+b,0);
 overlay('pauseOverlay')}
function resume(){if(phase!=='pause'&&phase!=='inventory')return;phase='play';overlay(null);audio.activate();lastFrame=performance.now()}
function showInventory(){if(phase!=='play')return;phase='inventory';clearInputs();releaseMouse();persist();
 const list=$('inventoryList');list.replaceChildren();
 for(const u of UPGRADES){
  const n=upgrades[u.id]||0;if(!n)continue;
  const el=document.createElement('div');el.className='inventory-row found';
  const icon=document.createElement('span');icon.textContent='×'+n;
  const detail=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('small');
  title.textContent=u.name;desc.textContent=u.desc;detail.append(title,desc);el.append(icon,detail);list.append(el)
 }
 if(!list.children.length){const e=document.createElement('div');e.className='inventory-row';e.textContent='Пока ничего. Не пропускай знакомые вещи на полу.';list.append(e)}
 $('journalList').replaceChildren();
 $('journalStatus').textContent='Комнат и коридоров неограниченно много. Пройдено участков: '+world.visited.size+'.';
 $('inventoryAdvice').textContent='Самый глубокий забег: '+Math.max(world.depth,Number(localStorage.getItem(BEST)||0))+' · Силуэтов рассеяно: '+kills;
 overlay('inventoryOverlay')
}
function endRun(){
 if(phase!=='play')return;phase='end';clearInputs();releaseMouse();audio.event('lose');localStorage.removeItem(STORAGE);
 const score=world.depth;
 try{sectorBest=Math.max(Number(localStorage.getItem(BEST)||0),score);localStorage.setItem(BEST,String(sectorBest))}catch{sectorBest=score}
 $('endTag').textContent='ВОСПОМИНАНИЯ ОБОРВАЛИСЬ';
 $('endTitle').textContent='Ты снова забыл дорогу.';
 $('endText').textContent='Участков: '+world.visited.size+' · Врагов: '+kills+' · Находок: '+collected+' · Рекорд: '+sectorBest+'. Следующая квартира будет другой.';
 overlay('endOverlay')
}
function shuffleChoices(){
 const pool=UPGRADES.filter(u=>!((upgrades[u.id]||0)>=4||u.id==='tea'&&(upgrades.tea||0)>=3));
 const chosen=[];const sorted=pool.map(u=>({u,n:hash(world.seed,world.changes,collected,kills,UPGRADES.indexOf(u))})).sort((a,b)=>a.n-b.n);
 for(const x of sorted){if(chosen.length>=3)break;chosen.push(x.u.id)}
 return chosen
}
function openUpgrade(restore=false){
 if(!restore)upgradeChoices=shuffleChoices();
 if(!upgradeChoices.length){phase='play';return}
 phase='upgrade';clearInputs();releaseMouse();const list=$('upgradeList');list.replaceChildren();
 for(const id of upgradeChoices){
  const u=UPGRADES.find(x=>x.id===id);if(!u)continue;
  const button=document.createElement('button');button.type='button';button.className='upgrade-card';
  const title=document.createElement('strong'),desc=document.createElement('small'),count=document.createElement('span');
  title.textContent=u.name;desc.textContent=u.desc;count.textContent='Уровень '+((upgrades[id]||0)+1);
  button.append(title,desc,count);button.addEventListener('click',()=>chooseUpgrade(id));list.append(button)
 }
 overlay('upgradeOverlay');audio.event('memory');persist()
}
function chooseUpgrade(id){
 if(phase!=='upgrade'||!upgradeChoices.includes(id))return;
 upgrades[id]=(upgrades[id]||0)+1;
 if(id==='pockets')reserve=Math.min(maxReserve(),reserve+12);
 if(id==='tea')stress=Math.max(0,stress-32);
 if(id==='glasses')player.sight=upgrades.glasses;
 upgradeChoices=[];phase='play';overlay(null);audio.event('pickup');notify('Вспомнил: '+UPGRADES.find(x=>x.id===id).name,2.2);
 lastFrame=performance.now();persist();showHud()
}
function nearDrop(){return world.drops(player.x,player.z,1.65).filter(d=>world.visible(player.x,player.z,d.x,d.z))[0]||null}
function pickup(){
 const drop=nearDrop();if(!drop){notify('Здесь ничего нет.',1);return}
 if(!world.take(drop))return;
 collected++;audio.event('pickup');
 if(drop.type==='ammo'){reserve=Math.min(maxReserve(),reserve+6+(upgrades.pockets||0)*2);notify('Патроны: +'+(6+(upgrades.pockets||0)*2),2)}
 if(drop.type==='tea'){stress=Math.max(0,stress-22);energy=Math.min(100,energy+18);notify('Тёплый чай. Стало спокойнее.',2)}
 if(drop.type==='bandage'){stress=Math.max(0,stress-36);notify('Лекарства. На время легче.',2)}
 if(drop.type==='relic'){openUpgrade();return}
 persist();showHud()
}
function torchToggle(){if(phase!=='play')return;torch=!torch;$('torch').textContent='Свет: '+(torch?'вкл':'выкл');audio.event('torch')}
function reload(){
 if(phase!=='play'||reloadAt||ammo===6||reserve===0)return;
 reloadAt=elapsed+1.55;reloadTime=1.55;audio.event('reload');notify('Перезаряжаю...',1.2)
}
function shoot(){
 if(phase!=='play'||reloadAt)return;
 if(ammo<=0){audio.event('empty');notify('Пусто. R — перезарядить.',1.5);return}
 ammo--;shotTime=.17;noise=acousticEvent(player.x,player.z,elapsed,'shot');audio.event('shot');
 let victim=null,best=17;
 for(const e of enemies){
  const dx=e.x-player.x,dz=e.z-player.z,dist=Math.hypot(dx,dz);
  const heading=Math.atan2(Math.sin(Math.atan2(dx,-dz)-player.yaw),Math.cos(Math.atan2(dx,-dz)-player.yaw));
  if(dist<best&&Math.abs(heading)<.11+(.03*(upgrades.steady||0))&&Math.abs(player.pitch)<.46&&world.visible(player.x,player.z,e.x,e.z)){victim=e;best=dist}
 }
 if(victim){
  victim.hp-=1+Math.floor((upgrades.steady||0)/2);victim.hit=Math.max(victim.hit||0,.18);
  if(victim.hp<=0){enemies=enemies.filter(e=>e!==victim);kills++;stress=Math.max(0,stress-2);audio.event('memory')}
  else audio.event('sighting')
 }
 showHud()
}
function spawnEnemy(){
 if(enemies.length>=Math.min(6,2+Math.floor(world.depth/3)))return;
 const pos=world.spawnAt(player.x,player.z,5.8,13.5,kills+Math.floor(elapsed));
 if(!pos)return;
 const roll=hash(world.seed,kills,Math.floor(elapsed),world.depth)%7;
 const kind=roll<2?'coat':roll===6?'crawler':'figure';
 enemies.push({...pos,kind,hp:kind==='coat'?1:kind==='crawler'?2:2+Math.floor(world.depth/6),age:0,hit:0,speed:kind==='crawler'?.88:kind==='coat'?.43:.53+Math.min(.26,world.depth*.009),attackAt:elapsed+1});
 audio.event('sighting')
}
function simulation(dt){
 elapsed+=dt;
 if(reloadAt&&elapsed>=reloadAt){const n=Math.min(6-ammo,reserve);ammo+=n;reserve-=n;reloadAt=0;reloadTime=0}
 else if(reloadAt)reloadTime=reloadAt-elapsed;
 shotTime=Math.max(0,shotTime-dt);
 const forward=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)+stick.y;
 const side=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x;
 const len=Math.hypot(forward,side),running=(keys.has('shift')||sprintHeld)&&energy>1&&len>.1;
 const velocity=(running?3.40:2.25)*(1+.11*(upgrades.shoes||0));
 const distance=Math.min(velocity*dt,velocity*.65);
 let travelled=0;
 if(len>.08){
  const f=forward/Math.max(1,len),s=side/Math.max(1,len);
  const sx=(Math.sin(player.yaw)*f+Math.cos(player.yaw)*s)*distance,
   sz=(-Math.cos(player.yaw)*f+Math.sin(player.yaw)*s)*distance;
  const count=Math.max(1,Math.ceil(Math.hypot(sx,sz)/.14));
  for(let i=0;i<count;i++){
   const dx=sx/count,dz=sz/count;
   attempts++;
   if(world.canStand(player.x+dx,player.z)){player.x+=dx;travelled+=Math.abs(dx);moves++}else blocked++;
   if(world.canStand(player.x,player.z+dz)){player.z+=dz;travelled+=Math.abs(dz);moves++}else blocked++
  }
  if(travelled>.001){
   moveSteps+=travelled;player.bob=quiet?0:Math.sin(elapsed*(running?12:8))*.025;player.movement=1;
   if(moveSteps>1.7){moveSteps=0;noise=acousticEvent(player.x,player.z,elapsed,running?'sprint':'step');audio.event('footstep',{room:world.location(player.x,player.z),intensity:running?1.3:1})}
  }else player.movement=0;
 }else{player.bob*=.75;player.movement=0}
 energy=clamp(energy+(running?-17:11)*dt,0,100);
 if(elapsed>=worldAt){
  worldAt=elapsed+.26;
  const result=world.tick(player.x,player.z,player.yaw,elapsed,upgrades.ritual||0);
  if(result.changed){audio.event('shift');notify('Позади всё как-то иначе.',2.1);
   enemies=enemies.filter(e=>Math.hypot(e.x-player.x,e.z-player.z)<17)}
  if(result.depthUp){notify('Ещё один незнакомый участок квартиры.',2.4)}
 }
 if(elapsed>=spawnAt){spawnAt=elapsed+Math.max(3.4,8-world.depth*.15);spawnEnemy()}
 let change=0,inside=false;
 for(const e of enemies){
  const c=updatePresence(e,{world,player,noise,torch:torch&&e.kind==='coat',time:elapsed,dt});
  if(c.resolved){e.done=true;change-=5;kills++;audio.event('memory');continue}
  if(shouldDespawn(e,world)){e.done=true;continue}
  inside=inside||c.near;
  if(c.near&&elapsed>=(e.attackAt||0)){change+=e.kind==='crawler'?21:13;e.attackAt=elapsed+1.25;audio.event('heartbeat')}
 }
 enemies=enemies.filter(e=>!e.done);
 stress=clamp(stress+change/(1+.23*(upgrades.breath||0))-(inside?.18:.70)*dt,0,maxStress());
 if(stress>=maxStress()){endRun();return}
 if(noise&&elapsed>noise.until)noise=null;
 if(elapsed>=saveAt){saveAt=elapsed+7;persist()}
 audio.tick({elapsed,room:world.location(player.x,player.z),stress,active:true});
 if($('hint')&&elapsed>noticeUntil)$('hint').classList.remove('visible');
 showHud()
}
function showHud(){
 if(!world)return;
 $('sector').textContent='КВАРТИРА / '+world.location(player.x,player.z);
 $('objective').textContent='Коридоров пройдено: '+world.visited.size;
 $('ammo').textContent=ammo+' / '+reserve;
 $('lifeFill').style.width=Math.max(0,100-stress/maxStress()*100)+'%';
 $('count').textContent=String(world.depth);
 $('packCount').textContent=String(Object.values(upgrades).reduce((a,b)=>a+b,0));
 const drop=nearDrop();$('aimHint').textContent=drop?'E / ВЗЯТЬ — '+REWARDS[drop.type].name:'';
 $('interact').classList.toggle('ready',!!drop);
 $('torch').textContent='Свет: '+(torch?'вкл':'выкл')
}
function draw(time){
 let dt=clamp((time-lastFrame)/1000,0,.65);lastFrame=time;
 if(phase==='play')simulation(dt);
 if(world&&renderer&&!renderer.lost){
  const drops=world.nearby(player.x,player.z,17).flatMap(c=>c.drops).filter(p=>!world.taken.has(p.id)&&Math.hypot(p.x-player.x,p.z-player.z)<17);
  renderer.draw(world,player,enemies,drops,torch,elapsed,stress/maxStress(),shotTime/.17,reloadTime>0?1-reloadTime/1.55:0)
 }
 const p=$('perception');if(p)p.style.opacity=String(clamp(.36+.42*stress/maxStress()-.085*(upgrades.glasses||0),.08,.87));
 window.__PW_TEST_STATE__={phase,seed:world?.seed,position:player?{x:player.x,z:player.z,yaw:player.yaw,pitch:player.pitch}:null,
  health:maxStress()-stress,ammo,reserve,elapsed,rearrangements:world?.changes||0,depth:world?.depth,visited:world?.visited.size,
  kills,collected,upgrades:{...upgrades},enemies:enemies.length,attempts,moves,blocked,renderer3D:!!renderer&&!renderer.lost,
  sovietInterior:true,endless:true,variant:world?.fingerprint(),fpsFrameTime:dt};
 requestAnimationFrame(draw)
}
function onMoveStick(e){
 const r=$('joystick').getBoundingClientRect(),x=e.clientX-r.left-r.width*.5,y=e.clientY-r.top-r.height*.5,max=r.width*.38,d=Math.max(.01,Math.hypot(x,y)),scale=Math.min(1,max/d);
 stick.x=x*scale/max;stick.y=-y*scale/max;
 $('knob').style.transform='translate('+(x*scale)+'px,'+(y*scale)+'px)'
}
function wireInputs(){
 const joy=$('joystick');
 joy.addEventListener('pointerdown',e=>{if(phase!=='play')return;e.preventDefault();joystickPointer=e.pointerId;joy.setPointerCapture(e.pointerId);onMoveStick(e)});
 joy.addEventListener('pointermove',e=>{if(joystickPointer===e.pointerId)onMoveStick(e)});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(name,()=>clearStick());
 const look=$('touchLook');
 look.addEventListener('pointerdown',e=>{if(phase!=='play')return;lookPointer=e.pointerId;lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId)});
 look.addEventListener('pointermove',e=>{
  if(e.pointerId!==lookPointer||phase!=='play'||!lastLook)return;
  player.yaw+=(e.clientX-lastLook.x)*.004;
  player.pitch=clamp(player.pitch+(e.clientY-lastLook.y)*.004,-1.13,1.13);
  lastLook={x:e.clientX,y:e.clientY}
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(name,()=>{lookPointer=null;lastLook=null});
 document.addEventListener('mousemove',e=>{
  if(phase!=='play'||document.pointerLockElement!==$('view'))return;
  player.yaw+=e.movementX*.0025;player.pitch=clamp(player.pitch+e.movementY*.0025,-1.13,1.13)
 });
 $('view').addEventListener('click',()=>{if(phase==='play'&&!document.pointerLockElement)$('view').requestPointerLock?.().catch(()=>{})});
 document.addEventListener('mousedown',e=>{if(phase==='play'&&document.pointerLockElement===$('view')&&e.button===0){e.preventDefault();shoot()}});
 document.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
  keys.add(key);
  if(key==='escape'){
   if(phase==='play')pause();else if(phase==='pause'||phase==='inventory')resume();return
  }
  if(phase==='play'&&!e.repeat){
   if(key==='e')pickup();if(key==='r')reload();if(key==='f')torchToggle();if(key==='i')showInventory();if(key===' ')shoot()
  }
 });
 document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
 window.addEventListener('blur',()=>{clearInputs();if(phase==='play')pause()});
 const run=$('run');
 run.addEventListener('pointerdown',e=>{if(phase!=='play')return;e.preventDefault();sprintHeld=true;run.classList.add('held');run.setPointerCapture(e.pointerId)});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])run.addEventListener(ev,()=>{sprintHeld=false;run.classList.remove('held')});
 $('interact').addEventListener('click',pickup);$('fire').addEventListener('click',shoot);
 $('reload').addEventListener('click',reload);$('torch').addEventListener('click',torchToggle);
 $('pause').addEventListener('click',pause);$('pack').addEventListener('click',showInventory);
 $('resume').addEventListener('click',resume);$('closePack').addEventListener('click',resume);
 $('start').addEventListener('click',()=>start());
 $('continue').addEventListener('click',()=>{const save=readSave();if(save)start(save);else start()});
 $('again').addEventListener('click',()=>start());
 $('new').addEventListener('click',()=>overlay('confirmOverlay'));
 $('cancel').addEventListener('click',()=>overlay('pauseOverlay'));
 $('erase').addEventListener('click',()=>{localStorage.removeItem(STORAGE);start()});
 const soundToggle=()=>{sound=!sound;audio.setEnabled(sound);
  const label='Звук: '+(sound?'вкл':'выкл');
  $('sound').textContent=label;$('pauseSound').textContent=label;
  try{localStorage.setItem(OPTIONS,JSON.stringify({sound}))}catch{}};
 $('sound').addEventListener('click',soundToggle);$('pauseSound').addEventListener('click',soundToggle);
 $('sound').textContent='Звук: '+(sound?'вкл':'выкл');$('pauseSound').textContent=$('sound').textContent
}
try{
 renderer=new Renderer($('view'));setup(newSeed());phase='menu';overlay('menu');
 $('continue').hidden=!readSave();
 wireInputs();$('view').addEventListener('webglcontextlost',e=>{e.preventDefault();if(phase==='play')pause();$('fatal').hidden=false});
 if(new URLSearchParams(location.search).has('qa')){
  window.__PW_ROGUE_QA__={
   start:()=>start(),world:()=>world,player:()=>player,state:()=>window.__PW_TEST_STATE__,
   setPosition:(x,z)=>{if(!world.canStand(x,z))return false;player.x=x;player.z=z;return true},
   advance:(seconds)=>{if(phase==='play')simulation(seconds)},
   shoot,collect:pickup,upgrade:chooseUpgrade,
   spawn:()=>{spawnEnemy();return enemies.length},
   save:persist
  }
 }
 requestAnimationFrame(draw)
}catch(e){console.error('NOT DEAD YET roguelike error',e);$('fatal').hidden=false}
