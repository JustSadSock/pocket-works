import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationDecision,canaryOutcome} from './migration-gate.mjs';
const good=n=>({expected:n,finalPassed:n,success:true});
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
