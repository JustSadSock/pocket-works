import test from 'node:test';
import assert from 'node:assert/strict';
import {RogueWorld,generateSector,SECTOR,UPGRADES} from '../rogue-world.mjs';
import {rogueStaticMesh,roguePickupsMesh} from '../rogue-scene.mjs';

function connected(c){
 const tiles=c.tiles,first=tiles.findIndex(x=>x>0);
 assert.ok(first>=0);
 const seen=new Set([first]),q=[first];
 for(let i=0;i<q.length;i++){
  const t=q[i],x=t%SECTOR,z=Math.floor(t/SECTOR);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const a=x+dx,b=z+dz,j=a+b*SECTOR;
   if(a<0||b<0||a>=SECTOR||b>=SECTOR||!tiles[j]||seen.has(j))continue;
   seen.add(j);q.push(j)
  }
 }
 assert.equal(seen.size,tiles.filter(Boolean).length,'all rooms connect to main hall');
}
test('864 sectors remain connected through deterministic edge portals and epochs',()=>{
 for(let seed=1;seed<=24;seed++)for(let epoch=0;epoch<4;epoch++)for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++){
  const c=generateSector(seed,cx,cz,epoch);
  connected(c);
  const east=generateSector(seed,cx+1,cz,epoch+1);
  const south=generateSector(seed,cx,cz+1,epoch+2);
  for(let i=0;i<SECTOR;i++){
   assert.equal(Boolean(c.tiles[i*SECTOR+SECTOR-1]),Boolean(east.tiles[i*SECTOR]),'east portal');
   assert.equal(Boolean(c.tiles[(SECTOR-1)*SECTOR+i]),Boolean(south.tiles[i]),'south portal')
  }
  assert.ok(c.rooms.length>=4&&c.rooms.length<=5,'family room count');
  assert.ok(c.rooms.every(r=>r.x1-r.x0<=6&&r.z1-r.z0<=6),'no oversized American living spaces');
 }
});
test('player start, drops, furniture and inter-sector path are physically valid',()=>{
 for(let seed=1;seed<=75;seed++){
  const w=new RogueWorld(seed);
  assert.ok(w.canStand(9.5,9.5),'starting hall blocked');
  for(const drop of w.chunk(0,0).drops)assert.ok(w.canStand(drop.x,drop.z),'unreachable reward');
  const target=w.chunk(1,0);
  const right=target.tiles.findIndex(v=>v===3);
  assert.ok(right>=0);
  // Some floor-plan families legitimately gate the only through-room
  // passage behind a closed door. Check navigation after opening it.
  for(const c of w.nearby(9.5,9.5,35))for(const door of c.doors){
   if(!w.doorState(door,c).open)w.toggleDoor(door,[])
  }
  for(let i=0;i<8;i++)w.animateDoors(.12,[]);
  assert.ok(w.findStep(9.5,9.5,SECTOR+9.5,9.5),'neighbor sector cannot be reached after opening doors');
 }
});
test('old floor behind protagonist actually changes without altering player position',()=>{
 const w=new RogueWorld(8787),start=w.chunk(0,0),v=start.tiles.slice();
 w.tick(9.5,9.5,0,0);
 w.tick(10.2,9.5,Math.PI/2,1);
 w.tick(18.5,9.5,Math.PI/2,3);
 w.tick(27.5,9.5,Math.PI/2,9);
 w.tick(28.5,9.5,Math.PI/2,14);
 assert.ok(w.changes>0,'left-behind rooms never regenerate');
 assert.ok(w.canStand(28.5,9.5),'mutation trapped protagonist');
 assert.ok(w.chunk(0,0).epoch>0,'visited sector did not change its identity');
 assert.notDeepEqual([...w.chunk(0,0).tiles], [...v],'same room layout after shift');
});
test('saves preserve random seed, visited progress, pickups and rewritten map',()=>{
 const w=new RogueWorld(7744),p=w.chunk(0,0).drops[0];
 if(p)assert.equal(w.take(p),true);
 w.tick(9.5,9.5,0,2);
 w.tick(18.5,9.5,Math.PI/2,5);
 w.tick(29.5,9.5,Math.PI/2,14);
 const restored=new RogueWorld(w.seed,w.save());
 assert.equal(restored.changes,w.changes);
 assert.equal(restored.depth,w.depth);
 assert.equal(restored.chunk(0,0).epoch,w.chunk(0,0).epoch);
 if(p)assert.equal(restored.taken.has(p.id),true);
});
test('scene mesh uses finite geometric vertices and upgrade pool is actionable',()=>{
 const w=new RogueWorld(222);
 const g=rogueStaticMesh(w,{x:9.5,z:9.5}),p=[];
 assert.ok(g.length>30000);
 assert.equal(g.length%10,0);
 assert.ok(g.every(Number.isFinite));
 roguePickupsMesh(p,w.chunk(0,0).drops,5);
 assert.equal(p.length%10,0);assert.ok(p.every(Number.isFinite));
 assert.equal(new Set(UPGRADES.map(u=>u.id)).size,UPGRADES.length);
 assert.ok(UPGRADES.length>=6);
});
