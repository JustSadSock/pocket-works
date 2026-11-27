// Separate real-browser experiment. Each policy owns a new browser context.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {aggregatePresentation} from './atlas-presentation-evidence.mjs';
import {loadLibrary} from './geographic-dem-library.mjs';
import {packExemplars} from './genesis-natural.mjs';
export async function run(engine,selected=null,{short=false,streaming='control'}={}){
 const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-resident-stabilization',output=join(root,'resident-'+engine+(selected?'-'+selected.join('-'):'')+(short?'-short-'+streaming:''));mkdirSync(output,{recursive:true});
 const report=[],save=()=>writeFileSync(join(output,'stabilization.json'),JSON.stringify(report,null,2)),port=engine==='chromium'?4217:4218,url='http://127.0.0.1:'+port+'/apps/crown-and-marches/?atlas-review=1';
 const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:String(port),POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
 let browser;
 try{
  const payload=join(output,'frozen-exemplars.json');writeFileSync(payload,JSON.stringify(packExemplars(await loadLibrary(join(tmpdir(),'crown-dem-library')))));
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  const configs=[{policy:'allocate',pad:96,maxEntries:6},{policy:'recycle',pad:96,maxEntries:6},{policy:'prewarm',pad:96,maxEntries:6},{policy:'recycle',pad:64,maxEntries:6},{policy:'recycle',pad:128,maxEntries:6},{policy:'recycle',pad:96,maxEntries:4},{policy:'recycle',pad:96,maxEntries:6,eviction:'phase-diverse'}];
  const chosen=configs.map((config,index)=>({config,index})).filter(x=>!selected||selected.includes(x.index));if(!chosen.length||selected&&chosen.length!==selected.length)throw Error('Invalid resident group');
  for(const {index,config} of chosen){
   const rec={engine,index,config,short,streaming,candidate:'organic',frames:[],segments:[],errors:[],qualificationFailures:[],evidenceComplete:false,qualified:false,passed:false};report.push(rec);save();
   const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>{rec.errors.push(String(e.stack||e));save();});
   try{
    await page.goto(url);await page.locator('[data-act="atlaslab"]').click();await page.locator('#atlasseed').fill('atlas-mountain-173');await page.locator('#atlasshape').selectOption('continents');await page.locator('#atlasdem').setInputFiles(payload);await page.locator('[data-act="atlasstart"]').click();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
    await page.evaluate(()=>window.__atlasReview.composition('resident',true));
    const scene=await page.evaluate(()=>window.__atlasReview.scene('capital',{zoom:12,full:true,tilt:true,surfaceScale:true,identity:true,human:true,urban:true,culture:'organic',keepCache:false}));
    await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},scene,{timeout:90000});
    rec.origin=await page.evaluate(()=>window.__atlasReview.cameraPresentation());rec.initialPolicy=await page.evaluate(c=>window.__atlasReview.residentPolicy(c),config);if(short)rec.initialStreaming=await page.evaluate(p=>window.__atlasReview.streamingPolicy(p),streaming);save();
    await page.screenshot({path:join(output,index+'-start.png')});
    const segments=['straight','diagonal','seeded-turns','return','region-crossing','moving-zoom'];
    for(const [segment,label] of segments.entries()){
     if(short&&segment<4)continue;
     const part=await page.evaluate(async({segment,label,origin})=>{
      const r=window.__atlasReview,c=document.querySelector('#atlas'),raf=()=>new Promise(ok=>requestAnimationFrame(()=>ok(performance.now()))),frames=[];
      const restore=r.restoreCamera(origin.camera);const settle=async q=>{const start=performance.now();while(performance.now()-start<90000){await raf();try{const d=c.dataset,p=JSON.parse(d.atlasReceipt),req=JSON.parse(d.atlasRequest);if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&p.id===req.id&&p.key===req.key&&p.revision===req.revision&&p.intent===q.intent&&Math.abs(p.view.x-q.expectedView.x)<1e-7&&Math.abs(p.view.y-q.expectedView.y)<1e-7&&Math.abs(p.view.s-q.expectedView.s)<1e-9)return;}catch{}}throw Error('Segment restore timeout');};await settle(restore);
      let seed=0x94c37f01,prior=Number(c.dataset.atlasFrame),prev=await raf(),started=prev;r.presentationEvidence('begin');
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
      for(let i=0;i<50;i++){
       let dx=0,dy=0,f=1;
       if(segment===0)dx=4;
       if(segment===1){dx=4;dy=4;}
       if(segment===2){dx=(random()%9-4)*1.2;dy=(random()%9-4)*1.2;if(!dx&&!dy)dx=2.4;}
       if(segment===3){dx=i<25?4:-4;dy=i<25?2:-2;}
       if(segment===4){dx=i<25?48:-48;dy=i<25?8:-8;}
       if(segment===5){dx=4;dy=2;f=i<25?1.018:1/1.018;}
       const q=r.motion(dx,dy,f),t=await raf(),frame=Number(c.dataset.atlasFrame);
       frames.push({input:i,dx,dy,f,inputId:q.inputId,inputAt:q.inputAt,gapMs:t-prev,frame,advanced:frame>prior,pose:q.camera,expected:q.expectedView});prev=t;prior=frame;
      }
      const elapsed=prev-started;
      // Fixed pipeline drain, not a per-input wait. Includes the tail receipt
      // without counting the drain as additional input or fake delivered frames.
      await raf();await raf();await raf();const journal=r.presentationEvidence('end');
      return {label,frames,elapsed,journal};
     },{segment,label,origin:rec.origin});const verified=aggregatePresentation(part.journal,part.frames,part.elapsed);rec.segments.push({...part,...verified,frames:undefined});rec.frames.push(...part.frames.map(f=>({...f,segment:label})));rec.errors.push(...verified.errors.map(e=>label+': '+e));if(short)rec.streamingAfterSegment=await page.evaluate(()=>window.__atlasReview.streamingReport());save();await page.screenshot({path:join(output,index+'-'+label+'.png')});
    }
    const poses=new Set(rec.frames.map(f=>JSON.stringify([f.pose.x,f.pose.y,f.pose.s]))),instances=new Map(),regions=new Set();
    let exact=0,hits=0,builds=0,fallbacks=0,maxBytes=0,spatialShifts=0,delivered=0;
    for(const s of rec.segments){for(const instance of s.instances)instances.set(instance.instance,instance);for(const region of s.regions)regions.add(region);exact+=s.exactPoseHits;hits+=s.spatialHits;builds+=s.builds;fallbacks+=s.fallbacks;maxBytes=Math.max(maxBytes,s.maxBytes);spatialShifts+=s.nonzeroSpatialShifts;delivered+=s.advanced;}
    const totals={};for(const k of ['allocations','recycles','poolTakes','hits','misses','evictions','fallbacks','phaseRejects','coverageRejects'])totals[k]=[...instances.values()].reduce((n,s)=>n+(s[k]??0),0);
    const intervals=rec.segments.flatMap(s=>s.presentationGaps).sort((a,b)=>a-b),elapsed=rec.segments.reduce((n,s)=>n+s.elapsedMs,0);
    rec.summary={uniquePoses:poses.size,uniqueRatio:poses.size/rec.frames.length,regions:regions.size,currentFrames:delivered,frameUpdates:rec.frames.filter(f=>f.advanced).length,missedInputs:rec.frames.length-delivered,presentationFps:1000*delivered/elapsed,presentationP95:intervals.length?intervals[Math.ceil(.95*intervals.length)-1]:null,spatialHits:hits,nonzeroSpatialShifts:spatialShifts,builds,fallbacks,exactPoseHits:exact,maxBytes,totals};save();
    const restored=await page.evaluate(o=>window.__atlasReview.restoreCamera(o.camera),rec.origin);await page.waitForFunction(q=>{const d=document.querySelector('#atlas')?.dataset;try{const p=JSON.parse(d.atlasReceipt);return d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&p.intent===q.intent&&Math.abs(p.view.x-q.expectedView.x)<1e-7&&Math.abs(p.view.y-q.expectedView.y)<1e-7&&Math.abs(p.view.s-q.expectedView.s)<1e-9;}catch{return false;}},restored,{timeout:90000});
    rec.finalSurface=await page.evaluate(()=>window.__atlasReview.surfaceInfo());rec.gpu=await page.evaluate(()=>window.__atlasReview.gpuProbe());save();const raster=await page.evaluate(short=>window.__atlasReview.residentRasterProbe(short),short);for(const [name,png] of Object.entries(raster.images))writeFileSync(join(output,index+'-'+name+'.png'),Buffer.from(png,'base64'));delete raster.images;rec.raster=raster;save();
    // Research admission is about complete trustworthy evidence, not a fast control.
    if(rec.frames.length!==(short?100:300)||rec.segments.length!==(short?2:6)||rec.frames.some(f=>!Number.isFinite(f.gapMs)||f.gapMs<=0)||rec.segments.some(s=>!Number.isFinite(s.fps)||s.p95!==null&&!Number.isFinite(s.p95)))rec.errors.push('incomplete or invalid motion evidence');
    if(raster.rows.filter(r=>!r.experimental).length!==10||raster.rows.filter(r=>r.experimental).length!==(short?7:5)||raster.rows.some(r=>r.error||!Number.isInteger(r.count)||!Number.isFinite(r.max)))rec.errors.push('incomplete raster diagnostic evidence');
    if(!totals.allocations)rec.errors.push('no GPU allocations observed');
    if(rec.segments.some(s=>s.advanced!==50||s.fps<55||!Number.isFinite(s.p95)||s.p95>33.3))rec.qualificationFailures.push('long motion gate failed');
    if(!spatialShifts||regions.size<2||rec.segments.find(s=>s.label==='region-crossing')?.regions.length<2)rec.qualificationFailures.push('nonzero spatial crop or region crossing not demonstrated');if(short){const revisions=new Set(rec.segments.find(s=>s.label==='moving-zoom')?.journal.events.filter(e=>e.kind==='opportunity').map(e=>e.receipt.revision));rec.scaleRevisions=[...revisions];if(revisions.size<2)rec.qualificationFailures.push('no confirmed scale revision transition');if(rec.streamingAfterSegment?.overflow)rec.errors.push('streaming telemetry overflow');}
    if(raster.rows.filter(r=>!r.experimental).some(r=>r.error||r.count!==0))rec.qualificationFailures.push('raster diagnostics differ from default framebuffer');
    if(config.policy==='recycle'&&!totals.recycles)rec.qualificationFailures.push('no actual evicted GPU allocation reuse');
    if(config.policy==='prewarm'&&!totals.poolTakes)rec.qualificationFailures.push('no preallocated GPU slot consumed');
    rec.evidenceComplete=rec.errors.length===0;
    rec.qualified=rec.evidenceComplete&&rec.qualificationFailures.length===0;
    rec.passed=rec.evidenceComplete;
   }catch(e){rec.errors.push(String(e.stack||e));rec.dataset=await page.locator('#atlas').evaluate(el=>({...el.dataset})).catch(()=>null);await page.screenshot({path:join(output,index+'-failure.png')}).catch(()=>{});}
   finally{save();await context.close();}
  }
  assert.equal(report.length,chosen.length);assert.ok(report.every(r=>r.evidenceComplete),'Resident research evidence incomplete: '+JSON.stringify(report.map(r=>({index:r.index,config:r.config,errors:r.errors,qualificationFailures:r.qualificationFailures,summary:r.summary,segments:r.segments}))));
 }finally{await browser?.close();server.kill('SIGTERM');save();const replay=report.map(r=>({engine:r.engine,index:r.index,config:r.config,segments:r.segments.map(s=>({label:s.label,...aggregatePresentation(s.journal,r.frames.filter(f=>f.segment===s.label),s.elapsed)})),raster:r.raster?.rows??[],evidenceComplete:r.evidenceComplete,qualificationFailures:r.qualificationFailures}));writeFileSync(join(output,'independent-replay.json'),JSON.stringify(replay,null,2));}
}
