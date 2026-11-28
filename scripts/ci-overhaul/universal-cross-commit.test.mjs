import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {approvedTask,compareScope,normalizeSnapshot,summarizeResult,compareExecution} from './universal-cross-commit.mjs';
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'pw-cross-')),repo=join(root,'repo');mkdirSync(repo);git(repo,'init','-q');git(repo,'config','user.name','Test');git(repo,'config','user.email','test@example.com');
 const put=(p,s)=>{const f=join(repo,p);mkdirSync(dirname(f),{recursive:true});writeFileSync(f,s);};
 const commit=()=>{git(repo,'add','.');git(repo,'commit','-qm','fixture');return git(repo,'rev-parse','HEAD');};
 try{for(const p of ['apps/axis-pals/qa.plan.json','apps/flickyard/qa.plan.json','scripts/universal-qa/run.mjs','shared/lib.js','package.json','package-lock.json'])put(p,'fixture');const a=commit();fn({root,repo,put,commit,a});}finally{rmSync(root,{recursive:true,force:true});}
}
test('unrelated game edit permits scope match only, shared or executable change invalidates',()=>fixture(({repo,put,commit,a})=>{
 put('apps/flickyard/qa.plan.json','changed');const b=commit();const r=compareScope(repo,a,b,'axis-pals');assert.equal(r.scopeMatch,true);assert.equal(r.distinctTrees,true);assert.equal(r.allowResultReuse,false);
 assert.equal(compareScope(repo,a,b,'flickyard').scopeMatch,false);
 put('shared/lib.js','changed');const c=commit();assert.equal(compareScope(repo,b,c,'axis-pals').scopeMatch,false);
 chmodSync(join(repo,'scripts/universal-qa/run.mjs'),0o755);const d=commit();assert.equal(compareScope(repo,c,d,'axis-pals').scopeMatch,false);
 put('.gitattributes','* export-ignore');const e=commit();assert.throws(()=>compareScope(repo,d,e,'axis-pals'),/Archive attributes/);
}));
test('actual mounted bytes and metadata are normalized, extra, mutated and symlink files rejected',()=>fixture(({repo,root,a})=>{
 const snap=join(root,'snapshot');mkdirSync(snap);execFileSync('bash',['-c','git archive HEAD apps/axis-pals shared scripts package.json package-lock.json | tar -xf - -C "$1"','bash',snap],{cwd:repo});
 const m=normalizeSnapshot(repo,a,'axis-pals',snap);assert.equal(m.files,5);assert.equal(normalizeSnapshot(repo,a,'axis-pals',snap).digest,m.digest);
 const extra=join(snap,'extra');writeFileSync(extra,'x');assert.throws(()=>normalizeSnapshot(repo,a,'axis-pals',snap),/Invalid mounted file/);rmSync(extra);
 symlinkSync('package.json',extra);assert.throws(()=>normalizeSnapshot(repo,a,'axis-pals',snap),/Symlink/);rmSync(extra);
 writeFileSync(join(snap,'shared/lib.js'),'tamper');assert.throws(()=>normalizeSnapshot(repo,a,'axis-pals',snap),/Mounted bytes differ/);
}));
test('only audited tasks and successful complete TAP assertions; environment or mount drift never match',()=>{
 assert.throws(()=>approvedTask('unknown'));
 const task=approvedTask('flickyard'),record={...task,schema:1,success:true,exitCode:0,signal:null,timedOut:false,durationMs:123};
 const log='ok 1 - engine\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 const result=summarizeResult(task,record,log);assert.throws(()=>summarizeResult(task,{...record,success:false},log));assert.throws(()=>summarizeResult(task,record,log.replace('# skipped 0','# skipped 1')));
 const scope={distinctCommits:true,distinctTrees:true,scopeMatch:true},x={mount:{digest:'a'},runtime:{image:'a'},result};
 assert.equal(compareExecution(scope,x,x).observedEquivalent,true);
 for(const y of [{...x,mount:{digest:'b'}},{...x,runtime:{image:'b'}},{...x,result:{...result,assertionDigest:'b'}}])assert.equal(compareExecution(scope,x,y).observedEquivalent,false);
 assert.equal(compareExecution({...scope,scopeMatch:false},x,x).observedEquivalent,false);assert.equal(compareExecution(scope,x,x).productionAuthorization,false);
});
