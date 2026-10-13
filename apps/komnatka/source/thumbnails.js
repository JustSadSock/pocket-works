import { Engine, Scene, ArcRotateCamera, Vector3, Color3, Color4, HemisphericLight, DirectionalLight } from '@babylonjs/core';
import { CATALOG, COLORS, makeItem } from './models.js';

// The catalog renders the EXACT model used in the room, rather than unrelated symbols.
// A single temporary small WebGL canvas generates thumbnails once, then is disposed.
export async function buildFurnitureThumbnails(onImage){
 const canvas=document.createElement('canvas');
 canvas.width=180;canvas.height=180;
 let engine=null;
 try{
  engine=new Engine(canvas,true,{preserveDrawingBuffer:true,antialias:true,alpha:true});
  engine.setHardwareScalingLevel(1);
  const scene=new Scene(engine);
  scene.clearColor=new Color4(0,0,0,0);
  scene.imageProcessingConfiguration.exposure=.89;
  const hemi=new HemisphericLight('thumbnail-softbox',new Vector3(.2,1,.4),scene);
  hemi.intensity=.72;hemi.diffuse=Color3.FromHexString('#fff3dd');
  const key=new DirectionalLight('thumbnail-warm-key',new Vector3(-.6,-1,-.4),scene);
  key.intensity=.40;
  const camera=new ArcRotateCamera('catalog-photo',Math.PI/4,Math.PI/3,8,Vector3.Zero(),scene);
  camera.mode=1;camera.inputs.clear();
  scene.activeCamera=camera;
  for(let n=0;n<CATALOG.length;n++){
   const entry=CATALOG[n],wall=entry.layer==='wall';
   const color=entry.type==='rug'?'#d6ab93':entry.type==='plant'?'#c79078':COLORS[2];
   const root=makeItem(scene,{id:'thumb-'+entry.type,type:entry.type,x:0,y:0,z:0,rot:0,color,variant:0});
   const height={
    sofa:1.45,chair:1.45,coffee:.85,shelf:1.2,bed:1.2,stool:.68,
    floorlamp:2.65,tablelamp:1.0,plant:1.55,rug:.15,
    books:.38,mug:.38,frame:1.25,window:2.08,
    wardrobe:2.40,desk:.88,nightstand:.76,bookcase:2.17,loveseat:1.43,pouf:.65,
    teddy:.76,vase:.79,candle:.49,pillow:.20,basket:.67,cactus:1.13,
    mirror:1.44,clock:.88,deskclock:.55,teapot:.57
   }[entry.type]||1.2;
   const span=Math.max(1.06,entry.size[0]*.64,entry.size[1]*.65,height*.68);
   camera.alpha=wall?Math.PI/2:Math.PI/4;
   camera.beta=wall?Math.PI/2:Math.PI/3.1;
   camera.target.set(0,wall?0:height*.48,0);
   camera.orthoLeft=-span;camera.orthoRight=span;camera.orthoTop=span;camera.orthoBottom=-span;
   scene.render();
   const src=canvas.toDataURL('image/png');
   if(src.length>80)onImage(entry.type,src);
   root.dispose(false,false);
   // Yield so catalogue rendering cannot stall placement on a mobile device.
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  scene.dispose();
 }catch(error){console.warn('Catalog model previews unavailable',error);}
 finally{engine?.dispose();}
}
