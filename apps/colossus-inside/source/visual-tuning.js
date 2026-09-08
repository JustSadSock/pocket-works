import { Color3, Color4, DirectionalLight, EngineStore, HemisphericLight, Mesh, MeshBuilder, PointLight, StandardMaterial, Vector3, VertexData } from '@babylonjs/core';
import { ROUTES, routePoint } from './traversal.js';

const makeMaterial = (scene, name, diffuse, emissive = null, specular = new Color3(.18,.16,.12), power = 44) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.specularColor = specular;
  m.specularPower = power;
  m.backFaceCulling = false;
  if (emissive) m.emissiveColor = emissive;
  return m;
};

function chamferedPrism(scene, name, parent, width, depth, thickness, chamfer, y, z, material) {
  const mesh = new Mesh(name, scene);
  mesh.parent = parent;
  const hw = width * .5, hd = depth * .5, c = Math.min(chamfer, hw * .42, hd * .42);
  const ring = [[-hw+c,-hd],[hw-c,-hd],[hw,-hd+c],[hw,hd-c],[hw-c,hd],[-hw+c,hd],[-hw,hd-c],[-hw,-hd+c]];
  const positions = [];
  for (const py of [-thickness*.5, thickness*.5]) for (const [x,zz] of ring) positions.push(x, py, zz);
  const indices = [];
  for (let i=1;i<7;i++) indices.push(8,8+i+1,8+i);
  for (let i=1;i<7;i++) indices.push(0,i,i+1);
  for (let i=0;i<8;i++) { const n=(i+1)%8; indices.push(i,8+n,n, i,8+i,8+n); }
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions=positions; data.indices=indices; data.normals=normals; data.applyToMesh(mesh);
  mesh.position.set(0,y,z); mesh.material=material; mesh.isPickable=false;
  return mesh;
}

function addArmorTraversal(scene) {
  const parents = { back:'carrier-back', shoulder:'carrier-shoulder', interior:'carrier-interior', head:'carrier-head' };
  const armor = makeMaterial(scene,'faceted-route-armor',new Color3(.19,.22,.205),new Color3(.026,.032,.030));
  armor.disableLighting=true; armor.specularColor=Color3.Black();
  const edge = makeMaterial(scene,'faceted-route-edge',new Color3(.34,.235,.075),new Color3(.035,.022,.004));
  edge.disableLighting=true; edge.specularColor=Color3.Black();
  const recess = makeMaterial(scene,'faceted-route-recess',new Color3(.060,.080,.076),new Color3(.010,.014,.013));
  recess.disableLighting=true; recess.specularColor=Color3.Black();
  const bone = makeMaterial(scene,'dorsal-mechanism',new Color3(.17,.19,.165),new Color3(.018,.020,.016));
  bone.disableLighting=true; bone.specularColor=Color3.Black();

  for (const [carrier, route] of Object.entries(ROUTES)) {
    const parent=scene.getTransformNodeByName(parents[carrier]); if(!parent) continue;
    route.pads.forEach(([a,b],index)=>{
      const mid=(a+b)*.5, p=routePoint(carrier,0,mid), depth=Math.max(.55,b-a-.12);
      const totalWidth=Math.max(3.2,p.width*1.76);
      const seam=.58;
      const halfWidth=Math.max(1.35,(totalWidth-seam)*.5);
      for(const side of [-1,1]){
        const shell=chamferedPrism(scene,`faceted-${carrier}-plate-${index}-${side>0?'r':'l'}`,parent,halfWidth,depth,.38,.72,p.y-.22,mid,armor);
        shell.position.x=side*(halfWidth*.5+seam*.5);
        shell.rotation.z=side*(index%2?-.014:.014);
        shell.rotation.y=side*(index%2?.009:-.009);
        const inset=MeshBuilder.CreateBox(`faceted-${carrier}-recess-${index}-${side}`,{width:Math.max(.72,halfWidth*.34),height:.035,depth:Math.max(.35,depth*.42)},scene);
        inset.parent=parent; inset.position.set(side*(halfWidth*.50+seam*.5),p.y+.018,mid+(index%2?-.11:.11)); inset.material=recess;
      }
      const spine=MeshBuilder.CreateBox(`faceted-${carrier}-spine-${index}`,{width:.72,height:.25,depth:Math.max(.42,depth*.76)},scene);
      spine.parent=parent; spine.position.set(0,p.y+.055,mid); spine.material=edge;
      if(carrier!=='interior') for(const side of [-1,1]){
        const socket=MeshBuilder.CreateCylinder(`dorsal-socket-${carrier}-${index}-${side}`,{diameter:1.28,height:Math.min(2.1,depth*.68),tessellation:10},scene);
        socket.parent=parent; socket.rotation.x=Math.PI/2; socket.position.set(side*(totalWidth*.5+.52),p.y-.66,mid); socket.material=bone;
        const collar=MeshBuilder.CreateTorus(`dorsal-collar-${carrier}-${index}-${side}`,{diameter:1.42,thickness:.14,tessellation:20},scene);
        collar.parent=parent; collar.rotation.x=Math.PI/2; collar.position.copyFrom(socket.position); collar.material=edge;
      }
    });
  }

  const fallbackArmor=makeMaterial(scene,'route-fallback-armor',new Color3(.12,.145,.137),new Color3(.012,.017,.016));
  fallbackArmor.disableLighting=true; fallbackArmor.specularColor=Color3.Black();
  const fallbackEdge=makeMaterial(scene,'route-fallback-edge',new Color3(.28,.19,.060),new Color3(.025,.014,.003));
  fallbackEdge.disableLighting=true; fallbackEdge.specularColor=Color3.Black();
  for(const mesh of scene.meshes){
    const name=mesh.name||'';
    if(/^(back|shoulder|interior|head)-plate-\d+$/.test(name)){mesh.visibility=.20;mesh.material=fallbackArmor;}
    else if(/^(back|shoulder|interior|head)-plate-\d+-ridge$/.test(name)||/^spine-fin-\d+$/.test(name)){mesh.visibility=.55;mesh.material=fallbackEdge;}
  }

  return { armor, edge, bone };
}

