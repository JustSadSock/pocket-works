// @ts-nocheck
import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Camera } from '@babylonjs/core/Cameras/camera';
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
import { advanceNight, canChoose, choose, createGame, relationLabel, restoreGame, serializeGame, startGame, stepSiege } from './core';

installMobileRuntime();
registerEnhancedUpdate({appName:'ПОСЛЕДНИЙ ВОРОН',version:'0.1.0',releaseNotes:[
  '12-дневная кампания у ворот северного замка с письмами и отложенными последствиями.',
  'Неполная информация, четыре политические силы, живая погода и финальная автоматическая осада.'
]});
createWorkshopMode({appName:'ПОСЛЕДНИЙ ВОРОН',version:'0.1.0',cachePrefix:'last-raven-',storageNamespace:'pocket-works:last-raven'});

const $=(id)=>document.getElementById(id);
const canvas=$('world');
const SAVE_KEY='pocket-works:last-raven:campaign';
const META_KEY='pocket-works:last-raven:meta';
let meta={muted:false,completed:0};
try{meta={...meta,...JSON.parse(localStorage.getItem(META_KEY)||'{}')}}catch{}
const restored=restoreGame(localStorage.getItem(SAVE_KEY));
let state=restored??createGame();
let started=false,last=performance.now(),gateVisual=0,visitorKey='',phaseKey='',snowClock=0,toastTimer=0,endShown=false,visitorDeparture=0,visitorAllowed=false;

function show(id,on=true){$(id)?.classList.toggle('hidden',!on)}
function home(){save();location.href='../../'}
function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(meta))}catch{}}
function save(){try{if(started&&!state.completed)localStorage.setItem(SAVE_KEY,serializeGame(state));else localStorage.removeItem(SAVE_KEY)}catch{}}
function toast(text){const el=$('toast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
const weatherName={clear:'ТИХО',snow:'СНЕГ',storm:'МЕТЕЛЬ',whiteout:'БЕЛАЯ МГЛА'};

class AudioBus{
  ctx=null; wind=null; windGain=null; muted=!!meta.muted;
  unlock(){if(this.muted)return;try{this.ctx??=new AudioContext();if(this.ctx.state==='suspended')void this.ctx.resume();if(!this.wind)this.startWind()}catch{}}
  tone(freq=120,d=.08,g=.04,type='triangle'){if(this.muted)return;this.unlock();if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),v=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.68),t+d);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(v);v.connect(this.ctx.destination);o.start(t);o.stop(t+d)}
  gate(){this.tone(72,.2,.065,'square');setTimeout(()=>this.tone(48,.16,.045,'triangle'),90)}
  paper(){this.tone(430,.05,.018,'triangle')}
  raven(){this.tone(165,.11,.035,'sawtooth');setTimeout(()=>this.tone(124,.13,.03,'sawtooth'),110)}
  siege(){this.tone(55,.3,.07,'square')}
  startWind(){if(!this.ctx)return;const n=this.ctx.sampleRate*1.5,b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(.35+.65*Math.sin(i*.00008)**2);const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=b;s.loop=true;f.type='lowpass';f.frequency.value=480;g.gain.value=.018;s.connect(f);f.connect(g);g.connect(this.ctx.destination);s.start();this.wind=s;this.windGain=g}
  updateWind(){if(this.windGain)this.windGain.gain.setTargetAtTime(this.muted?0:.008+state.weather.wind*.035,this.ctx.currentTime,.4)}
  toggle(){this.muted=!this.muted;meta.muted=this.muted;saveMeta();if(!this.muted){this.unlock();this.tone(310,.08,.025)}this.updateWind()}
}
const audio=new AudioBus();

