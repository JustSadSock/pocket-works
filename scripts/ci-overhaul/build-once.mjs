// Same-run, exact-tree build artifacts. Never a cross-PR build cache.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from './verified-results.mjs';

const sha=/^[a-f0-9]{40}$/;
const hashFile=async path=>{
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
};
export async function inventory(dir){
  if(!lstatSync(dir).isDirectory())throw Error('Build root must be a real directory');
  const files=[];
  async function walk(folder){
    for(const name of readdirSync(folder).sort()){
      const path=join(folder,name),stat=lstatSync(path),key=relative(dir,path).split('\\').join('/');
      if(stat.isSymbolicLink())throw Error('Symlink forbidden in build: '+key);
      if(stat.isDirectory())await walk(path);
      else if(stat.isFile())files.push({path:key,size:stat.size,sha256:await hashFile(path)});
      else throw Error('Unsupported build entry: '+key);
    }
  }
  await walk(dir);
  if(!files.length)throw Error('Empty build');
  return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function identity(root,env=process.env){
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const tree=git('rev-parse','HEAD^{tree}'),commit=git('rev-parse','HEAD');
  if(!sha.test(tree)||!sha.test(commit)||!/^\d+$/.test(env.GITHUB_RUN_ID??'')||
      !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT??'')||!env.GITHUB_REPOSITORY)throw Error('Missing same-run provenance');
  return {tree,commit,run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,
    repository:env.GITHUB_REPOSITORY,node:process.version,platform:process.platform,arch:process.arch,
    configuration:'npm deploy:site; playwright 1.55.0 noble'};
}
export async function seal(site,context){
  const files=await inventory(site);
  if(!files.some(f=>f.path==='apps.json')||!files.some(f=>f.path==='index.html'))throw Error('Incomplete site output');
  return {schema:1,context,files};
}
export async function verifyBuild(site,manifest,context){
  if(manifest?.schema!==1||canonical(manifest.context)!==canonical(context))throw Error('Build provenance mismatch');
  const files=await inventory(site);
  if(canonical(manifest.files)!==canonical(files))throw Error('Build inventory mismatch');
  if(!files.some(f=>f.path==='apps.json')||!files.some(f=>f.path==='index.html'))throw Error('Incomplete site output');
  return true;
}
export async function stageBuild(bundle,work,context){
  const site=join(bundle,'dist-site'),manifest=JSON.parse(readFileSync(join(bundle,'manifest.json'),'utf8'));
  const target=join(work,'dist-site');
  if(existsSync(target))throw Error('Refusing to overwrite an existing site');
  await verifyBuild(site,manifest,context);
  cpSync(site,target,{recursive:true,errorOnExist:true,force:false});
  await verifyBuild(target,manifest,context);
  return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const root=resolve(process.argv[3]||'.'),bundle=resolve(process.argv[4]||'build-bundle');
    if(process.argv[2]==='seal'){
      mkdirSync(bundle,{recursive:true});
      const site=join(root,'dist-site');
      const manifest=await seal(site,identity(root));
      cpSync(site,join(bundle,'dist-site'),{recursive:true,errorOnExist:true,force:false});
      await verifyBuild(join(bundle,'dist-site'),manifest,identity(root));
      writeFileSync(join(bundle,'manifest.json'),JSON.stringify(manifest));
      console.log('Build sealed: '+manifest.files.length+' files');
    }else if(process.argv[2]==='verify'){
      const m=JSON.parse(readFileSync(join(bundle,'manifest.json'),'utf8'));
      await verifyBuild(join(bundle,'dist-site'),m,identity(root));
      console.log('Verified same-run build: '+m.files.length+' files');
    }else throw Error('Expected seal or verify');
  }catch(e){console.error(e);process.exitCode=1;}
}