function addBackLandmarks(scene, materials) {
  const parent=scene.getTransformNodeByName('carrier-back'); if(!parent) return;
  const { armor, edge, bone }=materials;
  for(const side of [-1,1]){
    const shoulder=MeshBuilder.CreateCylinder(`landmark-shoulder-${side}`,{diameter:3.8,height:3.6,tessellation:14},scene);
    shoulder.parent=parent; shoulder.rotation.z=Math.PI/2; shoulder.position.set(side*7.0,.25,8.7); shoulder.material=bone;
    const ring=MeshBuilder.CreateTorus(`landmark-shoulder-ring-${side}`,{diameter:4.15,thickness:.24,tessellation:28},scene);
    ring.parent=parent; ring.rotation.y=Math.PI/2; ring.position.copyFrom(shoulder.position); ring.material=edge;
    const blade=MeshBuilder.CreateBox(`landmark-scapula-${side}`,{width:4.6,height:.38,depth:7.0},scene);
    blade.parent=parent; blade.position.set(side*4.7,.16,5.4); blade.rotation.z=side*.09; blade.rotation.y=side*.16; blade.material=armor;
  }
  const neckBase=MeshBuilder.CreateBox('landmark-neck-base',{width:4.0,height:1.2,depth:3.0},scene);
  neckBase.parent=parent; neckBase.position.set(0,.42,12.4); neckBase.material=bone;
  const neck=MeshBuilder.CreateBox('landmark-neck',{width:2.6,height:3.4,depth:2.3},scene);
  neck.parent=parent; neck.position.set(0,2.0,13.6); neck.rotation.x=-.08; neck.material=armor;
  const neckRing=MeshBuilder.CreateTorus('landmark-neck-ring',{diameter:3.0,thickness:.22,tessellation:28},scene);
  neckRing.parent=parent; neckRing.rotation.x=Math.PI/2; neckRing.position.set(0,2.2,13.1); neckRing.material=edge;

  const shelterMat=makeMaterial(scene,'dorsal-shelter',new Color3(.11,.135,.128),new Color3(.015,.020,.018));
  shelterMat.disableLighting=true; shelterMat.specularColor=Color3.Black();
  for(const side of [-1,1]){
    const wall=MeshBuilder.CreateBox(`dorsal-shelter-wall-${side}`,{width:.65,height:2.5,depth:3.2},scene);
    wall.parent=parent; wall.position.set(side*3.35,2.0,-11.0); wall.rotation.z=side*-.16; wall.material=shelterMat;
  }
  const lintel=MeshBuilder.CreateBox('dorsal-shelter-lintel',{width:6.2,height:.42,depth:.72},scene);
  lintel.parent=parent; lintel.position.set(0,3.0,-12.0); lintel.material=edge;
}

