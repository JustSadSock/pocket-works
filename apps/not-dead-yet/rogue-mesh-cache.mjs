// Bounded CPU geometry cache for the endless apartment. Stable 5-cell
// camera anchors make reused meshes deterministic; cache invalidates on the
// world object or terrain revision, including memory rewrites and new runs.
export class RogueMeshCache{
 constructor({limit=3,grid=5}={}){
  this.limit=Math.max(1,Math.min(5,limit|0));this.grid=Math.max(2,grid);
  this.meshes=new Map();this.world=null;this.revision=-1;
  this.hits=0;this.misses=0;
 }
 clear(){this.meshes.clear();this.world=null;this.revision=-1}
 anchor(player){
  const g=this.grid;
  return{x:(Math.floor(player.x/g)+.5)*g,z:(Math.floor(player.z/g)+.5)*g}
 }
 get(world,player,build){
  if(this.world!==world||this.revision!==world.terrainRevision){
   this.meshes.clear();this.world=world;this.revision=world.terrainRevision
  }
  const reference=this.anchor(player),key=world.terrainRevision+':'+reference.x+':'+reference.z;
  if(this.meshes.has(key)){
   const data=this.meshes.get(key);this.meshes.delete(key);this.meshes.set(key,data);
   this.hits++;return{data,key,hit:true,anchor:reference,bytes:this.bytes}
  }
  const built=build(reference);
  const data=built instanceof Float32Array?built:new Float32Array(built);
  this.meshes.set(key,data);this.misses++;
  while(this.meshes.size>this.limit)this.meshes.delete(this.meshes.keys().next().value);
  return{data,key,hit:false,anchor:reference,bytes:this.bytes}
 }
 get size(){return this.meshes.size}
 get bytes(){let total=0;for(const mesh of this.meshes.values())total+=mesh.byteLength;return total}
}
