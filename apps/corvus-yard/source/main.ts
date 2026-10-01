import '../../../shared/mobile-runtime.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { Engine, Scene, Color3, Color4, Vector3, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder, StandardMaterial, RawCubeTexture, Constants, ShaderMaterial, ImageProcessingConfiguration } from '@babylonjs/core';
import { World, type Perch } from './world';
import { CrowRig } from './crow';
import { CrowCamera } from './camera';
import { CrowInput } from './input';
import { CrowAudio } from './audio';
import { Ecology, type EcologyProgress } from './ecology';
import { FlightEffects } from './effects';
import { createCrowState, stepCrow, launchCrow, hitCrow, landCrow } from './flight';
installMobileRuntime();
registerEnhancedUpdate({appName:'CORVUS',version:'1.2.0',releaseNotes:['Сложенные крылья, мягкая посадка и новые водные блики.']});
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('scene');
const namespace='pocket-works:corvus-yard:save';
let saved:(EcologyProgress & {sound?:boolean})|undefined;
try { const data=JSON.parse(localStorage.getItem(namespace)||'null'); if(data&&Number.isFinite(data.foods)&&Number.isFinite(data.nuts)&&Array.isArray(data.visited))saved={foods:Math.min(100,Math.max(0,data.foods)),nuts:Math.min(100,Math.max(0,data.nuts)),visited:data.visited.filter((v:unknown)=>typeof v==='string').slice(0,32),consumedIds:Array.isArray(data.consumedIds)?data.consumedIds.filter((v:unknown)=>typeof v==='string').slice(0,64):[],crackedIds:Array.isArray(data.crackedIds)?data.crackedIds.filter((v:unknown)=>typeof v==='string').slice(0,64):[],items:data.items,carriedId:data.carriedId,sound:data.sound!==false}; } catch {}
let engine:Engine,scene:Scene,world:World,rig:CrowRig,camera:CrowCamera,ecology:Ecology,effects:FlightEffects;
const audio=new CrowAudio();audio.setEnabled(saved?.sound!==false);
const input=new CrowInput(canvas,$('stick'),$('flap'),$('brake'));
let state=createCrowState({x:0,y:8.46,z:-15});
let phase:'loading'|'menu'|'playing'|'paused'|'complete'|'error'='loading';
let renderMs=0,quality='balanced';let elapsed=0,toastUntil=0,lastSave=0,completed=!!saved?.visited.includes('bell-tower');let support:Perch|null=null;
function save(){if(!ecology)return;try{localStorage.setItem(namespace,JSON.stringify({...ecology.progress,sound:audio.enabled}));}catch{}}
function toast(text:string){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=elapsed+3.5;}
function toggleSound(){audio.setEnabled(!audio.enabled);if(audio.enabled&&phase==='playing')void audio.unlock();syncSound();save();}
function syncSound(){for(const id of ['sound','pause-sound'])$(id).textContent=`Звук: ${audio.enabled?'включён':'выключен'}`;}
syncSound();$('sound').onclick=toggleSound;$('pause-sound').onclick=toggleSound;
function play(){if(phase==='menu')camera.reset(state);phase='playing';input.reset();for(const id of ['menu','pause-menu','complete'])$(id).hidden=true;$('controls').hidden=false;$('hud').hidden=false;void audio.unlock().catch(()=>{});}
$('start').onclick=()=>{play();toast('Удерживай «Взмах» для взлёта. Отпусти — и планируй.');};
function pause(){if(phase!=='playing')return;phase='paused';input.reset();audio.pause();save();$('pause-menu').hidden=false;$('controls').hidden=true;}
$('pause').onclick=pause;$('resume').onclick=play;$('explore').onclick=play;
$('home').onclick=()=>{state=createCrowState({x:0,y:world.perches[0].position.y+.46,z:-15});support=world.perches[0];state.yaw=0;camera.reset(state);play();toast('Родная ветка. Новый заход.');};
function interact(){if(phase!=='playing')return;const was=ecology.carrying;rig.gestureAction('Peck');toast(ecology.interact(state));audio.event(was?'eat':'pickup',state.position);save();}
function drop(){if(phase!=='playing')return;toast(ecology.drop(state));audio.event('drop',state.position);}
$('interact').onclick=interact;$('drop').onclick=drop;
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Escape')phase==='playing'?pause():phase==='paused'?play():null;if(e.code==='KeyE')interact();if(e.code==='KeyQ')drop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>engine?.resize());
function objective(){const p=ecology.progress;return p.foods<2?`Найди еду под родным деревом · ${p.foods}/2`:p.nuts<1?'Подними орех и сбрось на дорожку с высоты 4 м':!p.visited.includes('bell-tower')?'К шпилю колокольни · взмах + руль вверх, рядом — посадка':'Квартал освоен · свободный полёт';}
function land(perch:Perch|null,y:number){effects?.contact(state.position,y);landCrow(state,y);support=perch;audio.event(perch?'perch':'step',state.position);if(perch)toast(perch.id==='home'?'Родная ветка':perch.kind==='roof'?'На крыше':perch.kind==='spire'?'Колокольня':'Лапы на опоре');}
function frame(dt:number){elapsed+=dt;
 if(phase==='playing'){
  const previous=new Vector3(state.position.x,state.position.y,state.position.z);
  if(input.consumeLaunch()&&state.grounded){effects.contact(state.position,state.supportY);support=null;launchCrow(state);}
  if(state.grounded){const y=world.supportHeight(state.position.x,state.position.z,state.supportY);if(y===null){state.grounded=false;state.velocity.y=-.2;support=null;}else state.supportY=y;}
  stepCrow(state,input.controls,dt,{x:Math.sin(elapsed*.4)*.4+.35,y:0,z:Math.cos(elapsed*.25)*.25});if(!state.grounded)support=null;
  if(!state.grounded){
   const pos=new Vector3(state.position.x,state.position.y,state.position.z);
   // Air-braking assists only an intentional, slow, close approach, never a distant teleport.
   if(input.controls.brake>.2&&state.speed<8&&state.mode!=='stunned'){
    let best:Perch|null=null,distance=1.4;
    for(const p of world.perches){const d=Vector3.Distance(pos,p.position.add(new Vector3(0,.46,0)));if(d<distance&&state.velocity.y<3){best=p;distance=d;}}
    if(best){const target=best.position.add(new Vector3(0,.46,0)),k=1-Math.exp(-dt*8);pos.copyFrom(Vector3.Lerp(pos,target,k));state.velocity.x*=1-k;state.velocity.z*=1-k;state.velocity.y*=1-k;state.position={x:pos.x,y:pos.y,z:pos.z};if(distance<.24){land(best,best.position.y);state.position.x=best.position.x;state.position.z=best.position.z;}}
   }
   if(!state.grounded){const touchdown=state.velocity.y<=0?world.landingHeight(pos.x,pos.z,previous.y-.46,pos.y-.46):null;
    const resolved=pos.clone(),collision=world.resolve(resolved,previous,.27);
    if(touchdown!==null&&touchdown>=0&&state.velocity.y>=-7&&(!collision||collision.normal.y>.5)){land(null,touchdown);pos.y=state.position.y;}
    else if(collision){pos.copyFrom(resolved);hitCrow(state,collision.normal,state.speed);audio.event('impact',state.position);}
    state.position={x:pos.x,y:pos.y,z:pos.z};
    const floor=world.groundHeight(pos.x,pos.z);
    if(state.position.y<floor+.46){if(floor<-.1){audio.event('water',state.position);state=createCrowState({x:0,y:world.perches[0].position.y+.46,z:-15});support=world.perches[0];camera.reset(state);toast('Мокрые перья. Возвращение на ветку.');}else if(state.velocity.y<-7){hitCrow(state,{x:0,y:1,z:0},-state.velocity.y);state.position.y=floor+.48;}else land(null,floor);}
   }
  }else{const p=new Vector3(state.position.x,state.position.y,state.position.z),collision=world.resolve(p,previous,.27);state.position={x:p.x,y:p.y,z:p.z};if(collision)hitCrow(state,collision.normal,state.speed);const supportY=world.supportHeight(p.x,p.z,state.supportY);if(supportY===null||supportY<-.1){state.grounded=false;state.velocity.y=-1;support=null;}else{state.supportY=supportY;state.position.y=supportY+.46;if(support&&Math.hypot(p.x-support.position.x,p.z-support.position.z)>support.radius)support=null;}}
  if(Math.hypot(state.position.x,state.position.z)>78||state.position.y>65){state.yaw=Math.atan2(-state.position.x,-state.position.z);state.velocity.x-=state.position.x*dt*.12;state.velocity.z-=state.position.z*dt*.12;toast('За кварталом сильный ветер. Поворачивай домой.');}
  ecology.update(dt,elapsed,state);const target=ecology.nearestTarget(state);rig.update(state,input.controls,dt,target?.position);if(rig.consumeCall())audio.event('caw',state.position);camera.update(state,dt,world.colliders);world.clearCameraView(camera.camera.position);audio.update(state,dt);effects.update(state,dt,world);
  $('objective').textContent=objective();$('target').hidden=!target;if(target)$('target').textContent=target.label;$('interact').textContent=ecology.carrying?'Съесть':'Взять';$('drop').hidden=!ecology.carrying;
  if(!completed&&ecology.progress.visited.includes('bell-tower')){completed=true;save();phase='complete';input.reset();audio.pause();$('complete').hidden=false;$('controls').hidden=true;$('hud').hidden=true;$('target').hidden=true;$('toast').classList.remove('visible');}
  if(elapsed-lastSave>8){save();lastSave=elapsed;}
 }else if(phase==='menu'){camera?.preview(state,elapsed,dt);rig?.update(state,{turn:0,pitch:0,flap:0,brake:0},dt);ecology?.update(dt,elapsed,state);}
 if(phase==='playing'||phase==='menu')world?.update(dt,elapsed,new Vector3(state.position.x,state.position.y,state.position.z));
 if(elapsed>toastUntil)$('toast').classList.remove('visible');
 (window as unknown as {__AI_TEST_STATE__:unknown}).__AI_TEST_STATE__={phase,position:{...state.position},velocity:{...state.velocity},mode:state.mode,grounded:state.grounded,speed:state.speed,rigReady:rig?.ready,rig:rig?.presentation,ecology:ecology?.summary(),fps:engine?.getFps(),support:support?.id||null,meshes:scene?.meshes.length,camera:camera?.camera.position.asArray(),yaw:state.yaw,pitch:state.pitch,roll:state.roll,renderMs,quality,activeMeshes:scene?.getActiveMeshes().length,vertices:scene?.getTotalVertices()};
}
async function boot(){try{
 engine=new Engine(canvas,false,{preserveDrawingBuffer:false,stencil:false,powerPreference:'high-performance'},true);engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
 scene=new Scene(engine);scene.clearColor=new Color4(.54,.62,.65,1);scene.fogMode=Scene.FOGMODE_EXP;scene.fogDensity=.0022;scene.fogColor=new Color3(.54,.62,.65);scene.imageProcessingConfiguration.exposure=1.18;scene.imageProcessingConfiguration.contrast=1.12;scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
 // Local sky irradiance instead of a network HDR dependency.
 const size=16,faces:Uint8Array[]=[];for(let f=0;f<6;f++){const data=new Uint8Array(size*size*4);for(let i=0;i<size*size;i++){const y=Math.floor(i/size)/size,v=f===2?1:f===3?.38:.65+y*.15;data[i*4]=170*v;data[i*4+1]=185*v;data[i*4+2]=185*v;data[i*4+3]=255;}faces.push(data);}scene.environmentTexture=new RawCubeTexture(scene,faces,size,Constants.TEXTUREFORMAT_RGBA,Constants.TEXTURETYPE_UNSIGNED_BYTE,true);
 const sky=MeshBuilder.CreateSphere('layered autumn sky',{diameter:400,segments:24,sideOrientation:1},scene);
 const skyMat=new ShaderMaterial('cool sky and warm cloud breaks',scene,{vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 direction;void main(){direction=normalize(position);gl_Position=worldViewProjection*vec4(position,1.);}`,fragmentSource:`precision highp float;varying vec3 direction;void main(){vec3 d=normalize(direction);float h=max(0.,d.y);vec3 c=mix(vec3(.59,.66,.66),vec3(.27,.40,.52),pow(h,.55));float cloud=sin(d.x*8.+sin(d.z*7.)*1.8)*sin(d.z*11.-d.x*2.);float veil=smoothstep(-.4,.5,cloud)*smoothstep(.05,.3,h)*(1.-smoothstep(.55,.95,h));c=mix(c,vec3(.78,.79,.73),veil*.48);float sun=pow(max(0.,dot(d,normalize(vec3(.55,.85,-.35)))),24.);c+=vec3(.20,.14,.06)*sun;gl_FragColor=vec4(c,1.);}`},{attributes:['position'],uniforms:['worldViewProjection']});skyMat.backFaceCulling=false;sky.material=skyMat;sky.isPickable=false;
 const ambient=new HemisphericLight('soft sky',new Vector3(0,1,0),scene);ambient.intensity=.52;ambient.diffuse=new Color3(.82,.90,1);ambient.groundColor=new Color3(.22,.24,.17);
 const sun=new DirectionalLight('late autumn sun',new Vector3(-.55,-.85,.35),scene);sun.position.set(25,55,-25);sun.intensity=1.85;sun.diffuse=new Color3(1,.89,.74);const shadows=new ShadowGenerator(1024,sun);shadows.useBlurExponentialShadowMap=true;shadows.blurKernel=12;shadows.blurScale=2;shadows.bias=.0008;shadows.normalBias=.025;shadows.setDarkness(.22);
 world=new World(scene);rig=new CrowRig(scene);camera=new CrowCamera(scene,canvas);await Promise.all([world.load(),rig.load()]);
 for(const m of world.meshes)if(m.getTotalVertices()>0&&!/ground|water|grass|leaf/i.test(m.name))shadows.addShadowCaster(m);
 shadows.getShadowMap()!.refreshRate=0;
 // Static district shadows stay cached; the moving crow has a small separate map.
 const movingSun=new DirectionalLight('feather and landing shadow',sun.direction.clone(),scene);movingSun.intensity=.30;movingSun.diffuse=sun.diffuse.clone();sun.intensity=1.55;
 const crowShadows=new ShadowGenerator(256,movingSun);crowShadows.usePercentageCloserFiltering=true;crowShadows.filteringQuality=ShadowGenerator.QUALITY_LOW;crowShadows.bias=.001;crowShadows.normalBias=.012;crowShadows.setDarkness(.15);
 rig.meshes.forEach(m=>{if(m.getTotalVertices()>0)crowShadows.addShadowCaster(m);});
 scene.onBeforeRenderObservable.add(()=>{movingSun.position.copyFrom(rig.root.position).addInPlace(new Vector3(9,14,-8));});
 for(const material of scene.materials)material.freeze();
 ecology=new Ecology(scene,world.perches,saved,(x,z,y)=>world.landingHeight(x,z,y+.1,-1)??world.groundHeight(x,z),(p,prev,r)=>world.resolve(p,prev,r));effects=new FlightEffects(scene);support=world.perches[0];state=createCrowState({x:support.position.x,y:support.position.y+.46,z:support.position.z});state.yaw=0;camera.reset(state);phase='menu';$('loading').hidden=true;$<HTMLButtonElement>('start').disabled=false;
 let previous=performance.now(),slowFrames=0,optimized=false;engine.runRenderLoop(()=>{const now=performance.now(),frameDuration=now-previous,dt=Math.min(.05,frameDuration/1000);previous=now;if(document.hidden)return;frame(dt);const begin=performance.now();scene.render();renderMs=performance.now()-begin;if(renderMs>32||frameDuration>45)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);if(!optimized&&slowFrames>12){optimized=true;quality='performance';movingSun.intensity=0;sun.intensity=1.85;crowShadows.getShadowMap()!.refreshRate=0;engine.setHardwareScalingLevel(Math.max(1.7,devicePixelRatio));}});
 }catch(error){phase='error';$('loading').textContent='Не удалось загрузить квартал. Перезапусти приложение.';$<HTMLButtonElement>('start').disabled=false;$('start').textContent='Повторить загрузку';$('start').onclick=()=>location.reload();console.error(error);}}
void boot();
