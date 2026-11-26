import test from 'node:test';
import assert from 'node:assert/strict';
import {compareKernel,CASES,IMAGE} from './cross-kernel-simulation.mjs';
const context={run:5,attempt:1,auditCommit:'a'.repeat(40)},h='b'.repeat(64);
const crown={'balance-3.json':4,'balance-8.json':1,'balance-targeted-3.json':2,'discovery-3.json':5,'society-3.json':5,'society-300-4-legacy-audit.json':1};
const banners={cases:235,groups:{original:126,independent:11,historical:37,antiquity:17,'final-integration':24,'numerical-superiority':19,performance:1}};
const env={image:IMAGE,config:h,node:'v22.12.0',arch:'x64',toolchain:h,archive:h,kernel:'Linux A',cpu:'CPU A',uid:1001,gid:1001};
const fixture=()=>['crown','banners'].flatMap(kind=>[1,2].map(replica=>{
 const d=Object.fromEntries((kind==='crown'?Object.keys(crown):['completion-0.jsonl','completion-0-summary.json']).map(k=>[k,h]));
 return {schema:1,kind,replica,source:CASES[kind].sha,...context,environment:{...env,kernel:'Linux '+replica},coverage:kind==='crown'?crown:banners,semanticDigests:{...d},rawDigests:{...d},durationMs:1,measurementCount:kind==='crown'?1638:432,measurementDigest:h,productionAuthorization:false};
}));
test('observed cross-kernel match never authorizes reuse',()=>{const r=compareKernel(fixture(),context);assert.ok(r.results.every(x=>x.finding==='observed-cross-kernel-match'));assert.equal(r.allowResultReuse,false);});
test('identical kernels and extra changes do not prove cross-kernel compatibility',()=>{
 const a=fixture();a[1].environment.kernel=a[0].environment.kernel;a[3].environment.archive='c'.repeat(64);
 const r=compareKernel(a,context);assert.equal(r.results[0].finding,'inconclusive-same-kernel');assert.equal(r.results[1].finding,'inconclusive-environment');
});
test('semantic mismatch retained and incomplete evidence rejected',()=>{
 const a=fixture();a[1].semanticDigests['balance-3.json']='c'.repeat(64);assert.equal(compareKernel(a,context).results[0].finding,'semantic-mismatch');
 assert.throws(()=>compareKernel(a.slice(1),context));assert.throws(()=>compareKernel([a[0],a[0],a[2],a[3]],context));a[1].measurementCount--;assert.throws(()=>compareKernel(a,context));
});
