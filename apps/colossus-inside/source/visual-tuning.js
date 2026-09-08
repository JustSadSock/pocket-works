import { Color3, Color4, DirectionalLight, EngineStore, HemisphericLight, MeshBuilder, PointLight, StandardMaterial, Vector3 } from '@babylonjs/core';
import { ROUTES, routePoint } from './traversal.js';

const makeMaterial = (scene, name, diffuse, emissive = null) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.specularColor = new Color3(.18, .16, .12);
  m.specularPower = 44;
  if (emissive) m.emissiveColor = emissive;
  return m;
};

function addRouteInlays(scene) {
  const brass = makeMaterial(scene, 'route-inlay-brass', new Color3(.24,.175,.065), new Color3(.085,.055,.014));
  const teal = makeMaterial(scene, 'route-inlay-joint', new Color3(.03,.26,.21), new Color3(.03,.31,.24));
  const parents = { back:'carrier-back', shoulder:'carrier-shoulder', interior:'carrier-interior', head:'carrier-head' };
  for (const [carrier, route] of Object.entries(ROUTES)) {
    const parent = scene.getTransformNodeByName(parents[carrier]);
    if (!parent) continue;
    route.pads.forEach(([a,b], index) => {
      const mid=(a+b)*.5, p=routePoint(carrier,0,mid), depth=Math.max(.35,b-a-.30), edge=Math.max(1.1,p.width*.73);
      for (const side of [-1,1]) {
        const inlay=MeshBuilder.CreateBox(`route-inlay-${carrier}-${index}-${side}`,{width:.075,height:.025,depth},scene);
        inlay.parent=parent; inlay.position.set(edge*side,p.y+.15,mid); inlay.material=index===route.pads.length-1?teal:brass;
      }
    });
  }
}

function addInteriorArchitecture(scene) {
  const parent=scene.getTransformNodeByName('carrier-interior');
  if (!parent) return null;
  const shell=makeMaterial(scene,'interior-shell-runtime',new Color3(.18,.205,.19),new Color3(.055,.064,.058));
  const rib=makeMaterial(scene,'interior-rib-runtime',new Color3(.29,.215,.10),new Color3(.045,.028,.008));
  const tissue=makeMaterial(scene,'interior-tissue-runtime',new Color3(.18,.045,.035),new Color3(.032,.005,.004));
  const lampMat=makeMaterial(scene,'interior-lamp-runtime',new Color3(.06,.48,.38),new Color3(.05,.62,.48));
  const targetMat=makeMaterial(scene,'stabilizer-target-runtime',new Color3(.025,.34,.28),new Color3(.04,.78,.60));
  const floor=MeshBuilder.CreateBox('interior-service-bed',{width:9.6,height:.34,depth:25.2},scene);
  floor.parent=parent; floor.position.set(0,.45,.45); floor.material=shell;
  for(let i=0;i<7;i+=1){
    const z=-10+i*3.65;
    for(const side of [-1,1]){
      const wall=MeshBuilder.CreateBox(`interior-bulkhead-${i}-${side}`,{width:.48,height:6.8,depth:.62},scene);
      wall.parent=parent; wall.position.set(side*4.75,3.4,z); wall.rotation.z=side*-.14; wall.material=rib;
      const brace=MeshBuilder.CreateBox(`interior-brace-${i}-${side}`,{width:4.2,height:.32,depth:.48},scene);
      brace.parent=parent; brace.position.set(side*2.9,6.25,z); brace.rotation.z=side*.16; brace.material=rib;
    }
    if(i%2===0){const membrane=MeshBuilder.CreateBox(`interior-membrane-${i}`,{width:8.8,height:.10,depth:2.4},scene); membrane.parent=parent; membrane.position.set(0,5.65,z+1.25); membrane.material=tissue;}
  }
  for(let i=0;i<6;i+=1){
    const z=-8.7+i*3.55;
    for(const side of [-1,1]){
      const lamp=MeshBuilder.CreateBox(`interior-guide-lamp-${i}-${side}`,{width:.20,height:.14,depth:.48},scene);
      lamp.parent=parent; lamp.position.set(side*3.55,1.25,z); lamp.material=lampMat;
      const light=new PointLight(`interior-guide-light-${i}-${side}`,Vector3.Zero(),scene); light.parent=lamp; light.intensity=.40; light.range=6.2; light.diffuse=new Color3(.20,.82,.66);
    }
  }
  const ring=MeshBuilder.CreateTorus('stabilizer-world-target',{diameter:3.2,thickness:.18,tessellation:40},scene);
  ring.parent=parent; ring.position.set(0,2.5,9.3); ring.rotation.x=Math.PI/2; ring.material=targetMat;
  const core=MeshBuilder.CreateSphere('stabilizer-world-core',{diameter:.48,segments:18},scene);
  core.parent=parent; core.position.set(0,2.5,9.3); core.material=targetMat;
  const targetLight=new PointLight('stabilizer-world-light',Vector3.Zero(),scene); targetLight.parent=core; targetLight.intensity=1.25; targetLight.range=11; targetLight.diffuse=new Color3(.12,1,.76);
  return { ring, core, targetLight };
}

