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
  const chance=hash(lx*79+17,lz*83-31);if(chance<.69){lakeCache.set(key,null);return null;}
  const x=(lx+.15+hash(lx*131+5,lz*101-9)*.70)*LAKE_CELL;
  const z=(lz+.15+hash(lx*67-11,lz*149+3)*.70)*LAKE_CELL;
  const center=baseTerrainHeight(x,z);if(center>152){lakeCache.set(key,null);return null;}
  const r=82+hash(lx*211+7,lz*193-5)*118;
  const lake={x,z,r,level:center-3.8};lakeCache.set(key,lake);return lake;
}
function nearbyLakes(x:number,z:number){const lx=Math.floor(x/LAKE_CELL),lz=Math.floor(z/LAKE_CELL),out:Lake[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const lake=lakeSpec(lx+dx,lz+dz);if(lake)out.push(lake);}return out;}
export function terrainHeight(x:number,z:number){
  let h=baseTerrainHeight(x,z);
  for(const lake of nearbyLakes(x,z)){const d=Math.hypot(x-lake.x,z-lake.z);if(d<lake.r*1.24){const t=clamp(1-d/(lake.r*1.24),0,1);h=Math.min(h,lake.level-5.4*t*t);}}
  return h;
}
function lakeDistance(x:number,z:number){let d=99999;for(const lake of nearbyLakes(x,z))d=Math.min(d,Math.hypot(x-lake.x,z-lake.z)-lake.r);return d;}
function moistureAt(x:number,z:number){const river=Math.exp(-Math.abs(z-riverCenter(x))/150);const lake=Math.exp(-Math.max(0,lakeDistance(x,z))/150);return clamp(fbm(x*.00066+90,z*.00066-42)*.64+river*.45+lake*.35,0,1);}
function temperatureAt(x:number,z:number,h:number){return clamp(.90-fbm(x*.00034-70,z*.00034+33)*.36-h*.00142,0,1);}
function forestField(x:number,z:number){const broad=fbm(x*.00155+18,z*.00155-67,5);const local=fbm(x*.0045-211,z*.0045+92,3);return broad*.78+local*.22;}
function meadowField(x:number,z:number){return fbm(x*.00245+441,z*.00245-118,4);}
function biomeColor(x:number,z:number,h:number){
  const m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),meadow=meadowField(x,z),riverDist=Math.abs(z-riverCenter(x));let c:Color4;
  if(h>230)c=new Color4(.53,.53,.48,1);
  else if(h>178)c=new Color4(.50,.52,.39,1);
  else if(riverDist<82)c=new Color4(.49,.55,.32,1);
  else if(forest>.64)c=t<.42?new Color4(.31,.43,.29,1):new Color4(.35,.48,.27,1);
  else if(meadow>.60)c=new Color4(.56,.62,.34,1);
  else if(m>.70)c=new Color4(.39,.54,.31,1);
  else if(m>.48)c=new Color4(.47,.58,.33,1);
  else c=new Color4(.55,.59,.35,1);
  const v=(fbm(x*.011+241,z*.011-107,3)-.5)*.095;
  return new Color4(clamp(c.r+v,0,1),clamp(c.g+v*.80,0,1),clamp(c.b+v*.38,0,1),1);
}

const waterVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform float time;varying vec3 vPos;void main(){vec3 p=position;p.y+=sin(p.x*.031+time*.82)*.11+sin(p.z*.047-time*.59)*.07;vPos=p;gl_Position=worldViewProjection*vec4(p,1.0);}`;
const waterFragment=`precision highp float;varying vec3 vPos;uniform float time;uniform vec3 cameraPosition;void main(){float a=vPos.x*.031+time*.67;float b=vPos.z*.047-time*.39;vec3 n=normalize(vec3(-.058*cos(a),1.0,-.048*cos(b)));vec3 v=normalize(cameraPosition-vPos);float f=pow(1.0-max(dot(n,v),0.0),3.4);float flow=.5+.5*sin(vPos.x*.071+vPos.z*.012-time*1.17);vec3 shallow=vec3(.105,.36,.40),deep=vec3(.024,.145,.215);vec3 c=mix(shallow,deep,.43)+f*vec3(.30,.42,.45)+flow*.009;gl_FragColor=vec4(c,.93);}`;

export class WorldStreamer{
  readonly scene:Scene;readonly chunks=new Map<string,Chunk>();readonly water:ShaderMaterial;readonly templates:Templates={};
  private terrainMaterial:StandardMaterial;
  private firDark:Mesh;private firBlue:Mesh;private oak:Mesh;private aspen:Mesh;private rock:Mesh;private flower:Mesh;private shrub:Mesh;
  private quality=1;private lastCenter='';private lastRadius=-1;private nextChunkBuild=0;
  constructor(scene:Scene){
    this.scene=scene;
    this.terrainMaterial=new StandardMaterial('terrainMat',scene);this.terrainMaterial.diffuseColor=Color3.White();this.terrainMaterial.specularColor=new Color3(.014,.018,.010);this.terrainMaterial.specularPower=20;this.terrainMaterial.backFaceCulling=false;this.terrainMaterial.emissiveColor=new Color3(.042,.050,.027);this.terrainMaterial.ambientColor=new Color3(.24,.27,.18);
    this.water=new ShaderMaterial('naturalWater',scene,{vertexSource:waterVertex,fragmentSource:waterFragment},{attributes:['position'],uniforms:['worldViewProjection','time','cameraPosition'],needAlphaBlending:true});this.water.backFaceCulling=false;this.water.alpha=.93;
    this.firDark=this.makeFir('firDark',new Color3(.095,.235,.125),0);
    this.firBlue=this.makeFir('firBlue',new Color3(.12,.27,.215),1);
    this.oak=this.makeBroad('oak',new Color3(.235,.39,.16),0);
    this.aspen=this.makeBroad('aspen',new Color3(.34,.45,.19),1);
    this.rock=this.makeRock('fieldRock');this.flower=this.makeFlower('meadowFlower');this.shrub=this.makeShrub('understory');
    for(const m of [this.firDark,this.firBlue,this.oak,this.aspen,this.rock,this.flower,this.shrub]){m.position.y=-2600;m.isPickable=false;}
    void this.loadTemplates();
  }
  setQuality(q:number){this.quality=clamp(q,.55,1);}
  heightAt(x:number,z:number){return terrainHeight(x,z);}
  get instanceCount(){let n=0;for(const [,c] of this.chunks)n+=c.instances.length;return n;}
  get treeCount(){let n=0;for(const [,c] of this.chunks)n+=c.treeCount;return n;}
  get materialsHealthy(){return this.scene.materials.includes(this.terrainMaterial)&&this.scene.materials.includes(this.water);}
  get riverMeshCount(){return this.scene.meshes.filter(m=>m.name.startsWith('river_')&&m.isEnabled()).length;}
  async loadTemplates(){
    try{
      const r=await SceneLoader.ImportMeshAsync(null,'./models/','biome_props.glb',this.scene);
      for(const m of r.meshes){
        if(!(m instanceof Mesh)||m.getTotalVertices()===0)continue;
        const lower=m.name.toLowerCase();
        if(lower.includes('fir'))this.templates.fir=m;else if(lower.includes('broad'))this.templates.broad=m;else if(lower.includes('rock'))this.templates.rock=m;else continue;
        m.position.y=-3000;m.isPickable=false;m.receiveShadows=true;
        if(m.material instanceof PBRMaterial){
          m.material.roughness=Math.max(m.material.roughness??.84,.84);m.material.metallic=Math.min(m.material.metallic??0,.018);m.material.environmentIntensity=.68;
          if(lower.includes('fir'))m.material.albedoColor=new Color3(.10,.25,.14);else if(lower.includes('broad'))m.material.albedoColor=new Color3(.25,.40,.17);else m.material.albedoColor=new Color3(.38,.39,.35);
          if(m.material.albedoTexture)m.material.albedoTexture.level=.36;
        }
        if(m.material instanceof StandardMaterial){m.material.specularColor=new Color3(.012,.016,.010);if(lower.includes('fir'))m.material.diffuseColor=new Color3(.10,.25,.14);else if(lower.includes('broad'))m.material.diffuseColor=new Color3(.25,.40,.17);else m.material.diffuseColor=new Color3(.38,.39,.35);}
      }
    }catch{/* procedural fallbacks keep the world complete offline */}
  }
  update(position:Vector3,time:number){
    const cx=Math.floor((position.x+HALF_CHUNK)/CHUNK),cz=Math.floor((position.z+HALF_CHUNK)/CHUNK),center=`${cx}:${cz}`;
    this.water.setFloat('time',time);this.water.setVector3('cameraPosition',this.scene.activeCamera?.position??position);
    const wanted=new Set<string>(),queue:{cx:number;cz:number;dist:number}[]=[];const radius=this.quality>.76?2:1;
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const key=`${cx+dx}:${cz+dz}`;wanted.add(key);if(!this.chunks.has(key))queue.push({cx:cx+dx,cz:cz+dz,dist:Math.hypot(dx,dz)});}
    queue.sort((a,b)=>a.dist-b.dist);
    if(queue.length&&time>=this.nextChunkBuild){const budget=this.chunks.size===0?4:1;for(const q of queue.slice(0,budget))this.createChunk(q.cx,q.cz,q.dist<1.25);this.nextChunkBuild=time+.045;}
    if(center!==this.lastCenter||radius!==this.lastRadius){
      for(const [key,ch] of this.chunks)if(!wanted.has(key)){ch.root.dispose(false,false);this.chunks.delete(key);}
      this.lastCenter=center;this.lastRadius=radius;
    }
  }
  private createChunk(cx:number,cz:number,near:boolean){
    const key=`${cx}:${cz}`;if(this.chunks.has(key))return;
    const root=new TransformNode(`chunk_${key}`,this.scene),grid=near?(this.quality>.80?35:27):19,positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];const baseX=cx*CHUNK,baseZ=cz*CHUNK;
    for(let z=0;z<grid;z++)for(let x=0;x<grid;x++){const wx=baseX+(x/(grid-1)-.5)*CHUNK,wz=baseZ+(z/(grid-1)-.5)*CHUNK,h=terrainHeight(wx,wz),c=biomeColor(wx,wz,h);positions.push(wx,h,wz);colors.push(c.r,c.g,c.b,1);}
    for(let z=0;z<grid-1;z++)for(let x=0;x<grid-1;x++){const a=z*grid+x,b=a+1,c=a+grid,d=c+1;indices.push(a,c,b,b,c,d);}
    VertexData.ComputeNormals(positions,indices,normals);const mesh=new Mesh(`terrain_${key}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.colors=colors;vd.applyToMesh(mesh);mesh.material=this.terrainMaterial;mesh.useVertexColors=true;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;mesh.freezeWorldMatrix();
    const ownerCz=Math.floor((riverCenter(baseX)+HALF_CHUNK)/CHUNK);if(cz===ownerCz){const river=this.createRiver(cx);river.parent=root;}
    this.createLakes(cx,cz,root);
    const instances:InstancedMesh[]=[];const treeCount=this.scatter(cx,cz,root,instances,near?1:.29);
    this.chunks.set(key,{key,cx,cz,root,instances,treeCount});
  }
  private createRiver(cx:number){
    const seg=96,positions:number[]=[],indices:number[]=[],x0=cx*CHUNK-HALF_CHUNK;
    for(let i=0;i<seg;i++){
      const x=x0+i/(seg-1)*CHUNK,z=riverCenter(x),h=terrainHeight(x,z)+4.55;
      const half=27+noise(x*.0107,31.7)*17;
      positions.push(x,h,z-half,x,h,z+half);
      if(i<seg-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const mesh=new Mesh(`river_${cx}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.receiveShadows=false;mesh.isPickable=false;return mesh;
  }
  private createLakes(cx:number,cz:number,root:TransformNode){
    const minX=cx*CHUNK-HALF_CHUNK,maxX=cx*CHUNK+HALF_CHUNK,minZ=cz*CHUNK-HALF_CHUNK,maxZ=cz*CHUNK+HALF_CHUNK,l0=Math.floor(minX/LAKE_CELL)-1,l1=Math.floor(maxX/LAKE_CELL)+1,z0=Math.floor(minZ/LAKE_CELL)-1,z1=Math.floor(maxZ/LAKE_CELL)+1;
    for(let lz=z0;lz<=z1;lz++)for(let lx=l0;lx<=l1;lx++){
      const lake=lakeSpec(lx,lz);if(!lake||lake.x<minX||lake.x>=maxX||lake.z<minZ||lake.z>=maxZ)continue;
      const seg=56,positions=[lake.x,lake.level+.24,lake.z],indices:number[]=[];
      for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;positions.push(lake.x+Math.cos(a)*lake.r,lake.level+.24,lake.z+Math.sin(a)*lake.r);if(i>0)indices.push(0,i,i+1);}
      const mesh=new Mesh(`lake_${lx}_${lz}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.parent=root;mesh.isPickable=false;
    }
  }
  private scatter(cx:number,cz:number,root:TransformNode,out:InstancedMesh[],density:number){
    const baseX=cx*CHUNK,baseZ=cz*CHUNK,candidates=Math.floor(440*this.quality*density),far=density<.5;let trees=0;
    for(let i=0;i<candidates;i++){
      const x=baseX+(hash(cx*97+i,cz*131-i)-.5)*CHUNK,z=baseZ+(hash(cx*173-i,cz*67+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));
      if(riverDist<34||lakeDistance(x,z)<20||h>244)continue;
      const patch=smoothstep(.37,.69,forest),wetBoost=(m-.48)*.24,riparian=riverDist<128?.20:0,gate=clamp(.075+patch*.83+wetBoost+riparian,.055,.94);if(hash(i*31+cx*7,cz*29-i*3)>gate)continue;
      const species=hash(i*19+cx*43,cz*37-i*11),authored=hash(i*53-cx,cz*47+i)<.105;let kind:PlantKind;
      if(riverDist<122&&h<165){kind=species<.58?'aspen':species<.82?'oak':'firDark';}
      else if(h>158||t<.38){kind=species<.72?'firBlue':'firDark';}
      else if(m>.66){kind=species<.43?'aspen':species<.73?'oak':'firDark';}
      else{kind=species<.40?'oak':species<.64?'aspen':species<.86?'firDark':'firBlue';}
      if(authored){if(kind==='oak'||kind==='aspen')kind='authoredBroad';else kind='authoredFir';}
      if(hash(i*71+cx,cz-i*17)>.972)kind='authoredRock';
      const template=this.templateFor(kind),inst=template.createInstance(`veg_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h,z);inst.rotation.y=hash(cx*13-i,cz*17+i)*Math.PI*2;
      const age=.86+hash(i*3+cx,cz-i*9)*.72,slender=.88+hash(i*41-cx,cz+i*23)*.24;
      if(isRockKind(kind))inst.scaling.set(.78+age*.34,.50+age*.30,.74+age*.40);
      else if(kind==='oak'||kind==='authoredBroad')inst.scaling.set(age*1.12,age*(.94+slender*.09),age*1.04);
      else if(kind==='aspen')inst.scaling.set(age*.84,age*(1.16+slender*.13),age*.86);
      else inst.scaling.set(age*.90,age*(1.10+slender*.16),age*.90);
      if(far)inst.scaling.scaleInPlace(.94);inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);if(!isRockKind(kind))trees++;
    }
    if(!far){
      const bushes=Math.floor(145*this.quality);for(let i=0;i<bushes;i++){
        const x=baseX+(hash(cx*307+i,cz*257-i)-.5)*CHUNK,z=baseZ+(hash(cx*277-i,cz*313+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));if(h>192||m<.30||riverDist<22||lakeDistance(x,z)<10)continue;
        const edge=1-Math.abs(forest-.57)*3.2;if(hash(i*61+cx,cz-i*43)>.48+clamp(edge,0,1)*.38)continue;
        const inst=this.shrub.createInstance(`shrub_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h+.04,z);const s=.70+hash(i*23+cx,cz*19-i)*1.05;inst.scaling.set(s*(.90+hash(i,cz)*.24),s*(.72+hash(cx,i)*.30),s);inst.rotation.y=hash(cx+i*7,cz-i*5)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);
      }
      const flowers=Math.floor(95*this.quality);for(let i=0;i<flowers;i++){
        const x=baseX+(hash(cx*233+i,cz*181-i)-.5)*CHUNK,z=baseZ+(hash(cx*199-i,cz*239+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z);if(h>174||m<.32||forest>.63||Math.abs(z-riverCenter(x))<20||lakeDistance(x,z)<8)continue;
        const inst=this.flower.createInstance(`flower_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h+.03,z);const s=.75+hash(i*17+cx,cz*13-i)*.80;inst.scaling.set(s*.76,s,s*.76);inst.rotation.y=hash(cx+i*5,cz-i*3)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);
      }
    }
    return trees;
  }
  private templateFor(kind:PlantKind){
    if(kind==='authoredFir'&&this.templates.fir)return this.templates.fir;
    if(kind==='authoredBroad'&&this.templates.broad)return this.templates.broad;
    if(kind==='authoredRock'&&this.templates.rock)return this.templates.rock;
    if(kind==='firBlue')return this.firBlue;if(kind==='oak')return this.oak;if(kind==='aspen')return this.aspen;if(kind==='rock'||kind==='authoredRock')return this.rock;return this.firDark;
  }
  private makeFir(name:string,color:Color3,variant:number){
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=new Color3(.24,.15,.075);bark.specularColor=Color3.Black();bark.ambientColor=bark.diffuseColor.scale(.30);
    const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.008,.012,.006);leaf.emissiveColor=color.scale(.026);leaf.ambientColor=color.scale(.30);
    const parts:Mesh[]=[];const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:8.7+variant*.7,diameterTop:.42,diameterBottom:.86,tessellation:8},this.scene);trunk.position.y=(8.7+variant*.7)*.5;trunk.material=bark;parts.push(trunk);
    const tiers=variant?[{y:4.0,r:2.55,h:3.3},{y:5.25,r:2.22,h:3.25},{y:6.55,r:1.76,h:3.0},{y:7.72,r:1.28,h:2.65},{y:8.72,r:.78,h:2.1}]:[{y:3.8,r:2.88,h:3.45},{y:5.0,r:2.42,h:3.35},{y:6.25,r:1.94,h:3.1},{y:7.45,r:1.42,h:2.75},{y:8.45,r:.86,h:2.2}];
    tiers.forEach((t,i)=>{const crown=MeshBuilder.CreateCylinder(`${name}_tier${i}`,{height:t.h,diameterTop:.16,diameterBottom:t.r*2,tessellation:9},this.scene);crown.position.set((i%2?-.13:.11)*(variant+1),t.y,(i%2?.09:-.08)*(variant+1));crown.scaling.z=.88+(i%3)*.055;crown.rotation.y=i*.69;crown.material=leaf;parts.push(crown);});
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeBroad(name:string,color:Color3,variant:number){
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=variant?new Color3(.38,.32,.22):new Color3(.29,.18,.09);bark.specularColor=Color3.Black();bark.ambientColor=bark.diffuseColor.scale(.28);
    const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.010,.014,.007);leaf.emissiveColor=color.scale(.024);leaf.ambientColor=color.scale(.30);
    const parts:Mesh[]=[];const height=variant?8.5:7.4,trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height,diameterTop:variant?.48:.64,diameterBottom:variant?.84:1.08,tessellation:9},this.scene);trunk.position.y=height*.5;trunk.material=bark;parts.push(trunk);
    const blobs=variant?[[-.62,.15,7.4,1.62,2.02,1.34],[.62,-.22,7.65,1.55,2.12,1.42],[0,.62,8.6,1.38,1.88,1.22],[.22,-.52,8.95,1.20,1.62,1.10],[-.15,.05,9.45,1.03,1.42,1.0]]:[[-1.25,.10,6.75,1.98,1.56,1.74],[1.15,-.30,6.9,1.84,1.50,1.70],[-.18,.98,7.65,1.83,1.65,1.82],[.28,-.94,7.72,1.70,1.55,1.68],[0,.06,8.55,1.58,1.38,1.60]];
    blobs.forEach((b,i)=>{const crown=MeshBuilder.CreateIcoSphere(`${name}_crown${i}`,{radius:1,subdivisions:1},this.scene);crown.position.set(b[0],b[2],b[1]);crown.scaling.set(b[3],b[4],b[5]);crown.rotation.set((i%2-.5)*.20,i*.79,(i%3-1)*.13);crown.material=leaf;parts.push(crown);});
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeShrub(name:string){
    const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=new Color3(.22,.37,.15);leaf.specularColor=Color3.Black();leaf.emissiveColor=leaf.diffuseColor.scale(.022);leaf.ambientColor=leaf.diffuseColor.scale(.30);const parts:Mesh[]=[];
    const blobs=[[-.65,0,.66,.86,.65,.72],[.54,.12,.72,.78,.72,.84],[0,-.44,.58,.92,.58,.72],[.05,.28,1.12,.70,.72,.68]];
    blobs.forEach((b,i)=>{const p=MeshBuilder.CreateIcoSphere(`${name}_${i}`,{radius:1,subdivisions:1},this.scene);p.position.set(b[0],b[2],b[1]);p.scaling.set(b[3],b[4],b[5]);p.rotation.y=i*.77;p.material=leaf;parts.push(p);});
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeRock(name:string){const rock=MeshBuilder.CreateIcoSphere(name,{radius:2.0,subdivisions:1},this.scene);rock.scaling.set(1.55,.72,1.18);rock.rotation.set(.12,.35,-.08);const m=new PBRMaterial(`${name}_mat`,this.scene);m.albedoColor=new Color3(.38,.39,.35);m.roughness=.99;m.metallic=.008;rock.material=m;return rock;}
  private makeFlower(name:string){const stem=MeshBuilder.CreateCylinder(`${name}_stem`,{height:.90,diameter:.075,tessellation:5},this.scene);stem.position.y=.45;const bloom=MeshBuilder.CreateIcoSphere(`${name}_bloom`,{radius:.21,subdivisions:1},this.scene);bloom.position.y=.99;const sm=new StandardMaterial(`${name}_stemMat`,this.scene);sm.diffuseColor=new Color3(.17,.34,.14);sm.specularColor=Color3.Black();stem.material=sm;const bm=new StandardMaterial(`${name}_bloomMat`,this.scene);bm.diffuseColor=new Color3(.76,.55,.23);bm.specularColor=Color3.Black();bloom.material=bm;const merged=Mesh.MergeMeshes([stem,bloom],true,true,undefined,false,true)!;merged.name=name;return merged;}
}
