import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {missions,route} from '../core.mjs';
const origin='https://pocket-works.illya07kov.workers.dev', path='/apps/echolot/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchOK(relative){const r=await fetch(origin+relative,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,relative);assert.equal(new URL(r.url).origin,origin);return r}
async function probe(){
const html=await (await fetchOK(path)).text();assert.ok(html.includes('ЭХОЛОТ')&&html.includes('id="radar"'));
const reg=await(await fetchOK('/apps.json')).json();const entry=(Array.isArray(reg)?reg:reg.apps).find(a=>a.slug==='echolot');assert.equal(entry?.version,'1.0.0');
const release=await(await fetchOK(path+'release.json')).json();assert.equal(release.slug,'echolot');assert.equal(release.version,'1.0.0');
const manifest=await(await fetchOK(path+'manifest.webmanifest')).json();assert.equal(manifest.id,path);
const js=await(await fetchOK(path+'app.js')).text();assert.ok(js.includes('renderRadar')&&js.includes('echolot'));
const css=await(await fetchOK(path+'styles.css')).text();assert.ok(css.includes('.scope')&&css.includes('.pulse'));
const core=await(await fetchOK(path+'core.mjs')).text();assert.ok(core.includes('export function transition'));
await fetchOK(path+'sw.js');await fetchOK(path+'icons/icon.svg');
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));const res=await page.goto(origin+path,{waitUntil:'domcontentloaded'});assert.equal(res.status(),200);await page.locator('#scan').waitFor();await page.waitForFunction(()=>document.querySelector('#radar svg, #radar circle'));
await page.locator('#scan').click();await page.waitForFunction(()=>document.querySelector('#oxygen').value===67);let pos=missions[0].home;
for(const dest of [...missions[0].samples,missions[0].home]){for(const a of route(missions[0],pos,dest)){await page.locator('[data-move="'+a.dx+','+a.dy+'"]').click();pos=[pos[0]+a.dx,pos[1]+a.dy]}}
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Стыковка'));
assert.equal(await page.locator('#samples').textContent(),'3 / 3');assert.equal(await page.locator('#next').isEnabled(),true);
await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Стыковка'));assert.deepEqual(errors,[]);
console.log('PRODUCTION VERIFIED: HTTP 200; launcher registry 1.0.0; release 1.0.0; HTML, JS, CSS, manifest, SW, icon; browser mission, reload persistence; '+origin+path);
}finally{await browser.close()}}
let failure;for(let attempt=1;attempt<=12;attempt++){try{await probe();process.exit(0)}catch(e){failure=e;console.error('Attempt '+attempt+': '+e.message);if(attempt<12)await sleep(15000)}}throw failure;
