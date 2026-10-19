import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFieldTelemetry,presentationDelta,recordFieldWindow,sanitizeFieldTelemetry,fieldPerformance,
 observedBalance,buildFieldExport} from '../fieldTelemetry.js';
import {recordFinishedRun,sanitizeRunHistory} from '../runTuning.js';
import {validateRun} from '../stability.js';

test('physical FPS readings accumulate only observed WebGL windows with no fake samples',()=>{
 let report=emptyFieldTelemetry();
 assert.equal(fieldPerformance(report).averageFps,null);
 for(let i=0;i<12;i++)report=recordFieldWindow(report,i%3===0?24:50,4,
    {gpuGeometries:113+i,drawCalls:17+i,instancedLive:150+i,budgetOk:i%5!==0});
 const perf=fieldPerformance(report);
 assert.equal(perf.seconds,48);assert.equal(perf.windows,12);
 assert.equal(perf.minimumFps,24);assert.equal(perf.slowWindows,4);
 assert.equal(perf.budgetWarnings,3);
 assert.equal(perf.peakGeometries,124);assert.equal(perf.peakDrawCalls,28);
 assert.ok(perf.averageFps>40&&perf.averageFps<43);
 assert.equal(perf.reliable,true);
 const invalid=recordFieldWindow(report,500,4,{gpuGeometries:9999});
 assert.deepEqual(invalid,report);
});
test('legacy, broken, huge and dangerous local save metrics are normalized and bounded',()=>{
 const dirty={windows:Infinity,seconds:1e9,weightedFps:-4,minFps:-50,
   slowWindows:50,budgetWarnings:900000,peakGeometries:1e8,peakDrawCalls:NaN};
 const s=sanitizeFieldTelemetry(dirty);
 assert.equal(s.seconds,72000);assert.equal(s.windows,0);assert.equal(s.slowWindows,0);
 assert.equal(s.minFps,null);assert.equal(s.peakGeometries,10000);
 assert.deepEqual(sanitizeFieldTelemetry(s),s);
 const legacy=validateRun({v:5,seed:413,x:3,z:3,hp:100,wave:3});
 assert.deepEqual(legacy.telemetry,emptyFieldTelemetry());
 let r=emptyFieldTelemetry();
 for(let i=0;i<4;i++)r=recordFieldWindow(r,42,4,{gpuGeometries:100});
 const save=validateRun({...legacy,telemetry:r});
 assert.deepEqual(save.telemetry,r);
 assert.deepEqual(validateRun(save),save);
});
test('win median and 15–25 minute classification derive only from played victories',()=>{
 const rows=[{elapsed:850,victory:true,protocol:'normal'},
  {elapsed:950,victory:true,protocol:'normal'},
  {elapsed:1200,victory:true,protocol:'siege'},
  {elapsed:1650,victory:true,protocol:'fragile'},
  {elapsed:220,victory:false,protocol:'siege'}];
 const b=observedBalance(rows);
 assert.equal(b.attempts,5);assert.equal(b.wins,4);assert.equal(b.winRate,80);
 assert.equal(b.medianVictorySeconds,1075);
 assert.equal(b.targetShare,50);
 assert.equal(b.hasSufficientTimingData,true);
 assert.equal(b.byProtocol.find(p=>p.protocol==='siege').runs,2);
 assert.equal(observedBalance(rows.slice(0,2)).hasSufficientTimingData,false);
 assert.equal(observedBalance([]).medianVictorySeconds,null);
});
test('history stores only compact anonymous measurements and serializes a self-contained report',()=>{
 let telemetry=emptyFieldTelemetry();
 for(let i=0;i<4;i++)telemetry=recordFieldWindow(telemetry,45,4,
   {gpuGeometries:88,drawCalls:23,instancedLive:42,budgetOk:true});
 const archive={history:[]};
 recordFinishedRun(archive,{elapsed:960,wave:5,waveTime:140,kills:111,score:3500,
   damageTaken:125,peakCombo:6,protocol:'normal',
   stageTimes:[{wave:1,seconds:200}],telemetry},true);
 const history=sanitizeRunHistory(archive.history);
 assert.deepEqual(history[0].telemetry,telemetry);
 const exported=buildFieldExport(history);
 assert.equal(exported.format,'meat-exe-field-report');
 assert.equal(exported.balance.performanceSamples,1);
 assert.equal(exported.history[0].telemetry.windows,4);
 assert.equal(JSON.stringify(exported).includes('userAgent'),false);
 assert.equal(JSON.stringify(exported).includes('location'),false);
 assert.equal(JSON.stringify(exported).includes('seed'),false);
});
test('10000 realistic 4-second windows maintain fixed storage bounds',()=>{
 let record=emptyFieldTelemetry();
 for(let i=0;i<10000;i++)record=recordFieldWindow(record,30+i%45,4,{
   gpuGeometries:110+i%50,drawCalls:100+i%5,instancedLive:90+i%20,budgetOk:true});
 assert.equal(record.windows,10000);
 assert.equal(record.seconds,40000);
 assert.ok(JSON.stringify(record).length<250,'compact telemetry instead of storing 10000 per-frame samples');
 assert.deepEqual(sanitizeFieldTelemetry(record),record);
});

test('wall presentation time captures actual jank without destabilizing capped physics',()=>{
 assert.equal(presentationDelta(16.666),.016666);
 assert.equal(presentationDelta(550),.55);
 assert.equal(presentationDelta(100000),2);
 assert.equal(presentationDelta(-20),0);
 assert.equal(presentationDelta(Infinity),0);
 // A 550ms frame contributes 0.55s to FPS measurement, but the game
 // still advances physics by at most 100ms.
 const real=presentationDelta(550);
 assert.equal(Math.min(.1,real),.1);
});
