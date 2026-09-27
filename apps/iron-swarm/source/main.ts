// @ts-nocheck
import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import {
  BOSS_TIME,RUN_DURATION,applyUpgrade,createGame,getUpgradeChoices,pauseGame,restoreGame,
  resumeGame,serializeGame,startGame,stepGame,type ModuleKind
} from './core';

installMobileRuntime();
registerEnhancedUpdate({appName:'ЖЕЛЕЗНЫЙ РОЙ',version:'0.1.0',releaseNotes:[
  'Вращаемый физический риг, пять минут нарастающего роя и финальный Crusher.',
  'Шесть модулей, полевые улучшения, сохранение забега и мобильное управление двумя пальцами.'
]});
createWorkshopMode({appName:'ЖЕЛЕЗНЫЙ РОЙ',version:'0.1.0',cachePrefix:'iron-swarm-',storageNamespace:'pocket-works:iron-swarm'});

const $=(id)=>document.getElementById(id);
const canvas=$('world'),moveZone=$('move-zone'),rigZone=$('rig-zone'),moveThumb=$('move-thumb'),damageFlash=$('damage-flash');
const RUN_KEY='pocket-works:iron-swarm:run',META_KEY='pocket-works:iron-swarm:meta';
let meta={bestKills:0,runs:0,muted:false};
try{meta={...meta,...JSON.parse(localStorage.getItem(META_KEY)||'{}')}}catch{}
let state=restoreGame(localStorage.getItem(RUN_KEY))??createGame();
let started=false,endHandled=false,upgradeOpen=false,autoPaused=false,saveClock=0,last=performance.now(),acc=0,shake=0,flash=0,restartArmed=0;
const input={moveX:0,moveZ:0,rigTarget:state.rigRotation};
const keys=new Set();

function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(meta))}catch{}}
function saveRun(){if(!started||state.phase==='won'||state.phase==='lost'){try{localStorage.removeItem(RUN_KEY)}catch{};return}try{localStorage.setItem(RUN_KEY,serializeGame(state))}catch{}}
function show(id,on=true){$(id)?.classList.toggle('hidden',!on)}
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1500)}
function home(){saveRun();location.href='../../'}
function fmt(t){t=Math.max(0,Math.ceil(t));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}

class AudioBus{
  constructor(){this.ctx=null;this.muted=!!meta.muted;this.loop=null}
  unlock(){if(this.muted)return;try{this.ctx??=new AudioContext();if(this.ctx.state==='suspended')void this.ctx.resume()}catch{}}
  ping(freq=180,d=.05,g=.025,type='triangle'){if(this.muted)return;this.unlock();if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),v=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.72),t+d);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(v);v.connect(this.ctx.destination);o.start(t);o.stop(t+d)}
  shot(){this.ping(155,.035,.018,'square')} hit(){this.ping(78,.045,.018,'triangle')} level(){this.ping(520,.13,.04)} hurt(){this.ping(65,.12,.045,'sawtooth')} boom(){this.ping(52,.2,.055,'square')} boss(){this.ping(42,.4,.065,'sawtooth')}
  toggle(){this.muted=!this.muted;meta.muted=this.muted;saveMeta();if(!this.muted){this.unlock();this.ping(320,.08,.03)}}
}
const audio=new AudioBus();

const engine=new Engine(canvas,true,{antialias:true,preserveDrawingBuffer:false,stencil:false,powerPreference:'high-performance',adaptToDeviceRatio:false});
engine.setHardwareScalingLevel(Math.min(1.65,Math.max(1,(devicePixelRatio||1)*.68)));
const scene=new Scene(engine);scene.clearColor=new Color4(.68,.64,.52,1);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.018;scene.fogColor=new Color3(.68,.64,.52);scene.skipPointerMovePicking=true;
const hemi=new HemisphericLight('sky',new Vector3(.2,1,.25),scene);hemi.intensity=1.35;hemi.diffuse=new Color3(.98,.91,.76);hemi.groundColor=new Color3(.25,.27,.22);
const sun=new DirectionalLight('sun',new Vector3(-.55,-1,.38),scene);sun.position=new Vector3(20,34,-18);sun.intensity=1.4;sun.diffuse=new Color3(1,.84,.62);
const camera=new FreeCamera('camera',new Vector3(0,22,-18),scene);camera.setTarget(new Vector3(0,0,0));camera.fov=.76;camera.minZ=.1;camera.maxZ=90;

