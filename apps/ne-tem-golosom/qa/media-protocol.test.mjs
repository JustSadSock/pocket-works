import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_AUDIO_BYTES,validAudioEnvelope,validVideoEnvelope,canAcceptVoice} from '../media-protocol.js';

const base={meta:{id:'clip-1',owner:'guest',start:2,end:5,offset:0,epoch:7,round:4},
 bytes:120000,scene:{id:'scene',duration:20,custom:true},epoch:7,round:4,
 players:['host','guest','third'],expected:{host:1,guest:2,third:1},
 sender:'guest',host:'host',receiver:'host'};

test('voice direction and current scene',()=>{
 assert(validAudioEnvelope(base));
 assert(validAudioEnvelope({...base,sender:'host',receiver:'third'}));
 assert(!validAudioEnvelope({...base,sender:'third'}));
 assert(!validAudioEnvelope({...base,epoch:8}));
 assert(!validAudioEnvelope({...base,round:5}));
 assert(!validAudioEnvelope({...base,meta:{...base.meta,round:3}}));
 assert(!validAudioEnvelope({...base,meta:{...base.meta,epoch:8}}));
});
test('voice metadata and size boundaries',()=>{
 const edits=[
  {...base,meta:{...base.meta,start:-1}},
  {...base,meta:{...base.meta,end:21}},
  {...base,meta:{...base.meta,offset:NaN}},
  {...base,meta:{...base.meta,id:''}},
  {...base,bytes:MAX_AUDIO_BYTES+1},
  {...base,expected:{guest:0}}
 ];
 for(const data of edits)assert(!validAudioEnvelope(data));
});
test('video direction and selected scene',()=>{
 const good={meta:{scene:'scene',epoch:7},bytes:8000000,maxBytes:96*1024*1024,
  scene:base.scene,epoch:7,sender:'host',host:'host',receiver:'guest',phase:'lobby'};
 assert(validVideoEnvelope(good));
 assert(!validVideoEnvelope({...good,sender:'third'}));
 assert(!validVideoEnvelope({...good,phase:'premiere'}));
 assert(!validVideoEnvelope({...good,meta:{...good.meta,epoch:6}}));
 assert(!validVideoEnvelope({...good,bytes:good.maxBytes+1}));
});
test('room expects no more clips per actor than reported',()=>{
 assert(canAcceptVoice({owner:'guest',local:[],remote:[{owner:'guest'}],expected:base.expected}));
 assert(!canAcceptVoice({owner:'guest',local:[],remote:[{owner:'guest'},{owner:'guest'}],expected:base.expected}));
});
