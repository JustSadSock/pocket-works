#!/usr/bin/env node
// Real Chromium regression for the sandboxed NTG screen inspector.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const path=statSync(file).isDirectory()?join(file,'index.html'):file;
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(path));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const origin='http://127.0.0.1:'+server.address().port;
 const ids=['home','library','trim','room','room-offline','editor','editor-rec','editor-fx','wait','premiere','premiere-export'];
 for(const viewport of [{width:1366,height:800},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const errors=[],roomCalls=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/pocketnet/**',route=>{roomCalls.push(route.request().url());return route.abort()});
  await page.route('https://**/*',route=>route.abort());
  await page.goto(origin+'/apps/ne-tem-golosom/?debug=1',{waitUntil:'domcontentloaded'});
  await page.locator('.ntg-debug-overlay').waitFor();
  assert.equal(await page.locator('[data-debug-page]').count(),11);
  const preview=page.frameLocator('.ntg-debug-device-shell iframe');
  for(const id of ids){
   await page.locator('[data-debug-page="'+id+'"]').click();
   const screen=id.startsWith('room')?'room':id.startsWith('editor')?'editor':id.startsWith('premiere')?'premiere':id;
   await preview.locator('#screen-'+screen).waitFor();
   assert.equal(await preview.locator('#screen-'+screen).isVisible(),true,id+' preview visible');
  }
  await page.locator('[data-debug-device="phone"]').click();
  assert.equal(await page.locator('[data-debug-device-shell]').getAttribute('data-device'),'phone');
  // The device shell has a short width transition; inspect its settled size.
  await page.waitForFunction(()=>{
   const el=document.querySelector('.ntg-debug-device-shell iframe');
   const width=el?.getBoundingClientRect().width||0;
   return width>=380&&width<=402;
  },null,{timeout:3000});
  await page.locator('[data-debug-device="desktop"]').click();
  // The interactive mode runs the actual app with a local mocked room.
  await page.locator('[data-debug-live]').click();
  assert.equal(await page.locator('[data-debug-live]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-debug-page="room"]').click();
  await preview.locator('#room-change-scene:not(.hidden)').click();
  await preview.locator('[data-scene="wing-launch"]').click();
  await preview.locator('#confirm-scene').click();
   await preview.locator('input[name="film-sound-choice"][value="original"]').check();
   await preview.locator('#confirm-scene').click();
   await preview.locator('#film-review:not(.hidden)').waitFor();
   await preview.locator('#confirm-scene').click();
  await preview.locator('#room-start:not(:disabled)').click();
  await preview.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await preview.locator('#record-btn').isEnabled(),true,'real record control reachable from debug room');
  await page.locator('[data-debug-live]').click();
  assert.equal(await page.locator('[data-debug-live]').getAttribute('aria-pressed'),'false');
  await page.locator('[data-debug-close]').click();
  assert.equal(await page.locator('.ntg-debug-overlay').count(),0);
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('.ntg-debug-overlay').count(),1,'hardware shortcut opens inspector');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ntg-debug-overlay').count(),0,'Escape closes inspector');
  assert.equal(await page.locator('#screen-home').isVisible(),true,'real app remains on its original screen');
  assert.equal(roomCalls.length,0,'QA screen browsing must not connect to PocketNet');
  assert.deepEqual(errors,[],'no unhandled browser exceptions');
  await page.close();
 }
 console.log('NTG screen inspector: 11 visual states x desktop/mobile, URL/keyboard, isolation OK');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
