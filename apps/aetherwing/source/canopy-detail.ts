import { InstancedMesh, Mesh } from '@babylonjs/core';
import { terrainHeight, WorldStreamer } from './world';

const CHUNK=520,HALF=260;
const terrainKey=(x:number,z:number)=>`${Math.floor((x+HALF)/CHUNK)}:${Math.floor((z+HALF)/CHUNK)}`;
const sourcePrefixes=['firdark','firblue','oak','aspen','fieldrock','meadowflower','understory','fir_a','broad_a','rock_a'];
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

export class CanopyDetailLayer{
  readonly instances:InstancedMesh[]=[];
  private alignedTerrainStamp='';
  private alignedAuthoredCount=0;

  constructor(private world:WorldStreamer){
    this.parkSourceMeshes();
    void this.world.templatesReady.then(()=>this.parkSourceMeshes());
  }

  get activeCount(){return this.alignedAuthoredCount;}

  private parkSourceMeshes(){
    for(const mesh of this.world.scene.meshes){
      if(mesh instanceof InstancedMesh)continue;
      const name=mesh.name.toLowerCase();
      if(sourcePrefixes.some(prefix=>name===prefix||name.startsWith(`${prefix}.`)||name.startsWith(`${prefix}_`)))mesh.position.y=-12000;
    }
  }

  private renderedHeight(x:number,z:number){
    const key=terrainKey(x,z),mesh=this.world.scene.getMeshByName(`terrain_${key}`) as Mesh|null;
    if(!mesh)return terrainHeight(x,z);
    const positions=mesh.getVerticesData('position');if(!positions?.length)return terrainHeight(x,z);
    const grid=Math.round(Math.sqrt(positions.length/3));if(grid<2||grid*grid*3!==positions.length)return terrainHeight(x,z);
    const [cx,cz]=key.split(':').map(Number),minX=cx*CHUNK-HALF,minZ=cz*CHUNK-HALF;
    const gx=clamp((x-minX)/CHUNK*(grid-1),0,grid-1-1e-5),gz=clamp((z-minZ)/CHUNK*(grid-1),0,grid-1-1e-5),ix=Math.floor(gx),iz=Math.floor(gz),tx=gx-ix,tz=gz-iz;
    const yAt=(xx:number,zz:number)=>positions[(zz*grid+xx)*3+1]??terrainHeight(x,z),a=yAt(ix,iz),b=yAt(ix+1,iz),c=yAt(ix,iz+1),d=yAt(ix+1,iz+1);
    return tx+tz<=1?a+(b-a)*tx+(c-a)*tz:d+(c-d)*(1-tx)+(b-d)*(1-tz);
  }

  private alignStreamedVegetation(terrainStamp:string){
    if(terrainStamp===this.alignedTerrainStamp)return;
    this.alignedTerrainStamp=terrainStamp;this.alignedAuthoredCount=0;
    for(const [,chunk] of this.world.chunks)for(const inst of chunk.instances){
      const source=inst.sourceMesh,name=source.name.toLowerCase(),authored=name.includes('fir_a')||name.includes('broad_a')||name.includes('rock_a');
      if(authored)this.alignedAuthoredCount++;
      const minY=source.getBoundingInfo().boundingBox.minimum.y;
      const decorativeOffset=inst.name.startsWith('flower_')?.03:inst.name.startsWith('shrub_')?.04:0;
      const target=this.renderedHeight(inst.position.x,inst.position.z)-minY*Math.abs(inst.scaling.y)+decorativeOffset;
      if(Math.abs(inst.position.y-target)<.02)continue;
      inst.unfreezeWorldMatrix();inst.position.y=target;inst.freezeWorldMatrix();
    }
  }

  update(){
    this.parkSourceMeshes();
    const terrainStamp=[...this.world.chunks.keys()].sort().join('|');
    this.alignStreamedVegetation(terrainStamp);
  }

  private clear(){for(const inst of this.instances)inst.dispose();this.instances.length=0;}
  dispose(){this.clear();}
}
