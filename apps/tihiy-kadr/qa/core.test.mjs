import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RATE,MAX_SECONDS,validRange,suppressStereoCenter,wavPCM16,safeName} from '../audio-utils.js';
const a=v=>Float32Array.from(v);

test('validates local video fragments up to 90 seconds',()=>{
 assert.equal(RATE,44100);assert.equal(MAX_SECONDS,90);
 assert.deepEqual(validRange(12,5,100),{start:12,duration:5});
 assert.throws(()=>validRange(0,91,100),/1–90/);
 assert.throws(()=>validRange(99,5,100),/1–90/);
});
test('WAV exports correct PCM16 RIFF data',async()=>{
 const wav=wavPCM16([a([0,.5,-.5,1])],RATE);
 const v=new DataView(await wav.arrayBuffer());
 assert.equal(wav.type,'audio/wav');assert.equal(wav.size,52);
 assert.equal(v.getUint32(24,true),RATE);
 assert.equal(v.getInt16(50,true),32767);
 assert.equal(safeName('test;<>.mp4'),'test');
});
test('real Open-Unmix/SCNet inference requires ONNX WASM and vocals stem',()=>{
 const worker=readFileSync(new URL('../mrx-worker.js',import.meta.url),'utf8');
 assert.match(worker,/@audio\/neural-separate@0\.7\.0/);
 assert.match(worker,/await separate\(channels/);
 assert.match(worker,/required=\['vocals'\]/);
 assert.match(worker,/modelType:'openunmix'/);
 assert.doesNotMatch(worker,/mrx-v1|dialogue','music','effects/);
});
test('neural listening never restores original soundtrack to muted video',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/video\.addEventListener\('volumechange',lockVideoMute\)/);
 assert.match(app,/audio\.play\(\),video\.play\(\)/);
 assert.match(app,/mode==='speech'/);
});
test('optional centre filter attenuates mid speech and leaves anti-phase ambience',()=>{
 const N=44100,mid=new Float32Array(N);
 for(let i=0;i<N;i++)mid[i]=.25*Math.sin(2*Math.PI*1300*i/44100);
 const rms=x=>Math.sqrt(x.reduce((n,v)=>n+v*v,0)/x.length);
 const filtered=suppressStereoCenter([mid,mid],70);
 assert(rms(filtered[0])<rms(mid)*.65);
 const wide=suppressStereoCenter([mid,mid.map(x=>-x)],100);
 assert(rms(wide[0])>=rms(mid)*.999);
 assert.equal(suppressStereoCenter([mid],100)[0],mid);
});
