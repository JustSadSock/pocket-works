#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(root,'qa-artifacts','chernye-znamena-campaign');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=resolve(root,'.'+path,path.endsWith('/')?'index.html':'');
  if(!target.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{const b=await readFile(target);res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(b);}
  catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/apps/chernye-znamena/';
const report={version:'0.2.0',cases:[],failures:[]};
const shapes=[{id:'phone',w:390,h:844,touch:true},{id:'desktop',w:1366,h:768,touch:false},{id:'compact',w:320,h:568,touch:true}];
async function snap(page,key,stage){await page.screenshot({path:join(output,key+'-'+stage+'.png'),fullPage:false,animations:'disabled'});}
async function state(page){return page.evaluate(()=>window.__blackBannersTestState?.());}
const browsers=[];
try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});browsers.push(browser);
  for(const shape of shapes){
   const key=engine+'-'+shape.id,result={key};report.cases.push(result);
   const context=await browser.newContext({viewport:{width:shape.w,height:shape.h},isMobile:shape.touch,hasTouch:shape.touch,deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   try{
    const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});assert(response?.ok(),'entry failed');
    await page.locator('[data-action="startCampaign"]').waitFor({state:'visible'});
    await snap(page,key,'home');
    await page.locator('[data-action="startCampaign"]').click();
    await page.locator('.map-region').first().waitFor({state:'visible',timeout:12000});
    assert.equal((await state(page)).campaign.provinces.length,12);
    await snap(page,key,'atlas-initial');
    const board=await page.locator('#campaignMap').boundingBox();assert(board && board.width>250 && board.height>130,'atlas clipped');
    await page.locator('#campaignMap [data-province="1"]').click();
    await page.locator('[data-cmd="march"]').click();
    assert.equal((await state(page)).marchMode,true);
    await snap(page,key,'atlas-march');
    await page.locator('#campaignMap [data-province="5"]').click();
    await page.locator('[data-action="commitMarch"]').waitFor({state:'visible'});
    await snap(page,key,'invasion-confirm');
    await page.locator('[data-action="commitMarch"]').click();
    let s=await state(page);assert.equal(s.campaign.pending.to,5);assert.equal(s.game.campaignContext.to,5);
    assert.equal(s.screen,'battle');
    await snap(page,key,'linked-battle');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').waitFor({state:'visible'});
    await page.locator('[data-action="startCampaign"]').click();
    await page.locator('[data-action="resume"]').waitFor({state:'visible'});
    await page.locator('[data-action="resume"]').click();
    s=await state(page);assert.equal(s.screen,'battle');assert.equal(s.campaign.pending.to,5);
    const old=s.campaign.armies.find(a=>a.id==='army-1').strength;
    await page.locator('#openMenu').click();
    await page.locator('[data-action="withdraw"]').click();
    await page.locator('[data-action="withdrawConfirmed"]').click();
    await page.locator('[data-action="returnCampaign"]').click();
    s=await state(page);
    assert.equal(s.screen,'campaign');assert.equal(s.campaign.pending,null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('pocket-works:chernye-znamena:linked-battle-v1')),null,
      'concluded retreat must clear its old tactical save');
    assert.equal(s.campaign.provinces[5].owner,3);
    assert.ok(s.campaign.armies.find(a=>a.id==='army-1').strength<old);
    await snap(page,key,'atlas-after-retreat');
    await page.locator('#campaignMap [data-province="4"]').click();
    await page.locator('[data-cmd="fortify"]').click();
    s=await state(page);assert.equal(s.campaign.provinces[4].garrison,6);
    await page.locator('#campaignEndSeason').click();
    s=await state(page);assert.equal(s.campaign.season,2);
    await snap(page,key,'next-season');
    const neededNewBattle=!!s.campaign.pending;
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(!!(await page.evaluate(()=>localStorage.getItem('pocket-works:chernye-znamena:linked-battle-v1'))),neededNewBattle,
      'linked tactical save should exist exactly when a NEW invasion is pending');
    await page.locator('[data-action="startCampaign"]').click();
    s=await state(page);
    assert.equal(s.campaign.season,2);
    assert.equal(s.campaign.provinces[4].garrison,6,'fortification saved');
    const metrics=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,
      map:document.querySelector('#campaignMap').getBoundingClientRect().toJSON()}));
    result.metrics=metrics;
    assert(metrics.sw<=metrics.w+3,'horizontal document overflow');
    assert(metrics.sh<=metrics.h+3,'vertical document overflow');
    assert.equal(errors.length,0,'browser exceptions: '+errors.join(' | '));
    result.passed=true;
   }catch(e){result.passed=false;result.error=String(e?.stack||e);report.failures.push(key+': '+result.error);try{await snap(page,key,'failure');}catch{}}
   finally{await context.close();}
  }
 }
}finally{
 for(const browser of browsers)await browser.close();
 server.close();
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
if(report.failures.length)process.exitCode=1;
