// Browser-level verification of real Open-Unmix, hybrid, and SCNet integrated
// with Ne Tem Golosom video encoding. Uses actual pinned ONNX weights.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {handleMrxAsset} from '../../../pocketnet/mrx-assets.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json',
 '.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/ai-assets/')){
   const response=await handleMrxAsset(new Request(url.href));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body)for await(const chunk of response.body)res.write(Buffer.from(chunk));
   return res.end();
  }
  const pathname=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!pathname.startsWith(root+sep)){res.writeHead(403);return res.end()}
  const file=statSync(pathname).isDirectory()?join(pathname,'index.html'):pathname;
  res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(readFileSync(file));
 }catch(e){res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:840}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/apps/ne-tem-golosom/?debug=play&screen=room',{waitUntil:'load'});
 await page.locator('#room-change-scene:not(.hidden)').click();
 const bytes=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  const draw=canvas.getContext('2d');
  const ctx=new AudioContext(),dest=ctx.createMediaStreamDestination();
  const os=ctx.createOscillator(),harmonic=ctx.createOscillator(),gain=ctx.createGain();
  os.frequency.value=440;harmonic.frequency.value=940;
  gain.gain.value=.15;
  os.connect(gain);harmonic.connect(gain);gain.connect(dest);
  const stream=new MediaStream([...canvas.captureStream(12).getTracks(),...dest.stream.getTracks()]);
  const fmt=['video/webm;codecs=vp8,opus','video/webm'].find(MediaRecorder.isTypeSupported);
  if(!fmt)throw Error('Browser cannot record audio/video fixture');
  const recorder=new MediaRecorder(stream,{mimeType:fmt,videoBitsPerSecond:300000});
  const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  draw.fillStyle='#7d765c';draw.fillRect(0,0,320,180);
  await ctx.resume();os.start();harmonic.start();recorder.start(300);
  const ticker=setInterval(()=>{draw.fillStyle='#9b6958';draw.fillRect(Math.random()*100,25,120,80)},170);
  await new Promise(ok=>setTimeout(ok,11000));
  clearInterval(ticker);recorder.stop();await new Promise(ok=>recorder.onstop=ok);
  os.stop();harmonic.stop();stream.getTracks().forEach(t=>t.stop());await ctx.close();
  return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
 });
 const fast=await page.evaluate(async()=>{
  const [{syntheticAACMP4},{extractMp4AAC}]=await Promise.all([
   import('/apps/ne-tem-golosom/qa/aac-fixture.mjs'),
   import('/apps/ne-tem-golosom/mp4-audio.js')
  ]);
  const blob=await syntheticAACMP4();
  const trace=[],before=performance.now();
  const data=await extractMp4AAC(blob,0,.25,{onProgress:p=>trace.push(p.detail)});
  if(!data)return {failed:true,trace,webcodecs:typeof AudioDecoder};
  let energy=0;
  for(let i=0;i<data[0].length;i+=256)energy+=Math.abs(data[0][i]);
  return {length:data[0].length,energy,seconds:(performance.now()-before)/1000};
 });
 assert(fast&&!fast.failed,'real AAC MP4 must use fast demux/decode path: '+JSON.stringify(fast));
 assert.equal(fast.length,Math.round(.25*44100));
 assert(fast.energy>1,'decoded AAC fixture should be audible');
 console.log('Fast MP4 AAC extraction',fast.seconds.toFixed(2),'seconds for 0.25 sec of audio');
 await page.locator('#video-file').setInputFiles({name:'voice-fixture.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});
 await page.waitForSelector('#screen-trim:not(.hidden)',{timeout:20000});
 const options=page.locator('input[name="film-clean-mode"]');
 assert.equal(await options.count(),3);
 assert.equal(await page.locator('input[name="film-clean-mode"]:checked').inputValue(),'umx');
 const labels=await Promise.all(['umx','hybrid','scnet'].map(k=>page.locator('#film-time-'+k).innerText()));
 assert(labels.every(x=>/≈/.test(x)),'all three modes must expose relative time estimates');
 await page.locator('#film-clean-start').click();
 await page.waitForSelector('#media-result:not(.hidden)',{timeout:180000});
 assert.match(await page.locator('#film-clean-status').innerText(),/готов|Готово/);
 const first=await page.locator('#media-output-preview').evaluate(async v=>{
  await new Promise((resolve,reject)=>{
   if(v.readyState>=1)return resolve();
   v.addEventListener('loadedmetadata',resolve,{once:true});
   v.addEventListener('error',()=>reject(Error('encoded video corrupted')),{once:true});
  });
  return {duration:v.duration,width:v.videoWidth};
 });
 assert(first.width>0&&first.duration>9);
 for(const value of ['hybrid','scnet']){
  await page.locator('input[name="film-clean-mode"][value="'+value+'"]').check();
  assert(await page.locator('#media-result').evaluate(el=>el.classList.contains('hidden')),
   'switching model invalidates old encoded result');
  await page.locator('#film-clean-start').click();
  await page.waitForSelector('#media-result:not(.hidden)',{timeout:240000});
  assert.match(await page.locator('#film-clean-status').innerText(),/готов|Готово/);
 }
 // Low-memory pipeline must also finish and yield playable video.
 await page.locator('input[name="film-clean-mode"][value="umx"]').check();
 await page.locator('#film-low-memory').check();
 await page.locator('#film-clean-start').click();
 await page.waitForSelector('#media-result:not(.hidden)',{timeout:240000});
 assert.match(await page.locator('#film-clean-status').innerText(),/готов|Готово/);
 await page.locator('#confirm-scene').click();
 await page.waitForSelector('#screen-room:not(.hidden)',{timeout:20000});
 assert.match(await page.locator('#room-scene-title').innerText(),/voice-fixture/);
 assert.deepEqual(errors,[]);
 console.log('Three real neural soundtrack routes, reusable media and multiplayer handoff passed');
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
