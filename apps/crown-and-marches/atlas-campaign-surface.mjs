// Experimental campaign uses the existing 2D UI and a top-down Baked Terrain
// background; hit-testing, settlements and infrastructure stay in world coordinates.
import {prepareGeographicCandidate,BakedTerrainGL} from './world-rendering-baked.mjs';
import {vertical} from './world-rendering-gl.mjs';
import {SpatialLRU,clearContourCache} from './genesis-contours.mjs';
const C=(x,a,b)=>Math.max(a,Math.min(b,x));
export class AtlasCampaignSurface{
 constructor(){this.cache=new SpatialLRU(48*1024*1024);this.canvas=document.createElement('canvas');this.pending=null;this.active=null;this.state=null;this.status='';this.epoch=0;this.notified=false;}
 reset(s=null){this.epoch++;this.active?.renderer.dispose();this.active=null;this.pending=null;this.cache.clear();if(this.state?.map?.geography)clearContourCache(this.state.map.geography);this.state=s;this.status='';this.notified=false;}
 paint(atlas,s,cam,c,w,h,quality){
 if(this.state!==s)this.reset(s);
 const W=s.map.geography?(s.map.geography.width-1)/s.map.geography.detail:cam.w,H=cam.h,detail=cam.s<13?4:8,contourDetail=cam.s<13?4:8,chart=s.discovery?.chartRevision?.[s.playerFaction??0]??0,revision=[s.playerFaction??0,chart,+!!s.autonomous,+!!s.discovery?.fullMap,detail,contourDetail].join(':');
 // Center uses the real viewport (including insets), not the logical camera
 // center; the 2D overlays and picking therefore line up with the GPU map.
 const view={x:(w/2-cam.ox)/cam.s,y:(h/2-cam.oy)/cam.s,s:cam.s,datum:0},left=C(Math.floor(-cam.ox/cam.s),0,W),top=C(Math.floor(-cam.oy/cam.s),0,H),right=C(Math.ceil((w-cam.ox)/cam.s),0,W),bottom=C(Math.ceil((h-cam.oy)/cam.s),0,H);
 const quantum=8,bounds=[Math.max(0,Math.floor((left-5)/quantum)*quantum),Math.max(0,Math.floor((top-5)/quantum)*quantum),Math.min(W,Math.ceil((right+5)/quantum)*quantum),Math.min(H,Math.ceil((bottom+5)/quantum)*quantum)],key=revision+'|'+bounds.join(':');
 const usable=a=>a&&a.revision===revision&&a.bounds[0]<=left&&a.bounds[1]<=top&&a.bounds[2]>=right&&a.bounds[3]>=bottom;
 if(!usable(this.active)&&!this.pending&&this.status!=='error'){
 const epoch=this.epoch,cached=this.cache.get(key);this.status='loading';
 this.pending=(async()=>{const terrain=cached??await prepareGeographicCandidate(s,view,{bounds,detail,contourDetail,vertical,polish:true});if(epoch!==this.epoch)return;
 if(!cached)this.cache.put(key,terrain,terrain.stats.bytes);this.active?.renderer.dispose();const renderer=new BakedTerrainGL(this.canvas,terrain,{chunked:true,adaptive:true});this.active={key,revision,bounds,renderer};this.status='ready';
 })().catch(e=>{if(epoch===this.epoch){this.status='error';this.error=String(e.message||e);}}).finally(()=>{if(epoch===this.epoch)this.pending=null;});
 }
 atlas.reviewPending=!!this.pending;atlas.canvas.dataset.atlasSurface=this.status||'loading';atlas.canvas.dataset.atlasCacheBytes=String(this.cache.bytes);atlas.canvas.dataset.atlasCacheHits=String(this.cache.hits);atlas.canvas.dataset.atlasCacheEvictions=String(this.cache.evictions);if(this.status==='error')atlas.canvas.dataset.atlasError=this.error;
 if(!usable(this.active))return false;
 const dpr=quality==='low'?1:Math.min(1.5,devicePixelRatio||1),pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
 if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph;}
 this.active.renderer.draw({...view,s:view.s*dpr},{tilt:0,motion:true});c.drawImage(this.canvas,0,0,w,h);return true;
 }
}
