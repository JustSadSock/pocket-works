// Review-only bounded event log. A RAF opportunity is not physical scanout.
export class PresentationEvidence {
 constructor(limit=4096){this.limit=limit;this.events=[];this.sequence=0;this.inputSequence=0;this.latest=null;this.overflow=0;this.enabled=false;}
 begin(){this.events=[];this.overflow=0;this.latest=null;this.enabled=true;return this.sequence;}
 add(kind,data={}){if(!this.enabled)return;const event={...data,kind,sequence:++this.sequence,at:performance.now()};if(this.events.length===this.limit){this.events.shift();this.overflow++;}this.events.push(event);return event;}
 input(pose){if(!this.enabled)return null;const inputId=++this.inputSequence;this.latest=inputId;this.add('input',{inputId,pose});return inputId;}
 end(){this.enabled=false;return {events:this.events.slice(),overflow:this.overflow,limit:this.limit};}
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const close=(a,b,t=1e-7)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<t;
const covers=(a,b)=>a?.length===4&&b?.length===4&&a[0]<=b[0]&&a[1]<=b[1]&&a[2]>=b[2]&&a[3]>=b[3];
export function aggregatePresentation(log,inputs,elapsedMs){
 const errors=[],byInput=new Map(),submitted=new Map(),pairs=new Map(),delivered=new Map(),requests=new Map(),instances=new Map(),drops=new Map(),opportunities=[],regions=new Set();
 let lastSeq=0,lastAt=-Infinity,maxBytes=0,hits=0,builds=0,fallbacks=0,shifts=0,exact=0,gpuReuses=0;
 if(log.overflow)errors.push('presentation journal overflow');
 for(const e of log.events){
  if(e.sequence<=lastSeq||e.at<lastAt||!Number.isFinite(e.at))errors.push('nonmonotonic journal');lastSeq=e.sequence;lastAt=e.at;
  if(e.kind==='input'){if(byInput.has(e.inputId))errors.push('duplicate input');byInput.set(e.inputId,e);}
  if(e.kind==='request'){const q=e.request;if(!q||!byInput.has(e.inputId))errors.push('unbound request');else requests.set(e.sequence,e);}
  if(e.kind==='raster-submitted'){
   const request=requests.get(e.requestSequence);if(!request||request.request.id!==e.requestId||request.inputId!==e.inputId)errors.push('unbound raster');
   if(submitted.has(e.frame))errors.push('duplicate raster frame');submitted.set(e.frame,e);
   const s=e.surface?.resident;if(s){const prior=instances.get(s.instance);if(prior&&['allocations','recycles','hits','misses','evictions','fallbacks'].some(k=>s[k]<prior[k]))errors.push('GPU counters decreased');
    instances.set(s.instance,s);maxBytes=Math.max(maxBytes,s.bytes);if(s.bytes>s.limit||s.entries+s.free>s.maxEntries||s.bytes<0)errors.push('memory budget exceeded');
    if(e.surface.reused)gpuReuses++;else if(s.last?.kind==='resident-hit'){hits++;if(s.last.crop?.dx||s.last.crop?.dy)shifts++;}else if(s.last?.kind==='resident-build')builds++;else if(s.last?.kind==='fresh-fallback')fallbacks++;
   }
  }
  if(e.kind==='pair-ready'){const x=submitted.get(e.frame);if(!x||x.requestId!==e.requestId||x.inputId!==e.inputId)errors.push('unbound pair');pairs.set(e.frame,e);if(e.profile?.humanPoseCacheHit)exact++;}
  if(e.kind==='superseded'){drops.set(e.frame,e.reason);}
  if(e.kind==='opportunity'){
   const pair=pairs.get(e.frame),raster=submitted.get(e.frame),req=raster&&requests.get(raster.requestSequence),q=req?.request,input=byInput.get(e.inputId),p=input?.pose,rec=e.receipt,t=e.token;
   if(!pair||!raster||!q||!p||!rec||!t||pair.inputId!==e.inputId||req.inputId!==e.inputId||q.id!==e.requestId||rec.id!==q.id||rec.key!==q.key||rec.intent!==q.intent||rec.intent!==p.intent||rec.revision!==q.revision||rec.detail!==q.detail||rec.contourDetail!==q.contourDetail||rec.tilt!==q.tilt||rec.lod!==raster.lod||rec.coordinateSpace!=='campaign-world'||rec.viewport?.coordinateSpace!=='canvas-css'||!covers(rec.region,q.visible)||!equal(rec.view.viewport,p.viewport)||!equal(q.view.viewport,p.viewport)||!equal(rec.viewport,p.viewport)||!close(rec.view.x,p.expectedView.x)||!close(rec.view.y,p.expectedView.y)||!close(rec.view.s,p.expectedView.s,1e-9)||!close(q.view.x,p.expectedView.x)||!close(q.view.y,p.expectedView.y)||!close(q.view.s,p.expectedView.s,1e-9)||t.terrainFrame!==e.frame||t.overlayFrame!==e.frame||t.requestId!==q.id||t.overlayCompleteAt>t.opportunityAt||t.opportunityAt>e.at||t.submittedAt>t.overlayCompleteAt||pair.sequence>=e.sequence||raster.sequence>=pair.sequence||input.sequence>=req.sequence||e.currentRequestId!==q.id||e.currentFrame!==e.frame||drops.has(e.frame)||t.composition!=='copy'&&!equal(rec.pair,t)){
    errors.push('invalid opportunity frame '+e.frame);continue;
   }
   if(!delivered.has(e.inputId)){delivered.set(e.inputId,e);opportunities.push(e);regions.add(JSON.stringify(rec.region));}
  }
 }
 const ids=inputs.map(f=>f.inputId);if(ids.length!==new Set(ids).size||ids.some(id=>!byInput.has(id))||byInput.size!==ids.length)errors.push('input inventory mismatch');
 const start=inputs[0]?.inputAt??0,last=opportunities.at(-1)?.at??start,duration=Math.max(elapsedMs,last-start),gaps=opportunities.map((e,i)=>e.at-(i?opportunities[i-1].at:start)),sorted=gaps.slice().sort((a,b)=>a-b);
 if(!Number.isFinite(duration)||duration<=0||gaps.some(v=>!Number.isFinite(v)||v<=0))errors.push('invalid presentation clock');
 const totals={};for(const k of ['allocations','recycles','poolTakes','hits','misses','evictions','fallbacks','phaseRejects','coverageRejects'])totals[k]=[...instances.values()].reduce((n,s)=>n+(s[k]??0),0);
 return {errors,inputCount:ids.length,advanced:delivered.size,fps:duration>0?1000*delivered.size/duration:0,p95:sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null,elapsedMs:duration,presentationGaps:gaps,deliveredIds:[...delivered.keys()],missedIds:ids.filter(id=>!delivered.has(id)),missed:ids.filter(id=>!delivered.has(id)).map(inputId=>({inputId,reason:[...pairs.values()].some(e=>e.inputId===inputId&&drops.has(e.frame))?'superseded': [...pairs.values()].some(e=>e.inputId===inputId)?'no-opportunity':[...submitted.values()].some(e=>e.inputId===inputId)?'no-eligible-pair':[...requests.values()].some(e=>e.inputId===inputId)?'no-raster':'not-rendered'})),supersededFrames:[...drops],rasterFrames:submitted.size,pairedFrames:pairs.size,regions:[...regions],spatialHits:hits,nonzeroSpatialShifts:shifts,builds,fallbacks,exactPoseHits:exact,gpuReuses,maxBytes,instances:[...instances.values()],totals};
}
