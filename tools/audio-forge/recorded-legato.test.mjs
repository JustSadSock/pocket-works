import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank} from './recorded-articulations.mjs';
import {renderRecordedLegato} from './recorded-legato.mjs';
function zone(midi,seed){
 const a=new Float32Array(144000),hz=440*2**((midi-69)/12);
 for(let i=0;i<a.length;i++){const p=2*Math.PI*hz*i/48000;a[i]=(.2*Math.sin(p)+.04*Math.sin(2*p+seed))*Math.min(1,i/4000);}
 return {...prepareRecordedNote(a,midi),id:'z-'+midi,instrument:'fixture',articulation:'sustain',velocity:.6,variant:1,sourceSha256:seed.toString(16).padStart(64,'0')};
}
const notes=[{midi:60,start:0,duration:.7,pressure:.6,articulation:'sustain'},{midi:64,start:.7,duration:.7,pressure:.6,articulation:'sustain',connected:true},{midi:60,start:1.4,duration:.7,pressure:.6,articulation:'sustain',connected:true}];
function setup(){return {bank:createRecordedInstrumentBank([zone(60,1),zone(64,2)]),instrument:'fixture',notes,seconds:2.2};}
test('connected notes preserve old voice at boundary and skip new attack',()=>{
 const opts=setup(),a=renderRecordedLegato(opts);
 opts.bank.reset();const b=renderRecordedLegato({...opts,notes:notes.map(n=>({...n,connected:false}))});
 assert.equal(a.samples.length,105600);
 assert.equal(a.choices[1].crossfadeFrames,2640);
 assert.equal(a.choices[1].sourceOffsetFrames,7680);
 const rms=(s,start,end)=>Math.sqrt(s.subarray(start,end).reduce((e,v)=>e+v*v,0)/(end-start));
 assert.ok(rms(a.samples,33120,34080)>rms(b.samples,33120,34080)*2);
 assert.ok(a.choices.slice(1).every(c=>c.boundaryStep<.05));
 assert.ok(a.samples.every(x=>Number.isFinite(x)&&Math.abs(x)<.9));
 assert.equal(a.samples[0],0);assert.equal(a.samples.at(-1),0);
 opts.bank.reset();assert.deepEqual(a.samples,renderRecordedLegato(opts).samples);
});
test('reject noncontiguous connection, unknown articulation and source exhaustion',()=>{
 const opts=setup();
 assert.throws(()=>renderRecordedLegato({...opts,notes:[{...notes[0],connected:true}]}),/connected note grid/);
 assert.throws(()=>renderRecordedLegato({...opts,notes:[notes[0],{...notes[1],start:.8}]}),/connected note grid/);
 assert.throws(()=>renderRecordedLegato({...opts,notes:[notes[0],{...notes[1],articulation:'missing'}]}),/connected note grid/);
 assert.throws(()=>renderRecordedLegato({...opts,notes:[{...notes[0],duration:5}],seconds:5}),/too short/);
});
