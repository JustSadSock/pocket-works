import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareArtworkStorage} from '../art-storage.mjs';

const strokes = n => [{c:'#000000',s:2,t:'brush',p:[[n,0]]}];
function room() {return {assignments: {a:{art:1,strokes:strokes(1)},b:{art:2,strokes:strokes(2)}}, drafts:{a:strokes(3),b:strokes(4)}, draftAssemblies:{a:{next:2,strokes:strokes(5)},b:{next:3,strokes:strokes(6)}}};}

test('partial write changes only one artist while retaining all other payload keys', () => {
 const original=room(), before=JSON.stringify(original);
 const {stored,activeKeys,updates}=prepareArtworkStorage(original,'REF','a');
 assert.deepEqual([...updates.map(x=>x[0])],['final:a','draft:a','assembly:a']);
 assert.equal(activeKeys.size,6);
 assert.equal(stored.assignments.b.strokes,'REF');
 assert.equal(stored.draftAssemblies.b.strokes,'REF');
 assert.equal(JSON.stringify(original),before,'input state never changes');
});

test('finalization removes previously present draft and assembly keys atomically',()=>{
 const next=room();delete next.drafts.a;delete next.draftAssemblies.a;
 const {activeKeys,updates}=prepareArtworkStorage(next,'REF','a');
 const previous=new Set(['final:a','draft:a','assembly:a','final:b','draft:b','assembly:b']);
 const stale=[...previous].filter(key=>!activeKeys.has(key));
 assert.deepEqual(stale,['draft:a','assembly:a']);
 assert.deepEqual(updates.map(x=>x[0]),['final:a']);
 assert.equal(activeKeys.has('draft:b'),true);
});

test('full update includes all artwork when a round changes',()=>{
 const {activeKeys,updates,stored}=prepareArtworkStorage(room(),'REF');
 assert.equal(updates.length,6);
 assert.equal(activeKeys.size,6);
 assert.equal(stored.assignments.a.strokes,'REF');
});