const engine=new Engine(canvas,true,{antialias:true,preserveDrawingBuffer:false,stencil:false,powerPreference:'high-performance',adaptToDeviceRatio:false});
engine.setHardwareScalingLevel(Math.min(1.65,Math.max(1,(devicePixelRatio||1)*.7)));
const scene=new Scene(engine);scene.clearColor=new Color4(.49,.54,.55,1);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.022;scene.fogColor=new Color3(.49,.54,.55);scene.skipPointerMovePicking=true;
const hemi=new HemisphericLight('winter sky',new Vector3(.1,1,.18),scene);hemi.intensity=1.06;hemi.diffuse=new Color3(.78,.86,.86);hemi.groundColor=new Color3(.22,.26,.26);
const sun=new DirectionalLight('low sun',new Vector3(-.45,-1,.32),scene);sun.position=new Vector3(18,24,-18);sun.intensity=.82;sun.diffuse=new Color3(.84,.88,.82);
const camera=new FreeCamera('camera',new Vector3(10.5,12.8,18.5),scene);camera.setTarget(new Vector3(0,2.1,-1));camera.minZ=.1;camera.maxZ=90;camera.fov=.7;camera.mode=Camera.PERSPECTIVE_CAMERA;
let cameraGoal={p:new Vector3(10.5,12.8,18.5),t:new Vector3(0,2.1,-1)};

function mat(name,hex,rough=.82,emissive=null){const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor=new Color3((1-rough)*.12,(1-rough)*.12,(1-rough)*.12);if(emissive)m.emissiveColor=Color3.FromHexString(emissive);return m}
const M={stone:mat('blue grey stone','#5f696a'),stoneDark:mat('wet stone','#465154'),mortar:mat('mortar','#889092'),wood:mat('oak','#5d493a'),woodDark:mat('wet oak','#392f29'),iron:mat('iron','#222a2c'),snow:mat('packed snow','#dfe6e3'),snowShade:mat('old snow','#b9c6c5'),road:mat('frozen road','#777b77'),earth:mat('earth','#5d5d55'),black:mat('raven','#121719'),cloak:mat('cloak','#3c4647'),pink:mat('faded red','#85575b'),torch:mat('fire','#c47c48',.4,'#d7894e'),window:mat('lit windows','#544839',.5,'#b77946'),windowDark:mat('dark windows','#202829'),banner:mat('banner','#68777a'),bannerPink:mat('banner faded','#80585b')};

function box(name,w,h,d,x,y,z,material,parent=null){const q=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);q.position.set(x,y,z);q.material=material;if(parent)q.parent=parent;return q}
function cyl(name,diam,height,x,y,z,material,parent=null,tess=10){const q=MeshBuilder.CreateCylinder(name,{diameter:diam,height,tessellation:tess},scene);q.position.set(x,y,z);q.material=material;if(parent)q.parent=parent;return q}

const world=new TransformNode('castle world',scene);
const ground=MeshBuilder.CreateGround('snowfield',{width:34,height:42},scene);ground.material=M.snowShade;ground.parent=world;
const road=MeshBuilder.CreateGround('king road',{width:4.4,height:34},scene);road.position.set(.25,.018,6);road.material=M.road;road.parent=world;
for(let i=0;i<26;i++){const side=i%2?-1:1,x=side*(3.2+(i%4)*1.05),z=12-(i*.93)%28;const drift=box('snowdrift',1.2+(i%3)*.4,.12,.55,x,.07,z,M.snow,world);drift.rotation.y=(i*.73)%1.2-.6}

