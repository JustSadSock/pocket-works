import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderBowedPhrase} from './bowed-instruments.mjs';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
const notes=[{midi:60,start:0,duration:.8,pressure:.65},{midi:64,start:.8,duration:.8,pressure:.8,articulation:'legato'},{midi:62,start:1.6,duration:.8,pressure:.65,articulation:'bow-change'}];
test('bowed phrases sustain bow pressure across legato and bow reversal',()=>{
 for(const instrument of ['cello','violin']){
  const opts={instrument,notes,seconds:2.6,seed:42};
  const a=renderBowedPhrase(opts),b=renderBowedPhrase({...opts,notes:notes.map(n=>({...n,articulation:'detached'}))});
  assert.equal(a.samples.length,124800);assert.equal(a.boundaries.length,3);
  assert.ok(a.boundaries[1].pressureBefore>.4);assert.ok(a.boundaries[2].pressureBefore>.4);
  assert.ok(b.boundaries[1].pressureBefore<.06);
  assert.ok(Math.abs(a.boundaries[1].pitchBefore-60)<.01);
  assert.ok(Math.abs(a.samples[38400]-a.samples[38399])<.2);
  assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.851));
  assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
  assert.equal(hash(a.samples),hash(renderBowedPhrase(opts).samples));
  assert.notEqual(hash(a.samples),hash(b.samples));
 }
});
test('bow pressure and position change output; instrument profiles differ',()=>{
 const opts={notes:[{midi:60,start:0,duration:1,pressure:.3}],seconds:1.2};
 const a=renderBowedPhrase(opts),b=renderBowedPhrase({...opts,notes:[{...opts.notes[0],pressure:.9}]}),c=renderBowedPhrase({...opts,instrument:'violin'}),d=renderBowedPhrase({...opts,notes:[{...opts.notes[0],position:.3}]});
 assert.ok(b.peak>a.peak*2);assert.notEqual(hash(a.samples),hash(c.samples));assert.notEqual(hash(a.samples),hash(d.samples));
});
test('invalid bow articulation, pitch, pressure or overlap is rejected',()=>{
 for(const ns of [[{...notes[0],articulation:'legato'}],[notes[0],{...notes[1],start:.9}],[notes[0],{...notes[1],start:.7}],[{...notes[0],midi:90}],[{...notes[0],pressure:2}],[{...notes[0],position:.01}]]){
  assert.throws(()=>renderBowedPhrase({notes:ns,seconds:2.6}));
 }
});
