import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry} from './spacetime.js';
import {photonTransfer,backgroundDirection,pixelDirection,cameraBasis} from './optics.js';
import {
 SKY_MODES,CAMERA_PRESETS,skyCoordinates,sourceGrid,paintSurvey,
 referenceDirection,comparisonSplit,skyStats,geometryTrace
} from './optical-display.js';
const eq=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,'Expected '+a+'≈'+b);
test('source grid lines are tied to actual celestial longitude and latitude',()=>{
 const az=15*Math.PI/180;
 eq(sourceGrid([1,0,0]),1);
 eq(sourceGrid([Math.cos(az),Math.sin(az),0]),1,1e-9);
 const lat=7.5*Math.PI/180;
 eq(sourceGrid([Math.cos(lat)*Math.cos(az/2),Math.cos(lat)*Math.sin(az/2),Math.sin(lat)]),0,1e-9);
});
test('source grid does not depend on camera field of view or screen resolution',()=>{
 const dir=[.65,.72,.24],v=sourceGrid(dir);
 const normalized=dir.map(x=>x/Math.hypot(...dir));
 eq(v,sourceGrid(normalized));
});
test('latitude parallels form a 15-degree coordinate grid',()=>{
 const latitude=15*Math.PI/180;
 eq(sourceGrid([Math.cos(latitude)*Math.cos(.14),Math.cos(latitude)*Math.sin(.14),Math.sin(latitude)]),1,1e-8);
});
test('arbitrary sphere ray can be converted into bounded celestial coordinate angles',()=>{
 for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]]){
  const {az,lat}=skyCoordinates(d);
  assert.ok(az>=-Math.PI&&az<=Math.PI);
  assert.ok(lat>=-Math.PI/2&&lat<=Math.PI/2);
 }
});
test('lensed and unlensed sky survey modes preserve permitted color intervals',()=>{
 const rgb=[12,54,104];
 for(const mode of SKY_MODES)for(const region of [0,1]){
  const out=paintSurvey(rgb,.62,mode,region);
  assert.equal(out.length,3);
  assert.ok(out.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
 }
 assert.equal(paintSurvey(rgb,1,'stars',0),rgb);
});
test('pure coordinate survey is independent of starfield brightness',()=>{
 assert.deepEqual(paintSurvey([0,0,0],1,'coordinates',0),
                  paintSurvey([255,255,255],1,'coordinates',0));
});
test('survey grid is applied in BACKGROUND directions, not to camera pixels',()=>{
 const m=metric({a:1,eta:0}),l=2.1;
 const basis=cameraBasis(0,0,1,1),pixel=pixelDirection(.52,.08,basis,80,1);
 const table=[photonTransfer(m,l,0,{step:.15,maxTime:60}),
  photonTransfer(m,l,Math.PI/2,{step:.15,maxTime:60}),
  photonTransfer(m,l,Math.PI,{step:.15,maxTime:60})];
 const arrival=backgroundDirection(pixel,basis,table);
 assert.ok(arrival?.direction?.length===3);
 const mapped=sourceGrid(arrival.direction);
 assert.ok(mapped>=0&&mapped<=1);
});
test('optical survey orientation is defined for both exterior regions',()=>{
 for(const side of [-1,1]){
  const basis=cameraBasis(0,0,side,side);
  const dir=pixelDirection(0,0,basis,80,1);
  assert.ok(Math.abs(dir[0]+side)<1e-10);
 }
});
test('comparison slider positions are clamped to visible frame bounds',()=>{
 eq(comparisonSplit(300,-1),0);
 eq(comparisonSplit(300,.5),150);
 eq(comparisonSplit(300,1.5),300);
 assert.throws(()=>comparisonSplit(0,.5));
});
test('unlensed camera rays are preserved unchanged',()=>{
 const d=[.2,.5,.8];
 assert.equal(referenceDirection(d),d);
});
test('region statistics sum to 100 percent exactly',()=>{
 const stats=skyStats({total:200,regionA:100,regionB:70,unresolved:30});
 eq(stats.regionA,50);eq(stats.regionB,35);eq(stats.unresolved,15);
 eq(stats.regionA+stats.regionB+stats.unresolved,100);
});
test('invalid region image statistics are rejected instead of painted',()=>{
 assert.throws(()=>skyStats({total:12,regionA:12,regionB:5,unresolved:0}));
 assert.throws(()=>skyStats({total:0,regionA:0,regionB:0,unresolved:0}));
});
test('Ellis throat metric profile has physically correct areal radius',()=>{
 const m=metric({a:2,eta:0}),trace=geometryTrace(m,geometry,{samples:121});
 eq(trace[60].u,0,1e-10);eq(trace[60].R,1,1e-9);
 eq(trace[0].R,Math.sqrt(17),1e-9);
 eq(trace[120].R,Math.sqrt(17),1e-9);
});
test('geometry inset is symmetrically sampled in the Ellis metric',()=>{
 const m=metric({a:.8,eta:0}),trace=geometryTrace(m,geometry,{samples:111});
 for(let i=0;i<trace.length;i++)eq(trace[i].R,trace.at(-1-i).R,1e-8);
});
test('redshift parameter changes N(l) inset but does not falsify Ellis R(l)',()=>{
 const a=metric({a:1,eta:0}),b=metric({a:1,eta:.65});
 const x=geometryTrace(a,geometry),y=geometryTrace(b,geometry);
 for(let i=0;i<x.length;i++)eq(x[i].R,y[i].R,1e-8);
 assert.ok(y[60].N<x[60].N);
});
test('custom throat model profile is sampled from actual geometry functions',()=>{
 const m=metric({a:1.7,eta:.18,shape:.14,shapeWidth:1.45,lapseBump:.08,lapseWidth:1.3});
 const trace=geometryTrace(m,geometry,{samples:57,span:3});
 const sample=trace[Math.floor(trace.length/2)],fromMetric=geometry(0,m);
 eq(sample.R,fromMetric.R/m.a,1e-8);
 eq(sample.N,fromMetric.N,1e-8);
});
test('invalid survey mode and resolution inputs fail explicitly',()=>{
 assert.throws(()=>paintSurvey([1,2,3],1,'unknown'));
 assert.throws(()=>sourceGrid([NaN,2,3]));
 assert.throws(()=>sourceGrid([1,0,0],{stepDegrees:0}));
 assert.throws(()=>geometryTrace(metric({a:1}),geometry,{samples:3}));
});
test('camera presets are all intentional supported positions',()=>{
 assert.deepEqual([...CAMERA_PRESETS],['throat','oblique','wide','away']);
 assert.equal(SKY_MODES.length,3);
});
