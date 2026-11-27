import {chromium,webkit} from '@playwright/test';
import {aggregatePresentation} from './atlas-presentation-evidence.mjs';
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
const copyImages=new Map(),directImages=new Map();
const imageDiff=async(page,a,b)=>page.evaluate(async([a,b])=>{const decode=async v=>createImageBitmap(await (await fetch('data:image/png;base64,'+v)).blob()),[x,y]=await Promise.all([decode(a),decode(b)]);if(x.width!==y.width||x.height!==y.height)throw Error('Browser screenshot dimensions differ');const c=document.createElement('canvas');c.width=x.width;c.height=x.height;const q=c.getContext('2d',{willReadFrequently:true});q.drawImage(x,0,0);const A=q.getImageData(0,0,c.width,c.height);q.clearRect(0,0,c.width,c.height);q.drawImage(y,0,0);const B=q.getImageData(0,0,c.width,c.height),mask=q.createImageData(c.width,c.height);let count=0,max=0;for(let i=0;i<A.data.length;i+=4){let d=0;for(let j=0;j<4;j++)d=Math.max(d,Math.abs(A.data[i+j]-B.data[i+j]));if(d){count++;max=Math.max(max,d);mask.data.set([255,Math.min(255,d*8),0,255],i);}}q.putImageData(mask,0,0);return {count,max,width:c.width,height:c.height,png:c.toDataURL('image/png').split(',')[1]};},[a.toString('base64'),b.toString('base64')]);
const expectedFramebufferViewport=v=>{const dpr=v.pixelRatio??1,cw=Math.round(v.canvasWidth*dpr),ch=Math.round(v.canvasHeight*dpr),left=Math.round(v.left*dpr),right=Math.round(v.rightEdge*dpr),top=Math.round(v.top*dpr),bottom=Math.round(v.bottomEdge*dpr);return {x:left,y:ch-bottom,width:right-left,height:bottom-top};};
const geometryDiagnostics=(meta,dataset)=>{
 try{const v=meta.viewport,k=meta.camera,req=meta.request,range=JSON.parse(dataset.atlasHeightRange||'null'),world=JSON.parse(dataset.atlasWorldBounds||'null'),actualFramebuffer=JSON.parse(dataset.atlasFramebufferViewport||'null'),actualVisible=JSON.parse(dataset.atlasVisibleBounds||'null'),prepared=JSON.parse(dataset.atlasPreparedBounds||'null'),storedViewport=JSON.parse(dataset.atlasViewport||'null');if(!range||!world||!actualFramebuffer||!actualVisible||!prepared||!storedViewport)return {valid:false,error:'missing viewport diagnostics'};const expectedFramebuffer=expectedFramebufferViewport(v),tilt=req.tilt??0,cs=Math.sqrt(1-tilt*tilt),right=v.rightEdge,bottom=v.bottomEdge,x0=(v.left-k.ox)/k.s,x1=(right-k.ox)/k.s,y0=k.y+((v.top-v.centerY)/k.s+(range.minZ-range.datum)*tilt)/cs,y1=k.y+((bottom-v.centerY)/k.s+(range.maxZ-range.datum)*tilt)/cs,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),expectedVisible=[clamp(Math.floor(x0),world[0],world[2]),clamp(Math.floor(y0),world[1],world[3]),clamp(Math.ceil(x1),world[0],world[2]),clamp(Math.ceil(y1),world[1],world[3])],framebufferMatches=['x','y','width','height'].every(key=>actualFramebuffer[key]===expectedFramebuffer[key]),viewportMatches=['left','right','top','bottom','rightEdge','bottomEdge','width','height','centerX','centerY','canvasWidth','canvasHeight','pixelRatio','coordinateSpace','origin'].every(key=>storedViewport[key]===v[key]),preparedCovers=prepared[0]<=expectedVisible[0]&&prepared[1]<=expectedVisible[1]&&prepared[2]>=expectedVisible[2]&&prepared[3]>=expectedVisible[3],areaReduction=Number(dataset.atlasPreparedAreaReductionPct);return {valid:framebufferMatches&&viewportMatches&&JSON.stringify(actualVisible)===JSON.stringify(expectedVisible)&&JSON.stringify(req.visible)===JSON.stringify(expectedVisible)&&preparedCovers&&Number.isFinite(areaReduction)&&areaReduction>=0&&areaReduction<=100,expectedFramebuffer,actualFramebuffer,expectedVisible,actualVisible,prepared,preparedCovers,areaReductionPct:areaReduction};}catch(e){return {valid:false,error:String(e.stack||e)};}
};

