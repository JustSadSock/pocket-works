import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';
import { buildRegistry } from './build-registry.mjs';

const root=process.cwd();
const output=path.join(root,'dist-site');
const FINGERPRINT_PLACEHOLDER='__PW_RELEASE_FINGERPRINT__';
const CLOUDFLARE_ASSET_LIMIT=25*1024*1024;
const WASM_SPLIT_THRESHOLD=24*1024*1024;
const WASM_CHUNK_SIZE=16*1024*1024;
const rootFiles=[
  'index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js',
  'launcher-update-all.js','launcher-update-all-v2.js','launcher-update-all-v3.js','launcher-release-links.js','launcher-sync.js',
  'manifest.webmanifest','sw.js'
];
const appDevEntries=new Set(['package.json','vite.config.ts','tsconfig.json','README.md','source','public','.dist','server','web','.godot','project.godot','export_presets.cfg']);

async function copyDirectoryFiltered(source,destination,shouldSkip){
  await mkdir(destination,{recursive:true});
  const entries=await readdir(source,{withFileTypes:true});
  for(const entry of entries){
    if(shouldSkip(entry.name,entry))continue;
    const from=path.join(source,entry.name);
    const to=path.join(destination,entry.name);
    if(entry.isDirectory())await copyDirectoryFiltered(from,to,shouldSkip);
    else await cp(from,to);
  }
}

function addReleaseParam(value,version){
  if(!value||value.startsWith('#')||/^(?:https?:|data:|mailto:|tel:|blob:)/i.test(value))return value;
  const hashIndex=value.indexOf('#');
  const hash=hashIndex>=0?value.slice(hashIndex):'';
  const withoutHash=hashIndex>=0?value.slice(0,hashIndex):value;
  const [pathname,query='']=withoutHash.split('?');
  if(!/\.(?:js|mjs|css|json|webmanifest|svg|png|jpe?g|webp|gif|woff2?|mp3|ogg|wav)$/i.test(pathname))return value;
  const params=new URLSearchParams(query);
  params.set('pw_release',version);
  return `${pathname}?${params}${hash}`;
}

function stampHtml(source,config){
  let html=source
    .replace(/\s*<meta name="pocket-works-release"[^>]*>/g,'')
    .replace(/\s*<meta name="pocket-works-fingerprint"[^>]*>/g,'')
    .replace(/\s*<script[^>]+data-pw-release[^>]*><\/script>/g,'');

  html=html.replace(/\b(src|href)="([^"]+)"/g,(match,attribute,value)=>`${attribute}="${addReleaseParam(value,config.version)}"`);
  if(config.slug==='blazon'){
    html=html.replace(
      /<script\s+type="module"\s+src="\.\/app\.js[^"]*"><\/script>/,
      `<script src="./bootstrap.js?pw_release=${config.version}"></script>`
    );
    html=html.replace(/<footer>[^<]*<\/footer>/,`<footer>v${config.version} · загрузка</footer>`);
  }

  const injection=`
  <meta name="pocket-works-release" content="${config.version}">
  <meta name="pocket-works-fingerprint" content="${FINGERPRINT_PLACEHOLDER}">
  <script src="../../shared/release-guard.js?pw_release=${config.version}&pw_fp=${FINGERPRINT_PLACEHOLDER}" data-pw-release="${config.version}" data-pw-fingerprint="${FINGERPRINT_PLACEHOLDER}" data-pw-slug="${config.slug}"></script>`;
  return html.replace(/<head>/i,`<head>${injection}`);
}

function stampSpecifier(specifier,version){
  if(!specifier.startsWith('./')&&!specifier.startsWith('../'))return specifier;
  const hashIndex=specifier.indexOf('#');
  const hash=hashIndex>=0?specifier.slice(hashIndex):'';
  const clean=hashIndex>=0?specifier.slice(0,hashIndex):specifier;
  const [pathname,query='']=clean.split('?');
  if(!/\.m?js$/i.test(pathname))return specifier;
  const params=new URLSearchParams(query);
  params.set('pw_release',version);
  return `${pathname}?${params}${hash}`;
}

