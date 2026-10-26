// Headless real-browser test: generated video with actual sound -> MRX ONNX -> WAV.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {extname,resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleMrxAsset} from '../../../pocketnet/mrx-assets.mjs';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(url.pathname.startsWith('/ai-assets/')){
   const upstream=await handleMrxAsset(new Request(url.href));
   res.writeHead(upstream.status,Object.fromEntries(upstream.headers));
   if(upstream.body)for await(const chunk of upstream.body)res.write(Buffer.from(chunk));
   return res.end();
  }
  if(!file.startsWith(root+sep)){res.writeHead(403);return res.end()}
  const path=statSync(file).isDirectory()?join(file,'index.html'):file;
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(path));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,args:['--enable-features=SharedArrayBuffer']});
const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
const runtimeErrors=[];
page.on('pageerror',e=>runtimeErrors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')console.error('[browser]',msg.text().slice(0,600))});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/apps/tihiy-kadr/',{waitUntil:'load'});
 assert.equal(await page.title(),'Тихий кадр · удаление диалогов');
 const bytes=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  const c=canvas.getContext('2d'),ctx=new AudioContext(),dest=ctx.createMediaStreamDestination();
  const oscillator=ctx.createOscillator(),gain=ctx.createGain();
  oscillator.frequency.value=440;gain.gain.value=.12;oscillator.connect(gain);gain.connect(dest);
  const stream=new MediaStream([...canvas.captureStream(20).getTracks(),...dest.stream.getTracks()]);
  const mime=['video/webm;codecs=vp8,opus','video/webm'].find(MediaRecorder.isTypeSupported);
  if(!mime)throw Error('Chromium has no video recorder');
  const recorder=new MediaRecorder(stream,{mimeType:mime});const parts=[];
  recorder.ondataavailable=e=>parts.push(e.data);
  const done=new Promise(r=>recorder.onstop=r);
  const start=performance.now();const draw=setInterval(()=>{c.fillStyle='#182f40';c.fillRect(0,0,320,180);c.fillStyle='#ea964e';c.fillRect(40+(performance.now()-start)/15,65,42,42)},40);
  await ctx.resume();recorder.start(300);oscillator.start();
  await new Promise(r=>setTimeout(r,2100));
  recorder.stop();await done;clearInterval(draw);oscillator.stop();
  stream.getTracks().forEach(t=>t.stop());await ctx.close();
  return [...new Uint8Array(await new Blob(parts).arrayBuffer())];
 });
 await page.locator('#file-input').setInputFiles({name:'fixture.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});
 try{
  await page.waitForFunction(()=>!document.querySelector('#process-btn').disabled,null,{timeout:15000});
 }catch{
  const diagnostics=await page.evaluate(()=>({
   uiError:document.querySelector('#error').textContent,
   hasError:!document.querySelector('#error').classList.contains('hidden'),
   duration:document.querySelector('#source-video').duration,
   ready:document.querySelector('#source-video').readyState,
   mediaError:document.querySelector('#source-video').error?.message,
   file:document.querySelector('#file-detail').textContent
  }));
  throw Error('Video fixture setup failed: '+JSON.stringify(diagnostics));
 }
 await page.locator('#duration-seconds').fill('1');
 assert.equal(await page.locator('#quality-mode').inputValue(),'umxhq-direct');
 assert.equal(await page.locator('#quality-mode option').count(),2);
 await page.locator('#process-btn').click();
 const ready=await Promise.race([
  page.waitForSelector('#result-details:not(.hidden)',{timeout:180000}).then(()=>true),
  page.waitForSelector('#error:not(.hidden)',{timeout:180000}).then(()=>false)
 ]);
 if(!ready)throw Error('Open-Unmix ONNX failure: '+await page.locator('#error').innerText());
 await page.waitForFunction(()=>document.querySelector('#result-state').textContent.includes('Open-Unmix'),null,{timeout:10000});
 assert.equal(await page.locator('#result-video').evaluate(v=>v.muted),true);
 await page.evaluate(()=>{
  window.__monitorStarted=false;
  document.getElementById('monitor').addEventListener('playing',()=>{window.__monitorStarted=true},{once:true});
 });
 await page.locator('#listen-btn').click();
 await page.waitForFunction(()=>window.__monitorStarted===true,null,{timeout:9000});
 await page.locator('#listen-btn').click();
 const firstWav=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await firstWav).suggestedFilename(),/no-dialogue\.wav$/);
 await page.locator('#speech-btn').click();
 const removed=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await removed).suggestedFilename(),/isolated-dialogue\.wav$/);
 await page.locator('#clean-btn').click();
 await page.locator('#scnet-strength').fill('60');
 await page.waitForTimeout(450);
 assert.equal(await page.locator('#scnet-strength-value').innerText(),'60%');
 await page.locator('#quality-mode').selectOption('scnet-direct');
 await page.locator('#process-btn').click();
 await page.waitForFunction(()=>document.querySelector('#result-state').textContent==='SCNet',null,{timeout:180000});
 assert.equal(await page.locator('#study-results .study-choice').count(),2);
 await page.locator('#study-results .study-choice strong').filter({hasText:'Open-Unmix UMX-HQ'}).click();
 assert.equal(await page.locator('#result-state').innerText(),'Open-Unmix UMX-HQ');
 await page.locator('#study-results .study-choice strong').filter({hasText:'SCNet'}).click();
 assert.equal(await page.locator('#result-state').innerText(),'SCNet');
 const csv=page.waitForEvent('download',{timeout:25000});
 await page.locator('#study-csv').click();
 assert.match((await csv).suggestedFilename(),/two-models\.csv$/);
 await page.locator('#process-btn').click();
 await page.waitForFunction(()=>document.querySelector('#progress-heading').textContent==='Готово',null,{timeout:10000});
 assert.equal(await page.locator('#study-results .study-choice').count(),2);
 assert.deepEqual(runtimeErrors,[]);
 console.log('Real Chromium Open-Unmix and SCNet direct routes, monitoring, export, cache and A/B passed');
}finally{await browser.close();await new Promise(r=>server.close(r))}
