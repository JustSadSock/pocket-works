import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fillMatchingColorRaster,floodFillRaster} from '../fill-core.js';

let checks=0;
const check=(ok,why)=>{assert.ok(ok,why);checks++};
const fixture=(w,h)=>{
 const zone=new Uint8ClampedArray(w*h*4);
 const output=new Uint8ClampedArray(w*h*4);
 const k=(x,y)=>(y*w+x)*4;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  zone[k(x,y)+3]=255;
  output.set([232,221,198,255],k(x,y));
 }
 return {w,h,zone,output,k};
};
const write=(f,x,y,color)=>f.output.set([...color,255],f.k(x,y));
const read=(f,x,y)=>[...f.output.slice(f.k(x,y),f.k(x,y)+3)];
const paint=(f,p,color,changed)=>fillMatchingColorRaster({
 width:f.w,height:f.h,zone:f.zone,output:f.output,point:p,color,changed
});
for(let seed=0;seed<80;seed++){
 const f=fixture(134,100),cx=67,cy=50,rx=13+seed%15,ry=10+seed%18;
 const bg=[185,171,142],boundary=[26,29,34],newColor=[41+seed,123,210];
 // The SAME underlying solid pigment occupies inside AND outside.
 for(let y=5;y<95;y++)for(let x=5;x<129;x++)write(f,x,y,bg);
 for(let y=5;y<95;y++)for(let x=5;x<129;x++){
  const ellipse=Math.hypot((x-cx)/rx,(y-cy)/ry);
  if(ellipse>=.91&&ellipse<=1.17)write(f,x,y,boundary);
  // Minor antialias/pigment variation should be treated as the same colour.
  if(ellipse<.85&&seed%2===0)write(f,x,y,[bg[0]+(x%7)-3,bg[1]+(y%7)-3,bg[2]]);
 }
 const original=read(f,114,50),ring=read(f,cx+rx,cy);
 const changed=new Uint8Array(f.w*f.h),count=paint(f,[cx,cy],newColor,changed);
 check(count>200&&count<2600,'filled wrong interior area seed '+seed+': '+count);
 for(const [x,y] of [[cx,cy],[cx-5,cy],[cx+5,cy-5],[cx,cy+6]])
  check(read(f,x,y).join()===newColor.join(),'partial fill seed '+seed+' at '+x+','+y);
 check(read(f,114,50).join()===original.join(),'spilled into matching outside colour seed '+seed);
 check(read(f,cx+rx,cy).join()===ring.join(),'lost black contour seed '+seed);
 check(!changed[cy*f.w+114],'changed mask spilled seed '+seed);
 check(paint(f,[cx,cy],[70,201,113])===count,'repeat bucket missed pixels seed '+seed);
 check(read(f,114,50).join()===original.join(),'repeat spill seed '+seed);
}
{
 const f=fixture(30,30),target=[146,90,56];
 for(let y=4;y<25;y++)for(let x=4;x<25;x++)write(f,x,y,target);
 for(let y=4;y<25;y++)write(f,15,y,[31,34,40]);
 check(paint(f,[8,13],[30,130,210])===11*21,'left region must stay bounded by different colour');
 check(read(f,20,13).join()===target.join(),'right side remains original');
 check(paint(f,[20,13],[54,190,120])===9*21,'right region recolours independently');
 check(read(f,8,13)[0]===30,'second fill changed left');
}
{
 const f=fixture(40,30);
 for(let y=1;y<29;y++)for(let x=1;x<39;x++)write(f,x,y,[170,120,70]);
 for(let y=0;y<30;y++)for(let x=0;x<12;x++)f.zone[f.k(x,y)+3]=0;
 const changed=new Uint8Array(f.w*f.h);
 const n=paint(f,[20,10],[20,100,200],changed);
 check(n===27*28,'only valid damaged pixels should be recoloured');
 check(read(f,3,10)[0]===170,'outside damage colour must be unchanged');
 check(read(f,20,10)[0]===20,'inside damage colour changed');
 check(paint(f,[3,10],[5,5,5])===0,'outside damage is never a valid seed');
}
{
 const f=fixture(600,450);
 for(let y=25;y<425;y++)for(let x=25;x<575;x++)write(f,x,y,[172,139,108]);
 for(let y=25;y<425;y++)write(f,300,y,[18,18,22]);
 const t=performance.now();
 const n=paint(f,[145,200],[20,110,180]);
 check(n===275*400,'left field recolour exact count');
 check(read(f,480,200).join()==='172,139,108','large canvas fill crossed separator');
 check(read(f,300,200).join()==='18,18,22','large canvas lost separator');
 console.log('ZAMAZKA 600x450 RGB flood: '+(performance.now()-t).toFixed(1)+'ms');
}
// Legacy contour fill is still available for blank paper; colour-mode is
// opt-in at editor level and must not change traditional flood semantics.
{
 const f=fixture(25,15),walls=new Uint8ClampedArray(f.w*f.h*4);
 for(let y=0;y<15;y++)walls[f.k(12,y)+3]=255;
 const count=floodFillRaster({width:f.w,height:f.h,walls,zone:f.zone,
   output:f.output,point:[5,5],color:[40,50,60]});
 check(count===180,'existing unpainted wall-mask flood regression');
}
console.log('ZAMAZKA colour-region fill: '+checks+' assertions, 80 contour variants, same-colour outside, repeat, mask and large raster OK');
