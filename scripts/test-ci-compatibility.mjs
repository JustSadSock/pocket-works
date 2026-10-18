import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { partitionFindings } from './validation-debt.mjs';
import { canonicalManifest, canonicalWorker } from './sync-app-metadata.mjs';
import { localScripts, appOwnedScripts, hasWorkerRegistration, entrySources } from './pwa-entrypoints.mjs';
const old='apps/old/index.html must include data-app-shell';
const novel='apps/new/index.html must include data-app-shell';
assert.deepEqual(partitionFindings([old,novel,'apps/_template/broken'],[old,'apps/_template/broken']).regressions,[novel,'apps/_template/broken']);
assert.deepEqual(partitionFindings([],[old]).resolved,[old]);
const c={slug:'sample',version:'1.2.0',cacheName:'sample-v1.2.0',name:'Sample',shortName:'Sample',description:'A sample app',orientation:'portrait',backgroundColor:'#111111',themeColor:'#111111'};
const src="const CACHE='sample-v1.0.0';caches.open(CACHE);";
const worker=canonicalWorker(src,c);assert.ok(worker.includes("CACHE_NAME='sample-v1.2.0'"));assert.ok(worker.includes('caches.open(CACHE_NAME)'));assert.equal(canonicalWorker(worker,c),worker);
assert.throws(()=>canonicalWorker("const CACHE='other-v1';",c));
const manifest=canonicalManifest({icons:[{src:'icons/icon.svg'}]},c);assert.equal(manifest.id,'/apps/sample/');assert.equal(manifest.icons[0].src,'icons/icon.svg');
assert.deepEqual(localScripts('<script src="boot.js?build=2"></script><script src="https://cdn.example/app.js"></script>'),['./boot.js']);
assert.deepEqual(appOwnedScripts('<script src="js/ui.js"></script><script type="module" src="../../shared/update-manager.js"></script>'), ['./js/ui.js']);
assert.deepEqual(appOwnedScripts('<script src="../../shared/update-manager.js"></script>'), []);
assert.ok(hasWorkerRegistration("navigator.serviceWorker.register(`./sw.js?build=${version}`, {scope:'./'})",''));
assert.ok(hasWorkerRegistration("registerManagedServiceWorker({path:'./sw.js'})",''));
assert.ok(!hasWorkerRegistration("navigator.serviceWorker.register('./other.js')",''));
const root=await mkdtemp(path.join(os.tmpdir(),'pw-entry-'));
try {
 await writeFile(path.join(root,'boot.js'),"import './game.js';");await writeFile(path.join(root,'game.js'),"navigator.serviceWorker.register('./sw.js');");
 assert.ok(hasWorkerRegistration(await entrySources(root,'<script src="./boot.js"></script>'),''));
}finally{await rm(root,{recursive:true,force:true});}
console.log('CI compatibility: legacy ratchet rejects new/template defects, metadata is isolated and idempotent, real entrypoint graphs and managed registrations are validated.');
