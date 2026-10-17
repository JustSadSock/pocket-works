import test from 'node:test';
import assert from 'node:assert/strict';
import {setSeed,generateOrgan,CELLS_PER_CHUNK,edgeCoord,edgeOpen} from '../organGen.js';
const size=CELLS_PER_CHUNK;
test('procedural rooms are deterministic for a given seed',()=>{
 setSeed(8128); const a=generateOrgan(-2,3); const b=generateOrgan(-2,3);
 assert.deepEqual(a,b);assert.ok(a.length>8);
 assert.ok(a.every(c=>c.x>=-2*size&&c.x<(-2+1)*size&&c.y>=3*size&&c.y<4*size));
});
test('every chunk opens to its neighbours on the same portal',()=>{
 for(const s of [0,42,413,99123]){
   setSeed(s);
   for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){
     const a=new Set(generateOrgan(x,y).map(c=>c.x+','+c.y));
     const east=new Set(generateOrgan(x+1,y).map(c=>c.x+','+c.y));
     const south=new Set(generateOrgan(x,y+1).map(c=>c.x+','+c.y));
     const ez=edgeCoord(x,y,1),sz=edgeCoord(x,y,2);
     assert.ok(edgeOpen(x,y,1));assert.ok(edgeOpen(x,y,2));
     assert.equal(ez,edgeCoord(x+1,y,3));assert.equal(sz,edgeCoord(x,y+1,0));
     assert.ok(a.has(((x+1)*size-1)+','+(y*size+ez)));
     assert.ok(east.has(((x+1)*size)+','+(y*size+ez)));
     assert.ok(a.has((x*size+sz)+','+((y+1)*size-1)));
     assert.ok(south.has((x*size+sz)+','+((y+1)*size)));
   }
 }
});
test('spawn chunk has a navigable connected component',()=>{
 setSeed(2026);const cells=generateOrgan(0,0);const set=new Set(cells.map(c=>c.x+','+c.y));const first=cells[0],seen=new Set([first.x+','+first.y]),q=[first];
 for(let i=0;i<q.length;i++){const c=q[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=(c.x+dx)+','+(c.y+dy);if(set.has(n)&&!seen.has(n)){seen.add(n);q.push({x:c.x+dx,y:c.y+dy});}}}
 assert.equal(seen.size,cells.length);
});