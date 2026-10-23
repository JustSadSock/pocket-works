import assert from 'node:assert/strict';
import {smudgeStamp} from '../editor.js';
import {fillRasterBounds,extractRasterRegion} from '../fill-raster-region.js';

const W=600,H=450;
function surface(source){
 const raster=new Uint8ClampedArray(source);
 return {canvas:{width:W,height:H},raster,
  getImageData(x,y,w,h){
   const data=new Uint8ClampedArray(w*h*4);
   for(let j=0;j<h;j++)data.set(raster.subarray(((y+j)*W+x)*4,((y+j)*W+x+w)*4),j*w*4);
   return {data,width:w,height:h};
  },
  putImageData(image,x,y){
   for(let j=0;j<image.height;j++)
    raster.set(image.data.subarray(j*image.width*4,(j+1)*image.width*4),
      ((y+j)*W+x)*4);
  }};
}
const pigment=new Uint8ClampedArray(W*H*4);
let seed=0x5eede;
for(let i=0;i<pigment.length;i++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 pigment[i]=seed>>>24;
}
const cuts=[
 {x:80,y:70,w:75,h:56},
 {x:0,y:0,w:53,h:48},
 {x:W-63,y:H-57,w:63,h:57},
 {x:244,y:184,w:99,h:73}
];
let passed=0,maxFraction=0;
for(const zone of cuts){
 const full=new Uint8ClampedArray(W*H*4);
 for(let y=Math.floor(zone.y);y<Math.ceil(zone.y+zone.h);y++)
  for(let x=Math.floor(zone.x);x<Math.ceil(zone.x+zone.w);x++){
   if(x<0||x>=W||y<0||y>=H)continue;
   const u=(x-zone.x)/zone.w,v=(y-zone.y)/zone.h;
   const inside=((u-.5)/.47)**2+((v-.5)/.46)**2<1&&((x+y)%17!==0);
   full[(y*W+x)*4+3]=inside?255:0;
  }
 const bounds=fillRasterBounds(zone,1,W,H,4);
 const compact={...bounds,data:extractRasterRegion(full,W,bounds).data};
 maxFraction=Math.max(maxFraction,compact.data.length/full.length);
 assert.ok(compact.data.length<full.length*.14,'mask must use a fraction of full-raster memory');
 for(const mask of [false,true])for(const aspect of [.72,4/3,2.05])
  for(const [x,y,dx,dy,size] of [
   [zone.x+zone.w*.5,zone.y+zone.h*.5,8,4,18],
   [zone.x+4,zone.y+3,-7,-6,36],
   [zone.x+zone.w-2,zone.y+zone.h-3,9,-3,48],
   [zone.x-4,zone.y-4,0,0,10],
   [zone.x+zone.w*.65,zone.y+zone.h*.3,-11,8,24]
  ]){
   const old=surface(pigment),now=surface(pigment);
   smudgeStamp(old,x,y,size,dx,dy,mask,full,aspect);
   smudgeStamp(now,x,y,size,dx,dy,mask,compact,aspect);
   assert.deepEqual(now.raster,old.raster,
    'cropped mask must be pixel-identical '+JSON.stringify({zone,mask,aspect,x,y}));
   passed++;
  }
}
assert.equal(passed,120);
console.log(JSON.stringify({scenario:'zamazka-cropped-smudge-stencil',
 cases:passed,maxMaskMemoryFraction:+maxFraction.toFixed(3),pixelIdentical:true}));
