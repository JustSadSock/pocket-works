import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderBrassPhrase} from './brass-instruments.mjs';
import {strikePercussion} from './percussion-instruments.mjs';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
const peak=a=>a.reduce((p,v)=>Math.max(p,Math.abs(v)),0);
test('brass slurs sustain pressure, tongued notes release, profiles and pressure differ',()=>{
 const notes=[{midi:60,start:0,duration:.8,pressure:.65},{midi:64,start:.8,duration:.8,pressure:.8,articulation:'slur'}];
 for(const instrument of ['horn','trumpet']){
  const opts={instrument,notes,seconds:1.8,seed:42},a=renderBrassPhrase(opts),b=renderBrassPhrase({...opts,notes:notes.map(n=>({...n,articulation:'tongued'}))});
  assert.ok(a.boundaries[1].pressureBefore>.4);assert.ok(b.boundaries[1].pressureBefore<.06);
  assert.ok(Math.abs(a.samples[38400]-a.samples[38399])<.2);
  assert.equal(hash(a.samples),hash(renderBrassPhrase(opts).samples));
  assert.notEqual(hash(a.samples),hash(b.samples));
  assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));
  assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
 }
 const opts={notes:[{midi:60,start:0,duration:1,pressure:.3}],seconds:1.2};
 assert.notEqual(hash(renderBrassPhrase(opts).samples),hash(renderBrassPhrase({...opts,instrument:'trumpet'}).samples));
 assert.ok(renderBrassPhrase({...opts,notes:[{...opts.notes[0],pressure:.9}]}).peak>renderBrassPhrase(opts).peak*2);
 assert.throws(()=>renderBrassPhrase({...opts,notes:[{...opts.notes[0],articulation:'slur'}]}));
});
test('percussion is deterministic, dynamically scaled and differentiated',()=>{
 const hashes=new Set();
 for(const instrument of ['timpani','warDrum','snare','cymbal']){
  const opts={instrument,midi:43,velocity:.8,seed:42},a=strikePercussion(opts).samples;
  assert.equal(hash(a),hash(strikePercussion(opts).samples));assert.notEqual(hash(a),hash(strikePercussion({...opts,seed:43}).samples));
  assert.ok(peak(a)>peak(strikePercussion({...opts,velocity:.3}).samples)*2);
  assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));
  assert.equal(a[0],0);assert.equal(a.at(-1),0);hashes.add(hash(a));
 }
 assert.equal(hashes.size,4);assert.throws(()=>strikePercussion({velocity:2}));assert.throws(()=>strikePercussion({instrument:'missing'}));
});
