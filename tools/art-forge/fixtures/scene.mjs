import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const index = await fetch('assets/forge-index.json').then(r=>{if(!r.ok)throw Error('Missing index');return r.json()});
const assets = Object.fromEntries(index.assets.map(a=>[a.id,a]));
const image = async id => {const img=new Image();img.src=assets[id].outputs.image.url;await img.decode();return img;};
const [scout,heron,baked] = await Promise.all(['scout','heron','baked'].map(image));
const atlas=await fetch(assets.scout.outputs.atlas.url).then(r=>r.json());
let medium='pixel', actions=0;
const canvas=document.querySelector('#scene-2d'), world=document.querySelector('#scene-3d');
const engine=new Engine(world,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.84,.87,.80,1);
const camera=new ArcRotateCamera('camera',-Math.PI/2-.55,1.12,7,new Vector3(0,1.4,0),scene);camera.attachControl(world,true);camera.lowerRadiusLimit=5;camera.upperRadiusLimit=10;
const light=new HemisphericLight('sky',new Vector3(1,2,-1),scene);light.intensity=1.35;
const imported=await SceneLoader.ImportMeshAsync(null,'',assets.harbor.outputs.model.url,scene);
const root=imported.meshes[0];
engine.runRenderLoop(()=>{if(medium==='model'&&!document.hidden)scene.render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.stopRenderLoop();else engine.runRenderLoop(()=>{if(medium==='model')scene.render();});});

function draw(){
 const box=canvas.parentElement.getBoundingClientRect();const dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
 const c=canvas.getContext('2d');c.scale(dpr,dpr);const w=box.width,h=box.height;
 c.fillStyle=medium==='drawn'?'#eee8da':'#d7ddca';c.fillRect(0,0,w,h);
 if(medium==='pixel'){
  c.imageSmoothingEnabled=false;const scale=Math.max(2,Math.floor(Math.min(w/96,h/64)));const frame=atlas.frames[actions%2];
  c.fillStyle='#a6b09a';for(let i=0;i<6;i++){c.fillRect(w*.2+i*scale*8,h*.70,scale*4,scale*2);}
  for(let i=0;i<3;i++){const x=w*.22+i*w*.23+(i===1?(actions%4)*scale*2:0);c.drawImage(scout,...frame.rect,x-scale*8,h*.55-scale*12,scale*16,scale*24);}
 }else if(medium==='drawn'){
  const size=Math.min(w*.95,h*.95);c.drawImage(heron,(w-size*.857)/2+(actions%2)*12,(h-size)/2,size*.857,size);
 }else{
  const size=Math.min(w*.94,h*.94);c.fillStyle='#748b81';c.beginPath();c.ellipse(w/2,h*.83,size*.36,size*.035,0,0,Math.PI*2);c.fill();c.drawImage(baked,(w-size)/2+(actions%2)*8,(h-size)/2,size,size);
 }
}
function publish(){window.__ART_TEST_STATE__={medium,actions,meshes:imported.meshes.length,triangles:assets.harbor.outputs.model.triangles,loaded:true};document.querySelector('#status').textContent=`${medium} · revisions ${actions}`;}
document.querySelectorAll('[data-medium]').forEach(button=>button.onclick=()=>{medium=button.dataset.medium;document.querySelectorAll('[data-medium]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));canvas.hidden=medium==='model';world.hidden=medium!=='model';document.querySelector('#action').textContent={pixel:'Advance scout',drawn:'Reframe illustration',model:'Turn diorama',baked:'Place miniature'}[medium];engine.resize();draw();scene.render();publish();});
document.querySelector('#action').onclick=()=>{actions++;if(medium==='model')root.rotation.y+=Math.PI/4;draw();publish();};
new ResizeObserver(()=>{engine.resize();draw();}).observe(canvas.parentElement);draw();publish();
const registration=await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));window.__ART_TEST_STATE__.offlineReady=true;
