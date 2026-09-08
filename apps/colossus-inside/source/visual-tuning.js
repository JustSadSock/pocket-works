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
  const brass = makeMaterial(scene, 'route-inlay-brass', new Color3(.20,.145,.055), new Color3(.055,.036,.010));
  const teal = makeMaterial(scene, 'route-inlay-joint', new Color3(.025,.22,.18), new Color3(.025,.25,.20));
  const parents = { back:'carrier-back', shoulder:'carrier-shoulder', interior:'carrier-interior', head:'carrier-head' };
  for (const [carrier, route] of Object.entries(ROUTES)) {
    const parent = scene.getTransformNodeByName(parents[carrier]);
    if (!parent) continue;
    route.pads.forEach(([a,b], index) => {
      const mid=(a+b)*.5, p=routePoint(carrier,0,mid), depth=Math.max(.35,b-a-.30), edge=Math.max(1.1,p.width*.73);
      for (const side of [-1,1]) {
        const inlay=MeshBuilder.CreateBox(`route-inlay-${carrier}-${index}-${side}`,{width:.055,height:.018,depth},scene);
        inlay.parent=parent; inlay.position.set(edge*side,p.y+.145,mid); inlay.material=index===route.pads.length-1?teal:brass;
      }
    });
  }
}

function addInteriorArchitecture(scene) {
  const parent=scene.getTransformNodeByName('carrier-interior');
  if (!parent) return;
  const shell=makeMaterial(scene,'interior-shell-runtime',new Color3(.10,.115,.105));
  const rib=makeMaterial(scene,'interior-rib-runtime',new Color3(.19,.145,.075),new Color3(.018,.012,.004));
  const tissue=makeMaterial(scene,'interior-tissue-runtime',new Color3(.13,.030,.024),new Color3(.025,.004,.003));
  const lampMat=makeMaterial(scene,'interior-lamp-runtime',new Color3(.05,.42,.34),new Color3(.04,.55,.43));
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
      const light=new PointLight(`interior-guide-light-${i}-${side}`,Vector3.Zero(),scene); light.parent=lamp; light.intensity=.34; light.range=5.5; light.diffuse=new Color3(.20,.78,.63);
    }
  }
}

export function installColossusVisualTuning(){
  const scene=EngineStore.LastCreatedScene;
  if(!scene)return;
  globalThis.__PW_VISUAL_TUNING__={ready:true,version:4};
  scene.clearColor=new Color4(.040,.055,.058,1);
  scene.ambientColor=new Color3(.27,.285,.26);
  scene.imageProcessingConfiguration.exposure=1.26;
  scene.imageProcessingConfiguration.contrast=1.08;
  const sky=new HemisphericLight('cross-browser-sky-fill',new Vector3(.2,1,.18),scene); sky.intensity=.82; sky.diffuse=new Color3(.62,.69,.66); sky.groundColor=new Color3(.16,.15,.12);
  const rim=new DirectionalLight('cross-browser-rim',new Vector3(.5,-.7,-.46),scene); rim.position.set(-18,30,24); rim.intensity=.78; rim.diffuse=new Color3(.82,.70,.50);
  const cameraLamp=new PointLight('camera-readable-fill',new Vector3(0,1.25,1.3),scene); cameraLamp.parent=scene.activeCamera; cameraLamp.intensity=1.18; cameraLamp.range=22; cameraLamp.diffuse=new Color3(.76,.70,.57);
  addRouteInlays(scene); addInteriorArchitecture(scene);
  const tune=()=>{
    const inside=globalThis.__PW_TEST_STATE__?.carrier==='interior';
    scene.imageProcessingConfiguration.exposure=inside?1.34:1.26; scene.imageProcessingConfiguration.contrast=inside?1.03:1.08;
    if(inside){scene.fogDensity=Math.min(scene.fogDensity||.006,.0065);scene.fogColor=new Color3(.075,.088,.078);cameraLamp.intensity=1.55;cameraLamp.range=18;}
    else{if(scene.fogDensity>.0028)scene.fogDensity=.00235;scene.fogColor=new Color3(.105,.135,.14);cameraLamp.intensity=1.18;cameraLamp.range=22;}
    for(const m of scene.materials){
      const name=m.name||'';
      if('ambientColor'in m&&/^authored-/.test(name))m.ambientColor=/interior|bone|edge/i.test(name)?new Color3(.62,.60,.51):new Color3(.48,.50,.46);
      if('emissiveColor'in m&&/^authored-/.test(name)){
        if(/sensor/i.test(name))m.emissiveColor=new Color3(.035,.34,.27);
        else if(/heart/i.test(name))m.emissiveColor=new Color3(.10,.014,.010);
        else if(/interior/i.test(name))m.emissiveColor=new Color3(.050,.058,.050);
        else if(/edge/i.test(name))m.emissiveColor=new Color3(.075,.052,.018);
      }
    }
    for(const light of scene.lights)if(/route-light|traveler-lamp/i.test(light.name||'')){light.intensity=Math.max(light.intensity||0,inside?.76:.66);light.range=Math.max(light.range||0,inside?10:9);}
  };
  tune(); let passes=0; const observer=scene.onBeforeRenderObservable.add(()=>{if(passes%12===0)tune();passes+=1;if(passes>1800)scene.onBeforeRenderObservable.remove(observer);});
}