const castle=new TransformNode('castle',scene);castle.parent=world;castle.position.z=-3.6;
box('courtyard',12.8,.16,10.5,0,.08,0,M.stoneDark,castle);
for(const s of [-1,1]){box('side wall',1.05,4.5,10.6,s*6.1,2.25,0,M.stone,castle);box('wall snow',1.2,.14,10.8,s*6.1,4.56,0,M.snow,castle);for(let z=-4.4;z<=4.4;z+=.82)box('side merlon',.44,.44,.44,s*6.1,4.78,z,M.stone,castle)}
box('rear wall',11.4,4.5,1.05,0,2.25,-4.85,M.stone,castle);
for(let i=-5;i<=5;i+=1.1)box('rear merlon',.42,.44,.42,i,4.72,-4.85,M.stone,castle);
box('front wall L',4.35,4.3,1.05,-4.0,2.15,4.85,M.stone,castle);box('front wall R',4.35,4.3,1.05,4.0,2.15,4.85,M.stone,castle);
for(const x of [-5.7,-5,-4.3,-3.6,-2.9,2.9,3.6,4.3,5,5.7])box('front merlon',.42,.44,.42,x,4.52,4.85,M.stone,castle);
for(const [x,z] of [[-6.2,-4.9],[6.2,-4.9],[-6.2,4.9],[6.2,4.9]]){cyl('round tower',2.65,6,x,3,z,M.stone,castle,12);cyl('tower snow',2.82,.16,x,6.07,z,M.snow,castle,12);for(let a=0;a<8;a++){const angle=a/8*Math.PI*2;box('tower merlon',.45,.5,.45,x+Math.cos(angle)*1.13,6.36,z+Math.sin(angle)*1.13,M.stone,castle).rotation.y=-angle}}
box('gatehouse',5.2,6.25,2.2,0,3.12,4.45,M.stone,castle);box('gatehouse snow',5.4,.16,2.4,0,6.32,4.45,M.snow,castle);for(const x of [-2.2,-1.4,-.6,.6,1.4,2.2])box('gatehouse merlon',.46,.52,.46,x,6.62,4.45,M.stone,castle);
const gateRoot=new TransformNode('portcullis',scene);gateRoot.parent=castle;gateRoot.position.set(0,.55,5.02);for(let i=-3;i<=3;i++)box('iron bar',.1,3.05,.12,i*.42,1.52,0,M.iron,gateRoot);for(const y of [.65,1.55,2.45])box('crossbar',2.72,.12,.14,0,y,0,M.iron,gateRoot);
const keep=new TransformNode('keep',scene);keep.parent=castle;keep.position.set(1.6,0,-1.6);box('keep block',5.1,6.2,4.2,0,3.1,0,M.stoneDark,keep);box('keep snow',5.3,.18,4.4,0,6.24,0,M.snow,keep);for(const x of [-2.2,-1.45,-.7,.7,1.45,2.2])box('keep merlon',.46,.54,.46,x,6.56,-1.85,M.stone,keep);
cyl('rookery',2.2,7,-3.4,3.5,-1.6,M.stone,castle,10);cyl('rookery snow',2.34,.15,-3.4,7.08,-1.6,M.snow,castle,10);
box('granary',3.1,2.2,2.5,-3.7,1.1,1.4,M.wood,castle);const granarySnow=box('granary snow',3.3,.18,2.7,-3.7,2.28,1.4,M.snow,castle);
box('barracks',3.4,2.1,2.25,3.8,1.05,1.2,M.woodDark,castle);box('barracks snow',3.6,.16,2.45,3.8,2.18,1.2,M.snow,castle);
for(let i=0;i<7;i++){const p=cyl('wood pile',.28,1.15,-4.4+i*.32,.64,2.2,M.wood,castle,8);p.rotation.z=Math.PI/2}
for(let i=0;i<9;i++){const w=box('window',.38,.5,.08,1.6+(i%3-1)*1.25,2.2+Math.floor(i/3)*1.25,-3.72,M.window,castle);w.metadata={window:true}}
const windows=scene.meshes.filter(m=>m.metadata?.window);
for(const [x,material] of [[-1.2,M.banner],[1.2,M.bannerPink]]){box('banner pole',.07,2,.07,x,5.6,5.12,M.iron,castle);const flag=box('banner cloth',.76,.88,.035,x+(x<0?-.38:.38),5.9,5.12,material,castle);flag.metadata={banner:true,side:x<0?-1:1}}
const torches=[];for(const x of [-2.05,2.05]){box('torch bracket',.08,.65,.08,x,3.2,5.62,M.iron,castle);const f=cyl('torch flame',.16,.32,x,3.55,5.65,M.torch,castle,7);torches.push(f)}
const folk=[];for(let i=0;i<12;i++){const root=new TransformNode('folk'+i,scene);root.parent=castle;root.position.set(-4.2+(i%5)*1.9,.25,-2.6+Math.floor(i/5)*1.65);cyl('body',.3,.85,0,.45,0,i%4===0?M.wood:M.cloak,root,7);cyl('head',.22,.25,0,.98,0,M.mortar,root,7);root.metadata={i,baseX:root.position.x,baseZ:root.position.z};folk.push(root)}

