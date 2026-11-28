// Actual imported GLB; compare stable primitive/vertex identities and read GPU
// skinning output from the standard Three.js skinning shader into a float FBO.
import {chromium,webkit} from 'playwright';import {createServer} from 'node:http';import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';
const out=resolve(process.env.CHARACTER_EVIDENCE),root=resolve('node_modules/three'),samples=JSON.parse(readFileSync(join(out,'p0-browser-samples.json')));
const html=`<!doctype html><style>body{margin:0;background:#dad5cb}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]))*1000;
async function load(url){
 const buf=await (await fetch(url)).arrayBuffer(),dv=new DataView(buf),len=dv.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,len))),base=28+len;
 const raw=(id,i)=>{const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=({VEC3:3,VEC4:4,SCALAR:1})[a.type],size=a.componentType===5123?2:4,off=base+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??n*size);return Array.from({length:n},(_,k)=>a.componentType===5123?dv.getUint16(off+2*k,true):dv.getFloat32(off+4*k,true))};
 const g=await new GLTFLoader().parseAsync(buf,''),byIndex=new Map();g.scene.traverse(m=>{if(!m.isSkinnedMesh)return;const a=g.parser.associations.get(m),id=a?.primitives??doc.meshes[0].primitives.findIndex(p=>p.extras.part===m.userData.part);if(id<0||byIndex.has(id))throw Error('Ambiguous imported primitive '+id);byIndex.set(id,m)});
 if(byIndex.size!==doc.meshes[0].primitives.length)throw Error('Missing primitive association');
 return {g,doc,raw,byIndex,mixer:new T.AnimationMixer(g.scene)};
}
function setPose(c,action,phase){const clip=c.g.animations.find(x=>x.name===action);if(!clip)throw Error('Missing clip '+action);c.mixer.stopAllAction();const a=c.mixer.clipAction(clip);a.reset().setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();c.mixer.setTime(clip.duration*phase);c.g.scene.updateMatrixWorld(true);for(const m of c.byIndex.values())m.skeleton.update()}
function rawPoint(c,index,i){const m=c.byIndex.get(index),p=c.doc.meshes[0].primitives[index].attributes,v=new T.Vector3(...c.raw(p.POSITION,i)).applyMatrix4(m.bindMatrix),sum=new T.Vector3(),mat=new T.Matrix4();let n=0;
 for(const suffix of ['0','1']){const j=p['JOINTS_'+suffix],w=p['WEIGHTS_'+suffix];if(j===undefined||w===undefined)continue;const js=c.raw(j,i),ws=c.raw(w,i);for(let k=0;k<4;k++)if(ws[k]>0){n++;mat.multiplyMatrices(m.skeleton.bones[js[k]].matrixWorld,m.skeleton.boneInverses[js[k]]);sum.addScaledVector(v.clone().applyMatrix4(mat),ws[k])}}
 return {position:sum.applyMatrix4(m.bindMatrixInverse).applyMatrix4(m.matrixWorld).toArray(),influences:n};
}
function cpu(m,i){return m.getVertexPosition(i,new T.Vector3()).applyMatrix4(m.matrixWorld).toArray()}
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);document.body.appendChild(renderer.domElement);
renderer.setClearColor(0,0);
function gpuProbe(m,points){
 if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('GPU float readback unsupported');
 const n=points.length,g=new T.BufferGeometry(),pos=[],joints=[],weights=[],clip=[];
 for(let k=0;k<n;k++)for(const [dx,dy] of [[-.42,-.42],[.42,-.42],[0,.42]]){
  const i=points[k].index,p=m.geometry.attributes.position,j=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;
  pos.push(p.getX(i),p.getY(i),p.getZ(i));joints.push(j.getX(i),j.getY(i),j.getZ(i),j.getW(i));weights.push(w.getX(i),w.getY(i),w.getZ(i),w.getW(i));clip.push((k+.5+dx)*2/n-1,dy*2);
 }
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));g.setAttribute('probeClip',new T.Float32BufferAttribute(clip,2));
 const mat=new T.MeshBasicMaterial({side:T.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});mat.onBeforeCompile=s=>{
  s.vertexShader='attribute vec2 probeClip; varying vec3 measured;\\n'+s.vertexShader.replace('#include <project_vertex>','measured = (modelMatrix * vec4(transformed, 1.0)).xyz; gl_Position = vec4(probeClip, 0.0, 1.0);');
  s.fragmentShader='varying vec3 measured;\\n'+s.fragmentShader.replace('#include <dithering_fragment>','gl_FragColor = vec4(measured, 1.0);');
 };
 const mesh=new T.SkinnedMesh(g,mat);mesh.matrixAutoUpdate=false;mesh.matrix.copy(m.matrixWorld);mesh.bind(m.skeleton,m.bindMatrix);mesh.frustumCulled=false;
 const scene=new T.Scene();scene.add(mesh);const camera=new T.Camera(),target=new T.WebGLRenderTarget(n,1,{type:T.FloatType,format:T.RGBAFormat,depthBuffer:false,stencilBuffer:false}),data=new Float32Array(n*4);
 try{renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,n,1,data);let max=0;for(let i=0;i<n;i++){if(Math.abs(data[i*4+3]-1)>1e-5)throw Error('Missing actual GPU sample '+i);max=Math.max(max,dist(Array.from(data.slice(i*4,i*4+3)),points[i].position))}return max}
 finally{renderer.setRenderTarget(null);target.dispose();g.dispose();mat.dispose()}
}
window.run=async(samples)=>{
 const four=await load('/character.glb'),eight=await load('/p0-eight-original.glb'),rows=[],controls=[];
 for(const r of samples){setPose(four,r.action,r.phase);setPose(eight,r.action,r.phase);let cpuMax=0,rawFourMax=0,rawEightMax=0,eightStockMax=0,gpuMax=0,gpuCount=0,overFour=0;
  const parts=[];
  for(const p of r.parts){const m=four.byIndex.get(p.primitive),e=eight.byIndex.get(p.primitive),a=four.doc.meshes[0].primitives[p.primitive],b=eight.doc.meshes[0].primitives[p.primitive];
   if(a.extras.part!==p.name||b.extras.part!==p.name||m.geometry.attributes.position.count!==p.count||e.geometry.attributes.position.count!==p.count||a.attributes.JOINTS_1!==undefined)throw Error('Stable primitive identity failed '+p.name);
   let cmax=0,r4=0,r8=0,s8=0,count=0;
   for(const x of p.points){if(dist(four.raw(a.attributes.POSITION,x.index),x.rest)>.01)throw Error('Rest identity failed '+p.name+' '+x.index);
    const q=rawPoint(four,p.primitive,x.index),z=rawPoint(eight,p.primitive,x.index);
    cmax=Math.max(cmax,dist(cpu(m,x.index),x.position));r4=Math.max(r4,dist(q.position,x.position));r8=Math.max(r8,dist(z.position,x.eightPosition));
    const error=dist(cpu(e,x.index),z.position);s8=Math.max(s8,error);if(z.influences>4){count++;if(controls.length<12)controls.push({part:p.name,vertex:x.index,action:r.action,phase:r.phase,influences:z.influences,stockErrorMm:error,rawErrorMm:dist(z.position,x.eightPosition)})}
   }
   const runGpu=r.phase===0||r.action==='walk'&&[.25,.5,.75,1].includes(r.phase);const gerr=runGpu?gpuProbe(m,p.points):null;
   if(gerr!==null){gpuCount+=p.points.length;gpuMax=Math.max(gpuMax,gerr)}
   cpuMax=Math.max(cpuMax,cmax);rawFourMax=Math.max(rawFourMax,r4);rawEightMax=Math.max(rawEightMax,r8);eightStockMax=Math.max(eightStockMax,s8);overFour+=count;
   parts.push({name:p.name,cpuMm:cmax,rawFourMm:r4,rawEightMm:r8,stockEightMm:s8,gpuMm:gerr,overFour:count});
  }
  rows.push({action:r.action,phase:r.phase,cpuMax,rawFourMax,rawEightMax,eightStockMax,gpuMax,gpuCount,overFour,parts});
 }
 // Actual stock renderer image of four-weight candidate at a walk pose.
 setPose(four,'walk',.25);const scene=new T.Scene();scene.background=new T.Color(0xddd7ca);scene.add(four.g.scene);scene.add(new T.HemisphereLight(0xfff2de,0x79838c,2));const light=new T.DirectionalLight(0xfff0db,3);light.position.set(3,5,4);scene.add(light);
 const box=new T.Box3().setFromObject(four.g.scene),c=box.getCenter(new T.Vector3()),h=box.getSize(new T.Vector3()).y,camera=new T.PerspectiveCamera(35,1,.01,100);camera.position.copy(c).add(new T.Vector3(h*.7,h*.2,h*1.9));camera.lookAt(c);renderer.render(scene,camera);
 return {threeRevision:T.REVISION,rows,controls,gate:rows.every(x=>x.cpuMax<=.5&&x.rawFourMax<=.5&&x.rawEightMax<=.5&&x.gpuMax<=.5)&&rows.some(x=>x.gpuCount>0)&&controls.length>0,method:'stable primitive and vertex identity, independent raw eight-weight calculation, CPU getVertexPosition, actual standard skinning vertex shader float GPU readback; four-weight candidate only'};
};
</script>`;
const server=createServer((req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}if(['/character.glb','/p0-eight-original.glb'].includes(p)){res.setHeader('Content-Type','model/gltf-binary');return res.end(readFileSync(join(out,p.slice(1))))}const f=resolve(root,p.slice('/three/'.length));if(!p.startsWith('/three/')||!f.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type','text/javascript');res.end(readFileSync(f))}catch(e){res.statusCode=404;res.end(String(e))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const result={};try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const b=await engine.launch(name==='chromium'?{args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});try{const p=await b.newPage({viewport:{width:640,height:640}});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>typeof window.run==='function');result[name]={version:b.version(),...await p.evaluate(s=>window.run(s),samples)};await p.screenshot({path:join(out,'p0-gpu-'+name+'.png')});}catch(e){result[name]={gate:false,error:String(e)}}finally{await b.close()}}}finally{server.close();writeFileSync(join(out,'p0-browser-qa.json'),JSON.stringify(result,null,2))}
if(Object.values(result).some(x=>!x.gate))throw Error('P0 browser playback rejected; evidence retained');
