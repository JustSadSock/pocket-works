// Capture genuine Pocket Works app screens as launcher covers.
// Runs against the assembled offline-first production site; never invents artwork.
import { chromium } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root=process.cwd();
const out=path.join(root,'covers');
const limit=Math.max(1,Math.min(24,Number(process.env.PW_COVER_LIMIT)||12));
const slugArg=(process.env.PW_COVER_SLUGS||'').split(',').map(x=>x.trim()).filter(Boolean);
const registry=JSON.parse(await readFile(path.join(root,'dist-site/apps.json'),'utf8'));
const candidates=registry.filter(a=>/^[a-z0-9-]+$/.test(a.slug))
  .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
await mkdir(out,{recursive:true});
const existing=new Set(await readdir(out));
const wanted=slugArg.length?candidates.filter(a=>slugArg.includes(a.slug)):candidates.filter(a=>!existing.has(a.slug+'.jpg'));
const targets=wanted.slice(0,limit);
let server=null;
const captured=[],failures=[];
try{
  server=spawn(process.execPath,['scripts/serve-site.mjs'],{cwd:root,env:{...process.env,PORT:'4173'},stdio:'ignore'});
  const health=async()=>{
    for(let n=0;n<40;n++){
      try{const response=await fetch('http://127.0.0.1:4173/apps.json');if(response.ok)return;}
      catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw Error('Preview server did not start');
  };
  await health();
  const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
  try{
    for(const app of targets){
      const landscape=app.orientation==='landscape';
      const viewport=landscape?{width:844,height:390}:{width:390,height:760};
      const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
      const page=await context.newPage();
      try{
        await page.goto('http://127.0.0.1:4173/apps/'+encodeURIComponent(app.slug)+'/',{waitUntil:'domcontentloaded',timeout:20000});
        await page.waitForTimeout(app.runtime==='godot'?6000:1600);
        // A screenshot is evidence, not a design claim. Reject obvious blank/loading screens.
        const screenshot=await page.screenshot({type:'jpeg',quality:79,animations:'disabled',timeout:16000});
        if(screenshot.length<9000)throw Error('Screenshot is mostly empty');
        const variance=await page.evaluate(async(base64)=>{
          const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
          const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
          const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(bitmap,0,0,24,24);
          const data=ctx.getImageData(0,0,24,24).data;let mean=0,meanSq=0;
          for(let i=0;i<data.length;i+=4){const l=(data[i]+data[i+1]+data[i+2])/3;mean+=l;meanSq+=l*l;}
          mean/=576;meanSq/=576;return Math.sqrt(Math.max(0,meanSq-mean*mean));
        },screenshot.toString('base64'));
        if(variance<7)throw Error('Flat/colorless loading screen');
        await writeFile(path.join(out,app.slug+'.jpg'),screenshot);
        captured.push({slug:app.slug,bytes:screenshot.length,variance:Math.round(variance)});
      }catch(error){failures.push({slug:app.slug,error:error.message.slice(0,160)});}
      finally{await context.close();}
    }
  }finally{await browser.close();}
}finally{server?.kill('SIGTERM');}
const result={captured,failures,totalRemaining:Math.max(0,wanted.length-targets.length)};
console.log(JSON.stringify(result,null,2));
if(!captured.length&&targets.length)console.warn('No trustworthy covers captured; launcher will use authentic app icons.');
