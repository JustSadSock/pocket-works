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
   // Frame the *geometry*, not a hardcoded room-sized box. A pillow should
   // occupy as much of its catalog tile as a sofa does of its own.
   root.computeWorldMatrix(true);
   const low={x:Infinity,y:Infinity,z:Infinity},high={x:-Infinity,y:-Infinity,z:-Infinity};
   for(const mesh of root.getChildMeshes(false)){
    mesh.computeWorldMatrix(true);
    const bounds=mesh.getBoundingInfo().boundingBox;
    for(const axis of ['x','y','z']){
     low[axis]=Math.min(low[axis],bounds.minimumWorld[axis]);
     high[axis]=Math.max(high[axis],bounds.maximumWorld[axis]);
    }
   }
   const width=high.x-low.x,depth=high.z-low.z,height=high.y-low.y;
   const center={x:(low.x+high.x)/2,y:(low.y+high.y)/2,z:(low.z+high.z)/2};
   const span=Math.max(.22,width*.48+depth*.34,height*.67)*1.12;
   camera.alpha=wall?Math.PI/2:Math.PI/4;
   camera.beta=wall?Math.PI/2:Math.PI/3.1;
   camera.target.set(center.x,center.y,center.z);
   camera.orthoLeft=-span;camera.orthoRight=span;camera.orthoTop=span;camera.orthoBottom=-span;
   await scene.whenReadyAsync();
   // The first object (sofa) previously photographed an uncompiled shader.
   scene.render();scene.render();
   const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
   let visible=!gl;
   if(gl){
    const pixel=new Uint8Array(4);
    for(let y=25;y<=155&&!visible;y+=13)for(let x=25;x<=155;x+=13){
     gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
     if(pixel[3]>20){visible=true;break;}
    }
   }
   if(visible){
    const src=canvas.toDataURL('image/png');
    if(src.length>200)onImage(entry.type,src);
   }
   root.dispose(false,false);
   // Yield so catalogue rendering cannot stall placement on a mobile device.
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  scene.dispose();
 }catch(error){console.warn('Catalog model previews unavailable',error);}
 finally{engine?.dispose();}
}
