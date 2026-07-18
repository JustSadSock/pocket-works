import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';
import { buildRegistry } from './build-registry.mjs';

const root=process.cwd();
const output=path.join(root,'dist-site');
const FINGERPRINT_PLACEHOLDER='__PW_RELEASE_FINGERPRINT__';
const rootFiles=[
  'index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js',
  'launcher-update-all.js','launcher-update-all-v2.js','launcher-update-all-v3.js','launcher-release-links.js','launcher-sync.js',
  'manifest.webmanifest','sw.js'
];
const appDevEntries=new Set(['package.json','vite.config.ts','tsconfig.json','README.md','source','public','.dist']);

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
  await copyDirectoryFiltered(source,destination,name=>appDevEntries.has(name)||name.endsWith('.map'));
  fingerprints.set(config.slug,await stampRelease(destination,config));
}

const registryPath=path.join('dist-site','apps.json');
const registrySource=await buildRegistry({root,outputPath:registryPath});
const registry=JSON.parse(registrySource).map(app=>({...app,fingerprint:fingerprints.get(app.slug)}));
await writeFile(path.join(root,registryPath),`${JSON.stringify(registry,null,2)}\n`,'utf8');
console.log(`Prepared coherent production site with ${configs.length} fingerprinted application release(s).`);
