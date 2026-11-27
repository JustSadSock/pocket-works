import assert from 'node:assert/strict';
import {projectedPixel,residentCrop,depthSafe} from './atlas-resident-math.mjs';
let tested=0,maxError=0;
for(const tilt of [0,.28,.54])for(const scale of [8,19.25,36,72])for(const size of [[1120,660],[320,580],[1920,1080]]){
 const a={x:141.25,y:93.5,s:scale,datum:0},pad=96,v={x:17,y:23,width:size[0],height:size[1]},expanded={x:0,y:0,width:v.width+2*pad,height:v.height+2*pad};
 for(const dx of [-96,-31,0,4,93])for(const dy of [-96,-17,0,13,96]){
  const b={...a,x:a.x+dx/scale,y:a.y-dy/(scale*Math.sqrt(1-tilt*tilt))},c=residentCrop(a,b,tilt,v,pad);assert.ok(c);
  for(const p of [[140.5,95.8,-.035],[146.2,82.1,4.8],[141,93,0],[175,126,19]]){
   const [ax,ay,az]=projectedPixel(p,a,tilt,expanded),[bx,by,bz]=projectedPixel(p,b,tilt,v);
   const error=Math.max(Math.abs(ax-c.x+v.x-bx),Math.abs(ay-c.y+v.y-by),Math.abs(bz-az-(b.y-a.y)*tilt/160));maxError=Math.max(maxError,error);assert.ok(error<1e-9);tested++;
  }
 }
 assert.equal(residentCrop(a,{...a,x:a.x+2.4/scale},tilt,v,pad),null);assert.equal(residentCrop(a,{...a,x:a.x+97/scale},tilt,v,pad),null);assert.equal(residentCrop(a,{...a,s:scale+1},tilt,v,pad),null);
 assert.ok(depthSafe([100,60,180,130],{minZ:-.035,maxZ:19},a,tilt));assert.equal(depthSafe([100,60,180,130],{minZ:0,maxZ:1000},a,tilt),false);
}
console.log(JSON.stringify({tested,maxError,proof:'orthographic positions and constant depth shift; not raster equivalence'}));
