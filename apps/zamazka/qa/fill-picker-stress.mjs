import assert from 'node:assert/strict';
import {floodFillRaster} from '../fill-core.js';
import {Editor,preservePaintContours} from '../editor.js';

let checks=0;
const check=(condition,detail)=>{assert.ok(condition,detail);checks++};
const fixture=(w,h)=>{
 const walls=new Uint8ClampedArray(w*h*4),zone=new Uint8ClampedArray(w*h*4),output=new Uint8ClampedArray(w*h*4);
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 const k=(x,y)=>(y*w+x)*4;
 return {w,h,walls,zone,output,k};
};
const fill=(f,point,color,changed=new Uint8Array(f.w*f.h))=>{
 const n=floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point,color,changed});
 return {n,changed};
};
const rgb=(f,x,y)=>[...f.output.slice(f.k(x,y),f.k(x,y)+3)];
const unchanged=(f,x,y)=>f.output[f.k(x,y)+3]===0;

// Property-based contour sweeps: anti-aliasing, jagged paths, mask cutouts,
// opposite basins and repeated recolours. No paint can cross a 4-connected wall.
for(let seed=0;seed<160;seed++){
 const f=fixture(84,64);
 const line=y=>42+Math.round(5*Math.sin((y+seed)/9)+2*Math.sin((2*y+seed)/5));
 const radius=seed%4+1;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const i=f.k(x,y),edge=line(y),d=Math.abs(x-edge);
  if(x<2||x>=82||y<2||y>=62)f.zone[i+3]=0;
  else if(x===2||x===81)f.zone[i+3]=seed%2?60:110;
  if(d<radius)f.walls[i+3]=255;
  else if(d===radius)f.walls[i+3]=115+seed%100;
  else if(d===radius+1)f.walls[i+3]=seed%2?30:90;
 }
 const a=fill(f,[9,29],[220,62,44]);
 check(a.n>200,'left basin reachable seed '+seed);
 check(unchanged(f,73,29),'left leaked right seed '+seed);
 const b=fill(f,[73,29],[42,113,222]);
 check(b.n>200,'right basin reachable seed '+seed);
 check(rgb(f,9,29).join()==='220,62,44','right replaced left seed '+seed);
 const c=fill(f,[9,29],[40,180,95]);
 check(c.n>200,'left basin can be recoloured seed '+seed);
 check(rgb(f,73,29).join()==='42,113,222','recolour leaked seed '+seed);
 check(!c.changed[29*f.w+73],'touched mask spilled into adjacent basin seed '+seed);
 check(unchanged(f,0,29),'mask exterior must stay empty seed '+seed);
}
for(let seed=0;seed<50;seed++){
 const f=fixture(74,65),cx=36,cy=32,rx=10+seed%14,ry=8+seed%10;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const distance=Math.abs((x-cx)*(x-cx)/(rx*rx)+(y-cy)*(y-cy)/(ry*ry)-1);
  if(distance < .10)f.walls[f.k(x,y)+3]=255;
 }
 // Test deterministic closed rectangles too: no subpixel ellipse ambiguity.
 f.walls.fill(0);
 for(let x=12;x<60;x++){f.walls[f.k(x,10)+3]=255;f.walls[f.k(x,53)+3]=255}
 for(let y=10;y<=53;y++){f.walls[f.k(12,y)+3]=255;f.walls[f.k(59,y)+3]=255}
 for(let y=11;y<53;y++)f.walls[f.k(12,y)+3]=150+seed%100;
 fill(f,[26,23],[204,35,70]);
 check(unchanged(f,5,5),'sealed chamber escaped '+seed);
 fill(f,[5,5],[54,120,220]);
 check(rgb(f,26,23)[0]===204,'outer fill repainted inner chamber '+seed);
}
// Gaps 1 and 2 should be closed, but real isolated pockets survive.
for(const gap of [1,2]){
 const f=fixture(65,49);
 for(let y=0;y<49;y++)if(y<22||y>=22+gap)f.walls[f.k(32,y)+3]=255;
 fill(f,[12,18],[210,50,80]);
 check(unchanged(f,48,18),'single pinhole leaked across split');
}
{
 const f=fixture(9,9);
 f.walls.fill(0);
 for(let i=3;i<f.walls.length;i+=4)f.walls[i]=255;
 for(const [x,y] of [[2,2],[3,3],[5,2]])f.walls[f.k(x,y)+3]=0;
 check(fill(f,[2,2],[180,20,40]).n===1,'small true pocket incorrectly joined');
 check(unchanged(f,3,3),'diagonally touching pocket was merged');
}
// Recolour only the current basin's fringe. Pixel compositing must blend
// the actual contour pigment rather than the previous light underpaint.
{
 const output=new Uint8ClampedArray([30,110,150,255,200,100,50,255]);
 const original=new Uint8ClampedArray([162,151,132,255,17,24,33,255]);
 const walls=new Uint8ClampedArray([50,40,20,110,70,60,50,180]);
 const changed=new Uint8Array([1,0]);
 preservePaintContours(output,original,walls,changed,true);
 const a=110/255;
 check(Math.abs(output[0]-(30*(1-a)+50*a))<=1,'the anti-aliased edge still contains beige');
 check(output[4]===200&&output[5]===100,'untouched neighbouring colour changed');
}
// On the actual 600×450 buffer, both large basins should be fillable.
{
 const f=fixture(600,450);
 for(let y=0;y<450;y++)f.walls[f.k(300,y)+3]=255;
 check(fill(f,[100,200],[70,135,190]).n>100000,'large basin not filled');
 check(unchanged(f,500,200),'large basin leaked across a hard line');
}
// Fast competing picker requests: the latest requested position wins even
// when its async render resolves before the earlier request's render.
{
 const samples=[[18,45,82,255],[170,40,110,255]];
 const deferred=[];
 const p=Object.create(Editor.prototype);
 Object.assign(p,{
  canvas:{width:600,height:450,getContext(){return {getImageData(x){return {data:new Uint8ClampedArray(x<100?samples[0]:samples[1])}}}}},
  root:{querySelector(){return null},querySelectorAll(){return []}},
  color:'#304a43',strokes:[],working:null,closed:false,tool:'picker',
  onChange(){},render(){return new Promise(resolve=>deferred.push(resolve))}
 });
 const first=p.pick([10,20],true),second=p.pick([200,20],true);
 check(deferred.length===2,'picker did not start concurrent requests');
 deferred[1]();await second;
 deferred[0]();await first;
 check(p.color==='#aa286e','a stale picker request overwrote the newer colour');
}
console.log('ZAMAZKA fill/picker stress: '+checks+' assertions across 213 scenario groups passed');
