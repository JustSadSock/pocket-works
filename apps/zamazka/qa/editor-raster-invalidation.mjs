import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// Regression: rasterized fill/smudge replay caches keep stroke object
// references. The brush budget compactor mutates point arrays in-place,
// so a paint-revision update alone cannot invalidate the cached pigment.
const editor=Object.create(Editor.prototype);
editor.strokes=[{c:'#304a43',s:12,t:'brush',g:'continuous',p:
 Array.from({length:48},(_,i)=>[i*2,80+Math.sin(i/5)*4])}];
editor.paintRevision=7;
editor.displayRevision=7;
editor.pendingInkStrokes=[];
editor.inkRasterCache={state:{strokes:editor.strokes.slice(),paint:{sentinel:true}}};
let stored=0;
editor.saveSnapshot=()=>{stored++};
const before=editor.strokes[0].p.length;
assert.equal(editor.compactStrokeBudget(),true,'dense line compacts redundant points');
assert.ok(editor.strokes[0].p.length<before,'original vector geometry was edited in place');
assert.equal(editor.inkRasterCache.state,null,'stale raster cannot replay old line geometry');
assert.equal(editor.pendingInkStrokes,null,'incremental painting must rebuild');
assert.equal(editor.displayRevision,-1,'composited frame must rebuild');
assert.equal(editor.paintRevision,8,'committed raster revision advances');
assert.equal(stored,1,'compacted vectors are persisted');
console.log('ZAMAZKA: compaction invalidates fill raster replay and preserves save');
