import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareModulatedNote} from './recorded-modulated.mjs';
import {renderRecordedEnsemble} from './recorded-ensemble.mjs';
test('tremolo pitch uses independent energetic windows and rejects wrong labels',()=>{
 const a=new Float32Array(144000);
 for(let i=480;i<a.length;i++){const t=(i-480)/48000,p=2*Math.PI*440*t;a[i]=.24*(.18+.82*Math.sin(Math.PI*7*t)**2)*(Math.sin(p)+.17*Math.sin(2*p));}
 const z=prepareModulatedNote(a,69);
 assert.ok(Math.abs(z.measuredMidi-69)<.12);assert.ok(z.pitchWindows>=5);assert.ok(z.pitchConsensus>=.7);
 assert.throws(()=>prepareModulatedNote(a,57),/disagrees/);
 assert.throws(()=>prepareModulatedNote(new Float32Array(144000),69),/Silent/);
});
function zones(){
 return [69,72].map((midi,i)=>{
  const samples=new Float32Array(96000),hz=440*2**((midi-69)/12);
  for(let j=0;j<samples.length;j++)samples[j]=.2*Math.sin(2*Math.PI*hz*j/48000)*Math.min(1,j/1200);
  return {id:'fixture-'+i,sourceSha256:(i+1).toString(16).padStart(64,'0'),instrument:'fixture',articulation:'arco',expectedMidi:midi,measuredMidi:midi,velocity:.6,variant:1,samples,rms:.14,peak:.2};
 });
}
test('independent overlapping tracks reconstruct the stereo mix and preserve identities',()=>{
 const a=zones(),notes=midi=>[{midi,start:0,duration:.8,articulation:'arco',pressure:.7}];
 const tracks=[{id:'a',instrument:'fixture',group:'strings',pan:-.8,gain:.5,notes:notes(69)},{id:'b',instrument:'fixture',group:'woodwind',pan:.8,gain:.5,notes:notes(72)}];
 const opts={zones:a,tracks,seconds:1},r=renderRecordedEnsemble(opts);
 assert.equal(r.frames,48000);assert.equal(r.mix.length,96000);
 assert.ok(r.mix.every((x,i)=>Number.isFinite(x)&&Math.abs(x)<=.751&&Math.abs(x-r.stems.strings[i]-r.stems.woodwind[i])<1e-7));
 assert.equal(r.choices.a[0].midi,69);assert.equal(r.choices.b[0].midi,72);
 assert.deepEqual(r.mix,renderRecordedEnsemble(opts).mix);
 assert.throws(()=>renderRecordedEnsemble({...opts,tracks:[tracks[0],tracks[0]]}),/Invalid ensemble track/);
 assert.throws(()=>renderRecordedEnsemble({...opts,tracks:[{...tracks[0],pan:2}]}),/Invalid ensemble track/);
});

test('opt-in individual stems preserve the approved dry mix and reconstruct shared groups',()=>{
 const a=zones(),notes=midi=>[{midi,start:0,duration:.8,articulation:'arco',pressure:.7}];
 const tracks=[{id:'a',instrument:'fixture',group:'strings',pan:-.8,gain:.5,notes:notes(69)},{id:'b',instrument:'fixture',group:'strings',pan:.8,gain:.5,notes:notes(72)},{id:'c',instrument:'fixture',group:'woodwind',pan:0,gain:.3,notes:notes(69)}];
 const opts={zones:a,tracks,seconds:1},dry=renderRecordedEnsemble(opts),r=renderRecordedEnsemble({...opts,includeTrackStems:true});
 assert.equal(dry.trackStems,undefined);assert.deepEqual(r.mix,dry.mix);assert.deepEqual(r.stems,dry.stems);assert.equal(r.master,dry.master);
 assert.deepEqual(Object.keys(r.trackStems),['a','b','c']);
 for(let i=0;i<r.mix.length;i++){
  const {a,b,c}=r.trackStems;
  assert.ok(Math.abs(a[i]+b[i]-r.stems.strings[i])<1e-6);
  assert.ok(Math.abs(c[i]-r.stems.woodwind[i])<1e-7); // signed zero is numerically identical
  assert.ok(Math.abs(a[i]+b[i]+c[i]-r.mix[i])<1e-6);
 }
 assert.throws(()=>renderRecordedEnsemble({...opts,includeTrackStems:1}),/Invalid recorded ensemble/);
});
