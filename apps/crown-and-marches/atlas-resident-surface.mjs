// Experimental, review-only. GPU-resident color/depth tiles; no readback in draw.
// A crop is eligible only for a matching raster phase, scale, region and tilt.
// Geometric equivalence is not proof of driver raster equivalence: QA compares
// this surface to a fresh draw separately. No production selection here.
import {residentCrop,depthSafe} from './atlas-resident-math.mjs';
export class ResidentWorldSurface{
 constructor(gl,{limit=48*1024*1024,pad=96,maxEntries=6}={}){this.gl=gl;this.limit=limit;this.pad=pad;this.maxEntries=maxEntries;this.entries=[];this.bytes=0;this.hits=0;this.misses=0;this.evictions=0;this.fallbacks=0;this.last=null;this.maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.depthBits=gl.getParameter(gl.DEPTH_BITS);}
 drop(e){const g=this.gl;g.deleteFramebuffer(e.fb);g.deleteTexture(e.color);g.deleteRenderbuffer(e.depth);this.bytes-=e.bytes;}
 clear(){for(const e of this.entries)this.drop(e);this.entries=[];}
 allocate(width,height){const g=this.gl,bytes=width*height*8;if(width>this.maxSize||height>this.maxSize||bytes>this.limit||![16,24,32].includes(this.depthBits))return null;
  while(this.entries.length&&(this.bytes+bytes>this.limit||this.entries.length>=this.maxEntries)){this.drop(this.entries.shift());this.evictions++;}
  const fb=g.createFramebuffer(),color=g.createTexture(),depth=g.createRenderbuffer();if(!fb||!color||!depth){if(fb)g.deleteFramebuffer(fb);if(color)g.deleteTexture(color);if(depth)g.deleteRenderbuffer(depth);return null;}
  g.bindFramebuffer(g.FRAMEBUFFER,fb);g.bindTexture(g.TEXTURE_2D,color);g.texStorage2D(g.TEXTURE_2D,1,g.RGBA8,width,height);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,color,0);g.bindRenderbuffer(g.RENDERBUFFER,depth);g.renderbufferStorage(g.RENDERBUFFER,this.depthBits===16?g.DEPTH_COMPONENT16:this.depthBits===24?g.DEPTH_COMPONENT24:g.DEPTH_COMPONENT32F,width,height);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,depth);const ok=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,null);g.bindRenderbuffer(g.RENDERBUFFER,null);g.bindTexture(g.TEXTURE_2D,null);if(!ok){g.deleteFramebuffer(fb);g.deleteTexture(color);g.deleteRenderbuffer(depth);return null;}return {fb,color,depth,width,height,bytes};}
 report(){return {bytes:this.bytes,limit:this.limit,entries:this.entries.length,hits:this.hits,misses:this.misses,evictions:this.evictions,fallbacks:this.fallbacks,last:this.last};}
 draw({view,viewport,tilt,region,range,allow,motion,render}){
  const g=this.gl,start=performance.now(),pad=this.pad,key=JSON.stringify([view.s,view.datum,tilt,viewport.width,viewport.height,region]);let entry=null,crop=null;
  const fallback=reason=>{this.fallbacks++;g.bindFramebuffer(g.FRAMEBUFFER,null);const result=render(null);this.last={kind:'fresh-fallback',reason,submitMs:performance.now()-start};return result;};
  if(!allow||motion||g.isContextLost()||!depthSafe(region,range,view,tilt)){if(!allow)this.clear();return fallback(!allow?'restricted-knowledge':motion?'adaptive-lod':'depth-or-context');}
  for(let i=this.entries.length-1;i>=0;i--){const e=this.entries[i];if(e.key!==key)continue;const c=residentCrop(e.anchor,view,tilt,viewport,pad);if(c){entry=e;crop=c;this.entries.splice(i,1);this.entries.push(e);break;}}
  let sourceMs=0,hit=!!entry;
  if(!entry){this.misses++;entry=this.allocate(viewport.width+2*pad,viewport.height+2*pad);if(!entry)return fallback('allocation-limit');entry.key=key;entry.anchor={x:view.x,y:view.y,s:view.s,datum:view.datum};g.bindFramebuffer(g.FRAMEBUFFER,entry.fb);try{const r=render({x:0,y:0,width:entry.width,height:entry.height,pixelRatio:viewport.pixelRatio,coordinateSpace:'framebuffer-bottom-left'});entry.draw=r.draw;sourceMs=r.ms;}catch(e){g.bindFramebuffer(g.FRAMEBUFFER,null);g.deleteFramebuffer(entry.fb);g.deleteTexture(entry.color);g.deleteRenderbuffer(entry.depth);throw e;}finally{g.bindFramebuffer(g.FRAMEBUFFER,null);}this.bytes+=entry.bytes;this.entries.push(entry);crop=residentCrop(entry.anchor,view,tilt,viewport,pad);}
  else this.hits++;
  // Clear the complete destination (including the HUD gutters) exactly as
  // the original renderer does, then copy unscaled pixels in GPU memory.
  const blitAt=performance.now();g.bindFramebuffer(g.DRAW_FRAMEBUFFER,null);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.bindFramebuffer(g.READ_FRAMEBUFFER,entry.fb);g.blitFramebuffer(crop.x,crop.y,crop.x+crop.width,crop.y+crop.height,viewport.x,viewport.y,viewport.x+viewport.width,viewport.y+viewport.height,g.COLOR_BUFFER_BIT,g.NEAREST);g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(viewport.x,viewport.y,viewport.width,viewport.height);
  const actual=g.getParameter(g.VIEWPORT),draw={...entry.draw,triangles:hit?0:entry.draw.triangles,calls:hit?0:entry.draw.calls,waterTriangles:hit?0:entry.draw.waterTriangles,waterCalls:hit?0:entry.draw.waterCalls,viewport:{x:actual[0],y:actual[1],width:actual[2],height:actual[3],coordinateSpace:'framebuffer-bottom-left'},viewportPixels:viewport,resident:{hit,crop,sourceViewport:entry.draw.viewport,bytes:this.bytes}};
  this.last={kind:hit?'resident-hit':'resident-build',crop,sourceSubmitMs:sourceMs,blitSubmitMs:performance.now()-blitAt,submitMs:performance.now()-start};return {draw,ms:this.last.submitMs};
 }
}
