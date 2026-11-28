import test from 'node:test';import assert from 'node:assert/strict';import {part,push,normals} from './hybrid-human.mjs';import {authoredPatch,openOuterShell,fourInfluenceCandidate,validateGeometry} from './authored-surface.mjs';
test('authored patch thickness and outer topology',()=>{const p=authoredPatch({name:'test',color:[1,1,1],material:{},rows:3,columns:3,thickness:.003,host:'base',sample:(v,u)=>({position:[u,v,0],outward:[0,0,1],weights:[[0,1]]})});assert.equal(p.outerVertexCount,9);const o=openOuterShell(p);assert.equal(o.positions.length,27);assert.equal(o.indices.length,24);assert.ok(o.normals.every(Number.isFinite));});
test('five positive influences: explicit separate normalized four-weight candidate',()=>{const p=part('test',[1,1,1]);for(const v of [[0,0,0],[1,0,0],[0,1,0]])push(p,v,[[0,.4],[1,.2],[2,.2],[3,.1],[4,.1]]);p.indices=[0,1,2];normals(p);const source={parts:[p],spec:{}};const r=fourInfluenceCandidate(source);assert.equal(r.rows[0].affectedVertices,3);assert.ok(Math.abs(r.rows[0].maxDiscardedWeight-.1)<1e-10);assert.ok(source.parts[0].weights8);assert.equal(r.model.parts[0].weights8,undefined);assert.ok(Math.abs(r.model.parts[0].weights.slice(0,4).reduce((a,b)=>a+b)-1)<1e-10);});
test('nonfinite coordinate fails before serialization',()=>{const p=part('bad',[1,1,1]);push(p,[0,0,0],[[0,1]]);p.positions[1]=NaN;assert.throws(()=>validateGeometry({parts:[p]}),/nonfinite geometry/);});

import {surfaceWeightField,reweightLinedSurface} from './authored-surface.mjs';
test('rest-space skin field is deterministic, paired and does not change geometry',()=>{
 const p=part('test panel',[1,1,1]);for(let shell=0;shell<2;shell++)for(let i=0;i<3;i++)push(p,[[0,0],[.004,0],[.02,.02]][i].concat(-shell*.003),[[i,1]]);
 p.outerVertexCount=3;p.indices=[0,1,2,3,5,4];normals(p);
 const before=JSON.stringify({positions:p.positions,indices:p.indices,normals:p.normals}),q=structuredClone(p);
 reweightLinedSurface(p,{sigma:.1});reweightLinedSurface(q,{sigma:.1});
 assert.deepEqual(p,q);assert.equal(before,JSON.stringify({positions:p.positions,indices:p.indices,normals:p.normals}));
 for(let i=0;i<3;i++){assert.deepEqual(p.weights8.slice(i*8,i*8+8),p.weights8.slice((i+3)*8,(i+4)*8));assert.ok(Math.abs(p.weights8.slice(i*8,i*8+8).reduce((a,b)=>a+b,0)-1)<1e-12);}
 assert.throws(()=>surfaceWeightField(p,{sigma:0}));assert.throws(()=>surfaceWeightField(p,{sigma:.01})([10,10,10]));
});
