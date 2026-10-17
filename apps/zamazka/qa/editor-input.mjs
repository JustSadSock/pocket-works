import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Editor,MAX_STROKES,MAX_STROKE_POINTS,MAX_TOTAL_POINTS} from '../editor.js';

function editor(){
 const target=Object.create(Editor.prototype);
 Object.assign(target,{
  color:'#304a43',size:12,tool:'brush',strokes:[],redoStack:[],zone:{x:-100,y:-100,w:2000,h:2000},
  working:null,limitWarned:false,
  inside(){return true},render(){},save(){},onChange(message){this.notice=message}
 });
 return target;
}

const art=editor();
art.beginStroke([0,0]);
const fixed=[];
for(let i=1;i<=300;i++){
 art.extendStroke([i*1.5,6*Math.sin(i/7)]);
 if(i===30)fixed.push(...art.working.p.map(p=>[...p]));
}
art.finishStroke();
assert.ok(art.strokes.length>1,'Long gesture is segmented');
assert.equal(art.countPoints(),art.strokes.reduce((n,s)=>n+s.p.length,0),'point counter stays accurate after segmented gesture');
assert.equal(art.pendingInkStrokes?.length,art.strokes.length,'each committed piece can be rasterized without full replay');
assert.equal(art.committedPointCount,art.countPoints(),'committed point cache stays constant-time and exact');
assert.ok(art.strokes.every(s=>s.p.length<=MAX_STROKE_POINTS),'Each segment fits PocketNet');
assert.deepEqual(art.strokes[0].p.slice(0,fixed.length),fixed,'Existing geometry stays unchanged');
assert.equal(new Set(art.strokes.map(s=>s.g)).size,1,'One gesture has one undo group');
for(let i=1;i<art.strokes.length;i++)
 assert.deepEqual(art.strokes[i-1].p.at(-1),art.strokes[i].p[0],'Continuous segment seam');

const budget=editor();
budget.beginStroke([0,0]);
for(let i=1;i<=2800;i++)budget.extendStroke([(i*3)%597,Math.floor(i/199)*6]);
budget.finishStroke();
assert.ok(budget.strokes.length<=MAX_STROKES,'expanded stroke cap');
assert.ok(budget.strokes.every(s=>s.p.length<=MAX_STROKE_POINTS),'network point cap');
assert.ok(budget.strokes.reduce((n,s)=>n+s.p.length,0)<=MAX_TOTAL_POINTS,'expanded point cap');

const aim=editor();
aim.inputMode='precision';aim.hand='right';
assert.deepEqual(aim.tip({clientX:120,clientY:140,pointerType:'touch'}),{clientX:102,clientY:90,pointerType:'touch'});
aim.tool='fill';
assert.deepEqual(aim.tip({clientX:120,clientY:140,pointerType:'touch'}),{clientX:120,clientY:140,pointerType:'touch'});
aim.tool='brush';aim.hand='left';
assert.equal(aim.tip({clientX:120,clientY:140,pointerType:'touch'}).clientX,138);
aim.inputMode='direct';
assert.equal(aim.tip({clientX:120,clientY:140,pointerType:'touch'}).clientY,140);
const editorSource=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const liveCanvas=editorSource.split(' paintCachedFrame(img){')[1]?.split(' getData(){')[0];
assert.ok(liveCanvas,'editor must retain its painting render path');
assert.doesNotMatch(liveCanvas,/setLineDash|damagePath\(ctx,this\.zone\);ctx\.stroke\(\)/,'no dashed damage guide on active canvas');
assert.match(liveCanvas,/clipZone\(ctx,this\.zone\)/,'brush and fill remain clipped to damaged geometry');
console.log('ZAMAZKA stable drawing, network budgets and precision input: OK');

// Includes a real 320-stroke paced upload and near-border paint hit testing.
import './edge-and-pacing.mjs';

// Run the super-zoom, fractional-brush and outside-mask gesture regression.
import './outside-stroke-fine-brush.mjs';

// Cross-tool state machine and raster interaction stress regression.
import './all-tools-matrix.mjs';
