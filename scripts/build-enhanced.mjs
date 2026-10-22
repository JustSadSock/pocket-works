import { syncMetadata } from './sync-app-metadata.mjs';
import { spawn } from 'node:child_process';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';
import { buildInBatches } from './enhanced-build-queue.mjs';

const root = process.cwd();
await syncMetadata(root);
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const configs = (await collectAppConfigs(root)).filter(config => runtimeForConfig(config) === 'enhanced');
// Revert immediately to the previous serial behavior by setting
// PW_ENHANCED_BUILD_CONCURRENCY=1. Never exceed two builds by default.
const concurrency = process.env.PW_ENHANCED_BUILD_CONCURRENCY === undefined
  ? 2 : Number(process.env.PW_ENHANCED_BUILD_CONCURRENCY);

async function buildApp(config) {
  console.log('Building enhanced app '+config.slug+'…');
  await new Promise((resolve,reject)=>{
    const child=spawn(command,['run','build','--workspace','@pocket-works/'+config.slug],{
      cwd:root,stdio:'inherit',shell:false
    });
    child.once('error',reject);
    child.once('close',(code,signal)=>{
      if(code===0)resolve();
      else reject(new Error('npm workspace build exited '+(signal||code)));
    });
  });
}

await buildInBatches(configs,concurrency,buildApp);
await syncMetadata(root);
console.log('Enhanced build complete: '+configs.length+' application'+(configs.length===1?'':'s')+' (parallelism '+concurrency+').');