function mat(name,color,rough=.78){const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3((1-rough)*.18,(1-rough)*.18,(1-rough)*.18);return m}
const M={ground:mat('dry concrete','#9b9278'),road:mat('old asphalt','#69685c'),steel:mat('charcoal steel','#343831'),dark:mat('oily steel','#1f241f'),rust:mat('safety orange','#c67635'),cream:mat('sunbleached paint','#d3c39f'),enemy:mat('shell','#695b45'),runner:mat('runner','#8c653e'),brute:mat('brute','#4d5147'),boss:mat('crusher','#3a312b'),scrap:mat('scrap','#d99a4b'),red:mat('heat','#b54d39')};

const ground=MeshBuilder.CreateGround('yard',{width:68,height:68},scene);ground.material=M.ground;
const road=MeshBuilder.CreateGround('road',{width:11,height:64},scene);road.position.y=.012;road.rotation.y=.22;road.material=M.road;
const road2=MeshBuilder.CreateGround('road2',{width:7,height:54},scene);road2.position.y=.014;road2.rotation.y=-1.03;road2.material=M.road;
for(let i=0;i<34;i++){const a=i*2.399,r=9+(i%9)*2.35,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.hypot(x,z)<9)continue;const box=MeshBuilder.CreateBox('wreck'+i,{width:1.4+(i%3)*.5,height:.45+(i%4)*.16,depth:.7+(i%2)*.6},scene);box.position.set(x,.23,z);box.rotation.y=a*.37;box.material=i%5===0?M.rust:i%3===0?M.dark:M.steel}
for(let i=0;i<18;i++){const a=i/18*Math.PI*2,x=Math.cos(a)*29,z=Math.sin(a)*29;const post=MeshBuilder.CreateBox('boundary'+i,{width:.28,height:1.6,depth:.28},scene);post.position.set(x,.8,z);post.rotation.y=-a;post.material=i%2?M.rust:M.cream}

const mech=new TransformNode('mech',scene);
const body=MeshBuilder.CreateBox('body',{width:1.45,height:.72,depth:1.25},scene);body.parent=mech;body.position.y=.75;body.material=M.steel;
const cab=MeshBuilder.CreateBox('cab',{width:.86,height:.58,depth:.88},scene);cab.parent=mech;cab.position.set(.12,1.32,-.04);cab.material=M.cream;
const eye=MeshBuilder.CreateBox('eye',{width:.7,height:.13,depth:.08},scene);eye.parent=mech;eye.position.set(.12,1.39,-.49);eye.material=M.rust;
for(const x of [-.62,.62]){const wheel=MeshBuilder.CreateCylinder('wheel',{diameter:.58,height:.28,tessellation:12},scene);wheel.parent=mech;wheel.position.set(x,.42,0);wheel.rotation.z=Math.PI/2;wheel.material=M.dark}