const visitors=new TransformNode('visitors',scene);visitors.parent=world;visitors.position.set(0,.05,8.6);const visitorParts=[];
function buildVisitors(kind,count){for(const n of visitorParts)n.dispose(false,true);visitorParts.length=0;for(let i=0;i<count;i++){const r=new TransformNode('visitor'+i,scene);r.parent=visitors;r.position.set((i-(count-1)/2)*.58,0,(i%2)*.35);cyl('cloak',kind==='soldiers'?.44:.38,kind==='soldiers'?1.35:1.15,0,.62,0,kind==='soldiers'?M.pink:kind==='rangers'?M.black:M.cloak,r,7);cyl('head',.26,.28,0,1.32,0,M.mortar,r,7);if(kind==='soldiers')box('spear',.05,1.7,.05,.27,1.05,0,M.wood,r);if(kind==='trader'&&i===0){box('cart',1.2,.55,.85,0,.35,.9,M.wood,r);cyl('wheel',.45,.12,-.48,.2,.9,M.iron,r,8).rotation.z=Math.PI/2;cyl('wheel',.45,.12,.48,.2,.9,M.iron,r,8).rotation.z=Math.PI/2}visitorParts.push(r)}}

const raven=new TransformNode('raven',scene);raven.parent=world;raven.position.set(-3.4,8.2,-1.5);const ravenBody=cyl('raven body',.28,.55,0,0,0,M.black,raven,7);ravenBody.rotation.x=Math.PI/2;const wingL=box('wing L',.85,.06,.28,-.46,.05,0,M.black,raven);const wingR=box('wing R',.85,.06,.28,.46,.05,0,M.black,raven);raven.setEnabled(false);

const flake=MeshBuilder.CreateBox('snow particle',{size:.055},scene);flake.material=M.snow;flake.isPickable=false;const FLAKES=100;const flakeData=Array.from({length:FLAKES},(_,i)=>({x:(Math.sin(i*12.73)*.5+.5)*24-12,y:2+(i%20)*.65,z:(Math.sin(i*4.31+2)*.5+.5)*27-8,s:.8+(i%7)*.11}));const flakeMatrices=new Float32Array(FLAKES*16);
const enemyProto=cyl('enemy proto',.34,1.15,0,0,0,M.pink,null,6);enemyProto.isPickable=false;const ENEMIES=34;const enemyMatrices=new Float32Array(ENEMIES*16);const enemySeed=Array.from({length:ENEMIES},(_,i)=>({x:(i%7-3)*.68+Math.sin(i)*.18,z:11+Math.floor(i/7)*.72,p:i*.41}));enemyProto.thinInstanceCount=0;

function updateSnow(dt){const intensity=state.phase==='night'?Math.max(.2,state.weather.snow):state.weather.kind==='clear'?.06:state.weather.kind==='snow'?.55:state.weather.kind==='storm'?.82:1;flake.visibility=intensity;const wind=state.weather.wind*2.4;for(let i=0;i<FLAKES;i++){const p=flakeData[i];p.y-=dt*(1.6+p.s*1.5);p.x+=dt*wind*(.45+p.s*.3);if(p.y<.1||p.x>15){p.y=13+((i*7)%9);p.x=-12+((i*11)%24);p.z=-7+((i*13)%27)}Matrix.Translation(p.x,p.y,p.z).copyToArray(flakeMatrices,i*16)}flake.thinInstanceSetBuffer('matrix',flakeMatrices,16,true);flake.thinInstanceCount=Math.round(FLAKES*intensity)}
function updateEnemies(){if(state.phase!=='siege'){enemyProto.thinInstanceCount=0;return}const s=state.siege;const alive=Math.max(2,Math.round(ENEMIES*(s.enemy/78)));for(let i=0;i<alive;i++){const p=enemySeed[i],progress=s.progress;const z=p.z-progress*(6.2+p.p*.08);Matrix.Compose(new Vector3(1,1,1),Quaternion.FromEulerAngles(0,.05*Math.sin(performance.now()*.001+p.p),0),new Vector3(p.x,.58,z)).copyToArray(enemyMatrices,i*16)}enemyProto.thinInstanceSetBuffer('matrix',enemyMatrices.subarray(0,alive*16),16,true);enemyProto.thinInstanceCount=alive}

