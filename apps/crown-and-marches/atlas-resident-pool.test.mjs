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
