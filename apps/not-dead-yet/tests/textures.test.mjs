import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMaterialAtlas,MATERIALS} from '../textures.mjs';

test('offline material atlas is a compact valid RGBA WebGL1 image',()=>{
 const art=makeMaterialAtlas(17);
 assert.equal(art.width,384);assert.equal(art.height,384);
 assert.equal(art.pixels.length,art.width*art.height*4);
 assert.ok(art.pixels.byteLength<800_000,'mobile budget exceeded');
 for(let i=3;i<art.pixels.length;i+=4)assert.equal(art.pixels[i],255,'an atlas texel is missing opacity');
 assert.equal(MATERIALS.length,11);
});
test('textures are seeded, non-flat, visually different and repeatable',()=>{
 const a=makeMaterialAtlas(14,{tileSize:32}),b=makeMaterialAtlas(14,{tileSize:32}),c=makeMaterialAtlas(15,{tileSize:32});
 assert.deepEqual(a.pixels,b.pixels);
 assert.notDeepEqual(a.pixels,c.pixels);
 const means=[],variety=[];
 for(let tile=0;tile<11;tile++){
  const col=tile%4,row=Math.floor(tile/4),sample=[];
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)sample.push(a.pixels[((row*32+y)*a.width+col*32+x)*4]);
  means.push(sample.reduce((sum,v)=>sum+v,0)/sample.length);
  variety.push(new Set(sample).size);
 }
 assert.ok(means.some(x=>x<190)&&means.some(x=>x>220),'textures lack purposeful distinct tonal bases');
 assert.ok(variety.every(x=>x>=15),'one surface rendered as a flat color');
});
test('material tile size is bounded even under incorrect runtime options',()=>{
 assert.equal(makeMaterialAtlas(19,{tileSize:1}).tileSize,16);
 assert.equal(makeMaterialAtlas(19,{tileSize:500}).tileSize,256);
});