function cameraForPhase(){if(!started)return {p:new Vector3(10.5,12.8,18.5),t:new Vector3(0,2.1,-1)};if(state.phase==='visitor')return {p:new Vector3(7.2,8.3,14.2),t:new Vector3(0,2.2,3.2)};if(state.phase==='letter')return {p:new Vector3(6.8,9.7,10.8),t:new Vector3(-2.7,5.2,-1.8)};if(state.phase==='night')return {p:new Vector3(9.6,10.8,16.6),t:new Vector3(0,2.6,-1.8)};if(state.phase==='siege')return {p:new Vector3(10.5,13.5,18.8),t:new Vector3(0,2.2,1)};return {p:new Vector3(9.7,11.5,17),t:new Vector3(0,2.5,-1.2)}}
function updateWorld(dt){cameraGoal=cameraForPhase();camera.position=Vector3.Lerp(camera.position,cameraGoal.p,Math.min(1,dt*2.3));const currentTarget=camera.getTarget();camera.setTarget(Vector3.Lerp(currentTarget,cameraGoal.t,Math.min(1,dt*2.5)));
  const departing=performance.now()<visitorDeparture;const gateTarget=(departing&&visitorAllowed)?1:0;gateVisual+=(gateTarget-gateVisual)*Math.min(1,dt*5);gateRoot.position.y=.55+gateVisual*2.7;
  if(state.phase==='visitor'||departing){visitors.setEnabled(true);const vz=departing?(visitorAllowed?3.45:10.4):8.6;visitors.position.z+=(vz-visitors.position.z)*Math.min(1,dt*3.6)}else visitors.setEnabled(false);
  raven.setEnabled(state.phase==='letter');if(state.phase==='letter'){const t=performance.now()*.001;raven.position.x=-3.4+Math.sin(t*1.2)*.16;raven.position.y=8.05+Math.sin(t*2)*.08;wingL.rotation.z=.25+Math.sin(t*9)*.45;wingR.rotation.z=-.25-Math.sin(t*9)*.45}
  const cold=state.phase==='night'?0.32:state.weather.kind==='whiteout'?.58:state.weather.kind==='storm'?.46:.72;hemi.intensity+=(cold-hemi.intensity)*dt*1.2;sun.intensity+=((state.phase==='night'?.12:state.weather.kind==='clear'?.86:.55)-sun.intensity)*dt*1.1;scene.fogDensity+=((state.weather.kind==='whiteout'?.052:state.weather.kind==='storm'?.034:.021)-scene.fogDensity)*dt;
  const fogHex=state.phase==='night'?new Color3(.11,.15,.16):state.weather.kind==='whiteout'?new Color3(.72,.77,.77):new Color3(.49,.54,.55);scene.fogColor=Color3.Lerp(scene.fogColor,fogHex,Math.min(1,dt*.7));scene.clearColor=new Color4(scene.fogColor.r,scene.fogColor.g,scene.fogColor.b,1);
  const lit=Math.max(1,Math.min(windows.length,Math.round((state.resources.wood/18)*windows.length)));for(let i=0;i<windows.length;i++)windows[i].material=i<lit?M.window:M.windowDark;
  const snowScale=.4+state.weather.snow*.85;granarySnow.scaling.y=snowScale;for(const f of folk){const i=f.metadata.i,t=performance.now()*.001;f.position.x=f.metadata.baseX+Math.sin(t*.45+i)*.18;f.position.z=f.metadata.baseZ+Math.cos(t*.37+i*.7)*.13;f.rotation.y=Math.sin(t*.31+i)*.6;f.setEnabled(i<Math.max(3,Math.min(folk.length,Math.round(state.population/4.2))))}
  for(let i=0;i<torches.length;i++){const t=performance.now()*.001;torches[i].scaling.y=.8+Math.sin(t*11+i)*.28;torches[i].scaling.x=.85+Math.sin(t*7+i)*.15}
  for(const m of scene.meshes.filter(x=>x.metadata?.banner)){const t=performance.now()*.001;m.scaling.x=.94+Math.sin(t*4+m.metadata.side)*.06;m.rotation.z=Math.sin(t*3.4+m.metadata.side)*.035*state.weather.wind}
  updateSnow(dt);updateEnemies();audio.updateWind();
}

