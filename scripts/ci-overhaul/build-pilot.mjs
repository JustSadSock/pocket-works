import { readFileSync, renameSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../universal-qa/plan.mjs';
import { shadowFromLegacy,planShards } from './sharding.mjs';
import { executeShard } from './run-shard.mjs';
import { compareEvidence } from './pilot.mjs';

const raw=readFileSync(process.argv[2],'utf8'),bundle=process.argv[3];
if(!bundle)throw Error('Build bundle is required');
const candidates=shadowFromLegacy(raw).shards.flatMap(s=>s.tasks)
  .filter(t=>t.kind==='visual'&&JSON.parse(readFileSync(join(ROOT,'apps',t.app,'app.config.json'),'utf8')).runtime!=='quick')
  .sort((a,b)=>a.key.localeCompare(b.key));
if(!candidates.length)throw Error('No enhanced visual task in original plan');
const task=candidates[0],shard=planShards([task])[0];
const lab=join(ROOT,'build-pilot-evidence'),output=join(ROOT,'qa-artifacts');
mkdirSync(lab);
const baseline=await executeShard(ROOT,shard);
renameSync(output,join(lab,'baseline'));
const reused=await executeShard(ROOT,shard,{buildBundle:bundle});
renameSync(output,join(lab,'prebuilt'));
const get=folder=>JSON.parse(readFileSync(join(lab,folder,task.key,'result.json'),'utf8'));
const a=get('baseline'),b=get('prebuilt');
const report=compareEvidence([task],{[task.key]:a},{[task.key]:b});
report.success=report.success&&baseline.success&&reused.success&&b.buildMode==='same-run-prebuilt';
report.buildMode=b.buildMode??null;
writeFileSync(join(lab,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.success)process.exitCode=1;
