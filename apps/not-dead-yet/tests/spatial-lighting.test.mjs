import test from 'node:test';
import assert from 'node:assert/strict';
import {RogueWorld,generateSector,generateSectorV3,SECTOR,TILE} from '../rogue-world.mjs';
import {hallHasLamp,sectorLightSources,selectPracticalLights,occupancyMask,
 LIGHT_GRID,lightingMaskKey,practicalLightMap} from '../rogue-lighting.mjs';
import {rogueStaticMesh} from '../rogue-scene.mjs';
import {appendHallFixtures} from '../rogue-detail.mjs';

const allVisible=c=>{
 const from=c.tiles.findIndex(Boolean),found=new Set([from]),queue=[from];
 for(let i=0;i<queue.length;i++){
  const p=queue[i],x=p%SECTOR,z=(p/SECTOR)|0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,zz=z+dz,j=zz*SECTOR+xx;
   if(xx<0||xx>=SECTOR||zz<0||zz>=SECTOR||!c.tiles[j]||found.has(j))continue;
   found.add(j);queue.push(j)
  }
 }
 return found.size===c.tiles.filter(Boolean).length
};
test('new v3 runs introduce real spatially varied 1–2-tile alcoves',()=>{
 const kinds=new Set(),counts=new Set();
 for(let seed=1;seed<=80;seed++)for(let epoch=0;epoch<3;epoch++){
  const prev=generateSector(seed,0,0,epoch),now=generateSectorV3(seed,0,0,epoch);
  assert.ok(now.alcoves.length>=2&&now.alcoves.length<=3);
  counts.add(now.alcoves.length);
  assert.ok(allVisible(now),'new side bays must remain connected');
  for(const bay of now.alcoves){
   kinds.add(bay.kind);
   assert.ok(now.tiles[bay.z*SECTOR+bay.x]);
   assert.ok(!prev.tiles[bay.z*SECTOR+bay.x]);
  }
  for(let i=0;i<SECTOR;i++){
   assert.equal(now.tiles[i],prev.tiles[i]);
   assert.equal(now.tiles[(SECTOR-1)*SECTOR+i],prev.tiles[(SECTOR-1)*SECTOR+i]);
   assert.equal(now.tiles[i*SECTOR],prev.tiles[i*SECTOR]);
   assert.equal(now.tiles[i*SECTOR+SECTOR-1],prev.tiles[i*SECTOR+SECTOR-1])
  }
 }
 assert.equal(kinds.size,3);
 assert.equal(counts.size,2);
});
test('versioned existing v1 and v2 saves retain identical procedural walls',()=>{
 for(const seed of [22,222,413,8787]){
  for(const epoch of [0,1,3]){
   const save={layoutVersion:2,epochs:[['0,0',epoch]]};
   const old=new RogueWorld(seed,save),base=generateSector(seed,0,0,epoch);
   assert.deepEqual([...old.chunk(0,0).tiles],[...base.tiles]);
   assert.equal(old.chunk(0,0).alcoves,undefined);
   assert.equal(new RogueWorld(seed,old.save()).layoutVersion,2)
  }
  const fresh=new RogueWorld(seed);
  assert.equal(fresh.layoutVersion,3);
  assert.deepEqual(new RogueWorld(seed,fresh.save()).chunk(0,0).alcoves,fresh.chunk(0,0).alcoves)
  assert.equal(new RogueWorld(seed,{epochs:[]}).layoutVersion,1)
 }
});
test('new niches preserve pickups, doors and reachable corridor spine',()=>{
 for(let seed=1;seed<=85;seed++){
  const w=new RogueWorld(seed),chunk=w.chunk(0,0);
  assert.ok(w.canStand(9.5,9.5));
  for(const drop of chunk.drops)assert.ok(w.canStand(drop.x,drop.z));
  for(const bay of chunk.alcoves){
   assert.ok(w.canStand(bay.x+.5,bay.z+.5),'alcove collides invisibly');
   assert.ok(w.canStand(bay.x-bay.dx+.5,bay.z-bay.dz+.5),'alcove entrance blocked')
  }
 }
});
test('real room bulbs and corridor opal lamps agree with generated 3D fixtures',()=>{
 for(const seed of [222,413,8787,4,14]){
  const w=new RogueWorld(seed),c=w.chunk(0,0);
  const sources=sectorLightSources(c,w.seed);
  assert.equal(sources.filter(s=>s.kind==='room').length,c.rooms.length);
  for(const lamp of sources.filter(l=>l.kind==='room')){
   assert.ok(c.rooms.some(r=>Math.abs(lamp.x-(c.cx*SECTOR+(r.x0+r.x1+1)*.5)*TILE-.12)<.001&&
    Math.abs(lamp.z-(c.cz*SECTOR+(r.z0+r.z1+1)*.5)*TILE+.10)<.001))
  }
  for(const light of sources.filter(s=>s.kind==='hall')){
   const x=Math.floor(light.x/TILE),z=Math.floor(light.z/TILE);
   assert.ok(hallHasLamp(x,z,w.seed,c.epoch));
   const mesh=[];appendHallFixtures(mesh,{x,z,px:x*TILE,pz:z*TILE,seed:w.seed,epoch:c.epoch});
   assert.ok(mesh.length>0,'a lamp must exist as visible triangles')
  }
  assert.equal(selectPracticalLights(w,9.5,9.5).length,2)
 }
});
test('48x48 GPU structure mask treats concrete walls and shut hinges as opaque',()=>{
 const w=new RogueWorld(222),c=w.chunk(0,0),size=LIGHT_GRID,start=-14;
 const door=c.doors.find(d=>!w.doorState(d,c).open);
 assert.ok(door);
 const read=m=>m[((door.z-start)*size+(door.x-start))*4];
 const a=occupancyMask(w,start,start);
 assert.equal(a.length,size*size*4);
 assert.equal(read(a),0,'closed door does not leak bulb light');
 const key0=lightingMaskKey(w,9.5,9.5);
 assert.ok(w.toggleDoor(door).ok);
 for(let i=0;i<10;i++)w.animateDoors(.12,[]);
 const b=occupancyMask(w,start,start);
 assert.equal(read(b),255,'opened doorway transmits light');
 assert.notEqual(key0,lightingMaskKey(w,9.5,9.5));
 assert.equal(b[(12*size+12)*4],w.pass(start+12,start+12)?255:0);
});
test('new silhouettes stay bounded, deterministic and finite for all five families',()=>{
 const families=new Set();
 for(let seed=1;seed<=50&&families.size<5;seed++){
  const w=new RogueWorld(seed),family=w.chunk(0,0).layoutName;
  if(families.has(family))continue;families.add(family);
  const m=rogueStaticMesh(w,{x:9.5,z:9.5});
  assert.equal(m.length%10,0);
  assert.ok(m.length>450000&&m.length<1400000);
  assert.ok(m.every(Number.isFinite))
 }
 assert.equal(families.size,5)
});


