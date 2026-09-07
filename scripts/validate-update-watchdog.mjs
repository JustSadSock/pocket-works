import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const [launcher,index,rootWorker,updateManager,enhancedUpdateManager,launcherSync,prepareSite,vetrolomWorker,vetrolomConfig]=await Promise.all([
  read('launcher-update-all-v3.js'),
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
const forbidToken=(source,token,label)=>{if(source.includes(token))errors.push(`${label} must not include ${token}`);};

for(const token of ['APP_TIMEOUT','withTimeout(installRelease','timedOut','skipped','UPDATE_CONCURRENCY=3','expectedFingerprint','pw-update-progress']){
  requireToken(launcher,token,'launcher fingerprint updater');
}
for(const token of ['workerInfoAttempt','GET_UPDATE_INFO','workerMatchesRelease','verifiedRegistrationIsCurrent','isLegacyLauncherWorker',"new URL('sw.js',scopeUrl)","updateViaCache:'none'",'await registration.update()']){
  requireToken(launcher,token,'launcher canonical worker updater');
}
for(const token of ["searchParams.set('pw_release'","searchParams.set('pw_fp'"]){
  forbidToken(launcher,token,'launcher canonical worker updater');
}
for(const source of [index,rootWorker,prepareSite])requireToken(source,'launcher-update-all-v3.js','launcher deployment');
for(const token of ['readStoredValue(seenKey)','alreadySeen','setStoredValue(seenKey, waitingInfo.version)'])requireToken(updateManager,token,'managed update seen-state');
for(const token of ['ENHANCED_UPDATE_SEEN_PREFIX','GET_UPDATE_INFO','resolveWaitingRegistration','targetVersion === options.version','SKIP_WAITING','writeSeenVersion(targetVersion)',"worker.state === 'activated'",'window.location.reload()']){
  requireToken(enhancedUpdateManager,token,'enhanced update target convergence');
}
for(const token of ['RELEASE_CURSOR_KEY','buildReleaseCursor','persistReleaseCursor(closedDigest.releaseCursor)','removeStored(LEGACY_REGISTRY_HISTORY_KEY)','removeStored(LEGACY_SEEN_DIGESTS_KEY)','remember: false, immediate: true'])requireToken(launcherSync,token,'launcher acknowledged-registry cursor');
for(const token of ['createHash','canonicalFingerprint','fingerprints.get(app.slug)'])requireToken(prepareSite,token,'release fingerprint build');
for(const token of ['AbortController','Promise.allSettled','caches.match(canonical)','RUNTIME_SHELL',"APP_VERSION='1.5.2'"])requireToken(vetrolomWorker,token,'Vetrolom worker');

const config=JSON.parse(vetrolomConfig);
if(config.version!=='1.5.2'||config.cacheName!=='vetrolom-v1.5.2')errors.push('Vetrolom config must match worker 1.5.2');
if(errors.length){
  console.error(`Update watchdog validation failed with ${errors.length} issue${errors.length===1?'':'s'}:`);
  errors.forEach(error=>console.error(`- ${error}`));
  process.exit(1);
}
console.log('Canonical worker convergence, enhanced target-version updates, managed seen-state, acknowledged registry cursor, bounded installs and Vetrolom resilient precache are valid.');
