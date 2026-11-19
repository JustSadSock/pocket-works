import test from 'node:test';
import assert from 'node:assert/strict';
import {DEPTH_W,DEPTH_H,brush,fresh,stamp,stereogram} from '../core.mjs';
test('presets generate distinguishable visible depth maps',()=>{
 const a=stamp('heart'),b=stamp('orb'),c=stamp('wave');
 for(const v of [a,b,c]){assert.equal(v.length,DEPTH_W*DEPTH_H);assert.ok(v.some(n=>n>0));assert.ok(v.some(n=>n===0))}
 assert.notDeepEqual(a,b);assert.notDeepEqual(b,c);
});
test('brush adds, eraser removes and remains within 0–255',()=>{
 const d=fresh();brush(d,.5,.5,15,210);const p=Math.floor(DEPTH_H/2)*DEPTH_W+Math.floor(DEPTH_W/2);
 assert.ok(d[p]>100);const before=d[p];brush(d,.5,.5,15,210,true);assert.ok(d[p]<before);
 brush(d,-99,99,300,900);assert.ok(Math.max(...d)<=255);
});
test('stereogram is deterministic, opaque and responds to seed, palette and depth',()=>{
 const a=stamp('heart'),b=fresh();
 const x=stereogram(a,240,160,7),y=stereogram(a,240,160,7),z=stereogram(a,240,160,8),blank=stereogram(b,240,160,7),color=stereogram(a,240,160,7,'color');
 assert.equal(x.length,240*160*4);assert.deepEqual(x,y);assert.notDeepEqual(x,z);assert.notDeepEqual(x,blank);assert.notDeepEqual(x,color);
 for(let i=3;i<x.length;i+=4)assert.equal(x[i],255);
});
test('invalid map and sizes fail safely',()=>{
 assert.throws(()=>stereogram(new Uint8Array(2),200,120),/Invalid depth/);
 assert.throws(()=>stereogram(fresh(),9999,9999),/Invalid dimensions/);
});
