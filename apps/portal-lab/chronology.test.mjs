import test from 'node:test';
import assert from 'node:assert/strict';
import {createCausality,sendSignal,ageDeficitFraction,presetParameters} from './causality.js';
import {
 ATLAS_DEFAULTS,ATLAS_MIN_DISTANCE,ATLAS_MAX_SPEED,atlasParams,
 ageLag,chronologyMargin,chronologyBoundary,criticalSpeed,
 criticalDuration,certifyPoint,sampleBoundary,phaseMap,evaluateAtUV,comparePoints
} from './chronology.js';
const eq=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,'Expected '+a+' ≈ '+b+', tolerance '+tolerance);
test('SR clock integrator is exactly the one used in the old causal laboratory',()=>{
 for(const beta of [0,.1,.5,.72,.85,.94,.98]){
  const model=createCausality({speed:beta,duration:47});
  eq(ageDeficitFraction(beta)*47,model.offset,1e-8);
  eq(ageLag(beta,47),model.offset,1e-8);
 }
});
test('lag is monotonic in speed and travel duration',()=>{
 let previous=0;
 for(let i=0;i<=98;i++){
  const lag=ageLag(i/100,34);
  assert.ok(lag>=previous-1e-12);
  previous=lag;
 }
 for(const T of [5,20,80,160])eq(ageLag(.9,T)/T,ageDeficitFraction(.9),1e-12);
});
test('margin equals lag minus external transit and tunnel delay',()=>{
 for(const d of [.3,3,9,12])for(const beta of [0,.5,.88,.98]){
  const opts={distance:d,speed:beta,duration:34,throatTime:.7};
  eq(chronologyMargin(opts),ageLag(beta,34)-d-.7);
  eq(chronologyBoundary(opts)-d,chronologyMargin(opts));
 }
});
test('critical speed solver yields actual marginal witness itinerary',()=>{
 for(const D of [.3,2,3,4,6])for(const T of [24,50,100]){
  const p={distance:D,duration:T,throatTime:.4,speed:.5};
  const b=criticalSpeed(p);
  if(b===null){assert.ok(ageLag(.98,T)<D+.4);continue;}
  assert.ok(b>0&&b<=.98);
  eq(chronologyMargin({...p,speed:b}),0,1e-9);
  const s=createCausality({...p,speed:b});
  const r=sendSignal(s,{origin:'B',first:'tunnel',time:s.duration+s.maximumDistance+20});
  eq(r.chronologyMargin,0,1e-7);
 }
});
test('critical duration solver inverts the same physical age integral',()=>{
 for(const beta of [.2,.45,.8,.98])for(const D of [.3,1,4]){
  const p={distance:D,speed:beta,duration:70,throatTime:.35};
  const T=criticalDuration(p);
  assert.ok(T>0);
  if(T>=4&&T<=160)eq(chronologyMargin({...p,duration:T}),0,1e-8);
 }
 assert.equal(criticalDuration({distance:2,speed:0,duration:35,throatTime:0}),null);
});
test('unreachable target exposes null inverse speed instead of faking a solution',()=>{
 const p={distance:12,speed:.98,duration:4,throatTime:5};
 assert.equal(criticalSpeed(p),null);
 assert.ok(chronologyMargin(p)<0);
});
test('phase boundary is monotonic and explicitly bound by beta <= .98',()=>{
 const pts=sampleBoundary(ATLAS_DEFAULTS,301);
 assert.equal(pts.length,301);
 eq(pts[0].speed,0);
 eq(pts.at(-1).speed,ATLAS_MAX_SPEED);
 let previous=-Infinity;
 for(const p of pts){
  assert.ok(p.criticalDistance>=previous-1e-12);
  previous=p.criticalDistance;
  eq(chronologyMargin({...ATLAS_DEFAULTS,speed:p.speed,distance:p.criticalDistance}),0,1e-9);
 }
});
test('phase grid stores physical margins rather than interpolated outcome flags',()=>{
 const p={distance:3,speed:.6,duration:34,throatTime:.55,maxDistance:9};
 const map=phaseMap(p,81,61);
 assert.equal(map.margins.length,81*61);
 let count=0;
 for(let iy=0;iy<61;iy+=5)for(let ix=0;ix<81;ix+=8){
  const v=evaluateAtUV(map,ix/80,iy/60);
  const raw=map.margins[iy*81+ix];
  eq(raw,v.margin,1e-5);
  assert.ok(Math.abs(v.margin)<100);
  if(raw>0)count++;
 }
 assert.ok(map.positive>0&&map.negative>0);
});
test('phase contour intersections classify to the correct side',()=>{
 const p={distance:3,speed:.85,duration:34,throatTime:.55,maxDistance:9};
 const beta=.75,D=chronologyBoundary({...p,speed:beta});
 const left=chronologyMargin({...p,distance:D-.2,speed:beta});
 const right=chronologyMargin({...p,distance:D+.2,speed:beta});
 assert.ok(left>0&&right<0);
 eq(left,-right);
});
test('atlas map agrees with actual signal arrival for random parameter choices',()=>{
 let seed=39031;
 const next=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<64;i++){
  const p={distance:.3+11.7*next(),speed:.98*next(),duration:4+156*next(),throatTime:5*next()};
  const r=certifyPoint(p);
  eq(r.lag,createCausality(p).offset,1e-7);
  eq(r.margin,r.signal.chronologyMargin,1e-7);
  assert.equal(r.possible,r.signal.loop);
 }
});
test('marginal preset remains marginal to within 1 nanosecond in model units',()=>{
 const p={distance:3,speed:.85,duration:34,throatTime:.55};
 p.speed=criticalSpeed(p);
 const r=certifyPoint(p);
 eq(r.margin,0,1e-9);
 assert.equal(r.possible,false);
});
test('older twin-mouth presets classify consistently on the new atlas',()=>{
 for(const name of ['synced','lag','boundary','loop','deep']){
  const model=presetParameters(name),r=certifyPoint(model);
  assert.equal(r.possible,name==='loop'||name==='deep');
  eq(r.margin,model.duration*ageDeficitFraction(model.speed)-model.distance-model.throatTime,1e-8);
 }
});
test('high beta and longer route does not overflow map or proper time',()=>{
 const p={distance:12,speed:.98,duration:160,throatTime:5,maxDistance:12};
 const m=phaseMap(p,161,121),r=certifyPoint(p);
 assert.ok(Number.isFinite(r.margin));
 assert.ok(Array.from(m.margins).every(Number.isFinite));
 assert.ok(Number.isFinite(r.signal.returnTime));
});
test('exact map UV corners correspond to β=0, β=.98 and D bounds',()=>{
 const grid=phaseMap({...ATLAS_DEFAULTS,maxDistance:12},21,21);
 let q=evaluateAtUV(grid,0,0);
 eq(q.speed,.98);eq(q.distance,.3);
 q=evaluateAtUV(grid,1,1);eq(q.speed,0);eq(q.distance,12);
 q=evaluateAtUV(grid,-5,10);eq(q.speed,0);eq(q.distance,.3);
});
test('experiment log compares margins without changing physical parameters',()=>{
 const a={distance:3,speed:.85,duration:34,throatTime:.55};
 const b={...a,speed:.38};
 const out=comparePoints([a,b]);
 assert.equal(out.length,2);assert.equal(out[0].label,'ПЕТЛЯ');
 assert.equal(out[1].label,'БЕЗ ПЕТЛИ');
 assert.ok(out[0].deltaFromThreshold>0&&out[1].deltaFromThreshold<0);
 eq(out[0].signal.chronologyMargin,out[0].margin,1e-8);
});
test('all public API parameter envelopes are validated',()=>{
 for(const x of [{speed:1},{distance:-.1},{duration:161},{throatTime:-1},{maxDistance:20}]){
  assert.throws(()=>atlasParams(x));
 }
 assert.throws(()=>phaseMap(ATLAS_DEFAULTS,10,10));
 assert.throws(()=>sampleBoundary(ATLAS_DEFAULTS,2));
 assert.throws(()=>comparePoints([]));
 assert.throws(()=>comparePoints(Array.from({length:9},()=>ATLAS_DEFAULTS)));
});
