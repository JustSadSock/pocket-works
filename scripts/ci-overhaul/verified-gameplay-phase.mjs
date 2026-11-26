// Isolate changing CI metadata from the actual game modules.
// Metadata stays in the evidence controller and is not inherited by game code.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SOURCE} from './verified-gameplay-receipt.mjs';
try {
 const [mode,root,...args]=process.argv.slice(2);
 const context={source:process.env.SOURCE_SHA,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),auditCommit:process.env.GITHUB_SHA};
 if(context.source!==SOURCE||!Number.isSafeInteger(context.run)||context.run<1||!Number.isSafeInteger(context.attempt)||context.attempt<1||!/^[a-f0-9]{40}$/.test(context.auditCommit))throw Error('Invalid execution context');
 for(const key of ['SOURCE_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA'])delete process.env[key];
 const {loadOriginal,runPhase}=await import('./simulation-performance-contracts.mjs');
 const original=await loadOriginal(root);
 if(mode==='plan'&&args.length===1){
  writeFileSync(args[0],JSON.stringify({plan:original.plan,version:original.version,context},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({total:original.plan.total,planDigest:original.plan.planDigest,productionAuthorization:false}));
 }else if(mode==='phase'&&args.length===3){
  const [shard,name,out]=args;
  runPhase(original,Number(shard),name,out,context);
 }else throw Error('Invalid phase command');
}catch(e){console.error(e);process.exitCode=1;}
