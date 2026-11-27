import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCrownContext,performanceCoverage,verifyCrownReceipt} from './crown-signed-simulation.mjs';
const ctx={repository:'JustSadSock/pocket-works',workflow:'.github/workflows/crown-signed-simulation.yml',controller:'a'.repeat(40),controllerTree:'b'.repeat(40),run:10,attempt:1,event:'push',ref:'refs/heads/main'};
const now=1795780000000,r={issuer:ctx,scope:{current:'c'.repeat(40)},measurementPolicy:'original-1638-fresh-per-target-v1',issuedAt:now,expiresAt:now+7*86400000};
test('only main can issue authoritative signatures; receipt mutation and expiry fail closed',()=>{
 assert.equal(validateCrownContext(ctx,true),ctx);assert.throws(()=>validateCrownContext({...ctx,event:'pull_request',ref:'refs/pull/1/merge'},true));
 assert.equal(verifyCrownReceipt(r,r,now).success,true);assert.throws(()=>verifyCrownReceipt({...r,measurementPolicy:'other'},r,now));assert.throws(()=>verifyCrownReceipt(r,r,r.expiresAt));
});
test('original long-run performance coverage cannot be replaced by historical or short probes',()=>{
 for(const f of [null,{kind:'historical',measurements:1638},{kind:'original-fresh-simulation',measurements:100,source:r.scope.current,run:11,attempt:1,measurementDigest:'d'.repeat(64)},{kind:'original-fresh-simulation',measurements:1638,source:r.scope.current,run:10,attempt:1,measurementDigest:'d'.repeat(64)},{kind:'original-fresh-simulation',measurements:1638,source:r.scope.current,run:11,attempt:1,measurementDigest:'d'.repeat(64)}]){
  const d=performanceCoverage(r,f);assert.equal(d.decision,'execute-original');assert.equal(d.productionAuthorization,false);
 }
});
