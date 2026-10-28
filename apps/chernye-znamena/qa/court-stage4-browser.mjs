#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(root,'qa-artifacts','chernye-znamena-court4');
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
const report={version:'0.4.0',cases:[],failures:[]};
async function capture(page,label,stage){await page.screenshot({path:join(output,label+'-'+stage+'.png'),fullPage:false,animations:'disabled'});}
async function state(page){return page.evaluate(()=>window.__blackBannersTestState());}
const browsers=[];
try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});browsers.push(browser);
  for(const screen of [{name:'phone',w:390,h:844,touch:true},{name:'desktop',w:1366,h:768,touch:false}]){
   const key=engine+'-'+screen.name,result={key};report.cases.push(result);
   const context=await browser.newContext({viewport:{width:screen.w,height:screen.h},isMobile:screen.touch,hasTouch:screen.touch,deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    // A real old save lacks diplomacy completely, but must keep all other campaign fields.
    await page.evaluate(async()=>{
      const {createCampaign}=await import('./campaign.mjs');
      const c=createCampaign();
      delete c.diplomacy;
      localStorage.setItem('pocket-works:chernye-znamena:campaign-v1',JSON.stringify(c));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    let s=await state(page);
    assert.equal(s.campaign.diplomacy.relations[2],-12);
    await page.locator('[data-view="court"]').click();
    await page.locator('[data-court-side="2"]').click();
    await page.locator('[data-political-action="truce"]').click();
    await page.locator('[data-action="commitPolitical"]').click();
    s=await state(page);
    assert.equal(s.campaign.diplomacy.treaties[0].kind,'truce');
    assert.equal(s.campaign.diplomacy.treaties[0].side,2);
    assert.equal(s.campaign.coins,10);
    assert.equal(await page.locator('.map-region .province-treaty').count()>0,true,'treaty markers');
    await capture(page,key,'peace-and-seals');
    await page.locator('#campaignMap [data-province="1"]').click();
    await page.locator('[data-cmd="march"]').click();
    await page.locator('#campaignMap [data-province="2"]').click();
    s=await state(page);
    assert.equal(s.campaign.pending,null,'a real truce prohibits invasion');
    assert.equal(s.campaign.actions,1,'rejected attack costs no further order');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    s=await state(page);
    assert.equal(s.campaign.diplomacy.treaties[0].kind,'truce','treaty persisted across reload');
    // Start a new campaign via the actual irreversible-action confirmation.
    await page.locator('#openMenu').click();
    await page.locator('[data-action="restartCampaign"]').click();
    await page.locator('[data-action="restartCampaignConfirmed"]').click();
    s=await state(page);assert.equal(s.campaign.diplomacy.treaties.length,0);
    // Make a court ready for submission using plausible war losses; trigger all
    // actions through the real UI, never calling an internal UI callback.
    await page.evaluate(()=>{
      const s=window.__blackBannersTestState().campaign;
      s.renown=3;s.provinces[6].owner=3;
      for(const a of s.armies.filter(a=>a.side===2)){a.province=3;a.strength=3;}
    });
    await page.locator('[data-view="court"]').click();
    await page.locator('[data-court-side="2"]').click();
    await page.locator('[data-political-action="submission"]').click();
    await capture(page,key,'submission-writ');
    await page.locator('[data-action="commitPolitical"]').click();
    s=await state(page);
    assert.equal(s.campaign.provinces[3].owner,2,'vassal territory stays distinct');
    assert.equal(s.campaign.diplomacy.treaties[0].kind,'vassal');
    assert.equal(s.campaign.diplomacy.treaties[0].loyalty,66);
    await page.locator('[data-political-action="tribute"]').click();
    await page.locator('[data-action="commitPolitical"]').click();
    s=await state(page);assert.equal(s.campaign.diplomacy.treaties[0].loyalty,42);
    await capture(page,key,'vassal-court');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="startCampaign"]').click();
    s=await state(page);
    assert.equal(s.campaign.diplomacy.treaties[0].loyalty,42);
    assert.equal(s.campaign.diplomacy.treaties[0].kind,'vassal');
    const measure=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,
      scrollHeight:document.documentElement.scrollHeight,w:innerWidth,h:innerHeight}));
    assert(measure.scrollWidth<=measure.w+3,'no horizontal overflow');
    assert(measure.scrollHeight<=measure.h+3,'no page vertical overflow');
    assert.equal(errors.length,0,'uncaught errors: '+errors.join(' | '));
    result.passed=true;result.measure=measure;
   }catch(e){result.passed=false;result.error=String(e?.stack||e);report.failures.push(key+': '+result.error);try{await capture(page,key,'failure');}catch{}}
   finally{await context.close();}
  }
 }
}finally{
 for(const b of browsers)await b.close();
 server.close();
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
if(report.failures.length)process.exitCode=1;
