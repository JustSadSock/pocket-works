// Dynamic source identity is independently pinned by the outer trusted controller.
import {writeFileSync} from 'node:fs';
import {loadOriginal,runPhase} from './simulation-performance-contracts.mjs';
import {PLAN} from './verified-gameplay-receipt.mjs';
try{
 const [mode,root,...args]=process.argv.slice(2),context={source:process.env.SOURCE_SHA,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),auditCommit:process.env.GITHUB_SHA};
 if(!/^[a-f0-9]{40}$/.test(context.source)||!/^[a-f0-9]{40}$/.test(context.auditCommit)||!Number.isSafeInteger(context.run)||context.run<1||!Number.isSafeInteger(context.attempt)||context.attempt<1)throw Error('Invalid renewal context');
 for(const k of ['SOURCE_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA'])delete process.env[k];
 const original=await loadOriginal(root);
 if(original.version!=='chronicles-completion-v1'||original.plan.planDigest!==PLAN||original.plan.total!==1873)throw Error('Changed plan requires fresh audit; no receipt issued');
 if(mode==='plan'&&args.length===1)writeFileSync(args[0],JSON.stringify({plan:original.plan,version:original.version,context},null,2)+'\n',{flag:'wx'});
 else if(mode==='phase'&&args.length===3)runPhase(original,Number(args[0]),args[1],args[2],context);
 else throw Error('Invalid renewal phase');
}catch(e){console.error(e.message);process.exitCode=1;}
