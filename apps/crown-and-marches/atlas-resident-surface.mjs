// Experimental, review-only. GPU-resident color/depth tiles; no readback in draw.
// A crop is eligible only for a matching raster phase, scale, region and tilt.
// Geometric equivalence is not proof of driver raster equivalence: QA compares
// this surface to a fresh draw separately. No production selection here.
import {residentCrop,depthSafe} from './atlas-resident-math.mjs';
let sequence=0;
export class ResidentWorldSurface{
 constructor(gl,{limit=48*1024*1024,pad=96,maxEntries=6,policy='allocate',eviction='lru'}={}){if(!['allocate','recycle','prewarm'].includes(policy))throw Error('Unknown resident allocation policy');if(!Number.isInteger(pad)||pad<0||pad>192||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>6||!Number.isFinite(limit)||limit<=0||limit>48*1024*1024)throw Error('Resident budget exceeded');this.gl=gl;this.instance=++sequence;this.limit=limit;this.pad=pad;this.maxEntries=maxEntries;if(!['lru','phase-diverse'].includes(eviction))throw Error('Unknown resident eviction');this.policy=policy;this.eviction=eviction;this.entries=[];this.free=[];this.bytes=0;this.hits=0;this.misses=0;this.evictions=0;this.fallbacks=0;this.allocations=0;this.recycles=0;this.poolTakes=0;this.phaseRejects=0;this.coverageRejects=0;this.warmedSize=null;this.last=null;this.maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.depthBits=gl.getParameter(gl.DEPTH_BITS);}
 drop(e){const g=this.gl;g.deleteFramebuffer(e.fb);g.deleteTexture(e.color);g.deleteRenderbuffer(e.depth);this.bytes-=e.bytes;}
 clear(){for(const e of [...this.entries,...this.free])this.drop(e);this.entries=[];this.free=[];this.warmedSize=null;}
 allocate(width,height){const g=this.gl,bytes=width*height*8;if(width>this.maxSize||height>this.maxSize||bytes>this.limit||![16,24,32].includes(this.depthBits))return null;
  const fb=g.createFramebuffer(),color=g.createTexture(),depth=g.createRenderbuffer();if(!fb||!color||!depth){if(fb)g.deleteFramebuffer(fb);if(color)g.deleteTexture(color);if(depth)g.deleteRenderbuffer(depth);return null;}
  g.bindFramebuffer(g.FRAMEBUFFER,fb);g.bindTexture(g.TEXTURE_2D,color);g.texStorage2D(g.TEXTURE_2D,1,g.RGBA8,width,height);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,color,0);g.bindRenderbuffer(g.RENDERBUFFER,depth);g.renderbufferStorage(g.RENDERBUFFER,this.depthBits===16?g.DEPTH_COMPONENT16:this.depthBits===24?g.DEPTH_COMPONENT24:g.DEPTH_COMPONENT32F,width,height);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,depth);const ok=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,null);g.bindRenderbuffer(g.RENDERBUFFER,null);g.bindTexture(g.TEXTURE_2D,null);if(!ok){g.deleteFramebuffer(fb);g.deleteTexture(color);g.deleteRenderbuffer(depth);return null;}this.allocations++;this.bytes+=bytes;return {fb,color,depth,width,height,bytes};}
 acquire(width,height,key=null,view=null,tilt=0){
  const bytes=width*height*8,size=width+'x'+height,match=e=>e.width===width&&e.height===height;
  if(bytes>this.limit||width>this.maxSize||height>this.maxSize)return null;
  if(this.policy==='prewarm'&&this.warmedSize!==size){
   this.warmedSize=size;
   for(let i=this.free.length-1;i>=0;i--)if(!match(this.free[i]))this.drop(this.free.splice(i,1)[0]);
   const target=Math.min(this.maxEntries,Math.floor(this.limit/bytes));
   while(this.entries.length+this.free.length<target&&this.bytes+bytes<=this.limit){const e=this.allocate(width,height);if(!e)break;this.free.push(e);}
  }
  const i=this.free.findIndex(match);if(i>=0){this.poolTakes++;return this.free.splice(i,1)[0];}
  while(this.entries.length+this.free.length>=this.maxEntries||this.bytes+bytes>this.limit){
   if(this.free.length){this.drop(this.free.shift());continue;}
   if(!this.entries.length)return null;
   let victim=0;
   // Experimental phase diversity: prefer a stale scale/viewport; otherwise
   // preserve one representative of each raster phase if there is a duplicate.
   if(this.eviction==='phase-diverse'&&key&&view){
    const samePhase=(a,b)=>{const dx=(a.x-b.x)*view.s,dy=-(a.y-b.y)*view.s*Math.sqrt(1-tilt*tilt);return Math.abs(dx-Math.round(dx))<=1e-7&&Math.abs(dy-Math.round(dy))<=1e-7;};
    const stale=this.entries.findIndex(e=>e.key!==key);
    const duplicate=this.entries.findIndex((e,i)=>e.key===key&&this.entries.some((n,j)=>j>i&&n.key===key&&samePhase(e.anchor,n.anchor)));
    if(stale>=0)victim=stale;else if(duplicate>=0)victim=duplicate;
   }
   const old=this.entries.splice(victim,1)[0];this.evictions++;
   if(this.policy!=='allocate'&&match(old)){this.recycles++;return old;}
   this.drop(old);
  }
  return this.allocate(width,height);
 }
 report(){return {instance:this.instance,policy:this.policy,eviction:this.eviction,pad:this.pad,maxEntries:this.maxEntries,bytes:this.bytes,limit:this.limit,entries:this.entries.length,free:this.free.length,hits:this.hits,misses:this.misses,evictions:this.evictions,fallbacks:this.fallbacks,allocations:this.allocations,recycles:this.recycles,poolTakes:this.poolTakes,phaseRejects:this.phaseRejects,coverageRejects:this.coverageRejects,last:this.last};}
 draw({view,viewport,tilt,region,range,allow,motion,render}){
  const g=this.gl,start=performance.now(),pad=this.pad,key=JSON.stringify([view.s,view.datum,tilt,viewport.width,viewport.height,region]);let entry=null,crop=null;
  const fallback=reason=>{this.fallbacks++;g.bindFramebuffer(g.FRAMEBUFFER,null);const result=render(null);this.last={kind:'fresh-fallback',reason,submitMs:performance.now()-start};return result;};
  if(!allow||motion||g.isContextLost()||!depthSafe(region,range,view,tilt)){if(!allow)this.clear();return fallback(!allow?'restricted-knowledge':motion?'adaptive-lod':'depth-or-context');}
  for(let i=this.entries.length-1;i>=0;i--){const e=this.entries[i];if(e.key!==key)continue;const c=residentCrop(e.anchor,view,tilt,viewport,pad);if(c){entry=e;crop=c;this.entries.splice(i,1);this.entries.push(e);break;}const dx=(view.x-e.anchor.x)*view.s,dy=-(view.y-e.anchor.y)*view.s*Math.sqrt(1-tilt*tilt);if(Math.abs(dx-Math.round(dx))>1e-7||Math.abs(dy-Math.round(dy))>1e-7)this.phaseRejects++;else this.coverageRejects++;}
  let sourceMs=0,allocationMs=0,hit=!!entry;
  if(!entry){this.misses++;const allocationStart=performance.now();entry=this.acquire(viewport.width+2*pad,viewport.height+2*pad,key,view,tilt);allocationMs=performance.now()-allocationStart;if(!entry)return fallback('allocation-limit');entry.key=key;entry.anchor={x:view.x,y:view.y,s:view.s,datum:view.datum};g.bindFramebuffer(g.FRAMEBUFFER,entry.fb);try{const r=render({x:0,y:0,width:entry.width,height:entry.height,pixelRatio:viewport.pixelRatio,coordinateSpace:'framebuffer-bottom-left'});entry.draw=r.draw;sourceMs=r.ms;}catch(e){g.bindFramebuffer(g.FRAMEBUFFER,null);this.drop(entry);throw e;}finally{g.bindFramebuffer(g.FRAMEBUFFER,null);}this.entries.push(entry);crop=residentCrop(entry.anchor,view,tilt,viewport,pad);}
  else this.hits++;
  // Clear the complete destination (including the HUD gutters) exactly as
  // the original renderer does, then copy unscaled pixels in GPU memory.
  const blitAt=performance.now();g.bindFramebuffer(g.DRAW_FRAMEBUFFER,null);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.bindFramebuffer(g.READ_FRAMEBUFFER,entry.fb);g.blitFramebuffer(crop.x,crop.y,crop.x+crop.width,crop.y+crop.height,viewport.x,viewport.y,viewport.x+viewport.width,viewport.y+viewport.height,g.COLOR_BUFFER_BIT,g.NEAREST);g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(viewport.x,viewport.y,viewport.width,viewport.height);
  const actual=g.getParameter(g.VIEWPORT),draw={...entry.draw,triangles:hit?0:entry.draw.triangles,calls:hit?0:entry.draw.calls,waterTriangles:hit?0:entry.draw.waterTriangles,waterCalls:hit?0:entry.draw.waterCalls,viewport:{x:actual[0],y:actual[1],width:actual[2],height:actual[3],coordinateSpace:'framebuffer-bottom-left'},viewportPixels:viewport,resident:{hit,crop,sourceViewport:entry.draw.viewport,bytes:this.bytes}};
  this.last={kind:hit?'resident-hit':'resident-build',crop,allocationSubmitMs:allocationMs,sourceSubmitMs:sourceMs,blitSubmitMs:performance.now()-blitAt,submitMs:performance.now()-start};return {draw,ms:this.last.submitMs};
 }
}
