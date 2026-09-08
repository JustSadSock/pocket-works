import { Color3, Color4, DirectionalLight, DynamicTexture, Engine, FreeCamera, HemisphericLight, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene, SceneLoader, ShadowGenerator, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { clamp, damp, dampAngle, scenarioFlags, surfaceImpulse } from './core.js';
import { createInput } from './input.js';
import { createColossusAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#renderCanvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('COLOSSUS canvas missing');
const ui = {
  loading: $('#loadingPanel'), title: $('#loadingTitle'), text: $('#loadingText'), bar: $('#loadingBar'), percent: $('#loadingPercent'),
  error: $('#errorPanel'), errorText: $('#errorText'), retry: $('#retryButton'), zone: $('#zoneLabel'), objective: $('#objectiveText'), objectiveIndex: $('#objectiveIndex'),
  caption: $('#eventCaption'), meter: $('#stabilityMeter'), fill: $('#stabilityFill'), stability: $('#stabilityText'), joystick: $('#joystick'), knob: $('#joystickKnob'),
  action: $('#actionButton'), actionGlyph: $('#actionGlyph'), actionLabel: $('#actionLabel'), actionHint: $('#actionHint'), sound: $('#soundButton'), finish: $('#finishPanel'), restart: $('#restartButton'), fade: $('#sceneFade')
};

const RUN_KEY = 'pocket-works:colossus-inside:run';
const SETTINGS_KEY = 'pocket-works:colossus-inside:settings';
const PHYSICS_VERSION = 3;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const stored = read(RUN_KEY, {});
const raw = stored.physicsVersion === PHYSICS_VERSION ? stored : {};
const run = {
  carrier: ['back','shoulder','interior','head'].includes(raw.carrier) ? raw.carrier : 'back',
  lightning: !!raw.lightning,
  repaired: !!raw.repaired,
  finale: false,
  completedRuns: Number(stored.completedRuns) || 0,
  localX: Number.isFinite(raw.localX) ? raw.localX : 0,
  localZ: Number.isFinite(raw.localZ) ? raw.localZ : -11.5
};
const settings = read(SETTINGS_KEY, { muted: false });
const quality = (navigator.hardwareConcurrency || 4) >= 6 && Math.min(innerWidth, innerHeight) >= 360;
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const audio = createColossusAudio();
audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality, stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(quality ? Math.min(1.2, devicePixelRatio * .68) : Math.min(1.7, devicePixelRatio));
const scene = new Scene(engine);
scene.clearColor = new Color4(.025,.042,.046,1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(.095,.135,.14);
scene.fogDensity = .0042;
scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.exposure = .92;
scene.imageProcessingConfiguration.contrast = 1.22;
scene.imageProcessingConfiguration.toneMappingEnabled = true;

const camera = new FreeCamera('camera', new Vector3(0,5,-9), scene);
camera.inputs.clear();
camera.minZ = .08;
camera.maxZ = 520;
camera.fov = .92;
scene.activeCamera = camera;
const hemi = new HemisphericLight('fill', new Vector3(-.2,1,-.1), scene);
hemi.intensity = .44;
hemi.diffuse = new Color3(.46,.53,.52);
hemi.groundColor = new Color3(.018,.024,.021);
const sun = new DirectionalLight('storm', new Vector3(-.42,-.88,.26), scene);
sun.position.set(18,34,-28);
sun.intensity = quality ? 1.08 : .92;
sun.diffuse = new Color3(.76,.76,.67);
const flash = new PointLight('flash', new Vector3(0,20,0), scene);
flash.intensity = 0;
flash.range = 120;
flash.diffuse = new Color3(.72,.9,1);
const shadows = new ShadowGenerator(quality ? 1024 : 512, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = .0018;

function loading(p,t,d){ ui.bar.style.width=`${p}%`; ui.percent.textContent=`${p}%`; ui.title.textContent=t; ui.text.textContent=d; }
function persist(){ write(RUN_KEY,{physicsVersion:PHYSICS_VERSION,carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,localX:+run.localX.toFixed(2),localZ:+run.localZ.toFixed(2),completedRuns:run.completedRuns}); }
function caption(text, ms=2200){ ui.caption.textContent=text; ui.caption.classList.add('show'); clearTimeout(caption.t); caption.t=setTimeout(()=>ui.caption.classList.remove('show'),ms); }
function pulse(pattern){ if(navigator.vibrate) navigator.vibrate(pattern); }
ui.retry.onclick=()=>location.reload();
ui.restart.onclick=()=>{ write(RUN_KEY,{physicsVersion:PHYSICS_VERSION,carrier:'back',lightning:false,repaired:false,localX:0,localZ:-11.5,completedRuns:run.completedRuns}); location.reload(); };
ui.sound.onclick=()=>{ settings.muted=!settings.muted; audio.setMuted(settings.muted); audio.ensure(); write(SETTINGS_KEY,settings); syncSound(); };
function syncSound(){ ui.sound.textContent=settings.muted?'MUTED':'SOUND'; ui.sound.classList.toggle('muted',settings.muted); }
syncSound();

const motion = new TransformNode('carrier_root',scene);
const pelvis = new TransformNode('carrier_pelvis',scene);
const chest = new TransformNode('carrier_chest',scene);
const back = new TransformNode('carrier_back',scene);
const shoulder = new TransformNode('carrier_shoulder',scene);
const head = new TransformNode('carrier_head',scene);
const inside = new TransformNode('carrier_interior',scene);
pelvis.parent=motion;
chest.parent=pelvis; chest.position.y=2.4;
back.parent=chest; back.position.set(0,.35,-1.8);
shoulder.parent=chest; shoulder.position.set(5.6,.15,2);
head.parent=chest; head.position.set(0,8.1,4);
inside.parent=chest; inside.position.set(0,-1.15,.5);
const carriers={back,shoulder,head,interior:inside};

const player = new TransformNode('PlayerRoot',scene);
const playerVisual = new TransformNode('PlayerVisual',scene);
playerVisual.parent=player;

const ROUTES = {
  back: { minZ:-12.4, maxZ:12.2, width:(z)=>5.8 - Math.max(0,z-7)*.12, h:(x,z)=>1.0 + Math.max(0,1-x*x/55)*.24 + Math.sin((z+3)*.32)*.05 },
  shoulder: { minZ:-7.7, maxZ:7.4, width:(z)=>4.7 - Math.abs(z)*.08, h:(x,z)=>1.02 + Math.max(0,1-x*x/25-z*z/85)*.52 },
  interior: { minZ:-11.5, maxZ:12.6, width:()=>4.0, h:(x,z)=>.78 + Math.sin(z*.64)*.025 },
  head: { minZ:-8.2, maxZ:8.5, width:(z)=>5.0 - Math.max(0,z-4)*.13, h:(x,z)=>1.02 + Math.max(0,1-x*x/34-z*z/105)*.28 }
};
function routePoint(carrier,x,z){
  const r=ROUTES[carrier];
  const cz=clamp(z,r.minZ,r.maxZ);
  const w=Math.max(1.4,r.width(cz));
  const cx=clamp(x,-w,w);
  return {x:cx,y:r.h(cx,cz),z:cz,width:w};
}
function attach(carrier,x,z){
  player.parent=carriers[carrier];
  const p=routePoint(carrier,x,z);
  player.position.set(p.x,p.y,p.z);
  run.localX=p.x; run.localZ=p.z;
}
attach(run.carrier,run.localX,run.localZ);

const exterior = new TransformNode('Exterior',scene);
exterior.parent=motion;
exterior.scaling.setAll(.29);
exterior.rotation.y=Math.PI;
exterior.position.set(0,-20,-1.2);
const interior = new TransformNode('Interior',scene);
interior.parent=inside;
interior.scaling.setAll(.72);
interior.rotation.y=Math.PI;
interior.position.set(0,-.35,2.2);
const world = new TransformNode('World',scene);

function mat(name,color,emissive=null){ const m=new StandardMaterial(name,scene); m.diffuseColor=color; m.specularColor=new Color3(.05,.06,.06); if(emissive)m.emissiveColor=emissive; return m; }
function weatherTexture(name, base, fleck, scratches=true){
  const tex=new DynamicTexture(name,{width:128,height:128},scene,false), c=tex.getContext();
  c.fillStyle=`rgb(${Math.round(base[0]*255)},${Math.round(base[1]*255)},${Math.round(base[2]*255)})`; c.fillRect(0,0,128,128);
  for(let i=0;i<420;i++){
    const a=.025+Math.random()*.09, v=(Math.random()>.5?1:-1)*(6+Math.random()*18);
    c.fillStyle=`rgba(${Math.round(clamp(fleck[0]*255+v,0,255))},${Math.round(clamp(fleck[1]*255+v,0,255))},${Math.round(clamp(fleck[2]*255+v,0,255))},${a})`;
    c.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*2,1+Math.random()*2);
  }
  if(scratches){ c.lineWidth=.45; for(let i=0;i<26;i++){ c.strokeStyle=`rgba(215,205,175,${.03+Math.random()*.065})`; c.beginPath(); const x=Math.random()*128,y=Math.random()*128; c.moveTo(x,y); c.lineTo(x+(Math.random()-.5)*34,y+(Math.random()-.5)*7); c.stroke(); } }
  tex.update(false); tex.wrapU=1; tex.wrapV=1; tex.uScale=3; tex.vScale=3; return tex;
}
const materialCache=new Map();
function authoredMaterial(kind){
  if(materialCache.has(kind)) return materialCache.get(kind);
  const defs={
    armor:[[.055,.07,.068],[.22,.18,.11],new Color3(.46,.48,.42)],
    edge:[[.22,.17,.085],[.46,.32,.13],new Color3(.72,.61,.36)],
    bone:[[.13,.145,.13],[.28,.27,.20],new Color3(.39,.41,.35)],
    tissue:[[.055,.018,.014],[.13,.035,.025],new Color3(.09,.03,.025)],
    cable:[[.018,.024,.023],[.08,.07,.05],new Color3(.24,.25,.22)],
    player:[[.11,.095,.075],[.24,.19,.12],new Color3(.21,.19,.15)],
    cloth:[[.048,.055,.05],[.13,.12,.09],new Color3(.10,.11,.10)],
    interior:[[.075,.085,.075],[.22,.17,.10],new Color3(.25,.25,.21)],
    heart:[[.12,.012,.009],[.34,.03,.018],new Color3(.13,.02,.016)],
    sensor:[[.025,.15,.13],[.07,.42,.34],new Color3(.10,.70,.58)]
  };
  const d=defs[kind]||defs.armor;
  const m=new StandardMaterial(`authored-${kind}`,scene);
  m.diffuseTexture=weatherTexture(`weather-${kind}`,d[0],d[1],kind!=='heart'&&kind!=='sensor');
  m.diffuseColor=Color3.White(); m.specularColor=d[2]; m.specularPower=kind==='armor'||kind==='edge'?72:kind==='sensor'?96:28;
  if(kind==='sensor') m.emissiveColor=new Color3(.025,.22,.19);
  if(kind==='heart') m.emissiveColor=new Color3(.035,.002,.002);
  materialCache.set(kind,m); return m;
}
function materialKind(name,zone){
  if(/Sensor|Visor|StabilizerCore|Ceramic/i.test(name)) return 'sensor';
  if(zone==='interior' && /Heart|Sinew|Muscle|Membrane|Vascular/i.test(name)) return 'heart';
  if(zone==='exterior' && /Sinew|Muscle|Membrane|Vascular|PelvisCore/i.test(name)) return 'tissue';
  if(/Cable|Hose|Scarf|Harness/i.test(name)) return zone==='player'?'cloth':'cable';
  if(/Edge|Rail|Ring|Valve|Piston|Axle|Wheel|Clamp|Gear/i.test(name)) return 'edge';
  if(/Bone|Joint|Rib|Spine|Vertebra/i.test(name)) return 'bone';
  if(zone==='player') return /Hood|Torso|Arm|Leg/i.test(name)?'cloth':'player';
  if(zone==='interior') return 'interior';
  return 'armor';
}
function styleMesh(mesh,zone){
  mesh.material=authoredMaterial(materialKind(mesh.name,zone));
  if(zone==='exterior' && /ChestSinew|PelvisCore/i.test(mesh.name)) mesh.visibility=.34;
}

function armorPlate(name,parent,x,y,z,w,d,rz=0){
  const plate=MeshBuilder.CreateBox(name,{width:w,height:.26,depth:d},scene);
  plate.parent=parent; plate.position.set(x,y,z); plate.rotation.z=rz; plate.material=authoredMaterial('armor'); plate.receiveShadows=true; shadows.addShadowCaster(plate,true);
  const ridge=MeshBuilder.CreateBox(`${name}-ridge`,{width:Math.max(.6,w*.06),height:.22,depth:d*.72},scene);
  ridge.parent=plate; ridge.position.y=.23; ridge.material=authoredMaterial('edge');
  return plate;
}
function buildReadableRoute(){
  const backZ=[-11,-7.4,-3.8,-.2,3.4,7.0,10.2];
  backZ.forEach((z,i)=>{ const y=ROUTES.back.h(0,z)-.27; const w=9.2-(i>4?(i-4)*.5:0); armorPlate(`dorsal-plate-${i}`,back,0,y,z,w,2.7,(i%2?.015:-.015)); });
  for(let i=0;i<5;i++){
    const z=-6.4+i*3.0, y=ROUTES.shoulder.h(0,z)-.27;
    armorPlate(`scapula-plate-${i}`,shoulder,0,y,z,7.3-Math.abs(i-2)*.45,2.25,(i-2)*.018);
  }
  for(let i=0;i<7;i++){
    const z=-10+i*3.3, y=ROUTES.interior.h(0,z)-.22;
    armorPlate(`internal-catwalk-${i}`,inside,0,y,z,6.9,2.45,(i%2?.012:-.012));
  }
  for(let i=0;i<5;i++){
    const z=-6.7+i*3.25,y=ROUTES.head.h(0,z)-.25;
    armorPlate(`cranial-plate-${i}`,head,0,y,z,8.0-Math.abs(i-2)*.42,2.45,(i-2)*-.012);
  }
  for(let i=0;i<6;i++){
    const fin=MeshBuilder.CreateBox(`spine-fin-${i}`,{width:.52,height:1.15,depth:.4},scene);
    fin.parent=back; fin.position.set(0,ROUTES.back.h(0,-8+i*3.2)+.52,-8+i*3.2); fin.rotation.x=.22; fin.material=authoredMaterial('bone');
  }
  const hinge=MeshBuilder.CreateTorus('shoulder-hinge',{diameter:3.5,thickness:.42,tessellation:36},scene);
  hinge.parent=shoulder; hinge.position.set(0,2.1,6.5); hinge.rotation.x=Math.PI/2; hinge.material=authoredMaterial('edge');
}
buildReadableRoute();

const abyss=MeshBuilder.CreateCylinder('abyss',{diameter:380,height:2,tessellation:64},scene); abyss.position.y=-32; abyss.parent=world; abyss.material=mat('abyssmat',new Color3(.022,.034,.035));
const clouds=[];
for(let i=0;i<3;i++){ const p=MeshBuilder.CreatePlane(`cloud${i}`,{width:180,height:60},scene); p.parent=world; p.position.set((i-1)*52,15+i*11,88+i*35); p.rotation.y=i%2?.22:-.18; const m=mat(`cloudmat${i}`,new Color3(.10+i*.012,.13+i*.012,.13+i*.012)); m.alpha=.42; m.backFaceCulling=false; p.material=m; clouds.push(p); }
const rainTex=new DynamicTexture('rainTex',{width:8,height:48},scene,false);
{ const c=rainTex.getContext(),g=c.createLinearGradient(0,0,0,48); g.addColorStop(0,'rgba(220,235,238,0)'); g.addColorStop(.5,'rgba(220,235,238,.85)'); g.addColorStop(1,'rgba(220,235,238,0)'); c.fillStyle=g;c.fillRect(3,0,2,48);rainTex.hasAlpha=true;rainTex.update(false); }
const rainPos=new Vector3();
const rain=new ParticleSystem('rain',quality?1100:520,scene);
rain.particleTexture=rainTex; rain.emitter=rainPos; rain.minEmitBox=new Vector3(-14,0,-10); rain.maxEmitBox=new Vector3(14,5,10); rain.direction1=new Vector3(-5,-22,-1); rain.direction2=new Vector3(-7,-25,1); rain.minLifeTime=.55; rain.maxLifeTime=.9; rain.minSize=.08; rain.maxSize=.2; rain.emitRate=quality?640:310; rain.color1=new Color4(.7,.82,.84,.6); rain.color2=new Color4(.45,.6,.64,.34); rain.start();

let extGroups=[],intGroups=[],plyGroups=[],extAnim='',intAnim='',plyAnim='',fracture=null,shards=[],hatch=null,secondary=[],scarf=[];
const find=(groups,name)=>groups.find(g=>g.name.toLowerCase().includes(name.toLowerCase()))||groups[0];
function play(groups,name,loop=true,speed=1){ const g=find(groups,name); if(!g)return; groups.forEach(x=>{if(x!==g&&x.isPlaying)x.stop();}); if(!g.isPlaying)g.start(loop,speed,g.from,g.to,false); g.speedRatio=speed; }
function playExt(n,s=1){ if(extAnim!==n){extAnim=n;play(extGroups,n,true,s);} }
function playInt(n,s=1){ if(intAnim!==n){intAnim=n;play(intGroups,n,true,s);} }
function playPly(n,loop=true,s=1){ if(plyAnim!==n||!loop){plyAnim=n;play(plyGroups,n,loop,s);} }
async function load(name,parent,zone,onMesh){
  const r=await SceneLoader.ImportMeshAsync('','./models/',name,scene);
  r.meshes.filter(x=>!x.parent).forEach(x=>x.parent=parent);
  r.meshes.forEach(x=>{ x.isPickable=false; if(x instanceof Mesh){ x.receiveShadows=quality; styleMesh(x,zone); onMesh?.(x); } });
  return r;
}
async function assets(){
  loading(12,'Проверяем скелет','Colossus armature · dorsal armor');
  const a=await load('colossus.glb',exterior,'exterior',m=>{ if(/BackPlate|ShoulderDeck|HeadDeck|Fracture|Hatch/i.test(m.name))shadows.addShadowCaster(m,true); if(m.name.includes('FracturePlate_Intact'))fracture=m; if(m.name.includes('FractureShard_'))shards.push(m); if(m.name.includes('HatchDoor'))hatch=m; if(/Cable_|Antenna_|SuspendedVane/i.test(m.name))secondary.push(m); });
  extGroups=a.animationGroups; if(!extGroups.length)throw Error('colossus.glb: animations missing');
  loading(50,'Загружаем внутренности','Heart · pistons · stabilizer');
  const b=await load('interior.glb',interior,'interior',m=>{ if(/Heart|Piston|Stabilizer|Repair/i.test(m.name))shadows.addShadowCaster(m,true); });
  intGroups=b.animationGroups; if(!intGroups.length)throw Error('interior.glb: animations missing');
  loading(80,'Поднимаем человека','Humanoid rig · brace · climb · fall');
  const c=await load('player.glb',playerVisual,'player',m=>{ shadows.addShadowCaster(m,true); if(/ScarfTail/i.test(m.name))scarf.push(m); });
  plyGroups=c.animationGroups; if(!plyGroups.length)throw Error('player.glb: animations missing');
  playerVisual.scaling.setAll(.48);
  playerVisual.rotation.y=0;
  loading(100,'Колосс просыпается',quality?'HIGH mobile profile':'ADAPTIVE mobile profile');
}

function visibility(){
  const inn=run.carrier==='interior';
  exterior.setEnabled(!inn); interior.setEnabled(inn); world.setEnabled(!inn);
  rain.emitRate=inn?0:(quality?640:310)*(run.repaired?.55:1);
  scene.fogDensity=inn?.016:(run.repaired?.0035:.0042);
  scene.fogColor=inn?new Color3(.055,.066,.06):new Color3(.095,.135,.14);
  hemi.intensity=inn?.20:(run.repaired?.62:.44);
  sun.intensity=inn?.16:(run.repaired?1.45:(quality?1.08:.92));
  audio.setInside(inn);
}

const objective=()=>run.carrier==='head'?['08','Дойди до переднего гребня головы.','CRANIAL DECK · 08']:
  run.carrier==='interior'?(run.repaired?['07','Поднимись по верхнему сервисному каналу.','THORACIC CORE · 07']:['06','Доберись до стабилизатора и удерживай привод.','THORACIC CORE · 06']):
  run.carrier==='shoulder'?['05','Пересечь лопатку и подняться на плечевой шарнир.','SCAPULAR JOINT · 05']:
  run.lightning?['04','Походка сорвана. Иди к подсвеченному плечевому шарниру.','DORSAL PLATES · 04']:
  run.localZ>-8?['03','Иди по броневым пластинам вдоль позвоночника.','DORSAL PLATES · 03']:['01','Выйди из защитной ниши на спину.','DORSAL SHELTER · 01'];
let objectiveKey='';
function syncObjective(){ const o=objective(),k=o.join('|'); if(k===objectiveKey)return; objectiveKey=k; ui.objectiveIndex.textContent=o[0]; ui.objective.textContent=o[1]; ui.zone.textContent=o[2]; }
function syncStability(){ const bad=run.lightning&&!run.repaired,v=run.repaired?.96:bad?.42:.86; ui.fill.style.width=`${v*100}%`; ui.meter.classList.toggle('damaged',bad); ui.stability.textContent=run.repaired?'SYNCHRONIZED':bad?'ASYMMETRIC':'STABLE'; }

const input=createInput({canvas,joystick:ui.joystick,knob:ui.knob,actionButton:ui.action,onFirstGesture:()=>audio.ensure()});
let yaw=0,pitch=-.12,syaw=0,spitch=-.12,face=0,speed=0,extX=0,extZ=0,phase=0,prevCarrier=null,prevVel=new Vector3();
let repair=run.repaired?1:0,repairTone=0,transition=false,fractureTime=-1,bolt=null,finalTime=0,camPos=new Vector3(0,5,-9),camTarget=new Vector3(),camKick=new Vector3(),lastFoot=.5,distantFlash=3.5+Math.random()*5;
let falling=false,fallClock=0,climbing=false,climbClock=0,climbDuration=1.05,climbTarget=null,checkpoint={carrier:run.carrier,x:run.localX,z:run.localZ};

async function fade(fn){ if(transition)return; transition=true; ui.fade.classList.add('on'); await new Promise(r=>setTimeout(r,reduced?10:300)); fn(); await new Promise(r=>setTimeout(r,reduced?10:70)); ui.fade.classList.remove('on'); transition=false; }
function setCheckpoint(){ checkpoint={carrier:run.carrier,x:run.localX,z:run.localZ}; }
function moveCarrier(name,x,z,msg){ void fade(()=>{ run.carrier=name; attach(name,x,z); prevCarrier=null; prevVel.setAll(0); extX=extZ=0; falling=false; climbing=false; setCheckpoint(); visibility(); syncObjective(); caption(msg); persist(); }); }
function beginClimb(target,msg){ if(climbing||falling||transition)return; climbing=true; climbClock=0; climbTarget={...target,msg}; playPly('Climb',true,.9); caption(msg,1500); pulse(18); }
function finishClimb(){
  if(!climbTarget)return;
  const t=climbTarget; climbing=false; climbTarget=null;
  if(t.carrier!==run.carrier) moveCarrier(t.carrier,t.x,t.z,t.arrive||'CLIMB COMPLETE');
  else { attach(run.carrier,t.x,t.z); setCheckpoint(); persist(); }
}
function startFall(){ if(falling||climbing||transition)return; falling=true; fallClock=0; speed=0; extX=extZ=0; playPly('Fall',true,1); caption('СОРВАЛСЯ // ВОЗВРАТ К ПОСЛЕДНЕЙ ОПОРЕ',1500); pulse([18,25,38]); }
function lightning(){
  if(run.lightning)return;
  run.lightning=true; fractureTime=0; fracture?.setEnabled(false); shards.forEach(s=>s.setEnabled(true)); playExt('Strain',.72); playInt('Fail',.8); audio.lightning(); pulse([45,35,90]); caption('IMPACT // DORSAL ARMOR BREACH',2600); flash.intensity=14; camKick.set(.12,.20,-.1);
  const hit=back.getAbsolutePosition().add(new Vector3(-3,2,run.localZ+1)),pts=[hit.add(new Vector3(0,32,0))];
  for(let i=1;i<8;i++){ const t=i/8; pts.push(new Vector3(hit.x+(Math.random()-.5)*1.3,hit.y+32*(1-t),hit.z+(Math.random()-.5)*1.2)); }
  pts.push(hit); bolt=MeshBuilder.CreateLines('bolt',{points:pts},scene); bolt.color=new Color3(.78,.92,1); setTimeout(()=>{flash.intensity=0;bolt?.setEnabled(false);},220); persist();
}
function repairDone(){ if(run.repaired)return; run.repaired=true; repair=1; audio.setRepaired(true); audio.repairComplete(); playExt('Recover',.55); playInt('Recovered',.8); caption('STABILIZER // SYNCHRONIZED',2800); pulse([25,20,25,20,70]); visibility(); syncObjective(); persist(); }
function finale(){
  if(run.finale)return; run.finale=true; run.completedRuns++; audio.finale(); caption('STORM BREAK // VISUAL CONTACT',3000);
  const sm=mat('farColossus',new Color3(.04,.055,.052));
  [[-58,150,1],[22,178,.8],[72,205,1.15]].forEach(([x,z,s],i)=>{ const r=new TransformNode(`far${i}`,scene); r.parent=world; r.position.set(x,-24,z); r.scaling.setAll(s); const b=MeshBuilder.CreateCylinder(`farB${i}`,{height:45,diameterTop:9,diameterBottom:13,tessellation:8},scene); b.parent=r;b.position.y=24;b.material=sm; const sh=MeshBuilder.CreateBox(`farS${i}`,{width:28,height:5,depth:7},scene); sh.parent=r;sh.position.y=40;sh.material=sm; });
  persist();
}

function motionUpdate(dt){
  const bad=run.lightning&&!run.repaired?1:0;
  const rate=run.repaired?.18:.22;
  phase+=dt*rate;
  const s=Math.sin(phase*Math.PI*2),d=Math.sin(phase*Math.PI*4),kick=bad*Math.max(0,Math.sin(phase*Math.PI*2+.55));
  motion.position.y=Math.abs(s)*(.045+bad*.04);
  motion.rotation.z=s*(.006+bad*.010);
  pelvis.rotation.set(d*(.006+bad*.010),0,s*(.010+bad*.016));
  chest.rotation.set(-d*(.008+bad*.010),0,-s*(.012+bad*.020)-kick*.012);
  back.rotation.x=Math.sin(phase*Math.PI*2+.5)*(.006+bad*.010);
  shoulder.rotation.set(Math.sin(phase*Math.PI*2+1.2)*(.018+bad*.035),0,s*(.014+bad*.026));
  head.rotation.z=-s*(.008+bad*.012);
  inside.rotation.x=d*(.004+bad*.007);
  const prevPhase=phase-dt*rate;
  if(Math.floor(phase*2)!==Math.floor(prevPhase*2)){ audio.colossusStep(bad); camKick.y+=bad?.032:.018; if(bad&&Math.random()>.55)audio.creak(); }
  clouds.forEach((c,i)=>{ c.position.x-=dt*(.22+i*.09)*(run.repaired?.5:1); if(c.position.x<-105)c.position.x+=210; });
  secondary.forEach((m,i)=>{ m.rotation.z=damp(m.rotation.z,Math.sin(phase*5.2+i*.83)*(.010+bad*.020),2.5,dt); m.rotation.x=damp(m.rotation.x,Math.sin(phase*3.8+i)*(.008+bad*.012),2.5,dt); });
  scarf.forEach((m,i)=>{ m.rotation.x=damp(m.rotation.x,.08+Math.sin(phase*6+i)*.05,3.4,dt); m.rotation.z=damp(m.rotation.z,Math.sin(phase*4.8+i)*.06,3.1,dt); });
}
function fractureUpdate(dt){ if(fractureTime<0)return; fractureTime+=dt; shards.forEach((s,i)=>{ if(!s.isEnabled())return; const t=Math.max(0,fractureTime-i*.07); if(t>.18){s.position.x-=dt*(.4+i*.06);s.position.y-=dt*(.8+t*1.5);s.rotation.x+=dt*(.8+i*.16);s.rotation.z-=dt*(.6+i*.12);} if(t>4)s.setEnabled(false); }); if(fractureTime>5)fractureTime=-1; }
function animation(moving,sprint,brace){ playExt(run.repaired?'Recover':run.lightning?'Strain':'Walk',run.repaired?.55:.62); playInt(run.repaired?'Recovered':run.lightning?'Fail':'Pulse',.8); if(!falling&&!climbing)playPly(brace?'Brace':moving?(sprint?'Run':'Walk'):'Idle'); }

function actionContext(){
  const z=run.localZ,x=run.localX;
  if(falling) return {label:'FALL',hint:'...',glyph:'↓',hot:false};
  if(climbing) return {label:'CLIMB',hint:'...',glyph:'↑',hot:true};
  if(run.carrier==='back' && run.lightning && z>9.0 && Math.abs(x)<3.6) return {label:'CLIMB',hint:'на плечо',glyph:'↑',hot:true,type:'shoulder'};
  if(run.carrier==='shoulder' && z>5.2 && Math.abs(x)<3.4) return {label:'ENTER',hint:'люк',glyph:'↥',hot:true,type:'hatch'};
  if(run.carrier==='interior' && !run.repaired && z>8.7 && Math.abs(x)<3.2) return {label:'SYNC',hint:'удерживать',glyph:'↻',hot:true,type:'repair'};
  if(run.carrier==='interior' && run.repaired && z>10.9 && Math.abs(x)<3.0) return {label:'CLIMB',hint:'наружу',glyph:'↑',hot:true,type:'head'};
  return {label:'BRACE',hint:'удерживать',glyph:'◢',hot:false,type:'brace'};
}
function actionUI(ctx,held){ ui.actionLabel.textContent=ctx.label; ui.actionHint.textContent=ctx.hint; ui.actionGlyph.textContent=ctx.glyph; ui.action.style.setProperty('--progress',ctx.type==='repair'?repair:0); ui.action.classList.toggle('hot',ctx.hot||held); }
function scenario(ctx,s,dt){
  if(run.carrier==='back'&&!run.lightning&&run.localZ>-2.2) lightning();
  if(ctx.type==='shoulder'&&s.actionPressed) beginClimb({carrier:'shoulder',x:0,z:-6.2,arrive:'SCAPULAR JOINT // ОПОРА НАЙДЕНА'},'КАРАБКАЕМСЯ ЧЕРЕЗ ЛОПАТКУ');
  if(ctx.type==='hatch'&&s.actionPressed){ if(hatch)hatch.rotation.x+=.9; beginClimb({carrier:'interior',x:0,z:-10.5,arrive:'INTERNAL PRESSURE // AUDIO OCCLUDED'},'СПУСК В СЕРВИСНЫЙ ЛЮК'); }
  if(ctx.type==='repair'&&s.actionHeld){ repair=clamp(repair+dt/3.3,0,1); repairTone-=dt; if(repairTone<=0){repairTone=.18;audio.repairPulse(repair);} if(repair>=1)repairDone(); }
  else if(!run.repaired) repair=Math.max(0,repair-dt*.08);
  if(ctx.type==='head'&&s.actionPressed) beginClimb({carrier:'head',x:0,z:-6.8,arrive:'CRANIAL DECK // WIND LOAD EXTREME'},'ПОДЪЁМ ПО ШЕЙНОМУ КАНАЛУ');
  const flags=scenarioFlags({carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,localZ:run.localZ});
  if(flags.finaleReady)finale();
}

function specialMovement(dt){
  if(climbing){
    climbClock+=dt; const p=clamp(climbClock/climbDuration,0,1); playerVisual.position.y=Math.sin(p*Math.PI)*.55; playerVisual.rotation.x=-.15+Math.sin(p*Math.PI*2)*.06;
    if(p>=1){playerVisual.position.y=0;playerVisual.rotation.x=0;finishClimb();}
    return true;
  }
  if(falling){
    fallClock+=dt; player.position.y-=dt*(1.1+fallClock*3.6); playerVisual.rotation.x+=dt*1.4;
    if(fallClock>1.0){ falling=false; playerVisual.rotation.x=0; run.carrier=checkpoint.carrier; attach(checkpoint.carrier,checkpoint.x,checkpoint.z); caption('ПОСЛЕДНЯЯ ОПОРА',900); persist(); }
    return true;
  }
  return false;
}

function playerUpdate(dt,t,s){
  const node=carriers[run.carrier]; node.computeWorldMatrix(true);
  const w=node.getAbsolutePosition(),vel=prevCarrier?w.subtract(prevCarrier).scale(1/Math.max(dt,1/120)):new Vector3(); prevCarrier=w.clone();
  const ctx=actionContext(); const brace=s.actionHeld&&ctx.type==='brace'; const imp=surfaceImpulse(prevVel,vel,dt,brace); prevVel.copyFrom(vel);
  if(imp.magnitude>8){extX+=imp.x*.65;extZ+=imp.z*.65;}
  yaw-=s.lookX*.004; pitch=clamp(pitch-s.lookY*.0034,-.50,.34);
  if(specialMovement(dt)) return {moving:false,sprint:false,brace,ctx};
  const ml=Math.hypot(s.moveX,s.moveY),sprint=s.sprint&&ml>.45&&!brace;
  speed=damp(speed,ml*(sprint?3.35:2.05)*(brace?.52:1),sprint?6.5:8.5,dt);
  let dx=Math.cos(yaw)*s.moveX+Math.sin(yaw)*s.moveY;
  let dz=-Math.sin(yaw)*s.moveX+Math.cos(yaw)*s.moveY;
  const n=Math.hypot(dx,dz); if(n){dx/=n;dz/=n;}
  extX=damp(extX,0,brace?7:2.2,dt); extZ=damp(extZ,0,brace?7:2.2,dt);
  const nx=player.position.x+(dx*speed+extX)*dt, nz=player.position.z+(dz*speed+extZ)*dt;
  const r=ROUTES[run.carrier], width=r.width(clamp(nz,r.minZ,r.maxZ));
  const outsideZ=nz<r.minZ-.25||nz>r.maxZ+.25;
  const outsideX=Math.abs(nx)>width+.28;
  if(outsideX||outsideZ){ startFall(); return {moving:false,sprint:false,brace,ctx}; }
  const p=routePoint(run.carrier,nx,nz); player.position.set(p.x,p.y,p.z); run.localX=p.x; run.localZ=p.z;
  if(ml>.12){ face=dampAngle(face,Math.atan2(dx,dz),10,dt); playerVisual.rotation.y=face; }
  playerVisual.rotation.x=damp(playerVisual.rotation.x,brace?-.12:clamp(extZ*.028,-.11,.11),7,dt);
  playerVisual.rotation.z=damp(playerVisual.rotation.z,clamp(-extX*.035,-.14,.14),7,dt);
  if(speed>.45){ const fp=(t*(sprint?2.35:1.55))%1; if(fp<lastFoot)audio.step(sprint?1.0:.72); lastFoot=fp; }
  if(run.localZ>-8.8 && run.localZ< -7.9) setCheckpoint();
  if(run.carrier==='back'&&run.localZ>5&&run.localZ<5.8) setCheckpoint();
  if(run.carrier==='shoulder'&&run.localZ>0&&run.localZ<.8) setCheckpoint();
  if(run.carrier==='interior'&&run.localZ>0&&run.localZ<.8) setCheckpoint();
  if(run.carrier==='head'&&run.localZ>0&&run.localZ<.8) setCheckpoint();
  return {moving:ml>.12,sprint,brace,ctx};
}

function cameraUpdate(dt){
  player.computeWorldMatrix(true);
  const p=player.getAbsolutePosition(),inn=run.carrier==='interior';
  const dist=inn?5.0:run.carrier==='head'?8.2:7.8;
  const height=inn?2.65:3.9;
  syaw=dampAngle(syaw,yaw,9,dt); spitch=damp(spitch,pitch,9,dt);
  const cp=Math.cos(spitch),off=new Vector3(-Math.sin(syaw)*cp*dist,height-Math.sin(spitch)*dist*.45,-Math.cos(syaw)*cp*dist);
  camKick.x=damp(camKick.x,0,4,dt);camKick.y=damp(camKick.y,0,4.8,dt);camKick.z=damp(camKick.z,0,4,dt);off.addInPlace(camKick);
  const target=p.add(new Vector3(0,1.0,0)),desired=target.add(off);
  camTarget.set(damp(camTarget.x,target.x,10,dt),damp(camTarget.y,target.y,9,dt),damp(camTarget.z,target.z,10,dt));
  camPos.set(damp(camPos.x,desired.x,inn?9:6.5,dt),damp(camPos.y,desired.y,inn?9:6,dt),damp(camPos.z,desired.z,inn?9:6.5,dt));
  camera.position.copyFrom(camPos); camera.setTarget(camTarget); rainPos.copyFrom(p).addInPlace(new Vector3(4,12,0));
}
function stormUpdate(dt){
  audio.setWind(run.carrier==='interior'?.10:(run.repaired?.45:.82));
  if(run.carrier!=='interior'&&!run.finale){ distantFlash-=dt; if(distantFlash<=0){ distantFlash=5+Math.random()*9; flash.intensity=2.4+Math.random()*2.5; setTimeout(()=>{if(!run.finale)flash.intensity=0;},70+Math.random()*90); } }
  if(run.finale){ scene.fogDensity=damp(scene.fogDensity,.002,.3,dt); scene.fogColor.r=damp(scene.fogColor.r,.30,.2,dt); scene.fogColor.g=damp(scene.fogColor.g,.36,.2,dt); scene.fogColor.b=damp(scene.fogColor.b,.37,.2,dt); hemi.intensity=damp(hemi.intensity,.78,.2,dt); sun.intensity=damp(sun.intensity,1.8,.2,dt); clouds.forEach((c,i)=>c.position.y+=dt*(.4+i*.10)); }
}

let last=performance.now(),saveClock=0;
function tick(now){
  const dt=Math.min(.05,Math.max(1/240,(now-last)/1000)),t=now/1000; last=now;
  motionUpdate(dt);
  const s=input.sample();
  if(!transition&&!run.finale){ const loc=playerUpdate(dt,t,s); const ctx=actionContext(); scenario(ctx,s,dt); actionUI(ctx,s.actionHeld); animation(loc.moving,loc.sprint,loc.brace); }
  fractureUpdate(dt); cameraUpdate(dt); stormUpdate(dt); syncObjective(); syncStability();
  if(run.finale){ finalTime+=dt; if(finalTime>4)ui.finish.hidden=false; }
  saveClock+=dt; if(saveClock>4){saveClock=0;persist();}
  scene.render(); requestAnimationFrame(tick);
}

async function boot(){
  try{
    await assets(); fracture?.setEnabled(!run.lightning); shards.forEach(s=>s.setEnabled(false)); if(run.repaired){audio.setRepaired(true);repair=1;}
    visibility(); attach(run.carrier,run.localX,run.localZ); setCheckpoint(); playExt(run.repaired?'Recover':run.lightning?'Strain':'Walk',.6); playInt(run.repaired?'Recovered':run.lightning?'Fail':'Pulse',.8); playPly('Idle'); syncObjective(); syncStability(); persist();
    await new Promise(r=>setTimeout(r,reduced?10:240)); ui.loading.classList.add('out'); setTimeout(()=>ui.loading.hidden=true,reduced?20:700); document.body.classList.add('ready');
    caption(stored.physicsVersion===PHYSICS_VERSION?'RUN RESTORED // ROUTE LOCKED':'НОВАЯ ТРАЕКТОРИЯ // СТАРТ НА СПИНЕ',1700);
    requestAnimationFrame(n=>{last=n;requestAnimationFrame(tick);});
  }catch(e){ console.error(e); ui.loading.hidden=true; ui.error.hidden=false; ui.errorText.textContent=e instanceof Error?e.message:String(e); }
}
addEventListener('resize',()=>engine.resize());
addEventListener('orientationchange',()=>setTimeout(()=>engine.resize(),160));
addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
void boot();