function addRouteInlays(scene) {
  const brass=makeMaterial(scene,'route-inlay-brass',new Color3(.30,.205,.064),new Color3(.020,.012,.002));
  const teal=makeMaterial(scene,'route-inlay-joint',new Color3(.035,.34,.28),new Color3(.020,.18,.15));
  brass.disableLighting=true; teal.disableLighting=true; brass.specularColor=Color3.Black(); teal.specularColor=Color3.Black();
  const parents={back:'carrier-back',shoulder:'carrier-shoulder',interior:'carrier-interior',head:'carrier-head'};
  for(const [carrier,route] of Object.entries(ROUTES)){
    const parent=scene.getTransformNodeByName(parents[carrier]);if(!parent)continue;
    route.pads.forEach(([a,b],index)=>{const mid=(a+b)*.5,p=routePoint(carrier,0,mid),depth=Math.max(.35,b-a-.42),edgeX=Math.max(1.1,p.width*.68);for(const side of [-1,1]){const inlay=MeshBuilder.CreateBox(`route-inlay-${carrier}-${index}-${side}`,{width:.055,height:.022,depth},scene);inlay.parent=parent;inlay.position.set(edgeX*side,p.y+.025,mid);inlay.material=index===route.pads.length-1?teal:brass;}});
  }
}

function addInteriorArchitecture(scene) {
  const parent=scene.getTransformNodeByName('carrier-interior');if(!parent)return null;
  const rib=makeMaterial(scene,'interior-rib-runtime',new Color3(.25,.18,.075),new Color3(.035,.020,.005));
  const tissue=makeMaterial(scene,'interior-tissue-runtime',new Color3(.17,.040,.032),new Color3(.026,.004,.003));
  const lampMat=makeMaterial(scene,'interior-lamp-runtime',new Color3(.05,.40,.33),new Color3(.04,.52,.41));
  const targetMat=makeMaterial(scene,'stabilizer-target-runtime',new Color3(.025,.32,.27),new Color3(.04,.70,.56));
  for(let i=0;i<7;i++){const z=-10+i*3.65;for(const side of [-1,1]){const wall=MeshBuilder.CreateBox(`interior-bulkhead-${i}-${side}`,{width:.48,height:6.8,depth:.62},scene);wall.parent=parent;wall.position.set(side*4.75,3.4,z);wall.rotation.z=side*-.14;wall.material=rib;const brace=MeshBuilder.CreateBox(`interior-brace-${i}-${side}`,{width:4.2,height:.32,depth:.48},scene);brace.parent=parent;brace.position.set(side*2.9,6.25,z);brace.rotation.z=side*.16;brace.material=rib;}if(i%2===0){const membrane=MeshBuilder.CreateBox(`interior-membrane-${i}`,{width:8.8,height:.10,depth:2.4},scene);membrane.parent=parent;membrane.position.set(0,5.65,z+1.25);membrane.material=tissue;}}
  for(let i=0;i<6;i++)for(const side of [-1,1]){const z=-8.7+i*3.55,lamp=MeshBuilder.CreateBox(`interior-guide-lamp-${i}-${side}`,{width:.20,height:.14,depth:.48},scene);lamp.parent=parent;lamp.position.set(side*3.55,1.25,z);lamp.material=lampMat;const light=new PointLight(`interior-guide-light-${i}-${side}`,Vector3.Zero(),scene);light.parent=lamp;light.intensity=.38;light.range=6;light.diffuse=new Color3(.20,.78,.63);}
  const ring=MeshBuilder.CreateTorus('stabilizer-world-target',{diameter:3.2,thickness:.18,tessellation:40},scene);ring.parent=parent;ring.position.set(0,2.5,9.3);ring.rotation.x=Math.PI/2;ring.material=targetMat;
  const core=MeshBuilder.CreateSphere('stabilizer-world-core',{diameter:.48,segments:18},scene);core.parent=parent;core.position.set(0,2.5,9.3);core.material=targetMat;
  const targetLight=new PointLight('stabilizer-world-light',Vector3.Zero(),scene);targetLight.parent=core;targetLight.intensity=1.2;targetLight.range=11;targetLight.diffuse=new Color3(.12,1,.76);return{ring,targetLight};
}

