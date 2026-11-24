import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationDecision,canaryOutcome} from './migration-gate.mjs';
const good=n=>({expected:n,finalPassed:n,success:true,tree:'a'.repeat(40),planDigest:'b'.repeat(64),passedTaskDigests:Array.from({length:n},(_,i)=>(i+1).toString(16).padStart(64,'0'))});
const policy={schema:1,mode:'canary',enabled:true,allowResultReuse:false,allowImpactSkipping:false};
const evidence={integrated:good(180),cases:[{id:'crown-and-marches',...good(20)},{id:'banners-of-war',...good(19)},{id:'maintenance',...good(11)}],provenance:{success:true,skippingEnabled:false},impact:{success:true,canSkip:false},verifiedByProtectedController:true};
const health={legacyAvailable:true,branchProtectionVerified:true,rollbackDrillPassed:true,currentRunHealthy:true};
test('complete protected evidence permits only a dual-run canary',()=>{
 const r=migrationDecision({policy,evidence,health});
 assert.equal(r.route,'dual-run-canary');assert.equal(r.legacyRequired,true);assert.equal(r.canReplaceLegacy,false);
});
test('missing evidence or disabled production policy falls back to legacy',()=>{
 assert.equal(migrationDecision().route,'legacy-full');
 for(const k of Object.keys(health))assert.equal(migrationDecision({policy,evidence,health:{...health,[k]:false}}).route,'legacy-full');
 for(const k of Object.keys(evidence))assert.equal(migrationDecision({policy,evidence:{...evidence,[k]:undefined},health}).route,'legacy-full');
 assert.equal(migrationDecision({policy:{...policy,enabled:false},evidence,health}).route,'legacy-full');
 assert.equal(migrationDecision({policy:{...policy,allowResultReuse:true},evidence,health}).route,'legacy-full');
});
test('canary failure preserves original gate but never bypasses failed legacy QA',()=>{
 assert.deepEqual(canaryOutcome({legacy:good(20),integrated:good(20)}),{deliveryAllowed:true,canaryPassed:true,rollback:false,route:'dual-run-canary'});
 assert.deepEqual(canaryOutcome({legacy:good(20),integrated:good(19)}),{deliveryAllowed:true,canaryPassed:false,rollback:true,route:'legacy-full'});
 assert.equal(canaryOutcome({legacy:{...good(20),success:false},integrated:good(20)}).deliveryAllowed,false);
 assert.equal(canaryOutcome({integrated:good(20)}).deliveryAllowed,false);
});

test('canary rejects equal counts from a different tree, plan or task identity',()=>{
 const legacy=good(20);
 for(const patch of [{tree:'c'.repeat(40)},{planDigest:'c'.repeat(64)},{passedTaskDigests:[...legacy.passedTaskDigests.slice(1),'f'.repeat(64)]},{passedTaskDigests:Array(20).fill('f'.repeat(64))}]){
  const r=canaryOutcome({legacy,integrated:{...legacy,...patch}});
  assert.equal(r.canaryPassed,false);assert.equal(r.deliveryAllowed,true);assert.equal(r.rollback,true);
 }
 assert.equal(canaryOutcome({legacy:{...legacy,tree:null},integrated:legacy}).deliveryAllowed,false);
});
