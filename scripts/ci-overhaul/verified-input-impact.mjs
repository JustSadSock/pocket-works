// Advisory dependency scope for the single isolated receipt pilot.
// Never consumed by the delivery gate. Unknown inputs => run everything.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendFileSync} from 'node:fs';
import {canonical,digest,taskDigest} from './verified-results.mjs';

const SHA=/^[0-9a-f]{40}$/;
const approved=Object.freeze({key:'axis-pals-rules',app:'axis-pals',suite:'rules',kind:'node-test',seed:null,install:false});
const roots=['apps/axis-pals','shared','scripts','package.json','package-lock.json'];
// Include archive rules and the execution contract even though they are not
// mounted as application inputs. All script changes conservatively invalidate.
const guards=['.gitattributes','.github/workflows/verified-results-shadow.yml','.github/workflows/verified-input-impact.yml'];
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'});
function treeRows(root,commit){
 if(!SHA.test(commit))throw Error('Invalid immutable commit');
 const actual=git(root,['rev-parse','--verify',commit+'^{commit}']).trim();
 if(actual!==commit)throw Error('Commit identity mismatch');
 const rows=git(root,['ls-tree','-r','-z','--full-tree',commit]).split('\0').filter(Boolean);
 return rows.map(row=>{
  const m=/^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([^\0]+)$/.exec(row);
  if(!m)throw Error('Invalid tree entry');
  return {mode:m[1],type:m[2],oid:m[3],path:m[4]};
 });
}
function inScope(path){return roots.some(r=>path===r||path.startsWith(r+'/'))||guards.includes(path);}
export function scopedInputs(root,commit,task){
 if(canonical(task)!==canonical(approved))throw Error('Task not approved for isolated scope');
 const all=treeRows(root,commit);
 // Archive attributes can alter bytes, paths and inclusion; until an
 // archive-level digest is implemented, any such rule blocks a candidate.
 if(all.some(x=>x.path==='.gitattributes'||x.path.endsWith('/.gitattributes')))throw Error('Archive attributes require full audit');
 const rows=all.filter(x=>inScope(x.path));
 if(rows.some(x=>x.type!=='blob'||!['100644','100755'].includes(x.mode)))throw Error('Non-regular scoped input');
 if(roots.some(r=>!rows.some(x=>x.path===r||x.path.startsWith(r+'/'))))throw Error('Required input missing');
 if(!rows.some(x=>x.path==='apps/axis-pals/qa.plan.json')||!rows.some(x=>x.path==='scripts/universal-qa/run.mjs'))throw Error('Missing execution manifest or runner');
 rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const manifest={schema:1,scope:'axis-pals-offline-receipt-v1',taskDigest:taskDigest(task),rows};
 return {digest:digest(canonical(manifest)),files:rows.length,manifest};
}
export function compareInputs(root,base,head,task=approved){
 try{
  const before=scopedInputs(root,base,task),after=scopedInputs(root,head,task);
  const a=new Map(before.manifest.rows.map(x=>[x.path,canonical(x)])),b=new Map(after.manifest.rows.map(x=>[x.path,canonical(x)]));
  const changed=[...new Set([...a.keys(),...b.keys()])].filter(p=>a.get(p)!==b.get(p)).sort();
  return {schema:1,base,head,task:task.key,scope:before.manifest.scope,before:before.digest,after:after.digest,
   beforeFiles:before.files,afterFiles:after.files,changedScopedPaths:changed,
   inputMatch:before.digest===after.digest,decision:'execute',reuse:false,canSkip:false,
   reason:changed.length?'Scoped inputs changed':'Scoped inputs match; environment and authenticated prior evidence not evaluated'};
 }catch(e){return {schema:1,base,head,task:task?.key??null,inputMatch:false,decision:'execute',reuse:false,canSkip:false,reason:e.message};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [base,head]=process.argv.slice(2);
 const report=compareInputs(process.cwd(),base,head);
 console.log(JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '## Verified input comparison (advisory only)\n\n~~~json\n'+JSON.stringify(report,null,2)+'\n~~~\n');
}
