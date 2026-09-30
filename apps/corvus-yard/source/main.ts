import '../../../shared/mobile-runtime.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Engine, Scene, Color3, Color4, Vector3, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder, StandardMaterial, RawCubeTexture, Constants } from '@babylonjs/core';
import { World, type Perch } from './world';
import { CrowRig } from './crow';
import { CrowCamera } from './camera';
import { CrowInput } from './input';
import { CrowAudio } from './audio';
import { Ecology, type EcologyProgress } from './ecology';
import { createCrowState, stepCrow, launchCrow, hitCrow, landCrow } from './flight';
installMobileRuntime();
registerEnhancedUpdate({appName:'CORVUS',version:'1.0.0',releaseNotes:['Живой ворон над осенним каналом.']});
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('scene');
const namespace='pocket-works:corvus-yard:save';
let saved:(EcologyProgress & {sound?:boolean})|undefined;
try { const data=JSON.parse(localStorage.getItem(namespace)||'null'); if(data&&Number.isFinite(data.foods)&&Number.isFinite(data.nuts)&&Array.isArray(data.visited))saved={foods:Math.min(100,Math.max(0,data.foods)),nuts:Math.min(100,Math.max(0,data.nuts)),visited:data.visited.filter((v:unknown)=>typeof v==='string').slice(0,32),consumedIds:Array.isArray(data.consumedIds)?data.consumedIds.filter((v:unknown)=>typeof v==='string').slice(0,64):[],crackedIds:Array.isArray(data.crackedIds)?data.crackedIds.filter((v:unknown)=>typeof v==='string').slice(0,64):[],sound:data.sound!==false}; } catch {}
let engine:Engine,scene:Scene,world:World,rig:CrowRig,camera:CrowCamera,ecology:Ecology;
const audio=new CrowAudio();audio.setEnabled(saved?.sound!==false);
const input=new CrowInput(canvas,$('stick'),$('flap'),$('brake'));
let state=createCrowState({x:0,y:8.46,z:-15});
let phase:'loading'|'menu'|'playing'|'paused'|'complete'|'error'='loading';
let elapsed=0,toastUntil=0,lastSave=0,completed=!!saved?.visited.includes('bell-tower');let support:Perch|null=null;
function save(){if(!ecology)return;try{localStorage.setItem(namespace,JSON.stringify({...ecology.progress,sound:audio.enabled}));}catch{}}
function toast(text:string){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=elapsed+3.5;}
function toggleSound(){audio.setEnabled(!audio.enabled);if(audio.enabled&&phase==='playing')void audio.unlock();syncSound();save();}
function syncSound(){for(const id of ['sound','pause-sound'])$(id).textContent=`Звук: ${audio.enabled?'включён':'выключен'}`;}
syncSound();$('sound').onclick=toggleSound;$('pause-sound').onclick=toggleSound;
function play(){phase='playing';input.reset();for(const id of ['menu','pause-menu','complete'])$(id).hidden=true;$('controls').hidden=false;$('hud').hidden=false;void audio.unlock().catch(()=>{});}
$('start').onclick=()=>{play();toast('Удерживай «Взмах» для взлёта. Отпусти — и планируй.');};
function pause(){if(phase!=='playing')return;phase='paused';input.reset();audio.pause();save();$('pause-menu').hidden=false;$('controls').hidden=true;}
$('pause').onclick=pause;$('resume').onclick=play;$('explore').onclick=play;
$('home').onclick=()=>{state=createCrowState({x:0,y:world.perches[0].position.y+.46,z:-15});support=world.perches[0];state.yaw=0;camera.reset(state);play();toast('Родная ветка. Новый заход.');};
function interact(){if(phase!=='playing')return;const was=ecology.carrying;toast(ecology.interact(state));audio.event(was?'eat':'pickup',state.position);save();}
function drop(){if(phase!=='playing')return;toast(ecology.drop(state));audio.event('drop',state.position);}
$('interact').onclick=interact;$('drop').onclick=drop;
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Escape')phase==='playing'?pause():phase==='paused'?play():null;if(e.code==='KeyE')interact();if(e.code==='KeyQ')drop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>engine?.resize());
function objective(){const p=ecology.progress;return p.foods<2?`Найди еду под родным деревом · ${p.foods}/2`:p.nuts<1?'Подними орех и сбрось на дорожку с высоты 4 м':!p.visited.includes('bell-tower')?'Поднимись к шпилю колокольни · держи взмах и руль вверх':'Квартал освоен · свободный полёт';}
function land(perch:Perch|null,y:number){landCrow(state,y);support=perch;audio.event(perch?'perch':'step',state.position);if(perch)toast(perch.id==='home'?'Родная ветка':perch.kind==='roof'?'На крыше':perch.kind==='spire'?'Колокольня':'Лапы на опоре');}
function frame(dt:number){elapsed+=dt;
 if(phase==='playing'){
  const previous=new Vector3(state.position.x,state.position.y,state.position.z);
  if(input.consumeLaunch()&&state.grounded){support=null;launchCrow(state);}
  if(state.grounded){const y=world.supportHeight(state.position.x,state.position.z,state.supportY);if(y===null){state.grounded=false;state.velocity.y=-.2;support=null;}else state.supportY=y;}
  stepCrow(state,input.controls,dt,{x:Math.sin(elapsed*.4)*.4+.35,y:0,z:Math.cos(elapsed*.25)*.25});
  if(!state.grounded){
   const pos=new Vector3(state.position.x,state.position.y,state.position.z);
   // Air-braking assists only an intentional, slow, close approach, never a distant teleport.
   if(input.controls.brake>.2&&state.speed<8&&state.mode!=='stunned'){
    let best:Perch|null=null,distance=1.4;
    for(const p of world.perches){const d=Vector3.Distance(pos,p.position.add(new Vector3(0,.46,0)));if(d<distance&&state.velocity.y<3){best=p;distance=d;}}
    if(best){const target=best.position.add(new Vector3(0,.46,0)),k=1-Math.exp(-dt*8);pos.copyFrom(Vector3.Lerp(pos,target,k));state.velocity.x*=1-k;state.velocity.z*=1-k;state.velocity.y*=1-k;state.position={x:pos.x,y:pos.y,z:pos.z};if(distance<.24){land(best,best.position.y);state.position.x=best.position.x;state.position.z=best.position.z;}}
   }
   if(!state.grounded){const collision=world.resolve(pos,previous,.27);state.position={x:pos.x,y:pos.y,z:pos.z};if(collision){hitCrow(state,collision.normal,state.speed);audio.event('impact',state.position);}
    const floor=world.groundHeight(pos.x,pos.z);
    if(state.position.y<floor+.46){if(floor<-.1){audio.event('water',state.position);state=createCrowState({x:0,y:world.perches[0].position.y+.46,z:-15});support=world.perches[0];camera.reset(state);toast('Мокрые перья. Возвращение на ветку.');}else if(state.velocity.y<-7){hitCrow(state,{x:0,y:1,z:0},-state.velocity.y);state.position.y=floor+.48;}else land(null,floor);}
   }
  }else if(!support){const p=new Vector3(state.position.x,state.position.y,state.position.z),collision=world.resolve(p,previous,.27);state.position={x:p.x,y:p.y,z:p.z};if(collision)hitCrow(state,collision.normal,state.speed);state.supportY=world.groundHeight(p.x,p.z);if(state.supportY<-.1){state.grounded=false;state.velocity.y=-1;}}
  if(Math.hypot(state.position.x,state.position.z)>78||state.position.y>65){state.yaw=Math.atan2(-state.position.x,-state.position.z);state.velocity.x-=state.position.x*dt*.12;state.velocity.z-=state.position.z*dt*.12;toast('За кварталом сильный ветер. Поворачивай домой.');}
  ecology.update(dt,elapsed,state);const target=ecology.nearestTarget(state);rig.update(state,input.controls,dt,target?.position);camera.update(state,dt,world.colliders);world.clearCameraView(camera.camera.position);audio.update(state,dt);
  $('objective').textContent=objective();$('target').hidden=!target;if(target)$('target').textContent=target.label;$('interact').textContent=ecology.carrying?'Съесть':'Взять';$('drop').hidden=!ecology.carrying;
  if(!completed&&ecology.progress.visited.includes('bell-tower')){completed=true;save();phase='complete';input.reset();audio.pause();$('complete').hidden=false;$('controls').hidden=true;}
  if(elapsed-lastSave>8){save();lastSave=elapsed;}
 }else if(phase==='menu'){rig?.update(state,{turn:0,pitch:0,flap:0,brake:0},dt);ecology?.update(dt,elapsed,state);}
 if(phase==='playing'||phase==='menu')world?.update(dt,elapsed,new Vector3(state.position.x,state.position.y,state.position.z));
 if(elapsed>toastUntil)$('toast').classList.remove('visible');
 (window as unknown as {__AI_TEST_STATE__:unknown}).__AI_TEST_STATE__={phase,position:{...state.position},velocity:{...state.velocity},mode:state.mode,grounded:state.grounded,speed:state.speed,rigReady:rig?.ready,ecology:ecology?.summary(),fps:engine?.getFps(),support:support?.id||null,meshes:scene?.meshes.length,camera:camera?.camera.position.asArray()};
}
async function boot(){try{
 engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'},true);engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
 scene=new Scene(engine);scene.clearColor=new Color4(.61,.67,.64,1);scene.fogMode=Scene.FOGMODE_EXP;scene.fogDensity=.0035;scene.fogColor=new Color3(.61,.67,.64);scene.imageProcessingConfiguration.exposure=1.1;scene.imageProcessingConfiguration.contrast=1.12;scene.imageProcessingConfiguration.toneMappingEnabled=true;
 // Local sky irradiance instead of a network HDR dependency.
 const size=16,faces:Uint8Array[]=[];for(let f=0;f<6;f++){const data=new Uint8Array(size*size*4);for(let i=0;i<size*size;i++){const y=Math.floor(i/size)/size,v=f===2?1:f===3?.38:.65+y*.15;data[i*4]=170*v;data[i*4+1]=185*v;data[i*4+2]=185*v;data[i*4+3]=255;}faces.push(data);}scene.environmentTexture=new RawCubeTexture(scene,faces,size,Constants.TEXTUREFORMAT_RGBA,Constants.TEXTURETYPE_UNSIGNED_BYTE,true);
 const sky=MeshBuilder.CreateSphere('overcast sky',{diameter:400,segments:16,sideOrientation:1},scene);const skyMat=new StandardMaterial('mist sky',scene);skyMat.disableLighting=true;skyMat.emissiveColor=new Color3(.62,.69,.67);skyMat.backFaceCulling=false;sky.material=skyMat;sky.isPickable=false;
 const ambient=new HemisphericLight('soft sky',new Vector3(0,1,0),scene);ambient.intensity=.7;ambient.diffuse=new Color3(.79,.86,.85);ambient.groundColor=new Color3(.25,.24,.16);
 const sun=new DirectionalLight('late autumn sun',new Vector3(-.55,-.85,.35),scene);sun.position.set(25,55,-25);sun.intensity=2.1;sun.diffuse=new Color3(1,.86,.63);const shadows=new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.bias=.0008;shadows.normalBias=.025;shadows.setDarkness(.22);
 world=new World(scene);rig=new CrowRig(scene);camera=new CrowCamera(scene,canvas);await Promise.all([world.load(),rig.load()]);
 for(const m of [...world.meshes,...rig.meshes])if(m.getTotalVertices()>0&&!/ground|water|grass|leaf/i.test(m.name))shadows.addShadowCaster(m);
 ecology=new Ecology(scene,world.perches,saved,(x,z,y)=>world.supportHeight(x,z,y)??world.groundHeight(x,z));support=world.perches[0];state=createCrowState({x:support.position.x,y:support.position.y+.46,z:support.position.z});state.yaw=0;camera.reset(state);phase='menu';$('loading').hidden=true;$<HTMLButtonElement>('start').disabled=false;
 let previous=performance.now(),slowFrames=0,optimized=false;engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min(.05,(now-previous)/1000);previous=now;if(document.hidden)return;frame(dt);scene.render();if(dt>.032)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);if(!optimized&&slowFrames>100){optimized=true;engine.setHardwareScalingLevel(Math.max(1.5,devicePixelRatio));shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;}});
 }catch(error){phase='error';$('loading').textContent='Не удалось загрузить квартал. Перезапусти приложение.';$<HTMLButtonElement>('start').disabled=false;$('start').textContent='Повторить загрузку';$('start').onclick=()=>location.reload();console.error(error);}}
void boot();
