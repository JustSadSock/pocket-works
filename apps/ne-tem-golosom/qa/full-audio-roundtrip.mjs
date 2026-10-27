#!/usr/bin/env node
// Full production UI journey: local movie -> trim -> mute/review -> editor
// -> real MediaRecorder microphone -> saved take -> premiere -> export ->
// playable movie with measured nonzero voice audio. No PocketNet dependency.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{
  const full=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(full!==root&&!full.startsWith(root+sep))return res.writeHead(403).end();
  const file=statSync(full).isDirectory()?join(full,'index.html'):full;
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(readFileSync(file));
 }catch{res.writeHead(404).end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const vp of [{name:'desktop',width:1366,height:768},{name:'phone',width:390,height:844,mobile:true}]){
  const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:!!vp.mobile,hasTouch:!!vp.mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text())});
  await page.addInitScript(()=>{
   const media=navigator.mediaDevices;
   Object.defineProperty(media,'getSupportedConstraints',{configurable:true,value:()=>({
    echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:true
   })});
   Object.defineProperty(media,'getUserMedia',{configurable:true,value:async options=>{
    window.__testedMicRequest=options;
    const ctx=new AudioContext(),tone=ctx.createOscillator(),g=ctx.createGain(),dest=ctx.createMediaStreamDestination();
    tone.frequency.value=750;g.gain.value=.23;tone.connect(g).connect(dest);
    await ctx.resume();tone.start();
    const track=dest.stream.getAudioTracks()[0];
    track.addEventListener('ended',()=>{try{tone.stop()}catch{}void ctx.close().catch(()=>{})},{once:true});
    return dest.stream;
   }});
  });
  await page.goto(origin+'/apps/ne-tem-golosom/',{waitUntil:'domcontentloaded'});
  await page.locator('#solo-btn').click();
  await page.locator('#video-file').setInputFiles({
   name:'end-to-end-cinema.webm',mimeType:'video/webm',
   buffer:Buffer.from(await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=180;
    const draw=canvas.getContext('2d'),ctx=new AudioContext(),dest=ctx.createMediaStreamDestination();
    const osc=ctx.createOscillator(),g=ctx.createGain();
    osc.frequency.value=260;g.gain.value=.09;osc.connect(g).connect(dest);
    const stream=new MediaStream([...canvas.captureStream(15).getTracks(),...dest.stream.getTracks()]);
    const mime=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(MediaRecorder.isTypeSupported);
    if(!mime)throw Error('Test browser does not support video recording');
    const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:230000});
    const parts=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
    let count=0;const paint=()=>{
     draw.fillStyle=count++%2?'#668887':'#bd9576';draw.fillRect(0,0,320,180);
     draw.fillStyle='white';draw.font='bold 32px sans-serif';draw.fillText('TAKE '+count,55,95);
    };
    paint();const interval=setInterval(paint,90);
    await ctx.resume();osc.start();rec.start();
    await new Promise(resolve=>setTimeout(resolve,11200));
    const stop=new Promise(resolve=>rec.onstop=resolve);rec.stop();await stop;
    clearInterval(interval);osc.stop();stream.getTracks().forEach(t=>t.stop());await ctx.close();
    return Array.from(new Uint8Array(await new Blob(parts,{type:mime}).arrayBuffer()));
   }))
  });
  await page.waitForSelector('#screen-trim:not(.hidden)',{timeout:20000});
  await page.locator('#trim-range-handle-end').focus();
  await page.locator('#trim-range-handle-end').press('Home');
  assert.equal(await page.locator('#trim-length').inputValue(),'10');
  await page.locator('#confirm-scene').click();
  await page.locator('input[name="film-sound-choice"][value="mute"]').check();
  await page.locator('#media-render').click();
  await page.waitForSelector('#film-review:not(.hidden)',{timeout:60000});
  assert(await page.locator('#media-output-preview').isVisible(),'processed preview visible');
  await page.locator('#confirm-scene').click();
  await page.waitForSelector('#screen-editor:not(.hidden)',{timeout:12000});
  assert.equal(await page.locator('#record-btn').isDisabled(),false);
  await page.locator('#record-btn').click();
  await page.waitForFunction(()=>document.querySelector('#record-btn')?.classList.contains('recording'),null,{timeout:12000});
  await page.waitForTimeout(1300);
  await page.locator('#record-btn').click();
  await page.waitForSelector('.clip-bar',{timeout:15000});
  await page.locator('#draft-status[data-save-state="saved"]').waitFor({timeout:8000});
  const micOpts=await page.evaluate(()=>window.__testedMicRequest);
  assert.equal(micOpts.audio.noiseSuppression,false,'real microphone session requests no destructive gating');
  await page.locator('.clip-bar').first().click();
  await page.locator('#clip-volume').evaluate(e=>{e.value='150';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.locator('#draft-status[data-save-state="saved"]').waitFor({timeout:8000});
  await page.locator('#finish-btn').click();
  await page.waitForSelector('#screen-premiere:not(.hidden)',{timeout:15000});
  assert(await page.locator('#premiere-play').isEnabled(),'premiere playback is available');
  assert(await page.locator('#premiere-export').isEnabled(),'final assembly is available');
  await page.locator('#premiere-export').click();
  await page.waitForSelector('#premiere-export-result:not(.hidden)',{timeout:70000});
  const output=await page.locator('#premiere-export-download').evaluate(async a=>{
   const response=await fetch(a.href),blob=await response.blob();
   const v=document.createElement('video'),url=URL.createObjectURL(blob);
   v.preload='auto';v.playsInline=true;v.src=url;
   await new Promise((resolve,reject)=>{
    v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('Export media cannot be decoded'));
    v.load();
   });
   const meta={size:blob.size,mime:blob.type,width:v.videoWidth,height:v.videoHeight,duration:v.duration};
   const ctx=new AudioContext(),src=ctx.createMediaElementSource(v),analyser=ctx.createAnalyser(),silent=ctx.createGain();
   analyser.fftSize=1024;silent.gain.value=0;
   src.connect(analyser).connect(silent).connect(ctx.destination);
   await ctx.resume();v.currentTime=.08;await v.play();
   const data=new Float32Array(1024);let peak=0;
   for(let i=0;i<12;i++){
    await new Promise(resolve=>setTimeout(resolve,85));
    analyser.getFloatTimeDomainData(data);
    let energy=0;for(const value of data)energy+=value*value;
    peak=Math.max(peak,Math.sqrt(energy/data.length));
   }
   v.pause();await ctx.close();URL.revokeObjectURL(url);
   return {...meta,rms:peak};
  });
  assert(output.size>3000&&output.width>0&&output.height>0,JSON.stringify(output));
  assert(output.duration>9&&output.duration<12,JSON.stringify(output));
  assert(output.rms>.008,'Export contains actual recorded microphone audio '+JSON.stringify(output));
  assert.deepEqual(errors,[],vp.name+' unexpected browser errors');
  console.log(vp.name,'real end-to-end movie with voice',JSON.stringify(output));
  await context.close();
 }
}finally{await browser.close();await new Promise(ok=>server.close(ok))}
