// Verified Results v1: conservative, exact-tree verification only.
// The trusted caller must provide an independently pinned public key and
// policy. Never accept either from a PR, artifact, or the receipt itself.
import { createHash, sign, verify, createPublicKey } from 'node:crypto';

const HEX=/^[0-9a-f]{64}$/;
const TREE=/^[0-9a-f]{40}$/;
const MAX_AGE=7*24*60*60*1000;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isSafeInteger(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&Object.getPrototypeOf(value)===Object.prototype)
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw Error('Non-canonical value');
};
const taskDigest=task=>digest(canonical(task));
export const policyDigest=policy=>{
  const p={repository:policy.repository,workflow:policy.workflow,ref:policy.ref,eligibleTaskDigests:[...policy.eligibleTaskDigests].sort()};
  for(const key of ['schema','enabled','workflowId','issuerEnvironment','environmentFingerprint','publicKeyDigest']){
    if(Object.hasOwn(policy,key))p[key]=policy[key];
  }
  return digest(canonical(p));
};
// An unknown or mutable runner image must never acquire an authoritative key.
export function environmentFingerprint(env){
  if(!env||!HEX.test(env.imageDigest)||!HEX.test(env.toolchainDigest)||
    !HEX.test(env.externalInputsDigest)||!['linux'].includes(env.os)||
    !['x64','arm64'].includes(env.arch)||!/^v?\d+\.\d+\.\d+$/.test(env.node))
    throw Error('Environment is not fully pinned');
  return digest(canonical(env));
}
function validateContext(context,policy){
  if(!context||!TREE.test(context.tree)||!HEX.test(context.environment)||
      !HEX.test(context.policyDigest)||context.policyDigest!==policyDigest(policy))
    throw Error('Unknown input or environment fingerprint');
  if(policy.enabled===false)throw Error('Receipt policy disabled');
  if(!context.task||!['node-test','node'].includes(context.task.kind)||
      !Array.isArray(policy.eligibleTaskDigests)||!policy.eligibleTaskDigests.includes(taskDigest(context.task)))
    throw Error('Task is not explicitly approved as hermetic');
}
function validateEvidence(bytes,task){
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>2_000_000)throw Error('Invalid evidence bytes');
  const r=JSON.parse(bytes.toString('utf8'));
  if(r.verificationMode==='verified-split-shadow'||r.schema!==1||r.success!==true||r.exitCode!==0||r.signal!==null||r.timedOut!==false||r.error)
    throw Error('Not an unambiguous successful legacy result');
  const actual=Object.fromEntries(Object.keys(task).map(k=>[k,r[k]]));
  if(canonical(actual)!==canonical(task))throw Error('Evidence task mismatch');
}
function validateSource(source,policy){
  if(!source||source.repository!==policy.repository||source.workflow!==policy.workflow||
      source.ref!==policy.ref||!TREE.test(source.headSha)||
      !Number.isSafeInteger(source.runId)||source.runId<1||
      !Number.isSafeInteger(source.attempt)||source.attempt<1)
    throw Error('Untrusted result provenance');
}
export function makeReceipt({context,policy,source,evidence,privateKey,now=Date.now()}){
  validateContext(context,policy);
  validateSource(source,policy);
  validateEvidence(evidence,context.task);
  if(!Number.isSafeInteger(now)||now<1)throw Error('Invalid issue time');
  // Call only from a protected issuer after independently checking the
  // successful workflow/job, tree, environment and artifact origin.
  const payload={schema:1,tree:context.tree,environment:context.environment,
    policyDigest:context.policyDigest,taskDigest:taskDigest(context.task),
    evidenceDigest:digest(evidence),source,issuedAt:now};
  return {payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64')};
}
export function verifyReceipt({receipt,context,policy,evidence,publicKey,now=Date.now(),maxAgeMs=MAX_AGE}){
  try{
    validateContext(context,policy);
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>MAX_AGE)
      throw Error('Invalid freshness policy');
    if(!receipt||typeof receipt.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(receipt.signature))
      throw Error('Missing or malformed signature');
    const key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
    if(Object.hasOwn(policy,'publicKeyDigest')&&(!HEX.test(policy.publicKeyDigest??'')||digest(key.export({type:'spki',format:'der'}))!==policy.publicKeyDigest))throw Error('Public key not pinned');
    if(key.asymmetricKeyType!=='ed25519'||
      !verify(null,Buffer.from(canonical(receipt.payload)),key,Buffer.from(receipt.signature,'base64')))
      throw Error('Signature verification failed');
    const p=receipt.payload;
    if(p.schema!==1||p.tree!==context.tree||p.environment!==context.environment||
       p.policyDigest!==context.policyDigest||p.taskDigest!==taskDigest(context.task))
      throw Error('Inputs changed');
    if(!Number.isSafeInteger(p.issuedAt)||p.issuedAt>now||now-p.issuedAt>maxAgeMs)
      throw Error('Receipt expired or issued in the future');
    validateSource(p.source,policy);
    validateEvidence(evidence,context.task);
    if(p.evidenceDigest!==digest(evidence))throw Error('Evidence digest mismatch');
    return {reuse:true,reason:'Verified identical tree, environment, task, policy and evidence',source:p.source};
  }catch(error){return {reuse:false,reason:error.message};}
}
export { canonical, digest, taskDigest };
