import type { InstancedMesh, Mesh } from '@babylonjs/core';
import type { CanopyDetailLayer } from './canopy-detail';
import type { WorldStreamer } from './world';

type Shape={minY:number;maxY:number;radius:number;tree:boolean};
type Collider={x:number;z:number;base:number;top:number;radius:number;tree:boolean};
const CELL=40;

export class ObstacleField{
  colliderCount=0;
  private readonly shapeCache=new Map<number,Shape>();
  private readonly grid=new Map<string,Collider[]>();
  private lastRebuild=-1e9;
  constructor(private world:WorldStreamer,private canopy:CanopyDetailLayer){}

  update(time:number,force=false){if(!force&&time-this.lastRebuild<.22)return;this.lastRebuild=time;this.grid.clear();this.colliderCount=0;for(const [,chunk] of this.world.chunks)for(const inst of chunk.instances)this.add(inst);for(const inst of this.canopy.instances)this.add(inst);}
  surfaceAt(x:number,z:number,clearanceBias:number){let surface=this.world.heightAt(x,z);const list=this.grid.get(`${Math.floor(x/CELL)}:${Math.floor(z/CELL)}`);if(!list)return surface;for(const c of list){const dx=x-c.x,dz=z-c.z,d2=dx*dx+dz*dz;if(d2>c.radius*c.radius)continue;const d=Math.sqrt(d2)/c.radius,profile=c.tree?Math.pow(Math.max(0,1-d*d),.42):Math.sqrt(Math.max(0,1-d*d));surface=Math.max(surface,c.base+(c.top-c.base)*profile-clearanceBias);}return surface;}

  private add(inst:InstancedMesh){const shape=this.shape(inst.sourceMesh);if(!shape)return;const sx=Math.abs(inst.scaling.x),sy=Math.abs(inst.scaling.y),sz=Math.abs(inst.scaling.z),radius=Math.max(1.15,shape.radius*Math.max(sx,sz)),c:Collider={x:inst.position.x,z:inst.position.z,base:inst.position.y+shape.minY*sy,top:inst.position.y+shape.maxY*sy,radius,tree:shape.tree};this.colliderCount++;
    const x0=Math.floor((c.x-radius)/CELL),x1=Math.floor((c.x+radius)/CELL),z0=Math.floor((c.z-radius)/CELL),z1=Math.floor((c.z+radius)/CELL);for(let gz=z0;gz<=z1;gz++)for(let gx=x0;gx<=x1;gx++){const key=`${gx}:${gz}`,bucket=this.grid.get(key);if(bucket)bucket.push(c);else this.grid.set(key,[c]);}}
  private shape(source:Mesh):Shape|null{const name=source.name.toLowerCase(),tree=name.includes('fir')||name.includes('oak')||name.includes('aspen')||name.includes('broad'),rock=name.includes('rock');if(!tree&&!rock)return null;const cached=this.shapeCache.get(source.uniqueId);if(cached)return cached;const box=source.getBoundingInfo().boundingBox,min=box.minimum,max=box.maximum,shape={minY:min.y,maxY:max.y,radius:Math.max(max.x-min.x,max.z-min.z)*.46,tree};this.shapeCache.set(source.uniqueId,shape);return shape;}
}
