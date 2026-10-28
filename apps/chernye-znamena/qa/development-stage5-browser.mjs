#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(root,'qa-artifacts','chernye-znamena-development');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+path,path.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));}
 catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/apps/chernye-znamena/';
const report={version:'0.5.0',cases:[],failures:[]};
const browsers=[];
async function state(page){return page.evaluate(()=>window.__blackBannersTestState?.());}
async function shot(page,key,name){await page.screenshot({path:join(output,key+'-'+name+'.png'),fullPage:false,animations:'disabled'});}
try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});browsers.push(browser);
  for(const size of [{name:'phone',w:390,h:844,touch:true},{name:'desktop',w:1366,h:768,touch:false}]){
   const key=engine+'-'+size.name,entry={key};report.cases.push(entry);
   const context=await browser.newContext({viewport:{width:size.w,height:size.h},isMobile:size.touch,hasTouch:size.touch,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{
     const {createCampaign}=await import('./campaign.mjs');
     const campaign=createCampaign();delete campaign.treasury;
     for(const p of campaign.provinces)delete p.development;
     localStorage.setItem('pocket-works:chernye-znamena:campaign-v1',JSON.stringify(campaign));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    let s=await state(page);
    assert.deepEqual(s.campaign.treasury,{1:12,2:12});
    await page.locator('#campaignMap [data-province="4"]').click();
    assert.equal(await page.locator('button[data-build]').count(),3);
    await shot(page,key,'build-choices');
    await page.locator('[data-build="market"]').click();
    await page.locator('[data-action="commitBuild"]').click();
    s=await state(page);
    assert.equal(s.campaign.provinces[4].development,'market');
    assert.equal(s.campaign.coins,8);
    assert.equal(s.campaign.actions,1);
    assert.equal(s.screen,'campaign');
    await shot(page,key,'market-built');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    s=await state(page);
    assert.equal(s.campaign.provinces[4].development,'market');
    await page.locator('#campaignMap [data-province="4"]').click();
    assert.equal(await page.locator('.map-build-status').count(),1);
    assert.equal(await page.locator('button[data-build]').count(),0,'one permanent choice per province');
    await page.locator('#openMenu').click();
    await page.locator('[data-action="restartCampaign"]').click();
    await page.locator('[data-action="restartCampaignConfirmed"]').click();
    await page.locator('#campaignMap [data-province="1"]').click();
    await page.locator('[data-build="watchtower"]').click();
    await page.locator('[data-action="commitBuild"]').click();
    s=await state(page);
    assert.equal(s.campaign.provinces[1].development,'watchtower');
    await shot(page,key,'watchtower-built');
    const sizeReport=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
    assert(sizeReport.sw<=sizeReport.w+3,'horizontal overflow');
    assert(sizeReport.sh<=sizeReport.h+3,'document vertical overflow');
    assert.equal(errors.length,0,errors.join(' | '));entry.passed=true;entry.metrics=sizeReport;
   }catch(e){entry.passed=false;entry.error=String(e?.stack||e);report.failures.push(key+': '+entry.error);try{await shot(page,key,'failure');}catch{}}
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
