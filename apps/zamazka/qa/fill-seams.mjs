import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {floodFillRaster} from '../editor.js';

// Synthetic 2x sampled image: two paints separated by a drawn line, with
// antialiased pixels along the irregular outer damage boundary.
const width=15,height=9,count=width*height;
const walls=new Uint8ClampedArray(count*4);
const zone=new Uint8ClampedArray(count*4);
const output=new Uint8ClampedArray(count*4);
const at=(x,y)=>(y*width+x)*4;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const k=at(x,y);
 zone[k+3]=x===0?35:x===1?92:x===14?0:255;
 // Two-pixel opaque centre with one antialiased contour shoulder.
 walls[k+3]=x===8||x===9?255:x===7?105:0;
}
const fill=(point,color)=>floodFillRaster({width,height,walls,zone,output,point,color});
assert.ok(fill([3,4],[220,50,40])>20,'flood finds painted left region');
assert.deepEqual(Array.from(output.slice(at(0,4),at(0,4)+4)),[220,50,40,255],
  'the faint exterior antialias fringe is underpainted');
assert.deepEqual(Array.from(output.slice(at(1,4),at(1,4)+4)),[220,50,40,255],
  'the inner exterior antialias fringe is underpainted');
assert.equal(output[at(8,4)+3],255,'fill reaches beneath thick line');
assert.equal(output[at(9,4)+3],0,'far side of the contour belongs to the other basin');
assert.equal(output[at(10,4)+3],0,'fill does not cross to adjacent interior');
assert.equal(output[at(14,4)+3],0,'never paint fully outside the damaged region');
assert.ok(fill([12,4],[30,180,130])>15,'adjacent zone fills independently');
assert.deepEqual(Array.from(output.slice(at(10,4),at(10,4)+4)),[30,180,130,255]);
assert.deepEqual(Array.from(output.slice(at(9,4),at(9,4)+4)),[30,180,130,255],
 'the neighbouring fill underpaints its own half of the contour');
assert.deepEqual(Array.from(output.slice(at(7,4),at(7,4)+4)),[220,50,40,255],
  'second region does not overwrite the first through the contour');
assert.ok(fill([4,4],[180,80,230])>20,'recolouring the same fill region remains possible');
assert.deepEqual(Array.from(output.slice(at(2,4),at(2,4)+4)),[180,80,230,255],
  'existing fill colour is not treated as another flood barrier');
assert.deepEqual(Array.from(output.slice(at(10,4),at(10,4)+4)),[30,180,130,255],
  'recolouring preserves the differently filled adjacent region');

// Diagonal touching is never a valid 4-connected hole. Repair fringe may
// underpaint wall pixels, but must not recolour another reachable pixel.
const narrowZone=new Uint8ClampedArray(6*6*4),narrowWall=new Uint8ClampedArray(6*6*4),
 narrowOutput=new Uint8ClampedArray(6*6*4);
for(let i=0;i<36;i++)narrowWall[i*4+3]=255;
for(const [x,y] of [[1,1],[2,2]]){
 const k=(y*6+x)*4;narrowZone[k+3]=255;narrowWall[k+3]=0;
}
assert.equal(floodFillRaster({width:6,height:6,walls:narrowWall,zone:narrowZone,
 output:narrowOutput,point:[1,1],color:[10,20,30]}),1);
assert.equal(narrowOutput[(2*6+2)*4+3],0,'no diagonal leakage into adjacent region');


/* Jagged damaged mask and varying-width brush contour, sampled at 2x.
   Adjacent basins must never exchange colours even after repeated recolouring. */
for(const strokeWidth of [1,2,3]){
 const w=64,h=48,wall=new Uint8ClampedArray(w*h*4),mask=new Uint8ClampedArray(w*h*4),result=new Uint8ClampedArray(w*h*4);
 const line=y=>29+Math.floor(y/7),outer=y=>5+(y%5===0?1:0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4;
   mask[i+3]=x<outer(y)?0:x===outer(y)?55:255;
   const delta=Math.abs(x-line(y));
   wall[i+3]=delta<strokeWidth?255:delta===strokeWidth?118:0;
 }
 const paint=(point,color)=>floodFillRaster({width:w,height:h,walls:wall,zone:mask,output:result,point,color});
 assert.ok(paint([13,20],[205,55,45])>200,'left basin is reachable');
 assert.ok(paint([47,20],[30,125,220])>200,'right basin is reachable');
 assert.ok(paint([13,20],[80,190,65])>200,'repainting left basin is possible');
 for(let y=0;y<h;y++){
   const left=(y*w+12)*4,right=(y*w+48)*4,out=(y*w+Math.max(0,outer(y)-1))*4;
   assert.deepEqual(Array.from(result.slice(left,left+3)),[80,190,65],'left pigment stays isolated');
   assert.deepEqual(Array.from(result.slice(right,right+3)),[30,125,220],'right pigment stays isolated');
   assert.equal(result[out+3],0,'no pigment outside the actual damage mask');
 }
}

const source=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
assert.match(source,/ctx\.save\(\);clipZone\(ctx,z\);ctx\.drawImage\(overlay,0,0,W,H\);ctx\.restore\(\)/,
 'final original comparison applies a single damage clip');
assert.match(source,/composed\.save\(\);clipZone\(composed,this\.zone\);\s*composed\.drawImage\(this\.inkLayer,0,0,W,H\);composed\.restore\(\);/,
 'cached editor display clips committed ink to damage exactly once');
assert.doesNotMatch(source,/lines\.ctx\.save\(\);clipZone\(lines\.ctx,zone\)/,
 'inside layer is not clipped a second time');
console.log('ZAMAZKA: connected region fill, two-pixel edge underlap, no leakage and one antialiased contour OK');

// Keep fill/smudge and menu regressions in the established validation gate.
import './fill-smudge.mjs';

// End-to-end bucket, input, spectator and server lottery regressions.
import './fill-stroke-vote.mjs';

// Structural region stress suite is part of the same CI regression gate.
import './fill-integrity.mjs';

// Extended randomized contour, basin recolour and asynchronous picker audit.
import './fill-picker-stress.mjs';

// Thousands of concentric, clipped, jagged and overlapping contour regressions.
import './fill-topology-matrix.mjs';

// Independent four-neighbour oracle and rotating randomized region stress.
import './deep-fill-topology.mjs';

// Large already-painted regions and chronological replay cache invariants.
import './large-painted-fill.mjs';
import './large-fill-cache.mjs';

// The complete numbered 100-scenario matrix, each in three layouts.
import './fill-100-raster.mjs';

import './fill-100-editor.mjs';
