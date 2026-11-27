// Independent shadow proof: only actually mounted, normalized bytes are compared.
// No claim of deterministic execution or authorization is made by this module.
import {execFileSync} from 'node:child_process';
import {lstatSync,readFileSync,readdirSync,mkdirSync,chmodSync,utimesSync,realpathSync,writeFileSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {mountedFingerprint} from './verified-mounted-inputs.mjs';
const SHA=/^[a-f0-9]{40}$/, EPOCH=946684800, LIMIT=64*1024*1024;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const approved=Object.freeze({'axis-pals':'rules',flickyard:'engine'});
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:LIMIT});
const fail=m=>{throw Error(m);};
const validPath=p=>p.length>0&&p.length<=1024&&!/[\\\x00-\x1f\x7f\ufffd]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
export function approvedTask(app){
 if(!Object.hasOwn(approved,app))fail('Task not audited for shadow');
 const suite=approved[app];return {key:app+'-'+suite,app,suite,kind:'node-test',seed:null,install:false};
}
export function scopeRoots(app){
 if(app!=='banners-of-war')approvedTask(app);
 return ['apps/'+app,'shared','scripts','package.json','package-lock.json'];
}
export function scopedTree(repo,commit,app){
 if(!SHA.test(commit)||git(repo,['rev-parse','--verify',commit+'^{commit}']).toString().trim()!==commit)fail('Immutable commit required');
 const raw=git(repo,['ls-tree','-r','-z','--full-tree',commit]),s=raw.toString('utf8');
 if(!Buffer.from(s).equals(raw))fail('Invalid tree encoding');
 const roots=scopeRoots(app);
 const all=s.split('\0').filter(Boolean).map(x=>{const m=/^([0-7]{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(x);if(!m||!validPath(m[4]))fail('Invalid tree entry');return {mode:m[1],type:m[2],oid:m[3],path:m[4]};});
 if(all.some(x=>x.path==='.gitattributes'||x.path.endsWith('/.gitattributes')))fail('Archive attributes require independent audit');
 const rows=all.filter(x=>roots.some(r=>x.path===r||x.path.startsWith(r+'/'))).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(rows.some(x=>x.type!=='blob'||!['100644','100755'].includes(x.mode))||roots.some(r=>!rows.some(x=>x.path===r||x.path.startsWith(r+'/'))))fail('Missing or non-regular scoped input');
 if(!rows.some(x=>x.path==='apps/'+app+'/qa.plan.json')||!rows.some(x=>x.path==='scripts/universal-qa/run.mjs'))fail('Missing execution contract');
 return {schema:1,app,digest:digest(canonical(rows)),rows,tree:git(repo,['rev-parse',commit+'^{tree}']).toString().trim()};
}
export function compareScope(repo,prior,current,app){
 const a=scopedTree(repo,prior,app),b=scopedTree(repo,current,app);
 const old=new Map(a.rows.map(x=>[x.path,canonical(x)])),now=new Map(b.rows.map(x=>[x.path,canonical(x)]));
 const changed=[...new Set([...old.keys(),...now.keys()])].filter(k=>old.get(k)!==now.get(k)).sort();
 return {schema:1,app,prior,current,priorTree:a.tree,currentTree:b.tree,distinctCommits:prior!==current,distinctTrees:a.tree!==b.tree,scopeMatch:a.digest===b.digest,changedScopedPaths:changed,priorDigest:a.digest,currentDigest:b.digest,decision:'execute',...flags};
}
export function normalizeSnapshot(repo,commit,app,root){
 const target=realpathSync(root),source=realpathSync(repo),rel=relative(source,target);
 if(!rel||(!rel.startsWith('../')&&rel!=='..'&&!rel.startsWith('/')))fail('Snapshot must be outside repository');
 const {rows}=scopedTree(repo,commit,app),map=new Map(rows.map(x=>[x.path,x])),dirs=new Set(['']);
 for(const r of rows){let d=dirname(r.path);while(d!=='.'){dirs.add(d);d=dirname(d);}}
 let count=0,bytes=0;const found=new Set();
 function visit(path,p){
  const st=lstatSync(path);if(st.isSymbolicLink())fail('Symlink in snapshot');
  if(st.isDirectory()){
   if(!dirs.has(p))fail('Unexpected directory '+p);
   for(const n of readdirSync(path))visit(join(path,n),p?p+'/'+n:n);
   chmodSync(path,0o755);utimesSync(path,EPOCH,EPOCH);return;
  }
  const r=map.get(p);if(!r||!st.isFile()||st.nlink!==1||found.has(p)||((st.mode&0o111)!==0)!==(r.mode==='100755'))fail('Invalid mounted file '+p);
  bytes+=st.size;if(bytes>LIMIT||++count>20000)fail('Snapshot exceeds limit');
  const data=readFileSync(path);if(data.length!==st.size||createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex')!==r.oid)fail('Mounted bytes differ '+p);
  found.add(p);chmodSync(path,r.mode==='100755'?0o755:0o644);utimesSync(path,EPOCH,EPOCH);
 }
 visit(target,'');if(found.size!==rows.length)fail('Missing scoped input');
 return mountedFingerprint(target);
}
export function summarizeResult(task,record,log){
 if(canonical(task)!==canonical(approvedTask(task.app)))fail('Unapproved task');
 const actual=Object.fromEntries(Object.keys(task).map(k=>[k,record[k]]));
 if(canonical(actual)!==canonical(task)||record.schema!==1||record.success!==true||record.exitCode!==0||record.signal!==null||record.timedOut!==false||record.error||record.verificationMode!==undefined||!Number.isSafeInteger(record.durationMs)||record.durationMs<0)fail('Invalid fresh result');
 const counts={};for(const k of ['tests','suites','pass','fail','cancelled','skipped','todo']){
  const m=[...log.matchAll(new RegExp('^# '+k+' (\\d+)\\r?$','gm'))];if(m.length!==1)fail('Ambiguous TAP totals');counts[k]=Number(m[0][1]);
 }
 if(!counts.tests||counts.pass!==counts.tests||counts.fail||counts.cancelled||counts.skipped||counts.todo)fail('Incomplete fresh assertions');
 const assertions=log.split(/\r?\n/).filter(l=>/^\s*(ok|not ok) \d+ - /.test(l)).map(l=>l.trim());
 if(!assertions.length||assertions.some(l=>l.startsWith('not ok')))fail('Missing TAP assertions');
 return {taskDigest:taskDigest(task),counts,assertionDigest:digest(canonical(assertions)),durationMs:record.durationMs};
}
export function compareExecution(scope,prior,current){
 const a=prior,b=current;
 const mountMatch=canonical(a.mount)===canonical(b.mount),runtimeMatch=canonical(a.runtime)===canonical(b.runtime);
 const assertionMatch=a.result.taskDigest===b.result.taskDigest&&canonical(a.result.counts)===canonical(b.result.counts)&&a.result.assertionDigest===b.result.assertionDigest;
 return {...scope,mountMatch,runtimeMatch,assertionMatch,priorTests:a.result.counts.tests,currentTests:b.result.counts.tests,priorMs:a.result.durationMs,currentMs:b.result.durationMs,observedEquivalent:scope.distinctCommits&&scope.distinctTrees&&scope.scopeMatch&&mountMatch&&runtimeMatch&&assertionMatch,decision:'execute',...flags};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);let result;
  if(mode==='task')result=approvedTask(a[0]);
  else if(mode==='scope')result=compareScope(...a);
  else if(mode==='normalize')result=normalizeSnapshot(...a);
  else if(mode==='measure')result=mountedFingerprint(a[0]);
  else if(mode==='result')result=summarizeResult(approvedTask(a[0]),json(a[1]),readFileSync(a[2],'utf8'));
  else if(mode==='compare')result=compareExecution(json(a[0]),json(a[1]),json(a[2]));
  else fail('Unknown command');
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
