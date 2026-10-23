import assert from 'node:assert/strict';
import {smudgeStamp} from '../editor.js';

// A single long brush gesture should keep one source-copy buffer per canvas
// context, growing only when the brush needs a larger sample window.
const Native=globalThis.Uint8ClampedArray;
let allocations=0;
class CountedSource extends Native {
 constructor(...args){super(...args);allocations++}
}
function context(){
 const w=600,h=450;
 const source=new Native(w*h*4);
 for(let i=0;i<source.length;i+=4){
  source[i]=210;source[i+1]=94;source[i+2]=80;source[i+3]=255;
 }
 return {canvas:{width:w,height:h},
  getImageData(x,y,width,height){
   const data=new Native(width*height*4);
   for(let row=0;row<height;row++)
    data.set(source.subarray(((y+row)*w+x)*4,((y+row)*w+x+width)*4),row*width*4);
   return {data,width,height};
  },
  putImageData(image,x,y){
   for(let row=0;row<image.height;row++)
    source.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),
      ((y+row)*w+x)*4);
  }};
}
const first=context(),second=context();
try{
 globalThis.Uint8ClampedArray=CountedSource;
 for(let i=0;i<100;i++)
  smudgeStamp(first,130+i*2,160+Math.sin(i/5)*15,12,3,4);
 assert.equal(allocations,1,'one stable brush needs only one source buffer');
 for(let i=0;i<30;i++)
  smudgeStamp(first,360,210,48,-6,4);
 assert.equal(allocations,2,'larger brush grows its buffer only once');
 for(let i=0;i<40;i++)
  smudgeStamp(first,180,240,8,-3,2);
 assert.equal(allocations,2,'smaller brush reuses high-water source capacity');
 smudgeStamp(second,180,240,8,4,2);
 assert.equal(allocations,3,'independent canvases must never share pigment buffer');
}finally{globalThis.Uint8ClampedArray=Native}
console.log(JSON.stringify({scenario:'zamazka-smudge-source-reuse',
 stamps:171,sourceAllocations:allocations,result:'passed'}));
