// Iteration 1/3. Supplemental diagnostics, never a substitute for mandatory QA.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {aggregatePresentation} from './atlas-presentation-evidence.mjs';
export async function boundedWorkloadProbe(page,{engine,candidate,composition,prefix,output}){
 const origin=await page.evaluate(()=>window.__atlasReview.cameraPresentation().camera),rows=[];
 const settle=async()=>page.evaluate(async()=>{const r=window.__atlasReview,c=document.querySelector('#atlas'),q=r.cameraPresentation().expectedView,t=performance.now();while(performance.now()-t<20000){await new Promise(requestAnimationFrame);try{const d=c.dataset,p=JSON.parse(d.atlasReceipt);if(d.atlasSurface==='ready'&&p.id===Number(d.atlasRequestId)&&Math.abs(p.view.x-q.x)<1e-7&&Math.abs(p.view.y-q.y)<1e-7&&Math.abs(p.view.s-q.s)<1e-9)return true;}catch{}}throw Error('Bounded probe did not settle');});
 const set=async mode=>page.evaluate(mode=>window.__atlasReview.cameraWorkload(mode),mode);
 const restore=async()=>{await set(null);await page.evaluate(o=>window.__atlasReview.restoreCamera(o),origin);await settle();};
 const modes=composition==='direct'?['combined','terrain','overlay','moving-lod','land-only','water-only','material-simple','moving-safe']:['combined'];
 const p95=a=>{const s=a.slice().sort((a,b)=>a-b);return s.length?s[Math.ceil(s.length*.95)-1]:null;};
 try{
  for(const mode of modes){
   await restore();await page.evaluate(()=>window.__atlasReview.cameraProfiling(false));
   const before=await page.evaluate(()=>window.__atlasReview.gpuProbe());
   await set(mode);
   const row=await page.evaluate(async mode=>{const r=window.__atlasReview,c=document.querySelector('#atlas'),raf=()=>new Promise(ok=>requestAnimationFrame(()=>ok(performance.now()))),full=['combined','moving-lod','moving-safe'].includes(mode),frames=[];await raf();await raf();let prev=await raf(),start=prev;const before=r.workloadFrame()?.sequence??0;let seq=before;if(full)r.presentationEvidence('begin');for(let i=0;i<60;i++){const pose=r.motion(2.4,.35,1),t=await raf(),f=r.workloadFrame();frames.push({inputId:pose.inputId,inputAt:pose.inputAt,expectedView:pose.expectedView,camera:pose.camera,gapMs:t-prev,workloadFrame:f,advanced:!!f&&f.sequence>seq,receiptPresent:!!c.dataset.atlasReceipt});seq=f?.sequence??seq;prev=t;}const elapsedMs=prev-start;await raf();await raf();await raf();const journal=full?r.presentationEvidence('end'):null;return {mode,frames,elapsedMs,journal,viewport:r.cameraPresentation().viewport,final:r.cameraPresentation().camera};},mode);
   // Screenshots outside timed loops. Partial workload is explicitly not a game frame.
   const image=prefix+'-bounded-'+mode+'-end.png';await page.screenshot({path:join(output,image)});
   const gaps=row.frames.map(f=>f.gapMs),full=!!row.journal,delivery=full?aggregatePresentation(row.journal,row.frames,row.elapsedMs):null;
   const distinct=new Set(row.frames.map(f=>JSON.stringify([f.camera.x,f.camera.y,f.camera.s]))).size;
   const covered=row.frames.filter(f=>f.advanced&&f.workloadFrame?.covered).length,partialReceiptCount=full?null:row.frames.filter(f=>f.receiptPresent).length;
   if(partialReceiptCount)throw Error('Partial workload published a receipt');
   const summary={mode,distinct,covered,partialReceiptCount,rafFps:1000*gaps.length/gaps.reduce((a,b)=>a+b,0),rafP95:p95(gaps),delivery:delivery?{advanced:delivery.advanced,fps:delivery.fps,p95:delivery.p95,errors:delivery.errors,exactPoseHits:delivery.spatialHits,nonzeroSpatialShifts:delivery.nonzeroSpatialShifts}:null,mapP95:p95(row.frames.filter(f=>f.advanced&&f.workloadFrame).map(f=>f.workloadFrame.mapMs)),lods:[...new Set(row.frames.map(f=>f.workloadFrame?.lod))],triangles:p95(row.frames.map(f=>f.workloadFrame?.triangles??0)),waterTriangles:p95(row.frames.map(f=>f.workloadFrame?.waterTriangles??0)),gpu:before,image};
   rows.push({...row,summary,delivery});
   await restore();
  }
 }finally{await restore();await page.evaluate(()=>window.__atlasReview.cameraProfiling(true));}
 const summary={engine,candidate,composition,seed:'atlas-mountain-173',trajectory:{dx:2.4,dy:.35,inputs:60},rows:rows.map(r=>r.summary)};
 writeFileSync(join(output,prefix+'-bounded-recovery.json'),JSON.stringify({summary,rows},null,2));
 return {summary,report:prefix+'-bounded-recovery.json'};
}
