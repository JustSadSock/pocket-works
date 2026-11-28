import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDynamicNote,renderDynamicPhrase} from './recorded-dynamics.mjs';
function zone(velocity,seed,midi=69){
 const samples=new Float32Array(96000),hz=440*2**((midi-69)/12);
 for(let i=0;i<samples.length;i++){const p=2*Math.PI*hz*i/48000+seed*.7;samples[i]=(.2*Math.sin(p)+velocity*.15*Math.sin(2*p))*Math.min(1,i/1500);}
 return {id:'z-'+seed,sourceSha256:seed.toString(16).padStart(64,'0'),instrument:'fixture',articulation:'sustain',expectedMidi:midi,measuredMidi:midi,velocity,variant:1,rms:.15,peak:.4,samples};
}
const curve=[{at:0,value:.35},{at:.5,value:.85},{at:1,value:.35}];
const opts=()=>({low:zone(.35,1),high:zone(.85,2),midi:69,seconds:1.5,curve});
test('two measured layers are mixed continuously, deterministic, with bounded alignment',()=>{
 const o=opts(),a=renderDynamicNote(o),b=renderDynamicNote({...o,mode:'fixed-high'});
 assert.equal(a.frames,72000);assert.notDeepEqual(a.samples,b.samples);
 assert.deepEqual(a.samples,renderDynamicNote(o).samples);
 assert.ok(a.correlation>.8);assert.ok(a.offsets.every(x=>x>=0&&x<60));
 assert.ok(a.samples.every(x=>Number.isFinite(x)&&Math.abs(x)<.9));
 assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
 assert.deepEqual(a.sourceIds,['z-1','z-2']);
 // At full high-layer pressure the morph exactly equals the fixed-high control.
 const high=[{at:0,value:.85},{at:1,value:.85}];
 assert.deepEqual(renderDynamicNote({...o,curve:high}).samples,renderDynamicNote({...o,curve:high,mode:'fixed-high'}).samples);
});
test('paired root coverage, exact phrase grid and rejected malformed input',()=>{
 const o=opts(),zones=[o.low,o.high,zone(.35,3,72),zone(.85,4,72)];
 const notes=[{midi:69,start:0,duration:.5,curve},{midi:72,start:.6,duration:.5,curve}];
 const p={zones,instrument:'fixture',articulation:'sustain',notes,seconds:1.2};
 const r=renderDynamicPhrase(p);assert.equal(r.samples.length,57600);assert.deepEqual(r.choices.map(c=>c.root),[69,72]);assert.deepEqual(r.choices.map(c=>c.startFrame),[0,28800]);
 assert.throws(()=>renderDynamicPhrase({...p,zones:[o.low]}),/No paired/);
 assert.throws(()=>renderDynamicNote({...o,high:{...o.high,sourceSha256:o.low.sourceSha256}}),/Invalid recorded layer/);
 assert.throws(()=>renderDynamicNote({...o,midi:90}),/Invalid recorded layer/);
 assert.throws(()=>renderDynamicNote({...o,seconds:3}),/too short/);
 assert.throws(()=>renderDynamicNote({...o,curve:[{at:0,value:.35},{at:0,value:.85},{at:1,value:.35}]}),/Invalid morph curve/);
 assert.throws(()=>renderDynamicPhrase({...p,notes:[notes[0],{...notes[1],start:.2}]}),/Invalid dynamic grid/);
});
