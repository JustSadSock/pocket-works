import { readFile } from 'node:fs/promises';

const files={
  index:await readFile('index.html','utf8'),
  updater:await readFile('launcher-update-all-v3.js','utf8'),
  links:await readFile('launcher-release-links.js','utf8'),
  guard:await readFile('shared/release-guard.js','utf8'),
  updateManager:await readFile('shared/update-manager.js','utf8'),
  prepare:await readFile('scripts/prepare-site.mjs','utf8'),
  blazonEngine:await readFile('apps/blazon/engine.js','utf8'),
  blazonBootstrap:await readFile('apps/blazon/bootstrap.js','utf8'),
  progressionRuntime:await readFile('apps/blazon/progression-runtime.js','utf8'),
  compositionRuntime:await readFile('apps/blazon/armorial-composition-runtime.js','utf8')
};
const errors=[];
const requireToken=(file,token,label)=>{if(!files[file].includes(token))errors.push(`${label} missing ${token}`);};

requireToken('index','launcher-update-all-v3.js','launcher entry');
requireToken('index','launcher-release-links.js','launcher entry');
requireToken('updater','expectedFingerprint','fingerprint updater');
requireToken('updater','pw_fp','fingerprint updater');
requireToken('updater','pw-update-progress','update progress');
requireToken('links','fingerprint','versioned launch links');
requireToken('guard','checkLatest','release guard');
requireToken('guard','release.json','release guard');
requireToken('updateManager','__POCKET_WORKS_RELEASE__','managed update handoff');
requireToken('updateManager','getRegistration','managed update handoff');
requireToken('prepare','createHash','production fingerprinting');
requireToken('prepare','canonicalFingerprint','production fingerprinting');
requireToken('prepare','fingerprints.get(app.slug)','registry fingerprinting');
requireToken('blazonBootstrap','requestAnimationFrame','Blazon startup boundary');
requireToken('progressionRuntime','requestAnimationFrame','Blazon progression runtime');
requireToken('progressionRuntime','allowNativeSeal','Blazon native seal transition');
requireToken('progressionRuntime',"addEventListener('close'",'Blazon seal cleanup');
requireToken('compositionRuntime','requestAnimationFrame','Blazon composition runtime');

const guardedHandoff=files.updateManager.indexOf('__POCKET_WORKS_RELEASE__');
const directRegistration=files.updateManager.indexOf('navigator.serviceWorker.register(path)');
if(guardedHandoff<0||directRegistration<0||guardedHandoff>directRegistration)errors.push('Managed update handoff must run before direct Service Worker registration');
if(files.updater.includes('verifyServerRelease'))errors.push('Updater must not reread HTML, config and worker source per application');
if(files.guard.includes('XMLHttpRequest'))errors.push('Release guard must not block startup with synchronous XHR');
if(files.progressionRuntime.includes('queueMicrotask'))errors.push('Progression runtime must not create a microtask mutation loop');
if(files.progressionRuntime.includes('button.click()'))errors.push('Progression runtime must not recursively synthesize the charter seal click');
if(files.compositionRuntime.includes('queueMicrotask'))errors.push('Composition runtime must not create a microtask mutation loop');
if(files.progressionRuntime.includes("observe(document.body"))errors.push('Progression runtime must observe only owned containers');
if(files.compositionRuntime.includes("observe(document.body"))errors.push('Composition runtime must observe only owned containers');
if(files.progressionRuntime.includes('.menu-screen footer'))errors.push('Progression runtime must not rewrite the release footer');
if(files.compositionRuntime.includes('.menu-screen footer'))errors.push('Composition runtime must not rewrite the release footer');
if(files.blazonEngine.includes('menu-input-hotfix.js'))errors.push('Blazon engine must not load optional UI modules');

if(errors.length){
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Fingerprint release, managed update handoff and Blazon event-loop coherence contracts passed.');
