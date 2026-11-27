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
const expectedFramebufferViewport=v=>{const dpr=v.pixelRatio??1,cw=Math.round(v.canvasWidth*dpr),ch=Math.round(v.canvasHeight*dpr),left=Math.round(v.left*dpr),right=Math.round(v.rightEdge*dpr),top=Math.round(v.top*dpr),bottom=Math.round(v.bottomEdge*dpr);return {x:left,y:ch-bottom,width:right-left,height:bottom-top};};
const geometryDiagnostics=(meta,dataset)=>{
 try{const v=meta.viewport,k=meta.camera,req=meta.request,range=JSON.parse(dataset.atlasHeightRange||'null'),world=JSON.parse(dataset.atlasWorldBounds||'null'),actualFramebuffer=JSON.parse(dataset.atlasFramebufferViewport||'null'),actualVisible=JSON.parse(dataset.atlasVisibleBounds||'null'),prepared=JSON.parse(dataset.atlasPreparedBounds||'null'),storedViewport=JSON.parse(dataset.atlasViewport||'null');if(!range||!world||!actualFramebuffer||!actualVisible||!prepared||!storedViewport)return {valid:false,error:'missing viewport diagnostics'};const expectedFramebuffer=expectedFramebufferViewport(v),tilt=req.tilt??0,cs=Math.sqrt(1-tilt*tilt),right=v.rightEdge,bottom=v.bottomEdge,x0=(v.left-k.ox)/k.s,x1=(right-k.ox)/k.s,y0=k.y+((v.top-v.centerY)/k.s+(range.minZ-range.datum)*tilt)/cs,y1=k.y+((bottom-v.centerY)/k.s+(range.maxZ-range.datum)*tilt)/cs,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),expectedVisible=[clamp(Math.floor(x0),world[0],world[2]),clamp(Math.floor(y0),world[1],world[3]),clamp(Math.ceil(x1),world[0],world[2]),clamp(Math.ceil(y1),world[1],world[3])],framebufferMatches=['x','y','width','height'].every(key=>actualFramebuffer[key]===expectedFramebuffer[key]),viewportMatches=['left','right','top','bottom','rightEdge','bottomEdge','width','height','centerX','centerY','canvasWidth','canvasHeight','pixelRatio','coordinateSpace','origin'].every(key=>storedViewport[key]===v[key]),preparedCovers=prepared[0]<=expectedVisible[0]&&prepared[1]<=expectedVisible[1]&&prepared[2]>=expectedVisible[2]&&prepared[3]>=expectedVisible[3],areaReduction=Number(dataset.atlasPreparedAreaReductionPct);return {valid:framebufferMatches&&viewportMatches&&JSON.stringify(actualVisible)===JSON.stringify(expectedVisible)&&JSON.stringify(req.visible)===JSON.stringify(expectedVisible)&&preparedCovers&&Number.isFinite(areaReduction)&&areaReduction>=0&&areaReduction<=100,expectedFramebuffer,actualFramebuffer,expectedVisible,actualVisible,prepared,preparedCovers,areaReductionPct:areaReduction};}catch(e){return {valid:false,error:String(e.stack||e)};}
};

