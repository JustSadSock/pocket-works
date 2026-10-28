#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(root,'qa-artifacts','chernye-znamena');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const p=resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
 if(!p.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'content-type':mime[extname(p)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(p));}
 catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/apps/chernye-znamena/';
const report={cases:[],failures:[],version:'0.1.0'};
const frames=[{id:'phone',w:390,h:844,touch:true},{id:'desktop',w:1366,h:768,touch:false},{id:'short-phone',w:320,h:568,touch:true}];
function coord(rect,q,r){
 const portrait=rect.width<740 && rect.height>rect.width*1.05;
 const size=Math.max(6,portrait
  ? Math.min((rect.width-24)/8.4,(rect.height-36)/16.2)
  : Math.min((rect.width-18)/(Math.sqrt(3)*(7+2.5)+1),(rect.height-22)/(1.5*4+2.3)));
 if(portrait) return {
  x:rect.x+rect.width/2-1.5*size*(r-2),
  y:rect.y+rect.height/2+Math.sqrt(3)*size*(q+r/2-4)
 };
 const worldWidth=Math.sqrt(3)*size*(7+2.5-1)+size*1.9;
 const worldHeight=1.5*size*4+size*2;
 const x=(rect.width-worldWidth)/2+size*.92+Math.sqrt(3)*size*(q+r/2);
 const y=(rect.height-worldHeight)/2+size+1.5*size*r;
 return {x:rect.x+x,y:rect.y+y};
}
async function screenshot(page,id,name){await page.screenshot({path:join(output,id+'-'+name+'.png'),fullPage:false,animations:'disabled'});}
const browsers=[];
try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true});browsers.push(browser);
  for(const frame of frames){
   const id=engine+'-'+frame.id,result={id};report.cases.push(result);
   const context=await browser.newContext({viewport:{width:frame.w,height:frame.h},isMobile:frame.touch,hasTouch:frame.touch,deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    assert(response?.ok(),'entry HTTP');
    await page.locator('[data-action="new"]').waitFor({state:'visible',timeout:12000});
    await screenshot(page,id,'menu');
    await page.locator('[data-action="new"]').click();
    await page.waitForFunction(()=>window.__blackBannersTestState?.().screen==='battle');
    await screenshot(page,id,'battle');
    const rect=await page.locator('#board').boundingBox();
    assert(rect&&rect.height>150&&rect.width>220,'battlefield too small');
    const pos=coord(rect,0,2);
    await page.mouse.click(pos.x,pos.y);
    assert.match((await page.locator('#unitName').textContent())||'',/Мечники/,'selected banner');
    const guard=page.locator('#guardBtn');
    assert(await guard.isEnabled(),'guard enabled after select');
    await guard.click();
    const after=await page.evaluate(()=>window.__blackBannersTestState().game);
    assert.equal(after.orders,2,'guard costs exactly one order');
    assert.equal(after.units.find(u=>u.id==='a0').guard,true,'guard applied');
    await screenshot(page,id,'guard');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-action="continue"]').waitFor({state:'visible'});
    await page.locator('[data-action="continue"]').click();
    assert.equal(await page.locator('#orders').textContent(),'2','save persisted after refresh');
    await page.locator('#endTurn').click();
    await page.waitForFunction(()=>{const s=window.__blackBannersTestState?.().game;return s&&s.round>=2&&s.turn===0;},{timeout:12000});
    await screenshot(page,id,'after-ai');
    await page.locator('#openMenu').click();
    await page.locator('[data-action="resume"]').waitFor({state:'visible'});
    await screenshot(page,id,'pause');
    await page.locator('[data-action="resume"]').click();
    assert.equal(await page.locator('#veil.hidden').count(),1,'menu closes');
    const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,scrollHeight:document.documentElement.scrollHeight,innerHeight,board:{w:document.querySelector('#board').getBoundingClientRect().width,h:document.querySelector('#board').getBoundingClientRect().height}}));
    result.metrics=metrics;
    assert(metrics.scrollWidth<=metrics.innerWidth+2,'unexpected horizontal overflow');
    assert(metrics.scrollHeight<=metrics.innerHeight+3,'unexpected document vertical scroll');
    assert.equal(errors.length,0,'page errors: '+errors.join(' | '));
    result.passed=true;
   }catch(e){result.passed=false;result.error=String(e?.stack||e);report.failures.push(id+': '+result.error);try{await screenshot(page,id,'failure');}catch{}}
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
