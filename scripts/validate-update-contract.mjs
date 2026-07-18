import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';
const root=process.cwd(),errors=[];
const fail=message=>errors.push(message);
async function read(relative){try{return await readFile(path.join(root,relative),'utf8')}catch(error){fail(`${relative} could not be read: ${error.message}`);return''}}
function requireIncludes(source,fragments,label){for(const fragment of fragments)if(!source.includes(fragment))fail(`${label} must include ${fragment}`)}
function staticString(source,name){return source.match(new RegExp(String.raw`(?:const|let)\s+${name}\s*=\s*['"]([^'"]+)['"]`))?.[1]||null}
function staticArray(source,name){const match=source.match(new RegExp(String.raw`(?:const|let)\s+${name}\s*=\s*(\[[\s\S]*?\]);`));if(!match)return null;try{return Function(`"use strict";return(${match[1]})`)()}catch{return null}}
function eventBlock(source,name){const start=source.search(new RegExp(String.raw`(?:self\.)?addEventListener\(\s*['"]${name}['"]`));if(start<0)return'';const next=/(?:self\.)?addEventListener\(\s*['"][^'"]+['"]/g;next.lastIndex=start+1;return source.slice(start,next.exec(source)?.index??source.length)}
function workerVersion(source){return staticString(source,'APP_VERSION')||staticString(source,'BUILD')}
function validateMetadata(source,label,expected){const version=workerVersion(source),releaseDate=staticString(source,'RELEASE_DATE')||expected.releaseDate,releaseNotes=staticArray(source,'RELEASE_NOTES'),cacheName=staticString(source,'CACHE_NAME')||staticString(source,'CACHE');if(version!==expected.version)fail(`${label} version must equal ${expected.version}`);if(releaseDate!==expected.releaseDate)fail(`${label} release date must equal ${expected.releaseDate}`);if(cacheName!==expected.cacheName)fail(`${label} cache name must equal ${expected.cacheName}`);if(expected.changelog&&JSON.stringify(releaseNotes)!==JSON.stringify(expected.changelog))fail(`${label} release notes must match app.config.json changelog`)}
function validateQuickWorker(source,label,expected){requireIncludes(source,['GET_UPDATE_INFO','SKIP_WAITING','event.ports'],label);if(eventBlock(source,'install').includes('skipWaiting'))fail(`${label} must not activate during install`);validateMetadata(source,label,expected)}
function validateCoherentWorker(source,label,expected){requireIncludes(source,['GET_UPDATE_INFO','SKIP_WAITING',"cache:'no-store'",'REQUIRED','OPTIONAL'],label);validateMetadata(source,label,expected)}
function validateFresh(source,label,{passThroughApps=false}={}){requireIncludes(source,['CACHE_PROTOCOL','precacheFreshShell',"cache:'no-store'",'__pw_build','networkFirstFresh','SHELL_KEYS'],label);if(source.includes('cache.addAll('))fail(`${label} must not use cache.addAll`);const protocol=Number(source.match(/const CACHE_PROTOCOL\s*=\s*(\d+)/)?.[1]);if(!Number.isInteger(protocol)||protocol<2)fail(`${label} cache protocol must be at least 2`);if(passThroughApps)requireIncludes(source,['APPLICATIONS_PATH','startsWith(APPLICATIONS_PATH)'],label)}
function validateEnhanced(source,label,expected){requireIncludes(source,['precacheAndRoute','cleanupOutdatedCaches','GET_UPDATE_INFO','SKIP_WAITING'],label);validateMetadata(source,label,expected)}

const manager=await read('shared/update-manager.js');requireIncludes(manager,['registerManagedServiceWorker','GET_UPDATE_INFO','SKIP_WAITING','controllerchange','registration.update()'],'shared/update-manager.js');
const enhancedManager=await read('shared/enhanced-update-manager.ts');requireIncludes(enhancedManager,['virtual:pwa-register','registerEnhancedUpdate'],'shared/enhanced-update-manager.ts');
const packageJson=JSON.parse(await read('package.json')||'{}'),rootIndex=await read('index.html'),rootWorker=await read('sw.js');
requireIncludes(rootIndex,['./shared/update-manager.js','data-update-manager',`data-app-version="${packageJson.version}"`,`content="${packageJson.version}"`],'root index.html');
validateQuickWorker(rootWorker,'root sw.js',{version:packageJson.version,releaseDate:staticString(rootWorker,'RELEASE_DATE'),cacheName:`pocket-works-launcher-v${packageJson.version}`,changelog:staticArray(rootWorker,'RELEASE_NOTES')});
validateFresh(rootWorker,'root sw.js',{passThroughApps:true});

const templateWorker=await read('apps/_template/sw.js');requireIncludes(templateWorker,['GET_UPDATE_INFO','SKIP_WAITING'],'apps/_template/sw.js');validateFresh(templateWorker,'apps/_template/sw.js');
const configs=await collectAppConfigs(root);
for(const config of configs){const directory=`apps/${config.slug}`;if(runtimeForConfig(config)==='enhanced'){const main=await read(`${directory}/source/main.ts`),worker=await read(`${directory}/source/sw.ts`);requireIncludes(main,['registerEnhancedUpdate',`version: '${config.version}'`],`${directory}/source/main.ts`);validateEnhanced(worker,`${directory}/source/sw.ts`,config)}else{const index=await read(`${directory}/index.html`),worker=await read(`${directory}/sw.js`);if(config.slug==='blazon'){requireIncludes(index,['../../shared/update-manager.css'],`${directory}/index.html`);validateCoherentWorker(worker,`${directory}/sw.js`,config)}else{requireIncludes(index,['../../shared/update-manager.js','data-update-manager',`data-app-version="${config.version}"`],`${directory}/index.html`);validateQuickWorker(worker,`${directory}/sw.js`,config)}}}
if(errors.length){console.error(`Update contract validation failed with ${errors.length} issue(s):`);errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log(`Managed update contract passed for ${configs.length} application releases.`);
