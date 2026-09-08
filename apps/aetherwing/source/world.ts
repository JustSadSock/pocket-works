import { Color3, Color4, InstancedMesh, Mesh, MeshBuilder, PBRMaterial, Scene, SceneLoader, ShaderMaterial, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

type Chunk={key:string;cx:number;cz:number;root:TransformNode;instances:InstancedMesh[];treeCount:number};
type Templates={fir?:Mesh;broad?:Mesh;rock?:Mesh};
type Lake={x:number;z:number;r:number;level:number};
type PlantKind='firDark'|'firBlue'|'oak'|'aspen'|'rock'|'authoredFir'|'authoredBroad'|'authoredRock';

const CHUNK=520;
const HALF_CHUNK=CHUNK*.5;
const LAKE_CELL=1700;
const lakeCache=new Map<string,Lake|null>();

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>t*t*(3-2*t);
const smoothstep=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return smooth(t);};
const isRockKind=(kind:PlantKind)=>kind==='rock'||kind==='authoredRock';
function hash(x:number,z:number){let n=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^0x5bf03635)|0;n=Math.imul((n^(n>>>13))|0,1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,z:number){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=smooth(fx),v=smooth(fz);const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);const ab=a+(b-a)*u,cd=c+(d-c)*u;return ab+(cd-ab)*v;}
function fbm(x:number,z:number,octaves=5){let f=0,a=.56,s=0;for(let i=0;i<octaves;i++){f+=noise(x,z)*a;s+=a;x*=2.03;z*=2.03;a*=.5;}return f/s;}
function ridge(x:number,z:number){return 1-Math.abs(fbm(x,z)*2-1);}
export function riverCenter(x:number){return Math.sin(x*.0017)*180+Math.sin(x*.0049+1.4)*55;}

function baseTerrainHeight(x:number,z:number){
  const continental=(fbm(x*.00025,z*.00025)-.46)*122;
  const hills=(fbm(x*.00122+17,z*.00122-31)-.5)*64;
  const mountainMask=Math.pow(clamp(fbm(x*.00022-41,z*.00022+57),0,1),1.65);
  const mountains=Math.pow(clamp(ridge(x*.00068+31,z*.00068-17),0,1),3.25)*245*mountainMask;
  const fine=(fbm(x*.0055,z*.0055,4)-.5)*9;
  const riverDist=Math.abs(z-riverCenter(x));
  const valley=clamp(1-riverDist/176,0,1);
  const channel=clamp(1-riverDist/78,0,1);
  const carve=valley*valley*(31+mountains*.40)+Math.pow(channel,1.28)*22;
  return 56+continental+hills+mountains+fine-carve;
}
function lakeSpec(lx:number,lz:number):Lake|null{
  const key=`${lx}:${lz}`;if(lakeCache.has(key))return lakeCache.get(key)!;
  if(hash(lx*79+17,lz*83-31)<.69){lakeCache.set(key,null);return null;}
  const x=(lx+.15+hash(lx*131+5,lz*101-9)*.70)*LAKE_CELL;
  const z=(lz+.15+hash(lx*67-11,lz*149+3)*.70)*LAKE_CELL;
  const center=baseTerrainHeight(x,z);if(center>152){lakeCache.set(key,null);return null;}
  const r=82+hash(lx*211+7,lz*193-5)*118;
  const lake={x,z,r,level:center-3.8};lakeCache.set(key,lake);return lake;
}
function nearbyLakes(x:number,z:number){const lx=Math.floor(x/LAKE_CELL),lz=Math.floor(z/LAKE_CELL),out:Lake[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const lake=lakeSpec(lx+dx,lz+dz);if(lake)out.push(lake);}return out;}
export function terrainHeight(x:number,z:number){let h=baseTerrainHeight(x,z);for(const lake of nearbyLakes(x,z)){const d=Math.hypot(x-lake.x,z-lake.z);if(d<lake.r*1.24){const t=clamp(1-d/(lake.r*1.24),0,1);h=Math.min(h,lake.level-5.4*t*t);}}return h;}
function lakeDistance(x:number,z:number){let d=99999;for(const lake of nearbyLakes(x,z))d=Math.min(d,Math.hypot(x-lake.x,z-lake.z)-lake.r);return d;}
function moistureAt(x:number,z:number){const river=Math.exp(-Math.abs(z-riverCenter(x))/150);const lake=Math.exp(-Math.max(0,lakeDistance(x,z))/150);return clamp(fbm(x*.00066+90,z*.00066-42)*.64+river*.45+lake*.35,0,1);}
function temperatureAt(x:number,z:number,h:number){return clamp(.90-fbm(x*.00034-70,z*.00034+33)*.36-h*.00142,0,1);}
function forestField(x:number,z:number){const broad=fbm(x*.00155+18,z*.00155-67,5);const local=fbm(x*.0045-211,z*.0045+92,3);return broad*.78+local*.22;}
function meadowField(x:number,z:number){return fbm(x*.00245+441,z*.00245-118,4);}
function biomeColor(x:number,z:number,h:number){
  const m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),meadow=meadowField(x,z),riverDist=Math.abs(z-riverCenter(x));let c:Color4;
  if(h>230)c=new Color4(.43,.43,.40,1);
  else if(h>178)c=new Color4(.39,.43,.31,1);
  else if(riverDist<48)c=new Color4(.34,.35,.23,1);
  else if(riverDist<104)c=new Color4(.39,.46,.27,1);
  else if(forest>.64)c=t<.42?new Color4(.22,.34,.24,1):new Color4(.25,.38,.22,1);
  else if(meadow>.60)c=new Color4(.44,.51,.28,1);
  else if(m>.70)c=new Color4(.28,.43,.25,1);
  else if(m>.48)c=new Color4(.35,.46,.27,1);
  else c=new Color4(.42,.47,.29,1);
  const micro=(fbm(x*.011+241,z*.011-107,3)-.5)*.085;
  const warm=(fbm(x*.0028-91,z*.0028+54,3)-.5)*.040;
  return new Color4(clamp(c.r+micro+warm,0,1),clamp(c.g+micro*.72,0,1),clamp(c.b+micro*.28-warm*.25,0,1),1);
}