test('CPU light-visibility map blocks a real shut door and brightens when opened',()=>{
 const w=new RogueWorld(222),c=w.chunk(0,0),d=c.doors.find(x=>
  (x.side==='left'||x.side==='right')&&!w.doorState(x,c).open);
 assert.ok(d);
 const sx=d.side==='left'?d.x-1:d.x+1,tx=d.side==='left'?d.x+1:d.x-1,z=d.z;
 const lamp={x:(sx+.5)*TILE,y:2.4,z:(z+.5)*TILE},read=arr=>
  arr[((z+14)*LIGHT_GRID+(tx+14))*4];
 const baseline=practicalLightMap(-14,-14,occupancyMask(w,-14,-14),[lamp,lamp]);
 assert.equal(read(baseline),0);
 assert.ok(w.toggleDoor(d).ok);
 for(let i=0;i<9;i++)w.animateDoors(.12,[]);
 const illuminated=practicalLightMap(-14,-14,occupancyMask(w,-14,-14),[lamp,lamp]);
 assert.equal(read(illuminated),255);
 assert.equal(illuminated.length,LIGHT_GRID*LIGHT_GRID*4);
});
test('CPU visibility cache stays within bounded RGBA footprint on mobile',()=>{
 for(const seed of [222,413,8787,4,14]){
  const w=new RogueWorld(seed),lights=selectPracticalLights(w,9.5,9.5);
  const mask=occupancyMask(w,-14,-14);
  const output=practicalLightMap(-14,-14,mask,lights);
  assert.equal(output.length,48*48*4);
  assert.ok(output.every(Number.isFinite));
  const lit=output.filter((v,i)=>i%4<2&&v>0).length;
  assert.ok(lit>0,'real fixtures must illuminate at least one tile');
  assert.ok(lit<48*48*2,'concrete must hide light from most tiles')
 }
});
