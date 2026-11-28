import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordedNote,renderRecordedPhrase} from './recorded-instruments.mjs';
function wave(midi,detune=0){
 const a=new Float32Array(96000),hz=440*2**((midi-69+detune/100)/12);
 for(let i=2400;i<a.length;i++){const phase=2*Math.PI*hz*i/48000;a[i]=.3*(Math.sin(phase)+.22*Math.sin(phase*2))*Math.min(1,(i-2400)/1500);}
 return a;
}
test('measure actual pitch including octave errors and preserve attack',()=>{
 for(const midi of [60,67,69,72,81,84]){
  const z=prepareRecordedNote(wave(midi,12),midi);
  assert.ok(Math.abs(z.measuredMidi-midi-.12)<.08);
  assert.ok(z.offsetFrames>=1920&&z.offsetFrames<=3360);
 }
 assert.throws(()=>prepareRecordedNote(wave(72),60),/disagrees/);
 assert.throws(()=>prepareRecordedNote(new Float32Array(48000),60),/Silent/);
});
test('nearest recorded zones, pitch compensation and exact grid',()=>{
 const zones=[60,69,72].map(midi=>({...prepareRecordedNote(wave(midi,10),midi),id:String(midi)}));
 const notes=[{midi:67,start:0,duration:.5,pressure:.6},{midi:71,start:.6,duration:.5,pressure:.8}];
 const r=renderRecordedPhrase({zones,notes,seconds:1.2});
 assert.equal(r.samples.length,57600);assert.equal(r.choices[0].source,'69');assert.equal(r.choices[1].source,'72');
 assert.ok(Math.abs(r.choices[0].rate-2**(-2.1/12))<.006);
 assert.ok(r.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));assert.equal(r.samples[0],0);assert.equal(r.samples.at(-1),0);
 assert.deepEqual(r.samples,renderRecordedPhrase({zones,notes,seconds:1.2}).samples);
 assert.throws(()=>renderRecordedPhrase({zones,notes:[{...notes[0],midi:90}],seconds:1.2}),/coverage/);
 assert.throws(()=>renderRecordedPhrase({zones,notes:[{...notes[0],duration:4}],seconds:5}),/too short/);
 assert.throws(()=>renderRecordedPhrase({zones,notes:[notes[0],{...notes[1],start:.2}],seconds:1.2}),/Unaligned/);
});
