// Capture real gameplay covers from isolated production-like Pocket Works runtimes.
// A game may opt into ?pw-cover=1 and window.PocketWorksCover.prepare({index}).
// AI, when configured, only reviews actual frames; it never generates cover art.
import {chromium} from '@playwright/test';
import {readFile, mkdir, writeFile, stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {shouldCaptureCover, scoreCoverMetrics, chooseCover, parseVisionDecision} from './cover-intelligence.mjs';
import {enterCoverGameplay} from './cover-gameplay-entry.mjs';

const root=process.cwd(),out=path.join(root,'covers');
// Versioned entry logic permits one retry of previously failed games without
// recapturing already accepted art every night.
const CAPTURE_ENGINE='safe-gameplay-v3';
const limit=Math.max(1,Math.min(24,Number(process.env.PW_COVER_LIMIT)||12));
const shots=Math.max(3,Math.min(8,Number(process.env.PW_COVER_SHOTS)||5));
const slugArg=(process.env.PW_COVER_SLUGS||'').split(',').map(x=>x.trim()).filter(Boolean);
// A one-time library refresh attempts each existing app once, even if its
// current revision already has a cover. New attempts are timestamped, so
// later batches never recapture the same app endlessly.
const refreshBefore=Date.parse(process.env.PW_COVER_REFRESH_BEFORE||'');
const registry=JSON.parse(await readFile(path.join(root,'dist-site/apps.json'),'utf8'));
const candidates=registry.filter(a=>/^[a-z0-9-]+$/.test(a.slug));
await mkdir(out,{recursive:true});
const manifestPath=path.join(out,'manifest.json');
let manifest={};
try{
  const saved=JSON.parse(await readFile(manifestPath,'utf8'));
  if(saved && typeof saved==='object' && !Array.isArray(saved))manifest=saved;
}catch{}
const exists=async slug=>{
  try{await stat(path.join(out,slug+'.jpg'));return true;}catch{}
  for(const ext of ['png','webp','jpeg']){
    try{await stat(path.join(out,slug+'.'+ext));return true;}catch{}
  }
  return false;
};
function revisionFor(app){
  try{
    const value=execFileSync('git',['log','-1','--format=%H','--','apps/'+app.slug],{cwd:root,encoding:'utf8',timeout:4500}).trim();
    if(/^[a-f0-9]{40}$/.test(value))return value;
  }catch{}
  return createHash('sha256').update(JSON.stringify([app.slug,app.version,app.updatedAt])).digest('hex');
}
const updates=[];
for(const app of candidates){
  const revision=revisionFor(app);
  const present=await exists(app.slug);
  const record=manifest[app.slug];
  const needsLibraryRefresh=Number.isFinite(refreshBefore)&&refreshBefore>0 &&
    !record?.pinned && !(Date.parse(record?.lastAttemptAt||'')>=refreshBefore);
  const upgradedFailed=record?.status==='failed' &&
    record?.captureEngine!==CAPTURE_ENGINE && !record?.pinned;
  if(shouldCaptureCover({record,revision,exists:present,
    forced:slugArg.includes(app.slug)||needsLibraryRefresh||upgradedFailed})){
    updates.push({app,revision,present});
  }
}
const desired=slugArg.length?updates.filter(x=>slugArg.includes(x.app.slug)):updates;
desired.sort((a,b)=>{
  // Recently changed apps take priority; earlier failures are retried after cooldown.
  const aTime=String(a.app.updatedAt||''),bTime=String(b.app.updatedAt||'');
  return bTime.localeCompare(aTime);
});
const targets=desired.slice(0,limit);
const captured=[],failures=[],preserved=[];
let server=null;

async function frameMetrics(page,bytes){
  return page.evaluate(async base64=>{
    const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([data],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');
    const width=64,height=64;
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,width,height);
    bitmap.close?.();
    const pixels=ctx.getImageData(0,0,width,height).data;
    const lum=[],hist=new Array(16).fill(0);
    let sum=0,sumSq=0,colorfulness=0,edges=0,total=0;
    let centerSum=0,centerSq=0,centerCount=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      const l=.2126*r+.7152*g+.0722*b;
      lum.push(l);sum+=l;sumSq+=l*l;
      colorfulness+=Math.max(r,g,b)-Math.min(r,g,b);
      hist[Math.min(15,Math.floor(l/16))]++;
      if(x>=16&&x<48&&y>=16&&y<48){
        centerSum+=l;centerSq+=l*l;centerCount++;
      }
      if(x>0){total++;if(Math.abs(l-lum[lum.length-2])>19)edges++;}
      if(y>0){total++;if(Math.abs(l-lum[(y-1)*width+x])>19)edges++;}
    }
    const count=width*height,mean=sum/count;
    const entropy=-hist.reduce((acc,n)=>{
      const p=n/count;return acc+(p?p*Math.log2(p):0);
    },0);
    return {bytes:data.length,variance:Math.sqrt(Math.max(0,sumSq/count-mean*mean)),
      entropy,edgeDensity:edges/Math.max(1,total),colorfulness:colorfulness/count,
      centerDetail:Math.sqrt(Math.max(0,centerSq/centerCount-(centerSum/centerCount)**2)),
      meanLight:mean};
  },bytes.toString('base64'));
}