const rig=new TransformNode('rig',scene);rig.parent=mech;rig.position.y=.85;
for(let i=0;i<6;i++){const arm=MeshBuilder.CreateBox('arm'+i,{width:1.55,height:.11,depth:.13},scene);arm.parent=rig;arm.position.x=1.05;arm.rotation.y=-i*Math.PI/3;arm.material=M.dark;const holder=new TransformNode('holder'+i,scene);holder.parent=rig;holder.rotation.y=-i*Math.PI/3;holder.position.set(Math.cos(i*Math.PI/3)*2,0,Math.sin(i*Math.PI/3)*2)}
let moduleNodes=[];
function addBox(parent,w,h,d,x,y,z,material){const q=MeshBuilder.CreateBox('part',{width:w,height:h,depth:d},scene);q.parent=parent;q.position.set(x,y,z);q.material=material;return q}
function makeModule(kind,slot){const root=new TransformNode('module-'+kind,scene);root.parent=rig;const a=slot*Math.PI/3;root.position.set(Math.cos(a)*2,.05,Math.sin(a)*2);root.rotation.y=-a;
  if(kind==='gun'){addBox(root,.75,.42,.52,0,.18,0,M.steel);addBox(root,.9,.12,.13,.58,.24,0,M.dark)}
  if(kind==='shield'){const p=addBox(root,.2,.92,1.5,.22,.15,0,M.cream);p.rotation.z=-.08;addBox(root,.14,1.02,.25,.13,.15,0,M.rust)}
  if(kind==='saw'){const s=MeshBuilder.CreateCylinder('saw',{diameter:1.05,height:.1,tessellation:16},scene);s.parent=root;s.position.set(.42,.16,0);s.rotation.z=Math.PI/2;s.material=M.dark;s.metadata={saw:true}}
  if(kind==='mortar'){addBox(root,.68,.36,.58,0,.15,0,M.steel);const t=MeshBuilder.CreateCylinder('tube',{diameter:.32,height:.9,tessellation:12},scene);t.parent=root;t.position.set(.35,.46,0);t.rotation.z=-1.05;t.material=M.dark}
  if(kind==='magnet'){addBox(root,.2,.72,.2,.14,.12,.45,M.rust);addBox(root,.2,.72,.2,.14,.12,-.45,M.rust);addBox(root,.2,.2,.9,.14,-.15,0,M.steel)}
  if(kind==='engine'){addBox(root,.75,.58,.65,.05,.14,0,M.steel);addBox(root,.28,.72,.2,.35,.2,.32,M.rust);addBox(root,.28,.72,.2,.35,.2,-.32,M.rust)}
  return root
}
function rebuildModules(){for(const n of moduleNodes)n.dispose(false,true);moduleNodes=[];for(const m of state.modules)moduleNodes.push(makeModule(m.kind,m.slot));renderRigReadout()}
rebuildModules();

function proto(name,kind){let mesh;if(kind==='runner')mesh=MeshBuilder.CreateCylinder(name,{diameter:.75,height:.65,tessellation:8},scene);else if(kind==='brute')mesh=MeshBuilder.CreateBox(name,{size:1.25},scene);else if(kind==='boss')mesh=MeshBuilder.CreateBox(name,{width:2.6,height:1.6,depth:3.2},scene);else mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments:8},scene);mesh.material=kind==='runner'?M.runner:kind==='brute'?M.brute:kind==='boss'?M.boss:M.enemy;mesh.isPickable=false;return mesh}
const enemyMeshes={crawler:proto('crawler','crawler'),runner:proto('runner','runner'),brute:proto('brute','brute'),boss:proto('boss','boss')};
const bulletMesh=MeshBuilder.CreateSphere('bullet',{diameter:.16,segments:4},scene);bulletMesh.material=M.rust;
const mortarMesh=MeshBuilder.CreateSphere('mortar',{diameter:.36,segments:6},scene);mortarMesh.material=M.dark;
const pickupMesh=MeshBuilder.CreateBox('scrap',{size:.23},scene);pickupMesh.material=M.scrap;
for(const m of [...Object.values(enemyMeshes),bulletMesh,mortarMesh,pickupMesh]){m.thinInstanceEnablePicking=false}

