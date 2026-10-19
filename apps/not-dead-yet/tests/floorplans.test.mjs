import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOORPLANS} from '../rogue-floorplans.mjs';
import {RogueWorld,generateSector,SECTOR} from '../rogue-world.mjs';
import {rogueStaticMesh} from '../rogue-scene.mjs';

const xy=(x,z)=>x+','+z;
function flood(tiles){
 const at=(x,z)=>x>=0&&z>=0&&x<SECTOR&&z<SECTOR&&tiles[z*SECTOR+x];
 const initial=tiles.findIndex(Boolean);
 assert.ok(initial>=0);
 const q=[[initial%SECTOR,Math.floor(initial/SECTOR)]],seen=new Set([xy(...q[0])]);
 for(let i=0;i<q.length;i++)for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
  const [x,z]=q[i],xx=x+dx,zz=z+dz,k=xy(xx,zz);
  if(!at(xx,zz)||seen.has(k))continue;seen.add(k);q.push([xx,zz])
 }
 assert.equal(seen.size,tiles.filter(Boolean).length);
}
function walk(world){
 const pass=(x,z)=>x>=0&&z>=0&&x<SECTOR&&z<SECTOR&&world.canStand(x+.5,z+.5);
 assert.ok(pass(9,9),'central entrance blocked');
 const q=[[9,9]],seen=new Set(['9,9']);
 for(let i=0;i<q.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const [x,z]=q[i],xx=x+dx,zz=z+dz,k=xy(xx,zz);
  if(seen.has(k)||!pass(xx,zz))continue;seen.add(k);q.push([xx,zz])
 }
 return seen
}
test('five recognizable apartment families change topology, not just color',()=>{
 const families=new Set(),fingerprints=new Map();
 for(let seed=1;seed<=100;seed++)for(let epoch=0;epoch<4;epoch++){
  const c=generateSector(seed,0,0,epoch);
  families.add(c.layoutName);
  const shape=[...c.tiles].join('')+c.rooms.length;
  const set=fingerprints.get(c.layoutName)||new Set();
  set.add(shape);fingerprints.set(c.layoutName,set);
  assert.ok(c.rooms.length>=4&&c.rooms.length<=5);
  flood(c.tiles);
 }
 assert.equal(families.size,FLOORPLANS.length);
 for(const [family,shapes] of fingerprints)
  assert.ok(shapes.size>=5,`layout ${family} has no geometry variation`);
});
test('all edge portals stay deterministic, aligned and traversable',()=>{
 for(let seed=1;seed<=30;seed++)for(let epoch=0;epoch<4;epoch++){
  const center=generateSector(seed,0,0,epoch);
  const east=generateSector(seed,1,0,epoch+1),south=generateSector(seed,0,1,epoch+2);
  for(let i=0;i<SECTOR;i++){
   assert.equal(Boolean(center.tiles[i*SECTOR+SECTOR-1]),Boolean(east.tiles[i*SECTOR]));
   assert.equal(Boolean(center.tiles[(SECTOR-1)*SECTOR+i]),Boolean(south.tiles[i]))
  }
 }
});
test('real player collision can reach every room, pickup and threshold in 240 generations',()=>{
 const archetypes=new Set();
 for(let seed=1;seed<=60;seed++)for(let epoch=0;epoch<4;epoch++){
  const w=new RogueWorld(seed,{layoutVersion:2,epochs:[['0,0',epoch]]});
  const c=w.chunk(0,0);
  // An unopened room is intentionally inaccessible. Open each real hinged
  // door first, then verify actual furniture/pickup/threshold reachability.
  for(const door of c.doors)if(!w.doorState(door,c).open)assert.ok(w.toggleDoor(door).ok);
  for(let i=0;i<8;i++)w.animateDoors(.12);
  const reachable=walk(w);
  archetypes.add(c.layoutName);
  for(const r of c.rooms){
   let found=false;
   for(let z=r.z0;z<=r.z1;z++)for(let x=r.x0;x<=r.x1;x++)
    if(reachable.has(xy(x,z)))found=true;
   assert.ok(found,`seed ${seed}/${epoch} inaccessible ${r.id}`);
  }
  for(const drop of c.drops)
   assert.ok(reachable.has(xy(Math.floor(drop.x),Math.floor(drop.z))),`unreachable loot ${drop.id}`);
  for(const door of c.doors){
   const x=door.x,z=door.z;
   assert.ok(reachable.has(xy(x,z)),`blocked door ${door.id}`);
   const neighbor=door.side==='left'?[x-1,z]:door.side==='right'?[x+1,z]:door.side==='south'?[x,z-1]:[x,z+1];
   assert.ok(w.canStand(neighbor[0]+.5,neighbor[1]+.5),'blocked room-side threshold')
  }
 }
 assert.equal(archetypes.size,5)
});
test('walk-through bedroom really connects through another room without a fake hallway door',()=>{
 let count=0;
 for(let seed=1;seed<=60;seed++){
  const c=generateSector(seed,0,0,0);if(c.layoutName!=='walk-through')continue;
  count++;
  const back=c.rooms[2];
  assert.equal(back.type,'bedroom');
  assert.equal(c.doors.some(d=>d.id===back.id&&d.side==='left'),false);
  assert.equal(c.doors.some(d=>d.id===back.id&&d.side==='north'),true);
  assert.equal(c.tiles[8*SECTOR+4],3);
  assert.equal(c.tiles[9*SECTOR+4],3);
 }
 assert.ok(count>=3)
});
test('old 2.0.x runs keep old layouts; new runs and new saves use v2',()=>{
 const old={epochs:[['0,0',2]],taken:[],visited:[],changes:0,depth:0};
 const legacy=new RogueWorld(321,old),fresh=new RogueWorld(321);
 assert.equal(legacy.layoutVersion,1);
 assert.equal(legacy.chunk(0,0).layoutName,'legacy-four-room');
 assert.equal(fresh.layoutVersion,3);
 assert.equal(new RogueWorld(321,fresh.save()).layoutVersion,3);
 assert.equal(new RogueWorld(321,legacy.save()).chunk(0,0).layoutName,'legacy-four-room');
 assert.deepEqual([...legacy.chunk(0,0).tiles],[...new RogueWorld(321,old).chunk(0,0).tiles])
});
test('new shape and doorway meshes are finite across all architecture families',()=>{
 const snapshots=new Set();
 for(let seed=1;seed<=100&&snapshots.size<5;seed++){
  const w=new RogueWorld(seed),f=w.chunk(0,0).layoutName;
  if(snapshots.has(f))continue;
  snapshots.add(f);
  const mesh=rogueStaticMesh(w,{x:9.5,z:9.5});
  assert.equal(mesh.length%10,0);
  assert.ok(mesh.length>360000&&mesh.length<1100000);
  assert.ok(mesh.every(Number.isFinite))
 }
 assert.equal(snapshots.size,5)
});
