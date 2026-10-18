import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {floodFillRaster} from '../fill-core.js';
import {enclosingContourAt,fillEscapedContour} from '../fill-contours.js';

const W=160,H=130,n=W*H,at=(x,y)=>(y*W+x)*4;
const walls=new Uint8ClampedArray(n*4),outline=new Uint8ClampedArray(n*4);
const zone=new Uint8ClampedArray(n*4),output=new Uint8ClampedArray(n*4);
const changed=new Uint8Array(n);
for(let i=3;i<zone.length;i+=4)zone[i]=255;
const cx=80,cy=64,r=28;
const thickBackground={t:'brush',s:11,c:'#915b43',p:[]};
for(let y=22;y<=106;y+=6){
 const points=y%12===4?[[24,y],[136,y]]:[[136,y],[24,y]];
 thickBackground.p.push(...points);
 for(let x=24;x<=136;x++)for(let dy=-5;dy<=5;dy++)
  if(y+dy>=0&&y+dy<H)walls[at(x,y+dy)+3]=255;
}
const circle={t:'brush',s:3,c:'#222222',p:[]};
for(let i=0;i<=96;i++){
 const a=i/96*Math.PI*2;
 circle.p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);
}
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const d=Math.abs(Math.hypot(x-cx,y-cy)-r);
 if(d<2.1){walls[at(x,y)+3]=255;outline[at(x,y)+3]=255;}
 // Already-painted pigment has no special status when choosing the new colour.
 const k=at(x,y);output[k]=130;output[k+1]=62;output[k+2]=56;output[k+3]=255;
}
const strokes=[thickBackground,circle];
const selection=enclosingContourAt(strokes,strokes.length,[cx,cy],W/H);
assert(selection,'new enclosing contour must be discovered over solid old paint');
assert.equal(selection.start,1,'older filled square is not selected as the boundary');
const previousOutput=new Uint8ClampedArray(output);
assert.equal(floodFillRaster({width:W,height:H,walls,zone,output,
 point:[cx,cy],color:[40,140,230]}),0,
 'reproduce the previous bug: an opaque painted base blocks the clicked seed');
const filled=floodFillRaster({width:W,height:H,walls:outline,zone,output,
 point:[cx,cy],color:[40,140,230],changed});
assert(filled>1800&&filled<2800,'bucket fills the full interior of the new circle');
assert.equal(fillEscapedContour(changed,W,H,selection.bounds),false,'sealed circular basin stays inside the contour bounds');
assert.deepEqual(Array.from(output.slice(at(cx,cy),at(cx,cy)+3)),[40,140,230],
 'old painted pigment inside the circle must be replaced');
assert.deepEqual(Array.from(output.slice(at(cx+42,cy),at(cx+42,cy)+3)),
 Array.from(previousOutput.slice(at(cx+42,cy),at(cx+42,cy)+3)),
 'outside old pigment must not be overwritten');
const recolour=floodFillRaster({width:W,height:H,walls:outline,zone,output,
 point:[cx,cy],color:[80,210,120],changed:new Uint8Array(n)});
assert.equal(recolour,filled,'subsequent recolour must reach the same region');
assert.deepEqual(Array.from(output.slice(at(cx,cy),at(cx,cy)+3)),[80,210,120]);
const nested={...circle,p:circle.p.map(([x,y])=>[cx+(x-cx)*.55,cy+(y-cy)*.55])};
assert.equal(enclosingContourAt([...strokes,nested],3,[cx,cy],W/H).start,2,
 'latest nested closed contour should take precedence');
assert.equal(enclosingContourAt(strokes,2,[cx+40,cy],W/H),null,
 'clicks outside the outline must preserve traditional bucket semantics');
assert.equal(enclosingContourAt([thickBackground,{...circle,p:circle.p.slice(0,65)}],2,[cx,cy],W/H),null,
 'open strokes must not be treated as a closed boundary');
assert.equal(enclosingContourAt([{...circle,p:[[40,40],[100,40],[100,90],[40,90],[40,40]]}],1,[60,60],W/H).start,0,
 'rectangular closed contour must be accepted with few points');
const escaped=new Uint8Array(n);
escaped[cy*W+cx]=1;
assert.equal(fillEscapedContour(escaped,W,H,selection.bounds),false);
escaped[cy*W+3]=1;
assert.equal(fillEscapedContour(escaped,W,H,selection.bounds),true,
 'a pinhole that spills outside the selected outline must trigger fallback');
const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
assert.match(editor,/priorityContourWalls\(strokes,i,stroke\.p\[0\],aspect,zoneMask\)/,
 'real editor replay must use the new outline-first bucket path');
assert.match(editor,/current\.data\.set\(inkBefore\)/,
 'a leaking priority fill must be rolled back before the legacy fallback');
console.log('ZAMAZKA: painted square + inner circle, changed pigment, repeated fill, nesting, open outlines and leak guard OK');
