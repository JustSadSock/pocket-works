import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry} from './spacetime.js';
import {spatialEmbedding,surfacePoint,spatialMetricCheck,embeddedGrid,
 project3D,createSpatialBeam,stepSpatialBeam,spatialBeamStats,VOLUME_DEFAULTS} from './embedded-space.js';
const eq=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,\`Expected \${a} ≈ \${b} ± \${tol}\`);
test('Ellis embedding gives analytically correct z=a asinh(l/a)',()=>{
 const m=metric({a:2,eta:0}),p=spatialEmbedding(m);
 assert.ok(p.valid);
 for(const i of [0,30,65,90,120,150,200,240]){
  const s=p.samples[i];
  eq(s.z,Math.asinh(s.l),2e-7);
  eq(s.R,Math.sqrt(1+s.l*s.l),1e-10);
 }
});
test('embedding has physically continuous throat at l=0',()=>{
 const p=spatialEmbedding(metric({a:1}));
 const throat=surfacePoint(p,0,0);
 eq(throat[0],1);eq(throat[1],0);eq(throat[2],0);
 const a=surfacePoint(p,-.001,1.2),b=surfacePoint(p,.001,1.2);
 assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<.01);
});
test('metric radial length constraint R′²+z′²=1',()=>{
 for(const s of [metric({a:1,eta:0}),metric({a:2,eta:.65}),metric({a:1.3,shape:.14})]){
  const p=spatialEmbedding(s);
  assert.equal(p.valid,true);
  for(const i of [1,27,74,120,147,229]){
   const check=spatialMetricCheck(p,i);
   eq(check.inducedRadialMetric,1,1e-11);
  }
 }
});
test('proper circumferential length at a fixed l is 2πR',()=>{
 const p=spatialEmbedding(metric({a:1.7}));
 const l=1.2,N=160,pts=[];
 for(let i=0;i<=N;i++)pts.push(surfacePoint(p,l,i*2*Math.PI/N));
 let length=0;for(let i=1;i<pts.length;i++)
  length+=Math.hypot(...pts[i].map((v,k)=>v-pts[i-1][k]));
 eq(length,2*Math.PI*geometry(l*1.7,p.m).R/1.7,0.001);
});
test('both asymptotic sheets share one throat and have opposite height signs',()=>{
 const p=spatialEmbedding(metric({a:1}));
 for(const l of [.1,.5,2,4]){
  const a=surfacePoint(p,l,.2),b=surfacePoint(p,-l,.2);
  eq(a[0],b[0]);eq(a[1],b[1]);eq(a[2],-b[2],1e-10);
 }
});
test('static redshift changes photon propagation but NOT spatial embedding',()=>{
 const a=spatialEmbedding(metric({a:1,eta:0})),
  b=spatialEmbedding(metric({a:1,eta:.85}));
 for(let i=0;i<a.samples.length;i++){
  eq(a.samples[i].R,b.samples[i].R);
  eq(a.samples[i].z,b.samples[i].z);
 }
 assert.ok(b.samples[120].N<a.samples[120].N);
});
test('valid custom R(l) embedded from real non-Ellis radius',()=>{
 const m=metric({a:1,eta:.3,shape:.14,shapeWidth:1.45,lapseBump:.1});
 const p=spatialEmbedding(m);
 assert.ok(p.valid);
 const q=surfacePoint(p,1.3,0);
 eq(q[0],geometry(1.3,m).R,1e-10);
});
test('invalid custom metric explicitly rejects Euclidean global embedding',()=>{
 const m=metric({a:1,shape:.55,shapeWidth:1.45}),p=spatialEmbedding(m);
 assert.equal(p.valid,false);
 assert.ok(Number.isFinite(p.invalidAt));
 assert.equal(surfacePoint(p,1.5,0),null);
 assert.deepEqual(embeddedGrid(p),[]);
 assert.throws(()=>spatialMetricCheck(p));
});
test('mesh retains two physical spatial regions and an actual throat ring',()=>{
 const p=spatialEmbedding(metric({a:1})),segments=embeddedGrid(p);
 assert.ok(segments.length>1500);
 assert.ok(segments.some(s=>s.region==='A'));
 assert.ok(segments.some(s=>s.region==='B'));
 assert.ok(segments.some(s=>s.throat));
 assert.ok(segments.every(s=>s.a.every(Number.isFinite)&&s.b.every(Number.isFinite)));
});
test('orbital camera changes screen projection but never real world geometry',()=>{
 const p=spatialEmbedding(metric({a:1})),coord=surfacePoint(p,2,.7);
 const front=project3D(coord,{yaw:.65,pitch:.4,zoom:1},400,700);
 const side=project3D(coord,{yaw:1.9,pitch:.4,zoom:1},400,700);
 assert.ok(Number.isFinite(front.x));
 assert.ok(Math.abs(front.x-side.x)>1);
 assert.equal(coord.length,3);
});
test('pinch zoom parameter scales projected separation monotonically',()=>{
 const p=spatialEmbedding(metric({a:1})),
  coord=surfacePoint(p,1.7,.7);
 const a=project3D(coord,{yaw:.4,pitch:.6,zoom:.8},400,600);
 const b=project3D(coord,{yaw:.4,pitch:.6,zoom:1.5},400,600);
 assert.ok(Math.abs(b.x-200)>Math.abs(a.x-200));
});
test('a physical radial null ray actually traverses from region A to B',()=>{
 const m=metric({a:1}),bundle=createSpatialBeam(m,{angle:Math.PI,count:1});
 for(let i=0;i<300&&!bundle.done;i++)stepSpatialBeam(bundle,m,.06);
 const stats=spatialBeamStats(bundle,m);
 assert.equal(stats.photons,1);assert.equal(stats.B,1);
 assert.equal(stats.crossings,1);
 assert.ok(stats.worstResidual<1e-8);
});
test('larger impact parameter scatters a null ray back into its source region',()=>{
 const m=metric({a:1}),bundle=createSpatialBeam(m,{angle:Math.PI+.35,count:1});
 for(let i=0;i<330&&!bundle.done;i++)stepSpatialBeam(bundle,m,.06);
 const st=spatialBeamStats(bundle,m);
 assert.equal(st.B,0);assert.equal(st.A,1);assert.equal(st.crossings,0);
 assert.ok(st.worstResidual<1e-7);
});
test('changing redshift changes null trajectory yet preserves its zero constraint',()=>{
 const m1=metric({a:1,eta:0}),m2=metric({a:1,eta:.45});
 const b1=createSpatialBeam(m1,{angle:Math.PI+.23,count:1});
 const b2=createSpatialBeam(m2,{angle:Math.PI+.23,count:1});
 for(let i=0;i<80;i++){stepSpatialBeam(b1,m1,.05);stepSpatialBeam(b2,m2,.05)}
 assert.ok(Math.abs(b1.rays[0].phi-b2.rays[0].phi)>1e-4);
 assert.ok(spatialBeamStats(b2,m2).worstResidual<1e-7);
});
test('ray paths are computed physically and stay finite while camera pans',()=>{
 const m=metric({a:1}),bundle=createSpatialBeam(m,{count:7,spread:.44});
 for(let i=0;i<90;i++)stepSpatialBeam(bundle,m,.055);
 for(const ray of bundle.rays){
  assert.ok(ray.path.length>10);
  assert.ok(ray.path.every(v=>Number.isFinite(v.l)&&Number.isFinite(v.phi)));
 }
 const previous=spatialBeamStats(bundle,m);
 for(const angle of [-1.8,-.1,1.2]){
  project3D([1,2,0],{yaw:angle,pitch:.3,zoom:1},360,580);
 }
 assert.deepEqual(spatialBeamStats(bundle,m),previous);
});
test('unsupported numerical parameters are rejected before mutation',()=>{
 const m=metric({a:1});
 assert.throws(()=>spatialEmbedding(m,{steps:25}));
 assert.throws(()=>spatialEmbedding(m,{span:0}));
 assert.throws(()=>createSpatialBeam(m,{count:16}));
 assert.throws(()=>createSpatialBeam(m,{spread:2}));
 assert.throws(()=>stepSpatialBeam(createSpatialBeam(m),m,-.1));
 assert.equal(surfacePoint(spatialEmbedding(m),10,.2),null);
});
test('complete 72° beam spread is supported by current UI',()=>{
 const b=createSpatialBeam(metric({a:1}),{count:15,spread:72*Math.PI/180});
 assert.equal(b.rays.length,15);
});
