import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {levels,solve,pieces} from '../core.mjs';
const origin='https://pocket-works.illya07kov.workers.dev',path='/apps/pereves/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(relative){const r=await fetch(origin+relative,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,relative+' HTTP '+r.status);assert.equal(new URL(r.url).origin,origin);return r}
async function probe(){
const html=await(await get(path)).text();assert.ok(html.includes('Перевес')&&html.includes('id="mobile"'));
const registry=await(await get('/apps.json')).json();assert.equal((Array.isArray(registry)?registry:registry.apps).find(x=>x.slug==='pereves')?.version,'1.0.0');
const release=await(await get(path+'release.json')).json();assert.equal(release.slug,'pereves');assert.equal(release.version,'1.0.0');
const config=await(await get(path+'app.config.json')).json();assert.equal(config.cacheName,'pereves-v1.0.0');
const manifest=await(await get(path+'manifest.webmanifest')).json();assert.equal(manifest.id,path);assert.equal(manifest.display,'standalone');
for(const [file,marker] of [['app.js','function render()'],['core.mjs','export function evaluate'],['styles.css','@keyframes balance'],['sw.js','pereves-v1.0.0'],['icons/icon.svg','<svg']]){const body=await(await get(path+file)).text();assert.ok(body.includes(marker),file+' content mismatch');console.log('HTTP 200 '+file)}
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));const response=await page.goto(origin+path,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await page.locator('#tray button').first().waitFor();
for(let i=0;i<levels.length;i++){const l=levels[i],solution=solve(l),ps=pieces(l);await page.locator('#level-list button').nth(i).click();for(const [id,slot] of Object.entries(solution)){const j=ps.findIndex(w=>w.id===id);await page.locator('#tray button').nth(j).click();await page.locator('[data-beam="'+ps[j].beam+'"][data-slot="'+slot+'"]').click();}await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Скульптура собрана'));console.log('Production level '+(i+1)+' solved: '+l.name);}
await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Скульптура собрана'));assert.equal(await page.locator('#level-list button').nth(3).getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'horizontal overflow');console.log('PRODUCTION VERIFIED: HTTP 200; registry 1.0.0; release 1.0.0; assets; four browser levels; reload persistence; no page errors; '+origin+path);
}finally{await browser.close()}}
let error;for(let i=1;i<=18;i++){try{await probe();process.exit(0)}catch(e){error=e;console.error('Attempt '+i+': '+e.message);if(i<18)await sleep(15000)}}throw error;
