#!/usr/bin/env node
// Real Chromium / WebKit visual and input acceptance. Uses real local app modules;
// PocketNet is not mocked: single-player practice is its deliberately offline mode.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const output = process.env.PW_QA_OUTPUT_DIR || join(root, 'qa-artifacts', 'trace-mosaic-ateliers');
await mkdir(output, { recursive: true });
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
 '.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const path = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
  if (!path.startsWith(root + sep) && path !== root) {res.writeHead(403);res.end();return;}
  try {
    const body = await readFile(path);
    res.writeHead(200, {'content-type':mime[extname(path)] || 'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(ok => server.listen(0,'127.0.0.1',ok));
const base = 'http://127.0.0.1:' + server.address().port + '/apps/trace-mosaic/';
const viewports = [
  {name:'iphone-390x844',width:390,height:844,touch:true},
  {name:'compact-320x568',width:320,height:568,touch:true},
  {name:'landscape-844x390',width:844,height:390,touch:true},
  {name:'desktop-1366x768',width:1366,height:768,touch:false}
];
const report = { version:'trace-mosaic-0.3', cases:[], failures:[] };
async function metrics(page) {
  return await page.evaluate(() => {
    const rect = q => { const b=document.querySelector(q)?.getBoundingClientRect();
      return b && {x:b.x,y:b.y,left:b.left,top:b.top,right:b.right,bottom:b.bottom,w:b.width,h:b.height}; };
    return {
      viewport:{w:innerWidth,h:innerHeight},
      docWidth:document.documentElement.scrollWidth,
      board:rect('.board-shell'),tray:rect('.inventory-shell'),
      hud:rect('.hud-row'),body:rect('body'),
      inventoryItems:document.querySelectorAll('.inventory-piece[data-piece-id]').length,
      tilesLoaded:document.querySelectorAll('.inventory-piece[data-art-loaded="1"]').length,
      theme:getComputedStyle(document.body).backgroundColor,
      overflow:document.documentElement.scrollWidth-innerWidth,
    };
  });
}
async function take(page, key, stage) {
  await page.screenshot({path:join(output,key+'-'+stage+'.png'),fullPage:false,animations:'disabled'});
}
async function drag(page, id) {
  const source=page.locator('.inventory-piece[data-piece-id="'+id+'"]');
  const target=page.locator('.board-cell[data-cell="'+id+'"]');
  await source.waitFor({state:'visible',timeout:8000});
  await source.scrollIntoViewIfNeeded();
  const a=await source.boundingBox(), b=await target.boundingBox();
  assert(a && b, 'Missing drag source or target');
  const x=a.x+a.width/2,y=a.y+a.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForFunction(index => {
    const placed=document.querySelector('.placed-piece[data-cell="'+index+'"]');
    return placed?.dataset.currentTile===String(index);
  },id,{timeout:9000});
}
const browsers=[];
try {
 for (const engine of ['chromium','webkit']) {
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});
  browsers.push(browser);
  for (const shape of viewports) {
   const key=engine+'-'+shape.name;
   const entry={key};
   report.cases.push(entry);
   const context=await browser.newContext({viewport:{width:shape.width,height:shape.height},
      isMobile:shape.touch,hasTouch:shape.touch,deviceScaleFactor:1,serviceWorkers:'block',
      reducedMotion:'no-preference'});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try {
    const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
    assert(response?.ok(),key+' entry failed');
    await page.locator('#practiceBtn').waitFor({state:'visible'});
    await take(page,key,'menu');
    await page.locator('#practiceBtn').click();
    await page.locator('[data-action="start-game"]').waitFor({state:'visible'});
    await page.locator('[data-action="start-game"]').click();
    await page.locator('.board-shell').waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelectorAll('.inventory-piece[data-art-loaded="1"]').length>0,{timeout:10000});
    entry.before=await metrics(page);
    assert(entry.before.board?.w>80 && entry.before.board?.h>80,key+' board tiny');
    assert(entry.before.board.left>=-2 && entry.before.board.right<=shape.width+2,key+' board horizontally clipped');
    assert(entry.before.board.top>=0 && entry.before.board.bottom<=shape.height+3,key+' board vertically clipped');
    assert(entry.before.hud?.right<=shape.width+3,key+' HUD clipped');
    assert(entry.before.inventoryItems>0,key+' no own fragments');
    assert(entry.before.overflow<=7,key+' document overflow');
    await take(page,key,'board-before');

    await page.locator('[data-action="show-reference"]').click();
    await page.locator('.reference-frame img').waitFor({state:'visible'});
    await take(page,key,'reference');
    await page.keyboard.press('Escape');
    await page.locator('.reference-overlay').waitFor({state:'detached'});

    const sound=page.locator('[data-action="toggle-sound"]');
    await sound.click();
    assert.match(await sound.textContent(),/вкл/,key+' sound toggle label');
    await sound.click();
    assert.match(await sound.textContent(),/выкл/,key+' sound toggle reset');

    await drag(page,0);
    entry.afterFirst=await metrics(page);
    await take(page,key,'board-after-first-drop');
    assert.equal(await page.locator('.placed-piece.correct[data-cell="0"]').count(),1,key+' snap missed');
    for(let id=1;id<16;id++) await drag(page,id);
    await page.locator('.result-exhibit').waitFor({state:'visible',timeout:15000});
    assert.match(await page.locator('.exhibit-heading h2').textContent(),/Картина/,key+' round did not finish');
    await take(page,key,'results');
    assert.equal(errors.length,0,key+' browser errors: '+errors.join(' | '));
    entry.success=true;
   } catch(error) {
    entry.success=false;
    entry.error=String(error?.stack||error);
    report.failures.push(key+': '+entry.error);
    try{await take(page,key,'failure')}catch{}
   } finally {await context.close();}
  }
 }
} finally {
 for(const browser of browsers) await browser.close();
 server.close();
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
if(report.failures.length)process.exitCode=1;
