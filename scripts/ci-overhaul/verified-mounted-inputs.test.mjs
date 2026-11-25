import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,linkSync,chmodSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {normalizeMounted,mountedFingerprint} from './verified-mounted-inputs.mjs';
function fixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'pw-mount-')),repo=join(dir,'repo');
 mkdirSync(repo);
 const git=(...args)=>execFileSync('git',args,{cwd:repo});
 const put=(p,v)=>{const dest=join(repo,p);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,v);};
 const commit=()=>{git('add','-A');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD').toString().trim();};
 const extract=(sha,name)=>{
  const root=join(dir,name);mkdirSync(root);
  execFileSync('tar',['-xf','-','-C',root],{input:git('archive',sha,'apps/axis-pals','shared','scripts','package.json','package-lock.json')});
  mkdirSync(join(root,'qa-artifacts'));return root;
 };
 try{
  git('init','-q');
  for(const p of ['apps/axis-pals/qa.plan.json','apps/axis-pals/test.mjs','shared/math.mjs','scripts/universal-qa/run.mjs','package.json','package-lock.json','apps/other/app.js'])put(p,'initial');
  fn({dir,repo,put,commit,extract,base:commit()});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('unrelated commit and extraction times normalize to identical actual input digest',()=>fixture(({repo,put,commit,extract,base})=>{
 const a=extract(base,'a');put('apps/other/app.js','unrelated');const head=commit(),b=extract(head,'b');
 utimesSync(join(b,'apps/axis-pals/test.mjs'),100,100);chmodSync(join(b,'shared'),0o700);
 const x=normalizeMounted(repo,base,a),y=normalizeMounted(repo,head,b);
 assert.equal(x.digest,y.digest);assert.equal(x.files,6);assert.equal(x.reuse,false);
 assert.deepEqual(x,mountedFingerprint(a));
}));
test('tracked file changes, mode changes and actual mounted byte changes affect identity',()=>fixture(({repo,put,commit,extract,base})=>{
 const a=extract(base,'a'),x=normalizeMounted(repo,base,a);
 put('shared/math.mjs','different');const head=commit(),b=extract(head,'b');
 assert.notEqual(normalizeMounted(repo,head,b).digest,x.digest);
 chmodSync(join(repo,'apps/axis-pals/test.mjs'),0o755);const mode=commit(),c=extract(mode,'c');
 assert.notEqual(normalizeMounted(repo,mode,c).digest,x.digest);
 writeFileSync(join(a,'shared/math.mjs'),'forged');utimesSync(join(a,'shared/math.mjs'),946684800,946684800);
 assert.notEqual(mountedFingerprint(a).digest,x.digest);
 assert.throws(()=>normalizeMounted(repo,base,a),/differ from tracked/);
}));
test('missing, extra, linked or nonempty output inputs reject',()=>fixture(({repo,extract,base})=>{
 const a=extract(base,'a');rmSync(join(a,'shared/math.mjs'));assert.throws(()=>normalizeMounted(repo,base,a),/Missing or extra/);
 const b=extract(base,'b');writeFileSync(join(b,'extra'),'bad');assert.throws(()=>normalizeMounted(repo,base,b),/Missing or extra/);
 const c=extract(base,'c');symlinkSync('math.mjs',join(c,'shared/link'));assert.throws(()=>normalizeMounted(repo,base,c),/Symbolic/);
 const d=extract(base,'d');linkSync(join(d,'shared/math.mjs'),join(d,'shared/hardlink'));assert.throws(()=>normalizeMounted(repo,base,d),/Non-regular/);
 const e=extract(base,'e');writeFileSync(join(e,'qa-artifacts/stale'),'bad');assert.throws(()=>normalizeMounted(repo,base,e),/begin empty/);
}));
test('archive attributes, extra directory, unnormalized metadata and repository root reject',()=>fixture(({repo,put,commit,extract,base})=>{
 const a=extract(base,'a');mkdirSync(join(a,'unknown'));assert.throws(()=>normalizeMounted(repo,base,a),/Unexpected mounted directory/);
 const b=extract(base,'b');normalizeMounted(repo,base,b);chmodSync(join(b,'package.json'),0o600);assert.throws(()=>mountedFingerprint(b),/not normalized/);
 assert.throws(()=>normalizeMounted(repo,base,repo),/outside repository/);
 put('.gitattributes','*.mjs export-ignore');const head=commit();const c=extract(head,'c');
 assert.throws(()=>normalizeMounted(repo,head,c),/Archive attributes/);
}));
