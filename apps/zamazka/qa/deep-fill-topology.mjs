import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {floodFillRaster} from '../fill-core.js';

// Independent reference: no intentional 1-2 px pinholes in generated fixtures.
const t0=performance.now();
let checks=0, filledCells=0,maxMs=0,layouts=0;
const check=(ok,why)=>{assert.ok(ok,why);checks++};
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
function fixture(w,h){
 const n=w*h,walls=new Uint8ClampedArray(n*4),zone=new Uint8ClampedArray(n*4),output=new Uint8ClampedArray(n*4);
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 return {w,h,walls,zone,output,index:(x,y)=>y*w+x,pixel:(x,y)=>(y*w+x)*4};
}
const wall=(f,x,y,alpha=255)=>{if(x>=0&&y>=0&&x<f.w&&y<f.h)f.walls[f.pixel(x,y)+3]=alpha};
const mask=(f,x,y,alpha=0)=>{if(x>=0&&y>=0&&x<f.w&&y<f.h)f.zone[f.pixel(x,y)+3]=alpha};
function reference(f,start){
 const count=f.w*f.h,mark=new Uint8Array(count),queue=new Int32Array(count);
 const eligible=i=>f.zone[i*4+3]>=120&&f.walls[i*4+3]<96;
 if(!eligible(start))return mark;
 let head=0,end=1;queue[0]=start;mark[start]=1;
 while(head<end){
  const i=queue[head++],x=i%f.w,y=(i/f.w)|0;
  for(const j of [x>0?i-1:-1,x<f.w-1?i+1:-1,y>0?i-f.w:-1,y<f.h-1?i+f.w:-1])
   if(j>=0&&!mark[j]&&eligible(j)){mark[j]=1;queue[end++]=j}
 }
 return mark;
}
const palette=[[219,54,31],[21,111,210],[66,202,90],[244,180,18]];
function exercise(f,seed){
 const rand=rng(seed*1299709+17),good=[];
 for(let i=0;i<f.w*f.h;i++)if(f.zone[4*i+3]>=120&&f.walls[4*i+3]<96)good.push(i);
 if(!good.length)return;
 layouts++;
 const savedWalls=f.walls.slice(),savedZone=f.zone.slice();
 const origin=good[Math.floor(rand()*good.length)],point=[origin%f.w,Math.floor(origin/f.w)];
 const expected=reference(f,origin),expectedCount=expected.reduce((a,b)=>a+b,0);
 for(let round=0;round<4;round++){
  const changed=new Uint8Array(f.w*f.h),start=performance.now();
  const count=floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point,color:palette[round],changed});
  maxMs=Math.max(maxMs,performance.now()-start);
  check(count===expectedCount,'reference count disagreement seed='+seed+' round='+round+' '+count+'/'+expectedCount);
  for(const i of good){
   const k=i*4;
   if(expected[i])check(f.output[k]===palette[round][0]&&f.output[k+1]===palette[round][1]&&
    f.output[k+2]===palette[round][2]&&changed[i]===1,'missing reachable point seed='+seed+' round='+round+' cell='+i);
   else check(changed[i]===0&&f.output[k+3]===0,'leaking into other component seed='+seed+' round='+round+' cell='+i);
  }
  filledCells+=count;
 }
 check(f.walls.every((v,i)=>v===savedWalls[i]),'source contour mutated seed '+seed);
 check(f.zone.every((v,i)=>v===savedZone[i]),'cutout mask mutated seed '+seed);
}
function generate(seed){
 const rand=rng(seed+0x9e3779b9),w=44+seed%19,h=39+(seed*7)%16,f=fixture(w,h),mode=seed%9;
 if(mode===0){
  for(let n=0;n<5;n++){
   const x=5+Math.floor(rand()*(w-18)),y=4+Math.floor(rand()*(h-16));
   const rw=3+Math.floor(rand()*5),rh=5+Math.floor(rand()*8);
   for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)wall(f,xx,yy);
  }
 }else if(mode===1){
  const mx=Math.floor(w/2),my=Math.floor(h/2);
  for(const r of [7,14])for(let y=my-r;y<=my+r;y++)for(let x=mx-r;x<=mx+r;x++)
   if(Math.abs(x-mx)>=r-1||Math.abs(y-my)>=r-1)wall(f,x,y);
 }else if(mode===2){
  for(const x of [Math.floor(w/3),Math.floor(w*2/3)])for(let y=0;y<h;y++)
   if(y<10||y>15)for(let dx=0;dx<3;dx++)wall(f,x+dx,y);
 }else if(mode===3){
  for(let y=0;y<h;y++){const x=Math.floor(w/2+Math.sin(y/5+seed)*6);for(let dx=-2;dx<=2;dx++)wall(f,x+dx,y)}
 }else if(mode===4){
  for(let y=0;y<h;y++){const x=Math.floor(8+y*.5);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)wall(f,x+dx,y+dy)}
 }else if(mode===5){
  for(let j=0;j<10;j++){const x=5+Math.floor(rand()*(w-14)),y=5+Math.floor(rand()*(h-14));
   for(let yy=y;yy<y+4;yy++)for(let xx=x;xx<x+4;xx++)mask(f,xx,yy)}
 }else if(mode===6){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   if(x<4+Math.floor(y/12)||x>=w-5-Math.floor(y/15)||y<3||y>h-4)mask(f,x,y);
   else if(x===4+Math.floor(y/12))mask(f,x,y,96);
  }
  for(let y=0;y<h;y++)for(let x=Math.floor(w/2)-1;x<=Math.floor(w/2)+1;x++)wall(f,x,y);
 }else if(mode===7){
  for(let j=0;j<7;j++){const x=4+Math.floor(rand()*(w-13)),y=4+Math.floor(rand()*(h-13));
   for(let t=0;t<8;t++)for(let d=0;d<3;d++){
    wall(f,x+t,y+d);wall(f,x+t,y+7-d);wall(f,x+d,y+t);wall(f,x+7-d,y+t)
   }
  }
 }else{
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x+y*3+seed)%23<3)mask(f,x,y);
 }
 return f;
}
for(let seed=0;seed<2500;seed++)exercise(generate(seed),seed);
for(let seed=0;seed<200;seed++){
 const f=generate(seed+30000),g=fixture(f.h,f.w);
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const a=f.pixel(x,y),b=g.pixel(f.h-y-1,x);
  g.walls[b+3]=f.walls[a+3];g.zone[b+3]=f.zone[a+3];
 }
 const points=[];
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)
  if(f.zone[f.pixel(x,y)+3]>=120&&f.walls[f.pixel(x,y)+3]<96)points.push([x,y]);
 if(!points.length)continue;
 const p=points[points.length>>1],rot=[f.h-p[1]-1,p[0]];
 const n=floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point:p,color:palette[0]});
 const m=floodFillRaster({width:g.w,height:g.h,walls:g.walls,zone:g.zone,output:g.output,point:rot,color:palette[0]});
 check(n===m,'90-degree rotated seed count differs: '+seed);
 for(const [x,y] of points){
  const a=f.pixel(x,y),b=g.pixel(f.h-y-1,x);
  check(f.output[a]===g.output[b]&&f.output[a+3]===g.output[b+3],'90-degree rotation changed reachable point seed '+seed);
 }
}
for(let r=12;r<=27;r++){
 const f=fixture(92,85),cx=46,cy=42;
 for(const radius of [r,r+8])for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++)
  if(Math.abs(x-cx)>=radius-1||Math.abs(y-cy)>=radius-1)wall(f,x,y);
 const inner=[cx,cy],middle=[cx+r+3,cy],outer=[2,2];
 const paint=(p,c)=>floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point:p,color:c});
 check(paint(middle,palette[0])>50,'middle ring empty '+r);
 check(paint(inner,palette[1])>50,'inner ring empty '+r);
 check(paint(outer,palette[2])>50,'outer ring empty '+r);
 check(paint(middle,palette[3])>50,'middle ring recolour empty '+r);
 check(f.output[f.pixel(cx,cy)]===palette[1][0],'inner recoloured by mistake '+r);
 check(f.output[f.pixel(2,2)]===palette[2][0],'outer recoloured by mistake '+r);
 check(f.output[f.pixel(cx+r+3,cy)]===palette[3][0],'middle did not recolour '+r);
}
for(let alpha=0;alpha<256;alpha+=4){
 const f=fixture(36,28);
 for(let y=0;y<28;y++)for(let x=18;x<36;x++)mask(f,x,y,alpha);
 for(let y=0;y<28;y++)wall(f,17,y);
 floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point:[5,14],color:palette[0]});
 check(f.output[f.pixel(33,14)+3]===0,'crossed mask/barrier alpha '+alpha);
}
console.log('ZAMAZKA DEEP FILL: '+checks+' assertions; '+layouts+' randomized layouts x4 recolours; 200 rotations; 16 nested cycles; 64 mask alphas; '+filledCells+' reached pixels, slowest '+maxMs.toFixed(2)+'ms; elapsed '+((performance.now()-t0)/1000).toFixed(2)+'s');
