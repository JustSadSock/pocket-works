import {chromium,webkit} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration';
const output=join(root,'historical-identity');
mkdirSync(output,{recursive:true});
const payload=join(root,'frozen-exemplars.json');
const url='http://127.0.0.1:4210/apps/crown-and-marches/?atlas-review=1';
const report=[];
const save=()=>writeFileSync(join(output,'camera-presentation.json'),JSON.stringify(report,null,2));
const file=s=>s.replace(/[^A-Za-z0-9._-]/g,'-');
const candidates=['cultural','historical','organic'];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 let browser=null;
 try{
  browser=await type.launch(engine==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  for(const candidate of candidates){
   const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
   const page=await context.newPage(),pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e.stack||e)));
   const result={engine,candidate,passed:false,steps:[],errors:[],pageErrors};
   try{
    await page.goto(url);
    await page.locator('[data-act="atlaslab"]').click();
    await page.locator('#atlasseed').fill('atlas-mountain-173');
    await page.locator('#atlasshape').selectOption('continents');
    await page.locator('#atlasdem').setInputFiles(payload);
    await page.locator('[data-act="atlasstart"]').click();
    await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
    const scene=await page.evaluate(o=>window.__atlasReview.scene('capital',o),{zoom:12,full:true,tilt:true,surfaceScale:true,identity:true,human:true,urban:true,culture:candidate,keepCache:false});
    await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},scene,{timeout:90000});
    const initial=await page.evaluate(()=>window.__atlasReview.meta());
    const iv=initial.viewport,ix=(iv.width/2-(initial.camera.ox-iv.left))/initial.camera.s,iy=(iv.height/2-(initial.camera.oy-iv.top))/initial.camera.s;
    const initialValid=initial.receipt.id===initial.request.id&&initial.receipt.intent===initial.request.intent&&initial.receipt.key===initial.request.key&&initial.receipt.revision===initial.request.revision&&JSON.stringify(initial.receipt.view)===JSON.stringify(initial.request.view)&&initial.receipt.region[0]<=initial.request.visible[0]&&initial.receipt.region[1]<=initial.request.visible[1]&&initial.receipt.region[2]>=initial.request.visible[2]&&initial.receipt.region[3]>=initial.request.visible[3]&&Math.abs(initial.receipt.view.x-ix)<1e-7&&Math.abs(initial.receipt.view.y-iy)<1e-7&&Math.abs(initial.receipt.view.s-initial.camera.s)<1e-9;
    result.initial={scene,meta:initial,expectedView:{x:ix,y:iy,s:initial.camera.s},valid:initialValid};if(!initialValid)result.errors.push('initial camera receipt mismatch');
    result.startImage=file(engine+'-'+candidate+'-camera-start.png');
    await page.screenshot({path:join(output,result.startImage)});
    const motion=await page.evaluate(async()=>{
     const r=window.__atlasReview,c=document.querySelector('#atlas'),gaps=[],steps=[];
     const hash=async()=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data,h=await crypto.subtle.digest('SHA-256',p);return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');};
     const startMeta=r.meta(),camera={x:startMeta.camera.x,y:startMeta.camera.y,zoom:startMeta.camera.zoom},pixels=await hash();
     const actions=[{dx:22,dy:6,f:1,label:'pan-east-south'},{dx:-44,dy:0,f:1,label:'pan-west'},{dx:0,dy:-12,f:1,label:'pan-north'},{dx:0,dy:24,f:1,label:'pan-south'},{dx:0,dy:0,f:1.18,label:'zoom-in'},{dx:0,dy:0,f:1/1.18,label:'zoom-out'},{dx:260,dy:80,f:1,label:'visit-cold-region'},{restore:true,camera,label:'return-to-original-region'}];
     for(const a of actions){
      const before=Number(c.dataset.atlasFrame),q=a.restore?r.restoreCamera(a.camera):r.motion(a.dx,a.dy,a.f),began=performance.now(),raf=[];let prev=began,step=null;
      while(performance.now()-began<90000){
       const t=await new Promise(requestAnimationFrame);raf.push(t-prev);prev=t;
       const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
       const v=q.viewport,k=q.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
       const valid=d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===q.intent&&Number(d.atlasFrame)>before&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===q.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&JSON.stringify(req.view.viewport)===JSON.stringify(v)&&Math.abs(req.view.x-ex)<1e-7&&Math.abs(req.view.y-ey)<1e-7&&Math.abs(req.view.s-k.s)<1e-9&&Math.abs(k.x-ex)<1e-7&&Math.abs(k.y-ey)<1e-7;
       if(valid){const m=r.meta();step={ok:true,label:a.label,latencyMs:performance.now()-began,raf,request:req,receipt:rec,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},meta:{camera:m.camera,human:m.human,cache:m.cache,prepMs:m.prepMs,uploadMs:m.uploadMs,firstUsefulMs:m.firstUsefulMs}};break;}
      }
      if(!step)step={ok:false,label:a.label,raf,error:'camera presentation receipt timeout',dataset:{...c.dataset},pending:r.pending(),expected:q};
      steps.push(step);gaps.push(...raf);
      if(!step.ok)break;
     }
     const sweep={gaps:[],frames:[],errors:[]};
     for(let i=0;i<60;i++){
      const before=Number(c.dataset.atlasFrame),q=r.motion(i%2===0?1.5:-1.5,i%4<2?.6:-.6,1),began=performance.now();let prev=began,sample=null;
      while(performance.now()-began<2500){
       const t=await new Promise(requestAnimationFrame);sweep.gaps.push(t-prev);prev=t;
       const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
       const v=q.viewport,k=q.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
       const valid=d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===q.intent&&Number(d.atlasFrame)>before&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===q.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&JSON.stringify(req.view.viewport)===JSON.stringify(v);
       if(valid){sample={frame:Number(d.atlasFrame),latencyMs:performance.now()-began,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},receipt:{id:rec.id,intent:rec.intent,key:rec.key,revision:rec.revision,view:rec.view}};break;}
      }
      if(!sample){sweep.errors.push({frame:i,error:'sustained motion frame had no current receipt',dataset:{...c.dataset},pending:r.pending(),expected:q});break;}
      sweep.frames.push(sample);
     }
     const restoreBefore=Number(c.dataset.atlasFrame),restore=r.restoreCamera(camera),restoreStart=performance.now();let restoreReceipt=null,restorePrev=restoreStart;
     while(performance.now()-restoreStart<90000){
      const t=await new Promise(requestAnimationFrame);sweep.gaps.push(t-restorePrev);restorePrev=t;
      const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
      const v=restore.viewport,k=restore.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
      if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===restore.intent&&Number(d.atlasFrame)>restoreBefore&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===restore.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)){restoreReceipt={ok:true,latencyMs:performance.now()-restoreStart,receipt:rec,expectedView:{x:ex,y:ey,s:k.s}};break;}
     }
     if(!restoreReceipt)sweep.errors.push({error:'restore after sustained motion did not present',dataset:{...c.dataset},pending:r.pending(),expected:restore});sweep.restore=restoreReceipt;
     const finalMeta=steps.length===8&&steps.every(s=>s.ok)&&sweep.frames.length===60&&sweep.errors.length===0&&sweep.restore?.ok?r.meta():null,finalPixels=finalMeta?await hash():null,sorted=sweep.gaps.slice().sort((a,b)=>a-b),fps=sweep.gaps.length?1000*sweep.gaps.length/sweep.gaps.reduce((a,b)=>a+b,0):0,p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:Infinity;
     return {steps,sweep,gaps:sweep.gaps,fps,p95,initialPixels:pixels,finalPixels,pixelEquivalent:!!finalPixels&&pixels===finalPixels,initialCache:startMeta.cache,finalCache:finalMeta?.cache??null,terrainCacheReuse:!!finalMeta&&finalMeta.cache.hits>startMeta.cache.hits,spatialLayerReuse:steps.some(s=>s.meta?.human?.spatialReuse),finalCamera:finalMeta?.camera??null};
    });
    result.motion=motion;
    if(motion.steps.length!==8||motion.steps.some(s=>!s.ok))result.errors.push('camera traversal or presentation receipt failed');if(motion.sweep?.frames.length!==60||motion.sweep.errors.length||!motion.sweep.restore?.ok)result.errors.push('sustained camera sweep or receipt validation failed');
    if(!motion.terrainCacheReuse)result.errors.push('previously visited terrain region was not reused');
    if(!motion.pixelEquivalent)result.errors.push('return-to-origin canvas pixels differ');
    if(motion.fps<55||motion.p95>33.3)result.errors.push('camera motion threshold failed');
    if(candidate!=='cultural'&&!motion.spatialLayerReuse)result.errors.push('human spatial layer reuse was not observed');
    if(pageErrors.length)result.errors.push('browser page errors occurred');
    result.passed=result.errors.length===0;
    result.endImage=file(engine+'-'+candidate+'-camera-end.png');
    await page.screenshot({path:join(output,result.endImage)});
   }catch(e){
    result.errors.push(String(e.stack||e));
    result.dataset=await page.locator('#atlas').evaluate(e=>({...e.dataset})).catch(()=>null);
    result.failureImage=file(engine+'-'+candidate+'-camera-failure.png');
    await page.screenshot({path:join(output,result.failureImage)}).catch(()=>{});
   }finally{report.push(result);save();await context.close();}
  }
 }catch(e){report.push({engine,passed:false,error:String(e.stack||e)});save();}
 finally{await browser?.close();}
}
const failures=report.filter(r=>r.passed===false);
report.push({phase:'aggregate',passed:failures.length===0,engines:['chromium','webkit'],candidates,failures:failures.map(r=>({engine:r.engine,candidate:r.candidate,errors:r.errors}))});
save();
assert.equal(failures.length,0,'Camera Presentation QA failed: '+JSON.stringify(failures.map(r=>({engine:r.engine,candidate:r.candidate,errors:r.errors,motion:r.motion}))));
