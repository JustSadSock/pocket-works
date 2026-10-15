#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';
import {DEBUG_SCREENS} from '../debug-gallery.js';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+name,name.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return}
 try{const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes)}
 catch{if(!res.headersSent)res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/apps/zamazka/';
const out=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-debug-gallery');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
let tested=0;
try{
 for(const {name,w,h} of [
  {name:'desktop',w:1366,h:640},
  {name:'mobile-pwa',w:390,h:844},
  {name:'landscape',w:844,h:390}
 ]){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:w<700,hasTouch:w<900,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('.museum-home').waitFor({timeout:20000});
  await page.evaluate(()=>localStorage.setItem('zam-debug-test-canary','never-change'));
  await page.keyboard.press('Backquote');
  const gallery=page.locator('#zamazkaDebugGallery');
  await gallery.waitFor({timeout:10000});
  assert.equal(await gallery.locator('[data-debug-select]').count(),DEBUG_SCREENS.length);
  const preview=page.frameLocator('#zamazkaDebugGallery iframe');
  await preview.locator('#screen[data-debug-preview="home"]').waitFor({timeout:20000});
  const menu=await gallery.locator('.zam-debug-nav').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top}});
  assert(menu.x<25&&menu.y<50,name+' debug menu is not in upper left');
  for(const entry of DEBUG_SCREENS){
   if(w<700&&await gallery.evaluate(el=>el.classList.contains('is-collapsed')))await gallery.locator('[data-debug-reopen]').click();
   const action=gallery.locator('[data-debug-select="'+entry.id+'"]');
   await action.click();
   await preview.locator('#screen[data-debug-preview="'+entry.id+'"]').waitFor({timeout:16000});
   await preview.locator('#screen[data-debug-preview="'+entry.id+'"] > *').first().waitFor({state:'visible',timeout:16000});
   await page.waitForTimeout(['results','verdict','awards'].includes(entry.id)?750:190);
   const mounted=await preview.locator('#screen').evaluate(el=>({
    children:el.childElementCount,stage:el.dataset.debugPreview,
    width:el.firstElementChild?.getBoundingClientRect().width,
    height:el.firstElementChild?.getBoundingClientRect().height,
    buttons:el.querySelectorAll('button').length
   }));
   assert(mounted.children>0&&mounted.width>150&&mounted.height>80,name+' '+entry.id+' missing stage '+JSON.stringify(mounted));
   if(entry.id==='round-review'){
    assert.equal(await preview.locator('[data-review-open]').count(),5,'Debug exhibition must show five restored works');
    assert.equal(await preview.locator('.round-art-card .zam-exhibit-plaque').count(),5,'Every restoration has a real hanging museum plate');
   }
   if(['preview','voting','voting-wait'].includes(entry.id)){
    assert.equal(await preview.locator('.zam-exhibit-plaque').count(),5,'All original paintings have the same museum plate');
   }
   if(['waiting','reveal','solo-reveal'].includes(entry.id)){
    const geometry=await preview.locator('#unveilStage').evaluate(stage=>{
      const range=stage.closest('.phase-page')?.querySelector('#unveilRange');
      if(!range)return null;
      range.value='23';range.dispatchEvent(new Event('input',{bubbles:true}));
      return {split:stage.style.getPropertyValue('--split'),
        fade:getComputedStyle(stage.querySelector('.unveil-top')).transitionDuration,
        ruler:getComputedStyle(stage.querySelector('.unveil-ruler')).transitionDuration,
        clip:getComputedStyle(stage.querySelector('.unveil-top')).clipPath};
    });
    assert(geometry&&geometry.split==='23%'&&geometry.fade==='0s'&&geometry.ruler==='0s'&&geometry.clip.includes('23%'),
      'The separator and bitmap must follow the comparison thumb without latency: '+JSON.stringify(geometry));
   }
   assert.equal(await page.locator('#screen>.museum-home').count(),1,'Parent match replaced by debug frame');
   assert.equal(await page.evaluate(()=>localStorage.getItem('zam-debug-test-canary')),'never-change');
   const disabledClose=await page.locator('.zam-debug-list .is-active').textContent();
   assert.equal(disabledClose,entry.name,'Wrong active stage label');
   if(w!==844||['home','drawing','results','settings-brushes'].includes(entry.id)){
    await page.screenshot({path:join(out,name+'-'+entry.id+'.png'),fullPage:false});
   }
   console.log(name+' '+entry.id+' preview OK');
   tested++;
  }
  // Never let a mock action accidentally submit/leave the real room.
  if(w<700)await gallery.locator('[data-debug-reopen]').click();
  await gallery.locator('[data-debug-select="drawing"]').click();
  await preview.locator('#screen[data-debug-preview="drawing"]').waitFor();
  await preview.locator('[data-action="submit"]').click();
  assert.equal(await preview.locator('#screen[data-debug-preview="drawing"]').count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('zam-debug-test-canary')),'never-change');
  // Keyboard inside the iframe closes the gallery via validated same-origin message.
  await preview.locator('#screen').press('Backquote');
  await gallery.waitFor({state:'detached',timeout:8000});
  assert.equal(await page.locator('#screen>.museum-home').count(),1);
  // Open again and verify explicit close + collapsed navigator work.
  await page.keyboard.press('Backquote');
  await gallery.waitFor();
  await gallery.locator('[data-debug-collapse]').click();
  assert(await gallery.evaluate(el=>el.classList.contains('is-collapsed')));
  await gallery.locator('[data-debug-reopen]').click();
  assert(!await gallery.evaluate(el=>el.classList.contains('is-collapsed')));
  await gallery.locator('[data-debug-close]').click();
  await gallery.waitFor({state:'detached'});
  // Reject app errors; absent public art assets may fail to load but not throw.
  assert.deepEqual(errors,[],'Page runtime error '+name+': '+JSON.stringify(errors));
  await context.close();
 }
 console.log('ZAMAZKA: '+tested+' screen previews on three viewports, keyboard toggling, parent preservation and controls OK');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
