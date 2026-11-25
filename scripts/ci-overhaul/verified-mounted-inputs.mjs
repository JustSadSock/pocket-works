// Shadow-only proof of the files actually visible in the offline QA container.
// This is not a determinism guarantee and cannot authorize result reuse.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync,lstatSync,readFileSync,readdirSync,realpathSync,utimesSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from './verified-results.mjs';

const ROOTS=['apps/axis-pals','shared','scripts','package.json','package-lock.json'];
const EPOCH=946684800;
const LIMIT=64*1024*1024;
const SHA=/^[0-9a-f]{40}$/;
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:LIMIT});
const pathValid=p=>typeof p==='string'&&p.length>0&&p.length<=1024&&
 !p.includes('\\')&&!p.includes('\ufffd')&&!/[\x00-\x1f\x7f]/.test(p)&&
 p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const scope=p=>ROOTS.some(r=>p===r||p.startsWith(r+'/'));
const sortRows=rows=>rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const blobHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');

function expectedFiles(repo,commit){
 if(!SHA.test(commit)||git(repo,['rev-parse','--verify',commit+'^{commit}']).toString().trim()!==commit)
  throw Error('Immutable commit required');
 const data=git(repo,['ls-tree','-r','-z','--full-tree',commit]);
 const raw=data.toString('utf8');
 if(!Buffer.from(raw).equals(data))throw Error('Unsupported path encoding');
 const all=raw.split('\0').filter(Boolean).map(x=>{
  const m=/^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t(.+)$/.exec(x);
  if(!m||!pathValid(m[4]))throw Error('Invalid Git tree entry');
  return {mode:m[1],type:m[2],oid:m[3],path:m[4]};
 });
 if(all.some(x=>x.path==='.gitattributes'||x.path.endsWith('/.gitattributes')))
  throw Error('Archive attributes require review');
 const rows=all.filter(x=>scope(x.path));
 if(rows.some(x=>x.type!=='blob'||!['100644','100755'].includes(x.mode)))
  throw Error('Non-regular tracked input');
 if(ROOTS.some(r=>!rows.some(x=>x.path===r||x.path.startsWith(r+'/'))))
  throw Error('Required input missing');
 if(!rows.some(x=>x.path==='apps/axis-pals/qa.plan.json')||
    !rows.some(x=>x.path==='scripts/universal-qa/run.mjs'))
  throw Error('Missing execution contract inputs');
 return sortRows(rows);
}
function scan(root){
 const abs=resolve(root);
 if(realpathSync(abs)!==abs||!lstatSync(abs).isDirectory())throw Error('Unsafe snapshot root');
 let bytes=0;
 const rows=[],dirs=[];
 const visit=(path,rel)=>{
  const stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('Symbolic link in snapshot');
  if(stat.isDirectory()){
   if(rel==='qa-artifacts'){
    if(readdirSync(path).length!==0)throw Error('Output mount must begin empty');
    return;
   }
   dirs.push({path:rel,mode:stat.mode&0o7777,mtimeMs:stat.mtimeMs,uid:stat.uid,gid:stat.gid});
   for(const name of readdirSync(path).sort()){
    const sub=rel?rel+'/'+name:name;
    if(!pathValid(sub))throw Error('Invalid mounted path');
    visit(join(path,name),sub);
   }
   return;
  }
  if(!stat.isFile()||stat.nlink!==1||rel==='qa-artifacts')throw Error('Non-regular mounted input');
  bytes+=stat.size;
  if(bytes>LIMIT||rows.length>=20000)throw Error('Snapshot size limit');
  const data=readFileSync(path);
  if(data.length!==stat.size)throw Error('Snapshot changed while reading');
  rows.push({path:rel,mode:stat.mode&0o7777,mtimeMs:stat.mtimeMs,uid:stat.uid,gid:stat.gid,
   bytes:data.length,sha256:digest(data),oid:blobHash(data)});
 };
 visit(abs,'');
 return {root:abs,rows:sortRows(rows),dirs:sortRows(dirs),bytes};
}
function assertTracked(expected,actual){
 if(expected.length!==actual.rows.length)throw Error('Missing or extra mounted files');
 const dirs=new Set(['']);
 for(let i=0;i<expected.length;i++){
  const a=expected[i],b=actual.rows[i];
  if(a.path!==b.path||a.oid!==b.oid||((b.mode&0o111)!==0)!==(a.mode==='100755'))
   throw Error('Mounted bytes, path or executable bit differ from tracked input: '+a.path);
  let d=dirname(a.path);
  while(d!=='.'){dirs.add(d);d=dirname(d);}
 }
 if(actual.dirs.length!==dirs.size||actual.dirs.some(d=>!dirs.has(d.path)))
  throw Error('Unexpected mounted directory');
}
export function mountedFingerprint(root){
 const s=scan(root);
 if(s.rows.some(r=>![0o644,0o755].includes(r.mode)||r.mtimeMs!==EPOCH*1000)||
    s.dirs.some(r=>r.mode!==0o755||r.mtimeMs!==EPOCH*1000))
  throw Error('Snapshot metadata not normalized');
 const manifest={schema:1,contract:'mounted-inputs-v1',files:s.rows,dirs:s.dirs};
 return {schema:1,digest:digest(canonical(manifest)),files:s.rows.length,directories:s.dirs.length,bytes:s.bytes,
  productionAuthorization:false,reuse:false};
}
export function normalizeMounted(repo,commit,root){
 const source=realpathSync(repo),target=realpathSync(root);
 const rel=relative(source,target);
 if(!rel||(!rel.startsWith('../')&&rel!=='..'&&!rel.startsWith('/')))
  throw Error('Snapshot must be outside repository');
 const expected=expectedFiles(source,commit),actual=scan(target);
 assertTracked(expected,actual);
 for(const row of expected){
  const p=join(target,row.path);
  chmodSync(p,row.mode==='100755'?0o755:0o644);utimesSync(p,EPOCH,EPOCH);
 }
 // Normalize parents last, including the root, after all archive extraction.
 for(const row of [...actual.dirs].sort((a,b)=>b.path.length-a.path.length)){
  const p=join(target,row.path);chmodSync(p,0o755);utimesSync(p,EPOCH,EPOCH);
 }
 const final=scan(target);assertTracked(expected,final);
 return mountedFingerprint(target);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...args]=process.argv.slice(2);
  const result=mode==='normalize'&&args.length===3?normalizeMounted(...args):
   mode==='measure'&&args.length===1?mountedFingerprint(args[0]):null;
  if(!result)throw Error('Expected normalize repo commit snapshot or measure snapshot');
  console.log(JSON.stringify(result));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
