import { Color3, Color4, InstancedMesh, Mesh, MeshBuilder, PBRMaterial, Scene, SceneLoader, ShaderMaterial, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

type Chunk={key:string;cx:number;cz:number;root:TransformNode;instances:InstancedMesh[];treeCount:number};
type Templates={fir?:Mesh;broad?:Mesh;rock?:Mesh};
type Lake={x:number;z:number;r:number;level:number};
const CHUNK=520;
const HALF_CHUNK=CHUNK*.5;
const LAKE_CELL=1800;
const lakeCache=new Map<string,Lake|null>();

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>t*t*(3-2*t);
function hash(x:number,z:number){let n=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^0x5bf03635)|0;n=Math.imul((n^(n>>>13))|0,1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,z:number){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;const u=smooth(fx),v=smooth(fz);const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);return (a+(b-a)*u)+(c+(d-c)*u-(a+(b-a)*u))*v;}
function fbm(x:number,z:number){let f=0,a=.55,s=0;for(let i=0;i<5;i++){f+=noise(x,z)*a;s+=a;x*=2.03;z*=2.03;a*=.5;}return f/s;}
function ridge(x:number,z:number){return 1-Math.abs(fbm(x,z)*2-1);}
export function riverCenter(x:number){return Math.sin(x*.0017)*180+Math.sin(x*.0049+1.4)*55;}
function baseTerrainHeight(x:number,z:number){
  const continental=(fbm(x*.00026,z*.00026)-.46)*120;
  const hills=(fbm(x*.0013,z*.0013)-.5)*58;
  const mountains=Math.pow(clamp(ridge(x*.00072+31,z*.00072-17),0,1),3.1)*235*Math.pow(clamp(fbm(x*.00024+9,z*.00024+13),0,1),1.8);
  const fine=(fbm(x*.006,z*.006)-.5)*9;
  const riverDist=Math.abs(z-riverCenter(x));
  const valley=clamp(1-riverDist/150,0,1);
  const carve=valley*valley*(30+mountains*.42);
  return 56+continental+hills+mountains+fine-carve;
}
function lakeSpec(lx:number,lz:number):Lake|null{
  const key=`${lx}:${lz}`;if(lakeCache.has(key))return lakeCache.get(key)!;
  const chance=hash(lx*79+17,lz*83-31);if(chance<.62){lakeCache.set(key,null);return null;}
  const x=(lx+.18+hash(lx*131+5,lz*101-9)*.64)*LAKE_CELL;
  const z=(lz+.18+hash(lx*67-11,lz*149+3)*.64)*LAKE_CELL;
  const center=baseTerrainHeight(x,z);if(center>155){lakeCache.set(key,null);return null;}
  const r=72+hash(lx*211+7,lz*193-5)*82;
  const lake={x,z,r,level:center-4.5};lakeCache.set(key,lake);return lake;
}
function nearbyLakes(x:number,z:number){const lx=Math.floor(x/LAKE_CELL),lz=Math.floor(z/LAKE_CELL);const out:Lake[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const lake=lakeSpec(lx+dx,lz+dz);if(lake)out.push(lake);}return out;}
export function terrainHeight(x:number,z:number){
  let h=baseTerrainHeight(x,z);
  for(const lake of nearbyLakes(x,z)){const d=Math.hypot(x-lake.x,z-lake.z);if(d<lake.r*1.18){const t=clamp(1-d/(lake.r*1.18),0,1);h=Math.min(h,lake.level-3.8*t*t);}}
  return h;
}
function lakeDistance(x:number,z:number){let d=99999;for(const lake of nearbyLakes(x,z))d=Math.min(d,Math.hypot(x-lake.x,z-lake.z)-lake.r);return d;}
function moistureAt(x:number,z:number){const river=Math.exp(-Math.abs(z-riverCenter(x))/130);const lake=Math.exp(-Math.max(0,lakeDistance(x,z))/120);return clamp(fbm(x*.0007+90,z*.0007-42)*.68+river*.48+lake*.34,0,1);}
function temperatureAt(x:number,z:number,h:number){return clamp(.86-fbm(x*.00035-70,z*.00035+33)*.38-h*.0014,0,1);}
function forestField(x:number,z:number){return fbm(x*.0032+18,z*.0032-67);}
function biomeColor(x:number,z:number,h:number){
  const m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));let c:Color4;
  if(h>220)c=new Color4(.48,.49,.44,1);
  else if(h>160)c=new Color4(.52,.55,.39,1);
  else if(riverDist<72)c=new Color4(.58,.57,.27,1);
  else if(forest>.63)c=new Color4(.31,.50,.21,1);
  else if(forest<.36)c=new Color4(.62,.69,.31,1);
  else if(m>.73&&t>.35)c=new Color4(.34,.55,.27,1);
  else if(m>.50)c=new Color4(.44,.61,.29,1);
  else if(t<.34)c=new Color4(.46,.54,.35,1);
  else c=new Color4(.57,.65,.31,1);
  const v=(fbm(x*.013+241,z*.013-107)-.5)*.17;
  return new Color4(clamp(c.r+v,0,1),clamp(c.g+v*.88,0,1),clamp(c.b+v*.38,0,1),1);
}

const waterVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform float time;varying vec3 vPos;void main(){vec3 p=position;p.y+=sin(p.x*.045+time*1.25)*.22+sin(p.z*.06-time*.8)*.14;vPos=p;gl_Position=worldViewProjection*vec4(p,1.0);}`;
const waterFragment=`precision highp float;varying vec3 vPos;uniform float time;uniform vec3 cameraPosition;void main(){vec3 n=normalize(vec3(-.12*cos(vPos.x*.045+time*1.25),1.0,-.09*cos(vPos.z*.06-time*.8)));vec3 v=normalize(cameraPosition-vPos);float f=pow(1.0-max(dot(n,v),0.0),3.0);float ripple=.5+.5*sin(vPos.x*.055+vPos.z*.028+time*1.4);vec3 shallow=vec3(.15,.55,.58),deep=vec3(.035,.24,.34);vec3 c=mix(shallow,deep,.38)+f*vec3(.48,.62,.64)+ripple*.022;gl_FragColor=vec4(c,.96);}`;

export class WorldStreamer{
  readonly scene:Scene; readonly chunks=new Map<string,Chunk>(); readonly water:ShaderMaterial; readonly templates:Templates={};
  private terrainMaterial:StandardMaterial; private fallbackFir:Mesh; private fallbackBroad:Mesh; private fallbackRock:Mesh; private fallbackFlower:Mesh; private quality=1; private lastCenter=''; private nextChunkBuild=0;
  constructor(scene:Scene){
    this.scene=scene;
    this.terrainMaterial=new StandardMaterial('terrainMat',scene);this.terrainMaterial.diffuseColor=Color3.White();this.terrainMaterial.specularColor=new Color3(.025,.032,.018);this.terrainMaterial.specularPower=18;this.terrainMaterial.backFaceCulling=false;this.terrainMaterial.emissiveColor=new Color3(.045,.056,.027);
    this.water=new ShaderMaterial('naturalWater',scene,{vertexSource:waterVertex,fragmentSource:waterFragment},{attributes:['position'],uniforms:['worldViewProjection','time','cameraPosition'],needAlphaBlending:true});this.water.backFaceCulling=false;this.water.alpha=.96;
    this.fallbackFir=this.makeFir('fallbackFir',new Color3(.08,.23,.10));this.fallbackBroad=this.makeBroad('fallbackBroad',new Color3(.28,.43,.14));this.fallbackRock=this.makeRock('fallbackRock');this.fallbackFlower=this.makeFlower('fallbackFlower');
    this.fallbackFir.position.y=this.fallbackBroad.position.y=this.fallbackRock.position.y=this.fallbackFlower.position.y=-2000;
    void this.loadTemplates();
  }
  setQuality(q:number){this.quality=clamp(q,.55,1);}
  heightAt(x:number,z:number){return terrainHeight(x,z);}
  get instanceCount(){let count=0;for(const [,chunk] of this.chunks)count+=chunk.instances.length;return count;}
  get treeCount(){let count=0;for(const [,chunk] of this.chunks)count+=chunk.treeCount;return count;}
  async loadTemplates(){try{const r=await SceneLoader.ImportMeshAsync(null,'./models/','biome_props.glb',this.scene);for(const m of r.meshes){if(!(m instanceof Mesh))continue;if(m.name.includes('Fir'))this.templates.fir=m;else if(m.name.includes('Broad'))this.templates.broad=m;else if(m.name.includes('Rock'))this.templates.rock=m;m.position.y=-3000;m.isPickable=false;} }catch{ /* procedural fallbacks keep the world complete offline */ }}
  update(position:Vector3,time:number){
    const cx=Math.floor((position.x+HALF_CHUNK)/CHUNK),cz=Math.floor((position.z+HALF_CHUNK)/CHUNK),center=`${cx}:${cz}`;
    this.water.setFloat('time',time);this.water.setVector3('cameraPosition',this.scene.activeCamera?.position??position);
    const wanted=new Set<string>();const radius=this.quality>.78?2:1;
    const queue:{cx:number;cz:number;dist:number}[]=[];
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const key=`${cx+dx}:${cz+dz}`;wanted.add(key);if(!this.chunks.has(key))queue.push({cx:cx+dx,cz:cz+dz,dist:Math.hypot(dx,dz)});}
    queue.sort((a,b)=>a.dist-b.dist);
    if(queue.length&&time>=this.nextChunkBuild){const budget=this.chunks.size===0?4:1;for(const q of queue.slice(0,budget))this.createChunk(q.cx,q.cz,q.dist<1.2);this.nextChunkBuild=time+.045;}
    if(center!==this.lastCenter){for(const [key,ch] of this.chunks)if(!wanted.has(key)){ch.root.dispose(false,true);for(const i of ch.instances)i.dispose();this.chunks.delete(key);}this.lastCenter=center;}
  }
  private createChunk(cx:number,cz:number,near:boolean){
    const key=`${cx}:${cz}`;if(this.chunks.has(key))return;
    const root=new TransformNode(`chunk_${cx}_${cz}`,this.scene);const grid=near?(this.quality>.8?31:25):17;const positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];const baseX=cx*CHUNK,baseZ=cz*CHUNK;
    for(let z=0;z<grid;z++)for(let x=0;x<grid;x++){const wx=baseX+(x/(grid-1)-.5)*CHUNK,wz=baseZ+(z/(grid-1)-.5)*CHUNK,h=terrainHeight(wx,wz);positions.push(wx,h,wz);const c=biomeColor(wx,wz,h);colors.push(c.r,c.g,c.b,1);}
    for(let z=0;z<grid-1;z++)for(let x=0;x<grid-1;x++){const a=z*grid+x,b=a+1,c=a+grid,d=c+1;indices.push(a,c,b,b,c,d);}
    VertexData.ComputeNormals(positions,indices,normals);const mesh=new Mesh(`terrain_${key}`,this.scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.colors=colors;vd.applyToMesh(mesh);mesh.material=this.terrainMaterial;mesh.useVertexColors=true;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;mesh.freezeWorldMatrix();
    const riverOwnerCz=Math.floor((riverCenter(baseX)+HALF_CHUNK)/CHUNK);if(cz===riverOwnerCz){const river=this.createRiver(cx);river.parent=root;}
    this.createLakes(cx,cz,root);
    const instances:InstancedMesh[]=[];const treeCount=this.scatter(cx,cz,instances,near?1:.32);
    this.chunks.set(key,{key,cx,cz,root,instances,treeCount});
  }
  private createRiver(cx:number){const seg=34;const positions:number[]=[],indices:number[]=[];const x0=cx*CHUNK-HALF_CHUNK;for(let i=0;i<seg;i++){const x=x0+i/(seg-1)*CHUNK;const z=riverCenter(x);const h=terrainHeight(x,z)+3.2;const half=40+noise(x*.01,cx)*22;positions.push(x,h,z-half,x,h,z+half);if(i<seg-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const mesh=new Mesh(`river_${cx}`,this.scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.alwaysSelectAsActiveMesh=false;mesh.receiveShadows=false;mesh.isPickable=false;return mesh;}
  private createLakes(cx:number,cz:number,root:TransformNode){const minX=cx*CHUNK-HALF_CHUNK,maxX=cx*CHUNK+HALF_CHUNK,minZ=cz*CHUNK-HALF_CHUNK,maxZ=cz*CHUNK+HALF_CHUNK;const l0=Math.floor(minX/LAKE_CELL)-1,l1=Math.floor(maxX/LAKE_CELL)+1,z0=Math.floor(minZ/LAKE_CELL)-1,z1=Math.floor(maxZ/LAKE_CELL)+1;for(let lz=z0;lz<=z1;lz++)for(let lx=l0;lx<=l1;lx++){const lake=lakeSpec(lx,lz);if(!lake||lake.x<minX||lake.x>=maxX||lake.z<minZ||lake.z>=maxZ)continue;const seg=40,positions=[lake.x,lake.level+.12,lake.z],indices:number[]=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;positions.push(lake.x+Math.cos(a)*lake.r,lake.level+.12,lake.z+Math.sin(a)*lake.r);if(i>0)indices.push(0,i,i+1);}const mesh=new Mesh(`lake_${lx}_${lz}`,this.scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.parent=root;mesh.isPickable=false;}}
  private scatter(cx:number,cz:number,out:InstancedMesh[],density:number){
    const count=Math.floor(380*this.quality*density),baseX=cx*CHUNK,baseZ=cz*CHUNK;let treeCount=0;
    for(let i=0;i<count;i++){
      const r=hash(cx*97+i,cz*131-i),r2=hash(cx*173-i,cz*67+i),x=baseX+(r-.5)*CHUNK,z=baseZ+(r2-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z);
      if(Math.abs(z-riverCenter(x))<48||lakeDistance(x,z)<20||h>235)continue;
      const densityGate=clamp(.28+forest*.94+(m-.5)*.25,.20,.98);if(hash(i*31+cx*7,cz*29-i*3)>densityGate)continue;
      const choice=hash(i+cx*11,cz*17);let template:Mesh;
      if(choice<.18)template=this.templates.fir||this.fallbackFir;
      else if(choice<.36)template=this.templates.broad||this.fallbackBroad;
      else if(choice<.65)template=this.fallbackFir;
      else if(choice<.94)template=this.fallbackBroad;
      else template=this.templates.rock||this.fallbackRock;
      const inst=template.createInstance(`veg_${cx}_${cz}_${i}`);inst.position.set(x,h,z);const isRock=template===this.fallbackRock||template===this.templates.rock;const s=isRock?.9+hash(i*3+cx,cz-i*9)*1.55:1.30+hash(i*3+cx,cz-i*9)*1.70;inst.scaling.setAll(s);inst.rotation.y=hash(cx-i,cz+i)*Math.PI*2;if(!isRock&&m<.28)inst.scaling.scaleInPlace(.82);inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);if(!isRock)treeCount++;
    }
    if(density>=.5){const flowers=Math.floor(160*this.quality);for(let i=0;i<flowers;i++){const x=baseX+(hash(cx*233+i,cz*181-i)-.5)*CHUNK,z=baseZ+(hash(cx*199-i,cz*239+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z);if(h>175||m<.28||Math.abs(z-riverCenter(x))<28||lakeDistance(x,z)<10)continue;const inst=this.fallbackFlower.createInstance(`flower_${cx}_${cz}_${i}`);inst.position.set(x,h+.05,z);const s=.8+hash(i*17+cx,cz*13-i)*1.45;inst.scaling.setAll(s);inst.rotation.y=hash(cx+i*5,cz-i*3)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);}}
    return treeCount;
  }
  private makeFir(name:string,color:Color3){const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:8,diameterTop:.7,diameterBottom:1.15,tessellation:7},this.scene);const crown=MeshBuilder.CreateCylinder(`${name}_crown`,{height:10.5,diameterTop:.45,diameterBottom:6.4,tessellation:8},this.scene);crown.position.y=6.1;const tm=new StandardMaterial(`${name}m`,this.scene);tm.diffuseColor=new Color3(.34,.20,.09);trunk.material=tm;const cm=new StandardMaterial(`${name}c`,this.scene);cm.diffuseColor=color;cm.emissiveColor=color.scale(.035);crown.material=cm;const merged=Mesh.MergeMeshes([trunk,crown],true,true,undefined,false,true)!;merged.name=name;return merged;}
  private makeBroad(name:string,color:Color3){const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:7.5,diameterTop:.9,diameterBottom:1.45,tessellation:8},this.scene);const crown=MeshBuilder.CreateIcoSphere(`${name}_crown`,{radius:4.8,subdivisions:2},this.scene);crown.scaling.y=1.20;crown.position.y=7.1;const tm=new StandardMaterial(`${name}m`,this.scene);tm.diffuseColor=new Color3(.35,.20,.10);trunk.material=tm;const cm=new StandardMaterial(`${name}c`,this.scene);cm.diffuseColor=color;cm.emissiveColor=color.scale(.03);crown.material=cm;const merged=Mesh.MergeMeshes([trunk,crown],true,true,undefined,false,true)!;merged.name=name;return merged;}
  private makeRock(name:string){const rock=MeshBuilder.CreateIcoSphere(name,{radius:2.2,subdivisions:2},this.scene);rock.scaling.set(1.7,.7,1.15);const m=new PBRMaterial(`${name}m`,this.scene);m.albedoColor=new Color3(.42,.43,.38);m.roughness=.95;rock.material=m;return rock;}
  private makeFlower(name:string){const stem=MeshBuilder.CreateCylinder(`${name}_stem`,{height:1.25,diameter:.12,tessellation:5},this.scene);stem.position.y=.62;const bloom=MeshBuilder.CreateIcoSphere(`${name}_bloom`,{radius:.38,subdivisions:1},this.scene);bloom.position.y=1.35;const sm=new StandardMaterial(`${name}_sm`,this.scene);sm.diffuseColor=new Color3(.22,.47,.18);stem.material=sm;const bm=new StandardMaterial(`${name}_bm`,this.scene);bm.diffuseColor=new Color3(.96,.66,.20);bm.emissiveColor=new Color3(.14,.075,.014);bloom.material=bm;const merged=Mesh.MergeMeshes([stem,bloom],true,true,undefined,false,true)!;merged.name=name;return merged;}
}