const thinArrays={crawler:new Float32Array(16*MAX(170)),runner:new Float32Array(16*170),brute:new Float32Array(16*170),boss:new Float32Array(16*4),bullet:new Float32Array(16*240),mortar:new Float32Array(16*32),pickup:new Float32Array(16*260)};
function MAX(n){return n}
function setMatrix(buf,index,x,y,z,scale=1,rot=0){Matrix.Compose(new Vector3(scale,scale,scale),Quaternion.FromEulerAngles(0,rot,0),new Vector3(x,y,z)).copyToArray(buf,index*16)}
function updateThin(){const counts={crawler:0,runner:0,brute:0,boss:0};for(const e of state.enemies){const i=counts[e.kind]++;const scale=e.kind==='boss'?1:e.radius*1.55;setMatrix(thinArrays[e.kind],i,e.x,e.kind==='boss'?.82:e.radius*.62,e.z,scale,state.time*(e.kind==='runner'?2:.6)+e.id)}
for(const k of Object.keys(enemyMeshes)){enemyMeshes[k].thinInstanceSetBuffer('matrix',thinArrays[k].subarray(0,counts[k]*16),16,true);enemyMeshes[k].thinInstanceCount=counts[k]}
let bc=0,mc=0;for(const p of state.projectiles){if(p.kind==='bullet'){setMatrix(thinArrays.bullet,bc++,p.x,.75,p.z,1)}else setMatrix(thinArrays.mortar,mc++,p.x,.9+Math.sin(Math.max(0,p.ttl)*Math.PI/.78)*2.1,p.z,1)}
bulletMesh.thinInstanceSetBuffer('matrix',thinArrays.bullet.subarray(0,bc*16),16,true);bulletMesh.thinInstanceCount=bc;mortarMesh.thinInstanceSetBuffer('matrix',thinArrays.mortar.subarray(0,mc*16),16,true);mortarMesh.thinInstanceCount=mc;
let pc=0;for(const p of state.pickups){setMatrix(thinArrays.pickup,pc++,p.x,.22,p.z,1,state.time*1.8+pc)}pickupMesh.thinInstanceSetBuffer('matrix',thinArrays.pickup.subarray(0,pc*16),16,true);pickupMesh.thinInstanceCount=pc}

const fx=[];
function ring(x,z,size=1,color=M.rust){const r=MeshBuilder.CreateTorus('impact',{diameter:size,thickness:.05,tessellation:20},scene);r.position.set(x,.05,z);r.material=color;fx.push({mesh:r,life:.32,max:.32,kind:'ring'})}
function debris(x,z,n=4){for(let i=0;i<n;i++){const m=MeshBuilder.CreateBox('chip',{size:.12+Math.random()*.12},scene);m.position.set(x,.3,z);m.material=i%2?M.rust:M.dark;const a=Math.random()*Math.PI*2,s=2+Math.random()*3;fx.push({mesh:m,life:.48,max:.48,vx:Math.cos(a)*s,vy:2+Math.random()*2,vz:Math.sin(a)*s,kind:'debris'})}}
let recoil=0;
function handleEvents(){for(const e of state.events){if(e.type==='shot'){recoil=Math.max(recoil,e.weapon==='mortar'?.14:.055);if(Math.random()<.35)audio.shot()}else if(e.type==='hit'){if(Math.random()<.22)audio.hit()}else if(e.type==='blast'){ring(e.x,e.z,e.radius*2,M.rust);debris(e.x,e.z,7);shake=Math.max(shake,.28);audio.boom()}else if(e.type==='death'){debris(e.x,e.z,e.kind==='brute'?6:3)}else if(e.type==='hurt'){flash=.13;shake=Math.max(shake,.18);audio.hurt()}else if(e.type==='level'){audio.level();openUpgrade()}else if(e.type==='boss'){toast('CRUSHER ВХОДИТ В ЗОНУ');shake=.65;audio.boss()}else if(e.type==='victory'||e.type==='defeat')saveRun()}}
function updateFx(dt){for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.life-=dt;if(f.kind==='ring'){const q=1-f.life/f.max;f.mesh.scaling.setAll(1+q*.9);f.mesh.visibility=Math.max(0,f.life/f.max)}else{f.vy-=9.5*dt;f.mesh.position.x+=f.vx*dt;f.mesh.position.y+=f.vy*dt;f.mesh.position.z+=f.vz*dt;f.mesh.rotation.x+=dt*5;f.mesh.rotation.z+=dt*4}if(f.life<=0){f.mesh.dispose();fx.splice(i,1)}}}