async function reviewWithVision(app,frames,oldFrame){
  if(!process.env.OPENAI_API_KEY)return null;
  const all=oldFrame?[...frames,oldFrame]:frames;
  try{
    const content=[{type:'text',text:
      'You are selecting an HONEST screenshot cover for the actual browser game "'+app.name+'". '+String(app.description||'').slice(0,350)+
      '. Images are numbered 0 through '+(all.length-1)+'. Pick the most attractive, legible actual GAMEPLAY view '+
      'at thumbnail size. Penalize title menus, loading screens, errors, blank space, obstructing UI, and misleading states. '+
      'The final image is a real screenshot; no image generation. Return JSON only: '+
      '{"best":0,"scores":[0-100 for every image],"reject":[indexes of clearly unusable frames]}. '+
      'If the last image is an existing cover, prefer keeping it over a worse replacement.'}];
    all.forEach((frame,i)=>{
      content.push({type:'text',text:'Screenshot '+i});
      content.push({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+frame.bytes.toString('base64'),detail:'low'}});
    });
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:process.env.PW_COVER_VISION_MODEL||'gpt-4.1-mini',
        temperature:0,max_completion_tokens:300,messages:[{role:'user',content}]})
    });
    if(!response.ok)throw Error('vision API HTTP '+response.status);
    const data=await response.json();
    const raw=data.choices?.[0]?.message?.content;
    const decision=parseVisionDecision(raw,all.length);
    if(!decision)throw Error('invalid vision response');
    return decision;
  }catch(error){
    console.warn('Cover vision review unavailable for '+app.slug+': '+String(error.message).slice(0,120));
    return null;
  }
}

const recordResult=(slug,revision,status,detail={})=>{
  const prior=manifest[slug]||{};
  manifest[slug]={...prior,...detail,status,captureEngine:CAPTURE_ENGINE,lastAttemptRevision:revision,lastAttemptAt:new Date().toISOString()};
};

