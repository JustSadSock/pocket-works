
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const pathname=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const file=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(file)}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const folder=process.env.PW_QA_OUTPUT_DIR||'';
if(folder)await mkdir(folder,{recursive:true});
let tests=0;
try{
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1366,height:768}]){
  const mobile=viewport.width<760;
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/apps/bozhe-ne-tak/',{waitUntil:'domcontentloaded'});
  await page.locator('.home-stage').waitFor();
  if(folder)await page.screenshot({path:join(folder,'initial-'+viewport.width+'.png')});
  const firstState=await page.evaluate(()=>window.__BNT_QA__());
  assert.equal(firstState.hasSave,false);
  await page.locator('[data-action="new"]').click();
  await page.locator('.work-space').waitFor();
  assert.equal(await page.locator('[data-action="commit"]').isDisabled(),true);
  await page.locator('[data-item="goose"]').click();
  assert.equal(await page.evaluate(()=>window.__BNT_QA__().item),'goose');
  await page.reload();
  await page.locator('[data-action="resume"]').click();
  assert.equal(await page.evaluate(()=>window.__BNT_QA__().item),'goose','the partial ritual must survive reload');
  const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:bozhe-ne-tak:game-v2')));
  let loop=0;
  while(loop<5){
   const prepared=await page.evaluate(async()=>{
    const e=await import('./engine.js');
    const s=JSON.parse(localStorage.getItem('pocket-works:bozhe-ne-tak:game-v2'));
    const r=e.getRite(s);let best=null;
    for(const item of e.ITEMS)for(const treatment of e.TREATMENTS)for(const bell of [1,2,3])for(const height of ['low','high']){
     const a={itemId:item.id,treatment:treatment.id,bell,height};
     const score=e.evaluateRite(r,a,s.doctrines,e.getIncident(s),s.patronId).score;
     if(!best||score>best.score)best={...a,score};
    }
    return best;
   });
   assert.ok(prepared.score>=4,'the ritual must remain achievable with accrued doctrines');
   await page.locator('[data-item="'+prepared.itemId+'"]').click();
   await page.locator('[data-treatment="'+prepared.treatment+'"]').click();
   await page.locator('[data-bell="'+prepared.bell+'"]').click();
   await page.locator('[data-height="'+prepared.height+'"]').click();
   const fit=await page.evaluate(()=>({outer:document.documentElement.scrollWidth,inner:window.innerWidth}));
   assert.ok(fit.outer<=fit.inner+2,'horizontal overflow '+JSON.stringify(fit));
   if(loop===2&&folder)await page.screenshot({path:join(folder,'active-'+viewport.width+'.png')});
   await page.locator('[data-action="commit"]').click();
   await page.locator('.verdict-title').waitFor();
   assert.equal(await page.evaluate(()=>window.__BNT_QA__().phase),'judgment');
   if(loop===2&&folder)await page.screenshot({path:join(folder,'verdict-'+viewport.width+'.png')});
   await page.locator('[data-action="after-judgment"]').click();
   const phase=await page.evaluate(()=>window.__BNT_QA__().phase);
   if(phase==='end')break;
   assert.equal(phase,'dogma');
   const first=page.locator('[data-pick-dogma]').first();
   await first.click();
   await page.locator('[data-action="confirm-doctrine"]').click();
   assert.equal(await page.evaluate(()=>window.__BNT_QA__().phase),'play');
   loop++;
  }
  const end=await page.evaluate(()=>window.__BNT_QA__());
  assert.equal(end.phase,'end');
  assert.equal(end.history,5,'all five rituals were actually completed');
  assert.ok(end.faith>0);
  assert.ok(end.doctrines.length>0);
  await page.locator('.chronicle-entry').first().waitFor();
  if(folder)await page.screenshot({path:join(folder,'ending-'+viewport.width+'.png')});
  await page.reload();
  await page.locator('[data-action="resume"]').click();
  assert.equal(await page.evaluate(()=>window.__BNT_QA__().phase),'end','end state should persist');
  await page.locator('[data-action="retry-seed"]').click();
  await page.locator('[data-action="confirm-retry"]').click();
  const replay=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:bozhe-ne-tak:game-v2')));
  assert.deepEqual(replay.order,initial.order,'same seed should reproduce the same sequence');
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="project"]').click();
  await page.locator('#project-document').waitFor();
  await page.waitForFunction(()=>document.querySelector('#project-document')?.textContent.includes('Дорожная'));
  assert.equal(errors.length,0,errors.join('\n'));
  await context.close();
  tests++;
 }
 console.log('BOZHE local ritual UI: '+tests+' complete 5-round campaigns and persisted replay passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
