// Separate real-browser experiment. Each policy owns a new browser context.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {loadLibrary} from './geographic-dem-library.mjs';
import {packExemplars} from './genesis-natural.mjs';
export async function run(engine){
 const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-resident-stabilization',output=join(root,'resident-'+engine);mkdirSync(output,{recursive:true});
 const report=[],save=()=>writeFileSync(join(output,'stabilization.json'),JSON.stringify(report,null,2)),port=engine==='chromium'?4217:4218,url='http://127.0.0.1:'+port+'/apps/crown-and-marches/?atlas-review=1';
 const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:String(port),POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
 let browser;
 try{
  const payload=join(output,'frozen-exemplars.json');writeFileSync(payload,JSON.stringify(packExemplars(await loadLibrary(join(tmpdir(),'crown-dem-library')))));
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  const configs=[{policy:'allocate',pad:96,maxEntries:6},{policy:'recycle',pad:96,maxEntries:6},{policy:'prewarm',pad:96,maxEntries:6},{policy:'recycle',pad:64,maxEntries:6},{policy:'recycle',pad:128,maxEntries:4}];
  for(const [index,config] of configs.entries()){
   const rec={engine,config,candidate:'organic',frames:[],segments:[],errors:[],passed:false};report.push(rec);save();
   const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>{rec.errors.push(String(e.stack||e));save();});
   try{
    await page.goto(url);await page.locator('[data-act="atlaslab"]').click();await page.locator('#atlasseed').fill('atlas-mountain-173');await page.locator('#atlasshape').selectOption('continents');await page.locator('#atlasdem').setInputFiles(payload);await page.locator('[data-act="atlasstart"]').click();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
    await page.evaluate(()=>window.__atlasReview.composition('resident',true));
    const scene=await page.evaluate(()=>window.__atlasReview.scene('capital',{zoom:12,full:true,tilt:true,surfaceScale:true,identity:true,human:true,urban:true,culture:'organic',keepCache:false}));
    await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},scene,{timeout:90000});
    rec.origin=await page.evaluate(()=>window.__atlasReview.cameraPresentation());rec.initialPolicy=await page.evaluate(c=>window.__atlasReview.residentPolicy(c),config);save();
    await page.screenshot({path:join(output,index+'-start.png')});
    const segments=['straight','diagonal','seeded-turns','return','region-crossing','moving-zoom'];
    for(const [segment,label] of segments.entries()){
     const part=await page.evaluate(async({segment,label,origin})=>{
      const r=window.__atlasReview,c=document.querySelector('#atlas'),raf=()=>new Promise(ok=>requestAnimationFrame(()=>ok(performance.now()))),frames=[];
      const restore=r.restoreCamera(origin.camera);const settle=async q=>{const start=performance.now();while(performance.now()-start<90000){await raf();try{const d=c.dataset,p=JSON.parse(d.atlasReceipt),req=JSON.parse(d.atlasRequest);if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&p.id===req.id&&p.key===req.key&&p.revision===req.revision&&p.intent===q.intent&&Math.abs(p.view.x-q.expectedView.x)<1e-7&&Math.abs(p.view.y-q.expectedView.y)<1e-7&&Math.abs(p.view.s-q.expectedView.s)<1e-9)return;}catch{}}throw Error('Segment restore timeout');};await settle(restore);
      let seed=0x94c37f01,prior=Number(c.dataset.atlasFrame),prev=await raf(),started=prev;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
      for(let i=0;i<50;i++){
       let dx=0,dy=0,f=1;
       if(segment===0)dx=4;
       if(segment===1){dx=4;dy=4;}
       if(segment===2){dx=(random()%9-4)*1.2;dy=(random()%9-4)*1.2;if(!dx&&!dy)dx=2.4;}
       if(segment===3){dx=i<25?4:-4;dy=i<25?2:-2;}
       if(segment===4){dx=i<25?48:-48;dy=i<25?8:-8;}
       if(segment===5){dx=4;dy=2;f=i<25?1.018:1/1.018;}
       const q=r.motion(dx,dy,f),t=await raf(),d=c.dataset,frame=Number(d.atlasFrame),profile=r.cameraProfile();let receipt=null,request=null;try{receipt=JSON.parse(d.atlasReceipt);request=JSON.parse(d.atlasRequest);}catch{}
       const current=!!(receipt&&request&&d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&receipt.id===request.id&&receipt.id===Number(d.atlasReadyId)&&receipt.intent===q.intent&&receipt.key===request.key&&receipt.revision===request.revision&&receipt.region[0]<=request.visible[0]&&receipt.region[1]<=request.visible[1]&&receipt.region[2]>=request.visible[2]&&receipt.region[3]>=request.visible[3]&&Math.abs(receipt.view.x-q.expectedView.x)<1e-7&&Math.abs(receipt.view.y-q.expectedView.y)<1e-7&&Math.abs(receipt.view.s-q.expectedView.s)<1e-9&&JSON.stringify(receipt.view.viewport)===JSON.stringify(q.viewport)&&receipt.pair?.requestId===receipt.id&&receipt.pair?.terrainFrame===receipt.pair?.overlayFrame);
       frames.push({input:i,dx,dy,f,gapMs:t-prev,frame,advanced:frame>prior,current,pose:q.camera,expected:q.expectedView,request,receipt,profile,active:d.atlasCompositionActive});prev=t;prior=frame;
      }
      const elapsed=prev-started,advanced=frames.filter(f=>f.advanced&&f.current).length,sorted=frames.map(f=>f.gapMs).sort((a,b)=>a-b);return {label,frames,elapsed,advanced,fps:1000*advanced/elapsed,p95:sorted[Math.ceil(.95*sorted.length)-1]};
     },{segment,label,origin:rec.origin});rec.segments.push({...part,frames:undefined});rec.frames.push(...part.frames.map(f=>({...f,segment:label})));save();await page.screenshot({path:join(output,index+'-'+label+'.png')});
    }
    const poses=new Set(),instances=new Map();let exact=0,hits=0,builds=0,fallbacks=0,maxBytes=0,regions=new Set(),stale=0,spatialShifts=0;
    for(const f of rec.frames){poses.add(JSON.stringify([f.pose.x,f.pose.y,f.pose.s]));if(f.receipt?.region)regions.add(JSON.stringify(f.receipt.region));if(!f.current)stale++;if(f.advanced&&f.current){if(f.profile?.humanCache?.hits!=null&&f.profile?.architectureMs!=null){/* phase counters retained per frame */}const s=f.profile?.resident??f.profile?.surface?.resident??null;if(s){maxBytes=Math.max(maxBytes,s.bytes);instances.set(s.instance,s);if(s.bytes>s.limit||s.entries+s.free>s.maxEntries)rec.errors.push('memory budget exceeded');if(!f.profile?.reused){if(s.last?.kind==='resident-hit'){hits++;if(s.last.crop?.dx||s.last.crop?.dy)spatialShifts++;}else if(s.last?.kind==='resident-build')builds++;else if(s.last?.kind==='fresh-fallback')fallbacks++;}}}if(f.profile?.humanCache?.hits>0)exact++;}
    const totals={};for(const k of ['allocations','recycles','hits','misses','evictions','fallbacks','phaseRejects','coverageRejects'])totals[k]=[...instances.values()].reduce((n,s)=>n+(s[k]??0),0);
    rec.summary={uniquePoses:poses.size,uniqueRatio:poses.size/rec.frames.length,regions:regions.size,currentFrames:rec.frames.length-stale,spatialHits:hits,nonzeroSpatialShifts:spatialShifts,builds,fallbacks,exactPoseFramesWithPriorHits:exact,maxBytes,totals};save();
    const restored=await page.evaluate(o=>window.__atlasReview.restoreCamera(o.camera),rec.origin);await page.waitForFunction(q=>{const d=document.querySelector('#atlas')?.dataset;try{const p=JSON.parse(d.atlasReceipt);return d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&p.intent===q.intent&&Math.abs(p.view.x-q.expectedView.x)<1e-7&&Math.abs(p.view.y-q.expectedView.y)<1e-7&&Math.abs(p.view.s-q.expectedView.s)<1e-9;}catch{return false;}},restored,{timeout:90000});
    rec.gpu=await page.evaluate(()=>window.__atlasReview.gpuProbe());const raster=await page.evaluate(()=>window.__atlasReview.residentRasterProbe());for(const [name,png] of Object.entries(raster.images))writeFileSync(join(output,index+'-'+name+'.png'),Buffer.from(png,'base64'));delete raster.images;rec.raster=raster;save();
    if(rec.frames.length!==300||rec.segments.some(s=>s.advanced!==50||s.fps<55||s.p95>33.3))rec.errors.push('long motion gate failed');
    if(!spatialShifts||regions.size<2)rec.errors.push('nonzero spatial crop or region crossing not demonstrated');
    if(raster.rows.some(r=>r.error||r.count!==0))rec.errors.push('raster diagnostics differ from default framebuffer');
    if(!totals.allocations)rec.errors.push('no GPU allocations observed');
    rec.passed=rec.errors.length===0;
   }catch(e){rec.errors.push(String(e.stack||e));rec.dataset=await page.locator('#atlas').evaluate(el=>({...el.dataset})).catch(()=>null);await page.screenshot({path:join(output,index+'-failure.png')}).catch(()=>{});}
   finally{save();await context.close();}
  }
  assert.equal(report.length,configs.length);assert.ok(report.every(r=>r.passed),'Resident stabilization unqualified: '+JSON.stringify(report.map(r=>({config:r.config,errors:r.errors,summary:r.summary,segments:r.segments}))));
 }finally{await browser?.close();server.kill('SIGTERM');save();}
}
