import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const pathname=decodeURIComponent(url.pathname);
  const file=resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}
  catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolveReady=>server.listen(0,'127.0.0.1',resolveReady));
const browser=await chromium.launch({headless:true});
const output=process.env.PW_QA_OUTPUT_DIR||null;
if(output)await mkdir(output,{recursive:true});
async function evidence(page,label,viewport){
  if(viewport.width!==390)return;
  const bytes=await page.screenshot({type:'jpeg',quality:65});
  console.log('BZYN_FRAME_START:'+label+':'+bytes.toString('base64')+':BZYN_FRAME_END');
}
let passed=0;
try{
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1366,height:768}]){
    const mobile=viewport.width<600;
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const missing=[];
    page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/apps/bzyn/'))missing.push(r.status()+' '+r.url());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/apps/bzyn/',{waitUntil:'domcontentloaded'});
    await page.locator('#field').waitFor();
    await page.waitForFunction(()=>window.__AI_TEST_STATE__?.mode==='ready');
    const fit=await page.evaluate(()=>{
      const ids=['field','score','wave','shots','fireButton','pauseButton','soundButton'];
      return {scroll:document.documentElement.scrollHeight-innerHeight,
        items:ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};})};
    });
    assert.ok(fit.scroll<3,'unexpected viewport scroll: '+JSON.stringify(fit));
    assert.ok(fit.items.every(i=>i.top>=0&&i.bottom<=viewport.height+1&&i.left>=0&&i.right<=viewport.width+1),'clipped control: '+JSON.stringify(fit));
    assert.ok(fit.items.find(i=>i.id==='fireButton').height>=44);
    if(output)await page.screenshot({path:join(output,'bzyn-first-'+viewport.width+'.png')});
    await evidence(page,'first',viewport);
    const rect=await page.locator('#field').boundingBox();
    const start={x:rect.x+rect.width*.5,y:rect.y+rect.height*(450/580)};
    const end={x:start.x+rect.width*.13,y:rect.y+rect.height*(539/580)};
    await page.mouse.move(start.x,start.y);
    await page.mouse.down();
    await page.mouse.move(end.x,end.y,{steps:12});
    const tracked=await page.evaluate(()=>window.__AI_TEST_STATE__);
    // The DOM snapshot is published on state transitions. Canvas position is sampled live by next frames.
    assert.equal(tracked.dragging,true,'pointer not captured');
    if(output)await page.screenshot({path:join(output,'bzyn-drag-'+viewport.width+'.png')});
    await evidence(page,'drag',viewport);
    await page.mouse.up();
    await page.waitForFunction(()=>window.__AI_TEST_STATE__?.mode==='flying');
    assert.equal((await page.evaluate(()=>window.__AI_TEST_STATE__.shots)),3);
    if(output)await page.screenshot({path:join(output,'bzyn-flight-'+viewport.width+'.png')});
    await evidence(page,'flight',viewport);
    await page.locator('#pauseButton').click();
    assert.equal(await page.locator('#pauseScreen').isVisible(),true);
    const pausedAt=await page.evaluate(()=>window.__AI_TEST_STATE__.puck);
    await page.waitForTimeout(140);
    assert.deepEqual(await page.evaluate(()=>window.__AI_TEST_STATE__.puck),pausedAt);
    if(output)await page.screenshot({path:join(output,'bzyn-pause-'+viewport.width+'.png')});
    await evidence(page,'pause',viewport);
    await page.locator('#resumeButton').click();
    assert.equal(await page.locator('#pauseScreen').isVisible(),false);
    await page.locator('#soundButton').click();
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'false');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__AI_TEST_STATE__?.mode==='ready');
    assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'false','sound preference did not survive reload');
    await page.locator('#soundButton').click();
    await page.locator('#field').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>window.__AI_TEST_STATE__?.shots===3&&window.__AI_TEST_STATE__?.mode==='flying');
    await page.locator('#pauseButton').click();
    await page.locator('#restartButton').click();
    assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.shots),4,'restart did not reset shots');
    assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.mode),'ready');
    assert.equal(await page.locator('#pauseScreen').isVisible(),false);
    if(output)await page.screenshot({path:join(output,'bzyn-restart-'+viewport.width+'.png')});
    assert.deepEqual(errors,[],'page errors');
    assert.deepEqual(missing,[],'missing app requests');
    passed++;
    await context.close();
  }
}finally{await browser.close();await new Promise(done=>server.close(done));}
console.log('BZYN real-flow PASS '+passed+' viewports: touch drag, release, pause, restart, keyboard, persistence, layout and console');
