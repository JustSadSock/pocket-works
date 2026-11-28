import test from 'node:test';import assert from 'node:assert/strict';
import {eightWeightControlGLB,controlExpectedMm,controlDisplacement} from './eight-weight-control.mjs';
test('independent five-influence GLB has stable identities and a nonzero analytic control',()=>{
 const b=eightWeightControlGLB();assert.deepEqual(b,eightWeightControlGLB());assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
 const len=b.readUInt32LE(12),d=JSON.parse(b.subarray(20,20+len)),base=28+len,a=d.meshes[0].primitives[0].attributes;
 assert.equal(d.skins[0].joints.length,5);assert.equal(d.meshes[0].primitives[0].extras.part,'five-influence-control');
 assert.equal(b.readUInt32LE(24+len),0x004e4942);assert.equal(b.readUInt32LE(20+len),b.length-base);
 const read=(id,i)=>{const a=d.accessors[id],v=d.bufferViews[a.bufferView],size=a.componentType===5123?2:4;return Array.from({length:4},(_,k)=>size===2?b.readUInt16LE(base+v.byteOffset+size*(4*i+k)):b.readFloatLE(base+v.byteOffset+size*(4*i+k)));};
 for(let i=0;i<3;i++){const joints=[...read(a.JOINTS_0,i),...read(a.JOINTS_1,i)],weights=[...read(a.WEIGHTS_0,i),...read(a.WEIGHTS_1,i)];assert.equal(weights.filter(x=>x>0).length,5);assert.ok(Math.abs(weights.reduce((s,x)=>s+x,0)-1)<1e-6);const dx=weights.reduce((s,w,k)=>s+(joints[k]===4?w*controlDisplacement:0),0)*1000;assert.ok(Math.abs(dx-controlExpectedMm)<1e-5);}
});
