import test from 'node:test';
import assert from 'node:assert/strict';
import {RogueWorld} from '../rogue-world.mjs';
import {ARCHITECTURAL_FINISHES,finishFor,architecturalWall,doorwayReturn} from '../rogue-architecture.mjs';
import {rogueStaticMesh} from '../rogue-scene.mjs';
import {RogueMeshCache} from '../rogue-mesh-cache.mjs';

test('physical plaster layer projects behind original traversable boundary',()=>{
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const out=[],w=new RogueWorld(413),c=w.chunk(0,0),x=8,z=8,px=x*1.27,pz=z*1.27;
  architecturalWall(out,{x,z,px,pz,dx,dz,sector:c,room:null,seed:413,tile:1.27,detail:false});
  assert.ok(out.length>0&&out.length%10===0&&out.every(Number.isFinite));
  // The structural slab cannot extend into the open side of the boundary.
  const plane=dx===1?px+1.27:dx===-1?px:dz===1?pz+1.27:pz;
  const axis=dx?0:2,side=dx||dz;
  // A 9mm paper veneer and finishing relief are allowed near the plane.
  const values=[];for(let i=axis;i<out.length;i+=10)values.push(out[i]);
  if(side>0)assert.ok(Math.min(...values)>=plane-.0101);
  else assert.ok(Math.max(...values)<=plane+.0101);
  assert.ok(Math.max(...values)-Math.min(...values)>=.15,'wall must have thickness')
 }
});
test('five distinct deterministic material finishes and raised Soviet wall repairs',()=>{
 const w=new RogueWorld(413),types=new Set;
 for(let cx=-3;cx<=3;cx++)for(let cz=-3;cz<=3;cz++){
  const c=w.chunk(cx,cz);types.add(finishFor(w.seed,c,null));
  assert.equal(finishFor(w.seed,c,null),finishFor(w.seed,c,null));
 }
 assert.equal(types.size,ARCHITECTURAL_FINISHES);
 const base=[],detailed=[],c=w.chunk(0,0);
 const args={x:8,z:8,px:8*1.27,pz:8*1.27,dx:1,dz:0,room:null,sector:c,seed:w.seed,tile:1.27};
 architecturalWall(base,{...args,detail:false});
 architecturalWall(detailed,{...args,detail:true});
 assert.ok(detailed.length>base.length,'raised skirting and cornice must exist');
 assert.ok(detailed.every(Number.isFinite))
});
test('doorway structural returns match real four-way passage orientations',()=>{
 for(const side of ['left','right','north','south']){
  const out=[];doorwayReturn(out,{x:7,z:5,side},1.27);
  assert.ok(out.length>600&&out.length%10===0&&out.every(Number.isFinite))
 }
});
test('static meshes remain finite and bounded in five asymmetrical layouts',()=>{
 const families=new Set();
 for(let seed=1;seed<=90&&families.size<5;seed++){
  const w=new RogueWorld(seed),family=w.chunk(0,0).layoutName;
  if(families.has(family))continue;families.add(family);
  const geom=rogueStaticMesh(w,{x:9.5,z:9.5});
  assert.equal(geom.length%10,0);
  assert.ok(geom.length>400000&&geom.length<1200000);
  assert.ok(geom.every(Number.isFinite))
 }
 assert.equal(families.size,5)
});
test('returning through a previous 5-cell region reuses actual typed CPU mesh',()=>{
 const w=new RogueWorld(222),cache=new RogueMeshCache({limit:3,grid:5});
 let builds=0;
 const build=anchor=>{builds++;return new Float32Array([anchor.x,anchor.z,1])};
 const a=cache.get(w,{x:9.5,z:9.5},build);
 assert.equal(a.hit,false);assert.equal(builds,1);
 assert.equal(a.anchor.x,7.5);
 const b=cache.get(w,{x:12.5,z:9.5},build);
 assert.equal(b.hit,false);
 const back=cache.get(w,{x:9.1,z:9.5},build);
 assert.equal(back.hit,true);
 assert.strictEqual(back.data,a.data,'a hit must avoid Float32Array recreation');
 assert.equal(builds,2);
 assert.equal(cache.hits,1);
 assert.equal(cache.bytes,2*3*4)
});
test('cache evicts LRU entries and invalidates on memory shift / next run',()=>{
 const w=new RogueWorld(222),cache=new RogueMeshCache({limit:2});
 let n=0,make=()=>new Float32Array([++n]);
 const positions=[{x:1,z:1},{x:6,z:1},{x:11,z:1}];
 cache.get(w,positions[0],make);
 cache.get(w,positions[1],make);
 cache.get(w,positions[0],make);
 cache.get(w,positions[2],make);
 assert.equal(n,3);
 assert.equal(cache.size,2);
 cache.get(w,positions[1],make);
 assert.equal(n,4,'LRU entry was evicted');
 w.terrainRevision++;
 cache.get(w,positions[1],make);
 assert.equal(n,5,'terrain revision invalidates old geometry');
 cache.get(new RogueWorld(222),positions[1],make);
 assert.equal(n,6,'new run invalidates cached geometry even with equal seed')
});
test('structural decoration does not change tile collision or door interactions',()=>{
 for(let seed=1;seed<=80;seed++){
  const w=new RogueWorld(seed),c=w.chunk(0,0);
  assert.ok(w.canStand(9.5,9.5));
  for(const door of c.doors){
   const before=w.doorState(door,c).open;
   if(!before){assert.ok(w.toggleDoor(door).ok)}
  }
  for(let i=0;i<8;i++)w.animateDoors(.12);
  for(const door of c.doors)assert.ok(w.canStand(door.x+.5,door.z+.5,.10),'door opening unobstructed');
  for(const reward of c.drops)assert.ok(w.canStand(reward.x,reward.z),'pickup remains reachable by its footprint')
 }
});
