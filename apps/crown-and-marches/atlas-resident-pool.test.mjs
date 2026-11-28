import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentWorldSurface} from './atlas-resident-surface.mjs';
function mock(){
 let next=0,live=new Set();const g={};
 for(const k of ['MAX_TEXTURE_SIZE','DEPTH_BITS','FRAMEBUFFER','TEXTURE_2D','RGBA8','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','NEAREST','COLOR_ATTACHMENT0','RENDERBUFFER','DEPTH_COMPONENT16','DEPTH_COMPONENT24','DEPTH_COMPONENT32F','DEPTH_ATTACHMENT','FRAMEBUFFER_COMPLETE'])g[k]=++next;
 g.getParameter=k=>k===g.MAX_TEXTURE_SIZE?4096:24;
 for(const type of ['Framebuffer','Texture','Renderbuffer']){g['create'+type]=()=>{const o={type,id:++next};live.add(o);return o;};g['delete'+type]=o=>assert.ok(live.delete(o),'resource deleted twice');}
 for(const k of ['bindFramebuffer','bindTexture','texStorage2D','texParameteri','framebufferTexture2D','bindRenderbuffer','renderbufferStorage','framebufferRenderbuffer'])g[k]=()=>{};
 g.checkFramebufferStatus=()=>g.FRAMEBUFFER_COMPLETE;return {g,live};
}
for(const policy of ['allocate','recycle','prewarm'])test('bounded GPU resource lifetime '+policy,()=>{
 const {g,live}=mock(),bank=new ResidentWorldSurface(g,{policy,limit:3*64*64*8,maxEntries:3,pad:0});
 for(let i=0;i<30;i++){const e=bank.acquire(64,64);assert.ok(e);bank.entries.push(e);assert.ok(bank.bytes<=bank.limit);assert.ok(bank.entries.length+bank.free.length<=3);assert.equal(live.size,(bank.entries.length+bank.free.length)*3);}
 assert.equal(bank.allocations,policy==='allocate'?30:3);assert.equal(bank.evictions,27);
 const next=bank.acquire(32,32);assert.ok(next);bank.entries.push(next);assert.ok(bank.bytes<=bank.limit);bank.clear();assert.equal(bank.bytes,0);assert.equal(live.size,0);
});
test('allocation failure releases incomplete resources',()=>{const {g,live}=mock();g.checkFramebufferStatus=()=>0;const bank=new ResidentWorldSurface(g,{policy:'prewarm',maxEntries:2});assert.equal(bank.acquire(64,64),null);assert.equal(bank.bytes,0);assert.equal(live.size,0);});

test('same-size resident uses full framebuffer and original viewport; origin changes invalidate hits',()=>{
 const {g,live}=mock();let lastViewport=[0,0,1280,800];const blits=[],renders=[];
 Object.assign(g,{drawingBufferWidth:1280,drawingBufferHeight:800,READ_FRAMEBUFFER:101,DRAW_FRAMEBUFFER:102,COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,VIEWPORT:103,isContextLost:()=>false,getContextAttributes:()=>({antialias:false}),clear:()=>{},blitFramebuffer:(...args)=>blits.push(args),viewport:(...args)=>{lastViewport=args;}});
 const get=g.getParameter;g.getParameter=k=>k===g.VIEWPORT?lastViewport:get(k);
 const bank=new ResidentWorldSurface(g,{pad:0,policy:'recycle'});
 const v={x:105,y:59,width:777,height:681,pixelRatio:1,coordinateSpace:'framebuffer-bottom-left'},view={x:90,y:45,s:40,datum:0},opts={view,viewport:v,tilt:.28,region:[80,32,112,64],range:{minZ:0,maxZ:1},allow:true,motion:false,render:r=>{renders.push(r);return {ms:1,draw:{triangles:1,calls:1,waterTriangles:0,waterCalls:0,viewport:r}};}};
 bank.draw(opts);assert.equal(bank.entries[0].width,1280);assert.equal(bank.entries[0].height,800);assert.deepEqual(renders[0],v);assert.deepEqual(blits[0].slice(0,8),[105,59,882,740,105,59,882,740]);assert.equal(bank.last.kind,'resident-build');
 bank.draw(opts);assert.equal(bank.last.kind,'resident-hit');assert.equal(renders.length,1);
 bank.draw({...opts,viewport:{...v,x:106}});assert.equal(bank.last.kind,'resident-build');assert.equal(renders.length,2);
 bank.draw({...opts,view:{...view,x:view.x+4/view.s}});assert.equal(bank.last.kind,'resident-build');assert.equal(bank.hits,1);
 bank.draw({...opts,allow:false});assert.equal(bank.last.kind,'fresh-fallback');assert.equal(bank.bytes,0);assert.equal(live.size,0);
});