function renderRigReadout(){const el=$('rig-slots');el.innerHTML='';const order=[0,1,2,3,4,5];for(const slot of order){const m=state.modules.find(x=>x.slot===slot),d=document.createElement('div');d.className='rig-slot';d.innerHTML=m?`<b>${({gun:'ПУЛ',saw:'ПИЛ',shield:'ЩИТ',mortar:'МОР',magnet:'МАГ',engine:'ПРИВ'})[m.kind]}</b><small>УР.${m.level}</small>`:`<b>—</b><small>${slot+1}</small>`;el.append(d)}}
function updateHud(){const left=Math.max(0,RUN_DURATION-state.time);$('timer').textContent=fmt(left);$('kills').textContent=String(state.kills);$('level').textContent=String(state.level);$('hp-text').textContent=String(Math.ceil(state.hp));$('hp-fill').style.width=Math.max(0,state.hp/state.maxHp*100)+'%';$('xp-fill').style.width=Math.min(100,state.xp/state.nextXp*100)+'%';$('xp-text').textContent=`${state.xp}/${state.nextXp}`;$('phase-label').textContent=state.bossSpawned?'CRUSHER':'РОЙ / '+Math.min(99,Math.floor(state.time/RUN_DURATION*100))+'%';$('sound').textContent=audio.muted?'MUT':'SND';const boss=state.enemies.find(e=>e.kind==='boss');show('boss-bar',!!boss);if(boss)$('boss-fill').style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';
window.__AI_TEST_STATE__={app:'iron-swarm',started,phase:state.phase,time:+state.time.toFixed(2),player:{x:+state.playerX.toFixed(2),z:+state.playerZ.toFixed(2),hp:+state.hp.toFixed(1)},enemies:state.enemies.length,boss:boss?+boss.hp.toFixed(1):null,level:state.level,kills:state.kills,modules:state.modules.map(m=>({kind:m.kind,level:m.level,slot:m.slot})),savedRun:!!localStorage.getItem(RUN_KEY),fps:Math.round(engine.getFps())}}

