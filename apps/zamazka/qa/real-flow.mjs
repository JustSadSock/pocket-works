#!/usr/bin/env node
// Real UI interaction, not injected HTML. Run: node apps/zamazka/qa/real-flow.mjs
// Wikimedia is replaced by a known tiny PNG; game code and controls stay real.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOsS3BjYGBgYmBgYGBgAAAOEgEomIcOWQAAAABJRU5ErkJggg==','base64');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const raw=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+raw,raw.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const body=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const port=web.address().port;
const browser=await chromium.launch({headless:true});
const screenshotDir=process.env.ZAMAZKA_QA_ARTIFACT_DIR;
let cases=0;
try{
 for(const viewport of [{width:1755,height:864},{width:390,height:844}]){
  const mobile=viewport.width<700;
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/upload\.wikimedia\.org|\.wikimedia\.org\//,route=>route.fulfill({
   status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png
  }));
  await page.goto('http://127.0.0.1:'+port+'/apps/zamazka/',{waitUntil:'domcontentloaded'});
  await page.locator('.museum-home').waitFor({timeout:16000});
  // Real settings: volume persists, and the slider value is reflected without reloading.
  await page.locator('#settingsBtn').click();
  await page.locator('#settingVolume').waitFor();
  await page.locator('#settingVolume').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#modalActions .btn.primary').click();
  const storedVolume=await page.evaluate(()=>localStorage.getItem('pocket-works:zamazka:sound-volume'));
  assert.equal(storedVolume,'35','Sound level was not persisted');
  await page.locator('#settingsBtn').click();
  assert.equal(await page.locator('#settingVolume').inputValue(),'35');
  await page.locator('#modalActions .btn.ghost').click();
  const primary=page.locator('#primary-action');
  assert.equal(await primary.getAttribute('data-action'),'create','cooperative mode must be primary');
  await page.locator('[data-action="practice"]').click();
  await page.locator('#soloDrawingSeconds').selectOption('0');
  await page.locator('#modalActions .btn.primary').click();
  await page.locator('.mobile-preview .gallery .picture').first().waitFor({timeout:17000});
  assert.equal(await page.locator('.mobile-preview .gallery .picture').count(),5);
  await page.locator('[data-action="skip"]').click();
  const brush=page.locator('[data-tool="brush"]');
  await brush.waitFor();
  await page.locator('[data-tool="hand"]').click();
  assert.equal(await page.locator('.restore').getAttribute('data-active-tool'),'hand');
  await brush.click();
  assert.equal(await page.locator('.restore').getAttribute('data-active-tool'),'brush');
  await page.locator('#brushSize').evaluate(el=>{el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}))});
  const sample=await page.locator('#sizeSample').boundingBox();
  assert(sample?.width>=26,'Brush preview container was hidden');
  const inkWidth=await page.locator('#sizeSample').evaluate(el=>getComputedStyle(el).getPropertyValue('--nib').trim());
  assert.equal(inkWidth,'20px','Brush preview did not react to slider input');
  const board=page.locator('#paintCanvas');
  await board.waitFor({timeout:10000});
  await page.waitForTimeout(450);
  const viewportRect=await page.locator('.restore .viewport').boundingBox();
  assert(viewportRect?.width>100&&viewportRect?.height>100,'working canvas visible');
  // Drag on the center of the damage-centered viewport. The gesture must
  // affect a real Editor instance rather than a decorative preview.
  const cx=viewportRect.x+viewportRect.width/2,cy=viewportRect.y+viewportRect.height/2;
  await page.mouse.move(cx-14,cy-12);await page.mouse.down();
  await page.mouse.move(cx+18,cy+13,{steps:10});await page.mouse.up();
  await page.waitForTimeout(150);
  const indicator=await page.locator('#strokeCount').textContent();
  assert(/Мазков: [1-9]/.test(indicator), 'editor failed to record real pointer stroke: '+indicator);
  await page.locator('[data-action="submit"]').click();
  await page.locator('.reveal-phase').waitFor({timeout:11000});
  await page.locator('.reveal-phase.is-composed').waitFor({timeout:12000});
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.exhibition-exit-layer').count(),0,'Old phase was not cleaned up');
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-reveal-'+viewport.width+'.png'),fullPage:false});
  await page.locator('[data-action="menu"]').first().click();
  await page.locator('[data-action="collection"]').click();
  await page.locator('.archive-work').first().waitFor({timeout:7500});
  const dl=page.waitForEvent('download',{timeout:8000});
  await page.locator('[data-action="export-archive"]').click();
  const file=await dl;
  assert(/zamazka-archive-\d{4}-\d\d-\d\d\.json$/.test(file.suggestedFilename()));
  assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
  cases++;
  console.log('OK live UI '+viewport.width+'x'+viewport.height+': solo preview → stroke → reveal → archive export');
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>web.close(resolve))}
assert.equal(cases,2);
