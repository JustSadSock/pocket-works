// Frozen current-PR shadow execution. No production checks or deployments change.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {ROOT} from '../universal-qa/plan.mjs';
import {integratedPlan,readAttempt} from './integrated.mjs';
import {executeShard,command} from './run-shard.mjs';
import {identity,seal,verifyBuild} from './build-once.mjs';
import {planShards} from './sharding.mjs';
import {verdict,recover,legacyVerdict,shadowDecision} from './canary-evidence.mjs';

const [raw,summaryPath,outPath,expectedArg,sourceConclusion]=process.argv.slice(2);
const out=resolve(outPath),started=performance.now(),write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
const plan=integratedPlan(readFileSync(raw,'utf8'),ROOT);
if(plan.tasks.length!==Number(expectedArg))throw Error('Unexpected frozen task count');
const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:ROOT,encoding:'utf8'}).trim();
const legacy=legacyVerdict(plan.tasks,sourceConclusion==='success'?JSON.parse(readFileSync(summaryPath,'utf8')):null,tree,sourceConclusion);
mkdirSync(out,{recursive:true});write(join(out,'plan.json'),plan);
const first=join(out,'first'),retry=join(out,'retry');mkdirSync(first);mkdirSync(retry);
let bundle=null;
if(plan.hasBuild){
 for(const [bin,args,timeoutMs] of [['npm',['ci','--legacy-peer-deps','--no-audit','--no-fund'],600000],['npm',['run','deploy:site'],420000]]){
  const r=await command(bin,args,{cwd:ROOT,timeoutMs});if(!r.success)throw Error('Shared build failed');
 }
 bundle=join(ROOT,'canary-build-bundle');mkdirSync(bundle);
 const ctx=identity(ROOT),site=join(ROOT,'dist-site'),manifest=await seal(site,ctx);
 renameSync(site,join(bundle,'dist-site'));write(join(bundle,'manifest.json'),manifest);
 await verifyBuild(join(bundle,'dist-site'),manifest,ctx);
}
const artifact=join(ROOT,'qa-artifacts');
async function execute(shards,folder,prefix){
 for(const s of shards){
  if(existsSync(artifact))throw Error('Stale canary evidence');
  await executeShard(ROOT,s,{buildBundle:s.needsBuild?bundle:null});
  renameSync(artifact,join(folder,prefix+s.id));
 }
}
await execute(plan.shards,first,'shadow-shard-');
const firstRecords=readAttempt(plan,plan.shards,first,'shadow-shard-').records;
const initial=verdict(plan.tasks,firstRecords,tree);
write(join(out,'first-verdict.json'),initial);
if(initial.failed.length>12)throw Error('Retry budget exceeded');
const failed=new Set(initial.failed),prebuilt=new Set(plan.prebuilt);
const retryShards=planShards(plan.tasks.filter(t=>failed.has(t.key)),{maxTasks:1}).map(s=>({...s,needsBuild:s.tasks.some(t=>prebuilt.has(t.key))}));
await execute(retryShards,retry,'retry-shard-');
const second=readAttempt(plan,retryShards,retry,'retry-shard-').records;
const integrated=recover(plan.tasks,firstRecords,second,tree),decision=shadowDecision(legacy,integrated);
const report={schema:1,sourceConclusion,legacy,integrated,decision,elapsedMs:Math.round(performance.now()-started),scope:'Frozen current-PR independent execution; no production authorization'};
write(join(out,'report.json'),report);console.log(JSON.stringify(report,null,2));
if(!integrated.success||sourceConclusion==='success'&&!decision.canaryPassed||sourceConclusion!=='success'&&decision.deliveryAllowed)process.exitCode=1;
