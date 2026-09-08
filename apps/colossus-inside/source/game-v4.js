import {
  Color3, Color4, DirectionalLight, DynamicTexture, Engine, FreeCamera,
  HemisphericLight, Matrix, MeshBuilder, ParticleSystem, PointLight, Quaternion,
  Ray, Scene, SceneLoader, ShadowGenerator, StandardMaterial, TransformNode,
  Vector3, Viewport
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { clamp, damp, dampAngle } from './core.js';
import { ROUTES, TRAVERSAL_VERSION, balanceLean, carrierImpulse, climbAnchor, hasSupport, jumpStep, ledgeProbe, nearestSupportedZ, routePoint } from './traversal.js';
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
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const stored = read(RUN_KEY, {});
const raw = stored.physicsVersion === TRAVERSAL_VERSION ? stored : {};
const run = {
  carrier: ['back', 'shoulder', 'interior', 'head'].includes(raw.carrier) ? raw.carrier : 'back',
  lightning: !!raw.lightning,
  repaired: !!raw.repaired,
  finale: false,
  localX: Number.isFinite(raw.localX) ? raw.localX : 0,
  localZ: Number.isFinite(raw.localZ) ? raw.localZ : -11,
  completedRuns: Number(stored.completedRuns) || 0,
  sync: Array.isArray(raw.sync) && raw.sync.length === 3 ? raw.sync.map((v) => clamp(Number(v) || 0, 0, 1)) : [0, 0, 0]
};
const settings = read(SETTINGS_KEY, { muted: false });
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const quality = (navigator.hardwareConcurrency || 4) >= 6 && Math.min(innerWidth, innerHeight) >= 360;
const audio = createColossusAudio();
audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality, stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(quality ? Math.min(1.1, devicePixelRatio * 0.66) : Math.min(1.6, devicePixelRatio));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.035, 0.052, 0.056, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.09, 0.12, 0.125);
scene.fogDensity = 0.0022;
scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.exposure = 1.24;
scene.imageProcessingConfiguration.contrast = 1.08;
scene.imageProcessingConfiguration.toneMappingEnabled = true;

const camera = new FreeCamera('camera', new Vector3(0, 5, -8), scene);
camera.inputs.clear();
camera.minZ = 0.06;
camera.maxZ = 700;
camera.fov = 0.88;
scene.activeCamera = camera;

