import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const base=process.env.PW_QA_BASE_URL||process.env.BASE_URL||'http://127.0.0.1:8765';
const output=process.env.PW_QA_OUTPUT_DIR||'quality-artifacts/rivals-field-notes';
await mkdir(output,{recursive:true});
let server;
try { await fetch(base); } catch {
 server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'8765',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore',windowsHide:true});
 process.on('exit',()=>server.kill());
 let ready=false;
 for(let i=0;i<60;i++) { try { if((await fetch(base)).ok){ready=true;break;} }catch{} await new Promise(r=>setTimeout(r,250)); }
 assert.ok(ready,'local preview starts');
}
const chapters=['brief','heroes','progression','duo','level','impact','maps','future','lab','sources'];
const results=[];
for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:1366,height:768},...(name==='chromium'?[{width:320,height:568}]:[])]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,recordVideo:{dir:path.join(output,'video'),size:viewport}});
  const page=await context.newPage(),errors=[],critical=[];
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)critical.push(`${r.status()} ${r.url()}`)});
  await page.goto(`${base}/apps/rivals-field-notes/`,{waitUntil:'networkidle'});
  await page.locator('.identity').waitFor();
  assert.match(await page.locator('#strength-title').innerText(),/Гамбит/);
  const prefix=`${name}-${viewport.width}`;
  await page.screenshot({path:path.join(output,`${prefix}-initial.png`)});
  await page.locator('[data-account="b"]').click();
  await page.screenshot({path:path.join(output,`${prefix}-action.png`)});
  assert.match(await page.locator('.identity').innerText(),/Hioydfts/);
  assert.match(await page.locator('#strength-title').innerText(),/C&D/);
  await page.screenshot({path:path.join(output,`${prefix}-settled.png`)});
  for(const account of ['a','b']){
   await page.locator(`[data-account="${account}"]`).click();
   for(const chapter of chapters){
    await page.locator(`#nav [data-go="${chapter}"]`).click();
    assert.ok((await page.locator('#main').innerText()).length>100,`${account}/${chapter} content`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${account}/${chapter} horizontal overflow`);
   }
  }
  await page.locator('[data-account="a"]').click();
  await page.locator('#nav [data-go="brief"]').click();
  await page.getByText('Посмотреть рейтинг своих героев и изменить порог',{exact:true}).click();
  await page.locator('#strengthMode').selectOption('all');
  await page.locator('#strengthMinimum').selectOption('50');
  assert.match(await page.locator('#outcomeTable tbody tr').first().innerText(),/Adam Warlock/);
  await page.locator('#strengthMode').selectOption('ranked');
  await page.locator('#strengthMinimum').selectOption('20');
  await page.locator('[data-strength-hero="Gambit"]').click();
  assert.match(await page.locator('#heroDetail').innerText(),/Карьера ranked/i);
  await page.locator('[data-defense-details]').click();
  assert.match(await page.locator('#defense-panel').innerText(),/14.?147.?870/);
  await page.screenshot({path:path.join(output,`${prefix}-defense.png`)});
  await page.locator('#nav [data-go="level"]').click();
  await page.locator('#relativeMetric').selectOption('dpmTop');
  assert.match(await page.locator('#relativeTable tbody tr').first().innerText(),/Doctor Strange/);
  await page.screenshot({path:path.join(output,`${prefix}-relative.png`)});
  await page.locator('#nav [data-go="future"]').click();
  assert.ok(await page.locator('#development-verdict').isVisible());
  await page.locator('#development-verdict').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${prefix}-recommendation.png`)});
  await page.locator('#nav [data-go="progression"]').click();
  await page.locator('#progressHero').selectOption({label:'Peni Parker'});
  assert.match(await page.locator('#progressBody').innerText(),/Peni Parker/);
  await page.locator('#progressBody .chart').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${prefix}-progression.png`)});
  await page.locator('#nav [data-go="duo"]').click();
  await page.locator('#duoMin').selectOption('5');
  assert.match(await page.locator('#duoBoard').innerText(),/Gambit/);
  await page.locator('#duoBoard').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${prefix}-duo.png`)});
  await page.locator('#nav [data-go="heroes"]').click();
  await page.locator('#search').fill('NoSuchHero');
  assert.equal(await page.locator('[data-hero]').count(),0);
  await page.locator('#heroExplorer').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,`${prefix}-empty.png`)});
  await page.locator('#search').fill('Loki');
  await page.locator('button[data-hero="Loki"]').click();
  assert.ok(await page.locator('#heroDialog').isVisible());
  await page.screenshot({path:path.join(output,`${prefix}-modal.png`)});
  await page.locator('#heroDialog .close').click();
  await page.locator('#nav [data-go="lab"]').click();
  console.log(`${prefix}: chapters and filters passed`);
  const box=page.locator('input[data-check]').first();
  await box.check();const key=await box.getAttribute('data-check');
  await page.reload({waitUntil:'domcontentloaded'});
  console.log(`${prefix}: reloaded local checklist`);
  assert.ok(await page.locator(`input[data-check="${key}"]`).isChecked());
  if(name==='chromium'){
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   console.log(`${prefix}: service worker controls app`);
   await context.setOffline(true);
   await page.reload({waitUntil:'load'});
   await page.locator('#nav [data-go="progression"]').click();
   assert.ok((await page.locator('#progressBody').innerText()).length>100);
   await context.setOffline(false);
  }
  assert.deepEqual(errors,[],`page errors ${prefix}`);
  assert.deepEqual(critical,[],`critical requests ${prefix}`);
  results.push({engine:name,viewport,status:'passed',chapters:20,persistence:true,offline:name==='chromium'});
  await context.close();
 }
 await browser.close();
}
await writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
server?.kill();
