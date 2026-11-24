// Impact Engine v1: advisory only. A graph is never authority to skip QA.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../universal-qa/plan.mjs';

const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA=/^[0-9a-f]{40}$/;
const unique=xs=>[...new Set(xs)].sort();
export function diffPaths(root,base,head){
  if(!SHA.test(base)||!SHA.test(head))throw Error('Expected full immutable commit SHAs');
  // No rename inference: old and new paths both count, including deletions.
  return execFileSync('git',['diff','--name-only','--no-renames','-z',base+'...'+head],{
    cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
  }).split('\0').filter(Boolean);
}
export function appInventory(root){
  return readdirSync(join(root,'apps'),{withFileTypes:true})
    .filter(e=>e.isDirectory()&&SLUG.test(e.name)&&existsSync(join(root,'apps',e.name,'app.config.json')))
    .map(e=>e.name).sort();
}
export function workspaceGraph(root,apps){
  const names=new Map(),manifests=new Map(),edges=[];
  for(const app of apps){
    const path=join(root,'apps',app,'package.json');
    if(!existsSync(path))continue;
    const data=JSON.parse(readFileSync(path,'utf8'));
    if(typeof data.name==='string'){
      if(names.has(data.name))throw Error('Duplicate workspace package: '+data.name);
      names.set(data.name,app);
    }
    manifests.set(app,data);
  }
  for(const [app,data] of manifests){
    for(const field of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
      for(const name of Object.keys(data[field]??{})){
        if(names.has(name)&&names.get(name)!==app)edges.push({consumer:app,dependency:names.get(name),reason:'workspace:'+name});
        else if(name.startsWith('@pocket-works/')&&!names.has(name))throw Error('Unresolved internal workspace: '+name);
      }
    }
  }
  return edges;
}
export function impact({apps,paths,edges=[]}){
  if(!Array.isArray(apps)||!apps.length||new Set(apps).size!==apps.length||apps.some(a=>!SLUG.test(a)))throw Error('Invalid app inventory');
  const all=unique(apps),known=new Set(all),direct=new Set(),reasons=[],reverse=new Map();
  let global=false;
  const fallback=reason=>{global=true;reasons.push(reason);};
  if(!Array.isArray(paths))fallback('Missing diff evidence');
  for(const p of paths??[]){
    if(typeof p!=='string'||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..')){
      fallback('Unrecognized path');continue;
    }
    const m=/^apps\/([a-z0-9-]+)\//.exec(p);
    if(!m||!known.has(m[1])){fallback('Shared, deleted-app or unknown path: '+p);continue;}
    direct.add(m[1]);
    // A manifest change can alter edges in the old graph. Until both trees
    // are certified, use full scope.
    if(/\/(?:package(?:-lock)?\.json|app\.config\.json|qa\.plan\.json)$/.test(p))fallback('Manifest or dependency contract changed: '+p);
  }
  for(const e of edges){
    if(!e||!known.has(e.consumer)||!known.has(e.dependency)){fallback('Unknown dependency endpoint');continue;}
    if(!reverse.has(e.dependency))reverse.set(e.dependency,new Set());
    reverse.get(e.dependency).add(e.consumer);
  }
  const affected=new Set(direct),queue=[...direct];
  for(let i=0;i<queue.length;i++){
    for(const consumer of reverse.get(queue[i])??[]){
      if(!affected.has(consumer)){affected.add(consumer);queue.push(consumer);}
    }
  }
  return {schema:1,mode:'advisory',globalFallback:global,direct:unique([...direct]),
    candidateApps:global?all:unique([...affected]),transitive:unique([...affected].filter(a=>!direct.has(a))),
    requiredApps:all,reasons:unique(reasons),canSkip:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const apps=appInventory(ROOT);
    let report;
    try{report=impact({apps,paths:diffPaths(ROOT,process.argv[2],process.argv[3]),edges:workspaceGraph(ROOT,apps)});}
    catch(e){report=impact({apps,paths:null});report.reasons.push(e.message);}
    console.log(JSON.stringify(report,null,2));
  }catch(e){console.error(e);process.exitCode=1;}
}
