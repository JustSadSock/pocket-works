import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RATE,MAX_SECONDS,validRange,mixPCM,wavPCM16,safeName} from '../audio-utils.js';
const a=x=>Float32Array.from(x);
const fixture={
 input:[a([.2,.4,-.3,.7])],
 stems:{dialogue:[a([.1,.3,-.2,.2])],music:[a([.08,.05,-.06,.3])],effects:[a([.02,.05,-.04,.2])]}
};
test('MRX sample rate and scene bounds',()=>{
 assert.equal(RATE,44100);assert.equal(MAX_SECONDS,90);
 assert.deepEqual(validRange(12,5,100),{start:12,duration:5});
 assert.throws(()=>validRange(0,91,100),/1–90/);
 assert.throws(()=>validRange(99,5,100),/1–90/);
 assert.throws(()=>validRange(-1,5,100));
});
test('default M&E mix subtracts the dialogue stem without touching other tracks',()=>{
 const mixed=mixPCM(fixture.input,fixture.stems);
 assert.equal(mixed.length,1);
 fixture.input[0].forEach((v,i)=>assert(Math.abs(mixed[0][i]-(v-fixture.stems.dialogue[0][i]))<1e-6));
});
test('100% all channels leaves source unchanged and 0% all removes estimated stems',()=>{
 const same=mixPCM(fixture.input,fixture.stems,{dialogue:1,music:1,effects:1});
 assert.deepEqual([...same[0]],[...fixture.input[0]]);
 const zero=mixPCM(fixture.input,fixture.stems,{dialogue:0,music:0,effects:0});
 assert(Math.abs(zero[0][0])<1e-5);
});
test('WAV RIFF PCM16 carries correct length and samples',async()=>{
 const blob=wavPCM16([a([0,.5,-.5,1])],RATE);
 const view=new DataView(await blob.arrayBuffer());
 assert.equal(blob.type,'audio/wav');assert.equal(blob.size,52);
 assert.equal(view.getUint32(24,true),RATE);
 assert.equal(view.getUint16(22,true),1);
 assert.equal(view.getInt16(44,true),0);
 assert.equal(view.getInt16(50,true),32767);
});
test('stereo mixing does not silently swap or drop channels',()=>{
 const input=[a([.3,.8]),a([-.5,-.2])];
 const stems={dialogue:[a([.1,.2]),a([-.3,-.1])],music:[a([0,0]),a([0,0])],effects:[a([0,0]),a([0,0])]};
 const mixed=mixPCM(input,stems);
 assert.equal(mixed[0].length,2);assert.equal(mixed[1].length,2);
 assert(Math.abs(mixed[1][0]+.2)<1e-6);
 assert.throws(()=>mixPCM(input,{...stems,effects:[a([0])] }),/длины/);
});
test('selected filenames remain safe for downloads',()=>{assert.equal(safeName('test;<>.mp4'),'test');assert.equal(safeName(''), 'video')});
test('separation runs the actual 3-stem MRX, not a fake filter',()=>{
 const w=readFileSync(new URL('../mrx-worker.js',import.meta.url),'utf8');
 assert.match(w,/@audio\/neural-separate@0\.7\.0/);
 assert.match(w,/await separate\(channels/);
 assert.match(w,/model:'mrx'/);
 for(const name of ['dialogue','music','effects'])assert(w.includes("'"+name+"'"));
});
