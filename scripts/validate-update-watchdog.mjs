import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const [launcher,launcherApp,index,rootWorker,updateManager,enhancedUpdateManager,launcherSync,prepareSite,vetrolomWorker,vetrolomConfig]=await Promise.all([
  read('launcher-update-all-v3.js'),
  read('app.js'),
  read('index.html'),
  read('sw.js'),
  read('shared/update-manager.js'),
  read('shared/enhanced-update-manager.ts'),
  read('launcher-sync.js'),
  read('scripts/prepare-site.mjs'),
  read('apps/vetrolom/sw.js'),
  read('apps/vetrolom/app.config.json')
]);
const errors=[];
const requireToken=(source,token,label)=>{if(!source.includes(token))errors.push(`${label} must include ${token}`);};

for(const token of ['APP_TIMEOUT','UPDATE_CHECK_TIMEOUT','withTimeout(runBulkUpdate','UPDATE_CONCURRENCY=3','expectedFingerprint','pw-update-progress','collectInstalledTargets','navigator.serviceWorker.getRegistrations()','registration.update()','workerInfo','on-demand','pocketworks:registry-snapshot',"source:'bulk-update'"]){
  requireToken(launcher,token,'launcher installed-app updater');
}
if(launcher.includes('navigator.serviceWorker.register('))errors.push('launcher Sync must not register Service Workers for applications that are not already installed');
if(launcher.includes("workerUrl.searchParams.set('pw_release'")||launcher.includes("workerUrl.searchParams.set('pw_fp'"))errors.push('launcher Sync must not encode release identity into Service Worker script URLs');
for(const token of ['pocketworks:registry-snapshot','applyExternalRegistrySnapshot']){
  requireToken(launcherApp,token,'launcher live registry handoff');
}
for(const source of [index,rootWorker,prepareSite])requireToken(source,'launcher-update-all-v3.js','launcher deployment');
for(const token of ['readStoredValue(seenKey)','alreadySeen','setStoredValue(seenKey, waitingInfo.version)'])requireToken(updateManager,token,'managed update seen-state');
for(const token of ['__POCKET_WORKS_RELEASE__','coherentRelease?.verified','return async () => {}','registerSW({'])requireToken(enhancedUpdateManager,token,'enhanced release-guard handoff');
const enhancedHandoff=enhancedUpdateManager.indexOf('coherentRelease?.verified');
const enhancedRegistration=enhancedUpdateManager.indexOf('registerSW({');
if(enhancedHandoff<0||enhancedRegistration<0||enhancedHandoff>enhancedRegistration)errors.push('enhanced release-guard handoff must run before vite-plugin-pwa registration');
for(const token of ['RELEASE_CURSOR_KEY','buildReleaseCursor','persistReleaseCursor(closedDigest.releaseCursor)','removeStored(LEGACY_REGISTRY_HISTORY_KEY)','removeStored(LEGACY_SEEN_DIGESTS_KEY)','remember: false, immediate: true','pocketworks:registry-snapshot','publishRegistrySnapshot(nextApps)'])requireToken(launcherSync,token,'launcher acknowledged-registry cursor');
if(launcherSync.includes('requestLauncherRefresh')||launcherSync.includes('refreshButton.click()'))errors.push('launcher registry sync must hand live registry data directly to app.js instead of synthesizing the Update button');
for(const token of ['createHash','canonicalFingerprint','fingerprints.get(app.slug)'])requireToken(prepareSite,token,'release fingerprint build');
for(const token of ['AbortController','Promise.allSettled','caches.match(canonical)','RUNTIME_SHELL',"APP_VERSION='1.5.2'"])requireToken(vetrolomWorker,token,'Vetrolom worker');

const config=JSON.parse(vetrolomConfig);
if(config.version!=='1.5.2'||config.cacheName!=='vetrolom-v1.5.2')errors.push('Vetrolom config must match worker 1.5.2');
if(errors.length){
  console.error(`Update watchdog validation failed with ${errors.length} issue${errors.length===1?'':'s'}:`);
  errors.forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}
console.log('Release-guard ownership, installed-app-only Sync, managed seen-state, acknowledged registry cursor and Vetrolom resilient precache are valid.');
