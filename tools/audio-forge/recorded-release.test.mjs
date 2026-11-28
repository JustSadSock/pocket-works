import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordedRelease,compileRecordedRelease,prepareDedicatedRelease} from './recorded-release.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
const SR=48000;
function fixture(id='fixture',velocity=.6){
 const samples=new Float32Array(3*SR);
 for(let i=0;i<samples.length;i++){const t=i/SR,g=t<2?1:Math.max(0,1-(t-2)/.45);samples[i]=.2*Math.sin(2*Math.PI*440*t)*g*Math.min(1,t/.025);}
 const z={id,instrument:'fixture',articulation:'arco',expectedMidi:69,measuredMidi:69,velocity,variant:1,sourceSha256:(id==='fixture'?1:2).toString(16).padStart(64,'0'),samples,rms:.14,peak:.2};
 return {z,release:prepareRecordedRelease(samples,z)};
}
test('natural endings retain original source frames and reject truncated sustains',()=>{
 const {z,release:r}=fixture();
 assert.deepEqual(r.samples,z.samples.slice(r.sourceStartFrame,r.sourceEndFrame));
 assert.ok(r.sourceStartFrame>2*SR&&r.finalRms<r.initialRms*.15);
 assert.throws(()=>prepareRecordedRelease(z.samples.slice(0,SR*1.5),z),/No qualified/);
 assert.throws(()=>prepareRecordedRelease(new Float32Array(SR*2),z),/Silent/);
});
test('recorded ending plays after note-off while the default path remains unchanged',()=>{
 const {z,release:r}=fixture(),note={midi:69,start:0,duration:.6,pressure:.7,articulation:'arco'};
 const opts={zones:[z],instrument:'fixture',notes:[note],seconds:1.5};
 const control=renderRecordedPerformance(opts),unchanged=renderRecordedPerformance({...opts,releaseBank:[r]});
 assert.deepEqual(control.samples,unchanged.samples);
 const result=renderRecordedPerformance({...opts,releaseBank:[r],notes:[{...note,release:'recorded'}]});
 assert.ok(result.samples.slice(.6*SR).some(x=>Math.abs(x)>.001));
 assert.ok(control.samples.slice(.6*SR).every(x=>x===0));
 assert.equal(result.choices[0].release.sourceSegments[0].sha256,z.sourceSha256);
 assert.ok(result.choices[0].release.boundaryStep<.1);
 assert.deepEqual(result.samples,renderRecordedPerformance({...opts,releaseBank:[r],notes:[{...note,release:'recorded'}]}).samples);
});
test('release admission rejects missing, substituted, duplicate and overlapping recordings',()=>{
 const {z,release:r}=fixture(),note={midi:69,start:0,duration:.6,pressure:.7,articulation:'arco',release:'recorded'};
 const opts={zones:[z],instrument:'fixture',notes:[note],seconds:1.5};
 assert.throws(()=>renderRecordedPerformance(opts),/Missing or mismatched/);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[{...r,sourceSha256:'0'.repeat(64)}]}),/Missing or mismatched/);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[r,r]}),/Duplicate/);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[r],notes:[note,{...note,start:.7,release:undefined}]}),/overlaps/);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[r],notes:[note,{...note,start:.6,release:undefined,connected:true}]}),/connected/);
 assert.throws(()=>renderRecordedPerformance({...opts,notes:[{...note,release:'invented'}]}),/Invalid recorded release/);
});
test('paired dynamic layers retain separate original ending provenance',()=>{
 const a=fixture(),b=fixture('strong',.85),selected=[{z:a.z,v:.6},{z:b.z,v:.85}];
 const c=compileRecordedRelease({selected,releaseBank:[a.release,b.release],midi:69,pressure:.75,availableFrames:SR});
 let p=0;const out=c.render(()=>.15*Math.sin(2*Math.PI*440*p++/SR));
 assert.equal(out.receipt.sourceSegments.length,2);
 assert.equal(out.receipt.sourceSegments[0].sha256,a.z.sourceSha256);
 assert.equal(out.receipt.sourceSegments[1].sha256,b.z.sourceSha256);
 assert.ok(out.samples.every(x=>Number.isFinite(x)&&Math.abs(x)<.999));
});

test('dedicated assets retain a separate hash and paired body identity',()=>{
 const {z}=fixture(),pcm=z.samples.slice(2*SR);
 const source={id:'release-a4',expectedMidi:z.expectedMidi,instrument:z.instrument,articulation:z.articulation,bodySha256:z.sourceSha256,sha256:'c'.repeat(64)};
 const r=prepareDedicatedRelease(pcm,z,source);
 assert.equal(r.kind,'dedicated-release-asset');
 assert.equal(r.bodySha256,z.sourceSha256);
 assert.equal(r.sourceSha256,source.sha256);
 assert.ok(Math.abs(r.releasePitch.measuredMidi-69)<.1);
 const wrong=Float32Array.from(pcm,(v,i)=>v*Math.cos(2*Math.PI*440*i/SR));
 assert.throws(()=>prepareDedicatedRelease(wrong,z,source),/pitch/);
 assert.deepEqual(r.samples,pcm.slice(r.sourceStartFrame,r.sourceEndFrame));
 const opts={zones:[z],instrument:'fixture',notes:[{midi:69,start:0,duration:.6,pressure:.7,articulation:'arco',release:'recorded'}],seconds:2,releaseBank:[r]};
 const result=renderRecordedPerformance(opts),receipt=result.choices[0].release;
 assert.equal(receipt.kind,'dedicated-release-asset');
 assert.equal(receipt.sourceSegments[0].sha256,source.sha256);
 assert.equal(receipt.sourceSegments[0].bodySha256,z.sourceSha256);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[{...r,releasePitch:{...r.releasePitch,measuredMidi:81}}]}),/Missing or mismatched/);
 assert.throws(()=>renderRecordedPerformance({...opts,releaseBank:[{...r,bodySha256:'0'.repeat(64)}]}),/Missing or mismatched/);
 assert.throws(()=>prepareDedicatedRelease(pcm,z,{...source,expectedMidi:72}),/pairing/);
 assert.throws(()=>prepareDedicatedRelease(pcm,z,{...source,sha256:z.sourceSha256}),/pairing/);
 assert.throws(()=>prepareDedicatedRelease(new Float32Array(SR),z,source),/Silent/);
});