const waterVertex=`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;uniform float time;varying vec3 vPos;varying vec2 vUv;void main(){vec3 p=position;float w1=sin(p.x*.031+time*.82)*.10;float w2=sin(p.z*.047-time*.59)*.065;float w3=sin((p.x+p.z)*.017-time*.31)*.04;p.y+=w1+w2+w3;vPos=p;vUv=uv;gl_Position=worldViewProjection*vec4(p,1.0);}`;
const waterFragment=`precision highp float;varying vec3 vPos;varying vec2 vUv;uniform float time;uniform vec3 cameraPosition;void main(){float a=vPos.x*.031+time*.67;float b=vPos.z*.047-time*.39;vec3 n=normalize(vec3(-.058*cos(a),1.0,-.048*cos(b)));vec3 v=normalize(cameraPosition-vPos);float fres=pow(1.0-max(dot(n,v),0.0),3.2);float center=clamp(vUv.y,0.0,1.0);float shore=1.0-smoothstep(.05,.38,center);float flow=.5+.5*sin(vUv.x*92.0-time*2.1+sin(vPos.z*.018)*2.0);float fine=.5+.5*sin(vPos.x*.145+vPos.z*.081-time*1.55);vec3 bank=vec3(.16,.30,.27);vec3 shallow=vec3(.060,.27,.31);vec3 deep=vec3(.016,.095,.155);vec3 c=mix(shallow,deep,smoothstep(.20,.92,center));c=mix(c,bank,shore*.25);c+=fres*vec3(.27,.36,.37);c+=(flow*.009+fine*.0045)*(1.0-shore*.55);float foam=shore*shore*(.020+.020*flow);c+=foam*vec3(.70,.75,.68);gl_FragColor=vec4(c,1.0);}`;

