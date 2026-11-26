import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRecordedPerformance} from './recorded-performance.mjs';
function fixture(){
 const zones=[];
 for(const midi of [69,72])for(const velocity of [.35,.85])for(const variant of [1,2]){
  const samples=new Float32Array(144000),hz=440*2**((midi-69)/12),id=zones.length+1;
  for(let i=0;i<samples.length;i++){const p=2*Math.PI*hz*i/48000;samples[i]=(.15*Math.sin(p)+velocity*.06*Math.sin(p*2+variant))*Math.min(1,i/1200);}
  const period=48000/hz,fade=Math.round(period*10),start=24000,end=start+fade+Math.round(period*400);
  zones.push({id:'z-'+id,sourceSha256:id.toString(16).padStart(64,'0'),instrument:'fixture',articulation:'arco',expectedMidi:midi,measuredMidi:midi,velocity,variant,samples,rms:.12,peak:.22,loop:{start,end,fade,correlation:.99,rmsRatio:.99}});
 }
 return zones;
}
const curve=[{at:0,value:.35},{at:.5,value:.85},{at:1,value:.35}];
const notes=[{midi:69,start:0,duration:4,articulation:'arco',curve,morph:true,sustain:true},{midi:72,start:4,duration:2,articulation:'arco',curve,morph:true,sustain:true,connected:true},{midi:69,start:6,duration:2,articulation:'arco',curve,morph:true,sustain:true,connected:true}];
test('one performance combines independent loop cursors, dynamic layers, legato and take rotation',()=>{
 const opts={zones:fixture(),instrument:'fixture',notes,seconds:8.2},a=renderRecordedPerformance(opts);
 assert.equal(a.samples.length,393600);assert.equal(a.choices.length,3);
 assert.ok(a.choices.every(x=>x.layers.length===2&&x.wraps.every(w=>w>0)));
 assert.deepEqual(a.choices.map(x=>x.variants),[[1,1],[1,1],[2,2]]);
 assert.ok(a.choices.slice(1).every(x=>x.connected&&x.boundaryStep<.1));
 assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));
 assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
 assert.deepEqual(a.samples,renderRecordedPerformance(opts).samples);
 assert.notDeepEqual(a.samples,renderRecordedPerformance({...opts,mode:'discrete'}).samples);
});
test('explicit admission rejects unknown articulation, unqualified sustain, bad connection and duplicate source',()=>{
 const zones=fixture(),opts={zones,instrument:'fixture',notes,seconds:8.2};
 assert.throws(()=>renderRecordedPerformance({...opts,notes:[{...notes[0],articulation:'missing'}]}),/Unrecorded/);
 assert.throws(()=>renderRecordedPerformance({...opts,notes:[{...notes[0],connected:true}]}),/grid/);
 assert.throws(()=>renderRecordedPerformance({...opts,zones:zones.map(z=>({...z,loop:undefined}))}),/Unqualified/);
 assert.throws(()=>renderRecordedPerformance({...opts,zones:[...zones,zones[0]]}),/Duplicate/);
});
