import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateAdmission,decideAdmission,POLICY} from './gameplay-admission-policy.mjs';
import {CONTROLLER} from './gameplay-portability-probe.mjs';
import {SOURCE,PLAN} from './verified-gameplay-receipt.mjs';
const ctx={run:10,attempt:1,commit:'a'.repeat(40),ref:'refs/pull/42/merge'},flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
test('invalid target or absent evidence fails closed',()=>{
 for(const c of [{...ctx,shard:0},{...ctx,shard:8},{...ctx,shard:0,run:0}])assert.equal(decideAdmission(null,{},null,null,null,c).decision,'execute');
});
const rows=()=>Array.from({length:8},(_,i)=>{const n=i<4?234:233,sizes=({0:[150],4:[26],5:[40],6:[60],7:[100]})[i]??[],hit=i===1;return {schema:1,policy:POLICY,run:ctx.run,attempt:ctx.attempt,commit:ctx.commit,shard:i,source:SOURCE,controller:CONTROLLER,planDigest:PLAN,admission:{decision:hit?'reuse-shadow':'execute',eligibility:hit?'observed-directed-pair':null},gameplayCases:n,freshGameplayCases:hit?0:n,reusedGameplayCases:hit?n:0,freshGameplayMeasurements:hit?0:[4,5].includes(i)?428:430,semanticMatch:hit?null:true,semanticComparison:hit?'not-executed':'match',performance:sizes.map(units=>({units,plannerMs:1,physicsMs:2})),freshPerformanceMeasurements:sizes.length*2,...flags};});
test('full matrix counts reuse but cannot skip a rotating canary or performance',()=>{
 const r=aggregateAdmission(rows(),ctx);assert.equal(r.portableReusedCases,234);assert.equal(r.freshGameplayCases,1634);assert.equal(r.freshPerformanceCases,5);assert.equal(r.productionAuthorization,false);
 for(const mutate of [r=>r.pop(),r=>{r[0].shard=1},r=>{r[4].performance=[]},r=>{r[1].semanticMatch=true},r=>{r[2].freshGameplayMeasurements=0},r=>{r[1].allowResultReuse=true},r=>{r[3]={...r[1],shard:3}}]){const r=rows();mutate(r);assert.throws(()=>aggregateAdmission(r,ctx));}
});
