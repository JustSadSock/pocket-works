// Exact-tree, non-authoritative receipt format. The signing workflow is
// separate from execution and only runs on main. No receipt permits skipping.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest,taskDigest,environmentFingerprint} from './verified-results.mjs';
const SHA=/^[0-9a-f]{40}$/,HEX=/^[0-9a-f]{64}$/;
export const TASK=Object.freeze({key:'axis-pals-rules',app:'axis-pals',suite:'rules',kind:'node-test',seed:null,install:false});
export const REPO='JustSadSock/pocket-works';
export const WORKFLOW='.github/workflows/verified-results-shadow.yml';
export function makeShadowReceipt({source,environment,evidence,now=Date.now()}){
 if(source?.repository!==REPO||source.workflow!==WORKFLOW||source.ref!=='refs/heads/main'||
   !SHA.test(source.commit??'')||!SHA.test(source.tree??'')||
   !Number.isSafeInteger(source.run)||source.run<1||!Number.isSafeInteger(source.attempt)||source.attempt<1||
   !['push','workflow_dispatch'].includes(source.event))throw Error('Untrusted source');
 if(!environment||environment.contract!=='readonly-offline-container-v1'||
   !HEX.test(environment.containerConfigDigest??'')||!HEX.test(environment.kernelDigest??'')||
   !HEX.test(environment.executionContractDigest??''))throw Error('Incomplete execution environment');
 const fingerprint=environmentFingerprint(environment);
 if(!Buffer.isBuffer(evidence)||!evidence.length||evidence.length>2_000_000)throw Error('Invalid evidence bytes');
 const r=JSON.parse(evidence.toString('utf8'));
 const identity=Object.fromEntries(Object.keys(TASK).map(k=>[k,r[k]]));
 if(canonical(identity)!==canonical(TASK)||r.schema!==1||r.success!==true||r.exitCode!==0||
   r.signal!==null||r.timedOut!==false||r.error||!Number.isSafeInteger(r.durationMs)||r.durationMs<0)
   throw Error('Invalid successful task evidence');
 if(!Number.isSafeInteger(now)||now<1)throw Error('Invalid issue time');
 return {schema:1,mode:'attested-shadow',source,environment,environmentFingerprint:fingerprint,
   task:TASK,taskDigest:taskDigest(TASK),evidenceDigest:digest(evidence),issuedAt:now,
   productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
export function compareShadowReceipt({receipt,source,environment,evidence,now=Date.now()}){
 try{
   if(!receipt||!Number.isSafeInteger(now)||!Number.isSafeInteger(receipt.issuedAt)||
      now<receipt.issuedAt||now-receipt.issuedAt>7*86400000)throw Error('Stale receipt');
   const expected=makeShadowReceipt({source,environment,evidence,now:receipt.issuedAt});
   if(canonical(receipt)!==canonical(expected))throw Error('Receipt inputs or evidence differ');
   return {match:true,productionAuthorization:false,reuse:false};
 }catch(e){return {match:false,reason:e.message,productionAuthorization:false,reuse:false};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
 const [mode,sourcePath,envPath,evidencePath,receiptPath]=process.argv.slice(2);
 const source=JSON.parse(readFileSync(sourcePath,'utf8')),environment=JSON.parse(readFileSync(envPath,'utf8')),evidence=readFileSync(evidencePath);
 if(mode==='issue'){
   writeFileSync(receiptPath,JSON.stringify(makeShadowReceipt({source,environment,evidence}),null,2)+'\n',{flag:'wx'});
 }else if(mode==='compare'){
   const r=compareShadowReceipt({receipt:JSON.parse(readFileSync(receiptPath,'utf8')),source,environment,evidence});
   console.log(JSON.stringify(r));if(!r.match)process.exitCode=1;
 }else throw Error('Unknown operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
