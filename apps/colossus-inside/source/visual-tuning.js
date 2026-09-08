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
  const hw = width * .5, hd = depth * .5, c = Math.min(chamfer, hw * .32, hd * .32);
  const ring = [
    [-hw+c,-hd], [hw-c,-hd], [hw,-hd+c], [hw,hd-c],
    [hw-c,hd], [-hw+c,hd], [-hw,hd-c], [-hw,-hd+c]
  ];
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
  const armor = makeMaterial(scene,'faceted-route-armor',new Color3(.14,.17,.162),new Color3(.050,.064,.060),new Color3(.42,.44,.37),72);
  armor.ambientColor = new Color3(.58,.60,.55);
  const edge = makeMaterial(scene,'faceted-route-edge',new Color3(.25,.17,.060),new Color3(.065,.040,.010),new Color3(.54,.43,.20),66);
  const recess = makeMaterial(scene,'faceted-route-recess',new Color3(.050,.068,.066),new Color3(.012,.018,.018),new Color3(.16,.18,.16),38);
  const bone = makeMaterial(scene,'dorsal-mechanism',new Color3(.15,.16,.14),new Color3(.025,.027,.022),new Color3(.40,.41,.34),52);

  for (const [carrier, route] of Object.entries(ROUTES)) {
    const parent=scene.getTransformNodeByName(parents[carrier]);
    if(!parent) continue;
    route.pads.forEach(([a,b],index)=>{
      const mid=(a+b)*.5, p=routePoint(carrier,0,mid), depth=Math.max(.55,b-a-.10);
      const fullWidth=Math.max(3.2,p.width*2.02);
      const shell=chamferedPrism(scene,`faceted-${carrier}-plate-${index}`,parent,fullWidth,depth,.34,.56,p.y-.20,mid,armor);
      shell.rotation.z=(index%2?1:-1)*.008;
      const spine=MeshBuilder.CreateBox(`faceted-${carrier}-spine-${index}`,{width:.52,height:.19,depth:Math.max(.4,depth*.68)},scene);
      spine.parent=parent; spine.position.set(0,p.y+.015,mid); spine.material=edge;
      for(const side of [-1,1]){
        const inset=MeshBuilder.CreateBox(`faceted-${carrier}-recess-${index}-${side}`,{width:Math.max(.8,fullWidth*.16),height:.025,depth:Math.max(.35,depth*.46)},scene);
        inset.parent=parent; inset.position.set(side*fullWidth*.27,p.y+.012,mid+(index%2?-.10:.10)); inset.material=recess;
      }
      if(carrier!=='interior') for(const side of [-1,1]){
        const socket=MeshBuilder.CreateCylinder(`dorsal-socket-${carrier}-${index}-${side}`,{diameter:1.15,height:Math.min(2.2,depth*.72),tessellation:10},scene);
        socket.parent=parent; socket.rotation.x=Math.PI/2; socket.position.set(side*(fullWidth*.5+.42),p.y-.62,mid); socket.material=bone;
        const collar=MeshBuilder.CreateTorus(`dorsal-collar-${carrier}-${index}-${side}`,{diameter:1.28,thickness:.13,tessellation:20},scene);
        collar.parent=parent; collar.rotation.x=Math.PI/2; collar.position.set(side*(fullWidth*.5+.42),p.y-.62,mid); collar.material=edge;
      }
    });
  }
  for(const mesh of scene.meshes){const name=mesh.name||'';if(/^(back|shoulder|interior|head)-plate-\d+(-ridge)?$/.test(name)||/^spine-fin-\d+$/.test(name))mesh.visibility=.02;}
}

