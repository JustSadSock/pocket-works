import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const coreGates=[
 'registry:check','validate:scripts','validate:configs','validate',
 'validate:mobile','validate:updates','validate:launcher',
 'validate:capabilities','validate:lan','validate:enhanced',
 'validate:godot','validate:quality','validate:pipeline'
];
export const appContractGates=[
 'validate:mobile','validate:updates','validate:launcher',
 'validate:capabilities','validate:enhanced','validate:godot','validate:quality'
];

export function runIndependentGates(gates,execute) {
 const failures=[];
 for(const name of gates) {
  const code=execute(name);
  if(code!==0)failures.push(name);
 }
 return failures;
}

function main() {
 const gates=process.argv.includes('--contracts-only')?appContractGates:coreGates;
 const npm=process.platform==='win32'?'npm.cmd':'npm';
 const failures=runIndependentGates(gates,name=>{
  console.log('::group::'+name);
  const result=spawnSync(npm,['run',name],{cwd:process.cwd(),stdio:'inherit',shell:false});
  if(result.error)console.error(result.error);
  console.log('::endgroup::');
  return result.status===0?0:1;
 });
 if(failures.length) {
  console.error('Independent validation failed in '+failures.length+' gate(s): '+failures.join(', '));
  process.exitCode=1;
 } else console.log('All '+gates.length+' independent validation gates passed.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
