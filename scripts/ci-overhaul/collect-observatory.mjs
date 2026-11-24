// Collect paginated job metadata directly from the GitHub API, never infer
// job counts from its default first page.
import {writeFileSync} from 'node:fs';
const sources={
 legacy:{id:45380288938,sha:'d74bc10b1ee3e931f778ca8a11746dcb7eb7f1c3',name:'Universal Pocket Works QA'},
 shadow:{id:45423462734,sha:'5340689e15379db475cc7b2e5bcc7c99b82691b8',name:'CI Overhaul Full Shadow Lab'},
 retry:{id:45452997352,sha:'d8cdd8d497ab4c8eaedfa62a2f272869990e9347',name:'CI Overhaul Selective Retry Pilot'}
};
const base=process.env.GITHUB_API_URL+'/repos/'+process.env.GITHUB_REPOSITORY+'/actions/runs/';
if(!process.env.GH_TOKEN||!process.env.GITHUB_REPOSITORY||!process.env.GITHUB_API_URL)throw Error('Missing CI API context');
async function get(path){
 const r=await fetch(base+path,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'}});
 if(!r.ok)throw Error('Run metadata API '+r.status+' for '+path);
 return r.json();
}
const all={};
for(const [key,s] of Object.entries(sources)){
 const run=await get(s.id);
 if(run.id!==s.id||run.head_sha!==s.sha||run.name!==s.name||run.status!=='completed'||run.run_attempt!==1)throw Error('Unexpected historical source '+key);
 const jobs=[];
 let total=null;
 for(let page=1;page<=10;page++){
  const r=await get(s.id+'/attempts/1/jobs?per_page=100&page='+page);
  if(total===null)total=r.total_count;
  if(r.total_count!==total||!Array.isArray(r.jobs))throw Error('Unstable pagination');
  jobs.push(...r.jobs);
  if(jobs.length>=total)break;
 }
 if(jobs.length!==total||new Set(jobs.map(j=>j.id)).size!==total)throw Error('Incomplete job pagination: '+key);
 all[key]={run,jobs};
 console.log(key+': '+jobs.length+' jobs');
}
writeFileSync(process.argv[2],JSON.stringify(all,null,2));
