import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';
import { buildRegistry } from './build-registry.mjs';

const root=process.cwd();
const output=path.join(root,'dist-site');
const rootFiles=['index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js','launcher-update-all.js','launcher-update-all-v2.js','launcher-update-all-v3.js','launcher-release-links.js','launcher-sync.js','manifest.webmanifest','sw.js'];
const appDevEntries=new Set(['package.json','vite.config.ts','tsconfig.json','README.md','source','public','.dist']);

async function copyDirectoryFiltered(source,destination,shouldSkip){
  await mkdir(destination,{recursive:true});
  const entries=await readdir(source,{withFileTypes:true});
  for(const entry of entries){
    if(shouldSkip(entry.name,entry))continue;
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    if(entry.isDirectory())await copyDirectoryFiltered(from,to,shouldSkip);else await cp(from,to);
  }
}

function addReleaseParam(value,version){
  if(!value||value.startsWith('#')||/^(?:https?:|data:|mailto:|tel:|blob:)/i.test(value))return value;
  const hashIndex=value.indexOf('#');
  const hash=hashIndex>=0?value.slice(hashIndex):'';
  const withoutHash=hashIndex>=0?value.slice(0,hashIndex):value;
  const [pathname,query='']=withoutHash.split('?');
  if(!/\.(?:js|mjs|css|json|webmanifest|svg|png|jpe?g|webp|gif|woff2?|mp3|ogg|wav)$/i.test(pathname))return value;
  const params=new URLSearchParams(query);params.set('pw_release',version);
  return `${pathname}?${params}${hash}`;
}

function stampHtml(source,config){
  let html=source
    .replace(/\s*<meta name="pocket-works-release"[^>]*>/g,'')
    .replace(/\s*<script[^>]+data-pw-release[^>]*><\/script>/g,'');
  html=html.replace(/\b(src|href)="([^"]+)"/g,(match,attribute,value)=>`${attribute}="${addReleaseParam(value,config.version)}"`);
  if(config.slug==='blazon'){
    html=html.replace(/<script\s+type="module"\s+src="\.\/app\.js[^"]*"><\/script>/,'<script src="./bootstrap.js?pw_release='+config.version+'"></script>');
    html=html.replace(/<footer>[^<]*<\/footer>/,'<footer>v'+config.version+' · coherent release · загрузка</footer>');
  }
  const injection=`\n  <meta name="pocket-works-release" content="${config.version}">\n  <script src="../../shared/release-guard.js?pw_release=${config.version}" data-pw-release="${config.version}" data-pw-slug="${config.slug}"></script>`;
  return html.replace(/<head>/i,`<head>${injection}`);
}

function stampSpecifier(specifier,version){
  if(!specifier.startsWith('./')&&!specifier.startsWith('../'))return specifier;
  const hashIndex=specifier.indexOf('#'),hash=hashIndex>=0?specifier.slice(hashIndex):'';
  const clean=hashIndex>=0?specifier.slice(0,hashIndex):specifier;
  const [pathname,query='']=clean.split('?');
  if(!/\.m?js$/i.test(pathname))return specifier;
  const params=new URLSearchParams(query);params.set('pw_release',version);
  return `${pathname}?${params}${hash}`;
}

function stampJavaScript(source,config,relativePath){
  let output=source
    .replace(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1/g,(match,quote,specifier)=>`from ${quote}${stampSpecifier(specifier,config.version)}${quote}`)
    .replace(/\bimport\s+(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1/g,(match,quote,specifier)=>`import ${quote}${stampSpecifier(specifier,config.version)}${quote}`)
    .replace(/\bimport\s*\(\s*(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1\s*\)/g,(match,quote,specifier)=>`import(${quote}${stampSpecifier(specifier,config.version)}${quote})`);
  if(config.slug==='blazon'&&relativePath==='progression-engine.js'){
    output=output.replace(/['"]\.\/engine\.js\?core=[^'"]+['"]/,'\'./core-engine.js?pw_release='+config.version+'\'');
  }
  return output;
}

async function walkFiles(directory,prefix=''){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=path.posix.join(prefix,entry.name);
    if(entry.isDirectory())files.push(...await walkFiles(path.join(directory,entry.name),relative));else files.push(relative);
  }
  return files.sort();
}

async function stampRelease(destination,config){
  const indexPath=path.join(destination,'index.html');
  const html=await readFile(indexPath,'utf8');
  await writeFile(indexPath,stampHtml(html,config),'utf8');
  for(const relative of await walkFiles(destination)){
    if(!relative.endsWith('.js')||relative==='sw.js')continue;
    const file=path.join(destination,relative),source=await readFile(file,'utf8');
    await writeFile(file,stampJavaScript(source,config,relative),'utf8');
  }
  const releasePath=path.join(destination,'release.json');
  await writeFile(releasePath,'{}\n','utf8');
  const files=await walkFiles(destination);
  await writeFile(releasePath,`${JSON.stringify({schemaVersion:1,slug:config.slug,version:config.version,releasedAt:config.releaseDateTime,files},null,2)}\n`,'utf8');
}

await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of rootFiles)await cp(path.join(root,file),path.join(output,file));
await copyDirectoryFiltered(path.join(root,'shared'),path.join(output,'shared'),(name,entry)=>!entry.isDirectory()&&(name.endsWith('.ts')||name.endsWith('.map')));
const configs=await collectAppConfigs(root);
for(const config of configs){
  const source=path.join(root,'apps',config.slug),destination=path.join(output,'apps',config.slug);
  await copyDirectoryFiltered(source,destination,name=>appDevEntries.has(name)||name.endsWith('.map'));
  await stampRelease(destination,config);
}
await buildRegistry({root,outputPath:path.join('dist-site','apps.json')});
console.log(`Prepared coherent production site with ${configs.length} stamped application release(s).`);
