import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {smudgeStroke,preservePaintContours} from '../editor.js';

const W=600,H=450,idx=(x,y)=>(y*W+x)*4;
function makeCanvas(buffer){
 return {canvas:{width:W,height:H},
  getImageData(x,y,w,h){
   const data=new Uint8ClampedArray(w*h*4);
   for(let row=0;row<h;row++)
    data.set(buffer.subarray(idx(x,y+row),idx(x+w,y+row)),row*w*4);
   return {width:w,height:h,data};
  },
  putImageData(image,x,y){
   for(let row=0;row<image.height;row++)
    buffer.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),idx(x,y+row));
  }
 };
}
const paint=new Uint8ClampedArray(W*H*4);
const walls=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const i=idx(x,y);
 paint.set(x<300?[235,60,25,255]:[26,66,220,255],i);
 walls[i+3]=x<300?255:0;
}
const gesture={t:'smudge',s:22,p:[[295,220],[299,220],[303,220],[306,220]]};
// A later fill must not resurrect the original sharp red contour.
smudgeStroke(makeCanvas(paint),gesture);
smudgeStroke(makeCanvas(walls),gesture,0,true);
const mixedRed=paint[idx(303,220)],maskAlpha=walls[idx(303,220)+3];
assert.ok(mixedRed>50&&mixedRed<235,'smudging visibly mixes both paints');
assert.ok(maskAlpha>0&&maskAlpha<255,'bucket contour alpha follows smudged pigment');
const before=new Uint8ClampedArray(paint);
const filled=new Uint8ClampedArray(before);
for(let x=285;x<320;x++)filled.set([5,210,80,255],idx(x,220));
preservePaintContours(filled,before,walls);
assert.ok(filled[idx(303,220)]>50,'fill preserves the softened brush instead of painting an old hard line');
assert.deepEqual(
 Array.from(filled.slice(idx(297,220),idx(297,220)+3)),
 Array.from(before.slice(idx(297,220),idx(297,220)+3)),
 'solid contour pigment stays intact');
assert.deepEqual(Array.from(filled.slice(idx(315,220),idx(315,220)+3)),[5,210,80],
 'unpainted area is filled normally');
// The next smudge must work on the newly filled colour, including softened edges.
const canvas=makeCanvas(filled);
smudgeStroke(canvas,{t:'smudge',s:22,p:[[312,220],[307,220],[303,220]]});
assert.notDeepEqual(Array.from(filled.slice(idx(308,220),idx(308,220)+3)),[5,210,80],
 'smudging a previously filled area visibly changes its pixels');
// All major screens must offer an action routed through the existing safe exit.
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const review=readFileSync(new URL('../round-review.js',import.meta.url),'utf8');
assert.match(app,/phaseMenuButton=.*data-action="menu"/,'shared phase header has a menu action');
assert.match(readFileSync(new URL('../passage-ui.js',import.meta.url),'utf8'),/preparing-menu" data-action="menu"/,'loading screen supports leaving');
assert.match(review,/round-review-head-actions.*data-action="menu"/,'review screen supports leaving');
assert.match(app,/editor\?\.finishStroke\(\)/,'leaving commits the live gesture locally');
assert.match(app,/\['В меню',\(\)=>\{closeDialog\(\);home\(\)\}/,'exit requires explicit confirmation');
console.log('ZAMAZKA: smudge ↔ fill blending and safe stage navigation OK');
