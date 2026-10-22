import { MeshBuilder, Vector3, Color3, Color4, StandardMaterial, HemisphericLight, DirectionalLight, DynamicTexture, PointLight, ShadowGenerator } from '@babylonjs/core';
import { makeMaterial, rounded, tintWindowView, setLampVisuals } from './models.js';
import { lightingEnvelope, physicalLampEnabled } from './lighting-presets.js';

export const WALLS=['#efe0ca','#d5e0ce','#edc5b9','#cad7dc','#e6d8df','#e2cfae'];
export const FLOORS=['honey','walnut','painted','tile','blush','cherry','herringbone','terrazzo'];
export const PATTERNS=['plain','stripe','flower','gingham','berries','stars','daisy','dots','sprig','linen','plaster','panel'];
const hex=h=>Color3.FromHexString(h);
const textureMaterialCache=new WeakMap();
function materialTexture(scene,name,draw) {
 let existing=textureMaterialCache.get(scene);
 if(!existing){existing=new Map();textureMaterialCache.set(scene,existing);}
 if(existing.has(name))return existing.get(name);
 const tex=new DynamicTexture(name,{width:512,height:512},scene,false,2);
 draw(tex.getContext());tex.update(false);
 const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.White();m.specularColor=new Color3(.04,.04,.04);m.specularPower=8;m.diffuseTexture=tex;m.maxSimultaneousLights=6;existing.set(name,m);return m;
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
function freshFloor(scene,type){
 return materialTexture(scene,'floor-'+type,c=>{
  c.fillStyle=type==='herringbone'?'#b99474':'#e0d9ca';c.fillRect(0,0,512,512);
  if(type==='herringbone'){
   for(let row=0;row<12;row++)for(let col=0;col<12;col++){
    const x=col*48-14,y=row*48-14,shift=(row+col)%2;
    c.save();c.translate(x+22,y+20);c.rotate(shift?Math.PI/4:-Math.PI/4);
    c.fillStyle=shift?'#d4b18b':'#ae8567';c.fillRect(-21,-8,42,16);
    c.strokeStyle='#8d6b5255';c.strokeRect(-21,-8,42,16);c.restore();
   }
  }else{
   let seed=133;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const tones=['#9eafa5','#c7ab91','#faf4e6','#b5a6b1'];
   for(let i=0;i<900;i++){c.fillStyle=tones[i%4];const x=rand()*512,y=rand()*512;
    c.save();c.translate(x,y);c.rotate(rand()*3);c.fillRect(-rand()*4,-rand()*2,2+rand()*8,1+rand()*5);c.restore();}
  }
 });
}
function wallpaper(scene,base,pattern) {
 if(pattern==='plain')return makeMaterial(scene,'paint-'+base,base);
 return materialTexture(scene,'wallpaper-'+base+'-'+pattern,c=>{
  c.fillStyle=base;c.fillRect(0,0,512,512);
  if(pattern==='linen'){
    for(let x=0;x<512;x+=3){c.fillStyle='#ffffff14';c.fillRect(x,0,1,512);}
    for(let y=0;y<512;y+=3){c.fillStyle='#6a5b4b0d';c.fillRect(0,y,512,1);}
   }else if(pattern==='plaster'){
    let seed=77;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<2300;i++){c.fillStyle=i%2?'#ffffff15':'#6e5a460b';
     c.fillRect(rand()*512,rand()*512,1+rand()*15,.6+rand()*4);}
   }else if(pattern==='panel'){
    for(let x=0;x<512;x+=128){
     c.fillStyle='#ffffff27';c.fillRect(x+9,0,5,512);c.fillRect(x+115,0,3,512);
     c.strokeStyle='#735e5320';c.lineWidth=3;c.strokeRect(x+20,23,91,460);
    }
   }else if(pattern==='stripe'){
   for(let x=0;x<512;x+=64){c.fillStyle='rgba(255,255,255,.20)';c.fillRect(x,0,21,512);c.fillStyle='rgba(105,84,71,.06)';c.fillRect(x+43,0,3,512);}
  }else if(pattern==='flower'||pattern==='daisy'||pattern==='sprig'){
   const step=pattern==='sprig'?82:104;
   for(let y=20;y<520;y+=step)for(let x=25;x<520;x+=step){
    const shift=((y/step)|0)%2?step*.34:0;
    c.strokeStyle='rgba(84,119,83,.19)';c.lineWidth=3;
    c.beginPath();c.moveTo(x+shift,y+23);c.quadraticCurveTo(x-12+shift,y,x+shift,y-17);c.stroke();
    for(let p=0;p<(pattern==='sprig'?3:5);p++){
     const a=p*6.283/(pattern==='sprig'?3:5);
     c.fillStyle=pattern==='daisy'?'rgba(255,255,248,.78)':'rgba(255,250,232,.52)';
     c.beginPath();c.ellipse(x+shift+Math.cos(a)*12,y+Math.sin(a)*12,pattern==='sprig'?7:12,pattern==='sprig'?4:6,a,0,7);c.fill();
    }
    c.fillStyle='rgba(196,121,92,.38)';c.beginPath();c.arc(x+shift,y,pattern==='sprig'?3:5,0,7);c.fill();
   }
  }else if(pattern==='gingham'){
   for(let x=0;x<512;x+=44){c.fillStyle='rgba(120,96,99,.11)';c.fillRect(x,0,22,512);}
   for(let y=0;y<512;y+=44){c.fillStyle='rgba(105,102,90,.12)';c.fillRect(0,y,512,22);}
  }else if(pattern==='berries'){
   for(let y=23;y<520;y+=79)for(let x=25;x<520;x+=93){
    c.fillStyle='rgba(190,105,91,.42)';c.beginPath();c.ellipse(x,y,8,11,-.17,0,7);c.fill();
    c.fillStyle='rgba(110,142,104,.40)';c.beginPath();c.ellipse(x-6,y-10,8,3,.45,0,7);c.fill();
    c.beginPath();c.ellipse(x+7,y-10,8,3,-.45,0,7);c.fill();
   }
  }else if(pattern==='stars'){
   for(let y=29;y<520;y+=76)for(let x=21;x<520;x+=84){
    c.fillStyle='rgba(245,237,205,.68)';c.beginPath();
    for(let k=0;k<10;k++){const a=k*Math.PI/5-Math.PI/2,r=k%2?4:10;
     if(k===0)c.moveTo(x+r*Math.cos(a),y+r*Math.sin(a));else c.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));}
    c.closePath();c.fill();
   }
  }else if(pattern==='dots'){
   for(let y=22;y<520;y+=51)for(let x=20;x<520;x+=51){
    c.fillStyle='rgba(255,252,235,.45)';c.beginPath();c.arc(x+(Math.floor(y/51)%2)*24,y,6,0,7);c.fill();
   }
  }
 });
}
function wall(scene,mat,w,h,d,x,y,z,name) {
 const mesh=rounded(scene,name,w,h,d,.045,mat,null,x,y,z);
 mesh.isPickable=true;mesh.metadata={wall:name};return mesh;
}
export function createRoom(scene) {
 // Preview the real procedural wallpaper surface used by Babylon, not a
 // decorative CSS approximation that could disagree with the rendered room.
 const wallpaperPreviews=new Map();
 function wallpaperThumbnail(color,pattern){
  if(pattern==='plain')return '';
  const key=color+'/'+pattern;
  if(wallpaperPreviews.has(key))return wallpaperPreviews.get(key);
  try{
   const texture=wallpaper(scene,color,pattern).diffuseTexture;
   const source=texture?.getContext()?.canvas;
   if(!source)return '';
   const canvas=document.createElement('canvas');
   canvas.width=96;canvas.height=72;
   canvas.getContext('2d').drawImage(source,0,0,96,72);
   const image=canvas.toDataURL('image/jpeg',.76);
   wallpaperPreviews.set(key,image);
   return image;
  }catch(error){
   console.warn('Wallpaper swatch unavailable',error);
   return '';
  }
 }
 // Two always-on studio lights leave real shader slots for miniature lamps.
 // Day: peach daylight on hand-painted toy furniture. Night: blueberry
 // moonlight with distinctly warm pools from the individual lamps.
 const ambient=new HemisphericLight('dollhouse-sky-bounce',new Vector3(.25,1,.25),scene);
 ambient.diffuse=hex('#f9e4d5');
 ambient.groundColor=hex('#b3a2ad');
 ambient.intensity=.53;
 const sun=new DirectionalLight('pastel-window-key',new Vector3(-.7,-1,-.48),scene);
 sun.position=new Vector3(8,14,9);
 sun.diffuse=hex('#ffe3bc');sun.intensity=.48;
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
 const plinth=rounded(scene,'toy-display-plinth',8.38,.16,8.38,.065,frameWood,null,0,-.355,0);
 const frontEdge=rounded(scene,'front-cut-edge',8.35,.065,.15,.026,frameEdge,null,0,-.265,4.12);
 const rightEdge=rounded(scene,'right-cut-edge',.15,.065,8.34,.026,frameEdge,null,4.12,-.265,0);
 const plinthFeet=[];
 for(const x of [-3.35,3.35])for(const z of [-3.35,3.35])
  plinthFeet.push(rounded(scene,'miniature-plinth-foot',.35,.13,.35,.035,frameWood,null,x,-.49,z));

 const trim=makeMaterial(scene,'skirting','#d7bea1');
 const back=wall(scene,wallpaper(scene,WALLS[0],'plain'),8.2,4.1,.21,0,2.03,-4.04,'back');
 const left=wall(scene,wallpaper(scene,WALLS[0],'plain'),.21,4.1,8.2,-4.04,2.03,0,'left');
 const backSkirting=rounded(scene,'back-skirting',8.2,.18,.18,.045,trim,null,0,.09,-3.87);
 const leftSkirting=rounded(scene,'left-skirting',.18,.18,8.2,.045,trim,null,-3.87,.09,0);
 const backCrown=rounded(scene,'back-crown',8.2,.10,.24,.04,trim,null,0,4.07,-3.98);
 const leftCrown=rounded(scene,'left-crown',.24,.10,8.2,.04,trim,null,-3.98,4.07,0);
 const backCap=rounded(scene,'back-cutaway-cap',8.32,.13,.27,.047,frameEdge,null,0,4.11,-4.025);
 const leftCap=rounded(scene,'left-cutaway-cap',.27,.13,8.32,.047,frameEdge,null,-4.025,4.11,0);
 const leftPost=rounded(scene,'left-front-endgrain',.27,4.04,.28,.048,frameWood,null,-4.02,2.01,4.035);
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
 let lastWall='',lastFloor='',lastLayout='';
 const floorPieces=[];
 const floorStagePieces=[];
 function clearLayout(){for(const mesh of [...floorPieces,...floorStagePieces])mesh.dispose(false,false);floorPieces.length=0;floorStagePieces.length=0;}
 function addFloorPart(name,w,d,x,z,mat){const mesh=rounded(scene,name,w,.28,d,.063,mat,null,x,-.14,z);mesh.isPickable=true;mesh.metadata={ground:true};mesh.receiveShadows=true;floorPieces.push(mesh);return mesh;}
 function setLayout(layout='classic'){
  if(layout===lastLayout)return;
  clearLayout();lastLayout=layout;
  floor.setEnabled(layout==='classic');
  const narrow=layout==='narrow',nook=layout==='nook';
  const ratio=narrow?6.4/8.2:1,edgeRatio=narrow?6.57/8.35:1;
  back.scaling.x=ratio;
  left.position.x=narrow?-3.18:-4.04;
  backSkirting.scaling.x=ratio;backCrown.scaling.x=ratio;backCap.scaling.x=ratio;
  leftSkirting.position.x=narrow?-3.02:-3.87;
  leftCrown.position.x=narrow?-3.12:-3.98;
  leftCap.position.x=narrow?-3.17:-4.025;
  leftPost.position.x=narrow?-3.17:-4.02;
  frontEdge.setEnabled(!nook);frontEdge.scaling.x=edgeRatio;
  rightEdge.position.x=narrow?3.27:4.12;
  rightEdge.scaling.z=nook?5.39/8.34:1;rightEdge.position.z=nook?-1.405:0;
  plinth.setEnabled(!nook);plinth.scaling.x=narrow?6.58/8.38:1;
  // Legs belong to the current base, not an invisible full-size square.
  for(let i=0;i<plinthFeet.length;i++){
   const mesh=plinthFeet[i];mesh.setEnabled(!nook);
   mesh.position.x=(i<2?-1:1)*(narrow?2.59:3.35);
  }
  if(nook){
   floorStagePieces.push(rounded(scene,'l-shaped-stage-back',8.38,.16,5.46,.063,frameWood,null,0,-.355,-1.405));
   floorStagePieces.push(rounded(scene,'l-shaped-stage-wing',5.52,.16,2.96,.063,frameWood,null,-1.32,-.355,2.64));
   floorStagePieces.push(rounded(scene,'l-shaped-front-edge',5.52,.065,.15,.026,frameEdge,null,-1.32,-.265,4.12));
   floorStagePieces.push(rounded(scene,'l-shaped-inward-edge',.15,.065,2.88,.026,frameEdge,null,1.38,-.265,2.65));
   floorStagePieces.push(rounded(scene,'l-shaped-return-edge',2.78,.065,.15,.026,frameEdge,null,2.72,-.265,1.23));
  }
  if(layout==='narrow'){
   addFloorPart('narrow-dollhouse-floor',6.4,8.2,0,0,floor.material);
  }else if(layout==='nook'){
   addFloorPart('l-room-back-floor',8.2,5.35,0,-1.405,floor.material);
   addFloorPart('l-room-side-floor',5.36,2.85,-1.32,2.64,floor.material);
   const trim=makeMaterial(scene,'toy-inner-trim','#d8b79b');
   const side=rounded(scene,'l-inner-cut-wall',.15,.17,2.85,.045,trim,null,1.36,.075,2.64);
   const front=rounded(scene,'l-front-cut-wall',2.75,.17,.15,.045,trim,null,2.73,.075,1.26);
   side.isPickable=false;front.isPickable=false;floorStagePieces.push(side,front);
  }
 }
 function setFinish(state) {
  setLayout(state.layout);
  const wallKey=state.wallColor+'/'+state.pattern+'/'+state.wallColorLeft+'/'+state.patternLeft;
  if(wallKey!==lastWall){
   // Independent wall palettes for playful two-tone dollhouses.
   const backMat=wallpaper(scene,WALLS[state.wallColor]||WALLS[0],state.pattern||'plain');
   const leftMat=wallpaper(scene,WALLS[state.wallColorLeft??state.wallColor]||WALLS[0],state.patternLeft||state.pattern||'plain');
   back.material=backMat;left.material=leftMat;
   lastWall=wallKey;
  }
  if(state.floor!==lastFloor){
   const newFloor=state.floor==='walnut'?wood(scene,'smoked-oak','#907661'):state.floor==='painted'?wood(scene,'pale-boards','#dfd2b8'):state.floor==='tile'?tiled(scene):state.floor==='blush'?wood(scene,'rosy-boards','#d8b6ac'):state.floor==='cherry'?wood(scene,'cherry-planks','#b58a72'):['herringbone','terrazzo'].includes(state.floor)?freshFloor(scene,state.floor):wood(scene,'warm-oak','#c6a37b');
   floor.material=newFloor;for(const piece of floorPieces)piece.material=newFloor;
   lastFloor=state.floor;
  }
 }
 const glowTexture=new DynamicTexture('glow-brush', {width:128,height:128},scene,false,2);
 const gc=glowTexture.getContext();
 gc.clearRect(0,0,128,128);
 const gradient=gc.createRadialGradient(64,64,1,64,64,64);
 gradient.addColorStop(0,'rgba(255,216,156,0.44)');
 gradient.addColorStop(.2,'rgba(255,194,130,0.29)');
 gradient.addColorStop(.52,'rgba(255,166,111,0.11)');
 gradient.addColorStop(1,'rgba(255,145,110,0)');
 gc.fillStyle=gradient;gc.fillRect(0,0,128,128);
 glowTexture.hasAlpha=true;glowTexture.update(false);
 const glowMaterial=new StandardMaterial('painted-pool-of-lamplight',scene);
 glowMaterial.diffuseTexture=glowTexture;
 glowMaterial.useAlphaFromDiffuseTexture=true;
 glowMaterial.disableLighting=true;
 glowMaterial.emissiveColor=new Color3(1,.83,.68);
 glowMaterial.specularColor=Color3.Black();
 glowMaterial.backFaceCulling=false;
 glowMaterial.disableDepthWrite=true;
 glowMaterial.maxSimultaneousLights=0;
 glowMaterial.alpha=1;
 let firstLight=true,nightFraction=0,lastLightTime=null;
 function applyLightBlend(t){
  // Night must remain legible, not a nearly black designer's room.
  const mood=lightingEnvelope(t);
  ambient.intensity=mood.ambient;
  ambient.diffuse=Color3.Lerp(hex('#f9e4d5'),hex('#c5c6ed'),t);
  ambient.groundColor=Color3.Lerp(hex('#b3a2ad'),hex('#66647f'),t);
  sun.intensity=mood.sun;
  sun.diffuse=Color3.Lerp(hex('#ffe3bc'),hex('#a6b0de'),t);
  scene.imageProcessingConfiguration.exposure=mood.exposure;
  for(const fixture of practicalLights.values()){
   fixture.light.intensity=mood.lamp;
   fixture.floor.visibility=mood.floorGlow;
   if(fixture.wall)fixture.wall.visibility=mood.wallGlow;
  }
  setLampVisuals(scene,t);
  tintWindowView(scene,t);
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
 function makePool(name,width,height,kind){
  // The glow itself can never intercept clicks or cast a shadow.
  let mesh;
  if(kind==='floor'){
   mesh=MeshBuilder.CreateGround(name,{width,height},scene);
   mesh.position.y=.043;
  }else{
   mesh=MeshBuilder.CreatePlane(name,{width,height,sideOrientation:2},scene);
   if(kind==='left')mesh.rotation.y=Math.PI/2;
  }
  mesh.material=glowMaterial;mesh.isPickable=false;mesh.receiveShadows=false;
  mesh.visibility=0;
  mesh.renderingGroupId=1;
  mesh.alwaysSelectAsActiveMesh=true;
  return mesh;
 }
 function syncPracticalLights(items) {
  const wanted=new Set(),lamps=items.filter(item=>item.type==='floorlamp'||item.type==='tablelamp');
  for(const item of lamps){
   wanted.add(item.id);
   const tall=item.type==='floorlamp';
   let fixture=practicalLights.get(item.id);
   if(!fixture){
    const light=new PointLight('toy-lamp-'+item.id,Vector3.Zero(),scene);
    light.diffuse=hex('#ffd09a');
    light.specular=hex('#ffbd81');
    light.range=tall?5.4:3.5;
    light.radius=tall?.38:.20;
    light.intensity=0;
    const floorPool=makePool('soft-light-on-floor-'+item.id,tall?3.5:2.6,tall?3.5:2.6,'floor');
    const wallPool=makePool('soft-light-on-wall-'+item.id,tall?3.7:2.6,tall?3.5:2.6,'back');
    fixture={light,floor:floorPool,wall:wallPool};
    practicalLights.set(item.id,fixture);
   }
   const y=Number.isFinite(item.y)?item.y:0;
   const h=tall?2.12:.64;
   fixture.light.position.set(item.x,y+h,item.z);
   // Keep first four light sources physically lit to stay below the six-light
   // WebGL shader budget (two studio lights plus up to four toy lamps).
   const active=physicalLampEnabled(lamps.indexOf(item));
   fixture.light.setEnabled(active);
   const mood=lightingEnvelope(nightFraction);
   fixture.light.intensity=active?mood.lamp:0;
   fixture.floor.position.set(item.x,.042,item.z);
   fixture.floor.visibility=mood.floorGlow;
   if(item.z<-.35){
    fixture.wall.position.set(item.x,Math.min(3.0,y+h),-3.922);
    fixture.wall.rotation.y=0;
   }else if(item.x<-.35){
    fixture.wall.position.set(-3.922,Math.min(3.0,y+h),item.z);
    fixture.wall.rotation.y=Math.PI/2;
   }else{
    fixture.wall.position.set(item.x,Math.min(3.0,y+h),-3.922);
    fixture.wall.rotation.y=0;
   }
   fixture.wall.visibility=mood.wallGlow;
  }
  for(const [id,fixture] of practicalLights)if(!wanted.has(id)){
   fixture.light.dispose();fixture.floor.dispose(false,false);fixture.wall.dispose(false,false);
   practicalLights.delete(id);
  }
 }
 function lightingDiagnostics(){
  return {nightMode,nightFraction,studioLights:2,
   lamps:[...practicalLights.values()].map(f=>({
    enabled:f.light.isEnabled(),intensity:f.light.intensity,
    floorVisibility:f.floor.visibility,wallVisibility:f.wall.visibility
   }))};
 }
 return {floor,back,left,setFinish,setEvening,tickLighting,syncPracticalLights,setShadowCasters,lightingDiagnostics,wallpaperThumbnail};
}
