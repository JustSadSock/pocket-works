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
