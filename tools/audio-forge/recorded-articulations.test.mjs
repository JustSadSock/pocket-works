import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank,renderArticulatedPhrase} from './recorded-articulations.mjs';
function zone(id,instrument,articulation,midi,velocity,variant,seed){
 const a=new Float32Array(96000),hz=440*2**((midi-69)/12);
 for(let i=0;i<a.length;i++){const t=2*Math.PI*hz*i/48000;a[i]=(.25*Math.sin(t)+(.02+seed*.007)*Math.sin(t*2+seed))*Math.min(1,i/1600);}
 return {...prepareRecordedNote(a,midi),id,instrument,articulation,velocity,variant,sourceSha256:seed.toString(16).padStart(64,'0')};
}
function fixture(){return [
 zone('v-p','violin','arco-vib',69,.35,1,1),
 zone('v-f','violin','arco-vib',69,.85,1,2),
 zone('f-nv','flute','non-vibrato',72,.6,1,3),
 zone('f-vib-1','flute','vibrato',72,.6,1,4),
 zone('f-vib-2','flute','vibrato',72,.6,2,5)
];}
test('choose actual dynamic layer and articulation; no invented fallback',()=>{
 const bank=createRecordedInstrumentBank(fixture()),v={instrument:'violin',articulation:'arco-vib',midi:69};
 assert.equal(bank.select({...v,pressure:.3}).zone.id,'v-p');
 assert.equal(bank.select({...v,pressure:.9}).zone.id,'v-f');
 assert.equal(bank.select({...v,pressure:.9,lockedVelocity:.35}).zone.id,'v-p');
 assert.throws(()=>bank.select({...v,pressure:.9,lockedVelocity:.6}),/Unrecorded dynamic/);
 assert.throws(()=>bank.select({...v,pressure:.7,articulation:'pizzicato'}),/Unrecorded articulation/);
 assert.throws(()=>bank.select({...v,pressure:.7,midi:90}),/coverage/);
});
test('round robin is independent for each articulation and resettable',()=>{
 const bank=createRecordedInstrumentBank(fixture()),v={instrument:'flute',articulation:'vibrato',midi:72,pressure:.6};
 assert.equal(bank.select(v).variant,1);
 assert.equal(bank.select({...v,articulation:'non-vibrato'}).variant,1);
 assert.equal(bank.select(v).variant,2);assert.equal(bank.select(v).variant,1);
 assert.equal(bank.select({...v,roundRobin:false}).variant,1);
 assert.equal(bank.select(v).variant,2);
 bank.reset();assert.equal(bank.select(v).variant,1);
 assert.equal(bank.coverage().length,4);
 const bad=fixture();bad[1].sourceSha256=bad[0].sourceSha256;assert.throws(()=>createRecordedInstrumentBank(bad),/duplicate/);
});
test('render exact note grid, log selected source identity and vary repeated attacks',()=>{
 const bank=createRecordedInstrumentBank(fixture()),notes=Array.from({length:4},(_,i)=>({midi:72,start:i*.5,duration:.4,pressure:.6,articulation:'vibrato'}));
 const opts={bank,instrument:'flute',notes,seconds:2};
 const a=renderArticulatedPhrase(opts);bank.reset();const b=renderArticulatedPhrase(opts);
 assert.equal(a.samples.length,96000);assert.deepEqual(a.samples,b.samples);
 assert.deepEqual(a.choices.map(c=>c.variant),[1,2,1,2]);
 assert.deepEqual(a.choices.map(c=>c.startFrame),[0,24000,48000,72000]);
 assert.notDeepEqual(a.samples.slice(0,19200),a.samples.slice(24000,43200));
 assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.9));
 assert.throws(()=>renderArticulatedPhrase({...opts,notes:[notes[0],{...notes[1],start:.2}]}),/Unaligned/);
});
