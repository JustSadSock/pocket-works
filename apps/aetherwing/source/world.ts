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
  const valley=clamp(1-riverDist/165,0,1);
  const channel=clamp(1-riverDist/74,0,1);
  const carve=valley*valley*(33+mountains*.43)+Math.pow(channel,1.45)*13;
  return 54+continental+hills+mountains+fine-carve;
}
function lakeSpec(lx:number,lz:number):Lake|null{
  const key=`${lx}:${lz}`;if(lakeCache.has(key))return lakeCache.get(key)!;
  const chance=hash(lx*79+17,lz*83-31);if(chance<.69){lakeCache.set(key,null);return null;}
  const x=(lx+.15+hash(lx*131+5,lz*101-9)*.70)*LAKE_CELL;
  const z=(lz+.15+hash(lx*67-11,lz*149+3)*.70)*LAKE_CELL;
  const center=baseTerrainHeight(x,z);if(center>150){lakeCache.set(key,null);return null;}
  const r=76+hash(lx*211+7,lz*193-5)*112;
  const lake={x,z,r,level:center-3.6};lakeCache.set(key,lake);return lake;
}
function nearbyLakes(x:number,z:number){const lx=Math.floor(x/LAKE_CELL),lz=Math.floor(z/LAKE_CELL),out:Lake[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const lake=lakeSpec(lx+dx,lz+dz);if(lake)out.push(lake);}return out;}
export function terrainHeight(x:number,z:number){
  let h=baseTerrainHeight(x,z);
  for(const lake of nearbyLakes(x,z)){const d=Math.hypot(x-lake.x,z-lake.z);if(d<lake.r*1.22){const t=clamp(1-d/(lake.r*1.22),0,1);h=Math.min(h,lake.level-4.8*t*t);}}
  return h;
}
function lakeDistance(x:number,z:number){let d=99999;for(const lake of nearbyLakes(x,z))d=Math.min(d,Math.hypot(x-lake.x,z-lake.z)-lake.r);return d;}
function moistureAt(x:number,z:number){const river=Math.exp(-Math.abs(z-riverCenter(x))/145);const lake=Math.exp(-Math.max(0,lakeDistance(x,z))/145);return clamp(fbm(x*.00066+90,z*.00066-42)*.66+river*.43+lake*.34,0,1);}
function temperatureAt(x:number,z:number,h:number){return clamp(.89-fbm(x*.00034-70,z*.00034+33)*.38-h*.00145,0,1);}
function forestField(x:number,z:number){const broad=fbm(x*.00175+18,z*.00175-67,5);const local=fbm(x*.0051-211,z*.0051+92,3);return broad*.74+local*.26;}
function meadowField(x:number,z:number){return fbm(x*.0027+441,z*.0027-118,4);}
function biomeColor(x:number,z:number,h:number){
  const m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),meadow=meadowField(x,z),riverDist=Math.abs(z-riverCenter(x));let c:Color4;
  if(h>225)c=new Color4(.43,.44,.40,1);
  else if(h>170)c=new Color4(.47,.49,.37,1);
  else if(riverDist<72)c=new Color4(.48,.53,.31,1);
  else if(forest>.64)c=t<.42?new Color4(.29,.40,.28,1):new Color4(.33,.46,.25,1);
  else if(meadow>.60)c=new Color4(.52,.60,.31,1);
  else if(m>.70)c=new Color4(.36,.51,.29,1);
  else if(m>.48)c=new Color4(.44,.56,.31,1);
  else c=new Color4(.52,.57,.33,1);
  const v=(fbm(x*.012+241,z*.012-107,3)-.5)*.09;
  return new Color4(clamp(c.r+v,0,1),clamp(c.g+v*.82,0,1),clamp(c.b+v*.42,0,1),1);
}

const waterVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform float time;varying vec3 vPos;void main(){vec3 p=position;p.y+=sin(p.x*.036+time*.92)*.16+sin(p.z*.051-time*.64)*.10;vPos=p;gl_Position=worldViewProjection*vec4(p,1.0);}`;
const waterFragment=`precision highp float;varying vec3 vPos;uniform float time;uniform vec3 cameraPosition;void main(){float a=vPos.x*.037+time*.72;float b=vPos.z*.052-time*.43;vec3 n=normalize(vec3(-.075*cos(a),1.0,-.062*cos(b)));vec3 v=normalize(cameraPosition-vPos);float f=pow(1.0-max(dot(n,v),0.0),3.2);float flow=.5+.5*sin(vPos.x*.078+vPos.z*.014-time*1.35);vec3 shallow=vec3(.10,.34,.38),deep=vec3(.025,.14,.21);vec3 c=mix(shallow,deep,.46)+f*vec3(.28,.40,.44)+flow*.010;gl_FragColor=vec4(c,.91);}`;

export class WorldStreamer{
  readonly scene:Scene;readonly chunks=new Map<string,Chunk>();readonly water:ShaderMaterial;readonly templates:Templates={};
  private terrainMaterial:StandardMaterial;
  private firDark:Mesh;private firBlue:Mesh;private oak:Mesh;private aspen:Mesh;private rock:Mesh;private flower:Mesh;
  private quality=1;private lastCenter='';private lastRadius=-1;private nextChunkBuild=0;
  constructor(scene:Scene){
    this.scene=scene;
    this.terrainMaterial=new StandardMaterial('terrainMat',scene);this.terrainMaterial.diffuseColor=Color3.White();this.terrainMaterial.specularColor=new Color3(.018,.022,.014);this.terrainMaterial.specularPower=18;this.terrainMaterial.backFaceCulling=false;this.terrainMaterial.emissiveColor=new Color3(.030,.036,.020);
    this.water=new ShaderMaterial('naturalWater',scene,{vertexSource:waterVertex,fragmentSource:waterFragment},{attributes:['position'],uniforms:['worldViewProjection','time','cameraPosition'],needAlphaBlending:true});this.water.backFaceCulling=false;this.water.alpha=.91;
    this.firDark=this.makeFir('firDark',new Color3(.085,.22,.115),0);
    this.firBlue=this.makeFir('firBlue',new Color3(.11,.25,.20),1);
    this.oak=this.makeBroad('oak',new Color3(.22,.36,.15),0);
    this.aspen=this.makeBroad('aspen',new Color3(.31,.42,.18),1);
    this.rock=this.makeRock('fieldRock');this.flower=this.makeFlower('meadowFlower');
    for(const m of [this.firDark,this.firBlue,this.oak,this.aspen,this.rock,this.flower]){m.position.y=-2600;m.isPickable=false;}
    void this.loadTemplates();
  }
  setQuality(q:number){this.quality=clamp(q,.55,1);}
  heightAt(x:number,z:number){return terrainHeight(x,z);}
  get instanceCount(){let n=0;for(const [,c] of this.chunks)n+=c.instances.length;return n;}
  get treeCount(){let n=0;for(const [,c] of this.chunks)n+=c.treeCount;return n;}
  async loadTemplates(){
    try{
      const r=await SceneLoader.ImportMeshAsync(null,'./models/','biome_props.glb',this.scene);
      for(const m of r.meshes){
        if(!(m instanceof Mesh)||m.getTotalVertices()===0)continue;
        if(m.name.includes('Fir'))this.templates.fir=m;else if(m.name.includes('Broad'))this.templates.broad=m;else if(m.name.includes('Rock'))this.templates.rock=m;else continue;
        m.position.y=-3000;m.isPickable=false;m.receiveShadows=true;
        if(m.material instanceof PBRMaterial){m.material.roughness=Math.max(m.material.roughness??.82,.82);m.material.metallic=Math.min(m.material.metallic??0,.025);m.material.environmentIntensity=.62;}
        if(m.material instanceof StandardMaterial){m.material.specularColor=new Color3(.02,.025,.015);}
      }
    }catch{/* procedural fallbacks keep the world complete offline */}
  }
  update(position:Vector3,time:number){
    const cx=Math.floor((position.x+HALF_CHUNK)/CHUNK),cz=Math.floor((position.z+HALF_CHUNK)/CHUNK),center=`${cx}:${cz}`;
    this.water.setFloat('time',time);this.water.setVector3('cameraPosition',this.scene.activeCamera?.position??position);
    const wanted=new Set<string>(),queue:{cx:number;cz:number;dist:number}[]=[];const radius=this.quality>.78?2:1;
    for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const key=`${cx+dx}:${cz+dz}`;wanted.add(key);if(!this.chunks.has(key))queue.push({cx:cx+dx,cz:cz+dz,dist:Math.hypot(dx,dz)});}
    queue.sort((a,b)=>a.dist-b.dist);
    if(queue.length&&time>=this.nextChunkBuild){const budget=this.chunks.size===0?4:1;for(const q of queue.slice(0,budget))this.createChunk(q.cx,q.cz,q.dist<1.25);this.nextChunkBuild=time+.045;}
    if(center!==this.lastCenter||radius!==this.lastRadius){
      for(const [key,ch] of this.chunks)if(!wanted.has(key)){
        // Chunk meshes share terrain/water/vegetation materials. Disposing a
        // streaming chunk must never dispose those shared materials, otherwise
        // the next chunk renders as clearColor/white after crossing a boundary.
        ch.root.dispose(false,false);this.chunks.delete(key);
      }
      this.lastCenter=center;this.lastRadius=radius;
    }
  }
  private createChunk(cx:number,cz:number,near:boolean){
    const key=`${cx}:${cz}`;if(this.chunks.has(key))return;
    const root=new TransformNode(`chunk_${key}`,this.scene),grid=near?(this.quality>.8?31:25):17,positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[];const baseX=cx*CHUNK,baseZ=cz*CHUNK;
    for(let z=0;z<grid;z++)for(let x=0;x<grid;x++){const wx=baseX+(x/(grid-1)-.5)*CHUNK,wz=baseZ+(z/(grid-1)-.5)*CHUNK,h=terrainHeight(wx,wz),c=biomeColor(wx,wz,h);positions.push(wx,h,wz);colors.push(c.r,c.g,c.b,1);}
    for(let z=0;z<grid-1;z++)for(let x=0;x<grid-1;x++){const a=z*grid+x,b=a+1,c=a+grid,d=c+1;indices.push(a,c,b,b,c,d);}
    VertexData.ComputeNormals(positions,indices,normals);const mesh=new Mesh(`terrain_${key}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.colors=colors;vd.applyToMesh(mesh);mesh.material=this.terrainMaterial;mesh.useVertexColors=true;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;mesh.freezeWorldMatrix();
    const ownerCz=Math.floor((riverCenter(baseX)+HALF_CHUNK)/CHUNK);if(cz===ownerCz){const river=this.createRiver(cx);river.parent=root;}
    this.createLakes(cx,cz,root);
    const instances:InstancedMesh[]=[];const treeCount=this.scatter(cx,cz,root,instances,near?1:.32);
    this.chunks.set(key,{key,cx,cz,root,instances,treeCount});
  }
  private createRiver(cx:number){
    const seg=38,positions:number[]=[],indices:number[]=[],x0=cx*CHUNK-HALF_CHUNK;
    for(let i=0;i<seg;i++){const x=x0+i/(seg-1)*CHUNK,z=riverCenter(x),h=terrainHeight(x,z)+3.4,half=24+noise(x*.012,cx)*12;positions.push(x,h,z-half,x,h,z+half);if(i<seg-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
    const mesh=new Mesh(`river_${cx}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.receiveShadows=false;mesh.isPickable=false;return mesh;
  }
  private createLakes(cx:number,cz:number,root:TransformNode){
    const minX=cx*CHUNK-HALF_CHUNK,maxX=cx*CHUNK+HALF_CHUNK,minZ=cz*CHUNK-HALF_CHUNK,maxZ=cz*CHUNK+HALF_CHUNK,l0=Math.floor(minX/LAKE_CELL)-1,l1=Math.floor(maxX/LAKE_CELL)+1,z0=Math.floor(minZ/LAKE_CELL)-1,z1=Math.floor(maxZ/LAKE_CELL)+1;
    for(let lz=z0;lz<=z1;lz++)for(let lx=l0;lx<=l1;lx++){const lake=lakeSpec(lx,lz);if(!lake||lake.x<minX||lake.x>=maxX||lake.z<minZ||lake.z>=maxZ)continue;const seg=42,positions=[lake.x,lake.level+.16,lake.z],indices:number[]=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;positions.push(lake.x+Math.cos(a)*lake.r,lake.level+.16,lake.z+Math.sin(a)*lake.r);if(i>0)indices.push(0,i,i+1);}const mesh=new Mesh(`lake_${lx}_${lz}`,this.scene),vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.applyToMesh(mesh);mesh.material=this.water;mesh.parent=root;mesh.isPickable=false;}
  }
  private scatter(cx:number,cz:number,root:TransformNode,out:InstancedMesh[],density:number){
    const baseX=cx*CHUNK,baseZ=cz*CHUNK,candidates=Math.floor(310*this.quality*density),far=density<.5;let trees=0;
    for(let i=0;i<candidates;i++){
      const x=baseX+(hash(cx*97+i,cz*131-i)-.5)*CHUNK,z=baseZ+(hash(cx*173-i,cz*67+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),t=temperatureAt(x,z,h),forest=forestField(x,z),riverDist=Math.abs(z-riverCenter(x));
      if(riverDist<42||lakeDistance(x,z)<18||h>238)continue;
      const patch=smoothstep(.39,.70,forest),wetBoost=(m-.5)*.22,gate=clamp(.055+patch*.83+wetBoost,.04,.90);if(hash(i*31+cx*7,cz*29-i*3)>gate)continue;
      const species=hash(i*19+cx*43,cz*37-i*11);let kind:PlantKind;
      if(h>155||t<.38){kind=species<.73?'firBlue':'firDark';}
      else if(m>.66){kind=species<.45?'aspen':species<.72?'oak':'firDark';}
      else{kind=species<.42?'oak':species<.66?'aspen':species<.86?'firDark':'firBlue';}
      if(hash(i*71+cx,cz-i*17)>.972)kind='rock';
      const template=this.templateFor(kind),inst=template.createInstance(`veg_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h,z);inst.rotation.y=hash(cx*13-i,cz*17+i)*Math.PI*2;
      const age=.70+hash(i*3+cx,cz-i*9)*.62,slender=.86+hash(i*41-cx,cz+i*23)*.24;
      if(isRockKind(kind))inst.scaling.set(.72+age*.32,.46+age*.30,.68+age*.38);
      else if(kind==='oak')inst.scaling.set(age*1.05,age*(.88+slender*.08),age*(.94+slender*.05));
      else if(kind==='aspen')inst.scaling.set(age*.78,age*(1.10+slender*.12),age*.82);
      else inst.scaling.set(age*.82,age*(1.02+slender*.16),age*.82);
      if(far)inst.scaling.scaleInPlace(.92);inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);if(!isRockKind(kind))trees++;
    }
    if(!far){
      const flowers=Math.floor(105*this.quality);for(let i=0;i<flowers;i++){const x=baseX+(hash(cx*233+i,cz*181-i)-.5)*CHUNK,z=baseZ+(hash(cx*199-i,cz*239+i)-.5)*CHUNK,h=terrainHeight(x,z),m=moistureAt(x,z),forest=forestField(x,z);if(h>170||m<.31||forest>.61||Math.abs(z-riverCenter(x))<22||lakeDistance(x,z)<8)continue;const inst=this.flower.createInstance(`flower_${cx}_${cz}_${i}`);inst.parent=root;inst.position.set(x,h+.03,z);const s=.65+hash(i*17+cx,cz*13-i)*.75;inst.scaling.set(s*.75,s,s*.75);inst.rotation.y=hash(cx+i*5,cz-i*3)*Math.PI*2;inst.isPickable=false;inst.freezeWorldMatrix();out.push(inst);}
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
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=new Color3(.22,.14,.075);bark.specularColor=Color3.Black();const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.01,.015,.008);leaf.emissiveColor=color.scale(.018);
    const parts:Mesh[]=[];const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:7.4+variant*.6,diameterTop:.42,diameterBottom:.78,tessellation:7},this.scene);trunk.position.y=3.7;trunk.material=bark;parts.push(trunk);
    const tiers=variant?[{y:3.8,r:2.35,h:3.4},{y:5.2,r:1.85,h:3.2},{y:6.55,r:1.36,h:2.8},{y:7.65,r:.82,h:2.25}]:[{y:3.5,r:2.65,h:3.3},{y:4.8,r:2.15,h:3.25},{y:6.1,r:1.55,h:2.9},{y:7.2,r:.94,h:2.4}];
    tiers.forEach((t,i)=>{const crown=MeshBuilder.CreateCylinder(`${name}_tier${i}`,{height:t.h,diameterTop:.18,diameterBottom:t.r*2,tessellation:7},this.scene);crown.position.set((i%2?-.12:.10)*variant,t.y,(i%2?.08:-.07)*variant);crown.rotation.y=i*.61;crown.material=leaf;parts.push(crown);});
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeBroad(name:string,color:Color3,variant:number){
    const bark=new StandardMaterial(`${name}_bark`,this.scene);bark.diffuseColor=variant?new Color3(.36,.31,.22):new Color3(.28,.18,.095);bark.specularColor=Color3.Black();const leaf=new StandardMaterial(`${name}_leaf`,this.scene);leaf.diffuseColor=color;leaf.specularColor=new Color3(.012,.018,.008);leaf.emissiveColor=color.scale(.015);
    const parts:Mesh[]=[];const trunk=MeshBuilder.CreateCylinder(`${name}_trunk`,{height:variant?7.6:6.5,diameterTop:variant?.50:.62,diameterBottom:variant?.82:1.02,tessellation:8},this.scene);trunk.position.y=(variant?3.8:3.25);trunk.material=bark;parts.push(trunk);
    const blobs=variant?[[-.55,.15,7.0,1.55,1.85,1.28],[.55,-.20,7.3,1.48,2.0,1.35],[0,.55,8.2,1.28,1.8,1.16],[.18,-.48,8.55,1.12,1.55,1.04]]:[[-1.15,.10,6.3,1.85,1.45,1.65],[1.05,-.28,6.45,1.72,1.40,1.60],[-.15,.92,7.15,1.72,1.55,1.70],[.25,-.88,7.18,1.58,1.42,1.55],[0,.05,8.0,1.45,1.25,1.48]];
    blobs.forEach((b,i)=>{const crown=MeshBuilder.CreateIcoSphere(`${name}_crown${i}`,{radius:1,subdivisions:1},this.scene);crown.position.set(b[0],b[2],b[1]);crown.scaling.set(b[3],b[4],b[5]);crown.rotation.set((i%2-.5)*.18,i*.77,(i%3-1)*.11);crown.material=leaf;parts.push(crown);});
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;merged.name=name;return merged;
  }
  private makeRock(name:string){const rock=MeshBuilder.CreateIcoSphere(name,{radius:2.0,subdivisions:1},this.scene);rock.scaling.set(1.55,.72,1.18);rock.rotation.set(.12,.35,-.08);const m=new PBRMaterial(`${name}_mat`,this.scene);m.albedoColor=new Color3(.31,.32,.29);m.roughness=.98;m.metallic=.01;rock.material=m;return rock;}
  private makeFlower(name:string){const stem=MeshBuilder.CreateCylinder(`${name}_stem`,{height:.85,diameter:.075,tessellation:5},this.scene);stem.position.y=.42;const bloom=MeshBuilder.CreateIcoSphere(`${name}_bloom`,{radius:.20,subdivisions:1},this.scene);bloom.position.y=.92;const sm=new StandardMaterial(`${name}_stemMat`,this.scene);sm.diffuseColor=new Color3(.16,.32,.13);sm.specularColor=Color3.Black();stem.material=sm;const bm=new StandardMaterial(`${name}_bloomMat`,this.scene);bm.diffuseColor=new Color3(.68,.50,.23);bm.specularColor=Color3.Black();bloom.material=bm;const merged=Mesh.MergeMeshes([stem,bloom],true,true,undefined,false,true)!;merged.name=name;return merged;}
}
