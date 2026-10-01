import { AbstractMesh, Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Scene, SceneLoader, ShaderMaterial, Texture, Vector3, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
export interface Perch { id:string; position:Vector3; radius:number; kind:string; }
export interface Collider { min:Vector3; max:Vector3; }
const houses=[[-28,27,8,9,13],[-19,28,7,9,15],[-10,28,8,9,12],[26,24,10,12,10],[37,27,9,12,13],[-31,-28,11,12,9],[28,-26,13,10,8]];
const trees=[[-4,-15,11],[15,-5,14],[-18,2,13],[18,15,12],[-17,-18,10],[40,7,15],[-40,12,15],[-26,40,17],[31,41,16],[-43,-10,12]];
export class World {
 public perches:Perch[]=[]; public colliders:Collider[]=[]; public meshes:AbstractMesh[]=[];
 private waterMaterial?:ShaderMaterial;private grassMaterial?:ShaderMaterial; private canopies:AbstractMesh[]=[];private canopyRest=new Map<AbstractMesh,Vector3>();private leaves:Mesh[]=[];private time=0;private branch?:AbstractMesh;private branchRest?:Vector3;private bend=0;private bendVelocity=0;
 constructor(private scene:Scene) {}
 async load():Promise<void> {
  this.createTerrain();
  const loaded=await SceneLoader.ImportMeshAsync('','./models/','world.glb',this.scene);
  loaded.meshes.forEach(m=>{m.isPickable=false;m.receiveShadows=true;if(m.getTotalVertices()>0)this.meshes.push(m);if(m.name.startsWith('perch_flexible')){this.branch=m;this.branchRest=m.position.clone();}if(m.name.startsWith('canopy')){this.canopies.push(m);this.canopyRest.set(m,m.position.clone());}if(m.material instanceof PBRMaterial){m.material.environmentIntensity=.65;m.material.useRadianceOverAlpha=false;}});
  // Leave the home branch's approach corridor open; crowns must frame the bird, not swallow it.
  const homeView=new Vector3(0,10,-15);
  for(const crown of this.canopies){crown.computeWorldMatrix(true);if(Vector3.Distance(crown.getAbsolutePosition(),homeView)<3.3){crown.dispose();this.canopyRest.delete(crown);}}
  this.canopies=this.canopies.filter(m=>!m.isDisposed());this.meshes=this.meshes.filter(m=>!m.isDisposed());
  for(const m of this.meshes){if(!(m instanceof Mesh)||!/foliage/i.test(m.name))continue;const p=m.getVerticesData(VertexBuffer.PositionKind),indices=m.getIndices();if(!p||!indices)continue;const matrix=m.computeWorldMatrix(true),kept:number[]=[];
   for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;const center=Vector3.TransformCoordinates(new Vector3((p[a]+p[b]+p[c])/3,(p[a+1]+p[b+1]+p[c+1])/3,(p[a+2]+p[b+2]+p[c+2])/3),matrix);if(Vector3.Distance(center,homeView)>3.3)kept.push(indices[i],indices[i+1],indices[i+2]);}m.setIndices(kept);}
  this.applyBrickTexture();this.applySurfaceTextures();
  // Batch authored static details by material; animated crowns and home branch stay independent.
  const batches=new Map<object,Mesh[]>();
  for(const node of this.meshes){if(!(node instanceof Mesh)||!node.material||this.canopies.includes(node)||node===this.branch||node.name==='park ground'||node.name==='slow canal water')continue;node.computeWorldMatrix(true);const list=batches.get(node.material)||[];list.push(node);batches.set(node.material,list);}
  for(const [material,nodes] of batches){if(nodes.length<2)continue;const mat=nodes[0].material;const merged=Mesh.MergeMeshes(nodes,true,true,undefined,false,false);if(merged){merged.material=mat;merged.name='authored district batch';merged.receiveShadows=true;merged.isPickable=false;merged.freezeWorldMatrix();this.meshes.push(merged);}}
  this.meshes=this.meshes.filter(m=>!m.isDisposed());
  for(const [x,z,w,d,h] of houses){
   this.addCollider(x-w/2,0,z-d/2,x+w/2,h,z+d/2);
   // Follow the authored pitched roof instead of a phantom rectangular volume above its eaves.
   const half=w/2+.25, strips=48;
   for(let i=0;i<strips;i++){const left=-half+i*half*2/strips,right=left+half*2/strips;const edge=Math.min(Math.abs(left),Math.abs(right));const top=Math.max(h,h+3.1*(1-edge/half)-.115);this.addCollider(x+left,h,z-d/2-.25,x+right,top,z+d/2+.25);}
   this.perches.push({id:`roof-${x}`,position:new Vector3(x,h+3.14,z),radius:.45,kind:'roof'});
   this.addCollider(x+w*.27-.5,h,z+.2,x+w*.27+.5,h+3.5,z+1.2);
  }
  this.addCollider(.0,0,46,6,30.125,52);
  // Stepped pyramid envelope follows the bell tower's narrow spire.
  for(let i=0;i<18;i++){const bottom=30+i*.5,half=3.324*(1-i/18);this.addCollider(3-half,bottom,49-half,3+half,bottom+.5,49+half);}
  this.addCollider(2.925,39,48.925,3.075,42,49.075);this.perches.push({id:'bell-tower',position:new Vector3(3,42.05,49),radius:.23,kind:'spire'});
  for(let i=0;i<trees.length;i++){const [x,z,h]=trees[i];this.addCollider(x-.43,0,z-.43,x+.6,h*.68,z+.43);this.perches.push({id:`branch-${x}`,position:new Vector3(x+.2*.28+Math.cos(i)*2.7*.72,h*.55+1.432+ .15*(1-.72)+.045*.72,z+Math.sin(i)*2.7*.72),radius:.42,kind:'branch'});}
  this.perches.unshift({id:'home',position:new Vector3(0,8.10,-15),radius:.65,kind:'branch'});
  this.addCollider(-7.5,.48,7.5,7.5,1.12,10.5);
  this.perches.push({id:'bridge',position:new Vector3(0,2.09,7.5),radius:.75,kind:'railing'});
  for(const [x,z] of [[-9,-8],[10,7],[-10,17],[11,28],[39,-15]]){this.addCollider(x-.12,0,z-.12,x+.12,5.45,z+.12);this.addCollider(x-.22,5.45,z-.22,x+.22,6.15,z+.22);this.perches.push({id:`lamp-${x}-${z}`,position:new Vector3(x,6.15,z),radius:.3,kind:'lamp'});}
  for(const z of [-29,31])this.perches.push({id:`wire-${z}`,position:new Vector3(.5,10.516,z),radius:.45,kind:'wire'});
  for(const [x,z] of [[39,-24],[-24,-39]]){this.addCollider(x-.95,.05,z-2,x+.95,.98,z+2);this.addCollider(x-.7,.98,z-1.2,x+.7,1.395,z+.8);this.perches.push({id:`car-${x}`,position:new Vector3(x,1.395,z-.2),radius:.55,kind:'car'});}
  for(const z of [-19,20])for(const [a,b] of [[-45,-9],[9,45]]){this.addCollider(a,0,z-.05,b,1.335,z+.05);for(const x of [a+5,(a+b)/2,b-5])this.perches.push({id:`fence-${x}-${z}`,position:new Vector3(x,1.335,z),radius:.3,kind:'fence'});}
  for(const x of [-42,43])for(const z of [-29,31])this.addCollider(x-.18,0,z-.18,x+.18,12,z+.18);
  this.createGrass();this.createLeaves();
 }
 private applyBrickTexture(){
  const texture=new DynamicTexture('irregular fired brick and mortar',{width:512,height:512},this.scene,true);const c=texture.getContext() as unknown as CanvasRenderingContext2D;c.fillStyle='#6f6657';c.fillRect(0,0,512,512);
  let seed=96;const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let row=0;row<8;row++)for(let col=-1;col<5;col++){const x=col*128+(row%2)*64,y=row*64;const v=rand()*24;c.fillStyle=`rgb(${113+v},${61+v*.55},${40+v*.35})`;c.fillRect(x+2,y+2,124,59);for(let j=0;j<125;j++){c.fillStyle=rand()>.5?'rgba(211,173,124,.09)':'rgba(29,17,10,.15)';c.fillRect(x+rand()*124,y+rand()*60,rand()*9+1,2);}}
  texture.update(false);texture.wrapU=Texture.WRAP_ADDRESSMODE;texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
  for(const m of this.meshes){if(!(m.material instanceof PBRMaterial)||!m.material.name.includes('warm old'))continue;const p=m.getVerticesData(VertexBuffer.PositionKind),n=m.getVerticesData(VertexBuffer.NormalKind);if(!p||!n)continue;const uv:number[]=[];for(let i=0;i<p.length;i+=3){uv.push((Math.abs(n[i])>.5?p[i+2]:p[i])*.5,p[i+1]*.5);}m.setVerticesData(VertexBuffer.UVKind,uv);m.material.albedoTexture=texture;m.material.albedoColor=Color3.White();m.material.roughness=.94;}
 }
 private applySurfaceTextures(){
  // Three small local textures supply material scale, weathering and grain.
  for(const kind of ['limestone','bark','slate'] as const){
   const texture=new DynamicTexture(`weathered ${kind}`,{width:256,height:256},this.scene,true),c=texture.getContext() as unknown as CanvasRenderingContext2D;
   let seed=kind==='bark'?817:kind==='slate'?431:197;const rnd=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
   c.fillStyle=kind==='limestone'?'#8a8e7e':kind==='bark'?'#4c4031':'#3c4749';c.fillRect(0,0,256,256);
   for(let i=0;i<6500;i++){const v=rnd();c.fillStyle=v>.5?'rgba(226,217,185,.07)':'rgba(11,17,16,.12)';c.fillRect(rnd()*256,rnd()*256,kind==='bark'?1:rnd()*5+1,kind==='bark'?8+rnd()*28:1+rnd()*2);}
   if(kind==='limestone'){for(let row=0;row<4;row++){c.fillStyle='rgba(30,34,27,.23)';c.fillRect(0,row*64,256,2);for(let col=0;col<3;col++)c.fillRect((col*96+row%2*48)%256,row*64,2,64);}}
   if(kind==='bark'){for(let i=0;i<12;i++){const x=i*22+rnd()*8;c.strokeStyle='rgba(24,22,16,.35)';c.lineWidth=1+rnd()*2;c.beginPath();c.moveTo(x,0);for(let y=0;y<270;y+=20)c.lineTo(x+Math.sin(y*.07+i)*4,y);c.stroke();}}
   texture.update(false);texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
   const materials=new Set<PBRMaterial>();
   for(const mesh of this.meshes){const material=mesh.material;if(!(material instanceof PBRMaterial)||!(kind==='limestone'?material.name.includes('limestone'):kind==='bark'?material.name.includes('bark'):material.name.includes('slate')))continue;
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normals=mesh.getVerticesData(VertexBuffer.NormalKind);if(!positions||!normals)continue;const uv:number[]=[];
    for(let i=0;i<positions.length;i+=3){const y=positions[i+1],x=positions[i],z=positions[i+2],horizontal=Math.abs(normals[i+1])>.6;uv.push((Math.abs(normals[i])>.5?z:x)*(kind==='bark'?1.3:.6),(horizontal?z:y)*(kind==='bark'?.45:.6));}
    mesh.setVerticesData(VertexBuffer.UVKind,uv);materials.add(material);
   }
   for(const m of materials){m.albedoTexture=texture;m.albedoColor=Color3.White();m.roughness=kind==='slate'?.72:.92;m.metallic=0;}
  }
 }
 private addCollider(x:number,y:number,z:number,X:number,Y:number,Z:number){this.colliders.push({min:new Vector3(x,y,z),max:new Vector3(X,Y,Z)});}
 private createTerrain(){
  const texture=new DynamicTexture('hand-painted-ground',{width:1024,height:1024},this.scene,false);const ctx=texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle='#596047';ctx.fillRect(0,0,1024,1024);let seed=171;
  const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let i=0;i<60000;i++){const g=rand()*32;ctx.fillStyle=`rgba(${70+g},${74+g},${48+g*.7},.36)`;ctx.fillRect(rand()*1024,rand()*1024,rand()*3+1,rand()*3+1);}
  const px=(v:number)=>(v+90)/180*1024;const pz=(v:number)=>(90-v)/180*1024;
  const path=(points:number[][],width:number)=>{ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#9a947d';ctx.lineWidth=width/180*1024;ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(px(x),pz(z)):ctx.moveTo(px(x),pz(z)));ctx.stroke();};
  path([[-47,-34],[-22,-23],[-12,-8],[-10,8],[-11,20],[-20,38]],3.2);path([[43,-30],[20,-20],[10,-8],[10,10],[11,26],[24,37]],3.2);path([[-22,-23],[0,-23],[20,-20]],2.8);path([[-12,9],[13,9]],3.2);
  ctx.fillStyle='#797971';ctx.fillRect(px(-51),pz(-34),px(51)-px(-51),6/180*1024);
  for(let i=0;i<15000;i++){ctx.fillStyle=rand()>.5?'rgba(221,207,164,.14)':'rgba(52,45,34,.11)';ctx.fillRect(rand()*1024,rand()*1024,1.5,1);}
  texture.update(false);const mat=new PBRMaterial('damp park soil',this.scene);mat.albedoTexture=texture;mat.metallic=0;mat.roughness=.97;
  for(const [x,z,w,d] of [[-47.8,0,84.4,180],[47.8,0,84.4,180],[0,-50.7,11.2,78.6],[0,61.7,11.2,56.6]]){
   const g=MeshBuilder.CreateGround('park ground',{width:w,height:d,subdivisions:1},this.scene);g.position.set(x,-.035,z);g.material=mat;g.receiveShadows=true;g.isPickable=false;
   const vs=g.getVerticesData(VertexBuffer.PositionKind)!;const uv=g.getVerticesData(VertexBuffer.UVKind)!;for(let i=0;i<vs.length/3;i++){uv[i*2]=(vs[i*3]+x+90)/180;uv[i*2+1]=(vs[i*3+2]+z+90)/180;}g.setVerticesData(VertexBuffer.UVKind,uv);this.meshes.push(g);
  }
  const water=MeshBuilder.CreateGround('slow canal water',{width:11.2,height:44.8,subdivisions:32},this.scene);water.position.set(0,-.38,11);water.isPickable=false;
  const wm=new ShaderMaterial('wind rippled canal',this.scene,{
   vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 world;uniform mat4 worldViewProjection;uniform float time;varying vec2 vUV;varying vec3 wp;varying vec3 wn;
   void main(){vec3 p=position;float a=p.x*1.7+p.z*.65+time*1.9;float b=p.z*2.2-time*.9;p.y+=sin(a)*.016+sin(b)*.009;wn=normalize(vec3(-cos(a)*.0272,1.,-cos(a)*.0104-cos(b)*.0198));vUV=uv;wp=(world*vec4(p,1.)).xyz;gl_Position=worldViewProjection*vec4(p,1.);}`,
   fragmentSource:`precision highp float;varying vec2 vUV;varying vec3 wp;varying vec3 wn;uniform vec3 cameraPosition;uniform float time;
   void main(){vec3 eye=normalize(cameraPosition-wp);vec3 n=normalize(wn);vec3 reflected=reflect(-eye,n);float fresnel=.035+.68*pow(1.-max(0.,dot(n,eye)),5.);float horizon=pow(max(0.,reflected.y),.55);vec3 sky=mix(vec3(.59,.66,.66),vec3(.27,.40,.52),horizon);float cloud=sin(reflected.x*8.+sin(reflected.z*7.)*1.8)*sin(reflected.z*11.-reflected.x*2.);sky=mix(sky,vec3(.78,.79,.73),smoothstep(-.4,.5,cloud)*.22);float wave=sin(wp.x*3.7+wp.z*1.6+time*.8)*sin(wp.z*4.1-time*.7);vec3 body=vec3(.115,.185,.16)+wave*.009;vec3 c=mix(body,sky,fresnel);vec3 halfVector=normalize(eye+normalize(vec3(.55,.85,-.35)));float light=pow(max(0.,dot(n,halfVector)),180.);c+=vec3(.70,.59,.38)*light*.24;float edge=smoothstep(0.,.035,min(vUV.x,1.-vUV.x));c=mix(vec3(.14,.17,.105),c,edge);gl_FragColor=vec4(c,1.);}`
  },{attributes:['position','uv'],uniforms:['world','worldViewProjection','time','cameraPosition']});water.material=wm;this.waterMaterial=wm;this.meshes.push(water);
 }
 private createGrass(){
  // Authored meadow islands leave paths, canal and approach corridors unobstructed.
  const blade=MeshBuilder.CreatePlane('grass blade',{width:.10,height:.37,sideOrientation:Mesh.DOUBLESIDE},this.scene);blade.bakeTransformIntoVertices(Matrix.Translation(0,.185,0));
  const pieces:Mesh[]=[];let seed=812;const rnd=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(const [cx,cz,r] of [[-22,-10,6],[21,2,6],[-28,13,7],[27,13,6],[-17,-17,3],[17,-13,4]])for(let i=0;i<160;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*r;const p=blade.clone('meadow blade')!;p.position.set(cx+Math.cos(a)*d,0,cz+Math.sin(a)*d);p.rotation.y=rnd()*Math.PI;p.scaling.y=.7+rnd()*.7;pieces.push(p);}
  blade.dispose();const merged=Mesh.MergeMeshes(pieces,true,true)!;merged.name='meadow grasses';const gm=new ShaderMaterial('wind-combed meadow',this.scene,{vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;uniform float time;varying vec2 vUV;varying float variation;void main(){vec3 p=position;float h=max(0.,p.y);p.x+=sin(time*1.2+p.x*.47+p.z*.29)*h*h*.24;p.z+=cos(time*.9+p.x*.3)*h*h*.14;vUV=uv;variation=sin(position.x*1.43+position.z)*.06;gl_Position=worldViewProjection*vec4(p,1.);}`,fragmentSource:`precision highp float;varying vec2 vUV;varying float variation;void main(){float halfWidth=.48*(1.-vUV.y*.92);if(abs(vUV.x-.5)>halfWidth)discard;vec3 c=mix(vec3(.20,.24,.095),vec3(.45,.44,.22),vUV.y);c+=variation;gl_FragColor=vec4(c,1.);}`},{attributes:['position','uv'],uniforms:['worldViewProjection','time']});gm.backFaceCulling=false;this.grassMaterial=gm;merged.material=gm;merged.isPickable=false;merged.receiveShadows=true;this.meshes.push(merged);
 }
 private createLeaves(){
  const m=new PBRMaterial('fallen copper leaves',this.scene);m.albedoColor=new Color3(.49,.24,.065);m.roughness=1;m.metallic=0;m.backFaceCulling=false;const leaves:Mesh[]=[];
  for(let t=0;t<trees.length;t++){const [x,z]=trees[t];for(let j=0;j<23;j++){const a=j*2.399;const d=.6+(j%8)*.4;const l=MeshBuilder.CreateDisc('ground leaf',{radius:.09,tessellation:5},this.scene);l.rotation.x=Math.PI/2;l.rotation.z=a;l.position.set(x+Math.cos(a)*d,.01,z+Math.sin(a)*d);l.material=m;l.isPickable=false;leaves.push(l);}}
  const carpet=Mesh.MergeMeshes(leaves,true,true)!;carpet.name='leaf litter';carpet.material=m;this.meshes.push(carpet);
  for(let i=0;i<12;i++){const l=MeshBuilder.CreateDisc('wind leaf',{radius:.065,tessellation:5,sideOrientation:Mesh.DOUBLESIDE},this.scene);l.material=m;l.isPickable=false;l.position.set(Math.sin(i*2.1)*24,1+i%4,Math.cos(i)*22);this.leaves.push(l);this.meshes.push(l);}
 }
 groundHeight(x:number,z:number):number {if(x>-7.6&&x<7.6&&z>7.4&&z<10.6)return 1.13;if(x>-5.6&&x<5.6&&z>-11.4&&z<33.4)return -.38;return 0;}
 /** Resolve foot support only near the existing contact, so leaving a branch causes a fall. */
 supportHeight(x:number,z:number,footY:number):number|null {
  let support:number|null=null;
  const consider=(height:number)=>{if(Math.abs(height-footY)<.6&&(support===null||height>support))support=height;};
  consider(this.groundHeight(x,z));
  for(const [cx,cz,w,d,h] of houses){if(Math.abs(x-cx)<=w/2+.25&&Math.abs(z-cz)<=d/2+.25)consider(h+3.1*(1-Math.abs(x-cx)/(w/2+.25))+.025);}
  for(const [cx,cz,w,d,h] of houses){if(Math.abs(x-(cx+w*.27))<.5&&Math.abs(z-(cz+.7))<.5)consider(h+3.5);}
  for(const [cx,cz] of [[39,-24],[-24,-39]]){if(Math.abs(x-cx)<.7&&z>cz-1.2&&z<cz+.8)consider(1.395);else if(Math.abs(x-cx)<.95&&Math.abs(z-cz)<2)consider(.98);}
  // Foot contacts follow narrow branch axes, rather than invisible circular platforms.
  const home=this.perches.find(p=>p.id==='home');
  if(home&&x>=-3.95&&x<=1.95&&Math.abs(z+15)<.15){const u=(x+4)/6;consider(7.6+u*.6+(.17-u*.11)+(home.position.y-8.10));}
  for(let i=0;i<trees.length;i++){const [cx,cz,h]=trees[i],ax=cx+.2,az=cz,bx=cx+Math.cos(i)*2.7,bz=cz+Math.sin(i)*2.7,dx=bx-ax,dz=bz-az;const u=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz);if(u>=0&&u<=1&&Math.hypot(x-(ax+dx*u),z-(az+dz*u))<.15)consider(h*.55-.8+u*3.1+.15*(1-u)+.045*u);}
  for(const perch of this.perches){if(perch.kind==='roof'||perch.id==='home'||(perch.kind==='branch'&&perch.id.startsWith('branch-')))continue;if(Math.hypot(x-perch.position.x,z-perch.position.z)<=perch.radius)consider(perch.position.y);}
  return support;
 }
 /** Highest surface crossed by the feet during a descent; no acquisition from below. */
 landingHeight(x:number,z:number,fromY:number,toY:number):number|null {
  if(toY>fromY)return null;
  let surface:number|null=null;
  const consider=(y:number)=>{if(y<=fromY+.025&&y>=toY-.025&&(surface===null||y>surface))surface=y;};
  consider(this.groundHeight(x,z));
  for(const [cx,cz,w,d,h] of houses){
   if(Math.abs(x-cx)<=w/2+.25&&Math.abs(z-cz)<=d/2+.25)consider(h+3.1*(1-Math.abs(x-cx)/(w/2+.25))+.025);
   if(Math.abs(x-(cx+w*.27))<.5&&Math.abs(z-(cz+.7))<.5)consider(h+3.5);
  }
  for(const [cx,cz] of [[39,-24],[-24,-39]]){if(Math.abs(x-cx)<.7&&z>cz-1.2&&z<cz+.8)consider(1.395);else if(Math.abs(x-cx)<.95&&Math.abs(z-cz)<2)consider(.98);}
  // Narrow sites need an intentional approach and stay in the auto-perch system.
  return surface;
 }
 /** Swept conservative AABB collision. Mutates position out of the collider; impact is the correction distance, not velocity. */
 resolve(position:Vector3,previous:Vector3,radius:number):{normal:Vector3,impact:number}|null {
  let last:null|{normal:Vector3,impact:number}=null;
  for(const c of this.colliders){const min=c.min.subtractFromFloats(radius,radius,radius),max=c.max.add(new Vector3(radius,radius,radius));
   if(position.x>min.x&&position.x<max.x&&position.y>min.y&&position.y<max.y&&position.z>min.z&&position.z<max.z){
    const sides=[{d:position.x-min.x,n:new Vector3(-1,0,0),axis:'x',v:min.x},{d:max.x-position.x,n:new Vector3(1,0,0),axis:'x',v:max.x},{d:position.y-min.y,n:new Vector3(0,-1,0),axis:'y',v:min.y},{d:max.y-position.y,n:new Vector3(0,1,0),axis:'y',v:max.y},{d:position.z-min.z,n:new Vector3(0,0,-1),axis:'z',v:min.z},{d:max.z-position.z,n:new Vector3(0,0,1),axis:'z',v:max.z}];
    sides.sort((a,b)=>a.d-b.d);const s=sides.find(s=>(previous[s.axis as 'x'|'y'|'z']-s.v)*s.n[s.axis as 'x'|'y'|'z']>=0)||sides[0];position[s.axis as 'x'|'y'|'z']=s.v;last={normal:s.n,impact:s.d};
   } else if(!(previous.x>min.x&&previous.x<max.x&&previous.y>min.y&&previous.y<max.y&&previous.z>min.z&&previous.z<max.z)) {
    const delta=position.subtract(previous);let entry=0,exit=1,normal=Vector3.Zero(),valid=true;
    for(const axis of ['x','y','z'] as const){const speed=delta[axis];if(Math.abs(speed)<.000001){if(previous[axis]<min[axis]||previous[axis]>max[axis]){valid=false;break;}continue;}let a=(min[axis]-previous[axis])/speed,b=(max[axis]-previous[axis])/speed;if(a>b){const swap=a;a=b;b=swap;}if(a>entry){entry=a;normal=Vector3.Zero();normal[axis]=speed>0?-1:1;}exit=Math.min(exit,b);if(entry>exit){valid=false;break;}}
    if(valid&&entry>0&&entry<1&&normal.lengthSquared()>0){const impact=delta.length()*(1-entry);position.copyFrom(previous.add(delta.scale(entry)).add(normal.scale(.002)));last={normal,impact};}
   }
  }
  return last;
 }
 update(dt:number,time:number,crowPosition:Vector3):void {
  this.time=time;
  const home=this.perches[0];if(this.branch&&this.branchRest&&home){const weight=Vector3.DistanceSquared(crowPosition,home.position)<1.3?-.055:0;this.bendVelocity+=(weight-this.bend)*dt*22;this.bendVelocity*=Math.exp(-dt*4);this.bend+=this.bendVelocity*dt;this.branch.position.y=this.branchRest.y+this.bend+Math.sin(time*.65)*.01;home.position.y=8.10+this.bend+Math.sin(time*.65)*.01;}
  this.waterMaterial?.setFloat('time',time);if(this.scene.activeCamera)this.waterMaterial?.setVector3('cameraPosition',this.scene.activeCamera.globalPosition);this.grassMaterial?.setFloat('time',time);
  for(let i=0;i<this.canopies.length;i++){const c=this.canopies[i];const r=this.canopyRest.get(c)!;const gust=Math.sin(time*.63+i*.7)*.5+Math.sin(time*1.43+i*.23)*.22;c.position.x=r.x+gust*.065;c.rotation.z=gust*.012;c.rotation.x=Math.sin(time*.83+i)*.006;}
  for(let i=0;i<this.leaves.length;i++){const l=this.leaves[i];const d=Vector3.DistanceSquared(l.position,crowPosition);l.position.x+=dt*(.5+Math.sin(time+i)*.15+(d<2?1.2:0));l.position.z+=Math.sin(time*1.5+i)*dt*.15;l.position.y=Math.max(.2,1.3+Math.sin(time*.7+i)*.7);l.rotation.x+=dt;l.rotation.y+=dt*.8;if(l.position.x>32)l.position.x=-32;}
 }
 clearCameraView(cameraPosition:Vector3):void{for(const crown of this.canopies){crown.computeWorldMatrix(true);crown.setEnabled(Vector3.DistanceSquared(crown.getAbsolutePosition(),cameraPosition)>10);}}
 dispose(){this.meshes.forEach(m=>m.dispose());this.waterMaterial?.dispose();}
}

