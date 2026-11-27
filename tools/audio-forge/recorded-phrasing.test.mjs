import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecordedGestures,compileRecordedPhrasing,compileRecordedReattack} from './recorded-phrasing.mjs';

const curve=[{at:0,value:.8},{at:.5,value:1.15},{at:1,value:.72}];
const notes=[
 {midi:69,start:0,duration:.8,phraseId:'line'},
 {midi:72,start:.8,duration:.8,phraseId:'line',connected:true},
 {midi:72,start:1.6,duration:.8,phraseId:'line',connected:true,reattack:{kind:'bow-change'}}
];
const phrase={id:'line',technique:'bowed',start:0,end:2.4,curve};

test('shared gesture timeline validates and preserves a continuous score-domain curve',()=>{
 const [g]=validateRecordedGestures([{id:'line',start:0,end:2.4,curve}],3);
 const compiled=compileRecordedPhrasing([phrase],notes,3).get('line');
 assert.equal(compiled.valueAt(0),.8);
 assert.equal(compiled.valueAt(1.2),1.15);
 assert.equal(compiled.valueAt(2.4),.72);
 assert.equal(compiled.valueAt(.8),compiled.valueAt(.8));
 assert.deepEqual(g.curve,curve);
 assert.equal(compiled.startFrame,0);
 assert.equal(compiled.endFrame,115200);
});

test('bow changes and breath rearticulations have distinct bounded envelopes',()=>{
 const p=compileRecordedPhrasing([phrase],notes,3).get('line');
 const bow=compileRecordedReattack(notes[2],notes[1],p);
 assert.equal(bow.gainAt(0),1);
 assert.ok(Math.abs(bow.gainAt(.05)-.72)<1e-12);
 assert.equal(bow.gainAt(.1),1);
 assert.equal(bow.metadata.sourceOffsetFrames,0);
 const windPhrase={...phrase,technique:'breath'};
 const windNotes=notes.map(n=>({...n,reattack:undefined}));
 windNotes[2]={...windNotes[2],reattack:{kind:'breath',strength:.5,durationSeconds:.1}};
 const wind=compileRecordedPhrasing([windPhrase],windNotes,3).get('line');
 const breath=compileRecordedReattack(windNotes[2],windNotes[1],wind);
 assert.equal(breath.gainAt(0),.5);
 assert.equal(breath.gainAt(.05),.75);
 assert.equal(breath.gainAt(.1),1);
});

test('rejects orphaned, discontinuous, overlapping and malformed phrase definitions',()=>{
 assert.throws(()=>validateRecordedGestures([{id:'bad id',start:0,end:1,curve}],2));
 assert.throws(()=>validateRecordedGestures([{id:'a',start:0,end:1,curve},{id:'b',start:.9,end:2,curve}],2));
 assert.throws(()=>validateRecordedGestures([{id:'a',start:0,end:1,curve:[{at:0,value:.2},{at:1,value:1}]}],2));
 assert.throws(()=>compileRecordedPhrasing([phrase],[notes[0]],3),/at least two/);
 assert.throws(()=>compileRecordedPhrasing([phrase],[notes[0],{...notes[2],start:1.6}],3),/range/);
 assert.throws(()=>compileRecordedPhrasing([phrase],[notes[0],notes[1],{...notes[2],phraseId:'other'}],3),/range|reference/);
 assert.throws(()=>compileRecordedPhrasing([phrase],notes.map((n,i)=>i===2?{...n,phraseId:'missing'}:n),3),/reference/);
});

test('reattack is restricted to same-pitch connected notes and matching phrase technique',()=>{
 const p=compileRecordedPhrasing([phrase],notes,3).get('line');
 assert.throws(()=>compileRecordedReattack({...notes[2],midi:69},notes[1],p),/not valid/);
 assert.throws(()=>compileRecordedReattack({...notes[2],connected:false},notes[1],p),/not valid/);
 assert.throws(()=>compileRecordedReattack({...notes[2],reattack:{kind:'breath'}},notes[1],p),/not valid/);
 assert.throws(()=>compileRecordedReattack({...notes[2],reattack:{kind:'bow-change',strength:.9}},notes[1],p),/envelope/);
});
