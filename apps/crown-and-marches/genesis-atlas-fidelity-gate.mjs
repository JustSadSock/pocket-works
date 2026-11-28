// Shader and urban preflight remain hard prerequisites. Integration failure
// must not hide independent camera and historical diagnostics; both must pass.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run=entry=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('./'+entry,import.meta.url))],{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',(code,signal)=>resolve(code??1));});
for(const entry of ['atlas-shader-qa.mjs','atlas-urban-render-qa.mjs']){const status=await run(entry);if(status)process.exit(status);}
const integration=await run('genesis-atlas-integration-qa.mjs');
const historical=await run('genesis-atlas-human-qa.mjs');
console.log('[atlas-fidelity-gate] '+JSON.stringify({integration,historical,passed:integration===0&&historical===0}));
if(integration||historical)process.exit(1);
