import assert from 'node:assert/strict';
import {Editor,simplifyPointsWithinTolerance,MAX_STROKE_POINTS} from '../editor.js';

const straight=Array.from({length:MAX_STROKE_POINTS},(_,i)=>[i*2,40+.05*Math.sin(i/3)]);
const reduced=simplifyPointsWithinTolerance(straight,60);
assert.equal(reduced.length,60,'near-straight points free drawing budget');
assert.deepEqual(reduced[0],straight[0],'first point remains fixed');
assert.deepEqual(reduced.at(-1),straight.at(-1),'last point remains fixed');

const corners=Array.from({length:MAX_STROKE_POINTS},(_,i)=>[i*2,40+(i%2?9:-9)]);
const preserved=simplifyPointsWithinTolerance(corners,60);
assert.equal(preserved.length,corners.length,'visible zig-zag corners must not be discarded');
assert.deepEqual(preserved,corners);

const editor=Object.create(Editor.prototype);
editor.strokes=[{c:'#334455',t:'brush',s:12,g:'gesture-one',p:corners.map(p=>[...p])}];
editor.paintRevision=3;
editor.displayRevision=3;
editor.inkRasterCache={state:{strokes:editor.strokes.slice()}};
editor.saveSnapshot=()=>{throw Error('unchanged geometry must not be written')};
const before=JSON.stringify(editor.strokes);
assert.equal(editor.compactStrokeBudget(),false,'cannot force a lossy simplification');
assert.equal(JSON.stringify(editor.strokes),before,'stored points stay byte-for-byte intact');
assert.ok(editor.inkRasterCache.state,'unchanged raster cache remains usable');
console.log('ZAMAZKA: stroke budget protects corners and removes redundant points only');
