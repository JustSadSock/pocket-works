import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';

// Run: node apps/art-cabinet/qa/mobile-smoke.mjs. MediaWiki responses are mocked.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const abs=resolve(root,'.'+pathname);
  if(!abs.startsWith(root+'/')){res.writeHead(403);res.end();return}
  const file=abs.endsWith('/')?abs+'index.html':abs;
  const body=await readFile(file);
  res.writeHead(200,{'content-type':(mime[extname(file)]||'application/octet-stream')+'; charset=utf-8','cache-control':'no-store'});res.end(body)
 }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1440,height:900}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.route(/https:\/\/en\.wikipedia\.org\/w\/api\.php/,route=>{
   const titles=new URL(route.request().url()).searchParams.get('titles').split('|');
   const pages=titles.map((title,i)=>({pageid:300+i,title,thumbnail:{source:'https://thumb.wikimedia.org/test/'+encodeURIComponent(title)+'.svg'}}));
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({query:{pages}})})
  });
  await context.route('https://thumb.wikimedia.org/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="850"><rect width="640" height="850" fill="#c59b6e"/><circle cx="320" cy="285" r="100" fill="#eee0b5"/></svg>'}));
  await context.route(/https:\/\/commons\.wikimedia\.org\/wiki\/Special:Redirect\/file\//,route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="850"><rect width="640" height="850" fill="#c59b6e"/></svg>'}));
  await context.route(/https:\/\/commons\.wikimedia\.org\/w\/api\.php/,route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({query:{pages:[]}})}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/apps/art-cabinet/',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.locator('html').getAttribute('data-art-cabinet-ready')).toBe('3');
  await expect(page.locator('.work')).toHaveCount(12);
  await expect(page.locator('.work[data-id="1"] .work-name')).toHaveText('Звёздная ночь');
  await expect(page.locator('#selectedCount')).toHaveText('0');
  await expect.poll(()=>page.locator('.work[data-id="1"] img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  if(viewport.width<=760){
   const before=await page.evaluate(()=>({client:innerHeight,scrollHeight:document.documentElement.scrollHeight,style:getComputedStyle(document.body).overflowY}));
   assert.ok(before.scrollHeight>before.client+250,'body must be taller than screen for real scrolling');
   assert.notEqual(before.style,'hidden','phone body must be scrollable');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),'no unnecessary horizontal page scroll');
   await page.evaluate(()=>window.scrollTo(0,500));
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
   const width=await page.locator('.work[data-id="1"] .work-visual').evaluate(el=>el.getBoundingClientRect().width);
   assert.ok(width>viewport.width*.78,'art fills most of the phone');
  }else{
   const region=page.locator('#galleryScroll');
   await expect.poll(()=>region.evaluate(el=>el.scrollHeight>el.clientHeight)).toBeTruthy();
   await region.evaluate(el=>{el.scrollTop=260});
   await expect.poll(()=>region.evaluate(el=>el.scrollTop)).toBeGreaterThan(80);
  }
  await page.locator('.work[data-id="1"] .work-pick').click();
  await expect(page.locator('#selectedCount')).toHaveText('1');
  await page.locator('[data-filter="picked"]').click();
  await expect(page.locator('.work')).toHaveCount(1);
  await page.locator('[data-filter="approved2"]').click();
  await expect(page.locator('.work')).toHaveCount(12);
  await expect(page.locator('.work[data-id="2000"] .work-pick')).toBeDisabled();
  await expect(page.locator('.work[data-id="2000"] .work-index')).toHaveText('102');
  await page.locator('[data-filter="approved1"]').click();
  await expect(page.locator('.work')).toHaveCount(12);
  await expect(page.locator('.work[data-id="1000"] .work-index')).toHaveText('1');
  await page.locator('[data-filter="all"]').click();
  await page.locator('#nextPage').click();
  await expect(page.locator('#pageStatus')).toHaveText('2 / 6');
  await page.locator('#prevPage').click();
  await page.locator('.work[data-id="1"] .work-visual').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#viewerTitle')).toHaveText('Звёздная ночь');
  await page.locator('#viewerNext').click();
  await expect(page.locator('#viewerIndex')).toContainText('2');
  await page.locator('#viewerPrev').click();
  await expect(page.locator('#viewerIndex')).toContainText('№ 1 ·');
  await page.locator('#viewerPick').click();
  await expect(page.locator('#selectedCount')).toHaveText('0');
  await page.locator('#sourceEditor summary').click();
  await page.locator('#customSourceInput').fill('https://commons.wikimedia.org/wiki/File:Example.jpg');
  await page.locator('#saveSource').click();
  await expect.poll(()=>page.locator('#viewerImage img').count()).toBe(1);
  await page.locator('#viewerClose').click();
  await page.reload();
  await expect(page.locator('#selectedCount')).toHaveText('0');
  assert.deepEqual(errors,[],'no page errors at '+viewport.width);
  await context.close();
  console.log('КАРТОТЕКА: '+viewport.width+'x'+viewport.height+' scroll/gallery/selection/source/reload OK');
 }
}finally{await browser?.close();await new Promise(r=>server.close(r))}
