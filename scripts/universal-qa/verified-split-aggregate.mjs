// Read-only matrix summary for the Universal QA integration experiment.
import {readFileSync,readdirSync,writeFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PLAN} from '../ci-overhaul/verified-gameplay-receipt.mjs';
const fail=s=>{throw Error(s);};
const json=p=>{const s=lstatSync(p);if(!s.isFile()||s.size>4_000_000)fail('Invalid integration evidence');return JSON.parse(readFileSync(p,'utf8'));};
export function summarizeVerifiedSplit(rows,fallback,run,attempt){
 if(!Array.isArray(rows)||rows.length!==8||!Number.isSafeInteger(run)||run<1||!Number.isSafeInteger(attempt)||attempt<1)fail('Missing matrix evidence');
 if(fallback?.route!=='fallback'||fallback.shard!==0||fallback.success!==true||fallback.freshMeasurements!==432)fail('Missing original fresh fallback');
 const ordered=[...rows].sort((a,b)=>a.shard-b.shard);
 let fresh=0,reused=0,portable=0,performance=0,freshMeasurements=0,historicalMeasurements=0;
 for(const [i,r] of ordered.entries()){
  const game=i<4?234:233,perf=[0,4,5,6,7].includes(i)?1:0,metrics=[4,5].includes(i)?428:430,hit=r.admission?.decision==='reuse-shadow';
  if(r.shard!==i||r.route!==(i%2?'sharded':'direct')||r.success!==true||r.productionGateRejected!==true||r.mode!=='verified-split-shadow'||r.planDigest!==PLAN||r.gameplayCases!==game||r.performanceCases!==perf||r.completed!==game+perf||r.productionAuthorization!==false||r.allowResultReuse!==false||r.allowImpactSkipping!==false||r.freshGameplayCases!==(hit?0:game)||r.reusedGameplayCases!==(hit?game:0)||r.freshMeasurements!==(hit?0:metrics)+perf*2||r.historicalMeasurements!==(hit?metrics:0)||r.semanticComparison!==(hit?'not-executed':'match')||!['execute','reuse-shadow'].includes(r.admission?.decision)||hit&&!['exact','observed-directed-pair'].includes(r.admission.eligibility))fail('Invalid integrated shard '+i);
  if(i===(run+attempt)%8&&hit)fail('Canary was reused');
  fresh+=r.freshGameplayCases;reused+=r.reusedGameplayCases;performance+=perf;freshMeasurements+=r.freshMeasurements;historicalMeasurements+=r.historicalMeasurements;
  if(hit&&r.admission.eligibility==='observed-directed-pair')portable+=game;
 }
 if(fresh+reused!==1868||performance!==5||freshMeasurements+historicalMeasurements!==3446)fail('Matrix lost scenario or measurement coverage');
 return {schema:1,run,attempt,planDigest:PLAN,gameplayCases:1868,freshGameplayCases:fresh,reusedGameplayCases:reused,portableReusedCases:portable,freshPerformanceCases:performance,freshMeasurements,historicalMeasurements,mandatoryFreshCanary:(run+attempt)%8,productionGateRejectedShards:8,fallback,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false,perShard:ordered};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [root,out]=process.argv.slice(2),run=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  const name=(route,i)=>'universal-verified-'+route+'-'+i+'-'+attempt,names=Array.from({length:8},(_,i)=>name(i%2?'sharded':'direct',i)).concat(name('fallback',0));
  if(process.env.MATRIX_RESULT!=='success'||JSON.stringify(readdirSync(root).sort())!==JSON.stringify([...names].sort()))fail('Incomplete integration artifacts');
  const read=(n,i)=>json(join(root,n,'banners-of-war-completion-lab-'+i,'integration-verdict.json'));
  const r=summarizeVerifiedSplit(names.slice(0,8).map((n,i)=>read(n,i)),read(names[8],0),run,attempt);
  writeFileSync(out,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
