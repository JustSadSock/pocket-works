import test from 'node:test';
import assert from 'node:assert/strict';
import {describePlan,selectDeliveryRoute,assertDelivery,verifyLegacy,isApprovedBannersPullRequest} from './delivery-gate.mjs';
const policy={schema:1,enabled:true,allowResultReuse:false,allowImpactSkipping:false};
const request={policy,request:'sharded',eventName:'pull_request',sameRepo:true,count:2};
test('approved Banners production PR is pinned to mandatory legacy delivery',()=>{
 const repo='JustSadSock/pocket-works';
 const event={pull_request:{number:1355,head:{ref:'app/banners-of-war',repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}}};
 assert.equal(isApprovedBannersPullRequest(event,repo),true);
 assert.equal(selectDeliveryRoute({...request,forceLegacy:true}),'legacy');
 assert.equal(selectDeliveryRoute({...request,forceLegacy:false}),'sharded');
 for(const p of [
  {...event,pull_request:{...event.pull_request,number:1356}},
  {...event,pull_request:{...event.pull_request,head:{...event.pull_request.head,ref:'other'}}},
  {...event,pull_request:{...event.pull_request,head:{...event.pull_request.head,repo:{full_name:'fork/repo'}}}},
  {...event,pull_request:{...event.pull_request,base:{...event.pull_request.base,ref:'release'}}}
 ])assert.equal(isApprovedBannersPullRequest(p,repo),false);
 assert.equal(isApprovedBannersPullRequest(event,'other/repo'),false);
});

test('default legacy, explicit disabled policy, fork and manual requests cannot choose sharded',()=>{
 assert.equal(selectDeliveryRoute(request),'sharded');
 for(const p of [{policy:null},{policy:{...policy,enabled:false}},{policy:{...policy,allowResultReuse:true}},{policy:{...policy,allowImpactSkipping:true}},{request:'legacy'},{sameRepo:false},{eventName:'workflow_dispatch'}])assert.equal(selectDeliveryRoute({...request,...p}),'legacy');
 assert.equal(selectDeliveryRoute({...request,count:0}),'no-app-suites');
 assert.throws(()=>selectDeliveryRoute({...request,count:-1}),/task count/);
});
const legacy={plan:'success',route:'legacy',count:2,hasCpu:true,hasBrowser:true,legacyCpu:'success',legacyBrowser:'success',summary:'success',candidate:'skipped'};
test('stable gate requires every selected pool and forbids contradictory route results',()=>{
 assert.equal(assertDelivery(legacy).success,true);
 for(const key of ['plan','legacyCpu','legacyBrowser','summary'])for(const status of ['failure','skipped','cancelled'])assert.throws(()=>assertDelivery({...legacy,[key]:status}));
 assert.throws(()=>assertDelivery({...legacy,candidate:'success'}));
 const sharded={...legacy,route:'sharded',legacyCpu:'skipped',legacyBrowser:'skipped',summary:'skipped',candidate:'success'};
 assert.equal(assertDelivery(sharded).success,true);
 for(const status of ['skipped','failure','cancelled'])assert.throws(()=>assertDelivery({...sharded,candidate:status}));
 assert.throws(()=>assertDelivery({...sharded,legacyCpu:'success'}));
 const empty={...sharded,route:'no-app-suites',count:0,hasCpu:false,hasBrowser:false,candidate:'skipped'};
 assert.equal(assertDelivery(empty).coverage,'no-app-suites');
 assert.throws(()=>assertDelivery({...empty,count:1}));
});
test('legacy delivery verifies exact identity, success and original plan partition',()=>{
 const t={key:'a-rules',app:'a',suite:'rules',kind:'node-test',seed:null,install:false};
 const raw='cpu_matrix='+JSON.stringify({include:[t]})+'\nbrowser_matrix={"include":[]}\nexpected=["a-rules"]\n';
 const result={schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false};
 const summary={schema:1,success:true,expected:1,passed:1,failed:0,missing:[],results:[result]};
 assert.equal(verifyLegacy(raw,summary,'a'.repeat(40)).planDigest,describePlan(raw).planDigest);
 for(const p of [{results:[]},{results:[{...result,seed:2}]},{results:[{...result,exitCode:1}]},{passed:0},{missing:['a-rules']}])assert.throws(()=>verifyLegacy(raw,{...summary,...p},'a'.repeat(40)));
 assert.throws(()=>describePlan(raw.replace('expected=["a-rules"]','expected=[]')));
});
