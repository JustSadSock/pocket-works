import {chromium,webkit} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=process.cwd(),out=resolve(process.env.BOW_AUDIT_OUTPUT);
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{let p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+sep))throw Error('path');if(req.url.split('?')[0].endsWith('/'))p=resolve(p,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p))}catch{res.statusCode=404;res.end()}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let failures=[];
try{for(const [name,driver] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await driver.launch();
 try{for(const id of ['bannockburn','agincourt','grunwald']){
  const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out+'/'+name+'-'+id,size:{width:1280,height:800}}}),page=await context.newPage(),errors=[],rounds=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.address().port+'/apps/banners-of-war/');
   await page.locator('#chronicles').click();await page.locator('#chronicle-id').selectOption(id);
   await page.screenshot({path:out+'/'+name+'-'+id+'-brief.png'});
   await page.locator('#chronicle-mode').selectOption('observer');await page.locator('#chronicle-launch').click();
   await page.locator('#map').waitFor({state:'visible'});
   await page.screenshot({path:out+'/'+name+'-'+id+'-start.png'});
   for(let i=0;i<31;i++){
    if((await page.locator('#phase').innerText()).includes('завершено'))break;
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:banners-of-war:battle:1')).state);
    await page.locator('#confirm').click();await page.locator('#confirm').click();
    await page.locator('#playback').waitFor({state:'visible',timeout:120000});
    await page.locator('#speed').selectOption('8');
    await page.waitForFunction(()=>{let e=document.querySelector('#scrub');return Number(e.max)>0&&Number(e.value)===Number(e.max)&&document.querySelector('#pause').textContent==='Играть'},{},{timeout:120000});
    const lastFrame=await page.locator('#scrub').evaluate(e=>Number(e.value));
    await page.locator('#skip').click();await page.locator('#playback').waitFor({state:'hidden',timeout:30000});
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:banners-of-war:battle:1')).state);
    if(after.round!==before.round+1||after.time<=before.time||JSON.stringify(after.units)===JSON.stringify(before.units))throw Error('Round commit mismatch');
    const phase=await page.locator('#phase').innerText();if(after.result?!phase.includes('завершено'):!phase.includes('ожидание'))throw Error('Round phase mismatch: '+phase);
    rounds.push({round:after.round,time:after.time,phase,lastFrame,result:after.result});
   }
   if(!(await page.locator('#phase').innerText()).includes('завершено'))throw Error('No terminal result');
   await page.screenshot({path:out+'/'+name+'-'+id+'-result.png'});
   if(errors.length)throw Error(errors.join(';'));
  }catch(e){failures.push({name,id,error:e.stack});await page.screenshot({path:out+'/'+name+'-'+id+'-failure.png'}).catch(()=>{})}
  finally{await writeFile(out+'/'+name+'-'+id+'-browser.json',JSON.stringify({name,id,kind:'automated observer, full playback 8x, not human playtest',rounds,errors},null,2));await context.close()}
 }}finally{await browser.close()}
}}finally{server.close();await writeFile(out+'/browser-failures.json',JSON.stringify(failures,null,2))}
if(failures.length)throw Error(JSON.stringify(failures));
