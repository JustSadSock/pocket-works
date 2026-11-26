// No expensive art run until both browsers pass the fast integration.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const entry of ['genesis-atlas-integration-qa.mjs','genesis-atlas-fidelity-qa.mjs']){const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('./'+entry,import.meta.url))],{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',(code,signal)=>resolve(code??1));});if(status)process.exit(status);}
