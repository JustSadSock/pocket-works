import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE,World,generateChunk,checkConnected } from '../world.mjs';
test('every generated maze is internally connected across epochs',()=>{
 for(let seed=1;seed<=40;seed++)for(let cx=-2;cx<=2;cx++)for(let cy=-2;cy<=2;cy++)for(let epoch=0;epoch<3;epoch++){
  assert.ok(checkConnected(generateChunk(seed*911,cx,cy,epoch)),'disconnected '+[seed,cx,cy,epoch]);
 }
});
test('neighboring sectors share matching portals',()=>{
 for(let seed=0;seed<24;seed++)for(let cx=-3;cx<=3;cx++)for(let cy=-3;cy<=3;cy++){
  const a=generateChunk(seed,cx,cy,(seed+cx+8)%5),right=generateChunk(seed,cx+1,cy,(seed+cy+7)%4),south=generateChunk(seed,cx,cy+1,(seed+cx+cy+20)%7);
  for(let i=0;i<SIZE;i++){
   assert.equal(a.tiles[i*SIZE+SIZE-1]!==0,right.tiles[i*SIZE]!==0,'east/west');
   assert.equal(a.tiles[(SIZE-1)*SIZE+i]!==0,south.tiles[i]!==0,'north/south');
  }
 }
});
test('memory anchors and origin remain reachable after reform',()=>{
 for(let seed=1;seed<=15;seed++){
  const world=new World(seed),start=SIZE/2+.5;
  for(const [cx,cy] of [[1,0],[0,-1],[-1,1]])assert.ok(world.findStep(start,start,cx*SIZE+start,cy*SIZE+start,4000),'anchor '+[cx,cy]+' seed '+seed);
  world.tick(start,start,0);world.tick(SIZE*2+start,start,12);world.tick(SIZE*2+start,start,35);
  assert.ok(world.findStep(SIZE*2+start,start,start,start,4500),'return route '+seed);
 }
});
test('same seed and epoch always return identical geometry',()=>{
 const a=generateChunk(1234,-2,3,3),b=generateChunk(1234,-2,3,3);
 assert.deepEqual(Array.from(a.tiles),Array.from(b.tiles));
});
