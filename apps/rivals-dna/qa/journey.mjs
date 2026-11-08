import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const base=process.env.PW_QA_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8765';
const output=process.env.PW_QA_OUTPUT_DIR || 'quality-artifacts/rivals-dna';
await mkdir(output,{recursive:true});
let server;
try { const r=await fetch(base);if(!r.ok) throw Error('not ready'); }
catch{
  server=spawn(process.execPath,['scripts/serve-site.mjs'],{
    env:{...process.env,PORT:'8765',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},
    stdio:'ignore',windowsHide:true
  });
  let available=false;
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok){available=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert(available,'preview server becomes reachable');
}
const samples=[
  {name:'chromium-phone',browser:chromium,viewport:{width:390,height:844},mobile:true},
  {name:'webkit-phone',browser:webkit,viewport:{width:390,height:844},mobile:true},
  {name:'chromium-desktop',browser:chromium,viewport:{width:1366,height:768},mobile:false}
];
const results=[];
for(const sample of samples){
 const browser=await sample.browser.launch({headless:true});
 const context=await browser.newContext({
   viewport:sample.viewport,isMobile:sample.mobile,hasTouch:sample.mobile,
   acceptDownloads:true,serviceWorkers:'allow',
   recordVideo:{dir:path.join(output,'videos'),size:sample.viewport}
 });
 const page=await context.newPage();
 const errors=[],failed=[];
 page.on('pageerror',err=>errors.push(err.message));
 page.on('response',res=>{if(res.url().startsWith(base)&&res.status()>=400)failed.push(res.status()+' '+res.url());});
 await page.goto(base+'/apps/rivals-dna/',{waitUntil:'domcontentloaded'});
 await page.locator('.landing').waitFor();
 assert.match(await page.locator('.landing').innerText(),/54\s+героя/);
 await page.screenshot({path:path.join(output,sample.name+'-initial.png')});
 await page.locator('[data-action="start-full"]').click();
 assert.equal(await page.locator('.question-screen').count(),1);
 await page.screenshot({path:path.join(output,sample.name+'-question.png')});
 for(let i=0;i<20;i++){
   const slider=page.locator('input[type="range"][data-question]');
   if(await slider.count()){
     await slider.evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
   }else{
     await page.locator('[data-action="choose"]').nth(i%4).click();
   }
   const next=page.locator('[data-action="next"]');
   assert.equal(await next.isDisabled(),false,'next enabled after answer '+(i+1));
   await next.click();
 }
 assert.equal(await page.locator('.result-page').count(),1);
 assert.equal(await page.locator('.rank-row').count(),10);
 const top=await page.locator('.rank-row').first().getAttribute('data-hero');
 await page.screenshot({path:path.join(output,sample.name+'-results.png'),fullPage:true});
 await page.locator('.rank-row').first().click();
 await page.locator('.detail-sheet').waitFor();
 await page.screenshot({path:path.join(output,sample.name+'-detail.png')});
 await page.locator('.rating-row [data-rating="2"]').click();
 for(let i=0;i<3;i++)await page.locator('[data-action="match"]').click();
 assert.match(await page.locator('.match-row').innerText(),/3\/3/);
 await page.locator('[data-action="close-modal"].detail-close').click();
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('.rank-row').count(),10,'result persists reload');
 await page.locator('[data-action="profiles"]').click();
 await page.locator('#new-profile-name').fill('Союзник');
 await page.locator('#profile-form button[type="submit"]').click();
 await page.locator('[data-action="start-quick"]').click();
 for(let i=0;i<12;i++){
   const slider=page.locator('input[type="range"][data-question]');
   if(await slider.count())await slider.evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
   else await page.locator('[data-action="choose"]').nth((i+2)%4).click();
   await page.locator('[data-action="next"]').click();
 }
 assert.equal(await page.locator('.rank-row').count(),10);
 await page.locator('[data-action="home"]').click();
 await page.locator('[data-action="duo"]').click();
 assert.equal(await page.locator('.duo-item').count(),5);
 await page.screenshot({path:path.join(output,sample.name+'-duo.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow');
 if(sample.name==='chromium-phone'){
   await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:15000});
   await context.setOffline(true);
   await page.reload({waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('.duo-item').count(),5,'offline duo screen');
   await context.setOffline(false);
 }
 assert.deepEqual(errors,[],'browser console errors '+sample.name);
 assert.deepEqual(failed,[],'critical failed requests '+sample.name);
 results.push({name:sample.name,view:sample.viewport,questions:32,heroes:54,top,feedback:true,duo:true,offline:sample.name==='chromium-phone'});
 await context.close();await browser.close();
}
await writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
server?.kill();
