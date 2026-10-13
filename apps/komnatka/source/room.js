import { MeshBuilder, Vector3, Color3, Color4, StandardMaterial, HemisphericLight, DirectionalLight, DynamicTexture, PointLight, ShadowGenerator } from '@babylonjs/core';
import { makeMaterial, rounded, tintWindowView } from './models.js';

export const WALLS=['#efe0ca','#d5e0ce','#edc5b9','#cad7dc','#e6d8df','#e2cfae'];
export const FLOORS=['honey','walnut','painted','tile'];
export const PATTERNS=['plain','stripe','flower'];
const hex=h=>Color3.FromHexString(h);
function materialTexture(scene,name,draw) {
 const tex=new DynamicTexture(name,{width:512,height:512},scene,false,2);
 draw(tex.getContext());tex.update(false);
 const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.White();m.specularColor=new Color3(.04,.04,.04);m.specularPower=8;m.diffuseTexture=tex;return m;
}
function wood(scene,name,color) {
 return materialTexture(scene,name,c=>{
  c.fillStyle=color;c.fillRect(0,0,512,512);
  let seed=17; const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const step=58;
  for(let row=0;row<10;row++){
   const y=row*step,shift=row%2?92:0;
   for(let col=-1;col<7;col++){
    const x=col*158+shift; c.fillStyle=rand()>.5?'rgba(255,244,216,.12)':'rgba(73,44,31,.055)';
    c.fillRect(x+3,y+3,151,step-5);
    c.strokeStyle='rgba(84,62,40,.19)';c.lineWidth=2;c.strokeRect(x+1,y+1,155,step-1);
    for(let g=0;g<4;g++){
     c.beginPath();c.strokeStyle='rgba(78,57,38,.05)';c.lineWidth=1;
     const py=y+9+rand()*38;c.moveTo(x+15,py);c.bezierCurveTo(x+60,py-5,x+95,py+5,x+140,py);c.stroke();
    }
   }
  }
 });
}
function tiled(scene) {
 return materialTexture(scene,'gentle-tile',c=>{
 c.fillStyle='#dfd8c7';c.fillRect(0,0,512,512);
 for(let y=0;y<512;y+=64)for(let x=0;x<512;x+=64){
 c.fillStyle=(x+y)%128?'#e6dece':'#d8d9ca';c.fillRect(x+2,y+2,60,60);
 c.strokeStyle='rgba(255,255,255,.26)';c.strokeRect(x+3,y+3,58,58);
 }
 });
}
function wallpaper(scene,base,pattern) {
 if(pattern==='plain')return makeMaterial(scene,'paint-'+base,base);
 return materialTexture(scene,'wallpaper-'+base+'-'+pattern,c=>{
  c.fillStyle=base;c.fillRect(0,0,512,512);
  if(pattern==='stripe'){
   for(let x=0;x<512;x+=64){c.fillStyle='rgba(255,255,255,.19)';c.fillRect(x,0,21,512);c.fillStyle='rgba(105,84,71,.06)';c.fillRect(x+43,0,3,512);}
  } else {
   for(let y=25;y<530;y+=104)for(let x=28;x<530;x+=104){
    const ox=(y/104|0)%2?25:0;
    c.strokeStyle='rgba(81,111,83,.19)';c.lineWidth=4;c.beginPath();c.moveTo(x+ox,y+25);c.quadraticCurveTo(x-10+ox,y-1,x+ox,y-22);c.stroke();
    for(let j=0;j<5;j++){
     const a=j*6.283/5;c.fillStyle='rgba(255,250,232,.58)';c.beginPath();c.ellipse(x+ox+Math.cos(a)*12,y+Math.sin(a)*12,12,6,a,0,7);c.fill();
    }
    c.fillStyle='rgba(194,134,100,.34)';c.beginPath();c.arc(x+ox,y,5,0,7);c.fill();
   }
  }
 });
}
function wall(scene,mat,w,h,d,x,y,z,name) {
 const mesh=rounded(scene,name,w,h,d,.045,mat,null,x,y,z);
 mesh.isPickable=true;mesh.metadata={wall:name};return mesh;
}
export function createRoom(scene) {
 const ambient=new HemisphericLight('cream-bounce',new Vector3(.35,1,.45),scene);
 ambient.intensity=.44;ambient.groundColor=hex('#9c8478');ambient.diffuse=hex('#e7d5c5');
 const sun=new DirectionalLight('soft-windowlight',new Vector3(-.7,-1,-.56),scene);
 sun.position=new Vector3(10,17,10);sun.intensity=.27;sun.diffuse=hex('#ffe4c0');
 // Miniature-stage illumination: two soft side lights bring out tiny rounded
 // edges, like a handmade dollhouse on a table rather than daylight in a house.
 const key=new PointLight('toybox-softbox',new Vector3(-3.2,6.6,5.4),scene);
 key.diffuse=hex('#ffdec2');key.specular=hex('#e4b692');key.range=18;key.intensity=.54;
 const rim=new DirectionalLight('toybox-side-rim',new Vector3(.68,-.55,.40),scene);
 rim.diffuse=hex('#e0d7c9');rim.intensity=.24;
 const shadows=new ShadowGenerator(768,sun);
 shadows.usePercentageCloserFiltering=true;
 shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;
 shadows.bias=.0025;shadows.normalBias=.025;
 scene.clearColor=new Color4(0,0,0,0);
 scene.imageProcessingConfiguration.contrast=1.05;
 scene.imageProcessingConfiguration.exposure=.85;
 const floorMat=wood(scene,'warm-oak','#c6a37b');
 const floor=rounded(scene,'floor',8.2,.28,8.2,.095,floorMat,null,0,-.14,0);
 floor.isPickable=true;floor.metadata={ground:true};floor.receiveShadows=true;
 // Deliberately visible cutaway construction: a little wooden toy plinth and
 // wall-frame joins signal dollhouse scale without obstructing furniture.
 const frameWood=makeMaterial(scene,'dollhouse-framing','#bd9475');
 const frameEdge=makeMaterial(scene,'dollhouse-cut-edge','#e5c5a3');
 rounded(scene,'toy-display-plinth',8.38,.16,8.38,.065,frameWood,null,0,-.355,0);
 rounded(scene,'front-cut-edge',8.35,.065,.15,.026,frameEdge,null,0,-.265,4.12);
 rounded(scene,'right-cut-edge',.15,.065,8.34,.026,frameEdge,null,4.12,-.265,0);
 for(const x of [-3.35,3.35])for(const z of [-3.35,3.35])
  rounded(scene,'miniature-plinth-foot',.35,.13,.35,.035,frameWood,null,x,-.49,z);

 const trim=makeMaterial(scene,'skirting','#d7bea1');
 const back=wall(scene,wallpaper(scene,WALLS[0],'plain'),8.2,4.1,.21,0,2.03,-4.04,'back');
 const left=wall(scene,wallpaper(scene,WALLS[0],'plain'),.21,4.1,8.2,-4.04,2.03,0,'left');
 rounded(scene,'back-skirting',8.2,.18,.18,.045,trim,null,0,.09,-3.87);
 rounded(scene,'left-skirting',.18,.18,8.2,.045,trim,null,-3.87,.09,0);
 rounded(scene,'back-crown',8.2,.10,.24,.04,trim,null,0,4.07,-3.98);
 rounded(scene,'left-crown',.24,.10,8.2,.04,trim,null,-3.98,4.07,0);
 rounded(scene,'back-cutaway-cap',8.32,.13,.27,.047,frameEdge,null,0,4.11,-4.025);
 rounded(scene,'left-cutaway-cap',.27,.13,8.32,.047,frameEdge,null,-4.025,4.11,0);
 rounded(scene,'left-front-endgrain',.27,4.04,.28,.048,frameWood,null,-4.02,2.01,4.035);
 rounded(scene,'back-right-endgrain',.27,4.04,.28,.048,frameWood,null,4.035,2.01,-4.02);
 back.receiveShadows=true;left.receiveShadows=true;
 const practicalLights=new Map();
 let nightMode=false;
 function setShadowCasters(roots,items){
  const casts=[];
  for(const item of items){
   if(['rug','frame','window'].includes(item.type))continue;
   const root=roots.get(item.id);
   if(!root)continue;
   for(const mesh of root.getChildMeshes(false)){
    if(!mesh.isDisposed())casts.push(mesh);
   }
  }
  const map=shadows.getShadowMap();if(map)map.renderList=casts;
 }
 let lastWall='',lastFloor='honey';
 function setFinish(state) {
  const wallKey=state.wallColor+'/'+state.pattern;
  if(wallKey!==lastWall){
   const cm=wallpaper(scene,WALLS[state.wallColor]||WALLS[0],PATTERNS[state.pattern]||'plain');
   const old=back.material;back.material=cm;left.material=cm;
   if(old!==cm&&old?.diffuseTexture)old.dispose(false,true);
   lastWall=wallKey;
  }
  if(state.floor!==lastFloor){
   const newFloor=state.floor==='walnut'?wood(scene,'smoked-oak','#907661'):state.floor==='painted'?wood(scene,'pale-boards','#dfd2b8'):state.floor==='tile'?tiled(scene):wood(scene,'warm-oak','#c6a37b');
   const old=floor.material;floor.material=newFloor;if(old!==newFloor&&old?.diffuseTexture)old.dispose(false,true);
   lastFloor=state.floor;
  }
 }
 let firstLight=true,nightFraction=0,lastLightTime=null;
 function applyLightBlend(t){
  ambient.intensity=.44+(.07-.44)*t;
  sun.intensity=.27+(.012-.27)*t;
  key.intensity=.54+(.075-.54)*t;
  rim.intensity=.24+(.018-.24)*t;
  scene.imageProcessingConfiguration.exposure=.85+(.77-.85)*t;
  for(const light of practicalLights.values())
   light.intensity=.12+(1.38-.12)*t;
  // The outside view dims rather than visibly switching material or rebuilding the window.
  tintWindowView(scene,t);
  const bulb=scene.getMaterialByName('material-light');
  if(bulb?.emissiveColor)bulb.emissiveColor.set(.085+.36*t,.071+.26*t,.035+.13*t);
 }
 function setEvening(on) {
  nightMode=Boolean(on);
  if(firstLight){nightFraction=nightMode?1:0;firstLight=false;applyLightBlend(nightFraction);}
 }
 function tickLighting(time){
  if(lastLightTime===null)lastLightTime=time;
  const dt=Math.max(0,Math.min(80,time-lastLightTime));
  lastLightTime=time;
  const target=nightMode?1:0,diff=target-nightFraction;
  if(Math.abs(diff)<.002){
   if(nightFraction!==target){nightFraction=target;applyLightBlend(target);}
   return false;
  }
  // Frame-rate independent, ~700 ms to settle, even on a throttled mobile device.
  nightFraction+=diff*(1-Math.exp(-dt/235));
  applyLightBlend(nightFraction);
  return true;
 }
 function syncPracticalLights(items) {
  const wanted=new Set();
  for(const item of items){
   if(item.type!=='floorlamp'&&item.type!=='tablelamp')continue;
   wanted.add(item.id);
   let light=practicalLights.get(item.id);
   if(!light){
    light=new PointLight('warm-lamp-'+item.id,Vector3.Zero(),scene);
    light.diffuse=hex('#ffd4a3');light.specular=hex('#eabf90');
    // Short, warm pools of light give the impression of toy-sized lamps.
    light.range=item.type==='tablelamp'?2.65:3.55;
    practicalLights.set(item.id,light);
   }
   light.position.set(item.x,(Number.isFinite(item.y)?item.y:0)+(item.type==='floorlamp'?2.0:.62),item.z);
   light.intensity=.12+(1.38-.12)*nightFraction;
  }
  for(const [id,light] of practicalLights)if(!wanted.has(id)){
   light.dispose();practicalLights.delete(id);
  }
 }
 return {floor,back,left,setFinish,setEvening,tickLighting,syncPracticalLights,setShadowCasters};
}
