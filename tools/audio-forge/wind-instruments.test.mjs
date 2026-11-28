import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderWindPhrase} from './wind-instruments.mjs';
const notes=[{midi:69,start:0,duration:.8,pressure:.65},{midi:72,start:.8,duration:.8,pressure:.8,connected:true},{midi:67,start:1.6,duration:.8,pressure:.55,connected:true}];
const hash=x=>createHash('sha256').update(new Uint8Array(x.buffer)).digest('hex');
test('connected phrases keep breath and phase across note changes, detached notes release',()=>{
 for(const instrument of ['flute','reed']){
  const opts={instrument,notes,seconds:2.6,seed:42},a=renderWindPhrase(opts),b=renderWindPhrase({...opts,notes:notes.map(n=>({...n,connected:false}))});
  assert.equal(a.samples.length,124800);assert.equal(a.boundaries.length,3);
  assert.ok(a.boundaries[1].pressureBefore>.4);assert.ok(b.boundaries[1].pressureBefore<.06);
  assert.ok(Math.abs(a.boundaries[1].pitchBefore-69)<.01);
  assert.ok(Math.abs(a.samples[38400]-a.samples[38399])<.15);
  assert.notEqual(hash(a.samples),hash(b.samples));assert.equal(hash(a.samples),hash(renderWindPhrase(opts).samples));
  assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
 }
});
test('wind profiles and breath pressure change audio independently',()=>{
 const notes=[{midi:69,start:0,duration:1,pressure:.3}];
 const a=renderWindPhrase({notes,seconds:1.2}),b=renderWindPhrase({notes:[{...notes[0],pressure:.9}],seconds:1.2}),c=renderWindPhrase({instrument:'reed',notes,seconds:1.2});
 assert.ok(b.peak>a.peak*2);assert.notEqual(hash(a.samples),hash(c.samples));
});
test('reject overlapping notes, false legato across a rest and excess duration',()=>{
 for(const invalid of [[notes[0],{...notes[1],start:.7}],[notes[0],{...notes[1],start:.9}],[{...notes[0],connected:true}],[{...notes[0],duration:9}]]){
  assert.throws(()=>renderWindPhrase({notes:invalid,seconds:2.6}));
 }
});
