import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorld } from './scene.js';
import { validateRun, deadzone, findOpenFacing } from './stability.js';
import { hitRay, pelletAim, staggerDuration } from './combat.js';
import { createCombatAudio } from './sound-forge.js';

installMobileRuntime();
const $=id=>document.getElementById(id);
const canvas=$('stage');
const touch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
const KEY='pocket-works:meat-exe:';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rng=(a,b)=>a+Math.random()*(b-a);
const safeRead=(name)=>{try{return JSON.parse(localStorage.getItem(KEY+name));}catch{return null;}};
const safeWrite=(name,value)=>{try{localStorage.setItem(KEY+name,JSON.stringify(value));}catch{}};
const safeRemove=name=>{try{localStorage.removeItem(KEY+name);}catch{}};
const sample=[[-1,0],[1,0],[0,-1],[0,1]];
let mode='menu',state=null,world=null,last=0,clock=0,lastSave=0,nextId=1;
let waveBreak=0,recoil=0,damageFlash=0,noticeUntil=0,hitUntil=0,fireUntil=0,killUntil=0;
let shotsFired=0,confirmedHits=0,wallHits=0,lastShotKind='none',gateHintShown=false,lastGateHitAt=-999;
const keys=new Set(),movement={x:0,y:0};
let movingPointer=null,lookPointer=null,lookLast={x:0,y:0},shootHeld=false,mouseLocked=false;
let soundOn=safeRead('sound')!==false;
const combatAudio=createCombatAudio();if(!soundOn)combatAudio.setEnabled(false);
let best=safeRead('best')||{score:0,wave:0,kills:0};
let mutation=safeRead('mutation')||null;
let save=validateRun(safeRead('session'));
let quality=safeRead('quality');if(!['auto','speed','detail'].includes(quality))quality='auto';
let effectiveQuality=quality==='speed'?'low':quality==='detail'?'high':'medium';
let gamepadFire=false,padMove={x:0,y:0},prevPadButtons=[],accumulator=0,lastPaint=0,fpsClock=0,fpsFrames=0;
let paintCoolDownUntil=0,paintCost=0;
const ui={
  menu:$('menu'),pause:$('pauseMenu'),result:$('result'),failure:$('failure'),hud:$('hud'),
  touch:$('touchControls'),cross:$('crosshair'),pauseBtn:$('pauseBtn'),wave:$('waveValue'),
  hp:$('healthValue'),healthFill:$('healthFill'),enemies:$('enemyValue'),kills:$('killValue'),
  weapon:$('weaponValue'),score:$('scoreValue'),seed:$('seedValue'),intro:$('introSubtitle'),
  resume:$('resumeSaved'),record:$('record'),mutation:$('scar'),resultTitle:$('resultTitle'),
  resultBody:$('resultBody'),note:$('notice'),damage:$('damageOverlay'),
  mute:$('soundMenu'),pauseMute:$('soundPause'),resumeBtn:$('resumeBtn'),
  qualityMenu:$('qualityMenu'),qualityPause:$('qualityPause'),confirm:$('confirmRestart')
};
const weaponStats=[
  {name:'КОСТОЛОМ',cooldown:.22,damage:26,pellets:1,spread:.015},
  {name:'МЯСОРУБКА',cooldown:.55,damage:14,pellets:7,spread:.12}
];
function audioStart(){combatAudio.unlock();}
function sound(kind){combatAudio.pulse(kind);}
function setNotice(message,seconds=2){
  ui.note.textContent=message;ui.note.classList.add('visible');noticeUntil=clock+seconds;
}
function setMode(next){
  mode=next;
  if(next!=='playing')lastPaint=0; // One frozen game image behind menus, never a live GPU loop.
  ui.mute.hidden=next!=='menu';
  ui.qualityMenu.hidden=next!=='menu';
  ui.confirm.hidden=true;
  ui.menu.hidden=next!=='menu';ui.pause.hidden=next!=='paused';ui.result.hidden=next!=='dead'&&next!=='won';
  ui.hud.hidden=next!=='playing'&&next!=='paused';
  ui.touch.hidden=next!=='playing'||!touch;
  ui.pauseBtn.hidden=next!=='playing'||mouseLocked;
  ui.cross.hidden=next!=='playing';
  if(next!=='playing'){shootHeld=false;gamepadFire=false;movement.x=movement.y=0;padMove.x=padMove.y=0;keys.clear();resetStick();accumulator=0;}
  if(next!=='playing'&&document.pointerLockElement===canvas)document.exitPointerLock?.();
  if(next==='menu'){
    save=validateRun(safeRead('session'));
    ui.resume.hidden=!save;
    ui.record.textContent='РЕКОРД  '+Number(best.score||0).toLocaleString('ru-RU')+'  /  ВОЛНА '+(best.wave||0);
    ui.mutation.textContent=mutation?('ПОСЛЕДНИЙ ШРАМ: '+mutation.label):'ОРГАН ЕЩЁ НЕ ЗНАЕТ ТЕБЯ';
  }
}
function newState(seed){
  const start=world.getStart();
  return {v:3,seed,x:start.x,z:start.z,yaw:findOpenFacing(start.x,start.z,world.isFloor),pitch:0,hp:100,maxHp:100,heat:0,
    weapon:0,level:0,damageBonus:0,cooldown:0,dashCooldown:0,dashTime:0,dashDirX:0,dashDirZ:0,
    invuln:0,score:0,kills:0,wave:0,elapsed:0,waveTime:0,toSpawn:0,spawnClock:0,
    enemies:[],pickups:[],projectiles:[],moving:0,sprinting:false,heartPhase:1,phase:0,
    ruptured:[],ruptureCount:0,immuneHeat:0,immuneDelay:0};
}
function getSeed(){return ((Date.now() ^ Math.floor(Math.random()*0xffffffff))>>>0);}
function makeEnemy(type,x,z,hp){
  const max=type==='heart'?310:type==='brute'?118:type==='spitter'?49:61;
  return {id:nextId++,type,x,z,hp:hp||max,maxHp:max,attack:1+rng(0,.5),
    speed:type==='heart'?.8:type==='brute'?.86:type==='spitter'?1.14:1.55,visual:world.makeEnemy(type,x,z)};
}
function snapshot(){
  if(!state||mode==='dead'||mode==='won')return;
  const {enemies,pickups,projectiles,...base}=state;
  safeWrite('session',{...base,v:3,enemies:enemies.map(({visual,...e})=>e),pickups:pickups.map(({visual,...p})=>p)});
}
function restore(raw){
  const s=validateRun(raw);if(!s)return false;
  world.reset(s.seed,s.ruptured);nextId=1;
  const base=newState(s.seed);
  state={...base,...s,enemies:[],pickups:[],projectiles:[]};
  if(!world.isFloor(state.x,state.z)){state.x=base.x;state.z=base.z;}
  for(const e of s.enemies){
    if(!world.isFloor(e.x,e.z))continue;
    state.enemies.push(makeEnemy(e.type,e.x,e.z,e.hp));
  }
  for(const p of s.pickups){
    if(world.isFloor(p.x,p.z))state.pickups.push({...p,visual:world.makePickup(p.x,p.z)});
  }
  state.heartPhase=clamp(state.heartPhase||1,1,3);
  return true;
}
function begin(resume=false){
  try{
    if(!resume||!restore(save)){
      const seed=getSeed();world.reset(seed);nextId=1;state=newState(seed);
      if(mutation){
        if(mutation.key==='strong')state.damageBonus+=8;
        if(mutation.key==='frail'){state.maxHp=82;state.hp=82;}
        if(mutation.key==='armed')state.level=1;
      }
      startWave(1);
    }
    audioStart();sound('menu');setMode('playing');
    shotsFired=0;confirmedHits=0;wallHits=0;lastShotKind='none';hitUntil=fireUntil=killUntil=0;gateHintShown=false;lastGateHitAt=-999;
    ui.cross.classList.remove('hit','firing','killed');
    last=performance.now();clock=0;waveBreak=0;lastSave=0;accumulator=0;lastPaint=0;
    setQuality(quality);paintCost=0;paintCoolDownUntil=0;
    world.nearChunks(state.x,state.z);
    syncHUD();
    // An immediate pointer lock would intercept the visible pause control.
    // Desktop aiming begins only after the player clicks the actual 3D view.
  }catch(error){fatal(error);}
}
function startWave(number){
  state.wave=number;state.waveTime=0;state.spawnClock=0;state.toSpawn=number===5?1:7+number*3;
  if(number===5){setNotice('СЕРДЦЕ ПРОСНУЛОСЬ',3);sound('heart');}
  else setNotice('ВОЛНА '+String(number).padStart(2,'0')+' / 05',2.5);
  snapshot();
}
function chooseSpawn(min=4,max=11){
  const cX=Math.floor(state.x/8),cZ=Math.floor(state.z/8);
  const choices=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    for(const c of world.getOpenCells(cX+dx,cZ+dz)){
      const d=Math.hypot(c.x-state.x,c.z-state.z);
      if(d>min&&d<max&&state.enemies.every(e=>Math.hypot(e.x-c.x,e.z-c.z)>.7)) choices.push(c);
    }
  }
  if(!choices.length)return null;
  return choices[Math.floor(Math.random()*choices.length)];
}
function spawnUnit(type){
  const p=chooseSpawn(type==='heart'?5:3,type==='heart'?9:11);
  if(!p)return false;
  state.enemies.push(makeEnemy(type,p.x,p.z));
  return true;
}
function weaponSwitch(){
  if(!state||mode!=='playing')return;
  state.weapon=(state.weapon+1)%2;state.cooldown=Math.min(state.cooldown,.17);
  sound('switch');setNotice(weaponStats[state.weapon].name,1);
  syncHUD();
}
function dash(){
  if(!state||mode!=='playing'||state.dashCooldown>0)return;
  let dir=direction();const length=Math.hypot(dir.x,dir.z);
  if(length<.2){dir={x:-Math.sin(state.yaw),z:-Math.cos(state.y)};}
  const norm=Math.hypot(dir.x,dir.z)||1;
  state.dashDirX=dir.x/norm;state.dashDirZ=dir.z/norm;
  state.dashTime=.21;state.dashCooldown=2.7;state.invuln=Math.max(state.invuln,.3);
  recoil=Math.max(recoil,.35);sound('dash');
}
function direction(){
  const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-movement.y-padMove.y;
  const r=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+movement.x+padMove.x;
  const len=Math.max(1,Math.hypot(f,r));
  return {x:(-Math.sin(state.yaw)*f+Math.cos(state.yaw)*r)/len,z:(-Math.cos(state.yaw)*f-Math.sin(state.yaw)*r)/len};
}
function look(dx,dy,sensitivity=touch?.0049:.0023){
  if(!state||mode!=='playing')return;
  state.yaw-=dx*sensitivity;state.pitch=clamp(state.pitch-dy*sensitivity,-1.24,1.24);
}
function harm(amount){
  if(!state||state.invuln>0||mode!=='playing')return;
  state.hp=Math.max(0,state.hp-amount);state.invuln=.55;damageFlash=1;recoil=Math.max(recoil,.65);
  sound('pain');navigator.vibrate?.(40);
  if(state.hp<=0)finish(false);
}
function dropAt(x,z){
  if(state.pickups.length>=18)return;
  const heal=state.hp<60&&Math.random()<.3;
  const type=heal?'heal':'fragment';
  state.pickups.push({x,z,type,visual:world.makePickup(x,z)});
}
function defeatEnemy(e){
  world.splatter(e.x,e.z,e.type==='heart'?55:16);
  world.disposeVisual(e.visual);
  state.enemies.splice(state.enemies.indexOf(e),1);
  state.kills++;state.score+=e.type==='heart'?2500:e.type==='brute'?160:e.type==='spitter'?110:80;
  killUntil=clock+.2;ui.cross.classList.add('killed');
  if(e.type==='heart'){finish(true);return;}
  if(Math.random()<.36)dropAt(e.x,e.z);
  sound('kill');
}
function shoot(){
  if(!state||mode!=='playing'||state.cooldown>0)return;
  const weapon=state.weapon,gun=weaponStats[weapon];
  state.cooldown=gun.cooldown*Math.max(.56,1-state.level*.055);
  recoil=Math.max(recoil,weapon===1?1.25:.89);
  shotsFired++;sound(weapon===1?'shotgun':'fire');
  world.firePulse(weapon);
  fireUntil=clock+(weapon===1?.16:.105);
  ui.cross.classList.add('firing');
  const origin={x:state.x,y:1.41,z:state.z};
  let hits=0,walls=0,tissueHits=0,oneKill=false;
  for(let pellet=0;pellet<gun.pellets;pellet++){
    const direction=pelletAim(state.yaw,state.pitch,pellet,gun.pellets,gun.spread);
    const result=hitRay(origin,direction,state.enemies,world.isFloor,weapon===1?12:17,world.getTissueAt);
    if(!result)continue;
    if(pellet===0||result.kind==='flesh'||(weapon===1&&pellet%2===0))world.fireTrace(origin,result.point,weapon);
    if(result.kind==='flesh'){
      const enemy=result.enemy;
      hits++;confirmedHits++;
      enemy.hp-=gun.damage+state.damageBonus+state.level*3;
      enemy.hitFlash=.18;
      enemy.stagger=Math.max(enemy.stagger||0,staggerDuration(enemy.type));
      world.impact(result.point,direction,'flesh');
      if(enemy.hp<=0){
        oneKill=true;defeatEnemy(enemy);
      }else if(enemy.type==='heart'){
        const fraction=enemy.hp/enemy.maxHp;
        const next=fraction<=.32?3:fraction<=.65?2:1;
        if(next>state.heartPhase){
          state.heartPhase=next;state.score+=300;
          for(let i=0;i<2;i++)spawnUnit('crawler');
          sound('heart');setNotice('СЕРДЦЕ / ФАЗА '+next,2);
        }
      }
    }else if(result.kind==='tissue'){
      tissueHits++;gateHintShown=true;
      world.impact(result.point,direction,'flesh');
      const damage=world.damageTissue(result.tissue.id,gun.damage*(weapon===1?.75:1.3));
      if(damage?.opened){
        state.ruptured.push(damage.id);state.ruptureCount++;
        state.score+=180;
        state.immuneHeat=Math.min(100,state.immuneHeat+26);
        state.immuneDelay=1.85;
        navAt=0;sound('heart');
        if(state.pickups.length<18)state.pickups.push({x:damage.x,z:damage.z,type:'fragment',visual:world.makePickup(damage.x,damage.z)});
        setNotice('ЗАТВОР РАЗОРВАН · ИММУННАЯ РЕАКЦИЯ',2.3);
        snapshot();
      }else if(damage&&clock-lastGateHitAt>.42){
        setNotice('МЕМБРАНА '+Math.ceil(damage.hp)+'% · СТРЕЛЯЙ',.75);
        lastGateHitAt=clock;
      }
    }else if(result.kind==='wall'){
      walls++;wallHits++;
      if(pellet===0||pellet===3)world.impact(result.point,direction,'wall');
    }
    if(mode!=='playing')break;
  }
  if(hits||tissueHits){
    sound('hit');hitUntil=clock+.18;
    ui.cross.classList.add('hit');
    if(oneKill)ui.cross.classList.add('killed');
    if(hits>=3)navigator.vibrate?.(10);
  }else if(walls){sound('wall');}
  lastShotKind=hits?'flesh':tissueHits?'tissue':walls?'wall':'miss';
}
function createProjectile(e,angle=0){
  const toX=state.x-e.x,toZ=state.z-e.z,theta=Math.atan2(toX,toZ)+angle;
  const r=e.type==='heart'?.24:.16;
  state.projectiles.push({x:e.x,z:e.z,vx:Math.sin(theta)*3.15,vz:Math.cos(theta)*3.15,ttl:4,r,visual:world.makeProjectile(e.x,e.z,r)});
}
function updateProjectiles(dt){
  for(let i=state.projectiles.length-1;i>=0;i--){
    const p=state.projectiles[i];p.x+=p.vx*dt;p.z+=p.vz*dt;p.ttl-=dt;
    if(Math.hypot(p.x-state.x,p.z-state.z)<p.r+.20){harm(p.r>.2?21:12);world.disposeVisual(p.visual);state.projectiles.splice(i,1);}
    else if(p.ttl<=0||!world.isFloor(p.x,p.z)){world.disposeVisual(p.visual);state.projectiles.splice(i,1);}
  }
}
let navigation=new Map(),navAt=0;
const key=(x,z)=>x+','+z;
function makeNavigation(){
  navigation=new Map();const sx=Math.round(state.x),sz=Math.round(state.z);
  const queue=[[sx,sz]],limit=900;navigation.set(key(sx,sz),0);
  for(let i=0;i<queue.length&&queue.length<limit;i++){
    const [x,z]=queue[i],d=navigation.get(key(x,z));
    if(d>=22)continue;
    for(const [dx,dz] of sample){
      const nx=x+dx,nz=z+dz,k=key(nx,nz);
      if(navigation.has(k)||!world.isFloor(nx,nz))continue;
      navigation.set(k,d+1);queue.push([nx,nz]);
    }
  }
}
function updateEnemies(dt){
  navAt-=dt;if(navAt<=0){makeNavigation();navAt=.36;}
  for(const e of [...state.enemies]){
    const dx=state.x-e.x,dz=state.z-e.z,dist=Math.hypot(dx,dz);
    const hasSight=dist<10&&world.visible(state,e);
    let tx=state.x,tz=state.z;
    if(!hasSight){
      const rx=Math.round(e.x),rz=Math.round(e.z);
      let best=navigation.get(key(rx,rz))??Infinity;
      let target=null;
      for(const [vx,vz] of sample){
        const ax=rx+vx,az=rz+vz,step=navigation.get(key(ax,az));
        if(step!==undefined&&step<best){target={x:ax,z:az};best=step;}
      }
      if(target){tx=target.x;tz=target.z;}
    }
    e.attack-=dt;
    e.hitFlash=Math.max(0,(e.hitFlash||0)-dt);
    e.stagger=Math.max(0,(e.stagger||0)-dt);
    const gap=Math.hypot(state.x-e.x,state.z-e.z);
    if(e.type==='spitter'&&gap<8&&gap>2&&hasSight&&e.attack<=0){
      createProjectile(e);e.attack=2.0+rng(0,.45);
    }else if(e.type==='heart'&&gap<10&&e.attack<=0){
      for(let n=-2;n<=2;n++)createProjectile(e,n*.29);
      e.attack=2.2-state.heartPhase*.3;
    }else if(gap<(e.type==='heart'?1.55:.72)&&e.attack<=0){
      harm(e.type==='heart'?20:e.type==='brute'?17:10);e.attack=.9;
    }
    if(gap>.75){
      const distGoal=Math.hypot(tx-e.x,tz-e.z)||1;
      const modifier=mutation?.key==='faster'?1.18:1;
      const speed=e.speed*modifier*dt*(e.type==='heart'?.78:1)*(e.stagger>0?.47:1);
      const candidate=world.moveCircle(e.x,e.z,(tx-e.x)/distGoal*speed,(tz-e.z)/distGoal*speed,e.type==='heart'?.23:.19);
      e.x=candidate.x;e.z=candidate.z;
    }
  }
}
function updatePickups(dt){
  for(let i=state.pickups.length-1;i>=0;i--){
    const p=state.pickups[i];
    if(Math.hypot(state.x-p.x,state.z-p.z)<.72){
      if(p.type==='heal'){state.hp=Math.min(state.maxHp,state.hp+28);setNotice('ПЛОТЬ ВОССТАНОВЛЕНА',1.5);}
      else {state.level=Math.min(8,state.level+1);state.damageBonus+=2;state.score+=75;setNotice('ФРАГМЕНТ ВСТРОЕН / УРОВЕНЬ '+state.level,1.7);}
      world.disposeVisual(p.visual);state.pickups.splice(i,1);sound('pickup');
    }
  }
}
function update(dt){
  clock+=dt;
  if(mode!=='playing')return;
  state.elapsed+=dt;state.waveTime+=dt;
  state.immuneHeat=Math.max(0,state.immuneHeat-dt*.53);
  if(state.immuneDelay>0){
    state.immuneDelay=Math.max(0,state.immuneDelay-dt);
    if(state.immuneDelay===0&&state.enemies.length<18){
      const response=state.immuneHeat>48?2:1;
      for(let i=0;i<response;i++)spawnUnit(i===0?'spitter':'crawler');
      if(state.enemies.length>0)setNotice('ИММУННАЯ СИСТЕМА ОТВЕТИЛА',1.4);
    }
  }
  state.cooldown=Math.max(0,state.cooldown-dt);
  state.dashCooldown=Math.max(0,state.dashCooldown-dt);
  state.invuln=Math.max(0,state.invuln-dt);
  state.dashTime=Math.max(0,state.dashTime-dt);
  if(keys.has('Space'))dash();
  const d=state.dashTime>0?{x:state.dashDirX,z:state.dashDirZ}:direction();
  state.moving=Math.min(1,Math.hypot(d.x,d.z));
  state.sprinting=keys.has('ShiftLeft')||keys.has('ShiftRight');
  const speed=state.dashTime>0?14:state.sprinting?4.8:3.4;
  const next=world.moveCircle(state.x,state.z,d.x*speed*dt,d.z*speed*dt,.22);
  state.x=next.x;state.z=next.z;
  if(!gateHintShown){
    const lookAhead=world.getTissueAt(state.x-Math.sin(state.yaw)*2.0,state.z-Math.cos(state.yaw)*2.0);
    if(lookAhead){gateHintShown=true;setNotice('ПУЛЬСИРУЮЩИЙ ЗАТВОР · РАЗРУШЬ ОГНЁМ',2.5);}
  }
  if(shootHeld||gamepadFire)shoot();
  if(state.toSpawn>0){
    state.spawnClock-=dt;
    if(state.spawnClock<=0&&state.enemies.length<20){
      const type=state.wave===5?'heart':Math.random()<Math.min(.25,state.wave*.055)?'brute':Math.random()<.33?'spitter':'crawler';
      if(spawnUnit(type)){state.toSpawn--;state.spawnClock=state.wave===5?0:rng(.4,.9);}
      else state.spawnClock=1.1;
    }
  }
  updateEnemies(dt);updateProjectiles(dt);updatePickups(dt);
  if(mode!=='playing')return;
  if(state.toSpawn===0&&state.enemies.length===0){
    waveBreak+=dt;
    if(waveBreak>2.2){
      waveBreak=0;
      if(state.wave>=5)finish(true);
      else {state.hp=Math.min(state.maxHp,state.hp+16);startWave(state.wave+1);}
    }
  }else waveBreak=0;
  if(clock-lastSave>5){lastSave=clock;snapshot();}
  if(noticeUntil&&clock>noticeUntil){ui.note.classList.remove('visible');noticeUntil=0;}
  if(clock>fireUntil)ui.cross.classList.remove('firing');
  if(clock>hitUntil)ui.cross.classList.remove('hit');
  if(clock>killUntil)ui.cross.classList.remove('killed');
  syncHUD();
}
function syncHUD(){
  if(!state)return;
  ui.wave.textContent=String(state.wave).padStart(2,'0')+' / 05';
  ui.hp.textContent=String(Math.ceil(state.hp)).padStart(3,'0');
  ui.healthFill.style.width=(state.hp/state.maxHp*100)+'%';
  ui.healthFill.style.background=state.hp<30?'#f83f39':'#dec09b';
  ui.enemies.textContent=String(state.enemies.length+state.toSpawn).padStart(2,'0');
  ui.kills.textContent=String(state.kills).padStart(2,'0');
  ui.weapon.textContent=weaponStats[state.weapon].name+'  LV.'+(state.level+1);
  ui.score.textContent=state.score.toLocaleString('ru-RU');
  ui.seed.textContent='ORGAN #'+String(state.seed).slice(-6);
  $('dashBtn').disabled=state.dashCooldown>0;
  $('dashBtn').style.setProperty('--cooldown',state.dashCooldown>0?Math.ceil(state.dashCooldown*100/2.7)+'%':'0%');
}
function finish(victory){
  if(mode!=='playing')return;
  snapshot();safeRemove('session');
  if(victory)state.score+=Math.max(0,Math.round(2500-state.elapsed*6));
  if(state.score>best.score){best={score:state.score,wave:state.wave,kills:state.kills};safeWrite('best',best);}
  const options=[
    {key:'strong',label:'УСИЛЕННЫЙ БОЛТЕР'},
    {key:'faster',label:'БЫСТРАЯ ИНФЕКЦИЯ'},
    {key:'frail',label:'ХРУПКАЯ ПЛОТЬ'},
    {key:'armed',label:'ВСТРОЕННЫЙ МОДУЛЬ'}
  ];
  mutation=options[(state.seed+state.kills+state.wave)%options.length];
  safeWrite('mutation',mutation);
  ui.resultTitle.textContent=victory?'СЕРДЦЕ РАЗОРВАНО':'ТЫ ПЕРЕВАРЕН';
  ui.resultBody.textContent='ОЧКИ '+state.score.toLocaleString('ru-RU')+' · УБИЙСТВ '+state.kills+'\nВОЛНА '+state.wave+'/5 · '+Math.floor(state.elapsed/60)+':'+String(Math.floor(state.elapsed%60)).padStart(2,'0')+'\nСЛЕДУЮЩАЯ МУТАЦИЯ: '+mutation.label;
  setMode(victory?'won':'dead');
  sound(victory?'pickup':'heart');
}
function pause(){
  if(mode!=='playing')return;
  snapshot();setMode('paused');sound('menu');
}
function resume(){
  if(mode!=='paused')return;
  setMode('playing');last=performance.now();
  audioStart(); // Do not recapture the mouse until the player clicks the world.
}
function menu(){snapshot();setMode('menu');}
function confirmNewRun(){
  if(mode!=='menu'&&mode!=='paused')return;
  if(mode==='menu'&&!save){begin(false);return;}
  ui.confirm.hidden=false;
  if(document.pointerLockElement===canvas)document.exitPointerLock?.();
}
function setQuality(value){
  quality=value;safeWrite('quality',quality);
  effectiveQuality=quality==='speed'?'low':quality==='detail'?'high':'medium';
  world?.setQuality(effectiveQuality);
  const labels={auto:'АВТО',speed:'СКОРОСТЬ',detail:'ДЕТАЛИ'};
  ui.qualityMenu.textContent=ui.qualityPause.textContent='ГРАФИКА: '+labels[quality];
  fpsClock=0;fpsFrames=0;
}
function cycleQuality(){setQuality(quality==='auto'?'speed':quality==='speed'?'detail':'auto');sound('menu');}
function pollGamepad(dt){
  const pads=navigator.getGamepads?.();const pad=pads&&Array.from(pads).find(p=>p&&p.connected);
  if(!pad){padMove.x=padMove.y=0;gamepadFire=false;prevPadButtons=[];return;}
  const buttons=Array.from(pad.buttons,b=>Boolean(b?.pressed));
  const pressed=i=>buttons[i]&&!prevPadButtons[i];
  if(mode==='menu'&&pressed(0))begin(Boolean(save));
  else if((mode==='dead'||mode==='won')&&pressed(0))begin(false);
  else if(mode==='paused'&&pressed(0)&&ui.confirm.hidden)resume();
  if(pressed(9)){if(!ui.confirm.hidden)ui.confirm.hidden=true;else if(mode==='playing')pause();else if(mode==='paused')resume();}
  if(mode==='playing'){
    padMove={x:deadzone(pad.axes[0]||0),y:deadzone(pad.axes[1]||0)};
    look(deadzone(pad.axes[2]||0)*dt*620,deadzone(pad.axes[3]||0)*dt*620,.0023);
    gamepadFire=buttons[7]||(pad.buttons[7]?.value||0)>.25;
    if(pressed(0))dash();if(pressed(1)||pressed(3))weaponSwitch();
  }else{padMove.x=padMove.y=0;gamepadFire=false;}
  prevPadButtons=buttons;
}
function fatal(error){
  console.error('[MEAT.EXE]',error);
  $('failureReason').textContent=error?.message||'Не удалось запустить 3D-движок. Проверь поддержку WebGL в браузере.';
  setMode('error');ui.failure.hidden=false;ui.menu.hidden=true;ui.pause.hidden=true;ui.result.hidden=true;ui.hud.hidden=true;
}
function resetStick(){
  const knob=$('stickKnob');if(knob)knob.style.transform='translate(-50%,-50%)';
  movingPointer=null;lookPointer=null;
}
const stick=$('movePad');
function touchMove(e){
  const box=stick.getBoundingClientRect(),cx=box.left+box.width/2,cy=box.top+box.height/2;
  let dx=e.clientX-cx,dy=e.clientY-cy;
  const max=box.width*.32,length=Math.hypot(dx,dy);
  if(length>max){dx*=max/length;dy*=max/length;}
  movement.x=dx/max;movement.y=dy/max;
  $('stickKnob').style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';
}
stick.addEventListener('pointerdown',e=>{if(mode!=='playing'||movingPointer!==null)return;movingPointer=e.pointerId;stick.setPointerCapture(e.pointerId);touchMove(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===movingPointer)touchMove(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(e.pointerId===movingPointer){movement.x=movement.y=0;movingPointer=null;$('stickKnob').style.transform='translate(-50%,-50%)';}});
const lookZone=$('lookZone');
lookZone.addEventListener('pointerdown',e=>{if(mode!=='playing'||lookPointer!==null)return;lookPointer=e.pointerId;lookZone.setPointerCapture(e.pointerId);lookLast={x:e.clientX,y:e.clientY};});
lookZone.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;look(e.clientX-lookLast.x,e.clientY-lookLast.y);lookLast={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel','lostpointercapture'])lookZone.addEventListener(event,e=>{if(e.pointerId===lookPointer)lookPointer=null;});
const fireBtn=$('fireBtn');
fireBtn.addEventListener('pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();fireBtn.setPointerCapture(e.pointerId);shootHeld=true;shoot();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireBtn.addEventListener(event,()=>shootHeld=false);
$('dashBtn').addEventListener('click',dash);
$('weaponBtn').addEventListener('click',weaponSwitch);
canvas.addEventListener('pointerdown',e=>{
  if(mode!=='playing'||touch||e.button!==0)return;
  if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.()?.catch?.(()=>{});
  shootHeld=true;shoot(); // The first click must fire, not only acquire the cursor.
});
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')shootHeld=false;});
document.addEventListener('mousemove',e=>{if(mouseLocked)look(e.movementX,e.movementY);});
document.addEventListener('pointerlockchange',()=>{
  const was=mouseLocked;mouseLocked=document.pointerLockElement===canvas;
  ui.pauseBtn.hidden=(mode!=='playing'||mouseLocked);
  if(was&&!mouseLocked&&mode==='playing'&&!touch)pause();
});
document.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat&&['Escape','KeyQ','KeyE','KeyR'].includes(e.code))return;
  if(e.code==='Escape'){if(!ui.confirm.hidden)ui.confirm.hidden=true;else if(mode==='playing')pause();else if(mode==='paused')resume();return;}
  if(e.code==='KeyQ'||e.code==='KeyE'){weaponSwitch();return;}
  if(e.code==='KeyR'&&mode==='dead'){begin(false);return;}
  keys.add(e.code);
  if(e.code==='Space'&&mode==='playing')dash();
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{if(mode==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
window.addEventListener('pagehide',()=>snapshot());
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();snapshot();fatal(new Error('Видеоконтекст потерян. Забег сохранён. Нажмите «Повторить», чтобы восстановить игру.'));});
window.addEventListener('resize',()=>{world?.resize();lastPaint=0;});
$('startBtn').addEventListener('click',confirmNewRun);
ui.resume.addEventListener('click',()=>begin(true));
ui.pauseBtn.addEventListener('click',pause);
ui.resumeBtn.addEventListener('click',resume);
$('restartPause').addEventListener('click',confirmNewRun);
$('confirmYes').addEventListener('click',()=>{ui.confirm.hidden=true;safeRemove('session');save=null;begin(false);});
$('confirmNo').addEventListener('click',()=>ui.confirm.hidden=true);
ui.qualityMenu.addEventListener('click',cycleQuality);
ui.qualityPause.addEventListener('click',cycleQuality);
setQuality(quality);
$('menuPause').addEventListener('click',menu);
$('restartResult').addEventListener('click',()=>begin(false));
$('menuResult').addEventListener('click',()=>{state=null;setMode('menu');});
$('retryWebgl').addEventListener('click',()=>location.reload());
function toggleSound(){
  soundOn=!soundOn;safeWrite('sound',soundOn);
  combatAudio.setEnabled(soundOn);
  ui.mute.textContent=ui.pauseMute.textContent=soundOn?'ЗВУК: ВКЛ':'ЗВУК: ВЫКЛ';
}
ui.mute.addEventListener('click',toggleSound);ui.pauseMute.addEventListener('click',toggleSound);
ui.mute.textContent=ui.pauseMute.textContent=soundOn?'ЗВУК: ВКЛ':'ЗВУК: ВЫКЛ';
function frame(timestamp){
  try{
    const dt=Math.min(.1,Math.max(0,(timestamp-last)/1000||0));last=timestamp;
    pollGamepad(dt);
    if(world&&mode==='playing'){
      accumulator=Math.min(.10,accumulator+dt);
      let steps=0;
      while(accumulator>=1/60&&steps<6&&mode==='playing'){
        update(1/60);accumulator-=1/60;steps++;
      }
      fpsClock+=dt;fpsFrames++;
      if(quality==='auto'&&fpsClock>4){
        const fps=fpsFrames/fpsClock;
        const next=fps<42?'low':fps>54?'medium':effectiveQuality;
        if(next!==effectiveQuality){effectiveQuality=next;world.setQuality(next);}
        fpsClock=0;fpsFrames=0;
      }
    }else{accumulator=0;}
    // Frame-rate ceiling in manual Detail mode leaves CPU/GPU time for game input.
    // Let the browser service touch, mouse and pause events between expensive SW-WebGL frames.
    // Fast GPU systems keep the previous fast refresh rate.
    const interval=effectiveQuality==='high'?20:effectiveQuality==='low'?20:0;
    const shouldPaint=mode==='playing'?(timestamp-lastPaint>=interval&&performance.now()>=paintCoolDownUntil):lastPaint===0;
    if(world&&!document.hidden&&shouldPaint){
      const elapsed=Math.min(dt,.045);lastPaint=timestamp;
      recoil=Math.max(0,recoil-elapsed*6);damageFlash=Math.max(0,damageFlash-elapsed*2.8);
      ui.damage.style.opacity=String(damageFlash*.8);
      const cameraState=state||{x:3,z:3,yaw:1.4,pitch:0,moving:0,sprinting:false};
      const paintStart=performance.now();
      world.paint(cameraState,state?.enemies||[],state?.pickups||[],state?.elapsed||timestamp*.001,mode==='playing'?elapsed:0,recoil,damageFlash,state?.projectiles||[]);
      const cost=performance.now()-paintStart;
      paintCost=paintCost?paintCost*.65+cost*.35:cost;
      if(mode==='playing'&&paintCost>24)paintCoolDownUntil=performance.now()+Math.min(180,paintCost*2.4);
    }
  }catch(error){fatal(error);world=null;}
  if(world)requestAnimationFrame(frame);
}
window.__MEAT_QA__=()=>({mode,quality,effectiveQuality,seed:state?.seed||null,
  x:state?.x??null,z:state?.z??null,hp:state?.hp??null,wave:state?.wave??null,
  score:state?.score??null,enemies:state?.enemies?.length??0,
  saved:Boolean(validateRun(safeRead('session'))),
  anatomy:{ruptures:state?.ruptureCount??0,immuneHeat:state?.immuneHeat??0,activeGates:state?world?.getTissueCount(Math.floor(state.x/8),Math.floor(state.z/8)):0},
  combat:{shotsFired,confirmedHits,wallHits,lastShotKind,...(world?.getFxCounts?.()||{})}});

try{
  world=createWorld(canvas,save?.v===3?save.seed:2026);
  world.setQuality(effectiveQuality);
  const demo=world.getStart();world.nearChunks(demo.x,demo.z);
  setMode('menu');
  requestAnimationFrame(frame);
}catch(error){fatal(error);}
