import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {smudgeStamp,smudgeStroke} from '../editor.js';

// Independent reference preserves the original sample/weight equation. The
// fast renderer must produce the same Uint8ClampedArray for every tested case.
function reference(ctx,x,y,size,dx,dy,mask=false,zoneMask=null,aspect=600/450){
 const W=600,H=450;
 const widthFull=ctx.canvas.width,heightFull=ctx.canvas.height,scale=heightFull/H;
 const correction=(W/H)/Math.max(.1,aspect);
 const radiusY=Math.min(75,Math.max(3,Math.round(size*scale*.56)));
 const radiusX=Math.max(2,Math.round(radiusY*correction));
 const pullY=Math.max(2,Math.round(radiusY*.34)),pullX=Math.max(1,Math.round(pullY*correction));
 const blurY=Math.max(1,Math.round(radiusY*.10)),blurX=Math.max(1,Math.round(blurY*correction));
 const cx=Math.round(x*widthFull/W),cy=Math.round(y*scale);
 const left=Math.max(0,cx-radiusX-pullX-blurX-2),top=Math.max(0,cy-radiusY-pullY-blurY-2);
 const right=Math.min(widthFull,cx+radiusX+pullX+blurX+3),bottom=Math.min(heightFull,cy+radiusY+pullY+blurY+3);
 if(left>=right||top>=bottom)return;
 const width=right-left,height=bottom-top,pixels=ctx.getImageData(left,top,width,height);
 const src=new Uint8ClampedArray(pixels.data),dst=pixels.data;
 const len=Math.hypot(dx/correction,dy);
 const sx=len?Math.round(dx/correction/len*pullX):0,sy=len?Math.round(dy/len*pullY):0;
 const region=zoneMask?.data||zoneMask;
 const valid=(px,py)=>{
  if(px<0||py<0||px>=widthFull||py>=heightFull)return false;
  return !region||region[(py*widthFull+px)*4+3]>=120;
 };
 const at=(px,py)=>(py*width+px)*4;
 for(let py=Math.max(0,cy-radiusY-top);py<Math.min(height,cy+radiusY+1-top);py++){
  for(let px=Math.max(0,cx-radiusX-left);px<Math.min(width,cx+radiusX+1-left);px++){
   const absX=px+left,absY=py+top;
   if(!valid(absX,absY))continue;
   const dist=Math.hypot((absX-cx)/radiusX,(absY-cy)/radiusY);
   if(dist>=1)continue;
   const weight=.72*Math.pow(1-dist,1.45),i=at(px,py);
   let sum=0,parts=[0,0,0,0];
   for(const [ox,oy,k] of [[-sx,-sy,3],[-sx+blurX,-sy,1],[-sx-blurX,-sy,1],
                           [-sx,-sy+blurY,1],[-sx,-sy-blurY,1]]){
    const xx=absX+ox,yy=absY+oy;
    if(!valid(xx,yy)||xx<left||xx>=right||yy<top||yy>=bottom)continue;
    const a=at(xx-left,yy-top);
    for(let ch=mask?3:0;ch<(mask?4:3);ch++)parts[ch]+=src[a+ch]*k;
    sum+=k;
   }
   if(!sum)continue;
   for(let ch=mask?3:0;ch<(mask?4:3);ch++)
    dst[i+ch]=src[i+ch]*(1-weight)+parts[ch]/sum*weight;
  }
 }
 ctx.putImageData(pixels,left,top);
}
function surface(width,height,original){
 const raster=new Uint8ClampedArray(original);
 return {
  canvas:{width,height},
  raster,
  getImageData(left,top,w,h){
   const data=new Uint8ClampedArray(w*h*4);
   for(let y=0;y<h;y++)data.set(raster.subarray(((top+y)*width+left)*4,((top+y)*width+left+w)*4),y*w*4);
   return {data,width:w,height:h};
  },
  putImageData(pixels,left,top){
   for(let y=0;y<pixels.height;y++)
    raster.set(pixels.data.subarray(y*pixels.width*4,(y+1)*pixels.width*4),
     ((top+y)*width+left)*4);
  }
 };
}
const width=600,height=450;
const pixels=new Uint8ClampedArray(width*height*4);
let rand=0x5EED;
for(let i=0;i<pixels.length;i++){rand=(Math.imul(rand,1664525)+1013904223)>>>0;pixels[i]=rand>>>24}
const zone=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)
 zone[(y*width+x)*4+3]=(x>65&&y>30&&x<530&&y<405&&((x+y)%11!==0))?255:0;
let cases=0,optimizedMs=0,referenceMs=0;
for(const mask of [false,true])for(const aspect of [.72,600/450,2.05])
for(const [x,y,size,dx,dy] of [
 [250,200,12,8,4],[70,36,48,-15,5],[525,396,20,12,-12],
 [10,8,2,0,0],[400,210,8,-12,-7]
]){
 const expected=surface(width,height,pixels),actual=surface(width,height,pixels);
 const start=performance.now();
 reference(expected,x,y,size,dx,dy,mask,zone,aspect);
 referenceMs+=performance.now()-start;
 const second=performance.now();
 smudgeStamp(actual,x,y,size,dx,dy,mask,zone,aspect);
 optimizedMs+=performance.now()-second;
 assert.deepEqual(actual.raster,expected.raster,
  'smudge must be pixel-identical for '+JSON.stringify({mask,aspect,x,y,size}));
 cases++;
}
// A single continuously held brush reuses its source scratch across hundreds
// of stamps. Compare each entire gesture with the independent legacy algorithm,
// including the alpha-only contour mask and non-square painting proportions.
const longGesture={s:18,p:Array.from({length:96},(_,i)=>
 [155+i*2.5,190+Math.sin(i/6)*15])};
for(const mask of [false,true])for(const aspect of [.72,600/450,2.05]){
 const legacy=surface(width,height,pixels),fast=surface(width,height,pixels);
 const points=longGesture.p,spacing=Math.max(1.4,Math.min(7,longGesture.s*.23));
 reference(legacy,points[0][0],points[0][1],longGesture.s,0,0,mask,zone,aspect);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/spacing));
  for(let j=1;j<=steps;j++)
   reference(legacy,a[0]+dx*j/steps,a[1]+dy*j/steps,
    longGesture.s,dx,dy,mask,zone,aspect);
 }
 smudgeStroke(fast,longGesture,0,mask,zone,aspect);
 assert.deepEqual(fast.raster,legacy.raster,
  'long continuously held smudge must match old brush pixel for pixel');
 cases++;
}
console.log(JSON.stringify({scenario:'zamazka-smudge-pixel-parity',
 cases,referenceMs:+referenceMs.toFixed(2),optimizedMs:+optimizedMs.toFixed(2),pixelIdentical:true}));
