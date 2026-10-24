import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {videoBitrate,formatVideoBytes,estimateVideoBytes,planVideoPreparation,frameCaptureMode,mediaSettingsKey,MAX_ROOM_VIDEO_BYTES,MAX_SOURCE_VIDEO_BYTES} from '../media-lab.js';

test('P2P room budget is larger than old 32 MiB cap but bounded',()=>{
  assert.equal(MAX_ROOM_VIDEO_BYTES,96*1024*1024);
  assert.equal(MAX_SOURCE_VIDEO_BYTES,512*1024*1024);
  assert(MAX_ROOM_VIDEO_BYTES>32*1024*1024);
});
test('export bitrate rises with each requested quality level',()=>{
  const rates=[1,2,3,4,5].map(videoBitrate);
  for(let i=1;i<rates.length;i++)assert(rates[i]>rates[i-1]);
  assert(estimateVideoBytes(90,4)<MAX_ROOM_VIDEO_BYTES);
  assert(estimateVideoBytes(90,5)<MAX_ROOM_VIDEO_BYTES);
});
test('size labels and estimates use binary MiB',()=>{
  assert.equal(formatVideoBytes(96*1024*1024),'96 МиБ');
  assert.equal(formatVideoBytes(512*1024),'512 КиБ');
  assert(estimateVideoBytes(10,3)<estimateVideoBytes(90,3));
});
test('room selection, wire sender and receiver enforce the same video budget',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/sourceBlob\?\.size>MAX_ROOM_VIDEO_BYTES/);
  assert.match(app,/item\.kind==='video'\?MAX_ROOM_VIDEO_BYTES/);
  assert.match(app,/m\.media==='video'\?MAX_ROOM_VIDEO_BYTES/);
  assert.match(app,/f\.size>MAX_ROOM_VIDEO_BYTES/);
});
test('offline PWA retains the local encoder after reload',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(sw,/\.\/media-lab\.js/);
  assert.match(sw,/ne-tem-golosom-v1\.6\.0/);
});

test('instant source reuse does not transcode a video that fits the room',()=>{
  assert.deepEqual(planVideoPreparation({size:20*1024*1024,mode:'host'}),{kind:'reuse',reason:'fits'});
  assert.deepEqual(planVideoPreparation({size:MAX_ROOM_VIDEO_BYTES,mode:'host'}),{kind:'reuse',reason:'fits'});
  assert.deepEqual(planVideoPreparation({size:MAX_ROOM_VIDEO_BYTES+1,mode:'host'}),{kind:'encode',reason:'room-limit'});
  assert.deepEqual(planVideoPreparation({size:500*1024*1024,mode:'solo'}),{kind:'reuse',reason:'local'});
  assert.equal(planVideoPreparation({size:0}).kind,'invalid');
});
test('optional source audio decreases estimated video bytes and skips unnecessary encoding work',()=>{
  assert(estimateVideoBytes(60,4,false)<estimateVideoBytes(60,4,true));
  assert.equal(estimateVideoBytes(60,4,true)-estimateVideoBytes(60,4,false),60*96000/8);
});
test('decoded-frame capture uses manual frame requests only when the API is supported',()=>{
  const video={requestVideoFrameCallback(){},cancelVideoFrameCallback(){}};
  const manual={requestFrame(){}};
  assert.equal(frameCaptureMode(video,manual),'decoded-frames');
  assert.equal(frameCaptureMode(video,{}),'compatibility');
  assert.equal(frameCaptureMode({},manual),'compatibility');
});
test('encoded clip cache key changes with every user-relevant setting',()=>{
  const settings={start:12.25,duration:25,width:960,level:3,keepAudio:false};
  const key=mediaSettingsKey(settings);
  assert.equal(mediaSettingsKey({...settings}),key);
  for(const prop of ['start','duration','width','level','keepAudio']){
    const changed={...settings,[prop]:prop==='keepAudio'?true:settings[prop]+1};
    assert.notEqual(mediaSettingsKey(changed),key,prop);
  }
});
test('media preparation UX shows the fast route and keeps the source soundtrack optional',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const media=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
  assert.match(html,/id="media-fast-status"/);
  assert.match(html,/id="media-keep-audio" type="checkbox"/);
  assert.match(app,/planVideoPreparation\(\{size:sourceBlob\.size,mode\}\)/);
  assert.match(app,/encodedCache\?\.source===sourceBlob/);
  assert.match(media,/requestVideoFrameCallback/);
  assert.match(media,/keepAudio = false/);
});
