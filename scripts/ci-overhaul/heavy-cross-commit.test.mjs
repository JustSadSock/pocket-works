import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {controlledCommit,evaluate,CASES,costObservation} from './heavy-cross-commit.mjs';
import {compareScope} from './universal-cross-commit.mjs';
test('controlled commits are reproducible and scoped mutation invalidates',()=>{
 const root=mkdtempSync(join(tmpdir(),'pw-heavy-test-')),git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 try{git('init','-q');git('config','user.name','QA');git('config','user.email','qa@example.invalid');
 for(const p of ['apps/crown-and-marches/qa.plan.json','scripts/universal-qa/run.mjs','shared/x.js','package.json','package-lock.json']){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
 git('add','.');git('commit','-qm','source');const source=git('rev-parse','HEAD'),target=controlledCommit(root,source);
 assert.equal(target,controlledCommit(root,source));assert.equal(compareScope(root,source,target,'crown-and-marches').scopeMatch,true);
 assert.equal(compareScope(root,source,controlledCommit(root,source,'scripts/pw-heavy-cross-commit-control.txt'),'crown-and-marches').scopeMatch,false);
 assert.equal(git('rev-parse','HEAD'),source);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('controlled runtime observations never authorize portability or reuse',()=>{
 const c=CASES.banners,scope={app:c.app,distinctTrees:true,distinctCommits:true,scopeMatch:true},a={mount:{digest:'a'},runtime:{cpu:'a',kernel:'a',image:'x'}},b={...a,runtime:{...a.runtime,cpu:'b',kernel:'b'}};
 const p={task:c.task,coverage:{cases:235},freshMeasurements:[Array(432),Array(432)],semanticMatch:true,semanticDigests:[],rawDigests:[],durationMs:[123,456]};
 const r=evaluate('banners',scope,a,b,p);assert.equal(r.finding,'observed-directed-runtime-match');assert.equal(r.allowResultReuse,false);
 assert.equal(evaluate('banners',scope,a,{...b,runtime:{...b.runtime,image:'y'}},p).controlled,false);
 assert.throws(()=>evaluate('banners',scope,a,b,{...p,coverage:{cases:234}}));
});

test('heavy cost observations cannot authorize reuse without measured signed path',()=>{
 const timing={preparationMs:7000,executionWallMs:450000,postVerificationMs:1000};
 const r=costObservation(timing,timing,[440000,430000],500);
 assert.equal(r.admission.decision,'fresh');assert.equal(r.admission.productionAuthorization,false);
 assert.throws(()=>costObservation(timing,timing,[460000,430000],500));
 assert.throws(()=>costObservation({...timing,preparationMs:-1},timing,[440000,430000],500));
});
