import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvasFrameTelemetry} from '../frame-performance.js';

test('measured canvas frame percentiles count only actual paints, not idle redraw skips',()=>{
 const reports=[];
 const meter=createCanvasFrameTelemetry(data=>reports.push(data),{batchSize:10});
 const times=[100,116,132,148,164,180,196,212,228,244];
 const costs=[1,2,4,8,16,32,0,0,0,0];
 times.forEach((time,i)=>meter.record(time,costs[i],i<6));
 assert.equal(reports.length,1);
 assert.deepEqual(reports[0],{
  sampledFrames:10,paintedFrames:6,skippedFrames:4,
  drawP50Ms:4,drawP95Ms:32,drawP99Ms:32,drawMaxMs:32,
  maxFrameGapMs:16,paintedUpdatesPerSecond:41.67
 });
 meter.record(NaN,3,true);meter.record(1000,-1,true);
 for(let i=0;i<10;i++)meter.record(300+i*16,3,true);
 assert.equal(reports.length,2,'new sample windows reset all state');
 assert.equal(reports[1].skippedFrames,0);
 assert.equal(reports[1].drawP99Ms,3);
});

test('the profiler never records drawings, coordinates, player or room IDs',()=>{
 let payload=null;
 const meter=createCanvasFrameTelemetry(stats=>payload=stats,{batchSize:10});
 for(let i=0;i<10;i++)meter.record(i*16,1,i%2===0);
 assert.ok(payload);
 assert.deepEqual(Object.keys(payload).sort(),[
  'sampledFrames','paintedFrames','skippedFrames','drawP50Ms','drawP95Ms',
  'drawP99Ms','drawMaxMs','maxFrameGapMs','paintedUpdatesPerSecond'
 ].sort());
});