function hidePanels(){show('start-screen',false);show('pause-screen',false);show('upgrade-screen',false);show('end-screen',false)}
function beginNew(){state=createGame((Date.now()^Math.floor(Math.random()*1e9))>>>0);startGame(state);input.moveX=0;input.moveZ=0;input.rigTarget=0;started=true;endHandled=false;upgradeOpen=false;meta.runs++;saveMeta();hidePanels();rebuildModules();audio.unlock();saveRun();toast('РИГ ЗАПУЩЕН')}
function continueRun(){const s=restoreGame(localStorage.getItem(RUN_KEY));if(!s){beginNew();return}state=s;started=true;endHandled=false;upgradeOpen=state.phase==='levelup';input.rigTarget=state.rigRotation;hidePanels();rebuildModules();audio.unlock();if(upgradeOpen)openUpgrade()}
function openUpgrade(){if(state.phase!=='levelup')return;upgradeOpen=true;show('upgrade-screen',true);$('upgrade-level').textContent='УР. '+state.level;const box=$('upgrade-options');box.innerHTML='';for(const c of getUpgradeChoices(state)){const b=document.createElement('button');b.type='button';b.className='upgrade-option';b.innerHTML=`<small>${c.id.toUpperCase()}</small><b>${c.title}</b><p>${c.detail}</p>`;b.onclick=()=>{audio.unlock();applyUpgrade(state,c);upgradeOpen=false;show('upgrade-screen',false);rebuildModules();saveRun();toast(c.title)};box.append(b)}}
function finish(){if(endHandled)return;endHandled=true;meta.bestKills=Math.max(meta.bestKills,state.kills);saveMeta();localStorage.removeItem(RUN_KEY);$('end-kills').textContent=String(state.kills);$('end-level').textContent=String(state.level);$('end-time').textContent=fmt(state.time);if(state.phase==='won'){$('end-code').textContent='CRUSHER УНИЧТОЖЕН';$('end-title').textContent='Рой остановлен.';$('end-copy').textContent='Машина выдержала. Сборка дошла до тяжёлой цели и пережила её.'}else{$('end-code').textContent='МЕХ ПОТЕРЯН';$('end-title').textContent='Машина остановилась.';$('end-copy').textContent=state.bossSpawned?'Crusher продавил риг. Следующий заход — с другим балансом модулей.':'Корпус не выдержал. Поверните щит под давление и не бросайте лом на земле.'}show('upgrade-screen',false);show('pause-screen',false);show('end-screen',true)}
function openPause(){if(!started||state.phase!=='running')return;pauseGame(state);saveRun();show('pause-screen',true);$('pause').textContent='▶'}
function closePause(){if(state.phase!=='paused')return;resumeGame(state);show('pause-screen',false);$('pause').textContent='II';audio.unlock()}
$('new-run').onclick=beginNew;$('continue-run').onclick=continueRun;$('play-again').onclick=beginNew;$('resume').onclick=closePause;$('pause').onclick=()=>state.phase==='paused'?closePause():openPause;$('sound').onclick=()=>{audio.toggle();updateHud()};for(const id of ['exit','start-exit','pause-exit','end-exit'])$(id).onclick=home;
$('restart').onclick=()=>{const now=performance.now();if(now>restartArmed){restartArmed=now+2500;$('restart').textContent='ЕЩЁ РАЗ — НАЧАТЬ ЗАНОВО';toast('ТЕКУЩИЙ ЗАБЕГ БУДЕТ СТЁРТ');return}$('restart').textContent='НАЧАТЬ ЗАНОВО';beginNew()};

let movePointer=null,mx0=0,my0=0;function moveAt(x,y){const dx=x-mx0,dy=y-my0,n=Math.hypot(dx,dy)||1,r=50,s=Math.min(1,r/n),px=dx*s,py=dy*s;input.moveX=px/r;input.moveZ=-py/r;moveThumb.style.transform=`rotate(-45deg) translate(${px*.48}px,${py*.48}px)`;moveThumb.classList.add('active')}
moveZone.onpointerdown=e=>{if(state.phase!=='running')return;movePointer=e.pointerId;mx0=e.clientX;my0=e.clientY;moveZone.setPointerCapture(e.pointerId);moveAt(e.clientX,e.clientY);audio.unlock()};moveZone.onpointermove=e=>{if(e.pointerId===movePointer)moveAt(e.clientX,e.clientY)};function releaseMove(e){if(e.pointerId!==movePointer)return;movePointer=null;input.moveX=0;input.moveZ=0;moveThumb.style.transform='rotate(-45deg)';moveThumb.classList.remove('active')}moveZone.onpointerup=releaseMove;moveZone.onpointercancel=releaseMove;
let rigPointer=null,rx=0,ry=0;rigZone.onpointerdown=e=>{if(state.phase!=='running')return;rigPointer=e.pointerId;rx=e.clientX;ry=e.clientY;rigZone.setPointerCapture(e.pointerId);audio.unlock()};rigZone.onpointermove=e=>{if(e.pointerId!==rigPointer)return;const dx=e.clientX-rx,dy=e.clientY-ry;rx=e.clientX;ry=e.clientY;input.rigTarget+=dx*.016-dy*.004};function releaseRig(e){if(e.pointerId===rigPointer)rigPointer=null}rigZone.onpointerup=releaseRig;rigZone.onpointercancel=releaseRig;
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Escape')state.phase==='paused'?closePause():openPause()});addEventListener('keyup',e=>keys.delete(e.code));function keyboard(){let x=0,z=0;if(keys.has('KeyA'))x--;if(keys.has('KeyD'))x++;if(keys.has('KeyW'))z++;if(keys.has('KeyS'))z--;if(x||z){const n=Math.hypot(x,z);input.moveX=x/n;input.moveZ=z/n}else if(movePointer===null){input.moveX=0;input.moveZ=0}if(keys.has('KeyQ'))input.rigTarget+=.055;if(keys.has('KeyE'))input.rigTarget-=.055}
addEventListener('resize',()=>engine.resize());document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&state.phase==='running'){pauseGame(state);saveRun();autoPaused=true}else if(!document.hidden&&autoPaused){autoPaused=false;show('pause-screen',true);$('pause').textContent='▶'}});

