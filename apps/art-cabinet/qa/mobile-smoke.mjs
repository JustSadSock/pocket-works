import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';

/* Run: node apps/art-cabinet/qa/mobile-smoke.mjs
   Tests the actual mobile DOM with representative Wikimedia API and image responses.
   It also fails on any JavaScript page error, including module syntax errors. */
const root=fileURLToPath(new URL('../../../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const abs=resolve(root,'.'+pathname);
    if(!abs.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const file=abs.endsWith('/')?abs+'index.html':abs;
    const body=await readFile(file);
    res.writeHead(200,{'content-type':(mime[extname(file)]||'application/octet-stream')+'; charset=utf-8','cache-control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    await context.route(/https:\/\/en\.wikipedia\.org\/w\/api\.php/,route=>{
      const titles=new URL(route.request().url()).searchParams.get('titles').split('|');
      const pages=titles.map((title,i)=>({pageid:i+1,title,thumbnail:{source:'https://thumb.wikimedia.org/test/'+encodeURIComponent(title)+'.svg'}}));
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({query:{pages}})});
    });
    await context.route('https://thumb.wikimedia.org/test/**',route=>
      route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="750"><rect width="640" height="750" fill="#b69070"/><circle cx="320" cy="250" r="110" fill="#eee0bf"/></svg>'})
    );
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/apps/art-cabinet/',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.locator('html').getAttribute('data-art-cabinet-ready')).toBe('1');
    await expect(page.locator('.work')).toHaveCount(20);
    await expect(page.locator('#selectedCount')).toHaveText('1');
    await expect.poll(()=>page.locator('.work[data-id="3"] img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    await page.locator('.work[data-id="1"] .work-pick').click();
    await expect(page.locator('#selectedCount')).toHaveText('2');
    await page.locator('.filter[data-filter="picked"]').click();
    await expect(page.locator('.work')).toHaveCount(2);
    await page.locator('.filter[data-filter="all"]').click();
    await page.locator('#nextPage').click();
    await expect(page.locator('#pageStatus')).toHaveText('2 / 5');
    await page.locator('#heroArt').click({force:true});
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#viewerTitle')).toHaveText('Смерть Марата');
    await page.locator('#viewerPick').click();
    await expect(page.locator('#selectedCount')).toHaveText('1');
    await page.locator('#viewerClose').click();
    await page.reload();
    await expect(page.locator('#selectedCount')).toHaveText('1');
    assert.deepEqual(errors,[],viewport.width+'px page errors');
    await context.close();
    console.log('КАРТОТЕКА mobile smoke passed at '+viewport.width+'x'+viewport.height);
  }
}finally{await browser?.close();await new Promise(r=>server.close(r))}
