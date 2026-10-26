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
 await page.evaluate(()=>{
  window.__monitorStarted=false;
  document.getElementById('monitor').addEventListener('playing',()=>{window.__monitorStarted=true},{once:true});
 });
 await page.locator('#listen-btn').click();
 await page.waitForFunction(()=>window.__monitorStarted===true,null,{timeout:9000});
 assert.equal(await page.locator('#result-video').evaluate(v=>v.muted),true);
 await page.locator('#listen-btn').click();
 assert(await page.locator('#result-video').isVisible());
 const downloaded=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 const output=await downloaded;
 assert.match(output.suggestedFilename(),/no-dialogue\.wav$/);

 // Force native video unmute and prove its soundtrack cannot leak.
 await page.evaluate(()=>{
  const v=document.getElementById('result-video');
  v.muted=false;v.volume=1;
 });
 // HTMLMediaElement.volumechange is asynchronous; wait for the lock event.
 await page.waitForFunction(()=>{
  const v=document.getElementById('result-video');
  return v.muted&&v.volume===0;
 },null,{timeout:3500});
 await page.locator('#speech-btn').click();
 const speechDownload=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await speechDownload).suggestedFilename(),/isolated-dialogue\.wav$/);
 await page.locator('#stems-btn').click();
 const effectsDownload=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await effectsDownload).suggestedFilename(),/music-effects\.wav$/);
 assert.match(await page.locator('#stem-diagnostics').innerText(),/Выделенная речь/);
 assert.equal(await page.locator('#center-suppression').isDisabled(),false);
 await page.locator('#center-suppression').fill('45');
 assert.equal(await page.locator('#center-value').innerText(),'45%');
 const boosted=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await boosted).suggestedFilename(),/music-effects\.wav$/);

 // Manual model import: reuse ACTUAL MRX-generated WAV as a known audio
 // fixture. Name the route "other", never claim DnR/SAM inference was run.
 const sourceDownload=page.waitForEvent('download',{timeout:25000});
 await page.locator('#study-source-wav').click();
 assert.match((await sourceDownload).suggestedFilename(),/source\.wav$/);
 await page.locator('#study-method').selectOption('other');
 await page.locator('#study-me-file').setInputFiles({
  name:'external-me.wav',mimeType:'audio/wav',buffer:readFileSync(await output.path())
 });
 await page.locator('#study-import').click();
 await page.waitForFunction(()=>document.querySelector('#study-import-status').textContent.includes('Импортировано.'),null,{timeout:18000});
 assert.match(await page.locator('#result-state').innerText(),/Другой алгоритм/);
 assert((await page.locator('.study-choice').count())>=2);
 const csvExport=page.waitForEvent('download',{timeout:25000});
 await page.locator('#study-csv').click();
 assert.match((await csvExport).suggestedFilename(),/methods\.csv$/);
 // Real 6-channel PCM, center carries a synthetic dialogue signal.
 const surroundBuffer=Buffer.alloc(44+8000*6*2);
 surroundBuffer.write('RIFF',0);surroundBuffer.writeUInt32LE(surroundBuffer.length-8,4);
 surroundBuffer.write('WAVEfmt ',8);surroundBuffer.writeUInt32LE(16,16);
 surroundBuffer.writeUInt16LE(1,20);surroundBuffer.writeUInt16LE(6,22);
 surroundBuffer.writeUInt32LE(8000,24);surroundBuffer.writeUInt32LE(8000*12,28);
 surroundBuffer.writeUInt16LE(12,32);surroundBuffer.writeUInt16LE(16,34);
 surroundBuffer.write('data',36);surroundBuffer.writeUInt32LE(8000*12,40);
 for(let i=0;i<8000;i++)for(let ch=0;ch<6;ch++){
  const value=(ch===2?.6:.14)*Math.sin(2*Math.PI*(ch===2?600:120+ch*90)*i/8000);
  surroundBuffer.writeInt16LE(Math.round(value*32767),44+i*12+ch*2);
 }
 await page.locator('#study-surround-file').setInputFiles({
  name:'surround-5.1.wav',mimeType:'audio/wav',buffer:surroundBuffer
 });
 await page.waitForFunction(()=>document.querySelector('#study-surround-status').textContent.includes('6 каналов'),null,{timeout:18000});
 assert.match(await page.locator('#result-state').innerText(),/5\.1/);
 await page.locator('#study-center-gain').fill('30');
 assert.equal(await page.locator('#study-center-value').innerText(),'30%');
 const surroundWav=page.waitForEvent('download',{timeout:25000});
 await page.locator('#wav-btn').click();
 assert.match((await surroundWav).suggestedFilename(),/no-dialogue\.wav$/);
 // Activating the MRX result after independent alternative tests still works.
 await page.locator('.study-choice').first().click();
 assert.match(await page.locator('#result-state').innerText(),/5\.1|MRX|Другой/);

 assert.deepEqual(runtimeErrors,[]);
 console.log('Real Chromium MRX preview, speech, M&E exports verified:',await page.locator('#inference-time').innerText());
}finally{await browser.close();await new Promise(r=>server.close(r))}
