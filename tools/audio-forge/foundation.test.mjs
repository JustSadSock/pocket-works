import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {expandManifest,renderPhysics,arrangeTracks} from './foundation.mjs';
const family={id:'steel',model:'sword',seed:41,variants:8,outputDir:'generated',format:'wav'};
const manifest={version:2,jobs:[],families:[family]};
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('v1 is preserved',()=>{const m={version:1,jobs:[{name:'legacy'}]};assert.equal(expandManifest(m),m.jobs)});
test('family expansion deterministic and diverse',()=>{
  const a=expandManifest(manifest);assert.deepEqual(a,expandManifest(manifest));assert.equal(a.length,8);
  assert.equal(new Set(a.map(x=>x.seed)).size,8);assert.equal(a[0].output,'generated/steel-01.wav');
});
test('reject invalid families and source claims',()=>{
  for(const patch of [{variants:33},{variants:1.5},{outputDir:'../escape'},{source:'unknown'},{model:'missing'},{seed:-1}]){
    assert.throws(()=>expandManifest({...manifest,families:[{...family,...patch}]}));
  }
  assert.throws(()=>expandManifest({...manifest,families:[family,family]}));
  assert.throws(()=>expandManifest({...manifest,jobs:[{name:'dup',output:'generated/steel-01.wav'}]}));
});
for(const model of ['sword','shield','glass','explosion','rain','sword-v2','glass-v2','gear','chain']){
  test(model+' is deterministic, finite and distinct by seed',()=>{
    const job={model,seed:12,strength:.65,duration:.5};
    const a=renderPhysics(job),b=renderPhysics(job),c=renderPhysics({...job,seed:13});
    assert.equal(a.samples.length,48000);assert.equal(a.channels,2);assert.equal(a.sampleRate,48000);
    assert.equal(hash(a.samples),hash(b.samples));assert.notEqual(hash(a.samples),hash(c.samples));
    let peak=0,energy=0;for(const v of a.samples){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v}
    assert.ok(peak>.5&&peak<.9&&energy>0);assert.equal(a.samples[0],0);assert.ok(Math.abs(a.samples.at(-1))===0);
  });
}
const track={program:109,legato:.08,humanizeBeats:0,humanizeVelocity:0,notes:[{note:'D4',beat:0,duration:1},{note:'E4',beat:1,duration:1},{note:64,beat:2,duration:1}]};
test('expressive track channels, overlap, repeated pitch and reproducibility',()=>{
  const job={seed:3,tracks:[track,{...track,program:48,pan:90}]};
  const a=arrangeTracks(job);assert.deepEqual(a,arrangeTracks(job));
  assert.equal(a[0].notes[0].duration,1.08);assert.equal(a[0].notes[1].duration,1);
  assert.equal(a[1].channel,1);assert.equal(a[1].program,48);assert.deepEqual(a[1].controls[1],[10,90]);
});
test('reject unsafe or invalid MIDI arrangements',()=>{
  for(const tracks of [[{...track,channel:9}],[track,{...track,channel:0}],[{...track,notes:[{note:'X4'}]}],[{...track,notes:[{note:'C4',beat:0,duration:2},{note:'D4',beat:1}]}]]){
    assert.throws(()=>arrangeTracks({tracks}));
  }
});
