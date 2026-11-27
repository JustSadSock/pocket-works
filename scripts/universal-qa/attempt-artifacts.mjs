// Never mix task evidence and summaries, or evidence from separate attempts.
import {readdirSync,lstatSync,renameSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const validKey=k=>typeof k==='string'&&/^[a-z0-9][a-z0-9-]{0,180}$/.test(k);
export function taskArtifactName(key,attempt){
 if(!validKey(key)||!Number.isSafeInteger(attempt)||attempt<=0)throw Error('Invalid task artifact identity');
 return 'qa-task-'+attempt+'-'+key;
}
export function collectAttemptTasks(source,destination,expected,attempt){
 if(!Array.isArray(expected)||!expected.length||expected.some(k=>!validKey(k))||new Set(expected).size!==expected.length)throw Error('Invalid expected task list');
 const names=expected.map(k=>taskArtifactName(k,attempt)),allowed=new Set(names);
 const actual=readdirSync(source);
 const unexpected=actual.filter(n=>!allowed.has(n));
 if(unexpected.length)throw Error('Unexpected attempt artifact: '+unexpected.join(', '));
 const missing=names.filter(n=>!actual.includes(n));
 if(missing.length)throw Error('Missing current-attempt artifact: '+missing.join(', ')+'; re-run all jobs to regenerate the complete plan');
 for(const n of names)if(!lstatSync(join(source,n)).isDirectory())throw Error('Invalid task artifact directory: '+n);
 mkdirSync(destination,{recursive:false});
 for(const [i,name] of names.entries())renameSync(join(source,name),join(destination,'qa-'+expected[i]));
 return {attempt,tasks:expected.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [source,destination]=process.argv.slice(2);
  console.log(JSON.stringify(collectAttemptTasks(resolve(source),resolve(destination),JSON.parse(process.env.QA_EXPECTED),Number(process.env.GITHUB_RUN_ATTEMPT))));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
