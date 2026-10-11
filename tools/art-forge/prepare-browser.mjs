import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const directory=process.env.ART_FORGE_EVIDENCE;
if(!directory)throw Error('ART_FORGE_EVIDENCE must name a fresh smoke evidence directory');
const fixtures=fileURLToPath(new URL('./fixtures/',import.meta.url));
for(const state of ['before','after']){
 const root=path.join(directory,state);
 await fs.copyFile(path.join(fixtures,'scene.html'),path.join(root,'index.html'));
 await build({configFile:false,build:{outDir:root,emptyOutDir:false,target:'es2022',lib:{entry:path.join(fixtures,'scene.mjs'),formats:['es'],fileName:()=> 'scene.js'},rolldownOptions:{output:{codeSplitting:false}}}});
 const index=JSON.parse(await fs.readFile(path.join(root,'assets/forge-index.json'),'utf8'));
 const files=['./','index.html','scene.js',...index.assets.flatMap(a=>Object.values(a.outputs).filter(o=>o.url).map(o=>o.url)),'assets/forge-index.json'];
 const cache=`art-forge-${state}-${index.manifestSha256}`;
 await fs.writeFile(path.join(root,'sw.js'),`const CACHE=${JSON.stringify(cache)};const FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request))));`);
}