export class WorldStreamer{
  readonly scene:Scene;readonly chunks=new Map<string,Chunk>();readonly rivers=new Map<number,Mesh>();readonly water:ShaderMaterial;readonly templates:Templates={};
  private terrainMaterial:StandardMaterial;
  private firDark:Mesh;private firBlue:Mesh;private oak:Mesh;private aspen:Mesh;private rock:Mesh;private flower:Mesh;private shrub:Mesh;
  private quality=1;private lastCenter='';private lastRadius=-1;private nextChunkBuild=0;
  constructor(scene:Scene){
    this.scene=scene;
    this.terrainMaterial=new StandardMaterial('terrainMat',scene);this.terrainMaterial.diffuseColor=Color3.White();this.terrainMaterial.specularColor=new Color3(.010,.013,.008);this.terrainMaterial.specularPower=24;this.terrainMaterial.backFaceCulling=false;this.terrainMaterial.emissiveColor=new Color3(.020,.024,.014);this.terrainMaterial.ambientColor=new Color3(.16,.19,.13);
    this.water=new ShaderMaterial('naturalWater',scene,{vertexSource:waterVertex,fragmentSource:waterFragment},{attributes:['position','uv'],uniforms:['worldViewProjection','time','cameraPosition'],needAlphaBlending:false});this.water.backFaceCulling=false;this.water.alpha=1;
    this.firDark=this.makeFir('firDark',new Color3(.060,.155,.088),0);
    this.firBlue=this.makeFir('firBlue',new Color3(.070,.180,.140),1);
    this.oak=this.makeBroad('oak',new Color3(.125,.245,.090),0);
    this.aspen=this.makeBroad('aspen',new Color3(.175,.285,.105),1);
    this.rock=this.makeRock('fieldRock');this.flower=this.makeFlower('meadowFlower');this.shrub=this.makeShrub('understory');
    for(const m of [this.firDark,this.firBlue,this.oak,this.aspen,this.rock,this.flower,this.shrub]){m.position.y=-2600;m.isPickable=false;}
    void this.loadTemplates();
  }
  setQuality(q:number){this.quality=clamp(q,.55,1);}
  heightAt(x:number,z:number){return terrainHeight(x,z);}
  get instanceCount(){let n=0;for(const [,c] of this.chunks)n+=c.instances.length;return n;}
  get treeCount(){let n=0;for(const [,c] of this.chunks)n+=c.treeCount;return n;}
  get materialsHealthy(){return this.scene.materials.includes(this.terrainMaterial)&&this.scene.materials.includes(this.water);}
  get riverMeshCount(){return this.rivers.size;}
  async loadTemplates(){
    try{
      const r=await SceneLoader.ImportMeshAsync(null,'./models/','biome_props.glb',this.scene);
      for(const m of r.meshes){
        if(!(m instanceof Mesh)||m.getTotalVertices()===0)continue;
        const lower=m.name.toLowerCase();
        if(lower.includes('fir'))this.templates.fir=m;else if(lower.includes('broad'))this.templates.broad=m;else if(lower.includes('rock'))this.templates.rock=m;else continue;
        m.position.y=-3000;m.isPickable=false;m.receiveShadows=true;
        if(m.material instanceof PBRMaterial){
          m.material.roughness=Math.max(m.material.roughness??.86,.86);m.material.metallic=Math.min(m.material.metallic??0,.012);m.material.environmentIntensity=.58;
          if(lower.includes('fir'))m.material.albedoColor=new Color3(.064,.17,.095);else if(lower.includes('broad'))m.material.albedoColor=new Color3(.14,.27,.095);else m.material.albedoColor=new Color3(.32,.33,.30);
          if(m.material.albedoTexture)m.material.albedoTexture.level=.48;
        }
        if(m.material instanceof StandardMaterial){m.material.specularColor=new Color3(.006,.009,.005);if(lower.includes('fir'))m.material.diffuseColor=new Color3(.064,.17,.095);else if(lower.includes('broad'))m.material.diffuseColor=new Color3(.14,.27,.095);else m.material.diffuseColor=new Color3(.32,.33,.30);}
      }
    }catch{/* procedural fallbacks keep the world complete offline */}
  }
  update(position:Vector3,time:number){
    const cx=Math.floor((position.x+HALF_CHUNK)/CHUNK),cz=Math.floor((position.z+HALF_CHUNK)/CHUNK),center=`${cx}:${cz}`;
    this.water.setFloat('time',time);this.water.setVector3('cameraPosition',this.scene.activeCamera?.position??position);
    const wanted=new Set<string>(),queue:{cx:number;cz:number;dist:number}[]=[];const radius=this.quality>.76?2:1;
    const wantedRiverXs=new Set<number>();for(let dx=-radius;dx<=radius;dx++){const rx=cx+dx;wantedRiverXs.add(rx);if(!this.rivers.has(rx))this.rivers.set(rx,this.createRiver(rx));}
    for(const [rx,river] of this.rivers)if(!wantedRiverXs.has(rx)){river.dispose(false,false);this.rivers.delete(rx);}
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const key=`${cx+dx}:${cz+dz}`;wanted.add(key);if(!this.chunks.has(key))queue.push({cx:cx+dx,cz:cz+dz,dist:Math.hypot(dx,dz)});}
    queue.sort((a,b)=>a.dist-b.dist);
    if(queue.length&&time>=this.nextChunkBuild){const budget=this.chunks.size===0?3:1;for(const q of queue.slice(0,budget))this.createChunk(q.cx,q.cz,q.dist<1.25);this.nextChunkBuild=time+.052;}
    if(center!==this.lastCenter||radius!==this.lastRadius){for(const [key,ch] of this.chunks)if(!wanted.has(key)){ch.root.dispose(false,false);this.chunks.delete(key);}this.lastCenter=center;this.lastRadius=radius;}
  }
  private createChunk(cx:number,cz:number,near:boolean){
    const key=`${cx}:${cz}`;if(this.chunks.has(key))return;
    const root=new TransformNode(`chunk_${key}`,this.scene),grid=near?(this.quality>.80?49:37):25,positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];const baseX=cx*CHUNK,baseZ=cz*CHUNK;
    for(let z=0;z<grid;z++)for(let x=0;x<grid;x++){const wx=baseX+(x/(grid-1)-.5)*CHUNK,wz=baseZ+(z/(grid-1)-.5)*CHUNK,h=terrainHeight(wx,wz);positions.push(wx,h,wz);}
    for(let z=0;z<grid-1;z++)for(let x=0;x<grid-1;x++){const a=z*grid+x,b=a+1,c=a+grid,d=c+1;indices.push(a,c,b,b,c,d);}
    VertexData.ComputeNormals(positions,indices,normals);
    for(let i=0;i<positions.length;i+=3){const wx=positions[i],h=positions[i+1],wz=positions[i+2],base=biomeColor(wx,wz,h),ny=clamp(normals[i+1]??1,0,1),slope=smoothstep(.10,.48,1-ny),highRock=smoothstep(170,255,h)*.35,rockMix=clamp(slope*.72+highRock,0,.78);const rock=new Color3(.31,.32,.28),shade=.92+ny*.08;colors.push((base.r*(1-rockMix)+rock.r*rockMix)*shade,(base.g*(1-rockMix)+rock.g*rockMix)*shade,(base.b*(1-rockMix)+rock.b*rockMix)*shade,1);}
    const mesh=new Mesh(`terrain_${key}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.colors=colors;vd.applyToMesh(mesh);mesh.material=this.terrainMaterial;mesh.useVertexColors=true;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;mesh.freezeWorldMatrix();
    this.createLakes(cx,cz,root);
    const instances:InstancedMesh[]=[];const treeCount=this.scatter(cx,cz,root,instances,near?1:.31);this.chunks.set(key,{key,cx,cz,root,instances,treeCount});
  }
  private createRiver(cx:number){
    const seg=112,positions:number[]=[],indices:number[]=[],uvs:number[]=[],x0=cx*CHUNK-HALF_CHUNK;
    for(let i=0;i<seg;i++){
      const u=i/(seg-1),x=x0+u*CHUNK,z=riverCenter(x),h=terrainHeight(x,z)+4.55,half=27+noise(x*.0107,31.7)*17;
      positions.push(x,h,z-half,x,h+.015,z,x,h,z+half);uvs.push(u,0,u,1,u,0);
      if(i<seg-1){const a=i*3,b=a+3;indices.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}
    }
    const mesh=new Mesh(`river_${cx}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.applyToMesh(mesh);mesh.material=this.water;mesh.receiveShadows=false;mesh.isPickable=false;mesh.renderingGroupId=1;return mesh;
  }
  private createLakes(cx:number,cz:number,root:TransformNode){
    const minX=cx*CHUNK-HALF_CHUNK,maxX=cx*CHUNK+HALF_CHUNK,minZ=cz*CHUNK-HALF_CHUNK,maxZ=cz*CHUNK+HALF_CHUNK,l0=Math.floor(minX/LAKE_CELL)-1,l1=Math.floor(maxX/LAKE_CELL)+1,z0=Math.floor(minZ/LAKE_CELL)-1,z1=Math.floor(maxZ/LAKE_CELL)+1;
    for(let lz=z0;lz<=z1;lz++)for(let lx=l0;lx<=l1;lx++){
      const lake=lakeSpec(lx,lz);if(!lake||lake.x<minX||lake.x>=maxX||lake.z<minZ||lake.z>=maxZ)continue;
      const seg=64,positions=[lake.x,lake.level+.24,lake.z],indices:number[]=[],uvs=[0,1];
      for(let i=0;i<=seg;i++){const t=i/seg,a=t*Math.PI*2;positions.push(lake.x+Math.cos(a)*lake.r,lake.level+.24,lake.z+Math.sin(a)*lake.r);uvs.push(t,0);if(i>0)indices.push(0,i,i+1);}
      const mesh=new Mesh(`lake_${lx}_${lz}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.applyToMesh(mesh);mesh.material=this.water;mesh.parent=root;mesh.isPickable=false;mesh.renderingGroupId=1;
    }
  }
  private scatter(cx:number,cz:number,root:TransformNode,out:InstancedMesh[],density:number){
    const baseX=cx*CHUNK,baseZ=cz*CHUNK,far=density<.5,candidates=Math.floor(535*this.quality*density);let trees=0;
    for(let i=0;i<candidates;i++){
      const x=baseX+(hash(cx*97+i,cz*131-i)-.5)*CHUNK,z=baseZ+(hash(cx*173-i,cz*67+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));
      if(riverDist<34||lakeDistance(x,z)<20||h>244)continue;
      const patch=smoothstep(.35,.68,forest),wetBoost=(m-.48)*.24,riparian=riverDist<128?.20:0,gate=clamp(.070+patch*.86+wetBoost+riparian,.052,.95);if(hash(i*31+cx*7,cz*29-i*3)>gate)continue;
      const species=hash(i*19+cx*43,cz*37-i*11),authored=hash(i*53-cx,cz*47+i)<(far?.14:.30);let kind:PlantKind;
      if(riverDist<122&&h<165)kind=species<.58?'aspen':species<.82?'oak':'firDark';
      else if(h>158||t<.38)kind=species<.72?'firBlue':'firDark';
      else if(m>.66)kind=species<.43?'aspen':species<.73?'oak':'firDark';
      else kind=species<.40?'oak':species<.64?'aspen':species<.86?'firDark':'firBlue';
      if(authored)kind=(kind==='oak'||kind==='aspen')?'authoredBroad':'authoredFir';if(hash(i*71+cx,cz-i*17)>.976)kind='authoredRock';
      const template=this.templateFor(kind),inst=template.createInstance(`veg_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h,z);inst.rotation.y=hash(cx*13-i,cz*17+i)*Math.PI*2;
      const age=.70+hash(i*3+cx,cz-i*9)*1.08,slender=.82+hash(i*41-cx,cz+i*23)*.34;
      if(isRockKind(kind))inst.scaling.set(.70+age*.40,.42+age*.32,.68+age*.46);
      else if(kind==='oak'||kind==='authoredBroad')inst.scaling.set(age*1.12,age*(.90+slender*.10),age*1.06);
      else if(kind==='aspen')inst.scaling.set(age*.79,age*(1.14+slender*.16),age*.82);
      else inst.scaling.set(age*.86,age*(1.08+slender*.18),age*.88);
      if(kind==='authoredBroad'||kind==='authoredFir')inst.scaling.scaleInPlace(.96+hash(i*89+cx,cz*97-i)*.15);
      if(far)inst.scaling.scaleInPlace(.92);inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);if(!isRockKind(kind))trees++;
    }
    if(!far){
      const bushes=Math.floor(190*this.quality);for(let i=0;i<bushes;i++){
        const x=baseX+(hash(cx*307+i,cz*257-i)-.5)*CHUNK,z=baseZ+(hash(cx*277-i,cz*313+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));if(h>192||m<.30||riverDist<22||lakeDistance(x,z)<10)continue;
        const edge=1-Math.abs(forest-.57)*3.2;if(hash(i*61+cx,cz-i*43)>.46+clamp(edge,0,1)*.40)continue;
        const inst=this.shrub.createInstance(`shrub_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h+.04,z);const s=.60+hash(i*23+cx,cz*19-i)*1.25;inst.scaling.set(s*(.82+hash(i,cz)*.36),s*(.66+hash(cx,i)*.38),s);inst.rotation.y=hash(cx+i*7,cz-i*5)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);
      }
      const flowers=Math.floor(130*this.quality);for(let i=0;i<flowers;i++){
        const x=baseX+(hash(cx*233+i,cz*181-i)-.5)*CHUNK,z=baseZ+(hash(cx*199-i,cz*239+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z);if(h>174||m<.32||forest>.63||Math.abs(z-riverCenter(x))<20||lakeDistance(x,z)<8)continue;
        const inst=this.flower.createInstance(`flower_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h+.03,z);const s=.70+hash(i*17+cx,cz*13-i)*.95;inst.scaling.set(s*.72,s,s*.72);inst.rotation.y=hash(cx+i*5,cz-i*3)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);
      }
    }
    return trees;
  }
  private templateFor(kind:PlantKind){if(kind==='authoredFir'&&this.templates.fir)return this.templates.fir;if(kind==='authoredBroad'&&this.templates.broad)return this.templates.broad;if(kind==='authoredRock'&&this.templates.rock)return this.templates.rock;if(kind==='firBlue')return this.firBlue;if(kind==='oak')return this.oak;if(kind==='aspen')return this.aspen;if(kind==='rock'||kind==='authoredRock')return this.rock;return this.firDark;}
  private makeFir(name:string,color:Color3,variant:number){
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=new Color3(.18,.10,.052);bark.specularColor=Color3.Black();bark.ambientColor=bark.diffuseColor.scale(.18);
    const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.004,.007,.004);leaf.emissiveColor=color.scale(.008);leaf.ambientColor=color.scale(.18);
    const parts:Mesh[]=[];const height=9.4+variant*.9,trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height,diameterTop:.34,diameterBottom:.82,tessellation:9},this.scene);trunk.position.y=height*.5;trunk.material=bark;parts.push(trunk);
    const tiers=variant?[{y:3.7,r:2.62,h:2.75},{y:4.8,r:2.45,h:2.85},{y:5.9,r:2.12,h:2.70},{y:7.0,r:1.78,h:2.55},{y:8.05,r:1.38,h:2.35},{y:9.0,r:.92,h:2.0}]:[{y:3.5,r:2.85,h:2.9},{y:4.65,r:2.62,h:3.0},{y:5.8,r:2.28,h:2.82},{y:6.95,r:1.90,h:2.65},{y:8.0,r:1.46,h:2.38},{y:8.95,r:.96,h:2.05}];
    tiers.forEach((t,i)=>{const crown=MeshBuilder.CreateCylinder(`${name}_tier${i}`,{height:t.h,diameterTop:.12,diameterBottom:t.r*2,tessellation:11},this.scene);crown.position.set((i%2?-.14:.12)*(variant+1),t.y,(i%2?.10:-.09)*(variant+1));crown.scaling.z=.86+(i%3)*.06;crown.rotation.y=i*.63;crown.material=leaf;parts.push(crown);});const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeBroad(name:string,color:Color3,variant:number){
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=variant?new Color3(.30,.25,.18):new Color3(.22,.13,.064);bark.specularColor=Color3.Black();bark.ambientColor=bark.diffuseColor.scale(.18);
    const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.005,.008,.004);leaf.emissiveColor=color.scale(.007);leaf.ambientColor=color.scale(.18);
    const parts:Mesh[]=[];const height=variant?9.1:8.0,trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height,diameterTop:variant?.42:.58,diameterBottom:variant?.82:1.02,tessellation:10},this.scene);trunk.position.y=height*.5;trunk.material=bark;parts.push(trunk);
    const branches=variant?[[.52,6.5,.72,.12,1.9,.22],[-.55,6.9,-.62,-.10,2.0,.20],[.38,7.5,-.78,.13,1.65,.18]]:[[.62,5.9,.68,.16,2.2,.28],[-.64,6.25,-.60,-.14,2.15,.25],[.36,6.9,-.82,.10,1.8,.22],[-.28,7.15,.78,-.08,1.65,.20]];
    branches.forEach((b,i)=>{const br=MeshBuilder.CreateCylinder(`${name}_branch${i}`,{height:b[4],diameterTop:b[5]*.45,diameterBottom:b[5],tessellation:7},this.scene);br.position.set(b[0],b[1],b[2]);br.rotation.set(b[2]*.30,i*.85,b[0]*-.42);br.material=bark;parts.push(br);});
    const blobs=variant?[[-.72,.12,7.55,1.55,1.92,1.28],[.72,-.26,7.78,1.48,1.98,1.35],[0,.72,8.55,1.34,1.78,1.18],[.34,-.66,8.95,1.22,1.55,1.08],[-.28,-.05,9.42,1.02,1.32,.96],[.15,.22,7.22,1.30,1.45,1.12]]:[[-1.34,.08,6.78,1.82,1.45,1.62],[1.24,-.32,6.95,1.76,1.42,1.58],[-.28,1.04,7.55,1.72,1.52,1.70],[.34,-1.02,7.72,1.64,1.48,1.60],[0,.02,8.48,1.48,1.30,1.52],[-.92,-.62,7.74,1.45,1.34,1.38],[.88,.58,7.86,1.38,1.32,1.34]];
    blobs.forEach((b,i)=>{const crown=MeshBuilder.CreateIcoSphere(`${name}_crown${i}`,{radius:1,subdivisions:1},this.scene);crown.position.set(b[0],b[2],b[1]);crown.scaling.set(b[3],b[4],b[5]);crown.rotation.set((i%2-.5)*.22,i*.71,(i%3-1)*.15);crown.material=leaf;parts.push(crown);});const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeShrub(name:string){const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=new Color3(.115,.225,.082);leaf.specularColor=Color3.Black();leaf.emissiveColor=leaf.diffuseColor.scale(.007);leaf.ambientColor=leaf.diffuseColor.scale(.18);const parts:Mesh[]=[];const blobs=[[-.66,0,.62,.82,.62,.70],[.56,.12,.70,.76,.68,.82],[0,-.46,.56,.88,.56,.70],[.05,.30,1.08,.66,.69,.66],[-.12,-.08,.92,.72,.62,.78]];blobs.forEach((b,i)=>{const p=MeshBuilder.CreateIcoSphere(`${name}_${i}`,{radius:1,subdivisions:1},this.scene);p.position.set(b[0],b[2],b[1]);p.scaling.set(b[3],b[4],b[5]);p.rotation.y=i*.73;p.material=leaf;parts.push(p);});const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;}
  private makeRock(name:string){const rock=MeshBuilder.CreateIcoSphere(name,{radius:2.0,subdivisions:2},this.scene);rock.scaling.set(1.58,.70,1.20);rock.rotation.set(.12,.35,-.08);const positions=rock.getVerticesData('position');if(positions){for(let i=0;i<positions.length;i+=3){const n=.92+Math.sin(positions[i]*3.1+positions[i+1]*4.7+positions[i+2]*2.3)*.08;positions[i]*=n;positions[i+1]*=n;positions[i+2]*=n;}rock.updateVerticesData('position',positions);rock.refreshBoundingInfo();}const m=new PBRMaterial(`${name}_mat`,this.scene);m.albedoColor=new Color3(.31,.32,.29);m.roughness=.99;m.metallic=.006;rock.material=m;return rock;}
  private makeFlower(name:string){const stem=MeshBuilder.CreateCylinder(`${name}_stem`,{height:.90,diameter:.065,tessellation:5},this.scene);stem.position.y=.45;const bloom=MeshBuilder.CreateIcoSphere(`${name}_bloom`,{radius:.20,subdivisions:1},this.scene);bloom.position.y=.99;const sm=new StandardMaterial(`${name}_stemMat`,this.scene);sm.diffuseColor=new Color3(.11,.23,.09);sm.specularColor=Color3.Black();stem.material=sm;const bm=new StandardMaterial(`${name}_bloomMat`,this.scene);bm.diffuseColor=new Color3(.72,.47,.18);bm.specularColor=Color3.Black();bloom.material=bm;const merged=Mesh.MergeMeshes([stem,bloom],true,true,undefined,false,true)!;merged.name=name;return merged;}
}