function stampJavaScript(source,config,relativePath){
  let stamped=source
    .replace(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1/g,(match,quote,specifier)=>`from ${quote}${stampSpecifier(specifier,config.version)}${quote}`)
    .replace(/\bimport\s+(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1/g,(match,quote,specifier)=>`import ${quote}${stampSpecifier(specifier,config.version)}${quote}`)
    .replace(/\bimport\s*\(\s*(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1\s*\)/g,(match,quote,specifier)=>`import(${quote}${stampSpecifier(specifier,config.version)}${quote})`);

  if(config.slug==='blazon'&&relativePath==='progression-engine.js'){
    stamped=stamped.replace(/['"]\.\/engine\.js\?core=[^'"]+['"]/ ,`'./core-engine.js?pw_release=${config.version}'`);
  }
  return `/* pocket-works-release:${config.slug}@${config.version}:${relativePath} */\n${stamped}`;
}

async function walkFiles(directory,prefix=''){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=path.posix.join(prefix,entry.name);
    if(entry.isDirectory())files.push(...await walkFiles(path.join(directory,entry.name),relative));
    else files.push(relative);
  }
  return files.sort();
}

function wasmChunkBootstrap(relative,parts,totalSize,version){
  const target='./'+relative;
  const chunkUrls=parts.map(part=>'./'+part+'?pw_release='+encodeURIComponent(version));
  return `<script data-pocketworks-wasm-chunks>
(() => {
  const targetUrl = new URL(${JSON.stringify(target)}, window.location.href);
  const chunkUrls = ${JSON.stringify(chunkUrls)};
  const totalSize = ${totalSize};
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function pocketWorksChunkFetch(input, init) {
    let requested;
    try {
      const raw = input instanceof Request ? input.url : input;
      requested = new URL(raw, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }
    if (requested.origin !== targetUrl.origin || requested.pathname !== targetUrl.pathname) {
      return nativeFetch(input, init);
    }

    const signal = input instanceof Request ? input.signal : init?.signal;
    const credentials = input instanceof Request ? input.credentials : (init?.credentials || 'same-origin');
    const requests = chunkUrls.map((chunk) => nativeFetch(new URL(chunk, window.location.href), {
      credentials,
      signal
    }).then((response) => {
      if (!response.ok) throw new Error('Failed loading Godot WASM chunk: ' + response.url + ' (' + response.status + ')');
      return response;
    }));

    return Promise.all(requests).then((responses) => {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let emitted = 0;
            for (const response of responses) {
              if (!response.body) {
                const bytes = new Uint8Array(await response.arrayBuffer());
                emitted += bytes.byteLength;
                controller.enqueue(bytes);
                continue;
              }
              const reader = response.body.getReader();
              while (true) {
                const result = await reader.read();
                if (result.done) break;
                emitted += result.value.byteLength;
                controller.enqueue(result.value);
              }
            }
            if (emitted !== totalSize) {
              throw new Error('Godot WASM chunk size mismatch: expected ' + totalSize + ', received ' + emitted);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/wasm',
          'X-PocketWorks-Wasm-Chunks': String(chunkUrls.length)
        }
      });
    });
  };
})();
</script>`;
}

async function splitOversizedGodotWasm(directory,slug,version){
  const webFiles=await walkFiles(directory);
  const splitRecords=[];
  for(const relative of webFiles){
    if(!relative.endsWith('.wasm'))continue;
    const file=path.join(directory,relative);
    const info=await stat(file);
    if(info.size<=WASM_SPLIT_THRESHOLD)continue;

    const source=await readFile(file);
    const parts=[];
    for(let offset=0,index=0;offset<source.length;offset+=WASM_CHUNK_SIZE,index+=1){
      const part=`${relative}.part-${String(index).padStart(3,'0')}`;
      await writeFile(path.join(directory,part),source.subarray(offset,Math.min(source.length,offset+WASM_CHUNK_SIZE)));
      parts.push(part);
    }
    await rm(file);

    const indexPath=path.join(directory,'index.html');
    let html=await readFile(indexPath,'utf8');
    const bootstrap=wasmChunkBootstrap(relative,parts,source.length,version);
    const loaderMatch=html.match(/<script\s+src=["'][^"']+\.js["'][^>]*><\/script>/i);
    if(!loaderMatch)throw new Error(`Godot app ${slug} has no engine loader script to precede with the WASM chunk bootstrap`);
    html=html.replace(loaderMatch[0],bootstrap+'\n\t\t'+loaderMatch[0]);
    await writeFile(indexPath,html,'utf8');

    const swPath=path.join(directory,'sw.js');
    let sw=await readFile(swPath,'utf8');
    const originalJson=JSON.stringify('./'+relative);
    const partJson=parts.map(part=>JSON.stringify('./'+part)).join(',\n  ');
    if(!sw.includes(originalJson))throw new Error(`Godot app ${slug} service worker does not cache ${relative}`);
    sw=sw.replace(originalJson,partJson);
    await writeFile(swPath,sw,'utf8');

    splitRecords.push({relative,parts,totalSize:source.length});
    console.log(
      `Split Godot WASM ${slug}/${relative}: ${(source.length/1024/1024).toFixed(2)} MiB -> ${parts.length} chunk(s), max ${(WASM_CHUNK_SIZE/1024/1024).toFixed(0)} MiB`
    );
  }
  return splitRecords;
}

async function canonicalFingerprint(directory){
  const hash=createHash('sha256');
  for(const relative of (await walkFiles(directory)).filter(file=>file!=='release.json')){
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(path.join(directory,relative)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0,24);
}

async function embedFingerprint(directory,fingerprint){
  const textPattern=/\.(?:html|js|mjs|css|json|webmanifest|svg)$/i;
  for(const relative of await walkFiles(directory)){
    if(!textPattern.test(relative))continue;
    const file=path.join(directory,relative);
    const source=await readFile(file,'utf8');
    if(source.includes(FINGERPRINT_PLACEHOLDER)){
      await writeFile(file,source.replaceAll(FINGERPRINT_PLACEHOLDER,fingerprint),'utf8');
    }
  }
}

async function stampRelease(destination,config){
  const indexPath=path.join(destination,'index.html');
  await writeFile(indexPath,stampHtml(await readFile(indexPath,'utf8'),config),'utf8');

  for(const relative of await walkFiles(destination)){
    if(runtimeForConfig(config)==='godot')break;
    if(!relative.endsWith('.js'))continue;
    const file=path.join(destination,relative);
    await writeFile(file,stampJavaScript(await readFile(file,'utf8'),config,relative),'utf8');
  }

  const fingerprint=await canonicalFingerprint(destination);
  await embedFingerprint(destination,fingerprint);

  const releasePath=path.join(destination,'release.json');
  await writeFile(releasePath,'{}\n','utf8');
  const files=await walkFiles(destination);
  await writeFile(releasePath,`${JSON.stringify({
    schemaVersion:2,
    slug:config.slug,
    version:config.version,
    fingerprint,
    releasedAt:config.releaseDateTime,
    files
  },null,2)}\n`,'utf8');
  return fingerprint;
}

await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of rootFiles)await cp(path.join(root,file),path.join(output,file));
await copyDirectoryFiltered(
  path.join(root,'shared'),
  path.join(output,'shared'),
  (name,entry)=>!entry.isDirectory()&&(name.endsWith('.ts')||name.endsWith('.map'))
);

const configs=await collectAppConfigs(root);
const fingerprints=new Map();
for(const config of configs){
  const source=path.join(root,'apps',config.slug);
  const destination=path.join(output,'apps',config.slug);
  if(runtimeForConfig(config)==='godot'){
    const generated=path.join(source,'web');
    try{await access(path.join(generated,'index.html'));}
    catch{throw new Error(`Godot app ${config.slug} has no committed web/index.html; run the Godot Web Runtime workflow before deployment`);}
    await copyDirectoryFiltered(generated,destination,name=>name.endsWith('.map'));
    await cp(path.join(source,'app.config.json'),path.join(destination,'app.config.json'));
    await splitOversizedGodotWasm(destination,config.slug,config.version);
  }else{
    await copyDirectoryFiltered(source,destination,name=>appDevEntries.has(name)||name.endsWith('.map'));
  }
  fingerprints.set(config.slug,await stampRelease(destination,config));
}

const registryPath=path.join('dist-site','apps.json');
const registrySource=await buildRegistry({root,outputPath:registryPath});
const registry=JSON.parse(registrySource).map(app=>({...app,fingerprint:fingerprints.get(app.slug)}));
await writeFile(path.join(root,registryPath),`${JSON.stringify(registry,null,2)}\n`,'utf8');
console.log(`Prepared coherent production site with ${configs.length} fingerprinted application release(s).`);