try{
  if(targets.length){
    server=spawn(process.execPath,['scripts/serve-site.mjs'],{
      cwd:root,env:{...process.env,PORT:'4173'},stdio:'ignore'
    });
    let healthy=false;
    for(let i=0;i<60;i++){
      try{if((await fetch('http://127.0.0.1:4173/apps.json')).ok){healthy=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!healthy)throw Error('Preview server did not start');
    const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
    try{
      for(const {app,revision,present} of targets){
        const landscape=app.orientation==='landscape';
        const viewport=landscape?{width:844,height:390}:{width:390,height:760};
        const context=await browser.newContext({
          viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,
          reducedMotion:'reduce',serviceWorkers:'block',permissions:[]
        });
        const page=await context.newPage();
        try{
          const url='http://127.0.0.1:4173/apps/'+encodeURIComponent(app.slug)+'/?pw-cover=1';
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
          await page.waitForTimeout(app.runtime==='godot'?6000:1600);
          // Give slow-rendering game engines a bounded opportunity to announce
          // a staged scene before falling back to regular timed screenshots.
          await page.waitForFunction(()=>Boolean(window.PocketWorksCover ||
            document.documentElement.dataset.pwCoverReady==='true'),null,
            {timeout:app.runtime==='godot'?2500:3500}).catch(()=>{});
          // Only game-authored hooks may enter a demonstration scene. Never automate
          // unrelated buttons or join public multiplayer rooms.
          const prepared=await page.evaluate(()=>Boolean(window.PocketWorksCover ||
            document.documentElement.dataset.pwCoverReady==='true'));
          // The game itself has priority. Older apps without a capture hook
          // enter only explicit/local solo gameplay, never PocketNet sessions.
          const entry=prepared?{started:false,actions:[]}:await enterCoverGameplay(page);
          const frameList=[];
          for(let index=0;index<shots;index++){
            if(prepared){
              await page.evaluate(async index=>{
                const hook=window.PocketWorksCover;
                if(typeof hook?.prepare==='function')await hook.prepare({index});
              },index);
            }
            await page.waitForTimeout(index===0?450:1250);
            const bytes=await page.screenshot({type:'jpeg',quality:83,animations:'disabled',timeout:20000});
            const metrics=await frameMetrics(page,bytes);
            const quality=scoreCoverMetrics(metrics);
            frameList.push({index,bytes,metrics,quality,prepared,started:entry.started});
          }
          const available=frameList.filter(x=>x.quality.pass);
          if(!available.length){
            const best=frameList.slice().sort((a,b)=>b.quality.score-a.quality.score)[0];
            recordResult(app.slug,revision,'failed',{
              note:'No frame passed image-content checks',
              diagnostic:{
                bestScore:best?.quality.score??0,
                qualityReasons:best?.quality.reasons||[],
                metrics:best?.metrics||null,
                gameplayEntry:entry,
                url:page.url()
              }
            });
            failures.push({slug:app.slug,error:'No frame passed image-content checks',
              reasons:best?.quality.reasons||[],entry:entry.actions});
            continue;
          }
          let oldFrame=null;
          if(present){
            for(const ext of ['jpg','png','webp','jpeg']){
              try{
                const original=await readFile(path.join(out,app.slug+'.'+ext));
                // Always convert the older image to JPEG before a side-by-side
                // evaluation, including genuine png/webp covers.
                const base64=await page.evaluate(async({image,mime})=>{
                  const binary=Uint8Array.from(atob(image),c=>c.charCodeAt(0));
                  const bitmap=await createImageBitmap(new Blob([binary],{type:mime}));
                  const canvas=document.createElement('canvas');
                  canvas.width=bitmap.width;canvas.height=bitmap.height;
                  canvas.getContext('2d').drawImage(bitmap,0,0);
                  bitmap.close?.();
                  return canvas.toDataURL('image/jpeg',.83).split(',')[1];
                },{image:original.toString('base64'),
                    mime:ext==='jpg'||ext==='jpeg'?'image/jpeg':'image/'+ext});
                const bytes=Buffer.from(base64,'base64');
                oldFrame={bytes,quality:scoreCoverMetrics(await frameMetrics(page,bytes)),existing:true};
                break;
              }catch(error){console.warn('Prior cover comparison: '+String(error.message).slice(0,110));}
            }
          }
          const review=await reviewWithVision(app,available,oldFrame);
          if(review){
            available.forEach((frame,index)=>{
              frame.visionScore=review.scores[index]+(review.best===index?3:0);
              frame.aiRejected=review.rejected.includes(index);
            });
          }
          const previousScore=review&&oldFrame?
            (review.rejected.includes(available.length)?null:review.scores[available.length]):
            (oldFrame?.quality?.pass?oldFrame.quality.score:null);
          const {chosen,reason}=chooseCover(available,{previousScore,allowedRegression:7});
          const olderWins=Boolean(review&&oldFrame&&review.best===available.length);
          if(!chosen||olderWins){
            recordResult(app.slug,revision,'preserved',{note:olderWins?'vision prefers existing cover':reason});
            preserved.push({slug:app.slug,reason:olderWins?'vision prefers existing cover':reason});
            continue;
          }
          await writeFile(path.join(out,app.slug+'.jpg'),chosen.bytes);
          recordResult(app.slug,revision,'published',{
            revision,qualityScore:chosen.quality.score,visionScore:chosen.visionScore??null,
            prepared:chosen.prepared,started:entry.started,gameplayEntry:entry.actions,
            diagnostic:null,shot:chosen.index,
            sha256:createHash('sha256').update(chosen.bytes).digest('hex'),
            imageVersion:2
          });
          captured.push({slug:app.slug,shot:chosen.index,prepared,started:entry.started,score:chosen.quality.score,
            aiReviewed:Boolean(review),bytes:chosen.bytes.length});
        }catch(error){
          recordResult(app.slug,revision,'failed',{note:String(error.message).slice(0,160)});
          failures.push({slug:app.slug,error:String(error.message).slice(0,160)});
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
}finally{
  server?.kill('SIGTERM');
  if(targets.length)await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
console.log(JSON.stringify({captured,preserved,failures,remaining:Math.max(0,desired.length-targets.length),
  visionEnabled:Boolean(process.env.OPENAI_API_KEY)},null,2));
if(!captured.length&&targets.length)console.warn('No new verified screenshots; existing cover/icon remains.');
