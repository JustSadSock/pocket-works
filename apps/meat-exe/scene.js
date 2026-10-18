import * as THREE from './three.module.js';
import { generateOrgan, getOrganProfile, getTissueNodes, setSeed, CELLS_PER_CHUNK } from './organGen.js';
import { sweepCircle } from './stability.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cellKey = (x,z) => x + ',' + z;
const rand = (a,b,s=0) => {
  let n = Math.imul(a,374761393) + Math.imul(b,668265263) + Math.imul(s,1442695041);
  n = Math.imul(n ^ n >>> 13,1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

export function createWorld(canvas, initialSeed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x130709);
  scene.fog = new THREE.FogExp2(0x210b0d, 0.098);
  const camera = new THREE.PerspectiveCamera(77, 1, 0.06, 42);
  camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0x9b5451, 0x260b0b, 1.3));
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
  // Generated collagen and capillary colour map. One shared atlas keeps the nine visible chunks cheap.
  function makeFleshMap(){
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d');if(!x)return null;
    let seed=0x13b0de;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    x.fillStyle='#d8a09b';x.fillRect(0,0,256,256);
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
  const membrane = new THREE.MeshStandardMaterial({color:0xc18487, map:fleshMap, roughness:.64, metalness:0, side:THREE.DoubleSide, emissive:0x230407, emissiveIntensity:.19});
  const wallMat = new THREE.MeshStandardMaterial({color:0xa35862, map:fleshMap, roughness:.66, metalness:0, emissive:0x280407, emissiveIntensity:.27});
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
    brute:new THREE.MeshStandardMaterial({color:0x765361,roughness:.82,emissive:0x22070e,emissiveIntensity:.25}),
    heart:new THREE.MeshStandardMaterial({color:0xbd132d,roughness:.31,emissive:0x5f0713,emissiveIntensity:1})
  };
  const eyeMat = new THREE.MeshBasicMaterial({color:0xffe6bc});
  const vesselMat = new THREE.MeshStandardMaterial({color:0x7e2434,metalness:.06,roughness:.33,emissive:0x26050a,emissiveIntensity:.25});
  const vesselGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.46,.09,-.25),new THREE.Vector3(-.20,.11,-.05),
    new THREE.Vector3(.12,.08,.06),new THREE.Vector3(.46,.12,.21)
  ]),12,.038,5,false);
  const sacGeo = new THREE.IcosahedronGeometry(.19,1);
  const sacMat = new THREE.MeshStandardMaterial({color:0x9c4a54,roughness:.41,metalness:0,emissive:0x270b0f,emissiveIntensity:.25});
  const particlesGeo = new THREE.BufferGeometry();
  const particleArr = new Float32Array(600*3);
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(particleArr,3));
  particlesGeo.setDrawRange(0,0);
  const particles = new THREE.Points(particlesGeo,new THREE.PointsMaterial({color:0xf3404c,size:.095,transparent:true,opacity:.9,depthWrite:false}));
  scene.add(particles);
  const source = new THREE.Group();
  scene.add(source);
  const chunks = new Map(), layouts = new Map(), tissueChunks = new Map(), tissueVisuals = new Map(), stains = [], droplets = [], streaks = [];
  let openedTissues=new Set(),organPulse=0;
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
  const gun = new THREE.Group(), bolter=new THREE.Group(), shredder=new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color:0x565151,metalness:.62,roughness:.38});
  const muscle = new THREE.MeshStandardMaterial({color:0x491e26,metalness:.06,roughness:.78});
  const barrelBone = new THREE.MeshStandardMaterial({color:0xd4b49a,metalness:.04,roughness:.84});
  const muzzle = new THREE.MeshBasicMaterial({color:0xffd5a0});
  gun.add(bolter,shredder);
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
  let muzzleTime=0,muzzleKind=0,kickPos=0,kickVel=0;
  longFlash.visible=false;wideFlash.visible=false;
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
    const budget=mobile?1_300_000:2_200_000;
    const pixelRatio=Math.min(window.devicePixelRatio||1,desired,Math.sqrt(budget/(w*h)));
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
    if(!tissueChunks.has(k))tissueChunks.set(k,getTissueNodes(cx,cz).map(t=>({...t,visual:null})));
    return tissueChunks.get(k);
  }
  function getTissueAt(x,z){
    const a=Math.round(x),b=Math.round(z);
    if(Math.abs(x-a)>.49||Math.abs(z-b)>.49)return null;
    return getTissues(Math.floor(a/CELLS_PER_CHUNK),Math.floor(b/CELLS_PER_CHUNK))
      .find(t=>t.x===a&&t.z===b&&!openedTissues.has(t.id))||null;
  }
  function isFloor(x,z){return isBaseFloor(x,z)&&!getTissueAt(x,z);}
  function getTissueCount(cx,cz){return getTissues(cx,cz).filter(t=>!openedTissues.has(t.id)).length;}
  function damageTissue(id,amount){
    if(typeof id!=='string'||!Number.isFinite(amount)||amount<=0||openedTissues.has(id))return null;
    const [x,z]=id.split(',').map(Number);
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
    for(let i=0;i<4;i++){
      const ring=new THREE.Mesh(valveRing,i%2?boneMat:valveCore);
      ring.position.y=.53+i*.54;ring.rotation.x=Math.PI/2;ring.scale.set(.85+i*.07,.84+i*.05,.9);
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
    const walls=[],bones=[],vessels=[],sacs=[];
    for(const [x,z] of cells){
      if(rand(x,z,seed+161)>.27)vessels.push([x,.01,z,rand(x,z,seed+162)*Math.PI*2]);
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
      floor.setColorAt(i,new THREE.Color().setHSL(.965+rand(x,z,seed)*.027,.3+profile.tone*.12,.44+profile.growth*.09));
      temp.position.y=2.76;temp.rotation.set(0,0,0);temp.updateMatrix();ceiling.setMatrixAt(i,temp.matrix);
      ceiling.setColorAt(i,new THREE.Color().setHSL(.96+rand(x,z,seed+7)*.027,.31+profile.tone*.1,.29+profile.growth*.09));
    });
    floor.instanceMatrix.needsUpdate=true;ceiling.instanceMatrix.needsUpdate=true;
    group.add(floor,ceiling);
    const wall=new THREE.InstancedMesh(wallShape,wallMat,walls.length);
    walls.forEach(([x,y,z,rot,a,b],i)=>{
      temp.position.set(x,y,z);temp.rotation.set(0,rot,0);temp.scale.set(1,1,1);temp.updateMatrix();wall.setMatrixAt(i,temp.matrix);
      wall.setColorAt(i,new THREE.Color().setHSL(.965,.33,.41+rand(a,b,seed+12)*.17));
    });
    wall.instanceMatrix.needsUpdate=true;group.add(wall);
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
    for(const tissue of getTissues(cx,cz))if(!openedTissues.has(tissue.id))group.add(makeTissueVisual(tissue));
    if(profile.archetype==='rib-vault'){
      for(const [x,z] of cells.filter(([x,z])=>(x+z+profile.rotation)%5===0).slice(0,7)){
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
    const scale=type==='heart'?1.8:type==='brute'?1.28:type==='spitter'?.84:.95;
    const body=new THREE.Mesh(organicGeo,core);body.position.y=.85;body.scale.set(.42,.5,.32);g.add(body);
    const wound=new THREE.Mesh(organicGeo,woundMat);wound.position.y=.85;wound.scale.set(.46,.54,.37);wound.visible=false;g.add(wound);g.userData.wound=wound;
    const jaw=new THREE.Mesh(new THREE.TorusGeometry(.2,.07,6,12),boneMat);jaw.position.set(0,.65,-.3);g.add(jaw);
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+.35;
      const spine=new THREE.Mesh(toothGeo,i%2?boneMat:core);
      spine.position.set(Math.sin(a)*.37,.73,Math.cos(a)*.3);spine.rotation.z=Math.sin(a)*.52;spine.rotation.x=Math.cos(a)*.52;g.add(spine);
    }
    for(const s of [-1,1]){
      const eye=new THREE.Mesh(eyeGeo,eyeMat);eye.position.set(.17*s,1,-.25);g.add(eye);
      const leg=new THREE.Mesh(toothGeo,core);leg.position.set(.29*s,.28,.02);leg.rotation.z=s*Math.PI*.34;g.add(leg);
    }
    if(type==='heart')for(let i=0;i<5;i++){
      const ring=new THREE.Mesh(veinGeo,i%2?boneMat:core);ring.position.set(0,.8+i*.065,0);ring.rotation.set(i*.23,i*.5,0);ring.scale.setScalar(1.4+i*.08);g.add(ring);
    }
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
    muzzleKind=weapon;muzzleTime=weapon===1?.115:.075;
    kickVel+=weapon===1?5.7:2.6;
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
    pulseLamp.intensity=6.5+Math.sin(time*3.8)*2.6+organPulse*7;
    for(const root of tissueVisuals.values())if(root.visible){root.userData.flash=Math.max(0,root.userData.flash-dt);
      root.scale.setScalar(1+Math.sin(time*3.4+root.position.x*.25)*.045+root.userData.flash*.4);
    }
    membrane.emissiveIntensity=.3+Math.sin(time*2.15)*.09;
  }
  function reset(newSeed,ruptured=[]){
    seed=(newSeed>>>0);setSeed(seed);clearChunks();
    openedTissues=new Set((Array.isArray(ruptured)?ruptured:[]).filter(id=>typeof id==='string'&&/^-?\d+,-?\d+$/.test(id)).slice(0,2000));
    return seed;
  }
  function paint(player,entities,pickups,time,dt,recoil=0,damage=0,shots=[]){
    resize();nearChunks(player.x,player.z);
    camera.position.set(player.x,1.41+Math.sin(time*11)*Math.min(.025,(player.moving||0)*.018),player.z);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    camera.rotation.set(player.pitch+(reduced?0:Math.min(.016,kickPos*.03)),player.yaw,0,'YXZ');
    camera.fov=77+recoil*2.8+(player.sprinting?3:0);camera.updateProjectionMatrix();
    lamp.position.set(player.x,1.7,player.z);pulseLamp.position.set(player.x,2.55,player.z-1.8);
    const w=player.weapon===1?1:0;
    bolter.visible=w===0;shredder.visible=w===1;
    const portrait=canvas.clientHeight>canvas.clientWidth;
    gun.scale.setScalar(portrait?.76:1);
    gun.position.set((portrait?.10:.17)+Math.sin(time*8)*(player.moving||0)*.012,
      (portrait?-.14:-.16)+Math.cos(time*8)*(player.moving||0)*.008-recoil*.04,
      -.20-Math.min(.23,kickPos*.2));
    gun.rotation.x=(reduced?0:Math.min(.12,kickPos*.19));
    longFlash.visible=muzzleTime>0&&muzzleKind===0;
    wideFlash.visible=muzzleTime>0&&muzzleKind===1;
    if(longFlash.visible)longFlash.scale.setScalar(.9+muzzleTime*3);
    if(wideFlash.visible)wideFlash.scale.setScalar(.85+muzzleTime*3.1);
    for(const e of entities)if(e.visual){
      const hit=clamp((e.hitFlash||0)/.18,0,1);
      e.visual.position.set(e.x,Math.sin(time*4+e.id)*.038-hit*.05,e.z);
      e.visual.rotation.y=Math.atan2(player.x-e.x,player.z-e.z)+Math.PI;
      e.visual.rotation.z=(reduced?0:Math.sin(time*26+e.id)*hit*.075);
      e.visual.scale.setScalar((e.type==='heart'?1.8:e.type==='brute'?1.28:e.type==='spitter'?.84:.95)*(1+Math.sin(time*5+e.id)*.045-hit*.07));
      if(e.visual.userData.wound)e.visual.userData.wound.visible=hit>.1;
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
  return { THREE, camera, scene, isFloor, moveCircle, nearChunks, getOpenCells, getStart, visible, makeEnemy, makePickup, makeProjectile, disposeVisual, splatter, paint, reset, resize, setQuality, firePulse, fireTrace, impact, getTissueAt, damageTissue, getTissueCount, end, getFxCounts:()=>({streaks:streaks.length,decals:stains.length,particles:droplets.length}) };
}
