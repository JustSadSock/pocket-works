import test from 'node:test';
import assert from 'node:assert/strict';
import {compileExpression} from './expression.mjs';
const notes=[{beat:0,duration:1},{beat:1,duration:2}];
const config={tempo:120,performance:{curves:{expression:[{beat:0,value:50},{beat:2,value:110}],breath:[{beat:0,value:20},{beat:2,value:70}]},vibrato:{depthCents:20,rateHz:5,delayBeats:.2},attackBend:{cents:-35,durationBeats:.1}}};
const bends=events=>events.filter(e=>(e.bytes[0]&240)===224).map(e=>[e.tick,e.bytes[1]+128*e.bytes[2]]);
test('legacy tracks emit no automation',()=>assert.deepEqual(compileExpression({},notes,0),[]));
test('curves interpolate, preserve endpoints, route channel',()=>{
  const e=compileExpression(config,notes,3);
  assert.deepEqual(e,compileExpression(config,notes,3));
  assert.ok(e.every(x=>(x.bytes[0]&15)===3));
  const curve=e.filter(x=>x.bytes[1]===11&&(x.bytes[0]&240)===176);
  assert.equal(curve[0].bytes[2],50);assert.equal(curve.at(-1).bytes[2],110);
  assert.equal(curve.find(x=>x.tick===480).bytes[2],80);
});
test('bend starts below pitch, vibrates and resets at end',()=>{
  const e=compileExpression(config,notes,0),b=bends(e);
  assert.ok(b[0][1]<8192);assert.ok(b.some(([tick,value])=>tick>120&&tick<480&&value>8192));
  assert.equal(b.at(-1)[0],1440);assert.equal(b.at(-1)[1],8192);
  assert.deepEqual(e.slice(0,6).map(x=>x.bytes.slice(1)),[[101,0],[100,0],[6,2],[38,0],[101,127],[100,127]]);
  assert.equal(new Set(b.map(x=>x[0])).size,b.length);
});
test('bend resets during gaps and does not alter other tracks',()=>{
  const e=compileExpression(config,[{beat:0,duration:.5},{beat:2,duration:1}],7);
  assert.ok(bends(e).some(([tick,val])=>tick===240&&val===8192));
  assert.ok(e.every(x=>(x.bytes[0]&15)===7));
});
test('reject overlaps, nonmonotonic curves, out of range and unknown controls',()=>{
  assert.throws(()=>compileExpression(config,[{beat:0,duration:2},{beat:1,duration:1}],0));
  for(const performance of [{curves:{expression:[{beat:1,value:20},{beat:0,value:30}]}},{curves:{volume:[{beat:0,value:50}]}},{curves:{expression:[{beat:0,value:128}]}},{vibrato:{depthCents:99,rateHz:5}},{unknown:true}]){
    assert.throws(()=>compileExpression({performance},notes,0));
  }
});
