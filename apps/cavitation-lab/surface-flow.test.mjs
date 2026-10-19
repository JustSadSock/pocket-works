import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from './physics.js';
import {simulateCloud,cloudAt} from './coupling.js';
import {layoutTemplate} from './constructor.js';
import {ambientVelocity,buildSurfaceHistory,surfaceAt,contourFactors,jetDirectionLabel} from './surface-flow.js';

function sampleSurface(config=DEFAULTS,cloud={mode:'single',wall:true}){
 const solution=simulateCloud(config,cloud);
 const history=buildSurfaceHistory(solution);
 return {solution,history,point:surfaceAt(history,solution.firstMinimumTau*.9)};
}
test('mirror-source velocity has zero normal component at a rigid plane',()=>{
 const {solution}=sampleSurface({...DEFAULTS,standOff:1.15});
 const bubble=cloudAt(solution,solution.firstMinimumTau*.5);
 for(const y of [-2,-.3,0,.4,2]){
   const u=ambientVelocity(solution,bubble,solution.config.standOff,y,-1);
   assert.ok(Math.abs(u.x)<1e-9,'wall-normal velocity must cancel at wall');
 }
});
test('single bubble in unbounded water has no external deformation or impulse',()=>{
 const {point,history}=sampleSurface(DEFAULTS,{mode:'single',wall:false});
 const bubble=point.bubbles[0];
 assert.equal(bubble.flowX,0);
 assert.equal(bubble.flowY,0);
 assert.equal(bubble.deformation,0);
 assert.deepEqual([...new Set(contourFactors(bubble,3).map(x=>x.toFixed(6)))],['1.000000']);
 assert.ok(history.samples.length>100);
});
test('wall-induced collapse has a directed flow impulse toward the wall',()=>{
 const close=sampleSurface({...DEFAULTS,standOff:1.15});
 const far=sampleSurface({...DEFAULTS,standOff:4});
 const nearB=close.point.bubbles[0],farB=far.point.bubbles[0];
 assert.ok(nearB.flowX>0&&Math.abs(nearB.flowY)<1e-8);
 assert.ok(nearB.jet>farB.jet,'near-wall flow should create stronger jet proxy');
 assert.equal(jetDirectionLabel(nearB,true),'Поток к стенке');
});
test('shape is a physically driven nonzero harmonic, not an arbitrary sinusoid animation',()=>{
 const x=sampleSurface(DEFAULTS,{mode:'pair',wall:true});
 const y=sampleSurface(DEFAULTS,{mode:'pair',wall:false});
 const a=x.point.bubbles[0],b=y.point.bubbles[0];
 assert.ok(a.deformation>0);
 assert.notEqual(a.c2,b.c2,'reflected velocity sources should change the shape modes');
 assert.ok(Math.abs(a.c2)+Math.abs(a.s2)+Math.abs(a.c3)+Math.abs(a.s3)>1e-5);
});
test('surface contour preserves cross-sectional area with variable magnification',()=>{
 const {point}=sampleSurface({...DEFAULTS,standOff:1.15});
 const s=point.bubbles[0];
 for(const gain of [0,1,3,4]){
   const factors=contourFactors(s,gain);
   const area=factors.reduce((a,b)=>a+b*b,0)/factors.length;
   assert.ok(Math.abs(area-1)<1e-12);
   assert.ok(factors.every(n=>Number.isFinite(n)&&n>.25&&n<2.2));
 }
});
test('magnification increases only visual shape, not computed physics',()=>{
 const {solution,point}=sampleSurface({...DEFAULTS,standOff:1.15});
 const a=contourFactors(point.bubbles[0],1),b=contourFactors(point.bubbles[0],3);
 const spread=arr=>Math.max(...arr)-Math.min(...arr);
 assert.ok(spread(b)>spread(a));
 assert.equal(solution.collapseTimeUs,simulateCloud({...DEFAULTS,standOff:1.15},{mode:'single',wall:true}).collapseTimeUs);
});
test('surface interpolation is stable at exactly first and last timestamps',()=>{
 const {solution,history}=sampleSurface();
 const a=surfaceAt(history,-10),b=surfaceAt(history,1000);
 assert.equal(a.t,0);
 assert.ok(b.t<=solution.durationTau);
 assert.equal(b.bubbles.length,1);
 assert.ok(Object.values(b.bubbles[0]).every(x=>Number.isFinite(x)));
});
test('seven custom bubbles have finite bounded surfaces at pressure extremes',()=>{
 const layouts=layoutTemplate('cascade').concat([{x:-11,y:2.7,s:.36},{x:-13,y:-2.9,s:.41}]);
 for(const pressureBar of [.3,1.8,4]){
   const sol=simulateCloud({radiusMm:.9,pressureBar,standOff:1.65},
     {mode:'custom',wall:true,bubbles:layouts});
   const history=buildSurfaceHistory(sol);
   const frame=surfaceAt(history,sol.durationTau*.7);
   assert.equal(frame.bubbles.length,7);
   assert.ok(frame.bubbles.every(b=>Number.isFinite(b.jet)&&b.jet>=0&&b.jet<=.72
     &&Number.isFinite(b.deformation)&&b.deformation<=19.01));
 }
});