for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 let browser=null;
 try{
  browser=await type.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
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
    const initial=await page.evaluate(()=>window.__atlasReview.meta()),initialDataset=await page.locator('#atlas').evaluate(e=>({...e.dataset})),initialGeometry=geometryDiagnostics(initial,initialDataset);
    const iv=initial.viewport,ix=(iv.centerX-initial.camera.ox)/initial.camera.s,iy=(iv.centerY-initial.camera.oy)/initial.camera.s;
    const initialValid=initial.receipt.id===initial.request.id&&initial.receipt.intent===initial.request.intent&&initial.receipt.key===initial.request.key&&initial.receipt.revision===initial.request.revision&&JSON.stringify(initial.receipt.view)===JSON.stringify(initial.request.view)&&initial.receipt.region[0]<=initial.request.visible[0]&&initial.receipt.region[1]<=initial.request.visible[1]&&initial.receipt.region[2]>=initial.request.visible[2]&&initial.receipt.region[3]>=initial.request.visible[3]&&Math.abs(initial.receipt.view.x-ix)<1e-7&&Math.abs(initial.receipt.view.y-iy)<1e-7&&Math.abs(initial.receipt.view.s-initial.camera.s)<1e-9&&initialGeometry.valid&&initial.request.view.coordinateSpace==='campaign-world'&&initial.request.view.viewport.coordinateSpace==='canvas-css'&&initial.receipt.coordinateSpace==='campaign-world'&&initial.receipt.viewport.coordinateSpace==='canvas-css';
    result.initial={scene,meta:initial,dataset:initialDataset,geometry:initialGeometry,expectedView:{x:ix,y:iy,s:initial.camera.s},valid:initialValid};if(!initialValid)result.errors.push('initial camera receipt or viewport geometry mismatch');
    result.startImage=file(engine+'-'+candidate+'-camera-start.png');
    await page.screenshot({path:join(output,result.startImage)});
    const motion=await page.evaluate(async()=>{
     const r=window.__atlasReview,c=document.querySelector('#atlas'),gaps=[],steps=[],rafNow=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now())));
     const geometryValid=(d,req,k,v)=>{try{const range=JSON.parse(d.atlasHeightRange||'null'),world=JSON.parse(d.atlasWorldBounds||'null'),fb=JSON.parse(d.atlasFramebufferViewport||'null'),visible=JSON.parse(d.atlasVisibleBounds||'null'),stored=JSON.parse(d.atlasViewport||'null');if(!range||!world||!fb||!visible||!stored)return false;const pr=v.pixelRatio??1,cw=Math.round(v.canvasWidth*pr),ch=Math.round(v.canvasHeight*pr),left=Math.round(v.left*pr),right=Math.round(v.rightEdge*pr),top=Math.round(v.top*pr),bottom=Math.round(v.bottomEdge*pr),expectedFb={x:left,y:ch-bottom,width:right-left,height:bottom-top},tilt=req.tilt??0,cs=Math.sqrt(1-tilt*tilt),screenRight=v.rightEdge,screenBottom=v.bottomEdge,x0=(v.left-k.ox)/k.s,x1=(screenRight-k.ox)/k.s,y0=k.y+((v.top-v.centerY)/k.s+(range.minZ-range.datum)*tilt)/cs,y1=k.y+((screenBottom-v.centerY)/k.s+(range.maxZ-range.datum)*tilt)/cs,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),expectedVisible=[clamp(Math.floor(x0),world[0],world[2]),clamp(Math.floor(y0),world[1],world[3]),clamp(Math.ceil(x1),world[0],world[2]),clamp(Math.ceil(y1),world[1],world[3])],prepared=JSON.parse(d.atlasPreparedBounds||'null'),viewportMatches=['left','right','top','bottom','rightEdge','bottomEdge','width','height','centerX','centerY','canvasWidth','canvasHeight','pixelRatio','coordinateSpace','origin'].every(key=>stored[key]===v[key]);return ['x','y','width','height'].every(key=>fb[key]===expectedFb[key])&&JSON.stringify(visible)===JSON.stringify(expectedVisible)&&JSON.stringify(req.visible)===JSON.stringify(expectedVisible)&&prepared&&prepared[0]<=expectedVisible[0]&&prepared[1]<=expectedVisible[1]&&prepared[2]>=expectedVisible[2]&&prepared[3]>=expectedVisible[3]&&viewportMatches&&Number.isFinite(Number(d.atlasPreparedAreaReductionPct))&&Number(d.atlasPreparedAreaReductionPct)>=0&&Number(d.atlasPreparedAreaReductionPct)<=100&&req.view.coordinateSpace==='campaign-world'&&req.view.viewport.coordinateSpace==='canvas-css';}catch{return false;}};
     const hash=async()=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data,h=await crypto.subtle.digest('SHA-256',p);return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');};
     const startMeta=r.meta(),camera={x:startMeta.camera.x,y:startMeta.camera.y,zoom:startMeta.camera.zoom},pixels=await hash();
     const actions=[{dx:22,dy:6,f:1,label:'pan-east-south'},{dx:-44,dy:0,f:1,label:'pan-west'},{dx:0,dy:-12,f:1,label:'pan-north'},{dx:0,dy:24,f:1,label:'pan-south'},{dx:0,dy:0,f:1.18,label:'zoom-in'},{dx:0,dy:0,f:1/1.18,label:'zoom-out'},{dx:720,dy:300,f:1,label:'visit-cold-region'},{restore:true,camera,label:'return-to-original-region'}];
     for(const a of actions){
      const before=Number(c.dataset.atlasFrame),q=a.restore?r.restoreCamera(a.camera):r.motion(a.dx,a.dy,a.f),began=performance.now(),raf=[];let prev=began,step=null;
      while(performance.now()-began<90000){
       const t=await rafNow();raf.push(t-prev);prev=t;
       const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
       const v=q.viewport,k=q.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
       const valid=d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===q.intent&&Number(d.atlasFrame)>before&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===q.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&JSON.stringify(req.view.viewport)===JSON.stringify(v)&&Math.abs(req.view.x-ex)<1e-7&&Math.abs(req.view.y-ey)<1e-7&&Math.abs(req.view.s-k.s)<1e-9&&Math.abs(k.x-ex)<1e-7&&Math.abs(k.y-ey)<1e-7&&rec.coordinateSpace==='campaign-world'&&rec.viewport.coordinateSpace==='canvas-css'&&geometryValid(d,req,k,v);
       if(valid){const m=r.meta();step={ok:true,label:a.label,latencyMs:performance.now()-began,raf,request:req,receipt:rec,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},meta:{camera:m.camera,human:m.human,cache:m.cache,prepMs:m.prepMs,uploadMs:m.uploadMs,firstUsefulMs:m.firstUsefulMs}};break;}
      }
      if(!step)step={ok:false,label:a.label,raf,error:'camera presentation receipt timeout',dataset:{...c.dataset},pending:r.pending(),expected:q};
      steps.push(step);gaps.push(...raf);
      if(!step.ok)break;
     }
     const sweep={gaps:[],frames:[],errors:[]};
     for(let i=0;i<60;i++){
      const before=Number(c.dataset.atlasFrame),q=r.motion(Math.floor(i/5)%2===0?2.4:-2.4,Math.floor(i/10)%2===0?1.2:-1.2,1),began=performance.now();let prev=began,sample=null;
      while(performance.now()-began<2500){
       const t=await rafNow();sweep.gaps.push(t-prev);prev=t;
       const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
       const v=q.viewport,k=q.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
       const valid=d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===q.intent&&Number(d.atlasFrame)>before&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===q.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&JSON.stringify(req.view.viewport)===JSON.stringify(v)&&rec.coordinateSpace==='campaign-world'&&rec.viewport.coordinateSpace==='canvas-css'&&geometryValid(d,req,k,v);
       if(valid){sample={frame:Number(d.atlasFrame),latencyMs:performance.now()-began,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},receipt:{id:rec.id,intent:rec.intent,key:rec.key,revision:rec.revision,view:rec.view}};break;}
      }
      if(!sample){sweep.errors.push({frame:i,error:'sustained motion frame had no current receipt',dataset:{...c.dataset},pending:r.pending(),expected:q});break;}
      sweep.frames.push(sample);
     }
     const restoreBefore=Number(c.dataset.atlasFrame),restore=r.restoreCamera(camera),restoreStart=performance.now();let restoreReceipt=null,restorePrev=restoreStart;
     while(performance.now()-restoreStart<90000){
      const t=await rafNow();sweep.gaps.push(t-restorePrev);restorePrev=t;
      const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
      const v=restore.viewport,k=restore.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
      if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===restore.intent&&Number(d.atlasFrame)>restoreBefore&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===restore.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&rec.coordinateSpace==='campaign-world'&&rec.viewport.coordinateSpace==='canvas-css'&&geometryValid(d,req,k,v)){restoreReceipt={ok:true,latencyMs:performance.now()-restoreStart,receipt:rec,expectedView:{x:ex,y:ey,s:k.s}};break;}
     }
     if(!restoreReceipt)sweep.errors.push({error:'restore after sustained motion did not present',dataset:{...c.dataset},pending:r.pending(),expected:restore});sweep.restore=restoreReceipt;
     const finalMeta=steps.length===8&&steps.every(s=>s.ok)&&sweep.frames.length===60&&sweep.errors.length===0&&sweep.restore?.ok?r.meta():null,finalPixels=finalMeta?await hash():null,sorted=sweep.gaps.slice().sort((a,b)=>a-b),frameIntervalsValid=sweep.gaps.length>0&&sweep.gaps.every(v=>Number.isFinite(v)&&v>0),fps=frameIntervalsValid?1000*sweep.gaps.length/sweep.gaps.reduce((a,b)=>a+b,0):0,p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:Infinity;
     return {steps,sweep,gaps:sweep.gaps,fps,p95,frameIntervalsValid,rafClock:'performance.now inside requestAnimationFrame',initialPixels:pixels,finalPixels,pixelEquivalent:!!finalPixels&&pixels===finalPixels,initialCache:startMeta.cache,finalCache:finalMeta?.cache??null,terrainCacheReuse:!!finalMeta&&finalMeta.cache.hits>startMeta.cache.hits,spatialLayerReuse:steps.some(s=>s.meta?.human?.spatialReuse),finalCamera:finalMeta?.camera??null};
    });
    result.motion=motion;
    if(motion.steps.length!==8||motion.steps.some(s=>!s.ok))result.errors.push('camera traversal or presentation receipt failed');if(motion.sweep?.frames.length!==60||motion.sweep.errors.length||!motion.sweep.restore?.ok)result.errors.push('sustained camera sweep or receipt validation failed');
    if(!motion.terrainCacheReuse)result.errors.push('previously visited terrain region was not reused');if(!motion.frameIntervalsValid)result.errors.push('camera frame intervals were not finite and positive');
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