const hemi = new HemisphericLight('storm-fill', new Vector3(-0.18, 1, -0.22), scene);
hemi.intensity = 0.78;
hemi.diffuse = new Color3(0.58, 0.66, 0.64);
hemi.groundColor = new Color3(0.06, 0.055, 0.045);
const sun = new DirectionalLight('storm-key', new Vector3(-0.42, -0.88, 0.25), scene);
sun.position.set(20, 38, -28);
sun.intensity = quality ? 1.45 : 1.2;
sun.diffuse = new Color3(0.87, 0.81, 0.68);
const flash = new PointLight('lightning-flash', new Vector3(0, 24, 0), scene);
flash.intensity = 0;
flash.range = 160;
flash.diffuse = new Color3(0.70, 0.88, 1.0);
const shadows = new ShadowGenerator(quality ? 1024 : 512, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.002;

function loading(percent, title, detail) {
  ui.bar.style.width = `${percent}%`;
  ui.percent.textContent = `${percent}%`;
  ui.title.textContent = title;
  ui.text.textContent = detail;
}
function persist() {
  write(RUN_KEY, { physicsVersion: TRAVERSAL_VERSION, carrier: run.carrier, lightning: run.lightning, repaired: run.repaired, localX: +run.localX.toFixed(2), localZ: +run.localZ.toFixed(2), sync: run.sync.map((v) => +v.toFixed(3)), completedRuns: run.completedRuns });
}
function caption(text, ms = 1900) {
  ui.caption.textContent = text;
  ui.caption.classList.add('show');
  clearTimeout(caption.timer);
  caption.timer = setTimeout(() => ui.caption.classList.remove('show'), ms);
}
function pulse(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
ui.retry.onclick = () => location.reload();
ui.restart.onclick = () => { write(RUN_KEY, { physicsVersion: TRAVERSAL_VERSION, carrier: 'back', lightning: false, repaired: false, localX: 0, localZ: -11, sync: [0,0,0], completedRuns: run.completedRuns }); location.reload(); };
ui.sound.onclick = () => { settings.muted = !settings.muted; audio.setMuted(settings.muted); audio.ensure(); write(SETTINGS_KEY, settings); ui.sound.textContent = settings.muted ? 'MUTED' : 'SOUND'; ui.sound.classList.toggle('muted', settings.muted); };
ui.sound.textContent = settings.muted ? 'MUTED' : 'SOUND';

function basicMaterial(name, diffuse, emissive = null, metallic = false) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.ambientColor = diffuse.scale(0.45);
  m.specularColor = metallic ? new Color3(0.48, 0.48, 0.42) : new Color3(0.08, 0.08, 0.07);
  m.specularPower = metallic ? 70 : 22;
  if (emissive) m.emissiveColor = emissive;
  m.backFaceCulling = false;
  return m;
}
const M = {
  armor: basicMaterial('living-armor', new Color3(0.16,0.19,0.18), new Color3(0.012,0.016,0.015), true),
  edge: basicMaterial('living-edge', new Color3(0.31,0.22,0.08), new Color3(0.025,0.014,0.003), true),
  bone: basicMaterial('living-bone', new Color3(0.19,0.20,0.17), new Color3(0.012,0.013,0.010), true),
  tissue: basicMaterial('living-tissue', new Color3(0.15,0.035,0.026), new Color3(0.026,0.003,0.002)),
  sensor: basicMaterial('living-sensor', new Color3(0.03,0.34,0.28), new Color3(0.035,0.65,0.51)),
  dark: basicMaterial('living-recess', new Color3(0.045,0.058,0.055), new Color3(0.006,0.009,0.008), true)
};

const world = new TransformNode('World', scene);
const carriers = {
  back: new TransformNode('carrier-back', scene),
  shoulder: new TransformNode('carrier-shoulder', scene),
  interior: new TransformNode('carrier-interior', scene),
  head: new TransformNode('carrier-head', scene)
};
Object.values(carriers).forEach((n) => { n.parent = world; n.rotationQuaternion = Quaternion.Identity(); });
const player = new TransformNode('PlayerRoot', scene);
const playerVisual = new TransformNode('PlayerVisual', scene);
playerVisual.parent = player;
let playerModelRoot = null;
let playerGroups = [];
let currentAnim = '';
let colossusRoot = null;
let colossusWalk = null;
let boneNodes = {};
let interiorRoot = null;

const playerState = {
  y: routePoint(run.carrier, run.localX, run.localZ).y,
  vy: 0, airborne: false, falling: false, climbing: false, climbT: 0,
  climbFrom: null, climbTo: null, climbTargetCarrier: null,
  yaw: 0, walkSpeed: 0, stepClock: 0,
  checkpoint: { carrier: run.carrier, x: run.localX, z: nearestSupportedZ(run.carrier, run.localZ) },
  grace: 0, actionHold: 0, lastActionHeld: false, brace: 0, impact: 0
};

function attachPlayer(carrier, x, z, keepY = false) {
  run.carrier = carrier;
  player.parent = carriers[carrier];
  const p = routePoint(carrier, x, z);
  run.localX = p.x; run.localZ = p.z;
  if (!keepY) { playerState.y = p.y; playerState.vy = 0; playerState.airborne = false; }
  player.position.set(p.x, playerState.y, p.z);
  playerState.checkpoint = { carrier, x: p.x, z: nearestSupportedZ(carrier, p.z) };
  audio.setInside(carrier === 'interior');
  persist();
}
attachPlayer(run.carrier, run.localX, run.localZ);

function styleImported(mesh, zone) {
  if (!mesh || !mesh.material) return;
  const name = `${mesh.name} ${mesh.material.name}`;
  if (/Sensor|Visor|Stabilizer|Beacon/i.test(name)) mesh.material = M.sensor;
  else if (/Sinew|Muscle|Membrane|Heart|Vascular/i.test(name)) mesh.material = M.tissue;
  else if (/Edge|Rail|Ring|Valve|Piston|Gear|Clamp/i.test(name)) mesh.material = M.edge;
  else if (/Bone|Rib|Spine|Joint|Vertebra/i.test(name)) mesh.material = M.bone;
  else mesh.material = zone === 'player' ? M.edge : M.armor;
  mesh.receiveShadows = true;
  if (zone !== 'interior') shadows.addShadowCaster(mesh, true);
}

function findBoneNode(result, names) {
  const all = result.skeletons.flatMap((s) => s.bones);
  for (const wanted of names) {
    const bone = all.find((b) => b.name === wanted);
    const node = bone?.getTransformNode?.();
    if (node) return node;
  }
  return null;
}

function makePlate(parent, carrier, index, a, b) {
  const mid = (a+b)*0.5;
  const p = routePoint(carrier, 0, mid);
  const depth = Math.max(0.65, b-a-0.12);
  const width = Math.max(3.2, p.width*1.7);
  const shell = MeshBuilder.CreateBox(`anatomy-${carrier}-${index}`, { width, height: 0.34, depth }, scene);
  shell.parent = parent; shell.position.set(0,p.y-0.22,mid); shell.material = M.armor; shell.receiveShadows = true;
  const spine = MeshBuilder.CreateBox(`anatomy-spine-${carrier}-${index}`, { width: 0.72, height: 0.28, depth: depth*0.82 }, scene);
  spine.parent=parent; spine.position.set(0,p.y+0.02,mid); spine.material=M.edge;
  for (const side of [-1,1]) {
    const inset = MeshBuilder.CreateBox(`anatomy-inset-${carrier}-${index}-${side}`, { width: Math.max(0.8,width*0.18), height: 0.04, depth: depth*0.48 }, scene);
    inset.parent=parent; inset.position.set(side*width*0.27,p.y+0.015,mid+(index%2?-.12:.12)); inset.material=M.dark;
    if (carrier !== 'interior') {
      const socket = MeshBuilder.CreateCylinder(`anatomy-socket-${carrier}-${index}-${side}`, { diameter: 1.25, height: Math.min(2.0, depth*0.66), tessellation: 10 }, scene);
      socket.parent=parent; socket.rotation.x=Math.PI/2; socket.position.set(side*(width*0.5+0.46),p.y-0.62,mid); socket.material=M.bone;
      const collar = MeshBuilder.CreateTorus(`anatomy-collar-${carrier}-${index}-${side}`, { diameter:1.42, thickness:.13, tessellation:20 }, scene);
      collar.parent=parent; collar.rotation.x=Math.PI/2; collar.position.copyFrom(socket.position); collar.material=M.edge;
    }
  }
  return shell;
}

const routeMeshes = [];
function buildTraversalAnatomy() {
  for (const [carrier, route] of Object.entries(ROUTES)) route.pads.forEach(([a,b],i) => routeMeshes.push(makePlate(carriers[carrier], carrier, i, a, b)));
  for (const side of [-1,1]) {
    const scapula=MeshBuilder.CreateBox(`scapula-${side}`,{width:4.8,height:.48,depth:6.6},scene); scapula.parent=carriers.back; scapula.position.set(side*4.5,1.0,6.1); scapula.rotation.y=side*.17; scapula.rotation.z=side*.08; scapula.material=M.armor;
    const joint=MeshBuilder.CreateCylinder(`shoulder-joint-${side}`,{diameter:3.7,height:3.4,tessellation:14},scene); joint.parent=carriers.back; joint.rotation.z=Math.PI/2; joint.position.set(side*7.0,.55,9.0); joint.material=M.bone;
    const ring=MeshBuilder.CreateTorus(`shoulder-ring-${side}`,{diameter:4.1,thickness:.24,tessellation:28},scene); ring.parent=carriers.back; ring.rotation.y=Math.PI/2; ring.position.copyFrom(joint.position); ring.material=M.edge;
  }
  const neck=MeshBuilder.CreateBox('neck-landmark',{width:3.2,height:3.8,depth:2.8},scene); neck.parent=carriers.back; neck.position.set(0,2.2,13.0); neck.rotation.x=-.09; neck.material=M.bone;
  for (let i=0;i<5;i++) {
    const cable=MeshBuilder.CreateCylinder(`scale-cable-${i}`,{diameter:.55+(i%2)*.2,height:8.2,tessellation:10},scene); cable.parent=carriers.back; cable.rotation.x=Math.PI/2; cable.rotation.z=(i-2)*.08; cable.position.set(-4.6+i*2.25,.25,-5+i*3.7); cable.material=i%2?M.tissue:M.dark;
    const rivet=MeshBuilder.CreateSphere(`scale-rivet-${i}`,{diameter:1.0,segments:10},scene); rivet.parent=carriers.back; rivet.position.set((i%2?1:-1)*4.4,1.1,-8+i*4.4); rivet.material=M.edge;
  }
}
buildTraversalAnatomy();

function buildBranches() {
  const defs = [ ['back', -4.4, -1.8, 3.1, 5.4], ['back', 4.35, 3.0, 3.0, 4.8], ['shoulder', -3.25, -0.8, 2.0, 4.4], ['head', 3.4, 2.7, 2.2, 4.6] ];
  defs.forEach(([carrier,x,z,w,d],i)=>{
    const p=routePoint(carrier,clamp(x,-3,3),z);
    const shelf=MeshBuilder.CreateBox(`branch-${i}`,{width:w,height:.30,depth:d},scene); shelf.parent=carriers[carrier]; shelf.position.set(x,p.y-.25,z); shelf.rotation.y=(i%2?-.12:.12); shelf.material=M.dark;
    const rail=MeshBuilder.CreateCylinder(`branch-rail-${i}`,{diameter:.22,height:d*.95,tessellation:10},scene); rail.parent=carriers[carrier]; rail.rotation.x=Math.PI/2; rail.position.set(x+(x>0?-w*.42:w*.42),p.y+.42,z); rail.material=M.edge;
  });
}
buildBranches();

function buildInteriorMechanisms() {
  for (let i=0;i<7;i++) {
    const z=-10+i*3.65;
    for (const side of [-1,1]) {
      const rib=MeshBuilder.CreateBox(`internal-rib-${i}-${side}`,{width:.50,height:6.6,depth:.72},scene); rib.parent=carriers.interior; rib.position.set(side*4.65,3.5,z); rib.rotation.z=side*-.15; rib.material=M.bone;
      const tendon=MeshBuilder.CreateCylinder(`internal-tendon-${i}-${side}`,{diameter:.30,height:5.8,tessellation:10},scene); tendon.parent=carriers.interior; tendon.rotation.z=side*.72; tendon.position.set(side*3.0,3.5,z+.6); tendon.material=M.tissue;
    }
  }
  for (let i=0;i<5;i++) {
    const piston=MeshBuilder.CreateCylinder(`internal-piston-${i}`,{diameter:.72,height:3.5,tessellation:12},scene); piston.parent=carriers.interior; piston.rotation.z=Math.PI/2; piston.position.set(0,2.4,-7+i*4.0); piston.material=M.edge; piston.metadata={baseX:0,phase:i*.8};
  }
}
buildInteriorMechanisms();

const syncNodes = [];
function buildStabilizer() {
  for (let i=0;i<3;i++) {
    const x=(i-1)*2.15;
    const ring=MeshBuilder.CreateTorus(`sync-ring-${i}`,{diameter:1.7,thickness:.16,tessellation:30},scene); ring.parent=carriers.interior; ring.position.set(x,2.0,9.5); ring.rotation.x=Math.PI/2; ring.material=M.sensor;
    const core=MeshBuilder.CreateSphere(`sync-core-${i}`,{diameter:.42,segments:14},scene); core.parent=carriers.interior; core.position.set(x,2.0,9.5); core.material=M.sensor;
    const light=new PointLight(`sync-light-${i}`,Vector3.Zero(),scene); light.parent=core; light.intensity=.5; light.range=5; light.diffuse=new Color3(.12,.95,.72);
    syncNodes.push({ring,core,light,x,phase:i*2.1});
  }
}
buildStabilizer();

const debris = [];
let fracturePanel = null;
function buildLightningTarget() {
  fracturePanel=MeshBuilder.CreateBox('lightning-fracture-panel',{width:5.2,height:.42,depth:3.0},scene); fracturePanel.parent=carriers.back; fracturePanel.position.set(0,1.0,2.7); fracturePanel.material=M.armor;
  for(let i=0;i<12;i++){
    const shard=MeshBuilder.CreateBox(`fracture-shard-${i}`,{width:.45+Math.random()*.55,height:.18,depth:.55+Math.random()*.9},scene); shard.parent=carriers.back; shard.position.set((Math.random()-.5)*4.2,1.1,2.7+(Math.random()-.5)*2.3); shard.material=i%3===0?M.edge:M.armor; shard.setEnabled(false); debris.push({mesh:shard,v:new Vector3(),spin:new Vector3()});
  }
}
buildLightningTarget();

const rain = new ParticleSystem('rain', quality ? 900 : 420, scene);
const rainTex = new DynamicTexture('rain-tex',{width:8,height:32},scene,false); const rctx=rainTex.getContext(); rctx.clearRect(0,0,8,32); rctx.fillStyle='rgba(190,225,235,.8)'; rctx.fillRect(3,0,2,28); rainTex.update();
rain.particleTexture=rainTex; rain.emitter=new Vector3(0,18,0); rain.minEmitBox=new Vector3(-28,0,-30); rain.maxEmitBox=new Vector3(28,0,30); rain.color1=new Color4(.48,.68,.72,.42); rain.color2=new Color4(.35,.55,.60,.2); rain.minSize=.025; rain.maxSize=.06; rain.minLifeTime=.35; rain.maxLifeTime=.7; rain.emitRate=quality?800:360; rain.gravity=new Vector3(-3,-40,4); rain.direction1=new Vector3(-2,-18,2); rain.direction2=new Vector3(-5,-26,6); rain.minEmitPower=1; rain.maxEmitPower=1.8; rain.updateSpeed=.012; rain.start();

const abyss=MeshBuilder.CreateGround('distant-ground',{width:900,height:900,subdivisions:2},scene); abyss.position.y=-78; abyss.material=basicMaterial('distant-ground-mat',new Color3(.028,.038,.037));
for(let i=0;i<3;i++){
  const giant=MeshBuilder.CreateCapsule(`distant-colossus-${i}`,{height:42+i*8,radius:6+i*1.2,tessellation:8},scene); giant.position.set(-110+i*105,-56,145+i*85); giant.scaling.x=.6; giant.material=basicMaterial(`distant-mat-${i}`,new Color3(.035,.045,.043));
}

const input=createInput({canvas,joystick:ui.joystick,knob:ui.knob,actionButton:ui.action,onFirstGesture:()=>audio.ensure()});
let lookYaw=0, lookPitch=-0.12;
let lastCarrierPos=new Vector3(), carrierVelocity=new Vector3(), previousCarrierVelocity=new Vector3();
let carrierSampleReady=false;
let gaitPhase=0, gaitPrevFoot=0, elapsed=0;
let lightningClock=0, lightningFlash=0, stormClear=0;

function setAnim(name,speed=1){
  if(currentAnim===name)return;
  currentAnim=name;
  for(const g of playerGroups) g.stop();
  const g=playerGroups.find((a)=>a.name.toLowerCase().includes(name.toLowerCase()));
  g?.start(true,speed);
}

function updateBoneCarriers() {
  const fallback = {
    back: {p:new Vector3(0,4.0,-1.8),r:Quaternion.FromEulerAngles(.018*Math.sin(gaitPhase*2),0,.025*Math.sin(gaitPhase))},
    shoulder:{p:new Vector3(5.8,4.25,2.2),r:Quaternion.FromEulerAngles(.05*Math.sin(gaitPhase),0,.07*Math.sin(gaitPhase+.8))},
    head:{p:new Vector3(0,12.2,4.0),r:Quaternion.FromEulerAngles(.03*Math.sin(gaitPhase+.5),0,.025*Math.sin(gaitPhase))},
    interior:{p:new Vector3(0,2.6,.6),r:Quaternion.FromEulerAngles(.02*Math.sin(gaitPhase*2),0,.018*Math.sin(gaitPhase))}
  };
  const map={back:boneNodes.chest,shoulder:boneNodes.shoulder,head:boneNodes.head,interior:boneNodes.chest};
  for(const key of Object.keys(carriers)){
    const node=map[key];
    if(node){
      node.computeWorldMatrix(true);
      const s=new Vector3(),q=new Quaternion(),p=new Vector3(); node.getWorldMatrix().decompose(s,q,p);
      carriers[key].position.copyFrom(p); carriers[key].rotationQuaternion.copyFrom(q);
      const offset=key==='back'?new Vector3(0,1.5,-1.5):key==='shoulder'?new Vector3(-1.6,1.0,0):key==='head'?new Vector3(0,1.2,0):new Vector3(0,-1.8,-1.2);
      carriers[key].position.addInPlace(offset);
    }else{ carriers[key].position.copyFrom(fallback[key].p); carriers[key].rotationQuaternion.copyFrom(fallback[key].r); }
  }
}

function worldSupport(carrier,x,z){
  if(!hasSupport(carrier,x,z,0.02)) return false;
  if(run.lightning && carrier==='back' && z>1.7 && z<4.9 && Math.abs(x)<1.55) return false;
  return true;
}

function beginClimb(targetCarrier,targetX,targetZ,label='ЗАХВАТ // ПОДЪЁМ'){
  if(playerState.climbing||playerState.falling)return;
  playerState.climbing=true; playerState.airborne=false; playerState.vy=0; playerState.climbT=0;
  playerState.climbFrom={carrier:run.carrier,x:run.localX,z:run.localZ,y:playerState.y};
  playerState.climbTargetCarrier=targetCarrier;
  playerState.climbTo={x:targetX,z:targetZ,y:routePoint(targetCarrier,targetX,targetZ).y};
  audio.grab(); pulse(20); caption(label,1200); setAnim('Grab');
}
function updateClimb(dt){
  playerState.climbT+=dt/0.72; const t=clamp(playerState.climbT,0,1); const s=t*t*(3-2*t);
  if(playerState.climbTargetCarrier!==run.carrier && t>0.48){ attachPlayer(playerState.climbTargetCarrier,playerState.climbTo.x,playerState.climbTo.z,true); playerState.climbTargetCarrier=run.carrier; }
  run.localX=playerState.climbFrom.x+(playerState.climbTo.x-playerState.climbFrom.x)*s;
  run.localZ=playerState.climbFrom.z+(playerState.climbTo.z-playerState.climbFrom.z)*s;
  playerState.y=playerState.climbFrom.y+(playerState.climbTo.y-playerState.climbFrom.y)*s+Math.sin(Math.PI*t)*.9;
  player.position.set(run.localX,playerState.y,run.localZ);
  playerVisual.rotation.x=-.25*Math.sin(Math.PI*t);
  if(t>=1){ playerState.climbing=false; playerState.y=playerState.climbTo.y; player.position.y=playerState.y; setAnim('Idle'); playerState.checkpoint={carrier:run.carrier,x:run.localX,z:nearestSupportedZ(run.carrier,run.localZ)}; persist(); }
}

function triggerLightning(){
  if(run.lightning)return;
  run.lightning=true; lightningFlash=1; flash.position.copyFrom(carriers.back.getAbsolutePosition()).addInPlace(new Vector3(0,18,3)); audio.lightning(); pulse([60,30,120]); caption('IMPACT // DORSAL ARMOR FAILURE',2200);
  fracturePanel?.setEnabled(false);
  for(const [i,d] of debris.entries()){
    d.mesh.setEnabled(true); d.v.set((i-5.5)*.55+(Math.random()-.5)*2,3+Math.random()*4,-1+Math.random()*5); d.spin.set(Math.random()*3,Math.random()*4,Math.random()*3);
  }
  playerState.vy=Math.max(playerState.vy,4.2); playerState.airborne=true; run.localX+=1.1; playerState.impact=1;
  persist();
}

function objectiveInfo(){
  if(run.carrier==='back'&&!run.lightning)return ['01','DORSAL SHELTER · 01','Иди по позвоночнику. Шторм приближается.'];
  if(run.carrier==='back')return ['02','FRACTURED DORSAL · 02','Обойди выбитую броню и доберись до плечевого шарнира.'];
  if(run.carrier==='shoulder')return ['03','SCAPULAR JOINT · 03','Поднимись по плечу и войди в сервисный люк.'];
  if(run.carrier==='interior'&&!run.repaired){const done=run.sync.filter((v)=>v>=1).length;return ['04','THORACIC CORE · 04',`Синхронизируй три узла стабилизатора (${done}/3).`];}
  if(run.carrier==='interior')return ['05','THORACIC CORE · 05','Стабилизатор работает. Поднимайся к шейному каналу.'];
  return ['06','CRANIAL DECK · 06','Доберись до переднего края головы.'];
}
function syncObjective(){ const [i,z,t]=objectiveInfo(); ui.objectiveIndex.textContent=i; ui.zone.textContent=z; ui.objective.textContent=t; }
syncObjective();

function updateActionUI(sample){
  const anchor=climbAnchor({carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,x:run.localX,z:run.localZ});
  const dir=Math.abs(sample.moveY)>.1?Math.sign(sample.moveY):1;
  const ledge=ledgeProbe(run.carrier,run.localX,run.localZ,dir,.62);
  let label='JUMP',hint='нажать · у края удерживать',glyph='↑',hot=false;
  if(run.carrier==='interior'&&!run.repaired&&run.localZ>8.25){
    const nearest=syncNodes.reduce((best,n,i)=>Math.abs(run.localX-n.x)<best.d?{i,d:Math.abs(run.localX-n.x)}:best,{i:0,d:99});
    label=`SYNC ${nearest.i+1}/3`; hint=run.sync[nearest.i]>=1?'узел зафиксирован':'встань у кольца · удерживай'; glyph='↻'; hot=nearest.d<.95;
  }else if(anchor){label=anchor.type==='hatch'?'ENTER':'CLIMB';hint='удерживать';glyph='↑';hot=true;}
  else if(ledge){label='GRAB';hint='удерживать у края';glyph='⌃';hot=true;}
  ui.actionLabel.textContent=label; ui.actionHint.textContent=hint; ui.actionGlyph.textContent=glyph; ui.action.classList.toggle('hot',hot);
  ui.action.style.setProperty('--progress',String(clamp(playerState.actionHold/.42,0,1)));
}

function updateRepair(dt,sample){
  if(run.carrier!=='interior'||run.repaired||run.localZ<8.25)return;
  const nearest=syncNodes.reduce((best,n,i)=>Math.abs(run.localX-n.x)<best.d?{i,d:Math.abs(run.localX-n.x)}:best,{i:0,d:99});
  if(sample.actionHeld&&nearest.d<.95){
    const i=nearest.i;
    if(run.sync[i]<1){run.sync[i]=clamp(run.sync[i]+dt*.56,0,1);audio.repairPulse(run.sync[i]);playerState.brace=1;}
    if(run.sync[i]>=1&&syncNodes[i].core.metadata?.locked!==true){syncNodes[i].core.metadata={locked:true};caption(`NODE ${i+1} // PHASE LOCKED`,1100);pulse(24);persist();}
  }
  run.sync.forEach((v,i)=>{const n=syncNodes[i];n.ring.rotation.z+=dt*(v>=1?.18:1.3+i*.22);n.core.scaling.setAll(1+Math.sin(elapsed*5+n.phase)*.08*(1-v));n.light.intensity=.4+v*1.0;});
  if(run.sync.every((v)=>v>=1)){
    run.repaired=true;audio.setRepaired(true);audio.repairComplete();caption('STABILIZER // THREE PHASES LOCKED',2600);pulse([30,30,60]);persist();syncObjective();
  }
}

function respawn(){ playerState.falling=false; playerState.airborne=false; playerState.vy=0; playerState.grace=.8; attachPlayer(playerState.checkpoint.carrier,playerState.checkpoint.x,playerState.checkpoint.z); caption('TETHER RECOVERY // CHECKPOINT',1500);pulse(30); }

function updateMovement(dt,sample){
  if(playerState.climbing){updateClimb(dt);return;}
  const route=ROUTES[run.carrier];
  const moveMag=Math.hypot(sample.moveX,sample.moveY);
  const speed=(sample.sprint?3.45:2.15)*(playerState.airborne?.72:1);
  const sin=Math.sin(lookYaw),cos=Math.cos(lookYaw);
  const dx=(sample.moveX*cos+sample.moveY*sin)*speed*dt;
  const dz=(sample.moveY*cos-sample.moveX*sin)*speed*dt;
  run.localX=clamp(run.localX+dx,-route.width(run.localZ)-.5,route.width(run.localZ)+.5);
  run.localZ=clamp(run.localZ+dz,route.minZ-.7,route.maxZ+.7);
  if(moveMag>.08) playerState.yaw=dampAngle(playerState.yaw,Math.atan2(dx||.001,dz||.001),14,dt);
  playerState.walkSpeed=damp(playerState.walkSpeed,moveMag*speed,10,dt);
  const ground=routePoint(run.carrier,run.localX,run.localZ).y;
  const supported=worldSupport(run.carrier,run.localX,run.localZ);
  const released=playerState.lastActionHeld&&!sample.actionHeld;
  if(sample.actionPressed&&!playerState.airborne){playerState.vy=5.0;playerState.airborne=true;audio.step(.8);pulse(8);setAnim('Jump');}
  playerState.actionHold=sample.actionHeld?playerState.actionHold+dt:0;
  const direction=Math.abs(sample.moveY)>.08?Math.sign(sample.moveY):1;
  const generic=ledgeProbe(run.carrier,run.localX,run.localZ,direction,.66);
  const story=climbAnchor({carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,x:run.localX,z:run.localZ});
  if(sample.actionHeld&&playerState.actionHold>.42){
    if(story){playerState.actionHold=0;beginClimb(story.target.carrier,story.target.x,story.target.z,story.type==='hatch'?'SERVICE HATCH // DESCENT':'BONE ANCHOR // CLIMB');syncObjective();}
    else if(generic){playerState.actionHold=0;beginClimb(run.carrier,generic.x,generic.landingZ,'EDGE GRAB // PULL UP');}
  }else if(released&&playerState.actionHold>0&&playerState.actionHold<.42&&!playerState.airborne){playerState.vy=5;playerState.airborne=true;}
  if(playerState.airborne){
    const step=jumpStep({y:playerState.y,vy:playerState.vy,groundY:ground,dt,supported}); playerState.y=step.y;playerState.vy=step.vy;playerState.airborne=step.airborne;
    if(step.landed){audio.step(1.2);pulse(10);playerState.impact=.55;setAnim(moveMag>.2?'Walk':'Land');}
  }else if(supported){playerState.y=damp(playerState.y,ground,18,dt);}
  else{playerState.airborne=true;playerState.vy=Math.min(playerState.vy,0);}
  if(playerState.y<ground-6.5){playerState.falling=true;caption('TETHER // FALL ARREST',900);setTimeout(respawn,520);}
  if(supported&&!playerState.airborne&&playerState.grace<=0&&Math.abs(run.localZ-playerState.checkpoint.z)>1.2) playerState.checkpoint={carrier:run.carrier,x:run.localX,z:nearestSupportedZ(run.carrier,run.localZ)};
  playerState.grace=Math.max(0,playerState.grace-dt);
  if(!playerState.airborne&&!playerState.climbing&&carrierSampleReady){
    const impulse=carrierImpulse(previousCarrierVelocity,carrierVelocity,dt,playerState.brace);
    if(impulse.magnitude>1.2){run.localX=clamp(run.localX+impulse.x*dt,-route.width(run.localZ),route.width(run.localZ));run.localZ=clamp(run.localZ+impulse.z*dt,route.minZ,route.maxZ);playerState.impact=Math.max(playerState.impact,Math.min(1,impulse.magnitude/10));}
  }
  playerState.brace=damp(playerState.brace,sample.actionHeld?.7:0,8,dt);
  playerState.lastActionHeld=sample.actionHeld;
  player.position.set(run.localX,playerState.y,run.localZ);
  const lean=balanceLean(carrierVelocity,previousCarrierVelocity,dt);
  playerVisual.rotation.y=playerState.yaw;
  playerVisual.rotation.x=damp(playerVisual.rotation.x,lean.pitch+(playerState.airborne?-.08:0),8,dt);
  playerVisual.rotation.z=damp(playerVisual.rotation.z,lean.roll-sample.moveX*.06,8,dt);
  playerState.impact=damp(playerState.impact,0,5,dt);
  if(!playerState.airborne){if(moveMag>.72)setAnim('Run',1.05);else if(moveMag>.12)setAnim('Walk',.9);else setAnim('Idle');}
  playerState.stepClock+=dt*playerState.walkSpeed;
  if(playerState.walkSpeed>.8&&playerState.stepClock>1.25){playerState.stepClock=0;audio.step(sample.sprint?1.1:.75);}
}

function updateGait(dt){
  gaitPhase+=dt*(run.repaired?.58:.46);
  const foot=Math.sin(gaitPhase*2);
  if(gaitPrevFoot<=0&&foot>0){audio.colossusStep(run.lightning&&!run.repaired?.7:0);pulse(run.repaired?8:14);}
  gaitPrevFoot=foot;
  if(colossusWalk) colossusWalk.speedRatio=run.repaired?.45:.34;
  stormClear=damp(stormClear,run.repaired?1:0,0.35,dt);
  scene.fogDensity=damp(scene.fogDensity,run.carrier==='interior'?.0055:(.0022-stormClear*.0011),2,dt);
  scene.fogColor=Color3.Lerp(scene.fogColor,run.repaired&&run.carrier!=='interior'?new Color3(.16,.20,.20):new Color3(.09,.12,.125),1-Math.exp(-dt*1.2));
  rain.emitRate=(quality?800:360)*(1-stormClear*.68);
  audio.setWind(run.carrier==='interior'?.12:.75-stormClear*.42);
}

function updateLightning(dt){
  lightningClock+=dt;
  if(!run.lightning&&run.carrier==='back'&&(run.localZ>-1.9||lightningClock>22))triggerLightning();
  if(lightningFlash>0){lightningFlash=Math.max(0,lightningFlash-dt*1.8);flash.intensity=Math.pow(lightningFlash,1.7)*32;}
  for(const d of debris){if(!d.mesh.isEnabled())continue;d.v.y-=11*dt;d.mesh.position.addInPlace(d.v.scale(dt));d.mesh.rotation.x+=d.spin.x*dt;d.mesh.rotation.y+=d.spin.y*dt;d.mesh.rotation.z+=d.spin.z*dt;if(d.mesh.position.y<-14)d.mesh.setEnabled(false);}
}

function updateInteriorMechanisms(){
  for(const mesh of scene.meshes){if(!/^internal-piston-/.test(mesh.name))continue;const p=mesh.metadata?.phase||0;mesh.position.x=Math.sin(elapsed*(run.repaired?1.5:2.1)+p)*(run.repaired?.22:.58);}
}

function updateCamera(dt,sample){
  lookYaw=dampAngle(lookYaw,lookYaw+sample.lookX*.0045,24,dt);
  lookPitch=clamp(lookPitch+sample.lookY*.0038,-.58,.42);
  const focus=player.getAbsolutePosition().add(new Vector3(0,1.15,0));
  const dist=run.carrier==='interior'?5.1:7.4;
  const fovTarget=.86+(playerState.airborne?.08:0)+(playerState.falling?.11:0);
  camera.fov=damp(camera.fov,fovTarget,5,dt);
  const yaw=lookYaw+Math.PI;
  const desired=focus.add(new Vector3(Math.sin(yaw)*Math.cos(lookPitch)*dist,2.6+Math.sin(-lookPitch)*dist*.55,Math.cos(yaw)*Math.cos(lookPitch)*dist));
  const rayVec=desired.subtract(focus); const rayLen=rayVec.length();
  let final=desired;
  if(rayLen>.1){const hit=scene.pickWithRay(new Ray(focus,rayVec.normalize(),rayLen),m=>m.isPickable&&m!==playerModelRoot);if(hit?.hit&&hit.distance<rayLen-.25)final=focus.add(rayVec.normalize().scale(Math.max(1.7,hit.distance-.35)));}
  const shake=reduced?0:playerState.impact*.12;
  final.x+=Math.sin(elapsed*31)*shake;final.y+=Math.sin(elapsed*23)*shake*.6;
  camera.position=Vector3.Lerp(camera.position,final,1-Math.exp(-dt*9));
  camera.setTarget(focus.add(new Vector3(0,.1,0)));
  rain.emitter.copyFrom(camera.position).addInPlace(new Vector3(0,15,0));
}

function updateCarrierVelocity(dt){
  const p=carriers[run.carrier].getAbsolutePosition();
  if(!carrierSampleReady){lastCarrierPos.copyFrom(p);carrierSampleReady=true;return;}
  previousCarrierVelocity.copyFrom(carrierVelocity);
  carrierVelocity.copyFrom(p.subtract(lastCarrierPos).scale(1/Math.max(dt,1/120)));
  lastCarrierPos.copyFrom(p);
}

function updateObjectiveMarker(){
  let target=null;
  if(run.carrier==='back'&&run.lightning)target=carriers.back.getAbsolutePosition().add(new Vector3(0,3,12));
  else if(run.carrier==='interior'&&!run.repaired){const i=run.sync.findIndex(v=>v<1);if(i>=0)target=syncNodes[i].core.getAbsolutePosition();}
  if(!target){document.documentElement.style.setProperty('--world-arrow-opacity','0');return;}
  const projected=Vector3.Project(target,Matrix.Identity(),scene.getTransformMatrix(),new Viewport(0,0,innerWidth,innerHeight));
  const angle=Math.atan2(projected.y-innerHeight*.5,projected.x-innerWidth*.5);
  document.documentElement.style.setProperty('--world-arrow-opacity','1');
  document.documentElement.style.setProperty('--world-arrow-x',`${clamp(projected.x,110,innerWidth-110)}px`);
  document.documentElement.style.setProperty('--world-arrow-y',`${clamp(projected.y,90,innerHeight-90)}px`);
  document.documentElement.style.setProperty('--world-arrow-rot',`${angle+Math.PI/2}rad`);
}

function updateFinale(){
  if(run.carrier==='head'&&!run.finale&&run.localZ>7.3){run.finale=true;run.completedRuns+=1;persist();audio.finale();caption('HORIZON // MULTIPLE COLOSSAL SIGNATURES',2600);setTimeout(()=>{ui.finish.hidden=false;ui.finish.classList.add('show');},1500);}
}

const testState={ready:false,carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,airborne:false,falling:false,climbing:false,sync:[...run.sync],fps:0,physicsVersion:TRAVERSAL_VERSION};
globalThis.__PW_TEST_STATE__=testState;
function updateTestState(){testState.ready=true;testState.carrier=run.carrier;testState.lightning=run.lightning;testState.repaired=run.repaired;testState.airborne=playerState.airborne;testState.falling=playerState.falling;testState.climbing=playerState.climbing;testState.x=run.localX;testState.z=run.localZ;testState.sync=[...run.sync];testState.fps=Math.round(engine.getFps());}

async function loadAssets(){
  try{
    loading(12,'Пробуждаем колосса','Blender armature · bone-linked traversal');
    const col=await SceneLoader.ImportMeshAsync('','./models/','colossus.glb',scene);
    loading(48,'Привязываем уровень к скелету','chest · shoulder · head transforms');
    colossusRoot=col.meshes.find(m=>m.name==='__root__')||col.meshes[0];
    if(colossusRoot){colossusRoot.parent=world;colossusRoot.scaling.setAll(.29);colossusRoot.rotation.y=Math.PI;colossusRoot.position.set(0,-22.4,-1.2);}
    col.meshes.forEach(m=>styleImported(m,'exterior'));
    colossusWalk=col.animationGroups.find(g=>/walk/i.test(g.name))||col.animationGroups[0]||null; colossusWalk?.start(true,.34);
    boneNodes={chest:findBoneNode(col,['chest','spine_02']),shoulder:findBoneNode(col,['shoulder_R','shoulder_L']),head:findBoneNode(col,['head','neck'])};
    loading(66,'Загружаем путешественника','Idle · Walk · Run · Jump · Grab · Land');
    const traveler=await SceneLoader.ImportMeshAsync('','./models/','player.glb',scene);
    playerModelRoot=traveler.meshes.find(m=>m.name==='__root__')||traveler.meshes[0];
    if(playerModelRoot){playerModelRoot.parent=playerVisual;playerModelRoot.scaling.setAll(.92);playerModelRoot.rotation.y=0;playerModelRoot.position.y=0;}
    traveler.meshes.forEach(m=>styleImported(m,'player')); playerGroups=traveler.animationGroups; setAnim('Idle');
    loading(82,'Открываем грудной отсек','Blender interior · living pistons · stabilizer');
    const intr=await SceneLoader.ImportMeshAsync('','./models/','interior.glb',scene);
    interiorRoot=intr.meshes.find(m=>m.name==='__root__')||intr.meshes[0];
    if(interiorRoot){interiorRoot.parent=carriers.interior;interiorRoot.scaling.setAll(.72);interiorRoot.rotation.y=Math.PI;interiorRoot.position.set(0,-.35,2.2);}
    intr.meshes.forEach(m=>styleImported(m,'interior'));
    loading(100,'Система проснулась','Живой уровень готов');
    updateBoneCarriers();attachPlayer(run.carrier,run.localX,run.localZ);
    setTimeout(()=>{ui.loading.classList.add('hidden');setTimeout(()=>ui.loading.hidden=true,500);caption('TETHER ONLINE // FEEL THE GAIT',1500);},220);
  }catch(error){console.error(error);ui.loading.hidden=true;ui.error.hidden=false;ui.errorText.textContent=error instanceof Error?error.message:'Не удалось загрузить Blender assets';}
}

let last=performance.now();
engine.runRenderLoop(()=>{
  const now=performance.now();const dt=Math.min(.033,Math.max(.001,(now-last)/1000));last=now;elapsed+=dt;
  const sample=input.sample();
  updateGait(dt);updateBoneCarriers();updateCarrierVelocity(dt);updateLightning(dt);updateMovement(dt,sample);updateRepair(dt,sample);updateInteriorMechanisms();updateCamera(dt,sample);updateActionUI(sample);updateObjectiveMarker();updateFinale();syncObjective();updateTestState();
  ui.fill.style.width=`${run.repaired?92:run.lightning?44:72}%`;ui.stability.textContent=run.repaired?'STABLE':run.lightning?'ASYMMETRIC':'HEAVY';ui.meter.classList.toggle('danger',run.lightning&&!run.repaired);
  scene.render();
});
window.addEventListener('resize',()=>engine.resize());
window.addEventListener('beforeunload',()=>{persist();audio.dispose();engine.dispose();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
void loadAssets();
