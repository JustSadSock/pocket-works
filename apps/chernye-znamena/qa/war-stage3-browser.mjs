#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(root,'qa-artifacts','chernye-znamena-war3');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path,path.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));}
 catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/apps/chernye-znamena/';
const report={version:'0.3.0',cases:[],failures:[]};
const sizes=[{name:'phone',width:390,height:844,isMobile:true,hasTouch:true},{name:'desktop',width:1366,height:768,isMobile:false,hasTouch:false}];
async function capture(page,label,stage){await page.screenshot({path:join(output,label+'-'+stage+'.png'),fullPage:false,animations:'disabled'});}
async function gameState(page){return await page.evaluate(()=>window.__blackBannersTestState?.());}
const browsers=[];
try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});browsers.push(browser);
  for(const size of sizes){
   const label=engine+'-'+size.name,caseReport={label};report.cases.push(caseReport);
   const ctx=await browser.newContext({viewport:{width:size.width,height:size.height},isMobile:size.isMobile,hasTouch:size.hasTouch,serviceWorkers:'block'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    // A valid release 0.2 save without the v0.3 fields must be upgraded.
    await page.evaluate(async()=>{
      const {createCampaign}=await import('./campaign.mjs');
      const c=createCampaign();
      delete c.sieges;for(const p of c.provinces)delete p.raidedUntil;
      c.provinces[2].owner=0;c.provinces[2].garrison=3;
      c.armies=c.armies.filter(a=>a.side===0);
      c.armies.find(a=>a.id==='army-1').province=2;
      localStorage.setItem('pocket-works:chernye-znamena:campaign-v1',JSON.stringify(c));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    let s=await gameState(page);
    assert(Array.isArray(s.campaign.sieges));assert.equal(s.campaign.provinces[2].raidedUntil,0);
    await page.locator('#campaignMap [data-province="2"]').click();
    await page.locator('[data-cmd="siege"]').click();
    await page.locator('#campaignMap [data-province="3"]').click();
    await page.locator('[data-action="commitSiege"]').click();
    s=await gameState(page);
    assert.equal(s.screen,'campaign');assert.equal(s.campaign.sieges.length,1);
    assert.equal(s.campaign.actions,1);assert.equal(s.campaign.sieges[0].progress,0);
    assert.equal(await page.locator('.campaign-siege').count(),1,'siege-ring visible');
    await capture(page,label,'siege-order');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    s=await gameState(page);assert.equal(s.campaign.sieges.length,1,'siege recovered');
    await page.locator('#campaignEndSeason').click();
    s=await gameState(page);
    assert.equal(s.campaign.sieges.length,1);assert.equal(s.campaign.sieges[0].progress,1);
    assert.equal(s.campaign.provinces[3].garrison,5);
    await capture(page,label,'siege-progress');
    await page.locator('#campaignMap [data-province="2"]').click();
    await page.locator('[data-cmd="storm"]').click();
    await page.locator('[data-action="commitMarch"]').click();
    s=await gameState(page);
    assert.equal(s.screen,'battle');assert.equal(s.game.mapId,'bastion');
    assert.equal(s.campaign.sieges.length,0,'storm replaces blockade');
    await capture(page,label,'fortress-assault');
    await page.locator('#openMenu').click();
    await page.locator('[data-action="withdraw"]').click();
    await page.locator('[data-action="withdrawConfirmed"]').click();
    await page.locator('[data-action="returnCampaign"]').click();
    s=await gameState(page);assert.equal(s.campaign.pending,null);
    assert.equal(s.campaign.provinces[3].owner,2);
    // Fresh campaign: raid must really reduce garrison, but must not transfer land.
    await page.locator('#openMenu').click();
    await page.locator('[data-action="restartCampaign"]').click();
    await page.locator('[data-action="restartCampaignConfirmed"]').click();
    await page.locator('#campaignMap [data-province="1"]').click();
    await page.locator('[data-cmd="raid"]').click();
    await page.locator('#campaignMap [data-province="5"]').click();
    await page.locator('[data-action="commitRaid"]').click();
    s=await gameState(page);
    assert.equal(s.campaign.provinces[5].owner,3);
    assert.equal(s.campaign.provinces[5].garrison,1);
    assert.equal(s.campaign.coins,20);
    assert.equal(s.campaign.armies.find(a=>a.id==='army-1').strength,10);
    await capture(page,label,'after-raid');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    s=await gameState(page);
    assert.equal(s.campaign.provinces[5].raidedUntil,3,'raid save preserved');
    assert.equal(errors.length,0,'uncaught browser exceptions: '+errors.join(' | '));
    caseReport.passed=true;
   }catch(e){caseReport.passed=false;caseReport.error=String(e?.stack||e);report.failures.push(label+': '+caseReport.error);try{await capture(page,label,'failure');}catch{}}
   finally{await ctx.close();}
  }
 }
}finally{
 for(const b of browsers)await b.close();
 server.close();
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
if(report.failures.length)process.exitCode=1;
