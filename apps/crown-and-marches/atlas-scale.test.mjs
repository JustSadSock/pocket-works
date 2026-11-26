import assert from 'node:assert/strict';
import {scaleTerrainSource,clearScaleTiles} from './genesis-contours.mjs';
const W=64,H=32,r=4,w=W*r+1,h=H*r+1,n=w*h,bed=new Float32Array(n),land=new Uint8Array(n),rain=new Float32Array(n).fill(.55);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;bed[i]=.12+(x/r-8+Math.sin(y/r*.3))*.005;land[i]=+(bed[i]>.12);}
const g={detail:r,width:w,height:h,bed,land,rain,lakeWater:new Uint8Array(n),lakeId:new Int32Array(n),lakeLevels:new Float32Array(1),flow:new Float32Array(n),down:new Int32Array(n).fill(-1)},m={geography:g,land:Uint8Array.from({length:W*H},(_,i)=>land[(Math.floor(i/W)*r+2)*w+(i%W)*r+2]),fert:new Float32Array(W*H).fill(.5)},s={mapVersion:3,autonomous:true,map:m};
const options={detail:2,contourDetail:2,vertical:x=>x},a=await scaleTerrainSource(s,{}, {...options,bounds:[0,0,64,32]}),b=await scaleTerrainSource(s,{}, {...options,bounds:[32,0,64,32]});
assert.equal(a.stats.tileMisses,2);assert.equal(b.stats.tileHits,1);assert.equal(b.stats.contourHits,1);assert.ok(a.vertices.every(Number.isFinite));assert.ok(a.contours.stats.sea>0);
for(let y=0;y<b.rows;y++)for(let x=0;x<b.cols;x++){const i=y*b.cols+x,j=y*a.cols+x+64;for(let k=0;k<9;k++)assert.equal(b.vertices[i*9+k],a.vertices[j*9+k]);}
clearScaleTiles(g);const again=await scaleTerrainSource(s,{}, {...options,bounds:[32,0,64,32]});assert.equal(again.stats.tileMisses,1);assert.deepEqual(b.vertices,again.vertices);assert.deepEqual(b.contours.chunks,again.contours.chunks);
await assert.rejects(()=>scaleTerrainSource({...s,autonomous:false},{},{...options,bounds:[0,0,32,32]}));
