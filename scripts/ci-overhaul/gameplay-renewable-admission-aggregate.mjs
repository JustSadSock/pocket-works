import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PLAN} from './verified-gameplay-receipt.mjs';
const fail=s=>{throw Error(s);};
const [root,out]=process.argv.slice(2),run=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT),matrix=JSON.parse(process.env.MATRIX),source=process.env.SOURCE,controller=process.env.CONTROLLER;
const flags=['productionAuthorization','allowResultReuse','allowImpactSkipping'],names=matrix.map(x=>'renewable-admission-'+x.shard+'-'+x.evidence+'-'+attempt);
if(!Array.isArray(matrix)||!matrix.length||new Set(names).size!==names.length||JSON.stringify(readdirSync(root).sort())!==JSON.stringify([...names].sort()))fail('Incomplete admission matrix');
let fresh=0,reused=0,perf=0,freshMeasurements=0,historicalMeasurements=0,canary=0;const rows=[];let fallback=null;
for(const [i,x] of matrix.entries()){
 const r=JSON.parse(readFileSync(join(root,names[i],'admission-report.json'),'utf8')),n=x.shard<4?234:233,m=[4,5].includes(x.shard)?428:430,p=[0,4,5,6,7].includes(x.shard)?1:0,hit=r.admission?.decision==='reuse-shadow';
 if(r.schema!==1||r.mode!=='renewable-admission-shadow'||r.run!==run||r.attempt!==attempt||r.source!==source||r.controller!==controller||r.shard!==x.shard||r.planDigest!==PLAN||flags.some(k=>r[k]!==false||r.admission?.[k]!==false)||r.gameplayCases!==n||r.freshGameplayCases!==(hit?0:n)||r.reusedGameplayCases!==(hit?n:0)||r.freshPerformanceCases!==p||r.freshPerformanceMeasurements!==p*2||r.freshMeasurements!==(hit?0:m)+p*2||r.historicalMeasurements!==(hit?m:0)||r.semanticMatch!==(r.semanticComparison==='match'?true:null)||!['execute','reuse-shadow'].includes(r.admission?.decision)||(hit?r.semanticComparison!=='not-executed':!['match','no-comparable-baseline'].includes(r.semanticComparison)))fail('Invalid admission report '+x.shard);
 if(x.shard===(run+attempt)%8){if(hit)fail('Canary reused');if(x.evidence==='on')canary++;}
 if(x.evidence==='off'){if(hit||r.historicalMeasurements!==0||r.semanticComparison!=='no-comparable-baseline')fail('Missing-evidence fallback failed');fallback=r;continue;}
 fresh+=r.freshGameplayCases;reused+=r.reusedGameplayCases;perf+=p;freshMeasurements+=r.freshMeasurements;historicalMeasurements+=r.historicalMeasurements;rows.push(r);
}
if(rows.length===8&&(fresh+reused!==1868||perf!==5||freshMeasurements+historicalMeasurements!==3446||canary!==1))fail('Full matrix coverage differs');
const result={schema:1,run,attempt,source,controller,shards:rows.length,freshGameplayCases:fresh,reusedGameplayCases:reused,freshPerformanceCases:perf,freshMeasurements,historicalMeasurements,canary,fallback,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false,rows};
writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
