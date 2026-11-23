import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const output=process.env.PW_QA_OUTPUT_DIR||process.env.EK_QA_DIR||'/tmp/ek-qa';
await mkdir(output,{recursive:true});
const root=resolve(process.cwd());
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/'))throw Error('path');if((await stat(path)).isDirectory())path=join(path,'index.html');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path))}catch{res.writeHead(404);res.end('Not found')}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const base='http://127.0.0.1:8765/apps/emergent-kingdoms/';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break}catch{}await delay(200)}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const errors=[];
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#play').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#play').disabled);
 await page.screenshot({path:output+'/desktop-initial.png'});
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('#year').textContent==='0001');
 for(const mode of ['terrain','population','culture','fertility','trade','tech','political']){await page.locator('[data-mode="'+mode+'"]').click();assert.equal(await page.locator('[data-mode="'+mode+'"]').getAttribute('aria-pressed'),'true')}
 await page.locator('[data-speed="60"]').click();await page.locator('#play').click();await page.waitForFunction(()=>+document.querySelector('#year').textContent >=120,null,{timeout:60000});await page.locator('#play').click();
 const year=Number(await page.locator('#year').textContent());assert.ok(year>=120);
 assert.ok(await page.locator('#nation-select option').count()>1);
 await page.locator('#nation-select').selectOption({index:1});assert.ok((await page.locator('#details').textContent()).includes('Население'));
 await page.screenshot({path:output+'/desktop-developed.png'});
 await page.locator('#timeline').evaluate(el=>{el.value='50';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.waitForFunction(()=>document.querySelector('#year').textContent==='0050'&&!document.querySelector('#play').disabled);
 await page.locator('#time-lab').click();await page.locator('#fork').click();
 await page.waitForFunction(()=>!document.querySelector('#compare-pane').hidden&&document.querySelector('#compare-label').textContent.includes('50'));
 await page.locator('#p-climate').evaluate(el=>{el.value='-1';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await page.locator('#next').click();
 await page.waitForFunction(()=>document.querySelector('#year').textContent==='0051');
 await page.waitForFunction(()=>document.querySelector('#compare-label').textContent.includes('51'));
 assert.ok((await page.locator('#compare-stats').textContent()).includes('Δ населения'));
 await page.screenshot({path:output+'/desktop-comparison.png'});
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const dl=await downloadPromise;assert.ok(dl.suggestedFilename().endsWith('.json'));await dl.saveAs(output+'/export.json');
 await page.locator('#save').click();await page.locator('#library').click();assert.ok(await page.locator('[data-load]').count()>0);await page.locator('[data-load]').first().click();await page.waitForFunction(()=>document.querySelector('#year').textContent==='0051'&&!document.querySelector('#play').disabled);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#year').textContent==='0051'&&!document.querySelector('#play').disabled);
 assert.deepEqual(errors,[]);
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.goto(base);await mp.waitForFunction(()=>!document.querySelector('#play').disabled);
 assert.ok(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await mp.screenshot({path:output+'/mobile-initial.png'});
 await mp.locator('#time-lab').click();await mp.locator('#p-growth').scrollIntoViewIfNeeded();await mp.screenshot({path:output+'/mobile-lab.png'});
 assert.deepEqual(errors,[]);
 for(const [p,name] of [[page,'DESKTOP'],[mp,'MOBILE']]){const jpg=await p.screenshot({type:'jpeg',quality:35,scale:'css'});const b64=jpg.toString('base64');for(let i=0;i<b64.length;i+=3000)console.log('EK_IMG_'+name+'_'+String(i/3000).padStart(3,'0')+'='+b64.slice(i,i+3000))}
 console.log('PASS: desktop, mobile, 7 modes, play, pause, timeline, branch, intervention, comparison, save, reload, JSON export');
}finally{await browser?.close();server.close()}
