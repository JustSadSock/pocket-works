import test from 'node:test';
import assert from 'node:assert/strict';
import {decide,runtimeDifferences} from './universal-cross-delivery.mjs';
import {PAIRS} from './universal-signed-receipts.mjs';
import {approvedTask} from './universal-cross-commit.mjs';
const now=1000,scope={scopeMatch:true,distinctCommits:true,distinctTrees:true},mount={digest:'a'},runtime={kernel:'k',cpu:'c'},target={scope,mount,runtime};
const receipt=p=>({pair:p,task:approvedTask(p.app),observedEquivalent:p.expected,issuedAt:now-1,expiresAt:now+1,scope,prior:{mount,runtime,result:{counts:{tests:42}}},current:{mount,runtime},issuer:{run:1,attempt:1}});
test('only authenticated positive candidate can omit fresh execution',()=>{
 const p=PAIRS[0],r=receipt(p);
 assert.equal(decide(p,r,target,now).mode,'verified-pilot');
 for(const t of [{...target,mount:{digest:'b'}},{...target,runtime:{...runtime,cpu:'other'}},{...target,scope:{...scope,scopeMatch:false}}])assert.equal(decide(p,r,t,now).mode,'fresh');
 assert.equal(decide(p,null,target,now).mode,'fresh');
 assert.equal(decide(p,r,target,now+1).mode,'fresh');
 assert.equal(decide(p,r,target,now).productionAuthorization,false);
});
test('fresh canary and negative control cannot be skipped',()=>{
 for(const p of PAIRS.slice(1))assert.equal(decide(p,receipt(p),target,now).mode,'fresh');
});

test('CPU and kernel drift are reported but never granted portability',()=>{
 const p=PAIRS[0],r=receipt(p),other={...target,runtime:{kernel:'different',cpu:'different'}};
 assert.deepEqual(runtimeDifferences(runtime,other.runtime),['cpu','kernel']);
 const result=decide(p,r,other,now);assert.equal(result.mode,'fresh');assert.deepEqual(result.runtimeDifferences,['cpu','kernel']);
 assert.equal(result.allowResultReuse,false);
});
