import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Editor,MAX_STROKES,MAX_TOTAL_POINTS} from '../editor.js';

// Dense, high-curvature artwork: do not free capacity by erasing its corners.
const editor=Object.create(Editor.prototype);
editor.strokes=Array.from({length:MAX_STROKES},(_,i)=>({
 c:'#334455',s:6,t:'brush',g:'gesture-'+i,
 p:Array.from({length:31},(_,j)=>[j*8,120+(i%12)*2+(j%2?12:-12)])
}));
editor.working=null;editor.limitWarned=false;
let writes=0;
editor.saveSnapshot=()=>{writes++};
editor.render=()=>{};
editor.save=()=>{};
editor.onChange=message=>{editor.notice=message};
const before=editor.strokes.map(stroke=>JSON.stringify(stroke.p));
const pointCount=editor.strokes.reduce((n,s)=>n+s.p.length,0);
assert.ok(pointCount<=MAX_TOTAL_POINTS&&pointCount>MAX_TOTAL_POINTS*.95);
const start=performance.now();
const compacted=editor.compactStrokeBudget();
const elapsed=performance.now()-start;
assert.equal(compacted,false,'sharp corners cannot be discarded under pressure');
assert.equal(editor.strokes.length,MAX_STROKES,'no old strokes are evicted');
assert.equal(writes,0,'unchanged geometry must not trigger persistence');
for(let i=0;i<MAX_STROKES;i++)
 assert.equal(JSON.stringify(editor.strokes[i].p),before[i],'corner geometry must remain exact');
console.log(JSON.stringify({scenario:'zamazka-dense-budget',strokes:MAX_STROKES,points:pointCount,
 elapsedMs:Math.round(elapsed*100)/100,lossless:true}));
