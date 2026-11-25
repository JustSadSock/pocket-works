import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareInputs,scopedInputs} from './verified-input-impact.mjs';
const task={key:'axis-pals-rules',app:'axis-pals',suite:'rules',kind:'node-test',seed:null,install:false};
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'pw-input-impact-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const put=(p,v)=>{const dest=join(root,p);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,v);};
 const commit=()=>{git('add','-A');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
 try{
  git('init','-q');
  for(const p of ['apps/axis-pals/qa.plan.json','apps/axis-pals/test.mjs','apps/other/app.js','shared/math.mjs','scripts/universal-qa/run.mjs','package.json','package-lock.json','.github/workflows/verified-results-shadow.yml'])put(p,'initial');
  fn({root,put,commit,base:commit()});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('unrelated edits keep scoped digest but never authorize result reuse',()=>fixture(({root,put,commit,base})=>{
 put('apps/other/app.js','changed');put('docs/new.md','docs');
 const head=commit(),r=compareInputs(root,base,head);
 assert.equal(r.inputMatch,true);assert.deepEqual(r.changedScopedPaths,[]);assert.equal(r.reuse,false);assert.equal(r.canSkip,false);assert.equal(r.decision,'execute');
}));
test('app, shared, manifest, runner and execution contract modifications invalidate',()=>fixture(({root,put,commit,base})=>{
 for(const p of ['apps/axis-pals/test.mjs','shared/math.mjs','package-lock.json','scripts/universal-qa/run.mjs','.github/workflows/verified-results-shadow.yml']){
  put(p,'changed');const head=commit(),r=compareInputs(root,base,head);
  assert.equal(r.inputMatch,false);assert.ok(r.changedScopedPaths.includes(p));assert.equal(r.decision,'execute');
 }
}));
test('new files, deleted files and executable mode invalidate',()=>fixture(({root,put,commit,base})=>{
 put('apps/axis-pals/new.mjs','new');const add=commit();
 assert.equal(compareInputs(root,base,add).inputMatch,false);
 rmSync(join(root,'apps/axis-pals/test.mjs'));const del=commit();
 assert.ok(compareInputs(root,add,del).changedScopedPaths.includes('apps/axis-pals/test.mjs'));
 chmodSync(join(root,'apps/axis-pals/new.mjs'),0o755);const mode=commit();
 assert.ok(compareInputs(root,del,mode).changedScopedPaths.includes('apps/axis-pals/new.mjs'));
}));
test('unknown task, invalid SHA, symlink and archive rules fail closed',()=>fixture(({root,put,commit,base})=>{
 assert.throws(()=>scopedInputs(root,base,{...task,seed:1}),/not approved/);
 assert.equal(compareInputs(root,'HEAD',base).inputMatch,false);
 symlinkSync('test.mjs',join(root,'apps/axis-pals/link'));let head=commit();
 assert.match(compareInputs(root,base,head).reason,/Non-regular/);
 rmSync(join(root,'apps/axis-pals/link'));put('.gitattributes','*.mjs export-ignore');head=commit();
 assert.match(compareInputs(root,base,head).reason,/Archive attributes/);
}));
