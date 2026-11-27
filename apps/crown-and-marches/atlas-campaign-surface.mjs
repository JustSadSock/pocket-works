// Persistent canvas, bounded CPU region cache, explicit presentation receipts.
import {prepareGeographicCandidate,BakedTerrainGL} from './world-rendering-baked.mjs';
import {atlasProjection,atlasSurfaceHeight,pickAtlasSurface} from './atlas-projection.mjs';
import {vertical} from './world-rendering-gl.mjs';
import {SpatialLRU,clearContourCache,clearScaleTiles} from './genesis-contours.mjs';
import {SurfaceRequests,covers,regionKey} from './atlas-surface-requests.mjs';
const C=(x,a,b)=>Math.max(a,Math.min(b,x));
const heightRanges=new WeakMap();
function surfaceHeightRange(s){
 const key=s.map.geography??s.map,cached=heightRanges.get(key);if(cached)return cached;
 const values=s.map.geography?.bed??s.map.height;let max=-Infinity;
 if(values)for(const h of values)if(Number.isFinite(h))max=Math.max(max,h);
 if(!Number.isFinite(max))max=1;
 const range={minZ:-.035,maxZ:Math.max(.018,vertical(max)+.018)};heightRanges.set(key,range);return range;
}
export class AtlasCampaignSurface{
 constructor(){this.cache=new SpatialLRU(64*1024*1024);this.canvas=document.createElement('canvas');this.requests=new SurfaceRequests();this.pending=null;this.active=null;this.state=null;this.status='';this.epoch=0;this.firstUsefulMs=null;this.requestStart=0;this.notified=false;this.cancelled=0;this.reusedGPU=0;this.gpuDraws=0;this.gpuReuses=0;this.lastGPU=null;this.inFlight=0;this.maxInFlight=0;}
 cancelPending(){if(this.pending&&!this.pending.cancelled){this.pending.cancelled=true;this.cancelled++;}}
 invalidate(){this.cancelPending();const intent=this.requests.invalidate();this.firstUsefulMs=null;this.requestStart=performance.now();this.status='loading';if(this.host){this.host.dataset.atlasSurface='loading';this.host.dataset.atlasReadyId='';this.host.dataset.atlasReceipt='';this.host.dataset.atlasIntent=String(intent);}return intent;}
 reset(s=null,{keepCache=false}={}){this.invalidate();this.epoch++;if(!keepCache||this.state!==s){this.active?.renderer.dispose();this.active=null;this.lastGPU=null;this.cache.clear();if(this.state?.map?.geography){clearContourCache(this.state.map.geography);clearScaleTiles(this.state.map.geography);}}this.state=s;this.notified=false;this.error='';}
 paint(atlas,s,cam,c,w,h,quality){
 this.host=atlas.canvas;if(this.state!==s)this.reset(s);
 const W=s.map.geography?(s.map.geography.width-1)/s.map.geography.detail:cam.w,H=cam.h,surfaceScale=cam.surfaceScale!==false,identity=surfaceScale&&cam.atlasIdentity!==false,full=!!(s.autonomous||s.discovery?.fullMap),detail=surfaceScale&&full&&cam.s<9?2:cam.s<9?4:8,contourDetail=surfaceScale&&full&&cam.s<9?2:cam.s<9?4:cam.s>=(identity?58:32)?16:8,chart=s.discovery?.chartRevision?.[s.playerFaction??0]??0,knowledge=[s.playerFaction??0,chart,+!!s.autonomous, +!!s.discovery?.fullMap,+surfaceScale,+identity].join(':'),revision=[knowledge,detail,contourDetail].join(':');
 const layout=cam.viewport?.canvasWidth===w&&cam.viewport?.canvasHeight===h?cam.viewport:cam.layout(w,h),dpr=quality==='low'?1:Math.min(1.5,devicePixelRatio||1),viewport={...layout,pixelRatio:dpr},tilt=cam.atlasTilt?.28:0,heightRange=surfaceHeightRange(s),activeStats=this.active?.terrain?.stats??{},minZ=Math.min(heightRange.minZ,Number.isFinite(activeStats.minZ)?activeStats.minZ:heightRange.minZ),maxZ=Math.max(heightRange.maxZ,Number.isFinite(activeStats.maxZ)?activeStats.maxZ:heightRange.maxZ),view={coordinateSpace:'campaign-world',x:cam.x,y:cam.y,s:cam.s,datum:0,campaign:true,viewport},makeVisible=b=>[C(Math.floor(b[0]),0,W),C(Math.floor(b[1]),0,H),C(Math.ceil(b[2]),0,W),C(Math.ceil(b[3]),0,H)],visible=makeVisible(cam.visibleBounds({tilt,minZ,maxZ,datum:0})),legacyVisible=makeVisible(cam.visibleBounds({tilt,minZ,maxZ,datum:0,rect:{left:0,top:0,right:w,bottom:h}})),pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
 const [left,top,right,bottom]=visible,quantum=identity?8:surfaceScale&&full?16:8,margin=identity?5:detail===8?8:5,bounds=[Math.max(0,Math.floor((left-margin)/quantum)*quantum),Math.max(0,Math.floor((top-margin)/quantum)*quantum),Math.min(W,Math.ceil((right+margin)/quantum)*quantum),Math.min(H,Math.ceil((bottom+margin)/quantum)*quantum)],legacyBounds=[Math.max(0,Math.floor((legacyVisible[0]-margin)/quantum)*quantum),Math.max(0,Math.floor((legacyVisible[1]-margin)/quantum)*quantum),Math.min(W,Math.ceil((legacyVisible[2]+margin)/quantum)*quantum),Math.min(H,Math.ceil((legacyVisible[3]+margin)/quantum)*quantum)],area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]),preparedArea=area(bounds),legacyArea=area(legacyBounds),areaReductionPct=legacyArea>0?C((1-preparedArea/legacyArea)*100,0,100):0;
 const prior=this.requests.current,r=this.requests.update({revision,knowledge,bounds,visible,view,tilt,width:pw,height:ph,motion:!!atlas.fast,detail,contourDetail});if(prior!==r){this.host.dataset.atlasReadyId='';this.host.dataset.atlasReceipt='';this.host.dataset.atlasFramebufferViewport='';if(!prior||regionKey(prior)!==regionKey(r)){this.requestStart=performance.now();this.firstUsefulMs=null;this.notified=false;this.error='';}}
 this.host.dataset.atlasRequestId=String(r.id);this.host.dataset.atlasIntent=String(r.intent);this.host.dataset.atlasRequest=JSON.stringify(r);this.host.dataset.atlasViewport=JSON.stringify(viewport);this.host.dataset.atlasVisibleBounds=JSON.stringify(visible);this.host.dataset.atlasLegacyVisibleBounds=JSON.stringify(legacyVisible);this.host.dataset.atlasWorldBounds=JSON.stringify([0,0,W,H]);this.host.dataset.atlasHeightRange=JSON.stringify({minZ,maxZ,datum:0,tilt});this.host.dataset.atlasPreparedBounds=JSON.stringify(bounds);this.host.dataset.atlasLegacyPreparedBounds=JSON.stringify(legacyBounds);this.host.dataset.atlasPreparedArea=String(preparedArea);this.host.dataset.atlasLegacyPreparedArea=String(legacyArea);this.host.dataset.atlasPreparedAreaReductionPct=String(areaReductionPct);
 const usable=a=>a&&a.revision===revision&&covers(a.bounds,visible),preview=a=>a&&a.knowledge===knowledge&&covers(a.bounds,visible);
 if(this.pending&&!this.requests.accepts(this.pending.job,this.pending.job.bounds))this.cancelPending();
 if(!usable(this.active)&&!this.pending&&!this.error){
 const epoch=this.epoch,key=regionKey(r),job=r,task={job,cancelled:false};let cached=this.cache.get(key),cacheKey=key,region=bounds;
 if(!cached){for(const [k,item] of this.cache.items){const t=item.value;if(k.startsWith(revision+'|')&&covers(t.bounds,visible)){cached=this.cache.get(k);cacheKey=k;region=t.bounds;break;}}}
 this.pending=task;this.inFlight++;this.maxInFlight=Math.max(this.maxInFlight,this.inFlight);this.status='loading';const started=performance.now(),check=()=>{if(task.cancelled||epoch!==this.epoch||!this.requests.accepts(job,region))throw new DOMException('Superseded region','AbortError');};
 const install=(terrain,key,rev)=>{check();const old=this.active?.renderer,renderer=new BakedTerrainGL(this.canvas,terrain,{chunked:true,adaptive:true,sharedPrograms:true});if(renderer.programReuse)this.reusedGPU++;old?.dispose();this.active={key,revision:rev,knowledge,bounds:terrain.bounds,renderer,terrain};};
 task.promise=(async()=>{const opts={bounds,detail,contourDetail,vertical,polish:true,surfaceScale,identity,check};
 // Cold local regions need only one bake. A covering previous region is
 // already a useful preview; do not pay for a second local GPU upload.
 const terrain=cached??await prepareGeographicCandidate(s,view,opts);check();if(!cached)this.cache.put(key,terrain,terrain.stats.bytes);install(terrain,cacheKey,revision);this.lastPrepMs=performance.now()-started;
 })().catch(e=>{if(e?.name==='AbortError'){this.requests.stale++;return;}if(this.pending===task&&epoch===this.epoch){this.error=String(e.message||e);this.status='error';}}).finally(()=>{this.inFlight--;if(this.pending===task)this.pending=null;});
 }
 const d=this.host.dataset;atlas.reviewPending=!!this.pending||(!usable(this.active)&&!this.error);d.atlasSurface=this.error?'error':'loading';d.atlasCacheBytes=String(this.cache.bytes);d.atlasPrepMs=String(this.lastPrepMs??0);d.atlasCacheHits=String(this.cache.hits);d.atlasCacheEvictions=String(this.cache.evictions);d.atlasCancelled=String(this.cancelled);d.atlasStale=String(this.requests.stale);d.atlasProgramReuse=String(this.reusedGPU);d.atlasInFlight=String(this.inFlight);d.atlasMaxInFlight=String(this.maxInFlight);d.atlasPendingId=this.pending?String(this.pending.job.id):'';if(this.error)d.atlasError=this.error;else delete d.atlasError;
 if(!usable(this.active)&&!preview(this.active)){cam.projection=null;return false;}
 if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;}
 const active=this.active,gpuKey=JSON.stringify([view.x,view.y,view.s,dpr,pw,ph,tilt,!!atlas.fast,viewport]),reuse=identity&&this.lastGPU?.renderer===active.renderer&&this.lastGPU.key===gpuKey;let drawMs=0;if(reuse)this.gpuReuses++;else{drawMs=active.renderer.draw({...view,s:view.s*dpr},{tilt,motion:!!atlas.fast});this.gpuDraws++;this.lastGPU={renderer:active.renderer,key:gpuKey};}const lod=active.renderer.lastDraw.lod;d.atlasGpuDraws=String(this.gpuDraws);d.atlasGpuReuses=String(this.gpuReuses);d.atlasFramebufferViewport=JSON.stringify(active.renderer.lastDraw.viewport);
 cam.projection=tilt?atlasProjection({centerY:view.y,tilt,height:(x,y)=>atlasSurfaceHeight(active.terrain,lod,x,y)}):null;if(cam.projection)cam.projection.unproject=(x,y)=>pickAtlasSurface(active.terrain,lod,{centerY:view.y,tilt},x,y);
 this.lastView={...view,tilt,lod,pixelRatio:dpr};c.drawImage(this.canvas,0,0,w,h);if(this.firstUsefulMs===null)this.firstUsefulMs=performance.now()-this.requestStart;
 d.atlasFirstUsefulMs=String(this.firstUsefulMs);d.atlasDrawMs=String(drawMs);d.atlasView=tilt?'relief':'atlas';d.atlasDetail=String(active.terrain.detail);d.atlasUploadMs=String(active.renderer.uploadMs);d.atlasCandidate=identity?'identity':surfaceScale?'scale':'control';d.atlasLod=String(lod);d.atlasRefined=String(active.terrain.stats.refined??0);d.atlasFrame=String((Number(d.atlasFrame)||0)+1);
 // Publish only after a real draw and compositing, never from the async task.
 if(this.requests.commit(r,active,lod)){this.status='ready';d.atlasSurface='ready';d.atlasReadyId=String(r.id);d.atlasReceipt=JSON.stringify(this.requests.presented);}
 else if(!this.error){this.status='preview';d.atlasSurface='preview';}return true;
 }
}
