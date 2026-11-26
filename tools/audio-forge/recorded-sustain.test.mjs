import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordedNote,renderRecordedPhrase} from './recorded-instruments.mjs';
import {findSustainLoop,renderSustainedNote} from './recorded-sustain.mjs';
function zone(){
 const a=new Float32Array(144000);
 for(let i=0;i<a.length;i++){const p=2*Math.PI*440*i/48000;a[i]=(.12*Math.sin(p)+.035*Math.sin(2*p))*Math.min(1,i/2500);}
 const z=prepareRecordedNote(a,69);return {...z,id:'fixture',loop:findSustainLoop(z)};
}
test('qualified loop extends recorded note with continuous pressure and no excessive seam step',()=>{
 const z=zone(),curve=[{at:0,value:.25},{at:.5,value:.9},{at:1,value:.25}],opts={zone:z,midi:69,seconds:12,loop:z.loop,curve};
 const a=renderSustainedNote(opts),b=renderSustainedNote(opts);
 assert.equal(a.frames,576000);assert.ok(a.wraps>=4);assert.ok(z.loop.correlation>.97);
 assert.ok(a.maxWrapStep<=a.maxStep&&a.maxWrapStep<.1);
 assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);assert.deepEqual(a.samples,b.samples);
 const rms=(start,end)=>Math.sqrt(a.samples.subarray(start,end).reduce((s,v)=>s+v*v,0)/(end-start));
 assert.ok(rms(264000,312000)>rms(48000,72000)*1.6);
});
test('explicit sustain phrase uses loop, finite mode still rejects oversize notes',()=>{
 const z=zone(),notes=[{midi:69,start:0,duration:5,pressure:.7,sustain:true},{midi:71,start:5,duration:2,pressure:.65,sustain:true}];
 const a=renderRecordedPhrase({zones:[z],notes,seconds:7});
 assert.equal(a.samples.length,336000);assert.ok(a.choices.every(x=>x.wraps>=1));
 assert.throws(()=>renderRecordedPhrase({zones:[z],notes:notes.map(n=>({...n,sustain:false})),seconds:7}),/too short/);
 assert.throws(()=>renderRecordedPhrase({zones:[{...z,loop:undefined}],notes,seconds:7}),/Unqualified/);
});
test('reject silent candidates, malformed curves and invalid tuning',()=>{
 const z=zone();assert.throws(()=>findSustainLoop({...z,samples:new Float32Array(144000)}),/No qualified/);
 const opts={zone:z,midi:69,seconds:3,loop:z.loop};
 assert.throws(()=>renderSustainedNote({...opts,curve:[{at:0,value:.2},{at:0,value:.6},{at:1,value:.2}]}),/curve/);
 assert.throws(()=>renderSustainedNote({...opts,loop:{...z.loop,correlation:.1}}),/Unqualified/);
 assert.throws(()=>renderSustainedNote({...opts,zone:{...z,measuredMidi:-1000}}),/Invalid/);
});