function addRouteInlays(scene) {
  const brass=makeMaterial(scene,'route-inlay-brass',new Color3(.22,.155,.055),new Color3(.045,.028,.008));
  const teal=makeMaterial(scene,'route-inlay-joint',new Color3(.025,.22,.18),new Color3(.025,.24,.19));
  const parents={back:'carrier-back',shoulder:'carrier-shoulder',interior:'carrier-interior',head:'carrier-head'};
  for(const [carrier,route] of Object.entries(ROUTES)){
    const parent=scene.getTransformNodeByName(parents[carrier]);if(!parent)continue;
    route.pads.forEach(([a,b],index)=>{const mid=(a+b)*.5,p=routePoint(carrier,0,mid),depth=Math.max(.35,b-a-.42),edgeX=Math.max(1.1,p.width*.78);for(const side of [-1,1]){const inlay=MeshBuilder.CreateBox(`route-inlay-${carrier}-${index}-${side}`,{width:.055,height:.018,depth},scene);inlay.parent=parent;inlay.position.set(edgeX*side,p.y+.018,mid);inlay.material=index===route.pads.length-1?teal:brass;}});
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
  const scene=EngineStore.LastCreatedScene;if(!scene)return;globalThis.__PW_VISUAL_TUNING__={ready:true,version:8};
  scene.clearColor=new Color4(.045,.061,.064,1);scene.ambientColor=new Color3(.32,.33,.30);scene.imageProcessingConfiguration.exposure=1.28;scene.imageProcessingConfiguration.contrast=1.08;
  const sky=new HemisphericLight('cross-browser-sky-fill',new Vector3(.2,1,.18),scene);sky.intensity=.90;sky.diffuse=new Color3(.65,.72,.69);sky.groundColor=new Color3(.18,.17,.14);
  const rim=new DirectionalLight('cross-browser-rim',new Vector3(.5,-.7,-.46),scene);rim.position.set(-18,30,24);rim.intensity=.84;rim.diffuse=new Color3(.84,.72,.52);
  const cameraLamp=new PointLight('camera-readable-fill',new Vector3(0,1.25,1.3),scene);cameraLamp.parent=scene.activeCamera;cameraLamp.intensity=1.28;cameraLamp.range=24;cameraLamp.diffuse=new Color3(.78,.72,.59);
  addArmorTraversal(scene);addRouteInlays(scene);const stabilizer=addInteriorArchitecture(scene);
  const tune=()=>{const inside=globalThis.__PW_TEST_STATE__?.carrier==='interior';scene.imageProcessingConfiguration.exposure=inside?1.35:1.29;scene.imageProcessingConfiguration.contrast=inside?1.04:1.08;if(inside){scene.fogDensity=Math.min(scene.fogDensity||.006,.006);scene.fogColor=new Color3(.085,.10,.09);cameraLamp.intensity=1.65;cameraLamp.range=19;}else{if(scene.fogDensity>.0028)scene.fogDensity=.0023;scene.fogColor=new Color3(.11,.14,.145);cameraLamp.intensity=1.28;cameraLamp.range=24;}for(const m of scene.materials){const name=m.name||'';if(!/^authored-/.test(name))continue;if('ambientColor'in m)m.ambientColor=/interior|bone|edge/i.test(name)?new Color3(.64,.61,.52):new Color3(.50,.52,.48);if('emissiveColor'in m){if(/sensor/i.test(name))m.emissiveColor=new Color3(.035,.32,.26);else if(/heart/i.test(name))m.emissiveColor=new Color3(.10,.014,.010);else if(/player|cloth/i.test(name))m.emissiveColor=new Color3(.085,.065,.040);else if(/armor|bone|interior/i.test(name))m.emissiveColor=new Color3(.045,.055,.050);}}};
  tune();let passes=0;scene.onBeforeRenderObservable.add(()=>{if(passes%12===0)tune();if(stabilizer){const t=performance.now()/1000;stabilizer.ring.rotation.z=t*.35;const p=.90+.10*Math.sin(t*3.1);stabilizer.ring.scaling.setAll(p);stabilizer.targetLight.intensity=1.0+.30*Math.sin(t*3.1);}passes++;});
}
