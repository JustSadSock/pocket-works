import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pluckNote,renderPluckedScore} from './plucked-instruments.mjs';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
function pitch(a,midi){
 const expected=48000/(440*2**((midi-69)/12)),correlation=[];
 for(let lag=Math.floor(expected*.9);lag<=Math.ceil(expected*1.1);lag++){
  let xy=0,xx=0,yy=0;
  for(let i=4800;i<20000;i++){xy+=a[i]*a[i+lag];xx+=a[i]**2;yy+=a[i+lag]**2;}
  correlation.push({lag,value:xy/Math.sqrt(xx*yy)});
 }
 const i=correlation.reduce((k,x,j)=>x.value>correlation[k].value?j:k,0);
 const {lag,value}=correlation[i],a0=correlation[i-1]?.value??value,a1=correlation[i+1]?.value??value;
 const denom=a0-2*value+a1,offset=denom?Math.max(-.5,Math.min(.5,.5*(a0-a1)/denom)):0;
 return 1200*Math.log2(expected/(lag+offset));
}
test('both string models have stable pitch, varied attacks and deterministic render',()=>{
 for(const instrument of ['lute','harp'])for(const midi of [45,57,69,81]){
  const opts={instrument,midi,duration:1,seed:42},a=pluckNote(opts);
  assert.ok(Math.abs(pitch(a,midi))<8);
  assert.equal(hash(a),hash(pluckNote(opts)));
  assert.notEqual(hash(a),hash(pluckNote({...opts,seed:43})));
  assert.ok(a.every(Number.isFinite));assert.equal(a[0],0);assert.equal(a.at(-1),0);
 }
});
test('velocity changes amplitude and waveform, instrument profiles differ',()=>{
 const a=pluckNote({midi:60,velocity:.3}),b=pluckNote({midi:60,velocity:.9}),c=pluckNote({instrument:'harp',midi:60,velocity:.9});
 const peak=x=>x.reduce((p,v)=>Math.max(p,Math.abs(v)),0);
 assert.ok(peak(b)>peak(a)*2);assert.notEqual(hash(b),hash(c));
 assert.throws(()=>pluckNote({midi:100}));assert.throws(()=>pluckNote({midi:60,duration:10}));
});
test('whole arrangement has exact stereo grid and bounded peak',()=>{
 const options={tempo:120,bars:2,meter:3,tracks:[{instrument:'lute',pan:-.4,notes:[{midi:57,beat:0,duration:1,velocity:.8},{midi:62,beat:2,duration:2,velocity:.5}]}]};
 const a=renderPluckedScore(options);
 assert.equal(a.samples.length,48000*3*2);assert.equal(a.channels,2);
 assert.equal(hash(a.samples),hash(renderPluckedScore(options).samples));
 assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.631));
});
