import * as THREE from './three.module.js';
import { generateOrgan, getOrganProfile, getTissueNodes, setSeed, CELLS_PER_CHUNK } from './organGen.js';
import { sweepCircle } from './stability.js';
import {ENEMY_TELLS,telegraphSeverity} from './ecology.js';
import {biomeForWave,biomeHazard,stageSeed} from './biomes.js';
import {gastricChamber} from './gastricArt.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cellKey = (x,z) => x + ',' + z;
const rand = (a,b,s=0) => {
  let n = Math.imul(a,374761393) + Math.imul(b,668265263) + Math.imul(s,1442695041);
  n = Math.imul(n ^ n >>> 13,1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

export function createWorld(canvas, initialSeed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  // Software rasterizers are common on headless Chromium and older devices.
  // Detect capability, not user agent, so regular GPUs keep full detail.
  let softwareRenderer=false;
  try {
    const gl=renderer.getContext();
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    softwareRenderer=/swiftshader|llvmpipe|software|softpipe/i.test(String(gpu));
  }catch{}
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x130709);
  scene.fog = new THREE.FogExp2(0x210b0d, 0.098);
  const camera = new THREE.PerspectiveCamera(77, 1, 0.06, 42);
  camera.rotation.order = 'YXZ';
  const sky=new THREE.HemisphereLight(0x9b5451, 0x260b0b, 1.3);scene.add(sky);
  const lamp = new THREE.PointLight(0xffc19a, 20, 12, 1.7);
  scene.add(lamp);
  const pulseLamp = new THREE.PointLight(0xe32135, 8, 8, 1.5);
  scene.add(pulseLamp);
  const geometryFloor = new THREE.PlaneGeometry(1.03, 1.03, 6, 6).rotateX(-Math.PI/2);
  const floorPos = geometryFloor.attributes.position;
  for (let i=0;i<floorPos.count;i++) {
    const x=floorPos.getX(i), z=floorPos.getZ(i);
    floorPos.setY(i, Math.sin(x*9+z*3)*.04 + Math.cos(z*8-x*6)*.035);
  }
  geometryFloor.computeVertexNormals();
  const wallShape = new THREE.BoxGeometry(1.03, 2.8, .21, 5, 8, 1);
  const wp = wallShape.attributes.position;
  for(let i=0;i<wp.count;i++){
    const x=wp.getX(i), y=wp.getY(i), z=wp.getZ(i);
    if(Math.abs(z)>.099) wp.setZ(i, z + .065*Math.sin(x*12 + y*6) + .045*Math.cos(y*11-x*5));
  }
  wallShape.computeVertexNormals();
  const boneShape = new THREE.CylinderGeometry(.085,.12,2.45,5,6);
  // Sculpted stomach mesh: twisted, nonplanar muscle bands interrupt the
  // repeated flat wall box at silhouette level, without affecting walkability.
  const gastricWallGeo=new THREE.BoxGeometry(1.03,2.8,.24,10,14,2);
  const gs=gastricWallGeo.attributes.position;
  for(let i=0;i<gs.count;i++){
    const x=gs.getX(i),y=gs.getY(i),z=gs.getZ(i);
    const fold=Math.sin(x*12.5+Math.sin(y*2.3)*1.9)+.45*Math.sin(y*8+x*9);
    gs.setXYZ(i,x+Math.sin(y*2.6+x*3.1)*.07,y,z+
      (z>=0?1:-1)*(.10*Math.sin(y*4.8+x*1.9)+.075*fold));
  }
  gastricWallGeo.computeVertexNormals();
  const gastricDrapeGeo=new THREE.IcosahedronGeometry(1,2);
  const gastricRugaGeo=new THREE.TorusGeometry(.43,.115,7,15,Math.PI*1.55);
  const gastricPylorusGeo=new THREE.TorusGeometry(.75,.21,8,18);
  const gastricSinewGeo=new THREE.CylinderGeometry(.042,.115,1.24,6);
  const gastricSeedArt=(x,z,k)=>rand(x,z,seed+k);
  // Generated collagen and capillary colour map. One shared atlas keeps the nine visible chunks cheap.
  function makeFleshMap(){
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d');if(!x)return null;
    let seed=0x13b0de;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    x.fillStyle='#d6cac2';x.fillRect(0,0,256,256);
    for(let i=0;i<700;i++){
      const a=random()*256,b=random()*256,r=1+random()*13;
      x.fillStyle=random()>.49?'rgba(60,13,18,.065)':'rgba(250,211,194,.11)';
      x.beginPath();x.ellipse(a,b,r,r*(.13+random()*.25),random()*Math.PI,0,Math.PI*2);x.fill();
    }
    for(let i=0;i<31;i++){
      const a=random()*256,b=random()*256,length=20+random()*115;
      x.strokeStyle=random()>.47?'rgba(88,13,21,.34)':'rgba(253,208,184,.3)';
      x.lineWidth=1+random()*4;x.lineCap='round';
      x.beginPath();x.moveTo(a,b);
      x.bezierCurveTo(a+length*.3,b-24+random()*48,a+length*.65,b-27+random()*54,a+length,b-8+random()*16);
      x.stroke();
    }
    for(let i=0;i<85;i++){
      const a=random()*256,b=random()*256;
      x.fillStyle='rgba(83,4,10,.19)';x.beginPath();x.ellipse(a,b,1+random()*3,3+random()*7,random()*Math.PI,0,Math.PI*2);x.fill();
    }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
    return t;
  }
  const fleshMap=makeFleshMap();
  function makeGastricMaps(){
    const c=document.createElement('canvas');c.width=c.height=256;
    const cx=c.getContext('2d');if(!cx)return {color:fleshMap,bump:fleshMap};
    const height=document.createElement('canvas');height.width=height.height=256;
    const hx=height.getContext('2d');
    const picture=cx.createImageData(256,256),relief=hx.createImageData(256,256);
    // Deterministic layered rugae; same phase drives both albedo and bump.
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const xx=x/256,yy=y/256;
      const ridges=Math.sin(xx*24+Math.sin(yy*9)*1.65+Math.sin(yy*22)*.6);
      const finer=Math.sin(xx*67+yy*31)*.18+Math.sin(yy*83-xx*49)*.13;
      const scar=Math.pow(Math.max(0,Math.sin(xx*8+yy*5)),11);
      const grain=rand(x,y,277)*.12-.06;
      const profile=clamp(.5+ridges*.28+finer*.16+grain,0,1),i=(y*256+x)*4;
      picture.data[i]=clamp(93+profile*81+scar*19,0,255);
      picture.data[i+1]=clamp(39+profile*62+scar*13,0,255);
      picture.data[i+2]=clamp(35+profile*46+scar*9,0,255);
      picture.data[i+3]=255;
      const h=Math.floor(profile*255);
      relief.data[i]=relief.data[i+1]=relief.data[i+2]=h;relief.data[i+3]=255;
    }
    cx.putImageData(picture,0,0);hx.putImageData(relief,0,0);
    const color=new THREE.CanvasTexture(c),bump=new THREE.CanvasTexture(height);
    for(const t of [color,bump]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=2;}
    color.colorSpace=THREE.SRGBColorSpace;
    return {color,bump};
  }
  const gastricMaps=makeGastricMaps();
  const stomachWallMat=new THREE.MeshStandardMaterial({color:0xffffff,map:gastricMaps.color,
    bumpMap:gastricMaps.bump,bumpScale:.16,roughness:.31,metalness:0,emissive:0x36150e,emissiveIntensity:.30});
  const gastricFoldMat=new THREE.MeshStandardMaterial({color:0xb16b66,map:gastricMaps.color,
    bumpMap:gastricMaps.bump,bumpScale:.12,roughness:.25,side:THREE.DoubleSide,emissive:0x2b130d,emissiveIntensity:.25});
  const gastricMucusMat=new THREE.MeshStandardMaterial({color:0xa9a56d,roughness:.14,
    transparent:true,opacity:.88,emissive:0x384522,emissiveIntensity:.36,depthWrite:false});

  const membrane = new THREE.MeshStandardMaterial({color:0xffffff, map:fleshMap, roughness:.64, metalness:0, side:THREE.DoubleSide, emissive:0x230407, emissiveIntensity:.19});
  const wallMat = new THREE.MeshStandardMaterial({color:0xffffff, map:fleshMap, roughness:.66, metalness:0, emissive:0x280407, emissiveIntensity:.27});
  const boneMat = new THREE.MeshStandardMaterial({color:0xb3a087, roughness:.91, metalness:0});
  const bile = new THREE.MeshStandardMaterial({color:0x88b36e, roughness:.32, emissive:0x223b10, emissiveIntensity:.65});
  const bloodMat = new THREE.MeshBasicMaterial({color:0x9c0b19, transparent:true, opacity:.64, depthWrite:false, side:THREE.DoubleSide});
  const gooGeo = new THREE.CircleGeometry(1,16).rotateX(-Math.PI/2);
  const orbGeo = new THREE.IcosahedronGeometry(.17,1);
  const orbMat = new THREE.MeshBasicMaterial({color:0xffad62});
  const organicGeo = new THREE.IcosahedronGeometry(1,1);
  const toothGeo = new THREE.ConeGeometry(.17,.8,5);
  const eyeGeo = new THREE.SphereGeometry(.10,8,6);
  const veinGeo = new THREE.TorusGeometry(.24,.06,5,12);
  const mobMats = {
    crawler:new THREE.MeshStandardMaterial({color:0x9f2937,roughness:.46,emissive:0x330307,emissiveIntensity:.4}),
    spitter:new THREE.MeshStandardMaterial({color:0x718a3d,roughness:.44,emissive:0x283108,emissiveIntensity:.36}),
    brute:new THREE.MeshStandardMaterial({color:0x765361,roughness:.62,emissive:0x22070e,emissiveIntensity:.25}),
     warden:new THREE.MeshStandardMaterial({color:0x74564a,roughness:.49,emissive:0x3b160d,emissiveIntensity:.32}),
    leech:new THREE.MeshStandardMaterial({color:0x6c516f,roughness:.46,emissive:0x271332,emissiveIntensity:.45}),
    heart:new THREE.MeshStandardMaterial({color:0xbd132d,roughness:.31,emissive:0x5f0713,emissiveIntensity:1})
  };
  const eyeMat = new THREE.MeshBasicMaterial({color:0xffe6bc});
  const tellRingGeo=new THREE.TorusGeometry(.57,.052,6,20);
  const tellMats=Object.fromEntries(Object.entries(ENEMY_TELLS).map(([kind,info])=>[
    kind,new THREE.MeshBasicMaterial({color:info.color,transparent:true,opacity:.88,depthWrite:false})
  ]));
  const spitterSacGeo=new THREE.IcosahedronGeometry(.30,1);
  const brutePlateGeo=new THREE.ConeGeometry(.23,.65,5);
  const crawlerClawGeo=new THREE.ConeGeometry(.12,.62,5);
  const leechTubeGeo=new THREE.TorusGeometry(.34,.09,6,12);
  const jointGeo=new THREE.SphereGeometry(.18,9,7);
  const limbGeo=new THREE.CylinderGeometry(.065,.14,.82,7);
  const mandibleGeo=new THREE.ConeGeometry(.25,.83,6);
  const spitterNeckGeo=new THREE.CylinderGeometry(.16,.38,.85,9);
  const shieldGeo=new THREE.IcosahedronGeometry(1,1);
  for(const mat of Object.values(mobMats)){
    mat.map=gastricMaps.color;mat.bumpMap=gastricMaps.bump;mat.bumpScale=.05;mat.needsUpdate=true;
  }
  const vesselMat = new THREE.MeshStandardMaterial({color:0x7e2434,metalness:.06,roughness:.33,emissive:0x26050a,emissiveIntensity:.25});
  const vesselGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.46,.09,-.25),new THREE.Vector3(-.20,.11,-.05),
    new THREE.Vector3(.12,.08,.06),new THREE.Vector3(.46,.12,.21)
  ]),12,.038,5,false);
  const sacGeo = new THREE.IcosahedronGeometry(.19,1);
  const sacMat = new THREE.MeshStandardMaterial({color:0x9c4a54,roughness:.41,metalness:0,emissive:0x270b0f,emissiveIntensity:.25});
  const hazardGeo=new THREE.IcosahedronGeometry(.43,1);
   const hazardMat=new THREE.MeshStandardMaterial({color:0xd4d07d,roughness:.36,
     transparent:true,opacity:.87,emissive:0x484c2e,emissiveIntensity:.48,depthWrite:false});
   const organFeatureGeo=new THREE.IcosahedronGeometry(.36,1);
   const organFeatureMat=new THREE.MeshStandardMaterial({color:0xc2a17f,roughness:.55});
   const axonGeo=new THREE.TorusGeometry(.55,.045,5,13,Math.PI*1.5);
   const axonMat=new THREE.MeshStandardMaterial({color:0xaaa7c7,roughness:.48,emissive:0x30294c,emissiveIntensity:.45});
   const particlesGeo = new THREE.BufferGeometry();
  const particleArr = new Float32Array(600*3);
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(particleArr,3));
  particlesGeo.setDrawRange(0,0);
  const particles = new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:0xf3404c,size:.095,transparent:true,opacity:.9,depthWrite:false}));
  scene.add(particles);
  const source = new THREE.Group();
  scene.add(source);
  const chunks = new Map(), layouts = new Map(), tissueChunks = new Map(), tissueVisuals = new Map(), stains = [], droplets = [], streaks = [];
  let openedTissues=new Set(),organPulse=0,stage=1,biome=biomeForWave(1),immunePressure=0;
  const valveSkin=new THREE.MeshStandardMaterial({color:0x9d3c4d,roughness:.48,emissive:0x631822,emissiveIntensity:.65});
  const valveCore=new THREE.MeshStandardMaterial({color:0xe0ad7c,roughness:.42,emissive:0x8a3318,emissiveIntensity:.8});
  const valveGlow=new THREE.MeshBasicMaterial({color:0xffda9b});
  const valveGeo=new THREE.IcosahedronGeometry(1,1),valveRing=new THREE.TorusGeometry(.51,.095,7,16);
  const valveEyeGeo=new THREE.SphereGeometry(.11,9,7),archGeo=new THREE.TorusGeometry(.9,.07,6,12,Math.PI);
  const lineMat=new THREE.LineBasicMaterial({color:0xffd5ab,transparent:true,opacity:.62,depthWrite:false});
  const bileLineMat=new THREE.LineBasicMaterial({color:0xffb980,transparent:true,opacity:.48,depthWrite:false});
  const impactGeo=new THREE.CircleGeometry(1,9);
  const wallBlood=new THREE.MeshBasicMaterial({color:0x740b19,transparent:true,opacity:.78,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-3});
  const woundMat=new THREE.MeshBasicMaterial({color:0xffd2a9,transparent:true,opacity:.56,depthWrite:false});
  let seed=0, lastChunk='', frame=0;
  const gun = new THREE.Group(), bolter=new THREE.Group(), shredder=new THREE.Group(),stinger=new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color:0x565151,metalness:.62,roughness:.38});
  const muscle = new THREE.MeshStandardMaterial({color:0x491e26,metalness:.06,roughness:.78});
  const barrelBone = new THREE.MeshStandardMaterial({color:0xd4b49a,metalness:.04,roughness:.84});
  const muzzle = new THREE.MeshBasicMaterial({color:0xffd5a0});
  gun.add(bolter,shredder,stinger);
  function part(geo,mat,x,y,z,sx,sy,sz, parent=bolter) {
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  }
  // Distinct real silhouettes: a long screwed-in bolt lance and a paired bone jaw shotgun.
  part(new THREE.CylinderGeometry(.15,.21,.83,9,4).rotateX(Math.PI/2),muscle,.27,-.31,-.73,1,1,1);
  part(new THREE.CylinderGeometry(.13,.19,1,8).rotateX(Math.PI/2),metal,.27,-.19,-1.06,1,1,1);
  part(new THREE.CylinderGeometry(.075,.13,.32,7),metal,.28,-.49,-.48,1,1,1);
  for(let k=0;k<3;k++) part(new THREE.TorusGeometry(.14,.034,6,12),k===1?muscle:metal,.27,-.19,-.72-k*.21,1,1,1);
  const longFlash=part(new THREE.ConeGeometry(.18,.5,7).rotateX(-Math.PI/2),muzzle,.27,-.19,-1.73,1,1,1);
  part(new THREE.CylinderGeometry(.23,.3,.75,9,4).rotateX(Math.PI/2),muscle,.27,-.31,-.68,1,1,1,shredder);
  part(new THREE.CylinderGeometry(.13,.17,.33,7).rotateX(Math.PI/2),metal,.26,-.34,-.33,1,1,1,shredder);
  for(const side of [-1,1]){
    part(new THREE.CylinderGeometry(.13,.16,1.25,7).rotateX(Math.PI/2),barrelBone,.27+side*.16,-.24,-1.14,1,1,1,shredder);
    for(let tooth=0;tooth<3;tooth++) part(new THREE.ConeGeometry(.075,.25,5),barrelBone,.27+side*.20,-.37,-.78-tooth*.29,.92,1,.9,shredder);
    part(new THREE.TorusGeometry(.16,.034,6,9),metal,.27+side*.16,-.24,-1.42,1,1,1,shredder);
  }
  const wideFlash=part(new THREE.IcosahedronGeometry(.23,0),muzzle,.27,-.24,-1.77,1.2,1,1.1,shredder);
  // Needle launcher: long ivory injector, narrow bronze slide, articulated
  // cartilage clips. Silhouette remains distinct even with camera bob disabled.
  part(new THREE.CylinderGeometry(.19,.31,.86,9).rotateX(Math.PI/2),muscle,.28,-.31,-.65,1,1,1,stinger);
  part(new THREE.CylinderGeometry(.075,.17,1.65,8).rotateX(Math.PI/2),barrelBone,.28,-.18,-1.47,1,1,1,stinger);
  for(let k=0;k<4;k++){
    const collar=part(new THREE.TorusGeometry(.125,.035,6,13),k%2?metal:barrelBone,.28,-.18,-.81-k*.35,1,1,1,stinger);
    collar.rotation.x=.08;
  }
  for(const side of [-1,1]){
    part(new THREE.ConeGeometry(.13,.8,5).rotateX(-Math.PI/2),metal,.28+side*.23,-.34,-.72,1,1,1,stinger);
  }
  const needleFlash=part(new THREE.ConeGeometry(.12,.73,7).rotateX(-Math.PI/2),muzzle,.28,-.18,-2.44,1,1,1,stinger);
  let muzzleTime=0,muzzleKind=0,kickPos=0,kickVel=0;
  longFlash.visible=false;wideFlash.visible=false;needleFlash.visible=false;
  camera.add(gun);scene.add(camera);
  let currentWidth=0,currentHeight=0,quality='medium',ratio=0;
  function setQuality(next){
    if(!['low','medium','high'].includes(next))return;
    if(next!==quality){quality=next;currentWidth=0;resize();}
  }
  function resize(){
    const w=Math.max(1,Math.round(canvas.clientWidth||window.innerWidth));
    const h=Math.max(1,Math.round(canvas.clientHeight||window.innerHeight));
    const mobile=w<900 || ('ontouchstart' in window);
    const desired=quality==='low'?1:quality==='high'?(mobile?1.32:1.55):(mobile?1.14:1.35);
    // Bound real pixel work, not only CSS size: software WebGL must never stall input.
    const budget=softwareRenderer?310_000:mobile?1_300_000:2_200_000;
    const pixelRatio=Math.min(window.devicePixelRatio||1,softwareRenderer?.66:desired,Math.sqrt(budget/(w*h)));
    if(w===currentWidth&&h===currentHeight&&ratio===pixelRatio) return;
    currentWidth=w;currentHeight=h;
    ratio=pixelRatio;renderer.setPixelRatio(ratio);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  function getCells(cx,cz){
    const k=cellKey(cx,cz);
    if(!layouts.has(k)) layouts.set(k,new Set(generateOrgan(cx,cz).map(c=>cellKey(c.x,c.y))));
    return layouts.get(k);
  }
  function isBaseFloor(x,z){
    const a=Math.round(x),b=Math.round(z);
    return getCells(Math.floor(a/CELLS_PER_CHUNK),Math.floor(b/CELLS_PER_CHUNK)).has(cellKey(a,b));
  }
  function getTissues(cx,cz){
    const k=cellKey(cx,cz);
    if(!tissueChunks.has(k))tissueChunks.set(k,getTissueNodes(cx,cz).map(t=>({...t,id:stage+':'+t.id,visual:null})));
    return tissueChunks.get(k);
  }
  function getTissueAt(x,z){
    const a=Math.round(x),b=Math.round(z);
    if(Math.abs(x-a)>.49||Math.abs(z-b)>.49)return null;
    // Do NOT compute a tissue node graph on a collision or navigation query.
    // Loaded chunks have complete gate data; distant chunks only require floor geometry.
    const nodes=tissueChunks.get(cellKey(Math.floor(a/CELLS_PER_CHUNK),Math.floor(b/CELLS_PER_CHUNK)));
    return nodes?.find(t=>t.x===a&&t.z===b&&!openedTissues.has(t.id))||null;
  }
  function isFloor(x,z){return isBaseFloor(x,z)&&!getTissueAt(x,z);}
  function getHazardAt(x,z){const a=Math.round(x),b=Math.round(z);
    if(Math.abs(a-x)>.33||Math.abs(b-z)>.33||!isFloor(x,z))return null;
    return biomeHazard(seed,stage,a,b);
  }
  function getTissueCount(cx,cz){return getTissues(cx,cz).filter(t=>!openedTissues.has(t.id)).length;}
  function damageTissue(id,amount){
    if(typeof id!=='string'||!Number.isFinite(amount)||amount<=0||openedTissues.has(id))return null;
    if(!id.startsWith(stage+':'))return null;
    const [x,z]=id.slice(id.indexOf(':')+1).split(',').map(Number);
    if(!Number.isInteger(x)||!Number.isInteger(z))return null;
    const tissue=getTissues(Math.floor(x/CELLS_PER_CHUNK),Math.floor(z/CELLS_PER_CHUNK)).find(t=>t.id===id);
    if(!tissue)return null;
    tissue.hp=Math.max(0,tissue.hp-amount);
    if(tissue.visual)tissue.visual.userData.flash=.23;
    const opened=tissue.hp===0;
    if(opened){openedTissues.add(id);if(tissue.visual)tissue.visual.visible=false;
      organPulse=1.7;splatter(x,z,28);
    }
    return {id,x,z,hp:tissue.hp,opened};
  }
  function makeTissueVisual(tissue){
    const group=new THREE.Group();
    const shell=new THREE.Mesh(valveGeo,valveSkin);shell.position.y=1.36;
    shell.scale.set(.64,1.13,.67);group.add(shell);
    const heart=new THREE.Mesh(valveGeo,valveCore);heart.position.set(0,1.35,-.54);
    heart.scale.set(.28,.38,.22);group.add(heart);
    const eye=new THREE.Mesh(valveEyeGeo,valveGlow);
    eye.position.set(0,1.37,-.73);group.add(eye);
    for(let i=0;i<2;i++){
      const ring=new THREE.Mesh(valveRing,i%2?boneMat:valveCore);
      ring.position.y=.85+i*.92;ring.rotation.x=Math.PI/2;ring.scale.set(.85+i*.07,.84+i*.05,.9);
      group.add(ring);
    }
    group.position.set(tissue.x,0,tissue.z);group.userData={flash:0};
    tissue.visual=group;tissueVisuals.set(tissue.id,group);
    return group;
  }
  function clearChunks() {
    for(const obj of chunks.values()) scene.remove(obj);
    chunks.clear();layouts.clear();tissueChunks.clear();tissueVisuals.clear();lastChunk='';
    for(const line of streaks)line.obj.geometry.dispose();streaks.length=0;
    source.clear();
    stains.length=0;droplets.length=0;particlesGeo.setDrawRange(0,0);
    kickPos=0;kickVel=0;muzzleTime=0;organPulse=0;
  }
  function buildChunk(cx,cz){
    const cs=getCells(cx,cz),cells=[...cs].map(k=>k.split(',').map(Number)),profile=getOrganProfile(cx,cz);
    const walls=[],bones=[],vessels=[],sacs=[],hazards=[],features=[];
    for(const [x,z] of cells){
      if(rand(x,z,seed+161)>(stage===1?.22:stage===4?.50:.72))vessels.push([x,.01,z,rand(x,z,seed+162)*Math.PI*2]);
      if(biomeHazard(seed,stage,x,z))hazards.push([x,z]);
      if(rand(x,z,seed+stage*59+177)>(stage===3?.75:.87))features.push([x,z,rand(x,z,seed+174)*Math.PI*2]);
      if(rand(x,z,seed+171)>(profile.archetype==='atrium'?.82:.92))sacs.push([x+(rand(x,z,seed+172)-.5)*.43,2.62,z+(rand(x,z,seed+173)-.5)*.43]);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        if(!isBaseFloor(x+dx,z+dz)) {
          const rot=dx?Math.PI/2:0;
          walls.push([x+dx*.5,1.4,z+dz*.5,rot,x,z]);
          if(rand(x,z,seed+dx*7+dz*11)>.67)bones.push([x+dx*.48,1.18,z+dz*.48,rot]);
        }
      }
    }
    const group=new THREE.Group(), temp=new THREE.Object3D();
    const floor=new THREE.InstancedMesh(geometryFloor,membrane,cells.length);
    const ceiling=new THREE.InstancedMesh(geometryFloor,membrane,cells.length);
    cells.forEach(([x,z],i)=>{
      temp.position.set(x,0,z);temp.rotation.set(0,0,0);
      temp.scale.set(1,1,1);temp.updateMatrix();floor.setMatrixAt(i,temp.matrix);
      floor.setColorAt(i,new THREE.Color().setHSL(biome.hue+(rand(x,z,seed)-.5)*.018,biome.saturation,biome.floorLight+(profile.growth-.5)*.09));
      temp.position.y=2.76;temp.rotation.set(0,0,0);temp.updateMatrix();ceiling.setMatrixAt(i,temp.matrix);
      ceiling.setColorAt(i,new THREE.Color().setHSL(biome.hue+(rand(x,z,seed+7)-.5)*.019,biome.saturation*.8,biome.floorLight*.67+(profile.growth-.5)*.045));
    });
    floor.instanceMatrix.needsUpdate=true;ceiling.instanceMatrix.needsUpdate=true;
    group.add(floor,ceiling);
    const wall=new THREE.InstancedMesh(stage===2?gastricWallGeo:wallShape,stage===2?stomachWallMat:wallMat,walls.length);
    walls.forEach(([x,y,z,rot,a,b],i)=>{
      temp.position.set(x,y,z);temp.rotation.set(0,rot,0);temp.scale.set(1,1,1);temp.updateMatrix();wall.setMatrixAt(i,temp.matrix);
      wall.setColorAt(i,new THREE.Color().setHSL(biome.hue+(rand(a,b,seed+12)-.5)*.019,biome.saturation,biome.wallLight+rand(a,b,seed+14)*.14));
    });
    wall.instanceMatrix.needsUpdate=true;group.add(wall);
    if(stage===2){
      // Real gastric architecture: distinct per-sector landmarks and irregular
      // pleated hanging vaults. All large forms stay overhead or in wall space,
      // not inside movement / hitscan lanes.
      const art=gastricChamber(cx,cz,seed),style=art.seed;
      const archCount=art.arches;
      const arches=new THREE.InstancedMesh(gastricPylorusGeo,gastricFoldMat,archCount);
      let placed=0;
      const clearCenter=cells.filter(([x,z])=>{
        const lx=x-cx*8,lz=z-cz*8;
        return lx>=2&&lx<=5&&lz>=2&&lz<=5&&isBaseFloor(x,z);
      });
      for(let j=0;j<archCount;j++){
        const [x,z]=clearCenter[(j*5+style)%clearCenter.length]||cells[j%cells.length];
        temp.position.set(x,1.95,z);temp.rotation.set(Math.PI/2,gastricSeedArt(x,z,31)*Math.PI,0);
        temp.scale.set(1.1+gastricSeedArt(x,z,32)*.22,.85,.5);
        temp.updateMatrix();arches.setMatrixAt(placed++,temp.matrix);
      }
      arches.count=placed;arches.instanceMatrix.needsUpdate=true;group.add(arches);
      const folds=[];
      for(const [x,z] of cells){
        if(gastricSeedArt(x,z,23)>art.folds)continue;
        folds.push([x+(gastricSeedArt(x,z,24)-.5)*.3,z+(gastricSeedArt(x,z,25)-.5)*.3]);
      }
      if(folds.length){
        const drapes=new THREE.InstancedMesh(gastricDrapeGeo,gastricFoldMat,folds.length);
        folds.forEach(([x,z],i)=>{
          temp.position.set(x,2.42,z);temp.rotation.set(.13,gastricSeedArt(x,z,26)*6.28,.13);
          const stretch=.14+gastricSeedArt(x,z,27)*.14*art.hang;
          temp.scale.set(.26+stretch,.21+stretch,.16+stretch);
          temp.updateMatrix();drapes.setMatrixAt(i,temp.matrix);
        });
        drapes.instanceMatrix.needsUpdate=true;group.add(drapes);
      }
      const ridges=walls.filter((_,i)=>i%3!==0);
      if(ridges.length){
        const creases=new THREE.InstancedMesh(gastricRugaGeo,gastricFoldMat,ridges.length);
        ridges.forEach(([x,y,z,rot,a,b],i)=>{
          temp.position.set(x,y+(gastricSeedArt(a,b,45)-.5)*.6,z);
          temp.rotation.set(0,rot,gastricSeedArt(a,b,46)*.3);
          temp.scale.set(.6,.95,.52);temp.updateMatrix();creases.setMatrixAt(i,temp.matrix);
        });
        creases.instanceMatrix.needsUpdate=true;group.add(creases);
      }
      // Per-sector hero geometry:
      // pylorus: layered occluding rings;
      // cistern: pendant bladder;
      // rugae: pleated tendon vault.
      if(art.type==='cistern'&&clearCenter.length>=4){
        const [x,z]=clearCenter[Math.floor(style%clearCenter.length)];
        const bulb=new THREE.Mesh(gastricDrapeGeo,gastricFoldMat);
        bulb.position.set(x,2.34,z);bulb.scale.set(.54,.33,.53);group.add(bulb);
        for(let i=0;i<3;i++){
          const mouth=new THREE.Mesh(gastricPylorusGeo,i===1?gastricMucusMat:gastricFoldMat);
          mouth.position.set(x,2.12-i*.20,z);mouth.rotation.x=Math.PI/2;
          mouth.scale.setScalar(.53+i*.1);group.add(mouth);
        }
      }
      if(art.type==='rugae'&&clearCenter.length>=4){
        const pleats=new THREE.InstancedMesh(gastricRugaGeo,gastricFoldMat,6);
        for(let i=0;i<6;i++){
          const [x,z]=clearCenter[(i*5+style)%clearCenter.length];
          temp.position.set(x,2.35,z);temp.rotation.set(Math.PI/2,i*.9,.1);
          temp.scale.set(.6+.08*i,.75,.85);temp.updateMatrix();pleats.setMatrixAt(i,temp.matrix);
        }
        pleats.instanceMatrix.needsUpdate=true;group.add(pleats);
      }
      // Twisted pyloric tendons in especially open atria.
      if((profile.archetype==='atrium'||art.type==='pylorus')&&clearCenter.length>=7){
        const cords=new THREE.InstancedMesh(gastricSinewGeo,gastricFoldMat,4);
        for(let i=0;i<4;i++){
          const [x,z]=clearCenter[(i*3)%clearCenter.length];
          temp.position.set(x,2.27,z);temp.rotation.set(.25*i,.4*i,.52);
          temp.scale.set(1,1.0,1);temp.updateMatrix();cords.setMatrixAt(i,temp.matrix);
        }
        cords.instanceMatrix.needsUpdate=true;group.add(cords);
      }
    }
    if(bones.length){
      const bone=new THREE.InstancedMesh(boneShape,boneMat,bones.length);
      bones.forEach(([x,y,z,rot],i)=>{temp.position.set(x,y,z);temp.rotation.set(0,rot,.13);temp.scale.set(1,1,1);temp.updateMatrix();bone.setMatrixAt(i,temp.matrix);});
      bone.instanceMatrix.needsUpdate=true;group.add(bone);
    }
    if(vessels.length){
      const vesselsMesh=new THREE.InstancedMesh(vesselGeo,vesselMat,vessels.length);
      vessels.forEach(([x,y,z,rot],i)=>{temp.position.set(x,y,z);temp.rotation.set(0,rot,0);temp.scale.set(1,1,1);temp.updateMatrix();vesselsMesh.setMatrixAt(i,temp.matrix);});
      vesselsMesh.instanceMatrix.needsUpdate=true;group.add(vesselsMesh);
    }
    if(sacs.length){
      const sacsMesh=new THREE.InstancedMesh(sacGeo,sacMat,sacs.length);
      sacs.forEach(([x,y,z],i)=>{temp.position.set(x,y,z);temp.rotation.set(0,0,0);temp.scale.set(1,1,1);temp.updateMatrix();sacsMesh.setMatrixAt(i,temp.matrix);});
      sacsMesh.instanceMatrix.needsUpdate=true;group.add(sacsMesh);
    }
    if(hazards.length){
      const pools=new THREE.InstancedMesh(hazardGeo,hazardMat,hazards.length);
      hazards.forEach(([x,z],i)=>{temp.position.set(x,.067,z);temp.rotation.set(0,rand(x,z,seed)*6.28,0);
        temp.scale.set(stage===3?.84:1,.085,stage===3?.84:1);temp.updateMatrix();pools.setMatrixAt(i,temp.matrix);});
      pools.instanceMatrix.needsUpdate=true;group.add(pools);
    }
    if(features.length){
      const geom=stage===4?axonGeo:stage===3?archGeo:organFeatureGeo;
      const mat=stage===4?axonMat:stage===3?boneMat:organFeatureMat;
      const landmark=new THREE.InstancedMesh(geom,mat,features.length);
      features.forEach(([x,z,rot],i)=>{
        temp.position.set(x,stage===3?1.4:stage===4?2.15:2.50,z);
        temp.rotation.set(stage===3?0:Math.PI*.5,rot,0);
        temp.scale.set(stage===2?1:stage===3?1.12:.9,stage===2?1.6:1,stage===2?1.5:1);
        temp.updateMatrix();landmark.setMatrixAt(i,temp.matrix);
      });landmark.instanceMatrix.needsUpdate=true;group.add(landmark);
    }
    for(const tissue of getTissues(cx,cz))if(!openedTissues.has(tissue.id))group.add(makeTissueVisual(tissue));
    if(profile.archetype==='rib-vault'){
      for(const [x,z] of cells.filter(([x,z])=>(x+z+profile.rotation)%5===0).slice(0,3)){
        const arch=new THREE.Mesh(archGeo,boneMat);arch.position.set(x,1.82,z);group.add(arch);
      }
    }
    chunks.set(cellKey(cx,cz),group);
    scene.add(group);
  }
  function nearChunks(x,z) {
    const cx=Math.floor(Math.round(x)/CELLS_PER_CHUNK),cz=Math.floor(Math.round(z)/CELLS_PER_CHUNK);
    const focus=cellKey(cx,cz);if(lastChunk===focus)return;
    lastChunk=focus;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++) if(!chunks.has(cellKey(cx+dx,cz+dz)))buildChunk(cx+dx,cz+dz);
    for(const [k,m] of chunks){const [a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>1||Math.abs(b-cz)>1){scene.remove(m);chunks.delete(k);for(const t of getTissues(a,b)){t.visual=null;tissueVisuals.delete(t.id);}}}
    if(layouts.size>120){for(const [k] of layouts){const [a,b]=k.split(',').map(Number);if(Math.abs(a-cx)>6||Math.abs(b-cz)>6)layouts.delete(k);}}
  }
  function moveCircle(x,z,dx,dz,r=.21){return sweepCircle(x,z,dx,dz,r,isFloor);}
  function makeEnemy(type,x,z){
    const g=new THREE.Group(), core=mobMats[type]||mobMats.crawler;
    const sizes={crawler:1,spitter:.90,brute:1.36,leech:.94,warden:1.67,heart:1.8};
    const scale=sizes[type]||1;
    const body=new THREE.Mesh(organicGeo,core);
    body.position.y=type==='crawler'?.53:type==='leech'?.61:1;
    body.scale.set(type==='brute'||type==='warden'?.70:type==='leech'?.28:.42,
      type==='crawler'?.28:type==='spitter'?.48:type==='leech'?.30:.55,
      type==='leech'?.68:type==='crawler'?.64:.38);
    g.add(body);g.userData.body=body;
    const wound=new THREE.Mesh(organicGeo,woundMat);
    wound.position.copy(body.position);wound.scale.copy(body.scale).multiplyScalar(1.07);
    wound.visible=false;g.add(wound);g.userData.wound=wound;
    const limbs=[];
    function leg(side,index,length=.76){
      const joint=new THREE.Group();
      joint.position.set(side*(type==='brute'?.56:.37),type==='crawler'?.52:.55,
        -.25+index*.28);
      const upper=new THREE.Mesh(limbGeo,index%2?boneMat:core);
      upper.position.set(side*.20,-.22,0);upper.rotation.z=side*(.85+index*.13);
      upper.scale.set(.85,length,1);joint.add(upper);
      const claw=new THREE.Mesh(mandibleGeo,boneMat);
      claw.position.set(side*.46,-.48,-.12);claw.rotation.z=side*.39;claw.scale.set(.52,.62,.56);
      joint.add(claw);g.add(joint);limbs.push({joint,side,index});
    }
    if(type==='crawler'){
      // Six sprawled grasping limbs, hinged mandibles, almost floor-hugging.
      for(const side of [-1,1])for(let i=0;i<3;i++)leg(side,i,.85);
      for(const side of [-1,1]){
        const jaw=new THREE.Mesh(mandibleGeo,boneMat);
        jaw.position.set(side*.18,.47,-.64);jaw.rotation.z=side*.6;jaw.rotation.x=-.9;
        g.add(jaw);
      }
      const hump=new THREE.Mesh(organicGeo,core);hump.position.set(0,.73,.18);
      hump.scale.set(.31,.19,.39);g.add(hump);
    }else if(type==='spitter'){
      // Tall forward-leaning proboscis plus gigantic asymmetric bile sacs.
      for(const side of [-1,1])for(let i=0;i<2;i++)leg(side,i,.75);
      const neck=new THREE.Mesh(spitterNeckGeo,core);neck.position.set(0,1.46,-.21);
      neck.rotation.x=-.35;g.add(neck);
      const nozzle=new THREE.Mesh(new THREE.TorusGeometry(.15,.085,7,12),boneMat);
      nozzle.position.set(0,1.77,-.42);nozzle.rotation.x=Math.PI/2;g.add(nozzle);
      for(const side of [-1,1]){
        const sac=new THREE.Mesh(spitterSacGeo,bile);
        sac.position.set(side*.37,1.30,.28+side*.04);sac.scale.set(1.40,1.77,1.38);g.add(sac);
      }
    }else if(type==='brute'||type==='warden'){
      // Armour-torso, exposed heavy shoulder pads and forward ivory blades.
      for(const side of [-1,1]){
        leg(side,1,1.25);
        const shield=new THREE.Mesh(shieldGeo,type==='warden'?core:boneMat);
        shield.position.set(side*.64,1.31,-.06);shield.scale.set(.43,.65,.38);g.add(shield);
        const tusk=new THREE.Mesh(mandibleGeo,boneMat);
        tusk.position.set(side*.50,.92,-.57);tusk.rotation.x=-.60;
        tusk.rotation.z=-side*.27;tusk.scale.set(1.1,1.6,1.1);g.add(tusk);
      }
      for(let i=0;i<5;i++){
        const plate=new THREE.Mesh(brutePlateGeo,i%2?core:boneMat);
        plate.position.set((i-2)*.25,1.73+Math.abs(i-2)*.06,.22);
        plate.rotation.x=-.2;plate.scale.set(1.34,1.35,1.05);g.add(plate);
      }
      if(type==='warden'){
        // The stomach guardian is a distinct bell-shaped anchored figure,
        // not a bigger brute with recoloured skin.
        const sphincter=new THREE.Mesh(gastricPylorusGeo,gastricFoldMat);
        sphincter.position.set(0,1.27,-.68);sphincter.rotation.x=Math.PI/2;g.add(sphincter);
        for(const side of [-1,1]){
          const crown=new THREE.Mesh(mandibleGeo,core);
          crown.position.set(side*.28,2.12,0);crown.rotation.z=-side*.28;g.add(crown);
        }
      }
    }else if(type==='leech'){
      // Long low segmented sucker with open ivory mouth.
      for(let i=0;i<5;i++){
        const segment=new THREE.Mesh(organicGeo,core);
        segment.position.set(0,.52,(-i+2)*.23);
        segment.scale.set(.23+i*.032,.25+i*.016,.29);g.add(segment);
      }
      for(let i=0;i<4;i++){
        const collar=new THREE.Mesh(leechTubeGeo,i%2?boneMat:core);
        collar.position.set(0,.56,(-i+1.4)*.24);
        collar.rotation.x=Math.PI/2;collar.scale.setScalar(.80);g.add(collar);
      }
      const mouth=new THREE.Mesh(new THREE.TorusGeometry(.26,.07,8,17),boneMat);
      mouth.position.set(0,.50,-.80);mouth.rotation.x=Math.PI/2;g.add(mouth);
    }else if(type==='heart'){
      for(let i=0;i<7;i++){
        const ring=new THREE.Mesh(veinGeo,i%2?boneMat:core);
        ring.position.set(Math.sin(i*2)*.09,1+i*.09,0);
        ring.rotation.set(i*.24,i*.58,0);ring.scale.setScalar(1.6+i*.12);g.add(ring);
      }
      for(const side of [-1,1])for(let i=0;i<2;i++)leg(side,i,1.15);
    }
    if(type!=='leech'&&type!=='heart'&&type!=='warden'){
      for(const side of [-1,1]){
        const eye=new THREE.Mesh(eyeGeo,eyeMat);
        eye.position.set(side*.19,type==='crawler'?.65:1.13,-.30);g.add(eye);
      }
    }
    const tell=new THREE.Mesh(tellRingGeo,tellMats[type]||tellMats.crawler);
    tell.rotation.x=Math.PI/2;tell.position.y=.085;tell.visible=false;g.add(tell);
    g.userData.tell=tell;g.userData.limbs=limbs;g.userData.bodyBaseY=body.scale.y;
    g.scale.setScalar(scale);g.position.set(x,0,z);source.add(g);
    return g;
  }
  function makeProjectile(x,z,r){
    const mesh=new THREE.Mesh(orbGeo,orbMat);mesh.position.set(x,.85,z);mesh.scale.setScalar(r/.17);source.add(mesh);return mesh;
  }
  function makePickup(x,z){
    const group=new THREE.Group();
    const outer=new THREE.Mesh(new THREE.OctahedronGeometry(.22),bile);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.04,6,12),boneMat);ring.rotation.x=Math.PI/2;
    group.add(outer,ring);group.position.set(x,.55,z);source.add(group);return group;
  }
  function firePulse(weapon){
    muzzleKind=weapon;muzzleTime=weapon===1?.115:weapon===2?.13:.075;
    kickVel+=weapon===1?5.7:weapon===2?7.0:2.6;
  }
  function fireTrace(origin,point,weapon){
    const budget=quality==='low'?11:24;
    if(streaks.length>=budget){
      const old=streaks.shift();source.remove(old.obj);old.obj.geometry.dispose();
    }
    const dir=new THREE.Vector3(point.x-origin.x,point.y-origin.y,point.z-origin.z).normalize();
    const start=new THREE.Vector3(origin.x+dir.x*.42,origin.y+dir.y*.42,origin.z+dir.z*.42);
    const end=new THREE.Vector3(point.x,point.y,point.z);
    const geometry=new THREE.BufferGeometry().setFromPoints([start,end]);
    const obj=new THREE.Line(geometry,weapon?bileLineMat:lineMat);source.add(obj);
    streaks.push({obj,life:.11});
  }
  function impact(point,dir,kind){
    if(kind==='wall'){
      if(stains.length>=44)source.remove(stains.shift());
      const decal=new THREE.Mesh(impactGeo,wallBlood);
      decal.position.set(point.x-dir.x*.035,Math.max(.055,Math.min(2.67,point.y-dir.y*.035)),point.z-dir.z*.035);
      decal.lookAt(decal.position.x-dir.x,decal.position.y-dir.y,decal.position.z-dir.z);
      const radius=.11+Math.random()*.12;
      decal.scale.set(radius,radius*(.65+Math.random()*.55),1);source.add(decal);stains.push(decal);
    }
    const count=quality==='low'?4:kind==='flesh'?14:7;
    for(let i=0;i<count&&droplets.length<600;i++){
      const angle=Math.random()*Math.PI*2,force=.75+Math.random()*2.4;
      droplets.push({x:point.x,y:point.y,z:point.z,
        vx:dir.x*force*.54+Math.cos(angle)*force*.75,
        vy:dir.y*force*.28+(Math.random()-.24)*2.7,
        vz:dir.z*force*.54+Math.sin(angle)*force*.75,
        life:.19+Math.random()*.5});
    }
  }
  function splatter(x,z,count=13){
    for(let i=0;i<count&&droplets.length<600;i++){
      const a=Math.random()*Math.PI*2,force=.8+Math.random()*3;
      droplets.push({x,y:.7+Math.random()*.6,z,vx:Math.cos(a)*force,vy:1.4+Math.random()*2,vz:Math.sin(a)*force,life:.35+Math.random()*.75});
    }
    if(stains.length>=35){source.remove(stains.shift());}
    const stain=new THREE.Mesh(gooGeo,bloodMat);stain.position.set(x,.025,z);stain.scale.setScalar(.2+Math.random()*.3);source.add(stain);stains.push(stain);
  }
  function tickFx(dt,time){
    for(let i=streaks.length-1;i>=0;i--){const s=streaks[i];s.life-=dt;if(s.life<=0){source.remove(s.obj);s.obj.geometry.dispose();streaks.splice(i,1);}}
    muzzleTime=Math.max(0,muzzleTime-dt);
    kickVel+=(-kickPos*125-kickVel*18)*dt;kickPos+=kickVel*dt;
    for(let i=droplets.length-1;i>=0;i--){
      const p=droplets[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=9.5*dt;p.life-=dt;
      if(p.life<=0||p.y<=.04)droplets.splice(i,1);
    }
    for(let i=0;i<droplets.length;i++){const p=droplets[i];particleArr[i*3]=p.x;particleArr[i*3+1]=p.y;particleArr[i*3+2]=p.z;}
    particlesGeo.attributes.position.needsUpdate=true;particlesGeo.setDrawRange(0,droplets.length);
    organPulse=Math.max(0,organPulse-dt);
    pulseLamp.intensity=6.5+Math.sin(time*(stage===4?5.2:stage===1?3.8:2.7))*2.6+organPulse*7+immunePressure*6;
    if(stage===2)stomachWallMat.roughness=.30+Math.sin(time*1.6)*.045;
    hazardMat.emissiveIntensity=.48+Math.sin(time*(stage===4?6:2.5))*.17;
    for(const root of tissueVisuals.values())if(root.visible){root.userData.flash=Math.max(0,root.userData.flash-dt);
      root.scale.setScalar(1+Math.sin(time*3.4+root.position.x*.25)*.045+root.userData.flash*.4);
    }
    membrane.emissiveIntensity=.3+Math.sin(time*2.15)*.09;
  }
  function setImmunePressure(value){immunePressure=clamp(Number(value)||0,0,1);}
  function reset(newSeed,ruptured=[],newStage=1){
    seed=(newSeed>>>0);stage=Math.max(1,Math.min(5,Math.trunc(newStage)||1));immunePressure=0;
    biome=biomeForWave(stage);clearChunks();setSeed(stageSeed(seed,stage));
    openedTissues=new Set((Array.isArray(ruptured)?ruptured:[]).filter(id=>typeof id==='string'&&/^[1-5]:-?\d+,-?\d+$/.test(id)).slice(0,2000));
    scene.background.setHex(biome.background);scene.fog.color.setHex(biome.fog);scene.fog.density=biome.fogDensity;
    sky.color.setHex(biome.light);sky.groundColor.setHex(biome.background);
    lamp.color.setHex(biome.light);pulseLamp.color.setHex(biome.pulse);
    boneMat.color.setHex(biome.bone);vesselMat.color.setHex(biome.vein);
    valveSkin.color.setHex(biome.vein);valveCore.color.setHex(biome.accent);
    sacMat.color.setHex(biome.accent);axonMat.color.setHex(biome.accent);
    hazardMat.color.setHex(biome.accent);hazardMat.emissive.setHex(biome.pulse);
    organFeatureMat.color.setHex(biome.vein);
    return seed;
  }
  function paint(player,entities,pickups,time,dt,recoil=0,damage=0,shots=[]){
    resize();nearChunks(player.x,player.z);
    camera.position.set(player.x,1.41+Math.sin(time*11)*Math.min(.025,(player.moving||0)*.018),player.z);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    camera.rotation.set(player.pitch+(reduced?0:Math.min(.016,kickPos*.03)),player.yaw,0,'YXZ');
    camera.fov=77+recoil*2.8+(player.sprinting?3:0);camera.updateProjectionMatrix();
    lamp.position.set(player.x,1.7,player.z);pulseLamp.position.set(player.x,2.55,player.z-1.8);
    const w=player.weapon===2?2:player.weapon===1?1:0;
    bolter.visible=w===0;shredder.visible=w===1;stinger.visible=w===2;
    const portrait=canvas.clientHeight>canvas.clientWidth;
    gun.scale.setScalar(portrait?.76:1);
    gun.position.set((portrait?.10:.17)+Math.sin(time*8)*(player.moving||0)*.012,
      (portrait?-.14:-.16)+Math.cos(time*8)*(player.moving||0)*.008-recoil*.04,
      -.20-Math.min(.23,kickPos*.2));
    gun.rotation.x=(reduced?0:Math.min(.12,kickPos*.19));
    longFlash.visible=muzzleTime>0&&muzzleKind===0;
    wideFlash.visible=muzzleTime>0&&muzzleKind===1;
    needleFlash.visible=muzzleTime>0&&muzzleKind===2;
    if(longFlash.visible)longFlash.scale.setScalar(.9+muzzleTime*3);
    if(wideFlash.visible)wideFlash.scale.setScalar(.85+muzzleTime*3.1);
    if(needleFlash.visible)needleFlash.scale.setScalar(.78+muzzleTime*2.1);
    for(const e of entities)if(e.visual){
      const hit=clamp((e.hitFlash||0)/.18,0,1);
      e.visual.position.set(e.x,Math.sin(time*4+e.id)*.038-hit*.05,e.z);
      e.visual.rotation.y=Math.atan2(player.x-e.x,player.z-e.z)+Math.PI;
      e.visual.rotation.z=(reduced?0:Math.sin(time*26+e.id)*hit*.075);
      e.visual.scale.setScalar((e.type==='heart'?1.8:e.type==='warden'?1.67:e.type==='brute'?1.36:e.type==='spitter'?.90:e.type==='leech'?.94:1)*(1+Math.sin(time*5+e.id)*.045-hit*.07));
       if(e.visual.userData.body){const body=e.visual.userData.body;body.scale.y=e.visual.userData.bodyBaseY*(1+Math.sin(time*3+e.id)*.045);}
       if(e.visual.userData.limbs&&!reduced){for(const limb of e.visual.userData.limbs){limb.joint.rotation.x=Math.sin(time*(e.type==='crawler'?10:6)+e.id+limb.index*2+limb.side)*(.15+(e.windup>0?.10:0));}}
      if(e.visual.userData.wound)e.visual.userData.wound.visible=hit>.1;
      const tell=e.visual.userData.tell;
      if(tell){
        const severity=telegraphSeverity(e);
        tell.visible=severity>0;
        if(tell.visible){
          const amp=(e.type==='brute'?1.43:1.0)*(0.80+severity*.47);
          tell.scale.setScalar(amp);
          // Face-to-floor organic warning ring, no UI popover or unrelated glow.
          tell.position.y=.09+Math.sin(time*12)*.012;
        }
      }
    }
    for(const p of pickups)if(p.visual){p.visual.position.y=.55+Math.sin(time*3+p.x)*.12;p.visual.rotation.y+=dt*1.8;}
    for(const p of shots)if(p.visual){p.visual.position.set(p.x,.95+Math.sin(time*13+p.x)*.07,p.z);p.visual.rotation.y+=dt*5;}
    tickFx(dt,time);
    renderer.render(scene,camera);
  }
  function disposeVisual(obj){if(obj){source.remove(obj);}}
  function getOpenCells(cx,cz){return [...getCells(cx,cz)].map(k=>{const a=k.split(',');return {x:+a[0],z:+a[1]};}).filter(p=>isFloor(p.x,p.z));}
  function getStart(){const cells=getOpenCells(0,0);return cells.reduce((a,b)=>Math.hypot(b.x-3.5,b.z-3.5)<Math.hypot(a.x-3.5,a.z-3.5)?b:a,cells[0]||{x:3,z:3});}
  function visible(a,b) {
    const dist=Math.hypot(a.x-b.x,a.z-b.z), steps=Math.ceil(dist/.13);
    for(let i=1;i<steps;i++){const t=i/steps;if(!isFloor(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}
    return true;
  }
  function end(){clearChunks();renderer.dispose();}
  reset(initialSeed);resize();
  return { THREE, camera, scene, isFloor, moveCircle, nearChunks, getOpenCells, getStart, visible, makeEnemy, makePickup, makeProjectile, disposeVisual, splatter, paint, reset, resize, setQuality, firePulse, fireTrace, impact, getTissueAt, damageTissue, getTissueCount, setImmunePressure, getHazardAt, getBiome:()=>biome, getStage:()=>stage, softwareRenderer, end, getFxCounts:()=>({streaks:streaks.length,decals:stains.length,particles:droplets.length}) };
}
