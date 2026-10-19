import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, simulateBubble } from './physics.js';
import { CLOUD_LAYOUTS, sanitizeCloud, cloudGeometry, coupledAcceleration, simulateCloud, cloudAt, pressureAt } from './coupling.js';

test('single-bubble experiment retains original Rayleigh-Plesset data',()=>{
 const a=simulateBubble(DEFAULTS),b=simulateCloud(DEFAULTS,{mode:'single'});
 assert.equal(b.collapseTimeUs,a.collapseTimeUs);
 assert.equal(b.minRadiusMm,a.minRadiusMm);
 assert.equal(b.kind,'single');
});
test('exact symmetry of pair with equal radii yields equal accelerations',()=>{
 const g=[{x:-2,y:0,r0:1},{x:2,y:0,r0:1}];
 const a=coupledAcceleration([1,1],[-.3,-.3],g,DEFAULTS,false);
 assert.ok(Math.abs(a[0]-a[1])<1e-10);
});
test('neighbor source terms alter physical radial accelerations',()=>{
 const geo=cloudGeometry(DEFAULTS,{mode:'pair'});
 const resting=coupledAcceleration([1,.73],[-.15,0],geo,DEFAULTS,false);
 const driving=coupledAcceleration([1,.73],[-.15,-.55],geo,DEFAULTS,false);
 assert.ok(Math.abs(resting[0]-driving[0])>0.015);
});
test('reflecting wall alters radial response only when enabled',()=>{
 const g=cloudGeometry(DEFAULTS,{mode:'pair'});
 const q=[1,.73],v=[-.25,-.13];
 const none=coupledAcceleration(q,v,g,DEFAULTS,false);
 const wall=coupledAcceleration(q,v,g,DEFAULTS,true);
 assert.ok(wall.some((a,i)=>Math.abs(a-none[i])>0.003));
});
test('pair and cloud complete initial implosions throughout parameter envelope',()=>{
 let count=0;
 for(const mode of ['pair','cluster'])for(const wall of [true,false]){
  for(const pressureBar of [.3,1.8,4])for(const radiusMm of [.25,.9,2.5]){
   for(const standOff of [1.15,1.65,4]){
    const s=simulateCloud({radiusMm,pressureBar,standOff},{mode,wall});
    assert.equal(s.truncated,false,mode+' / '+pressureBar+' / '+radiusMm+' / '+standOff);
    assert.equal(s.individualCollapseUs.length,CLOUD_LAYOUTS[mode].length);
    assert.ok(s.samples.length>60);
    assert.ok(s.samples.every(frame=>frame.bubbles.every(b=>Number.isFinite(b.radius)&&b.radius>0&&Number.isFinite(b.acceleration))));
    assert.ok(s.individualCollapseUs.every(t=>t>0&&t<s.durationTau*s.scaleUs));
    assert.equal(cloudAt(s,s.durationTau).bubbles.length,CLOUD_LAYOUTS[mode].length);
    count++;
   }
  }
 }
 assert.equal(count,108);
});
test('moving an inactive wall leaves the unreflected ensemble unchanged',()=>{
 const a=simulateCloud({...DEFAULTS,standOff:1.15},{mode:'pair',wall:false});
 const b=simulateCloud({...DEFAULTS,standOff:4},{mode:'pair',wall:false});
 assert.equal(a.individualCollapseUs[0],b.individualCollapseUs[0]);
});
test('visual pressure data is finite at the boundary and at bubble centers',()=>{
 const s=simulateCloud(DEFAULTS,{mode:'cluster',wall:true});
 for(const tau of [0,s.durationTau*.3,s.durationTau]){
  const point=cloudAt(s,tau);
  for(const [x,y] of [[0,0],[-3,2],[s.config.standOff,0],[-10,12]]){
   const p=pressureAt(s,point,x,y);
   assert.ok(Number.isFinite(p));
   assert.ok(Math.abs(p)<=30);
  }
 }
});
test('cloud mode input is validated, dimensions and nonnegative bubble count fixed',()=>{
 assert.equal(sanitizeCloud({mode:'unexpected'}).mode,'single');
 assert.equal(sanitizeCloud({mode:'cluster',wall:false}).wall,false);
 assert.equal(cloudGeometry(DEFAULTS,{mode:'cluster'}).length,5);
});
