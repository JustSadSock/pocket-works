import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AUDIO_MIMES,microphoneRequest,createVoiceRecorder,reconcileRecordingEnd,normalizeMicMode} from '../recording-audio.js';

test('phone, Android, Safari and desktop requests disable destructive voice gating',()=>{
 for(const device of [{},{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:true}]){
  const options=microphoneRequest(device);
  assert.equal(options.audio.echoCancellation,false);
  assert.equal(options.audio.noiseSuppression,false);
  assert.equal(options.audio.autoGainControl,false);
  assert.deepEqual(options.audio.channelCount,{ideal:1});
 }
 assert.deepEqual(microphoneRequest({echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:false}),{audio:true});
});
test('codec negotiation survives WebM-only Chromium, MP4-only Safari, and rejected constructors',()=>{
 class Recorder{
  static allowed=new Set();
  static failing=new Set();
  static isTypeSupported(type){return this.allowed.has(type)}
  constructor(stream,options={}){if(Recorder.failing.has(options.mimeType))throw Error('codec failed');this.mimeType=options.mimeType||'default';this.stream=stream}
 }
 const stream={id:'microphone'};
 Recorder.allowed=new Set(['audio/webm;codecs=opus']);
 assert.equal(createVoiceRecorder(stream,Recorder).mimeType,'audio/webm;codecs=opus');
 Recorder.allowed=new Set(['audio/mp4']);
 assert.equal(createVoiceRecorder(stream,Recorder).mimeType,'audio/mp4');
 Recorder.allowed=new Set(AUDIO_MIMES);Recorder.failing=new Set(['audio/webm;codecs=opus']);
 assert.equal(createVoiceRecorder(stream,Recorder).mimeType,'audio/mp4;codecs=mp4a.40.2');
 Recorder.allowed=new Set();Recorder.failing=new Set();
 assert.equal(createVoiceRecorder(stream,Recorder).mimeType,'default');
 assert.throws(()=>createVoiceRecorder(stream,null),/не поддерживается/);
});
test('short mobile recordings never claim silence padded by a frozen video',()=>{
 assert.deepEqual(reconcileRecordingEnd(7,13,3.25),{end:10.25,short:true});
 assert.deepEqual(reconcileRecordingEnd(0,4,3.95),{end:4,short:false});
 assert.deepEqual(reconcileRecordingEnd(3,8,NaN),{end:8,short:false});
 assert.deepEqual(reconcileRecordingEnd(2,3,0),{end:3,short:false});
 assert.throws(()=>reconcileRecordingEnd(4,2,1),/диапазон/);
});
test('mobile microphone tracks flush once, save at stop, and stop on interruption',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/microphoneRequest\(navigator\.mediaDevices\.getSupportedConstraints/);
 assert.match(source,/createVoiceRecorder\(stream\)/);
 assert.match(source,/rec\.start\(\);record=active/);
 assert.doesNotMatch(source,/rec\.start\(250\)/);
 assert.doesNotMatch(source,/r\.rec\.requestData\(\)/);
 assert.match(source,/document\.hidden&&record/);
 assert.match(source,/r\.rec\.onstop\?\.\(\)/);
 assert.match(source,/track\.addEventListener\('ended'/);
});

test('each recording can explicitly opt into noise suppression without changing AEC or AGC',()=>{
 assert.equal(normalizeMicMode('noise-reduced'),'noise-reduced');
 assert.equal(normalizeMicMode('bogus'),'raw');
 const support={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:true};
 assert.deepEqual(microphoneRequest(support,'noise-reduced').audio,{
  echoCancellation:false,noiseSuppression:true,autoGainControl:false,channelCount:{ideal:1}
 });
 assert.equal(microphoneRequest(support,'raw').audio.noiseSuppression,false);
});
