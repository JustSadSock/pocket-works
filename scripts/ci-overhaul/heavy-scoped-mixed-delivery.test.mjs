import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMode,aggregate} from './heavy-scoped-mixed-delivery.mjs';
const ctx={run:10,attempt:1},candidate={decision:'candidate-only',identity:'scoped-cross-commit',receiptDigests:Array(8).fill('a')};
test('canary rotates, missing candidate executes, no production authorization',()=>{
 assert.equal(selectMode(candidate,ctx,3).mode,'fresh');assert.equal(selectMode(candidate,ctx,2).mode,'verified-pilot');
 assert.equal(selectMode(null,ctx,2).mode,'fresh');assert.equal(selectMode(candidate,ctx,2).productionAuthorization,false);
 assert.throws(()=>selectMode(candidate,ctx,8));
});
test('matrix cannot lose original gameplay or fresh performance coverage',()=>{
 const rows=Array.from({length:8},(_,i)=>{const n=i<4?234:233,m=[4,5].includes(i)?428:430,f=[0,4,5,6,7].includes(i)?1:0;return {shard:i,mode:i===3?'fresh':'verified-pilot',semanticMatch:i===3?true:null,reusedGameplayCases:i===3?0:n,freshGameplayCases:i===3?n:0,historicalMeasurements:i===3?0:m,freshGameplayMeasurements:i===3?m:0,freshPerformanceCases:f,freshPerformanceMeasurements:f*2};});
 const report=aggregate(rows,ctx);assert.equal(report.verifiedTasks,7);assert.equal(report.reusedGameplayCases,1634);assert.equal(report.economics.decision,'fresh');
 assert.throws(()=>aggregate(rows.slice(1),ctx));assert.throws(()=>aggregate(rows.map((r,i)=>i===3?{...r,mode:'verified-pilot'}:r),ctx));assert.throws(()=>aggregate(rows.map((r,i)=>i===0?{...r,freshPerformanceCases:0}:r),ctx));
});
