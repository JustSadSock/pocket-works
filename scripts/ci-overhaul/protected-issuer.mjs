// Protected issuance boundary. No key, protected environment, or hermetic
// allowlist is deployed by this experimental branch.
import { createPublicKey } from 'node:crypto';
import { canonical,digest,taskDigest,policyDigest,environmentFingerprint,makeReceipt,verifyReceipt } from './verified-results.mjs';
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;

export function assessSource({run,job,artifact,commit,environment,task,policy,issuer}){
 const reasons=[];
 const require=(ok,reason)=>{if(!ok)reasons.push(reason);};
 require(issuer?.ref===policy.ref&&issuer?.refProtected===true&&issuer?.environment===policy.issuerEnvironment,'Issuer is not running in the protected signing environment');
 require(policy.enabled===true,'Receipt issuance disabled by policy');
 require(Number.isSafeInteger(policy.workflowId)&&policy.workflowId>0,'Trusted workflow ID is not pinned');
 require(HEX.test(policy.publicKeyDigest??''),'Trusted public key fingerprint is not pinned');
 require(run?.repository?.full_name===policy.repository&&run?.head_repository?.full_name===policy.repository,'Source repository mismatch');
 require(run?.workflow_id===policy.workflowId&&run?.path===policy.workflow,'Source workflow mismatch');
 require('refs/heads/'+run?.head_branch===policy.ref&&run?.event==='push','Source is not a push to the trusted ref');
 require(run?.status==='completed'&&run?.conclusion==='success'&&Number.isSafeInteger(run?.id)&&Number.isSafeInteger(run?.run_attempt),'Source run not successful');
 require(SHA.test(run?.head_sha??'')&&commit?.sha===run?.head_sha&&SHA.test(commit?.tree?.sha??''),'Immutable source tree not verified');
 const td=taskDigest(task);
 require(['node','node-test'].includes(task.kind)&&task.install===false&&policy.eligibleTaskDigests?.includes(td),'Task has no explicit hermetic approval');
 // A dedicated single-task job, never a generic multi-task artifact.
 require(job?.run_id===run?.id&&job?.run_attempt===run?.run_attempt&&job?.head_sha===run?.head_sha&&job?.status==='completed'&&job?.conclusion==='success'&&job?.name==='hermetic-'+td,'Dedicated successful source job missing');
 require(artifact?.workflow_run?.id===run?.id&&artifact?.workflow_run?.head_sha===run?.head_sha&&artifact?.name==='hermetic-'+td+'-attempt-'+run?.run_attempt&&artifact?.expired===false&&/^sha256:[a-f0-9]{64}$/.test(artifact?.digest??''),'Dedicated immutable artifact missing');
 let fingerprint=null;
 try{fingerprint=environmentFingerprint(environment);}catch{reasons.push('Environment fingerprint unavailable or unpinned');}
 require(HEX.test(policy.environmentFingerprint??'')&&fingerprint===policy.environmentFingerprint,'Environment is not independently approved');
 return {allowed:reasons.length===0,reasons,tree:commit?.tree?.sha??null,environment:fingerprint,taskDigest:td};
}

export function issueProtected({sourceMetadata,archiveBytes,evidence,extractEvidence,privateKey,now}){
 const {policy,task,run}=sourceMetadata;
 const assessment=assessSource(sourceMetadata);
 if(!assessment.allowed)throw Error(assessment.reasons.join('; '));
 if(!Buffer.isBuffer(archiveBytes)||'sha256:'+digest(archiveBytes)!==sourceMetadata.artifact.digest)throw Error('Artifact archive digest mismatch');
 // The trusted caller supplies a strict ZIP extractor. It must return exactly
 // the expected result.json bytes, with no duplicate paths or extra files.
 if(typeof extractEvidence!=='function')throw Error('Trusted archive decoder missing');
 const extracted=extractEvidence(archiveBytes);
 if(!Buffer.isBuffer(extracted)||!Buffer.isBuffer(evidence)||!extracted.equals(evidence))throw Error('Evidence does not match authenticated archive');
 const publicKey=createPublicKey(privateKey);
 if(publicKey.asymmetricKeyType!=='ed25519'||digest(publicKey.export({type:'spki',format:'der'}))!==policy.publicKeyDigest)throw Error('Signing key not pinned');
 const context={tree:assessment.tree,environment:assessment.environment,policyDigest:policyDigest(policy),task};
 const source={repository:policy.repository,workflow:policy.workflow,ref:policy.ref,headSha:run.head_sha,runId:run.id,attempt:run.run_attempt};
 const receipt=makeReceipt({context,policy,source,evidence,privateKey,now});
 if(!verifyReceipt({receipt,context,policy,evidence,publicKey,now}).reuse)throw Error('Issued receipt self-check failed');
 return receipt;
}
