import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function validateDependencyLock(manifest,lock) {
  const errors=[];
  if(!lock||lock.lockfileVersion!==3||!lock.packages||typeof lock.packages!=='object')
    return ['Root package-lock.json must use npm lockfileVersion 3'];
  const root=lock.packages[''];
  if(!root) return ['Root dependency lock must contain the workspace root'];
  for(const field of ['name','version']) {
    if(root[field]!==manifest[field]) errors.push('Root '+field+' differs between package.json and package-lock.json');
  }
  for(const field of ['workspaces','dependencies','devDependencies','optionalDependencies']) {
    const expected=JSON.stringify(manifest[field]??(field==='workspaces'?[]:{}));
    const actual=JSON.stringify(root[field]??(field==='workspaces'?[]:{}));
    if(expected!==actual) errors.push('Root '+field+' differs between package.json and package-lock.json');
  }
  const playwright=manifest.devDependencies?.['@playwright/test'];
  if(playwright && lock.packages['node_modules/@playwright/test']?.version!==playwright)
    errors.push('Pinned Playwright package must match the browser image version');
  let packages=0;
  for(const [name,pkg] of Object.entries(lock.packages)){
    packages++;
    if(pkg.resolved?.startsWith('http://')) errors.push('Insecure registry URL in '+name);
    if(pkg.resolved?.startsWith('https://registry.npmjs.org/') &&
      !/^sha(?:512|384|256|1)-[a-zA-Z0-9+/=]+$/.test(pkg.integrity||''))
      errors.push('Missing integrity for '+name);
  }
  if(packages<2)errors.push('Root lockfile does not contain any installed packages');
  return errors;
}

async function main(){
  const root=process.cwd();
  const [manifest,lock]=await Promise.all(['package.json','package-lock.json']
    .map(name=>readFile(path.join(root,name),'utf8').then(JSON.parse)));
  const errors=validateDependencyLock(manifest,lock);
  if(errors.length){
    for(const error of errors)console.error('- '+error);
    process.exitCode=1;
  }else console.log('Dependency lock validated: '+Object.keys(lock.packages).length+' pinned root/workspace entries.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error('Dependency lock unavailable: '+error.message);process.exitCode=1;});
