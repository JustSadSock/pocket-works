import {Engine,Scene,SceneLoader,ArcRotateCamera,Vector3,HemisphericLight,Color4} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {Timeline} from '../runtime/timeline.mjs';
import {Spring,impactParticles} from '../runtime/physics.mjs';
import {EventAudio} from '../runtime/audio.mjs';
import {drawFrame,bindSkeletal} from '../runtime/adapters.mjs';

const load=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`Missing ${url}`);return r;};
const [drawnClip,bakedClip]=await Promise.all(['bird','baked'].map(async id=>(await load(`assets/${id}-clip.json`)).json()));
const images={};for(const id of ['bird','baked']){const i=new Image();i.src=`assets/${id}.png`;await i.decode();images[id]=i;}
const canvas=document.querySelector('#flat'),world=document.querySelector('#volume'),stage=canvas.parentElement;
const engine=new Engine(world,true,{preserveDrawingBuffer:true}),scene=new Scene(engine);scene.clearColor=new Color4(.77,.80,.75,1);
const camera=new ArcRotateCamera('camera',-Math.PI/2+.35,1.1,6,new Vector3(.8,1.2,0),scene);
new HemisphericLight('workshop',new Vector3(-1,2,-1),scene).intensity=1.3;
const imported=await SceneLoader.ImportMeshAsync(null,'','assets/striker.glb',scene);
const group=imported.animationGroups.find(g=>g.name.includes('Strike'));if(!group||!imported.skeletons.length)throw Error('Missing exported weighted rig/Strike');
for(const g of imported.animationGroups)g.stop();const rig=bindSkeletal(group,1);
const C=window.AudioContext||window.webkitAudioContext,context=C?new C():null;
const schedules=[];let audio=null;
if(context){const buffer=await context.decodeAudioData(await (await load('assets/contact.wav')).arrayBuffer());audio=new EventAudio(context,{contact:buffer},{onSchedule:e=>{schedules.push({...e,wall:performance.now()});if(schedules.length>100)schedules.shift();}});}
else{document.querySelector('#sound').disabled=true;document.querySelector('#sound').textContent='No audio';}
let medium='drawn',contacts=0,particles=[],particleAge=0,clock=0,last=null,raf=0,autoPause=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const spring=new Spring({mass:3,stiffness:280,damping:27}),events=[],intervals=[];
const timeline=new Timeline({onEvent:e=>{
 events.push({...e,wall:performance.now()});if(events.length>100)events.shift();if(e.name==='contact'){contacts++;spring.impulse(-55);particles=reduced?[]:impactParticles(27+contacts);particleAge=0;audio?.play('contact',e);}
},onCancel:e=>{audio?.cancel(e.generation);particles=[];spring.reset();}});
const base={version:1,id:'PhysicalStrike',duration:1,loop:false,events:[{name:'release',time:.28},{name:'contact',time:.5}],tracks:[{id:'height',type:'value',keys:[{time:0,value:0,ease:'smooth'},{time:.28,value:-.15,ease:'smooth'},{time:.5,value:1,ease:'smooth'},{time:.68,value:.73,ease:'smooth'},{time:1,value:0}]}]};
const skeletal={...base,id:'Strike',tracks:[{id:'rig',type:'skeletal',action:'Strike',fps:24,startFrame:1}]};
const clips={drawn:drawnClip,baked:bakedClip,physical:base,skeletal};
function fit(){engine.resize();const box=stage.getBoundingClientRect();const aspect=box.width/Math.max(1,box.height);camera.radius=2.25/Math.sin(Math.min(camera.fov/2,Math.atan(Math.tan(camera.fov/2)*aspect)))*1.06;}
function publish(){const s=timeline.snapshot();window.__MOTION_TEST_STATE__={loaded:true,medium,time:s?.time||0,completed:s?.completed||false,active:!!s,paused:timeline.paused,contacts,events:events.slice(-100),audio:schedules.slice(-100),audioState:context?.state||'unsupported',rigs:imported.skeletons.length,groups:imported.animationGroups.map(g=>g.name),reduced,particles:particles.length,spring:spring.value,frame:s?.tracks.pose?.index??null,droppedTime:timeline.droppedTime,frameIntervals:intervals.slice(-180),offlineReady:!!navigator.serviceWorker.controller};document.querySelector('#status').textContent=`${medium} / ${s?.completed?'settled':s?timeline.paused?'paused':'moving':'ready'} / contact ${contacts}`;}
function render(){
 const s=timeline.snapshot(),box=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);const w=box.width,h=box.height;
 if(medium==='skeletal'){rig.sample(s?.time||0);scene.render();return;}
 const bw=Math.round(w*dpr),bh=Math.round(h*dpr);if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#c5cbbf';c.fillRect(0,0,w,h);
 const size=Math.min(w*.97,h*.92),x=(w-size)/2,y=(h-size)/2;
 if(medium==='drawn'||medium==='baked'){const clip=clips[medium],track=s?.tracks.pose||{type:'frames',rect:clip.tracks[0].frames[0].rect};drawFrame(c,images[medium==='drawn'?'bird':'baked'],track,{x,y,width:size,height:size});}
 else{
  const unit=Math.min(w/390,h/290);c.save();c.translate(w/2,h/2);c.scale(unit,unit);
  c.fillStyle='#655244';c.fillRect(-140,95,280,15);c.fillStyle='#343d3c';c.fillRect(-70,55+spring.value,140,40);c.fillStyle='#bb794c';c.fillRect(-92,36+spring.value,184,20);
  const height=s?.values.height||0;const by=-120+height*130;c.fillStyle='#444b48';c.fillRect(-8,by-65,16,70);c.fillStyle='#b87643';c.beginPath();c.roundRect(-40,by,80,26,6);c.fill();c.fillStyle='#d1aa71';c.fillRect(-33,by+3,66,4);
  if(particleAge<.5){c.fillStyle='#e6c492';for(const p of particles){c.globalAlpha=Math.max(0,1-particleAge*2);c.fillRect(p.vx*particleAge,40+p.vy*particleAge+150*particleAge**2,p.size,p.size);}c.globalAlpha=1;}
  c.restore();
 }
}
function loop(now){raf=0;if(document.hidden)return;const dt=last===null?0:(now-last)/1000;last=now;if(dt>0&&dt<1)intervals.push(dt*1000);
 if(intervals.length>240)intervals.shift();const before=timeline.snapshot();timeline.advance(dt);if(!timeline.paused){spring.advance(Math.min(dt,.25));particleAge+=Math.min(dt,.25);}clock+=dt;
 render();publish();if(!timeline.paused&&(before&&!before.completed||Math.abs(spring.value)>.001||particleAge<.5&&particles.length))raf=requestAnimationFrame(loop);else last=null;
}
function wake(){if(!raf&&!document.hidden){last=null;raf=requestAnimationFrame(loop);}}
document.querySelector('#strike').onclick=async()=>{const pending=audio?.unlock();timeline.play(clips[medium],{fade:medium==='physical'?.1:0});document.querySelector('#pause').textContent='Pause';render();publish();wake();const unlocked=await pending;document.querySelector('#audio-status').textContent=unlocked?'Audio ready':context?'Audio unavailable; motion works':'Audio unsupported; motion works';};
document.querySelector('#pause').onclick=()=>{if(timeline.paused){timeline.resume();wake();}else{timeline.pause();audio?.cancel();}document.querySelector('#pause').textContent=timeline.paused?'Resume':'Pause';publish();};
document.querySelector('#cancel').onclick=()=>{timeline.cancel();render();publish();};
document.querySelector('#speed').onchange=e=>timeline.setSpeed(Number(e.target.value));
document.querySelector('#sound').onclick=e=>{if(audio){audio.enabled=!audio.enabled;if(!audio.enabled)audio.cancel();e.target.textContent=audio.enabled?'Sound on':'Sound off';e.target.setAttribute('aria-pressed',String(audio.enabled));}};
document.querySelectorAll('[data-medium]').forEach(button=>button.onclick=()=>{timeline.cancel('technique');medium=button.dataset.medium;canvas.hidden=medium==='skeletal';world.hidden=medium!=='skeletal';document.querySelectorAll('[data-medium]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelector('#caption').textContent={drawn:'Changing silhouettes / six authored poses',skeletal:'Weighted armature / authored Strike action',physical:'Contact impulse / mass, damping, follow-through',baked:'Animated Blender source / thirteen baked poses'}[medium];fit();render();publish();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){autoPause=!timeline.paused;timeline.pause();audio?.cancel();cancelAnimationFrame(raf);raf=0;last=null;}else{if(autoPause)timeline.resume();wake();}});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;if(reduced)particles=[];render();publish();});
new ResizeObserver(()=>{fit();render();}).observe(stage);fit();render();publish();
await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));publish();
