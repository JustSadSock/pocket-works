#!/usr/bin/env node
// Headless editor regression. No live PocketNet account or external film required.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(tmpdir(),'ntg-timeline-journey');
mkdirSync(output,{recursive:true});
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
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 for(const vp of [{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.name==='mobile',hasTouch:vp.name==='mobile'});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.route('https://**/*',route=>route.abort());
  await page.goto(origin+'/apps/ne-tem-golosom/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const req=indexedDB.open('pocket-works:ne-tem-golosom:drafts',2);
   req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts',{keyPath:'key'});
    if(!req.result.objectStoreNames.contains('media'))req.result.createObjectStore('media',{keyPath:'key'});
   };
   const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)});
   const b1=new Blob(['fake-audio-one'],{type:'audio/webm'}),b2=new Blob(['fake-audio-two'],{type:'audio/webm'});
   const key='solo::wing-launch::44::55';
   const scene={id:'wing-launch',title:'WING IT! · ПОЛЁТ',roles:['Кот','Пёс','Курица'],start:44,duration:55,custom:false};
   const record={key,scene,updated:Date.now(),timeline:{
    version:2,assets:[b1,b2],
    clips:[
     {id:'first',start:3,end:8,offset:0,owner:'solo',asset:0},
     {id:'second',start:14,end:21,offset:0,owner:'solo',asset:1}
    ],past:[],future:[],selected:null
   }};
   await new Promise((ok,fail)=>{
    const tx=db.transaction('drafts','readwrite');
    tx.objectStore('drafts').put(record);
    tx.oncomplete=ok;tx.onerror=()=>fail(tx.error);
   });
   db.close();
  });
  await page.locator('#solo-btn').click();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
   await page.locator('input[name="film-sound-choice"][value="original"]').check();
   await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),2,'restores initial clips');
  assert.equal(await page.locator('#draft-status').getAttribute('data-save-state'),'saved','draft status reflects restored editor');
  assert.equal(await page.locator('#mic-meter').isHidden(),true,'voice meter is not a fake idle waveform');
  assert.equal(await page.locator('#countdown').isHidden(),true,'countdown hidden until requested');
  assert.equal(await page.locator('#record-elapsed').innerText(),'00:00','record timer resets before microphone use');

  // A timeupdate must not re-create the focused clip elements.
  assert.equal(await page.locator('#clip-lane').evaluate(el=>{
   const first=el.querySelector('.clip-bar');
   document.querySelector('#stage-video').dispatchEvent(new Event('timeupdate'));
   return first===el.querySelector('.clip-bar');
  }),true,'timeupdate preserves clip DOM');
  assert.equal(await page.locator('#erase-btn').isDisabled(),true,'nothing deleted without explicit selection');
  assert.equal(await page.locator('#record-btn').isEnabled(),true,'instant record is available');
  assert.equal(await page.locator('#count-record-btn').isEnabled(),true,'3-second record is available');
  await page.locator('#timeline-zoom-in').click();
  await page.locator('#timeline-zoom-in').click();
  assert.equal(await page.locator('#timeline-zoom-label').innerText(),'4×');

  // Move a voice clip with a pointer, then trim its right edge.
  await page.evaluate(()=>{
   window.__ntgPointerEvents=[];
   const lane=document.querySelector('#clip-lane');
   ['pointerdown','pointermove','pointerup','click'].forEach(type=>
    lane.addEventListener(type,e=>{
     if(window.__ntgPointerEvents.length<45)window.__ntgPointerEvents.push({
      type,target:e.target?.className,button:e.button,
      clip:e.target?.closest?.('[data-clip]')?.dataset.clip,
      x:e.clientX,y:e.clientY
     });
    },true)
   );
  });
  const before=await page.locator('[data-clip="first"]').evaluate(el=>({
    left:parseFloat(el.style.left),width:parseFloat(el.style.width)
  }));
  await page.locator('[data-clip="first"]').scrollIntoViewIfNeeded();
  let rect=await page.locator('[data-clip="first"]').boundingBox();
  assert(rect&&rect.x>=0&&rect.x+rect.width<=vp.width+2,'zoom must keep the selected clip reachable');
  const hitClip=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-clip]')?.dataset.clip,
   {x:rect.x+rect.width/2,y:rect.y+rect.height/2});
  assert.equal(hitClip,'first','the invisible seek slider must not cover voice clips');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+20,rect.y+rect.height/2,{steps:5});
  await page.mouse.up();
  const moved=await page.locator('[data-clip="first"]').evaluate(el=>({
    left:parseFloat(el.style.left),width:parseFloat(el.style.width)
  }));
  if(!(moved.left>before.left)){
   const diagnostic=await page.evaluate(()=>({
    lane:document.querySelector('#clip-lane').getBoundingClientRect().toJSON(),
    button:document.querySelector('[data-clip="first"]').getBoundingClientRect().toJSON(),
    events:window.__ntgPointerEvents,
    pointerAt:document.elementFromPoint(
     document.querySelector('[data-clip="first"]').getBoundingClientRect().x+40,
     document.querySelector('[data-clip="first"]').getBoundingClientRect().y+15
    )?.outerHTML.slice(0,200)
   }));
   console.log(vp.name,'POINTER_DEBUG',JSON.stringify({before,moved,rect,diagnostic}));
   await page.screenshot({path:join(output,vp.name+'-drag-failure.png'),fullPage:true});
  }
  assert(moved.left>before.left,'drag moves audio in time');
  assert(Math.abs(moved.width-before.width)<0.01,'moving preserves recording length');
  await page.evaluate(()=>{window.__ntgPointerEvents=[]});
  const rightGrip=page.locator('[data-clip="first"] [data-edge="right"]');
  await rightGrip.scrollIntoViewIfNeeded();
  rect=await rightGrip.boundingBox();
  assert(rect&&rect.width>0,'visible right trim grip');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2-22,rect.y+rect.height/2,{steps:5});
  await page.mouse.up();
  const trimmedWidth=await page.locator('[data-clip="first"]').evaluate(el=>parseFloat(el.style.width));
  if(!(trimmedWidth<moved.width))console.log(vp.name,'TRIM_DEBUG',JSON.stringify({before,moved,trimmedWidth,grip:rect,events:await page.evaluate(()=>window.__ntgPointerEvents),hit:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,200),{x:rect.x+rect.width/2,y:rect.y+rect.height/2})}));
  assert(trimmedWidth<moved.width,'dragging grip trims the line');
  assert.equal(await page.locator('#replace-clip-btn').isEnabled(),true,'selected clip can be re-recorded');
  // Main character presets are one click away, without opening the full shelf.
  for(const preset of ['female','male','child','high','deep']){
   const button=page.locator('[data-voice-fx="'+preset+'"]');
   assert.equal(await button.isVisible(),true,'basic voice preset '+preset+' is immediately visible');
   await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'true');
  }
  // Frequently used effects can be pinned without changing the selected take.
  await page.locator('#voice-fx-pin').click();
  assert.equal(await page.locator('#voice-fx-pin').getAttribute('aria-pressed'),'true','selected effect pinned');
  assert.equal(await page.locator('.voice-fx-favorites [data-voice-fx="deep"]').count(),1,'favorites ribbon contains deep voice');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:ne-tem-golosom:favorite-voices')||'[]').includes('deep')),true,'favorites persist locally');
  const geometry=await page.evaluate(()=>{
   const stage=document.querySelector('.stage-wrap').getBoundingClientRect();
   const desk=document.querySelector('.editor-desk').getBoundingClientRect();
   const viewport=document.documentElement.clientHeight;
   return {stage:{top:stage.top,bottom:stage.bottom,height:stage.height},desk:{top:desk.top,bottom:desk.bottom,height:desk.height},viewport};
  });
  assert(geometry.stage.height>=Math.min(115,geometry.viewport*.2),'movie has usable visible area');
  assert(geometry.desk.height>80,'editor controls have usable space');
  assert(geometry.stage.bottom<=geometry.desk.top+3,'movie and timeline are adjacent, no unused gap');

  // All presets have to render distinct audible PCM, not merely update UI.
  if(vp.name==='desktop'){
   const rendered=await page.evaluate(async()=>{
    const {VOICE_EFFECTS,connectVoiceEffect}=await import('./voice-effects.js');
    const rate=14700,length=rate;
    const generated=[];
    for(const effect of VOICE_EFFECTS){
     const ctx=new OfflineAudioContext(1,length,rate),buffer=ctx.createBuffer(1,length,rate);
     const dry=buffer.getChannelData(0);
     for(let i=0;i<length;i++)dry[i]=.16*Math.sin(2*Math.PI*440*i/rate)+.09*Math.sin(2*Math.PI*1700*i/rate);
     const src=ctx.createBufferSource();src.buffer=buffer;
     const output=ctx.createGain();output.connect(ctx.destination);
     connectVoiceEffect(ctx,src,output,effect.id,0);
     src.start(0);
     const pcm=(await ctx.startRendering()).getChannelData(0);
     let sum=0,diff=0;
     for(let i=0;i<length;i++){
      if(!Number.isFinite(pcm[i]))throw Error('Non-finite samples in '+effect.id);
      sum+=pcm[i]*pcm[i];
      diff+=(pcm[i]-dry[i])**2;
     }
     generated.push({id:effect.id,rms:Math.sqrt(sum/length),difference:Math.sqrt(diff/length)});
    }
    return generated;
   });
   assert.equal(rendered.length,22,'all 22 presets render PCM in a real browser');
   const pitchMeasurements=await page.evaluate(async()=>{
    const {connectVoiceEffect}=await import('./voice-effects.js');
    const rate=14700,seconds=1.05,sourceHz=230;
    const score=(samples,frequency)=>{
     let re=0,im=0;
     for(let i=Math.round(rate*.24);i<Math.round(rate*.9);i++){
      const phase=2*Math.PI*frequency*i/rate;
      re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase);
     }
     return Math.hypot(re,im);
    };
    const answer=[];
    for(const [id,semitones] of [['female',4],['male',-4],['child',7],['high',3],['deep',-6]]){
     const ctx=new OfflineAudioContext(1,Math.round(rate*seconds),rate),buffer=ctx.createBuffer(1,Math.round(rate*seconds),rate);
     const input=buffer.getChannelData(0);
     for(let i=0;i<input.length;i++)input[i]=.18*Math.sin(2*Math.PI*sourceHz*i/rate);
     const src=ctx.createBufferSource();src.buffer=buffer;
     const end=ctx.createGain();end.connect(ctx.destination);
     connectVoiceEffect(ctx,src,end,id,0);src.start(0);
     const output=(await ctx.startRendering()).getChannelData(0),target=sourceHz*Math.pow(2,semitones/12);
     answer.push({id,targetScore:score(output,target),originalScore:score(output,sourceHz)});
    }
    return answer;
   });
   console.log('PITCH_METRICS',JSON.stringify(pitchMeasurements));
   for(const result of pitchMeasurements){
    assert(result.targetScore>result.originalScore*1.15,
     'pitch '+result.id+' must shift tone instead of only equalizing it; scores '+JSON.stringify(result));
   }
   for(const effect of rendered){
    assert(effect.rms>.003,'effect '+effect.id+' must not mute the voice');
    if(effect.id!=='clean')assert(effect.difference>.004,'effect '+effect.id+' must audibly change voice');
   }
  }

  assert.equal(await page.locator('#voice-effects').isVisible(),true,'voice effect strip appears for selected clip');
  await page.locator('#voice-fx-more').click();
  assert.equal(await page.locator('#voice-fx-more').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#voice-fx-extra').isVisible(),true);
  await page.locator('[data-voice-fx="alien"]').click();
  assert.equal(await page.locator('[data-voice-fx="alien"]').getAttribute('aria-pressed'),'true','new alien preset applies');
  assert.match(await page.locator('#voice-fx-current').innerText(),/Пришелец/);
  assert.equal(await page.locator('#voice-fx-audition').isEnabled(),true,'one-tap preview is available');
  await page.locator('[data-voice-fx="radio"]').click();
  assert.equal(await page.locator('[data-voice-fx="radio"]').getAttribute('aria-pressed'),'true','radio effect applies to selected clip');
  await page.locator('[data-voice-fx="clean"]').click();
  assert.equal(await page.locator('[data-voice-fx="clean"]').getAttribute('aria-pressed'),'true','original voice can be restored without re-recording');
  await page.locator('#timeline-zoom-in').click();
  await page.locator('#timeline-zoom-in').click();
  assert.equal(await page.locator('#timeline-zoom-label').innerText(),'16×','timeline zoom supports precise editing');
  await page.locator('#timeline-zoom-out').click();
  await page.locator('#timeline-zoom-out').click();

  await page.locator('#undo-btn').click();
  await page.locator('#undo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),2,'drag and trim both reversible');

  // The three-second control can always be cancelled without opening the mic.
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,
      value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  });
  await page.locator('#count-record-btn').click();
  await page.locator('#countdown').waitFor({state:'visible'});
  await page.locator('#count-record-btn').click();
  await page.locator('#countdown').waitFor({state:'hidden'});
  assert.equal(await page.locator('#record-btn').isEnabled(),true,'cancelled countdown unlocks instant recording');

  await page.locator('[data-clip="first"]').click();
  assert.equal(await page.locator('#erase-btn').isEnabled(),true);
  await page.locator('#erase-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),1);
  await page.locator('#draft-status[data-save-state="saved"]').waitFor({timeout:8000});
  await page.locator('#undo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),2);
  await page.locator('#redo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),1);
  await page.screenshot({path:join(output,vp.name+'-redo.png')});

  await page.locator('#editor-leave').click();
  await page.locator('#screen-library:not(.hidden)').waitFor();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
   await page.locator('input[name="film-sound-choice"][value="original"]').check();
   await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),1,'draft survives navigation');
  assert.equal(await page.locator('#undo-btn').isEnabled(),true,'history survives navigation');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#solo-btn').click();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
   await page.locator('input[name="film-sound-choice"][value="original"]').check();
   await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),1,'draft survives full reload');
  assert.equal(await page.locator('#undo-btn').isEnabled(),true,'undo stack survives reload');
  await page.locator('#undo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),2);
  assert.deepEqual(errors,[],vp.name+' must have no JS errors');
  console.log(vp.name,'timeline journey passed');
  await ctx.close();
 }
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
