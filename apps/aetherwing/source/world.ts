import { Color3, Color4, InstancedMesh, Mesh, MeshBuilder, PBRMaterial, Scene, SceneLoader, ShaderMaterial, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

type Chunk={key:string;cx:number;cz:number;root:TransformNode;instances:InstancedMesh[]};
type Templates={fir?:Mesh;broad?:Mesh;rock?:Mesh};
const CHUNK=520;
const HALF_CHUNK=CHUNK*.5;

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>t*t*(3-2*t);
function hash(x:number,z:number){let n=(x*374761393+z*668265263)^0x5bf03635;n=(n^(n>>13))*1274126177;return ((n^(n>>16))>>>0)/4294967295;}
function noise(x:number,z:number){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;const u=smooth(fx),v=smooth(fz);const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);return (a+(b-a)*u)+(c+(d-c)*u-(a+(b-a)*u))*v;}
function fbm(x:number,z:number){let f=0,a=.55,s=0;for(let i=0;i<5;i++){f+=noise(x,z)*a;s+=a;x*=2.03;z*=2.03;a*=.5;}return f/s;}
function ridge(x:number,z:number){return 1-Math.abs(fbm(x,z)*2-1);}
export function riverCenter(x:number){return Math.sin(x*.0017)*180+Math.sin(x*.0049+1.4)*55;}
export function terrainHeight(x:number,z:number){
  const continental=(fbm(x*.00026,z*.00026)-.46)*120;
  const hills=(fbm(x*.0013,z*.0013)-.5)*58;
  const mountains=Math.pow(clamp(ridge(x*.00072+31,z*.00072-17),0,1),3.1)*235*Math.pow(clamp(fbm(x*.00024+9,z*.00024+13),0,1),1.8);
  const fine=(fbm(x*.006,z*.006)-.5)*9;
  const riverDist=Math.abs(z-riverCenter(x));
  const valley=clamp(1-riverDist/150,0,1);
  const carve=valley*valley*(30+mountains*.42);
  return 56+continental+hills+mountains+fine-carve;
}
function moistureAt(x:number,z:number){const river=Math.exp(-Math.abs(z-riverCenter(x))/130);return clamp(fbm(x*.0007+90,z*.0007-42)*.72+river*.55,0,1);}
function temperatureAt(x:number,z:number,h:number){return clamp(.86-fbm(x*.00035-70,z*.00035+33)*.38-h*.0014,0,1);}
function biomeColor(x:number,z:number,h:number){const m=moistureAt(x,z),t=temperatureAt(x,z,h);if(h>220)return new Color4(.31,.34,.31,1);if(h>160)return new Color4(.40,.43,.34,1);if(m>.68&&t>.35)return new Color4(.23,.39,.24,1);if(m>.48)return new Color4(.34,.48,.27,1);if(t<.34)return new Color4(.35,.42,.31,1);return new Color4(.48,.54,.29,1);}

const waterVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform float time;varying vec3 vPos;void main(){vec3 p=position;p.y+=sin(p.x*.045+time*1.25)*.32+sin(p.z*.06-time*.8)*.18;vPos=p;gl_Position=worldViewProjection*vec4(p,1.0);}`;
const waterFragment=`precision highp float;varying vec3 vPos;uniform float time;uniform vec3 cameraPosition;void main(){vec3 n=normalize(vec3(-.14*cos(vPos.x*.045+time*1.25),1.0,-.11*cos(vPos.z*.06-time*.8)));vec3 v=normalize(cameraPosition-vPos);float f=pow(1.0-max(dot(n,v),0.0),3.0);vec3 shallow=vec3(.10,.35,.38),deep=vec3(.035,.16,.22);vec3 c=mix(shallow,deep,.45)+f*vec3(.42,.55,.52);gl_FragColor=vec4(c,.78);}`;

export class WorldStreamer{
  readonly scene:Scene; readonly chunks=new Map<string,Chunk>(); readonly water:ShaderMaterial; readonly templates:Templates={};
  private terrainMaterial:StandardMaterial; private fallbackFir:Mesh; private fallbackBroad:Mesh; private fallbackRock:Mesh; private quality=1; private lastCenter=''; private nextChunkBuild=0;
  constructor(scene:Scene){
    this.scene=scene;
    this.terrainMaterial=new StandardMaterial('terrainMat',scene);this.terrainMaterial.diffuseColor=new Color3(.73,.79,.58);this.terrainMaterial.specularColor=new Color3(.04,.05,.03);this.terrainMaterial.specularPower=24;
    this.water=new ShaderMaterial('riverWater',scene,{vertexSource:waterVertex,fragmentSource:waterFragment},{attributes:['position'],uniforms:['worldViewProjection','time','cameraPosition'],needAlphaBlending:true});this.water.backFaceCulling=false;this.water.alpha=.82;
    this.fallbackFir=this.makeFir('fallbackFir',new Color3(.13,.31,.18));this.fallbackBroad=this.makeBroad('fallbackBroad',new Color3(.23,.42,.21));this.fallbackRock=this.makeRock('fallbackRock');
    this.fallbackFir.position.y=this.fallbackBroad.position.y=this.fallbackRock.position.y=-2000;
    void this.loadTemplates();
  }
  setQuality(q:number){this.quality=clamp(q,.55,1);}
  heightAt(x:number,z:number){return terrainHeight(x,z);}
  async loadTemplates(){try{const r=await SceneLoader.ImportMeshAsync(null,'./models/','biome_props.glb',this.scene);for(const m of r.meshes){if(!(m instanceof Mesh))continue;if(m.name.includes('Fir'))this.templates.fir=m;else if(m.name.includes('Broad'))this.templates.broad=m;else if(m.name.includes('Rock'))this.templates.rock=m;m.position.y=-3000;} }catch{ /* coloured procedural fallbacks keep the world valid if an authored prop fails */ }}
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
    const root=new TransformNode(`chunk_${cx}_${cz}`,this.scene);const grid=near?(this.quality>.8?25:21):15;const positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];const baseX=cx*CHUNK,baseZ=cz*CHUNK;
    for(let z=0;z<grid;z++)for(let x=0;x<grid;x++){const wx=baseX+(x/(grid-1)-.5)*CHUNK,wz=baseZ+(z/(grid-1)-.5)*CHUNK,h=terrainHeight(wx,wz);positions.push(wx,h,wz);const c=biomeColor(wx,wz,h);colors.push(c.r,c.g,c.b,1);}
    for(let z=0;z<grid-1;z++)for(let x=0;x<grid-1;x++){const a=z*grid+x,b=a+1,c=a+grid,d=c+1;indices.push(a,c,b,b,c,d);}
    VertexData.ComputeNormals(positions,indices,normals);const mesh=new Mesh(`terrain_${key}`,this.scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.colors=colors;vd.applyToMesh(mesh);mesh.material=this.terrainMaterial;mesh.useVertexColors=true;mesh.receiveShadows=true;mesh.parent=root;mesh.freezeWorldMatrix();
    const riverOwnerCz=Math.floor((riverCenter(baseX)+HALF_CHUNK)/CHUNK);if(cz===riverOwnerCz){const river=this.createRiver(cx);river.parent=root;}
    const instances:InstancedMesh[]=[];if(near)this.scatter(cx,cz,instances);
    this.chunks.set(key,{key,cx,cz,root,instances});
  }
  private createRiver(cx:number){const seg=20;const positions:number[]=[],indices:number[]=[];const x0=cx*CHUNK-HALF_CHUNK;for(let i=0;i<seg;i++){const x=x0+i/(seg-1)*CHUNK;const z=riverCenter(x);const h=terrainHeight(x,z)+3.4;const half=23+noise(x*.01,cx)*12;positions.push(x,h,z-half,x,h,z+half);if(i<seg-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const mesh=new Mesh(`river_${cx}`,this.scene);const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.alwaysSelectAsActiveMesh=false;return mesh;}
  private scatter(cx:number,cz:number,out:InstancedMesh[]){const count=Math.floor(34*this.quality);const baseX=cx*CHUNK,baseZ=cz*CHUNK;for(let i=0;i<count;i++){const r=hash(cx*97+i,cz*131-i);const r2=hash(cx*173-i,cz*67+i);const x=baseX+(r-.5)*CHUNK,z=baseZ+(r2-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z);if(Math.abs(z-riverCenter(x))<34||h>225)continue;const choice=hash(i+cx*11,cz*17);const template=(choice<.58?(this.templates.fir||this.fallbackFir):choice<.88?(this.templates.broad||this.fallbackBroad):(this.templates.rock||this.fallbackRock));const inst=template.createInstance(`veg_${cx}_${cz}_${i}`);inst.position.set(x,h,z);const s=.7+hash(i*3+cx,cz-i*9)*1.25;inst.scaling.setAll(s);inst.rotation.y=hash(cx-i,cz+i)*Math.PI*2;if(template!==this.fallbackRock&&m<.28)inst.scaling.scaleInPlace(.7);out.push(inst);}}
  private makeFir(name:string,color:Color3){const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:7,diameterTop:.55,diameterBottom:.9,tessellation:7},this.scene);const crown=MeshBuilder.CreateCylinder(`${name}_crown`,{height:9,diameterTop:.3,diameterBottom:5.2,tessellation:8},this.scene);crown.position.y=5.4;const tm=new StandardMaterial(`${name}m`,this.scene);tm.diffuseColor=new Color3(.24,.14,.08);trunk.material=tm;const cm=new StandardMaterial(`${name}c`,this.scene);cm.diffuseColor=color;crown.material=cm;const merged=Mesh.MergeMeshes([trunk,crown],true,true,undefined,false,true)!;merged.name=name;return merged;}
  private makeBroad(name:string,color:Color3){const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:6,diameterTop:.7,diameterBottom:1.15,tessellation:8},this.scene);const crown=MeshBuilder.CreateIcoSphere(`${name}_crown`,{radius:3.6,subdivisions:2},this.scene);crown.scaling.y=1.25;crown.position.y=5.5;const tm=new StandardMaterial(`${name}m`,this.scene);tm.diffuseColor=new Color3(.28,.16,.09);trunk.material=tm;const cm=new StandardMaterial(`${name}c`,this.scene);cm.diffuseColor=color;crown.material=cm;const merged=Mesh.MergeMeshes([trunk,crown],true,true,undefined,false,true)!;merged.name=name;return merged;}
  private makeRock(name:string){const rock=MeshBuilder.CreateIcoSphere(name,{radius:2.2,subdivisions:2},this.scene);rock.scaling.set(1.7,.7,1.15);const m=new PBRMaterial(`${name}m`,this.scene);m.albedoColor=new Color3(.29,.31,.28);m.roughness=.95;rock.material=m;return rock;}
}
