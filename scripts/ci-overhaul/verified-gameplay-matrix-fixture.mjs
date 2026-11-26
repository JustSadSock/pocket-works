// Exercises the aggregator using the real pinned plan. These are synthetic
// report fixtures only, not evidence of a fresh simulation or signed reuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aggregateReplay,PLAN,SOURCE} from './verified-gameplay-receipt.mjs';
const plan=JSON.parse(readFileSync(process.env.AUDITED_PLAN,'utf8')).plan;
const expected={mode:'verified-gameplay-cross-run',auditCommit:'a'.repeat(40),auditTree:'b'.repeat(40),sourceRun:12,sourceAttempt:1,targetRun:13,targetAttempt:1};
const digest='c'.repeat(64);
function fixture(hitFor){
 return plan.shards.map((p,shard)=>{
  const n=p.gameplay.length,m=p.gameplay.filter(e=>e.kind!=='numerical-superiority').length*2,hit=hitFor(shard);
  return {schema:3,...expected,source:SOURCE,planDigest:PLAN,shard,planShard:p,
   admission:hit?{decision:'reuse-shadow',gameplaySemanticDigest:digest,productionAuthorization:false}:{decision:'execute',productionAuthorization:false},
   gameplayCases:n,gameplayExecuted:!hit,gameplayReused:hit,freshGameplayCases:hit?0:n,reusedGameplayCases:hit?n:0,historicalGameplayMeasurements:m,freshGameplayMeasurements:hit?0:m,
   sourceGameplaySemanticDigest:digest,freshGameplaySemanticDigest:hit?null:digest,semanticMatch:hit?null:true,semanticComparison:hit?'not-executed':'match',
   freshPerformanceCases:p.performance.length,freshPerformanceMeasurements:p.performance.length*2,freshPerformanceResults:p.performance.map(e=>({units:e.value,plannerMs:1,physicsMs:2,seconds:3,snapshotChars:42})),
   productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
 });
}
test('real audited plan: complete reuse, fresh and mixed evidence stay distinct',()=>{
 const all=aggregateReplay(fixture(()=>true),expected),none=aggregateReplay(fixture(()=>false),expected),mixed=aggregateReplay(fixture(i=>i%2===0),expected);
 assert.equal(all.reusedGameplayCases,1868);assert.equal(all.freshGameplayMeasurements,0);assert.equal(all.semanticComparison,'not-executed');
 assert.equal(none.freshGameplayCases,1868);assert.equal(none.freshGameplayMeasurements,3436);assert.equal(none.semanticComparison,'match');
 assert.equal(mixed.freshGameplayCases+mixed.reusedGameplayCases,1868);assert.equal(mixed.semanticComparison,'partial-match');assert.equal(mixed.freshPerformanceCases,5);assert.equal(mixed.freshPerformanceMeasurements,10);
});
test('real audited plan: reject duplicate, missing, altered and misleading evidence',()=>{
 const rows=fixture(i=>i%2===0);
 assert.throws(()=>aggregateReplay(rows.slice(1),expected));
 assert.throws(()=>aggregateReplay([rows[0],...rows.slice(0,7)],expected));
 for(const mutate of [r=>{r[0].semanticMatch=true;},r=>{r[1].sourceAttempt=2;},r=>{r[4].freshPerformanceResults=[];},r=>{r[2].planShard.gameplay[0].id='d'.repeat(64);},r=>{r[1].freshGameplaySemanticDigest='d'.repeat(64);},r=>{r[0].productionAuthorization=true;}]){
  const copy=structuredClone(rows);mutate(copy);assert.throws(()=>aggregateReplay(copy,expected));
 }
});