function visitorCount(enc){if(!enc)return 0;if(enc.id==='bolton-men')return 6;if(enc.id==='watch-rangers')return 3;if(enc.id==='freefolk-family')return 4;if(enc.id==='salt-trader')return 3;if(enc.id==='sick-maester')return 2;return 7}
function setEncounterVisual(){const enc=state.current;if(!enc||enc.kind!=='visitor')return;if(visitorKey===enc.id)return;visitorKey=enc.id;buildVisitors(enc.visual,visitorCount(enc));visitors.position.z=8.6}
function renderChoices(){const root=$('choices');root.replaceChildren();for(const c of state.current?.choices??[]){const b=document.createElement('button');b.className='choice';b.type='button';b.dataset.choice=c.id;b.innerHTML=`<b>${c.label}</b><small>${c.hint}</small>`;b.disabled=!canChoose(state,c.id);if(b.disabled)b.title='Не хватает припасов';b.onclick=()=>decide(c.id);root.appendChild(b)}}
function renderIntel(){for(const k of ['stark','bolton','watch','freefolk'])$(`rel-${k}`).textContent=relationLabel(state.relations[k]);const kn=$('knowledge');kn.replaceChildren();for(const text of state.knowledge.slice(0,7)){const p=document.createElement('p');p.textContent=text;kn.appendChild(p)}if(!state.knowledge.length){const p=document.createElement('p');p.textContent='Пока только слухи. Проверяйте людей и письма.';kn.appendChild(p)}const hi=$('history');hi.replaceChildren();for(const text of state.history.slice(0,8)){const p=document.createElement('p');p.textContent=text;hi.appendChild(p)}}
function renderUI(){
  $('day').textContent=`${Math.min(12,state.day)} / 12`;$('temperature').textContent=`${state.weather.temperature}°`;$('weather-mark').textContent=weatherName[state.weather.kind]||'СНЕГ';
  for(const k of ['food','wood','guards','morale','gold','medicine']){const el=$(k);el.textContent=String(Math.round(state.resources[k]));const cell=el.parentElement;cell.classList.toggle('danger',(k==='food'&&state.resources.food<=4)||(k==='wood'&&state.resources.wood<=3)||(k==='guards'&&state.resources.guards<=6)||(k==='morale'&&state.resources.morale<=20))}
  $('sound').textContent=audio.muted?'ТИШИНА':'ЗВУК';
  show('encounter',started&&(state.phase==='visitor'||state.phase==='letter'));show('night-panel',started&&state.phase==='night');show('siege-panel',started&&state.phase==='siege');
  if(state.phase==='visitor'||state.phase==='letter'){const e=state.current;if(e){$('encounter').classList.toggle('letter',state.phase==='letter');$('phase-kicker').textContent=state.phase==='visitor'?'У ВОРОТ':'ВОРОН ПРИЛЕТЕЛ';$('source').textContent=e.source;$('event-title').textContent=e.title;$('event-body').textContent=e.body;renderChoices();setEncounterVisual()}}
  if(state.phase==='night')$('night-copy').textContent=state.nightText;
  if(state.phase==='siege'&&state.siege){const s=state.siege;$('wall-fill').style.width=`${s.wall}%`;$('enemy-fill').style.width=`${Math.min(100,s.enemy/78*100)}%`;$('wall-text').textContent=String(Math.round(s.wall));$('enemy-text').textContent=String(Math.round(s.enemy));$('siege-time').textContent=`00:${String(Math.max(0,Math.ceil(24-s.progress*24))).padStart(2,'0')}`}
  renderIntel();
}
function decide(id){if(!started||!(state.phase==='visitor'||state.phase==='letter'))return;audio.unlock();const was=state.phase;const title=state.current?.title||'';const ok=choose(state,id);if(!ok)return;if(was==='visitor'){visitorAllowed=state.gateOpen;visitorDeparture=performance.now()+1100;audio.gate();toast(state.gateOpen?'Ворота открываются.':'Ворота остаются закрытыми.')}else{audio.paper();toast(`Решение по письму: ${title}.`)}save();renderUI()}
function nextDay(){audio.unlock();const due=advanceNight(state);if(due.length)toast(due[0]+(due.length>1?' + ещё одно последствие.':''));else if(state.phase==='siege'){audio.siege();toast('На дороге показались знамёна.')}save();renderUI()}
function newCampaign(){state=createGame();startGame(state);started=true;endShown=false;gateVisual=0;visitorKey='';show('start-screen',false);show('end-screen',false);audio.unlock();save();renderUI()}
function continueCampaign(){if(!restored||restored.completed)return newCampaign();state=restored;started=true;endShown=false;show('start-screen',false);show('end-screen',false);audio.unlock();renderUI()}
function finish(){if(endShown||!(state.phase==='won'||state.phase==='lost'))return;endShown=true;meta.completed=(meta.completed||0)+1;saveMeta();save();show('siege-panel',false);show('end-screen',true);$('end-kicker').textContent=state.phase==='won'?'РАССВЕТ · ЗНАМЯ НА МЕСТЕ':'РАССВЕТ · ВОРОТА ПАЛИ';$('end-title').textContent=state.phase==='won'?'Замок устоял.':'Замок взят.';$('end-copy').textContent=state.siege?.resultText||'Кампания завершена.';$('end-guards').textContent=String(Math.round(state.resources.guards));$('end-morale').textContent=String(Math.round(state.resources.morale));audio.tone(state.phase==='won'?250:62,.45,.06,state.phase==='won'?'triangle':'sawtooth')}