export function installColossusVisualTuning(){
  const scene=EngineStore.LastCreatedScene;
  if(!scene)return;
  globalThis.__PW_VISUAL_TUNING__={ready:true,version:6};
  scene.clearColor=new Color4(.052,.070,.073,1);
  scene.ambientColor=new Color3(.36,.37,.34);
  scene.imageProcessingConfiguration.exposure=1.32;
  scene.imageProcessingConfiguration.contrast=1.05;

  const routeSurface=makeMaterial(scene,'route-surface-guaranteed',new Color3(.15,.18,.17),new Color3(.105,.13,.12));
  routeSurface.disableLighting=true;
  routeSurface.specularColor=Color3.Black();
  const routeEdge=makeMaterial(scene,'route-edge-guaranteed',new Color3(.30,.215,.085),new Color3(.17,.105,.025));
  routeEdge.disableLighting=true;
  routeEdge.specularColor=Color3.Black();

  const sky=new HemisphericLight('cross-browser-sky-fill',new Vector3(.2,1,.18),scene); sky.intensity=.98; sky.diffuse=new Color3(.68,.75,.72); sky.groundColor=new Color3(.21,.20,.16);
  const rim=new DirectionalLight('cross-browser-rim',new Vector3(.5,-.7,-.46),scene); rim.position.set(-18,30,24); rim.intensity=.90; rim.diffuse=new Color3(.88,.76,.55);
  const cameraLamp=new PointLight('camera-readable-fill',new Vector3(0,1.25,1.3),scene); cameraLamp.parent=scene.activeCamera; cameraLamp.intensity=1.48; cameraLamp.range=26; cameraLamp.diffuse=new Color3(.82,.76,.62);
  addRouteInlays(scene); const stabilizer=addInteriorArchitecture(scene);

  const tune=()=>{
    const inside=globalThis.__PW_TEST_STATE__?.carrier==='interior';
    scene.imageProcessingConfiguration.exposure=inside?1.40:1.33; scene.imageProcessingConfiguration.contrast=inside?1.02:1.05;
    if(inside){scene.fogDensity=Math.min(scene.fogDensity||.006,.006);scene.fogColor=new Color3(.09,.105,.095);cameraLamp.intensity=1.82;cameraLamp.range=20;}
    else{if(scene.fogDensity>.0028)scene.fogDensity=.0022;scene.fogColor=new Color3(.12,.15,.155);cameraLamp.intensity=1.48;cameraLamp.range=26;}

    for(const mesh of scene.meshes){
      const name=mesh.name||'';
      if(/^(back|shoulder|interior|head)-plate-\d+$/.test(name)) mesh.material=routeSurface;
      else if(/^(back|shoulder|interior|head)-plate-\d+-ridge$/.test(name)||/^spine-fin-\d+$/.test(name)) mesh.material=routeEdge;
    }

    for(const m of scene.materials){
      const name=m.name||'';
      if(!/^authored-/.test(name))continue;
      if('ambientColor'in m)m.ambientColor=/interior|bone|edge/i.test(name)?new Color3(.72,.68,.56):new Color3(.58,.60,.55);
      if('emissiveColor'in m){
        if(/sensor/i.test(name))m.emissiveColor=new Color3(.045,.38,.30);
        else if(/heart/i.test(name))m.emissiveColor=new Color3(.12,.018,.012);
        else if(/interior/i.test(name))m.emissiveColor=new Color3(.10,.115,.098);
        else if(/edge/i.test(name))m.emissiveColor=new Color3(.13,.085,.024);
        else if(/bone/i.test(name))m.emissiveColor=new Color3(.10,.105,.085);
        else if(/player|cloth/i.test(name))m.emissiveColor=new Color3(.11,.085,.052);
        else if(/armor/i.test(name))m.emissiveColor=new Color3(.085,.105,.095);
      }
    }
    for(const light of scene.lights)if(/route-light|traveler-lamp/i.test(light.name||'')){light.intensity=Math.max(light.intensity||0,inside?.86:.78);light.range=Math.max(light.range||0,inside?11:10);}
  };
  tune(); let passes=0; const observer=scene.onBeforeRenderObservable.add(()=>{
    if(passes%12===0)tune();
    if(stabilizer){const t=performance.now()/1000;stabilizer.ring.rotation.z=t*.35;const p=.88+.12*Math.sin(t*3.1);stabilizer.ring.scaling.setAll(p);stabilizer.targetLight.intensity=1.0+.35*Math.sin(t*3.1);}
    passes+=1;
  });
}
