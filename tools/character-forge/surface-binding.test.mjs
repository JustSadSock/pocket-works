import test from 'node:test';import assert from 'node:assert/strict';
import {surfaceBinder,bindingWeights,bindTrim} from './surface-binding.mjs';
const host={name:'host',positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],joints:[0,0,0,0,1,0,0,0,2,0,0,0],weights:[1,0,0,0,1,0,0,0,1,0,0,0]};
test('interior and clamped boundary binding use real stable triangle identities',()=>{
 const b=surfaceBinder(host)([.25,.25,.01]);assert.deepEqual(b.vertices,[0,1,2]);assert.deepEqual(b.bary,[.5,.25,.25]);assert.deepEqual(bindingWeights(host,b),[[0,.5],[1,.25],[2,.25]]);
 assert.deepEqual(surfaceBinder(host)([2,0,0]).bary,[0,1,0]);assert.throws(()=>surfaceBinder({...host,indices:[]}));assert.throws(()=>surfaceBinder(host)([NaN,0,0]));
});
test('paired lining follows identical weights; geometry and face order unchanged',()=>{
 const p={name:'trim',outerVertexCount:1,positions:[.25,.25,.01,.25,.25,.007],indices:[]},q=structuredClone(p);bindTrim(p,host);bindTrim(q,host);assert.deepEqual(p,q);assert.deepEqual(p.positions,[.25,.25,.01,.25,.25,.007]);assert.deepEqual(p.weights8.slice(0,8),p.weights8.slice(8));assert.deepEqual(p.attachmentBindings.map(x=>x.vertex),[0,1]);assert.ok(Math.abs(p.attachmentBindings[1].restDistance-.007)<1e-9);assert.throws(()=>bindTrim({name:'bad'},host));
});
