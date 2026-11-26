import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVerifiedShadow,projectVerifiedRows} from './verified-split.mjs';
const env={PW_QA_VERIFIED_SPLIT_SHADOW:'1',GITHUB_REPOSITORY:'JustSadSock/pocket-works',GITHUB_EVENT_NAME:'pull_request',GITHUB_WORKFLOW:'Universal QA Verified Split Integration',GITHUB_WORKFLOW_REF:'JustSadSock/pocket-works/.github/workflows/universal-qa-verified-split.yml@refs/pull/1/merge',PW_QA_VERIFIED_CONTROLLER:'/tmp/controller',PW_QA_VERIFIED_EVIDENCE:'/tmp/evidence'};
test('default off; only explicit isolated integration can select shadow',()=>{
 assert.equal(selectVerifiedShadow({}),false);assert.equal(selectVerifiedShadow(env),true);
 for(const e of [{PW_QA_VERIFIED_SPLIT_SHADOW:'0'},{GITHUB_EVENT_NAME:'push'},{GITHUB_WORKFLOW:'Universal Pocket Works QA'},{GITHUB_WORKFLOW_REF:'other'},{PW_QA_VERIFIED_EVIDENCE:'relative'}])assert.equal(selectVerifiedShadow({...env,...e}),false);
});
test('historical gameplay timing is separated and historical performance is rejected',()=>{
 const rows=[{index:1,id:'a',kind:'historical',result:{plannerMs:5,physicsMs:7,score:9}},{index:2,id:'b',kind:'numerical-superiority',result:{score:10}}];
 const p=projectVerifiedRows(rows,'historical');assert.deepEqual(p.semantic[0].result,{score:9});assert.equal(p.measurements.length,2);assert.equal(p.measurements[0].origin,'historical');assert.equal(rows[0].result.plannerMs,5);
 assert.throws(()=>projectVerifiedRows([{...rows[0],kind:'performance'}],'historical'));
 assert.throws(()=>projectVerifiedRows([{...rows[0],result:{score:1}}],'fresh'));
});

import {summarizeVerifiedSplit} from './verified-split-aggregate.mjs';
import {PLAN} from '../ci-overhaul/verified-gameplay-receipt.mjs';
test('integrated matrix refuses missing canary, mixed measurements and production acceptance',()=>{
 const run=10,attempt=1,fallback={route:'fallback',shard:0,success:true,freshMeasurements:432};
 const rows=()=>Array.from({length:8},(_,i)=>{
  const game=i<4?234:233,perf=[0,4,5,6,7].includes(i)?1:0,metrics=[4,5].includes(i)?428:430,hit=i===2;
  return {shard:i,route:i%2?'sharded':'direct',success:true,productionGateRejected:true,mode:'verified-split-shadow',planDigest:PLAN,gameplayCases:game,performanceCases:perf,completed:game+perf,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false,freshGameplayCases:hit?0:game,reusedGameplayCases:hit?game:0,freshMeasurements:(hit?0:metrics)+perf*2,historicalMeasurements:hit?metrics:0,semanticComparison:hit?'not-executed':'match',admission:{decision:hit?'reuse-shadow':'execute',eligibility:hit?'observed-directed-pair':null}};
 });
 const v=summarizeVerifiedSplit(rows(),fallback,run,attempt);assert.equal(v.reusedGameplayCases,234);assert.equal(v.freshPerformanceCases,5);assert.equal(v.mandatoryFreshCanary,3);
 for(const mutate of [r=>r.pop(),r=>{r[2].freshMeasurements=430},r=>{r[1].productionGateRejected=false},r=>{r[3]={...r[2],shard:3,route:'sharded'}}]){const r=rows();mutate(r);assert.throws(()=>summarizeVerifiedSplit(r,fallback,run,attempt));}
});
