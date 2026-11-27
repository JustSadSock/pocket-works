import test from 'node:test';
import assert from 'node:assert/strict';
import {assessScopedCandidate} from './banners-signed-cross-commit-candidate.mjs';
test('missing or changed scope always executes; never authorizes production',()=>{
 const now=1000,c={source:'a',sourceTree:'b',auditCommit:'c',auditTree:'d',planDigest:'e'},s={app:'banners-of-war',prior:'a',current:'f',priorTree:'b',currentTree:'g',distinctCommits:true,distinctTrees:true,scopeMatch:true,priorDigest:'h',currentDigest:'h',changedScopedPaths:[]},t={source:'f',sourceTree:'g',auditCommit:'c',auditTree:'d',planDigest:'e'};
 for(const [catalog,scope,target] of [[null,s,t],[c,{...s,scopeMatch:false},t],[c,{...s,changedScopedPaths:['scripts/x']},t],[c,s,{...t,auditCommit:'other'}],[c,s,{...t,planDigest:'other'}],[c,s,t]]){
  const r=assessScopedCandidate(catalog,scope,target,now);assert.equal(r.decision,'execute');assert.equal(r.productionAuthorization,false);
 }
});
