import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {build} from 'vite';
const evidence=process.env.MOTION_EVIDENCE;if(!evidence)throw Error('MOTION_EVIDENCE required');
const root=path.join(evidence,'scene'),fixtures=fileURLToPath(new URL('./fixtures/',import.meta.url));
await fs.copyFile(path.join(fixtures,'scene.html'),path.join(root,'index.html'));
await build({configFile:false,build:{outDir:root,emptyOutDir:false,target:'es2022',lib:{entry:path.join(fixtures,'scene.mjs'),formats:['es'],fileName:()=> 'scene.js'},rolldownOptions:{output:{codeSplitting:false}}}});
const files=['./','index.html','scene.js',...((await fs.readdir(path.join(root,'assets'))).map(p=>`assets/${p}`))];
const cache=`motion-studio-${process.env.TESTED_SHA||'local'}`;
await fs.writeFile(path.join(root,'sw.js'),`const CACHE=${JSON.stringify(cache)},FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request))));`);
