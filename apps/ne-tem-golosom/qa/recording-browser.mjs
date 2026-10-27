#!/usr/bin/env node
// Real browser MediaRecorder with a synthetic microphone; no camera, user
// microphone or external movie is needed. Exercise the shipped editor UI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const path=statSync(file).isDirectory()?join(file,'index.html'):file;
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(path));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const vp of [
  {name:'desktop',width:1366,height:768,mobile:false},
  {name:'android-phone',width:412,height:915,mobile:true},
  {name:'small-phone',width:360,height:720,mobile:true}
 ]){
  const context=await browser.newContext({
   viewport:{width:vp.width,height:vp.height},isMobile:vp.mobile,hasTouch:vp.mobile
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   const media=navigator.mediaDevices;
   Object.defineProperty(media,'getSupportedConstraints',{configurable:true,value:()=>({
    echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:true
   })});
   Object.defineProperty(media,'getUserMedia',{configurable:true,value:async options=>{
    window.__micRequests||=[];
    window.__micRequests.push(options);
    const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();
    osc.type='sine';osc.frequency.value=570;gain.gain.value=.20;
    osc.connect(gain).connect(dest);osc.start();
    await ctx.resume();
    const track=dest.stream.getAudioTracks()[0];
    track.addEventListener('ended',()=>{try{osc.stop()}catch{}void ctx.close()},{once:true});
    return dest.stream;
   }});
  });
  await page.goto(origin+'/apps/ne-tem-golosom/?debug=play&screen=editor',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#screen-editor:not(.hidden)',{timeout:15000});
  // Replace the remote demo film with a small locally recorded movie, so
  // this test does not depend on a public video CDN or a physical device.
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
   const g=canvas.getContext('2d'),stream=canvas.captureStream(15);
   const kind=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!kind)throw Error('Chromium has no WebM video recorder');
   const chunks=[],rec=new MediaRecorder(stream,{mimeType:kind,videoBitsPerSecond:240000});
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   let n=0;const draw=()=>{g.fillStyle=n++%2?'#556677':'#ee9966';g.fillRect(0,0,160,90)};
   draw();const timer=setInterval(draw,70);rec.start();
   await new Promise(resolve=>setTimeout(resolve,3600));
   const done=new Promise(resolve=>rec.onstop=resolve);
   rec.stop();await done;clearInterval(timer);
   stream.getTracks().forEach(track=>track.stop());
   const video=document.getElementById('stage-video');
   window.__qaMovie=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
   video.src=window.__qaMovie;video.load();
   // The debug library scene starts at 44s; map the short synthetic file
   // onto that clock without waiting 44 real seconds for a video fixture.
   const nativeTime=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
   Object.defineProperty(video,'currentTime',{configurable:true,
    get(){return nativeTime.get.call(this)+44},
    set(value){nativeTime.set.call(this,Math.max(0,value-44))}
   });
   Object.defineProperty(video,'duration',{configurable:true,get(){return 60}});
   await new Promise((resolve,reject)=>{
    if(video.readyState>=1)return resolve();
    video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('local test movie unreadable'));
   });
  });
  const checkMic=async()=>{
   const results=await page.evaluate(async()=>{
    const request=window.__micRequests?.at(-1);
    const db=await new Promise((resolve,reject)=>{
     const r=indexedDB.open('pocket-works:ne-tem-golosom:drafts',2);
     r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    const key='debug::solo::wing-launch::44::55';
    const saved=await new Promise((resolve,reject)=>{
     const tx=db.transaction('drafts','readonly');
     const r=tx.objectStore('drafts').get(key);
     r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    db.close();
    if(!saved?.timeline?.assets?.length)return {request,clips:0};
    const ctx=new AudioContext(),durations=[],levels=[];
    for(const blob of saved.timeline.assets){
     const pcm=await ctx.decodeAudioData(await blob.arrayBuffer());
     const samples=pcm.getChannelData(0),step=Math.max(1,Math.floor(samples.length/4000));
     let total=0,n=0;for(let i=0;i<samples.length;i+=step){total+=samples[i]*samples[i];n++}
     durations.push(pcm.duration);levels.push(Math.sqrt(total/n));
    }
    await ctx.close();
    return {request,clips:saved.timeline.clips?.length||0,durations,levels};
   });
   assert.equal(results.request?.audio?.echoCancellation,false,'AEC must be disabled');
   assert.equal(results.request?.audio?.noiseSuppression,false,'noise gate must be disabled');
   assert.equal(results.request?.audio?.autoGainControl,false,'AGC must be disabled');
   assert(results.clips>0,JSON.stringify(results));
   assert(results.durations?.every(x=>x>.3&&x<3),JSON.stringify(results));
   assert(results.levels?.every(x=>x>.015),JSON.stringify(results));
   return results;
  };
  await page.locator('#record-btn').click();
  await page.waitForFunction(()=>document.querySelector('#record-btn')?.classList.contains('recording'),{timeout:10000});
  await page.waitForTimeout(850);
  await page.locator('#record-btn').click();
  await page.waitForFunction(()=>document.querySelectorAll('.clip-bar').length===1,null,{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#draft-status')?.dataset.saveState==='saved',null,{timeout:10000});
  let results=await checkMic();
  // Simulate application switch: the take must be flushed once and the UI
  // unlocked; it must not append an arbitrary silent recording tail.
  await page.locator('#record-btn').click();
  await page.waitForFunction(()=>document.querySelector('#record-btn')?.classList.contains('recording'),null,{timeout:10000});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(()=>document.querySelectorAll('.clip-bar').length>=2,null,{timeout:15000});
  await page.evaluate(()=>{
   delete document.hidden;
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(()=>document.querySelector('#record-btn')?.disabled===false,null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#draft-status')?.dataset.saveState==='saved',null,{timeout:10000});
  results=await checkMic();
  assert(results.clips>=2,'both original and interrupted takes must survive');
  assert.deepEqual(errors,[],vp.name+' page errors');
  console.log(vp.name,'real audio track preserved',JSON.stringify(results.durations));
  await context.close();
 }
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