for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 let browser=null;
 try{
  browser=await type.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  for(const candidate of candidates)for(const composition of ['copy','direct','resident']){
   const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
   const page=await context.newPage(),pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e.stack||e)));
   const result={engine,candidate,composition,passed:false,steps:[],errors:[],pageErrors};report.push(result);save();
   try{
    await page.goto(url);
    await page.locator('[data-act="atlaslab"]').click();
    await page.locator('#atlasseed').fill('atlas-mountain-173');
    await page.locator('#atlasshape').selectOption('continents');
    await page.locator('#atlasdem').setInputFiles(payload);
    await page.locator('[data-act="atlasstart"]').click();
    await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
    await page.evaluate(mode=>window.__atlasReview.composition(mode,true),composition);
    const scene=await page.evaluate(o=>window.__atlasReview.scene('capital',o),{zoom:12,full:true,tilt:true,surfaceScale:true,identity:true,human:true,urban:true,culture:candidate,keepCache:false});
    await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},scene,{timeout:90000});
    const initial=await page.evaluate(()=>window.__atlasReview.meta()),initialDataset=await page.locator('#atlas').evaluate(e=>({...e.dataset})),initialGeometry=geometryDiagnostics(initial,initialDataset);
    const iv=initial.viewport,ix=(iv.centerX-initial.camera.ox)/initial.camera.s,iy=(iv.centerY-initial.camera.oy)/initial.camera.s;
    const initialValid=initial.receipt.id===initial.request.id&&initial.receipt.intent===initial.request.intent&&initial.receipt.key===initial.request.key&&initial.receipt.revision===initial.request.revision&&JSON.stringify(initial.receipt.view)===JSON.stringify(initial.request.view)&&initial.receipt.region[0]<=initial.request.visible[0]&&initial.receipt.region[1]<=initial.request.visible[1]&&initial.receipt.region[2]>=initial.request.visible[2]&&initial.receipt.region[3]>=initial.request.visible[3]&&Math.abs(initial.receipt.view.x-ix)<1e-7&&Math.abs(initial.receipt.view.y-iy)<1e-7&&Math.abs(initial.receipt.view.s-initial.camera.s)<1e-9&&initialGeometry.valid&&initial.request.view.coordinateSpace==='campaign-world'&&initial.request.view.viewport.coordinateSpace==='canvas-css'&&initial.receipt.coordinateSpace==='campaign-world'&&initial.receipt.viewport.coordinateSpace==='canvas-css';
    result.initial={scene,meta:initial,dataset:initialDataset,geometry:initialGeometry,expectedView:{x:ix,y:iy,s:initial.camera.s},valid:initialValid};if(!initialValid)result.errors.push('initial camera receipt or viewport geometry mismatch');
    result.surface=await page.evaluate(()=>window.__atlasReview.surfaceInfo());if(result.surface.active!==composition)result.errors.push('requested composition not active');if(composition!=='copy'&&(!initial.receipt.pair||initial.receipt.pair.terrainFrame!==initial.receipt.pair.overlayFrame||initial.receipt.pair.requestId!==initial.receipt.id))result.errors.push('missing paired surface receipt');
    const prefix=engine+'-'+candidate+'-'+composition,clip={x:Math.ceil(iv.left),y:Math.ceil(iv.top),width:Math.floor(iv.rightEdge)-Math.ceil(iv.left),height:Math.floor(iv.bottomEdge)-Math.ceil(iv.top)},shot=()=>page.screenshot({clip,style:'#notice { visibility:hidden !important }',animations:'disabled'});
    const browserStart=await shot();writeFileSync(join(output,prefix+'-browser-start.png'),browserStart);
    if(composition==='copy')copyImages.set(engine+'-'+candidate,browserStart);else{const d=await imageDiff(page,copyImages.get(engine+'-'+candidate),browserStart);writeFileSync(join(output,prefix+'-copy-difference.png'),Buffer.from(d.png,'base64'));delete d.png;result.copyDirectPixels=d;if(composition==='direct')directImages.set(engine+'-'+candidate,browserStart);else{const e=await imageDiff(page,directImages.get(engine+'-'+candidate),browserStart);writeFileSync(join(output,prefix+'-direct-difference.png'),Buffer.from(e.png,'base64'));delete e.png;result.directResidentPixels=e;if(e.count)result.errors.push('resident and direct browser screenshots differ');}}
    result.startImage=file(prefix+'-camera-start.png');
    await page.screenshot({path:join(output,result.startImage)});save();
    const motion=await page.evaluate(async()=>{
     const r=window.__atlasReview,c=document.querySelector('#atlas'),gaps=[],steps=[],rafNow=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now())));
     const geometryValid=(d,req,k,v)=>{try{const range=JSON.parse(d.atlasHeightRange||'null'),world=JSON.parse(d.atlasWorldBounds||'null'),fb=JSON.parse(d.atlasFramebufferViewport||'null'),visible=JSON.parse(d.atlasVisibleBounds||'null'),stored=JSON.parse(d.atlasViewport||'null');if(!range||!world||!fb||!visible||!stored)return false;const pr=v.pixelRatio??1,cw=Math.round(v.canvasWidth*pr),ch=Math.round(v.canvasHeight*pr),left=Math.round(v.left*pr),right=Math.round(v.rightEdge*pr),top=Math.round(v.top*pr),bottom=Math.round(v.bottomEdge*pr),expectedFb={x:left,y:ch-bottom,width:right-left,height:bottom-top},tilt=req.tilt??0,cs=Math.sqrt(1-tilt*tilt),screenRight=v.rightEdge,screenBottom=v.bottomEdge,x0=(v.left-k.ox)/k.s,x1=(screenRight-k.ox)/k.s,y0=k.y+((v.top-v.centerY)/k.s+(range.minZ-range.datum)*tilt)/cs,y1=k.y+((screenBottom-v.centerY)/k.s+(range.maxZ-range.datum)*tilt)/cs,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),expectedVisible=[clamp(Math.floor(x0),world[0],world[2]),clamp(Math.floor(y0),world[1],world[3]),clamp(Math.ceil(x1),world[0],world[2]),clamp(Math.ceil(y1),world[1],world[3])],prepared=JSON.parse(d.atlasPreparedBounds||'null'),viewportMatches=['left','right','top','bottom','rightEdge','bottomEdge','width','height','centerX','centerY','canvasWidth','canvasHeight','pixelRatio','coordinateSpace','origin'].every(key=>stored[key]===v[key]);return ['x','y','width','height'].every(key=>fb[key]===expectedFb[key])&&JSON.stringify(visible)===JSON.stringify(expectedVisible)&&JSON.stringify(req.visible)===JSON.stringify(expectedVisible)&&prepared&&prepared[0]<=expectedVisible[0]&&prepared[1]<=expectedVisible[1]&&prepared[2]>=expectedVisible[2]&&prepared[3]>=expectedVisible[3]&&viewportMatches&&Number.isFinite(Number(d.atlasPreparedAreaReductionPct))&&Number(d.atlasPreparedAreaReductionPct)>=0&&Number(d.atlasPreparedAreaReductionPct)<=100&&req.view.coordinateSpace==='campaign-world'&&req.view.viewport.coordinateSpace==='canvas-css';}catch{return false;}};
     const hash=async p=>{const h=await crypto.subtle.digest('SHA-256',p);return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');};
     const startCapture=await r.captureCameraLayers();const startMeta=r.meta(),camera={x:startMeta.camera.x,y:startMeta.camera.y,zoom:startMeta.camera.zoom},pixels=await hash(startCapture.layers.final.data);
     const actions=[{dx:22,dy:6,f:1,label:'pan-east-south'},{dx:-44,dy:0,f:1,label:'pan-west'},{dx:0,dy:-12,f:1,label:'pan-north'},{dx:0,dy:24,f:1,label:'pan-south'},{dx:0,dy:0,f:1.18,label:'zoom-in'},{dx:0,dy:0,f:1/1.18,label:'zoom-out'},{dx:720,dy:300,f:1,label:'visit-cold-region'},{restore:true,camera,label:'return-to-original-region'}];
     for(const a of actions){
      const before=Number(c.dataset.atlasFrame),q=a.restore?r.restoreCamera(a.camera):r.motion(a.dx,a.dy,a.f),began=performance.now(),raf=[];let prev=began,step=null;
      while(performance.now()-began<90000){
       const t=await rafNow();raf.push(t-prev);prev=t;
       const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
       const v=q.viewport,k=q.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
       const valid=d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===q.intent&&Number(d.atlasFrame)>before&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===q.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&JSON.stringify(req.view.viewport)===JSON.stringify(v)&&Math.abs(req.view.x-ex)<1e-7&&Math.abs(req.view.y-ey)<1e-7&&Math.abs(req.view.s-k.s)<1e-9&&Math.abs(k.x-ex)<1e-7&&Math.abs(k.y-ey)<1e-7&&rec.coordinateSpace==='campaign-world'&&rec.viewport.coordinateSpace==='canvas-css'&&geometryValid(d,req,k,v);
       if(valid){const m=r.meta();step={ok:true,label:a.label,latencyMs:performance.now()-began,raf,request:req,receipt:rec,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},meta:{camera:m.camera,human:m.human,cache:m.cache,prepMs:m.prepMs,uploadMs:m.uploadMs,firstUsefulMs:m.firstUsefulMs,profile:r.cameraProfile()}};break;}
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
       if(valid){sample={frame:Number(d.atlasFrame),latencyMs:performance.now()-began,camera:k,viewport:v,expectedView:{x:ex,y:ey,s:k.s},receipt:{id:rec.id,intent:rec.intent,key:rec.key,revision:rec.revision,view:rec.view},profile:r.cameraProfile()};break;}
      }
      if(!sample){sweep.errors.push({frame:i,error:'sustained motion frame had no current receipt',dataset:{...c.dataset},pending:r.pending(),expected:q});break;}
      sweep.frames.push(sample);
     }
     const restoreBefore=Number(c.dataset.atlasFrame),restore=r.restoreCamera(camera),restoreStart=performance.now();let restoreReceipt=null,restorePrev=restoreStart;
     while(performance.now()-restoreStart<90000){
      const t=await rafNow();restorePrev=t;
      const d=c.dataset;let req=null,rec=null;try{req=JSON.parse(d.atlasRequest||'null');rec=JSON.parse(d.atlasReceipt||'null');}catch{}
      const v=restore.viewport,k=restore.camera,ex=(v.width/2-(k.ox-v.left))/k.s,ey=(v.height/2-(k.oy-v.top))/k.s,reg=rec&&rec.region,vis=req&&req.visible;
      if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===restore.intent&&Number(d.atlasFrame)>restoreBefore&&req&&rec&&req.id===Number(d.atlasRequestId)&&req.intent===restore.intent&&rec.id===req.id&&rec.intent===req.intent&&rec.key===req.key&&rec.revision===req.revision&&reg&&vis&&reg[0]<=vis[0]&&reg[1]<=vis[1]&&reg[2]>=vis[2]&&reg[3]>=vis[3]&&Math.abs(rec.view.x-ex)<1e-7&&Math.abs(rec.view.y-ey)<1e-7&&Math.abs(rec.view.s-k.s)<1e-9&&JSON.stringify(rec.view.viewport)===JSON.stringify(v)&&rec.coordinateSpace==='campaign-world'&&rec.viewport.coordinateSpace==='canvas-css'&&geometryValid(d,req,k,v)){restoreReceipt={ok:true,latencyMs:performance.now()-restoreStart,receipt:rec,expectedView:{x:ex,y:ey,s:k.s}};break;}
     }
     if(!restoreReceipt)sweep.errors.push({error:'restore after sustained motion did not present',dataset:{...c.dataset},pending:r.pending(),expected:restore});sweep.restore=restoreReceipt;
     const finalMeta=steps.length===8&&steps.every(s=>s.ok)&&sweep.frames.length===60&&sweep.errors.length===0&&sweep.restore?.ok?r.meta():null,sorted=sweep.gaps.slice().sort((a,b)=>a-b),frameIntervalsValid=sweep.gaps.length>0&&sweep.gaps.every(v=>Number.isFinite(v)&&v>0),rafFps=frameIntervalsValid?1000*sweep.gaps.length/sweep.gaps.reduce((a,b)=>a+b,0):0,deliveryElapsed=sweep.frames.reduce((n,f)=>n+f.latencyMs,0),deliveryIntervals=sweep.frames.map(f=>f.latencyMs).sort((a,b)=>a-b),fps=deliveryElapsed>0?1000*sweep.frames.length/deliveryElapsed:0,p95=deliveryIntervals.length?deliveryIntervals[Math.ceil(.95*deliveryIntervals.length)-1]:Infinity;
     const finalCapture=await r.captureCameraLayers(),finalPixels=finalMeta?await hash(finalCapture.layers.final.data):null,layerDiffs={},originalLayers={};for(const [when,capture] of [['start',startCapture],['end',finalCapture]])for(const [name,a] of Object.entries(capture.layers)){const cv=document.createElement('canvas');cv.width=a.width;cv.height=a.height;const ctx=cv.getContext('2d');ctx.putImageData(new ImageData(a.data,a.width,a.height),0,0);originalLayers[when+'-'+name]=cv.toDataURL('image/png').split(',')[1];}for(const [name,a] of Object.entries(startCapture.layers)){const b=finalCapture.layers[name];if(!b||a.width!==b.width||a.height!==b.height)throw Error('Layer dimensions changed: '+name);const mask=document.createElement('canvas');mask.width=a.width;mask.height=a.height;const ctx=mask.getContext('2d'),im=ctx.createImageData(a.width,a.height),points=[];let count=0,max=0;for(let i=0;i<a.data.length;i+=4){let delta=0;for(let j=0;j<4;j++)delta=Math.max(delta,Math.abs(a.data[i+j]-b.data[i+j]));if(delta){count++;max=Math.max(max,delta);if(points.length<4096)points.push([i/4%a.width,Math.floor(i/4/a.width),delta]);im.data.set([255,Math.min(255,delta*8),0,255],i);}}ctx.putImageData(im,0,0);layerDiffs[name]={width:a.width,height:a.height,count,max,points,readbackMs:[a.readbackMs,b.readbackMs],png:mask.toDataURL('image/png').split(',')[1]};}return {steps,sweep,gaps:sweep.gaps,fps,p95,rafFps,rafP95:sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null,frameIntervalsValid,layerDiffs,originalLayers,diagnosticProfiles:{start:startCapture.profile,end:finalCapture.profile},rafClock:'performance.now inside requestAnimationFrame',initialPixels:pixels,finalPixels,pixelEquivalent:!!finalPixels&&pixels===finalPixels,initialCache:startMeta.cache,finalCache:finalMeta?.cache??null,terrainCacheReuse:!!finalMeta&&finalMeta.cache.hits>startMeta.cache.hits,spatialLayerReuse:steps.some(s=>s.meta?.human?.spatialReuse),finalCamera:finalMeta?.camera??null};
    });
    result.motion=motion;for(const [name,png] of Object.entries(motion.originalLayers)){writeFileSync(join(output,file(prefix+'-'+name+'.png')),Buffer.from(png,'base64'));}delete motion.originalLayers;for(const [name,diff] of Object.entries(motion.layerDiffs)){writeFileSync(join(output,file(prefix+'-'+name+'-difference.png')),Buffer.from(diff.png,'base64'));delete diff.png;}writeFileSync(join(output,file(prefix+'-layer-diffs.json')),JSON.stringify(motion.layerDiffs));save();
    if(motion.steps.length!==8||motion.steps.some(s=>!s.ok))result.errors.push('camera traversal or presentation receipt failed');if(motion.sweep?.frames.length!==60||motion.sweep.errors.length||!motion.sweep.restore?.ok)result.errors.push('sustained camera sweep or receipt validation failed');
    if(!motion.terrainCacheReuse)result.errors.push('previously visited terrain region was not reused');if(!motion.frameIntervalsValid)result.errors.push('camera frame intervals were not finite and positive');
    if(!motion.pixelEquivalent)result.errors.push('return-to-origin canvas pixels differ');
    if(motion.fps<55||motion.p95>33.3)result.errors.push('camera motion threshold failed');
    result.spatialArchitectureReuse=motion.spatialLayerReuse; // report separately: exact pose reuse is not translated raster reuse
    if(pageErrors.length)result.errors.push('browser page errors occurred');
    const browserEnd=await shot();writeFileSync(join(output,prefix+'-browser-end.png'),browserEnd);
    const browserDiff=await imageDiff(page,browserStart,browserEnd);writeFileSync(join(output,prefix+'-browser-return-difference.png'),Buffer.from(browserDiff.png,'base64'));delete browserDiff.png;result.browserReturnPixels=browserDiff;if(browserDiff.count)result.errors.push('actual browser map screenshot differs after return');
    result.endImage=file(prefix+'-camera-end.png');await page.screenshot({path:join(output,result.endImage)});
    // Continuous input: one new input on each RAF, independent of per-pose receipt waits.
    // Two instrumented repetitions and one profiling-disabled control, identical path.
    result.continuous=await page.evaluate(async()=>{const r=window.__atlasReview,c=document.querySelector('#atlas'),origin=r.cameraPresentation().camera,raf=()=>new Promise(ok=>requestAnimationFrame(()=>ok(performance.now()))),runs=[];
      const restore=async()=>{r.restoreCamera(origin);const started=performance.now();while(performance.now()-started<15000){await raf();const d=c.dataset;try{const rec=JSON.parse(d.atlasReceipt);if(d.atlasSurface==='ready'&&rec.id===Number(d.atlasRequestId)&&Math.abs(rec.view.x-origin.x)<1e-7&&Math.abs(rec.view.y-origin.y)<1e-7)return true;}catch{}}return false;};
      for(const enabled of [true,true,false]){r.cameraProfiling(enabled);const frames=[],before=Number(c.dataset.atlasFrame),started=await raf();let prev=started,previousFrame=before;r.presentationEvidence('begin');
       for(let i=0;i<60;i++){const pose=r.motion(Math.floor(i/5)%2===0?2.4:-2.4,Math.floor(i/10)%2===0?1.2:-1.2,1),t=await raf(),frame=Number(c.dataset.atlasFrame);frames.push({input:i,inputId:pose.inputId,inputAt:pose.inputAt,gapMs:t-prev,frame,advanced:frame>previousFrame,pose:pose.camera,profile:enabled?r.cameraProfile():null,active:c.dataset.atlasCompositionActive,pair:c.dataset.atlasPair?JSON.parse(c.dataset.atlasPair):null});previousFrame=frame;prev=t;}
       const elapsed=prev-started;await raf();await raf();await raf();const journal=r.presentationEvidence('end');runs.push({profiling:enabled,frames,elapsedMs:elapsed,journal,frameUpdates:frames.filter(f=>f.advanced).length,restored:await restore()});}
      r.cameraProfiling(true);return runs;});
    result.continuous=result.continuous.map(x=>({...x,...aggregatePresentation(x.journal,x.frames,x.elapsedMs)}));save();if(result.continuous.some(x=>x.errors.length||x.frames.length!==60||!x.restored||x.advanced!==60||x.fps<55||!Number.isFinite(x.p95)||x.p95>33.3))result.errors.push('continuous motion threshold or frame delivery failed');
    // Independent diagnostics are deliberately outside all measured RAF loops.
    result.gpuDiagnostic=await page.evaluate(()=>window.__atlasReview.gpuProbe());
    result.architectureExperiment=await page.evaluate(async()=>{const r=window.__atlasReview,c=document.querySelector('#atlas'),origin=r.cameraPresentation().camera,raf=()=>new Promise(ok=>requestAnimationFrame(ok)),rows=[];
     const settle=async expected=>{const start=performance.now();while(performance.now()-start<15000){await raf();try{const d=c.dataset,p=JSON.parse(d.atlasReceipt);if(d.atlasSurface==='ready'&&p.id===Number(d.atlasRequestId)&&Math.abs(p.view.x-expected.x)<1e-7&&Math.abs(p.view.y-expected.y)<1e-7&&Math.abs(p.view.s-expected.s)<1e-7)return;}catch{}}throw Error('Architecture experiment receipt timeout');};
     const poses=[['origin',0,0],['same-pose',0,0],['integer',4,0],['fractional',2.4,1.2],['return',0,0]];
     for(const mode of ['fresh','exact','integer','legacy-subpixel','phase']){r.humanCacheMode(mode);for(const [label,dx,dy] of poses){r.restoreCamera(origin);if(dx||dy)r.motion(dx,dy,1);const expected=r.cameraPresentation().expectedView;await settle(expected);const before=r.meta().human,capture=await r.captureCameraLayers(),a=capture.layers.architecture,h=await crypto.subtle.digest('SHA-256',a.data);rows.push({mode,label,hash:Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join(''),cache:before?{reused:!!before.reused,spatialReuse:!!before.spatialReuse,offsetPx:before.offsetPx,poseCacheHit:before.poseCacheHit,phaseCache:before.phaseCache}:null});}}
     r.humanCacheMode('phase');r.restoreCamera(origin);await settle(r.cameraPresentation().expectedView);
     const fresh=Object.fromEntries(rows.filter(x=>x.mode==='fresh').map(x=>[x.label,x.hash]));return rows.map(x=>({...x,matchesFresh:x.hash===fresh[x.label]}));});
    if(result.architectureExperiment.some(x=>x.mode==='phase'&&!x.matchesFresh))result.errors.push('exact phase architecture differs from fresh raster');if(candidate!=='cultural'&&!result.architectureExperiment.some(x=>x.mode==='phase'&&x.cache?.poseCacheHit))result.errors.push('exact pose cache was not reused');result.legacyIntegerMismatches=result.architectureExperiment.filter(x=>x.mode==='integer'&&!x.matchesFresh).map(x=>x.label);
    if(composition==='resident'){
     result.residentChecks=[];
     for(const [label,dx,dy,f] of [['origin',0,0,1],['integer-x',4,0,1],['integer-y',0,4,1],['fractional',2.4,1.2,1],['zoom',0,0,1.18],['cold',720,300,1],['return',0,0,1]]){
      const evidence=await page.evaluate(async({origin,dx,dy,f})=>{const r=window.__atlasReview,c=document.querySelector('#atlas');r.restoreCamera(origin);if(dx||dy||f!==1)r.motion(dx,dy,f);const target=r.cameraPresentation().expectedView,start=performance.now();while(performance.now()-start<90000){await new Promise(ok=>requestAnimationFrame(ok));try{const d=c.dataset,p=JSON.parse(d.atlasReceipt);if(d.atlasSurface==='ready'&&p.id===Number(d.atlasRequestId)&&p.pair?.composition==='resident'&&Math.abs(p.view.x-target.x)<1e-7&&Math.abs(p.view.y-target.y)<1e-7&&Math.abs(p.view.s-target.s)<1e-7)return r.residentCompare();}catch(e){if(String(e).includes('Resident receipt'))throw e;}}throw Error('Resident pose timeout');},{origin:initial.camera,dx,dy,f});
      for(const name of ['actual','fresh','diff']){writeFileSync(join(output,prefix+'-'+label+'-terrain-'+name+'.png'),Buffer.from(evidence[name],'base64'));delete evidence[name];}
      result.residentChecks.push({label,...evidence});if(evidence.count)result.errors.push('resident terrain differs from fresh: '+label);save();
     }
     if(!result.residentChecks.some(x=>x.before?.hits>0))result.errors.push('no resident crop hit observed');
     if(result.residentChecks.some(x=>x.before?.bytes>x.before?.limit))result.errors.push('resident memory budget exceeded');
     // Use the same state for portrait/DPR and restricted-knowledge checks.
     await page.setViewportSize({width:390,height:844});
     const partial=await page.evaluate(o=>window.__atlasReview.scene('capital',o),{zoom:12,full:false,tilt:true,surfaceScale:true,identity:true,human:true,urban:true,culture:candidate,keepCache:false});
     await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},partial,{timeout:90000});
     result.mobileFog=await page.evaluate(async()=>({meta:window.__atlasReview.meta(),surface:window.__atlasReview.surfaceInfo(),mutation:await window.__atlasReview.fogMutation()}));
     await page.screenshot({path:join(output,prefix+'-mobile-fog.png')});
     if(result.mobileFog.surface.resident?.bytes!==0||result.mobileFog.surface.resident?.last?.reason!=='restricted-knowledge'||!result.mobileFog.mutation.pixels||!result.mobileFog.mutation.geometry||!result.mobileFog.mutation.contours)result.errors.push('resident restricted-knowledge regression');
     const contextLost=await page.evaluate(()=>window.__atlasReview.loseSurfaceContext());
     result.contextLoss={supported:contextLost};
     if(contextLost){await page.waitForFunction(()=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasCompositionFallback==='context-lost'&&d.atlasCompositionActive==='copy'&&d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId;},null,{timeout:90000});result.contextLoss.recovered=await page.evaluate(()=>window.__atlasReview.surfaceInfo());await page.screenshot({path:join(output,prefix+'-context-recovered.png')});}else result.errors.push('context-loss extension unavailable: recovery unverified');
    }
    if(composition==='direct'){
     result.discardBuffer=await page.evaluate(async()=>{const r=window.__atlasReview,c=document.querySelector('#atlas'),origin=r.cameraPresentation().camera,raf=()=>new Promise(ok=>requestAnimationFrame(()=>ok(performance.now())));r.composition('direct',false);const wait=async()=>{const start=performance.now();while(performance.now()-start<90000){await raf();const d=c.dataset;if(d.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&d.atlasCompositionActive==='direct')return;}throw Error('Direct discard surface not ready');};await wait();const surface=r.surfaceInfo(),frames=[];r.cameraProfiling(false);let previous=await raf(),prior=Number(c.dataset.atlasFrame);const start=previous;r.presentationEvidence('begin');for(let i=0;i<60;i++){const q=r.motion(Math.floor(i/5)%2===0?2.4:-2.4,Math.floor(i/10)%2===0?1.2:-1.2,1);const t=await raf(),frame=Number(c.dataset.atlasFrame);frames.push({inputId:q.inputId,inputAt:q.inputAt,gapMs:t-previous,advanced:frame>prior,frame});prior=frame;previous=t;}const elapsedMs=previous-start;await raf();await raf();await raf();const journal=r.presentationEvidence('end');r.restoreCamera(origin);await wait();r.cameraProfiling(true);return {surface,frames,journal,elapsedMs,frameUpdates:frames.filter(x=>x.advanced).length,gpu:await r.gpuProbe()};});
     result.discardBuffer={...result.discardBuffer,...aggregatePresentation(result.discardBuffer.journal,result.discardBuffer.frames,result.discardBuffer.elapsedMs)};save();if(result.discardBuffer.errors.length)result.errors.push('discard buffer presentation evidence invalid');if(result.discardBuffer.surface.attributes?.preserveDrawingBuffer!==false)result.errors.push('discard drawing buffer context not established');
    }
    result.passed=result.errors.length===0;
    await page.screenshot({path:join(output,prefix+'-diagnostic-end.png')});
   }catch(e){
    result.errors.push(String(e.stack||e));
    result.dataset=await page.locator('#atlas').evaluate(e=>({...e.dataset})).catch(()=>null);
    result.failureImage=file(engine+'-'+candidate+'-'+composition+'-camera-failure.png');
    await page.screenshot({path:join(output,result.failureImage)}).catch(()=>{});
   }finally{save();await context.close();}
  }
 }catch(e){report.push({engine,passed:false,error:String(e.stack||e)});save();}
 finally{await browser?.close();}
}
const failures=report.filter(r=>r.passed===false);
report.push({phase:'aggregate',passed:failures.length===0,engines:['chromium','webkit'],candidates,compositions:['copy','direct','resident'],failures:failures.map(r=>({engine:r.engine,candidate:r.candidate,errors:r.errors}))});
save();
assert.equal(failures.length,0,'Camera Presentation QA failed: '+JSON.stringify(failures.map(r=>({engine:r.engine,candidate:r.candidate,composition:r.composition,errors:r.errors}))));
