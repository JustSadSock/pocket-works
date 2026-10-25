// Headless real-browser test: generated video with actual sound -> MRX ONNX -> WAV.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {extname,resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),file=resolve(root,'.'+decodeURIComponent(url.pathname));
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
 assert.equal(await page.title(),'Тихий кадр · MRX лаборатория');
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
 await page.locator('#process-btn').click();
 const result=await Promise.race([
  page.waitForSelector('#result-details:not(.hidden)',{timeout:180000}).then(()=>true),
  page.waitForSelector('#error:not(.hidden)',{timeout:180000}).then(()=>false)
 ]);
 if(!result)throw Error('MRX failure: '+await page.locator('#error').innerText());
 assert.match(await page.locator('#inference-time').innerText(),/с|мин/);
 assert.match(await page.locator('#speed-factor').innerText(),/×/);
 assert(await page.locator('#result-video').isVisible());
 const downloaded=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 const output=await downloaded;
 assert.match(output.suggestedFilename(),/no-dialogue\.wav$/);
 assert.deepEqual(runtimeErrors,[]);
 console.log('Real Chromium MRX split on synthetic video succeeded:',await page.locator('#inference-time').innerText());
}finally{await browser.close();await new Promise(r=>server.close(r))}
