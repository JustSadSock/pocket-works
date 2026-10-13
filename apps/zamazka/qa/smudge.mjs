import assert from 'node:assert/strict';
import {smudgeStroke} from '../editor.js';

// A deterministic, dependency-free Canvas2D raster. The test exercises real
// pigment movement rather than merely checking that the toolbar has a button.
const width=600,height=450,pixels=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const k=(y*width+x)*4,red=x<300;
 pixels[k]=red?220:30;pixels[k+1]=red?40:60;pixels[k+2]=red?30:210;pixels[k+3]=255;
}
const get=(x,y)=>Array.from(pixels.slice((y*width+x)*4,(y*width+x)*4+4));
const raster={
 canvas:{width,height},
 getImageData(x,y,w,h){
  const data=new Uint8ClampedArray(w*h*4);
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
   const from=((y+row)*width+x+col)*4,to=(row*w+col)*4;
   data.set(pixels.subarray(from,from+4),to);
  }
  return {data,width:w,height:h};
 },
 putImageData(image,x,y){
  for(let row=0;row<image.height;row++)for(let col=0;col<image.width;col++){
   const from=(row*image.width+col)*4,to=((y+row)*width+x+col)*4;
   pixels.set(image.data.subarray(from,from+4),to);
  }
 }
};
const untouched=get(450,225),before=get(304,225);
smudgeStroke(raster,{t:'smudge',s:22,c:'#304a43',p:[[294,225],[298,225],[302,225],[306,225],[311,225]]});
const after=get(304,225);
assert.ok(after[0]>before[0]&&after[2]<before[2],'smudging carries warm pigment into cold pigment');
assert.deepEqual(get(450,225),untouched,'raster changes remain local to the nib');
assert.deepEqual(get(304,225),after,'smudge output remains a stable painted pixel');
console.log('ZAMAZKA: smudging mixes existing pixels without affecting distant paint OK');
