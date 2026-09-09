import './styles.css';
import { Color3, Color4, DirectionalLight, Engine, FreeCamera, HemisphericLight, LinesMesh, MeshBuilder, Scene, ShaderMaterial, ShadowGenerator, Vector3 } from '@babylonjs/core';
import { registerSW } from 'virtual:pwa-register';
import { FlightAudio } from './audio';
import { CloudLayer } from './clouds';
import { makeFlightState, stepFlightFrame, terrainSafeAltitude } from './core';
import { DragonRig } from './dragon';
import { FaunaSystem } from './fauna';
import { createControls } from './input';
import { riverCenter, WorldStreamer } from './world';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const canvas=document.querySelector<HTMLCanvasElement>('#renderCanvas')!;const touch=document.querySelector<HTMLElement>('#touchSurface')!;const loading=document.querySelector<HTMLElement>('#loading')!;const loadingText=document.querySelector<HTMLElement>('#loadingText')!;const startBtn=document.querySelector<HTMLButtonElement>('#startBtn')!;const speedEl=document.querySelector<HTMLElement>('#speed')!;const altEl=document.querySelector<HTMLElement>('#alt')!;const modeEl=document.querySelector<HTMLElement>('#mode')!;const soundBtn=document.querySelector<HTMLButtonElement>('#soundBtn')!;const speedLines=document.querySelector<HTMLElement>('#speedlines')!;const errorOverlay=document.querySelector<HTMLElement>('#error')!;const errorText=document.querySelector<HTMLElement>('#errorText')!;const retryBtn=document.querySelector<HTMLButtonElement>('#retryBtn')!;const hints=[document.querySelector<HTMLElement>('#leftHint')!,document.querySelector<HTMLElement>('#rightHint')!];
registerSW({immediate:true});

const engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,antialias:true,adaptToDeviceRatio:false});engine.setHardwareScalingLevel(Math.min(1.32,Math.max(1,devicePixelRatio*.58)));
const scene=new Scene(engine);scene.clearColor=new Color4(.62,.77,.83,1);scene.ambientColor=new Color3(.285,.315,.235);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.00019;scene.fogColor=new Color3(.69,.79,.78);scene.skipPointerMovePicking=true;scene.imageProcessingConfiguration.exposure=1.14;scene.imageProcessingConfiguration.contrast=1.035;
const hemi=new HemisphericLight('skyLight',new Vector3(.16,1,.20),scene);hemi.intensity=1.24;hemi.diffuse=new Color3(.98,.98,.90);hemi.groundColor=new Color3(.36,.40,.28);
const sun=new DirectionalLight('sun',new Vector3(-.42,-.74,.26),scene);sun.position=new Vector3(350,680,-260);sun.intensity=1.58;sun.diffuse=new Color3(1,.92,.78);
const shadows=new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=.0018;

const skyVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 v;void main(){v=normalize(position);gl_Position=worldViewProjection*vec4(position,1.0);}`;
const skyFragment=`precision highp float;varying vec3 v;uniform float time;void main(){float h=clamp(v.y*.5+.5,0.0,1.0);vec3 horizon=vec3(.73,.82,.81),mid=vec3(.42,.65,.73),zenith=vec3(.18,.41,.57);vec3 c=mix(horizon,mid,smoothstep(.0,.44,h));c=mix(c,zenith,smoothstep(.40,1.0,h));float sun=pow(max(dot(normalize(v),normalize(vec3(.38,.62,-.25))),0.0),300.0);float halo=pow(max(dot(normalize(v),normalize(vec3(.38,.62,-.25))),0.0),18.0);c+=sun*vec3(1.0,.80,.47)*1.38+halo*vec3(.12,.09,.05);float haze=(1.0-smoothstep(.48,.72,h))*.04;c=mix(c,vec3(.81,.86,.83),haze);gl_FragColor=vec4(c,1.0);}`;
const sky=MeshBuilder.CreateSphere('sky',{diameter:4400,segments:20,sideOrientation:1},scene);const skyMat=new ShaderMaterial('skyMat',scene,{vertexSource:skyVertex,fragmentSource:skyFragment},{attributes:['position'],uniforms:['worldViewProjection','time']});skyMat.backFaceCulling=false;sky.material=skyMat;sky.infiniteDistance=true;sky.isPickable=false;

const camera=new FreeCamera('camera',new Vector3(0,205,-20),scene);camera.minZ=.28;camera.maxZ=4700;camera.fov=.84;scene.activeCamera=camera;
const state=makeFlightState();const controls=createControls(touch);const audio=new FlightAudio();const world=new WorldStreamer(scene);const dragon=new DragonRig(scene);const fauna=new FaunaSystem(scene);const clouds=new CloudLayer(scene);
state.position.x=1750;state.position.z=riverCenter(state.position.x);
const tangentDz=riverCenter(state.position.x+8)-riverCenter(state.position.x-8);state.yaw=Math.atan2(16,tangentDz);state.velocity={x:Math.sin(state.yaw)*29,y:0,z:Math.cos(state.yaw)*29};state.speed=29;
const initialGround=world.heightAt(state.position.x,state.position.z);state.position.y=initialGround+74;const initialForward=new Vector3(Math.sin(state.yaw),0,Math.cos(state.yaw));camera.position=new Vector3(state.position.x,state.position.y+4,state.position.z).subtract(initialForward.scale(16));altEl.textContent=String(Math.round(state.position.y-initialGround));
let cameraAim=new Vector3(state.position.x,state.position.y+.8,state.position.z).add(initialForward.scale(20));
let lookYaw=0,lookPitch=-.025;let started=false,last=performance.now(),fpsEMA=60,quality=1,frameCount=0;
let soundEnabled=true;try{soundEnabled=localStorage.getItem('pocket-works:aetherwing:sound')!=='off';}catch{/* storage may be unavailable in private browsing */}audio.setMuted(!soundEnabled);
const syncSoundButton=()=>{soundBtn.textContent=soundEnabled?'SND ON':'SND OFF';soundBtn.setAttribute('aria-pressed',String(soundEnabled));soundBtn.setAttribute('aria-label',soundEnabled?'Выключить звук':'Включить звук');};syncSoundButton();
const qaState={version:'1.1.0',loadingState:'booting',started:false,dragonReady:false,usedFallback:false,animationGroups:0,boneCount:0,authoredBiomeTemplates:0,clouds:clouds.count,chunks:0,fauna:fauna.activeCount,mode:state.mode,speed:state.speed,altitude:Number((state.position.y-initialGround).toFixed(2)),groundHeight:Number(initialGround.toFixed(2)),terrainMeshes:0,waterMeshes:0,riverMeshes:0,materialsHealthy:true,vegetationInstances:0,treeInstances:0,brakeEvents:0,lastGesture:'',position:{...state.position},pitch:state.pitch,roll:state.roll,yaw:state.yaw,quality,cameraDistance:16,cameraGroundClearance:74,dragonObstacleClearance:74,cameraObstacleClearance:74,assetErrors:[] as string[]};
(window as typeof window & {__AI_TEST_STATE__?:typeof qaState}).__AI_TEST_STATE__=qaState;

type WindStreak={line:LinesMesh;side:number;lift:number;depth:number;phase:number};
const windStreaks:WindStreak[]=Array.from({length:18},(_,i)=>{const line=MeshBuilder.CreateLines(`wind_${i}`,{points:[Vector3.Zero(),new Vector3(0,0,-1)],updatable:true},scene);line.color=new Color3(.76,.86,.84);line.isPickable=false;line.alwaysSelectAsActiveMesh=true;line.setEnabled(false);const seed=(i*47%113)/113;return{line,side:(seed-.5)*30,lift:((((i*71)%97)/97)-.5)*13,depth:((i*29)%101)/101,phase:((i*61)%103)/103};});

type ObstacleShape={minY:number;maxY:number;radius:number;tree:boolean};
const obstacleShapes=new Map<number,ObstacleShape>();
function obstacleShape(source:any):ObstacleShape|null{
  const name=String(source?.name??'').toLowerCase();const tree=name.includes('fir')||name.includes('oak')||name.includes('aspen')||name.includes('broad');const rock=name.includes('rock');if(!tree&&!rock)return null;
  let cached=obstacleShapes.get(source.uniqueId);if(cached)return cached;
  const b=source.getBoundingInfo().boundingBox,min=b.minimum,max=b.maximum;cached={minY:min.y,maxY:max.y,radius:Math.max(max.x-min.x,max.z-min.z)*.46,tree};obstacleShapes.set(source.uniqueId,cached);return cached;
}
function obstacleSurfaceAt(x:number,z:number,clearanceBias:number){
  let surface=world.heightAt(x,z);
  for(const [,chunk] of world.chunks)for(const inst of chunk.instances){
    const shape=obstacleShape(inst.sourceMesh);if(!shape)continue;
    const sx=Math.abs(inst.scaling.x),sy=Math.abs(inst.scaling.y),sz=Math.abs(inst.scaling.z),radius=Math.max(1.15,shape.radius*Math.max(sx,sz));const dx=x-inst.position.x,dz=z-inst.position.z,d2=dx*dx+dz*dz;if(d2>radius*radius)continue;
    const d=Math.sqrt(d2)/radius,base=inst.position.y+shape.minY*sy,top=inst.position.y+shape.maxY*sy;
    const profile=shape.tree?Math.pow(Math.max(0,1-d*d),.42):Math.sqrt(Math.max(0,1-d*d));const local=base+(top-base)*profile-clearanceBias;surface=Math.max(surface,local);
  }
  return surface;
}

function modeLabel(){return state.mode==='glide'?'GLIDE':state.mode==='flap'?'POWER':state.mode==='climb'?'CLIMB':state.mode==='dive'?'DIVE':'AIR BRAKE';}
function forward(){const cp=Math.cos(state.pitch);return new Vector3(Math.sin(state.yaw)*cp,Math.sin(state.pitch),Math.cos(state.yaw)*cp).normalize();}
function updateWindStreaks(speedN:number,time:number,ground:number){const altitude=Math.max(0,state.position.y-ground);const lowFlight=1-Math.max(0,Math.min(1,(altitude-22)/165));const visible=speedN>.08;const f=forward();let right=Vector3.Cross(Vector3.Up(),f);if(right.lengthSquared()<.01)right=Vector3.Right();else right.normalize();const up=Vector3.Cross(f,right).normalize();const base=new Vector3(state.position.x,state.position.y,state.position.z);for(const streak of windStreaks){streak.line.setEnabled(visible);if(!visible)continue;const cycle=(streak.phase+time*(.34+speedN*.95))%1;const forwardOffset=17-cycle*(40+speedN*68)+streak.depth*10;const start=base.add(right.scale(streak.side)).add(up.scale(streak.lift)).add(f.scale(forwardOffset));const length=1.4+speedN*(4.2+streak.depth*6.7);MeshBuilder.CreateLines(streak.line.name,{points:[Vector3.Zero(),f.scale(-length)],instance:streak.line});streak.line.position.copyFrom(start);streak.line.visibility=.065+speedN*(.19+.15*lowFlight);}}
function terrainSafeCameraTarget(target:Vector3,desired:Vector3,altitude:number){
  if(altitude>=105)return desired;
  const clearance=3.0;
  for(let i=0;i<=11;i++){
    const t=1-i*.075,candidate=Vector3.Lerp(target,desired,t);
    if(candidate.y>=obstacleSurfaceAt(candidate.x,candidate.z,.35)+clearance)return candidate;
  }
  const fallback=Vector3.Lerp(target,desired,.14);fallback.y=Math.max(fallback.y,obstacleSurfaceAt(fallback.x,fallback.z,.35)+clearance);return fallback;
}
function updateCamera(dt:number,ground:number){
  const look=controls.consumeLook();lookYaw-=look.x;lookPitch=Math.max(-.36,Math.min(.48,lookPitch-look.y));lookYaw*=Math.pow(.994,dt*60);
  const target=new Vector3(state.position.x,state.position.y+.85,state.position.z),yaw=state.yaw+lookYaw,horiz=new Vector3(Math.sin(yaw),0,Math.cos(yaw));const speedN=Math.max(0,Math.min(1,(state.speed-20)/65)),altitude=Math.max(0,state.position.y-ground),lowCamera=clamp((38-altitude)/38,0,1);
  let right=Vector3.Cross(Vector3.Up(),horiz);if(right.lengthSquared()<.01)right=Vector3.Right();else right.normalize();
  const dist=14.7+speedN*4.8-lowCamera*2.7,height=3.7+lookPitch*7.0+speedN*.75+lowCamera*.75,bankLag=clamp(state.roll,-.7,.7)*.82;
  let desired=target.subtract(horiz.scale(dist)).add(new Vector3(0,height,0)).add(right.scale(bankLag));desired=terrainSafeCameraTarget(target,desired,altitude);
  const response=altitude<22?9.2:altitude<55?5.7:3.55-speedN*.70,lag=1-Math.exp(-dt*response);let next=Vector3.Lerp(camera.position,desired,lag);const offset=next.subtract(target);if(offset.length()>25.5)next=target.add(offset.normalize().scale(25.5));if(next.y<obstacleSurfaceAt(next.x,next.z,.35)+2.2)next=desired.clone();camera.position.copyFrom(next);
  const downBias=Math.max(5.0,Math.min(13.5,altitude*.068));const aim=target.add(forward().scale(19+speedN*14)).add(new Vector3(0,lookPitch*8.5-downBias,0));cameraAim=Vector3.Lerp(cameraAim,aim,1-Math.exp(-dt*(altitude<24?9.4:6.0)));camera.setTarget(cameraAim);camera.fov+=(.82+speedN*.17+(state.mode==='dive'?.05:0)-camera.fov)*(1-Math.exp(-dt*3.8));
}
function updateQuality(dt:number){fpsEMA+=(1/Math.max(dt,.001)-fpsEMA)*.03;if(++frameCount%180)return;if(fpsEMA<40&&quality>.6){quality=Math.max(.6,quality-.12);engine.setHardwareScalingLevel(Math.min(1.82,engine.getHardwareScalingLevel()+.12));world.setQuality(quality);}else if(fpsEMA>57&&quality<1){quality=Math.min(1,quality+.08);engine.setHardwareScalingLevel(Math.max(1,engine.getHardwareScalingLevel()-.07));world.setQuality(quality);}}
function publishQA(ground:number){const dragonSurface=obstacleSurfaceAt(state.position.x,state.position.z,4.5),cameraSurface=obstacleSurfaceAt(camera.position.x,camera.position.z,.35);qaState.started=started;qaState.dragonReady=dragon.ready;qaState.usedFallback=dragon.usedFallback;qaState.animationGroups=dragon.groups.size;qaState.boneCount=dragon.bones.size;qaState.authoredBiomeTemplates=world.authoredTemplateCount;qaState.chunks=world.chunks.size;qaState.fauna=fauna.activeCount;qaState.mode=state.mode;qaState.speed=Number(state.speed.toFixed(2));qaState.altitude=Number((state.position.y-ground).toFixed(2));qaState.groundHeight=Number(ground.toFixed(2));qaState.terrainMeshes=scene.meshes.filter(m=>m.name.startsWith('terrain_')&&m.isEnabled()).length;qaState.waterMeshes=scene.meshes.filter(m=>(m.name.startsWith('river_')||m.name.startsWith('lake_'))&&m.isEnabled()).length;qaState.riverMeshes=world.riverMeshCount;qaState.materialsHealthy=world.materialsHealthy;qaState.vegetationInstances=world.instanceCount;qaState.treeInstances=world.treeCount;qaState.brakeEvents=controls.brakeEvents;qaState.lastGesture=controls.lastGesture;qaState.position={x:Number(state.position.x.toFixed(2)),y:Number(state.position.y.toFixed(2)),z:Number(state.position.z.toFixed(2))};qaState.pitch=Number(state.pitch.toFixed(3));qaState.roll=Number(state.roll.toFixed(3));qaState.yaw=Number(state.yaw.toFixed(3));qaState.quality=Number(quality.toFixed(2));qaState.cameraDistance=Number(Vector3.Distance(camera.position,dragon.root.position).toFixed(2));qaState.cameraGroundClearance=Number((camera.position.y-world.heightAt(camera.position.x,camera.position.z)).toFixed(2));qaState.dragonObstacleClearance=Number((state.position.y-dragonSurface).toFixed(2));qaState.cameraObstacleClearance=Number((camera.position.y-cameraSurface).toFixed(2));}
function showFatal(err:unknown){const message=err instanceof Error?err.message:String(err);console.error(err);qaState.loadingState='error';if(!qaState.assetErrors.includes(message))qaState.assetErrors.push(message);startBtn.disabled=true;loading.classList.add('dismiss');errorText.textContent=`Не удалось загрузить игровую сцену. Проверь соединение и повтори запуск. ${message}`;errorOverlay.hidden=false;}

async function boot(){loadingText.textContent='Риггинг дракона и загрузка Blender-биома…';await Promise.all([dragon.load(p=>loadingText.textContent=`Дракон ${(p*100|0)}%`),world.templatesReady]);for(const m of dragon.meshes){shadows.addShadowCaster(m,true);m.receiveShadows=true;}const authored=world.authoredTemplateCount;loadingText.textContent=dragon.usedFallback?'Forge-модель не загрузилась; включён цветной резервный дракон.':authored===3?'Дракон, Blender-биом и анимации готовы.':'Дракон готов; биом использует процедурный резерв.';world.update(new Vector3(state.position.x,state.position.y,state.position.z),0);qaState.loadingState='awaiting-start';qaState.dragonReady=dragon.ready;qaState.usedFallback=dragon.usedFallback;qaState.animationGroups=dragon.groups.size;qaState.boneCount=dragon.bones.size;qaState.authoredBiomeTemplates=authored;startBtn.disabled=false;loading.classList.add('ready');startBtn.textContent='В НЕБО';}
startBtn.addEventListener('click',async()=>{await audio.start();audio.setMuted(!soundEnabled);syncSoundButton();started=true;qaState.loadingState='flying';loading.classList.add('dismiss');hints.forEach((h,i)=>setTimeout(()=>h.style.opacity='0',3600+i*500));});
soundBtn.addEventListener('click',async()=>{await audio.start();soundEnabled=!soundEnabled;audio.setMuted(!soundEnabled);try{localStorage.setItem('pocket-works:aetherwing:sound',soundEnabled?'on':'off');}catch{/* storage may be unavailable */}syncSoundButton();});
retryBtn.addEventListener('click',()=>location.reload());
addEventListener('resize',()=>engine.resize(),{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.stopRenderLoop();else{last=performance.now();engine.runRenderLoop(loop);}});
function loop(){const now=performance.now();const dt=Math.min(.12,Math.max(.001,(now-last)/1000));last=now;let ground=world.heightAt(state.position.x,state.position.z);if(started){const input={x:controls.x,y:controls.y,boost:controls.boost,brake:controls.brake};stepFlightFrame(state,input,dt);ground=world.heightAt(state.position.x,state.position.z);const flightSurface=obstacleSurfaceAt(state.position.x,state.position.z,4.5);terrainSafeAltitude(state,flightSurface,dt);dragon.update(state,input,dt);updateCamera(dt,ground);world.update(dragon.root.position,now/1000);fauna.update(dragon.root.position,new Vector3(state.velocity.x,state.velocity.y,state.velocity.z),now/1000);clouds.update(dragon.root.position,now/1000);audio.update(state,dt);updateQuality(dt);speedEl.textContent=String(Math.round(state.speed));altEl.textContent=String(Math.max(0,Math.round(state.position.y-ground)));modeEl.textContent=modeLabel();const speedN=Math.max(0,Math.min(1,(state.speed-27)/58));const lowFlight=1-Math.max(0,Math.min(1,((state.position.y-ground)-18)/155));speedLines.style.opacity=String(speedN*(.15+.15*lowFlight));updateWindStreaks(speedN,now/1000,ground);}else{updateWindStreaks(0,now/1000,ground);clouds.update(new Vector3(state.position.x,state.position.y,state.position.z),now/1000);}sky.position.copyFrom(camera.position);skyMat.setFloat('time',now/1000);publishQA(ground);scene.render();}
boot().catch(showFatal);engine.runRenderLoop(loop);
