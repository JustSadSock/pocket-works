// Independent historical PR replay. Run every task, not historical cache hits.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ROOT } from '../universal-qa/plan.mjs';
import { command,executeShard } from './run-shard.mjs';
import { identity,seal,verifyBuild } from './build-once.mjs';
import { integratedPlan,firstPass,finish } from './integrated.mjs';
import { compareEvidence } from './pilot.mjs';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
const [rawPath,legacyPath,outPath,expectedArg]=process.argv.slice(2);
const out=resolve(outPath),started=performance.now();
const plan=integratedPlan(readFileSync(rawPath,'utf8'),ROOT),legacy=read(legacyPath);
if(plan.tasks.length!==Number(expectedArg)||legacy.schema!==1||legacy.success!==true||
 legacy.expected!==plan.tasks.length||legacy.passed!==plan.tasks.length||legacy.failed!==0||
 !Array.isArray(legacy.missing)||legacy.missing.length||!Array.isArray(legacy.results)||
 legacy.results.length!==plan.tasks.length)throw Error('Frozen legacy baseline count mismatch');
const baseline=Object.fromEntries(legacy.results.map(r=>[r.key,r]));
if(!compareEvidence(plan.tasks,baseline,baseline).success)throw Error('Frozen planner/legacy identity mismatch');
mkdirSync(out,{recursive:true});write(join(out,'plan.json'),plan);
const first=join(out,'first'),retry=join(out,'retry');
mkdirSync(first);mkdirSync(retry);
let bundle=null,buildMs=0;
if(plan.hasBuild){
 const start=performance.now();
 for(const [bin,args,timeoutMs] of [['npm',['ci','--legacy-peer-deps','--no-audit','--no-fund'],600000],['npm',['run','deploy:site'],420000]]){
  const result=await command(bin,args,{cwd:ROOT,timeoutMs});
  if(!result.success)throw Error('Shared build preparation failed: '+JSON.stringify(result));
 }
 bundle=join(ROOT,'replay-build-bundle');mkdirSync(bundle);
 const site=join(ROOT,'dist-site'),context=identity(ROOT),manifest=await seal(site,context);
 renameSync(site,join(bundle,'dist-site'));
 write(join(bundle,'manifest.json'),manifest);
 await verifyBuild(join(bundle,'dist-site'),manifest,context);
 buildMs=Math.round(performance.now()-start);
}
const artifact=join(ROOT,'qa-artifacts');
async function execute(shards,folder,prefix){
 for(const shard of shards){
  if(existsSync(artifact))throw Error('Stale attempt artifacts');
  await executeShard(ROOT,shard,{buildBundle:shard.needsBuild?bundle:null});
  renameSync(artifact,join(folder,prefix+shard.id));
 }
}
await execute(plan.shards,first,'shadow-shard-');
const initial=firstPass(plan,legacy,first);
write(join(out,'first-audit.json'),initial.prior);
write(join(out,'retry-selection.json'),initial.selection);
await execute(initial.selection.shards,retry,'retry-shard-');
const report=finish(plan,legacy,first,retry);
report.elapsedMs=Math.round(performance.now()-started);
report.sharedBuildMs=buildMs;
report.scope='Independent frozen PR replay; sequential shards per case; no historical task reused';
write(join(out,'report.json'),report);
console.log(JSON.stringify(report,null,2));
if(!report.success)process.exitCode=1;
