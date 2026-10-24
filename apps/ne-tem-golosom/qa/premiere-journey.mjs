#!/usr/bin/env node
// Browser-level media proof: generate REAL video + audio in Chromium,
// render a multi-actor premiere, decode the output, and check cancellation.
// Requires @playwright/test and its installed Chromium browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/__premiere_qa__'){
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end('<!doctype html><html><body><h1>Premiere media QA</h1></body></html>');return;
 }
 try{
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
  if(!statSync(path).isFile())throw Error('not file');
  res.writeHead(200,{'Content-Type':extname(path)==='.js'?'text/javascript':'application/octet-stream'});
  res.end(readFileSync(path));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const viewport of [{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({
   viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.name==='mobile',
   hasTouch:viewport.name==='mobile'
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/__premiere_qa__');
  const result=await page.evaluate(async()=>{
   const {renderPremiere,voicePlan}=await import('/apps/ne-tem-golosom/premiere-export.js');
   if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)
     return {unsupported:true};
   const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const makeVideo=async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=180;
    const paint=canvas.getContext('2d');
    const stream=canvas.captureStream(24);
    const mime=['video/webm;codecs=vp8','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mime)throw Error('No input-video mime');
    const rec=new MediaRecorder(stream,{mimeType:mime});
    const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    let tick=0;
    const animate=()=>{
     paint.fillStyle=tick%2?'#bd7445':'#406b68';
     paint.fillRect(0,0,320,180);
     paint.fillStyle='#fff6dd';paint.font='bold 44px sans-serif';
     paint.fillText(String(tick++),130,110);
    };
    animate();
    rec.start(300);
    const timer=setInterval(animate,40);
    await sleep(2300);
    clearInterval(timer);
    const stopped=new Promise(resolve=>rec.onstop=resolve);rec.stop();await stopped;
    stream.getTracks().forEach(t=>t.stop());
    return new Blob(chunks,{type:rec.mimeType});
   };
   const makeVoice=async()=>{
    const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination();
    const osc=ctx.createOscillator(),volume=ctx.createGain();
    osc.frequency.value=440;
    volume.gain.value=.22;
    osc.connect(volume).connect(destination);
    const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mime)throw Error('No audio codec');
    const rec=new MediaRecorder(destination.stream,{mimeType:mime});
    const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    await ctx.resume();rec.start(250);osc.start();
    await sleep(1250);
    osc.stop();
    const stopped=new Promise(resolve=>rec.onstop=resolve);
    rec.stop();await stopped;
    destination.stream.getTracks().forEach(t=>t.stop());
    await ctx.close();
    return new Blob(chunks,{type:rec.mimeType});
   };
   const [source,voice]=await Promise.all([makeVideo(),makeVoice()]);
   const lines=[
    {id:'one',owner:'host',blob:voice,start:.12,end:.82,offset:0},
    {id:'two',owner:'guest',blob:voice,start:.73,end:1.4,offset:.15}
   ];
   if(voicePlan(lines,1.5).length!==2)throw Error('Invalid test track');
   const progress=[];
   const output=await renderPremiere({
    source,scene:{title:'Media QA',start:0,duration:1.5},clips:lines,
    onProgress:p=>progress.push(p)
   });
   if(output.size<1500)throw Error('Export is empty');
   const url=URL.createObjectURL(output),video=document.createElement('video');
   video.src=url;video.preload='auto';
   await new Promise((resolve,reject)=>{
    video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Output video not decodable'));
   });
   const hasVideo=video.videoWidth>0&&video.videoHeight>0;
   const exportedDuration=video.duration;
   let audioTrackCount=null;
   if(typeof video.captureStream==='function'){
    await video.play();
    await sleep(200);
    audioTrackCount=video.captureStream().getAudioTracks().length;
    video.pause();
   }
   video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
   const cancel=new AbortController();cancel.abort();
   let wasCancelled=false;
   try{await renderPremiere({source,scene:{start:0,duration:1.5},clips:lines,signal:cancel.signal})}
   catch(e){wasCancelled=e.name==='AbortError'}
   return {sourceBytes:source.size,voiceBytes:voice.size,outputBytes:output.size,
    mime:output.type,hasVideo,exportedDuration,audioTrackCount,
    encodingEvents:progress.filter(x=>x.phase==='encoding').length,
    cancelled:wasCancelled};
  },{timeout:120000});
  if(result.unsupported)throw Error('Browser lacks MediaRecorder or canvas stream support');
  assert(result.hasVideo,viewport.name+': output missing video');
  assert(result.outputBytes>1500,viewport.name+': output is empty');
  assert(result.exportedDuration>=1&&result.exportedDuration<=3.5,viewport.name+': duration wrong');
  assert(result.encodingEvents>0,viewport.name+': progress missing');
  assert(result.cancelled,viewport.name+': cancellation ignored');
  if(result.audioTrackCount!==null)assert(result.audioTrackCount>0,viewport.name+': output has no audio track');
  assert.deepEqual(errors,[],viewport.name+': script errors');
  console.log(viewport.name,result);
  await context.close();
 }
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
