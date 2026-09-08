import { Color3, Color4, DirectionalLight, DynamicTexture, Engine, FreeCamera, HemisphericLight, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene, SceneLoader, ShadowGenerator, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { clamp, clampToCarrier, damp, dampAngle, edgeDanger, scenarioFlags, surfaceImpulse } from './core.js';
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
const raw = read(RUN_KEY, {});
const run = {
  carrier: ['back','shoulder','interior','head'].includes(raw.carrier) ? raw.carrier : 'back',
  lightning: !!raw.lightning, repaired: !!raw.repaired, finale: false,
  completedRuns: Number(raw.completedRuns) || 0,
  localX: Number.isFinite(raw.localX) ? raw.localX : 0,
  localZ: Number.isFinite(raw.localZ) ? raw.localZ : -12
};
const settings = read(SETTINGS_KEY, { muted: false });
const quality = (navigator.hardwareConcurrency || 4) >= 6 && Math.min(innerWidth, innerHeight) >= 360;
const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const audio = createColossusAudio();
audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality, stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(quality ? Math.min(1.25, devicePixelRatio * .72) : Math.min(1.8, devicePixelRatio));
const scene = new Scene(engine);
scene.clearColor = new Color4(.06,.085,.095,1); scene.fogMode = Scene.FOGMODE_EXP2; scene.fogColor = new Color3(.22,.29,.31); scene.fogDensity = .0055; scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.exposure = 1.04; scene.imageProcessingConfiguration.contrast = 1.14; scene.imageProcessingConfiguration.toneMappingEnabled = true;
const camera = new FreeCamera('camera', new Vector3(0,4,-7), scene); camera.inputs.clear(); camera.minZ=.08; camera.maxZ=420; camera.fov=.86; scene.activeCamera=camera;
const hemi = new HemisphericLight('fill', new Vector3(-.2,1,-.1), scene); hemi.intensity=.62; hemi.diffuse=new Color3(.55,.66,.69); hemi.groundColor=new Color3(.06,.07,.06);
const sun = new DirectionalLight('storm', new Vector3(-.42,-.88,.26), scene); sun.position.set(18,34,-28); sun.intensity=quality?1.35:1.1; sun.diffuse=new Color3(.68,.77,.8);
const flash = new PointLight('flash', new Vector3(0,20,0), scene); flash.intensity=0; flash.range=100; flash.diffuse=new Color3(.8,.92,1);
const shadows = new ShadowGenerator(quality?1024:512, sun); shadows.usePercentageCloserFiltering=true; shadows.bias=.0015;

function loading(p,t,d){ ui.bar.style.width=`${p}%`; ui.percent.textContent=`${p}%`; ui.title.textContent=t; ui.text.textContent=d; }
function persist(){ write(RUN_KEY,{carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,localX:+run.localX.toFixed(2),localZ:+run.localZ.toFixed(2),completedRuns:run.completedRuns}); }
function caption(text, ms=2200){ ui.caption.textContent=text; ui.caption.classList.add('show'); clearTimeout(caption.t); caption.t=setTimeout(()=>ui.caption.classList.remove('show'),ms); }
function pulse(pattern){ if(navigator.vibrate) navigator.vibrate(pattern); }
ui.retry.onclick=()=>location.reload();
ui.restart.onclick=()=>{ write(RUN_KEY,{carrier:'back',lightning:false,repaired:false,localX:0,localZ:-12,completedRuns:run.completedRuns}); location.reload(); };
ui.sound.onclick=()=>{ settings.muted=!settings.muted; audio.setMuted(settings.muted); audio.ensure(); write(SETTINGS_KEY,settings); syncSound(); };
function syncSound(){ ui.sound.textContent=settings.muted?'MUTED':'SOUND'; ui.sound.classList.toggle('muted',settings.muted); } syncSound();

const motion = new TransformNode('carrier_root',scene), pelvis=new TransformNode('carrier_pelvis',scene), chest=new TransformNode('carrier_chest',scene), back=new TransformNode('carrier_back',scene), shoulder=new TransformNode('carrier_shoulder',scene), head=new TransformNode('carrier_head',scene), inside=new TransformNode('carrier_interior',scene);
pelvis.parent=motion; chest.parent=pelvis; chest.position.y=2.4; back.parent=chest; back.position.set(0,.35,-1.8); shoulder.parent=chest; shoulder.position.set(5.6,.15,2); head.parent=chest; head.position.set(0,8.1,4); inside.parent=chest; inside.position.set(0,-1.15,.5);
const carriers={back,shoulder,head,interior:inside};
const player=new TransformNode('PlayerRoot',scene), playerVisual=new TransformNode('PlayerVisual',scene); playerVisual.parent=player;
function attach(carrier,x,z){ player.parent=carriers[carrier]; const p=clampToCarrier(carrier,{x,y:0,z}); player.position.set(p.x,p.y,p.z); run.localX=p.x; run.localZ=p.z; }
attach(run.carrier,run.localX,run.localZ);
const exterior=new TransformNode('Exterior',scene); exterior.parent=motion; exterior.scaling.setAll(.29); exterior.rotation.y=Math.PI; exterior.position.set(0,-20,-1.2);
const interior=new TransformNode('Interior',scene); interior.parent=inside; interior.scaling.setAll(.72); interior.rotation.y=Math.PI; interior.position.set(0,-.35,2.2);
const world=new TransformNode('World',scene);

function mat(name,color,emissive=null){const m=new StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=new Color3(.05,.06,.06);if(emissive)m.emissiveColor=emissive;return m;}
const abyss=MeshBuilder.CreateCylinder('abyss',{diameter:360,height:2,tessellation:64},scene); abyss.position.y=-30; abyss.parent=world; abyss.material=mat('abyssmat',new Color3(.08,.11,.12));
const clouds=[];
for(let i=0;i<3;i++){const p=MeshBuilder.CreatePlane(`cloud${i}`,{width:170,height:56},scene);p.parent=world;p.position.set((i-1)*48,12+i*10,78+i*30);p.rotation.y=i%2?.22:-.18;const m=mat(`cloudmat${i}`,new Color3(.20+i*.02,.24+i*.02,.25+i*.02));m.alpha=.36;m.backFaceCulling=false;p.material=m;clouds.push(p);}
const rainTex=new DynamicTexture('rainTex',{width:8,height:48},scene,false);{const c=rainTex.getContext(),g=c.createLinearGradient(0,0,0,48);g.addColorStop(0,'rgba(220,235,238,0)');g.addColorStop(.5,'rgba(220,235,238,.85)');g.addColorStop(1,'rgba(220,235,238,0)');c.fillStyle=g;c.fillRect(3,0,2,48);rainTex.hasAlpha=true;rainTex.update(false);}
const rainPos=new Vector3(), rain=new ParticleSystem('rain',quality?1400:650,scene); rain.particleTexture=rainTex;rain.emitter=rainPos;rain.minEmitBox=new Vector3(-13,0,-10);rain.maxEmitBox=new Vector3(13,5,10);rain.direction1=new Vector3(-6,-24,-1);rain.direction2=new Vector3(-8,-28,1);rain.minLifeTime=.5;rain.maxLifeTime=.8;rain.minSize=.1;rain.maxSize=.23;rain.emitRate=quality?850:400;rain.color1=new Color4(.7,.82,.84,.65);rain.color2=new Color4(.45,.6,.64,.38);rain.start();

let extGroups=[], intGroups=[], plyGroups=[], extAnim='', intAnim='', plyAnim='', fracture=null, shards=[], hatch=null, stabilizer=null, secondary=[], scarf=[];
const find=(groups,name)=>groups.find(g=>g.name.toLowerCase().includes(name.toLowerCase()))||groups[0];
function play(groups,name,loop=true,speed=1){const g=find(groups,name);if(!g)return;groups.forEach(x=>{if(x!==g&&x.isPlaying)x.stop();});if(!g.isPlaying)g.start(loop,speed,g.from,g.to,false);g.speedRatio=speed;}
function playExt(n,s=1){if(extAnim!==n){extAnim=n;play(extGroups,n,true,s);}}
function playInt(n,s=1){if(intAnim!==n){intAnim=n;play(intGroups,n,true,s);}}
function playPly(n,loop=true,s=1){if(plyAnim!==n||!loop){plyAnim=n;play(plyGroups,n,loop,s);}}
async function load(name,parent,onMesh){const r=await SceneLoader.ImportMeshAsync('','./models/',name,scene);r.meshes.filter(x=>!x.parent).forEach(x=>x.parent=parent);r.meshes.forEach(x=>{x.isPickable=false;if(x instanceof Mesh){x.receiveShadows=quality;onMesh?.(x);}});return r;}
async function assets(){
  loading(10,'Проверяем скелет','Colossus armature · authored armor');
  const a=await load('colossus.glb',exterior,m=>{if(/BackPlate|ShoulderDeck|HeadDeck|Fracture|Hatch/i.test(m.name))shadows.addShadowCaster(m,true);if(m.name.includes('FracturePlate_Intact'))fracture=m;if(m.name.includes('FractureShard_'))shards.push(m);if(m.name.includes('HatchDoor'))hatch=m;if(/Cable_|Antenna_|SuspendedVane/i.test(m.name))secondary.push(m);});extGroups=a.animationGroups;if(!extGroups.length)throw Error('colossus.glb: animations missing');
  loading(48,'Загружаем внутренности','Heart · pistons · stabilizer');
  const b=await load('interior.glb',interior,m=>{if(/Heart|Piston|Stabilizer|Repair/i.test(m.name))shadows.addShadowCaster(m,true);if(m.name.includes('StabilizerCore'))stabilizer=m;});intGroups=b.animationGroups;if(!intGroups.length)throw Error('interior.glb: animations missing');
  loading(78,'Поднимаем человека','Humanoid rig · brace · hang · climb');
  const c=await load('player.glb',playerVisual,m=>{shadows.addShadowCaster(m,true);if(/ScarfTail/i.test(m.name))scarf.push(m);});plyGroups=c.animationGroups;if(!plyGroups.length)throw Error('player.glb: animations missing');playerVisual.scaling.setAll(.48);playerVisual.rotation.y=Math.PI;
  loading(100,'Колосс просыпается',quality?'HIGH mobile profile':'ADAPTIVE mobile profile');
}
function visibility(){const inn=run.carrier==='interior';exterior.setEnabled(!inn);interior.setEnabled(inn);world.setEnabled(!inn);rain.emitRate=inn?0:(quality?850:400)*(run.repaired?.55:1);scene.fogDensity=inn?.019:(run.repaired?.0038:.0055);scene.fogColor=inn?new Color3(.07,.085,.08):new Color3(.22,.29,.31);hemi.intensity=inn?.2:(run.repaired?.8:.62);sun.intensity=inn?.18:(run.repaired?1.7:(quality?1.35:1.1));audio.setInside(inn);}

const objective=()=>run.carrier==='head'?['08','Поднимись к переднему краю головы.','CRANIAL DECK · 08']:run.carrier==='interior'?(run.repaired?['07','Вернись наружу через верхний канал.','THORACIC CORE · 07']:['06','Доберись до стабилизатора и удерживай привод.','THORACIC CORE · 06']):run.carrier==='shoulder'?['05','Пересечь плечо. Найти повреждённый люк.','SCAPULAR JOINT · 05']:run.lightning?['04','Походка сорвана. Доберись до плеча.','DORSAL PLATES · 04']:run.localZ>-8?['03','Иди вперёд между броневыми пластинами.','DORSAL PLATES · 03']:['01','Выйди из защитной ниши.','DORSAL SHELTER · 01'];
let objectiveKey='';function syncObjective(){const o=objective(),k=o.join('|');if(k===objectiveKey)return;objectiveKey=k;ui.objectiveIndex.textContent=o[0];ui.objective.textContent=o[1];ui.zone.textContent=o[2];}
function syncStability(){const bad=run.lightning&&!run.repaired,v=run.repaired ? .96 : bad ? .42 : .86;ui.fill.style.width=`${v*100}%`;ui.meter.classList.toggle('damaged',bad);ui.stability.textContent=run.repaired?'SYNCHRONIZED':bad?'ASYMMETRIC':'STABLE';}

const input=createInput({canvas,joystick:ui.joystick,knob:ui.knob,actionButton:ui.action,onFirstGesture:()=>audio.ensure()});
let yaw=0,pitch=-.16,syaw=0,spitch=-.16,face=0,speed=0,extX=0,extZ=0,phase=0,prevCarrier=null,prevVel=new Vector3(),hanging=false,hangTime=0,repair=run.repaired?1:0,repairTone=0,transition=false,fractureTime=-1,bolt=null,finalTime=0,camPos=new Vector3(0,4,-7),camTarget=new Vector3(),camKick=new Vector3(),shoulderRoll=0,lastFoot=.5;
async function fade(fn){if(transition)return;transition=true;ui.fade.classList.add('on');await new Promise(r=>setTimeout(r,reduced?10:420));fn();await new Promise(r=>setTimeout(r,reduced?10:80));ui.fade.classList.remove('on');transition=false;}
function moveCarrier(name,x,z,msg){void fade(()=>{run.carrier=name;attach(name,x,z);prevCarrier=null;prevVel.setAll(0);extX=extZ=0;hanging=false;visibility();syncObjective();caption(msg);persist();});}
function lightning(){if(run.lightning)return;run.lightning=true;fractureTime=0;fracture?.setEnabled(false);shards.forEach(s=>s.setEnabled(true));playExt('Strain',1.05);playInt('Fail',1.05);audio.lightning();pulse([45,35,90]);caption('IMPACT // DORSAL ARMOR BREACH',2800);flash.intensity=18;camKick.set(.15,.24,-.12);const hit=back.getAbsolutePosition().add(new Vector3(-4,2,run.localZ+1)),pts=[hit.add(new Vector3(0,32,0))];for(let i=1;i<8;i++){const t=i/8;pts.push(new Vector3(hit.x+(Math.random()-.5)*1.5,hit.y+32*(1-t),hit.z+(Math.random()-.5)*1.4));}pts.push(hit);bolt=MeshBuilder.CreateLines('bolt',{points:pts},scene);bolt.color=new Color3(.78,.92,1);setTimeout(()=>{flash.intensity=0;bolt?.setEnabled(false);},240);persist();}
function repairDone(){if(run.repaired)return;run.repaired=true;repair=1;audio.setRepaired(true);audio.repairComplete();playExt('Recover',.92);playInt('Recovered',.92);caption('STABILIZER // SYNCHRONIZED',3000);pulse([25,20,25,20,70]);visibility();syncObjective();persist();}
function finale(){if(run.finale)return;run.finale=true;run.completedRuns++;audio.finale();caption('STORM BREAK // VISUAL CONTACT',3200);const sm=mat('farColossus',new Color3(.06,.08,.08));[[-58,150,1],[22,178,.8],[72,205,1.15]].forEach(([x,z,s],i)=>{const r=new TransformNode(`far${i}`,scene);r.parent=world;r.position.set(x,-24,z);r.scaling.setAll(s);const b=MeshBuilder.CreateCylinder(`farB${i}`,{height:45,diameterTop:9,diameterBottom:13,tessellation:8},scene);b.parent=r;b.position.y=24;b.material=sm;const sh=MeshBuilder.CreateBox(`farS${i}`,{width:28,height:5,depth:7},scene);sh.parent=r;sh.position.y=40;sh.material=sm;});persist();}

function motionUpdate(dt){const bad=run.lightning&&!run.repaired?1:0,rate=run.repaired ? .75 : 1;phase+=dt*1.15*rate;const s=Math.sin(phase*Math.PI*2),d=Math.sin(phase*Math.PI*4),kick=bad*Math.max(0,Math.sin(phase*Math.PI*2+.55));motion.position.y=Math.abs(s)*(.09+bad*.08);motion.rotation.z=s*(.013+bad*.022);pelvis.rotation.set(d*(.014+bad*.025),0,s*(.022+bad*.035));chest.rotation.set(-d*(.018+bad*.025),0,-s*(.028+bad*.055)-kick*.025);back.rotation.x=Math.sin(phase*Math.PI*2+.5)*(.013+bad*.024);shoulderRoll=Math.sin(phase*Math.PI*2+1.2)*(.055+bad*.11);shoulder.rotation.set(shoulderRoll,0,s*(.035+bad*.075));head.rotation.z=-s*(.018+bad*.03);inside.rotation.x=d*(.008+bad*.018);if(Math.floor(phase*2)!==Math.floor((phase-dt*1.15*rate)*2)){audio.colossusStep(bad);camKick.y += bad ? .055 : .03;if(bad&&Math.random()>.5)audio.creak();}clouds.forEach((c,i)=>{c.position.x-=dt*(.4+i*.18)*(run.repaired ? .5 : 1);if(c.position.x<-100)c.position.x+=200;});secondary.forEach((m,i)=>{m.rotation.z=damp(m.rotation.z,Math.sin(phase*6.1+i*.83)*(.018+bad*.035),3.6,dt);m.rotation.x=damp(m.rotation.x,Math.sin(phase*4.4+i)*(.012+bad*.018),3.2,dt);});scarf.forEach((m,i)=>{m.rotation.x=damp(m.rotation.x,.10+Math.sin(phase*7+i)*.07,4.5,dt);m.rotation.z=damp(m.rotation.z,Math.sin(phase*5.5+i)*.08,4.0,dt);});}
function fractureUpdate(dt){if(fractureTime<0)return;fractureTime+=dt;shards.forEach((s,i)=>{if(!s.isEnabled())return;const t=Math.max(0,fractureTime-i*.07);if(t>.18){s.position.x-=dt*(.5+i*.07);s.position.y-=dt*(1.2+t*2);s.rotation.x+=dt*(1+i*.2);s.rotation.z-=dt*(.8+i*.15);}if(t>4)s.setEnabled(false);});if(fractureTime>5)fractureTime=-1;}
function animation(moving,sprint,brace){playExt(run.repaired?'Recover':run.lightning?'Strain':'Walk',run.repaired ? .92 : 1);playInt(run.repaired?'Recovered':run.lightning?'Fail':'Pulse',1);playPly(hanging?'Hang':brace?'Brace':moving?(sprint?'Run':'Walk'):'Idle');}
function actionUI(flags,held){let l='BRACE',h='удерживать',g='◢',p=0,hot=false;if(hanging){l='CLIMB';h='нажать';g='↑';p=clamp(hangTime/1.1,0,1);hot=true;}else if(flags.repairReady){l='SYNC';h='удерживать';g='↻';p=repair;hot=true;}else if(flags.hatchReady||flags.ascentReady){l='ENTER';h='нажать';g='↥';hot=true;}ui.actionLabel.textContent=l;ui.actionHint.textContent=h;ui.actionGlyph.textContent=g;ui.action.style.setProperty('--progress',p);ui.action.classList.toggle('hot',hot||held);}
function scenario(flags,s,dt){if(flags.lightningReady)lightning();if(flags.shoulderReady&&!transition)moveCarrier('shoulder',0,-7.2,'SCAPULAR JOINT // MOVEMENT RANGE HIGH');if(flags.hatchReady&&s.actionPressed&&!transition){if(hatch)hatch.rotation.x+=.9;moveCarrier('interior',0,-10.8,'INTERNAL PRESSURE // AUDIO OCCLUDED');}if(flags.repairReady&&s.actionHeld&&!hanging){repair=clamp(repair+dt/3.3,0,1);repairTone-=dt;if(repairTone<=0){repairTone=.18;audio.repairPulse(repair);}if(repair>=1)repairDone();}else if(!run.repaired)repair=Math.max(0,repair-dt*.1);if(flags.ascentReady&&s.actionPressed&&!transition)moveCarrier('head',0,-7.6,'CRANIAL DECK // WIND LOAD EXTREME');if(flags.finaleReady)finale();}

function playerUpdate(dt,t,s){const node=carriers[run.carrier];node.computeWorldMatrix(true);const w=node.getAbsolutePosition(),vel=prevCarrier?w.subtract(prevCarrier).scale(1/Math.max(dt,1/120)):new Vector3();prevCarrier=w.clone();const brace=s.actionHeld&&!(run.carrier==='interior'&&run.localZ>9.2)&&!hanging,imp=surfaceImpulse(prevVel,vel,dt,brace);prevVel.copyFrom(vel);if(imp.magnitude>11){extX+=imp.x;extZ+=imp.z;}
  if(hanging){hangTime+=dt;speed=damp(speed,0,8,dt);playerVisual.rotation.x=-.25;playerVisual.rotation.z=Math.sin(t*3)*.07;if(s.actionPressed||hangTime>1.65){hanging=false;hangTime=0;const p=clampToCarrier(run.carrier,{x:run.localX*.91,z:run.localZ*.91});player.position.set(p.x,p.y,p.z);run.localX=p.x;run.localZ=p.z;extX*=.2;extZ*=.2;audio.grab();pulse(22);playPly('Climb',false,1.08);}return {moving:false,sprint:false,brace};}
  yaw-=s.lookX*.0041;pitch=clamp(pitch-s.lookY*.0035,-.52,.38);const ml=Math.hypot(s.moveX,s.moveY),sprint=s.sprint&&ml>.4&&!brace;speed=damp(speed,ml*(sprint?4.6:2.75)*(brace ? .5 : 1),sprint?8:10,dt);let dx=Math.cos(yaw)*s.moveX+Math.sin(yaw)*s.moveY,dz=-Math.sin(yaw)*s.moveX+Math.cos(yaw)*s.moveY,n=Math.hypot(dx,dz);if(n){dx/=n;dz/=n;}extX=damp(extX,0,brace?8:2.8,dt);extZ=damp(extZ,0,brace?8:2.8,dt);const next={x:player.position.x+(dx*speed+extX)*dt,z:player.position.z+(dz*speed+extZ)*dt},p=clampToCarrier(run.carrier,next),outside=Math.abs(next.x-p.x)+Math.abs(next.z-p.z)>.025,danger=edgeDanger(run.carrier,p.x,p.z,1.35),bad=run.lightning&&!run.repaired;if(outside&&!brace&&(bad||Math.hypot(extX,extZ)>.75)){hanging=true;hangTime=0;audio.grab();pulse([18,25,35]);caption('AUTO-GRAB // HOLD FOUND',1250);}else{player.position.set(p.x,p.y,p.z);run.localX=p.x;run.localZ=p.z;}if(ml>.12){face=dampAngle(face,Math.atan2(dx,dz),12,dt);playerVisual.rotation.y=Math.PI+face;}playerVisual.rotation.x=damp(playerVisual.rotation.x,brace?-.18:clamp(extZ*.045+shoulderRoll*.65,-.19,.19),8,dt);playerVisual.rotation.z=damp(playerVisual.rotation.z,clamp(-extX*.05-shoulderRoll*.35,-.22,.22),8,dt);if(speed>.5){const fp=(t*(sprint?2.8:1.85))%1;if(fp<lastFoot)audio.step(sprint?1.1:.8);lastFoot=fp;}if(danger>.55&&bad&&!brace&&Math.random()<dt*.8)extX+=(Math.random()-.5)*.14;return {moving:ml>.12,sprint,brace};}
function cameraUpdate(dt){player.computeWorldMatrix(true);const p=player.getAbsolutePosition(),inn=run.carrier==='interior',dist=inn?4.2:run.carrier==='head'?6.2:5.7,height=inn?2.15:2.55;syaw=dampAngle(syaw,yaw,12,dt);spitch=damp(spitch,pitch,11,dt);const cp=Math.cos(spitch),off=new Vector3(-Math.sin(syaw)*cp*dist,height-Math.sin(spitch)*dist*.52,-Math.cos(syaw)*cp*dist);camKick.x=damp(camKick.x,0,4.5,dt);camKick.y=damp(camKick.y,0,5.5,dt);camKick.z=damp(camKick.z,0,4.5,dt);off.addInPlace(camKick);const target=p.add(new Vector3(0,1,0)),desired=target.add(off);camTarget.set(damp(camTarget.x,target.x,14,dt),damp(camTarget.y,target.y,12,dt),damp(camTarget.z,target.z,14,dt));camPos.set(damp(camPos.x,desired.x,inn?12:8.5,dt),damp(camPos.y,desired.y,inn?12:7.5,dt),damp(camPos.z,desired.z,inn?12:8.5,dt));camera.position.copyFrom(camPos);camera.setTarget(camTarget);rainPos.copyFrom(p).addInPlace(new Vector3(5,12,0));}
function stormUpdate(dt){audio.setWind(run.carrier==='interior' ? .12 : (run.repaired ? .55 : 1));if(run.carrier!=='interior'&&!run.finale){distantFlash-=dt;if(distantFlash<=0){distantFlash=4.2+Math.random()*7.5;flash.intensity=3.2+Math.random()*3.5;setTimeout(()=>{if(!run.finale)flash.intensity=0;},70+Math.random()*90);}}if(run.finale){scene.fogDensity=damp(scene.fogDensity,.0021,.35,dt);scene.fogColor.r=damp(scene.fogColor.r,.36,.25,dt);scene.fogColor.g=damp(scene.fogColor.g,.43,.25,dt);scene.fogColor.b=damp(scene.fogColor.b,.44,.25,dt);hemi.intensity=damp(hemi.intensity,.95,.25,dt);sun.intensity=damp(sun.intensity,2.1,.25,dt);clouds.forEach((c,i)=>c.position.y+=dt*(.5+i*.12));}}

let distantFlash=2.4+Math.random()*3.8;
let last=performance.now(),saveClock=0;function tick(now){const dt=Math.min(.05,Math.max(1/240,(now-last)/1000)),t=now/1000;last=now;motionUpdate(dt);const s=input.sample();if(!transition&&!run.finale){const loc=playerUpdate(dt,t,s),flags=scenarioFlags({carrier:run.carrier,lightning:run.lightning,repaired:run.repaired,localZ:run.localZ});scenario(flags,s,dt);actionUI(flags,s.actionHeld);animation(loc.moving,loc.sprint,loc.brace);}fractureUpdate(dt);cameraUpdate(dt);stormUpdate(dt);syncObjective();syncStability();if(run.finale){finalTime+=dt;if(finalTime>4)ui.finish.hidden=false;}saveClock+=dt;if(saveClock>4){saveClock=0;persist();}scene.render();requestAnimationFrame(tick);}

async function boot(){try{await assets();fracture?.setEnabled(!run.lightning);shards.forEach(s=>s.setEnabled(false));if(run.repaired){audio.setRepaired(true);repair=1;}visibility();playExt(run.repaired?'Recover':run.lightning?'Strain':'Walk');playInt(run.repaired?'Recovered':run.lightning?'Fail':'Pulse');playPly('Idle');syncObjective();syncStability();await new Promise(r=>setTimeout(r,reduced?10:260));ui.loading.classList.add('out');setTimeout(()=>ui.loading.hidden=true,reduced?20:760);document.body.classList.add('ready');caption(raw.carrier?'RUN RESTORED // MOVING SURFACE LOCKED':'DORSAL SHELTER // OPEN');requestAnimationFrame(n=>{last=n;requestAnimationFrame(tick);});}catch(e){console.error(e);ui.loading.hidden=true;ui.error.hidden=false;ui.errorText.textContent=e instanceof Error?e.message:String(e);}}
addEventListener('resize',()=>engine.resize());addEventListener('orientationchange',()=>setTimeout(()=>engine.resize(),160));addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
void boot();
