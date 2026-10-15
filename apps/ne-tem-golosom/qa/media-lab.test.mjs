import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {videoBitrate,formatVideoBytes,estimateVideoBytes,MAX_ROOM_VIDEO_BYTES,MAX_SOURCE_VIDEO_BYTES} from '../media-lab.js';

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
  assert.match(sw,/ne-tem-golosom-v1\.1\.0/);
});
