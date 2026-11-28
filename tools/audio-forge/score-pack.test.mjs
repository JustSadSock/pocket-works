import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeForgeWav,loadForgeScore} from '../../shared/capabilities/score-pack.js';
const frames=9600;
function fixture(){
 const bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes);
 const tag=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
 tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,192000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,frames*4,true);
 v.setInt16(44,16384,true);v.setInt16(46,-16384,true);
 const descriptor={id:'peace',file:'states/peace.wav',frames,sampleRate:48000,tempo:300,beatsPerBar:1,bars:1};
 const graph={version:1,initial:'peace',states:{peace:descriptor},edges:{peace:[]}};
 const metrics={metrics:[{file:descriptor.file,frames,sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex')}]};
 const context={sampleRate:44100,createBuffer(numberOfChannels,length,sampleRate){const data=Array.from({length:numberOfChannels},()=>new Float32Array(length));return {numberOfChannels,length,sampleRate,getChannelData:c=>data[c]}}};
 let calls=0;
 const options={context,graph,metrics,baseUrl:'https://example.test/score/',fetcher:async()=>{calls++;return {ok:true,arrayBuffer:async()=>bytes.slice(0)}}};
 return {bytes,options,calls:()=>calls};
}
test('load exact stereo 48k grid on a 44.1k context and verify hash',async()=>{
 const {options,calls}=fixture(),p=await loadForgeScore(options);
 assert.equal(calls(),1);assert.equal(p.buffers.peace.sampleRate,48000);assert.equal(p.buffers.peace.length,frames);
 assert.equal(p.buffers.peace.getChannelData(0)[0],.5);assert.equal(p.buffers.peace.getChannelData(1)[0],-.5);
 assert.equal(p.reservedBytes,frames*8);
});
test('reject too-small memory budget and unsafe paths before fetching',async()=>{
 const {options,calls}=fixture();
 await assert.rejects(loadForgeScore({...options,maxDecodedBytes:frames*8-1}),/before fetch/);
 options.graph.states.peace.file='../escape.wav';
 await assert.rejects(loadForgeScore(options),/Invalid score asset/);assert.equal(calls(),0);
});
test('reject modified PCM and malformed WAV',async()=>{
 const {options,bytes}=fixture();new Uint8Array(bytes)[45]^=1;
 await assert.rejects(loadForgeScore(options),/hash mismatch/);
 new Uint8Array(bytes)[0]=0;
 assert.throws(()=>decodeForgeWav(options.context,bytes,frames,48000),/header/);
});
