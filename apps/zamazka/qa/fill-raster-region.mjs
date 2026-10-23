import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fillRegion} from '../editor.js';
import {fillRasterBounds} from '../fill-raster-region.js';

// Compare complete legacy-size flood fills with bounded processing against the
// identical original pixels, masks, contours and smudge-coloured pigment.
const W=1200,H=900,WIDTH=W*H,bytes=WIDTH*4;
const zone={x:125,y:93,w:160,h:120};
const bounds=fillRasterBounds(zone,2,W,H);
assert.ok(bounds.width*bounds.height/WIDTH<.08,'damage ROI should avoid most of the painting');
function surface(data){
 const pixels=new Uint8ClampedArray(data),reads=[];
 return {canvas:{width:W,height:H},pixels,ctx:{
  getImageData(x,y,w,h){
   reads.push(w*h*4);
   const part=new Uint8ClampedArray(w*h*4);
   for(let row=0;row<h;row++){
    const offset=((y+row)*W+x)*4;
    part.set(pixels.subarray(offset,offset+w*4),row*w*4);
   }
   return {width:w,height:h,data:part};
  },
  putImageData(image,x,y){
   for(let row=0;row<image.height;row++)
    pixels.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),
     ((y+row)*W+x)*4);
  }
 },reads};
}
const image=new Uint8ClampedArray(bytes),walls=new Uint8ClampedArray(bytes),mask=new Uint8ClampedArray(bytes);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const at=(y*W+x)*4;
 image[at]=232;image[at+1]=221;image[at+2]=198;image[at+3]=255;
 if(x>=250&&x<=570&&y>=186&&y<=426)mask[at+3]=255;
 if(x===410&&y>=186&&y<=426)walls[at+3]=255;
}
function run(name,seed,color,{pigment=false,priority=false}={}){
 const initial=new Uint8ClampedArray(image);
 if(pigment){
  for(let y=220;y<400;y++)for(let x=280;x<408;x++){
   const i=(y*W+x)*4;initial[i]=120;initial[i+1]=84;initial[i+2]=60;
  }
 }
 const referencePaint=surface(initial),fastPaint=surface(initial);
 const referenceLines=surface(walls),fastLines=surface(walls);
 const boundary=priority?{walls:{width:W,height:H,data:walls},bounds:{
  minX:125,minY:93,maxX:285,maxY:213
 }}:null;
 const started=performance.now();
 fillRegion(referenceLines,referencePaint,{width:W,height:H,data:mask},seed,color,boundary);
 const referenceMs=performance.now()-started;
 const begun=performance.now();
 fillRegion(fastLines,fastPaint,{width:W,height:H,data:mask},seed,color,boundary,zone);
 const boundedMs=performance.now()-begun;
 assert.deepEqual(fastPaint.pixels,referencePaint.pixels,name+' must be pixel-identical');
 assert.ok(fastPaint.reads.reduce((a,b)=>a+b,0)<referencePaint.reads.reduce((a,b)=>a+b,0)*.1,
  name+' should read under 10% of original raster bytes');
 return {name,referenceMs:+referenceMs.toFixed(2),boundedMs:+boundedMs.toFixed(2),
  oldReadMB:+(referencePaint.reads.reduce((a,b)=>a+b,0)/1e6).toFixed(2),
  newReadMB:+(fastPaint.reads.reduce((a,b)=>a+b,0)/1e6).toFixed(2)};
}
const results=[
 run('split contour left',[165,150],'#c92b44'),
 run('recolour existing paint',[165,150],'#33aaff',{pigment:true}),
 run('priority outline fallback',[165,150],'#88cc33',{priority:true}),
 run('outside damage',[30,30],'#aaccee')
];
console.log(JSON.stringify({scenario:'zamazka-bounded-flood-fill',
 regionFraction:+(bounds.width*bounds.height/WIDTH).toFixed(3),cases:results,result:'passed'}));
