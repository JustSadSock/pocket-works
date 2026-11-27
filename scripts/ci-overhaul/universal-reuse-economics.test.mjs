import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {economicDecision,planEconomics,collectTimings} from './universal-reuse-economics.mjs';
import {approvedTask} from './universal-cross-commit.mjs';
const now=1795780000000;
const evidence=(ms=180000)=>({projectedHits:1,fresh:[0,1,2].map(i=>({sampleId:'f'+i,observedAt:now-i,executionMs:ms+i})),reuse:[0,1,2].map(i=>({sampleId:'r'+i,observedAt:now-i,discoveryMs:1000,authenticationMs:2000,preparationMs:5000,verificationMs:3000,aggregationMs:4000,transferMs:1000,renewalMs:10000,comparable:true}))});
test('conservative savings include all components and issuance; no authorization',()=>{
 const r=economicDecision(evidence(),now);assert.equal(r.decision,'candidate-needs-security-audit');assert.equal(r.reuseUpperMs,26000);assert.equal(r.savingsMs,154000);assert.equal(r.productionAuthorization,false);
 assert.equal(economicDecision(evidence(300),now).decision,'fresh');
 assert.equal(economicDecision(evidence(50000),now).decision,'fresh');
});
test('unknown, duplicate, stale, invalid or incomplete evidence is fresh',()=>{
 for(const e of [null,{...evidence(),fresh:[]},{...evidence(),fresh:Array(3).fill(evidence().fresh[0])},{...evidence(),projectedHits:0},{...evidence(),reuse:evidence().reuse.map(x=>({...x,transferMs:undefined}))},{...evidence(),reuse:evidence().reuse.map(x=>({...x,comparable:false}))}])assert.equal(economicDecision(e,now).decision,'fresh');
 assert.equal(economicDecision(evidence(),now+8*86400000).decision,'fresh');
});
test('pilot and browser routes unchanged; real plan rows retain identity',()=>{
 const t=approvedTask('axis-pals'),rows=planEconomics([t,{...t,key:'x',kind:'visual'}]);
 assert.equal(rows.length,2);assert.match(rows[0].reason,/below/);assert.equal(rows[1].decision,'execute-original-route');assert.ok(rows.every(r=>r.allowResultReuse===false));
});
test('observe only valid fresh results, not receipts or historical records',()=>{
 const root=mkdtempSync(join(tmpdir(),'pw-cost-'));try{
  const task=approvedTask('axis-pals'),dir=join(root,'qa-'+task.key);mkdirSync(dir);
  const identity={source:'a'.repeat(40),tree:'b'.repeat(40),run:1,attempt:2},plan={tasks:[task,approvedTask('press')],planDigest:'c'.repeat(64)};
  const r={...task,schema:1,success:true,exitCode:0,signal:null,timedOut:false,durationMs:123};
  writeFileSync(join(dir,'result.json'),JSON.stringify(r));const report=collectTimings(plan,root,identity);
  assert.equal(report.rows[0].executionMs,123);assert.equal(report.rows[1].status,'no-fresh-record');
  writeFileSync(join(dir,'result.json'),JSON.stringify({...r,verificationMode:'historical'}));assert.equal(collectTimings(plan,root,identity).rows[0].status,'not-comparable');
 }finally{rmSync(root,{recursive:true,force:true});}
});
