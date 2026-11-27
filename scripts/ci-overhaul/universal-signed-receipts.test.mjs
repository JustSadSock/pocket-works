import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {canonical,taskDigest} from './verified-results.mjs';
import {approvedTask} from './universal-cross-commit.mjs';
import {PAIRS,validateContext,validateRuntime,verifyReceipt,gateSummary} from './universal-signed-receipts.mjs';
const now=1795780000000,ctx={repository:'JustSadSock/pocket-works',workflow:'.github/workflows/universal-cross-commit-proof.yml',controller:'a'.repeat(40),controllerTree:'b'.repeat(40),run:1,attempt:2,ref:'refs/heads/main',event:'push'};
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const receipts=PAIRS.map(pair=>{const task=approvedTask(pair.app);return {schema:1,kind:'universal-cross-commit-receipt-v1',issuer:ctx,pair,task,taskDigest:taskDigest(task),observedEquivalent:pair.expected,issuedAt:now,expiresAt:now+7*86400000,prior:{result:{counts:{tests:1}}},current:{result:{counts:{tests:1}}},...flags};});
test('protected provenance and pinned runtime reject invalid input',()=>{
 assert.equal(validateContext(ctx,true),ctx);
 assert.throws(()=>validateContext({...ctx,event:'pull_request',ref:'refs/pull/1/merge'},true));
 assert.throws(()=>validateContext({...ctx,repository:'fork/repo'}));
 assert.throws(()=>validateRuntime({image:'node:latest'}));
});
test('independent receipt comparison fails closed on changed bytes, expiry, future issuance or wrong task',()=>{
 const r=receipts[0];assert.equal(verifyReceipt(r,structuredClone(r),now),true);
 for(const t of [{...r,taskDigest:'0'.repeat(64)},{...r,observedEquivalent:false},{...r,issuer:{...ctx,attempt:1}},{...r,productionAuthorization:true}])assert.throws(()=>verifyReceipt(t,r,now));
 assert.throws(()=>verifyReceipt(r,r,r.expiresAt));assert.throws(()=>verifyReceipt(r,r,now-1));
});
test('gate requires unique current attempt coverage and never authorizes reuse',()=>{
 const r=gateSummary(ctx,receipts,now);assert.equal(r.eligibleCandidates,2);assert.equal(r.freshTasks,3);assert.equal(r.reusedTasks,0);assert.equal(r.productionAuthorization,false);
 for(const bad of [receipts.slice(1),[receipts[0],receipts[0],receipts[2]], [{...receipts[0],issuer:{...ctx,attempt:1}},...receipts.slice(1)], [{...receipts[0],allowResultReuse:true},...receipts.slice(1)]])assert.throws(()=>gateSummary(ctx,bad,now));
});
test('signature subject includes exact reconstructed receipt, mutation invalidates signature',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),r=receipts[0],bytes=Buffer.from(canonical(r)),sig=sign(null,bytes,privateKey);
 assert.equal(verify(null,bytes,publicKey,sig),true);
 assert.equal(verify(null,Buffer.from(canonical({...r,issuedAt:now+1})),publicKey,sig),false);
});