$('new-game').onclick=newCampaign;$('continue').onclick=continueCampaign;$('again').onclick=newCampaign;$('next-day').onclick=nextDay;$('exit').onclick=home;$('start-exit').onclick=home;$('end-exit').onclick=home;$('sound').onclick=()=>{audio.toggle();renderUI()};$('intel').onclick=()=>{audio.unlock();renderIntel();show('intel-panel',true)};$('close-intel').onclick=()=>show('intel-panel',false);
if(restored&&!restored.completed){show('continue',true);$('continue-day').textContent=String(restored.day)}

window.__AI_TEST_STATE__={getState:()=>JSON.parse(JSON.stringify(state)),newCampaign,choose:(id)=>decide(id),nextDay,openIntel:()=>{$('intel').click()},version:'0.1.0'};

let acc=0;
function frame(now){const dt=Math.min(.06,Math.max(0,(now-last)/1000));last=now;if(started&&state.phase==='siege'){acc+=dt;while(acc>=1/30&&state.phase==='siege'){stepSiege(state,1/30);acc-=1/30}if(state.phase==='won'||state.phase==='lost')finish()}updateWorld(dt);if(started&&(phaseKey!==state.phase||snowClock>1)){phaseKey=state.phase;snowClock=0;renderUI()}snowClock+=dt;scene.render();requestAnimationFrame(frame)}
addEventListener('resize',()=>engine.resize());document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});
try{renderUI();requestAnimationFrame(frame)}catch(error){console.warn('Last Raven startup unavailable',error);$('start-screen').classList.remove('hidden');$('new-game').setAttribute('disabled','true');const lead=document.querySelector('.lead');if(lead)lead.textContent='Не удалось запустить 3D-сцену. Нужен рабочий WebGL.'}
