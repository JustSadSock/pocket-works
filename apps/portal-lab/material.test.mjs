import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,launch,advance,constraint} from './relativity.js';
import {SPEED_OF_LIGHT,MATERIALS,createSpecimen,stepSpecimen,specimenStats,tidalFrame,specimenSegments} from './material.js';
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`Expected ${a} ≈ ${b} (tolerance ${tol})`);
const run=(s,time=16,dt=.025)=>{let i=0;while(s.phase!=='completed'&&i++<time/dt)stepSpecimen(s,dt);return specimenStats(s);};

test('frame eigenvalues agree with Ellis: radial zero, transverse positive',()=>{
 const m=metric({a:2,eta:0});
 for(const l of [0,2,4,12]){
  const ray=launch(m,{l:l||.001,alpha:Math.PI,speed:.72,kind:'matter'});
  const t=tidalFrame(ray,m);
  close(t.radial,0);assert.ok(t.transverse>0);close(t.transverse*t.gamma**-2/t.beta**2,4/(l*l+4)**2,2e-8);
 }
});
test('the redshift radial eigenvalue uses the analytic Hessian of lapse',()=>{
 for(const eta of [.1,.3,.8]){
  const m=metric({a:1.3,eta});
  for(const l of [-3,-1.2,-.1,0,.2,1,5]){
   const s=launch(m,{l,alpha:Math.PI,kind:'matter',speed:.4});
   const h=1e-4,lap=x=>Math.exp(-m.eta*m.a/Math.sqrt(x*x+m.a*m.a));
   const expected=-(lap(l+h)-2*lap(l)+lap(l-h))/(h*h*lap(l));
   close(tidalFrame(s,m).radial,expected,2e-7);
  }
 }
});
test('static N=1 metric leaves radial chain stress-free across throat',()=>{
 const s=createSpecimen(metric({a:1,eta:0}),{material:'ceramic',axis:'radial'});
 const data=run(s,14);
 assert.equal(data.phase,'completed');assert.equal(data.broken,0);
 close(data.peakStrain,0,1e-7);assert.equal(data.crosses,1);
 close(data.pointNorm,0,1e-9);
});
test('transverse brittle specimen fractures near throat, not before launch',()=>{
 const m=metric({a:1,eta:0});
 const s=createSpecimen(m,{material:'ceramic',axis:'transverse',aMeters:1000,lengthMeters:2});
 assert.equal(s.breakCount,0);assert.equal(s.phase,'ready');
 const stat=run(s,14);
 assert.ok(stat.broken>=1);assert.ok(s.links.some(x=>x.failedAt>0));
 assert.ok(stat.stressPeakMPa>0);assert.equal(stat.crosses,1);
});
test('material waves propagate at sound speed sqrt(E/rho), well below c',()=>{
 for(const material of Object.keys(MATERIALS)){
  const mat=MATERIALS[material];
  const s=createSpecimen(metric({a:1}),{material});
  const v=Math.sqrt(mat.E/mat.density);
  close(specimenStats(s).soundSpeed,v,1e-6);assert.ok(v<SPEED_OF_LIGHT*.001);
 }
});
test('sample resolution, measured length, stress and coordinate scales',()=>{
 const a=metric({a:2,eta:.2}),s=createSpecimen(a,{lengthMeters:3.5,aMeters:20000,axis:'transverse',speed:.7});
 close(s.h*16/a.a,3.5/20000);
 const start=specimenStats(s);
 close(start.l,3.25);close(start.actualLengthMeters,3.5);
 close(start.proper,0);
 const after=stepSpecimen(s,.05);
 assert.ok(after.proper>0&&after.t>after.proper);
 assert.ok(after.tidalEndAcceleration>0);
});
test('radial geodesic is not affected by the material failure mechanism',()=>{
 const m=metric({a:1,eta:.55});
 for(const material of ['ceramic','steel','elastomer']){
  const s=createSpecimen(m,{material,axis:'radial'});
  const E=s.ray.E;
  stepSpecimen(s,2.5);close(E,s.ray.E);
  assert.ok(Math.abs(constraint(s.ray,m))<1e-8);
 }
});
test('fracture disables link forces permanently and is irreversible during an experiment',()=>{
 const s=createSpecimen(metric({a:1,eta:.8}),{material:'ceramic',axis:'radial'});
 let found=false;
 for(let i=0;i<460;i++){
  stepSpecimen(s,.025);
  if(s.breakCount){found=true;break;}
 }
 assert.ok(found);const before=s.links.filter(l=>!l.alive).length;
 stepSpecimen(s,1);
 assert.ok(s.links.filter(l=>!l.alive).length>=before);
 assert.ok(s.links.every(l=>l.alive||l.failedAt!==null));
});
test('different materials produce different failure predictions for same metric',()=>{
 const m=metric({a:1,eta:.45});
 const a=createSpecimen(m,{axis:'radial',material:'ceramic'});
 const b=createSpecimen(m,{axis:'radial',material:'steel'});
 const resultA=run(a,14),resultB=run(b,14);
 assert.ok(resultA.broken>0);
 assert.equal(resultB.broken,0);
});
test('tensile and compression limits are material parameters, not cosmetics',()=>{
 for(const material of Object.keys(MATERIALS)){
  const props=MATERIALS[material];
  assert.ok(props.tension>0&&props.compression>0&&props.E>0&&props.density>0);
 }
 assert.ok(MATERIALS.ceramic.tension<MATERIALS.steel.tension);
});
test('timelike proper time decreases for redshift metric at the same launch state',()=>{
 const x=createSpecimen(metric({a:1,eta:0}),{material:'steel'});
 const y=createSpecimen(metric({a:1,eta:.6}),{material:'steel'});
 stepSpecimen(x,1.5);stepSpecimen(y,1.5);
 assert.ok(y.ray.tau<x.ray.tau);
});
test('negative time, superluminal speed, invalid orientation and oversized specimen are rejected',()=>{
 assert.throws(()=>createSpecimen(metric({a:1}),{speed:1.05}));
 assert.throws(()=>createSpecimen(metric({a:1}),{axis:'upwards'}));
 assert.throws(()=>createSpecimen(metric({a:1}),{aMeters:100,lengthMeters:20}));
 assert.throws(()=>createSpecimen(metric({a:1}),{material:'unobtanium'}));
 assert.throws(()=>stepSpecimen(createSpecimen(metric({a:1})),-.01));
});
test('restart rebuilds an intact chain, maintains 17 node positions and records history',()=>{
 const m=metric({a:1,eta:0});
 const first=createSpecimen(m,{material:'ceramic',axis:'transverse'});
 run(first,10);
 const again=createSpecimen(m,{material:'ceramic',axis:'transverse'});
 assert.equal(first.links.length,again.links.length);assert.equal(again.breakCount,0);
 assert.equal(specimenSegments(again).length,17);
 assert.equal(again.history.length,1);
});
test('all enabled models finish with finite outputs for representative instruments',()=>{
 for(const eta of [0,.45,.85])for(const material of ['ceramic','steel','polymer','elastomer'])for(const axis of ['radial','transverse']){
  const s=createSpecimen(metric({a:1,eta}),{material,axis,speed:.72,aMeters:1000,lengthMeters:2});
  const result=run(s,20,.035);
  assert.equal(result.phase,'completed');
  assert.ok(Number.isFinite(result.stressPeakMPa));
  assert.ok(Number.isFinite(result.tidalEndAcceleration));
  assert.ok(Number.isFinite(result.proper));
  assert.ok(result.pointNorm<1e-6);
 }
});
