import { access, readFile, readdir, stat } from 'node:fs/promises';
import { brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';

const root=process.cwd();
const output=path.join(root,'dist-site');
const brotliDecompressAsync=promisify(brotliDecompress);
const CLOUDFLARE_ASSET_LIMIT=25*1024*1024;
const WASM_PACK_THRESHOLD=24*1024*1024;
const errors=[];
async function exists(target){try{await access(target);return true;}catch{return false;}}
async function walkFiles(directory,prefix=''){
  const files=[];
  if(!(await exists(directory)))return files;
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=path.posix.join(prefix,entry.name);
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await walkFiles(absolute,relative));
    else files.push(relative);
  }
  return files.sort();
}

for(const file of [
  'index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js',
  'launcher-update-all-v3.js','launcher-release-links.js','launcher-sync.js','manifest.webmanifest','sw.js','apps.json'
]){
  if(!(await exists(path.join(output,file))))errors.push(`dist-site is missing ${file}`);
}
for(const forbidden of ['node_modules','scripts','docs','package.json','wrangler.jsonc']){
  if(await exists(path.join(output,forbidden)))errors.push(`dist-site must not publish ${forbidden}`);
}

let registry=[];
try{registry=JSON.parse(await readFile(path.join(output,'apps.json'),'utf8'));}
catch(error){errors.push(`dist-site/apps.json is invalid: ${error.message}`);}
const registryBySlug=new Map(registry.map(app=>[app.slug,app]));
const configs=await collectAppConfigs(root);
const cloudflareHeaders=await exists(path.join(output,'_headers'))?await readFile(path.join(output,'_headers'),'utf8'):'';

for(const config of configs){
  const directory=path.join(output,'apps',config.slug);
  const required=config.runtime==='godot'
    ? ['index.html','app.config.json','release.json','manifest.webmanifest','sw.js','icons','pocketworks-build.json']
    : ['index.html','styles.css','app.js','app.config.json','release.json','manifest.webmanifest','sw.js','icons'];
  for(const file of required){
    if(!(await exists(path.join(directory,file))))errors.push(`dist-site/apps/${config.slug} is missing ${file}`);
  }
  if(config.runtime==='godot'&&await exists(directory)){
    const entries=await readdir(directory,{withFileTypes:true});
    const wasmEntries=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.wasm'));
    if(wasmEntries.length===0)errors.push(`dist-site/apps/${config.slug} is missing Godot .wasm payload`);
    if(!entries.some(entry=>entry.isFile()&&entry.name.endsWith('.pck')))errors.push(`dist-site/apps/${config.slug} is missing Godot .pck payload`);

    for(const entry of wasmEntries){
      const deployedPath=path.join(directory,entry.name);
      const sourcePath=path.join(root,'apps',config.slug,'web',entry.name);
      if(!(await exists(sourcePath)))continue;
      const sourceInfo=await stat(sourcePath);
      if(sourceInfo.size<=WASM_PACK_THRESHOLD)continue;

      const route=`/apps/${config.slug}/${entry.name}`;
      if(!cloudflareHeaders.includes(`${route}\n  Content-Encoding: br`)){
        errors.push(`${route} is oversized in source but dist-site/_headers does not mark it Brotli encoded`);
        continue;
      }
      try{
        const [packed,source]=await Promise.all([readFile(deployedPath),readFile(sourcePath)]);
        const unpacked=await brotliDecompressAsync(packed);
        if(!Buffer.from(unpacked).equals(source))errors.push(`${route} Brotli payload does not round-trip to the committed Godot WASM`);
      }catch(error){
        errors.push(`${route} Brotli validation failed: ${error.message}`);
      }
    }
  }
  const forbidden=config.runtime==='godot'
    ? ['source','web','.godot','project.godot','export_presets.cfg','package.json','vite.config.ts','tsconfig.json']
    : ['source','public','.dist','package.json','vite.config.ts','tsconfig.json'];
  for(const item of forbidden){
    if(await exists(path.join(directory,item)))errors.push(`dist-site/apps/${config.slug} must not publish ${item}`);
  }

  let release=null;
  try{release=JSON.parse(await readFile(path.join(directory,'release.json'),'utf8'));}
  catch(error){errors.push(`dist-site/apps/${config.slug}/release.json is invalid: ${error.message}`);}

  if(release){
    if(release.version!==config.version)errors.push(`dist-site/apps/${config.slug}/release.json version mismatch`);
    if(!/^[0-9a-f]{24}$/.test(release.fingerprint||''))errors.push(`dist-site/apps/${config.slug}/release.json fingerprint is invalid`);
    if(!Array.isArray(release.files)||!release.files.includes('index.html'))errors.push(`dist-site/apps/${config.slug}/release.json has no file inventory`);
  }

  const registryEntry=registryBySlug.get(config.slug);
  if(!registryEntry)errors.push(`apps.json is missing ${config.slug}`);
  else if(registryEntry.fingerprint!==release?.fingerprint)errors.push(`apps.json fingerprint mismatch for ${config.slug}`);

  if(await exists(path.join(directory,'index.html'))){
    const html=await readFile(path.join(directory,'index.html'),'utf8');
    if(!html.includes(`name="pocket-works-release" content="${config.version}"`))errors.push(`dist-site/apps/${config.slug}/index.html is not stamped ${config.version}`);
    if(!html.includes(`data-pw-release="${config.version}"`))errors.push(`dist-site/apps/${config.slug}/index.html is missing the release guard`);
    if(release?.fingerprint&&!html.includes(`data-pw-fingerprint="${release.fingerprint}"`))errors.push(`dist-site/apps/${config.slug}/index.html fingerprint mismatch`);
  }
}

if(await exists(path.join(output,'apps'))){
  const deployed=(await readdir(path.join(output,'apps'),{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
  const expected=new Set(configs.map(config=>config.slug));
  for(const directory of deployed)if(!expected.has(directory))errors.push(`dist-site includes unregistered app directory ${directory}`);
}

for(const relative of await walkFiles(output)){
  const info=await stat(path.join(output,relative));
  if(info.size>CLOUDFLARE_ASSET_LIMIT){
    errors.push(`dist-site/${relative} is ${(info.size/1024/1024).toFixed(2)} MiB; Cloudflare Workers static assets must not exceed 25 MiB`);
  }
}

if(errors.length){
  console.error(`Production output validation failed with ${errors.length} issue(s):`);
  errors.forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Production output contains ${configs.length} coherent fingerprinted releases.`);
