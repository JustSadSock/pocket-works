import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAX_ROOM_VIDEO_BYTES,estimateVideoBytes} from '../media-lab.js';

const film=readFileSync(new URL('../film-cleanup.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('low-memory neural chunks reuse one worker and do not terminate it between tasks',async()=>{
 const start=film.indexOf('function createWorkerTask(');
 const end=film.indexOf('async function decodeAudioFromVideo(',start);
 assert.ok(start>=0&&end>start);
 const workers=[];
 class WorkerMock{
  terminated=0;
  constructor(){workers.push(this)}
  postMessage(packet){
   queueMicrotask(()=>this.onmessage?.({data:{id:packet.id,stage:'done',seconds:1}}));
  }
  terminate(){this.terminated++}
 }
 const context={Worker:WorkerMock,live(){},aborted(){return Error('cancelled')}};
 runInNewContext(film.slice(start,end),context);
 const shared=new WorkerMock();
 for(const id of ['chunk-1','chunk-2','chunk-3']){
  const result=await context.createWorkerTask('model',{id,channels:[new Float32Array([1,2])]},undefined,()=>{},{worker:shared});
  assert.equal(result.id,id);
  assert.equal(shared.terminated,0);
 }
 shared.terminate();
 const dedicated=await context.createWorkerTask('model',{id:'standalone'},undefined,()=>{});
 assert.equal(dedicated.id,'standalone');
 assert.equal(workers.length,2,'no extra workers across chunks');
 assert.equal(workers[1].terminated,1,'standalone tasks still clean up');
 assert.match(film,/const sharedModelWorker=new Worker/);
 assert.match(film,/model\(cut,kind,sharedModelWorker\)/);
 assert.match(film,/finally\{sharedModelWorker\.terminate\(\)\}/);
});
test('small original scene keeps source quality, oversized file still gets a real cut',()=>{
 const start=app.indexOf('function canUseLosslessCut(){');
 const end=app.indexOf('function hasSceneReview(){',start);
 assert.ok(start>=0&&end>start);
 const context={
  Blob,mode:'host',selected:{totalDuration:60},sourceBlob:new Blob([new Uint8Array(1024)]),
  selectedSound:()=> 'original',
  MAX_ROOM_VIDEO_BYTES,estimateVideoBytes,
  $:id=>id==='trim-video'?{videoWidth:1280}:{value:id==='trim-length'?'60':id==='trim-start'?'0':id==='media-resolution'?'1920':'5'}
 };
 runInNewContext(app.slice(start,end),context);
 assert.equal(context.canSkipSceneEncoding(),true);
 context.selected.totalDuration=120; // A short excerpt must be really cut, not share the full film.
 assert.equal(context.canSkipSceneEncoding(),false);
 context.selected.totalDuration=60;
 const oversized=new Blob([]);Object.defineProperty(oversized,'size',{value:220*1048576});
 context.sourceBlob=oversized;
 assert.equal(context.canSkipSceneEncoding(),false);
 context.sourceBlob=new Blob([new Uint8Array(1024)]);
 context.selectedSound=()=> 'neural';
 assert.equal(context.canSkipSceneEncoding(),false);
 context.selectedSound=()=> 'original';
 context.mode='solo';
 assert.equal(context.canSkipSceneEncoding(),true);
});
test('neural PCM cache is keyed to source and settings, cleared on new or accepted scenes',()=>{
 assert.match(app,/filmCleanCache\?\.blob===blob&&filmCleanCache\.start===start/);
 assert.match(app,/filmCleanCache\.duration===duration&&filmCleanCache\.mode===selectedMode/);
 assert.match(app,/filmCleanCache\.lowMemory===lowMemory/);
 assert.match(app,/filmCleanCache=\{blob,start,duration,mode:selectedMode,lowMemory,plan\}/);
 assert.match(app,/const plan=cached\?filmCleanCache\.plan:await cleanFilmSound\(/);
 assert.match(app,/filmLocalSource=null;filmPreparedBlob=null;filmCleanCache=null/);
 assert.match(app,/encodedCache=null;filmCleanCache=null/);
});
