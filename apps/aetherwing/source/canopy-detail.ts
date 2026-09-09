import { InstancedMesh, Mesh, Vector3 } from '@babylonjs/core';
import { riverCenter, terrainHeight, WorldStreamer } from './world';

const CHUNK=520,HALF=260;
const hash=(x:number,z:number)=>{let n=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^0x6d2b79f5)|0;n=Math.imul((n^(n>>>15))|0,2246822519);return ((n^(n>>>13))>>>0)/4294967295;};
const terrainKey=(x:number,z:number)=>`${Math.floor((x+HALF)/CHUNK)}:${Math.floor((z+HALF)/CHUNK)}`;
const sourcePrefixes=['firdark','firblue','oak','aspen','fieldrock','meadowflower','understory','fir_a','broad_a','rock_a'];
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

export class CanopyDetailLayer{
  readonly instances:InstancedMesh[]=[];
  private cell='';
  private alignedTerrainStamp='';
  constructor(private world:WorldStreamer){
    this.parkSourceMeshes();
    void this.world.templatesReady.then(()=>this.parkSourceMeshes());
  }
  get activeCount(){return this.instances.length;}
  private terrainLoaded(x:number,z:number){return this.world.chunks.has(terrainKey(x,z));}
  private parkSourceMeshes(){
    for(const mesh of this.world.scene.meshes){
      if(mesh instanceof InstancedMesh)continue;
      const name=mesh.name.toLowerCase();
      if(sourcePrefixes.some(prefix=>name===prefix||name.startsWith(`${prefix}.`)||name.startsWith(`${prefix}_`)))mesh.position.y=-12000;
    }
  }
  private renderedHeight(x:number,z:number){
    const key=terrainKey(x,z),mesh=this.world.scene.getMeshByName(`terrain_${key}`) as Mesh|null;if(!mesh)return terrainHeight(x,z);
    const positions=mesh.getVerticesData('position');if(!positions?.length)return terrainHeight(x,z);
    const grid=Math.round(Math.sqrt(positions.length/3));if(grid<2||grid*grid*3!==positions.length)return terrainHeight(x,z);
    const [cx,cz]=key.split(':').map(Number),minX=cx*CHUNK-HALF,minZ=cz*CHUNK-HALF;
    const gx=clamp((x-minX)/CHUNK*(grid-1),0,grid-1-1e-5),gz=clamp((z-minZ)/CHUNK*(grid-1),0,grid-1-1e-5),ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz;
    const yAt=(xx:number,zz:number)=>positions[(zz*grid+xx)*3+1]??terrainHeight(x,z),a=yAt(ix,iz),b=yAt(ix+1,iz),c=yAt(ix,iz+1),d=yAt(ix+1,iz+1);
    return tx+tz<=1?a+(b-a)*tx+(c-a)*tz:d+(c-d)*(1-tx)+(b-d)*(1-tz);
  }
  private alignStreamedVegetation(terrainStamp:string){
    if(terrainStamp===this.alignedTerrainStamp)return;this.alignedTerrainStamp=terrainStamp;
    for(const [,chunk] of this.world.chunks)for(const inst of chunk.instances){
      const offset=inst.name.startsWith('flower_')?.03:inst.name.startsWith('shrub_')?.04:0,target=this.renderedHeight(inst.position.x,inst.position.z)+offset;
      if(Math.abs(inst.position.y-target)<.02)continue;inst.unfreezeWorldMatrix();inst.position.y=target;inst.freezeWorldMatrix();
    }
  }

  update(position:Vector3,quality:number){
    if(this.world.authoredTemplateCount<3)return;
    this.parkSourceMeshes();
    const terrainStamp=[...this.world.chunks.keys()].sort().join('|');this.alignStreamedVegetation(terrainStamp);
    const cx=Math.floor(position.x/260),cz=Math.floor(position.z/260),tier=quality>.74?1:0,key=`${cx}:${cz}:${tier}:${terrainStamp}`;if(key===this.cell)return;this.cell=key;this.clear();
    const clusters=tier?8:5,perCluster=tier?11:7,range=335;
    for(let c=0;c<clusters;c++){
      const sa=cx*313+c*97,sz=cz*331-c*89,angle=hash(sa,sz)*Math.PI*2,dist=82+hash(sz+17,sa-5)*(range-82),centerX=position.x+Math.cos(angle)*dist,centerZ=position.z+Math.sin(angle)*dist,spread=28+hash(sa*3,sz*5)*46;
      for(let j=0;j<perCluster;j++){
        const a=hash(sa+j*17,sz-j*23)*Math.PI*2,r=Math.sqrt(hash(sz+j*29,sa-j*31))*spread,x=centerX+Math.cos(a)*r,z=centerZ+Math.sin(a)*r;
        if(!this.terrainLoaded(x,z)||Math.abs(z-riverCenter(x))<48)continue;
        const y=this.renderedHeight(x,z),hx=this.renderedHeight(x+5,z),hz=this.renderedHeight(x,z+5);if(y>218||Math.abs(hx-y)+Math.abs(hz-y)>9.5)continue;
        const broad=hash(sa+j*47,sz-j*53)>.56&&y<158,source=broad?this.world.templates.broad:this.world.templates.fir;if(!source)continue;
        const inst=source.createInstance(`canopyAccent_${cx}_${cz}_${c}_${j}`);inst.position.set(x,y,z);inst.rotation.y=hash(sa-j*61,sz+j*67)*Math.PI*2;const age=.92+hash(sa+j*71,sz-j*73)*.82,wide=.90+hash(sz+j*79,sa-j*83)*.22;inst.scaling.set(age*wide,age*(.96+hash(sa+j*11,sz-j*13)*.22),age/Math.max(.86,wide));inst.isPickable=false;inst.freezeWorldMatrix();this.instances.push(inst);
      }
    }
    const rockSource=this.world.templates.rock;if(rockSource)for(let i=0;i<(tier?12:7);i++){
      const a=hash(cx*101+i,cz*107-i)*Math.PI*2,d=65+hash(cx*109-i,cz*113+i)*270,x=position.x+Math.cos(a)*d,z=position.z+Math.sin(a)*d;if(!this.terrainLoaded(x,z)||Math.abs(z-riverCenter(x))<38)continue;const y=this.renderedHeight(x,z),inst=rockSource.createInstance(`canopyRock_${cx}_${cz}_${i}`);inst.position.set(x,y,z);inst.rotation.y=hash(i+cx*17,cz-i*19)*Math.PI*2;const s=.50+hash(cx+i*23,cz-i*29)*.85;inst.scaling.set(s*(.8+hash(i,cx)*.6),s*(.48+hash(i,cz)*.28),s);inst.isPickable=false;inst.freezeWorldMatrix();this.instances.push(inst);
    }
  }

  private clear(){for(const inst of this.instances)inst.dispose();this.instances.length=0;}
  dispose(){this.clear();}
}
