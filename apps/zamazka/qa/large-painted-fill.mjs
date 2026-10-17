import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {floodFillRaster} from '../fill-core.js';

// Unlike small 40x40 topology fixtures, this exercises the actual 2x bucket
// work buffer (1200x900), including pixels ALREADY painted opaque by earlier
// buckets. Previous colours must never become barriers.
const W=1200,H=900,N=W*H,at=(x,y)=>(y*W+x)*4;
const walls=new Uint8ClampedArray(N*4),zone=new Uint8ClampedArray(N*4),
 paint=new Uint8ClampedArray(N*4),oldColors=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const i=at(x,y);
 zone[i+3]=(x<14||x>W-15||y<12||y>H-13)?0:255;
 if(x>=596&&x<=602)walls[i+3]=255;
 // Start from already coloured opaque paint (not blank transparent pixels).
 paint[i]=170;paint[i+1]=139;paint[i+2]=100;paint[i+3]=255;
}
const changed=new Uint8Array(N);
const fill=(x,color)=>{
 changed.fill(0);
 const start=performance.now();
 const n=floodFillRaster({width:W,height:H,walls,zone,output:paint,
  point:[x,450],color,changed});
 const ms=performance.now()-start;
 assert.ok(n>400000,'large already-painted basin must remain fillable');
 return ms;
};
const rgb=(x,y)=>Array.from(paint.slice(at(x,y),at(x,y)+3));
const timings=[];
const palettes=[[31,104,190],[202,67,46],[45,180,97],[193,131,31]];
for(let round=0;round<12;round++){
 const side=round%2?'right':'left',x=side==='left'?210:980;
 const colour=palettes[round%palettes.length],other=side==='left'?980:210;
 const prior=rgb(other,450);
 timings.push(fill(x,colour));
 assert.deepEqual(rgb(x,450),colour,'new pigment did not recolour existing painted area at '+round);
 assert.deepEqual(rgb(other,450),prior,'recolour leaked across thick separator at '+round);
 assert.equal(changed[450*W+other],0,'other side was marked touched at '+round);
 assert.equal(changed[450*W+x],1,'source area not marked touched at '+round);
 assert.deepEqual(rgb(x,500),colour,'large region recoloured only partially at '+round);
 // Already-filled edge of a region must not become an invisible new barrier.
 assert.deepEqual(rgb(x,150),colour,'previous opaque colour blocked the flood at '+round);
 oldColors.push(colour);
}
const stableWalls=walls[at(600,450)+3];
assert.equal(stableWalls,255,'no bucket may mutate the contour');
assert.equal(zone[at(7,450)+3],0,'no bucket may modify damage alpha');
const openWalls=new Uint8ClampedArray(N*4),openInk=new Uint8ClampedArray(N*4);
for(let i=3;i<openInk.length;i+=4)openInk[i]=255;
for(const colour of [[112,34,211],[40,199,130]]){
 const n=floodFillRaster({width:W,height:H,walls:openWalls,zone,output:openInk,
  point:[400,400],color:colour});
 assert.ok(n>1000000,'complete large damaged field must be fillable');
 for(const [x,y] of [[50,20],[300,350],[600,650],[1100,790]])
  assert.deepEqual(Array.from(openInk.slice(at(x,y),at(x,y)+3)),colour,
   'a large previously painted unbounded region must recolour everywhere');
}
console.log('ZAMAZKA large recolour: 12 alternating 1200x900 basin fills, 2 complete painted-field recolours, masks and pixel isolation OK; median '+timings.slice().sort((a,b)=>a-b)[6].toFixed(0)+'ms/fill');
