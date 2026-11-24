import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { impact,diffPaths,appInventory,workspaceGraph } from './impact.mjs';
const apps=['a','b','c','d'];
const edges=[{consumer:'b',dependency:'a'},{consumer:'c',dependency:'b'},{consumer:'a',dependency:'c'}];
test('transitive impact terminates on cycles; unrelated app is advisory only',()=>{
 const r=impact({apps,paths:['apps/a/main.js'],edges});
 assert.deepEqual(r.direct,['a']);assert.deepEqual(r.transitive,['b','c']);
 assert.deepEqual(r.candidateApps,['a','b','c']);assert.deepEqual(r.requiredApps,apps);assert.equal(r.canSkip,false);
});
test('shared, root, unknown, deleted-app and manifest changes force full coverage',()=>{
 for(const path of ['shared/runtime.js','package-lock.json','apps/deleted/main.js','apps/a/package.json','apps/a/qa.plan.json','apps/a/app.config.json','../unsafe','apps/_template/main.js']){
   const r=impact({apps,paths:[path],edges});assert.equal(r.globalFallback,true,path);assert.deepEqual(r.candidateApps,apps);
 }
 assert.equal(impact({apps,paths:null}).globalFallback,true);
 assert.equal(impact({apps,paths:['apps/a/main.js'],edges:[{consumer:'unknown',dependency:'a'}]}).globalFallback,true);
});
test('empty diff never authorizes skipping tests',()=>{
 const r=impact({apps,paths:[],edges});assert.deepEqual(r.candidateApps,[]);assert.deepEqual(r.requiredApps,apps);assert.equal(r.canSkip,false);
});
test('workspace graph detects dependency classes and rejects unresolved internal packages',()=>{
 const root=mkdtempSync(join(tmpdir(),'impact-'));
 try{
  for(const a of ['a','b','c']){
   const dir=join(root,'apps',a);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'app.config.json'),'{}');
   writeFileSync(join(dir,'package.json'),JSON.stringify({name:'@pocket-works/'+a,...(a==='b'?{devDependencies:{'@pocket-works/a':'*'}}:a==='c'?{peerDependencies:{'@pocket-works/b':'*'}}:{})}));
  }
  assert.deepEqual(appInventory(root),['a','b','c']);
  assert.deepEqual(impact({apps:appInventory(root),paths:['apps/a/main.js'],edges:workspaceGraph(root,appInventory(root))}).candidateApps,['a','b','c']);
  writeFileSync(join(root,'apps/c/package.json'),JSON.stringify({name:'@pocket-works/c',dependencies:{'@pocket-works/missing':'*'}}));
  assert.throws(()=>workspaceGraph(root,appInventory(root)),/Unresolved/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Git diff includes both sides of renames and deletions',()=>{
 const root=mkdtempSync(join(tmpdir(),'impact-git-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init','-q');mkdirSync(join(root,'apps/a'),{recursive:true});mkdirSync(join(root,'apps/b'),{recursive:true});
  writeFileSync(join(root,'apps/a/old.js'),'same');writeFileSync(join(root,'apps/a/deleted.js'),'gone');
  git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','base');const base=git('rev-parse','HEAD');
  git('mv','apps/a/old.js','apps/b/new.js');git('rm','apps/a/deleted.js');
  git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','head');const head=git('rev-parse','HEAD');
  assert.deepEqual(diffPaths(root,base,head).sort(),['apps/a/deleted.js','apps/a/old.js','apps/b/new.js']);
  assert.throws(()=>diffPaths(root,'HEAD',head),/immutable/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