export function installColossusVisualTuning(){
  const scene=EngineStore.LastCreatedScene;if(!scene)return;globalThis.__PW_VISUAL_TUNING__={ready:true,version:10};
  scene.clearColor=new Color4(.052,.069,.072,1);scene.ambientColor=new Color3(.35,.36,.33);scene.imageProcessingConfiguration.exposure=1.36;scene.imageProcessingConfiguration.contrast=1.04;
  const sky=new HemisphericLight('cross-browser-sky-fill',new Vector3(.2,1,.18),scene);sky.intensity=.96;sky.diffuse=new Color3(.67,.74,.71);sky.groundColor=new Color3(.19,.18,.15);
  const rim=new DirectionalLight('cross-browser-rim',new Vector3(.5,-.7,-.46),scene);rim.position.set(-18,30,24);rim.intensity=.90;rim.diffuse=new Color3(.86,.74,.54);
  const cameraLamp=new PointLight('camera-readable-fill',new Vector3(0,1.25,1.3),scene);cameraLamp.parent=scene.activeCamera;cameraLamp.intensity=1.36;cameraLamp.range=25;cameraLamp.diffuse=new Color3(.80,.74,.61);
  const materials=addArmorTraversal(scene);addBackLandmarks(scene,materials);addRouteInlays(scene);const stabilizer=addInteriorArchitecture(scene);
  const tune=()=>{const inside=globalThis.__PW_TEST_STATE__?.carrier==='interior';scene.imageProcessingConfiguration.exposure=inside?1.38:1.36;scene.imageProcessingConfiguration.contrast=inside?1.03:1.04;if(inside){scene.fogDensity=Math.min(scene.fogDensity||.006,.006);scene.fogColor=new Color3(.085,.10,.09);cameraLamp.intensity=1.68;cameraLamp.range=19;}else{if(scene.fogDensity>.0026)scene.fogDensity=.0018;scene.fogColor=new Color3(.12,.15,.155);cameraLamp.intensity=1.36;cameraLamp.range=25;}for(const m of scene.materials){const name=m.name||'';if(!/^authored-/.test(name))continue;if('ambientColor'in m)m.ambientColor=/interior|bone|edge/i.test(name)?new Color3(.68,.64,.55):new Color3(.54,.56,.51);if('emissiveColor'in m){if(/sensor/i.test(name))m.emissiveColor=new Color3(.040,.35,.28);else if(/heart/i.test(name))m.emissiveColor=new Color3(.11,.016,.011);else if(/player|cloth/i.test(name))m.emissiveColor=new Color3(.10,.075,.045);else if(/armor|bone|interior/i.test(name))m.emissiveColor=new Color3(.055,.067,.060);}}};
  tune();let passes=0;scene.onBeforeRenderObservable.add(()=>{if(passes%12===0)tune();if(stabilizer){const t=performance.now()/1000;stabilizer.ring.rotation.z=t*.35;const p=.90+.10*Math.sin(t*3.1);stabilizer.ring.scaling.setAll(p);stabilizer.targetLight.intensity=1.0+.30*Math.sin(t*3.1);}passes++;});
}
