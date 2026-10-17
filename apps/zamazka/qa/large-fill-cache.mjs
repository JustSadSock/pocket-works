import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the PRODUCTION chronological renderer with a test canvas.
// Count expensive historical buckets, not just a standalone flood helper.
const source=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const start=source.indexOf('function renderStrokes(');
const end=source.indexOf('\nexport async function renderArtwork',start);
assert.ok(start>=0&&end>start,'production renderStrokes must be available');
let fills=0,smudges=0,layers=0;
const layer=()=>{
 const canvas={events:[]};
 const ctx={canvas,fillRect(){},fill(){},save(){},restore(){},
  getImageData(){return {data:new Uint8ClampedArray(4)}},
  drawImage(x){canvas.events.push(...x.events)},set fillStyle(v){this._fill=v},
  set globalCompositeOperation(v){this._operation=v}};
 layers++;return {canvas,ctx};
};
const env={W:600,H:450,layer,damagePath(){},floodFillRaster(){},
 drawStroke(ctx,s){ctx.canvas.events.push('draw:'+s.id+':'+s.t)},
 fillRegion(lines,paint,mask,p,color){
  fills++;paint.canvas.events.push('fill:'+color+':'+p.join(','));},
 smudgeStroke(ctx,s,from,mask){
  smudges++;ctx.canvas.events.push('smudge:'+s.id+(mask?':wall':':paint'));}};
const render=runInNewContext('('+source.slice(start,end)+')',env);
const zone={x:0,y:0,w:600,h:450},ctx={drawImage(canvas){this.view=[...canvas.events]}};
const cached={};
const strokes=[];
const fresh=()=>{const out={drawImage(canvas){this.view=[...canvas.events]}};render(out,strokes,zone,4/3);return out.view};
const run=()=>{render(ctx,strokes,zone,4/3,cached);assert.deepEqual(ctx.view,fresh(),'cache differs from full chronological replay')};
let fillCount=0;
for(let i=0;i<48;i++){
 const t=i%5===1?'brush':i%5===3?'smudge':i%7===0?'erase':'fill';
 strokes.push({id:i,t,c:'#'+String(i).padStart(6,'0'),s:8,p:[[i,20]]});
 const before=fills;
 render(ctx,strokes,zone,4/3,cached);
 const expected=Number(t==='fill');
 assert.equal(fills-before,expected,'new action replayed an old bucket: '+i);
 assert.deepEqual(ctx.view,fresh(),'incremental output differs at stroke '+i);
 fillCount+=expected;
}
// Undo invalidates the incremental prefix and rebuilds the correct raster.
strokes.pop();strokes.pop();
render(ctx,strokes,zone,4/3,cached);
assert.deepEqual(ctx.view,fresh(),'undo must drop both previous operations');
const replacement={id:999,t:'fill',c:'#deadbe',s:8,p:[[4,4]]};
strokes[5]=replacement;
render(ctx,strokes,zone,4/3,cached);
assert.deepEqual(ctx.view,fresh(),'replacing a prior stroke must rebuild');
const relocated={x:0,y:0,w:400,h:300};
render(ctx,strokes,relocated,4/3,cached);
assert.deepEqual(ctx.view,fresh(),'changing damage area must rebuild');
render(ctx,strokes,zone,1.2,cached);
assert.deepEqual(ctx.view,fresh(),'changing artwork aspect must rebuild');
const reset={drawImage(canvas){this.view=[...canvas.events]}};
render(reset,[],zone,4/3,cached);
assert.equal(cached.state,null,'empty undo must clear cached renderer');
strokes.push({id:1001,t:'fill',c:'#cc4422',s:8,p:[[100,100]]});
render(ctx,strokes,zone,4/3,cached);
assert.deepEqual(ctx.view,fresh(),'restoring drawing after reset must reconstruct raster');
console.log('ZAMAZKA large fill renderer: '+fillCount+' unique bucket renders across 48 incremental actions; undo, edit, aspect, mask, reset and full replay equivalence OK');