$('best-kills').textContent=meta.bestKills?String(meta.bestKills):'—';$('run-count').textContent=String(meta.runs);show('continue-run',!!restoreGame(localStorage.getItem(RUN_KEY)));$('sound').textContent=audio.muted?'MUT':'SND';
function visual(dt){mech.position.x=state.playerX;mech.position.z=state.playerZ;mech.rotation.y+=((Math.atan2(state.playerVX,state.playerVZ||.001)) - mech.rotation.y)*Math.min(1,dt*5);rig.rotation.y=-state.rigRotation;recoil+=(0-recoil)*Math.min(1,dt*16);rig.position.x=-recoil;for(const n of moduleNodes){const saw=n.getChildMeshes().find(x=>x.metadata?.saw);if(saw)saw.rotation.x+=dt*12}updateThin();updateFx(dt);const speed=Math.hypot(state.playerVX,state.playerVZ);body.rotation.z+=(Math.max(-.08,Math.min(.08,-state.playerVX*.012))-body.rotation.z)*dt*7;const s=shake;shake*=Math.pow(.035,dt);const ox=(Math.random()-.5)*s,oz=(Math.random()-.5)*s;camera.position.x+=(state.playerX+ox-camera.position.x)*Math.min(1,dt*4.5);camera.position.z+=(state.playerZ-18+oz-camera.position.z)*Math.min(1,dt*4.5);camera.position.y+=(21.5+Math.min(2.2,state.enemies.length/90)-camera.position.y)*dt*2.5;camera.setTarget(new Vector3(state.playerX,.2,state.playerZ));if(flash>0){flash-=dt;damageFlash.classList.add('hit')}else damageFlash.classList.remove('hit')}
let low=0,qclock=0;function quality(dt){qclock+=dt;if(qclock<2.5)return;qclock=0;const fps=engine.getFps(),lvl=engine.getHardwareScalingLevel();if(fps<43)low++;else low=Math.max(0,low-1);if(low>=2&&lvl<2){engine.setHardwareScalingLevel(Math.min(2,lvl+.18));low=0}else if(fps>58&&lvl>1.04)engine.setHardwareScalingLevel(Math.max(1.04,lvl-.06))}
function frame(now){const dt=Math.min(.08,Math.max(0,(now-last)/1000));last=now;keyboard();if(started&&state.phase==='running'){acc+=dt;let n=0;while(acc>=1/60&&n<5&&state.phase==='running'){stepGame(state,input,1/60);handleEvents();acc-=1/60;n++}saveClock+=dt;if(saveClock>3.5){saveClock=0;saveRun()}}if(state.phase==='won'||state.phase==='lost')finish();visual(dt);updateHud();quality(dt);scene.render();requestAnimationFrame(frame)}
try{updateHud();requestAnimationFrame(frame)}catch(error){console.warn('Iron Swarm startup unavailable',error);$('start-screen').classList.remove('hidden');$('new-run').classList.add('hidden');$('continue-run').classList.add('hidden');const h=$('start-screen').querySelector('h1'),p=$('start-screen').querySelector('p');if(h)h.innerHTML='Не удалось запустить<br><em>3D-сцену.</em>';if(p)p.textContent='Нужен рабочий WebGL. Вернитесь в PocketWorks и попробуйте снова после перезапуска браузера.'}
