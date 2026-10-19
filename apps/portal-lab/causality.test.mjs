import test from 'node:test';
import assert from 'node:assert/strict';
import {createCausality,presetParameters,mouthA,mouthB,inverseBClock,
 tunnelArrival,externalArrival,sendSignal,audit,sampleWorldlines} from './causality.js';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,'Expected '+a+' ≈ '+b+' (± '+tolerance+')');
test('zero velocity means synchronized proper clocks everywhere',()=>{
 const m=createCausality({speed:0,duration:46,distance:4,throatTime:.5});
 for(const t of [-2,0,1,5,11,23,46,50,100])close(mouthB(m,t).tau,t);
 close(m.offset,0);close(m.age,m.duration);
 assert.equal(audit(m).chronologyPossible,false);
});
test('smooth B worldline starts and ends at rest at same positive distance',()=>{
 const m=createCausality({speed:.91,distance:3,duration:41});
 close(mouthB(m,0).x,3);
 close(mouthB(m,20.5).x,3+m.speed*m.duration/Math.PI);
 close(mouthB(m,41).x,3);
 for(const t of [0,m.duration/2,m.duration]){
  const b=mouthB(m,t);close(b.v,0,1e-10);
 }
});
test('proper ageing integrates dτ=dt sqrt(1-v²) along smooth worldline',()=>{
 const m=createCausality({speed:.85,duration:35});
 let integral=0,dt=35/10000;
 for(let i=0;i<10000;i++){
  const v=mouthB(m,(i+.5)*dt).v;
  integral+=Math.sqrt(1-v*v)*dt;
 }
 close(integral,m.age,1e-6);
 assert.ok(m.age<m.duration);
});
test('B proper time is monotonic even through turnaround',()=>{
 const m=createCausality({speed:.98,duration:120});
 let last=-Infinity;
 for(let i=0;i<=2400;i++){
  const t=i*.06,b=mouthB(m,t);
  assert.ok(b.tau>=last-1e-12);
  last=b.tau;
 }
});
test('inverting the B clock recovers coordinate time before, during and after trip',()=>{
 for(const speed of [0,.31,.8,.98]){
  const m=createCausality({speed,duration:38});
  for(const t of [-.1,0,.2,2,13,19,35,38,42,70]){
   close(inverseBClock(m,mouthB(m,t).tau),t,2e-7);
  }
 }
});
test('tunnel mapping matches prescribed equal-mouth-proper-time identification',()=>{
 const m=createCausality({speed:.8,duration:30,throatTime:.75});
 for(const t of [0,2,9,25,30,50]){
  const exitA=tunnelArrival(m,'B',t);
  close(mouthA(m,exitA).tau,mouthB(m,t).tau+m.throatTime);
  const exitB=tunnelArrival(m,'A',t);
  close(mouthB(m,exitB).tau,mouthA(m,t).tau+m.throatTime,2e-7);
 }
});
test('external light interception is null, including a moving B target',()=>{
 const m=createCausality({speed:.85,duration:40,distance:3});
 for(const t0 of [0,.1,4,8,15,21,35,41,60]){
  const t1=externalArrival(m,'A',t0);
  assert.ok(t1>t0);
  close(t1-t0,mouthB(m,t1).x,1e-8);
  const t2=externalArrival(m,'B',t0);
  close(t2-t0,mouthB(m,t0).x,1e-8);
 }
});
test('external photon is future-directed and has a unique interception',()=>{
 for(const p of ['synced','lag','loop','deep']){
  const s=createCausality(presetParameters(p));
  for(let time=0;time<=s.duration+18;time+=2){
   const arrival=externalArrival(s,'A',time);
   assert.ok(arrival>time);
   close(arrival-time,mouthB(s,arrival).x,1e-7);
  }
 }
});
test('synchronized mouths cannot close a loop with nonnegative interior delay',()=>{
 const s=createCausality(presetParameters('synced'));
 for(const origin of ['A','B'])for(const first of ['tunnel','exterior']){
  const signal=sendSignal(s,{origin,first,time:45});
  assert.equal(signal.loop,false);
  assert.ok(signal.returnTime>signal.departure);
 }
});
test('time lag smaller than external light time does not yield a closed loop',()=>{
 const m=createCausality(presetParameters('lag')),info=audit(m);
 assert.ok(info.lag<info.threshold);
 assert.equal(info.chronologyPossible,false);
 assert.ok(info.witness.returnTime>info.witness.departure);
});
test('threshold preset is exactly marginal, not falsely classified as a loop',()=>{
 const s=createCausality(presetParameters('boundary')),info=audit(s);
 close(info.analyticMargin,0,1e-9);
 close(info.witness.chronologyMargin,0,1e-8);
 assert.equal(info.chronologyPossible,false);
});
test('causal loop preset yields return to B before original departure',()=>{
 const s=createCausality(presetParameters('loop')),info=audit(s);
 assert.ok(info.chronologyPossible);
 assert.ok(info.witness.chronologyMargin>2);
 assert.equal(info.witness.itinerary[0].mouth,'B');
 assert.equal(info.witness.itinerary[1].mouth,'A');
 assert.equal(info.witness.itinerary[2].mouth,'B');
 close(info.witness.itinerary[0].t-info.witness.itinerary[2].t,info.witness.chronologyMargin);
});
test('deep time shift yields larger chronology gap than ordinary loop',()=>{
 const standard=audit(createCausality(presetParameters('loop')));
 const deep=audit(createCausality(presetParameters('deep')));
 assert.ok(deep.analyticMargin>standard.analyticMargin);
 assert.ok(deep.witness.chronologyMargin>standard.witness.chronologyMargin);
});
test('after reunion, loop witness is exactly deltaAge−distance−interiorDelay',()=>{
 for(const preset of ['synced','lag','boundary','loop','deep']){
  const s=createCausality(presetParameters(preset));
  const t=s.duration+s.maximumDistance+20;
  const witness=sendSignal(s,{origin:'B',first:'tunnel',time:t});
  close(witness.chronologyMargin,s.conditionMargin,1e-8);
 }
});
test('sending from A through throat then returning from B cannot produce a spurious B→A witness',()=>{
 for(const preset of ['synced','lag','loop','deep']){
  const s=createCausality(presetParameters(preset)),t=s.duration+20;
  const forward=sendSignal(s,{origin:'A',first:'tunnel',time:t});
  assert.equal(forward.loop,false);
  assert.ok(forward.returnTime>t);
 }
});
test('earlier moving-mouth signals calculate actual interception instead of fixed D',()=>{
 const s=createCausality({speed:.9,duration:50,distance:2});
 const t0=5,t1=externalArrival(s,'A',t0);
 assert.ok(t1-t0>2);
 close(t1-t0,mouthB(s,t1).x,1e-8);
 const reverse=sendSignal(s,{origin:'B',first:'tunnel',time:14});
 assert.ok(Number.isFinite(reverse.returnTime));
 assert.ok(reverse.itinerary[2].t===reverse.returnTime);
});
test('worldline samples have matching coordinates and clock traces',()=>{
 const s=createCausality(presetParameters('loop')),samples=sampleWorldlines(s,301);
 assert.equal(samples.length,301);
 for(const p of samples){
  close(p.xb,mouthB(s,p.t).x);
  close(p.taub,mouthB(s,p.t).tau);
  close(p.lag,p.t-p.taub);
 }
});
test('all preset parameters stay in the supported interface envelope',()=>{
 for(const preset of ['synced','lag','boundary','loop','deep']){
  const s=createCausality(presetParameters(preset));
  assert.ok(s.distance>=.3&&s.distance<=12);
  assert.ok(s.speed>=0&&s.speed<=.98);
  assert.ok(s.duration>=4&&s.duration<=160);
 }
});
test('bad speeds, negative delays, unknown routes and NaN times are rejected',()=>{
 assert.throws(()=>createCausality({speed:1.05}));
 assert.throws(()=>createCausality({throatTime:-.3}));
 assert.throws(()=>createCausality({duration:0}));
 const s=createCausality();
 assert.throws(()=>sendSignal(s,{origin:'C'}));
 assert.throws(()=>sendSignal(s,{first:'teleport'}));
 assert.throws(()=>sendSignal(s,{time:NaN}));
 assert.throws(()=>externalArrival(s,'A',NaN));
 assert.throws(()=>presetParameters('fake'));
});
